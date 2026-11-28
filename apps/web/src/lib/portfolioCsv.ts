// Portfolio export. CSV is built from the same numbers the table shows, with the block that produced
// them, so a spreadsheet cannot invent provenance the UI never had.

export interface CsvRow {
  vault: string;
  account: string;
  shares: string;
  positionAssets: string | null;
  maxAssets: string | null;
  totalIdle: string | null;
  blockNumber: string;
  error: string | null;
}

const HEADER = ["vault", "account", "shares", "position_assets", "max_withdrawable_assets", "vault_total_idle", "block_number", "error"];

function cell(value: string | null): string {
  if (value === null) return "";
  // A leading `=+-@` followed by tab is the CSV formula-injection vector: spreadsheet apps execute
  // the rest of the cell. Prefixing with a single quote keeps it data, not a formula.
  if (value === "") return "";
  // Hyphen placed first so it is a literal, not a range (e.g. `@-` → `@` to ASCII 45 is undefined).
  const sanitized = /^[-=+@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(sanitized) ? `"${sanitized.replace(/"/g, '""')}"` : sanitized;
}

/**
 * Money stays a decimal string of base units. A CSV that prints "538.86" loses the exact amount and
 * cannot be reconciled against the chain afterwards.
 */
export function portfolioCsv(rows: CsvRow[]): string {
  const lines = [HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.vault,
        row.account,
        row.shares,
        row.positionAssets,
        row.maxAssets,
        row.totalIdle,
        row.blockNumber,
        row.error,
      ]
        .map(cell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}