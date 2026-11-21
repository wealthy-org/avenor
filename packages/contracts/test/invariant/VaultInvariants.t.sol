// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { TokenizedStrategy } from "tokenized-strategy/TokenizedStrategy.sol";
import { Deploy } from "../../script/Deploy.s.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { MorphoVaultStrategy } from "../../src/strategies/MorphoVaultStrategy.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockVenue } from "../mocks/MockVenue.sol";
import { MockYearnFactory } from "../mocks/MockYearnFactory.sol";
import { VaultHandler } from "./VaultHandler.sol";

/// @notice Ticket 3.4: stateful invariants over deposit / mint / withdraw / redeem /
///         transfer / report / update_debt / set_deposit_limit / setPaused / unlock time.
///
/// @dev The invariant set is intentionally small and *accounting* — properties that must hold
///      after every single call, not properties that need a scenario. Scenario behaviour (who
///      absorbs a loss, what a fee on a recovery costs) is pinned by the unit suites; if a
///      property here fails, the seed and the shrinking trace are the reproduction, which is why
///      `foundry.toml` records `runs` and `depth` in the repository rather than in a CLI flag.
///
///      `fail_on_revert = false` is load-bearing: the handler deliberately produces calls the
///      vault must refuse (deposit past the limit, redeem with too tight a `max_loss`,
///      `update_debt` that does not change the debt). Those are discarded, not failures.
contract VaultInvariantsTest is Test {
    address internal constant TS_IMPL = 0x3110D1Eec90f0651C18e75AD37711A8777342504;
    uint256 internal constant DEPOSIT = 1_000_000e6;

    Deploy internal deployer;
    Deploy.Deployment internal d;
    MockERC20 internal usdg;
    MockVenue internal venue;
    IVaultV3 internal vault;
    VaultHandler internal handler;

    address[] internal actors;
    address internal guardian = makeAddr("guardian");
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");

    function setUp() public {
        deployer = new Deploy();
        usdg = new MockERC20("USDG", "USDG", 6);
        venue = new MockVenue(address(usdg));

        MockYearnFactory yearnFactory = new MockYearnFactory();
        TokenizedStrategy template = new TokenizedStrategy(address(yearnFactory));
        vm.etch(TS_IMPL, address(template).code);

        Deploy.Config memory cfg = Deploy.Config({
            mode: Deploy.Mode.DryRun,
            actor: address(deployer),
            usdg: address(usdg),
            venue: address(venue),
            timelock: address(0),
            proposer: address(deployer),
            guardian: guardian,
            keeper: keeper,
            treasury: treasury,
            management: address(0),
            maxDebt: DEPOSIT,
            minimumTotalIdle: 0,
            seedAssets: 0,
            vaultName: "Avenor USDG Managed Vault",
            vaultSymbol: "avUSDG",
            strategyName: "Avenor USDG steakUSDG",
            factoryName: "Avenor Vault Factory",
            placeholdersUsed: false,
            gitRev: "",
            feeRecipient: treasury,
            performanceFee: 1_000,
            managementFee: 0,
            refundRatio: 0,
            maxFee: 0,
            maxGain: 500,
            maxLoss: 200
        });

        d = deployer.deployAll(cfg);
        vault = IVaultV3(d.vault);

        // The product ships closed; the handler needs a live vault, so the test opens it the way
        // the timelock would. `set_deposit_limit` is also a handler action, so the suite explores
        // every limit from 0 to 2.000.000 from here on.
        vm.prank(d.timelock);
        vault.set_deposit_limit(type(uint256).max);

        for (uint256 i; i < 4; ++i) {
            actors.push(makeAddr(string.concat("actor", vm.toString(i))));
        }

        handler = new VaultHandler(
            vault, usdg, venue, d.strategy, keeper, guardian, d.timelock, d.accountant, actors
        );

        targetContract(address(handler));
    }

    /*//////////////////////////////////////////////////////////////
                              INVARIANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice The accounting identity the whole product rests on: every asset the vault claims
    ///         is either idle cash or debt owed by a strategy. If this can break, `totalAssets`
    ///         is a number nobody can reconcile against balances.
    function invariant_totalAssetsIsIdlePlusDebt() public view {
        assertEq(
            vault.totalAssets(),
            vault.totalIdle() + vault.totalDebt(),
            "totalAssets != totalIdle + totalDebt"
        );
    }

    /// @notice No share exists outside the accounts the vault can name. Catches a mint that
    ///         credits nobody, a burn that burns too much, and fee shares issued to an address
    ///         the product does not know about.
    function invariant_everyShareIsOwnedByAKnownHolder() public view {
        address[] memory holders = handler.holders();
        uint256 sum;
        for (uint256 i; i < holders.length; ++i) {
            sum += vault.balanceOf(holders[i]);
        }
        assertEq(sum, vault.totalSupply(), "shares unaccounted for");
    }

    /// @notice A pause means "no new money", never "your money is stuck" (ADR-5). The exit side
    ///         is covered by the unit suites; this asserts the deposit side cannot drift.
    function invariant_pauseNeverLeavesADepositOpen() public view {
        if (!vault.isPaused()) return;
        for (uint256 i; i < actors.length; ++i) {
            assertEq(vault.maxDeposit(actors[i]), 0, "paused but a deposit is possible");
            assertEq(vault.maxMint(actors[i]), 0, "paused but a mint is possible");
        }
    }

    /// @notice `pricePerShare()` is documented as `convertToAssets(10**decimals)`; if the two
    ///         ever disagree the UI displays one number while the contract enforces another.
    function invariant_pricePerShareIsTheConvertedUnit() public view {
        assertEq(vault.pricePerShare(), vault.convertToAssets(10 ** vault.decimals()));
    }

    /// @notice No single holder can claim more than the vault owns. Trivial-looking, but it fails
    ///         the moment a report double-counts a gain or a loss is credited to the wrong side.
    function invariant_noHolderClaimsMoreThanTheVaultOwns() public view {
        uint256 assets = vault.totalAssets();
        address[] memory holders = handler.holders();
        for (uint256 i; i < holders.length; ++i) {
            assertLe(vault.convertToAssets(vault.balanceOf(holders[i])), assets);
        }
    }

    /// @notice The classic 4626 round-trip: deposit then redeem in the same block must not create
    ///         assets. Checked at three magnitudes so the 1-wei corner is covered too.
    function invariant_depositRedeemRoundTripNeverMintsValue() public view {
        uint256[3] memory sizes = [uint256(1), uint256(1e6), uint256(100_000e6)];
        for (uint256 i; i < sizes.length; ++i) {
            uint256 shares = vault.previewDeposit(sizes[i]);
            assertLe(vault.previewRedeem(shares), sizes[i], "round trip created value");
        }
    }

    /// @notice Locked profit must stay inside the vault: the shares it holds are the buffer that
    ///         absorbs the next loss, and `unlockedShares` is a subset of them until the vault
    ///         burns them.
    function invariant_lockedSharesStayInsideTheVault() public view {
        assertLe(
            vault.unlockedShares(),
            vault.balanceOf(address(vault)),
            "unlocked shares exceed the vault's own balance"
        );
    }

    /// @notice Fee shares are paid in shares, so their value moves with pps. The accountant can
    ///         never be owed more than the vault holds, or the last exit would be unfunded.
    function invariant_theAccountantCannotBeOwedMoreThanTheVaultHolds() public view {
        assertLe(
            vault.convertToAssets(vault.balanceOf(d.accountant)),
            vault.totalAssets(),
            "fee claim exceeds assets"
        );
    }
}
