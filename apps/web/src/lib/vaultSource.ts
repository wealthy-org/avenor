// Which vault a request may be answered from, and from which source.
//
// The committed capture in `forkSnapshot.json` describes exactly one address on one chain: the staging
// vault on the chain-4663 fork. Serving it for any other address would print one chain's numbers under
// another chain's address, and a reader disproves that with a single `eth_getCode`. So the capture is
// behind two guards, both of which must hold: the address IS the captured vault, and the node we asked
// reports the captured chain.
//
// A metadata row is built from the snapshot that answered, never from a constant. When a getter the row
// depends on did not answer, this throws with the reason: an empty string would reach `format.ts` and
// surface as `"" is not an address`, which is what a reader saw on the deployed site.

import type { VaultSnapshot, Field } from "./vaultRead.ts";
import { CAPTURE_CHAIN_ID, STAGING_VAULT } from "../config/staging.ts";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** True only when the committed capture can honestly answer for this address on this chain. */
export function captureFallbackAllowed(address: string, rpcChainId: number | null): boolean {
  if (rpcChainId === null) return false;
  if (address.toLowerCase() !== STAGING_VAULT.toLowerCase()) return false;
  return rpcChainId === CAPTURE_CHAIN_ID;
}

function required<T>(entry: Field<T>, getter: string, blockNumber: number): T {
  if (entry.value === null) {
    throw new Error(
      `${getter} did not answer at block ${blockNumber}: ${entry.error ?? "the node returned no reason"}`
    );
  }
  return entry.value;
}

function addressField(entry: Field<string>, getter: string, blockNumber: number): string {
  const raw = required(entry, getter, blockNumber);
  if (!ADDRESS.test(raw)) throw new Error(`${getter} returned "${raw}" at block ${blockNumber}, which is not an address`);
  return raw.toLowerCase();
}

export interface VaultMetadataRow {
  address: string;
  name: string;
  symbol: string;
  asset_address: string;
  asset_decimals: number;
  share_decimals: number;
  role_manager: string;
  accountant: string;
  deposit_limit: string;
  recorded_block: string;
  source: "onchain" | "captured";
}

/**
 * The catalogue row for a vault, from the snapshot that answered this request.
 *
 * `deposit_limit` is a string because it is a `uint256`; the page parses it back to `bigint`. Nothing
 * here is defaulted: a missing asset, name, symbol, decimals, role manager, accountant or deposit limit
 * fails the row instead of becoming a zero in it.
 */
export function metadataFromSnapshot(address: string, snapshot: VaultSnapshot): VaultMetadataRow {
  const at = snapshot.at.blockNumber;
  const vault = snapshot.vault;

  if (!ADDRESS.test(address)) throw new Error(`"${address}" is not an address`);
  const decimals = required(vault.decimals, "decimals()", at);

  return {
    address: address.toLowerCase(),
    name: required(vault.name, "name()", at),
    symbol: required(vault.symbol, "symbol()", at),
    asset_address: addressField(vault.asset, "asset()", at),
    // `VaultV3.decimals` is the asset's decimals: shares are minted in the asset's unit, not assumed.
    asset_decimals: decimals,
    share_decimals: decimals,
    role_manager: addressField(snapshot.roles.roleManager, "role_manager()", at),
    accountant: addressField(snapshot.roles.accountant, "accountant()", at),
    deposit_limit: required(vault.depositLimit, "deposit_limit()", at),
    recorded_block: String(at),
    source: snapshot.source,
  };
}
