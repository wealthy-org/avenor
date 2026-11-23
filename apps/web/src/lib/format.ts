// Display-only helpers. Every number that reaches a screen goes through the SDK first: this file
// never does arithmetic on money, it only decides how a `bigint` is spelled.
//
// Two UI rules are encoded here rather than left to each component:
//   * a percentage is always shown with its basis in words (`0.15% of total assets`), because a bare
//     percentage of an unknown denominator is how APY gets invented;
//   * "value" and "can be withdrawn now" are separate functions with separate names, so a component
//     cannot add them together by accident.
//
// The interface is English and the numbers are English-formatted (`538,856.06`), including thousands
// grouping for share counts. Nothing here consults the host locale: a server and a browser with
// different `LANG` settings must still print the same string, otherwise the block-provenance copy
// next to a number would disagree with the number.

import { formatUnits, USDG_DECIMALS } from "@avenor/sdk";

const LOCALE = "en-US";

/** 6-decimal asset amount, grouped, 2 decimals unless `full`. Rounds half up, never truncates. */
export function money(value: bigint, options: { full?: boolean } = {}): string {
  return display(value, USDG_DECIMALS, options.full === true ? USDG_DECIMALS : 2);
}

/**
 * Share amounts are not money and never get a currency suffix.
 *
 * `decimals` is required: share decimals are a property of the vault (`decimals()`, which `VaultV3`
 * sets to `asset.decimals()`), not a global constant. Assuming 18 for a 6-decimal vault scales the
 * number by 10^12.
 */
export function shares(value: bigint, decimals: number, options: { full?: boolean } = {}): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`share decimals must be an integer 0..36, got ${decimals}`);
  }
  // `full` is the raw value and must stay untrimmed.
  return options.full === true
    ? display(value, decimals, decimals)
    : trimShareDecimals(display(value, decimals, 4));
}

/**
 * Share counts print at most four decimals, but `1,800.0000` next to `1,800.00 USDG` reads like two
 * different numbers for the same quantity. Trailing zeros are dropped down to two, so precision is
 * only shown when the value actually uses it.
 */
function trimShareDecimals(text: string): string {
  const trimmed = text.replace(/(\.\d\d\d*?)0+$/, "$1").replace(/\.$/, ".00");
  return trimmed.includes(".") ? trimmed : `${trimmed}.00`;
}

/** Percentage from basis points, without implying what it is a percentage of. */
export function percentBps(bps: number): string {
  if (!Number.isInteger(bps)) throw new Error(`basis points must be an integer, got ${bps}`);
  const sign = bps < 0 ? "-" : "";
  const absolute = Math.abs(bps);
  return `${sign}${(absolute / 100).toFixed(2)}%`;
}

/** The sentence that has to sit next to a percentage. The denominator is named, always. */
export function percentOf(bps: number, of: "total-assets" | "shares" | "deposit-limit"): string {
  const label = {
    "total-assets": "of total assets",
    shares: "of total shares",
    "deposit-limit": "of the deposit limit",
  }[of];
  return `${percentBps(bps)} ${label}`;
}

/** Block timestamp from the API (ISO with Z) as a stable, unambiguous string. */
export function blockTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new Error(`"${iso}" is not an ISO timestamp`);
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(parsed);
}

/**
 * Unix seconds as the same stable string `blockTime` produces.
 *
 * Yearn V3 `strategies(address)` returns `activation` and `lastReport` as timestamps, not block
 * numbers, so a value read from them must be printed as a time. Rendering 1795104188 as "block
 * 1795104188" is off by four orders of magnitude and invents a block that does not exist.
 */
export function epochTime(seconds: bigint | number): string {
  const value = typeof seconds === "bigint" ? Number(seconds) : seconds;
  // Ethereum's first block is 2015-07-30 (1438269973). Anything below 2014-05-13 is not a chain
  // timestamp, which catches the real mistake: a block height passed in where seconds were expected.
  const EARLIEST = 1_400_000_000;
  if (!Number.isSafeInteger(value) || value < EARLIEST) {
    throw new Error(`${String(seconds)} is not a unix timestamp (a block height is not a time)`);
  }
  return blockTime(new Date(value * 1000).toISOString());
}

export interface LiquiditySplit {
  /** Cash sitting in the vault right now. */
  idle: string;
  /** Position value, including everything that is currently deployed. */
  positionValue: string;
  /** The sentence the UI must show; "withdrawable now" is never derived from `idle` alone. */
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
      ? "The per-account withdraw limit is read once a wallet is connected"
      : "The per-account withdraw limit depends on the strategy queue, not on idle cash";
  return {
    idle: money(input.idle),
    positionValue: money(input.totalAssets),
    note: `Idle cash ${money(input.idle)} USDG, available now. Position value ${money(input.totalAssets)} USDG, which includes capital currently deployed. ${maxWithdrawNote}.`,
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

/** Group thousands with commas and keep the decimal point that `formatUnits` already produced. */
function group(decimal: string): string {
  const negative = decimal.startsWith("-");
  const body = negative ? decimal.slice(1) : decimal;
  const [whole = "0", fraction] = body.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = fraction === undefined || fraction === "" ? grouped : `${grouped}.${fraction}`;
  return negative ? `-${out}` : out;
}

/** Short address for tables; full addresses stay available via the `title` attribute. */
export function shortAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`"${address}" is not an address`);
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}