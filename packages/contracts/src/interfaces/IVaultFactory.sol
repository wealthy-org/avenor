// SPDX-License-Identifier: MIT
// GENERATED FILE — DO NOT EDIT BY HAND.
// Generator : scripts/gen-interfaces.py
// Artifact  : packages/core/artifacts/VaultFactory.json (sha256 8cad067924e302142989a83d94a84bb1e1e125e9addfc76836fe6436d09ae006)
// Contract  : VaultFactory
// Compiler  : vyper 0.3.10+commit.9136169 ['vyper', '--optimize', 'codesize', '--evm-version', 'paris']
// Source    : yearn-vaults-v3/contracts/VaultFactory.vy @ f449264ff4f8bebe9a6bf72e43095304fdf101b8 (v3.1.1-2-gf449264)
// SourceKey : keccak 0x503baf38b18abe2c0e734955c5ff8420e3b390a54c3c7fe55833cf4012ebf2c4 (11997 bytes)
// Runtime   : keccak 0xdfc2a10112cf82c15ada486a586ff1a5bebd312e9dbe86ef8c13d92683bddec2 (3604 bytes)
// Regenerate: python scripts/gen-interfaces.py
pragma solidity 0.8.18;

interface IVaultFactory {
    event FactoryShutdown();
    event GovernanceTransferred(address indexed previousGovernance, address indexed newGovernance);
    event NewVault(address indexed vault_address, address indexed asset);
    event RemovedCustomProtocolFee(address indexed vault);
    event UpdateCustomProtocolFee(address indexed vault, uint16 new_custom_protocol_fee);
    event UpdatePendingGovernance(address indexed newPendingGovernance);
    event UpdateProtocolFeeBps(uint16 old_fee_bps, uint16 new_fee_bps);
    event UpdateProtocolFeeRecipient(
        address indexed old_fee_recipient, address indexed new_fee_recipient
    );

    function acceptGovernance() external;
    function apiVersion() external view returns (string memory);
    function deploy_new_vault(
        address asset,
        string calldata name,
        string calldata symbol,
        address role_manager,
        uint256 profit_max_unlock_time
    ) external returns (address);
    function governance() external view returns (address);
    function name() external view returns (string memory);
    function pendingGovernance() external view returns (address);
    function protocol_fee_config() external view returns (uint16, address);
    function protocol_fee_config(
        address vault
    ) external view returns (uint16, address);
    function remove_custom_protocol_fee(
        address vault
    ) external;
    function set_custom_protocol_fee_bps(
        address vault,
        uint16 new_custom_protocol_fee
    ) external;
    function set_protocol_fee_bps(
        uint16 new_protocol_fee_bps
    ) external;
    function set_protocol_fee_recipient(
        address new_protocol_fee_recipient
    ) external;
    function shutdown() external view returns (bool);
    function shutdown_factory() external;
    function transferGovernance(
        address new_governance
    ) external;
    function use_custom_protocol_fee(
        address vault
    ) external view returns (bool);
    function vault_original() external view returns (address);
}
