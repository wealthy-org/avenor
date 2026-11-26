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
import { prepareApprove, prepareDeposit, previewDeposit, SlippageExceededError, vaultV3Abi } from "@avenor/sdk";

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
  | "quote_expired"
  | "slippage_exceeded"
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
  if (trimmed === "") throw new DepositError("invalid_amount", "Enter an amount first.");
  if (/[,\s]/.test(trimmed)) throw new DepositError("invalid_amount", "Use a period as the decimal separator, with no spaces.");
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === ".") {
    throw new DepositError("invalid_amount", "The amount may only contain digits and one decimal point.");
  }
  const fraction = trimmed.split(".")[1] ?? "";
  if (fraction.length > decimals) {
    throw new DepositError("invalid_amount", `USDG has ${decimals} decimals; do not enter more than that.`);
  }
  if (trimmed.startsWith("0") && trimmed !== "0" && !trimmed.startsWith("0.")) {
    throw new DepositError("invalid_amount", "Invalid amount: leading zero.");
  }
  const amount = parseUnits(trimmed, decimals);
  if (amount <= 0n) throw new DepositError("invalid_amount", "The amount must be greater than zero.");
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
    blockers.push({ code: "shutdown", message: "The vault is shut down: deposits are closed permanently, withdrawals stay open." });
  }
  if (input.gate.isPaused) {
    blockers.push({
      code: "paused",
      message: "The vault is paused. `setPaused` blocks deposits and withdrawals until it is unpaused.",
    });
  }
  if (input.gate.depositLimit === 0n) {
    blockers.push({
      code: "deposit_closed",
      message: "`deposit_limit` = 0: deposits are closed. This is the correct way to close deposits, not `setPaused`.",
    });
  }
  if (input.maxAssets === 0n && input.gate.depositLimit > 0n) {
    blockers.push({
      code: "cap_full",
      message: "This account has reached its deposit capacity (maxDeposit = 0).",
    });
  }
  if (input.maxAssets > 0n && input.assets > input.maxAssets) {
    blockers.push({
      code: "exceeds_cap",
      message: `The amount exceeds the current deposit capacity (maxDeposit = ${input.maxAssets.toString()}).`,
    });
  }
  if (input.assets > input.balance) {
    blockers.push({
      code: "insufficient_balance",
      message: "This account does not hold enough USDG for that amount.",
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
  /** Minimum shares expected with 50 bps (0.5%) default slippage protection (Brief §9). */
  minShares: bigint;
  /** Milliseconds timestamp when the quote was computed. */
  quoteTimestamp: number;
  maxAssets: bigint;
  allowance: bigint;
  balance: bigint;
  gate: VaultGate;
}

/** One block for every number in the form: a quote that mixes blocks is a quote for nothing. */
export async function quoteDeposit(
  client: ChainClient,
  params: { vault: Address; asset: Address; account: Address; assets: bigint; blockNumber?: bigint; slippageBps?: number },
): Promise<DepositQuote> {
  const blockNumber = params.blockNumber ?? (await client.getBlockNumber());
  const slippageBps = BigInt(params.slippageBps ?? 50); // 0.50% default slippage
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
    const minShares = (preview.shares * (10_000n - slippageBps)) / 10_000n;
    return {
      blockNumber,
      assets: params.assets,
      shares: preview.shares,
      minShares,
      quoteTimestamp: Date.now(),
      maxAssets: preview.maxAssets,
      allowance,
      balance,
      gate: { depositLimit, isPaused, isShutdown },
    };
  } catch (error) {
    throw new DepositError(
      "rpc",
      "The deposit numbers could not be read from the chain. The share amount is not guessed.",
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
  maxQuoteAgeMs?: number;
}

/**
 * Approve (only when the allowance is short) and deposit. Each transaction is simulated first, and
 * the receipt is decoded: a receipt without a `Deposit` event is an error, not a zero.
 */
export async function submitDeposit(params: SubmitParams): Promise<DepositReceipt> {
  const maxAge = params.maxQuoteAgeMs ?? 60_000;
  if (params.quote.quoteTimestamp && Date.now() - params.quote.quoteTimestamp > maxAge) {
    throw new DepositError(
      "quote_expired",
      "The deposit quote has expired (older than 60s). Please recalculate shares to ensure accurate execution.",
    );
  }

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
      throw new DepositError("reverted", "The approval transaction failed on chain.", approveTx);
    }
  }

  let prepared;
  try {
    prepared = await prepareDeposit(asSdkClient(params.client), {
      vault: params.vault,
      account: params.signer.account,
      assets: params.assets,
      receiver: params.receiver,
      minShares: params.quote.minShares,
    });
  } catch (error) {
    if (error instanceof SlippageExceededError) {
      throw new DepositError("slippage_exceeded", error.message);
    }
    throw error;
  }
  const depositTx = await params.signer.sendTransaction(prepared.request);
  const receipt = await params.client.waitForTransactionReceipt({ hash: depositTx });
  if (receipt.status !== "success") {
    throw new DepositError("reverted", "The deposit transaction failed on chain.", depositTx);
  }

  const event = readDepositEvent(receipt.logs, params.vault);
  if (event === null) {
    throw new DepositError(
      "no_event",
      "The receipt succeeded but carries no Deposit event, so the share amount is not proven.",
      depositTx,
    );
  }

  if (params.quote.minShares !== undefined && event.shares < params.quote.minShares) {
    throw new DepositError(
      "slippage_exceeded",
      `Received ${event.shares} shares, below minimum threshold ${params.quote.minShares}.`,
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