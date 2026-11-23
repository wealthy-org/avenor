// Portfolio surface. Server side resolves the configured vault list and API base; the wallet read
// happens in the browser because positions are per account and the API must never guess an account.

import Link from "next/link";
import { PortfolioPanel } from "@/components/PortfolioPanel";
import { ErrorState } from "@/components/primitives";
import { apiUrl, parseVaultList, type VaultConfig } from "@/config/vaults";
import { ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

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
        <ErrorState code={code} message={`Konfigurasi AVENOR_VAULTS rusak: ${message}`} />
      </div>
    );
  }

  // Fallback for staging vault if env not provided
  if (vaults.length === 0) {
    vaults = [
      {
        address: "0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA",
        label: "Avenor USDG Managed Vault (Staging)",
        phase: "research",
        mandate: "Staging fork — semua angka langsung dari Robinhood Chain mainnet pin blok 118337511. Bukan untuk deposit publik.",
      },
    ];
  }

  let base = "";
  try {
    base = apiUrl("");
  } catch {
    base = process.env.AVENOR_API_URL || "";
  }

  return (
    <div className="shell stack">
      <div className="flex items-center gap-2 text-xs font-mono text-[#8b929e] mb-2">
        <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
          ← Back to Vaults
        </Link>
        <span>/</span>
        <span className="text-[#f8f9fa]">Portfolio</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 backdrop-blur-sm shadow-xl">
        <h1 className="font-display text-2xl font-medium text-[#f8f9fa]">Portofolio</h1>
        <p className="mt-2 text-sm text-[#b0b7c3] leading-relaxed max-w-3xl">
          Halaman ini memisahkan dua hal yang sering dicampur: nilai posisi menurut vault, dan jumlah yang benar-benar bisa
          ditarik sekarang. Keduanya dibaca pada blok yang sama, dan blok itu ditampilkan.
        </p>
      </header>

      <section className="card stack">
        <PortfolioPanel
          vaults={vaults.map((entry) => ({ address: entry.address, label: entry.label }))}
          base={base}
        />
      </section>

      <p className="provenance">
        <Link href="/#vaults" className="text-[#6db89b] hover:underline">
          ← Kembali ke katalog
        </Link>
      </p>
    </div>
  );
}
