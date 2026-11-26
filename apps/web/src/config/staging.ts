// Addresses recorded from the staging fork, in one file so a client component can import them without
// pulling an RPC client into the browser bundle.
//
// Every value here was read with `eth_getCode` / a getter at the block named below, by
// `scripts/capture-fork-snapshot.mjs`; the row that proves each one is in `docs/REFERENCE_CAPTURE.md` §6.
// None of these addresses holds code on Robinhood Chain mainnet, so none may be presented as deployed
// there. The pages read the node for their numbers; this file only names the contracts.

/**
 * The block the committed capture was taken at.
 *
 * This is a block the local anvil fork mined, not a canonical chain block. Its height happens to
 * coincide with a canonical height, which is exactly why the hash and the timestamp below are named
 * after the fork: the canonical chain has different values at `118337663`, and printing the fork's
 * hash under the chain's name is a claim a reader disproves with one `eth_getBlockByNumber` call.
 */
export const CAPTURE_FORK_BLOCK = "118337663";
export const CAPTURE_FORK_BLOCK_HASH = "0x1793d732f77546f084089ab84f4282959b513315a926a854c9ddb21d2b38d0b9";
export const CAPTURE_FORK_TIMESTAMP = "2026-11-24T04:57:57.000Z";

/**
 * What the canonical chain actually holds at the capture's height, read from
 * `https://rpc.solidrpc.io/public/evm/4663` with `eth_getBlockByNumber`.
 *
 * It is recorded next to the fork block so the mismatch is stated, not hidden: the numbers in
 * `forkSnapshot.json` are the fork's state after its rehearsal transactions, at a height whose
 * canonical block is a different block with a different hash.
 */
export const CANONICAL_HEADER_AT_CAPTURE_HEIGHT = {
  hash: "0xebf54955940be06117f89f57f750d1d1dd263000ac5e2f797b544486277be7db",
  timestamp: "2026-11-19T15:54:29.000Z",
  note: "an anvil fork mines its own block at this height, so the capture's hash is not this one",
} as const;

/**
 * The chain the committed capture was taken on. A capture is only valid on the chain it was read from:
 * the node's `eth_chainId` must equal this before `forkSnapshot.json` may answer a request.
 */
export const CAPTURE_CHAIN_ID = 4663;

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