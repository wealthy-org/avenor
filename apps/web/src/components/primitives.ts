// Presentational primitives, written with `createElement` instead of JSX on purpose: this repo has no
// build step for its TypeScript, and Node's type stripping cannot parse JSX. Keeping components as
// `.ts` means `node --test` can render them with `react-dom/server` and assert the real markup —
// the snapshot test the ticket asks for, without adding Storybook as a second runtime.

import { createElement } from "react";
import { blockTime, money, percentBps, shares as formatShares, shortAddress } from "../lib/format.ts";

export interface AmountProps {
  value: bigint;
  kind: "usdg" | "shares";
  /** Print every decimal instead of the display precision. */
  full?: boolean;
  /** Optional unit suffix; "USDG" for money, omitted for shares. */
  suffix?: string;
}

/** Renders a `bigint`. Does no arithmetic: formatting lives in `src/lib/format.ts`. */
export function Amount({ value, kind, full = false, suffix }: AmountProps) {
  const text = kind === "usdg" ? money(value, { full }) : formatShares(value, { full });
  const exact = kind === "usdg" ? money(value, { full: true }) : formatShares(value, { full: true });
  const unit = suffix ?? (kind === "usdg" ? "USDG" : undefined);
  return createElement(
    "span",
    { className: "money", title: unit === undefined ? exact : `${exact} ${unit}` },
    text,
    unit === undefined ? null : ` ${unit}`,
  );
}

export type Source = "indexed" | "onchain";

export interface BlockProvenanceProps {
  blockNumber: string;
  blockTimestamp: string;
  source: Source;
}

const SOURCE_LABEL: Record<Source, string> = {
  indexed: "indexer (bisa berubah bila ada reorg)",
  onchain: "dibaca langsung dari node pada blok ini",
};

export function BlockProvenance({ blockNumber, blockTimestamp, source }: BlockProvenanceProps) {
  if (!/^\d+$/.test(blockNumber)) throw new Error(`blockNumber "${blockNumber}" is not a decimal string`);
  const label = SOURCE_LABEL[source];
  if (label === undefined) throw new Error(`unknown source "${String(source)}"`);
  return createElement(
    "p",
    { className: "provenance" },
    `Blok ${blockNumber} · ${blockTime(blockTimestamp)} UTC · ${label}`,
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
  invalid_address: "Alamat tidak valid.",
  unknown_vault: "Vault ini belum terindeks, jadi angkanya belum bisa ditampilkan.",
  no_snapshot: "Belum ada snapshot untuk vault ini pada blok mana pun.",
  no_position: "Alamat ini belum punya posisi di vault.",
  missing_account: "Hubungkan wallet untuk melihat posisi.",
  invalid_limit: "Parameter daftar tidak valid.",
  invalid_block: "Nomor blok tidak valid.",
  not_found: "Alamat API tidak dikenal.",
  method_not_allowed: "Metode permintaan tidak didukung.",
  no_rpc: "API tidak punya akses node, jadi angka on-chain tidak tersedia.",
  api_unreachable: "API tidak bisa dihubungi. Angka tidak ditampilkan daripada ditampilkan basi.",
  webhook_error: "Pengiriman alert gagal.",
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
    createElement("strong", null, known ?? "Terjadi kesalahan."),
    message === undefined ? null : createElement("p", null, message),
    known === undefined
      ? createElement("p", null, `Kode tidak dikenal: ${code}. Pesan server ditampilkan apa adanya.`)
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