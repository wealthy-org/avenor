// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

/// @notice Stand-in for Yearn's `VaultFactory`, which `TokenizedStrategy.report()`
///         consults for the protocol fee (`protocol_fee_config()`).
///         v1 runs with no protocol fee; the mock makes that explicit instead of
///         letting an unset factory address revert inside `report()`.
contract MockYearnFactory {
    uint16 public feeBps;
    address public feeRecipient;

    function setProtocolFee(
        uint16 _feeBps,
        address _recipient
    ) external {
        feeBps = _feeBps;
        feeRecipient = _recipient;
    }

    function protocol_fee_config() external view returns (uint16, address) {
        return (feeBps, feeRecipient);
    }
}
