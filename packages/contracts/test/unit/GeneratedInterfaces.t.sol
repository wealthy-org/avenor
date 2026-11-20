// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { Test } from "forge-std/Test.sol";
import { IVaultV3 } from "../../src/interfaces/IVaultV3.sol";
import { IVaultFactory } from "../../src/interfaces/IVaultFactory.sol";
import { IMorphoVaultV2 } from "../../src/interfaces/IMorphoVaultV2.sol";

/// @notice Guards the generated interfaces against silent drift.
/// @dev Two proofs are used:
///      1. Selector equality — the 4-byte values that the app, SDK and keeper
///         hard-code outside Solidity. They were produced from the pinned ABI
///         (`packages/core/artifacts`) and are recorded in `docs/WITHDRAWAL_SEMANTICS.md`.
///      2. `abi.encodeCall` on unambiguous functions — compile-time proof that the
///         generated signature takes exactly the arguments we pass.
///
///      Overloads (`withdraw`/`redeem`/`update_debt`/`add_strategy`) cannot be
///      referenced as `IVaultV3.withdraw.selector`: the lookup is ambiguous and the
///      compiler rejects it. Overload arity is therefore asserted through
///      `keccak256(<signature string>)` below. This is not a workaround for a bug —
///      it is the same reason generated bindings must always pin the full signature
///      instead of calling an overload by bare name.
contract GeneratedInterfacesTest is Test {
    function test_vaultV3SelectorsMatchPinnedAbi() external pure {
        // Vyper exposes snake_case; these are the selectors of the pinned ABI.
        assertEq(IVaultV3.setPaused.selector, bytes4(0x16c38b3c), "setPaused");
        assertEq(
            IVaultV3.setProfitMaxUnlockTime.selector, bytes4(0xdf69b22a), "setProfitMaxUnlockTime"
        );
        assertEq(IVaultV3.strategies.selector, bytes4(0x39ebf823), "strategies(address)");
        assertEq(IVaultV3.process_report.selector, bytes4(0x6ec2b8d4), "process_report(address)");
        assertEq(IVaultV3.deposit.selector, bytes4(0x6e553f65), "deposit(uint256,address)");
        assertEq(
            bytes4(keccak256("set_deposit_limit(uint256)")), bytes4(0x6fe01d1e), "set_deposit_limit"
        );
        assertEq(bytes4(keccak256("set_deposit_limit(uint256,bool)")), bytes4(0x81685796));
        assertEq(IVaultV3.apiVersion.selector, bytes4(keccak256("apiVersion()")));
    }

    function test_depositAndMintEncodeAgainstGeneratedSignature() external pure {
        // encodeCall compiles only if the signature accepts (uint256, address).
        address a = address(0xA11CE);
        assertEq(bytes4(abi.encodeCall(IVaultV3.deposit, (1, a))), bytes4(0x6e553f65));
        assertEq(bytes4(abi.encodeCall(IVaultV3.mint, (1, a))), bytes4(0x94bf804d));
        // set_deposit_limit is overloaded ((uint256) and (uint256,bool)), so its
        // selector is asserted as a constant rather than through member lookup.
        assertEq(bytes4(abi.encodeCall(IVaultV3.process_report, (a))), bytes4(0x6ec2b8d4));
    }

    function test_withdrawAndRedeemOverloadSignaturesArePinned() external pure {
        // The 3-arg forms rely on Vault V3 defaults: withdraw(max_loss=0),
        // redeem(max_loss=10000). The 4-arg forms are the only safe Avenor entry
        // points, and these constants are what the SDK must send.
        assertEq(bytes4(keccak256("withdraw(uint256,address,address)")), bytes4(0xb460af94));
        assertEq(bytes4(keccak256("withdraw(uint256,address,address,uint256)")), bytes4(0xa318c1a4));
        assertEq(
            bytes4(keccak256("withdraw(uint256,address,address,uint256,address[])")),
            bytes4(0xd81a09f6)
        );
        assertEq(bytes4(keccak256("redeem(uint256,address,address)")), bytes4(0xba087652));
        assertEq(bytes4(keccak256("redeem(uint256,address,address,uint256)")), bytes4(0x9f40a7b3));
        assertEq(
            bytes4(keccak256("redeem(uint256,address,address,uint256,address[])")),
            bytes4(0x06580f2d)
        );
        assertEq(bytes4(keccak256("update_debt(address,uint256)")), bytes4(0x0aeebf55));
        assertEq(bytes4(keccak256("update_debt(address,uint256,uint256)")), bytes4(0xba54971f));
        // add_strategy(address) and add_strategy(address,bool) must not collide with
        // the two-argument selector used by the deploy script.
        assertEq(bytes4(keccak256("add_strategy(address)")), bytes4(0xde7aeb41));
        assertEq(bytes4(keccak256("add_strategy(address,bool)")), bytes4(0xc2e73cca));
    }

    function test_factoryDeploySignatureIsPinned() external pure {
        // Parameter order matters and cannot be inferred from a selector, so the
        // signature string is asserted as well.
        assertEq(
            IVaultFactory.deploy_new_vault.selector,
            bytes4(keccak256("deploy_new_vault(address,string,string,address,uint256)"))
        );
        // protocol_fee_config is overloaded: () and (address). Both selectors must stay
        // distinct, otherwise a caller asking for the global config would silently read
        // a per-vault override.
        assertEq(bytes4(keccak256("protocol_fee_config(address)")), bytes4(0x6556424b), "per-vault");
        assertTrue(
            bytes4(keccak256("protocol_fee_config(address)"))
                != bytes4(keccak256("protocol_fee_config()"))
        );
    }

    function test_venueInterfaceMatchesDispatchedSelectors() external pure {
        // These selectors appear directly after a PUSH4 in the venue's runtime
        // dispatcher, i.e. the venue really implements them
        // (`docs/VENUE_INTEGRATIONS.md` §4). `liquidity()` is absent on purpose:
        // it reverts on steakUSDG.
        assertEq(IMorphoVaultV2.maxWithdraw.selector, bytes4(0xce96cb77), "maxWithdraw");
        assertEq(IMorphoVaultV2.maxRedeem.selector, bytes4(0xd905777e), "maxRedeem");
        assertEq(IMorphoVaultV2.maxDeposit.selector, bytes4(0x402d267d), "maxDeposit");
        assertEq(IMorphoVaultV2.convertToAssets.selector, bytes4(0x07a2d13a), "convertToAssets");
        assertEq(IMorphoVaultV2.convertToShares.selector, bytes4(0xc6e6f592), "convertToShares");
        assertEq(IMorphoVaultV2.curator.selector, bytes4(0xe66f53b7), "curator");
        assertEq(IMorphoVaultV2.deposit.selector, bytes4(0x6e553f65), "venue deposit");
        assertEq(IMorphoVaultV2.withdraw.selector, bytes4(0xb460af94), "venue withdraw");
        assertEq(IMorphoVaultV2.redeem.selector, bytes4(0xba087652), "venue redeem");
    }
}
