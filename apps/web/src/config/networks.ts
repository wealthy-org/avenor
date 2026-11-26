// Network names for the chain ids this repository has configured.
//
// Nothing here is authored from memory: each row is copied from `packages/config/<id>.json`
// `_meta.network` (name + explorer), and `test/chainFacts.test.ts` re-reads those files and fails when
// a row drifts. A chain id that is not in this table is printed as `chain <id>` — a number the node
// answered, never a name somebody guessed.

export interface NetworkIdentity {
  name: string;
  explorer: string | null;
}

export const KNOWN_NETWORKS: Readonly<Record<number, NetworkIdentity>> = {
  4663: { name: "Robinhood Chain mainnet", explorer: "https://robinhoodchain.blockscout.com" },
  46630: { name: "Robinhood Chain testnet", explorer: "https://testnet.robinhoodchain.com" },
};

export function networkIdentity(chainId: number): NetworkIdentity | null {
  return KNOWN_NETWORKS[chainId] ?? null;
}

/** A label that is defensible for any id: the configured name, else `chain <id>`. */
export function chainLabel(chainId: number): string {
  return networkIdentity(chainId)?.name ?? `chain ${chainId}`;
}
