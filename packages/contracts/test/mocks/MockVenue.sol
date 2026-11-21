// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { MockERC20 } from "./MockERC20.sol";

/**
 * @notice Bare-bones ERC-4626 venue used to model `steakUSDG` in unit tests.
 *
 * Two properties are modelled because they are the ones the adapter can get wrong:
 *
 * - **Share decimals differ from asset decimals.** Asset is 6 decimals (USDG), venue
 *   share is 18. `SCALE` encodes that: 1 unit of asset is worth `1e12` shares at the
 *   seeded 1:1 price. Any adapter that treats shares and assets as interchangeable
 *   fails these tests by a factor of 10^12.
 * - **Liquidity and the deposit gate are independent knobs.** `maxWithdraw` can be
 *   lower than a position (illiquidity) while `maxDeposit` is still open, and vice
 *   versa. Real venues behave this way; a mock that ties them together would let a
 *   broken adapter pass.
 * - **`maxWithdraw` can also lie while the cash is there.** The real `steakUSDG`
 *   answered `0` from `maxWithdraw`/`maxRedeem` at block `118337511` for a position it
 *   then redeemed in full for 8,328,471.0105 USDG. `setMaxWithdrawLies(true)` reproduces
 *   that, so a test can prove the adapter measures the venue's cash instead of trusting
 *   the getter.
 */
contract MockVenue {
    MockERC20 public immutable assetToken;

    string public name = "Mock Morpho Vault";
    string public symbol = "mkUSDG";
    uint8 public constant decimals = 18;

    /// @notice Venue shares per unit of asset at a 1:1 price (18 decimals vs 6).
    uint256 public constant SCALE = 1e12;

    address public curator = address(0xc05A700000000000000000000000000000000001);

    uint256 public totalSupply;
    uint256 public totalAssetsAmount;
    mapping(address => uint256) public balanceOf;

    /// @notice Hard cap on `totalAssetsAmount`. `type(uint256).max` = uncapped.
    uint256 public depositCap = type(uint256).max;
    /// @notice Assets the venue can pay out right now. Independent of positions.
    uint256 public tokensAvailable = type(uint256).max;

    /// @notice When true, `deposit` reverts: models a venue-side gate/failure.
    bool public depositReverts;

    /// @notice When true, `maxWithdraw`/`maxRedeem` answer 0 even when cash is present.
    bool public maxWithdrawLies;

    /// @notice When true, `maxDeposit` answers 0 while `deposit` still accepts assets.
    /// @dev The real `steakUSDG` did exactly this at block `118337511`: `0` for every
    ///      address, then `deposit(10_000e6)` minted shares for the full amount.
    bool public maxDepositLies;

    /// @notice When true, `withdraw` returns the shares it burned instead of the assets
    ///         it paid. The real venue does this; `redeem` returns assets.
    bool public withdrawReturnsShares;

    /// @notice Extra assets the venue pays on top of what was asked, without reducing its
    ///         own reported `totalAssets` for them. Models a venue that over-delivers — the
    ///         case `VaultV3._withdraw` handles by measuring the balance delta
    ///         (`VaultV3.vy:877-890`) instead of trusting the request or the return value.
    uint256 public overpayWithdraw;

    error VenuePaused();
    error ExceedsMaxDeposit();
    error ExceedsMaxWithdraw();
    error InsufficientBalance();

    constructor(
        address _asset
    ) {
        assetToken = MockERC20(_asset);
    }

    /*//////////////////////////////////////////////////////////////
                              TEST KNOBS
    //////////////////////////////////////////////////////////////*/

    function setDepositCap(
        uint256 _cap
    ) external {
        depositCap = _cap;
    }

    /// @notice Set how much cash the venue can pay, and move the cash to match.
    ///
    /// The money has to be *physically* there, because the adapter bounds withdrawals by
    /// the venue's own token balance (the only bound the real venue enforces). Lowering
    /// the number pushes the difference to a sink — "deployed into a Morpho market";
    /// raising it mints the mock asset back, which is what a venue looks like when a
    /// market position is unwound.
    function setTokensAvailable(
        uint256 _available
    ) external {
        tokensAvailable = _available;
        uint256 cash = assetToken.balanceOf(address(this));
        if (cash > _available) {
            assetToken.transfer(address(0xdEaD), cash - _available);
        } else if (cash < _available) {
            assetToken.mint(address(this), _available - cash);
        }
    }

    function setMaxWithdrawLies(
        bool _lies
    ) external {
        maxWithdrawLies = _lies;
    }

    function setMaxDepositLies(
        bool _lies
    ) external {
        maxDepositLies = _lies;
    }

    function setWithdrawReturnsShares(
        bool _shares
    ) external {
        withdrawReturnsShares = _shares;
    }

    function setDepositReverts(
        bool _reverts
    ) external {
        depositReverts = _reverts;
    }

    function setOverpayWithdraw(
        uint256 _overpay
    ) external {
        overpayWithdraw = _overpay;
    }

    /// @notice Force the venue's reported total assets (simulates yield or loss).
    function setTotalAssets(
        uint256 _totalAssets
    ) external {
        totalAssetsAmount = _totalAssets;
    }

    /// @notice Seed a position for `who` without moving tokens (test fixture only).
    function seedPosition(
        address who,
        uint256 assets,
        uint256 shares
    ) external {
        totalAssetsAmount += assets;
        totalSupply += shares;
        balanceOf[who] += shares;
    }

    /*//////////////////////////////////////////////////////////////
                            ERC-4626 VIEWS
    //////////////////////////////////////////////////////////////*/

    function asset() external view returns (address) {
        return address(assetToken);
    }

    function totalAssets() external view returns (uint256) {
        return totalAssetsAmount;
    }

    function convertToShares(
        uint256 assets
    ) public view returns (uint256) {
        if (totalSupply == 0 || totalAssetsAmount == 0) return assets * SCALE;
        return (assets * totalSupply) / totalAssetsAmount;
    }

    function convertToAssets(
        uint256 shares
    ) public view returns (uint256) {
        if (totalSupply == 0) return shares / SCALE;
        return (shares * totalAssetsAmount) / totalSupply;
    }

    /// @dev Deliberately ignores `depositReverts`: a venue that reports capacity and
    ///      then fails on deposit is exactly the case the adapter must not swallow.
    ///      `maxDepositLies` answers 0 without closing the venue, which is what the real
    ///      venue did at the pin; `deposit` keeps using the honest capacity so the lie is
    ///      the getter's, not the venue's behaviour.
    function maxDeposit(
        address
    ) public view returns (uint256) {
        if (maxDepositLies) return 0;
        return _depositCapacity();
    }

    function _depositCapacity() internal view returns (uint256) {
        if (depositCap == type(uint256).max) return type(uint256).max;
        if (totalAssetsAmount >= depositCap) return 0;
        return depositCap - totalAssetsAmount;
    }

    function maxWithdraw(
        address owner
    ) public view returns (uint256) {
        if (maxWithdrawLies) return 0;
        uint256 ownerAssets = convertToAssets(balanceOf[owner]);
        return ownerAssets < tokensAvailable ? ownerAssets : tokensAvailable;
    }

    function maxRedeem(
        address owner
    ) public view returns (uint256) {
        return convertToShares(maxWithdraw(owner));
    }

    function previewDeposit(
        uint256 assets
    ) external view returns (uint256) {
        return convertToShares(assets);
    }

    function previewRedeem(
        uint256 shares
    ) external view returns (uint256) {
        return convertToAssets(shares);
    }

    /*//////////////////////////////////////////////////////////////
                          ERC-4626 MUTATIONS
    //////////////////////////////////////////////////////////////*/

    function deposit(
        uint256 assets,
        address receiver
    ) external returns (uint256 shares) {
        if (depositReverts) revert VenuePaused();
        if (assets > _depositCapacity()) revert ExceedsMaxDeposit();

        shares = convertToShares(assets);
        // A correct venue never accepts assets it cannot represent as shares.
        if (shares == 0) revert ExceedsMaxDeposit();

        assetToken.transferFrom(msg.sender, address(this), assets);
        totalAssetsAmount += assets;
        totalSupply += shares;
        balanceOf[receiver] += shares;
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256) {
        // Bounded by cash, like the real venue — not by `maxWithdraw`, which can report 0.
        if (assets > tokensAvailable) revert ExceedsMaxWithdraw();

        uint256 shares = totalAssetsAmount == 0 ? 0 : (assets * totalSupply) / totalAssetsAmount;
        if (shares > balanceOf[owner]) revert InsufficientBalance();

        balanceOf[owner] -= shares;
        totalSupply -= shares;
        totalAssetsAmount -= assets;

        uint256 extra = overpayWithdraw;
        if (extra > 0) assetToken.mint(address(this), extra);
        assetToken.transfer(receiver, assets + extra);

        // The real venue returns shares burned here, not assets paid.
        return withdrawReturnsShares ? shares : assets + extra;
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256) {
        if (shares > balanceOf[owner]) revert InsufficientBalance();

        uint256 assets = convertToAssets(shares);
        if (assets > tokensAvailable) revert ExceedsMaxWithdraw();

        balanceOf[owner] -= shares;
        totalSupply -= shares;
        totalAssetsAmount -= assets;
        assetToken.transfer(receiver, assets);
        return assets;
    }
}
