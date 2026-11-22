// Deposit flow, kept out of the React component so it can be tested with a scripted node.
//
// Three refusals shape this file:
//   1. No silent default cap: `maxDeposit` and `deposit_limit` are read and the form says which one
//      blocked the deposit (paused, shutdown, cap 0, amount over cap, balance).
//   2. No optimistic number: the shares shown after submission come from the `Deposit` event in the
//      receipt, never from the quote taken before the signature.
//   3. No float: the input is parsed to `bigint` with `parseUnits`, and a comma, exponent, sign, or
//      more decimals than the asset has is an error rather than a rounded amount.

import { createPublicClient, erc20Abi, decodeEventLog, parseUnits, type Address, type Hex } from "viem";

/** Exactly what `createPublicClient` returns, so tests and the app pass the same type. */
export type ChainClient = ReturnType<typeof createPublicClient>;
import { prepareApprove, prepareDeposit, previewDeposit, vaultV3Abi } from "@avenor/sdk";

/**
 * `@avenor/sdk` resolves its own `viem` install (`file:` dependency), so its `PublicClient` type is a
 * different nominal type from the app's even though both are viem 2.58.4. Cast at this one boundary
 * instead of pinning two copies of viem to the same path.
 */
type SdkClient = Parameters<typeof prepareDeposit>[0];
const asSdkClient = (client: ChainClient): SdkClient => client as unknown as SdkClient;

export type DepositErrorCode =
  | "invalid_amount"
  | "insufficient_balance"
  | "paused"
  | "shutdown"
  | "deposit_closed"
  | "cap_full"
  | "exceeds_cap"
  | "reverted"
  | "no_event"
  | "rpc";

export class DepositError extends Error {
  code: DepositErrorCode;
  detail: string | null;

  constructor(code: DepositErrorCode, message: string, detail: string | null = null) {
    super(message);
    this.name = "DepositError";
    this.code = code;
    this.detail = detail;
  }
}

/** USDG has 6 decimals; the parameter exists so a different asset cannot silently reuse this parser. */
export function parseAssetInput(value: string, decimals = 6): bigint {
  const trimmed = value.trim();
  if (trimmed === "") throw new DepositError("invalid_amount", "Jumlah belum diisi.");
  if (/[,\s]/.test(trimmed)) throw new DepositError("invalid_amount", "Gunakan titik sebagai pemisah desimal, tanpa spasi.");
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === ".") {
    throw new DepositError("invalid_amount", "Jumlah hanya boleh angka dan satu titik desimal.");
  }
  const fraction = trimmed.split(".")[1] ?? "";
  if (fraction.length > decimals) {
    throw new DepositError("invalid_amount", `USDG hanya punya ${decimals} desimal; jangan masukkan lebih dari itu.`);
  }
  if (trimmed.startsWith("0") && trimmed !== "0" && !trimmed.startsWith("0.")) {
    throw new DepositError("invalid_amount", "Jumlah tidak valid: nol di depan.");
  }
  const amount = parseUnits(trimmed, decimals);
  if (amount <= 0n) throw new DepositError("invalid_amount", "Jumlah harus lebih besar dari nol.");
  return amount;
}

export interface VaultGate {
  depositLimit: bigint;
  isPaused: boolean;
  isShutdown: boolean;
}

export interface DepositInputs {
  assets: bigint;
  /** `maxDeposit(account)`: the vault's own answer, including any deposit hook in force. */
  maxAssets: bigint;
  /** Asset balance of the depositor. */
  balance: bigint;
  gate: VaultGate;
}

export interface Blocker {
  code: DepositErrorCode;
  message: string;
}

/**
 * Every reason this deposit cannot go through, in the order a user should read them. An empty list
 * is the only state in which the submit button may be enabled.
 */
export function depositBlockers(input: DepositInputs): Blocker[] {
  const blockers: Blocker[] = [];
  if (input.gate.isShutdown) {
    blockers.push({ code: "shutdown", message: "Vault sudah shutdown: deposit ditutup permanen, penarikan tetap terbuka." });
  }
  if (input.gate.isPaused) {
    blockers.push({
      code: "paused",
      message: "Vault dijeda. `setPaused` memblokir deposit dan juga penarikan sampai tidak dijeda lagi.",
    });
  }
  if (input.gate.depositLimit === 0n) {
    blockers.push({
      code: "deposit_closed",
      message: "`deposit_limit` = 0: deposit ditutup. Ini cara yang benar untuk menutup deposit, bukan `setPaused`.",
    });
  }
  if (input.maxAssets === 0n && input.gate.depositLimit > 0n) {
    blockers.push({
      code: "cap_full",
      message: "Kapasitas deposit untuk akun ini sudah penuh (maxDeposit = 0).",
    });
  }
  if (input.maxAssets > 0n && input.assets > input.maxAssets) {
    blockers.push({
      code: "exceeds_cap",
      message: `Jumlah melebihi kapasitas deposit sekarang (maxDeposit = ${input.maxAssets.toString()}).`,
    });
  }
  if (input.assets > input.balance) {
    blockers.push({
      code: "insufficient_balance",
      message: "Saldo USDG akun ini tidak cukup untuk jumlah tersebut.",
    });
  }
  return blockers;
}

export function needsApproval(allowance: bigint, assets: bigint): boolean {
  return allowance < assets;
}

export interface DepositQuote {
  blockNumber: bigint;
  assets: bigint;
  shares: bigint;
  maxAssets: bigint;
  allowance: bigint;
  balance: bigint;
  gate: VaultGate;
}

/** One block for every number in the form: a quote that mixes blocks is a quote for nothing. */
export async function quoteDeposit(
  client: ChainClient,
  params: { vault: Address; asset: Address; account: Address; assets: bigint; blockNumber?: bigint },
): Promise<DepositQuote> {
  const blockNumber = params.blockNumber ?? (await client.getBlockNumber());
  try {
    const [preview, allowance, balance, depositLimit, isPaused, isShutdown] = await Promise.all([
      previewDeposit(asSdkClient(client), params.vault, params.assets, params.account, blockNumber),
      client.readContract({
        address: params.asset,
        abi: erc20Abi,
        functionName: "allowance",
        args: [params.account, params.vault],
        blockNumber,
      }),
      client.readContract({
        address: params.asset,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [params.account],
        blockNumber,
      }),
      client.readContract({ address: params.vault, abi: vaultV3Abi, functionName: "deposit_limit", blockNumber }),
      client.readContract({ address: params.vault, abi: vaultV3Abi, functionName: "isPaused", blockNumber }),
      client.readContract({ address: params.vault, abi: vaultV3Abi, functionName: "isShutdown", blockNumber }),
    ]);
    return {
      blockNumber,
      assets: params.assets,
      shares: preview.shares,
      maxAssets: preview.maxAssets,
      allowance,
      balance,
      gate: { depositLimit, isPaused, isShutdown },
    };
  } catch (error) {
    throw new DepositError(
      "rpc",
      "Angka deposit tidak dapat dibaca dari chain. Jangan menebak jumlah share.",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** The subset of a viem `WalletClient` this module needs, so tests can pass a scripted signer. */
export interface Signer {
  account: Address;
  sendTransaction(request: unknown): Promise<Hex>;
}

export interface DepositReceipt {
  approveTx: Hex | null;
  depositTx: Hex;
  assets: bigint;
  /** Decoded from the `Deposit` event, not from the quote. */
  shares: bigint;
  owner: Address;
  blockNumber: bigint;
}

export interface SubmitParams {
  client: ChainClient;
  signer: Signer;
  vault: Address;
  asset: Address;
  assets: bigint;
  receiver: Address;
  quote: DepositQuote;
}

/**
 * Approve (only when the allowance is short) and deposit. Each transaction is simulated first, and
 * the receipt is decoded: a receipt without a `Deposit` event is an error, not a zero.
 */
export async function submitDeposit(params: SubmitParams): Promise<DepositReceipt> {
  const blockers = depositBlockers({
    assets: params.assets,
    maxAssets: params.quote.maxAssets,
    balance: params.quote.balance,
    gate: params.quote.gate,
  });
  if (blockers.length > 0) throw new DepositError(blockers[0].code, blockers[0].message);

  let approveTx: Hex | null = null;
  if (needsApproval(params.quote.allowance, params.assets)) {
    // Exactly the deposit amount: no unlimited approval, no allowance left for a later transfer.
    const preparedApprove = await prepareApprove(asSdkClient(params.client), {
      vault: params.vault,
      account: params.signer.account,
      token: params.asset,
      spender: params.vault,
      amount: params.assets,
    });
    approveTx = await params.signer.sendTransaction(preparedApprove.request);
    const approveReceipt = await params.client.waitForTransactionReceipt({ hash: approveTx });
    if (approveReceipt.status !== "success") {
      throw new DepositError("reverted", "Transaksi approve gagal di chain.", approveTx);
    }
  }

  const prepared = await prepareDeposit(asSdkClient(params.client), {
    vault: params.vault,
    account: params.signer.account,
    assets: params.assets,
    receiver: params.receiver,
  });
  const depositTx = await params.signer.sendTransaction(prepared.request);
  const receipt = await params.client.waitForTransactionReceipt({ hash: depositTx });
  if (receipt.status !== "success") {
    throw new DepositError("reverted", "Transaksi deposit gagal di chain.", depositTx);
  }

  const event = readDepositEvent(receipt.logs, params.vault);
  if (event === null) {
    throw new DepositError(
      "no_event",
      "Receipt sukses tetapi tidak memuat event Deposit. Jumlah share tidak dapat dipastikan.",
      depositTx,
    );
  }
  return {
    approveTx,
    depositTx,
    assets: event.assets,
    shares: event.shares,
    owner: event.owner,
    blockNumber: receipt.blockNumber,
  };
}

export function readDepositEvent(
  logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[],
  vault: Address,
): { owner: Address; assets: bigint; shares: bigint } | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== vault.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi: vaultV3Abi, eventName: "Deposit", data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      const args = decoded.args as { sender: Address; owner: Address; assets: bigint; shares: bigint };
      return { owner: args.owner, assets: args.assets, shares: args.shares };
    } catch {
      // Not a Deposit event; keep looking rather than assuming the first log is ours.
    }
  }
  return null;
}