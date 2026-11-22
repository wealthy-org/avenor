// Deposit page. The server reads the gate from the API at one pinned block and refuses to render a
// form when that read failed: a form without a cap is a form that will surprise the user at signing.

import Link from "next/link";
import { notFound } from "next/navigation";
import { DepositForm } from "@/components/DepositForm";
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

export default async function DepositPage({ params }: Params) {
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
        <ErrorState code={code} message={`Angka vault tidak terbaca, jadi form deposit tidak ditampilkan: ${message}`} />
      </main>
    );
  }

  return (
    <main id="main" className="shell stack">
      <p className="provenance">
        <Link href={`/vaults/${config.address}`}>← kembali ke detail vault</Link>
      </p>
      <h1>
        Deposit ke {detail.vault === null ? config.label : detail.vault.name} ({detail.vault === null ? "?" : detail.vault.symbol})
      </h1>
      <p>
        Kapasitas di bawah dibaca dari vault, bukan dari konfigurasi app. Nilai posisi bukan janji likuiditas: share
        yang Anda terima mewakili klaim, bukan kas yang bisa ditarik seketika.
      </p>
      <section className="card stack">
        <DepositForm
          vault={config.address}
          asset={(detail.vault === null ? config.address : detail.vault.assetAddress) as `0x${string}`}
          assetSymbol="aset"
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
    </main>
  );
}