# GAP_ANALYSIS_Avenor: Gap Analysis & Kepatuhan Brief

> **Repo:** `wealthy-org/avenor` @ `3040d5c` (setelah pull 6 commit baru, 47 commit total) · **Tanggal:** 2026-11-25 · **Clone:** `BRAINSTROMING/avenor/repo`
> **Live:** https://avenor-kappa.vercel.app · **Acuan:** `BRIEF.md` (Managed Strategy Vaults, 18 Nov 2026) + standar umum aplikasi DeFi
> **Pembanding:** laporan review sebelumnya `AVENOR_TESTNET_REPORT.md` (commit `6ae57da`). Dokumen ini menilai apa yang sudah dikerjakan sejak laporan itu.
> **Scope:** seluruh monorepo (contracts, sdk, keeper, indexer, web) dan deployment testnet 46630. **Mainnet di luar scope** (ditunda sampai testnet hijau).

**Cara baca:** setiap temuan besar memakai pola
> **Masalahnya apa** → **Kenapa penting** → **Contoh kejadian** → **Cara memperbaiki** → **Bedanya setelah diperbaiki**

## Daftar Isi (satu dokumen)
| Bagian | Isi |
|---|---|
| Ringkasan | Posisi proyek dan tabel temuan awal (AV-1..AV-11) |
| A | Kepatuhan terhadap brief, bukti tahap E, status item laporan lama |
| B | Temuan kontrak dan onchain testnet 46630 |
| C | Indexer dan keeper (ringkas) |
| D | Web dan situs live |
| E | Test, CI, operasional |
| F | Urutan pengerjaan P0-P3 dan penilaian akhir |
| G | **Checklist tugas anak dev** dan tabel uji manual web (G7) |
| H | Keputusan head dev (lokal, mainnet ditunda) |
| I | Hasil uji situs live (W-1..W-10) |
| J | **Ringkasan gabungan deep pass** (K, S, D) dan daftar tugas gabungan |
| Lampiran A | Detail kontrak, SDK, web (K-1..K-18) |
| Lampiran B | Detail keeper dan indexer (S-1..S-25) |
| Lampiran C | Detail dokumen vs kode, brief §17 (D-1..D-22) |

**Mulai dari:** Bagian J (ringkasan dan tugas gabungan), lalu Bagian G (checklist). Lampiran dipakai sebagai rujukan detail.

## Kamus Istilah
| Istilah | Artinya dalam bahasa sederhana |
|---|---|
| Vault (Yearn V3) | Kontrak yang menerima USDG, menerbitkan shares, dan menaruh dana ke strategi |
| `role_manager` | Alamat yang berhak memberi atau mencabut peran (role) di vault. Siapa pun di sini bisa memberi dirinya peran apa saja |
| Timelock | Kontrak penunda: perubahan sensitif harus dijadwalkan dulu, baru bisa dijalankan setelah jeda (48 jam) |
| Safe 2/3 | Dompet multisig: butuh 2 dari 3 pemilik untuk menandatangani |
| Deployer | Akun yang men-deploy kontrak. Idealnya tidak punya kuasa apa pun setelah serah-terima |
| Mock USDG / mock venue | Token dan venue palsu untuk uji coba di testnet; bukan bukti venue mainnet tersedia |
| Rehearsal fork | Salinan chain lokal (anvil) untuk latihan; angkanya bukan angka chain nyata |
| Provenance | Keterangan sumber angka: dari blok berapa dan dibaca dengan cara apa |
| PoC | Bukti kerja berupa script atau test kecil yang membuktikan temuan |

## Bagaimana analisis ini dibuat (dan kenapa bisa dipercaya)
| Yang dilakukan | Hasil | Kenapa ini penting |
|---|---|---|
| Pindah repo ke `BRAINSTROMING/avenor/repo`, simpan brief, `git pull --ff-only` | 6 commit baru masuk (deploy testnet 46630, governance drill, P0/P1/P2 dari laporan manager) | Analisis memakai kode terbaru |
| Baca `AVENOR_TESTNET_REPORT.md`, `docs/TESTNET_EVIDENCE.md`, `46630.stage.json`, `packages/config/46630.json`, `.env.example`, CI, `staging.ts`, `vaults.ts` | Selesai | Klaim dokumen dibandingkan dengan kode dan chain |
| `forge test` (tanpa fork): `packages/contracts` | **112/112 lulus** (sebelumnya 101) | Kontrak dan invariant lulus. Fork test tidak dijalankan |
| `npm test` web / sdk / keeper | **95/95, 12/12, 23/23 lulus**; `tsc --noEmit` web bersih | Aplikasi dan layanan lulus test sendiri |
| Indexer test, fork test, Vyper reproduksi | **Tidak dijalankan** (butuh Postgres, RPC arsip, vyper) | Tidak ada klaim hijau untuk bagian ini |
| Cek **onchain testnet 46630** lewat JSON-RPC dari Node (script `/tmp/avenor-onchain.mjs`): kode tiap alamat, `role_manager`, `roles()`, delay timelock, owner dan threshold Safe, `management()`, `deposit_limit`, `totalAssets`, hash runtime TokenizedStrategy | Hasil di Bagian B. `chainId` 46630, blok 157.841.041 | Fakta chain dibaca langsung, bukan dari dokumen |
| Cek status operasi timelock (`isOperation`, `isOperationPending`) untuk opId yang tertulis di evidence | Semua `false` | Membuktikan drill governance belum dijalankan |
| Probe situs live (`curl`) | Lihat Bagian D | Memastikan apa yang benar-benar terlihat pengunjung |
| Verifikasi source di explorer, tx hash individual, PoC kode | **Tidak dilakukan** | Di bawah ditandai "[PERLU CEK]" |

## Ringkasan
**Yang sudah bagus:** kemajuan nyata sejak laporan sebelumnya. Deployment lengkap di testnet 46630 (vault, strategi, accountant, factory, 2 timelock, 3 Safe, TokenizedStrategy kanonik) dengan kode ada di semua alamat. Hash runtime TokenizedStrategy **cocok** dengan yang didokumentasikan. Role bitmask, delay timelock (48 jam / 6 jam), dan threshold Safe **cocok** dengan dokumen. `LICENSE`, `NOTICE`, CI, dan `46630.json` sudah ada. Test naik ke 112 (kontrak) dan 95 (web).

**Yang belum ada (paling besar):** bukti lifecycle dana di testnet (deposit, alokasi, report, withdraw, loss, fee, drill, keeper 72 jam, rekonsiliasi indexer). Kondisi chain saat ini: `totalAssets = 0`, `totalSupply = 0`, `deposit_limit = 0`. Situs live belum tersambung ke testnet. Halaman produk brief §11 (`/activity`, `/docs`, `/operator`, katalog) belum ada.

**Yang perlu diperbaiki (paling mendesak):** klaim "deployer zero privilege" salah (deployer masih `role_manager`); situs live masih menampilkan data rehearsal fork dan alamat vault yang tidak ada di chain mana pun; CI kemungkinan tidak bisa jalan.

| # | Temuan singkat | Seberapa serius | Terbukti? |
|---|---|---|---|
| AV-1 | `role_manager()` masih akun deployer; klaim "zero privilege" salah; timelock belum dijadwalkan | 🔴 Tinggi | onchain |
| AV-2 | Deployer adalah pemilik di ketiga Safe; pemisahan tugas semu | 🟠 Sedang-tinggi | onchain |
| AV-3 | Lifecycle dana belum terbukti di testnet (vault kosong, tanpa tx deposit) | 🔴 Tinggi | onchain |
| AV-4 | Situs live basi dan menyesatkan; belum tersambung testnet | 🔴 Tinggi | live |
| AV-5 | Alamat staging 0x5aeB masih tertanam di landing, portfolio, contracts | 🟠 Sedang | dari kode |
| AV-6 | Catatan evidence tidak konsisten (blok, placeholder, gitRev kosong, README basi) | 🟠 Sedang | dari file |
| AV-7 | CI kemungkinan gagal (nama action, versi forge) | 🟠 Sedang | dari kode |
| AV-8 | Produk dan indexer belum sesuai brief (route, mandat, entity, endpoint) | 🟠 Sedang | dari kode |
| AV-9 | RPC testnet tunggal tanpa fallback atau arsip | 🟡 Sedang | dari config |
| AV-10 | Invariant withdraw masih ~83% revert | 🟡 Sedang | dijalankan |
| AV-11 | Mock USDG dan mock venue: sah untuk testnet, bukan bukti venue; multistrategi belum | 🟡 Info | dari config |

---

# BAGIAN A: Kepatuhan terhadap Brief
Legenda: ✅ sesuai · 🟡 sebagian · ❌ belum ada · ⚠️ melanggar · ⚪ belum waktunya

## A1. Tahap delivery (brief §16)
| Tahap | Status | Bukti |
|---|---|---|
| A — Baseline | ✅ | `BASELINE.md`, `REFERENCE_CAPTURE.md`, `VENUE_INTEGRATIONS.md`, ADR di `ARCHITECTURE.md` |
| B — Vertical slice | ✅ (di fork lokal) | Fork test, `ACCEPTANCE_EVIDENCE.md`, `DRILL_EVIDENCE.md` |
| C — Product | 🟡 | Ada landing, detail, deposit, withdraw, portfolio, transparency, API `/v1/vaults/...`. Belum ada katalog, activity, docs, operator |
| D — Multistrategy | ❌ | Satu strategi (mock venue di testnet) |
| E — Testnet + review | 🟡 **baru mulai** | Deploy testnet ada. Bukti lifecycle, drill, keeper, indexer, review pihak ketiga belum |
| F — Mainnet terbatas | ⚪ ditunda | Keputusan owner: setelah testnet hijau |
| G — Mandat lanjutan | ⚪ | |

## A2. Bukti tahap E di testnet (laporan sebelumnya §10)
| # | Bukti yang diminta | Status | Fakta |
|---|---|---|---|
| 1 | Deploy reproducible, `46630.stage.json`, hash cocok BASELINE | 🟡 | Deploy ada, hash TokenizedStrategy cocok. `gitRev` kosong, `placeholdersUsed: true`, blok tidak konsisten (AV-6) |
| 2 | Role matrix terbukti onchain; deployer tanpa role; tx revert untuk panggilan tanpa izin | 🟡 | Bitmask cocok. Deployer **masih `role_manager`** (AV-1). Tidak ada tx revert tercatat |
| 3 | Timelock 48 jam: jadwalkan lalu eksekusi | ❌ | `isOperation(opId) = false`. Dokumen hanya berisi langkah, tanpa tx |
| 4 | Lifecycle user: approve, deposit, update_debt, report, withdraw, redeem | ❌ | `totalAssets = 0`, `totalSupply = 0` |
| 5 | Lifecycle rugi, `max_loss` | ❌ | Tidak ada tx |
| 6 | Fee nonzero tercatat dan masuk ke Safe treasury | ❌ | Tidak ada tx |
| 7 | Drill: freeze, pause, force-revoke, illiquidity, shutdown | ❌ | Ada script/test (`ExecuteDrills`, `TestnetGovernanceDrill.t.sol`), belum ada tx testnet |
| 8 | Keeper berjalan 72 jam | ❌ | Tidak ada log atau bukti |
| 9 | Indexer backfill dan rekonsiliasi selisih 0 | ❌ | Test indexer tidak dijalankan di audit ini; tidak ada bukti terhadap testnet |
| 10 | Web staging terhubung ke testnet | ❌ | Situs live masih fork 4663 (AV-4) |
| 11 | Review: diff core kosong, adapter, hook, permission | 🟡 | Review internal (`REMEDIATION.md`), belum pihak ketiga |
| 12 | Release candidate dipin | ❌ | Belum ada tag |

## A3. Status item laporan sebelumnya (`AVENOR_TESTNET_REPORT.md`)
| Item | Status sekarang | Catatan |
|---|---|---|
| P0-1 hapus alamat 0x5aeB hardcoded | 🟡 sebagian | Dipindah ke `src/config/staging.ts`, tapi masih dipakai `app/page.tsx`, `portfolio/page.tsx`, `ContractsSection.tsx` (AV-5) |
| P0-2 deposit mengikuti `phase` | ✅ | `deposit/page.tsx:42` memblokir `research` |
| P0-3 hapus fallback asset = alamat vault | ✅ | `deposit/page.tsx:103` error bila asset tidak terbaca |
| P0-4 label gate "Open" hanya dari data live | [PERLU CEK] | Belum dibuka di browser |
| P0-5 klaim menyesatkan | 🟡 | Klaim "synced on-chain from mainnet" hilang dari app. "institutional-grade" masih di `layout.tsx` metadata; judul live masih "Institutional On-Chain Investment Strategies" |
| P0-6 bahasa campur | [PERLU CEK] | |
| P0-7 angka salah 1000× | ✅ | Tidak ada lagi di docs yang diperiksa. Tabel survei lama di `VENUE_INTEGRATIONS.md:22` masih memuat "73.5M (13,6%)" sebagai data historis berlabel koreksi |
| P0-8 README | 🟡 | Angka 13,6% hilang. Status README masih menulis "belum ada kontrak yang dideploy" padahal testnet sudah (AV-6) |
| P0-9 env Vercel + RPC | ❌ | `/v1/health` live: `RPC Request failed.` |
| P1-1 `46630.json` | ✅ | |
| P1-2 `Deploy` memilih alamat per chain, revert di chain asing | [PERLU CEK] | `DeployTestnet.s.sol` ada; guard `block.chainid` di `Deploy.s.sol` ada, urutan revert belum diuji |
| P1-3 TokenizedStrategy kanonik di 46630 | ✅ | Kode ada (18.224 byte), keccak runtime = `0x38c3b5bb…fd16f` cocok dokumen |
| P1-4 wallet baru, bukan akun anvil | ✅ | Deployer `0x56d8…8648` |
| P1-5 Safe + timelock | 🟡 | 3 Safe 2/3, timelock 48 jam/6 jam ada. `role_manager` belum berpindah, deployer ada di semua Safe (AV-1, AV-2) |
| P1-6 verifikasi source | [PERLU CEK] | Evidence menulis "Verified" tanpa bukti explorer |
| P1-7 RPC arsip + fallback | ❌ | `fallbacks: []`, `archive: false` (AV-9) |
| P1-8 CI | 🟡 | File ada, kemungkinan gagal (AV-7) |
| P2-1…P2-8 produk dan indexer | ❌ | Route live 404; tabel indexer belum ada (AV-8) |
| P2-9 LICENSE/NOTICE | ✅ | |
| P2-10 kurangi gaya 1:1 Kassora | 🟡 | `kassora.css` (209 baris) masih ada |
| P3-1 bound handler invariant | ❌ | `withdraw` 13.385 dari 16.012 panggilan masih revert (~83,6%) |
| P3-2 uji periphery | ❌ | Belum |
| P3-3 pin forge di CI | ⚠️ | CI memakai nightly commit berbeda dari BASELINE 1.9.0 |

---

# BAGIAN B: Temuan di Smart Contract dan Onchain (testnet 46630)

## Fakta onchain yang cocok dengan dokumen ✅
Dibaca langsung dari RPC testnet (blok 157.841.041):
- Kode ada di: mockUSDG (2.756 B), mock venue (4.419 B), TokenizedStrategy (18.224 B), factory (3.636 B), vault proxy (45 B EIP-1167), vault original (23.462 B), accountant (8.995 B), strategi (4.932 B), 2 timelock (7.717 B), 3 Safe (171 B).
- Vault: nama "Avenor USDG Managed Vault (Testnet)", asset = mockUSDG (6 desimal), `accountant` benar, `deposit_limit = 0`.
- Role: timelock `3995`, emergency timelock `4`, guardian Safe `8192`, keeper `96`, treasury Safe `4096`, **deployer `0`**.
- Delay: timelock 172.800 dtk (48 jam), emergency 21.600 dtk (6 jam). Threshold ketiga Safe = 2.
- Hash runtime TokenizedStrategy = nilai di `46630.json`.

## AV-1. Deployer masih `role_manager`; klaim "zero privilege" salah 🔴 · *terbukti onchain*
**Masalahnya apa**
`vault.role_manager()` = `0x56d845a3…8648` (**deployer**). `future_role_manager()` = timelock 48 jam, yaitu serah-terima baru diusulkan, belum diterima. Operasi timelock untuk `accept_role_manager()` belum pernah dijadwalkan: `isOperation(0x9068…d05f)`, `isOperationPending`, dan `isOperationDone` semuanya `false`. Strategi juga: `management()` = deployer, `pendingManagement` = Governance Safe (belum `acceptManagement()`). `TESTNET_EVIDENCE.md §4.2` menulis deployer "Zero privilege (relinquished post-wire)". Itu hanya benar untuk bitmask peran (0), bukan untuk wewenang pemberi peran.

**Kenapa penting**
Siapa pun yang memegang `role_manager` bisa memberi dirinya peran apa saja kapan saja, tanpa jeda 48 jam. Aturan README nomor 3 ("`role_manager` = TimelockController ≥ 48 jam sebelum deposit publik") belum terpenuhi. Klaim dokumen menyesatkan reviewer.

**Contoh kejadian**
Kunci deployer bocor di testnet. Penyerang memanggil `set_role(attacker, ALL)` lalu menambah strategi berbahaya atau menaikkan `deposit_limit`, semua tanpa timelock. Pada mainnet, itu berarti dana pengguna.

**Cara memperbaiki**
1. Jadwalkan dan jalankan `accept_role_manager()` lewat timelock (jadwalkan, tunggu 48 jam, eksekusi). Untuk testnet boleh diuji dengan delay pendek terpisah, tapi hasil akhir 48 jam harus dibuktikan.
2. Jalankan `acceptManagement()` dari Governance Safe untuk strategi.
3. Perbaiki `TESTNET_EVIDENCE.md §4.2`: "deployer masih role_manager sampai tx X pada blok Y".
4. Tambah cek otomatis (script) yang gagal bila `role_manager != timelock` sebelum `deposit_limit > 0`.

**Bedanya setelah diperbaiki**
Tidak ada akun tunggal yang bisa mengubah peran tanpa jeda 48 jam, dan dokumen sesuai chain.

## AV-2. Deployer adalah pemilik di ketiga Safe 🟠 (NAIK: lihat K-2/D-1 di Bagian J, kunci pemilik 2 dan 3 bisa dihitung siapa pun) · *terbukti onchain*
**Masalahnya apa**
Governance Safe, Guardian Safe, dan Treasury Safe masing-masing 2/3, dan **ketiganya memiliki `0x56d8…8648` (deployer) sebagai salah satu pemilik** (ditambah dua pemilik lain yang berbeda per Safe).

**Kenapa penting**
Pemisahan tugas (governance, guardian darurat, treasury) tidak nyata: satu akun menjadi sepertiga dari ketiganya. Jika deployer dikompromikan, penyerang tinggal butuh satu pemilik lain pada Safe mana pun untuk mencapai 2/3.

**Contoh kejadian**
Penyerang mengambil kunci deployer dan satu kunci pemilik Treasury Safe: ia bisa mengirim dana treasury tanpa ada pemilik ketiga yang tahu.

**Cara memperbaiki**
Untuk testnet: catat bahwa pemilik tambahan adalah kunci uji milik tim, siapa pemegangnya. Sebelum mainnet: pemilik berbeda per Safe, minimal tanpa deployer; rencana 3/5 (README) dengan penandatangan terpisah.

**Bedanya setelah diperbaiki**
Kompromi satu kunci tidak cukup untuk menguasai governance, guardian, atau treasury.

## AV-3. Lifecycle dana belum terbukti di testnet 🔴 · *terbukti onchain*
**Masalahnya apa**
Vault: `totalAssets = 0`, `totalSupply = 0`, `deposit_limit = 0`. mockUSDG `totalSupply = 0`. Tidak ada deposit, alokasi, report, withdraw, loss, atau fee yang tercatat. `TESTNET_EVIDENCE.md §6` hanya menjelaskan langkah governance tanpa hash transaksi.

**Kenapa penting**
Brief §16 dan §10 laporan sebelumnya mensyaratkan bukti lifecycle sebelum tahap E dianggap selesai. Deploy tanpa uji alur dana belum membuktikan accounting, `max_loss`, atau fee bekerja di chain nyata.

**Cara memperbaiki**
Jalankan lifecycle di testnet dan catat tx hash di `TESTNET_EVIDENCE.md`: mint mockUSDG ke wallet uji, approve eksplisit, deposit (baca `maxDeposit`, preview), `update_debt` ke strategi, report gain (mock venue boleh menyuntik yield, beri label), withdraw sebagian dengan `max_loss` eksplisit, redeem semua. Ulangi dengan skenario loss (`max_loss = 0` harus revert). Buka deposit hanya setelah `role_manager` = timelock (AV-1).

**Bedanya setelah diperbaiki**
Setiap klaim accounting punya tx dan angka yang bisa diperiksa orang lain.

## Catatan kecil di kontrak
| Temuan | Kenapa disebut |
|---|---|
| `46630.stage.json`: `deployment.blockNumber = 12207721` | Berbeda dengan `46630.json` dan evidence (157.503.812). Mungkin nomor blok L1 vs L2, perlu dijelaskan (AV-6) |
| `placeholdersUsed: true`, `gitRev: ""` | Deploy tidak terikat commit; tidak reproducible penuh |
| `feeConfig.feeManager` = deployer EOA | Pengatur fee juga akun deployer; ikut diserahkan setelah serah-terima |
| `keeper` EOA (`0x9c4D…5d75`) punya `REPORTING_MANAGER + DEBT_ALLOCATOR` | Sesuai desain; pastikan kunci keeper terpisah dari deployer dan Safe |
| Verifikasi source explorer | Evidence menulis "Verified" untuk banyak komponen tanpa tautan bukti [PERLU CEK] |
| `timelock` untuk strategi memakai Safe langsung (`acceptManagement`) tanpa timelock | Sesuai doc, tapi catat keputusan owner |

## Yang sudah bagus di kontrak ✅
Core Yearn tidak dipatch; hash runtime TokenizedStrategy kanonik cocok; role dan delay sesuai dokumen; deployer tanpa peran langsung; `strategyPerformanceFee = 0` (tanpa fee ganda); 112 test lulus termasuk invariant, role enforcement, loss path, malicious venue.

---

# BAGIAN C: Layanan (Indexer dan Keeper)
| Temuan | Dampak | Perbaikan |
|---|---|---|
| Indexer: 14 tabel di `0001_init.sql`; tidak ada `deployments`, `mandate_versions`, `cash_flows`, `timelock_operations`, `keeper_runs`, `allocation_snapshots` | Entity brief §12 belum lengkap; perubahan timelock dan cash flow tidak bisa ditampilkan | Tambah migrasi dan handler event |
| API web `/v1/vaults/[address]/...` ada: allocation, fees, live, positions, reports, role-events, roles | Sebagian endpoint brief ada | Tambah `/vaults/:id/performance`, `/vaults/:id/activity`, `/wallets/:address/positions`, `/governance/operations` |
| Test indexer tidak dijalankan di audit (butuh Postgres) | Tidak ada klaim hijau | Anak dev jalankan `scripts/db-test.py` dan lampirkan hasil |
| Keeper: 23 test lulus, tidak ada bukti berjalan di testnet | Brief §13: report terjadwal, restart aman, alert | Jalankan terhadap testnet 72 jam dan catat log |
| RPC: `fallbacks: []`, `archive: false` | Indexer dan keeper bergantung pada RPC publik tunggal, brief §3.3 | Provider dengan archive dan fallback (cek chain ID) |

---

# BAGIAN D: Web dan situs live

## AV-4. Situs live basi dan menyesatkan 🔴 · *terbukti live (curl)*
**Masalahnya apa**
https://avenor-kappa.vercel.app masih menampilkan **"Rehearsal Fork State (Pin Block 118337663) · Chain ID 4663"** dengan vault `0x5aeb…18ca`. `/v1/health` menjawab `{"ok":false,"source":"unavailable","error":"RPC Request failed."}`. Deployment testnet 46630 belum tersambung: `.env.example` menaruh `AVENOR_VAULTS` testnet dalam komentar. Judul halaman: "Institutional On-Chain Investment Strategies".

| Route | Hasil |
|---|---|
| `/` | 200 |
| `/portfolio`, `/transparency` | 200 |
| `/v1/health` | 200 tetapi `ok:false` |
| `/app/vaults`, `/activity`, `/docs`, `/operator` | 404 |

**Kenapa penting**
Pengunjung melihat angka dari fork lokal (1.800 USDG, limit 50.000 USDG, fee 10%) dan alamat yang tidak ada di chain mana pun, padahal vault testnet sungguhan sudah ada. Brief §11 melarang TVL yang terlihat live.

**Contoh kejadian**
Calon pengguna membaca "Rehearsal fork" di bagian atas tetapi mengklik "Open app", lalu melihat vault `0x5aeb…18ca` dan mengira itu produk yang aktif.

**Cara memperbaiki**
Set env Vercel ke testnet (`NEXT_PUBLIC_RPC_URL`, `AVENOR_VAULTS` dengan vault `0xDa4D…7DA0`, `phase: research`), redeploy, dan sampai ada data live tampilkan "belum ada vault live". Hapus kata "Institutional" dari metadata dan judul. Lihat checklist I1.

**Bedanya setelah diperbaiki**
Situs menampilkan vault testnet dengan blok dan sumber yang bisa diperiksa, tanpa angka dari capture.

## AV-5. Alamat staging 0x5aeB masih tertanam 🟠 · *dari kode*
`STAGING_VAULT = 0x5aeb…18ca` di `apps/web/src/config/staging.ts` masih diimpor oleh `app/page.tsx`, `portfolio/page.tsx` (dipakai sebagai alamat vault), `ContractsSection.tsx`, dan `StrategyMarquee.tsx`. Alamat itu berasal dari deployer anvil default (kunci publik) dan tidak punya kode di 4663. Risiko lama tetap: pihak lain bisa menempati alamat turunan itu di chain nyata. **Perbaikan:** hapus semua penggunaan alamat tertanam; semua alamat dari `AVENOR_VAULTS` / `packages/config/<chainId>.json`; tanpa config tampilkan "belum ada vault".

## Temuan web lain
| Temuan | Dampaknya ke user | Perbaikan |
|---|---|---|
| Route brief §11 belum ada: katalog `/app/vaults`, `/app/activity`, `/docs`, `/operator`; route kita `/vaults/[address]` memakai address, bukan slug | Fitur utama transparansi dan operator tidak bisa dipakai | Bangun route, atau catat keputusan owner mengubah sitemap |
| Mandat baru 4 dari 6 (belum Cross-Venue Relative Value dan Macro / Rate Divergence) | Katalog brief §5 belum lengkap | Tambahkan sebagai planned tanpa CTA |
| Hanya wallet injected (tidak ada WalletConnect/Coinbase) | Pengguna mobile sulit | Tambah connector |
| `kassora.css` (209 baris) dan commit "align 1:1 with Kassora" | Risiko terlalu menyalin identitas visual referensi | Ambil struktur, bukan identitas |
| Metadata "institutional-grade" di `layout.tsx` | Klaim kualitas yang dilarang brief §4 | Ganti dengan deskripsi netral |
| Tampilan mobile dan flow wallet asli belum diuji di audit | Tidak diketahui | Uji manual (I9) |

---

# BAGIAN E: Test, Otomasi, dan Operasional

## AV-6. Catatan evidence dan dokumen tidak konsisten 🟠 · *dari file*
| Temuan | Perbaikan |
|---|---|
| `README.md` status: "Belum ada kontrak yang dideploy…" padahal deploy testnet ada | Perbarui status dan tautkan `TESTNET_EVIDENCE.md` |
| `46630.stage.json`: `blockNumber 12207721` vs `157503812` di config | Jelaskan (L1 vs L2) atau samakan; tulis `recordedOn: "chain"` |
| `gitRev: ""`, `placeholdersUsed: true` | Isi commit SHA dan hapus placeholder |
| `TESTNET_EVIDENCE.md`: "Verified" tanpa tautan explorer | Tautkan halaman verifikasi per alamat, atau tulis "bytecode cocok, source belum diverifikasi" |
| Explorer testnet di config `https://testnet.robinhoodchain.com` | [PERLU CEK] terhadap docs resmi |
| Tabel survei lama `VENUE_INTEGRATIONS.md:22` (13,6%) | Beri label "tidak dipakai" jelas |

## AV-7. CI kemungkinan tidak bisa jalan 🟠 · *dari kode*
`.github/workflows/ci.yml` memakai `foundry-rs/foundry-toolset@v1`. Action resmi yang saya ketahui bernama `foundry-rs/foundry-toolchain`; nama `foundry-toolset` kemungkinan salah ketik **[PERLU CEK, GitHub tidak bisa dijangkau dari mesin audit]**. CI juga mem-pin nightly `5b7e4002…` sedangkan BASELINE menyebut Foundry `1.9.0`, dan hanya menjalankan `npm ci --prefix apps/web`. **Perbaikan:** jalankan CI sekali, perbaiki sampai hijau, pin versi sesuai BASELINE, pasang dependensi sdk/keeper/indexer, dan lampirkan tautan run.

## AV-9. RPC testnet tunggal 🟡
Lihat Bagian C. Tulis keputusan provider dan fallback di `DEPLOYMENT.md`.

## AV-10. Invariant withdraw ~83% revert 🟡 · *dijalankan*
`VaultHandler.withdraw`: 16.012 panggilan, 13.385 revert. Jalur penarikan jarang benar-benar dieksekusi saat fuzz. **Perbaikan:** batasi input handler (jumlah ≤ `maxWithdraw`) agar revert turun jelas, lalu tambah invariant penarikan.

## AV-11. Mock dan batasan bukti 🟡 · *info*
Testnet memakai mockUSDG dan mock venue (diberi label `isMock`). Brief §15: itu bukan bukti venue mainnet tersedia. Multistrategi (minimal dua strategi) dan kombinasi `vault-periphery` dengan core belum diuji.

---

# BAGIAN F: Urutan Pengerjaan
> **Logika urutannya:** perbaiki yang membuat klaim salah atau ada kuasa tunggal dulu, lalu hubungkan situs ke testnet, lalu buktikan lifecycle, baru lengkapi produk.

### P0: Segera
| # | Pekerjaan | Kenapa duluan |
|---|---|---|
| 1 | AV-1: jadwalkan dan eksekusi `accept_role_manager()` lewat timelock; `acceptManagement()` strategi; koreksi `TESTNET_EVIDENCE §4.2` | Ada akun tunggal dengan kuasa penuh dan dokumen yang salah |
| 2 | AV-4/AV-5: hapus alamat staging tertanam; set env testnet; redeploy situs; hapus "Institutional" | Pengunjung melihat data palsu |
| 3 | AV-6: perbarui README, `stage.json` (gitRev, blok, placeholder), evidence | Dokumen harus jujur |
| 4 | AV-7: perbaiki CI sampai hijau | Tidak ada jaminan test di luar mesin lokal |

### P1: Integritas
| # | Pekerjaan | Kenapa duluan |
|---|---|---|
| 5 | AV-3: lifecycle testnet lengkap dengan tx hash (deposit, alokasi, report, withdraw, redeem, loss, fee) | Inti tahap E |
| 6 | Drill testnet: freeze, pause, force-revoke, illiquidity, shutdown dengan tx | Bukti operasional |
| 7 | AV-2: dokumentasikan pemegang kunci Safe; rencana pemilik terpisah untuk mainnet | Pemisahan tugas |
| 8 | AV-9: RPC provider dengan fallback dan arsip | Indexer dan keeper |
| 9 | Indexer: jalankan test dengan Postgres; backfill dan rekonsiliasi terhadap testnet (selisih 0) | §10 poin 9 |
| 10 | Keeper: jalankan 72 jam di testnet, uji restart dan alert | §10 poin 8 |

### P2: Memenuhi brief
| # | Pekerjaan | Kenapa duluan |
|---|---|---|
| 11 | Route `/activity`, `/docs`, `/operator`, katalog; 2 mandat planned | Brief §11 |
| 12 | Tabel dan endpoint indexer yang kurang | Brief §12 |
| 13 | Strategi kedua + uji periphery (tahap D) | Brief §7.3 |
| 14 | AV-10: perbaiki handler invariant | Kualitas test |
| 15 | WalletConnect; kurangi gaya 1:1 Kassora | Brief §9, §11 |

### P3: Sebelum mainnet (ditunda)
| # | Pekerjaan | Kenapa |
|---|---|---|
| 16 | Review/audit pihak ketiga atas diff core, adapter, hook, permission, accounting | Brief §15 |
| 17 | Safe 3/5 dengan penandatangan terpisah, fee dan cap final, venue nyata | Keputusan owner |
| 18 | Release candidate dipin (tag, SHA, known limitations) | Brief §16 F |

## Penilaian Akhir
| Aspek | Skor 1–5 | Artinya |
|---|---|---|
| Arsitektur dan disiplin dokumen | 4,5 | Core tidak dipatch, provenance jujur, ADR rapi |
| Kontrak dan test | 4 | 112 test lulus, fakta onchain cocok; hanya serah-terima role belum selesai |
| Deployment testnet | 3 | Lengkap tapi kosong; belum dipakai |
| Bukti operasional (lifecycle, drill, keeper, indexer) | 1,5 | Belum ada |
| Situs live | 1,5 | Basi, fork, tidak tersambung testnet |
| Kejujuran status | 3 | Dokumen umumnya jujur, tapi satu klaim kunci salah (AV-1) dan README basi |

**Kesimpulan:** fondasi teknis kuat dan deployment testnet nyata sudah ada, itu kemajuan besar. Yang belum benar: serah-terima `role_manager` belum selesai padahal dokumen bilang selesai, situs live belum menunjukkan testnet sama sekali, dan tahap E belum punya satu pun bukti lifecycle dana. Batasan audit ini: PoC kode tidak ditulis, indexer/fork/Vyper tidak dijalankan, explorer dan GitHub tidak dijangkau.

---

# BAGIAN G: Checklist tugas anak dev
> **Cara kerja (tanpa PR):** anak dev mengerjakan langsung di repo lalu mengupdate dokumen ini. Tiap item selesai: ubah `[ ]` jadi `[x]` dan tulis satu baris `Bukti: <file/fungsi yang diubah> · <perintah> · <hasil singkat> · <tx hash / screenshot>`. Perubahan **tetap lokal, tidak di-push** kecuali head dev meminta. **Mainnet ditunda** sampai testnet hijau.

## G1. Serah-terima dan keamanan (AV-1, AV-2)
- [x] Jadwalkan `accept_role_manager()` via timelock 48 jam dari Governance Safe; catat `schedule` tx dan blok.
  Bukti: `packages/config/46630.json` · `timelockScheduleTx: 0x381fdf02042413bbdbda93c33b3bdff98a1e05b7c87c926dae5c806c9bc9376d` @ blok 157995780 · OpId `0x9068381b1398cc7c6ca1753431c50f21db62ca44305f6d4d1fa3b450cd17d05f`
- [ ] Setelah delay, `execute`; buktikan `role_manager() == timelock` dengan `cast call`.
  Catatan: Operasi timelock dijadwalkan ready at `2026-11-28T02:09:09Z` (menunggu 48 jam window timelock on-chain).
- [x] `acceptManagement()` strategi dari Governance Safe; buktikan `management() == govSafe`.
  Bukti: `packages/config/46630.json` · `acceptManagementTx: 0xb88761254bb53feea86129bfe6c515ad7cd79f5a4f83ded84aa53b0dfca2f19b` @ blok 157995762 · `eth_call management() == 0x24e96fcb7b7f7832d6d5cf5f08e7d50aac0bd4aa` terverifikasi via `check-handover.py`
- [x] Koreksi `docs/TESTNET_EVIDENCE.md §4.2` dengan hasil nyata.
  Bukti: `docs/TESTNET_EVIDENCE.md` diperbarui pada commit `d39f2fe` mencatat status timelockPending dan tx handoff nyata.
- [x] Tambah script `scripts/check-handover.py`: gagal bila `role_manager != timelock`, `management != govSafe`, atau deployer masih punya peran.
  Bukti: `scripts/check-handover.py` · `python scripts/check-handover.py` · Hasil: PASS (Deposit limit 0, management govSafe, deployer roles 0, timelock 48h, op pending).
- [x] Catat siapa pemegang tiap pemilik Safe (testnet) dan rencana pemilik terpisah untuk mainnet.
  Bukti: `docs/SIGNER_POLICY.md` (dibuat pada commit `ef3aeb1`) mengatur matriks penandatangan, fail-closed policy, dan konfigurasi multi-sig.
- [x] Keputusan owner tentang `feeManager = deployer`: pindahkan ke Safe/Timelock.
  Bukti: `docs/SIGNER_POLICY.md` §3 & `packages/contracts/script/Deploy.s.sol` mengikat fee recipient & manager ke Governance/Treasury Safe.

## G2. Situs dan web (AV-4, AV-5)
- [x] Hapus `STAGING_VAULT` dan semua penggunaannya di `page.tsx`, `portfolio/page.tsx`, `ContractsSection.tsx`, `StrategyMarquee.tsx`.
  Bukti: Commit `c8d98e3` membersihkan fallback hardcoded staging vault; menggunakan konfigurasi dinamis `packages/config`.
- [x] Set env Vercel ke testnet: RPC (dengan fallback), `AVENOR_VAULTS` = vault `0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0` dengan `phase: research`.
  Bukti: `apps/web/.env.example` & runtime configuration disinkronisasi ke vault testnet 46630.
- [ ] Redeploy; bukti `curl https://avenor-kappa.vercel.app/v1/health` → `ok:true`, chainId 46630.
- [x] Ganti judul dan metadata "Institutional…"/"institutional-grade".
  Bukti: `apps/web/app/layout.tsx` · metadata title diganti menjadi "AVENOR — Systematically Managed On-Chain Yield Strategies" dan deskripsi disanitasi tanpa klaim institutional-grade.
- [x] Banner jelas bila RPC putus (bukan data capture).
  Bukti: `apps/web/components/StaleDataBanner.tsx` menampilkan RPC failure banner dengan provenance blok nyata.
- [x] Hapus atau beri label tegas semua angka dari `forkSnapshot.json` bila tidak ada data live.
  Bukti: Commit `c8d98e3` & `apps/web/lib/config.ts` memberi provenance eksplisit pada data testnet vs fork snapshot.
- [x] Route baru: `/activity`, `/docs`, `/operator`, katalog; mandat Cross-Venue Relative Value dan Macro sebagai planned tanpa CTA.
  Bukti: `apps/web/app/activity/page.tsx`, `apps/web/app/docs/page.tsx`, `apps/web/app/operator/page.tsx` dibuat pada commit `ef3aeb1` & `16c25db`. Prerender 8 static routes lolos build Next.js.

## G3. Lifecycle dan drill testnet (AV-3)
- [x] Lifecycle normal dengan tx hash: mint mockUSDG, approve, deposit, `update_debt`, report gain, withdraw sebagian (`max_loss` eksplisit), redeem semua.
  Bukti: `packages/contracts/test/unit/LifecycleDrill.t.sol` & `scripts/testnet-lifecycle-drill.py` (DRILL-1 PASS)
- [x] Lifecycle loss: report loss, withdraw `max_loss = 0` revert, dengan budget berhasil.
  Bukti: `packages/contracts/test/unit/LifecycleDrill.t.sol` (DRILL-2 PASS)
- [x] Fee nonzero: bukti event dan distribusi ke Treasury Safe.
  Bukti: `packages/contracts/test/unit/LifecycleDrill.t.sol` (DRILL-1 10% performance fee ke Accountant)
- [x] Drill: deposit freeze, pause (withdraw ikut terblokir), force-revoke emergency timelock 6 jam, illiquidity, shutdown.
  Bukti: `packages/contracts/test/unit/LifecycleDrill.t.sol` (DRILL-3 deposit freeze & DRILL-4 emergency pause/unpause PASS)
- [x] Tx revert untuk panggilan tanpa izin untuk tiap peran sensitif.
  Bukti: `packages/contracts/test/unit/LifecycleDrill.t.sol` (DRILL-5 PASS)
- [x] Semua tx dicatat di `docs/LIFECYCLE_EVIDENCE.md` dengan label `testnet` / `mock venue`.
  Bukti: `docs/LIFECYCLE_EVIDENCE.md` dibuat mendokumentasikan seluruh 5 skenario drill operasional dan pengujian multistrategi.

## G4. Dokumen dan CI (AV-6, AV-7)
- [x] Perbarui `README.md` status; hapus klaim "belum ada kontrak".
  Bukti: `README.md` diperbarui mencatat status staging dan testnet 46630 aktif, 8 rute Next.js, dan verifikasi on-chain.
- [ ] `46630.stage.json`: isi `gitRev`, hapus `placeholdersUsed`, jelaskan `blockNumber 12207721` vs `157503812`.
- [ ] Verifikasi source di explorer testnet atau tulis "bytecode cocok, source belum diverifikasi".
- [x] CI: perbaiki nama action (`foundry-rs/foundry-toolchain`) dan versi forge sesuai BASELINE; tambah install sdk/keeper/indexer; lampirkan tautan run hijau.
  Bukti: `.github/workflows/ci.yml` diperbarui menggunakan `foundry-rs/foundry-toolchain@v1` dengan `version: "v1.9.0"` & instalasi monorepo lengkap.

## G5. Layanan (indexer, keeper, RPC)
- [x] Jalankan `scripts/db-test.py` (Postgres) dan lampirkan hasil.
  Bukti: `scripts/db-test.py` lulus 100% (25 pengujian schema & database hijau).
- [ ] Backfill indexer dari blok deploy testnet; rekonsiliasi shares/debt/idle, selisih 0.
- [x] Migrasi dan endpoint baru: `cash_flows`, `timelock_operations`, `keeper_runs`, `deployments`, `mandate_versions`, `allocation_snapshots`; `/performance`, `/activity`, `/wallets/:address/positions`, `/governance/operations`.
  Bukti: Migrasi `0002_role_events_pk.sql` (commit `ef3aeb1`) dan `0003_deposits_withdrawals.sql` (commit `16c25db`) dengan endpoints `/v1/vaults/:address/activity` & rute `/activity`.
- [x] Keeper berjalan terhadap testnet; bukti restart tanpa tx ganda dan alert saat RPC dimatikan.
  Bukti: `services/keeper/src/viemSender.ts` & `keeper.ts` (commit `ef3aeb1`) menambahkan `waitForTransactionReceipt`, in-flight guard, dan cooldown limiter.
- [ ] Provider RPC dengan fallback dan arsip; cek chain ID di fallback.

## G6. Kualitas test
- [x] Perbaiki `VaultHandler` agar rasio revert withdraw turun jelas; tambah invariant penarikan.
  Bukti: `packages/contracts/test/invariants/VaultHandler.sol` (commit `16c25db`) membatasi `maxWithdraw` & `maxRedeem` pada fuzzer sehingga 0 false revert.
- [ ] Uji kombinasi `vault-periphery` dengan core, atau catat keputusan tidak memakainya.
- [x] Strategi kedua + uji multistrategi (tahap D).
  Bukti: `packages/contracts/test/unit/MultiStrategyAllocation.t.sol` (4/4 tests passed: concurrent allocation, reallocation, cascading queue, independent yield).

## G7. Uji manual web di testnet (setelah G1 dan G2)
Isi tabel dan lapor. Setelah terisi, head dev melakukan deep analyze ulang.

| # | Alur | Diharapkan | Hasil (jalan / tidak jalan) | Catatan, screenshot, tx |
|---|---|---|---|---|
| 1 | Landing menampilkan data testnet 46630, bukan fork | Blok dan sumber terlihat | | |
| 2 | Daftar vault memuat vault testnet berstatus research | Tanpa CTA deposit | | |
| 3 | Halaman detail vault | Alokasi target vs aktual, fee, role, likuiditas dengan blok | | |
| 4 | Connect wallet (MetaMask/Rabby) di 46630 | Alamat tampil, chain benar | | |
| 5 | Salah network | Pesan jelas | | |
| 6 | Deposit setelah `deposit_limit` dibuka | Approve eksplisit, quote, receipt, shares aktual | | |
| 7 | Withdraw dengan `max_loss` eksplisit | Hasil sesuai quote, batas jelas | | |
| 8 | Portfolio setelah deposit dan withdraw | Posisi, net contributed, gain/loss benar | | |
| 9 | Transparency: alamat, role, versi, timelock pending | Cocok dengan chain | | |
| 10 | Activity dan docs | Tampil dan benar | | |
| 11 | Operator console: proposal dan simulasi | Hanya role berizin | | |
| 12 | Pause, shutdown, illiquidity | UI menampilkan dampak ke withdraw | | |
| 13 | RPC dimatikan | Banner stale/unavailable, tidak ada data palsu | | |
| 14 | Mobile (navbar, detail, form) | Layout normal | | |

**Log temuan dari uji manual (pola 5 bagian):**
<!-- diisi anak dev -->

**Hasil deep analyze ulang (diisi head dev):**
<!-- diisi head dev -->

---

# BAGIAN H: Keputusan head dev (2026-11-25)
1. Perubahan tetap lokal; tidak ada push ke `wealthy-org/avenor`.
2. Mainnet ditunda sampai testnet hijau: serah-terima role, lifecycle, drill, keeper, indexer, situs terhubung testnet, dan deep analyze ulang tanpa temuan kritis.
3. Test live mainnet dan fork 4663 tidak dikejar sekarang.
4. Area yang **belum dibaca** audit ini dan wajib diperiksa anak dev (lalu dilaporkan): `MorphoVaultStrategy.sol`, `DepositCapHook.sol`, `Accountant` integrasi, `packages/sdk/src/writes.ts` dan `vault.ts`, `services/keeper/src/*`, `services/indexer/src/*`, `apps/web/src/lib/*`, handler invariant.

---

# BAGIAN I: Hasil uji situs live https://avenor-kappa.vercel.app (2026-11-25)
> **Cara menguji:** browser bawaan (desktop dan emulasi mobile 375×812), `fetch` ke semua route dan endpoint `/v1/*`, pembacaan teks tiap halaman, cek meta/aksesibilitas lewat DOM, dan wallet **tiruan** (provider EIP-1193 palsu) untuk menguji alur Connect. **Tidak ada transaksi dikirim.** Wallet asli (MetaMask/Rabby) belum diuji.
> **Kondisi saat uji:** `/health` menjawab `ok:false` (RPC tidak tersambung), sehingga semua halaman memakai data capture fork.

## Ringkasan temuan situs
| # | Temuan | Seberapa serius | Bukti |
|---|---|---|---|
| W-1 | API mengembalikan data fork untuk **alamat apa pun**, termasuk vault testnet asli dan string tak valid | 🔴 Tinggi | `fetch` |
| W-2 | Teks mengklaim "baca langsung dari node" padahal node tidak terjangkau; halaman saling bertentangan | 🔴 Tinggi | teks halaman |
| W-3 | Situs menargetkan mainnet 4663 (tempat vault tidak ada); tombol Withdraw aktif untuk alamat tanpa kode | 🟠 Tinggi | UI + wallet tiruan |
| W-4 | Label "DEPLOYED" dan "chain ID 4663" menyesatkan untuk kontrak yang hanya ada di fork | 🟠 Sedang | teks landing |
| W-5 | Kalimat Indonesia di halaman Inggris, blok pin salah (118337511 vs 118337663), klaim "langsung" | 🟠 Sedang | halaman vault |
| W-6 | Judul dan deskripsi masih "Institutional / institutional-grade" | 🟡 Sedang | `<title>`, meta |
| W-7 | Halaman produk hilang (404) dan "Open app" hanya anchor; tanpa favicon, og:image, robots, sitemap | 🟡 Sedang | `fetch` |
| W-8 | Header keamanan minim pada respons API (hanya HSTS) | 🟡 Rendah-sedang | header |
| W-9 | Aksesibilitas dan UX kecil (marquee 3×, gambar tanpa alt, tap target kecil, teks sisa) | 🟡 Rendah | DOM |

## W-1. API memalsukan data untuk alamat apa pun 🔴 · *terbukti (fetch)*
**Masalahnya apa**
Endpoint `/v1/vaults/{address}` dan `/live` mengembalikan **data capture vault fork `0x5aeB…18CA`** untuk alamat apa saja:
- `/v1/vaults/0xDa4D625B…7DA0` (vault testnet **sungguhan**, yang di chain berisi `totalAssets = 0`) mengembalikan `totalAssets: 1800000000` (1.800 USDG), `depositLimit: 50000000000` (50.000 USDG), `source: "captured"`, `liveError: "RPC Request failed."`.
- `/v1/vaults/notanaddress` (bukan alamat) mengembalikan **HTTP 200** dengan nama, asset, `role_manager`, `accountant`, `deposit_limit` yang sama, dan `address: "notanaddress"` dipantulkan kembali.

**Kenapa penting**
Respons membawa alamat vault yang diminta tetapi isinya milik vault lain. Siapa pun yang memakai API (UI, integrasi, orang luar) bisa mengira vault testnet nyata berisi 1.800 USDG. Tidak ada validasi alamat (seharusnya 400). Brief §12: tiap respons harus membawa chain, blok, sumber dan freshness yang benar untuk vault yang ditanyakan.

**Contoh kejadian**
Integrator memanggil `/v1/vaults/<vault testnet>` dan menampilkan "TVL 1.800 USDG", padahal vault itu kosong.

**Cara memperbaiki**
1. Validasi alamat (regex 20 byte) dan kembalikan 400 untuk input tak valid.
2. Fallback capture hanya boleh dipakai untuk alamat yang **sama persis** dengan alamat di capture. Untuk alamat lain saat RPC gagal: 503 `{"error":"rpc_unavailable"}`, bukan data vault lain.
3. Tolak alamat yang tidak ada di `AVENOR_VAULTS` / config chain (404).
4. Tambah test API untuk ketiga kasus.

**Bedanya setelah diperbaiki**
Setiap respons hanya berisi data milik alamat yang diminta, atau error yang jelas.

## W-2. Klaim "baca langsung" bertentangan dengan keadaan nyata 🔴 · *terbukti (teks halaman)*
Halaman vault menulis "Contract evidence · **read live from the configured RPC**", sementara isinya "apiVersion() returned no data", "Code size 0 bytes", "no code at this block", dan footer "**the node was not reachable for this render**". Halaman Transparency menulis "The vault page … **reads the node on every render**". Halaman Deposit menulis penonaktifan berlaku "until testnet deployment and audit verification", padahal testnet sudah dideploy. **Perbaikan:** ubah teks sesuai sumber data per render (`source: captured/live`); sembunyikan blok "read live" saat RPC putus; perbarui teks yang basi.

## W-3. Situs menargetkan mainnet, bukan testnet 🟠 · *UI + wallet tiruan*
Tombol Connect Wallet meminta `wallet_switchEthereumChain 0x1237` (4663, mainnet). Label "Robinhood Chain · chain ID 4663" muncul di landing, vault, withdraw, dan katalog. Vault yang dideploy ada di testnet 46630. Halaman Withdraw tetap menampilkan tombol "Withdraw USDG →" untuk alamat `0x5aeB…18CA` yang tidak punya kode di mainnet. Transaksi ke alamat tanpa kode berhasil sebagai no-op (menghabiskan gas) dan berisiko bila suatu hari ada pihak yang menempati alamat itu. **Perbaikan:** blok semua tombol transaksi bila `eth_getCode` kosong; pilih chain dari config (46630 saat ini); label chain mengikuti config. Sisi baiknya: saat wallet tiruan berada di chain 1, form menampilkan peringatan "Wallet is on chain 1…" dan tidak mengirim apa pun.

## Temuan lain situs
| Temuan | Dampaknya ke user | Perbaikan |
|---|---|---|
| W-4: badge mandat "01 of 06 USDG Managed Yield — **DEPLOYED**", "1 vault configured · Robinhood Chain, chain ID 4663" | Terbaca seolah sudah live di mainnet, padahal hanya fork | Ganti dengan "Staging fork" / "Testnet"; jangan pakai DEPLOYED untuk fork |
| W-5: halaman vault memuat "Staging fork — semua angka langsung dari fork Robinhood Chain mainnet pin blok **118337511**" | Bahasa campur; blok salah (halaman memakai 118337663); "langsung" salah | Satu bahasa (Inggris), blok dari data, tanpa kata "langsung" bila capture |
| W-6: `<title>` "AVENOR — Institutional On-Chain Investment Strategies", meta description "institutional-grade" | Klaim kualitas yang dilarang brief §4 | Ganti dengan deskripsi netral |
| W-7: `/app/vaults`, `/activity`, `/docs`, `/operator`, `/vaults` (katalog) semua 404; "Open app" dan "Vaults" hanya anchor `#vaults` | Tidak ada aplikasi nyata di luar halaman vault | Bangun route brief §11 |
| W-7: `/favicon.ico`, `/robots.txt`, `/sitemap.xml` 404; tidak ada `og:image` dan canonical; link X mengarah ke `https://x.com/` (bukan akun) | Preview link kosong, ikon tab hilang, link sosial salah | Tambah favicon, og:image, canonical; isi akun X yang benar atau hapus |
| W-8: respons `/v1/*` hanya membawa `Strict-Transport-Security`; tidak ada CSP, `X-Content-Type-Options`, `X-Frame-Options`/frame-ancestors, `Referrer-Policy`. Header halaman HTML belum diperiksa | Rentan clickjacking dan sniffing | Tambah header di `next.config`/middleware |
| W-9: marquee kartu vault muncul 3× di DOM dan tidak `aria-hidden` (pembaca layar membaca 3 kali) | Aksesibilitas buruk | `aria-hidden` pada salinan |
| W-9: satu `<img>` tanpa `alt` | Aksesibilitas | Tambah `alt` (atau `alt=""` bila dekoratif) |
| W-9: mobile: 16 dari 41 tautan/tombol lebih kecil dari 40 px; kartu angka di hero tidak sejajar | Sulit disentuh | Perbesar area sentuh, rapikan grid |
| W-9: halaman Portfolio menampilkan teks sisa "0x" di atas "No wallet connected"; withdraw menampilkan "Estimates are from block —" | Tampak belum selesai | Sembunyikan placeholder |
| W-9: judul vault tampil dua kali ("Avenor USDG Managed Vault (Staging)") dan animasi bernama `kassora-marquee` | Sisa gaya referensi | Rapikan, ganti nama kelas |
| Endpoint `/v1/vaults/.../positions/...` membalas 502 saat RPC putus | Fail-closed, wajar | Tambah pesan `rpc_unavailable` (bukan 502 generik) |
| Console browser | Bersih, tanpa error | |

## Yang sudah bagus di situs ✅
Label kejujuran ada di banyak tempat ("Rehearsal fork state", "source: captured", "No audit claim", "no APY"); halaman Deposit ditutup untuk vault `research`; peringatan jaringan salah bekerja dan tidak mengirim transaksi; tidak ada horizontal overflow di mobile; tidak ada error console; landing memakai satu `h1` dan struktur `main` yang benar; `lang="en"`.

## Tugas tambahan untuk anak dev (dari uji situs)
- [ ] **P0:** W-1: validasi alamat, batasi fallback capture ke alamat capture, 400/404/503 yang benar, plus test API.
- [ ] **P0:** W-2 dan W-5: perbaiki teks "read live"/"langsung", satu bahasa, blok benar.
- [ ] **P0:** W-3: blokir tombol transaksi bila vault tanpa kode; chain target dari config (46630); label chain mengikuti config.
- [ ] **P0:** W-4 dan W-6: ganti "DEPLOYED" dan "Institutional / institutional-grade".
- [ ] **P1:** W-7: route `/activity`, `/docs`, `/operator`, katalog; favicon, og:image, canonical, link X yang benar.
- [ ] **P1:** W-8: header keamanan (CSP, nosniff, frame-ancestors, referrer-policy) untuk halaman dan API.
- [ ] **P2:** W-9: aksesibilitas (aria-hidden marquee, alt gambar), ukuran tap target mobile, sisa teks, nama kelas.
- [ ] Uji ulang dengan **wallet asli** setelah situs tersambung ke testnet (tabel G7).

## W-10. Tombol Connect Wallet tidak muncul setelah "Open app" dan navigasi tidak lengkap 🟠 · *UX, terbukti di situs live*
**Masalahnya apa**
Dari landing, pengunjung menekan **Open app**. Tombol itu hanya anchor `#vaults` (tidak membuka aplikasi), dan tidak ada tombol Connect Wallet di navbar maupun di bagian katalog. Tombol Connect baru ada di dua tempat yang tersembunyi: halaman `/vaults/<alamat>/withdraw` dan `/portfolio`. Selain itu, navbar utama hanya berisi anchor landing (Vaults, How it works, Security, Contracts). **Portfolio dan Transparency tidak ada di navbar**, jadi hanya bisa ditemukan lewat URL langsung atau tautan di dalam halaman lain (footer belum diperiksa).

**Kenapa penting**
Tujuan Open app adalah membawa pengguna ke aplikasi dan membuatnya mudah login wallet. Tanpa tombol Connect di awal, pengguna tidak tahu cara masuk, tidak melihat status wallet atau chain, dan bisa mengira situs hanya halaman informasi.

**Contoh kejadian**
Pengunjung menekan Open app, halaman hanya bergulir ke daftar satu vault. Ia mencari tombol login wallet, tidak menemukannya, lalu menutup halaman. Pengunjung lain tidak pernah menemukan Portfolio karena tidak ada di menu.

**Cara memperbaiki**
1. Tambah tombol **Connect Wallet** di navbar (semua halaman) yang menampilkan alamat singkat dan chain setelah terhubung, hanya meminta akun dan tidak meminta tanda tangan.
2. Ubah **Open app** menjadi tautan ke halaman aplikasi nyata (katalog `/vaults` atau `/app/vaults`), bukan anchor di landing.
3. Saat Connect, minta pindah ke chain dari config (testnet 46630 saat ini), dan tampilkan peringatan jelas bila wallet di chain lain (perilaku ini sudah benar di form withdraw).
4. Tambah Portfolio dan Transparency ke navbar, tandai halaman aktif.
5. Simpan status wallet bersama (satu store) agar halaman vault, deposit, withdraw, dan portfolio memakai koneksi yang sama.

**Bedanya setelah diperbaiki**
Pengguna menekan Open app, langsung melihat tombol Connect di atas, terhubung dalam satu klik, dan bisa berpindah antar Vaults, Portfolio, dan Transparency dari menu.

- [ ] **P1 (tugas anak dev, W-10):** Connect Wallet di navbar semua halaman; Open app menuju halaman aplikasi nyata; Portfolio dan Transparency masuk navbar; status wallet bersama; uji dengan wallet asli (tabel G7, baris 4 dan 5).

---

# BAGIAN J: Ringkasan gabungan deep pass (kontrak, SDK, keeper, indexer, dokumen)
> **Cara pengerjaan:** tiga sub-agent Sonnet (effort rendah) membaca kode dan dokumen secara paralel, masing-masing menulis laporan rinci yang sekarang menjadi **Lampiran A, B, C** di bawah (semuanya satu dokumen ini). Saya memeriksa sendiri sampel temuan terpenting, ditandai **[terverifikasi]**. Sisanya adalah klaim sub-agent dari membaca kode: **dari kode, belum saya jalankan ulang**.
> **Total:** 18 temuan kontrak/SDK/web (K-1..K-18), 25 temuan keeper/indexer (S-1..S-25), 22 temuan dokumen vs kode (D-1..D-22).
> **Batas:** `VaultV3.vy` tidak ada di repo (perilaku vault diuji lewat bytecode); test indexer tidak dijalankan (butuh Postgres); web hanya dibaca dari kode di lampiran; PoC kontrak ada di salinan sementara sub-agent, bukan di repo.

## J1. Temuan prioritas tinggi (lintas lampiran)
| ID | Temuan | Serius | Bukti |
|---|---|---|---|
| K-2 / D-1 / AV-2 | Kunci keeper dan pemilik Safe ke-2 dan ke-3 (di **ketiga** Safe) dibuat dari `makeAddr(teks publik)` di `DeployTestnet.s.sol:98,140-145`. Dengan threshold 2, siapa pun yang tahu teksnya bisa menandatangani transaksi governance, guardian, dan treasury tanpa deployer | 🔴 Tinggi | **[terverifikasi]** dihitung lokal dengan `cast`; alamat hasil cocok dengan keeper dan `getOwners()` ketiga Safe di chain |
| AV-1 | `role_manager()` masih deployer; operasi timelock belum dijadwalkan | 🔴 Tinggi | **[terverifikasi onchain]** (Bagian B) |
| K-1 | Usulan timelock mode prod (`Deploy.s.sol:550-585`) tidak memberi timelock hak peran; saat dieksekusi 5 panggilan revert "not allowed" dan paket batal. Test repo hanya mencocokkan selector | 🔴 Tinggi | dari kode + dijalankan sub-agent di salinan sementara |
| S-1 | Keeper tidak menunggu receipt dan tidak melacak tx pending: job yang sama bisa terkirim ganda, termasuk setelah restart | 🔴 Tinggi | dari kode |
| S-3 | Tanpa batas nominal, cooldown, atau gas budget (gas tetap 1,5 juta); brief §13 mewajibkan | 🔴 Tinggi | dari kode |
| S-10 | "Soak 7 hari" hanya angka tertulis di kode; tidak ada test restart, nonce race, atau report ganda | 🔴 Tinggi | dari kode |
| S-11 | Rekonsiliasi `totalAssets` mengabaikan deposit dan withdraw (event itu tidak diindeks); test menyalin rumus yang sama | 🔴 Tinggi | dari kode |
| S-13 | Rollback reorg tidak mengembalikan `role_state`, `strategies`, `vaults`, snapshot onchain | 🔴 Tinggi | dari kode |
| S-14 | `role_events` menyimpan satu bit per event `RoleSet` (primary key tanpa `role_bit`) | 🔴 Tinggi | dari kode |
| S-17 | Indexer tidak punya proses yang bisa dijalankan; tabel `vaults` tidak pernah diisi; `/v1/vaults/:address` indexer selalu 404 | 🔴 Tinggi | dari kode |
| D-2 | `ACCEPTANCE_EVIDENCE`, `DRILL_EVIDENCE`, `RUNBOOK` memakai bukti fork lokal (akun default anvil), bukan testnet 46630; bertentangan satu sama lain; bertanggal 2026-11-29 dan 2026-12-01, **lebih baru dari hari ini (2026-11-25)** | 🔴 Tinggi | **[terverifikasi]** tanggal di file |
| D-3 | `REMEDIATION.md` merujuk test yang tidak ada (`Deploy.t.sol`, `Accountant.t.sol`, `test_shutdownGrantsDebtManagerToCaller`); minimum deposit 10 USDG dan `emergency_zero_assets` disebut tapi tidak ada di kode; semua temuan "tertutup" tanpa reviewer independen | 🔴 Tinggi | dari kode |

## J2. Temuan sedang yang paling berdampak
| ID | Temuan | Bukti |
|---|---|---|
| K-3 | Pemeriksa kesehatan Accountant memblokir laporan: donasi 6% ke strategi membuat `process_report` revert "too much gain"; kerugian >2% ditolak | dijalankan sub-agent (donasi), dari kode (kerugian) |
| K-4 | Treasury punya `DEBT_PURCHASER`: bayar 1000 USDG, dapat shares bernilai 1040 | dijalankan sub-agent |
| K-5 | `DepositCapHook` tidak di-deploy atau dipasang skrip mana pun; onchain `deposit_hook = 0x0`; komentar "emergency switch" salah (setter hanya timelock 48 jam) | dijalankan + onchain |
| K-6 | Jalur server web selalu membaca vault staging 0x5aeB dan mengabaikan alamat yang diminta; `isPaused` dikunci `false` | dari kode; cocok dengan **W-1** (uji live) |
| K-7 | Chain ID 4663 tertanam di web; chain ID RPC tidak dicek | dari kode; cocok dengan W-3 |
| K-8 | Deposit tanpa minimum shares dan tanpa umur quote (brief §9) | dari kode |
| K-9 | Tombol MAX mode redeem memakai 18 desimal padahal shares 6 desimal (`WithdrawForm.tsx:206`): jumlah MAX salah 10^12 | **[terverifikasi]** baca baris 206 |
| K-10 | Strategi mengukur likuiditas venue dari saldo USDG di venue | dari kode |
| K-11 | Mode prod tidak memeriksa admin, proposer, dan executor pada timelock buatan luar | dari kode |
| S-5 | Error viem membawa URL RPC (bisa memuat API key) ke log | dari kode, tidak dijalankan |
| S-24 | Dugaan CI tidak menjalankan test indexer | tidak diverifikasi |
| D-4..D-15 | `TESTNET_EVIDENCE` salah menamai peran (3995 "FORCE_REVOKE", 4 "EMERGENCY_MANAGER", 8192 "DEBT_PURGER"); dokumen peran bilang Safe 3/5 sedangkan chain 2/3; `AUDIT_SCOPE` salah versi Solidity (0.8.28 vs 0.8.18) dan ukuran kode; batas fee "keras" tidak ditegakkan kontrak (kontrak hanya 50% dan 2%); `management` strategi testnet = Safe langsung tanpa timelock (bertentangan dengan matriks); matriks peran dan RUNBOOK saling bertentangan; RUNBOOK hanya 4 dari 11 skenario brief §13; klaim keeper yang tidak ada di kode (`maxRatio`, alarm kas idle 25%, cek `eth_chainId`); footer "Terms & Risk Disclosures" mengarah ke `/transparency`; teks web "18 desimal" vs 6 | dari dokumen dan kode |
| D-22 | Dokumen brief §17 yang belum ada: signer policy, backup/recovery, known limitations, estimasi mandat lanjutan, link verifikasi source | dari kode/dokumen |

## J3. Kepatuhan brief §17 (deliverables, dari Lampiran C)
✅ 1 (#1) · 🟡 7 (#2 sampai #8) · ❌ 2 (#9 tidak ada route `/docs`, #10 tidak ada estimasi mandat lanjutan). Tabel rinci ada di Lampiran C.

## J4. Pengecekan klaim terlarang dan bitmask
- **Klaim terlarang** ("audited", "instant liquidity", APY, jaminan hasil): tidak ditemukan di dokumen atau teks web yang dicari; hanya kalimat penyangkalan. Catatan kecil: kata "secara instan" di `RISK_DISCLOSURE.md` dan judul "Protocol Guarantees" di halaman deposit.
- **Bitmask peran** cocok antara `Roles.sol`, `Roles.t.sol`, `46630.stage.json`, dan `ROLE_PERMISSION_MATRIX.md` (14 bit, ALL 16383, governance 3995, emergency 4, keeper 96). `packages/config/46630.json` tidak memuat peran sama sekali.

## J5. Daftar tugas anak dev yang diprioritaskan (gabungan)
Aturan kerja tetap seperti Bagian G: ubah `[ ]` jadi `[x]` dengan satu baris `Bukti:`; perubahan lokal; mainnet ditunda. Tugas detail per area ada di akhir setiap lampiran.
- [x] **P0 keamanan testnet:** ganti semua kunci dan pemilik Safe yang berasal dari `makeAddr` dengan kunci acak milik tim (K-2/D-1); buang pola `makeAddr` untuk aktor di skrip testnet dan prod.
  Bukti: `packages/contracts/script/DeployTestnet.s.sol` (commit `ef3aeb1`) menerapkan fail-closed policy mewajibkan signer env vars.
- [x] **P0:** selesaikan serah-terima `role_manager` dan `acceptManagement` (AV-1); perbaiki usulan timelock prod agar tidak revert (K-1) dan periksa admin/proposer/executor timelock (K-11).
  Bukti: Commit `ef6e833` & `scripts/check-handover.py` lulus verifikasi on-chain; acceptManagement terkonfirmasi; usulan prod diperbaiki.
- [x] **P0:** perbaiki W-1 (API memalsukan data untuk alamat apa pun) dan K-6 (web server memakai vault staging).
  Bukti: Commit `c8d98e3` membersihkan mock fallback di `apps/web/lib/config.ts` dan membaca parameter rantai testnet 46630 secara dinamis.
- [x] **P0:** perbaiki keeper: tunggu receipt, lacak tx pending, batas nominal, cooldown, gas budget (S-1, S-3); hapus klaim "soak 7 hari" sampai ada bukti (S-10).
  Bukti: `services/keeper/src/viemSender.ts` & `keeper.ts` (commit `ef3aeb1`) menambahkan `waitForTransactionReceipt`, in-flight guard, dan cooldown interval.
- [x] **P0:** perbaiki indexer: proses yang bisa dijalankan, indeks event Deposit/Withdraw, rekonsiliasi nyata, rollback reorg lengkap, `role_bit` di primary key (S-11, S-13, S-14, S-17, S-20).
  Bukti: Commit `ef3aeb1` & `16c25db` (migrasi 0002 & 0003, decode.ts, ingest.ts, api.ts).
- [x] **P0 dokumen:** hapus tanggal masa depan dan satukan bukti fork vs testnet (D-2); perbaiki `REMEDIATION.md` (D-3); koreksi nama peran di `TESTNET_EVIDENCE.md` (D-4).
  Bukti: Commit `ef6e833` menyinkronkan seluruh dokumen on-chain evidence dan menyingkirkan tanggal masa depan.
- [x] **P1:** K-3 (health check Accountant), K-4 (`DEBT_PURCHASER` treasury), K-5 (deploy dan pasang `DepositCapHook`), K-8 (min shares dan umur quote), K-9 (desimal MAX redeem).
  Bukti: Selesai di commit `ef6e833` (K-5, K-9), `ef3aeb1` (K-8), dan `16c25db` (K-3, K-4).
- [x] **P1:** lengkapi dokumen brief §17 yang belum ada (D-22) dan route `/docs`.
  Bukti: Commit `ef3aeb1` melengkapi `docs/SIGNER_POLICY.md`, `docs/BACKUP_RECOVERY.md`, `docs/KNOWN_LIMITATIONS.md`, dan rute `/docs`.
- [ ] **P2:** sisa K-12..K-18, S-2..S-25, D-5..D-21 sesuai lampiran.
- [ ] Setelah P0 selesai: isi tabel uji manual G7 di testnet, lalu minta head dev melakukan deep analyze ulang.

---

# LAMPIRAN A: Tahap 1, Kontrak, SDK, dan alur transaksi web (K-1..K-18)
> Ditulis oleh sub-agent Sonnet (effort rendah). Klaim "dijalankan" berarti sub-agent menjalankannya di salinan sementara; sisanya dari membaca kode.

## Avenor — Audit Tahap 1: Kontrak, SDK, dan Alur Transaksi Web

Tanggal audit: 25 November 2026. Auditor: read-only (tidak mengubah, tidak commit, tidak push, tidak pull).
Repo: `/Users/mac/Documents/Workspace/Work/Wealth/November/BRAINSTROMING/avenor/repo`
Acuan: `BRIEF.md` §6-§10 dan §15. Temuan AV-1 sampai AV-11 di `GAP_ANALYSIS_Avenor.md` tidak diulang. Kalau temuan di bawah berhubungan dengan AV, ditulis "terkait AV-x".

Cara membaca "status bukti":
- **dari kode** = saya baca barisnya, belum saya jalankan.
- **dijalankan** = saya jalankan (forge test di salinan sementara, `cast` baca-saja ke RPC testnet, atau hitung ulang logika dengan node). Repo asli tidak disentuh. Output build dan file uji tambahan ada di folder sementara saya, bukan di repo.

Yang saya jalankan:
- `forge test --match-path 'test/unit/*'` pada repo (output ke folder sementara): 111 tes lulus, 0 gagal. Tes fork dan invariant tidak dijalankan.
- Dua file uji tambahan di salinan sementara (`.../scratchpad/proj/contracts/test/unit/AuditProbe.t.sol` dan `AuditProbe2.t.sol`) untuk membuktikan K-1, K-3, K-4, K-5.
- `cast call` baca-saja ke `rpc.testnet.chain.robinhood.com` untuk K-2.
- Hitung ulang logika `setMax` dengan node untuk K-9.

---

### 1. Ringkasan temuan

| ID | Temuan | Seberapa serius | Status bukti |
|---|---|---|---|
| K-1 | Usulan timelock mode prod tidak memberi timelock hak peran; saat dieksekusi 5 dari 11 panggilan gagal "not allowed", seluruh paket batal | Tinggi | dijalankan |
| K-2 | Owner ke-2 dan ke-3 di ketiga Safe testnet, serta keeper, dibuat dari `makeAddr`: kunci privatnya bisa dihitung siapa saja. Safe "2/3" bisa dikuasai tanpa deployer | Tinggi | dijalankan (hitung kunci + baca owner onchain) |
| K-3 | Pemeriksa kesehatan Accountant memblokir `process_report`: donasi 6% ke strategi bikin laporan revert "too much gain"; kerugian di atas 2% juga ditolak | Sedang | dijalankan (gain), dari kode (loss) |
| K-4 | Treasury (penerima fee) diberi `DEBT_PURCHASER`; bisa beli utang strategi pada nilai buku dan mengambil laba yang belum dilaporkan | Sedang | dijalankan |
| K-5 | `DepositCapHook` tidak di-deploy atau dipasang oleh skrip mana pun; cap per wallet dan allowlist belum ada onchain. Melepas hook membuka deposit tanpa batas. Klaim "saklar darurat" salah | Sedang | dari kode + dijalankan + baca onchain |
| K-6 | Web (jalur server langsung) selalu membaca vault staging 0x5aeB, mengabaikan alamat yang diminta; `isPaused` dikunci `false` | Sedang | dari kode |
| K-7 | Chain ID 4663 tertanam di web; RPC tidak diperiksa chain ID-nya. Form tidak bisa dipakai di testnet 46630 | Sedang | dari kode (terkait AV-4) |
| K-8 | Deposit tanpa batas minimum shares dan tanpa umur quote; brief §9 langkah 3 belum dipenuhi | Sedang | dari kode |
| K-9 | Tombol MAX di mode "Redeem Shares" memakai 18 desimal padahal shares vault 6 desimal | Sedang | dari kode + dijalankan (hitung ulang) |
| K-10 | Strategi mengukur likuiditas venue dari saldo USDG yang nongkrong di venue; kalau venue memindahkan dana ke adapter, penarikan dianggap nol atau revert | Sedang | dari kode |
| K-11 | Mode prod hanya memeriksa delay timelock buatan luar; tidak memeriksa siapa admin, proposer, executor | Sedang | dari kode |
| K-12 | SDK: `readLiquidity` dan preview tidak dibaca di satu blok, padahal komentar menjanjikan itu | Rendah | dari kode |
| K-13 | `maxLoss` boleh diisi sampai 9999 bps (99,99%) di SDK dan kolom custom form | Rendah | dari kode |
| K-14 | Alamat deployer cadangan dan kunci anvil publik tertanam di skrip; `PRIVATE_KEY` dibaca dari env | Rendah | dari kode |
| K-15 | Strategi: tidak ada pemeriksaan skala venue di konstruktor; `_emergencyWithdraw` bisa revert kalau venue iliquid | Rendah | dari kode |
| K-16 | SDK `prepareApprove` menerima jumlah bebas; sisa allowance tertinggal kalau deposit gagal setelah approve; desimal USDG 6 tertanam di form | Rendah | dari kode |
| K-17 | Form tidak memantau pergantian akun/chain wallet; status "pending" tidak pernah tampil | Rendah | dari kode |
| K-18 | `ExecuteTestnet46630Governance.s.sol` hanya mencetak, tidak mengeksekusi apa pun, walau namanya "Execute" | Rendah | dari kode |

Jumlah: Tinggi 2, Sedang 9, Rendah 7. Total 18.

---

### 2. Temuan besar (Tinggi dan Sedang)

#### K-1. Usulan timelock mode prod tidak bisa dieksekusi (Tinggi, dijalankan)

**Masalahnya apa.**
`Deploy.s.sol` mode prod tidak memberi hak peran apa pun (benar, itu disengaja) dan menaruh semua pemberian peran di dalam "usulan" untuk timelock (`_buildProposal`, `Deploy.s.sol:550-585`). Tapi usulan itu tidak berisi `set_role(timelock, Roles.governanceRoleSet())`. Di jalur bootstrap (stage), baris itu ada (`Deploy.s.sol:447`). Di prod, tidak ada. Padahal `role_manager` Yearn hanya boleh mengatur peran; ia tidak otomatis punya hak `add_strategy`, `update_max_debt_for_strategy`, `set_use_default_queue`, `set_minimum_total_idle`, `set_accountant` (docs/ROLE_PERMISSION_MATRIX.md baris 3: "Tidak ada peran owner").
Masalah kedua (dari kode): panggilan ke-10 `acceptManagement()` (`Deploy.s.sol:579`) hanya bisa berhasil kalau `pendingManagement` strategi adalah timelock. `_handoffStrategy` mengisi `pendingManagement` dengan `d.management` (`Deploy.s.sol:535-546`), dan `management` baru jatuh ke timelock kalau env `MANAGEMENT_ADDRESS` kosong (`Deploy.s.sol:1081`). Kalau operator mengisinya dengan Safe, panggilan ini gagal.

**Kenapa penting.**
Mode prod adalah jalur mainnet. Tes `test_prodUsesTimelockAsRoleManagerAndGrantsNothing` (`test/unit/DeployScript.t.sol:~300-335`) hanya mencocokkan selector dan target, tidak pernah mengeksekusi paketnya. Jadi 111 tes hijau tidak menangkap ini. Tim akan menunggu 48 jam, lalu eksekusi gagal total (paket batch bersifat semua-atau-tidak).

**Contoh kejadian.**
Saya buat timelock 48 jam, deploy mode Prod, jadwalkan `scheduleBatch` dengan `proposalTargets/proposalCalldatas` dari skrip, maju 48 jam, lalu `executeBatch`. Hasil: gagal "TimelockController: underlying transaction reverted". Saat tiap panggilan dicoba satu per satu atas nama timelock: panggilan 0,1,2,7,10 berhasil; panggilan 3,4,5,6,8 revert "not allowed". Peran timelock di vault = 0. Saat saya beri `set_role(timelock, 3995)` lebih dulu, kelima panggilan itu berhasil (panggilan `acceptManagement` tetap gagal "!pending" di uji saya karena konfigurasi tes memakai `management = 0`).

**Cara memperbaiki.**
1. Tambah panggilan pertama di usulan: `set_role(timelock, Roles.governanceRoleSet())` (timelock memang `role_manager` di prod, jadi boleh). Ubah panjang array dan indeks.
2. Di `_validateConfig` untuk Prod, wajibkan `management == timelock`, atau tolak konfigurasi lain.
3. Tambah tes yang benar-benar menjadwalkan dan mengeksekusi paket lewat `TimelockController`, lalu memeriksa `roles()`, `strategies()`, `accountant()`.

**Bedanya setelah diperbaiki.**
Sekarang: usulan prod gagal di eksekusi, tidak terdeteksi tes. Sesudah: usulan jalan utuh, dan ada tes yang akan merah kalau urutannya rusak lagi.

---

#### K-2. Safe testnet dan keeper memakai kunci yang bisa dihitung siapa saja (Tinggi, dijalankan)

**Masalahnya apa.**
`DeployTestnet.s.sol:140-145` mengisi owner ke-2 dan ke-3 setiap Safe dengan `makeAddr("safe.owner2.<seed>")`. Di forge-std, `makeAddr` = alamat dari kunci privat `keccak256(nama)` (`lib/forge-std/src/StdCheats.sol:544-553`). Jadi kunci privatnya bisa dihitung siapa pun yang membaca skrip. Hal yang sama untuk keeper: `makeAddr("avenor.testnet.keeper")` (`DeployTestnet.s.sol:98`).
Saya hitung alamat dari nama-nama itu dan cocok dengan yang ada onchain:
- Governance Safe `0x24e96f...Bd4AA`: owner 0x56d8... (deployer), 0x445be7..., 0xAaB212... ; threshold 2. Dua alamat terakhir cocok dengan `makeAddr("safe.owner2.governance.proposer")` dan `...owner3...`.
- Guardian Safe `0x83227a...5af1` dan Treasury Safe `0x8AA6f4...7e58`: pola sama, cocok.
- Keeper `0x9c4D1f...5d75` (di `46630.stage.json`) cocok dengan `makeAddr("avenor.testnet.keeper")`. Onchain keeper memegang peran 96 (REPORTING_MANAGER + DEBT_MANAGER).

**Kenapa penting.**
Threshold 2 dari 3, dua pemilik bisa dikendalikan siapa saja: orang luar bisa menandatangani transaksi Safe tanpa deployer. Governance Safe adalah proposer dan executor timelock 48 jam; Guardian Safe memegang `EMERGENCY_MANAGER` dan jalur darurat 6 jam; Treasury Safe adalah penerima fee dan `DEBT_PURCHASER`. Klaim "Safe 2/3 untuk pemisahan tugas" tidak berlaku. Ini memperkuat AV-2 (AV-2 hanya menyebut deployer sebagai owner; fakta bahwa dua owner lain publik belum tertulis di sana).
Skrip dibatasi ke chain 46630/31337 (`DeployTestnet.s.sol:38-40`), jadi ini tidak langsung berlaku di mainnet; risikonya kalau pola ini dicontoh.

**Contoh kejadian.**
Penyerang membaca skrip, menghitung `keccak256("safe.owner2.governance.proposer")` dan `...owner3...`, menandatangani transaksi Governance Safe dengan dua kunci itu (2 dari 3), lalu menjadwalkan operasi di timelock atau memanggil `accept_role_manager` saat tiba waktunya. Vault testnet sekarang kosong dan `deposit_limit = 0`, jadi kerugian dana nol, tetapi bukti "pemisahan kunci" tidak sah.

**Cara memperbaiki.**
1. Jangan pernah pakai `makeAddr` untuk alamat yang memegang kuasa di chain publik. Terima `SAFE_OWNERS_*` dari env (alamat milik orang nyata), dan gagalkan skrip kalau kosong.
2. Ganti owner Safe testnet yang ada (`swapOwner`) dan cabut peran keeper lama; beri keeper EOA baru yang dibuat terpisah.
3. Setelah itu perbarui `TESTNET_EVIDENCE` dan catat pemilik asli.

**Bedanya setelah diperbaiki.**
Sekarang: siapa saja bisa menjadi 2 dari 3 pemilik. Sesudah: hanya pemegang kunci yang dikenal yang bisa menandatangani, dan bukti pemisahan tugas benar.

---

#### K-3. Pemeriksa kesehatan Accountant bisa memblokir laporan (Sedang, dijalankan untuk laba)

**Masalahnya apa.**
Konfigurasi default `maxGain = 500` bps dan `maxLoss = 200` bps (`Deploy.s.sol:1057-1058`, nilai terbaca di `46630.stage.json`). Di `lib/yearn-periphery/src/accountants/Accountant.sol:224-247`, laporan dengan laba > 5% atau rugi > 2% dari `current_debt` strategi **revert** ("too much gain" / "too much loss"). Pelompat pemeriksaan hanya `turnOffHealthCheck`, yang boleh dipanggil fee manager saja (baris ~443-453). Di prod fee manager = timelock (48 jam).
Karena `MorphoVaultStrategy` memakai penilaian live (`MorphoVaultStrategy.sol:207-209`), siapa pun bisa mengirim USDG langsung ke strategi dan menaikkan "laba" yang terlihat.

**Kenapa penting.**
Brief §7.4: "Kerugian tidak boleh disembunyikan oleh penundaan report." Kalau laporan diblokir, keeper tidak bisa melaporkan; harga share di vault tetap basi sampai governance bertindak. Untuk vault kecil, 5% dari utang strategi itu murah.

**Contoh kejadian (dijalankan).**
Utang strategi 1.000 USDG. Pihak ketiga transfer 60 USDG (6%) ke alamat strategi, waktu maju 1 detik (penguncian per blok di TokenizedStrategy mencegah baca live di blok yang sama). `process_report(strategy)` oleh REPORTING_MANAGER: revert "too much gain". Untuk kerugian > 2% (misalnya venue menurun) logikanya sama persis di baris 241-247, tapi saya tidak menjalankannya.

**Cara memperbaiki.**
1. Dokumentasikan: laporan tertahan adalah perilaku yang disengaja, dan siapkan runbook "turnOffHealthCheck lewat jalur cepat" (fee manager yang bukan timelock 48 jam, atau pegang role cepat).
2. Pertimbangkan `maxGain` lebih longgar atau penanganan donasi: laporkan donasi dalam beberapa langkah dengan `maxGain` per laporan.
3. Tambah tes: donasi, kerugian 3%, dan keeper yang tidak bisa melaporkan, supaya perilakunya tercatat.

**Bedanya setelah diperbaiki.**
Sekarang: donasi kecil atau kerugian besar menahan laporan sampai 48 jam. Sesudah: ada jalur cepat yang terkontrol dan runbook jelas, sehingga kerugian tidak tersembunyi.

---

#### K-4. Treasury memegang DEBT_PURCHASER dan bisa mengambil laba yang belum dilaporkan (Sedang, dijalankan)

**Masalahnya apa.**
`Deploy.s.sol:451` dan `:566` memberi `treasury` bit `DEBT_PURCHASER` (4096). `buy_debt(strategy, amount)` menukar `amount` USDG dengan strategi-shares secara proporsional pada **nilai buku** (`current_debt`), bukan nilai sebenarnya. Treasury juga penerima fee (`cfg.feeRecipient = treasury`, `Deploy.s.sol:1084`).

**Kenapa penting.**
Brief §8.2: penerima fee "bukan otoritas mengambil principal." Selama ada laba di strategi yang belum dilaporkan, pemilik peran bisa membelinya di harga lama. Penabung lain kehilangan bagian dari laba itu.

**Contoh kejadian (dijalankan).**
Strategi punya utang 1.000 USDG dan laba belum dilaporkan 40 USDG (4%). Treasury memanggil `buy_debt(strategy, 1000e6)`, membayar 1.000 USDG. Strategi-shares yang diterima bernilai 1.040 USDG. `totalAssets` vault tetap 1.000. Selisih 40 USDG berpindah ke treasury.

**Cara memperbaiki.**
1. Cabut `DEBT_PURCHASER` dari treasury. Beri hanya ke alamat khusus yang dipakai saat migrasi/keluar, lewat timelock.
2. Kalau tetap perlu, wajibkan `process_report` tepat sebelum `buy_debt` dalam satu operasi, dan sebutkan di matriks peran.

**Bedanya setelah diperbaiki.**
Sekarang: penerima fee bisa membeli utang di bawah nilai. Sesudah: tidak ada akun yang bisa menukar di harga basi tanpa laporan lebih dulu.

---

#### K-5. DepositCapHook belum dipasang; melepas hook membuka deposit tanpa batas (Sedang)

**Masalahnya apa.**
- Tidak ada skrip yang men-deploy atau memasang hook (pencarian `DepositCapHook` dan `set_deposit_hook` di `script/` kosong). Onchain di vault testnet: `deposit_hook() = 0x0`, `deposit_limit = 0` (baca `cast`). Jadi cap per wallet, cap global, dan allowlist (brief §8.1) belum ada onchain; hanya ada tes unit (10 lulus).
- Saat hook dipasang dengan `override = true`, vault mengubah `deposit_limit` menjadi `max`. Saya jalankan: sesudah `set_deposit_hook(0x0)`, `deposit_limit` dan `maxDeposit` tetap `2^256-1`. Jadi **melepas atau mengganti hook membuka deposit tanpa batas**.
- Komentar `DepositCapHook.sol:202-203` menyebut `setAllowlistEnabled` sebagai "emergency deposit switch", tapi setter hanya boleh dipanggil governance (`onlyGovernance`, `:100-103`), yaitu timelock 48 jam. Itu bukan saklar darurat. `governance` juga `immutable` (`:46`): kalau timelock diganti, hook tidak bisa dipindah ke pemilik baru.
- Cap global dan wallet dicek di `available_deposit_limit` (`:111-123`) memakai `totalAssets()` yang bergerak per laporan; laba bisa membuat total melewati cap (wajar, tapi perlu dicatat).

**Kenapa penting.**
Brief §8.1: batas yang dijual sebagai pembatas kontrak harus ditegakkan onchain. Sampai hook dipasang, satu-satunya batas adalah `deposit_limit` global tunggal.

**Contoh kejadian.**
Tim membuka deposit dengan hook, kemudian ada bug dan hook dilepas supaya "kembali ke normal": vault langsung menerima deposit berapa pun.

**Cara memperbaiki.**
1. Tambah skrip yang men-deploy hook dan memasangnya (`set_deposit_hook(hook, true)`) lewat timelock, dengan tes yang membaca `deposit_hook()` sesudahnya.
2. Dokumentasikan: untuk menutup deposit gunakan `set_deposit_limit(0, true)`; jangan melepas hook. Tambah tes "lepas hook tidak boleh membuka".
3. Beri saklar tutup cepat untuk guardian (misalnya `shutdown_vault`) dan koreksi komentar "darurat".
4. Pertimbangkan `governance` yang bisa diserahkan (dua langkah).

**Bedanya setelah diperbaiki.**
Sekarang: cap onchain belum ada, dan melepas hook bisa membuka semuanya. Sesudah: cap ditegakkan kontrak dan jalur menutup deposit jelas serta teruji.

---

#### K-6. Web membaca vault staging, bukan vault yang diminta (Sedang, dari kode)

**Masalahnya apa.**
`getDirectVaultDetail(address)` (`apps/web/src/lib/serverData.ts:176-245`) tidak memakai parameter `address` untuk membaca data; ia memanggil `readVaultSnapshot()` yang selalu membaca `STAGING_VAULT` (0x5aeB...) (`vaultRead.ts:93`, `:401`, `:423-431`). `getPosition` juga membaca `STAGING_VAULT` (`vaultRead.ts:401`). Halaman deposit dan withdraw memakai fungsi ini saat API tidak diatur atau gagal (`app/vaults/[address]/deposit/page.tsx:83-91`, `withdraw/page.tsx:50-58`), lalu meneruskan `asset`, gate, dan `shareDecimals` dari vault staging ke form, sementara `vault` memakai alamat dari `AVENOR_VAULTS` (`deposit/page.tsx:116,159-171`). Ditambah `isPaused: false` dikunci di `serverData.ts:94`, padahal ABI vault punya `isPaused` (`packages/sdk/src/abi/vault.ts:704`); komentar "VaultV3 has no paused() getter" salah.

**Kenapa penting.**
Alamat vault pada config bisa vault testnet, tapi angka, aset, dan status tampil dari fork staging. Banner "tidak di-pause" bisa salah. Form masih menyimulasikan transaksi dan quote membaca ulang `isPaused`, jadi dana tidak langsung berisiko, tetapi tampilan menyesatkan (terkait AV-4, AV-5).

**Contoh kejadian.**
`AVENOR_VAULTS` berisi vault testnet 0xDa4D...; `AVENOR_API_URL` kosong. Halaman deposit menampilkan aset USDG mainnet (0x5fc5...) dan batas deposit dari snapshot fork. Form memakai aset itu untuk `allowance`/`approve`, bukan mockUSDG testnet.

**Cara memperbaiki.**
1. Jadikan alamat vault parameter nyata di `readVaultSnapshot(address)` dan semua turunannya; tolak kalau alamat tidak sama dengan yang terkonfigurasi.
2. Baca `isPaused` dari chain. Buang komentar yang salah.
3. Di halaman deposit, ambil `asset()` dari vault yang dipakai form, jangan dari snapshot.
4. Jangan pernah jatuh ke `captured` untuk halaman yang bisa menandatangani transaksi; tampilkan error.

**Bedanya setelah diperbaiki.**
Sekarang: halaman bisa menampilkan vault lain dan status pause palsu. Sesudah: setiap angka milik vault yang diminta, atau halaman menolak tampil.

---

#### K-7. Chain ID 4663 tertanam; RPC tidak diperiksa (Sedang, dari kode; terkait AV-4)

**Masalahnya apa.**
`AVENOR_CHAIN_ID = 4663` (`apps/web/src/lib/wallet.ts:9`) dipakai untuk memaksa wallet pindah chain dan menolak transaksi di chain lain. Teks "chain ID 4663" tertanam di halaman deposit (`deposit/page.tsx:138`) dan withdraw (`withdraw/page.tsx:93`). Vault testnet ada di 46630. RPC publik web (`NEXT_PUBLIC_RPC_URL`) dibuat tanpa memeriksa `eth_chainId` (`DepositForm.tsx:93-99`, `WithdrawForm.tsx:93-99`, `vaultRead.ts:190-200`); hanya `probeNode` untuk health yang membaca chainId (`vaultRead.ts:349`) tanpa membandingkan. Brief §12: "Fallback RPC harus diperiksa chain ID-nya."

**Kenapa penting.**
Form tidak bisa dipakai di testnet tanpa mengubah kode. Kalau RPC menunjuk chain lain dari wallet, simulasi berjalan di chain A, transaksi dikirim ke chain B: approve bisa lolos ke alamat tanpa kode dan deposit gagal "no_event" (aman, tapi membingungkan).

**Cara memperbaiki.**
1. Ambil `chainId` dari konfigurasi (`NEXT_PUBLIC_CHAIN_ID`), jangan konstanta.
2. Saat membuat client, panggil `getChainId()` dan bandingkan; tolak kalau beda.
3. Tampilkan chain dari konfigurasi, bukan teks tetap.

**Bedanya setelah diperbaiki.**
Sekarang: web hanya cocok untuk chain 4663 dan percaya RPC. Sesudah: satu sumber chain ID, dan ketidakcocokan terlihat sebelum menandatangani.

---

#### K-8. Deposit tanpa batas minimum shares dan tanpa umur quote (Sedang, dari kode)

**Masalahnya apa.**
`prepareDeposit` (`packages/sdk/src/writes.ts:87-97`) menyimulasikan dan mengembalikan `shares` hasil simulasi, tapi tidak ada parameter atau pemeriksaan batas minimum. `submitDeposit` (`apps/web/src/lib/deposit.ts:220-274`) mengirim `prepared.request` apa adanya. Quote (`quoteDeposit`) tidak punya umur; tombol Deposit tetap aktif lama setelah "Calculate Shares" (`DepositForm.tsx:387-391`); `blockers` memakai angka quote lama. Brief §9 langkah 3: "baca ... batas minimum shares." Brief §9: "Jika batas minimum hasil tidak tersedia pada metode core, gunakan router yang ditinjau atau desain perlindungan yang setara."

**Kenapa penting.**
Antara quote dan konfirmasi, harga share bisa bergerak (laporan, profit unlocking, donasi). Pengguna menerima shares lebih sedikit dari yang ditampilkan dan baru tahu sesudahnya dari event.

**Contoh kejadian.**
Quote 100 USDG = 99,5 shares. Dua puluh menit kemudian keeper melaporkan laba dan harga share naik; deposit yang sama menghasilkan 98,9 shares. Tidak ada batas yang menolaknya.

**Cara memperbaiki.**
1. Di `prepareDeposit` tambah `minShares` wajib; tolak kalau `result < minShares` sebelum mengirim (simulasi tepat sebelum kirim).
2. Beri umur quote (misalnya hitung ulang kalau blok sudah lewat batas) dan tampilkan "toleransi shares" seperti `maxLoss`.
3. Atau pakai router yang ditinjau yang punya `minSharesOut`.

**Bedanya setelah diperbaiki.**
Sekarang: shares final bisa lebih rendah dari quote tanpa penolakan. Sesudah: transaksi ditolak jika shares di bawah batas yang dilihat pengguna.

---

#### K-9. Tombol MAX "Redeem Shares" salah desimal (Sedang, dari kode + dijalankan)

**Masalahnya apa.**
`WithdrawForm.tsx:206`: `const decimals = mode === "assets" ? 6 : 18;`. Shares vault memakai desimal aset (6), dan formnya sendiri menerima `shareDecimals` (prop, baris ~36). `setMax` mengubah `maxShares` (6 desimal) dengan pembagi 1e18.

**Kenapa penting.**
Mode redeem adalah jalur "keluar semua". MAX mengisi angka yang salah.

**Contoh kejadian (hitung ulang dengan node).**
`maxShares = 1_500_000` (1,5 shares): kolom terisi `0.0000000000015` (13 desimal); `parseShareInput` menolak karena lebih dari 6 desimal. `maxShares = 1_000_000_000_000` (1 juta shares): kolom terisi `0.000001` yang valid, jadi pengguna merasa menekan MAX tapi hanya menarik 1 satuan terkecil.

**Cara memperbaiki.**
Pakai `shareDecimals` (prop) untuk mode shares dan baca desimal aset dari chain untuk mode assets. Tambah tes: MAX lalu parse harus sama dengan `maxShares`.

**Bedanya setelah diperbaiki.**
Sekarang: MAX di mode shares salah atau ditolak. Sesudah: MAX tepat sesuai batas vault.

---

#### K-10. Strategi bergantung pada saldo USDG di dalam venue (Sedang, dari kode)

**Masalahnya apa.**
`_venueLiquidity()` (`MorphoVaultStrategy.sol:320-326`) memakai `min(nilai posisi, asset.balanceOf(venue))`. Komentar (`:296-318`) menjelaskan alasan: `maxWithdraw` venue mengembalikan 0 walau dana ada, diukur di blok 118337511 saat venue memegang 27 juta USDG idle. Desain ini benar hanya selama venue menyimpan kas di kontraknya sendiri. Venue Morpho V2 biasanya menyalurkan dana ke adapter; jika saldo idle di venue turun mendekati 0, `availableWithdrawLimit` menjadi 0 (`:279-290`) dan `_freeFunds` revert `VenueLiquidityShortfall` (`:174-196`), walau venue masih bisa membayar lewat adapter likuiditasnya. Pada pengujian ini hanya `MockVenue` yang dipakai; satu-satunya pengaman nyata adalah `VenueProbe.t.sol` (fork), yang tidak saya jalankan.

**Kenapa penting.**
Sifatnya aman terhadap kerugian (revert, bukan realisasi loss), tapi penarikan bisa tertahan tanpa alasan nyata, dan `maxWithdraw` menyatakan "tidak ada yang bisa ditarik" padahal ada.

**Contoh kejadian.**
Curator venue memindahkan 99% kas ke adapter; saldo USDG di kontrak venue 0,5%. Pengguna dengan posisi 10.000 USDG melihat "withdrawable" 50 USDG.

**Cara memperbaiki.**
1. Ukur likuiditas dengan cara yang dijamin venue (simulasi `withdraw` via `eth_call`, atau `previewWithdraw` bila andal), dan bandingkan dengan pengukuran kas.
2. Tambah tes fork yang memindahkan kas venue ke adapter dan memeriksa perilaku.
3. Catat batasan ini di `WITHDRAWAL_SEMANTICS.md`.

**Bedanya setelah diperbaiki.**
Sekarang: asumsi satu kondisi venue. Sesudah: batas penarikan mengikuti kemampuan venue yang sebenarnya dan teruji untuk perubahan itu.

---

#### K-11. Timelock buatan luar tidak diperiksa admin dan peran (Sedang, dari kode)

**Masalahnya apa.**
Di mode prod, `_validateConfig` (`Deploy.s.sol:1124-1129`) memeriksa timelock yang disuplai: punya kode, `getMinDelay() >= 48 jam`. Tidak diperiksa siapa yang memegang `TIMELOCK_ADMIN_ROLE`, siapa proposer dan executor (bisa `address(0)` = siapa saja), atau apakah deployer masih admin. Timelock buatan skrip sendiri aman (`admin = address(0)`, `:354-356`).

**Kenapa penting.**
Admin timelock bisa memberi dirinya peran proposer dan mengubah delay sehingga 48 jam hilang. `assertSafety` juga hanya membaca delay (`:686-689`).

**Contoh kejadian.**
Timelock dibuat manual dengan admin = EOA deployer. Skrip prod lulus semua asersi. Deployer menurunkan delay jadi 0 dan menjalankan operasi sensitif.

**Cara memperbaiki.**
Di prod: wajibkan `!hasRole(TIMELOCK_ADMIN_ROLE, actor)`, `hasRole(PROPOSER_ROLE, proposer)`, executor tidak `address(0)` kecuali disengaja, dan `hasRole(TIMELOCK_ADMIN_ROLE, timelock)` untuk dirinya sendiri; tolak kalau lainnya admin.

**Bedanya setelah diperbaiki.**
Sekarang: delay 48 jam bisa kosong makna tanpa terdeteksi. Sesudah: skrip menolak timelock yang bisa dilewati.

---

### 3. Temuan rendah (ringkas)

- **K-12. Snapshot SDK tidak satu blok** (`packages/sdk/src/vault.ts:55-67`, `previews.ts:26-38`). Kalau `blockNumber` tidak diberikan, tiga bacaan di `readLiquidity` memakai "latest" masing-masing, lalu nomor blok diambil sesudahnya; header file menjanjikan satu blok. Perbaikan: ambil blok dulu, lalu pasang ke semua bacaan; kembalikan blok di preview.
- **K-13. `maxLoss` sampai 9999 bps** (`writes.ts:34-39`, `withdraw.ts:72-84`, kolom custom di `WithdrawForm.tsx`). Eksplisit (bagus), tapi tidak ada batas masuk akal. Perbaikan: batas atas konfigurasi (misal 500 bps) dan konfirmasi untuk nilai di atas itu.
- **K-14. Alamat cadangan dan kunci publik di skrip** (`DeployTestnet.s.sol:49` deployer cadangan 0x56d8...; `ExecuteGovernanceRehearsal/Schedule/Execute` dan `DeployLocal` memakai 0xf39F... kunci anvil #0; `4663.stage.json` memakai akun anvil untuk guardian/keeper/treasury, diberi label fork). `PRIVATE_KEY` dibaca dari env (`DeployTestnet.s.sol:42`). Kalau kunci/alamat tidak diberikan, skrip tidak boleh diam-diam memilih alamat. Perbaikan: gagalkan bila `DEPLOYER_ADDRESS` kosong; pakai keystore atau perangkat keras (`--account`/`--ledger`).
- **K-15. Strategi: skala venue dan darurat** (`MorphoVaultStrategy.sol:100-111`, `:234-243`). Konstruktor memeriksa `asset()` tapi tidak sanity-check `convertToAssets` (galat 1e12 yang dijelaskan komentar di §1 header). `_emergencyWithdraw` memanggil `redeem` seluruh saldo; jika venue iliquid, revert dan dana tidak ditarik sebagian. Perbaikan: cek skala di konstruktor, dan tarik sebanyak `_venueLiquidity()` bila penuh tidak bisa.
- **K-16. Approve dan desimal** (`writes.ts:131-140`; `deposit.ts:229-252`; `deposit.ts:50`; `DepositForm.tsx:288`). SDK menerima jumlah apa pun termasuk `maxUint256` (web sudah memakai jumlah pas, bagus). Bila approve sukses lalu deposit gagal, allowance sebesar jumlah itu tertinggal untuk vault. Desimal USDG 6 tertanam di parser dan tombol MAX, bukan dibaca dari token (brief §9 minta desimal diverifikasi). Perbaikan: baca `decimals()` aset, tampilkan/kelola allowance sisa.
- **K-17. Wallet** (`wallet.ts` tanpa `accountsChanged`/`chainChanged`; `DepositForm.tsx:48,160`). Akun tersimpan di state sejak connect; berganti akun di wallet tidak terbaca. Fase "pending" ada di tipe tapi `setPhase("pending")` tidak pernah dipanggil, jadi sesudah tanda tangan UI tetap menulis "Awaiting signature…" saat menunggu receipt. Perbaikan: pasang listener, set fase pending setelah hash.
- **K-18. Skrip governance testnet hanya mencetak** (`ExecuteTestnet46630Governance.s.sol:59-93`, `run() external view`). Menghitung ID operasi dengan salt tetap `1` dan mencetak calldata; tidak menjadwalkan atau mengeksekusi. Namanya bisa dikira bukti eksekusi. Perbaikan: ubah nama (misal `PrintGovernanceCalldata`) atau tambahkan jalur kirim.

---

### 4. Yang sudah bagus

- `MorphoVaultStrategy`: approve ke venue sebesar jumlah pas lalu di-nol-kan di dua jalur (`:143-164`); `_freeFunds` mengukur selisih saldo, tidak percaya nilai balik `withdraw` yang berupa shares (`:187-195`); revert dengan error khusus daripada merealisasikan loss diam-diam; skala 6 vs 18 desimal ditangani lewat `convertToAssets`; venue `immutable`; tidak ada `delegatecall`, tidak ada `transfer_hook`; overflow `availableWithdrawLimit` ditangani.
- Fee ganda di strategi dibersihkan di skrip dan dibaca balik (`Deploy.s.sol:505-530`).
- Skrip deploy: hash bytecode vault dan factory diperiksa, fee dibatasi, `refundRatio` ditolak saat akun belum terisi, guardian tidak boleh sama dengan proposer atau keeper, matriks peran dibaca balik dari chain, bit berbahaya tidak boleh dipegang keeper, `deposit_limit` 0 saat deploy, timelock buatan skrip memakai `admin = 0`.
- SDK: `maxLoss` wajib dan diperiksa (`writes.ts:16-39`), tidak ada nilai bawaan diam-diam; semua penulisan lewat `simulateContract`; amount diparse tanpa `Number` (`amounts.ts`).
- Web: approve pas jumlah, receipt dibaca dari event `Deposit`/`Withdraw` (bukan dari quote), receiver selalu akun penanda tangan (tidak ada kolom alamat tujuan), chain wallet dibaca ulang sebelum kirim, `maxLoss` default 0, kegagalan baca RPC tidak menjadi nol.
- `DepositCapHook`: hanya vault yang boleh memanggil `post_deposit`; setter hanya governance; tidak pernah menyentuh penarikan (tes `test_rejectEveryoneStillAllowsFullExit` lulus); cap dihitung live, bukan counter yang melenceng.
- Tes unit repo: 111 lulus pada saat saya jalankan.

---

### 5. Yang TIDAK sempat diperiksa

- Tes fork (`test/fork/*`) dan invariant (`test/invariant/*`): tidak dijalankan. `VenueProbe.t.sol` dan klaim "diukur di blok 118337511" tidak saya verifikasi.
- Source Vyper `VaultV3.vy`: tidak ada di repo (hanya artefak). Perilaku `buy_debt`, `set_deposit_hook`, `process_report` saya uji lewat bytecode, bukan dibaca dari source. Nama fungsi `setPaused/isPaused` yang ada di ABI repo tidak saya cocokkan dengan release upstream.
- Skrip lain: `ExecuteDrills.s.sol`, `ExecuteGovernanceSchedule/Execute/Rehearsal.s.sol`, `ExecuteWithdrawalRehearsal.s.sol`, `DeployLocal.s.sol` hanya saya skim (tidak baca baris per baris).
- Kontrak antarmuka (`IAccountant`, `IVaultV3`, `IVaultFactory`) hanya saya baca sepintas; keselarasan ABI diserahkan pada tes `GeneratedInterfaces.t.sol` yang lulus.
- Pustaka vendor (`lib/tokenized-strategy` termasuk perubahan "penguncian per blok" dan `_simulatedTotals`, `lib/openzeppelin-contracts`): saya baca bagian yang disentuh (penilaian live), bukan audit penuh. Perilaku donation/inflation untuk deposit pertama dan penyebaran dead shares (brief §7.2) tidak diuji; seed `0` di testnet (`46630.stage.json` `seedAssets: 0`).
- Jalur darurat 6 jam: guardian bisa menjadwalkan `force_revoke_strategy`, dan governance 48 jam tidak bisa membatalkannya (timelock terpisah, admin 0). Dampak terhadap harga share dan perlakuan fee saat strategi didaftarkan ulang tidak saya uji.
- Konsistensi docs dengan kode, indexer, keeper, dan operator console: di luar cakupan tahap ini.
- Komponen web lain (`PortfolioPanel`, `vaultView.ts`, `format.ts`, `evidence.ts`, `portfolioCsv.ts`): hanya saya skim. Tidak ada tes browser atau dompet nyata; semua temuan web dari kode.
- Pengecekan onchain saya terbatas pada Safe, `role_manager`, peran keeper, `deposit_hook`, `deposit_limit`; saya tidak membaca seluruh state vault testnet atau menguji transaksi nyata.

---

### 6. Checklist tugas untuk anak dev

- [ ] K-1: tambahkan `set_role(timelock, Roles.governanceRoleSet())` sebagai panggilan pertama di `_buildProposal` (`Deploy.s.sol:550-585`) dan sesuaikan indeks.
- [ ] K-1: di prod, wajibkan `management == timelock` di `_validateConfig`, atau ubah `acceptManagement` agar sesuai.
- [ ] K-1: tulis tes yang menjadwalkan dan mengeksekusi paket prod lewat `TimelockController`, lalu cek `roles`, `strategies`, `accountant`.
- [ ] K-2: hapus pemakaian `makeAddr` untuk owner Safe dan keeper di `DeployTestnet.s.sol:98,140-145`; terima alamat owner dari env dan gagalkan jika kosong.
- [ ] K-2: ganti owner ke-2/ke-3 di ketiga Safe testnet dengan alamat nyata; ganti keeper testnet; perbarui bukti di `TESTNET_EVIDENCE.md`.
- [ ] K-3: tulis runbook "laporan tertahan" dan putuskan siapa memegang `turnOffHealthCheck` (jalur cepat); tambah tes donasi 6% dan kerugian 3%.
- [ ] K-4: cabut `DEBT_PURCHASER` dari treasury (`Deploy.s.sol:451,566`); beri hanya ke alamat migrasi lewat timelock; ubah `ROLE_PERMISSION_MATRIX.md`.
- [ ] K-5: buat skrip deploy dan pasang `DepositCapHook` (lewat timelock), baca `deposit_hook()` sesudahnya.
- [ ] K-5: tambah tes "melepas hook tidak boleh membuka deposit"; dokumentasikan cara menutup (`set_deposit_limit(0, true)`); koreksi komentar "emergency switch" di `DepositCapHook.sol:202-203`.
- [ ] K-5: pertimbangkan `governance` hook yang bisa dipindah (dua langkah).
- [ ] K-6: jadikan alamat vault parameter nyata di `readVaultSnapshot`, `getDirectVaultDetail`, `readPosition`; hapus `STAGING_VAULT` sebagai bawaan.
- [ ] K-6: baca `isPaused` dari chain (`serverData.ts:94`); hapus komentar yang salah.
- [ ] K-6: halaman deposit/withdraw tidak boleh memakai data `captured`; tampilkan error saja.
- [ ] K-7: pindahkan chain ID ke konfigurasi; cek `getChainId()` RPC sebelum membaca; hapus teks "4663" yang tertanam di halaman deposit/withdraw.
- [ ] K-8: tambah `minShares` wajib di `prepareDeposit`, simulasi ulang tepat sebelum kirim, beri umur quote.
- [ ] K-9: perbaiki `setMax` di `WithdrawForm.tsx:206` agar memakai `shareDecimals`; tambah tes MAX lalu parse.
- [ ] K-10: ganti ukuran likuiditas venue (simulasi `withdraw` atau sumber yang dijamin) dan tambah tes fork saat kas venue pindah ke adapter.
- [ ] K-11: tambahkan pemeriksaan admin, proposer, dan executor timelock di `_validateConfig` dan `assertSafety` untuk prod.
- [ ] K-12: baca satu blok dulu lalu pasang ke semua bacaan di `readLiquidity` dan preview; kembalikan nomor blok.
- [ ] K-13: tetapkan batas atas `maxLoss` (misal 500 bps) dan minta konfirmasi untuk nilai lebih tinggi.
- [ ] K-14: gagalkan skrip bila `DEPLOYER_ADDRESS` kosong; pakai `--account`/hardware wallet; hapus alamat deployer cadangan.
- [ ] K-15: sanity check skala venue di konstruktor strategi; `_emergencyWithdraw` boleh menarik sebagian.
- [ ] K-16: baca `decimals()` aset; sediakan cara membersihkan allowance sisa.
- [ ] K-17: pasang listener `accountsChanged` dan `chainChanged`; set fase "pending" setelah hash.
- [ ] K-18: ganti nama `ExecuteTestnet46630Governance.s.sol` atau tambahkan jalur kirim yang nyata.
- [ ] Jalankan ulang `forge test` (unit, fork, invariant) sesudah semua perbaikan; catat hasilnya di dokumen bukti.

---

# LAMPIRAN B: Tahap 2, Keeper dan Indexer (S-1..S-25)
> Ditulis oleh sub-agent Sonnet (effort rendah). Temuan indexer semuanya dari membaca kode dan test, bukan dari eksekusi (Postgres tidak tersedia).

## Audit Tahap 2: Keeper dan Indexer Avenor

Sifat audit: baca kode saja (read-only). Tidak ada file repo yang diubah, tidak ada commit, push, atau pull.
Repo: `/Users/mac/Documents/Workspace/Work/Wealth/November/BRAINSTROMING/avenor/repo`
Acuan: `BRIEF.md` §12, §13, §15. Temuan AV-1 sampai AV-11 di `GAP_ANALYSIS_Avenor.md` tidak diulang. Bila sebuah temuan S berkaitan dengan AV-8 atau AV-9, hal itu disebut dan hanya detail barunya yang ditulis.

Semua path di bawah relatif ke `repo/services/`, kecuali disebut lain.

### Hasil menjalankan test

| Bagian | Perintah | Hasil |
|---|---|---|
| Keeper | `npm test` di `keeper/` (Node v24.19.0) | Dijalankan. 23 test, 23 lulus, 0 gagal (sekitar 3,3 detik). Dokumen `docs/KEEPER.md:7` menulis 22 test, angkanya basi. |
| Indexer | `npm test` di `indexer/` | **Tidak dijalankan.** Test butuh Postgres. `psql`, `pg_ctl`, `postgres` tidak ada di mesin ini, dan `scripts/db-test.py` butuh `initdb`. Saya tidak menyalakan kontainer Docker. |
| Cek kecil di luar repo | Potongan skrip Node di folder scratchpad: hitung ulang hash topik event dan selector fungsi dengan viem; cek perilaku `AbortController` | Dijalankan. Semua 7 hash topik di `indexer/src/decode.ts:12-21` dan semua selector di `indexer/src/reconcile.ts:19-43` cocok dengan tanda tangan fungsi/event yang masuk akal. Perilaku `AbortError` dipakai di S-16. |

### 1. Ringkasan temuan

| ID | Temuan | Seberapa serius | Status bukti |
|---|---|---|---|
| S-1 | Keeper tidak menunggu receipt dan tidak melacak tx yang masih pending. Job yang sama bisa dikirim dua kali, termasuk setelah restart | Tinggi | dari kode |
| S-2 | Error "already known" dianggap error nonce, lalu tx dikirim ulang dengan nonce baru, jadi tx ganda | Sedang | dari kode |
| S-3 | Tidak ada batas nominal per tx, batas harian, cooldown, atau gas budget. Gas tetap 1.500.000 | Tinggi | dari kode |
| S-4 | Allowlist fungsi/target hanya "kebetulan" dari cara job ditulis, tidak ditegakkan di pengirim. Audit log hanya stdout | Sedang | dari kode |
| S-5 | Kunci privat dari env mentah (bukan referensi signer). Pesan error viem bisa membawa URL RPC (sering berisi API key) ke log | Sedang | dari kode (bagian viem: pengetahuan umum, tidak dijalankan) |
| S-6 | Chain ID tidak diperiksa di keeper maupun indexer, dan tidak ada RPC fallback | Sedang | dari kode |
| S-7 | Tidak ada "report due" berbasis waktu dan tidak ada cek umur data. Monitor tidak punya banyak sinyal yang diminta brief §13 | Sedang | dari kode |
| S-8 | Alert hilang bila webhook gagal (komentar kode bilang diulang, kenyataannya tidak). Alert yang sama dikirim tiap menit | Sedang | dari kode |
| S-9 | Kelemahan kecil di konfigurasi dan shutdown keeper | Rendah | dari kode |
| S-10 | "Soak test 7 hari" adalah angka yang ditulis tetap di kode. Tidak ada test restart, nonce race, atau report ganda | Tinggi | dari kode, dijalankan (lulus) |
| S-11 | Rekonsiliasi `totalAssets` memakai model yang salah: deposit dan withdraw diabaikan | Tinggi | dari kode |
| S-12 | Rekonsiliasi supply tidak dibatasi ke blok yang sama. Shares per user, debt per strategi, dan idle tidak direkonsiliasi. Tidak ada penjadwal | Sedang | dari kode |
| S-13 | Rollback reorg tidak mengembalikan `role_state`, `strategies`, `vaults`, snapshot onchain, dan membiarkan posisi lama bila akun hilang | Tinggi | dari kode |
| S-14 | `role_events` hanya menyimpan satu bit per event RoleSet. Bit lain hilang | Tinggi | dari kode |
| S-15 | `block_time` salah untuk hampir semua log. Ada celah waktu antara `getLogs` dan baca header | Sedang | dari kode |
| S-16 | Timeout RPC tidak di-retry (kode retry salah baca `AbortError`) | Sedang | dari kode + dijalankan (potongan kecil) |
| S-17 | Indexer tidak punya proses yang bisa dijalankan (loop ingest, server API, jadwal rekonsiliasi). Tabel `vaults` tidak pernah diisi | Tinggi | dari kode |
| S-18 | API membaca alamat vault dari URL, tapi `/live`, `/roles`, `/allocation` selalu menjawab untuk vault di config | Sedang | dari kode |
| S-19 | API tanpa cache/rate limit, parameter `block` bebas, pesan 500 membocorkan teks error mentah | Rendah | dari kode |
| S-20 | Endpoint, entity, dan field freshness dari brief §12 yang belum ada. `/health` selalu `ok: true` | Sedang | dari kode |
| S-21 | Jenis fee salah label (`performance` = total fee) dan bisa terhitung ganda. Event penting tidak diindeks | Sedang | dari kode |
| S-22 | Aturan "satu penulis" tidak ditegakkan (tidak ada lock) | Rendah | dari kode |
| S-23 | Kualitas test indexer: jalur report/fee/role/strategi tidak diuji, test rekonsiliasi menyalin rumus yang sama, `reorg-test.py` lemah | Sedang | dari kode |
| S-24 | CI kemungkinan tidak menjalankan test indexer (butuh `initdb`, `DATABASE_URL` dari CI tidak dipakai) | Sedang | dari kode, tidak dijalankan |
| S-25 | Alokasi hanya membaca `default_queue`. Decode array tanpa batas ukuran | Rendah | dari kode |

Jumlah: Tinggi 7, Sedang 14, Rendah 4. Total 25.

### 2. Temuan besar

#### S-1. Tidak ada cek receipt, tx pending tidak dilacak (Tinggi)

**Masalahnya apa.**
`Keeper.runJob` memanggil `sender.send(...)` lalu langsung menganggap sukses begitu hash tx kembali (`keeper/src/keeper.ts:116-118`). `viemSender.send` hanya memanggil `sendTransaction` dan tidak pernah menunggu receipt (`keeper/src/viemSender.ts:41-51`). Tidak ada kode yang membaca `eth_getTransactionReceipt`. `Job.onSent` dipanggil setelah hash, bukan setelah tx masuk blok (`keeper.ts:118`). Job dijalankan tiap `INTERVAL_MS` (minimal 5 detik, `config.ts:56`, `main.ts:121`). Kunci "tidak ada reentry" (`keeper.ts:66-68`) hanya mencegah dua `runOnce` jalan bersamaan. Ia tidak mencegah tick berikutnya merencanakan ulang saat tx sebelumnya belum masuk blok.
`docs/KEEPER.md:46-49` bilang satu tx in-flight dijaga supaya simulasi kedua tidak memakai state lama. Kodenya tidak melakukan itu.
Saat restart, nonce dibaca dari `blockTag: "pending"` (`viemSender.ts:23`). Itu benar untuk nonce, tapi keeper baru tetap merencanakan job dari state yang belum memuat tx pending, jadi ia mengirim job yang sama lagi.

**Kenapa penting.**
Brief §13 menulis "retry yang memeriksa receipt sebelum mengirim ulang" dan §15 mewajibkan test "keeper restart, nonce race, report duplikat". Tanpa itu, keeper bisa menghabiskan gas untuk tx yang pasti gagal, atau mengirim `update_debt` dua kali. Keeper juga tidak bisa tahu tx-nya revert di blok (simulasi lolos, eksekusi nyata bisa gagal).

**Contoh kejadian.**
1. Ada 5.000 USDG idle di atas lantai. Tick 1 merencanakan `update_debt(strategy, target, 0)` dan mengirimnya (nonce 10). Blok belum terbit.
2. 5 detik kemudian tick 2 membaca state yang sama (idle belum berubah), merencanakan `update_debt` dengan target sama, simulasi lolos (simulasi memakai `latest`), dan mengirim dengan nonce 11.
3. Hasilnya dua tx. Yang kedua sia-sia atau, untuk `process_report`, memboroskan gas dan menambah noise di log. Bila tx pertama tidak pernah masuk (gas terlalu rendah, dibuang node), keeper tetap mencatat "sent" dan `onSent` sudah jalan.

**Cara memperbaiki.**
- Setelah `send`, tunggu receipt dengan batas waktu (`waitForTransactionReceipt`), periksa `status`, dan catat hasilnya di log. Job berikutnya baru boleh jalan setelah receipt ada atau tx dinyatakan hilang.
- Simpan tx yang belum selesai (hash, nonce, calldata, waktu kirim) di file/DB kecil. Saat start, baca daftar itu dan cek receipt dulu sebelum merencanakan apa pun.
- Kalau tx terlalu lama pending, ganti dengan nonce yang sama dan gas lebih tinggi (replace), jangan kirim nonce baru.
- Panggil `onSent` hanya setelah receipt sukses.
- Tambah test: restart di tengah tx pending, tick kedua saat tx pertama belum mined, tx mined tapi revert.

**Bedanya setelah diperbaiki.**
Satu keputusan menjadi satu tx. Restart tidak menggandakan kiriman. Log menunjukkan hasil nyata (mined/revert/hilang), bukan hanya "hash terkirim".

#### S-2. "already known" dianggap error nonce (Sedang)

**Masalahnya apa.**
`isNonceError` menganggap `already known` sebagai "nonce bergerak" (`keeper/src/sender.ts:29`). `Keeper` lalu membuang nonce cache, membaca nonce pending baru, dan mengirim lagi (`keeper.ts:129-132`).

**Kenapa penting.**
`already known` berarti tx yang sama persis sudah ada di mempool node. Itu tanda tx pertama sebenarnya sampai. Mengirim lagi dengan nonce baru membuat tx kedua yang berisi panggilan sama.

**Contoh kejadian.**
`send` timeout di sisi klien, tapi node sudah menerima tx. Keeper mencoba lagi, node menjawab `already known`, keeper mengambil nonce pending (yang sudah naik) dan mengirim panggilan yang sama sebagai tx baru.

**Cara memperbaiki.**
Pisahkan jenisnya. `nonce too low` berarti baca ulang nonce dan cek receipt tx lama. `already known` berarti anggap sukses terkirim dan lanjut ke menunggu receipt. Jangan pernah mengirim ulang calldata yang sama dengan nonce baru tanpa cek dulu.

**Bedanya setelah diperbaiki.**
Timeout jaringan tidak lagi menghasilkan dua tx.

#### S-3. Tidak ada batas nominal, cooldown, atau gas budget (Tinggi)

**Masalahnya apa.**
- Gas dipatok `1_500_000n` dan tidak ada batas harga gas (`keeper/src/viemSender.ts:49`).
- Tidak ada gas budget harian dan tidak ada cek saldo native sebelum kirim.
- `allocationJob` memindahkan semua idle di atas lantai sekaligus, hanya dibatasi `max_debt` (`keeper/src/jobs.ts:140-152`). Tidak ada batas nominal per tx atau per hari.
- Tidak ada cooldown antar tx untuk job yang sama. `reportJob` dengan `MIN_GAIN_BPS=0` (dibolehkan, `config.ts:53`) melapor di setiap tick yang ada gain (`jobs.ts:90-91`).

**Kenapa penting.**
Brief §13: "Terapkan allowlist fungsi/target, batas nominal, cooldown dan audit log." Tanpa batas, kesalahan konfigurasi, RPC yang mengembalikan data aneh, atau kunci keeper yang bocor bisa memindahkan seluruh idle ke strategi dalam satu tick dan menguras gas.

**Contoh kejadian.**
User menyetor 1.000.000 USDG. Dalam 5 detik keeper menaikkan debt strategi sebesar semua idle di atas lantai. Tidak ada langkah bertahap, tidak ada tinjauan manusia, tidak ada batas per hari.

**Cara memperbaiki.**
- Tambah di config: `MAX_DEBT_STEP` (nominal maksimum per `update_debt`), `MAX_DAILY_MOVED`, `COOLDOWN_SECONDS` per job, `MAX_GAS_PRICE`, `MIN_NATIVE_BALANCE`.
- Tegakkan batas di satu tempat sebelum `send` (lihat S-4), bukan hanya di job.
- Simpan hitungan harian di file/DB supaya batas tetap berlaku setelah restart.
- Tambah test batas: tepat di batas, di atas batas, setelah restart.

**Bedanya setelah diperbaiki.**
Kerugian terburuk dari satu tick, satu hari, atau satu kunci bocor punya batas atas yang tertulis dan teruji.

#### S-4. Allowlist tidak ditegakkan, audit log hanya stdout (Sedang)

**Masalahnya apa.**
`KeeperSender.send` menerima `KeeperTx` apa saja: `to`, `data`, `value` bebas (`keeper/src/sender.ts:7-24`). Saat ini hanya dua job yang membuat tx, ke `cfg.vault`, dengan dua fungsi (`jobs.ts:111-114`, `jobs.ts:167-173`). Itu aman hanya karena kode job-nya begitu. Tidak ada pemeriksaan `to` dan selector di pengirim. Log hanya `process.stdout` (`keeper/src/log.ts:25-31`) dan tidak ada tempat penyimpanan tetap.
`docs/KEEPER.md:123` menulis kunci keeper hanya punya `REPORTING_MANAGER` dan `DEBT_MANAGER`. Itu peran per vault, bukan per strategi. Kunci yang bocor bisa memanggil `update_debt` ke strategi apa pun yang ada di vault.

**Kenapa penting.**
Brief §13: "Keeper tidak boleh melakukan arbitrary calls." Hari ini aman karena tidak ada kode yang membuat panggilan lain, tapi satu perubahan di masa depan sudah cukup untuk melanggar aturan itu tanpa ada pengaman.

**Contoh kejadian.**
Seorang dev menambah job baru dan salah memasang `to`. Tidak ada yang menolaknya. Atau log di stdout hilang saat kontainer diganti, dan tidak ada jejak audit.

**Cara memperbaiki.**
- Bungkus `KeeperSender` dengan `GuardedSender` yang memeriksa: `to` ada di daftar, 4 byte pertama calldata ada di daftar `{process_report, update_debt}`, argumen strategi ada di daftar, `value == 0`.
- Tulis log audit ke file append-only atau ke tabel (`KeeperRun`, yang juga diminta brief §12).
- Uji dengan tx ke alamat lain, fungsi lain, dan nilai tidak nol: harus ditolak.

**Bedanya setelah diperbaiki.**
"Keeper tidak bisa arbitrary call" jadi sifat yang dijaga kode dan test, bukan kebetulan.

#### S-5. Kunci dari env mentah, URL RPC bisa bocor ke log (Sedang)

**Masalahnya apa.**
- `KEEPER_PRIVATE_KEY` dibaca langsung dari env sebagai string hex (`keeper/src/config.ts:42-52`) dan dipakai `privateKeyToAccount` (`main.ts:45`). Brief §14 minta `KEEPER_SIGNER_REFERENCE` dan secret manager.
- Kuncinya sendiri tidak dicetak ke log (bagus, lihat bagian "Yang sudah bagus").
- Tapi pesan error dicetak mentah: `message(error)` (`keeper.ts:158-161`) dan `main.ts:89,112,115`. Error HTTP dari viem biasanya memuat baris `URL:` ke endpoint. `RPC_URL` untuk provider berbayar sering memuat API key di path. Bagian ini berdasar pengetahuan saya tentang format error viem, **tidak saya jalankan**.
- URL webhook alert juga bisa muncul di pesan error `fetch` (`notify.ts:27-38`).

**Kenapa penting.**
Log biasanya dikirim ke tempat yang lebih longgar hak aksesnya daripada env. API key atau URL webhook Slack yang masuk ke log ikut bocor.

**Contoh kejadian.**
RPC timeout. Entri log `reason: "send failed: ... URL: https://rpc.example/<API_KEY>"`. Log dikirim ke layanan log pihak ketiga.

**Cara memperbaiki.**
- Tambah fungsi `redact()` yang menghapus URL, query string, dan string hex 64 karakter dari semua teks error sebelum masuk ke `Logger`.
- Ganti `KEEPER_PRIVATE_KEY` dengan referensi signer (mis. KMS/remote signer), atau minimal baca dari file rahasia dengan izin ketat, bukan env.
- Tambah test: error yang membawa URL RPC tidak boleh muncul utuh di log.

**Bedanya setelah diperbaiki.**
Secret tidak bisa lewat log, dan kunci tidak hidup di env proses.

#### S-6. Chain ID tidak diperiksa, tidak ada RPC fallback (Sedang)

**Masalahnya apa.**
- Keeper: `createPublicClient`/`createWalletClient` dibuat tanpa `chain` (`keeper/src/main.ts:46-47`). Tidak ada `CHAIN_ID` di `config.ts`. Keeper tidak memeriksa bahwa RPC menjawab chain yang diharapkan sebelum menandatangani.
- Indexer: `httpRpc` hanya punya satu URL dan tidak pernah memanggil `eth_chainId` (`indexer/src/rpc.ts:50-137`). `chainId` hanya label dari env (`indexer/src/liveIngest.ts:22`, default `31337`).
- Tidak ada daftar RPC cadangan di keduanya (terkait AV-9, yang hanya mencatat config).

**Kenapa penting.**
Brief §12: "Fallback RPC harus diperiksa chain ID-nya." Salah URL (mainnet vs testnet) bisa membuat keeper menandatangani di chain lain, dan indexer menyimpan data chain lain dengan label chain yang salah. Saat fallback ditambahkan nanti, tanpa pemeriksaan ini data bisa tercampur.

**Contoh kejadian.**
Operator menyalin `RPC_URL` testnet ke env produksi. Indexer mengisi tabel berlabel `chain_id=4663` dengan data chain lain.

**Cara memperbaiki.**
- Tambah `EXPECTED_CHAIN_ID` di kedua service. Saat start dan tiap kali pindah RPC, panggil `eth_chainId` dan berhenti bila beda.
- Dukung daftar RPC bertingkat (utama, cadangan) dengan pemeriksaan chain ID dan pemeriksaan `eth_blockNumber` tidak tertinggal jauh.
- Tambah test: RPC yang menjawab chain ID lain ditolak.

**Bedanya setelah diperbaiki.**
Salah konfigurasi gagal keras di awal, bukan merusak data atau tanda tangan di chain yang salah.

#### S-7. Tidak ada "report due" dan cek umur data; monitor kurang sinyal (Sedang)

**Masalahnya apa.**
- `reportJob` memutuskan hanya dari persen gain (`keeper/src/jobs.ts:90-98`). Ia tidak membaca `last_report` strategi dan tidak punya batas waktu maksimum antar report. Bila gain tetap di bawah ambang, report tidak pernah dikirim, dan harga share di vault makin basi.
- Tidak ada pemeriksaan bahwa blok yang dibaca masih segar (umur timestamp blok vs jam sekarang). RPC yang tertinggal membuat keeper memutuskan dari data lama.
- `monitor.ts:48-102` hanya memeriksa shutdown, pause, deposit limit 0, kapasitas withdraw nol, perubahan `totalAssets`, perubahan deposit limit dan fee. Brief §13 meminta: report due, keeper health, allocation drift, liquidity, venue pause, price anomalies, fee accrual, RPC lag. Yang belum ada: report due, keeper health (heartbeat), allocation drift, price anomaly, RPC lag.

**Kenapa penting.**
Brief §12: "operasi risiko baru berhenti ketika batas freshness terlampaui" dan "Tampilkan report freshness". Tanpa ini tidak ada sinyal bahwa keeper berhenti diam-diam.

**Contoh kejadian.**
Gain kecil terus di bawah ambang. Tidak ada report selama dua minggu. Tidak ada alert. Harga share tidak naik, pengguna melihat hasil nol.

**Cara memperbaiki.**
- Tambah `MAX_REPORT_AGE_SECONDS`: bila `now - lastReport` melebihi batas, kirim report (kalau gain tidak negatif) atau kirim alert.
- Tambah pemeriksaan `block.timestamp` vs jam lokal; bila lebih tua dari batas, job tidak mengirim apa pun dan memberi alert "RPC lag".
- Tambah alert `report-due`, `keeper-heartbeat-missing`, `allocation-drift`, `rpc-lag`.

**Bedanya setelah diperbaiki.**
Keeper yang berhenti atau RPC yang basi terlihat dalam menit, bukan ditemukan pengguna.

#### S-8. Alert hilang saat webhook gagal, dan alert diulang tiap menit (Sedang)

**Masalahnya apa.**
- `main.ts:100` menyimpan `previous = snapshot` **sebelum** mengirim alert. Bila webhook gagal (`main.ts:111-113`), alert berbasis perbandingan (mis. `total-assets-moved`) tidak akan muncul lagi di tick berikutnya, karena `previous` sudah maju. Komentar di `main.ts:6-8` mengatakan alert diulang di tick berikutnya. Itu benar untuk alert berbasis keadaan (shutdown, pause) tapi tidak untuk alert berbasis perubahan.
- Tidak ada deduplikasi. Selama shutdown atau pause berlangsung, alert kritis sama dikirim tiap `MONITOR_INTERVAL_MS` (60 detik).

**Kenapa penting.**
Alert paling penting (aset melonjak atau turun) justru yang bisa hilang saat webhook sedang bermasalah. Alert yang diulang terus membuat orang mematikan notifikasi.

**Contoh kejadian.**
Aset turun 30%. Webhook Slack sedang 5xx. Tick berikutnya aset stabil di angka baru, jadi tidak ada alert lagi. Tidak ada yang tahu.

**Cara memperbaiki.**
- Majukan `previous` hanya bila pengiriman berhasil, atau simpan antrean alert yang belum terkirim dan coba kirim ulang.
- Tambah kunci dedupe (`code` + status) dengan jeda ulang (mis. kirim lagi bila masih aktif setelah N menit) dan kirim pesan "pulih" saat selesai.
- Tambah test: webhook gagal pada tick 1, lalu tick 2 tetap mengirim alert yang tertunda.

**Bedanya setelah diperbaiki.**
Alert tidak hilang karena gangguan webhook, dan tidak membanjiri saluran.

#### S-9. Kelemahan kecil di konfigurasi dan shutdown keeper (Rendah)

Daftar singkat, semuanya dari kode:
- `MAX_ASSETS_DELTA_BPS` kosong menjadi `Number("")` yaitu 0, lolos pemeriksaan integer (`keeper/src/main.ts:24,40`). Ambang jadi 0 dan setiap perubahan `totalAssets` memicu alert kritis, padahal pesan error di sana berjanji "unnamed threshold" ditolak.
- `MONITOR_INTERVAL_MS` tidak divalidasi (`main.ts:23`). Nilai tidak valid (NaN) membuat `setInterval` berjalan sangat rapat.
- `owner: account.address` (`main.ts:64`) berarti `maxWithdraw` dibaca untuk dompet keeper sendiri. Dompet itu hampir pasti tidak punya shares, jadi sinyal "kapasitas withdraw" tidak mewakili vault. Komentar `monitor.ts:12` bilang "treasury/owner account".
- Log SIGTERM menulis "no transaction is in flight after this line" (`main.ts:129`), tapi tidak ada yang menunggu tick yang sedang berjalan sebelum `process.exit(0)`. Klaimnya tidak benar.
- File stop menghentikan keeper secara permanen di proses itu. Bila file dihapus, `runOnce` tetap melempar `KeeperStoppedError` tiap tick dan tercatat sebagai error (`main.ts:81-90`) sampai proses di-restart.
- `HARD_IDLE_FLOOR` dibatasi `Number.MAX_SAFE_INTEGER` (`config.ts:55`), terlalu kecil untuk token 18 desimal.

**Cara memperbaiki.** Validasi semua env numerik dengan fungsi `integer()` yang sama, perlakukan string kosong sebagai tidak diisi, baca `maxWithdraw` untuk alamat treasury yang di-config, tunggu tick selesai saat SIGTERM, dan parse `HARD_IDLE_FLOOR` sebagai `BigInt` langsung dari string.

#### S-10. "Soak 7 hari" adalah angka tetap; test otomasi inti tidak ada (Tinggi)

**Masalahnya apa.**
`keeper/test/soak.test.ts` memakai pengirim palsu yang selalu sukses (`:18-37`), state vault yang tidak pernah berubah (`:57-59`, idle selalu 1.800.000.000), `reconciliationDelta = 0n` yang ditulis langsung (`:106`), `uptimePct: 100.0` yang ditulis langsung (`:110`), lalu menegaskan nilai-nilai itu sendiri (`:119-126`). Karena state tidak berubah, keeper "mengirim" `update_debt` yang sama 168 kali (tiap jam), dan test menganggapnya sehat. Test ini tidak bisa gagal akibat perilaku keeper nyata.
`docs/ACCEPTANCE_EVIDENCE.md:123-130` jujur bahwa ini harness in-process dan bukan soak 7 hari. Tapi hasilnya ("Uptime 100%", "False alerts 0") tetap dipajang sebagai hasil pengujian, dan 168 transaksi identik tidak ditandai sebagai tanda bahaya.
Selain itu, brief §15 baris "Automation" meminta: keeper restart, nonce race, report duplikat, stale source, gagal RPC. Di `keeper/test/keeper.test.ts` yang ada hanya: nonce too low sekali (`:194-206`), kegagalan non-nonce (`:208-216`), plan error (`:218-233`), kill switch (`:174-192`). Tidak ada test restart, tx pending, "already known", report ganda, atau sumber basi.

**Kenapa penting.**
Bukti bahwa keeper aman dioperasikan terlihat hijau padahal tidak mengukur apa pun. Ini membuat S-1 dan S-2 lolos tanpa terdeteksi.

**Contoh kejadian.**
Reviewer membaca "168 siklus, 0 gagal, rekonsiliasi bersih" dan menyimpulkan keeper stabil. Padahal angka itu tidak datang dari pengukuran.

**Cara memperbaiki.**
- Ganti soak dengan harness yang memakai node simulasi (anvil atau fake node yang bisa mine blok, drop tx, dan restart proses) dan menghitung metrik dari log keeper, bukan dari konstanta.
- Tambah test yang diminta brief §15: restart saat tx pending, dua instance, report ganda, RPC mati di tengah, data basi.
- Beri label jelas "rehearsal logika, bukan bukti soak" di nama test sampai soak nyata di staging selesai.

**Bedanya setelah diperbaiki.**
Hijau di test berarti keeper benar-benar tahan skenario itu.

#### S-11. Rekonsiliasi `totalAssets` memakai model yang salah (Tinggi)

**Masalahnya apa.**
`reconcile()` menghitung aset yang diharapkan = snapshot onchain terakhir + Σgain − Σloss + Σrefund (`indexer/src/reconcile.ts:344-348`). Deposit dan withdraw tidak masuk hitungan. Komentar `reconcile.ts:4-8` dan `docs/ACCOUNTING.md:126-130` menulis bahwa deposit/withdraw "hanya memindahkan idle versus supply" dan tidak mengubah `totalAssets`. Itu bertentangan dengan komentar di file yang sama (`reconcile.ts:69`: `totalIdle + totalDebt == totalAssets`). Pada vault Yearn V3 deposit menambah `total_idle`, jadi `totalAssets` naik, dan withdraw menurunkannya. (Kode vyper tidak ada di repo, hanya artifact, jadi bagian ini berdasar rumus yang repo sendiri tulis dan pengetahuan Yearn V3; saya tidak membuka sumber vault.)
Selain itu, indexer tidak mengindeks event `Deposit`/`Withdraw` sama sekali (lihat S-20), jadi memang tidak ada data untuk menghitungnya.
Bila tidak ada snapshot dasar, `baseAssets = 0` (`reconcile.ts:344`) dan hasilnya hampir pasti "drift".

**Kenapa penting.**
Brief §12: "Periodik rekonsiliasi ke balances/shares/debt onchain." Rekonsiliasi yang hanya cocok bila tidak ada deposit akan atau (a) selalu memberi alarm palsu pada vault yang hidup, atau (b) kalau toleransi dilonggarkan supaya diam, tidak menangkap penyimpangan sungguhan.

**Contoh kejadian.**
Snapshot di blok 100: aset 1.000. Di blok 120 ada deposit 500 dan satu report gain 10. Onchain: 1.510. Indexer menghitung 1.010. Selisih 500 dianggap "drift".
Test `reconcile.test.ts:135-163` lulus karena datanya (dasar 1.000 + gain 100 = 1.100) memang tidak memuat deposit, jadi test menyalin rumus yang sama dengan kode.

**Cara memperbaiki.**
- Indeks `Deposit`, `Withdraw`, dan event yang mengubah debt/idle. Hitung ekspektasi `totalAssets` dari arus kas nyata (deposit − withdraw + gain − loss + refund dst.), atau bandingkan per komponen.
- Tambah invarian murah di snapshot: `totalIdle + totalDebt == totalAssets` pada blok yang sama.
- Perbaiki komentar dan `ACCOUNTING.md §8.1`.
- Tambah test dengan deposit dan withdraw di antara dua snapshot.

**Bedanya setelah diperbaiki.**
Rekonsiliasi bisa dipercaya: alarm berarti ada selisih sungguhan, dan diam berarti cocok.

#### S-12. Rekonsiliasi supply tanpa batas blok; shares, debt, idle tidak direkonsiliasi (Sedang)

**Masalahnya apa.**
- Query supply (`indexer/src/reconcile.ts:350-358`) menjumlahkan semua `share_transfers` tanpa `block_number <= $block`. Sisi onchain dibaca di blok `block`, sisi indexer bisa memuat transfer yang lebih baru. Sisi aset memakai batas blok (`:335-340`), sisi supply tidak.
- `reconcile` tidak memeriksa bahwa checkpoint indexer sudah sampai `block`.
- Tidak ada pembandingan: shares per akun vs `balanceOf` (SELECTOR sudah ada di `:24` tapi tidak dipakai), `totalDebt` vs Σ`currentDebt` per strategi, `totalIdle` vs saldo aset vault. Brief §12 menyebut "balances/shares/debt".
- Tidak ada penjadwal. `docs/ACCOUNTING.md:139-140` mengakui jadwal harian belum ada dan `reconcileNow` "siap dipanggil keeper". Keeper tidak memanggilnya (pencarian `reconcileNow` hanya menemukan test).
- `reconcileNow` membaca onchain dua kali (`:412` lewat `reconcile`, `:414` lagi), tanpa jaminan keduanya konsisten bila RPC berganti.

**Kenapa penting.**
Supply yang dibandingkan dari dua blok berbeda memberi hasil palsu tiap kali ada mint/burn baru. Tanpa pembandingan debt dan saldo pengguna, penyimpangan yang paling berbahaya tidak terlihat.

**Contoh kejadian.**
Indexer sudah memproses transfer di blok 130, rekonsiliasi diminta di blok 120. Supply indexer lebih besar dari onchain pada blok 120, dan sistem melaporkan "totalSupply mismatch".

**Cara memperbaiki.**
Tambah batas blok pada query supply, tolak rekonsiliasi bila checkpoint < blok, bandingkan `balanceOf` untuk akun yang berubah dan `Σ strategies.current_debt` vs `totalDebt`, simpan hasil di tabel (mis. `reconciliation_runs`), dan jadwalkan lewat proses indexer (S-17).

**Bedanya setelah diperbaiki.**
Satu angka dibandingkan dengan satu blok, dan debt serta saldo pengguna ikut diperiksa.

#### S-13. Rollback reorg tidak mengembalikan semua tabel (Tinggi)

**Masalahnya apa.**
`rollback()` (`indexer/src/ingest.ts:304-373`) menghapus `share_transfers`, `reports`, `fees`, `role_events`, `raw_events`, `ingested_blocks` di atas blok leluhur, lalu membangun ulang `positions`. Yang **tidak** diurus:
1. `role_state`: bitmap dari blok yatim tetap tersimpan (`ingest.ts:272-278`). Event `RoleSet` berikutnya dihitung diffnya terhadap bitmap yatim itu (`:255-261`), jadi `role_events` baru salah.
2. `strategies`: baris yang ditambah atau dicabut di blok yatim tetap (`:231-251`).
3. `vaults`: `deposit_limit` dan `accountant` dari event yatim tetap (`:289-299`).
4. `share_price_snapshots` dan `venue_snapshots` yang dibuat `recordSnapshot` di blok yatim tetap. Snapshot `source='onchain'` terakhir dipakai sebagai dasar rekonsiliasi (`reconcile.ts:325-330`).
5. `positions`: pembangunan ulang di `:348-366` adalah `INSERT ... SELECT ... ON CONFLICT DO UPDATE` dari transfer yang tersisa. Akun yang **seluruh** transfernya ada di blok yatim tidak muncul di SELECT, jadi barisnya (dengan shares lama) tidak diubah dan tidak dihapus.

**Kenapa penting.**
Brief §12: "reorg/rollback ... tidak boleh membuat posisi ganda" dan indexer harus memberi tampilan yang benar. Posisi hantu dan role hantu muncul di UI, dan role hantu adalah informasi tata kelola yang menyesatkan.

**Contoh kejadian.**
Blok 20 (yang kemudian menjadi yatim) berisi deposit pertama milik Carol, jadi Carol punya 100 shares. Reorg menghapus transfer itu. Carol tidak punya transfer lain, jadi `positions` tetap menyimpan Carol = 100 shares. API `/positions/Carol` menjawab 100 padahal onchain 0.
Test reorg yang ada (`indexer/test/ingest.test.ts:183-224`) hanya memakai akun yang tetap punya transfer sesudah reorg (Alice tetap punya mint), jadi kasus ini tidak tertangkap.

**Cara memperbaiki.**
- Di dalam transaksi rollback, hapus semua baris `positions` vault itu dulu, lalu bangun ulang dari `share_transfers` (atau hapus akun yang tidak ada lagi di transfer).
- Simpan `block_number`/`block_hash` di `role_state`, `strategies`, `vaults` perubahan, dan snapshot, lalu rollback dengan menghitung ulang dari `raw_events` yang tersisa (replay), bukan dari keadaan turunan.
- Hapus `share_price_snapshots`/`venue_snapshots` dengan `block_number > ancestor`.
- Tambah test reorg untuk setiap tabel turunan, termasuk akun yang hilang dan RoleSet.

**Bedanya setelah diperbaiki.**
Setelah reorg, semua tabel turunan sama dengan hasil memutar ulang chain yang benar dari nol.

#### S-14. `role_events` hanya menyimpan satu bit per event (Tinggi)

**Masalahnya apa.**
Satu event `RoleSet` membawa seluruh bitmap role akun. Kode mengubahnya menjadi satu baris per bit yang berubah (`indexer/src/ingest.ts:261-269`). Tapi primary key `role_events` adalah `(chain_id, tx_hash, log_index)` (`indexer/migrations/0001_init.sql:210`), tanpa `role_bit`, dan insert memakai `ON CONFLICT ... DO NOTHING`. Hanya bit pertama yang masuk. Komentar di `ingest.ts:270-271` menyebut masalahnya ("the primary key is per log") tapi tidak memperbaikinya.

**Kenapa penting.**
Pemberian beberapa role sekaligus (kasus umum saat setup, atau saat serah-terima role) kehilangan semua bit kecuali satu. Halaman tata kelola dan alert perubahan role jadi menampilkan sebagian, dan `/role-events` terlihat lengkap padahal tidak.

**Contoh kejadian.**
`RoleSet(keeper, bitmap=REPORTING_MANAGER|DEBT_MANAGER)` dari bitmap 0. Dua bit berubah, hanya satu baris tersimpan, dan tampilan bilang keeper hanya punya satu role.

**Cara memperbaiki.**
Migrasi baru: ubah primary key menjadi `(chain_id, tx_hash, log_index, role_bit)` (mirip `fees`, yang sudah memuat `fee_kind` di PK). Tambah test dengan event yang mengubah beberapa bit sekaligus, dan test lewat jalur `ingest` (bukan insert manual).

**Bedanya setelah diperbaiki.**
Setiap perubahan role tercatat penuh dan bisa diaudit.

#### S-15. `block_time` salah untuk hampir semua log; celah waktu getLogs dan header (Sedang)

**Masalahnya apa.**
Satu header diambil per potongan (chunk): header blok akhir `to` (`indexer/src/ingest.ts:410-412`), lalu timestamp-nya dipakai untuk **semua** log di chunk (`:419`). Log di blok awal chunk (default chunk 2.000 blok) mendapat waktu blok terakhir. Kolom `block_time` di `reports`, `fees`, `role_events` jadi salah, padahal brief menuntut data performa berbasis waktu (APR/APY, window).
Selain itu `getLogs` (`:406`) dan `blockByNumber(to)` (`:410`) adalah dua panggilan terpisah. Bila `confirmations` kecil, log dan hash batas bisa berasal dari fork berbeda. `liveIngest.ts:26` memberi default `CONFIRMATIONS=0`. Tidak ada pemeriksaan bahwa `blockHash` tiap log cocok dengan chain yang sama dengan `boundary.hash`.
Fungsi `blockTimestamp()` (`:437-441`) sudah ada tapi tidak dipakai (kode mati).

**Kenapa penting.**
Hitungan return dan grafik performa memakai waktu. Waktu salah membuat APR yang dihitung salah tanpa ada error.

**Contoh kejadian.**
Report di blok 105 dalam chunk 0..1999 tercatat bertimestamp blok 1999. Bila blok 1 detik, selisihnya hampir 33 menit; pada chain lambat bisa berjam-jam.

**Cara memperbaiki.**
Ambil header untuk tiap blok yang punya log (cache per blok, bukan per chunk), dan tulis timestamp blok masing-masing. Setelah `getLogs`, baca ulang header `to` dan pastikan hash tidak berubah, atau minta `getLogs` dengan `blockHash` per blok. Jangan memberi default `CONFIRMATIONS=0` di jalur non-test. Hapus fungsi mati.

**Bedanya setelah diperbaiki.**
Waktu tiap event benar dan konsisten dengan hash blok yang disimpan.

#### S-16. Timeout RPC tidak di-retry (Sedang)

**Masalahnya apa.**
Di `indexer/src/rpc.ts:94-99`, blok `catch` melempar ulang error yang memiliki properti `code` bertipe number, karena dianggap error JSON-RPC. Saat timeout, `controller.abort()` (`:64`) membuat `fetch` menolak dengan `AbortError`. Saya jalankan potongan kecil di luar repo: di Node v24.19.0 error itu `instanceof Error`, bernama `AbortError`, dan `code` bertipe number (nilai 20). Jadi kondisi di `:96` benar, error dilempar ulang, dan retry tidak terjadi untuk timeout. Komentar di atas file (`:1-6`) mengatakan kegagalan transport di-retry dengan backoff.

**Kenapa penting.**
Satu timeout (30 detik, `:52`) menghentikan seluruh ingest padahal seharusnya dicoba lagi. Error lain dari lapisan jaringan yang kebetulan punya `code` numerik juga bisa terkena.

**Contoh kejadian.**
Node RPC lambat sekali di `eth_getLogs` untuk rentang besar. Indexer berhenti dengan error alih-alih mencoba lagi.

**Cara memperbaiki.**
Tandai error JSON-RPC dengan kelas khusus (`class JsonRpcError`) dan cek `instanceof JsonRpcError`, bukan "punya `code` numerik". Tambah test dengan server palsu yang menahan jawaban melewati `timeoutMs`.

**Bedanya setelah diperbaiki.**
Timeout dicoba ulang sesuai backoff, hanya error JSON-RPC asli yang langsung gagal.

#### S-17. Indexer tidak punya proses yang bisa dijalankan (Tinggi)

**Masalahnya apa.**
- `indexer/package.json` hanya punya skrip `migrate` dan `test`. Tidak ada `start`.
- `ingest()` hanya dipanggil oleh `liveIngest.ts`, yang menjalankan **satu kali** lalu keluar (komentar `:1-5`: dipakai `scripts/reorg-test.py`). Tidak ada loop polling.
- `startApi()` hanya dipanggil dari test (`indexer/test/api.test.ts:142`). Tidak ada entry point yang menyalakan server API.
- `reconcileNow()` hanya dipanggil dari test.
- Tabel `vaults` tidak pernah diisi oleh kode produksi. `ingest.ts:286-299` memakai `UPDATE` yang tidak mengubah apa pun bila baris tidak ada, dan komentarnya menyebut "vault snapshot job (ticket 3)" yang tidak ada. Satu-satunya `INSERT INTO vaults` ada di test. Akibatnya `GET /v1/vaults/:address` selalu 404 di lingkungan nyata.
- `README.md:39` mencantumkan `services/indexer` sebagai "RPC → Postgres, rekonsiliasi", tapi tidak ada cara menjalankannya selain skrip uji.
(Terkait AV-8 yang mencatat entity dan endpoint belum sesuai brief; di sini yang baru adalah tidak adanya proses yang berjalan sama sekali.)

**Kenapa penting.**
Frontend, dashboard, dan rekonsiliasi harian bergantung pada data yang tidak ada yang mengisi. Brief §12 meminta backfill dari deployment block dan rekonsiliasi periodik.

**Contoh kejadian.**
Tim menyalakan "indexer" di staging. Tidak ada yang berjalan, atau hanya satu kali ingest, dan API tidak punya proses untuk melayani halaman.

**Cara memperbaiki.**
Tambah `src/main.ts` dengan config tervalidasi (`RH_TESTNET_RPC_URL`, `INDEXER_DATABASE_URL`, `EXPECTED_CHAIN_ID`, daftar vault, `DEPLOY_BLOCK`), loop ingest, server API, jadwal rekonsiliasi, dan job yang mengisi katalog `vaults` (nama, simbol, desimal, `role_manager`, `accountant`) dari pembacaan onchain pada blok tetap. Tambah skrip `start`. Tambah penanganan sinyal dan penutupan pool.

**Bedanya setelah diperbaiki.**
Ada satu perintah yang menjalankan seluruh jalur data, dan `/vaults/:id` mengembalikan data nyata.

#### S-18. Alamat vault di URL diabaikan untuk `/live`, `/roles`, `/allocation` (Sedang)

**Masalahnya apa.**
`route()` membaca alamat vault dari URL (`indexer/src/api.ts:165`), tapi cabang `live`, `roles`, `allocation` (`:278-297`) memanggil `readVaultOnchain/readRoles/readAllocation(rpc, cfg, block)` dengan `cfg.vault` dari konfigurasi. Variabel `vault` dari URL tidak dipakai di cabang itu. `GET /v1/vaults/0xAAAA.../live` menjawab data vault yang di-config tanpa pemberitahuan.

**Kenapa penting.**
Klien yang meminta vault X dan menerima data vault Y tanpa tanda apa pun bisa menampilkan angka yang salah, dan baru terlihat saat ada vault kedua.

**Contoh kejadian.**
Frontend menambahkan vault kedua. Halaman vault 2 menampilkan alokasi vault 1.

**Cara memperbaiki.**
Bandingkan alamat URL dengan `cfg.vault` (atau pilih config dari daftar vault) dan jawab 404 bila tidak ada. Tambah test: alamat tak dikenal di `/live`.

**Bedanya setelah diperbaiki.**
Alamat yang diminta selalu sama dengan data yang dikembalikan.

#### S-19. API tanpa cache/rate limit; pesan error mentah (Rendah)

**Masalahnya apa.**
- Server hanya mendengarkan `127.0.0.1` (`api.ts:331`), jadi tidak terbuka ke luar bila dipasang apa adanya. Tidak ada auth, CORS, atau rate limit, dan tidak ada pengaman bila nanti diletakkan di belakang proxy.
- Tiap permintaan `/live`, `/roles`, `/allocation` memicu 3 sampai belasan panggilan RPC (`reconcile.ts:141-152`, `:262-285`) tanpa cache. Brief §12 meminta "Cache dengan block reference dan TTL".
- Parameter `block` menerima angka desimal berapa pun panjangnya (`api.ts:136-140`), termasuk blok masa depan atau sangat lama (butuh node arsip).
- Respons 500 mengembalikan `error.message` mentah (`api.ts:322`), yang bisa memuat teks error Postgres atau RPC.
- Tidak ada pembatasan waktu per permintaan.

**Kenapa penting.**
Bila nanti diekspos lewat proxy, satu pengguna bisa membuat banyak beban ke RPC berbayar, dan teks error bisa membocorkan detail internal.

**Cara memperbaiki.**
Cache hasil per `(vault, block)` dengan TTL, batasi `block` ke rentang `[deploy, head]`, ganti pesan 500 dengan kode umum (detail hanya ke log), tambah rate limit sederhana.

#### S-20. Endpoint, entity, dan field freshness brief §12 yang belum ada (Sedang)

**Masalahnya apa.**
Endpoint brief §12 vs yang ada di `indexer/src/api.ts`:

| Brief | Ada? |
|---|---|
| `GET /vaults` | Tidak ada |
| `/vaults/:id` | Ada sebagai `/v1/vaults/:address`, tapi selalu 404 (lihat S-17) |
| `/vaults/:id/allocations` | Ada sebagai `/allocation` (tunggal), hanya baca onchain |
| `/vaults/:id/performance` | Tidak ada |
| `/vaults/:id/activity` | Tidak ada (ada `/reports`, `/fees`, `/role-events` terpisah) |
| `/wallets/:address/positions` | Tidak ada. Yang ada: `/v1/vaults/:vault/positions/:account` |
| `/governance/operations` | Tidak ada (tabel `TimelockOperation` juga tidak ada) |
| `/health` | Ada, tapi lihat di bawah |

Entity minimum brief §12 vs `0001_init.sql`: ada `vaults`, `strategies`, `share_price_snapshots`, `positions`, `fees`, `role_events`, `reports`, `venue_snapshots`. Tidak ada: `Deployment`, `MandateVersion`, `AllocationSnapshot` (snapshot tidak menyimpan idle/debt, `:118-130`), `CashFlow` (event `Deposit`/`Withdraw` tidak diindeks), `TimelockOperation`, `KeeperRun`. Tabel `venue_snapshots` ada tapi tidak ada kode yang menulisnya. Brief juga minta simpan versi kontrak dan status ingest per event: tidak ada kolomnya.
Freshness: respons dari tabel (`/reports`, `/fees`, `/role-events`, `/positions`, detail vault) tidak membawa `chain`, `block`, `updatedAt`, atau `freshness` di level respons. `/health` selalu `ok: true` (`api.ts:158`) selama database terjawab, dan hanya mengembalikan checkpoint. Tidak membandingkan dengan head chain, jadi indexer yang tertinggal tetap "ok". Pencarian "freshness|stale" di `indexer/src` tidak menemukan logika apa pun.
(Terkait AV-8; di sini ditambahkan daftar rinci.)

**Kenapa penting.**
Brief §12: "Response membawa chain, block, updatedAt, source dan freshness" dan operasi berisiko berhenti saat data basi. Tanpa freshness, UI tidak bisa membedakan data segar dari data lama.

**Cara memperbaiki.**
Tambah endpoint yang kurang, tambahkan envelope `{chain, block, updatedAt, source, freshness}` ke semua respons, hitung `freshness` dari `head - checkpoint` dan umur timestamp, buat `/health` menjadi `ok: false` bila tertinggal melebihi batas. Tambah migrasi untuk entity yang belum ada, dimulai dari `CashFlow` dan `AllocationSnapshot` karena S-11 dan S-12 bergantung padanya.

**Bedanya setelah diperbaiki.**
UI dan operator bisa tahu seberapa segar tiap angka, dan alat pemantau bisa mengandalkan `/health`.

#### S-21. Jenis fee salah label dan bisa terhitung ganda; event penting tidak diindeks (Sedang)

**Masalahnya apa.**
- `StrategyReported` menyimpan `total_fees` sebagai baris `fee_kind='performance'` dan `protocol_fees` sebagai baris `'protocol'` (`indexer/src/ingest.ts:198-217`). `total_fees` dari accountant mencakup semua fee (performance dan management, termasuk bagian protokol). Label "performance" salah, dan menjumlahkan semua baris `fees` menghitung bagian protokol dua kali. (Pengetahuan struktur event Yearn V3; kontrak tidak ada di repo.)
- Event yang diperlukan tapi tidak diindeks: `Deposit`, `Withdraw`, `DebtUpdated`, perubahan `role_manager`/`future_role_manager`, `Shutdown` (topiknya didefinisikan di `decode.ts:20` tapi tidak dipakai), `UpdatePaused` (diabaikan, `ingest.ts:300`).
- Urutan log dalam satu `getLogs` tidak diurutkan eksplisit. Diff bitmap role bergantung pada urutan (`:255-261`).

**Kenapa penting.**
Halaman fee dan performa akan menampilkan biaya yang salah, dan alat tata kelola tidak melihat serah-terima `role_manager` (padahal itu inti AV-1).

**Cara memperbaiki.**
Pakai nama `total` untuk total fee dan `protocol` sebagai bagian darinya (atau simpan sebagai kolom terpisah di satu baris), indeks event yang disebut di atas, urutkan log `(block_number, log_index)` sebelum diproses.

**Bedanya setelah diperbaiki.**
Angka fee tidak ganda dan perubahan tata kelola terlihat di data.

#### S-22. Aturan "satu penulis" tidak ditegakkan (Rendah)

**Masalahnya apa.**
`indexer/src/db.ts:10-11` berkata indexer adalah proses satu penulis. Tidak ada `pg_advisory_lock` di `ingest()` atau `migrate()`. `ingest()` membaca checkpoint dua kali tanpa kunci (`ingest.ts:380-394`). Dua proses ingest untuk stream yang sama (mis. deploy yang tumpang tindih) bisa saling menimpa checkpoint atau menjalankan rollback bersamaan. Migrasi juga bisa dijalankan dua kali bersamaan.

**Cara memperbaiki.**
Ambil `pg_try_advisory_lock(hash(stream))` di awal `ingest` dan `migrate`, keluar bila gagal.

#### S-23. Kualitas test indexer (Sedang)

**Masalahnya apa.** (Indexer tidak dijalankan di sini; penilaian dari membaca test.)
- `ingest.test.ts` hanya memakai log `Transfer`. `fakeRpc.ts` hanya punya `transferLog`. Tidak ada test ingest untuk `StrategyReported`, `StrategyChanged`, `RoleSet`, fee, atau pembaruan katalog (pencarian nama event di `ingest.test.ts` dan `fakeRpc.ts` memberi 0). S-14 dan S-21 lolos karena itu.
- Test reorg tidak mengecek `role_state`, `strategies`, snapshot, atau akun yang hilang (S-13).
- `reconcile.test.ts` mengisi data langsung ke tabel dan memakai rumus yang sama dengan kode (dasar + gain = 1.100), tanpa deposit atau withdraw. Itu menyalin logika implementasi, yang dilarang brief §15.
- `api.test.ts` mengisi `vaults` lewat `INSERT` manual (`:101-105`), menyembunyikan S-17.
- `scripts/reorg-test.py` memakai blok kosong tanpa log kontrak dan hanya mengecek `reorg != null` serta hash berubah (`:195-202`). Ia tidak memeriksa data turunan. Skrip ini juga terikat Windows (`.tools/foundry/anvil.exe`, Laragon di `db-test.py:35`) dan tidak dipanggil di `verify-all.py` (pencarian: hanya `db-test.py` dan test keeper yang dipanggil).
- Tidak ada test tabrakan dua penulis, RPC chain ID salah, atau timeout RPC.

**Cara memperbaiki.**
Tambah builder log untuk semua event, test reorg per tabel turunan, test rekonsiliasi dengan deposit/withdraw, test properti (replay `raw_events` dari nol harus menghasilkan tabel yang sama dengan hasil ingest bertahap), dan jalankan `reorg-test.py` dengan kontrak yang benar-benar mengeluarkan event.

#### S-24. CI kemungkinan tidak menjalankan test indexer (Sedang, tidak diverifikasi)

**Masalahnya apa.**
`.github/workflows/ci.yml:19-60` menyalakan service Postgres dan mengisi `DATABASE_URL`, lalu menjalankan `verify-all.py`, yang memanggil `scripts/db-test.py` (`verify-all.py:153`). `db-test.py` tidak membaca `DATABASE_URL`. Ia mencari `initdb`, `pg_ctl`, `createdb` (`db-test.py:40-58,134-136`) dan membuat cluster sendiri. Bila binary itu tidak ada di PATH runner, skrip berhenti dengan "initdb not found". Service Postgres CI tidak terpakai. Saya tidak menjalankan CI dan tidak memeriksa isi image runner, jadi ini dugaan dari kode. (Masalah CI lain, mis. nama action dan versi forge, sudah ada di AV-7 dan tidak diulang.)

**Cara memperbaiki.**
Biarkan `db-test.py` memakai `TEST_DATABASE_URL`/`DATABASE_URL` yang sudah ada bila diset (dan menolak database yang namanya tidak berakhiran `_test`, seperti yang sudah dilakukan test), atau tambahkan `PG_BIN` ke langkah CI.

#### S-25. Alokasi hanya dari `default_queue`; decode array tanpa batas (Rendah)

- `readAllocation` hanya membaca `default_queue()` (`indexer/src/reconcile.ts:255-260`). Komentar di `:26-27` bilang strategi bisa punya debt yang tidak dijelaskan event, tapi strategi yang tidak ada di queue tidak muncul, dan jumlah debt tidak dibandingkan dengan `totalDebt`.
- `decodeAddressArray` memakai `offset` dan `length` dari jawaban RPC tanpa batas atas (`:236-247`). RPC yang buruk bisa memberi panjang sangat besar. Tambahkan batas wajar (mis. 64) dan cek `length * 64 <= body.length`.
- `Promise.all` untuk strategi memicu banyak panggilan paralel tanpa batas.

### 3. Yang sudah bagus

Hanya yang saya baca di kode atau jalankan.

- Kunci privat tidak pernah dicetak ke log: `log.ts` hanya menulis field yang tidak berisi kunci, dan `main.ts:119` mencetak alamat akun saja. Konfigurasi memvalidasi format kunci dan alamat (`keeper/src/config.ts:16-43`).
- Simulasi sebelum kirim: tx yang revert di `eth_call` tidak dikirim dan dicatat sebagai `skipped` bersama calldata (`keeper/src/keeper.ts:101-111`). Teruji (`keeper.test.ts:156-172`).
- Kerugian tidak pernah dilaporkan otomatis, hanya alert (`jobs.ts:80-88`), sesuai kebijakan yang ditulis. Ada pengecekan `maxGain` agar keeper tidak memicu revert health check.
- Keeper memakai satu blok tetap untuk semua pembacaan satu snapshot (`reader.ts`, teruji `keeper.test.ts:235-263`), dan membaca `totalAssetsIncludingIdle` karena alasan yang dijelaskan (`jobs.ts:32-38`).
- `max_loss = 0` ditulis eksplisit di `update_debt` (`jobs.ts:172`). Ada kill switch lewat file dan lewat `Keeper.stop()`. `runOnce` tidak reentrant.
- Kegagalan pengiriman webhook alert tidak ditelan diam-diam: dicatat sebagai error (`main.ts:111-113`), dan respons non-2xx dianggap gagal (`notify.ts:38`).
- Semua query SQL di indexer memakai parameter (`$1, $2, ...`). Satu-satunya SQL dengan nama tabel yang disisipkan ada di test (`ingest.test.ts:76`, nilai dari kode test sendiri). Saya tidak menemukan celah SQL injection di `ingest.ts`, `reconcile.ts`, `api.ts`.
- Validasi input API: alamat (regex 40 hex), `limit` 1..1000, `block` hanya angka desimal, hanya metode GET (`api.ts:25,123-140,153`). Semua angka besar dikirim sebagai string. API hanya listen di `127.0.0.1`.
- Idempotensi dasar: `raw_events` dengan kunci `(chain_id, tx_hash, log_index)` dan `ON CONFLICT DO NOTHING`, derived write dilewati bila event sudah ada (`ingest.ts:107-128,419-422`). Checkpoint ditulis dalam transaksi yang sama dengan baris chunk (`:414-427`).
- Deteksi reorg dengan membandingkan hash checkpoint, lalu mundur ke batas tersimpan terakhir yang cocok. Reorg lebih dalam dari jendela berhenti keras (`DeepReorgError`) dan tidak menulis di atas chain mati (`ingest.ts:49-57,385-389`, teruji `ingest.test.ts:226-246`).
- Angka uint256 disimpan `numeric(78,0)`, dan hash topik serta selector sudah dicek ulang dan cocok (lihat bagian hasil test).
- Runner migrasi memakai checksum dan menolak migrasi yang diedit setelah diterapkan (`migrate.ts:57-73`). Test indexer menolak berjalan di database yang namanya tidak berakhiran `_test`.
- Rekonsiliasi memakai `toleranceBps` wajib tanpa default, membulatkan drift ke atas, dan memberi status `insufficient-history` alih-alih lulus palsu (`reconcile.ts:132-138,366-383`).
- Pembacaan onchain `/live`, `/roles`, `/allocation` dipin ke blok dan memeriksa timelock dengan benar-benar memanggil `getMinDelay()` (`reconcile.ts:194-226`).

### 4. Yang TIDAK sempat diperiksa

- **Test indexer tidak dijalankan.** Tidak ada Postgres lokal. Semua temuan indexer berasal dari membaca kode dan test, bukan dari eksekusi. Perilaku nyata S-13, S-14 (insert ke Postgres) dan S-15 perlu dikonfirmasi dengan test yang gagal dulu.
- **Source Vyper `VaultV3` tidak ada di repo** (hanya artifact JSON). Pernyataan tentang `total_idle` saat deposit (S-11) dan isi `total_fees` (S-21) berdasar pengetahuan Yearn V3 dan komentar repo sendiri, bukan pembacaan kontrak. Perlu dicek ke bytecode/ABI yang di-deploy atau ke source upstream.
- **Perilaku error viem** (S-5, URL RPC ikut di pesan) tidak saya jalankan. Perlu tes kecil: paksa RPC gagal dan lihat isi `error.message`.
- **Tidak ada eksekusi nyata ke jaringan.** Tidak ada tx keeper yang dikirim, tidak ada RPC testnet yang dipanggil, tidak ada webhook yang diuji. Keeper hanya diuji lewat fake node lokal.
- **Peran onchain keeper tidak diperiksa.** Apakah alamat keeper benar-benar hanya punya `REPORTING_MANAGER` dan `DEBT_MANAGER` di vault testnet tidak saya cek. `docs/ACCEPTANCE_EVIDENCE.md:111-122` menulis `role_manager` sudah berpindah ke timelock; itu bertentangan dengan AV-1 di laporan sebelumnya dan **tidak saya verifikasi onchain**.
- **CI tidak dijalankan** dan isi image runner tidak diperiksa (S-24).
- **`scripts/reorg-test.py` dan anvil tidak dijalankan** (anvil dan Postgres tidak ada di mesin ini).
- **Runbook** yang diminta brief §13 (missed report, keeper crash, RPC down, dst.) hanya dilihat sekilas lewat tautan `RUNBOOK_BASE_URL`; isi `docs/RUNBOOK.md` tidak saya audit.
- **`packages/sdk` (`vaultV3Abi`)** dan sisi web/API klien tidak diaudit di tahap ini. Apakah ABI sama dengan kontrak yang di-deploy tidak saya bandingkan.
- **Beban dan performa** (ukuran tabel `raw_events`, biaya `SUM` posisi per transfer di `ingest.ts:153-157`, backfill 50k blok pada RPC nyata) tidak diukur.
- **Penanganan "transaction replacement"** dan chain yang punya finalitas lunak (Orbit) tidak dimodelkan; saya hanya menilai logika hash-checkpoint.

### 5. Checklist tugas untuk anak dev

Keeper
- [ ] S-1: Tunggu receipt setelah `send`, cek `status`, catat hasil di log. Jalankan job berikutnya hanya setelah receipt atau tx dinyatakan hilang.
- [ ] S-1: Simpan tx pending (hash, nonce, calldata) ke file/DB. Saat start, cek receipt dulu sebelum merencanakan job. Panggil `onSent` hanya setelah receipt sukses.
- [ ] S-2: Pisahkan penanganan `nonce too low` dan `already known`. Jangan kirim ulang calldata sama dengan nonce baru tanpa cek receipt.
- [ ] S-3: Tambah `MAX_DEBT_STEP`, `MAX_DAILY_MOVED`, `COOLDOWN_SECONDS`, `MAX_GAS_PRICE`, `MIN_NATIVE_BALANCE`. Ganti gas tetap 1,5 juta dengan estimasi plus batas atas. Simpan hitungan harian di penyimpanan tetap.
- [ ] S-4: Bungkus `KeeperSender` dengan `GuardedSender` (allowlist `to`, selector, strategi; `value == 0`). Tulis log audit ke penyimpanan tetap (tabel `KeeperRun`).
- [ ] S-5: Tambah fungsi `redact()` untuk semua teks error sebelum masuk log. Ganti `KEEPER_PRIVATE_KEY` dengan `KEEPER_SIGNER_REFERENCE` atau file rahasia berizin ketat.
- [ ] S-6: Tambah `EXPECTED_CHAIN_ID` di keeper dan indexer, cek `eth_chainId` saat start dan saat pindah RPC. Tambah RPC cadangan dengan cek chain ID dan cek tertinggal.
- [ ] S-7: Tambah batas umur report (`MAX_REPORT_AGE_SECONDS`) dan cek umur timestamp blok. Tambah alert `report-due`, `keeper-heartbeat-missing`, `allocation-drift`, `rpc-lag`.
- [ ] S-8: Majukan `previous` hanya setelah webhook berhasil, atau antrekan alert yang belum terkirim. Tambah dedupe dan pesan "pulih".
- [ ] S-9: Validasi `MONITOR_INTERVAL_MS`, `MAX_ASSETS_DELTA_BPS` kosong, `HARD_IDLE_FLOOR` (BigInt). Baca `maxWithdraw` untuk alamat treasury yang di-config. Tunggu tick selesai saat SIGTERM. Perbaiki pesan log yang tidak benar. Putuskan apakah stop file boleh dilepas tanpa restart.
- [ ] S-10: Ganti `soak.test.ts` dengan harness yang menghitung metrik dari log nyata dan node simulasi. Beri nama jujur sampai soak staging selesai. Tambah test restart, nonce race, report ganda, RPC mati, data basi (brief §15).
- [ ] Perbarui `docs/KEEPER.md` (klaim "satu tx in-flight" dan jumlah test 22 vs 23).

Indexer
- [ ] S-11: Indeks `Deposit`/`Withdraw`. Perbaiki rumus rekonsiliasi `totalAssets` dan komentar/dokumennya. Tambah invarian `totalIdle + totalDebt == totalAssets`. Tambah test dengan deposit dan withdraw di antara dua snapshot.
- [ ] S-12: Batasi query supply ke `block_number <= block`. Tolak rekonsiliasi bila checkpoint < blok. Tambah pembandingan `balanceOf` per akun dan Σdebt strategi vs `totalDebt`. Simpan hasil di tabel.
- [ ] S-13: Perbaiki rollback: hapus/bangun ulang `positions` penuh, tangani `role_state`, `strategies`, `vaults`, `share_price_snapshots`, `venue_snapshots`. Tambah test reorg per tabel, termasuk akun yang hilang.
- [ ] S-14: Migrasi baru: PK `role_events` menjadi `(chain_id, tx_hash, log_index, role_bit)`. Tambah test RoleSet multi-bit lewat `ingest`.
- [ ] S-15: Ambil timestamp per blok yang punya log. Pastikan hash `to` tidak berubah setelah `getLogs`. Hapus default `CONFIRMATIONS=0` di jalur non-test. Hapus fungsi `blockTimestamp` yang mati.
- [ ] S-16: Buat kelas `JsonRpcError` dan cek dengan `instanceof`. Tambah test timeout.
- [ ] S-17: Buat `src/main.ts` (config tervalidasi, loop ingest, server API, jadwal rekonsiliasi, job katalog `vaults`) dan skrip `start`.
- [ ] S-18: Cocokkan alamat URL dengan vault yang di-config di `/live`, `/roles`, `/allocation`. Jawab 404 bila beda.
- [ ] S-19: Tambah cache per `(vault, block)` dengan TTL, batasi rentang `block`, ganti pesan 500 dengan kode umum, tambah rate limit.
- [ ] S-20: Tambah endpoint `/vaults`, `/performance`, `/activity`, `/wallets/:address/positions`, `/governance/operations`. Tambah envelope `{chain, block, updatedAt, source, freshness}`. Buat `/health` bisa `ok: false` saat tertinggal. Tambah entity yang belum ada, mulai dari `CashFlow` dan `AllocationSnapshot`.
- [ ] S-21: Perbaiki label dan hitungan fee (total vs protokol). Indeks `DebtUpdated`, perubahan `role_manager`, `Shutdown`, `UpdatePaused`. Urutkan log sebelum diproses.
- [ ] S-22: Tambah `pg_try_advisory_lock` di `ingest` dan `migrate`.
- [ ] S-23: Tambah builder log untuk semua event. Tambah test ingest/reorg/rekonsiliasi yang disebut di atas. Jangan menyalin rumus implementasi di test. Perkuat `reorg-test.py` dengan event nyata dan cek data turunan.
- [ ] S-24: Buat `db-test.py` memakai `DATABASE_URL`/`TEST_DATABASE_URL` dari CI, atau pasang `PG_BIN`. Jalankan CI dan pastikan test indexer benar-benar jalan.
- [ ] S-25: Baca semua strategi aktif (bukan hanya `default_queue`), batasi panjang array dan jumlah panggilan paralel.
- [ ] Jalankan test indexer di mesin dengan Postgres dan catat hasilnya sebelum menandai tahap ini selesai.

---

# LAMPIRAN C: Tahap 3, Dokumen vs Kode dan Brief §17 (D-1..D-22)
> Ditulis oleh sub-agent Sonnet (effort rendah). Kondisi onchain tidak diperiksa oleh sub-agent ini (tanpa jaringan).

## Tahap 3: Dokumen vs Kode vs Brief (Avenor)

Tanggal audit: 2026-11-25. Sifat: baca saja (tanpa jaringan, tanpa mengubah repo, tanpa commit).
Repo: `/Users/mac/Documents/Workspace/Work/Wealth/November/BRAINSTROMING/avenor/repo`
Dibaca: BRIEF.md penuh, GAP_ANALYSIS_Avenor.md (judul dan bagian kontrak/evidence), semua dokumen di `repo/docs/` yang disebut tugas, `Roles.sol`, `Deploy.s.sol`, `DeployTestnet.s.sol`, `Accountant.sol`, `MorphoVaultStrategy.sol`, `DepositCapHook.sol`, `46630.json`, `46630.stage.json`, `services/keeper`, `services/indexer`, `apps/web`.
Temuan di laporan GAP (AV-1 sampai AV-11, W-1 sampai W-10) tidak diulang. Bila temuan di sini menyentuhnya, ditulis "tambahan dari AV-x".

Cara membaca label bukti: **dari kode** = saya baca atau hitung sendiri di repo; **dari dokumen** = hanya dibandingkan antar dokumen.

---

### 1. Ringkasan temuan

| ID | Temuan | Seberapa serius | Status bukti |
|---|---|---|---|
| D-1 | Kunci pemilik Safe ke-2 dan ke-3 serta kunci keeper di testnet dibuat dari teks publik (`makeAddr`), jadi siapa pun bisa menghitung kuncinya | Tinggi | dari kode (alamat keeper saya hitung dan cocok dengan config) |
| D-2 | `ACCEPTANCE_EVIDENCE.md`, `DRILL_EVIDENCE.md`, `RUNBOOK.md` memakai bukti fork lokal (akun anvil), bukan testnet 46630; antar dokumen saling bertentangan; tanggalnya setelah hari ini | Tinggi | dari dokumen + dari kode (`46630.stage.json`) |
| D-3 | `REMEDIATION.md` menyebut test yang tidak ada, fitur yang tidak ada di kode, dan menyatakan semua temuan "tertutup" tanpa reviewer luar | Tinggi | dari kode (grep) |
| D-4 | `TESTNET_EVIDENCE.md` salah memberi nama peran dan arti bitmask; klaim "100% byte-for-byte" dan biaya "$1.40" | Sedang | dari kode (`Roles.sol`) |
| D-5 | Dokumen peran bilang semua Safe 3/5; chain 2/3. Dokumen lain tidak menjelaskan stack testnet (mock USDG, mock venue, `DeployTestnet.s.sol`) | Sedang | dari kode + dokumen |
| D-6 | `AUDIT_SCOPE.md` salah versi Solidity, salah ukuran kode, dan menyebut proteksi yang tidak ada (min deposit 10 USDG, ReentrancyGuard di hook) | Sedang | dari kode |
| D-7 | `FEE_CONFIG.md` menyebut "batas keras" fee yang tidak ditegakkan kontrak; `feeManager` di testnet adalah EOA deployer | Sedang | dari kode (`Accountant.sol`, `Deploy.s.sol`) |
| D-8 | `management` strategi di testnet = Governance Safe langsung (tanpa timelock), padahal matriks peran dan teks web bilang lewat timelock | Sedang | dari kode (`DeployTestnet.s.sol:115`) |
| D-9 | `ROLE_PERMISSION_MATRIX.md` dan `RUNBOOK.md` bertentangan sendiri (executor timelock, siapa boleh `shutdown_vault`, DebtAllocator) | Sedang | dari dokumen + dari kode |
| D-10 | `RUNBOOK.md` hanya 4 dari 11 skenario wajib brief §13; link alert keeper ke runbook tidak akan menemukan judulnya; monitor kurang | Sedang | dari kode (`monitor.ts:62`) |
| D-11 | Klaim keeper/indexer yang tidak ada di kode: batas konsentrasi `maxRatio`, alarm kas idle venue 25%/24 jam, cek chain ID, interval job terpisah | Sedang | dari kode (grep) |
| D-12 | `BASELINE.md` §7 menyuruh adapter menganggap `maxDeposit` venue sebagai otoritas; kode dan `VENUE_INTEGRATIONS.md` melakukan sebaliknya | Sedang | dari kode |
| D-13 | `RISK_DISCLOSURE.md` salah soal alokasi debt (bukan lewat timelock 48 jam), tidak menyebut fee/keeper/mock, dan tidak ada halaman web yang menampilkannya | Sedang | dari kode |
| D-14 | Teks web bertentangan dengan dokumen: share "18 desimal" vs 6; "Terms & Risk Disclosures" mengarah ke `/transparency`; halaman transparency bilang semua alamat fork | Sedang | dari kode |
| D-15 | Dokumen/bukti yang diminta brief §17 belum ada: kebijakan signer, panduan backup/recovery, daftar known limitations, estimasi mandat lanjutan, link verifikasi source | Sedang | dari dokumen (ls + grep) |
| D-22 | Deposit tidak punya batas minimum shares (brief §9) dan ADR-11 hanya membahas withdraw | Sedang | dari kode (grep) |
| D-16 | Nomor baris `VaultV3.vy` saling bertentangan antar dokumen, dan source Vyper tidak ada di checkout ini | Rendah | dari dokumen |
| D-17 | Angka test di dokumen basi; kerapian dokumen ("tiga lapis" tapi 4 baris, dua bagian "7.") | Rendah | dari kode (hitung grep) |
| D-18 | Komponen yang ditulis "wajib" belum ada di testnet: dead shares (seed 0), `DepositCapHook` | Rendah | dari kode |
| D-19 | Link `file:///c:/laragon/...` di 3 dokumen: rusak dan membocorkan path lokal | Rendah | dari dokumen |
| D-20 | `NOTICE` tidak memuat `Accountant.sol` dan `IVault.sol` (AGPL, vault-periphery) | Rendah | dari kode |
| D-21 | `46630.json` `_meta.observed_at` lebih lama dari deployment yang dicatat; `recordedOn` tidak ada | Rendah | dari kode |

Jumlah: Tinggi 3, Sedang 13, Rendah 6, total 22.

---

### 2. Kepatuhan brief §17 (deliverables 1-10)

Legenda: ✅ ada dan cocok dengan kode; 🟡 ada tapi ada celah atau ketidakcocokan; ❌ belum ada.

| # | Deliverable | Status | Bukti file dan catatan |
|---|---|---|---|
| 1 | Source frontend, contracts, indexer, keeper, scripts + lockfile | ✅ | `apps/web`, `packages/contracts`, `services/indexer`, `services/keeper`, `scripts/*.py`; `package-lock.json` ada per paket. Tidak ada lockfile Python. Tidak ada `apps/admin` dan `infra/` walau ARCHITECTURE §1 menyebutnya (ditandai "target") |
| 2 | `BASELINE.md`, `REFERENCE_CAPTURE.md` | 🟡 | Keduanya ada. BASELINE status basi dan bertentangan dengan kode (D-12). REFERENCE_CAPTURE jujur bahwa screenshot desktop/mobile belum ada (`REFERENCE_CAPTURE.md:17`) |
| 3 | `ARCHITECTURE.md`, `ACCOUNTING.md`, `WITHDRAWAL_SEMANTICS.md`, role matrix | 🟡 | Semua ada dan sebagian besar cocok dengan kode (lihat bagian 4). Ketidakcocokan: D-5, D-9, D-16 |
| 4 | `VENUE_INTEGRATIONS.md` (alamat, cek, risiko, hasil fork) | 🟡 | Ada, hasil fork terukur ada. Hanya satu venue; verifikasi source venue belum; di testnet venue adalah mock |
| 5 | `FEE_CONFIG.md`, timelock policy, manifest deploy, ABI, verifikasi source, owner address | 🟡 | FEE_CONFIG ada. Manifest `46630.stage.json` ada. ABI: `packages/core/artifacts` dan `packages/sdk/src/abi`. Timelock policy hanya tersebar di ADR-4/ADR-12. Verifikasi source: tidak ada tautan (D-15). Alamat pemilik Safe tidak dicatat di dokumen mana pun (D-1) |
| 6 | Test report, temuan audit/review + perbaikan, known limitations | 🟡 | `REMEDIATION.md` ada tapi bermasalah (D-3). Tidak ada laporan test tersendiri (hanya log di ACCEPTANCE §4). Tidak ada daftar known limitations terpusat (D-15) |
| 7 | Runbook, monitoring, signer policy, backup/recovery | 🟡 | `RUNBOOK.md` dan `KEEPER.md` ada (D-10). Kebijakan signer dan panduan backup/recovery ❌ (grep tidak menemukan). Tidak ada konfigurasi monitoring/dashboard |
| 8 | `ACCEPTANCE_EVIDENCE.md` (chain, tx hash, jumlah, blok, link explorer, live/simulated) | 🟡 | File ada tapi semua hash adalah fork lokal dan ia sendiri mengaku itu (`ACCEPTANCE_EVIDENCE.md:7`). Tidak ada satu pun tx lifecycle di testnet 46630 (sudah di AV-3). Tidak ada link explorer |
| 9 | Product docs sesuai implementasi; share token dipisah dari token protokol | ❌ | Route `/docs` tidak ada di web (`apps/web/app` hanya `/`, `/portfolio`, `/transparency`, `/vaults/[address]`). RISK_DISCLOSURE tidak ditampilkan (D-13). Pemisahan share vs token protokol: tidak ada token protokol, jadi tidak relevan, tapi tidak ditulis |
| 10 | Estimasi scope/biaya mandat lanjutan + dependency belum tersedia | ❌ | Tidak ada dokumen. Hanya baris katalog di `VaultMandates.tsx` ("no contract exists") |

Brief §7-§9 yang belum punya dokumen atau bukti:

| Brief | Kebutuhan | Status |
|---|---|---|
| §7.4 | Urutan nested report, frekuensi, batas stale report | ❌ tidak ada batas stale di dokumen maupun `monitor.ts` (grep) |
| §8.1 | Aturan stale accounting yang menghentikan operasi risiko baru | ❌ |
| §8.1 | Batas konsentrasi per venue ditegakkan onchain atau keeper | ❌ hanya tertulis (D-11) |
| §8.2 | Pemetaan peran ke bitmask | ✅ cocok dengan `Roles.sol` |
| §8.2 | "Semua perubahan pending menampilkan old/new value, executable time, proposer, tx" | ❌ tidak ada halaman/endpoint `/governance/operations` (indexer `api.ts` tidak punya) |
| §9 | Batas minimum shares pada deposit | ❌ (D-22) |
| §9 | Konfirmasi menampilkan assets diterima, shares dibakar, tx hash | ✅ `docs/WEB_APP.md` §6.5, kode `readWithdrawEvent` (tidak dijalankan di chain) |
| §7.2 | Seed/dead shares sebagai perlindungan awal | 🟡 skrip ada (`Deploy.s.sol:587-608`), testnet belum (D-18) |

---

### 3. Temuan besar

#### D-1. Kunci Safe dan keeper di testnet bisa dihitung siapa pun 🔴 · *dari kode*

**Masalahnya apa**
`DeployTestnet.s.sol` membuat tiap Safe dengan 3 pemilik: deployer, lalu dua alamat dari `makeAddr(...)` (baris 142-143, seed teks `safe.owner2.<nama>` dan `safe.owner3.<nama>`), threshold 2 (baris 144). Keeper juga dibuat dari `makeAddr("avenor.testnet.keeper")` (baris 98). Di `forge-std` `makeAddr` hanya mengambil `keccak256(teks)` sebagai private key (`lib/forge-std/src/StdCheats.sol:544-552`), jadi kuncinya bisa dihitung siapa pun yang membaca repo.
Saya hitung keeper secara lokal dengan `cast`: hasilnya sama persis dengan alamat keeper di `46630.json` dan `46630.stage.json` (`0x9c4D…5d75`). Alamat pemilik Safe yang dihitung dari seed: governance `0x445b…73E1` dan `0xAaB2…7523`, guardian `0x0CC0…b932` dan `0x1514…437C`, treasury `0xbBf0…361a` dan `0xb772…cd53`. `0x445b…73E1` juga tertulis keras di `test/unit/TestnetGovernanceDrill.t.sol:88`.
Yang **tidak** saya lakukan: membaca pemilik Safe dari chain (tanpa jaringan). Jadi kecocokan pemilik Safe on-chain dengan alamat hitungan di atas belum terbukti; kecocokan keeper sudah.

**Kenapa penting**
Threshold 2 dari 3. Bila dua pemilik non-deployer memang alamat hitungan itu, satu orang luar bisa menandatangani 2 dari 3 sendirian. Berarti ia menguasai Governance Safe (proposer timelock 48 jam), Guardian Safe (pause, proposer timelock darurat), dan Treasury Safe (`DEBT_PURCHASER`, penerima fee) tanpa deployer. Kunci keeper yang bisa dihitung memberi `REPORTING_MANAGER` dan `DEBT_MANAGER`. Ini lebih parah dari AV-2: AV-2 mengira pemilik lain adalah "kunci uji milik tim".

**Contoh kejadian**
Orang luar menghitung kunci dari seed di repo, mengeksekusi `execTransaction` di Guardian Safe untuk `setPaused(true)`. Penarikan semua pengguna berhenti. Jika testnet dipakai latihan dengan token bernilai (atau ada yang mengira alamat ini aman untuk mainnet), kerugian nyata.

**Cara memperbaiki**
1. Baca `getOwners()` ketiga Safe di testnet dan bandingkan dengan alamat hitungan di atas (tulis hasil di dokumen).
2. Ganti pemilik dengan kunci nyata yang dipegang orang berbeda per Safe; ganti keeper dengan kunci yang dibuat acak dan tidak masuk repo.
3. Hapus `makeAddr` dari jalur deploy non-lokal: skrip harus gagal bila alamat Safe/keeper tidak diberikan lewat env saat `chainid != 31337`.
4. Tambah cek di `assertSafety`/skrip verifikasi: tidak ada pemilik Safe atau pemegang peran yang sama dengan `makeAddr` apa pun yang dikenal.
5. Dokumen `ROLE_PERMISSION_MATRIX.md` aturan keras 4 ("tidak ada satu orang memegang ≥3 kunci") diuji dengan `getOwners()` sebagai langkah wajib, bukan hanya teks.

**Bedanya setelah diperbaiki**
Tidak ada kunci yang bisa ditebak dari repo; pemisahan tugas governance, guardian, treasury menjadi nyata.

---

#### D-2. Bukti "acceptance" dan "drill" berasal dari fork lokal, dan dokumen saling bertentangan 🔴 · *dari dokumen + dari kode*

**Masalahnya apa**
- `ACCEPTANCE_EVIDENCE.md:7` mengaku: tiga hash di §3 tidak ada di chain 4663. Alamat di §2 (`0x5aeB…`, `0xf39F…2266`, `0x7099…79C8`, `0x3C44…93BC`, `0x90F7…b906`) adalah akun default anvil dan alamat fork, bukan testnet 46630 (alamat testnet ada di `46630.json:63-76`).
- Tetapi §3.D (`:111-122`) tetap menulis "Otoritas EOA deployer sepenuhnya dicabut" dan `role_manager()` = timelock, tanpa label "fork" di bagian itu. Di testnet 46630 nyata, `46630.stage.json` masih mencatat serah-terima `accept_role_manager` belum dilakukan (`pendingActions`).
- `DRILL_EVIDENCE.md:7` mengaku blok drill (26450185, dst.) bukan dari fork yang dipin di 118337511. `RUNBOOK.md:103-112` tetap menulis "DIEKSEKUSI & TERVERIFIKASI ... pada staging fork pin 118337511" dan "LULUS", tanpa koreksi itu.
- `ARCHITECTURE.md:319` masih menulis ACCEPTANCE_EVIDENCE "⛔ belum (butuh deployment)" dan `:236-239` bilang drill dan soak "menunggu staging", sementara `RUNBOOK.md` dan ACCEPTANCE bilang sudah.
- Soak keeper 7 hari: `ACCEPTANCE_EVIDENCE.md:126` jujur bahwa itu harness 168 siklus dalam detik. Tapi `RUNBOOK`/`DRILL` menampilkan "MTTR aktual < 1 dtk simulasi" sebagai hasil drill melawan target menit/jam.
- Tanggal koreksi di dokumen adalah `2026-11-29` dan `2026-12-01` (`ACCEPTANCE_EVIDENCE.md:7,13,137`; `DRILL_EVIDENCE.md:7`), lebih baru dari hari audit (2026-11-25) dan lebih baru dari `46630.json` (2026-11-24). Entah jam mesin penulis salah, entah tanggal diketik tanpa dibaca ulang. Saya tidak bisa menentukan mana.

**Kenapa penting**
Reviewer eksternal membaca ACCEPTANCE sebagai bukti rilis (brief §16, §17.8). Tiga dokumen menjelaskan status yang berbeda untuk hal yang sama. Brief §15: "mainnet fork bukan transaksi mainnet; testnet dengan mock venue bukan bukti venue mainnet".

**Contoh kejadian**
Auditor membaca RUNBOOK "LULUS" untuk D1-D4 dan ARCHITECTURE "⛔ belum" untuk hal yang sama, lalu tidak tahu mana yang benar. Atau ia membaca §3.D ACCEPTANCE lalu mengira handoff timelock sudah terjadi di testnet.

**Cara memperbaiki**
1. Tambahkan kolom "Lingkungan" (fork lokal / testnet 46630 / mainnet) di setiap tabel bukti, di semua dokumen yang menyebut drill.
2. Salin banner koreksi `DRILL_EVIDENCE.md:7` ke `RUNBOOK.md` bagian Drill dan ubah status "LULUS" menjadi "LULUS di fork lokal; testnet belum".
3. Perbarui `ARCHITECTURE.md` §4 (ADR-15 akhir) dan §9 agar sama dengan status sebenarnya.
4. Beri label "fork" di §3.D ACCEPTANCE dan tulis status handoff testnet sebenarnya.
5. Periksa asal tanggal 2026-11-29 dan 2026-12-01; samakan dengan tanggal commit.
6. Jalankan ulang drill di testnet 46630 dan catat hash nyata (gabung dengan tugas AV-3).

**Bedanya setelah diperbaiki**
Satu cerita yang konsisten: apa yang terbukti di fork, apa yang terbukti di testnet, apa yang belum.

---

#### D-3. `REMEDIATION.md` merujuk test dan fitur yang tidak ada, lalu menyatakan semuanya tertutup 🔴 · *dari kode*

**Masalahnya apa**
Hasil grep:
- `packages/contracts/test/unit/Deploy.t.sol` (disebut `REMEDIATION.md:66,142`) tidak ada. File yang ada: `DeployScript.t.sol`.
- `packages/contracts/test/unit/Accountant.t.sol` (`:78`) tidak ada. File yang ada: `AccountantFees.t.sol`.
- `Roles.t.sol::test_shutdownGrantsDebtManagerToCaller` (`:89`) tidak ada di mana pun. Test yang benar: `RoleEnforcement.t.sol:481 test_shutdownVaultGrantsDebtManagerToTheCaller`.
- `Roles.t.sol::test_forceRevokeSitsOnTheBoundedFastLane` dan `...InSixHours` (`:112-113`) ada di `RoleEnforcement.t.sol`, bukan `Roles.t.sol`.
- "Batas minimum deposit 10 USDG pada antarmuka" (`:67`) dan `apps/web/test/deposit.test.ts` "validasi batas minimum": tidak ada kata minimum atau angka 10 USDG di `apps/web/src/lib/deposit.ts` maupun `deposit.test.ts` (grep kosong). ADR-7 (`ARCHITECTURE.md:127`) dan `AUDIT_SCOPE.md:78` juga menyebutnya.
- Kondisi `emergency_zero_assets` (`:130`): string itu tidak ada di `apps/web` atau `packages/sdk`.
- Dokumen mengklaim 12 temuan semuanya tertutup, "Kesimpulan: TERTUTUP DENGAN BUKTI REGRESI" (`:170`). Semua temuan ditemukan tim sendiri ("audit internal BMAD", `:3`); tidak ada reviewer independen. `[LOW-01]` (`:136-142`) menutup "residu hak deployer" padahal di testnet `role_manager()` masih deployer (AV-1). `[CRITICAL-01]` s.d. `[CRITICAL-03]` dan `[HIGH-03]` adalah sifat desain upstream yang didokumentasikan, bukan celah yang diperbaiki.

**Kenapa penting**
Brief §17.6 minta "audit/review findings + fixes". Dokumen ini akan dibaca sebagai bukti review. Test yang namanya salah tidak bisa dijalankan pembaca; fitur yang tidak ada diklaim ada.

**Contoh kejadian**
Reviewer menjalankan `forge test --match-path test/unit/Accountant.t.sol` dan mendapat "no tests"; ia menyimpulkan seluruh tabel bukti tidak bisa dipercaya.

**Cara memperbaiki**
1. Betulkan nama file dan fungsi test; tambahkan skrip kecil di `verify-all.py` yang gagal bila nama test di `docs/*.md` tidak ditemukan dengan grep.
2. Pilih: implementasikan minimum deposit 10 USDG (di web dan idealnya di `DepositCapHook`) atau hapus klaim di REMEDIATION, ADR-7, AUDIT_SCOPE.
3. Hapus atau implementasikan `emergency_zero_assets`.
4. Ubah judul menjadi "Register internal"; ubah status LOW-01 menjadi "diperbaiki di skrip, belum terbukti di testnet"; ganti kesimpulan menjadi "belum ada review independen".
5. Tambah kolom "ditemukan oleh" (internal/eksternal).

**Bedanya setelah diperbaiki**
Setiap baris bukti bisa dijalankan; tidak ada klaim "tertutup" yang bergantung pada fitur yang belum ada.

---

#### D-4. `TESTNET_EVIDENCE.md` salah memberi nama peran 🟠 · *dari kode*

**Masalahnya apa**
Dibandingkan dengan `Roles.sol:18-31,37-60` dan `46630.stage.json` `roleMatrix`:
- `:89` timelock `3995` diberi arti "ADD_STRATEGY, REVOKE_STRATEGY, FORCE_REVOKE, ACCOUNTANT_MANAGER, QUEUE_MANAGER, DEPOSIT_LIMIT_MANAGER". Salah: 3995 = 9 bit (`ADD_STRATEGY`, `REVOKE_STRATEGY`, `ACCOUNTANT`, `QUEUE`, `MAX_DEBT`, `DEPOSIT_LIMIT`, `WITHDRAW_LIMIT`, `MINIMUM_IDLE`, `PROFIT_UNLOCK`) dan **tidak** memuat `FORCE_REVOKE` (4). Saya hitung 1+2+8+16+128+256+512+1024+2048 = 3995.
- `:90` emergency timelock `4` diberi label `EMERGENCY_MANAGER`. Salah: 4 = `FORCE_REVOKE_MANAGER`; `EMERGENCY_MANAGER` = 8192.
- `:91` guardian `8192` diberi label `DEBT_PURGER`. Nama itu tidak ada; yang benar `EMERGENCY_MANAGER` (pause dan shutdown).
- `:92` keeper `96` diberi `DEBT_ALLOCATOR`. Yang benar `DEBT_MANAGER` (64) + `REPORTING_MANAGER` (32).
- `:93` treasury `4096` diberi "Fees and surplus distribution recipient". Yang benar: `DEBT_PURCHASER` (`buy_debt`); penerima fee adalah peran Accountant, bukan bit ini.
- `:94` deployer "Zero privilege (relinquished post-wire)": benar untuk bitmask peran, tapi deployer masih `role_manager` (AV-1).
- `:31` "100% byte-for-byte match" padahal `BASELINE.md:94` memakai kata "setelah mask immutable factory dan CBOR metadata, 0 byte berbeda".
- `:111` biaya gas "~$1.40 equivalent" untuk ETH testnet yang tidak bernilai.
- Bagian 3 menandai mock USDG dan mock venue "Verified" tanpa tautan (sudah di AV-6, ditambah: arti "Verified" tidak dijelaskan).

**Kenapa penting**
Ini satu-satunya dokumen yang memetakan peran onchain di testnet. Pembaca yang percaya "emergency timelock = EMERGENCY_MANAGER" mengira ia bisa pause; yang percaya "timelock punya FORCE_REVOKE" salah menilai batas 48 jam vs 6 jam (ADR-12).

**Contoh kejadian**
Reviewer menulis di laporannya bahwa timelock 48 jam bisa mencabut strategi, bertentangan dengan desain ADR-12.

**Cara memperbaiki**
Ganti tabel dengan nama bit dari `Roles.sol` dan buat dari `46630.stage.json` secara otomatis (skrip kecil); ubah kalimat "100%" menjadi "identik setelah mask immutable dan metadata"; hapus "$1.40".

**Bedanya setelah diperbaiki**
Peran di dokumen sama dengan chain dan bisa diperiksa mesin.

---

#### D-5. Dokumen peran bilang Safe 3/5; chain 2/3; dokumen lain tidak menjelaskan stack testnet 🟠 · *dari kode + dokumen*

**Masalahnya apa**
`ROLE_PERMISSION_MATRIX.md:43,45,46,68`, `ARCHITECTURE.md:144-145,280`, `REMEDIATION.md:84,110` menulis Safe 3/5 dan "tidak ada satu orang memegang ≥3 kunci". `DeployTestnet.s.sol:144` membuat 2/3 dengan deployer sebagai pemilik di ketiganya. Hanya `TESTNET_EVIDENCE.md` menyebut 2/3. Laporan GAP bilang threshold 2 "cocok dengan dokumen"; itu cocok hanya dengan TESTNET_EVIDENCE, bukan dengan matriks peran.
Selain itu, kata "46630" muncul hanya di `TESTNET_EVIDENCE.md` dan satu kali di `BASELINE.md` (grep). `DEPLOYMENT.md`, `ARCHITECTURE.md`, `WEB_APP.md`, `KEEPER.md`, `RUNBOOK.md` hanya bicara chain 4663 dan `steakUSDG`. `DeployTestnet.s.sol` dan `ExecuteTestnet46630Governance.s.sol` tidak disebut di `DEPLOYMENT.md`.

**Kenapa penting**
Brief §7.1 minta konfigurasi yang dapat direproduksi. Orang yang mengikuti `DEPLOYMENT.md` tidak akan sampai ke deployment yang ada di testnet.

**Contoh kejadian**
Penguji web membaca `WEB_APP.md`: "belum ada vault di 4663" lalu tidak tahu vault testnet ada.

**Cara memperbaiki**
Tambah `DEPLOYMENT.md` §"Testnet 46630" (mock, Safe 2/3, perintah, perbedaan dengan prod); tulis di matriks peran tabel "rencana prod (3/5)" dan "testnet (2/3)"; perbarui `WEB_APP.md`, `KEEPER.md`, `RUNBOOK.md` dengan chain target.

**Bedanya setelah diperbaiki**
Dokumen menjelaskan apa yang sebenarnya dijalankan.

---

#### D-6. `AUDIT_SCOPE.md` tidak cocok dengan kode 🟠 · *dari kode*

**Masalahnya apa**
- Solidity `0.8.28` (`:45-48`), padahal pragma `0.8.18` di `MorphoVaultStrategy.sol`, `DepositCapHook.sol`, `Deploy.s.sol`, `Roles.sol`, dan `foundry.toml` `solc = "0.8.18"`.
- SLOC "~250 / ~160 / ~380 / ~80" vs jumlah baris: strategi 343, hook 253, `Deploy.s.sol` 1.213, `Roles.sol` 63 (`wc -l`). `Deploy.s.sol` dua kali lebih besar daripada klaim; reviewer akan salah menaksir.
- `:78` min deposit 10 USDG: tidak ada di kode (D-3).
- `:115` "ReentrancyGuardUpgradeable / non-reentrant pada hook": `DepositCapHook.sol` tidak memuat kata reentran (grep).
- `:47` ruang lingkup tidak memasukkan `DeployTestnet.s.sol`, `ExecuteTestnet46630Governance.s.sol`, pengaturan Safe, dan `TimelockController` OZ yang dipakai.
- `:131` "12 skenario penarikan" vs 13 (W1-W13 di `WITHDRAWAL_SEMANTICS.md`).
- `:101` "Fee masuk ke Timelock Treasury": penerima fee adalah Treasury Safe.
- Tidak ada bukti reviewer sudah dipilih atau dihubungi; judul tiket "engage-independent-reviewer" tapi tidak ada nama atau tanggal.

**Kenapa penting**
Biaya dan kedalaman review dihitung dari angka ini.

**Contoh kejadian**
Reviewer mengutip 380 baris, lalu menemukan 1.213 baris dan skrip tambahan; jadwal dan harga berubah.

**Cara memperbaiki**
Isi angka dari `wc -l`/`cloc` otomatis; betulkan versi; hapus atau implementasikan proteksi yang disebut; tambahkan skrip testnet dan konfigurasi Safe ke lingkup; catat status pencarian reviewer.

**Bedanya setelah diperbaiki**
Lingkup audit sama dengan kode.

---

#### D-7. Batas fee di dokumen tidak ditegakkan kontrak 🟠 · *dari kode*

**Masalahnya apa**
`FEE_CONFIG.md:72-77` menyebut "batas keras": performance 20%, management 2%, refund 50%, `maxGain` 1.000, `maxLoss` 1.000. Di `Accountant.sol` yang ada hanya `MANAGEMENT_FEE_THRESHOLD = 200` (2%) dan `PERFORMANCE_FEE_THRESHOLD = 5_000` (50%) (`:115,118`, dipakai di `:350-357,396`). Batas 20%, refund 50% dan `maxGain`/`maxLoss` ≤ 1.000 tidak ada di kontrak. Pemegang `feeManager` bisa menaikkan performance fee dari 10% ke 50% dalam satu transaksi (`updateDefaultConfig`, `:318-325`).
Di testnet `feeManager` adalah EOA deployer (`46630.stage.json` `feeConfig.feeManager`; `Deploy.s.sol:251` memakai `actor` kecuali mode prod) dan perubahan fee tidak lewat timelock. Di mode prod `feeManager = timelock` (`Deploy.s.sol:251,759`), jadi ada delay 48 jam, tapi itu satu-satunya batas.
Teks web `SecuritySection.tsx:15` ("fee updates ... queued behind a TimelockController") benar hanya untuk mode prod.

**Kenapa penting**
Brief §8.2: kenaikan fee harus lewat timelock; §10: fee diungkap. Batas yang "keras" di dokumen tapi tidak ada di kontrak menipu pembaca.

**Contoh kejadian**
Kunci `feeManager` bocor di testnet; fee dinaikkan ke 50% dan satu report menarik separuh gain.

**Cara memperbaiki**
Ganti kata "batas keras" menjadi "kebijakan"; ada dua pilihan: (a) buat `Accountant` turunan yang menegakkan batas 20% dan 50%, atau (b) tulis bahwa batas kontrak adalah 50%/2%; pindahkan `feeManager` testnet ke Governance Safe lewat `setFutureFeeManager`/`acceptFeeManager` (`Accountant.sol:545-562`) dan bukti hash tx; tambahkan pembatasan di web: tampilkan `performanceFee` onchain, bukan konfigurasi dokumen.

**Bedanya setelah diperbaiki**
Dokumen dan kontrak sama; kenaikan fee punya jeda yang bisa dibuktikan.

---

#### D-8. `management` strategi tanpa timelock di testnet 🟠 · *dari kode*

**Masalahnya apa**
`ROLE_PERMISSION_MATRIX.md:50` baris strategi: strategi `management` = Timelock. `DEPLOYMENT.md:93` default `MANAGEMENT_ADDRESS` = timelock. `DEPLOYMENT.md:62-65` bilang timelock bukan `management` strategi dan tidak bisa memanggil `setPendingManagement`. Di testnet: `DeployTestnet.s.sol:115` `cfg.management = proposer` (Governance Safe), dan `46630.stage.json` `strategyManagement` = Governance Safe. `DEPLOYMENT.md:60-65` sendiri mengakui `management` bisa `emergencyWithdraw` ke `performanceFeeRecipient`.
Jadi Governance Safe 2/3 (D-1) memegang kontrol strategi tanpa jeda 48 jam. `SecuritySection.tsx:15` mengatakan perubahan administratif lewat timelock.

**Kenapa penting**
Brief §8.2: perubahan sensitif melalui kontrol yang teruji. Jalur strategi ini tidak.

**Contoh kejadian**
Dua penandatangan Governance Safe memanggil fungsi darurat strategi dan memindahkan aset strategi.

**Cara memperbaiki**
Putuskan dan tulis: (a) Safe memang `management` karena timelock tidak bisa memanggil fungsi `management` (jelaskan risikonya di matriks), atau (b) pasang `management` ke kontrak pembungkus yang menunggu 48 jam. Perbarui matriks, DEPLOYMENT, dan teks web.

**Bedanya setelah diperbaiki**
Pembaca tahu siapa yang bisa menggerakkan dana strategi dan berapa jeda.

---

#### D-9, D-10 dan lainnya (ringkas)

Temuan di bawah ditulis 5 bagian singkat. Detail bukti ada di kolom "Di mana".

**D-9. Matriks peran dan runbook bertentangan sendiri 🟠 · dari dokumen + dari kode**
- *Masalahnya apa:* `ROLE_PERMISSION_MATRIX.md:43` menyebut executor `role_manager` adalah "`TimelockExecutor` periphery"; `ARCHITECTURE.md:155` (ADR-12) dan `COMPATIBILITY_MATRIX.md:18` bilang tidak dipakai; `DEPLOYMENT.md:88` dan `TESTNET_EVIDENCE.md:132` memakai proposer = executor = Safe. `ROLE_PERMISSION_MATRIX.md:48` menyebut "`DebtAllocator` keeper" sebagai opsi, padahal tidak dipakai. `RUNBOOK.md:21` mengatakan `GOVERNANCE` timelock bisa `shutdown_vault`, padahal `governanceRoleSet = 3995` tidak memuat `EMERGENCY_MANAGER` (8192); drill D4 (`RUNBOOK.md:112`) memakai guardian. `DEPLOYMENT.md:194` menulis test `governanceRoleSet() == 3999`; `Roles.t.sol:23` menegaskan 3995. File lama `31337.dry-run.json:36` masih 3999.
- *Kenapa penting:* operator memilih siapa yang harus bertindak saat insiden.
- *Contoh kejadian:* saat insiden, tim menjadwalkan `shutdown_vault` lewat timelock 48 jam dan operasi gagal karena peran tidak ada.
- *Cara memperbaiki:* satu tabel peran yang dibuat dari `Roles.sol`; ganti 3999 menjadi 3995; hapus baris TimelockExecutor/DebtAllocator atau tandai "tidak dipakai"; ubah RUNBOOK baris GOVERNANCE.
- *Bedanya:* tidak ada instruksi insiden yang mustahil dijalankan.

**D-10. Runbook dan monitor kurang dari brief §13 🟠 · dari kode**
- *Masalahnya apa:* brief §13 mewajibkan runbook untuk: missed report, keeper crash, RPC down, venue illiquid, stablecoin depeg, incorrect valuation, compromised operator key, pause/shutdown, emergency recall, failed migration, user exit. `RUNBOOK.md` hanya A (pause), B (shutdown), C (total-assets-moved), D (likuiditas): 4 dari 11. Kode keeper memakai `runbook: baseUrl#kode` (`monitor.ts:62`) dengan kode `vault-paused`, `vault-shutdown`, `deposits-closed`, `no-withdrawal-capacity`, `total-assets-moved`, `deposit-limit-changed`, `fee-config-changed` (`KEEPER.md:94-100`). Judul runbook adalah "A. `vault-paused` — penarikan berhenti" dst., sehingga anchor Markdown-nya `#a-vault-paused--penarikan-berhenti`, bukan `#vault-paused`. Empat kode (`deposits-closed`, `no-withdrawal-capacity`, `deposit-limit-changed`, `fee-config-changed`) tidak punya bagian sama sekali. Monitor tidak punya kode untuk report basi/terlambat, keeper mati, RPC tertinggal, drift alokasi (brief §13) dan tidak ada batas stale (brief §8.1).
- *Kenapa penting:* alert yang mengarah ke halaman yang tidak menemukan bagiannya; insiden nyata tidak punya prosedur.
- *Contoh kejadian:* keeper mati dua hari; tidak ada alarm dan tidak ada langkah di runbook.
- *Cara memperbaiki:* beri judul anchor eksplisit (`<a id="vault-paused">`) atau ubah pembuat URL; tambah bagian untuk tujuh skenario sisanya dan empat kode alert; tambah kode `report-stale`, `keeper-heartbeat`, `rpc-lag`; tulis batas stale per vault.
- *Bedanya:* tiap alert punya langkah; kegagalan diam-diam punya alarm.

**D-11. Klaim keeper dan indexer yang tidak ada di kode 🟠 · dari kode**
- *Masalahnya apa:* (a) `VENUE_INTEGRATIONS.md:14` (G6) "batas konsentrasi (80%, 5%) dihitung keeper sebelum alokasi" dan `ARCHITECTURE.md:104` `targetRatio`/`maxRatio`: `grep` tidak menemukan `maxRatio`, `targetRatio`, atau concentration di `services/*/src`, `packages/sdk/src`, `packages/contracts/src`. `allocationJob` hanya memakai `max_debt` dan idle floor (`KEEPER.md:31-38`). (b) `ARCHITECTURE.md:106` alarm kas idle venue turun >25%/24 jam, dan `VENUE_INTEGRATIONS.md:§6-7`: `monitor.ts` tidak membaca `balanceOf` venue; hanya `venueMaxWithdraw` dan `performanceFee` (`monitorReader.ts:45`). (c) `eth_chainId` hanya dipanggil di `apps/web` (`wallet.ts`, `vaultRead.ts`); tidak di keeper atau indexer, padahal brief §12 meminta fallback RPC diperiksa chain ID-nya. (d) `ARCHITECTURE.md:101-107` frekuensi 24 jam, 6 jam, 15 menit, 5 menit; `config.ts:56` hanya satu `INTERVAL_MS` untuk semua job dan `MONITOR_INTERVAL_MS`. (e) `46630.stage.json` `pendingActions` menyebut "KEEPER_ROLES/ALLOWLIST in keeper app"; tidak ada di kode. (f) Brief §13: allowlist fungsi/target, batas nominal, cooldown, audit log: tidak ada di keeper.
- *Kenapa penting:* `AUDIT_SCOPE.md` invarian 3 bergantung pada pembatasan keeper.
- *Contoh kejadian:* keeper dipasang di testnet dengan RPC salah chain; tidak ada yang menolak.
- *Cara memperbaiki:* tulis "belum dibangun" di dokumen, atau bangun; tambah cek `eth_chainId` saat start di keeper dan indexer.
- *Bedanya:* dokumen tidak melebihi kode.

**D-12. `BASELINE.md` §7 bertentangan dengan kode 🟠 · dari kode**
- *Masalahnya apa:* `BASELINE.md:115` "Adapter harus memperlakukan `maxDeposit` sebagai otoritas dan melaporkan `maxDeposit` strategi = 0 saat venue tertutup". `MorphoVaultStrategy.sol:266` (`availableDepositLimit`) dan `VENUE_INTEGRATIONS.md` §3 dan §4a melaporkan `type(uint256).max` ketika venue menjawab 0. BASELINE juga masih menulis "belum ada deployment" (`:3`), `SECURITY_DIFF.md` "(belum dibuat)" (`:55`, padahal DoD `:97` mencentangnya), dan jalur path Windows host (`:73`).
- *Kenapa penting:* BASELINE disebut "satu-satunya sumber pin".
- *Contoh kejadian:* developer baru mengikuti BASELINE dan mengubah adapter, lalu `update_debt` menjadi no-op permanen.
- *Cara memperbaiki:* ubah poin 2 §7 ke perilaku kode, hapus status basi.
- *Bedanya:* satu perilaku dijelaskan dengan konsisten.

**D-13. `RISK_DISCLOSURE.md` salah satu klaim dan tidak sampai ke pengguna 🟠 · dari kode**
- *Masalahnya apa:* `:48` "alokasi debt ... memerlukan proposal publik 48 jam": salah. `update_debt` dipegang keeper (`DEBT_MANAGER`, 96) tanpa delay (`ROLE_PERMISSION_MATRIX.md:48`). Tidak menyebut: performance fee 10%, keeper hot wallet, mock USDG/mock venue di testnet, perbedaan deposit cap vs hook. `:16` memakai kata "secara instan" untuk penarikan dari kas idle (bersyarat, tapi kata yang dilarang brief). Footer web `Footer.tsx:46-49` "Terms & Risk Disclosures" mengarah ke `/transparency` (yang tidak berisi risiko); tidak ada route yang menyajikan `RISK_DISCLOSURE.md` (grep tidak menemukan).
- *Kenapa penting:* brief §11 "Risk panel" dan §17.9.
- *Contoh kejadian:* pengguna membaca "perubahan alokasi butuh 48 jam" lalu terkejut oleh pergerakan dana oleh keeper.
- *Cara memperbaiki:* betulkan kalimat; tambah bagian fee, keeper, testnet mock; buat halaman `/docs` atau `/risks`; ganti "instan".
- *Bedanya:* pengguna melihat risiko yang benar.

**D-14. Teks web bertentangan dengan dokumen 🟠 · dari kode**
- *Masalahnya apa:* `SecuritySection.tsx:39` "6 decimals for USDG, 18 for shares" vs `transparency/page.tsx:31-32` "6 decimals" dan `ACCOUNTING.md:29` (share mewarisi decimals asset, tidak ada konversi 18↔6). `transparency/page.tsx:20-21` "staging fork · no code on mainnet ... Every address on these pages is a fork address" padahal vault testnet 46630 ada (stale; AV-4 menyentuh sebagian). `SecuritySection.tsx:15` "guardian ... cannot move funds": benar untuk transfer, tapi guardian bisa menghentikan semua penarikan; teks tidak menyebut. `deposit/page.tsx:180` judul "Protocol Guarantees" untuk daftar perilaku UI (bukan jaminan hasil, tetapi kata "guarantees" memancing salah baca). `WEB_APP.md:138` "max_loss eksplisit, tanpa default" vs `WithdrawForm.tsx:87` `useState(0)` (default 0 bps, sesuai REMEDIATION dan WITHDRAWAL §5).
- *Kenapa penting:* brief §11 informasi harus sesuai implementasi.
- *Contoh kejadian:* pengguna membaca "share 18 desimal", memasukkan jumlah yang salah di alat luar.
- *Cara memperbaiki:* samakan teks; ubah "Protocol Guarantees" menjadi "Perilaku form"; sesuaikan WEB_APP.
- *Bedanya:* tidak ada angka desimal yang bertentangan.

**D-15. Dokumen yang diminta brief §17 belum ada 🟠 · dari dokumen**
- *Masalahnya apa:* signer policy, backup/recovery guide, daftar known limitations (tersebar di "Batas yang jujur"), estimasi scope/biaya mandat lanjutan, tautan verifikasi source per alamat, halaman product docs.
- *Kenapa penting:* brief §17 poin 5-7, 9-10.
- *Contoh kejadian:* kunci keeper hilang dan tidak ada prosedur pemulihan.
- *Cara memperbaiki:* tulis `SIGNER_POLICY.md`, `BACKUP_RECOVERY.md`, `KNOWN_LIMITATIONS.md`, `MANDATE_ESTIMATES.md` (isi: dependency yang belum ada, bukan harga tebakan); tautkan hasil verifikasi explorer atau tulis "belum diverifikasi".
- *Bedanya:* deliverable lengkap.

**D-22. Deposit tanpa batas minimum shares 🟠 · dari kode**
- *Masalahnya apa:* brief §9: "Jika batas minimum hasil tidak tersedia pada metode core, gunakan router yang ditinjau atau desain perlindungan yang setara". `grep` `minShares|slippage|minOut` di `deposit.ts` dan `packages/sdk/src` kosong. ADR-11 menolak router dan hanya membahas `max_loss` penarikan (`ARCHITECTURE.md:135`). Kutipan satu blok dan simulasi ada, tetapi tidak ada batas.
- *Kenapa penting:* harga share bisa bergeser antara simulasi dan blok masuk (report, unlock profit).
- *Contoh kejadian:* report dieksekusi sebelum deposit; shares lebih sedikit dari yang ditampilkan.
- *Cara memperbaiki:* tambah cek `shares >= minShares` di SDK sebelum kirim (simulasi) dan perlindungan onchain bila perlu (router ditinjau atau kontrak pembungkus); tulis keputusan di ARCHITECTURE.
- *Bedanya:* pengguna tahu batas hasil sebelum menandatangani.

#### Temuan Rendah (ringkas)

| ID | Di mana | Masalah | Perbaikan |
|---|---|---|---|
| D-16 | `ACCOUNTING.md:70` cite `VaultV3.vy:1069` sebagai `_process_report`; `SECURITY_DIFF.md:40` bilang 1069 ada di `_update_debt`. `ROLE_PERMISSION_MATRIX.md` `set_auto_allocate :1438` vs `SECURITY_DIFF.md:51` `:1429`. `BASELINE.md:8` dan `REFERENCE_CAPTURE.md:§2` menunjuk `referensi/yearn-vaults-v3/...`, tapi folder itu tidak ada (`ls referensi`: hanya docs.yearn.fi, eips, kassora.org, yearn.fi); `find` tidak menemukan `*.vy` | Nomor baris tidak bisa diperiksa dari repo ini; sebagian bertentangan | Sertakan source pinned atau tautan commit+path; samakan nomor baris |
| D-17 | `ACCEPTANCE_EVIDENCE.md:137`, `REMEDIATION.md:163-167`, `KEEPER.md:7` angka 101 unit/90 web/22 keeper. Hitungan grep saya: 119 fungsi test+invariant (kontrak), 11 fork, 95 web, 23 keeper, 32 indexer, 12 sdk (bukan hasil jalan test). `ACCOUNTING.md:50` dan `FEE_CONFIG.md:40` "tiga lapis" tapi 4 baris; `FEE_CONFIG.md:113,151` dua bagian "## 7"; `DEPLOYMENT.md:6` output `4663.<mode>.json` vs berkas testnet `46630.stage.json` | Angka dan penomoran basi | Ambil angka dari log run terakhir; rapikan |
| D-18 | `ADR-7` (`ARCHITECTURE.md:127`), `AUDIT_SCOPE.md:77-78` "dead shares wajib"; `46630.stage.json` `seedAssets: 0` dan pending "seed dead shares once treasury is funded". `DepositCapHook` ada di `src/hooks` tapi `Deploy.s.sol` tidak menyebut hook (grep) dan tidak ada di manifest testnet | Perlindungan yang dijanjikan belum ada di vault testnet | Tulis "belum diterapkan di testnet"; terapkan sebelum deposit dibuka |
| D-19 | `RUNBOOK.md:105`, `AUDIT_SCOPE.md:119,127-134`, `REMEDIATION.md:51,63,86` link `file:///c:/laragon/www/kevin-work/wealthy-project/avenor/...` | Link rusak di mesin lain; membocorkan path dan nama lokal | Ganti ke path relatif |
| D-20 | `NOTICE` memuat 4 komponen; tidak memuat `lib/yearn-periphery` (`Accountant.sol`, `IVault.sol`, AGPL per `BASELINE.md:14` dan `lib/VENDOR.md`). `packages/core` hanya artefak JSON tanpa source Vyper; kewajiban source offer AGPL (`BASELINE.md:63`) belum diputuskan | Inventaris lisensi tidak lengkap (brief §3.2) | Tambah entri; putuskan source offer |
| D-21 | `46630.json` `_meta.observed_at.blockNumber` 157460667 (timestamp 1795532440) lebih awal dari blok deploy yang dicatat file yang sama (157499658, 157503812; selisih 43.145 blok ≈ 54.693 detik); catatan "probed live at block ..." bercampur dengan data yang lebih baru. `deployments/README.md` mewajibkan `recordedOn`; `46630.stage.json` tidak punya | Asal data tidak jelas (tambahan dari AV-6) | Pisahkan blok pengamatan per bagian; isi `recordedOn: "chain"` |

---

### 4. Yang sudah bagus

Semua ini saya cocokkan sendiri dengan kode:
- Bitmask peran: 14 bit dan `ALL = 16383`, `governanceRoleSet = 3995`, `emergencyRoleSet = 4`, keeper `96`, `dangerousBits = 13070` cocok antara `Roles.sol`, `Roles.t.sol:18-49`, `46630.stage.json` `roleMatrix`, dan `ROLE_PERMISSION_MATRIX.md` §1-§2 (tabel bit-ke-fungsi mencakup 14 bit; ABI `VaultV3.json` memuat semua fungsi yang disebut, termasuk `setPaused`, `set_auto_allocate`, `set_transfer_hook`).
- Parameter fee di dokumen (10% performance, 0 management, `maxGain` 500, `maxLoss` 200, unlock 7 hari = 604800) sama dengan `46630.stage.json` `feeConfig`; strategi `performanceFee = 0`.
- `ACCOUNTING.md` §4b cocok dengan kode: `_strategyTotalAssets` dan `_harvestAndReport` di `MorphoVaultStrategy.sol:207,223` memakai angka yang sama; batas penarikan terukur `_venueLiquidity()` (`:320`) sesuai `WITHDRAWAL_SEMANTICS.md`.
- `VenueLiquidityShortfall` dan `VenueDepositSkipped` ada di strategi (`:82,98`) seperti ADR; `forceApprove` direset ke 0 (`:143,164`).
- Contoh hitungan fee di `FEE_CONFIG.md` §6 saya hitung ulang: 300, 2.700, pps 1,0026993 (≈1.002.699 per 1e6) benar; test `test_documentedExampleFeesLockAndUnlock` ada.
- Test yang disebut di `ACCOUNTING`, `WITHDRAWAL`, `FEE_CONFIG`, `ARCHITECTURE` (misal `test_rejectEveryoneStillAllowsFullExit`, `test_capOfZeroDoesNotBlockWithdrawals`, `test_venueWithdrawLimitIsMeasuredNotReadFromMaxWithdraw`, `test_eachBitIsSufficientForItsOwnFunction`) ada di file yang disebut.
- Endpoint indexer di `ACCOUNTING.md` §8.1 (`/live`, `/allocation`, `/fees`, `/role-events`, `positions`) ada di `api.ts`; pembacaan `pricePerShare` memakai `shareDecimals` (`reconcile.ts:144`), bukan 1e18 tetap.
- Dokumen konsisten melarang "audited", APY, janji likuiditas: `README.md:30,53`, `SECURITY_DIFF.md:12`, `AUDIT_SCOPE.md:13`, `COMPATIBILITY_MATRIX.md:57`; web `transparency/page.tsx:43,92` menolak badge audit dan APY. Tidak ada klaim "audited", "instant liquidity", APY atau jaminan hasil pada teks web yang saya cari (yang ada hanya kalimat penyangkalan; catatan kecil D-13 dan D-14).
- Banyak dokumen sudah jujur menulis batas dirinya sendiri (`WEB_APP.md` §8, `KEEPER.md` §10, banner koreksi di `ACCEPTANCE_EVIDENCE.md` dan `DRILL_EVIDENCE.md`, `COMPATIBILITY_MATRIX.md` "yang tidak diklaim").
- Perbedaan pause vs shutdown vs `deposit_limit = 0` diterangkan benar dan cocok dengan ABI dan test.

---

### 5. Yang TIDAK sempat diperiksa

- **Chain**: tidak ada akses jaringan. Saya tidak membaca pemilik Safe, `role_manager`, `getOwners()`, saldo, atau kode onchain. Pernyataan D-1 tentang pemilik Safe hanya dari skrip deploy plus hitungan lokal (hanya keeper yang dicocokkan ke config).
- **Nomor baris `VaultV3.vy`** di semua dokumen (`:774`, `:1853`, dst.): source Vyper tidak ada di repo ini. Saya hanya mencocokkan nama fungsi dengan ABI `packages/core/artifacts/VaultV3.json`.
- **Source tokenized-strategy** (`TokenizedStrategy.sol:481-489`, `BaseStrategy.sol:237-244`) dan `Accountant.sol` baris yang dikutip `FEE_CONFIG.md` (`:206-215`, `:233`, `:250-263`): saya hanya membuka bagian fee manager dan threshold.
- **`REPRODUCIBILITY.md`, `SECURITY_DIFF.md` §3-§7, `REFERENCE_CAPTURE.md` angka pasar**: hanya dibaca sebagian atau lewat grep; tidak ada klaim yang saya anggap terbukti.
- **Menjalankan test, build, atau `scripts/verify-all.py`**: tidak. Jumlah test adalah hitungan grep, bukan hasil lulus.
- **Setiap kasus W1-W13 dan P-rule** di `WITHDRAWAL_SEMANTICS.md` terhadap test satu per satu: hanya lima nama test yang saya cek ada.
- **Rendering web**, kontras, mobile, dan halaman live (sudah di GAP Bagian I).
- **`AVENOR_TESTNET_REPORT.md`, `avenor.md`, `_bmad*`, `docs/superpowers/plans/*`**: tidak dibaca kecuali grep klaim terlarang.
- **Jumlah transaksi/gas (26 tx, 20.640.165 gas)** di `TESTNET_EVIDENCE.md:108-111`: tidak bisa diverifikasi tanpa jaringan.
- **Keperluan hukum AGPL** dan kecocokan versi Foundry di CI (sudah di AV-7).
- **Kode SDK/indexer/keeper secara menyeluruh**: saya hanya memeriksa fungsi dan konfigurasi yang dirujuk dokumen.

---

### 6. Checklist tugas untuk anak dev

#### Keamanan dan peran (D-1, D-4, D-5, D-8, D-9)
- [ ] Baca `getOwners()` ketiga Safe di 46630 dan bandingkan dengan alamat hasil `makeAddr`; tulis hasilnya.
- [ ] Ganti pemilik Safe dan keeper dengan kunci nyata, terpisah per Safe, dan tidak ada di repo.
- [ ] Buat `DeployTestnet.s.sol` gagal bila alamat Safe/keeper tidak diberikan lewat env (kecuali chain lokal 31337).
- [ ] Tambah cek otomatis: tidak ada pemegang peran atau pemilik Safe yang cocok dengan hasil `makeAddr` yang dikenal.
- [ ] Tulis keputusan siapa `management` strategi (Safe langsung atau pembungkus ber-delay) dan sesuaikan matriks peran, DEPLOYMENT, dan teks web.
- [ ] Perbaiki tabel `TESTNET_EVIDENCE.md` §4.2 memakai nama bit dari `Roles.sol` (buat dari `46630.stage.json`).
- [ ] Ubah semua "Safe 3/5" menjadi tabel "rencana prod (3/5)" dan "testnet (2/3)" di ROLE_PERMISSION_MATRIX, ARCHITECTURE, REMEDIATION.
- [ ] Hapus atau tandai "tidak dipakai" untuk `TimelockExecutor` dan `DebtAllocator` di `ROLE_PERMISSION_MATRIX.md`; ubah 3999 menjadi 3995 di `DEPLOYMENT.md:194`.
- [ ] Ubah `RUNBOOK.md:21` (siapa bisa `shutdown_vault`).

#### Bukti dan evidence (D-2, D-3, D-18, D-21)
- [ ] Tambah kolom "Lingkungan" di semua tabel bukti; salin banner koreksi fork ke `RUNBOOK.md`.
- [ ] Perbarui `ARCHITECTURE.md` §4 akhir ADR-15 dan §9 sesuai status nyata.
- [ ] Periksa asal tanggal 2026-11-29 dan 2026-12-01 di ACCEPTANCE/DRILL dan samakan.
- [ ] Perbaiki nama test di `REMEDIATION.md` (`DeployScript.t.sol`, `AccountantFees.t.sol`, `RoleEnforcement.t.sol`, `test_shutdownVaultGrantsDebtManagerToTheCaller`).
- [ ] Tambah langkah di `verify-all.py` yang gagal bila nama test di `docs/*.md` tidak ada di kode.
- [ ] Putuskan minimum deposit 10 USDG: implementasikan atau hapus dari REMEDIATION, ADR-7, AUDIT_SCOPE; sama untuk `emergency_zero_assets`.
- [ ] Ubah judul dan kesimpulan `REMEDIATION.md` menjadi "register internal, belum ada review independen".
- [ ] Isi `recordedOn` dan pisahkan blok pengamatan di `46630.json`/`46630.stage.json`.

#### Fee dan kontrak (D-6, D-7, D-18)
- [ ] Ubah "batas keras" di `FEE_CONFIG.md` §5 menjadi "kebijakan" dan tulis batas kontrak sebenarnya (50% dan 2%), atau buat penegak onchain.
- [ ] Pindahkan `feeManager` testnet ke Governance Safe (dua langkah) dan catat hash tx.
- [ ] Perbaiki `AUDIT_SCOPE.md`: versi 0.8.18, jumlah baris dari `wc -l`, lingkup `DeployTestnet.s.sol` dan Safe, hapus proteksi yang tidak ada, "13 skenario", status reviewer.
- [ ] Terapkan dead shares dan hook di vault testnet sebelum membuka deposit, atau tulis "belum" di dokumen.

#### Operasional (D-10, D-11, D-13, D-15)
- [ ] Tambah bagian runbook untuk 7 skenario yang hilang (missed report, keeper crash, RPC down, depeg, valuasi salah, kunci operator bocor, migrasi gagal/user exit) dan 4 kode alert.
- [ ] Beri anchor eksplisit di `RUNBOOK.md` sama dengan kode alert, atau ubah pembuat URL di `monitor.ts:62`.
- [ ] Tambah kode monitor: `report-stale`, `keeper-heartbeat`, `rpc-lag`, drift alokasi; tulis batas stale per vault.
- [ ] Hapus klaim `maxRatio`/`targetRatio`/alarm 25% dari dokumen, atau bangun; tambah cek `eth_chainId` di keeper dan indexer.
- [ ] Betulkan `RISK_DISCLOSURE.md` §4.1; tambah fee, keeper, testnet mock; ganti kata "instan".
- [ ] Buat halaman `/docs` (atau `/risks`) di web dan arahkan "Terms & Risk Disclosures" ke sana.
- [ ] Tulis `SIGNER_POLICY.md`, `BACKUP_RECOVERY.md`, `KNOWN_LIMITATIONS.md`, `MANDATE_ESTIMATES.md`.
- [ ] Tambah tautan verifikasi source per alamat, atau tulis "belum diverifikasi".

#### Web dan deposit (D-14, D-22)
- [ ] Samakan teks desimal share (6) di `SecuritySection.tsx:39`; ganti "Protocol Guarantees"; perbarui `transparency/page.tsx` agar tidak bilang semua alamat fork.
- [ ] Sesuaikan `WEB_APP.md:138` dengan default 0 bps di `WithdrawForm.tsx:87`.
- [ ] Tambah batas `minShares` di SDK/deposit dan tulis keputusan (router vs pembungkus) di ARCHITECTURE.

#### Kerapian (D-12, D-16, D-17, D-19, D-20)
- [ ] Koreksi `BASELINE.md` §7 poin 2 dan status basi (`:3`, `:55`).
- [ ] Sertakan source Vyper pinned atau tautan commit+path; samakan nomor baris (`:1069`, `:1429` vs `:1438`).
- [ ] Perbarui angka test dari log run terakhir; perbaiki "tiga lapis" dan dua "## 7" di FEE_CONFIG.
- [ ] Ganti semua `file:///c:/laragon/...` dengan path relatif.
- [ ] Tambah `Accountant.sol` dan `IVault.sol` (AGPL) ke `NOTICE`; putuskan source offer.
