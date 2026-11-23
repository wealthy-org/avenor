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
        mandate: "Staging fork — semua angka langsung dari Robinhood Chain mainnet pin blok 118337511. Bukan untuk deposit publik.",
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
          ← Kembali ke detail vault
        </Link>
        <span>/</span>
        <span className="text-[#f8f9fa]">Withdraw</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 backdrop-blur-sm shadow-xl">
        <h1 className="font-display text-2xl font-medium text-[#f8f9fa]">
          Penarikan dari {detail.vault === null ? config.label : detail.vault.name} ({detail.vault === null ? "?" : detail.vault.symbol})
        </h1>
        <p className="mt-2 text-sm text-[#b0b7c3] leading-relaxed">
          Penarikan butuh dana dari strategi bila kas idle tidak cukup. Toleransi loss dikirim sebagai <code>max_loss</code>{" "}
          eksplisit; tidak ada nilai default yang tersembunyi. Bila toleransi terlalu kecil, penarikan bisa berhenti
          sebagian; bila chain menolak sepenuhnya, transaksi revert.
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
        <h2>Batas yang diakui</h2>
        <ul>
          <li>`maxWithdraw`/`maxRedeem` dibaca dari vault pada satu blok; nilainya bergerak bersama kas venue.</li>
          <li>Estimasi waktu untuk dana di luar kas idle tidak ditampilkan: tidak ada data yang cukup untuk mengarangnya.</li>
          <li>Preview bukan janji: `max_loss` mengukur loss yang direalisasi saat penarikan, bukan slippage atau perubahan pps.</li>
        </ul>
        <p className="provenance">
          Vault <AddressText address={config.address} /> · aset{" "}
          <AddressText address={(detail.vault === null ? config.address : detail.vault.assetAddress) as `0x${string}`} />
        </p>
      </section>
    </div>
  );
}
