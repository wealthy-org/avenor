// Operator-provided labels only. The app never derives a vault name from a token symbol it has not
// read, and never invents an address: no configuration means "no vault", not a demo vault.

export interface VaultConfig {
  address: `0x${string}`;
  label: string;
  /** Where the operator says this vault is in its lifecycle. Never "live/audited" by default. */
  phase: "limited-launch" | "research";
  /** Operator-written description. Shown as the operator's words, never as an on-chain fact. */
  mandate?: string;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function parseVaultList(raw: string | undefined): VaultConfig[] {
  if (raw === undefined || raw.trim() === "") return [];
  let cleaned = raw.trim();
  // Handle Vercel common encoding artifacts: bare empty-string literals
  if (cleaned === '""' || cleaned === "''" || cleaned === "[]") return cleaned === "[]" ? [] : [];
  // Strip outer single-quotes (some shells wrap the value)
  if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1).trim();
    if (cleaned === "" || cleaned === '""') return [];
  }
  // Strip outer double-quotes that Vercel sometimes adds around the JSON blob
  if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length > 2) {
    const inner = cleaned.slice(1, -1).trim();
    if (inner === "" || inner === "[]") return [];
    cleaned = inner;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
    // Handle double-encoded JSON: JSON.parse returned a string → parse again
    if (typeof parsed === "string") {
      if (parsed.trim() === "" || parsed.trim() === "[]") return [];
      parsed = JSON.parse(parsed);
    }
  } catch {
    throw new Error("AVENOR_VAULTS must be JSON: an unreadable list is not an empty list");
  }
  if (!Array.isArray(parsed)) throw new Error("AVENOR_VAULTS must be a JSON array");

  const seen = new Set<string>();
  return parsed.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) throw new Error(`AVENOR_VAULTS[${index}] must be an object`);
    const candidate = entry as Record<string, unknown>;
    const address = candidate.address;
    if (typeof address !== "string" || !ADDRESS.test(address)) {
      throw new Error(`AVENOR_VAULTS[${index}].address must be a 20-byte hex address`);
    }
    if (seen.has(address.toLowerCase())) throw new Error(`AVENOR_VAULTS[${index}] duplicates ${address}`);
    seen.add(address.toLowerCase());
    const label = candidate.label;
    if (typeof label !== "string" || label.trim() === "") {
      throw new Error(`AVENOR_VAULTS[${index}].label is required: an unlabelled vault is not shippable`);
    }
    const phase = candidate.phase ?? "research";
    if (phase !== "limited-launch" && phase !== "research") {
      throw new Error(`AVENOR_VAULTS[${index}].phase must be limited-launch or research`);
    }
    let mandate: string | undefined;
    if (candidate.mandate !== undefined) {
      if (typeof candidate.mandate !== "string" || candidate.mandate.trim() === "") {
        throw new Error(`AVENOR_VAULTS[${index}].mandate must be a non-empty string when present`);
      }
      mandate = candidate.mandate.trim();
    }
    return { address: address as `0x${string}`, label: label.trim(), phase, ...(mandate === undefined ? {} : { mandate }) };
  });
}

export const API_BASE = process.env.AVENOR_API_URL ?? "";

export function apiUrl(path: string): string {
  if (API_BASE === "") throw new Error("AVENOR_API_URL is not set: the app has no numbers to show");
  return `${API_BASE.replace(/\/$/, "")}${path}`;
}