// Withdraw page. Rendered only with a live snapshot, because a withdrawal form without a pause flag
// or an idle figure would invite the user to treat "nilai posisi" as "dapat ditarik sekarang".

import Link from "next/link";
import { notFound } from "next/navigation";
import { WithdrawForm } from "@/components/WithdrawForm";
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

export default async function WithdrawPage({ params }: Params) {
  const { address } = await params;

  let vaults: VaultConfig[] = [];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    const { code, message } = describe(error);
    return (
      <div className="shell stack">
        <ErrorState code={code} message={`Konfigurasi AVENOR_VAULTS rusak: ${message}`} />
      </div>
    );
  }

  // Graceful fallback for staging vault
  if (vaults.length === 0 && address.toLowerCase() === "0x5aebce3956fed4542edbe75d420497378e3b18ca") {
    vaults = [
      {
        address: "0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA",
        label: "Avenor USDG Managed Vault (Staging)",
        phase: "research",
        mandate: "Staging fork — all numbers read directly from Robinhood Chain mainnet pinned block 118337511. Not intended for public deposit.",
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
      detail = getDirectVaultDetail(config.address);
    }
  } else {
    detail = getDirectVaultDetail(config.address);
  }

  const live = detail.live;
  if (live === null) {
    const { code, message } = describe(detail.liveError);
    return (
      <div className="shell stack">
        <ErrorState code={code} message={`Angka vault tidak terbaca, jadi form penarikan tidak ditampilkan: ${message}`} />
      </div>
    );
  }

  return (
    <div className="shell stack">
      <div className="flex items-center gap-2 text-xs font-mono text-[#8b929e] mb-2">
        <Link href={`/vaults/${config.address}`} className="hover:text-[#6db89b] transition-colors">
          ← Back to Vault Detail
        </Link>
        <span>/</span>
        <span className="text-[#f8f9fa]">Withdraw</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 backdrop-blur-sm shadow-xl">
        <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#f8f9fa]">
          Withdraw from {detail.vault === null ? config.label : detail.vault.name} ({detail.vault === null ? "?" : detail.vault.symbol})
        </h1>
        <p className="mt-2 text-sm text-[#b0b7c3] leading-relaxed max-w-3xl">
          Withdrawals draw capital from underlying strategies when unallocated idle reserves are depleted. Loss tolerance is parameterized as an explicit <code>max_loss</code> budget; no hidden default haircuts are applied.
        </p>
      </header>

      <section className="card stack">
        <WithdrawForm
          vault={config.address}
          assetSymbol="USDG"
          live={{
            isPaused: live.isPaused,
            isShutdown: live.isShutdown,
            totalIdle: live.totalIdle,
            blockNumber: live.blockNumber,
            blockTimestamp: live.blockTimestamp,
          }}
        />
        <BlockProvenance blockNumber={live.blockNumber.toString()} blockTimestamp={live.blockTimestamp} source="onchain" />
      </section>

      <section className="card stack">
        <h2 className="text-lg font-medium text-[#f8f9fa]">Protocol Withdrawal Semantics & Bounds</h2>
        <ul className="space-y-2 text-sm text-[#b0b7c3] list-disc pl-5">
          <li><strong>Dynamic Venue Capacity:</strong> <code>maxWithdraw</code> and <code>maxRedeem</code> limits are queried directly on-chain at the verified block height and fluctuate with venue liquidity.</li>
          <li><strong>Zero Speculative Estimates:</strong> Unallocated venue liquidity timelines are not estimated or fabricated.</li>
          <li><strong>Explicit Loss Bounding:</strong> The <code>max_loss</code> parameter measures realized debt liquidation loss during strategy unwinds, not price-per-share variance.</li>
        </ul>
        <p className="provenance pt-2">
          Vault Contract: <AddressText address={config.address} /> · Underlying Asset:{" "}
          <AddressText address={(detail.vault === null ? config.address : detail.vault.assetAddress) as `0x${string}`} />
        </p>
      </section>
    </div>
  );
}
