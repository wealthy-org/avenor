// Decoding of the handful of vault events the indexer persists.
//
// Topic hashes are literals rather than computed at runtime: computing keccak would mean a
// dependency for four constants, and a hash mismatch should be a compile-time-looking diff in
// review, not a silently different function call.
//
// Every `uint256` becomes a `bigint` and is written to Postgres as a decimal string; the schema
// column is `numeric(78,0)`. No number passes through `Number`.

import type { RpcLog } from "./rpc.ts";

export const TOPIC = {
  Transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  StrategyReported: "0x7f2ad1d3ba35276f35ef140f83e3e0f17b23064fd710113d3f7a5ab30d267811",
  StrategyChanged: "0xde8ff765a5c5dad48d27bc9faa99836fb81f3b07c9dc62cfe005475d6b83a2ca",
  RoleSet: "0x78557646b1d8efa2cd49740d66df5aca39eb610ca8ca0e1ccac08979b6b2c46e",
  UpdateAccountant: "0x28709a2dab2a5d5e8688e96159011151c51644ab21839a8a45b449634d7c8b2b",
  UpdateDepositLimit: "0xae565aab888bca5e19e25a13db7b0c9144305bf55cb0f3f4d724f730e5acdd62",
  UpdatePaused: "0x7fa27d7f6d2cf4f6e68295e7649c501659d7567bce48200bfb4361b95a7f135d",
  Shutdown: "0x4426aa1fb73e391071491fcfe21a88b5c38a0a0333a1f6e77161470439704cf8",
} as const;

export interface DecodedTransfer {
  from: string;
  to: string;
  shares: bigint;
}

export interface DecodedReport {
  strategy: string;
  gain: bigint;
  loss: bigint;
  currentDebt: bigint;
  protocolFees: bigint;
  totalFees: bigint;
  totalRefunds: bigint;
}

export interface DecodedStrategyChange {
  strategy: string;
  changeType: number;
}

export interface DecodedRoleSet {
  account: string;
  bitmap: bigint;
}

export function topic0(log: RpcLog): string {
  return (log.topics[0] ?? "").toLowerCase();
}

/** `0x`-prefixed data is a sequence of 32-byte words; word `i` starts at byte `32*i`. */
export function word(data: string, index: number): bigint {
  const start = 2 + index * 64;
  const slice = data.slice(start, start + 64);
  if (slice.length !== 64) throw new Error(`log data has no word ${index} (data length ${data.length})`);
  return BigInt(`0x${slice}`);
}

export function addressFromTopic(topic: string): string {
  if (topic.length !== 66) throw new Error(`topic is not 32 bytes: ${topic}`);
  return `0x${topic.slice(26).toLowerCase()}`;
}

export function tryDecodeTransfer(log: RpcLog): DecodedTransfer | null {
  if (topic0(log) !== TOPIC.Transfer) return null;
  if (log.topics.length !== 3) return null;
  return {
    from: addressFromTopic(log.topics[1]!),
    to: addressFromTopic(log.topics[2]!),
    shares: word(log.data, 0),
  };
}

export function tryDecodeReport(log: RpcLog): DecodedReport | null {
  if (topic0(log) !== TOPIC.StrategyReported) return null;
  if (log.topics.length !== 2) return null;
  return {
    strategy: addressFromTopic(log.topics[1]!),
    gain: word(log.data, 0),
    loss: word(log.data, 1),
    currentDebt: word(log.data, 2),
    protocolFees: word(log.data, 3),
    totalFees: word(log.data, 4),
    totalRefunds: word(log.data, 5),
  };
}

export function tryDecodeStrategyChange(log: RpcLog): DecodedStrategyChange | null {
  if (topic0(log) !== TOPIC.StrategyChanged) return null;
  if (log.topics.length !== 3) return null;
  return {
    strategy: addressFromTopic(log.topics[1]!),
    // `StrategyChangeType` in VaultV3.vy: ADDED = 0, REVOKED = 1.
    changeType: Number(BigInt(log.topics[2]!)),
  };
}

export function tryDecodeRoleSet(log: RpcLog): DecodedRoleSet | null {
  if (topic0(log) !== TOPIC.RoleSet) return null;
  if (log.topics.length !== 3) return null;
  return {
    account: addressFromTopic(log.topics[1]!),
    bitmap: BigInt(log.topics[2]!),
  };
}

/** Bits set in `next` but not `previous`, and vice versa. Used to turn a bitmap into role events. */
export function roleBitDiff(previous: bigint, next: bigint): Array<{ bit: number; granted: boolean }> {
  const changes: Array<{ bit: number; granted: boolean }> = [];
  for (let bit = 0; bit < 256; bit += 1) {
    const mask = 1n << BigInt(bit);
    const before = (previous & mask) !== 0n;
    const after = (next & mask) !== 0n;
    if (before !== after) changes.push({ bit, granted: after });
  }
  return changes;
}