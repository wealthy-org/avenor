// Portfolio surface. Server side resolves the configured vault list and API base; the wallet read
// happens in the browser because positions are per account and the API must never guess an account.

import Link from "next/link";
import { PortfolioPanel } from "@/components/PortfolioPanel";
import { ErrorState } from "@/components/primitives";
import { parseVaultList, type VaultConfig } from "@/config/vaults";
import { STAGING_VAULT } from "@/config/staging";
import { ApiError } from "@/lib/api";
import { STAGING_SHARE_DECIMALS } from "@/lib/serverData";

export const dynamic = "force-dynamic";

const MANDATE_FALLBACK =
  "Staging fork of Robinhood Chain state. Every number is read at one named block and printed " +
            "with that block and its hash; this deployment has no code on mainnet. " +
            "Not open for public deposits.";

function describe(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  return { code: "unknown", message: error instanceof Error ? error.message : String(error) };
}

export default function PortfolioPage() {
  let vaults: VaultConfig[] = [];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    const { code, message } = describe(error);
    return (
      <div className="shell stack">
        <ErrorState code={code} message={`The AVENOR_VAULTS configuration is malformed: ${message}`} />
      </div>
    );
  }

  // Fallback for the staging vault when the environment did not provide the list.
  if (vaults.length === 0) {
    vaults = [
      {
        address: STAGING_VAULT,
        label: "Avenor USDG Managed Vault (Staging)",
        phase: "research",
        mandate: MANDATE_FALLBACK,
      },
    ];
  }

  // The browser calls this app's own `/v1` routes, which read the node per request. An absolute
  // `AVENOR_API_URL` would point at a service that is not running here, and every position would fail for
  // the wrong reason: the numbers live in this deployment, not in an external indexer.
  const base = "";

  return (
    <div className="shell stack">
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#8b929e]">
        <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
          ← All vaults
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-[#f8f9fa]">Portfolio</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#f8f9fa]">Portfolio</h1>
        <p className="mt-3 text-sm text-[#b0b7c3] leading-relaxed max-w-3xl text-pretty">
          This page keeps apart two things that are usually mixed: the value of a position according to the vault, and
          the amount that can actually be withdrawn right now. Both are read at the same block, and that block is shown.
        </p>
      </header>

      <section className="card">
        <PortfolioPanel
          vaults={vaults.map((entry) => ({ address: entry.address, label: entry.label }))}
          base={base}
          shareDecimals={STAGING_SHARE_DECIMALS}
        />
      </section>

      <p className="provenance">
        <Link href="/#vaults" className="text-[#6db89b] hover:underline">
          ← Back to the vault catalogue
        </Link>
      </p>
    </div>
  );
}
