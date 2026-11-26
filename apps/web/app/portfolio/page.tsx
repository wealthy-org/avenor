// Portfolio surface. Server side resolves the configured vault list, the chain this deployment reads
// and the API base; the wallet read happens in the browser because positions are per account and the
// API must never guess an account.
//
// There is no fallback vault here. An empty `AVENOR_VAULTS` used to resolve to the chain-4663 capture
// address, so a deployment on another chain showed "unreadable" for a vault it had no business reading.
// An empty list is reported as an empty list.

import Link from "next/link";
import { PortfolioPanel } from "@/components/PortfolioPanel";
import { ErrorState } from "@/components/primitives";
import { parseVaultList, type VaultConfig } from "@/config/vaults";
import { ApiError } from "@/lib/api";
import { readChainFacts } from "@/lib/chainFacts";

export const dynamic = "force-dynamic";

function describe(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  return { code: "unknown", message: error instanceof Error ? error.message : String(error) };
}

export default async function PortfolioPage() {
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

  if (vaults.length === 0) {
    return (
      <div className="shell stack">
        <ErrorState
          code="no_vault_configured"
          message="No vault is listed in AVENOR_VAULTS, so this portfolio has nothing to read. Nothing is shown in its place."
        />
      </div>
    );
  }

  const facts = await readChainFacts(process.env.NEXT_PUBLIC_RPC_URL);
  if (facts.chainId === null) {
    return (
      <div className="shell stack">
        <ErrorState
          code="chain_id_unreadable"
          message={`The chain id could not be read, so the wallet cannot be asked for the right network: ${
            facts.error ?? "the node did not answer eth_chainId"
          }`}
        />
      </div>
    );
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
        <p className="mt-2 font-mono text-xs text-[#8b929e]">
          {facts.label} · chain ID {facts.chainId}
        </p>
      </header>

      <section className="card">
        <PortfolioPanel
          vaults={vaults.map((entry) => ({ address: entry.address, label: entry.label }))}
          base={base}
          chainId={facts.chainId}
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
