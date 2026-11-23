// Presentational primitives, written with `createElement` instead of JSX on purpose: this repo has no
// build step for its TypeScript, and Node's type stripping cannot parse JSX. Keeping components as
// `.ts` means `node --test` can render them with `react-dom/server` and assert the real markup —
// the snapshot test the ticket asks for, without adding Storybook as a second runtime.

import { createElement } from "react";
import { blockTime, money, percentBps, shares as formatShares, shortAddress } from "../lib/format.ts";

export interface AmountProps {
  value: bigint;
  kind: "usdg" | "shares";
  /**
   * Decimals of the token being printed. Required for shares: share decimals come from the vault's
   * `decimals()` (6 for a USDG `VaultV3`), and a hard-coded 18 would be wrong by 10^12.
   */
  decimals?: number;
  /** Print every decimal instead of the display precision. */
  full?: boolean;
  /** Optional unit suffix; "USDG" for money, omitted for shares. */
  suffix?: string;
}

/** Renders a `bigint`. Does no arithmetic: formatting lives in `src/lib/format.ts`. */
export function Amount({ value, kind, decimals, full = false, suffix }: AmountProps) {
  if (kind === "shares" && decimals === undefined) {
    throw new Error("Amount of kind \"shares\" needs the share decimals read from the vault");
  }
  const digits = kind === "usdg" ? 6 : (decimals as number);
  const text = kind === "usdg" ? money(value, { full }) : formatShares(value, digits, { full });
  const exact = kind === "usdg" ? money(value, { full: true }) : formatShares(value, digits, { full: true });
  const unit = suffix ?? (kind === "usdg" ? "USDG" : undefined);
  return createElement(
    "span",
    { className: "money", title: unit === undefined ? exact : `${exact} ${unit}` },
    text,
    unit === undefined ? null : ` ${unit}`,
  );
}

export type Source = "indexed" | "onchain" | "captured";

export interface BlockProvenanceProps {
  blockNumber: string;
  blockTimestamp: string;
  source: Source;
}

const SOURCE_LABEL: Record<Source, string> = {
  indexed: "indexer row (can move if there is a reorg)",
  onchain: "read directly from the node at this block",
  captured: "recorded from this block earlier; the node was not reachable for this render",
};

export function BlockProvenance({ blockNumber, blockTimestamp, source }: BlockProvenanceProps) {
  if (!/^\d+$/.test(blockNumber)) throw new Error(`blockNumber "${blockNumber}" is not a decimal string`);
  const label = SOURCE_LABEL[source];
  if (label === undefined) throw new Error(`unknown source "${String(source)}"`);
  return createElement(
    "p",
    { className: "provenance" },
    `Block ${blockNumber} · ${blockTime(blockTimestamp)} UTC · ${label}`,
  );
}

export type StatusTone = "neutral" | "ok" | "warn" | "danger";

const TONE_PREFIX: Record<StatusTone, string> = {
  neutral: "•",
  ok: "✓",
  warn: "!",
  danger: "×",
};

export function StatusPill({ tone, text }: { tone: StatusTone; text: string }) {
  const prefix = TONE_PREFIX[tone];
  if (prefix === undefined) throw new Error(`unknown status tone "${String(tone)}"`);
  // The glyph carries the meaning so the pill still reads without colour.
  return createElement(
    "span",
    { className: "pill" },
    createElement("span", { "aria-hidden": "true" }, `${prefix} `),
    text,
  );
}

const KNOWN: Record<string, string> = {
  invalid_address: "That is not a valid address.",
  unknown_vault: "This vault is not indexed yet, so its numbers cannot be shown.",
  no_snapshot: "No snapshot exists for this vault at any block yet.",
  no_position: "This address holds no position in the vault.",
  missing_account: "Connect a wallet to view a position.",
  invalid_limit: "The list parameter is not valid.",
  invalid_block: "The block number is not valid.",
  not_found: "Unknown API address.",
  method_not_allowed: "That request method is not supported.",
  no_rpc: "The API has no node access, so on-chain numbers are unavailable.",
  api_unreachable: "The API is unreachable. No number is shown rather than a stale one.",
  webhook_error: "Alert delivery failed.",
};

export interface ErrorStateProps {
  code: string;
  /** Server text, shown verbatim; never replaced by a friendlier guess. */
  message?: string;
}

export function ErrorState({ code, message }: ErrorStateProps) {
  const known = KNOWN[code];
  return createElement(
    "div",
    { className: "banner", "data-tone": "danger", role: "alert" },
    createElement("strong", null, known ?? "Something went wrong."),
    message === undefined ? null : createElement("p", null, message),
    known === undefined
      ? createElement("p", null, `Unrecognised code: ${code}. The server message is shown verbatim.`)
      : null,
  );
}

/**
 * A short address with the full one on hover. Not a link by default: this chain's block explorer is
 * not part of the pinned baseline, and inventing an explorer URL is how a UI sends people to a
 * lookalike. Pass `href` only when the explorer is known and configured.
 */
export function AddressText({ address, href }: { address: string; href?: string }) {
  const label = shortAddress(address);
  if (href === undefined) {
    return createElement("span", { className: "money", title: address }, label);
  }
  return createElement("a", { className: "money", href, title: address }, label);
}

export function Percent({ bps }: { bps: number }) {
  return createElement("span", { className: "money" }, percentBps(bps));
}