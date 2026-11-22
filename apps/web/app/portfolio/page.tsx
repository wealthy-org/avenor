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
  let vaults: VaultConfig[];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    const { code, message } = describe(error);
    return (
      <main id="main" className="shell stack">
        <ErrorState code={code} message={`Konfigurasi AVENOR_VAULTS rusak: ${message}`} />
      </main>
    );
  }

  let base: string;
  try {
    base = apiUrl("");
  } catch (error) {
    const { code, message } = describe(error);
    return (
      <main id="main" className="shell stack">
        <ErrorState code={code} message={`API tidak dikonfigurasi: ${message}`} />
      </main>
    );
  }

  return (
    <main id="main" className="shell stack">
      <h1>Portofolio</h1>
      <p>
        Halaman ini memisahkan dua hal yang sering dicampur: nilai posisi menurut vault, dan jumlah yang benar-benar bisa
        ditarik sekarang. Keduanya dibaca pada blok yang sama, dan blok itu ditampilkan.
      </p>
      <PortfolioPanel
        vaults={vaults.map((entry) => ({ address: entry.address, label: entry.label }))}
        base={base}
      />
      <p className="provenance">
        <Link href="/">Kembali ke katalog</Link>
      </p>
    </main>
  );
}