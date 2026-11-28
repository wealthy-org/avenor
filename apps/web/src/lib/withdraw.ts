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
  | "quote_expired"
  | "slippage_exceeded"
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

/**
 * Parse a share amount with the vault's own share decimals.
 *
 * `decimals` has no default on purpose: `VaultV3.decimals()` is `asset.decimals()`, so a USDG vault has
 * 6-decimal shares while a venue share token can have 18. A defaulted 18 would accept an input the vault
 * cannot represent, and would have silently scaled every amount by 10^12.
 */
export function parseShareInput(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (trimmed === "") throw new WithdrawError("invalid_amount", "Enter a share amount first.");
  if (/[,\s]/.test(trimmed)) throw new WithdrawError("invalid_amount", "Use a decimal period, with no spaces.");
  if (!/^\d*(\.\d*)?$/.test(trimmed) || trimmed === ".") {
    throw new WithdrawError("invalid_amount", "The amount may only contain digits and one decimal point.");
  }
  const fraction = trimmed.split(".")[1] ?? "";
  if (fraction.length > decimals) {
    throw new WithdrawError("invalid_amount", `Shares have ${decimals} decimals; do not enter more than that.`);
  }
  if (trimmed.startsWith("0") && trimmed !== "0" && !trimmed.startsWith("0.")) {
    throw new WithdrawError("invalid_amount", "Invalid amount: leading zero.");
  }
  const amount = parseUnits(trimmed, decimals);
  if (amount <= 0n) throw new WithdrawError("invalid_amount", "The amount must be greater than zero.");
  return amount;
}

export function parseLossBps(value: string | number): number {
  const bps = typeof value === "number" ? value : Number(value.trim());
  if (typeof value === "string" && value.trim() === "") {
    throw new WithdrawError("invalid_loss_limit", "The loss tolerance is empty.");
  }
  if (!Number.isInteger(bps) || bps < 0 || bps >= MAX_LOSS_BPS) {
    throw new WithdrawError(
      "invalid_loss_limit",
      `The loss tolerance must be 0..${MAX_LOSS_BPS - 1} bps. ${MAX_LOSS_BPS} bps means accepting the loss of the entire position.`,
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
  /** Milliseconds timestamp when the quote was computed; `submitWithdraw` refuses stale quotes. */
  quoteTimestamp?: number;
  /** Slippage tolerance the quote was taken with; the receipt is checked against it. */
  slippageBps?: number;
}

export interface WithdrawInputs {
  mode: WithdrawMode;
  requested: bigint;
  assets: bigint;
  shares: bigint;
  maxAssets: bigint;
  maxShares: bigint;
  shareBalance: bigint;
  /**
   * Whether the vault is confirmed paused. This field is always a narrowed `boolean`, never `null`:
   * callers must resolve `isPaused === true` before populating this interface. Keeping it `boolean`
   * here (not `boolean | null`) ensures `withdrawBlockers` can rely on a definite gate state.
   */
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
      message: "The vault is paused: `withdraw` and `redeem` revert while paused (VaultV3 `assert not self.paused`).",
    });
  }
  if (input.maxLossBps < 0 || input.maxLossBps >= MAX_LOSS_BPS) {
    blockers.push({
      code: "invalid_loss_limit",
      message: `The loss tolerance ${input.maxLossBps} bps is outside 0..${MAX_LOSS_BPS - 1}.`,
    });
  }
  if (input.mode === "assets" && input.requested > input.maxAssets) {
    blockers.push({
      code: "exceeds_max",
      message: "The amount exceeds the vault `maxWithdraw` at this block: liquidity is not available now.",
    });
  }
  if (input.mode === "shares" && input.requested > input.maxShares) {
    blockers.push({
      code: "exceeds_max",
      message: "The share amount exceeds the vault `maxRedeem` at this block: liquidity is not available now.",
    });
  }
  if (input.shares > input.shareBalance) {
    blockers.push({ code: "insufficient_shares", message: "The requested shares exceed your share balance." });
  }
  if (input.maxAssets === 0n && input.maxShares === 0n) {
    blockers.push({
      code: "nothing_to_withdraw",
      message: "Nothing can be withdrawn right now: `maxWithdraw` and `maxRedeem` are both zero.",
    });
  }
  return blockers;
}

export async function quoteWithdraw(
  client: ChainClient,
  params: { vault: Address; account: Address; mode: WithdrawMode; amount: bigint; maxLossBps: number; slippageBps?: number; blockNumber?: bigint },
): Promise<WithdrawQuote> {
  try {
    const blockNumber = params.blockNumber ?? (await client.getBlockNumber());
    const maxLossBps = parseLossBps(params.maxLossBps);
    const slippageRaw = params.slippageBps ?? 50;
    if (!Number.isInteger(slippageRaw) || slippageRaw < 0 || slippageRaw > 10_000) {
      throw new WithdrawError("invalid_amount", `The slippage tolerance must be an integer 0..10,000 bps, not ${slippageRaw}.`);
    }
    const slippageBps = slippageRaw;

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
      quoteTimestamp: Date.now(),
      slippageBps,
    };
  } catch (error) {
    if (error instanceof WithdrawError) throw error;
    throw new WithdrawError("rpc", "The vault could not be read over RPC. No number is guessed.", error instanceof Error ? error.message : String(error));
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
  maxQuoteAgeMs?: number;
}

export async function submitWithdraw(params: SubmitWithdrawParams): Promise<WithdrawReceipt> {
  // The quote is a price from one block. Sitting on it lets the vault's price move between what the
  // user approved on screen and what the chain pays out — the withdraw-side mirror of `quote_expired`.
  const maxAge = params.maxQuoteAgeMs ?? 60_000;
  if (params.quote.quoteTimestamp !== undefined && Date.now() - params.quote.quoteTimestamp > maxAge) {
    throw new WithdrawError(
      "quote_expired",
      "The withdrawal quote has expired (older than 60s). Recalculate before signing so the numbers match the chain.",
    );
  }

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
    throw new WithdrawError("reverted", "The withdrawal transaction failed on chain.", withdrawTx);
  }
  const event = readWithdrawEvent(receipt.logs, params.vault);
  if (event === null) {
    throw new WithdrawError(
      "no_event",
      "The receipt succeeded but carries no Withdraw event, so the asset amount is not proven.",
      withdrawTx,
    );
  }
  // Post-settlement slippage check: the vault has no `minAssetsOut` parameter (its guard is
  // `max_loss`), so the tolerance is enforced here, after the fact, and surfaced as an error the
  // user must see rather than a quietly worse fill.
  const slippageBps = BigInt(params.quote.slippageBps ?? 50);
  const expectedFloor = (params.quote.assets * (10_000n - slippageBps)) / 10_000n;
  if (event.assets < expectedFloor) {
    throw new WithdrawError(
      "slippage_exceeded",
      `Received ${event.assets} assets, below the ${slippageBps} bps floor ${expectedFloor} quoted at block ${params.quote.blockNumber}.`,
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

export type WithdrawWarningCase = "W3" | "W6" | "W7" | "idle";

export interface WithdrawWarning {
  /** The case in `docs/WITHDRAWAL_SEMANTICS.md` this sentence exists for. */
  case: WithdrawWarningCase;
  message: string;
}

/**
 * Copy the user must see before signing. Kept out of the component so the sentences can be tested:
 * a warning that only exists in JSX is a warning nobody verifies.
 */
export function withdrawWarnings(
  quote: WithdrawQuote,
  state: { isPaused: boolean | null; isShutdown: boolean },
): WithdrawWarning[] {
  const warnings: WithdrawWarning[] = [];
  if (state.isPaused === true) {
    warnings.push({
      case: "W6",
      message:
        "The vault is paused: `withdraw` and `redeem` revert (`assert not self.paused`) and `maxWithdraw` is 0 as well. Wait for an unpause instead of resending the transaction.",
    });
  }
  if (state.isShutdown) {
    warnings.push({
      case: "W7",
      message: "The vault is shut down: deposits are closed permanently, but withdrawals still work while it is not paused.",
    });
  }
  if (quote.positionAssets > quote.maxAssets) {
    warnings.push({
      case: "W3",
      message:
        "Position value is larger than what can be withdrawn now. A full exit will fail; `redeem` may fill partially within your loss tolerance.",
    });
  }
  // W4 (max_loss = 10,000) has no warning here on purpose: `parseLossBps` refuses that value before
  // a quote can exist, so this function can never see it. The form surfaces the refusal directly.
  if (quote.assets > quote.totalIdle) {
    warnings.push({
      case: "idle",
      message: "Part of the capital has to be recalled from a strategy; idle cash does not cover this request.",
    });
  }
  return warnings;
}

/** Loss the caller's own budget would allow, in asset units. Shown next to the input. */
export function maxLossAssets(quote: WithdrawQuote): bigint {
  return (quote.assets * BigInt(quote.maxLossBps)) / BigInt(MAX_LOSS_BPS);
}