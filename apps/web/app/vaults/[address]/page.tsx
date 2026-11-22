// Vault detail: value, liquidity split, allocation, parameters, roles, and realised fees.
//
// Two rules shape this page:
//   1. Every number carries the block it came from. `live` and `allocation` are read at the same
//      pinned block by the API, so idle + debt == totalAssets is checked before anything renders.
//   2. A section that failed to load says so. It never falls back to zero, because "0 USDG" and
//      "not known" are different answers and only one of them is safe.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Amount, AddressText, BlockProvenance, ErrorState, Percent, StatusPill } from "@/components/primitives";
import { ApiError } from "@/lib/api";
import { loadVaultDetail } from "@/lib/vaultLoader";
import { blockTime, liquiditySplit, percentBps } from "@/lib/format";
import { apiUrl, parseVaultList, type VaultConfig } from "@/config/vaults";
import { latestReportBlock } from "@/lib/vaultView";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ address: string }>;
}

function describe(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  return { code: "unknown", message: error instanceof Error ? error.message : String(error) };
}

function SectionError({ error, what }: { error: unknown; what: string }) {
  const { code, message } = describe(error);
  return <ErrorState code={code} message={`${what}: ${message}`} />;
}

export default async function VaultPage({ params }: Params) {
  const { address } = await params;

  let vaults: VaultConfig[];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    return (
      <main id="main" className="shell stack">
        <SectionError error={error} what="Konfigurasi AVENOR_VAULTS rusak" />
      </main>
    );
  }

  const config = vaults.find((entry) => entry.address.toLowerCase() === address.toLowerCase());
  if (config === undefined) notFound();

  let base: string;
  try {
    base = apiUrl("");
  } catch (error) {
    return (
      <main id="main" className="shell stack">
        <SectionError error={error} what="API tidak dikonfigurasi" />
      </main>
    );
  }

  let detail;
  try {
    detail = await loadVaultDetail(base, config.address);
  } catch (error) {
    return (
      <main id="main" className="shell stack">
        <div className="row">
          <h1>{config.label}</h1>
          <StatusPill tone="warn" text={config.phase === "limited-launch" ? "limited launch" : "riset"} />
        </div>
        <SectionError error={error} what="Vault tidak dapat dibaca dari API" />
        <p>
          <Link href="/">Kembali ke katalog</Link>
        </p>
      </main>
    );
  }

  const { vault, live, liveError, allocation, allocationError, reports, reportsError, roles, rolesError } = detail;
  const split = live === null ? null : liquiditySplit({ idle: live.totalIdle, totalAssets: live.totalAssets });
  const lastReport = allocation === null ? null : latestReportBlock(allocation);
  const pendingDeposits = vault.depositLimit === 0n;

  return (
    <main id="main" className="shell stack">
      <header className="stack">
        <div className="row">
          <h1>{config.label}</h1>
          <StatusPill tone={config.phase === "limited-launch" ? "neutral" : "warn"} text={config.phase} />
        </div>
        <p>
          <AddressText address={vault.address} /> · {vault.name} ({vault.symbol}) · {vault.shareDecimals} desimal share
        </p>
        {config.mandate === undefined ? null : <p>{config.mandate}</p>}
      </header>

      <div className="banner" data-tone="warn">
        <strong>Nilai posisi bukan janji likuiditas.</strong>
        <p>
          Kas idle dapat dipakai untuk penarikan sekarang; dana yang ditempatkan di venue belum tentu cair dan
          bergantung pada antrean strategi. Halaman ini tidak menampilkan APY.
        </p>
      </div>

      <p>
        <Link href={`/vaults/${vault.address}/deposit`}>Buka form deposit →</Link>{" "}
        <span className="provenance">
          Form deposit membaca kapasitasnya sendiri dari chain; halaman ini tidak menampilkan tombol deposit.
        </span>
      </p>

      <section className="card stack">
        <h2>Nilai vault</h2>
        {live === null ? (
          <SectionError error={liveError} what="Angka on-chain (live) tidak terbaca" />
        ) : (
          <>
            <dl className="facts">
              <dt>Total aset</dt>
              <dd>
                <Amount value={live.totalAssets} kind="usdg" />
              </dd>
              <dt>Kas idle (dapat dipakai sekarang)</dt>
              <dd>
                <Amount value={live.totalIdle} kind="usdg" />
              </dd>
              <dt>Ditempatkan di strategi</dt>
              <dd>
                <Amount value={live.totalDebt} kind="usdg" />
              </dd>
              <dt>Harga per share</dt>
              <dd>
                <Amount value={live.pricePerShare} kind="usdg" />
              </dd>
              <dt>Total share</dt>
              <dd>
                <Amount value={live.totalSupply} kind="shares" />
              </dd>
              <dt>Deposit</dt>
              <dd>{pendingDeposits ? "ditutup (deposit_limit = 0)" : <Amount value={vault.depositLimit} kind="usdg" />}</dd>
            </dl>
            {split === null ? null : <p>{split.note}</p>}
            <BlockProvenance
              blockNumber={live.blockNumber.toString()}
              blockTimestamp={live.blockTimestamp}
              source={live.source}
            />
          </>
        )}
      </section>

      <section className="card stack">
        <h2>Alokasi per strategi</h2>
        {allocation === null ? (
          <SectionError error={allocationError} what="Alokasi tidak terbaca" />
        ) : allocation.strategies.length === 0 ? (
          <p>
            Antrean default kosong.
            {live === null
              ? " Total debt tidak diketahui karena angka live gagal dibaca."
              : live.totalDebt > 0n
                ? ` Namun totalDebt on-chain ${live.totalDebt.toString()} bukan nol: ada debt yang tidak dijelaskan antrean.`
                : " Total debt on-chain nol, jadi tidak ada posisi strategi."}
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Strategi</th>
                <th>Venue</th>
                <th>Debt</th>
                <th>Porsi aset</th>
                <th>Batas debt</th>
                <th>Laporan terakhir</th>
              </tr>
            </thead>
            <tbody>
              {allocation.strategies.map((strategy) => (
                <tr key={strategy.address}>
                  <td>
                    <AddressText address={strategy.address} />
                  </td>
                  <td>
                    {strategy.venue === null ? (
                      <span title={strategy.venueError ?? undefined}>tidak terbaca (bukan berarti tidak ada)</span>
                    ) : (
                      <AddressText address={strategy.venue} />
                    )}
                  </td>
                  <td>
                    <Amount value={strategy.currentDebt} kind="usdg" />
                  </td>
                  <td>
                    <Percent bps={strategy.debtBps} />
                  </td>
                  <td>
                    <Amount value={strategy.maxDebt} kind="usdg" />
                  </td>
                  <td>
                    {strategy.lastReport === 0n ? (
                      "belum pernah"
                    ) : (
                      <span className="provenance">blok {strategy.lastReport.toString()}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {allocation === null ? null : (
          <BlockProvenance
            blockNumber={allocation.blockNumber.toString()}
            blockTimestamp={allocation.blockTimestamp}
            source="onchain"
          />
        )}
      </section>

      <section className="card stack">
        <h2>Parameter dan peran</h2>
        <dl className="facts">
          <dt>Alamat vault</dt>
          <dd>
            <AddressText address={vault.address} />
          </dd>
          <dt>Aset</dt>
          <dd>
            <AddressText address={vault.assetAddress} /> ({vault.assetDecimals} desimal)
          </dd>
          <dt>role_manager (indeks)</dt>
          <dd>
            {vault.roleManager === null ? (
              "belum diindeks"
            ) : (
              <AddressText address={vault.roleManager} />
            )}{" "}
            <span className="provenance">Baris indeks; bukti timelock ada di bagian peran on-chain.</span>
          </dd>
          <dt>accountant</dt>
          <dd>
            {vault.accountant === null ? (
              <span className="provenance">belum diindeks; biaya yang ditampilkan hanyalah biaya terealisasi</span>
            ) : (
              <AddressText address={vault.accountant} />
            )}
          </dd>
          <dt>Blok deploy</dt>
          <dd>{vault.deployedBlock.toString()}</dd>
          <dt>Sumber baris vault</dt>
          <dd>{vault.source}</dd>
          <dt>Laporan strategi terakhir</dt>
          <dd>{lastReport === null ? "belum ada" : `blok ${lastReport.toString()}`}</dd>
        </dl>
        <p className="provenance">
          Parameter dibaca dari indeks, bukan dari node. Umur laporan di atas tidak dihitung menjadi durasi karena
          halaman ini tidak memegang kepala rantai pada saat yang sama.
        </p>
      </section>

      <section className="card stack">
        <h2>Peran on-chain</h2>
        {roles === null ? (
          <SectionError error={rolesError} what="Peran tidak terbaca" />
        ) : (
          <>
            <dl className="facts">
              <dt>role_manager</dt>
              <dd>
                <AddressText address={roles.roleManager} />
              </dd>
              <dt>Timelock?</dt>
              <dd>
                {roles.timelockMinDelaySeconds === null ? (
                  <>
                    Tidak dapat dibuktikan: alamat ini tidak menjawab getMinDelay(). Jangan anggap ini timelock.
                    <br />
                    <span className="provenance">{roles.timelockError}</span>
                  </>
                ) : (
                  <>
                    Menjawab getMinDelay() = {roles.timelockMinDelaySeconds} detik (
                    {Math.floor(roles.timelockMinDelaySeconds / 3600)} jam). Ini TimelockController pada blok ini.
                  </>
                )}
              </dd>
              <dt>Transfer peran tertunda</dt>
              <dd>
                {roles.futureRoleManager === "0x0000000000000000000000000000000000000000" ? (
                  "tidak ada (future_role_manager = 0)"
                ) : (
                  <>
                    <AddressText address={roles.futureRoleManager} />
                    <br />
                    <span className="provenance">
                      Ada calon role_manager yang belum menerima peran. Periksa sebelum menganggap peran stabil.
                    </span>
                  </>
                )}
              </dd>
            </dl>
            <BlockProvenance
              blockNumber={roles.blockNumber.toString()}
              blockTimestamp={roles.blockTimestamp}
              source="onchain"
            />
          </>
        )}
        <p className="provenance">
          VaultV3 tidak punya getter guardian; guardian adalah alamat terpisah di konfigurasi deploy, bukan peran
          on-chain, jadi halaman ini tidak mengarang nilainya. Kepemilikan DEBT_MANAGER dan EMERGENCY_MANAGER juga tidak
          dibaca di sini; matriksnya ada di docs/ROLE_PERMISSION_MATRIX.md.
        </p>
      </section>

      <section className="card stack">
        <h2>Biaya terealisasi</h2>
        <p>
          Biaya yang berlaku (dibaca dari accountant.getVaultConfig pada blok live):{" "}
          {live === null ? (
            "tidak diketahui, angka live gagal dibaca"
          ) : live.performanceFeeBps === null ? (
            "vault tidak punya accountant, jadi tidak ada biaya on-chain"
          ) : (
            <strong>
              performanceFee {percentBps(live.performanceFeeBps)} · managementFee{" "}
              {percentBps(live.managementFeeBps ?? 0)}
            </strong>
          )}
        </p>
        {reportsError !== null ? (
          <SectionError error={reportsError} what="Laporan tidak terbaca" />
        ) : reports.length === 0 ? (
          <p>Belum ada laporan (process_report) yang terindeks.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Blok</th>
                <th>Waktu</th>
                <th>Gain</th>
                <th>Loss</th>
                <th>Biaya</th>
                <th>Refund</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={`${report.txHash}:${report.blockNumber.toString()}`}>
                  <td>{report.blockNumber.toString()}</td>
                  <td>{blockTime(report.blockTimestamp)}</td>
                  <td>
                    <Amount value={report.gain} kind="usdg" />
                  </td>
                  <td>
                    <Amount value={report.loss} kind="usdg" />
                  </td>
                  <td>
                    <Amount value={report.totalFees} kind="usdg" />
                  </td>
                  <td>
                    <Amount value={report.totalRefunds} kind="usdg" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="provenance">
          Tabel di atas hanya biaya yang sudah tercatat di laporan. Tingkat biaya yang berlaku ditampilkan di atas dan
          berasal dari kontrak accountant, bukan dari konfigurasi aplikasi.
        </p>
      </section>

      <section className="card stack">
        <h2>Dokumentasi dan batasan</h2>
        <ul>
          <li>Penarikan: docs/WITHDRAWAL_SEMANTICS.md (12 kasus uji, termasuk max_loss).</li>
          <li>Peran: docs/ROLE_PERMISSION_MATRIX.md.</li>
          <li>Biaya dan batas: docs/FEE_CONFIG.md.</li>
        </ul>
        <p>
          Tidak ada klaim audit untuk kombinasi pin ini. Transaksi deposit dan penarikan belum tersedia di halaman ini;
          itu tiket berikutnya, bukan fitur yang tersembunyi.
        </p>
        <p>
          <Link href="/">Kembali ke katalog</Link>
        </p>
      </section>
    </main>
  );
}
