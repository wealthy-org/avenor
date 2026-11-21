// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IDepositHook } from "../interfaces/IDepositHook.sol";
import { IVaultV3 } from "../interfaces/IVaultV3.sol";

/**
 * @title DepositCapHook
 * @notice Enforces three limits on the way *into* the vault: an allowlist phase, a global cap
 *         on `vault.totalAssets()`, and a per-wallet cap on the receiver's position.
 *
 * @dev Why a hook instead of `deposit_limit`: `VaultV3._max_deposit` reads the hook *instead of*
 *      `deposit_limit` (`VaultV3.vy:543-546`), and setting a hook requires `deposit_limit` to be
 *      `max_value` (`:1458-1490`). So when this hook is active it is the only deposit ceiling —
 *      `deposit_limit` stops being a number anyone can reason about. That is why every setter
 *      here is governance-only and why `docs/DEPLOYMENT.md` records the switch.
 *
 *      Three consequences that are deliberately visible rather than engineered away:
 *
 *      1. **Caps are measured live, not counted.** The per-wallet cap is
 *         `convertToAssets(balanceOf(receiver))` and the global cap is `totalAssets()`. A counter
 *         incremented in `post_deposit` would drift forever because withdrawals never call the
 *         hook (there is no `post_withdraw`), and a drifted counter would either block honest
 *         users or let the cap be exceeded.
 *      2. **Caps apply to `deposit`/`mint` only.** Shares received by `transfer` can push a
 *         position past the wallet cap; the hook then reports `0` until it comes back down. A
 *         transfer allowlist is a `transfer_hook` decision (ROLE_PERMISSION_MATRIX §1 note on
 *         `set_transfer_hook`), not a deposit decision, and mixing the two would silently block
 *         exits.
 *      3. **This contract never touches withdrawals.** `maxWithdraw`/`redeem` do not consult the
 *         deposit hook (`VaultV3.vy:552+`), so a cap of zero — including the "reject everyone"
 *         allowlist state — cannot stop an exit. ADR-5 depends on that, and the test suite pins it.
 *
 * @dev Rounding: `convertToAssets` rounds down, so a receiver can be allowed to deposit up to
 *      1 wei of assets past the cap. That is the vault's own rounding direction, not a hole this
 *      contract opens; the tests assert `<= 1` instead of pretending otherwise.
 */
contract DepositCapHook is IDepositHook {
    /// @notice The vault this hook is wired to. Immutable: a hook that can be pointed at another
    ///         vault is a hook whose caps mean nothing.
    IVaultV3 public immutable vault;

    /// @notice The only address that can change caps or the allowlist. In production this is the
    ///         48h governance timelock (ADR-4); the hook has no delay of its own on purpose — a
    ///         second delay here would be a second place to get it wrong.
    address public immutable governance;

    /// @notice Ceiling on `vault.totalAssets()` in asset units (6 decimals for USDG).
    /// @dev `type(uint256).max` = uncapped.
    uint256 public globalCap;

    /// @notice Per-wallet ceiling applied when `walletCap[account]` is zero.
    uint256 public defaultWalletCap;

    /// @notice Per-wallet override. Zero means "use `defaultWalletCap`"; blocking a wallet is
    ///         done with the allowlist, so zero never silently means "no deposits".
    mapping(address => uint256) public walletCap;

    /// @notice When true, only `allowed[receiver]` may deposit.
    bool public allowlistEnabled;

    /// @notice Allowlist entries. Meaningful only while `allowlistEnabled`.
    mapping(address => bool) public allowed;

    /// @notice Diagnostics: cumulative assets passed through `post_deposit`. Never used to
    ///         enforce a cap (see the note on live measurement above) — it exists so an indexer
    ///         can reconcile "how much was let in" against `totalAssets` growth.
    uint256 public totalRecordedDeposits;

    event SetGlobalCap(uint256 cap);
    event SetDefaultWalletCap(uint256 cap);
    event SetWalletCap(address indexed account, uint256 cap);
    event SetAllowlistEnabled(bool enabled);
    event SetAllowed(address indexed account, bool isAllowed);
    event DepositRecorded(
        address indexed depositor, address indexed recipient, uint256 assets, uint256 shares
    );

    error NotGovernance(address caller);
    error NotVault(address caller);
    error ZeroAddress(string what);
    error CapExceeded(address receiver, uint256 position, uint256 cap);

    constructor(
        address _vault,
        address _governance,
        uint256 _globalCap,
        uint256 _defaultWalletCap,
        bool _allowlistEnabled
    ) {
        if (_vault == address(0)) revert ZeroAddress("vault");
        if (_governance == address(0)) revert ZeroAddress("governance");
        vault = IVaultV3(_vault);
        governance = _governance;
        globalCap = _globalCap;
        defaultWalletCap = _defaultWalletCap;
        allowlistEnabled = _allowlistEnabled;
    }

    modifier onlyGovernance() {
        if (msg.sender != governance) revert NotGovernance(msg.sender);
        _;
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice The limit `VaultV3` uses for both `maxDeposit(receiver)` and the assert inside
    ///         `deposit`, so the number a UI shows and the number enforced cannot diverge.
    function available_deposit_limit(
        address receiver
    ) public view returns (uint256) {
        if (allowlistEnabled && !allowed[receiver]) return 0;

        uint256 limit = _globalRemaining();
        if (limit == 0) return 0;

        uint256 walletRemaining = _walletRemaining(receiver);
        if (walletRemaining == 0) return 0;

        return limit < walletRemaining ? limit : walletRemaining;
    }

    /// @notice The cap that applies to `receiver` right now: the override if set, else the
    ///         default. Exposed so the UI can say "cap 5.000, terisi 3.000" without guessing.
    function effectiveWalletCap(
        address receiver
    ) public view returns (uint256) {
        uint256 overrideCap = walletCap[receiver];
        return overrideCap == 0 ? defaultWalletCap : overrideCap;
    }

    /// @notice The receiver's position in asset units, the quantity the per-wallet cap limits.
    function positionOf(
        address receiver
    ) public view returns (uint256) {
        return vault.convertToAssets(vault.balanceOf(receiver));
    }

    /*//////////////////////////////////////////////////////////////
                                 HOOK
    //////////////////////////////////////////////////////////////*/

    /// @notice Records the deposit and re-checks the cap after the fact.
    /// @dev The vault already asserted `assets <= available_deposit_limit(receiver)` before
    ///      minting, and a revert here rolls that mint back, so this is a belt-and-braces check
    ///      against a future vault version that moves the hook call before the check. It is not
    ///      a second policy.
    function post_deposit(
        address depositor,
        address recipient,
        uint256 assets,
        uint256 shares
    ) external {
        if (msg.sender != address(vault)) revert NotVault(msg.sender);

        // `mint` deposits by shares; the asset value is what the caps are denominated in.
        uint256 depositedAssets = assets;
        if (depositedAssets == 0 && shares != 0) {
            depositedAssets = vault.convertToAssets(shares);
        }

        uint256 cap = effectiveWalletCap(recipient);
        uint256 position = positionOf(recipient);
        // One unit of tolerance: `convertToAssets` rounds down when the pps has a remainder.
        if (cap != type(uint256).max && position > cap + 1) {
            revert CapExceeded(recipient, position, cap);
        }

        totalRecordedDeposits += depositedAssets;
        emit DepositRecorded(depositor, recipient, depositedAssets, shares);
    }

    /*//////////////////////////////////////////////////////////////
                              GOVERNANCE
    //////////////////////////////////////////////////////////////*/

    function setGlobalCap(
        uint256 cap
    ) external onlyGovernance {
        globalCap = cap;
        emit SetGlobalCap(cap);
    }

    function setDefaultWalletCap(
        uint256 cap
    ) external onlyGovernance {
        defaultWalletCap = cap;
        emit SetDefaultWalletCap(cap);
    }

    function setWalletCap(
        address account,
        uint256 cap
    ) external onlyGovernance {
        if (account == address(0)) revert ZeroAddress("account");
        walletCap[account] = cap;
        emit SetWalletCap(account, cap);
    }

    /// @notice The emergency deposit switch. Turning the allowlist off restores the plain
    ///         global/per-wallet caps; turning it on with no entries rejects every deposit.
    function setAllowlistEnabled(
        bool enabled
    ) external onlyGovernance {
        allowlistEnabled = enabled;
        emit SetAllowlistEnabled(enabled);
    }

    function setAllowed(
        address account,
        bool isAllowed
    ) external onlyGovernance {
        if (account == address(0)) revert ZeroAddress("account");
        allowed[account] = isAllowed;
        emit SetAllowed(account, isAllowed);
    }

    /// @notice Batch form: an allowlist phase is set up in one transaction, not one per wallet,
    ///         so the on-chain state matches the list that was reviewed.
    function setAllowedBatch(
        address[] calldata accounts,
        bool isAllowed
    ) external onlyGovernance {
        for (uint256 i; i < accounts.length; ++i) {
            address account = accounts[i];
            if (account == address(0)) revert ZeroAddress("account");
            allowed[account] = isAllowed;
            emit SetAllowed(account, isAllowed);
        }
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _globalRemaining() internal view returns (uint256) {
        uint256 cap = globalCap;
        if (cap == type(uint256).max) return type(uint256).max;
        uint256 assets = vault.totalAssets();
        return assets >= cap ? 0 : cap - assets;
    }

    function _walletRemaining(
        address receiver
    ) internal view returns (uint256) {
        uint256 cap = effectiveWalletCap(receiver);
        if (cap == type(uint256).max) return type(uint256).max;
        uint256 position = positionOf(receiver);
        return position >= cap ? 0 : cap - position;
    }
}
