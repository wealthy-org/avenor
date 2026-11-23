// Vault detail: value, liquidity split, allocation, parameters, roles, and realised fees.
//
// Two rules shape this page:
//   1. Every number carries the block it came from. `live` and `allocation` are read at the same
//      pinned block by the API, so idle + debt == totalAssets is checked before anything renders.
//   2. A section that failed to load says so. It never falls back to zero, because "0 USDG" and
//      "not known" are different answers and only one of them is safe.

import Link from "next/link";
import { createPublicClient, http } from "viem";
import { notFound } from "next/navigation";
import { Amount, AddressText, BlockProvenance, ErrorState, Percent, StatusPill } from "@/components/primitives";
import { readEvidence, type ContractEvidence } from "@/lib/evidence";
import { ApiError } from "@/lib/api";
import { loadVaultDetail, type VaultDetail } from "@/lib/vaultLoader";
import { blockTime, liquiditySplit, percentBps } from "@/lib/format";
import { apiUrl, parseVaultList, type VaultConfig } from "@/config/vaults";
import { latestReportBlock } from "@/lib/vaultView";
import { getDirectVaultDetail } from "@/lib/serverData";

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

  let vaults: VaultConfig[] = [];
  try {
    vaults = parseVaultList(process.env.AVENOR_VAULTS);
  } catch (error) {
    return (
      <div className="shell stack">
        <SectionError error={error} what="Konfigurasi AVENOR_VAULTS rusak" />
      </div>
    );
  }

  // Graceful fallback for staging vault if env was not provided in deployment
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

  let detail: VaultDetail;
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

  const { vault, live, liveError, allocation, allocationError, reports, reportsError, roles, rolesError } = detail;
  const { fees, feesError, roleEvents, roleEventsError } = detail;

  // Read straight from the chain: the artifact in this repo describes what we built, not what the
  // address runs. When the read fails the section says so instead of quoting a local hash.
  let evidence: ContractEvidence | null = null;
  let evidenceError: unknown = null;
  const rpc = process.env.NEXT_PUBLIC_RPC_URL;
  if (typeof rpc !== "string" || rpc.trim() === "") {
    evidenceError = new Error("NEXT_PUBLIC_RPC_URL belum diset, jadi bukti on-chain tidak dibaca");
  } else {
    try {
      const client = createPublicClient({ transport: http(rpc.trim()) });
      evidence = await readEvidence(client, vault.address as `0x${string}`, live === null ? undefined : live.blockNumber);
    } catch (error) {
      evidenceError = error;
    }
  }
  const split = live === null ? null : liquiditySplit({ idle: live.totalIdle, totalAssets: live.totalAssets });
  const lastReport = allocation === null ? null : latestReportBlock(allocation);
  const pendingDeposits = vault.depositLimit === 0n;

  return (
    <div className="shell stack">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono text-[#8b929e] mb-2">
        <Link href="/#vaults" className="hover:text-[#6db89b] transition-colors">
          ← Back to Vaults
        </Link>
        <span>/</span>
        <span className="text-[#f8f9fa]">{config.label}</span>
      </div>

      <header className="rounded-xl bg-[#101b16]/90 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[#14221c] border border-white/[0.12] text-xs font-bold text-[#6db89b]">
                av
              </span>
              <h1 className="font-display text-2xl sm:text-3xl font-medium text-[#f8f9fa]">
                {config.label}
              </h1>
              <StatusPill tone={config.phase === "limited-launch" ? "neutral" : "warn"} text={config.phase} />
            </div>
            <p className="text-sm font-mono text-[#8b929e]">
              <AddressText address={vault.address} /> · {vault.name} ({vault.symbol}) · {vault.shareDecimals} share decimals
            </p>
            {config.mandate === undefined ? null : (
              <p className="text-sm text-[#b0b7c3] leading-relaxed max-w-3xl pt-2 border-t border-white/[0.06]">
                {config.mandate}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href={`/vaults/${vault.address}/deposit`}
              style={{ color: "#0b1310", backgroundColor: "#f8f9fa" }}
              className="inline-flex items-center justify-center rounded-lg bg-[#f8f9fa] !text-[#0b1310] px-5 py-2.5 text-sm font-semibold hover:bg-white transition-colors shadow-[0_0_20px_rgba(255,255,255,0.12)] whitespace-nowrap cursor-pointer"
            >
              Deposit USDG →
            </Link>
            <Link
              href={`/vaults/${vault.address}/withdraw`}
              className="inline-flex items-center justify-center rounded-lg border border-white/[0.14] bg-[#14221c] text-[#f8f9fa] px-5 py-2.5 text-sm font-medium hover:bg-white/[0.08] transition-colors whitespace-nowrap cursor-pointer"
            >
              Withdraw USDG →
            </Link>
          </div>
        </div>
      </header>

      <div className="banner" data-tone="warn">
        <strong>Nilai posisi bukan janji likuiditas.</strong>
        <p>
          Kas idle dapat dipakai untuk penarikan sekarang; dana yang ditempatkan di venue belum tentu cair dan
          bergantung pada antrean strategi. Halaman ini tidak menampilkan APY.
        </p>
      </div>

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
        <h2>Riwayat biaya</h2>
        {feesError !== null ? (
          <SectionError error={feesError} what="Riwayat biaya tidak terbaca" />
        ) : fees.length === 0 ? (
          <p>Belum ada event biaya yang terindeks. Kosong berarti tidak ada baris, bukan nol biaya.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Blok</th>
                <th>Waktu</th>
                <th>Jenis</th>
                <th>Penerima</th>
                <th>Share</th>
                <th>Aset</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((fee) => (
                <tr key={`${fee.txHash}:${fee.kind}:${fee.blockNumber.toString()}`}>
                  <td>{fee.blockNumber.toString()}</td>
                  <td>{blockTime(fee.blockTimestamp)}</td>
                  <td>{fee.kind}</td>
                  <td>{fee.recipient === null ? "—" : <AddressText address={fee.recipient as `0x${string}`} />}</td>
                  <td>{fee.shares === null ? "—" : <Amount value={fee.shares} kind="shares" />}</td>
                  <td>{fee.assets === null ? "—" : <Amount value={fee.assets} kind="usdg" />}</td>
                  <td className="provenance">{fee.txHash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card stack">
        <h2>Riwayat peran</h2>
        {roleEventsError !== null ? (
          <SectionError error={roleEventsError} what="Riwayat peran tidak terbaca" />
        ) : roleEvents.length === 0 ? (
          <p>Belum ada event peran yang terindeks.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Blok</th>
                <th>Waktu</th>
                <th>Akun</th>
                <th>Bit</th>
                <th>Aksi</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {roleEvents.map((event) => (
                <tr key={`${event.txHash}:${event.blockNumber.toString()}`}>
                  <td>{event.blockNumber.toString()}</td>
                  <td>{blockTime(event.blockTimestamp)}</td>
                  <td>
                    <AddressText address={event.account as `0x${string}`} />
                  </td>
                  <td>{event.roleBit === null ? "bitmap" : event.roleBit}</td>
                  <td>{event.granted === null ? "perubahan" : event.granted ? "diberi" : "dicabut"}</td>
                  <td className="provenance">{event.txHash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card stack">
        <h2>Bukti kontrak</h2>
        {evidenceError !== null ? (
          <SectionError error={evidenceError} what="Bukti on-chain tidak terbaca" />
        ) : evidence === null ? (
          <p>Tidak ada bukti yang bisa ditampilkan.</p>
        ) : (
          <dl className="facts">
            <dt>Alamat vault</dt>
            <dd>
              <AddressText address={evidence.address as `0x${string}`} />
            </dd>
            <dt>apiVersion()</dt>
            <dd>
              {evidence.apiVersion ?? (
                <span className="provenance">tidak terbaca: {evidence.apiVersionError}</span>
              )}
            </dd>
            <dt>Hash runtime code</dt>
            <dd>
              {evidence.codeHash === null ? (
                <span className="provenance">tidak ada kode pada blok ini</span>
              ) : (
                <code>{evidence.codeHash}</code>
              )}
            </dd>
            <dt>Ukuran code</dt>
            <dd>{evidence.codeSize} byte</dd>
            <dt>Dibaca pada blok</dt>
            <dd>{evidence.blockNumber.toString()}</dd>
          </dl>
        )}
        <p className="provenance">
          Hash di atas dihitung dari `eth_getCode` pada blok tersebut, bukan dari artefak build lokal. Kecocokan dengan
          artefak hanya boleh diklaim setelah `scripts/verify-bytecode.py` dijalankan pada commit yang sama.
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
          Tidak ada klaim audit untuk kombinasi pin ini. Form deposit dan penarikan ada di rute terpisah dan mengirim
          parameter eksplisit; tidak ada tombol transaksi di halaman ini.
        </p>
        <p>
          <Link href="/#vaults" className="text-[#6db89b] hover:underline">
            ← Kembali ke katalog
          </Link>
        </p>
      </section>
    </div>
  );
}
