// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { MockVenue } from "../mocks/MockVenue.sol";

/// @notice Random-action handler for the stateful invariant suite (ticket 3.4).
///
/// @dev Deliberately does **not** catch reverts. `foundry.toml` sets
///      `[invariant] fail_on_revert = false`, so a call that the vault refuses (a deposit past
///      `deposit_limit`, a redeem whose `max_loss` is too tight, a `update_debt` that would not
///      change the debt) is rolled back and counted as a discarded call. Catching inside the
///      handler would hide the difference between "the vault refused this" and "the sequence was
///      never tried".
///
///      Every asset movement is bounded so the fuzzer explores the whole legal space instead of
///      spending its runs on absurd numbers that revert immediately:
///      deposits up to 500.000, gains up to 4% and losses up to 1.5% (inside the deployed
///      `maxGain = 500` / `maxLoss = 200` bps), debt changes up to the strategy's `max_debt`.
contract VaultHandler is Test {
    IVaultV3 public immutable vault;
    MockERC20 public immutable usdg;
    MockVenue public immutable venue;
    address public immutable strategy;
    address public immutable keeper;
    address public immutable guardian;
    address public immutable timelock;
    address public immutable accountant;

    address[] public actors;

    /// @dev Diagnostics only; invariants never read these, so a discarded call cannot make the
    ///      suite lie about coverage.
    uint256 public deposits;
    uint256 public withdrawals;
    uint256 public reports;
    uint256 public debtUpdates;
    uint256 public limitChanges;
    uint256 public pauses;

    constructor(
        IVaultV3 _vault,
        MockERC20 _usdg,
        MockVenue _venue,
        address _strategy,
        address _keeper,
        address _guardian,
        address _timelock,
        address _accountant,
        address[] memory _actors
    ) {
        vault = _vault;
        usdg = _usdg;
        venue = _venue;
        strategy = _strategy;
        keeper = _keeper;
        guardian = _guardian;
        timelock = _timelock;
        accountant = _accountant;
        actors = _actors;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function userAt(
        uint256 seed
    ) public view returns (address) {
        return actors[bound(seed, 0, actors.length - 1)];
    }

    /*//////////////////////////////////////////////////////////////
                                 ENTRY
    //////////////////////////////////////////////////////////////*/

    function deposit(
        uint256 actorSeed,
        uint256 assets
    ) external {
        address actor = userAt(actorSeed);
        assets = bound(assets, 0, 500_000e6);

        usdg.mint(actor, assets);
        vm.startPrank(actor);
        usdg.approve(address(vault), assets);
        vault.deposit(assets, actor);
        vm.stopPrank();

        ++deposits;
    }

    function mint(
        uint256 actorSeed,
        uint256 shares
    ) external {
        address actor = userAt(actorSeed);
        shares = bound(shares, 0, 500_000e6);

        // `mint` pulls `previewMint(shares)` assets; minting a little extra covers the rounding
        // so a legal `mint` is not rejected for a 1 wei shortfall in the test's own approval.
        uint256 assets = vault.previewMint(shares);
        usdg.mint(actor, assets + 1);
        vm.startPrank(actor);
        usdg.approve(address(vault), assets + 1);
        vault.mint(shares, actor);
        vm.stopPrank();

        ++deposits;
    }

    function withdraw(
        uint256 actorSeed,
        uint256 assets,
        uint256 maxLossSeed
    ) external {
        address actor = userAt(actorSeed);
        // Ask the vault what it is willing to give at a *permissive* max_loss, then choose a
        // max_loss that is sometimes too tight: an exit the vault refuses is a real state, and
        // the suite should hit the revert path as well as the happy one.
        uint256 ceiling = vault.maxWithdraw(actor, 10_000);
        assets = bound(assets, 0, ceiling);
        uint256 maxLoss = bound(maxLossSeed, 0, 10_000);

        vm.prank(actor);
        vault.withdraw(assets, actor, actor, maxLoss);

        ++withdrawals;
    }

    function redeem(
        uint256 actorSeed,
        uint256 shares,
        uint256 maxLossSeed
    ) external {
        address actor = userAt(actorSeed);
        shares = bound(shares, 0, vault.balanceOf(actor));
        uint256 maxLoss = bound(maxLossSeed, 0, 10_000);

        vm.prank(actor);
        vault.redeem(shares, actor, actor, maxLoss);

        ++withdrawals;
    }

    function transferShares(
        uint256 fromSeed,
        uint256 toSeed,
        uint256 shares
    ) external {
        address from = userAt(fromSeed);
        address to = userAt(toSeed);
        shares = bound(shares, 0, vault.balanceOf(from));

        vm.prank(from);
        vault.transfer(to, shares);
    }

    /// @notice Moves the venue's value, then reports it through the vault.
    /// @dev Gains and losses are applied to the venue's real token balance as well as its
    ///      `totalAssets`, otherwise `MorphoVaultStrategy._totalAssets` (live) and the venue's
    ///      cash would disagree and the loss tests would be measuring a mock artifact.
    function report(
        uint256 gainSeed,
        uint256 lossSeed
    ) external {
        uint256 gain = bound(gainSeed, 0, 40_000e6);
        uint256 loss = bound(lossSeed, 0, 15_000e6);

        uint256 current = venue.totalAssets();
        uint256 target = current + gain;
        if (loss > target) loss = target;
        target -= loss;

        if (target > current) {
            usdg.mint(address(venue), target - current);
        } else if (current > target) {
            vm.prank(address(venue));
            usdg.transfer(address(0xdEaD), current - target);
        }
        venue.setTotalAssets(target);

        vm.prank(keeper);
        vault.process_report(strategy);

        ++reports;
    }

    function updateDebt(
        uint256 amountSeed,
        uint256 maxLossSeed
    ) external {
        uint256 maxDebt = vault.strategies(strategy).max_debt;
        uint256 amount = bound(amountSeed, 0, maxDebt);
        uint256 maxLoss = bound(maxLossSeed, 0, 200);

        vm.prank(keeper);
        vault.update_debt(strategy, amount, maxLoss);

        ++debtUpdates;
    }

    function setDepositLimit(
        uint256 limitSeed
    ) external {
        vm.prank(timelock);
        vault.set_deposit_limit(bound(limitSeed, 0, 2_000_000e6));
        ++limitChanges;
    }

    function setPaused(
        uint256 pausedSeed
    ) external {
        vm.prank(guardian);
        vault.setPaused(bound(pausedSeed, 0, 1) == 1);
        ++pauses;
    }

    /// @notice Sets the vault's own profit unlock time to something short so the suite exercises
    ///         the middle of the unlock curve instead of always sitting at "just reported".
    function setProfitMaxUnlockTime(
        uint256 timeSeed
    ) external {
        vm.prank(timelock);
        vault.setProfitMaxUnlockTime(bound(timeSeed, 0, 14 days));
    }

    /// @notice Reads the invariants need a stable list of every address that can hold shares.
    function holders() external view returns (address[] memory) {
        address[] memory all = new address[](actors.length + 3);
        for (uint256 i; i < actors.length; ++i) {
            all[i] = actors[i];
        }
        all[actors.length] = accountant;
        all[actors.length + 1] = address(vault);
        all[actors.length + 2] = strategy;
        return all;
    }
}
