// Display-only helpers. Every number that reaches a screen goes through the SDK first: this file
// never does arithmetic on money, it only decides how a `bigint` is spelled.
//
// Two UI rules are encoded here rather than left to each component:
//   * a percentage is always shown with its basis in words (`0,15% dari total aset`), because a bare
//     percentage of an unknown denominator is how APY gets invented;
//   * "value" and "can be withdrawn now" are separate functions with separate names, so a component
//     cannot add them together by accident.

import { formatUnits, SHARE_DECIMALS, USDG_DECIMALS } from "@avenor/sdk";

const ID = "id-ID";

/** 6-decimal asset amount, grouped, 2 decimals unless `full`. Rounds half up, never truncates. */
export function money(value: bigint, options: { full?: boolean } = {}): string {
  return display(value, USDG_DECIMALS, options.full === true ? USDG_DECIMALS : 2);
}

/** Share amounts are 18-decimal and are not money; they never get a currency suffix. */
export function shares(value: bigint, options: { full?: boolean } = {}): string {
  return display(value, SHARE_DECIMALS, options.full === true ? SHARE_DECIMALS : 4);
}

/** Percentage from basis points, without implying what it is a percentage of. */
export function percentBps(bps: number): string {
  if (!Number.isInteger(bps)) throw new Error(`basis points must be an integer, got ${bps}`);
  const sign = bps < 0 ? "-" : "";
  const absolute = Math.abs(bps);
  return `${sign}${(absolute / 100).toFixed(2).replace(".", ",")}%`;
}

/** The sentence that has to sit next to a percentage. The denominator is named, always. */
export function percentOf(bps: number, of: "total-assets" | "shares" | "deposit-limit"): string {
  const label = {
    "total-assets": "dari total aset",
    shares: "dari total share",
    "deposit-limit": "dari batas deposit",
  }[of];
  return `${percentBps(bps)} ${label}`;
}

/** Block timestamp from the API (ISO with Z) as a stable, unambiguous string. */
export function blockTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new Error(`"${iso}" is not an ISO timestamp`);
  return new Intl.DateTimeFormat(ID, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed);
}

export interface LiquiditySplit {
  /** Cash sitting in the vault right now. */
  idle: string;
  /** Position value, including everything that is currently deployed. */
  positionValue: string;
  /** The sentence the UI must show; "dapat ditarik sekarang" is never derived from `idle` alone. */
  note: string;
}

/**
 * `maxWithdraw` is an input here only so the caller cannot pretend it was consulted. The venue
 * answers 0 for a redeemable position at the pin, so this deliberately does not turn it into a
 * "withdrawable" figure: it says what is known and what is not.
 */
export function liquiditySplit(input: { idle: bigint; totalAssets: bigint; maxWithdraw?: bigint }): LiquiditySplit {
  if (input.idle > input.totalAssets) {
    throw new Error("idle cash cannot exceed total assets; the numbers come from different blocks");
  }
  const maxWithdrawNote =
    input.maxWithdraw === undefined
      ? "batas penarikan per akun dihitung saat wallet terhubung"
      : "batas penarikan per akun bergantung pada antrean strategi, bukan pada kas idle";
  return {
    idle: money(input.idle),
    positionValue: money(input.totalAssets),
    note: `Kas idle ${money(input.idle)} USDG. Nilai posisi ${money(input.totalAssets)} USDG, termasuk dana yang sedang ditempatkan. ${maxWithdrawNote}.`,
  };
}

/**
 * Round `value` half-up to `display` decimals and print exactly that many. All arithmetic is
 * `bigint`: `Number(538856055994) / 1e6` is 538856.0559939999, and a balance is not an approximation.
 */
function display(value: bigint, decimals: number, displayDecimals: number): string {
  if (!Number.isInteger(displayDecimals) || displayDecimals < 0 || displayDecimals > decimals) {
    throw new Error(`cannot display ${decimals} decimals as ${displayDecimals}`);
  }
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const step = 10n ** BigInt(decimals - displayDecimals);
  const rounded = step === 1n ? absolute : (absolute + step / 2n) / step;
  const text = formatUnits(rounded, displayDecimals, { full: true });
  return `${negative ? "-" : ""}${group(text)}`;
}

/** Group thousands with dots, keep the decimal comma that `formatUnits` already produced. */
function group(decimal: string): string {
  const negative = decimal.startsWith("-");
  const body = negative ? decimal.slice(1) : decimal;
  const [whole = "0", fraction] = body.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const out = fraction === undefined || fraction === "" ? grouped : `${grouped},${fraction}`;
  return negative ? `-${out}` : out;
}

/** Short address for tables; full addresses stay available via the `title` attribute. */
export function shortAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`"${address}" is not an address`);
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}