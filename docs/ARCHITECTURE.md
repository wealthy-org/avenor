# ARCHITECTURE — Avenor Managed Strategy Vaults

Fondasi kontrak: Yearn V3 Allocator Vault (`VaultV3.vy@f449264f`, API `3.1.1`). Produk: **USDG Managed Yield** di Robinhood Chain (`4663`). Kassora hanya referensi UX.

Prinsip: core Yearn **tidak diubah**; semua logika produk hidup di adapter strategi, periphery, service, dan app. Bila sebuah kebutuhan tidak bisa dipenuhi tanpa mem-patch Vyper, kebutuhan itu ditolak atau ditunda.

## 1. Peta repo (target)

```
/
├─ docs/                          # deliverable brief §17 (lihat §9)
├─ packages/
│  ├─ contracts/                  # Foundry: adapter + script + test
│  │  ├─ src/strategies/MorphoVaultStrategy.sol
│  │  ├─ src/hooks/DepositCapHook.sol
│  │  ├─ src/interfaces/IVaultV3.sol        # GENERATED dari packages/core/artifacts
│  │  ├─ src/interfaces/IVaultFactory.sol   # GENERATED dari packages/core/artifacts
│  │  ├─ src/interfaces/IMorphoVaultV2.sol  # subset venue, tiap fungsi bertanda bukti
│  │  ├─ src/interfaces/{IStrategy,IAccountant}.sol
│  │  ├─ script/Deploy.s.sol
│  │  ├─ test/unit/, test/fork/, test/invariant/
│  │  ├─ lib/                     # vendored + hash-verified (lihat lib/VENDOR.md)
│  │  └─ foundry.toml             # solc 0.8.18, evm paris, optimizer 200, auto_detect_solc=false
│  ├─ core/                       # artefak beku VaultV3/VaultFactory (JSON) + sumber pin, bukan sumber Vyper yang diedit
│  ├─ sdk/                        # viem: kontrak, hook, formatter, simulasi tx
│  └─ config/                     # addresses per chainId + venue registry (JSON, versioned)
├─ apps/
│  ├─ web/                        # Next.js App Router + Tailwind: katalog, detail, transaksi, portfolio, transparency
│  └─ admin/                      # ops: report status, peran, venue cap, insiden
├─ services/
│  ├─ indexer/                    # event → Postgres (share price snapshot, TVL, fees, peran)
│  └─ keeper/                     # report, tend, alokasi, monitor likuiditas, alert
└─ infra/                         # docker compose lokal, deploy manifest, monitoring config
```

Alasan monorepo: `packages/config` dipakai bersama app, indexer, keeper, dan script deploy; satu sumber alamat mencegah indexer membaca vault berbeda dari yang dipakai frontend.

## 2. Kontrak

### 2.1 Yang kita deploy (bukan yang kita tulis ulang)

| Kontrak | Sumber | Peran |
|---|---|---|
| `VaultFactory` | Vyper upstream, bytecode direproduksi | melahirkan vault USDG + menyimpan protocol fee config |
| `VaultV3` (clone per produk) | Vyper upstream | ERC-4626 + accounting + roles |
| `RoleManager` atau `TimelockExecutor` + OZ `TimelockController` | periphery | pemegang `role_manager` |
| `Accountant` | periphery | performance fee, healthcheck |
| `MorphoVaultStrategy` | **kita** (Solidity, TokenizedStrategy) | adapter ke venue ERC-4626 |
| `DepositCapHook` (opsional) | **kita** | cap per wallet + allowlist fase terbatas |

### 2.2 Adapter strategi (kontrak kita, satu-satunya kode baru yang memegang dana)

```solidity
contract MorphoVaultStrategy is BaseStrategy {
    IMorphoVaultV2 public immutable venue;   // steakUSDG (ERC-4626), dikunci saat deploy
    address public immutable ASSET;          // USDG
    // Tidak ada cap di adapter: batas alokasi = `deposit_limit` + debt cap vault,
    // dibatasi lagi oleh `availableDepositLimit()` yang membaca venue.

    function availableDepositLimit(address) external view returns (uint256);
    function _deployFunds(uint256 amount) internal override;
    function _freeFunds(uint256 amount) internal override;
    function _harvestAndReport() internal override returns (uint256);
    function _tend(uint256) internal override;         // no-op di v1
    function availableWithdrawLimit(address) external view returns (uint256);
}
```

Kontrak aturan:

- Tidak ada state yang bisa diubah oleh keeper selain lewat `TokenizedStrategy` (`management`, `keeper`, `emergencyAdmin`).
- `_freeFunds` **revert** `VenueLiquidityShortfall(requested, available)` bila venue tidak bisa membayar penuh (ADR di `WITHDRAWAL_SEMANTICS.md` §3). Mengembalikan dana sebagian membuat `TokenizedStrategy._withdraw` memperlakukannya sebagai loss dan membakar seluruh share user; revert menjaga `max_loss` tetap berarti.
- `_deployFunds` **tidak** revert saat venue menolak: USDG tetap idle dan event `VenueDepositSkipped(amount, reason)` dipancarkan, supaya venue yang tutup tidak mematikan jalur `deposit` vault. `maxDeposit = 0` dari venue **tidak** dipercaya (venue ini membalas `0` sambil menerima deposit) — `availableDepositLimit()` melaporkan `type(uint256).max` dan deposit dicoba.
- Nilai balik `venue.withdraw` **tidak** dipakai: venue ini mengembalikan share yang dibakar (18 desimal), bukan asset. `_freeFunds` mengukur delta `USDG.balanceOf(strategy)`.
- Semua panggilan ke venue memakai `safeTransfer`/`forceApprove` dan allowance di-reset ke 0 di kedua jalur (sukses maupun ditolak).
- Tidak ada oracle sendiri di v1: nilai = `venue.convertToAssets(balance)`, titik.

### 2.3 Alur dana

```
deposit(USDG) → VaultV3.total_idle → update_debt(keeper) → Strategy → venue.deposit
withdraw      → VaultV3.total_idle → (kurang) → Strategy._freeFunds → venue.withdraw → vault → user
report        → Strategy._harvestAndReport → VaultV3._process_report → Accountant.report → shares
```

Tidak ada jalur di mana keeper bisa memindahkan USDG ke alamat arbitrary: `update_debt` hanya mengirim ke strategi yang terdaftar, dan strategi hanya bisa mengirim ke vault atau venue.

## 3. Layanan off-chain

### 3.1 Indexer

- Sumber: RPC (bukan explorer API; explorer diblokir Cloudflare).
- Event wajib: `Deposit`, `Withdraw`, `Transfer`, `StrategyReported`, `StrategyAdded`, `StrategyRevoked`, `DebtUpdated`, `UpdateDepositLimit`, `UpdatePaused`, `UpdateAutoAllocate`, `RoleSet`, `Shutdown`, `Approval`.
- Tabel: `vaults`, `strategies`, `share_price_snapshots`, `positions`, `reports`, `fees`, `role_events`, `venue_snapshots`, `ingestion_checkpoints`.
- Idempotensi: unique `(chainId, txHash, logIndex)`; reorg: simpan `blockHash`, rollback bila hash berubah (kedalaman finality mengikuti chain; minimal 12 blok atau konfirmasi RPC).
- Rekonsiliasi harian terhadap `totalAssets()/totalSupply()/totalIdle()/totalDebt()` (lihat `ACCOUNTING.md` §8).
- Read-only: tidak ada private key di indexer.

### 3.2 Keeper

| Job | Frekuensi | Guard |
|---|---|---|
| `process_report(strategy)` | tiap 24 jam atau bila gain/loss > ambang | simulasi dulu (`eth_call`), hormati `maxGain`/`maxLoss` Accountant |
| `update_debt` alokasi target | tiap 6 jam | batas `targetRatio`/`maxRatio`, `minimum_total_idle`, cap venue |
| `tend()` strategi | bila `tendTrigger` true | no-op di v1 (venue pasif) |
| monitor likuiditas venue | tiap 15 menit | alarm bila `USDG.balanceOf(venue)` (kas idle) turun > 25%/24 jam — **bukan** `venue.maxWithdraw()`, yang membalas `0` di venue utama walau kas ada |
| health: `maxDeposit`, `paused`, `shutdown` | tiap 5 menit | alert ke on-call |

Keeper = hot wallet dengan gas saja, tanpa izin `REVOKE`/`FORCE_REVOKE`/`EMERGENCY`. Dry-run wajib: setiap tx disimulasikan, dan kegagalan simulasi menjadi alert, bukan retry buta.

## 4. Keputusan arsitektur (ADR)

**ADR-1 — Pakai Yearn V3 Allocator Vault apa adanya.** Accounting, role, dan withdrawal semantics sudah teruji bertahun-tahun dan diaudit. Menulis vault sendiri berarti mengulang seluruh kelas bug (share inflation, rounding, fee accounting) tanpa keuntungan diferensiasi. Konsekuensi: fitur yang tidak didukung core (mis. exit tanpa jeda saat loss) tidak dijual.

**ADR-1 amendemen (2026-11-19) — strategi tidak men-deploy `TokenizedStrategy` baru.** `BaseStrategy.tokenizedStrategyAddress` di-hardcode (constant di source, bukan storage), jadi tidak bisa dioverride saat deploy. Karena itu strategi Avenor memakai implementasi kanonik yang **sudah ada di chain 4663**: `0x3110D1Eec90f0651C18e75AD37711A8777342504`, runtime 18.224 B, keccak identik dengan deployment mainnet setelah mask immutable `factory` + metadata CBOR (18.171 B, 0 beda). Kalau kita men-deploy ulang implementasi sendiri, bytecode strategi kita akan menunjuk alamat yang tidak dikenal tooling/Morpho dan menambah permukaan kesalahan tanpa manfaat. Konsekuensi: kita bergantung pada implementasi yang sudah terpasang dan tidak bisa menambal bug di sana — mitigasinya adalah pin versi + `docs/SECURITY_DIFF.md`, bukan deploy sendiri.

**ADR-2 — Deploy factory sendiri di `4663`.** Belum ada factory Yearn V3 resmi di chain ini, dan `ymvST-USDG` adalah Morpho vault yang dikurasi Yearn, bukan infrastruktur V3. **Terkonfirmasi on-chain:** alamat `VaultFactory` Yearn `0x444045c5…` di chain 4663 ber-codesize 0, sedangkan `TokenizedStrategy` impl dan factory-nya ada. Kita deploy `VaultFactory` dari bytecode yang direproduksi (`0xdfc2a101…ddec2` runtime, 3.604 B), dan mendokumentasikan alamatnya. Risiko: bukan deployment kanonik, jadi tidak ada jaminan tooling Yearn mengenali vault kita.

**ADR-3 — Venue utama `steakUSDG` (Morpho Vault V2), bukan Morpho Blue langsung.** Vault V2 memberi diversifikasi internal + kurator yang menanggung risiko kredit; Morpho Blue langsung menaruh risiko pada pasar tunggal. Konsekuensi: fee ganda (venue + vault) dan ketergantungan pada kurator pihak ketiga.

**ADR-4 — `role_manager` = `TimelockController` 48 jam sejak hari pertama.** Tanpa ini, tidak ada jaminan "delayed control" walau dokumen mengklaimnya. Guardian `EMERGENCY_MANAGER` dipisah agar pause tetap instan.

**ADR-5 — Freeze risiko baru lewat `deposit_limit`/`deposit_hook`, bukan `setPaused`.** `setPaused` memblokir penarikan (`:774`); memakainya untuk "stop deposit" akan melanggar janji exit. `setPaused` hanya untuk insiden aktif, dengan copy UI yang jujur.

**ADR-6 — `auto_allocate = false`, `use_default_queue = true`.** Alokasi eksplisit oleh keeper (bisa diaudit per tx), urutan penarikan ditetapkan protokol (tidak bisa dimanipulasi user).

**ADR-7 — Anti share-inflation: seed + minimum deposit, bukan virtual shares.** Core tidak punya decimals offset. Seed treasury 1.000 USDG saat inisialisasi (dibiarkan permanen sebagai dead shares) + minimum deposit 10 USDG. Didokumentasikan di UI sebagai "vault seeded".

**ADR-8 — Tidak ada proxy di depan vault.** Vault V3 tidak upgradeable. "Upgrade" = vault baru + migrasi sukarela user; tidak ada pemindahan state diam-diam.

**ADR-9 — Indexer dari RPC langsung, Postgres sebagai cache.** Tidak ada dependensi pada Blockscout (diblokir) atau subgraph pihak ketiga. Semua angka bisa diverifikasi ulang dari chain.

**ADR-10 — Fee: performance fee 10%, management fee 0.** Hindari interaksi aneh `maxFee` × `gain == 0` (`FEE_CONFIG.md` §2) dan hindari menagih saat rugi.

**ADR-11 — `Yearn-ERC4626-Router` ditolak; app memanggil vault langsung.** `BASELINE.md` §1 sempat merencanakan vendor Router `fc96fe36`, tapi tidak ada satu pun kebutuhan produk yang menuntutnya: sembilan panggilan yang dipakai app (`deposit`, `mint`, `withdraw`, `redeem`, `previewDeposit`, `previewRedeem`, `maxWithdraw`, `maxRedeem`, `convertToAssets`) semuanya ada di ABI vault. Router akan menambah kontrak AGPL di jalur transaksi, menambah satu lapisan `approve`/`transferFrom` yang bisa salah, dan menyembunyikan nilai `max_loss` di balik helper — padahal `max_loss` wajib eksplisit di setiap pemanggilan (aturan produk 2). Konsekuensi: `max_loss` disusun SDK per panggilan, dan slippage penarikan menjadi tanggung jawab app, bukan diserahkan ke helper pihak ketiga. Bila kelak dibutuhkan zap multi-langkah, itu ADR baru dengan test kompatibilitas sendiri di `COMPATIBILITY_MATRIX.md`, bukan diam-diam menambah dependency. Bukti matriks: `docs/COMPATIBILITY_MATRIX.md`.

**ADR-12 — Dua kecepatan governance: 48 jam untuk parameter, 6 jam untuk de-risking.** Brief meminta
jalur cepat yang dibatasi untuk "pengurangan eksposur dan tindakan darurat" (avenor.md baris 218).
Yang di-deploy karena itu dua `TimelockController` terpisah, dengan himpunan peran yang **tidak
beririsan**:

| Timelock | Delay | Proposer | Peran |
|---|---|---|---|
| governance | 48 jam | Safe 3/5 governance | `role_manager` + 9 bit parameter (`governanceRoleSet()`) |
| emergency | 6 jam | Safe 3/5 guardian | `FORCE_REVOKE_MANAGER` saja (`emergencyRoleSet()`) |

`FORCE_REVOKE_MANAGER` **tidak** ada di guardian Safe dan **tidak** ada di timelock governance, jadi
satu kunci yang dicuri tidak bisa menarik strategi seketika, dan timelock governance tidak bisa
menghindari delay 48 jam untuk aksi yang merugikan pemegang share. Batas kerusakan fast lane sempit
secara konstruksi: `force_revoke_strategy` hanya bisa mencabut strategi dan merealisasikan loss yang
sudah ada ke harga share; ia tidak bisa mengubah parameter, membuka deposit, atau memindahkan
`role_manager`. Pause (`EMERGENCY_MANAGER`) tetap di guardian Safe tanpa delay **karena** ia
memblokir penarikan: memakainya untuk de-risking akan mengubah insiden menjadi antrean exit.
Konsekuensi jujur: dua proposer Safe harus dijaga terpisah (aturan §2.1 matriks peran), dan
`TimelockExecutor` Yearn tidak dipakai sama sekali (ADR-4 tetap).

**ADR-13 — `DepositCapHook` menjadi satu-satunya plafon deposit saat aktif, dan hidup di timelock
governance.** `VaultV3._max_deposit` membaca `deposit_hook` **menggantikan** `deposit_limit`
(`:543-546`), dan memasang hook menuntut `deposit_limit == max` (`:1458-1487`). Jadi begitu hook
dipakai, `deposit_limit` berhenti menjadi angka yang bisa dibaca sebagai batas — mempertahankan
keduanya berarti dua sumber kebenaran yang cepat atau lambat berbeda. Konsekuensi yang dipilih:

- Tiga batas di hook: allowlist fase terbatas, cap global atas `vault.totalAssets()`, dan cap per
  wallet atas `convertToAssets(balanceOf(receiver))`. **Diukur langsung, bukan dihitung dari
  counter**: tidak ada `post_withdraw`, jadi counter akan melenceng dan entah memblokir user jujur
  atau meloloskan cap. `post_deposit` hanya mencatat (`totalRecordedDeposits`, event) dan
  memeriksa ulang cap sebagai jaring pengaman.
- Cap per wallet hanya membatasi `deposit`/`mint`. Share yang masuk lewat `transfer` bisa melewati
  cap; hook lalu melaporkan `0` sampai posisi turun. Allowlist transfer adalah keputusan
  `transfer_hook` (matriks peran §1), bukan keputusan deposit — mencampurnya akan memblokir exit.
- Hook **tidak pernah** menyentuh jalur penarikan (`maxWithdraw`/`redeem` tidak membacanya), jadi
  cap 0 atau allowlist yang menolak semua tetap mengizinkan exit penuh. ADR-5 bergantung pada ini
  dan `test/unit/DepositCapHook.t.sol::test_rejectEveryoneStillAllowsFullExit` menguncinya.
- Semua setter `onlyGovernance` = timelock 48 jam, tanpa delay tambahan di hook: satu tempat
  menunggu lebih mudah dibuktikan daripada dua. `DEPOSIT_LIMIT_MANAGER` di vault tidak bisa
  mengganti governance hook maupun membukanya.
- Pembulatan: `convertToAssets` membulatkan ke bawah, sehingga maksimum 1 wei di atas cap bisa
  lolos. Itu arah pembulatan vault sendiri; test menulis `<= 1` alih-alih mengklaim eksak.

**ADR-14 — Data plane memakai SQL mentah, angka sebagai string, dan provenance wajib; SDK
membangkitkan ABI dari artefak, bukan dari dokumentasi.** Permukaan baca (indexer, API, SDK) adalah
tempat paling mudah kehilangan kejujuran angka, jadi keputusannya ditulis di kode dan diuji:

- **Migrasi = SQL + runner sendiri** (`services/indexer/src/migrate.ts`), bukan framework. Checksum
  sha256; migrasi yang diedit sesudah apply ditolak, bukan dilewati. Alasan: skema ini berisi
  constraint yang menjaga uang (`positions_non_negative`, `fee_kind`), dan framework dengan
  "baseline" diam-diam akan menyembunyikan migrasi yang berubah.
- **Tanpa FK dari tabel event ke katalog vault/strategi.** Urutan ingestion tidak boleh menentukan
  apakah sebuah `Transfer` tercatat; rekonsiliasi yang menangkap katalog bolong. Katalog hanya
  di-UPDATE, tidak pernah menghapus riwayat event.
- **`numeric(78,0)`, bukan float, dan bukan `Number` di mana pun.** Semua `uint256` keluar API
  sebagai string; `JSON.parse` pada supply 27 digit sudah kehilangan presisi sebelum UI melihatnya.
- **Satu header per chunk** (`ingested_blocks`) menyimpan timestamp, hash batas, dan checkpoint
  sekaligus. Rollback memakai hash batas itu untuk menemukan ancestor; tidak ada yang cocok di dalam
  `reorgWindow` → `DeepReorgError`, cursor berhenti. `positions` adalah turunan dan dibangun ulang
  dari `share_transfers`, dengan zero address dikecualikan (mint bukan saldo).
- **Rekonsiliasi dengan `toleranceBps` wajib** dan supply dibandingkan eksak; lihat
  `docs/ACCOUNTING.md` §8.1. "Tidak ada riwayat" dilaporkan `insufficient-history`, bukan lulus.
- **SDK**: ABI dibangkitkan dari `packages/core/artifacts/VaultV3.json` (artefak yang di-hash
  `scripts/verify-bytecode.py`) dan dijaga `scripts/gen-sdk-abi.py --check` di gate. `maxLoss` wajib
  per panggilan withdraw/redeem dan `10_000` ditolak; setiap `prepare*` menjalankan
  `simulateContract` sebelum mengembalikan request. `maxWithdraw` dan kas idle **tidak** digabung
  menjadi satu angka "bisa ditarik" (aturan produk 4).
- **API**: `node:http`, read-only, setiap angka membawa `blockNumber`, `blockTimestamp`, dan `source`;
  `live` tanpa `?block=` memakai checkpoint terakhir supaya "latest" tidak berarti dua blok berbeda
  dalam satu sesi. Tidak ada field APY.

Konsekuensi jujur: indexer belum punya penjadwalan/alert (epik 6), reorg diuji pada anvil lokal
(`scripts/reorg-test.py`), belum pada `4663` — memaksa reorg di chain publik bukan sesuatu yang bisa
dilakukan dengan jujur dari sini.

## 5. Alur deployment (deterministik, dapat diulang)

1. Reproduksi bytecode: `scripts/compile-vault.py` (Vyper `0.3.10+commit.9136169`, `--optimize codesize --evm-version paris`) → bandingkan ke `packages/core/artifacts/*.json` (keccak256 runtime). Verifikasi ulang dengan `scripts/verify-bytecode.py all` (harus `14/14 checks passed`). Gagal = stop.
2. Deploy **blueprint** `VaultV3` = runtime bytecode hasil langkah 1 apa adanya (tanpa perubahan satu byte; `runtimeKeccak256` harus tetap `0x6909c58e…`), lalu `VaultFactory(name, vault_original=blueprint, governance=Timelock)`. Langkah blueprint tidak bisa dilewati: `VaultFactory.deploy_new_vault` memakai `create_minimal_proxy_to(VAULT_ORIGINAL, ...)` (`referensi/yearn-vaults-v3/contracts/VaultFactory.vy:130-131`), dan di rantai 4663 belum ada deployment `VaultV3` Yearn (ADR-2). Yang kita deploy adalah bytecode yang sudah diverifikasi, bukan vault baru dengan nama sama.
3. `deploy_new_vault(address asset, string name, string symbol, address role_manager, uint256 profit_max_unlock_time)` → vault. Ini signature **persis** dari ABI pin (`packages/core/artifacts/VaultFactory.json`), bukan bentuk lama `(asset, governance, rewards, deposit_limit, ...)` yang beredar di catatan versi sebelumnya: pin `f449264f` tidak punya parameter `governance`/`rewards`/`deposit_limit` di entry point ini. `deposit_limit` diset sesudahnya lewat `set_deposit_limit`, dan `role_manager` adalah satu-satunya otoritas yang di-wire di sini.
4. Deploy `MorphoVaultStrategy(asset, venue, name)` — signature sebenarnya; tidak ada argumen `vault` karena `TokenizedStrategy` tidak menyimpan referensi ke vault (lihat `docs/DEPLOYMENT.md` §3). Lalu `add_strategy(strategy, true)`, `update_max_debt_for_strategy`, `set_minimum_total_idle`, `set_use_default_queue(true)`.
5. Deploy `Accountant` + `set_accountant`, set `performanceFee/maxGain/maxLoss` (epik 3; `Deploy.s.sol` meng-assert `accountant == address(0)` sampai itu ada).
6. Seed vault (dead shares), `deposit_limit` awal kecil.
7. Grant peran sesuai `ROLE_PERMISSION_MATRIX.md` §2, **verifikasi timelock aktif** sebelum `deposit_limit > 0`.
8. Verifikasi source di explorer (bila API tersedia) + publikasi `deployments/4663.json`.
9. Transaksi proof: deposit kecil, report, withdraw — hash dicatat di `ACCEPTANCE_EVIDENCE.md`.

Semua langkah memakai script `Deploy.s.sol` dengan `--broadcast` hanya setelah dry-run `-vvv` dan review dua orang. Detail operasional (mode, env var, assert, rehearsal anvil, pending actions) ada di `docs/DEPLOYMENT.md`.

### 5.1 Build settings `packages/contracts` (sumber: `foundry.toml` + `remappings.txt`)

| Setting | Nilai | Alasan |
|---|---|---|
| `solc` | `0.8.18` | `BaseStrategy`/`TokenizedStrategy` pin `pragma solidity 0.8.18` |
| `auto_detect_solc` | `false` | pragma range tidak boleh memilih compiler lain |
| `evm_version` | `paris` | sama dengan `vyper --evm-version paris` core; hindari `PUSH0` |
| `optimizer` / `optimizer_runs` | `true` / `200` | sama dengan build `TokenizedStrategy` pin |
| `via_ir` | `false` | menghindari perbedaan bytecode karena pipeline berbeda |
| `bytecode_hash` / `cbor_metadata` | `ipfs` / `true` | eksplisit: metadata mengubah hash runtime |

```
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
tokenized-strategy/=lib/tokenized-strategy/src/
forge-std/=lib/forge-std/src/
```

Remapping hanya ada di `remappings.txt` (tidak diduplikasi di `foundry.toml`). `lib/` berisi source yang di-vendor dengan hash, bukan submodule yang menunjuk branch (`lib/VENDOR.md`).


## 6. Model ancaman ringkas

| Aktor | Bisa apa | Mitigasi |
|---|---|---|
| Keeper compromise | report palsu, alokasi buruk | `maxGain`/`maxLoss` Accountant, cap venue, tanpa izin revoke |
| Guardian compromise | pause total | 3/5 terpisah dari timelock proposer; event publik + alarm |
| Kurator venue | fee naik, likuiditas turun, kapasitas deposit turun (ukur lewat percobaan deposit, bukan `maxDeposit`) | cap konsentrasi, monitoring kas idle venue (`USDG.balanceOf(venue)`), exit path diuji |
| User | front-run report? tidak relevan (pps naik linear) | profit unlock 7 hari menahan lonjakan |
| MEV/sandwich | deposit/withdraw 1:1 USDG → tidak ada swap | tidak ada DEX di jalur |
| Chain halt / RPC | data basi | UI menampilkan `data as of block N`, bukan angka tanpa asal |

## 7. Testing strategy

- **Unit**: semua jalur adapter (venue cap, fee, revert), hook deposit, perhitungan.
- **Fork (`4663`)**: `steakUSDG` asli; deposit → report → withdraw penuh; uji kas idle venue lebih kecil dari nilai posisi (bukan `maxWithdraw` — lihat `VENUE_INTEGRATIONS.md` §4).
- **Invariant**: `total_assets ≥ total_idle`, `Σ current_debt == total_debt`, `total_supply` konsisten dengan event, tidak ada share gratis.
- **Stateful fuzz**: deposit/withdraw/report acak dengan max_loss acak; bandingkan dengan model referensi di Python.
- **Echidna/Medusa** (opsional, bila waktu): property `pps` monoton terhadap gain bersih.

## 8. Roadmap slice (selaras epik)

| Slice | Isi | Gate keluar |
|---|---|---|
| S0 | Baseline, toolchain, `forge build`, reproduksi bytecode | `BASELINE.md` §6 semua tercentang |
| S1 | Fork test core + adapter minimal + `Deploy.s.sol` | deposit/withdraw/report jalan di fork |
| S2 | Indexer + SDK + app read-only (katalog, detail, transparency) | angka cocok dengan on-chain |
| S3 | Transaksi deposit/withdraw end-to-end + error states | 12 kasus `WITHDRAWAL_SEMANTICS.md` §6 tertutup |
| S4 | Keeper + monitoring + runbook insiden | report otomatis stabil 7 hari |
| S5 | Audit/review eksternal + perbaikan | temuan kritis nol |
| S6 | Launch terbatas (cap kecil, allowlist) + proof transaksi | cap terisi tanpa insiden; evidence lengkap |

## 9. Deliverable dokumen (brief §17) → status

| File | Isi | Status |
|---|---|---|
| `docs/BASELINE.md` | pin versi, toolchain, konflik kombinasi, DoD | ✅ |
| `docs/REFERENCE_CAPTURE.md` | register bukti Yearn/Kassora/chain + gap | ✅ |
| `docs/ARCHITECTURE.md` | dokumen ini | ✅ |
| `docs/ACCOUNTING.md` | definisi angka, fee, report | ✅ |
| `docs/WITHDRAWAL_SEMANTICS.md` | pause/shutdown/queue/max_loss | ✅ |
| `docs/VENUE_INTEGRATIONS.md` | gate venue + adapter + data lapangan | ✅ |
| `docs/FEE_CONFIG.md` | tiga lapis fee + parameter v1 | ✅ |
| `docs/ROLE_PERMISSION_MATRIX.md` | bit role → fungsi → pemegang | ✅ |
| `docs/SECURITY_DIFF.md` | diff commit 2026 vs audit 2023 | ⛔ belum (butuh `forge`/diff tooling) |
| `docs/ACCEPTANCE_EVIDENCE.md` | tx hash, alamat, screenshot | ⛔ belum (butuh deployment) |
| `docs/DEPLOYMENT.md` | mode, urutan, env var, assert, pending actions | ✅ |
| `docs/RUNBOOK.md` | insiden, pause, revoke, migrasi | ⛔ belum |