// Addresses recorded from the staging fork, in one file so a client component can import them without
// pulling an RPC client into the browser bundle.
//
// Every value here was read with `eth_getCode` / a getter at the block named below, by
// `scripts/capture-fork-snapshot.mjs`; the row that proves each one is in `docs/REFERENCE_CAPTURE.md` §3.
// None of these addresses holds code on Robinhood Chain mainnet, so none may be presented as deployed
// there. The pages read the node for their numbers; this file only names the contracts.

/** Recorded block: `eth_getBlockByNumber` returned this hash and timestamp. */
export const RECORDED_BLOCK = "118337663";
export const RECORDED_BLOCK_HASH = "0x1793d732f77546f084089ab84f4282959b513315a926a854c9ddb21d2b38d0b9";
export const RECORDED_TIMESTAMP = "2026-11-24T04:57:57.000Z";

/** ERC-4626 allocator vault. 45-byte EIP-1167 proxy (`eth_getCode` = 90 hex chars). */
export const STAGING_VAULT = "0x5aebce3956fed4542edbe75d420497378e3b18ca";
/** VaultV3 implementation the proxy delegates to: 23,462 bytes, apiVersion() = "3.1.1". */
export const STAGING_IMPLEMENTATION = "0xd3af095de5d1419adabe47a48d6110e37236a97f";
/** USDG: symbol() = "USDG", name() = "Global Dollar", decimals() = 6, 170 bytes. */
export const STAGING_ASSET = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
/** "Avenor USDG steakUSDG" / "ysUSDG", apiVersion() = "3.1.1", currentDebt() = 0 at the recorded block. */
export const STAGING_STRATEGY = "0xf070f5a2ddf4d106502235597bd42fd9edaf7bfe";
/** TimelockController behind `role_manager()`; getMinDelay() = 172800 s. */
export const STAGING_TIMELOCK = "0x2c328d592819524f741a88a18572372cce196782";
/** Accountant behind `accountant()`; getVaultConfig(vault) = 10% performance, 0% management. */
export const STAGING_ACCOUNTANT = "0x47834d4241a7a5188a253cc0203ab49d4621a069";

/**
 * `decimals()` of the vault at the recorded block. `VaultV3` sets it from the asset, so a USDG vault has
 * 6-decimal shares. This is a recorded value, not a rule: the share input and the share printer both take
 * the decimals as an argument so a venue share token with 18 decimals is not scaled by 10^12.
 */
export const STAGING_SHARE_DECIMALS = 6;