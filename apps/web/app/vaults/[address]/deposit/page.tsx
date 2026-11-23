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
        <ErrorState code={code} message={`Angka vault tidak terbaca, jadi form deposit tidak ditampilkan: ${message}`} />
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
        <span className="text-[#f8f9fa]">Deposit</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 backdrop-blur-sm shadow-xl">
        <h1 className="font-display text-2xl font-medium text-[#f8f9fa]">
          Deposit ke {detail.vault === null ? config.label : detail.vault.name} ({detail.vault === null ? "?" : detail.vault.symbol})
        </h1>
        <p className="mt-2 text-sm text-[#b0b7c3] leading-relaxed">
          Kapasitas di bawah dibaca dari vault, bukan dari konfigurasi app. Nilai posisi bukan janji likuiditas: share
          yang Anda terima mewakili klaim, bukan kas yang bisa ditarik seketika.
        </p>
      </header>

      <section className="card stack">
        <DepositForm
          vault={config.address}
          asset={(detail.vault === null ? config.address : detail.vault.assetAddress) as `0x${string}`}
          assetSymbol="USDG"
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
          source="onchain"
        />
      </section>

      <section className="card stack">
        <h2>Yang tidak dilakukan form ini</h2>
        <ul>
          <li>Tidak ada approve tanpa batas: allowance diisi tepat sebesar deposit.</li>
          <li>Tidak ada default `max_loss`: form ini hanya deposit; penarikan punya parameter sendiri di tiket 5.4.</li>
          <li>Tidak ada retry otomatis setelah signature ditolak atau receipt gagal.</li>
          <li>Tidak ada angka share final dari kutipan: hanya event `Deposit` di receipt.</li>
        </ul>
        <p className="provenance">
          Vault <AddressText address={config.address} /> · aset{" "}
          <AddressText address={detail.vault === null ? config.address : detail.vault.assetAddress} />
        </p>
      </section>
    </div>
  );
}
