// Withdraw and redeem. The two calls take different defaults on chain (`withdraw` = 0, `redeem` =
// 10_000), and a silent default is exactly the trap this file exists to close: the loss budget is
// always explicit, is displayed before signing, and is refused when it is not a real bound.

import {
  decodeEventLog,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { prepareRedeem, prepareWithdraw, previewRedeem, previewWithdraw, vaultV3Abi } from "@avenor/sdk";
import { shareBps } from "./vaultView.ts";
import type { Signer, ChainClient } from "./deposit.ts";

/** Same nominal-type boundary as `deposit.ts`: the SDK resolves its own viem install. */
type SdkClient = Parameters<typeof prepareWithdraw>[0];
const asSdkClient = (client: ChainClient): SdkClient => client as unknown as SdkClient;

export const MAX_LOSS_BPS = 10_000;

export type WithdrawErrorCode =
  | "invalid_amount"
  | "invalid_loss_limit"
  | "insufficient_shares"
  | "exceeds_max"
  | "nothing_to_withdraw"
  | "paused"
  | "reverted"
  | "no_event"
  | "rpc";

export class WithdrawError extends Error {
  readonly code: WithdrawErrorCode;
  readonly detail: string | null;

  constructor(code: WithdrawErrorCode, message: string, detail: string | null = null) {
    super(message);
    this.name = "WithdrawError";
    this.code = code;
    this.detail = detail;
  }
}

export type WithdrawMode = "assets" | "shares";

/** Share input has 18 decimals; the asset input below has 6. Refusing early beats rounding. */
export function parseShareInput(value: string, decimals = 18): bigint {
  const trimmed = value.trim();
  if (trimmed === "") throw new WithdrawError("invalid_amount", "Jumlah share belum diisi.");
  if (/[,\s]/.test(trimmed)) throw new WithdrawError("invalid_amount", "Gunakan titik desimal, tanpa spasi.");
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === ".") {
    throw new WithdrawError("invalid_amount", "Jumlah hanya boleh angka dan satu titik desimal.");
  }
  const fraction = trimmed.split(".")[1] ?? "";
  if (fraction.length > decimals) {
    throw new WithdrawError("invalid_amount", `Share hanya punya ${decimals} desimal; jangan masukkan lebih dari itu.`);
  }
  if (trimmed.startsWith("0") && trimmed !== "0" && !trimmed.startsWith("0.")) {
    throw new WithdrawError("invalid_amount", "Jumlah tidak valid: nol di depan.");
  }
  const amount = parseUnits(trimmed, decimals);
  if (amount <= 0n) throw new WithdrawError("invalid_amount", "Jumlah harus lebih besar dari nol.");
  return amount;
}

export function parseLossBps(value: string | number): number {
  const bps = typeof value === "number" ? value : Number(value.trim());
  if (typeof value === "string" && value.trim() === "") {
    throw new WithdrawError("invalid_loss_limit", "Toleransi loss belum diisi.");
  }
  if (!Number.isInteger(bps) || bps < 0 || bps >= MAX_LOSS_BPS) {
    throw new WithdrawError(
      "invalid_loss_limit",
      `Toleransi loss harus 0..${MAX_LOSS_BPS - 1} bps. ${MAX_LOSS_BPS} bps berarti menerima kehilangan seluruh nilai.`,
    );
  }
  return bps;
}

export interface WithdrawQuote {
  blockNumber: bigint;
  mode: WithdrawMode;
  /** What the caller asked for: assets in `assets` mode, shares in `shares` mode. */
  requested: bigint;
  assets: bigint;
  shares: bigint;
  /** Vault `maxWithdraw(owner)` at the same block. Not a promise; it moves with venue liquidity. */
  maxAssets: bigint;
  maxShares: bigint;
  shareBalance: bigint;
  /** `totalIdle()`: only this much can be paid without touching a strategy. */
  totalIdle: bigint;
  /** `convertToAssets(balanceOf(owner))`: value of the position, not what can be withdrawn now. */
  positionAssets: bigint;
  maxLossBps: number;
}

export interface WithdrawInputs {
  mode: WithdrawMode;
  requested: bigint;
  assets: bigint;
  shares: bigint;
  maxAssets: bigint;
  maxShares: bigint;
  shareBalance: bigint;
  isPaused: boolean;
  maxLossBps: number;
}

export interface Blocker {
  code: WithdrawErrorCode;
  message: string;
}

export function withdrawBlockers(input: WithdrawInputs): Blocker[] {
  const blockers: Blocker[] = [];
  if (input.isPaused) {
    blockers.push({
      code: "paused",
      message: "Vault dijeda: `withdraw` dan `redeem` revert selama pause (VaultV3 `assert not self.paused`).",
    });
  }
  if (input.maxLossBps < 0 || input.maxLossBps >= MAX_LOSS_BPS) {
    blockers.push({
      code: "invalid_loss_limit",
      message: `Toleransi loss ${input.maxLossBps} bps di luar 0..${MAX_LOSS_BPS - 1}.`,
    });
  }
  if (input.mode === "assets" && input.requested > input.maxAssets) {
    blockers.push({
      code: "exceeds_max",
      message: "Jumlah melebihi `maxWithdraw` vault pada blok ini: likuiditas tidak cukup sekarang.",
    });
  }
  if (input.mode === "shares" && input.requested > input.maxShares) {
    blockers.push({
      code: "exceeds_max",
      message: "Jumlah share melebihi `maxRedeem` vault pada blok ini: likuiditas tidak cukup sekarang.",
    });
  }
  if (input.shares > input.shareBalance) {
    blockers.push({ code: "insufficient_shares", message: "Share yang diminta melebihi saldo share Anda." });
  }
  if (input.maxAssets === 0n && input.maxShares === 0n) {
    blockers.push({
      code: "nothing_to_withdraw",
      message: "Tidak ada yang bisa ditarik sekarang: `maxWithdraw` dan `maxRedeem` sama-sama nol.",
    });
  }
  return blockers;
}

export async function quoteWithdraw(
  client: ChainClient,
  params: { vault: Address; account: Address; mode: WithdrawMode; amount: bigint; maxLossBps: number; blockNumber?: bigint },
): Promise<WithdrawQuote> {
  try {
    const blockNumber = params.blockNumber ?? (await client.getBlockNumber());
    const maxLossBps = parseLossBps(params.maxLossBps);

    // The SDK preview already asks the vault for the ceiling of the mode in use; the other ceiling is
    // the only extra read. Every call is pinned to `blockNumber`.
    const readCeiling = (name: "maxWithdraw" | "maxRedeem") =>
      client.readContract({
        address: params.vault,
        abi: vaultV3Abi,
        functionName: name,
        args: [params.account],
        blockNumber,
      });

    let assets: bigint;
    let shares: bigint;
    let maxAssets: bigint;
    let maxShares: bigint;
    if (params.mode === "assets") {
      const preview = await previewWithdraw(asSdkClient(client), params.vault, params.amount, params.account, blockNumber);
      assets = preview.assets;
      shares = preview.shares;
      maxAssets = preview.maxAssets;
      maxShares = await readCeiling("maxRedeem");
    } else {
      const preview = await previewRedeem(asSdkClient(client), params.vault, params.amount, params.account, blockNumber);
      assets = preview.assets;
      shares = preview.shares;
      maxShares = preview.maxShares;
      maxAssets = await readCeiling("maxWithdraw");
    }

    const [shareBalance, totalIdle] = await Promise.all([
      client.readContract({ address: params.vault, abi: vaultV3Abi, functionName: "balanceOf", args: [params.account], blockNumber }),
      client.readContract({ address: params.vault, abi: vaultV3Abi, functionName: "totalIdle", blockNumber }),
    ]);

    const positionAssets = await client.readContract({
      address: params.vault,
      abi: vaultV3Abi,
      functionName: "convertToAssets",
      args: [shareBalance],
      blockNumber,
    });

    return {
      blockNumber,
      mode: params.mode,
      requested: params.amount,
      assets,
      shares,
      maxAssets,
      maxShares,
      shareBalance,
      totalIdle,
      positionAssets,
      maxLossBps,
    };
  } catch (error) {
    if (error instanceof WithdrawError) throw error;
    throw new WithdrawError("rpc", "Gagal membaca vault dari RPC. Angka tidak ditebak.", error instanceof Error ? error.message : String(error));
  }
}

export interface WithdrawReceipt {
  withdrawTx: Hex;
  /** Both numbers come from the `Withdraw` event in the receipt, never from the quote. */
  assets: bigint;
  shares: bigint;
  receiver: Address;
  owner: Address;
  blockNumber: bigint;
  maxLossBps: number;
}

export interface SubmitWithdrawParams {
  client: ChainClient;
  signer: Signer;
  vault: Address;
  mode: WithdrawMode;
  amount: bigint;
  receiver: Address;
  quote: WithdrawQuote;
  isPaused: boolean;
}

export async function submitWithdraw(params: SubmitWithdrawParams): Promise<WithdrawReceipt> {
  const blockers = withdrawBlockers({
    mode: params.mode,
    requested: params.amount,
    assets: params.quote.assets,
    shares: params.quote.shares,
    maxAssets: params.quote.maxAssets,
    maxShares: params.quote.maxShares,
    shareBalance: params.quote.shareBalance,
    isPaused: params.isPaused,
    maxLossBps: params.quote.maxLossBps,
  });
  if (blockers.length > 0) throw new WithdrawError(blockers[0].code, blockers[0].message);

  const common = { vault: params.vault, account: params.signer.account, receiver: params.receiver, maxLoss: params.quote.maxLossBps };
  const prepared =
    params.mode === "assets"
      ? await prepareWithdraw(asSdkClient(params.client), { ...common, assets: params.amount })
      : await prepareRedeem(asSdkClient(params.client), { ...common, shares: params.amount });

  const withdrawTx = await params.signer.sendTransaction(prepared.request);
  const receipt = await params.client.waitForTransactionReceipt({ hash: withdrawTx });
  if (receipt.status !== "success") {
    throw new WithdrawError("reverted", "Transaksi penarikan gagal di chain.", withdrawTx);
  }
  const event = readWithdrawEvent(receipt.logs, params.vault);
  if (event === null) {
    throw new WithdrawError(
      "no_event",
      "Receipt sukses tetapi tidak memuat event Withdraw. Jumlah aset tidak dapat dipastikan.",
      withdrawTx,
    );
  }
  return {
    withdrawTx,
    assets: event.assets,
    shares: event.shares,
    receiver: event.receiver,
    owner: event.owner,
    blockNumber: receipt.blockNumber,
    maxLossBps: params.quote.maxLossBps,
  };
}

export function readWithdrawEvent(
  logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[],
  vault: Address,
): { receiver: Address; owner: Address; assets: bigint; shares: bigint } | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== vault.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: vaultV3Abi,
        eventName: "Withdraw",
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      const args = decoded.args as { sender: Address; receiver: Address; owner: Address; assets: bigint; shares: bigint };
      return { receiver: args.receiver, owner: args.owner, assets: args.assets, shares: args.shares };
    } catch {
      // Not a Withdraw event; keep looking.
    }
  }
  return null;
}

/** How much of the request can be paid from idle cash alone. Advisory, not a limit. */
export function idleCoverageBps(quote: WithdrawQuote): number {
  if (quote.assets === 0n) return 0;
  return shareBps(quote.totalIdle < quote.assets ? quote.totalIdle : quote.assets, quote.assets);
}

export interface WithdrawWarning {
  /** The case in `docs/WITHDRAWAL_SEMANTICS.md` this sentence exists for. */
  case: "W3" | "W4" | "W6" | "W7" | "idle";
  message: string;
}

/**
 * Copy the user must see before signing. Kept out of the component so the sentences can be tested:
 * a warning that only exists in JSX is a warning nobody verifies.
 */
export function withdrawWarnings(
  quote: WithdrawQuote,
  state: { isPaused: boolean; isShutdown: boolean },
): WithdrawWarning[] {
  const warnings: WithdrawWarning[] = [];
  if (state.isPaused) {
    warnings.push({
      case: "W6",
      message:
        "Vault dijeda: `withdraw` dan `redeem` revert (`assert not self.paused`). `maxWithdraw` juga 0. Menunggu unpause, bukan mengulang transaksi.",
    });
  }
  if (state.isShutdown) {
    warnings.push({
      case: "W7",
      message: "Vault shutdown: deposit tertutup permanen, tetapi penarikan tetap jalan selama tidak dijeda.",
    });
  }
  if (quote.positionAssets > quote.maxAssets) {
    warnings.push({
      case: "W3",
      message:
        "Nilai posisi lebih besar dari yang bisa ditarik sekarang. Penarikan penuh akan gagal; `redeem` bisa parsial sesuai toleransi loss Anda.",
    });
  }
  if (quote.maxLossBps >= MAX_LOSS_BPS) {
    warnings.push({
      case: "W4",
      message: "10000 bps berarti menerima kehilangan seluruh nilai. Nilai itu tidak dikirim.",
    });
  }
  if (quote.assets > quote.totalIdle) {
    warnings.push({
      case: "idle",
      message: "Sebagian dana harus diambil dari strategi; kas idle tidak menutupi permintaan ini.",
    });
  }
  return warnings;
}

/** Loss the caller's own budget would allow, in asset units. Shown next to the input. */
export function maxLossAssets(quote: WithdrawQuote): bigint {
  return (quote.assets * BigInt(quote.maxLossBps)) / BigInt(MAX_LOSS_BPS);
}