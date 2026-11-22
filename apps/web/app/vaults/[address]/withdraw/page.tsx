// Withdraw page. Rendered only with a live snapshot, because a withdrawal form without a pause flag
// or an idle figure would invite the user to treat "nilai posisi" as "dapat ditarik sekarang".

import Link from "next/link";
import { notFound } from "next/navigation";
import { WithdrawForm } from "@/components/WithdrawForm";
import { AddressText, BlockProvenance, ErrorState } from "@/components/primitives";
import { apiUrl, parseVaultList, type VaultConfig } from "@/config/vaults";
import { ApiError } from "@/lib/api";
import { loadVaultDetail } from "@/lib/vaultLoader";

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
  const config = vaults.find((entry) => entry.address.toLowerCase() === address.toLowerCase());
  if (config === undefined) notFound();

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

  const detail = await loadVaultDetail(base, config.address).catch((error: unknown) => ({ thrown: error }) as const);
  if ("thrown" in detail) {
    const { code, message } = describe(detail.thrown);
    return (
      <main id="main" className="shell stack">
        <ErrorState code={code} message={`Vault tidak terbaca: ${message}`} />
      </main>
    );
  }

  const live = detail.live;
  if (live === null) {
    const { code, message } = describe(detail.liveError);
    return (
      <main id="main" className="shell stack">
        <ErrorState code={code} message={`Angka vault tidak terbaca, jadi form penarikan tidak ditampilkan: ${message}`} />
      </main>
    );
  }

  return (
    <main id="main" className="shell stack">
      <p className="provenance">
        <Link href={`/vaults/${config.address}`}>← kembali ke detail vault</Link>
      </p>
      <h1>Penarikan dari {detail.vault === null ? config.label : detail.vault.name}</h1>
      <p>
        Penarikan butuh dana dari strategi bila kas idle tidak cukup. Toleransi loss dikirim sebagai <code>max_loss</code>{" "}
        eksplisit; tidak ada nilai default yang tersembunyi. Bila toleransi terlalu kecil, penarikan bisa berhenti
        sebagian; bila chain menolak sepenuhnya, transaksi revert.
      </p>
      <section className="card stack">
        <WithdrawForm
          vault={config.address}
          assetSymbol="aset"
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
    </main>
  );
}