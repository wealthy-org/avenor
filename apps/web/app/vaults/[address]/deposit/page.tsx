// Deposit page. The server reads the gate from the API at one pinned block and refuses to render a
// form when that read failed: a form without a cap is a form that will surprise the user at signing.

import Link from "next/link";
import { notFound } from "next/navigation";
import { DepositForm } from "@/components/DepositForm";
import { AddressText, BlockProvenance, ErrorState } from "@/components/primitives";
import { apiUrl, parseVaultList, type VaultConfig } from "@/config/vaults";
import { ApiError } from "@/lib/api";
import { loadVaultDetail } from "@/lib/vaultLoader";
import { getDirectVaultDetail } from "@/lib/serverData";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ address: string }>;
}

function describe(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  return { code: "unknown", message: error instanceof Error ? error.message : String(error) };
}

export default async function DepositPage({ params }: Params) {
  const { address } = await params;

  let vaults: VaultConfig[] = [];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    const { code, message } = describe(error);
    return (
      <div className="shell stack">
        <ErrorState code={code} message={`Vault configuration error: ${message}`} />
      </div>
    );
  }

  // Graceful fallback for the staging vault when the environment did not provide the list.
  if (vaults.length === 0 && address.toLowerCase() === "0x5aebce3956fed4542edbe75d420497378e3b18ca") {
    vaults = [
      {
        address: "0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA",
        label: "Avenor USDG Managed Vault (Staging)",
        phase: "research",
        mandate:
          "Staging fork of Robinhood Chain state. Every number is read at one named block and printed " +
            "with that block and its hash; this deployment has no code on mainnet. " +
            "Not open for public deposits.",
      },
    ];
  }

  const config = vaults.find((entry) => entry.address.toLowerCase() === address.toLowerCase());
  if (config === undefined) notFound();

  let detail;
  let base = "";
  try {
    base = apiUrl("");
  } catch {
    base = "";
  }

  if (base !== "") {
    try {
      detail = await loadVaultDetail(base, config.address);
    } catch {
      detail = await getDirectVaultDetail(config.address);
    }
  } else {
    detail = await getDirectVaultDetail(config.address);
  }

  const live = detail.live;
  if (live === null) {
    const { code, message } = describe(detail.liveError);
    return (
      <div className="shell stack">
        <ErrorState code={code} message={`On-chain vault data unavailable — deposit form cannot be shown: ${message}`} />
      </div>
    );
  }

  const vaultName = detail.vault === null ? config.label : detail.vault.name;
  const vaultSymbol = detail.vault === null ? "?" : detail.vault.symbol;
  const assetAddress = (detail.vault === null ? config.address : detail.vault.assetAddress) as `0x${string}`;

  return (
    <div className="shell stack">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-mono text-[#a3abb8]" aria-label="Breadcrumb">
        <Link href={`/vaults/${config.address}`} className="hover:text-[#6db89b] transition-colors inline-flex items-center gap-1">
          ← Back to vault
        </Link>
        <span aria-hidden="true" className="text-[#a3abb8]">/</span>
        <span className="text-[#f8f9fa] font-medium">Deposit</span>
      </nav>

      {/* Page Header */}
      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] uppercase tracking-widest text-[#6db89b] bg-[#6db89b]/10 border border-[#6db89b]/20 rounded-full px-2.5 py-0.5">
                Deposit
              </span>
              <span className="font-mono text-[11px] uppercase tracking-widest text-[#8b929e] bg-white/[0.04] border border-white/[0.08] rounded-full px-2.5 py-0.5">
                Robinhood Chain · chain ID 4663
              </span>
            </div>
            <h1 className="font-display text-xl sm:text-3xl font-medium text-[#f8f9fa]">
              Deposit into {vaultName}
              {/* At 390px the vault name plus the symbol on one line wrapped to three; the symbol drops to
                  its own line instead of breaking the name. */}
              <span className="mt-1 block font-mono text-sm text-[#a3abb8] sm:mt-0 sm:ml-2 sm:inline sm:text-base">
                ({vaultSymbol})
              </span>
            </h1>
            <p className="text-sm text-[#b0b7c3] leading-relaxed max-w-2xl text-pretty">
              Deposit capacity is read directly from the vault contract, not from application configuration.
              Shares received represent a proportional claim on vault assets — not a guarantee of immediate liquidity.
            </p>
          </div>
        </div>
      </header>

      {/* Deposit Form */}
      <section className="card stack">
        <DepositForm
          vault={config.address}
          asset={assetAddress}
          assetSymbol="USDG"
          shareDecimals={detail.vault === null ? 0 : detail.vault.shareDecimals}
          gate={{
            depositLimit: live.depositLimit,
            isPaused: live.isPaused,
            isShutdown: live.isShutdown,
            blockNumber: live.blockNumber,
            blockTimestamp: live.blockTimestamp,
          }}
        />
        <BlockProvenance
          blockNumber={live.blockNumber.toString()}
          blockTimestamp={live.blockTimestamp}
          source={live.source}
        />
      </section>

      {/* Protocol Guarantees */}
      <section className="card stack">
        <h2 className="font-display text-base font-medium text-[#f8f9fa]">Protocol Guarantees</h2>
        <ul className="space-y-2 text-sm text-[#b0b7c3] leading-relaxed">
          <li className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-[#6db89b] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            No unlimited approvals — allowance is set to exactly the deposit amount.
          </li>
          <li className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-[#6db89b] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            No hidden defaults — this form handles deposit only; withdrawal has its own explicit <code className="font-mono text-[11px] text-[#6db89b]">max_loss</code> parameter.
          </li>
          <li className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-[#6db89b] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            No automatic retry — a rejected signature or failed receipt requires explicit user action.
          </li>
          <li className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-[#6db89b] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            Final share count is sourced exclusively from the on-chain <code className="font-mono text-[11px] text-[#6db89b]">Deposit</code> event — never from a pre-signing estimate.
          </li>
        </ul>
        <p className="provenance">
          Vault <AddressText address={config.address} /> · asset <AddressText address={assetAddress} />
        </p>
      </section>
    </div>
  );
}
