// Withdraw page. Rendered only with a live snapshot, because a withdrawal form without a pause flag
// or an idle figure would invite the user to treat position value as immediately withdrawable.

import Link from "next/link";
import { notFound } from "next/navigation";
import { WithdrawForm } from "@/components/WithdrawForm";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AddressText, BlockProvenance, ErrorState } from "@/components/primitives";
import { apiUrl, parseVaultList, DEFAULT_TESTNET_VAULT, type VaultConfig } from "@/config/vaults";
import { ApiError } from "@/lib/api";
import { loadVaultDetail } from "@/lib/vaultLoader";
import { getDirectVaultDetail } from "@/lib/serverData";
import { readChainFacts } from "@/lib/chainFacts";
import type { VaultDetail } from "@/lib/vaultLoader";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ address: string }>;
}

function describe(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  return { code: "unknown", message: error instanceof Error ? error.message : String(error) };
}

export default async function WithdrawPage({ params }: Params) {
  const { address } = await params;

  let vaults: VaultConfig[] = [];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    console.warn("AVENOR_VAULTS configuration error, using default fallback:", error);
    vaults = [];
  }

  if (vaults.length === 0) {
    vaults = [DEFAULT_TESTNET_VAULT];
  }

  const config = vaults.find((entry) => entry.address.toLowerCase() === address.toLowerCase());
  if (config === undefined) notFound();

  let detail: VaultDetail | null = null;
  let base = "";
  try {
    base = apiUrl("");
  } catch {
    base = "";
  }

  let detailError: unknown = null;
  try {
    if (base !== "") {
      try {
        detail = await loadVaultDetail(base, config.address);
      } catch {
        detail = await getDirectVaultDetail(config.address);
      }
    } else {
      detail = await getDirectVaultDetail(config.address);
    }
  } catch (error) {
    detailError = error;
    detail = null;
  }

  if (detail === null) {
    return (
      <div className="shell stack">
        <ErrorState
          code="vault_unreadable"
          message={`The vault could not be read, so no form is shown: ${detailError instanceof Error ? detailError.message : String(detailError)}`}
        />
      </div>
    );
  }

  const live = detail.live;
  if (live === null) {
    const { code, message } = describe(detail.liveError);
    return (
      <div className="shell stack">
        <ErrorState code={code} message={`On-chain vault data unavailable — withdrawal form cannot be shown: ${message}`} />
      </div>
    );
  }

  const vaultName = detail.vault === null ? config.label : detail.vault.name;
  const vaultSymbol = detail.vault === null ? "?" : detail.vault.symbol;
  const assetAddress = (detail.vault === null ? config.address : detail.vault.assetAddress) as `0x${string}`;

  const facts = await readChainFacts(process.env.NEXT_PUBLIC_RPC_URL);
  if (facts.chainId === null) {
    return (
      <div className="shell stack">
        <ErrorState
          code="chain_id_unreadable"
          message={`The chain id could not be read, so no withdrawal can be addressed to the right network: ${
            facts.error ?? "the node did not answer eth_chainId"
          }`}
        />
      </div>
    );
  }

  return (
    <div className="shell stack">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-mono text-[#a3abb8]" aria-label="Breadcrumb">
        <Link href={`/vaults/${config.address}`} className="hover:text-[#6db89b] transition-colors inline-flex items-center gap-1">
          ← Back to vault
        </Link>
        <span aria-hidden="true" className="text-[#a3abb8]">/</span>
        <span className="text-[#f8f9fa] font-medium">Withdraw</span>
      </nav>

      {/* Page Header */}
      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] uppercase tracking-widest text-[#e8c468] bg-[#e8c468]/10 border border-[#e8c468]/20 rounded-full px-2.5 py-0.5">
              Withdraw
            </span>
            <span className="font-mono text-[11px] uppercase tracking-widest text-[#8b929e] bg-white/[0.04] border border-white/[0.08] rounded-full px-2.5 py-0.5">
              {facts.label} · chain ID {facts.chainId}
            </span>
          </div>
          <h1 className="font-display text-xl sm:text-3xl font-medium text-[#f8f9fa]">
            Withdraw from {vaultName}
            <span className="mt-1 block font-mono text-sm text-[#a3abb8] sm:mt-0 sm:ml-2 sm:inline sm:text-base">
              ({vaultSymbol})
            </span>
          </h1>
          <p className="text-sm text-[#b0b7c3] leading-relaxed max-w-2xl text-pretty">
            Withdrawals may require capital to be recalled from strategies when idle cash is insufficient.
            Loss tolerance is sent as an explicit <code className="font-mono text-[11px] text-[#6db89b]">max_loss</code> parameter — there are no hidden defaults.
            If the tolerance is too tight, the withdrawal may be partial; if the chain rejects entirely, the transaction reverts.
          </p>
        </div>
      </header>

      {/* Withdraw Form */}
      <section className="card stack">
        <ErrorBoundary fallbackTitle="Withdraw form initialization issue">
          <WithdrawForm
            vault={config.address}
            chainId={facts.chainId}
            assetSymbol="USDG"
            shareDecimals={detail.vault === null ? 0 : detail.vault.shareDecimals}
            live={{
              isPaused: live.isPaused,
              isShutdown: live.isShutdown,
              totalIdle: live.totalIdle,
              blockNumber: live.blockNumber,
              blockTimestamp: live.blockTimestamp,
            }}
          />
        </ErrorBoundary>
        <BlockProvenance blockNumber={live.blockNumber.toString()} blockTimestamp={live.blockTimestamp} source={live.source} />
      </section>

      {/* Acknowledged Limitations */}
      <section className="card stack">
        <h2 className="font-display text-base font-medium text-[#f8f9fa]">Acknowledged Limitations</h2>
        <ul className="space-y-2 text-sm text-[#b0b7c3] leading-relaxed">
          <li className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-[#e8c468] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="min-w-0">
              <code className="font-mono text-xs text-[#6db89b]">maxWithdraw</code> /{" "}
              <code className="font-mono text-xs text-[#6db89b]">maxRedeem</code> are read from the vault at a
              single block; these values move with venue liquidity.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-[#e8c468] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="min-w-0">
              Time estimates for funds outside idle cash are not shown — there is insufficient on-chain data
              to derive them honestly.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-[#e8c468] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="min-w-0">
              Preview is not a promise — {" "}
              <code className="font-mono text-xs text-[#6db89b]">max_loss</code> measures realised loss at
              withdrawal time, not slippage or price-per-share drift.
            </span>
          </li>
        </ul>
        <p className="provenance">
          Vault <AddressText address={config.address} /> · asset <AddressText address={assetAddress} />
        </p>
      </section>
    </div>
  );
}
