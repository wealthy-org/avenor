// Money formatting for a 6-decimal asset and an 18-decimal share token.
//
// Rules this file exists to enforce:
//   * no `Number` anywhere — `parseFloat("0.1") * 1e6` is 100000.00000000001;
//   * positions come from `bigint` and are formatted as strings, so a UI cannot lose wei;
//   * parsing rejects anything ambiguous (comma, exponent, sign, empty, too many decimals)
//     instead of silently rounding a user's deposit.

export const USDG_DECIMALS = 6;

// There is deliberately no `SHARE_DECIMALS` constant. `VaultV3.decimals` is `asset.decimals()`, which is
// 6 for a USDG vault, while a Morpho venue share token can be 18. A single global constant would print a
// 6-decimal share balance a factor of 10^12 too small, so every caller passes the decimals it read from
// the contract it is describing.


export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAmountError";
  }
}

/** Parse a decimal string into base units. Only `digits` and one `.` are accepted. */
export function parseUnits(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) {
    throw new InvalidAmountError(`invalid decimals ${decimals}`);
  }
  if (typeof value !== "string") throw new InvalidAmountError("amount must be a string");
  if (value === "" || value === ".") throw new InvalidAmountError("amount is empty");
  if (!/^\d*(\.\d*)?$/.test(value)) {
    throw new InvalidAmountError(`"${value}" is not a plain decimal (use digits and at most one dot)`);
  }

  const [whole = "", fraction = ""] = value.split(".");
  if (whole === "" && fraction === "") throw new InvalidAmountError("amount is empty");
  if (fraction.length > decimals) {
    throw new InvalidAmountError(`"${value}" has ${fraction.length} decimals, asset has ${decimals}`);
  }

  return BigInt((whole || "0") + fraction.padEnd(decimals, "0"));
}

export function parseUsdg(value: string): bigint {
  return parseUnits(value, USDG_DECIMALS);
}

export interface FormatOptions {
  /** Minimum decimals to print. Default: 0 (trailing zeros trimmed). */
  minFractionDigits?: number;
  /** Print every decimal instead of trimming. */
  full?: boolean;
}

/** Format base units into a decimal string. Never goes through `Number`. */
export function formatUnits(value: bigint, decimals: number, options: FormatOptions = {}): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) {
    throw new InvalidAmountError(`invalid decimals ${decimals}`);
  }
  const min = options.minFractionDigits ?? 0;
  if (min < 0 || min > decimals) throw new InvalidAmountError(`invalid minFractionDigits ${min}`);

  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = (absolute / base).toString();
  const fractionRaw = (absolute % base).toString().padStart(decimals, "0");

  let fraction = options.full ? fractionRaw : fractionRaw.replace(/0+$/, "");
  if (fraction.length < min) fraction = fraction.padEnd(min, "0");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function formatUsdg(value: bigint, options: FormatOptions = {}): string {
  return formatUnits(value, USDG_DECIMALS, options);
}

export function formatShares(value: bigint, decimals: number, options: FormatOptions = {}): string {
  return formatUnits(value, decimals, options);
}

/** One basis point of `value`, rounded down. Used for tolerances, never for balances. */
export function bpsOf(value: bigint, bps: number | bigint): bigint {
  const b = BigInt(bps);
  if (b < 0n || b > 10_000n) throw new InvalidAmountError(`basis points out of range: ${bps}`);
  return (value * b) / 10_000n;
}