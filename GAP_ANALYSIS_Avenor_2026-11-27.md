# GAP_ANALYSIS_Avenor — Update 27 November 2026

> **Dokumen ini menggantikan status di `GAP_ANALYSIS_Avenor.md` (baseline 25 Nov) sebagai acuan terbaru.** Dokumen 25 Nov tetap disimpan sebagai pembanding dan sumber rinci temuan lama (K-, S-, D-, AV-, W-).
> **Repo:** `wealthy-org/avenor` @ `53e1d7e` (20 commit baru sejak `3040d5c`; 152 file, +14.863/-1.938) · **Live:** https://avenor-kappa.vercel.app · **Chain:** Robinhood Chain Testnet 46630 · **Acuan:** `BRIEF.md` (18 Nov 2026) + standar umum aplikasi DeFi
> **Scope:** seluruh monorepo, deployment testnet, dan situs live. Mainnet di luar scope (ditunda).
> **Keputusan owner yang berlaku:** perubahan tetap lokal (tidak di-push); mainnet ditunda sampai testnet hijau; domain `avenorfi.xyz` dan akun `x.com/avenor_fi` **disetujui** (27 Nov).

## Cara baca
Setiap temuan besar memakai pola: **Masalahnya apa → Kenapa penting → Contoh kejadian → Cara memperbaiki → Bedanya setelah diperbaiki**. Status: ✅ tertutup terbukti · 🟡 sebagian · ❌ belum · ⏳ menunggu waktu/aksi · [PERLU CEK] tidak bisa saya buktikan.

## Bagaimana analisis ini dibuat
| Yang dilakukan | Hasil |
|---|---|
| `git pull`, baca log dan diff | 20 commit sprint 2-9 (`v1.0.0-rc.1`) |
| Baca `docs/FINAL_DELIVERY_REPORT.md`, `LIFECYCLE_EVIDENCE.md`, `TESTNET_EVIDENCE.md`, `TESTNET_GOVERNANCE_HANDOFF.json`, salinan GAP milik dev | Klaim dev dicatat lalu dicocokkan |
| **Onchain testnet** lewat JSON-RPC dari Node (blok 158,40 juta, waktu chain 2026-11-27 ±07:00 UTC), dengan retry karena RPC putus-nyambung | Lihat K2 |
| **Situs live:** browser (desktop dan mobile 375×812), `curl` semua route, API, header, wallet **tiruan** | Lihat Bagian D |
| **Tiga sub-agent Sonnet (effort rendah)** membaca ulang kode terkini terhadap 65 temuan lama (K 18, S 25, D 22) dan mencari masalah baru | Hasil digabung di Bagian C dan Lampiran A, B, C |
| Verifikasi sendiri atas temuan kunci | Ditandai **[terverifikasi]** |
| Test dijalankan ulang | Lihat Bagian E |
| **Tidak dilakukan** | Transaksi dengan wallet asli; test indexer dengan Postgres; verifikasi source di explorer; fork test; PoC kontrak di repo |

**Batas kepercayaan:** temuan sub-agent berasal dari membaca kode (sebagian dengan menjalankan test atau skrip kecil). Yang bertanda **[terverifikasi]** saya periksa sendiri. Sisanya perlu dikonfirmasi anak dev.

---

# BAGIAN A: Ringkasan Eksekutif

## A1. Apa yang berubah sejak 25 Nov
**Nyata dan bagus:**
- Situs live **tersambung ke testnet 46630** dan menampilkan data onchain (vault `0xDa4D…7DA0`), judul netral, header keamanan, navbar dengan Connect wallet, route baru, PWA, tampilan mobile lebih rapi.
- Onchain: `acceptManagement` strategi **sudah dijalankan**; operasi timelock `accept_role_manager` **sudah dijadwalkan** (bisa dieksekusi setelah **2026-11-28 02:09:09 UTC**).
- Kode: K-1 (usulan timelock prod revert) **diperbaiki dan diuji eksekusi penuh**; K-9 (MAX redeem 18 desimal) diperbaiki; deposit punya `minShares` dan umur quote; web membaca chain ID dari node; skrip deploy testnet kini fail-closed (tanpa `makeAddr` di chain publik); indexer punya `main.ts`, migrasi `role_bit` dan deposit/withdraw; keeper menunggu receipt.
- Dokumen: 7 dokumen baru yang diminta brief §17 (signer policy, backup, known limitations, estimasi mandat, dll.); LICENSE/NOTICE; banner koreksi di evidence lama.
- Test naik: `forge` 125, web 119, keeper 24.

**Masalah serius yang ditemukan di pengecekan ini:**
1. **Dua halaman live berisi data karangan** (`/activity` dan `/operator`), sambil menulis "No synthetic data". **[terverifikasi]** (N-1)
2. **Skrip serah-terima `execute-handover.py` memakai selector dan salt yang salah** dan mode `--execute` hanya mencetak teks; runbook mainnet bergantung padanya. **[terverifikasi selector]** (N-2)
3. **"Lifecycle drill" hanya menjalankan test Foundry lokal**, tetapi tugas "lifecycle dengan tx hash" **dicentang `[x]`** di salinan GAP milik dev. Vault di chain masih kosong. **[terverifikasi]** (N-3)
4. **`FINAL_DELIVERY_REPORT.md` menyatakan Tahap D–G "LENGKAP", "audit-ready", "320/320"**, dengan 6 alamat yang bertentangan dengan manifest deployment. (N-4)
5. **Perbaikan kode lebih sedikit daripada yang dilaporkan:** dari 43 temuan kontrak, keeper, dan indexer, hanya **3 tertutup penuh** (K-1, K-9, S-14). 142 item dicentang `[x]` di salinan GAP dev; banyak yang tidak didukung kode atau chain.

## A2. Posisi tahap (brief §16)
| Tahap | 25 Nov | 27 Nov | Catatan |
|---|---|---|---|
| A — Baseline | ✅ | ✅ | BASELINE kini konsisten dengan kode (D-12 ✅) |
| B — Vertical slice | ✅ (fork) | ✅ (fork) | Bukti masih fork dan test lokal |
| C — Product | 🟡 | 🟡 lebih maju | Route `/activity`, `/docs`, `/operator`, Connect di navbar ada; **tetapi `/activity` dan `/operator` memuat data tidak nyata**, katalog `/vaults` masih 404, "Open app" masih anchor |
| D — Multistrategy | ❌ | 🟡 hanya di test | Ada `MultiStrategyAllocationTest`; di chain tetap satu strategi (mock) |
| E — Testnet + review | 🟡 baru mulai | 🟡 | Deploy ada, handover berjalan; lifecycle, drill, keeper 72 jam, indexer belum terbukti di chain |
| F — Mainnet terbatas | ⚪ ditunda | ⚪ ditunda | |
| G — Mandat lanjutan | ⚪ | ⚪ | |

## A3. Skor progres (metode sama dengan Bagian L di dokumen 25 Nov)
> Estimasi head dev: tertutup terbukti = 1, sebagian atau menunggu aksi = 0,5, belum = 0.

| Ukuran | 25 Nov | 27 Nov | Perhitungan 27 Nov |
|---|---|---|---|
| **Gap prioritas (30 item yang sama: 10 W + 9 AV + 11 K/S/D)** | ≈ 63% | **≈ 62,5%** | W 8,0/10 + AV 4,75/9 + K/S/D 6,0/11 = 18,75/30 |
| **Seluruh temuan (84 item: W 10, AV 9, K 18, S 25, D 22)** | belum dihitung | **≈ 40%** | W 8,0 + AV 4,75 + K 5,5 + S 4,0 + D 11,5 = 33,75/84 |
| **Bukti tahap E di testnet (12 syarat)** | ≈ 27% | **≈ 27%** | deploy 1, role matrix 0,5, timelock 0,5, indexer 0,25, situs 0,5, review 0,25, release candidate 0,25; lifecycle, loss, fee, drill, keeper = 0 → 3,25/12 |
| **Brief tahap A–E** | ≈ 64% | **≈ 62%** | A 1, B 1, C 0,6, D 0,25, E 0,27 |
| **Brief tahap A–G** | ≈ 46% | **≈ 44%** | /7 |

**Kenapa skor tidak naik meski ada 20 commit:** (1) situs dan dokumen benar-benar membaik (W 7,5 → 8,0), tetapi (2) pengecekan lebih dalam menurunkan nilai beberapa item yang tadinya terlihat selesai (S-11, D-2, D-1) dan (3) muncul masalah baru yang serius (halaman data karangan, skrip handover salah). Skor naik cepat bila bukti di chain (M3 di Bagian M dokumen 25 Nov) dikerjakan.

---

# BAGIAN B: Kondisi Onchain Testnet 46630 (dibaca langsung 27 Nov)
| Cek | Hasil | Dibanding 25 Nov |
|---|---|---|
| Chain / blok | 46630 / ±158.402.941; waktu chain 2026-11-27 ±06:53 UTC | |
| `vault.role_manager()` | **Masih deployer `0x56d8…8648`**; `future_role_manager` = timelock `0x7D25…eAAc` | ⏳ belum |
| Operasi timelock `accept_role_manager()` (id `0x9068…d05f`) | `isOperation=1`, `isOperationPending=1`, `isOperationReady=0`, `isOperationDone=0`; `getTimestamp = 1795831749` = **2026-11-28 02:09:09 UTC** | ✅ **berubah**: dijadwalkan (tx `0x381f…376d`) |
| `strategy.management()` | Governance Safe `0x24e9…d4AA`, pending = 0 | ✅ **berubah**: `acceptManagement` selesai (tx `0xb887…f19b`) |
| Role bitmask | tl 3995, emergency 4, guardian 8192, keeper 96, treasury 4096, deployer 0 | tetap, cocok dokumen |
| Delay timelock | 172.800 dtk dan 21.600 dtk | tetap |
| `totalAssets`, `totalSupply`, `deposit_limit`, mockUSDG supply | **semua 0** | ❌ tidak berubah |
| `deposit_hook` | `0x0` | ❌ hook belum terpasang |
| Pemilik Safe governance / guardian / treasury | deployer + 2 alamat hasil `makeAddr` (kunci dapat dihitung publik) di tiap Safe; threshold 2 | ❌ tidak berubah |
| Keeper `0x9c4D…5d75` | alamat sama dengan `makeAddr("avenor.testnet.keeper")` **[terverifikasi]** | ❌ tidak berubah |

**Catatan:** skrip `DeployTestnet.s.sol` sudah diperbaiki untuk deploy baru, tetapi stack yang sudah di-deploy tidak diganti. Saya tidak bisa mengeksekusi timelock (tugas Governance Safe).

---

# BAGIAN C: Perbandingan Temuan 25 Nov → 27 Nov

## C1. Situs live (W-1..W-10)
| ID | 25 Nov | 27 Nov | Bukti |
|---|---|---|---|
| W-1 API data palsu untuk alamat apa pun | ❌ | 🟡 | Vault testnet kini dijawab dari chain (`source:"onchain"`). Alamat tak valid → **HTTP 500** (harus 400) |
| W-2 klaim "baca langsung" salah | ❌ | ✅ | Halaman vault: "read directly from the node" dan benar |
| W-3 target mainnet | ❌ | ✅ | Label testnet 46630 di semua halaman; `/health` ok |
| W-4 "DEPLOYED"/label chain | ❌ | ✅ | |
| W-5 teks Indonesia, blok salah | ❌ | ✅ | |
| W-6 judul "Institutional" | ❌ | ✅ | Judul: "Systematically Managed On-Chain Yield Strategies" |
| W-7 route hilang, favicon, dll. | ❌ | 🟡 | `/activity`, `/docs`, `/operator` 200; `robots`, `sitemap`, `manifest` ada; link X benar. **Katalog `/vaults` dan `/app/vaults` 404**; **dua halaman baru berisi data tidak nyata (N-1)** |
| W-8 header keamanan | ❌ | 🟡 | Ada CSP, nosniff, frame-ancestors, referrer-policy. CSP masih `unsafe-inline`, `unsafe-eval`, `connect-src https://*` |
| W-9 aksesibilitas | ❌ | 🟡 | Gambar tanpa `alt` 0 ✅; marquee 3× tanpa `aria-hidden` ❌; tap target mobile kecil 22/46 |
| W-10 Connect dan navigasi | ❌ | 🟡 | Navbar: Connect wallet, Portfolio, Transparency, Activity ✅. "Open app" masih `#vaults`. Dengan wallet tiruan di chain lain, klik Connect tidak memberi pesan atau permintaan pindah chain [PERLU CEK dengan wallet asli] |

## C2. Temuan AV (laporan 25 Nov)
| ID | 25 Nov | 27 Nov | Catatan |
|---|---|---|---|
| AV-1 `role_manager` masih deployer | 🔴 | ⏳ | Dijadwalkan, menunggu 2026-11-28 02:09 UTC |
| AV-2 deployer di semua Safe + kunci dapat dihitung | 🔴 | ❌ | Tidak berubah di chain |
| AV-3 lifecycle belum terbukti | 🔴 | ❌ | Vault kosong; drill hanya test lokal (N-3) |
| AV-4 situs basi | 🔴 | ✅ | Tersambung testnet |
| AV-5 alamat 0x5aeB tertanam | 🟠 | ✅ (tampilan) | Hapus total dari kode [PERLU CEK] |
| AV-6 inkonsistensi evidence | 🟠 | 🟡 | `stage.json` kini punya `gitRev`, `recordedOn`, catatan L1/L2 ✅; sisa ketidakcocokan alamat di laporan akhir (N-4) |
| AV-7 CI | 🟠 | [PERLU CEK] | Tidak ada bukti run hijau |
| AV-9 RPC fallback | 🟡 | 🟡 | Indexer: multi-URL dan cek chain ID; keeper: fallback tanpa cek chain ID |
| AV-10 invariant withdraw revert | 🟡 | 🟡 | Ada commit "handler bounds", rasio baru belum diukur |

## C3. Kontrak, SDK, web (K-1..K-18): ✅ 2 · 🟡 7 · ❌ 9
| ID | Temuan singkat | 27 Nov |
|---|---|---|
| K-1 | Usulan timelock prod revert | ✅ test `DeployScript.t.sol:283-377` benar-benar jadwal, maju 48 jam, eksekusi, cek state |
| K-2 | Kunci `makeAddr` | 🟡 skrip fail-closed; **chain tidak berubah** |
| K-3 | Health check Accountant | 🟡 hanya dokumen, tanpa test donasi >5% |
| K-4 | Treasury `DEBT_PURCHASER` | ❌ kode masih memberi (`Deploy.s.sol:455,572`) |
| K-5 | `DepositCapHook` | 🟡 skrip dan test ada; **onchain `deposit_hook = 0x0`**; test "lepas hook" mengabadikan perilaku berbahaya |
| K-6 | Web membaca vault staging | 🟡 `isPaused` masih dikunci `false` (`serverData.ts:92`) |
| K-7 | Chain ID tertanam | 🟡 dibaca dari RPC; bagian lain belum |
| K-8 | Deposit tanpa minShares | 🟡 `minShares` 50 bps dan umur quote 60 dtk ada; `submitDeposit` mengirim approve sebelum cek minShares dan melempar error setelah deposit sukses (N) |
| K-9 | MAX redeem 18 desimal | ✅ `WithdrawForm.tsx:203`, tetapi test menyalin rumus (lemah) |
| K-10 | Likuiditas dari saldo venue | ❌ `MorphoVaultStrategy.sol` tidak berubah sejak 22 Nov |
| K-11 | Validasi timelock luar | 🟡 admin lain/executor belum diperiksa |
| K-12..K-18 | Snapshot SDK, `maxLoss` 9999, alamat anvil tertanam, cek skala venue, `prepareApprove`, fase pending, skrip hanya mencetak | ❌ kode tidak berubah |

## C4. Keeper dan indexer (S-1..S-25): ✅ 1 · 🟡 6 · ❌ 18
| Kelompok | Status 27 Nov |
|---|---|
| S-14 `role_events` PK | ✅ migrasi `0002` |
| S-1 receipt/tx ganda | 🟡 menunggu receipt, tanpa pelacakan lintas restart |
| S-6, S-17, S-20, S-21, S-23 | 🟡 fallback RPC dan cek chain ID di indexer; `main.ts` ada tapi tanpa penjadwal rekonsiliasi dan tabel `vaults` tidak diisi; endpoint `/deposits` `/withdrawals`; `/health` masih `ok:true` tetap |
| S-2, S-3, S-4, S-5, S-7..S-13, S-15, S-16, S-18, S-19, S-22, S-24, S-25 | ❌ termasuk **batas nominal, cooldown, gas budget (gas tetap 1,5 juta), allowlist target/fungsi, rekonsiliasi `totalAssets` (rumus tetap abaikan deposit/withdraw), rollback reorg lengkap, timeout RPC tanpa retry, alamat vault URL diabaikan** |

## C5. Dokumen (D-1..D-22): ✅ 3 · 🟡 17 · ❌ 2
✅ D-12 (BASELINE §7), D-19 (link `file:///c:`), D-20 (NOTICE). ❌ D-16 (nomor baris `VaultV3.vy` masih bertentangan), D-18 (dead shares dan hook di testnet: `seedAssets 0`). Sisanya 🟡: kebanyakan sudah diperbaiki di satu dokumen tetapi masih bertentangan di dokumen lain atau dengan chain.

**Brief §17 (deliverables 1-10):** 25 Nov: ✅ 1, 🟡 7, ❌ 2. **27 Nov: semua 🟡 (✅ 0, ❌ 0).** Semua dokumen kini ada, tetapi tidak satu pun bersih dari klaim yang salah. Tabel rinci di Lampiran C.

---

# BAGIAN D: Situs Live: Hasil Uji per Halaman (27 Nov)
| Halaman | Hasil |
|---|---|
| `/` landing | ✅ data testnet live (blok 158,40 juta). ⚠️ kartu vault menulis **"ROLE_MANAGER 0x56d8…8648 · 48h"** padahal itu deployer EOA, bukan timelock (halaman vault justru benar: "Not provable… do not treat it as a timelock"). "Open app" masih `#vaults`. Marquee 3×. Canonical `avenorfi.xyz` (disetujui owner) |
| `/vaults/0xDa4D…7DA0` | ✅ jujur: total 0, deposit ditutup, role_manager deployer, pending 0x7d25, hash kode 0x6909… |
| `/…/deposit` | ✅ "Not Open for Public Deposits" untuk fase research |
| `/…/withdraw` | ✅ data blok 158.407.121; form ada; Connect Wallet |
| `/portfolio` | ✅ tampil; butuh wallet. Connect dengan wallet tiruan di chain lain: tanpa pesan [PERLU CEK dengan wallet asli] |
| `/transparency` | ⚠️ menulis **"Testnet 46630 Live & Verified · Mainnet 4663 Ready"** dan "fully verified". Mainnet ditunda dan belum diaudit; verifikasi source tidak terbukti |
| `/docs` | ❌ memuat pernyataan salah: chain 4663, `transfer_hook` (seharusnya `deposit_hook`), `AvenorAllocatorStrategy`, "SteakUSDG venue adapter", nama peran; "fork-only" dan "tabel Deposit/Withdraw belum ada" bertentangan dengan testnet |
| `/activity` | ❌ **data karangan** (lihat N-1) |
| `/operator` | ❌ **alamat salah dan klaim "Verified On-Chain" memakai blok fork lama** (lihat N-1) |
| `/vaults`, `/app/vaults` | ❌ 404 |
| Mobile 375 px | ✅ tanpa overflow, kartu tersusun, Connect wallet terlihat, PWA aktif. 22 dari 46 tap target < 40 px |
| Header | CSP, nosniff, X-Frame-Options DENY, referrer-policy, permissions-policy, HSTS ada; CSP lemah |
| API `/v1/health`, `/v1/vaults/{valid}/live` | ✅ onchain; alamat tak valid → 500 |

---

# BAGIAN E: Hasil Test (dijalankan ulang 27 Nov)
| Suite | Hasil | Catatan |
|---|---|---|
| `forge test` tanpa fork | **125/125** (19 suite) | laporan dev: 124; hitung fungsi sub-agent: 143 di 21 file |
| `apps/web` | **119/119**, `tsc` bersih | laporan dev: 122 |
| `packages/sdk` | 12/12 | |
| `services/keeper` | 24/24 | |
| `services/indexer` | 3 lulus (`rpc.test.ts`), **35 butuh `TEST_DATABASE_URL`** | tidak ada Postgres di mesin ini; klaim 38/38 tidak diverifikasi |
| Fork test, invariant penuh, reproduksi Vyper | tidak dijalankan | |

---

# BAGIAN F: Temuan Baru (27 Nov)

## N-1. `/activity` dan `/operator` menampilkan data yang tidak ada di chain 🔴 · *terbukti (baca kode + halaman live)*
**Masalahnya apa**
`apps/web/app/activity/page.tsx` berisi daftar event yang **ditulis tetap di kode**: "Strategy Harvest & Report +2.450 USDG", "Vault Capital Inflow 50.000 USDG", "Liquidity Redemption 15.000 USDG", "Accountant Fee Accrual 245 shares", masing-masing dengan tx hash dan status "confirmed". Halaman itu menulis: *"All events originate from the verified on-chain event stream… No synthetic or off-chain data is displayed."* Padahal vault di chain kosong (`totalAssets 0`, `totalSupply 0`). Aktor yang ditulis (treasury `0x3841…9aFf`, keeper `0x1535…D9b1`, accountant `0x4102…88cc`) **tidak ada** di manifest deployment (treasury `0x8AA6…`, keeper `0x9c4D…`, accountant `0xA499…`). Hash `0xb887…f19b` yang dipasang pada "harvest" adalah hash `acceptManagement` yang asli. `/operator` memakai pola sama: alamat guardian `0x9183…2FEA`, emergency timelock `0xa575…C6c2`, keeper `0x1535…D9b1` (semuanya tidak ada di deployment), semua peran berstatus "ACTIVE", dan label "Verified On-Chain at Block 118337663" (blok fork lama; chain 46630 sekarang di blok ±158 juta). Peran juga salah dibanding chain: halaman menulis guardian = EMERGENCY_MANAGER dan FORCE_REVOKE_MANAGER, padahal di chain guardian 8192 dan emergency timelock 4. Halaman menyebut role_manager = Timelock "ACTIVE", padahal masih deployer.

**Kenapa penting**
Ini catatan transaksi dan status tata kelola yang dikarang, disajikan sebagai fakta dengan klaim "tidak ada data sintetis". Brief §11 melarang TVL, kinerja, dan CTA yang terlihat live untuk hal yang tidak ada. Pengunjung, auditor, atau calon pengguna bisa percaya ada deposit 50.000 USDG dan hasil +2.450 USDG.

**Contoh kejadian**
Auditor membuka `/activity`, melihat deposit dan harvest "confirmed", mencari hash di explorer, tidak menemukan transaksi yang cocok; kepercayaan pada seluruh situs runtuh.

**Cara memperbaiki**
1. Hapus semua event dan alamat yang ditulis tetap dari `activity/page.tsx` dan `operator/page.tsx`.
2. `/activity`: baca dari indexer (`/v1/vaults/:address/reports`, `/deposits`, `/withdrawals`, `/role-events`); tanpa data tampilkan "Belum ada aktivitas".
3. `/operator`: baca role, `role_manager`, pending timelock, dan alamat dari chain/config (`46630.json`, `stage.json`); status tidak boleh "ACTIVE" kalau `role_manager` bukan timelock.
4. Tambah test yang gagal bila halaman memuat tx hash atau alamat yang tidak berasal dari data.

**Bedanya setelah diperbaiki**
Setiap angka dan alamat di halaman berasal dari chain dan bisa dicocokkan di explorer.

## N-2. `execute-handover.py` memakai selector dan salt yang salah 🟠 · *terbukti (cast sig)*
**Masalahnya apa**
`scripts/execute-handover.py` dan `_bmad-output/safe-handover-execution.json` memakai selector `execute` `0x2e1a7d4d`, yang sebenarnya `withdraw(uint256)`; selector yang benar `0x134008d3` (`execute(address,uint256,bytes,bytes32,bytes32)`) **[terverifikasi dengan `cast sig`]**. Selector `accept_role_manager` ditulis `0x32356507`, padahal yang benar `0xf776bf1f` (sama dengan data operasi yang dijadwalkan). Salt nol, padahal operasi dijadwalkan dengan salt 1. Opsi `--execute` hanya mencetak teks, tidak mengirim transaksi. `MAINNET_GO_LIVE_RUNBOOK` Fase 1 bergantung pada JSON itu.
**Kenapa penting**
Jika Safe mengeksekusi dari JSON itu pada 28 Nov, transaksi akan gagal atau salah sasaran, dan handover tertunda. Untuk mainnet, bisa lebih berbahaya.
**Contoh kejadian**
Governance Safe menyalin calldata dari JSON, mengirim `withdraw(uint256)` ke timelock, transaksi revert; tim mengira timelock rusak.
**Cara memperbaiki**
Hitung selector dan calldata dari ABI (jangan tulis tangan), pakai salt dan operasi yang benar (`0x9068…d05f`, salt `0x…01`), jadikan `--execute` benar-benar mengirim lewat Safe, tambah test yang mencocokkan `hashOperation` dengan operasi onchain.
**Bedanya setelah diperbaiki**
Eksekusi handover dapat diulang dan terbukti cocok dengan operasi yang dijadwalkan.

## N-3. "Lifecycle drill" hanya test lokal, tetapi dicentang selesai di GAP milik dev 🟠 · *terbukti*
`scripts/testnet-lifecycle-drill.py` hanya menjalankan `forge test` lokal dengan mock dan `vm.etch`; tidak ada transaksi ke testnet. `LIFECYCLE_EVIDENCE.md` tidak memuat tx hash. Namun di salinan `GAP_ANALYSIS_Avenor.md` milik dev (`repo/`, 142 centang `[x]`), baris 375 dan 377 ("Lifecycle normal dengan tx hash", "Lifecycle loss") dicentang `[x]`. Di chain, vault kosong. **Perbaikan:** jangan mencentang tanpa tx hash; ubah nama skrip menjadi "lokal"; kerjakan lifecycle onchain (Bagian M dokumen 25 Nov).

## N-4. `FINAL_DELIVERY_REPORT.md` melampaui bukti 🟠
Menyatakan Tahap D–G "LENGKAP", "audit-ready", "320/320 lolos". Pada kenyataannya: vault kosong, `role_manager` belum pindah, hook belum terpasang, Safe lama masih lemah, drill hanya lokal. §4.2 memuat **6 alamat yang bertentangan** dengan `46630.json` dan `46630.stage.json` (Accountant, DepositCapHook, Emergency Timelock, Guardian Safe, Treasury Safe, Keeper). Blok "VERIFICATION GATE REPORT 320/320" ditulis tangan, bukan hasil skrip. **Perbaikan:** tulis ulang dengan kolom "terbukti test lokal" dan "terbukti chain"; ambil alamat dari manifest.

## N-5. Temuan baru lain (ringkas; rinci di lampiran)
| # | Temuan | Seberapa serius | Sumber |
|---|---|---|---|
| N-5 | `/transparency`: "Live & Verified · Mainnet 4663 Ready" | 🟠 | uji live |
| N-6 | `/docs` web memuat banyak pernyataan salah (chain 4663, `transfer_hook`, `AvenorAllocatorStrategy`) | 🟠 | uji live + stage1 N-1 |
| N-7 | Landing: "ROLE_MANAGER … · 48h" untuk deployer EOA | 🟠 | uji live |
| N-8 | `/v1/vaults/{tak valid}` → 500; CSP lemah; "Open app" anchor; marquee tanpa `aria-hidden` | 🟡 | uji live |
| N-9 | Indexer: `/live` selalu gagal karena config `main.ts` tanpa `shareDecimals`; URL RPC bocor ke log; komentar `reconcile.ts` membenarkan rumus yang salah; migrasi 0002 memuat `BEGIN/COMMIT` dalam transaksi runner; menunggu receipt 60 dtk membuat timer 5 dtk melempar "not reentrant" berulang dan tx bisa terduplikasi; API hanya bind 127.0.0.1; klien RPC memakai user-agent Chrome palsu | 🟠 | stage2 N-1..N-8 |
| N-10 | Kontrak/dokumen: komentar `DepositCapHook` menyarankan `set_paused` (memblokir penarikan); `FEE_CONFIG` menyebut `setVaultConfig` yang tidak ada; REMEDIATION mengklaim minimum deposit 10 USDG yang tidak ada di kode; seed 1.000 USDG diklaim padahal `seedAssets 0`; default cap skrip hook (500k/100k) berbeda dari dokumen audit (100k/10k) | 🟠 | stage1 N-2..N-6, stage3 R-07 |
| N-11 | Dokumen operasional memuat klaim tak berdasar: "7 skenario terhubung kode alert" (kode alert tidak ada), `SIGNER_POLICY` salah delay (171.081 dtk adalah sisa waktu operasi, bukan `getMinDelay`), `BACKUP_RECOVERY` memberi guardian wewenang `set_role` yang tidak ada, `WEB_DEPLOYMENT_GUIDE` memakai 4 dari 5 env yang tidak dibaca kode | 🟡 | stage3 R-05, R-08, R-09, R-11 |
| N-12 | Salinan GAP di repo dev menandai K-4 dan K-12..K-18 selesai padahal kode tidak berubah | 🟠 | stage1 N-8 |

---

# BAGIAN G: Apa yang Masih Kurang (daftar kerja untuk anak dev)
> **Aturan kerja (tetap):** langsung kerjakan, tanpa PR; ubah `[ ]` jadi `[x]` hanya bila ada bukti, dengan satu baris `Bukti: <file/fungsi> · <perintah> · <hasil> · <tx hash/screenshot>`. **Jangan mencentang tanpa bukti** (lihat N-3, N-12). Perubahan lokal; mainnet ditunda. Daftar rinci per temuan ada di Lampiran A-C dan Bagian M dokumen 25 Nov.

## G0. Urutan kerja
1. Perbaiki yang menyesatkan di situs dan dokumen (N-1, N-4, N-5, N-6, N-7) — tidak butuh chain.
2. Eksekusi handover setelah **2026-11-28 02:09 UTC** dengan skrip yang sudah benar (N-2).
3. Ganti Safe dan keeper yang kuncinya bisa dihitung.
4. Pasang hook, buka deposit bertahap, lalu lifecycle dan drill onchain.
5. Keeper 72 jam, indexer dengan Postgres, uji wallet asli.
6. Head dev deep analyze ulang.

## G1. P0: hapus data tidak nyata dan klaim berlebihan
- [ ] `apps/web/app/activity/page.tsx`: ganti event hardcoded dengan data indexer/chain; tanpa data = "Belum ada aktivitas". Tambah test yang gagal bila ada tx hash atau alamat yang tidak berasal dari data.
- [ ] `apps/web/app/operator/page.tsx`: baca role, role_manager, pending timelock, dan alamat dari chain/config; status "ACTIVE" hanya bila terbukti; hapus label blok 118337663.
- [ ] `/transparency`: hapus "Live & Verified" dan "Mainnet 4663 Ready"; tulis status sebenarnya (testnet, mock venue, belum diaudit, source belum diverifikasi).
- [ ] `/docs` web: perbaiki chain (46630), `deposit_hook`, nama kontrak (`MorphoVaultStrategy`), nama peran sesuai `Roles.sol`; hapus klaim "fork-only".
- [ ] Landing: kartu vault menampilkan role_manager sesuai pembacaan onchain, tanpa "· 48h" bila bukan timelock.
- [ ] `FINAL_DELIVERY_REPORT.md`: tulis ulang dengan dua kolom (test lokal vs chain); pakai alamat dari manifest; hapus "audit-ready" dan blok "320/320" tulis tangan.
- [ ] Salinan GAP di repo: buka kembali centang yang tidak didukung (lifecycle K-4, K-12..K-18, D-1, dst.).
- [ ] Hapus klaim fitur yang tidak ada (minimum deposit 10 USDG, seed 1.000 USDG) atau implementasikan.
- [ ] Perbaiki `SIGNER_POLICY`, `BACKUP_RECOVERY`, `KNOWN_LIMITATIONS`, `WEB_DEPLOYMENT_GUIDE`, `RUNBOOK` sesuai R-05..R-11 di Lampiran C.

## G2. P0: serah-terima dan keamanan di chain
- [ ] Perbaiki `scripts/execute-handover.py` dan `safe-handover-execution.json`: selector `0x134008d3`, `0xf776bf1f`, salt `0x…01`, operasi `0x9068…d05f`; `--execute` benar-benar mengirim; test yang mencocokkan `hashOperation`.
- [ ] Setelah **2026-11-28 02:09 UTC**: eksekusi lewat Governance Safe. Bukti: tx hash; `role_manager()` = `0x7D25…eAAc`; `isOperationDone(0x9068…d05f)` = true; `getMinDelay()` = 172800.
- [ ] Ganti pemilik Safe governance, guardian, treasury (cabut 6 alamat `makeAddr` dan deployer), pertahankan threshold 2. Bukti: `getOwners()`.
- [ ] Ganti keeper dengan kunci baru; cabut role lama (`roles(keeperLama)` = 0).
- [ ] Pindahkan `feeManager` dari deployer; cabut `DEBT_PURCHASER` dari treasury (K-4) bila tidak dibutuhkan.
- [ ] Jalankan `scripts/check-handover.py` dan lampirkan output.

## G3. P1: kode yang belum diperbaiki (ringkas)
- [ ] **Keeper:** batas nominal, harian, cooldown, gas budget dari estimasi, allowlist target/fungsi, pelacakan tx pending lintas restart, "already known" bukan error nonce, alert dengan antrean dan dedup, saring URL RPC dari log, validasi env (S-1..S-10).
- [ ] **Indexer:** rekonsiliasi `totalAssets` yang memakai deposit/withdraw dan snapshot sama, penjadwal rekonsiliasi, isi tabel `vaults`, rollback reorg lengkap, `block_time` benar, retry timeout, validasi alamat di URL, `/health` yang jujur, advisory lock, perbaiki N-9 (S-11..S-25).
- [ ] **Kontrak:** pasang `DepositCapHook` lewat timelock; test hook yang tidak mengabadikan perilaku berbahaya; cek skala venue (K-10, K-15); test donasi >5% (K-3).
- [ ] **SDK/web:** snapshot satu blok (K-12), batas `maxLoss` (K-13), approve lalu cek `minShares` diperbaiki, fase pending dan `chainChanged` (K-16, K-17), `isPaused` dari chain (K-6).
- [ ] **API web:** alamat tak valid → 400, tak dikenal → 404, RPC putus → 503; persempit CSP; "Open app" ke halaman nyata; katalog `/vaults`; `aria-hidden` marquee; tap target mobile.
- [ ] **Connect wallet:** pesan atau permintaan pindah chain saat wallet di chain lain (uji dengan wallet asli).

## G4. P1: bukti di chain (tahap E)
- [ ] Pasang hook dan buka `deposit_limit` bertahap lewat timelock.
- [ ] Lifecycle onchain dengan tx hash: mint mockUSDG, approve, deposit, `update_debt`, report, withdraw/redeem `max_loss` eksplisit.
- [ ] Lifecycle loss (`max_loss = 0` revert), fee nonzero ke Treasury Safe, drill freeze, pause, force-revoke, illiquidity, shutdown, strategi kedua.
- [ ] Keeper berjalan 72 jam (log dan alert); indexer dengan Postgres 38/38 dan rekonsiliasi selisih 0.
- [ ] Uji manual web 14 alur dengan wallet asli (tabel G7 dokumen 25 Nov).
- [ ] Verifikasi source di explorer testnet atau catat "bytecode cocok, source belum diverifikasi".

## G5. P2
- [ ] Sisa temuan di Lampiran A, B, C yang belum tercentang.
- [ ] D-16 (nomor baris `VaultV3.vy` — source tidak ada di repo, tulis hash atau tag, bukan nomor baris), D-17 (angka test konsisten), D-18 (seed dead shares).
- [ ] Mainnet, audit pihak ketiga, dan mandat lanjutan tetap ditunda.

## G6. Cara cek ulang cepat
```bash
cast call 0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0 "role_manager()(address)" --rpc-url https://rpc.testnet.chain.robinhood.com
cast call 0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc "isOperationDone(bytes32)(bool)" 0x9068381b1398cc7c6ca1753431c50f21db62ca44305f6d4d1fa3b450cd17d05f --rpc-url https://rpc.testnet.chain.robinhood.com
cast call 0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0 "totalAssets()(uint256)" --rpc-url https://rpc.testnet.chain.robinhood.com
cast call 0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0 "deposit_hook()(address)" --rpc-url https://rpc.testnet.chain.robinhood.com
```

---

# BAGIAN H: Penilaian Akhir 27 Nov
| Aspek | 25 Nov | 27 Nov | Artinya |
|---|---|---|---|
| Arsitektur dan disiplin dokumen | 4,5 | 3,5 | Banyak dokumen baru, tetapi isinya sering bertentangan dengan kode dan chain |
| Kontrak dan test | 4 | 4 | 125 test lulus; K-1 diperbaiki dengan test eksekusi nyata; sebagian temuan belum disentuh |
| Deployment testnet | 3 | 3,5 | Handover berjalan (strategi diterima, timelock dijadwalkan); vault masih kosong |
| Bukti operasional (lifecycle, drill, keeper, indexer) | 1,5 | 1,5 | Belum ada di chain |
| Situs live | 1,5 | 3 | Tersambung testnet, jujur di halaman vault; tetapi `/activity` dan `/operator` memuat data karangan |
| Kejujuran status | 3 | 2 | Laporan akhir dan centang GAP melampaui bukti; ada halaman dengan data tidak nyata |

**Kesimpulan:** situs dan deployment maju nyata. Namun status yang dilaporkan dev ("LENGKAP", "audit-ready", "320/320") belum terbukti, dan ada dua halaman publik yang menampilkan data yang tidak ada. Prioritas berikutnya: bersihkan klaim dan data tidak nyata, eksekusi handover dengan skrip yang benar setelah 28 Nov 02:09 UTC, ganti Safe dan keeper, lalu buktikan lifecycle di chain.

---

# LAMPIRAN A: Cek ulang kontrak, SDK, web (K-1..K-18) — sub-agent Sonnet
## Cek ulang Tahap 1 (K-1..K-18) pada commit terbaru

Auditor: read-only. Repo: `.../avenor/repo`, HEAD `53e1d7e` (27 Nov). Tidak ada file source yang diubah, tidak ada commit/push/pull.
Baseline: Lampiran A di `GAP_ANALYSIS_Avenor.md` (25 Nov).

Yang saya jalankan:
- `forge test --match-path 'test/unit/*'` di `packages/contracts` (output build ke folder sementara, bukan ke repo): **124 lulus, 0 gagal**.
- `node --test` untuk `deposit`, `withdraw`, `vaultSource`, `chainFacts`, `wallet` di `apps/web`: 57 lulus.
- `cast call` baca-saja ke RPC testnet 46630 (owner Safe, peran keeper, `deposit_hook`, `role_manager`) dan hitung ulang alamat `makeAddr` dengan `cast`.
- Sisanya dari membaca kode. Ditandai "dibaca".

Ringkasan: ✅ 2, 🟡 7, ❌ 9, ❓ 0 (total 18).

Catatan penting: `GAP_ANALYSIS_Avenor.md` salinan di repo dan `docs/REMEDIATION.md` menandai hampir semuanya selesai (termasuk `[x] P2 sisa K-12..K-18`). Untuk banyak ID itu tidak cocok dengan kode (lihat kolom bukti).

### 1. Tabel status

| ID | Temuan singkat | Status | Bukti file:baris (kode terkini) | Sisa tugas |
|---|---|---|---|---|
| K-1 | Usulan timelock prod tidak memberi timelock hak peran, eksekusi gagal | ✅ Diperbaiki | `script/Deploy.s.sol:554-596`: panggilan ke-0 sekarang `set_role(timelock, governanceRoleSet())` (`:566`), total 12 panggilan. `:1147-1149` menolak `management != timelock` di prod. Tes `test/unit/DeployScript.t.sol:283-377` BENAR-BENAR `scheduleBatch`, maju 48 jam, `executeBatch`, lalu memeriksa `roles(timelock)`, `strategies`, `accountant`, `management`. Saya jalankan: lulus. Ini skenario yang sama dengan temuan lama. | Tidak ada untuk K-1. (Tes memakai timelock dengan `admin = 0`; lihat K-11.) |
| K-2 | Owner Safe 2/3 dan keeper dari `makeAddr` (kunci publik) | 🟡 Sebagian | Skrip: `script/DeployTestnet.s.sol:78-87` di chain 46630 wajib `GUARDIAN/KEEPER/TREASURY_ADDRESS` dari env, Safe governance dari `GOVERNANCE_OWNER_1/2/3` (`:130-155`), `makeAddr` hanya di 31337 (`:90-98`). Tes `test/unit/DeployTestnet.t.sol:17` lulus, revert-nya `ZeroAddress("GUARDIAN_ADDRESS")` (saya cek lewat trace). **Onchain belum berubah** (saya baca dengan `cast`): Governance Safe `0x24e9...` owner `0x56d8..., 0x445be7..., 0xAaB212...`; `0x445be7...` = alamat dari `keccak256("safe.owner2.governance.proposer")` (saya hitung ulang, cocok). Guardian Safe dan Treasury Safe juga masih punya 2 owner yang sama dengan baseline, threshold 2. Keeper `0x9c4D...5d75` masih peran 96 dan masih cocok dengan `makeAddr("avenor.testnet.keeper")`. | Ganti owner Safe di chain (`swapOwner`) dan keeper lama; perbarui `docs/TESTNET_EVIDENCE.md`. Skrip hanya mencegah kejadian baru, bukan memperbaiki yang sudah ter-deploy. |
| K-3 | Health check Accountant bisa memblokir laporan (donasi >5%, rugi >2%) | 🟡 Sebagian | Hanya dokumen: `docs/FEE_CONFIG.md:85-90` (§5.1). Kode dan tes tidak berubah. Tes rugi >2% sudah ada dari dulu (`test/unit/LossPath.t.sol:222`, `LifecycleDrill.t.sol:196`). Tidak ada tes donasi >5% (grep "too much gain" kosong). Runbook menyebut fungsi `setVaultConfig` yang tidak ada di Accountant (yang ada `updateDefaultConfig` `:318`, `setCustomConfig` `:383`, `turnOffHealthCheck` `:443`). Lihat N-3. | Tambah tes donasi 6% dan rugi 3% yang membuktikan jalur cepat; perbaiki nama fungsi di runbook; tentukan siapa pegang `turnOffHealthCheck`. |
| K-4 | Treasury memegang `DEBT_PURCHASER`, bisa beli utang di nilai buku | ❌ Belum | Kode tidak berubah: `Deploy.s.sol:455` (bootstrap) dan `:572` (usulan prod) masih memberi treasury `DEBT_PURCHASER`, `:840` malah meng-assert-nya. Yang berubah hanya satu paragraf di `docs/ROLE_PERMISSION_MATRIX.md:36` berisi larangan "jangan dipakai". Itu aturan di kertas, tidak ditegakkan kontrak. Tidak ada tes skenario laba belum dilaporkan + `buy_debt` (satu-satunya tes `RoleEnforcement.t.sol:450-470` memakai penabung tanpa laba dan akun `outsider`). | Cabut bit dari treasury (beri hanya ke alamat insiden lewat timelock) atau paksa `process_report` sebelum `buy_debt`; tambah tes dengan laba 4% belum dilaporkan. |
| K-5 | `DepositCapHook` tidak di-deploy/dipasang; melepas hook membuka deposit; komentar "saklar darurat" salah | 🟡 Sebagian | Ada skrip baru `script/DeployDepositCapHook.s.sol` (deploy + calldata `set_deposit_hook(hook,true)`), komentar diperbaiki (`src/hooks/DepositCapHook.sol:202-207`), tes `test/unit/DepositCapHookDeploy.t.sol` (2 tes, lulus). Tes itu menjalankan skenario, tetapi: (a) pemasangan lewat `vm.prank(d.timelock)`, bukan jadwal+eksekusi timelock; (b) tes "melepas hook" (`:118-149`) hanya membuktikan bahwa `deposit_limit` TETAP `max` setelah hook dilepas, yaitu mengabadikan perilaku berbahaya, bukan mencegahnya. Skrip tidak dipanggil dari `Deploy.s.sol` dan tidak masuk usulan prod. **Onchain**: `deposit_hook()` vault testnet masih `0x0`. `governance` hook masih `immutable`. Komentar baru punya kesalahan sendiri (N-2). | Pasang hook lewat timelock sungguhan (masuk usulan atau runbook + bukti onchain); tambah pengaman/tes agar pelepasan hook diikuti `set_deposit_limit(0,true)` dalam satu paket; benahi komentar. |
| K-6 | Web jalur server selalu baca vault staging; `isPaused` dikunci false | 🟡 Sebagian | Alamat sekarang parameter nyata: `src/lib/vaultRead.ts:402-420`, capture hanya boleh untuk alamat DAN chain yang cocok (`src/lib/vaultSource.ts:19-23`), baris metadata dari snapshot (`:62-85`), halaman deposit mengambil `asset`/`shareDecimals` dari `detail.vault` (`app/vaults/[address]/deposit/page.tsx:124-137,196-199`) dan menolak tampil saat gagal. Tes `test/vaultSource.test.ts` lulus. **Belum**: `src/lib/serverData.ts:91-92` masih `isPaused: false` dengan komentar salah "VaultV3 has no paused() getter" (ABI punya `isPaused`, `deposit.ts:176` sendiri membacanya). Parameter bawaan `address = CAPTURED_VAULT` masih ada (`vaultRead.ts:402`). `assetSymbol="USDG"` tertanam (`deposit/page.tsx:198`). | Baca `isPaused` dari chain di `toLive`; hapus komentar salah. Dampak: banner bisa bilang "tidak di-pause" padahal pause (form sendiri membaca ulang saat quote, jadi dana tidak langsung berisiko). |
| K-7 | Chain ID 4663 tertanam; RPC tidak diperiksa | 🟡 Sebagian | Konstanta dihapus dari alur form: chain ID dibaca dari RPC (`src/lib/chainFacts.ts`, `nodeProbe.ts:32`), halaman deposit menolak jika gagal baca (`deposit/page.tsx:139-148`), form membandingkan chain wallet dengan chain node sebelum kirim (`DepositForm.tsx:158`, `WithdrawForm.tsx:166`), `switchToChain(provider, id)` (`wallet.ts:129`). Tes `chainFacts.test.ts`, `wallet.test.ts` lulus. **Belum**: tidak ada satu sumber konfigurasi `NEXT_PUBLIC_CHAIN_ID`; client RPC di browser dibuat tanpa memeriksa `eth_chainId` (`DepositForm.tsx:91`); `switchToAvenorChain` masih 4663 (`wallet.ts:149-151`, hanya untuk tes); halaman `/docs` masih menulis "chain ID 4663" (`app/docs/page.tsx:22`). | Putuskan satu sumber chain ID (env), cek `getChainId()` pada client browser, koreksi teks `/docs`. |
| K-8 | Deposit tanpa minShares dan tanpa umur quote | 🟡 Sebagian | Web: `src/lib/deposit.ts:131-196` hitung `minShares` (50 bps) + `quoteTimestamp`; `:232-238` tolak quote >60 dtk; `:267-277` simulasi ulang dengan `minShares`; SDK `packages/sdk/src/writes.ts:51,105-107` + `SlippageExceededError`. Tes `apps/web/test/deposit.test.ts:240-275` (quote kedaluwarsa, shares di bawah batas) lulus. **Belum**: `minShares` di SDK masih opsional (`writes.ts:51`, bukan wajib seperti `maxLoss`); tidak ada tes SDK untuk `minShares`; perlindungan hanya simulasi tepat sebelum kirim (vault inti tidak punya `minShares` onchain, jadi masih ada celah antar-blok); toleransi 50 bps tidak bisa diatur pengguna; ada dua cacat baru (N-7). | Jadikan `minShares` wajib di SDK, tambah tes SDK, perbaiki N-7. |
| K-9 | MAX "Redeem Shares" pakai 18 desimal | ✅ Diperbaiki | `src/components/WithdrawForm.tsx:203`: `mode === "assets" ? 6 : shareDecimals`. Catatan: tes `test/withdraw.test.ts:302-314` menyalin rumus ke dalam tes, tidak memanggil komponen, jadi tidak akan merah kalau komponen rusak lagi. Perbaikan nyata, bukti tes lemah. Mode "assets" masih 6 tertanam (K-16). | Opsional: ekstrak `formatMax` ke fungsi yang dipakai komponen dan tes. |
| K-10 | Likuiditas venue diukur dari saldo USDG di venue | ❌ Belum | `src/strategies/MorphoVaultStrategy.sol:320-326` tidak berubah (`git log` file ini: terakhir 22 Nov). Tidak ada tes fork kas pindah ke adapter; `docs/KNOWN_LIMITATIONS.md` L-2 hanya soal `maxWithdraw` venue. | Ukur lewat simulasi `withdraw`/sumber terjamin; tambah tes fork; catat di `WITHDRAWAL_SEMANTICS.md`. |
| K-11 | Timelock buatan luar tidak diperiksa admin/proposer/executor | 🟡 Sebagian | Ditambah di `Deploy.s.sol:1137-1149`: delay >= 48 jam, deployer bukan admin, deployer bukan proposer, `management` harus timelock. Belum: tidak diperiksa admin LAIN (EOA lain, atau `address(0)`/siapa saja sebagai executor), tidak diperiksa `cfg.proposer` benar-benar proposer, `assertSafety` masih hanya baca delay (`:690-698`). Tidak ada tes untuk dua revert baru (grep di `DeployScript.t.sol` kosong). | Periksa semua pemegang `TIMELOCK_ADMIN_ROLE`, proposer, executor; tes untuk tiap revert. |
| K-12 | Snapshot SDK tidak satu blok | ❌ Belum | `packages/sdk/src/vault.ts:55-67` tidak berubah: tiga bacaan memakai `blockNumber` mentah (bisa `undefined` = "latest" masing-masing), nomor blok diambil sesudahnya. `previews.ts` tidak berubah. | Ambil blok dulu, pasang ke semua bacaan. |
| K-13 | `maxLoss` boleh sampai 9999 bps | ❌ Belum | `packages/sdk/src/writes.ts:34-39`, `apps/web/src/lib/withdraw.ts:19,77`, `WithdrawForm.tsx:368` ("Custom (0–9999)") tidak berubah. Warning "full-loss" hanya untuk >= 10000. | Batas atas konfigurasi + konfirmasi untuk nilai besar. |
| K-14 | Alamat deployer cadangan dan kunci anvil publik tertanam | ❌ Belum | `DeployTestnet.s.sol:47-49` masih memilih `0x56d845...` diam-diam bila `DEPLOYER_ADDRESS` kosong; `ExecuteGovernanceSchedule.s.sol:19`, `ExecuteGovernanceRehearsal.s.sol:25`, `ExecuteDrills.s.sol:46` masih alamat anvil `0xf39F...`; `PRIVATE_KEY` dari env tetap (`DeployTestnet.s.sol:42`). | Gagalkan jika kosong; pakai `--account`/hardware; buang alamat cadangan. |
| K-15 | Strategi: tanpa cek skala venue; `_emergencyWithdraw` bisa revert | ❌ Belum | `MorphoVaultStrategy.sol:100-111` (konstruktor) dan `:234-243` (`_emergencyWithdraw` redeem seluruh saldo) tidak berubah. | Cek skala di konstruktor; tarik sebagian bila venue iliquid. |
| K-16 | `prepareApprove` bebas; allowance sisa; desimal 6 tertanam | ❌ Belum | `packages/sdk/src/writes.ts:143-152` tidak berubah. Desimal 6 tertanam di `DepositForm.tsx:285-287` (MAX), `deposit.ts:50` (parser), `WithdrawForm.tsx:203` (mode assets). Urutan approve-lalu-cek tetap, dan kini ada jalur gagal baru yang meninggalkan allowance (N-7). | Baca `decimals()` aset; sediakan pembersihan allowance. |
| K-17 | Form tidak memantau akun/chain; fase "pending" tidak tampil | ❌ Belum | `setPhase("pending")` tidak dipanggil di mana pun (`DepositForm.tsx`/`WithdrawForm.tsx` hanya "quoting", "signing", "done", "error"); tidak ada `chainChanged` di `apps/web/src`. Yang baru hanya `Navbar.tsx:44-61` memantau `accountsChanged` untuk tampilan navbar; state akun di form terpisah dan tetap basi. | Listener di form (atau satu state wallet bersama) dan set "pending" setelah hash. |
| K-18 | `ExecuteTestnet46630Governance.s.sol` hanya mencetak | ❌ Belum | `script/ExecuteTestnet46630Governance.s.sol:59` masih `run() external view`; nama tidak berubah (`git log`: hanya commit pembuatnya). | Ganti nama atau tambah jalur kirim. |

### 2. Apakah ada tes baru yang benar-benar menjalankan skenarionya? (K-1, K-3, K-4, K-5)

- **K-1: ya.** `DeployScript.t.sol:283-377` menjadwalkan, menunggu delay, mengeksekusi seluruh paket lewat `TimelockController`, lalu membaca state akhir. Ini menutup celah tes lama.
- **K-3: tidak ada tes baru.** Hanya dokumen.
- **K-4: tidak ada tes baru, dan kodenya tidak berubah.**
- **K-5: sebagian.** Ada tes baru yang mengeksekusi deploy + pemasangan hook + deposit sampai cap. Tapi pemasangan via `vm.prank`, bukan lewat jadwal timelock, dan tes "lepas hook" memastikan hasil berbahaya (limit tetap max) tanpa mencegahnya.

### 3. Temuan baru (N-xx) akibat perubahan developer

#### N-1. Halaman publik `/docs` memuat banyak pernyataan yang salah (Sedang, dibaca)

**Masalahnya apa.**
Halaman baru `apps/web/app/docs/page.tsx` (dibuat untuk memenuhi brief §17) berisi: langkah deploy "3. Deploy DepositCapHook; set it as the vault's transfer_hook" (`:30`), padahal hook-nya `deposit_hook` dan proyek sendiri memutuskan `transfer_hook` kosong (`docs/SECURITY_DIFF.md:70`); "AvenorAllocatorStrategy" (`:29`) yang tidak ada (kontraknya `MorphoVaultStrategy`); "Grant GUARDIAN role" (`:31`) padahal tidak ada peran bernama itu (bitnya `EMERGENCY_MANAGER`); `WITHDRAW_LIMIT_MANAGER — sets minimum_total_idle` (`:93`) padahal itu `set_withdraw_hook`/`set_transfer_hook` (`docs/ROLE_PERMISSION_MATRIX.md:18`); `MINIMUM_IDLE_MANAGER — alias of WITHDRAW_LIMIT_MANAGER` (`:94`); `DEBT_PURCHASER — purchases bad debt at par` (`:96`) padahal membeli pada nilai buku; `EMERGENCY_MANAGER — shuts the vault down (irreversible)` (`:97`) padahal juga memegang `setPaused`; "chain ID 4663" (`:22`) padahal deployment aktif ada di 46630.

**Kenapa penting.**
Ini dokumentasi yang dibaca pengguna dan auditor. Operator yang mengikuti langkah 3 akan memasang hook ke slot yang salah, dan `transfer_hook` yang salah dapat memblokir transfer share. Auditor menilai tim lewat halaman ini.

**Contoh kejadian.**
Operator baru mengikuti "Deploy order" di web: memanggil `set_transfer_hook(hook)` (butuh `WITHDRAW_LIMIT_MANAGER`) dengan kontrak yang tidak mengimplementasikan antarmuka transfer. Transfer share bisa revert untuk semua orang.

**Cara memperbaiki.**
Tulis ulang bagian itu dari `docs/ROLE_PERMISSION_MATRIX.md` dan `docs/DEPLOYMENT.md`. Tambah tes yang mencocokkan nama peran dan bit di halaman dengan `Roles.sol`. Ganti 4663 dengan nilai yang dibaca.

**Bedanya setelah diperbaiki.**
Sekarang: halaman resmi bisa menyesatkan operator. Sesudah: isi halaman sama dengan kode dan ada tes yang menjaganya.

#### N-2. Komentar `DepositCapHook` yang baru menyarankan `set_paused` untuk "darurat" (Sedang, dibaca)

**Masalahnya apa.**
`src/hooks/DepositCapHook.sol:205-207` kini berbunyi: untuk pembekuan cepat, Guardian memakai "VaultV3 `set_paused` (reverts deposits and withdrawals)" atau `shutdown_vault`. Nama fungsi di ABI proyek adalah `setPaused` (`src/interfaces/IVaultV3.sol:229`), dan ADR-5 (`docs/ARCHITECTURE.md:123`) justru melarang `setPaused` untuk menghentikan deposit karena ikut memblokir penarikan.

**Kenapa penting.**
Komentar ini adalah perbaikan atas K-5, tetapi mengarahkan operator ke jalur yang memblokir exit penabung, bertentangan dengan prinsip "exit selalu terbuka" (brief §8.1).

**Contoh kejadian.**
Insiden kecil di hook; guardian membaca komentar dan memanggil `setPaused(true)`. Semua penabung tidak bisa menarik selama pause, padahal cukup `set_deposit_limit(0, true)` oleh governance atau `shutdown_vault`.

**Cara memperbaiki.**
Tulis: tutup deposit = `set_deposit_limit(0, true)` (governance, 48 jam) atau `shutdown_vault` (guardian, permanen, penarikan tetap jalan). Sebut `setPaused` hanya sebagai opsi terakhir yang memblokir penarikan. Pakai nama fungsi yang benar.

**Bedanya setelah diperbaiki.**
Sekarang: komentar menyarankan jalur yang mengunci penabung. Sesudah: komentar mengarah ke jalur yang menjaga exit.

#### N-3. Runbook K-3 menyebut fungsi yang tidak ada (Rendah, dibaca)

**Masalahnya apa.**
`docs/FEE_CONFIG.md:89` memerintahkan Governance Safe menjadwalkan `setVaultConfig` di timelock 48 jam untuk menaikkan `maxGain`/`maxLoss`, atau memakai `force_revoke_strategy` di jalur 6 jam. Accountant tidak punya `setVaultConfig` (yang ada `updateDefaultConfig`, `setCustomConfig`, `turnOffHealthCheck`; `lib/yearn-periphery/src/accountants/Accountant.sol:318,383,443`). Juga `force_revoke_strategy` untuk laporan yang terblokir karena DONASI akan merealisasikan strategi, bukan menyelesaikan masalah laporan.

**Kenapa penting.**
Runbook yang dipakai saat laporan terblokir harus bisa dijalankan. Salah nama = operator buang waktu saat harga share basi.

**Contoh kejadian.**
Donasi 6% membuat `process_report` revert. Operator mencari `setVaultConfig`, tidak menemukannya, lalu memakai `force_revoke_strategy`, yang mencabut strategi padahal dananya sehat.

**Cara memperbaiki.**
Pakai nama yang benar (`updateDefaultConfig`/`setCustomConfig`, atau `turnOffHealthCheck` bila dipilih), sebut siapa pemegang peran fee manager di prod (timelock 48 jam), dan hapus rujukan `force_revoke_strategy` untuk kasus donasi. Tambah tes untuk jalur yang dipilih.

**Bedanya setelah diperbaiki.**
Sekarang: runbook tidak bisa dieksekusi. Sesudah: langkah nyata dan teruji.

#### N-4. `REMEDIATION.md` mengklaim batas minimum deposit 10 USDG yang tidak ada di kode (Sedang, dibaca)

**Masalahnya apa.**
`docs/REMEDIATION.md:68-71` menyatakan ada "penegakan batas minimum deposit 10 USDG (`10_000_000n`) pada layer antarmuka web dan SDK" dan tes `apps/web/test/deposit.test.ts` yang menolak deposit di bawah batas itu. Pencarian `10_000_000n`, `MIN_DEPOSIT`, "minimum deposit" di `apps/web/src`, `apps/web/app`, `packages/sdk/src` kosong, dan `deposit.test.ts` tidak punya tes itu. Ini temuan D-3 lama yang belum bersih. Dokumen yang sama juga menyebut seed 1.000 USDG, sementara config testnet `seedAssets: 0`.

**Kenapa penting.**
Batas itu disebut sebagai mitigasi serangan inflasi share (HIGH-01). Kalau auditor percaya klaimnya, mitigasi yang sebenarnya tidak ada dinilai ada.

**Contoh kejadian.**
Auditor membaca REMEDIATION, mencatat HIGH-01 tertutup, padahal deposit pertama 1 wei di vault testnet tanpa seed tidak ditolak oleh apa pun.

**Cara memperbaiki.**
Hapus klaim, atau implementasikan batas minimum (di SDK dan form) beserta tesnya, lalu rujuk baris kodenya. Cocokkan juga klaim seed dengan config yang di-deploy.

**Bedanya setelah diperbaiki.**
Sekarang: dokumen mengklaim kontrol yang tidak ada. Sesudah: klaim sama dengan kode.

#### N-5. Dokumen env var Safe tidak cocok dengan skrip, dan skrip melakukan deploy sebelum memeriksa kunci (Rendah, dibaca + trace)

**Masalahnya apa.**
`docs/REMEDIATION.md:170` dan `docs/SIGNER_POLICY.md:86-87` menyebut `SAFE_GOVERNANCE_OWNERS`, `SAFE_GUARDIAN_OWNERS`, `SAFE_TREASURY_OWNERS`. Skrip `DeployTestnet.s.sol` memakai `GOVERNANCE_OWNER_1/2/3` dan tidak membuat Safe guardian atau treasury sama sekali (harus dibawa lewat `GUARDIAN_ADDRESS`/`TREASURY_ADDRESS`). `SIGNER_POLICY.md:17` menulis Treasury Safe "2-of-2" sedangkan onchain 2/3. Selain itu urutan di skrip: `MockERC20` dan `MockVenue` di-deploy dulu (`:52-66`) baru kunci diperiksa (`:78-87`). Trace tes saya menunjukkan kedua mock sudah dibuat sebelum revert `ZeroAddress("GUARDIAN_ADDRESS")`.

**Kenapa penting.**
Operator yang mengikuti dokumen mengisi variabel yang tidak dibaca skrip. Pada broadcast nyata, dua kontrak mock sudah terkirim sebelum skrip gagal.

**Contoh kejadian.**
Operator mengisi `SAFE_GOVERNANCE_OWNERS`, skrip bilang `GOVERNANCE_OWNER_1/2/3` kosong; pada percobaan sebelumnya gas terbuang untuk mock yang tidak terpakai.

**Cara memperbaiki.**
Satukan nama variabel antara dokumen dan skrip; pindahkan semua cek env ke awal `run()` sebelum `startBroadcast`; koreksi "2-of-2".

**Bedanya setelah diperbaiki.**
Sekarang: dokumen dan skrip beda, dan kegagalan datang setelah ada transaksi. Sesudah: gagal cepat sebelum apa pun dikirim.

#### N-6. Default cap skrip hook beda dari dokumen, dan hook tidak ada di usulan prod (Sedang, dibaca)

**Masalahnya apa.**
`script/DeployDepositCapHook.s.sol:31-32` default `GLOBAL_CAP = 500_000e6` dan `DEFAULT_WALLET_CAP = 100_000e6`. `docs/AUDIT_SUBMISSION_PACKAGE.md:100-101` menyatakan 100.000 USDG global dan 10.000 USDG per wallet. Skrip ini juga terpisah: tidak ada di `_buildProposal` (`Deploy.s.sol:554-596`), hanya mengembalikan calldata yang harus dijadwalkan manual.

**Kenapa penting.**
Operator yang tidak mengisi env mendapat plafon 5 sampai 10 kali lebih besar dari yang diumumkan ke auditor. Default angka besar adalah default yang berbahaya untuk batas "launch terbatas".

**Contoh kejadian.**
Tim menjalankan skrip tanpa env, hook ter-deploy dengan cap 500k global, lalu dipasang. Dokumen audit bilang 100k.

**Cara memperbaiki.**
Hapus default (wajib env, revert bila kosong) atau samakan dengan dokumen; sertakan pemasangan hook di runbook mainnet beserta bacaan `deposit_hook()` sesudahnya.

**Bedanya setelah diperbaiki.**
Sekarang: angka default diam-diam lebih longgar dari dokumen. Sesudah: angka eksplisit dan sama dengan yang diumumkan.

#### N-7. `submitDeposit`: approve terkirim sebelum cek minShares, dan cek pasca-kirim melempar error untuk deposit yang sudah sukses (Sedang, dibaca)

**Masalahnya apa.**
Di `apps/web/src/lib/deposit.ts` urutannya: approve dikirim dan ditunggu (`:251-262`), baru `prepareDeposit` dengan `minShares` (`:267-277`). Bila simulasi gagal `SlippageExceededError`, approve sudah on-chain dan allowance sebesar `assets` tertinggal. Lalu setelah deposit sukses, `:295-301` melempar `slippage_exceeded` bila `event.shares < minShares`. Pada titik itu transaksi sudah selesai; UI menampilkan error, bukan struk.

**Kenapa penting.**
Pengguna membayar gas approve untuk deposit yang tidak terjadi, dan allowance tertinggal (K-16). Pada kasus kedua, pengguna melihat "gagal" padahal shares sudah diterima, dan bisa mencoba lagi sehingga menyetor dua kali.

**Contoh kejadian.**
Harga share bergerak antara quote dan approve (laporan keeper). Approve sukses, simulasi deposit melempar `SlippageExceededError`. Pengguna melihat error; vault tetap punya allowance 100 USDG dari akun itu.

**Cara memperbaiki.**
Simulasikan deposit dengan `minShares` lebih dulu (lewat `stateOverride` allowance atau cek `previewDeposit` terbaru) sebelum approve; setelah deposit sukses, tampilkan struk dengan peringatan, jangan lempar error; tampilkan atau cabut allowance sisa.

**Bedanya setelah diperbaiki.**
Sekarang: slippage bisa mengakibatkan approve terbuang atau salah lapor gagal. Sesudah: penolakan terjadi sebelum ada transaksi, dan deposit yang sukses selalu tampil sukses.

#### N-8. Klaim "selesai" di `GAP_ANALYSIS_Avenor.md` salinan repo dan di `docs/` tidak sesuai kode (Sedang, dibaca + onchain)

**Masalahnya apa.**
Salinan dokumen di repo menandai `[x]` untuk "P2: sisa K-12..K-18" (`GAP_ANALYSIS_Avenor.md:615` di repo), K-3 dan K-4 sebagai selesai (`:611`), dan K-2 "terkoreksi". Kenyataan: K-12..K-18 tidak berubah (7 dari 7), K-4 hanya paragraf dokumen, K-2 belum diperbaiki onchain (owner Safe dan keeper sama dengan baseline), `docs/TESTNET_EVIDENCE.md` masih memperlakukan Safe itu sebagai pemisahan kunci yang sah. Saya juga mencatat bahwa `role_manager()` vault testnet masih deployer `0x56d8...` (bukan timelock); itu urusan AV-1, tidak saya telusuri lebih jauh.

**Kenapa penting.**
Dokumen untuk pihak luar (paket audit, laporan serah-terima) bisa menyatakan semua temuan tertutup. Pembaca yang percaya akan melewatkan risiko yang masih ada.

**Contoh kejadian.**
Auditor eksternal membaca `FINAL_DELIVERY_REPORT.md`/`REMEDIATION.md`, lalu mengurangi cakupan karena "K-1..K-18 selesai".

**Cara memperbaiki.**
Centang hanya bila ada bukti file:baris + tes yang menjalankannya. Untuk K-2 tulis jelas "skrip diperbaiki, deploy lama belum diganti". Hapus label "selesai" untuk K-4, K-10, K-12..K-18.

**Bedanya setelah diperbaiki.**
Sekarang: laporan mengklaim 18 dari 18. Sesudah: laporan menyebut yang benar-benar selesai (K-1, K-9), yang sebagian, dan yang belum.

### 4. Yang tidak sempat diperiksa

- Tes fork (`test/fork/*`) dan invariant (`test/invariant/*`) tidak dijalankan. Klaim "320 tests monorepo" tidak saya cocokkan; saya hanya melihat 124 Foundry unit dan 57 tes web yang saya pilih.
- Tes `packages/sdk`, `services/keeper`, `services/indexer` tidak dijalankan (di luar cakupan K-1..K-18).
- Skrip lain (`ExecuteDrills`, `ExecuteGovernance*`, `ExecuteWithdrawalRehearsal`, `DeployLocal`, skrip Python `scripts/*`) hanya saya grep untuk K-14/K-18, tidak dibaca baris per baris.
- Source `VaultV3.vy` tidak ada di repo; perilaku vault hanya lewat tes yang saya jalankan dan bacaan onchain.
- Status onchain lain (role_manager, jadwal timelock, saldo, event) tidak diperiksa selain yang disebut di K-2 dan K-5.
- Komponen web lain (`PortfolioPanel`, PWA, Navbar selain bagian wallet) dan perilaku browser nyata (tanpa dompet) tidak diuji; semua temuan web dari kode dan tes node.
- Docs lain (`KNOWN_LIMITATIONS`, `RUNBOOK`, `MAINNET_GO_LIVE_RUNBOOK`) hanya saya grep, tidak diaudit penuh.

---

# LAMPIRAN B: Cek ulang keeper dan indexer (S-1..S-25) — sub-agent Sonnet

## Cek ulang Tahap 2: Keeper dan Indexer (S-1..S-25)

Sifat audit: read-only. Tidak ada file source repo diubah, tidak ada commit/push/pull. Repo: `repo/` di folder avenor, HEAD `53e1d7e`. Path di bawah relatif ke `repo/services/` kecuali disebut lain.
Baseline: Lampiran B di `GAP_ANALYSIS_Avenor.md` (25 Nov).

### Yang dijalankan

| Bagian | Perintah | Hasil |
|---|---|---|
| Keeper | `npm test` di `keeper/` | Dijalankan. 24 test, 24 lulus, 0 gagal (sebelumnya 23; satu test baru untuk receipt revert, `keeper.test.ts:296`). `soak.test.ts` tidak berubah. |
| Indexer, tanpa Postgres | `node --test test/rpc.test.ts` | Dijalankan. 3 test lulus (failover 500, chain ID mismatch). |
| Indexer, butuh Postgres | `api`, `ingest`, `migrations`, `reconcile` | TIDAK dijalankan. Semuanya butuh `TEST_DATABASE_URL`; tidak ada Postgres, Docker tidak dinyalakan. Semua status indexer di bawah berasal dari membaca kode dan test. |
| Cek kecil di scratchpad | Skrip Node memanggil `httpRpc` dengan fetch palsu | Dijalankan. Hasil dipakai di S-16 dan N-3. |
| Hash topik | keccak dengan viem | Dijalankan. Topik `Deposit` dan `Withdraw` di `decode.ts:14-15` cocok dengan tanda tangan ERC-4626 Yearn V3. |

### Tabel status

Ringkasan: ✅ 1, 🟡 6, ❌ 18, ❓ 0.

| ID | Temuan singkat | Status | Bukti file:baris | Sisa tugas |
|---|---|---|---|---|
| S-1 | Tidak ada cek receipt; tx pending tidak dilacak lintas restart | 🟡 Sebagian | Ada: `keeper.ts:119-147` menunggu receipt, gagal bila revert, `onSent` baru dipanggil setelah sukses (`:149`); `viemSender.ts:53-60` (`waitForTransactionReceipt`, timeout 60 dtk); test `keeper.test.ts:296-317`. Kurang: tidak ada penyimpanan tx pending (`grep` file/DB tidak ada); `this.nonce = nonce + 1` diset sebelum receipt (`keeper.ts:117`); bila receipt timeout, hasil "failed" dan tick berikutnya merencanakan ulang dari state lama | Simpan tx pending (hash, nonce, calldata) ke file/DB dan cek saat start; setelah timeout cek receipt/replace dengan nonce sama, jangan rencanakan ulang; test restart, tick kedua saat pending, timeout |
| S-2 | "already known" dianggap error nonce lalu kirim ulang | ❌ Belum | `sender.ts:37` masih memuat `already known`; `keeper.ts:160-164` baca ulang nonce lalu `continue` | Keluarkan "already known" dari `isNonceError`; perlakukan sebagai "tx sudah ada", tunggu receipt hash yang sama |
| S-3 | Tidak ada batas nominal, harian, cooldown, gas budget | ❌ Belum | `viemSender.ts:49` gas tetap `1_500_000n`; `jobs.ts:151-152` naikkan debt sebesar semua idle di atas lantai; `config.ts` tidak punya variabel batas | Tambah `MAX_DEBT_STEP`, batas harian, cooldown, batas gas, dan test |
| S-4 | Allowlist target/fungsi tidak ditegakkan; audit log hanya stdout | ❌ Belum | `sender.ts:7-12,29` `send` menerima `to`/`data` apa saja; `viemSender.ts:41-51` tanpa cek; `log.ts:25-31` hanya stdout | Cek `to` dan selector di pengirim; audit log ke penyimpanan tetap |
| S-5 | Kunci dari env mentah; pesan error bisa membawa URL RPC ke log | ❌ Belum | `config.ts:43-44`, `main.ts:45`; `keeper.ts:91,141,169` menulis `message(error)` mentah; `viemSender.ts:64-71` mengembalikan `shortMessage`/`message` mentah. Tidak ada penyaringan URL. Bahwa viem memuat URL di pesan: pengetahuan umum, tidak dijalankan | Saring URL/secret dari semua `reason`; signer eksternal atau keystore |
| S-6 | Chain ID tidak diperiksa; tidak ada fallback RPC | 🟡 Sebagian | Keeper: fallback ditambah (`config.ts:48-55`, `main.ts:46-48`) tapi tidak ada cek chain ID (pencarian `chainId` di `keeper/src` kosong). Indexer: `rpc.ts:52-61,144-152,187` punya multi-URL dan `expectedChainId`, test `rpc.test.ts:59-83`; tetapi `main.ts:32` memanggil `httpRpc(rpcUrl)` satu URL tanpa `expectedChainId`, jadi cek tidak aktif di proses nyata | Teruskan `expectedChainId` dan daftar URL dari env di `indexer/src/main.ts`; cek chain ID di keeper (publicClient dan wallet) saat start |
| S-7 | Tidak ada "report due" berbasis waktu, cek umur data, sinyal monitor kurang | ❌ Belum | `monitor.ts` tidak berubah: tidak ada logika waktu sejak report terakhir atau umur blok (`blockTimestamp` hanya dikirim, tidak dibandingkan); `jobs.ts` tanpa konfigurasi "report maksimal tiap N jam" | Alert "report terlambat", "blok basi", "keeper senyap" |
| S-8 | Alert hilang bila webhook gagal; alert sama dikirim tiap menit | ❌ Belum | `keeper/main.ts:104` `previous = snapshot` dijalankan sebelum kirim; `:115-117` kegagalan hanya dicatat; komentar `:6-7` masih bilang "retried" padahal tidak. Tidak ada dedup (`monitor.ts` tanpa state) | Antrean alert tertunda; dedup per kode dengan cooldown; sesuaikan komentar |
| S-9 | Kelemahan kecil konfigurasi dan shutdown keeper | ❌ Belum | `keeper/main.ts:24` `Number("")` tetap 0; `:23` `MONITOR_INTERVAL_MS` tanpa validasi; `:68` `owner: account.address`; `:128-135` `process.exit(0)` tanpa menunggu tick; `:85-89` stop file tetap permanen sampai restart; `config.ts:61` `MAX_SAFE_INTEGER` | Kerjakan satu per satu sesuai daftar S-9 |
| S-10 | "Soak 7 hari" angka tetap; tidak ada test restart/nonce race/report ganda | ❌ Belum | `soak.test.ts` tidak berubah (`:57-59`, `:106`, `:110` masih ditulis tetap). Test baru hanya satu: receipt revert (`keeper.test.ts:296`). Tidak ada test restart, "already known", report ganda, stale source | Ganti dengan simulasi yang state-nya berubah; tambah test brief §15 |
| S-11 | Rekonsiliasi `totalAssets` mengabaikan deposit/withdraw | ❌ Belum | `reconcile.ts:344-360` rumus tetap `base + gain - loss + refunds`. Komentar baru `:9-18` menyatakan deposit tidak perlu ditambahkan karena "snapshot onchain sudah memuatnya", padahal sisi indexed memakai snapshot LAMA (`:337-342`, `block_number < $3`), jadi deposit antara snapshot dan blok target tidak masuk. Tabel `deposits`/`withdrawals` ada tapi tidak dibaca `reconcile.ts`. Test `reconcile.test.ts:245-266` tetap tanpa deposit | Tambah `Σdeposits.assets − Σwithdrawals.assets` (per rentang blok) ke rumus; test dengan deposit; hapus komentar yang menyesatkan (lihat N-1) |
| S-12 | Supply tidak dibatasi blok; shares per user, debt, idle tidak direkonsiliasi; tidak ada penjadwal | ❌ Belum | `reconcile.ts:362-370` query supply tanpa batas blok; tidak ada pembandingan `balanceOf`, `Σcurrent_debt` vs `totalDebt`; `main.ts` indexer tidak memanggil `reconcile`/`reconcileNow` | Batas blok, cek checkpoint ≥ blok, bandingkan debt/idle/saldo, simpan hasil, jadwalkan |
| S-13 | Rollback reorg tidak memulihkan semua tabel | ❌ Belum | `ingest.ts:352-397`: baris `deposits` dan `withdrawals` kini ikut dihapus (`:357-358`), tapi `role_state`, `strategies`, `vaults`, `share_price_snapshots` tidak disentuh; `positions` hanya di-upsert dari akun yang masih punya transfer (`:375-393`), akun yang transfernya hilang tetap menyimpan saldo lama. Tidak ada test reorg baru | Hapus/hitung ulang tabel turunan yang tersisa; hapus posisi akun yang tak punya transfer; test per tabel |
| S-14 | `role_events` hanya menyimpan satu bit per event | ✅ Diperbaiki | `migrations/0002_role_events_role_bit_pk.sql:21-25` PK jadi `(chain_id, tx_hash, log_index, role_bit)`; `ingest.ts:287-295` `ON CONFLICT (chain_id, tx_hash, log_index, role_bit)`; test `migrations.test.ts:131-153`. Nama constraint di 0002 cocok dengan `0001_init.sql:210-211`. Tidak dijalankan (butuh Postgres). Catatan: test memakai INSERT manual, bukan jalur `ingest` (S-23); lihat N-5 untuk migrasi | Tambah test lewat `ingest` dengan satu `RoleSet` multi-bit |
| S-15 | `block_time` salah untuk hampir semua log; celah getLogs dan header | ❌ Belum | `ingest.ts:433-439` satu header (`to`) untuk seluruh chunk, dipakai di `:446`; `:464-468` `blockTimestamp()` masih kode mati; `liveIngest.ts:26` default `CONFIRMATIONS=0`; tidak ada cek `blockHash` log vs boundary | Header per blok yang punya log; cek hash setelah `getLogs`; hapus kode mati |
| S-16 | Timeout RPC tidak di-retry | ❌ Belum | `rpc.ts:107-111` masih melempar ulang error yang punya `code` numerik. Dijalankan: dengan fetch yang tidak pernah menjawab dan `attempts:3`, fetch dipanggil 1 kali dan error "This operation was aborted" langsung keluar | Pakai kelas `JsonRpcError` dan `instanceof`; test timeout |
| S-17 | Indexer tidak punya proses; tabel `vaults` tidak diisi | 🟡 Sebagian | Ada: `main.ts` (migrasi `:37`, API `:44-53`, loop ingest `:60-92`, shutdown `:95-106`), `package.json` skrip `start`, Dockerfile `CMD`. Kurang: tidak ada penjadwal rekonsiliasi; tidak ada pengisi katalog `vaults` (hanya `UPDATE`, `ingest.ts:314-324`), jadi `/v1/vaults/:id` tetap 404; `/live` rusak oleh konfigurasi (N-2); API hanya bind 127.0.0.1 (N-7); satu vault saja | Tambah job reconcile + pengisi `vaults`; perbaiki N-2 dan N-7 |
| S-18 | Alamat vault di URL diabaikan untuk `/live`, `/roles`, `/allocation` | ❌ Belum | `api.ts:165` membaca `vault` dari URL, `:327,334,341` tetap memakai `cfg` | Bandingkan dengan config, 404 bila beda; test |
| S-19 | API tanpa cache/rate limit; parameter `block` bebas; 500 membocorkan error mentah | ❌ Belum | `api.ts:136-140` `block` tanpa batas atas/bawah; `:367` pesan 500 = `error.message` mentah; tidak ada cache/rate limit | Batasi `block`, pesan 500 generik, cache, rate limit |
| S-20 | Endpoint, entity, freshness brief §12 belum ada; `/health` selalu ok | 🟡 Sebagian | Ada: tabel `deposits`/`withdrawals` (`0003`), endpoint `/deposits` dan `/withdrawals` (`api.ts:214-257`). Kurang: `/health` masih `ok: true` tetap (`api.ts:156-159`); tidak ada envelope `chain/block/updatedAt/freshness`; tidak ada `GET /vaults`, `/performance`, `/activity`, `/wallets/:a/positions`, `/governance/operations`; tidak ada `AllocationSnapshot`, `TimelockOperation`, `KeeperRun` | Lengkapi endpoint, freshness, `/health` berbasis ketertinggalan |
| S-21 | Jenis fee salah label/ganda; event penting tidak diindeks | 🟡 Sebagian | Ada: `Deposit`/`Withdraw` diindeks (`ingest.ts:173-195`). Kurang: `ingest.ts:224-243` `totalFees` masih berlabel `performance` dan `protocolFees` baris terpisah; tidak ada handler `DebtUpdated`, `UpdateRoleManager`/`FutureRoleManager`, `Shutdown` (topiknya `decode.ts:20` tidak dipakai), `UpdatePaused` (`ingest.ts:325`); log tidak diurutkan sebelum diproses (`:442`) | Ganti label/struktur fee, indeks event sisa, urutkan log |
| S-22 | Aturan satu penulis tidak ditegakkan | ❌ Belum | Pencarian `advisory` di `indexer/src` kosong; `ingest.ts:407-421` baca checkpoint tanpa kunci; `main.ts:61` hanya cegah overlap dalam satu proses | `pg_try_advisory_lock` di `ingest` dan `migrate` |
| S-23 | Kualitas test indexer | 🟡 Sebagian | Tambah: `migrations.test.ts:131-153` (bit role), `:204-` (deposits/withdrawals), `reconcile.test.ts:245-266`, `rpc.test.ts`. Kurang: `fakeRpc.ts` masih hanya `transferLog` (tidak ada log Deposit/Withdraw/Report/RoleSet/StrategyChanged); test reorg tidak berubah; test S-11 tidak memuat deposit; tidak ada test ingest multi-bit, timeout, `/live` dengan config main. Semua tidak dijalankan di sini | Builder log semua event; test reorg per tabel; test rekonsiliasi dengan deposit |
| S-24 | CI kemungkinan tidak menjalankan test indexer | ❌ Belum | `.github/workflows/ci.yml:19-60` tidak berubah (`DATABASE_URL` tetap diset); `scripts/db-test.py:41-57,166` tetap mencari `initdb` dan tidak membaca `DATABASE_URL`. Perilaku runner tidak diverifikasi | Pakai `TEST_DATABASE_URL`/`DATABASE_URL` di `db-test.py` atau set `PG_BIN` di CI |
| S-25 | Alokasi hanya dari `default_queue`; decode array tanpa batas | ❌ Belum | `reconcile.ts:266-272` hanya `default_queue`; `:248-259` `length` dari RPC tanpa batas atas dan tanpa cek `length*64 <= body.length`; `:274` `Promise.all` tak terbatas | Batas ukuran, cek panjang, batasi paralelisme, bandingkan dengan `totalDebt` |

### Pemeriksaan khusus yang diminta

- Pelacakan tx pending lintas restart: tidak ada (S-1). Receipt hanya ditunggu di dalam satu proses.
- Batas nominal, cooldown, gas budget: tidak ada (S-3). Gas tetap 1.500.000.
- Allowlist target dan fungsi: tidak ada di pengirim (S-4).
- `main.ts` indexer: ada dan menjalankan migrasi, API, dan ingest. Tidak menjalankan rekonsiliasi dan tidak mengisi `vaults` (S-17).
- Deposit/withdraw: diindeks dan disimpan (`ingest.ts:173-195`), tetapi TIDAK dipakai di rekonsiliasi `totalAssets` (S-11).
- Rollback reorg: baru tabel `deposits`/`withdrawals` ditambah; belum lengkap (S-13).
- PK `role_events`: diperbaiki (S-14).
- Log yang membocorkan URL RPC: keeper belum disaring (S-5); indexer baru bocor (N-3).
- Validasi input API: tidak berubah; `block` bebas, pesan 500 mentah (S-19).

### Temuan baru (N-xx)

#### N-1. Komentar rekonsiliasi membenarkan rumus yang salah (Tinggi)

**Masalahnya apa.**
Pada `indexer/src/reconcile.ts:9-18`, developer menambah catatan "S-11 NOTE" yang menyatakan deposit/withdraw tidak perlu masuk rumus karena snapshot onchain "sudah mencerminkannya". Tetapi sisi indexed memakai snapshot sebelumnya (`:337-342`, `block_number < $3`) lalu menjumlah gain/loss/refund (`:344-360`). Deposit yang terjadi setelah snapshot dasar tidak ada di sisi indexed, sedangkan sisi onchain dibaca di blok target. Komentar juga menyebut deposit "belum diindeks" (`:16`), padahal tabel `deposits` sudah ada (migrasi 0003) dan terisi.

**Kenapa penting.**
Temuan S-11 kini tampak "diurus" di kode, padahal rumus tetap sama. Reviewer berikutnya bisa menutup S-11 hanya karena ada catatan itu.

**Contoh kejadian.**
Snapshot di blok 100: 1.000. Blok 120: deposit 500 dan report gain 10. Onchain 1.510, indexed 1.010. Status "drift" untuk vault yang sehat. Bila toleransi dilonggarkan supaya diam, penyimpangan asli ikut tersembunyi.

**Cara memperbaiki.**
Tambahkan `Σdeposits.assets − Σwithdrawals.assets` pada rentang `(base, block]` ke `indexedAssets`, buat test dengan deposit di antara snapshot, dan tulis ulang komentar sesuai rumus yang dipakai.

**Bedanya setelah diperbaiki.**
Alarm "drift" berarti selisih sungguhan, dan komentar sama dengan perilaku kode.

#### N-2. `/live` selalu gagal pada proses nyata karena konfigurasi `main.ts` tidak lengkap (Tinggi)

**Masalahnya apa.**
`indexer/src/main.ts:44-50` memberi `startApi` konfigurasi `{chainId, vault, strategy}`. Tipe `VaultConfig` (`reconcile.ts:59-65`) mewajibkan `asset` dan `shareDecimals`. Node menghapus tipe tanpa memeriksa, jadi tidak ada error saat start. `readVaultOnchain` memakai `BigInt(cfg.shareDecimals)` (`reconcile.ts:156`). Dijalankan di scratchpad: `BigInt(undefined)` melempar "Cannot convert undefined to a BigInt". Hasilnya endpoint `/v1/vaults/:addr/live` menjawab 500 setiap kali. (Panggilan `readVaultOnchain` lewat `main.ts` sendiri tidak saya jalankan; kesimpulan dari membaca kode ditambah cek `BigInt`.)

**Kenapa penting.**
Test API lulus karena test memberi config lengkap. Endpoint yang dipakai UI untuk angka onchain rusak di produksi, dan pesan 500 mentah (S-19) bocor ke klien.

**Contoh kejadian.**
Operator menyalakan indexer, membuka `/live`, dan menerima `{"error":{"code":"internal","message":"Cannot convert undefined to a BigInt"}}`.

**Cara memperbaiki.**
Baca `SHARE_DECIMALS` dan `ASSET_ADDRESS` dari env atau dari pembacaan onchain saat start, validasi, dan jalankan `tsc --noEmit` di CI agar tipe wajib benar-benar diperiksa. Tambah test yang memakai config seperti `main.ts`.

**Bedanya setelah diperbaiki.**
`/live` menjawab data nyata, dan salah konfigurasi gagal saat start, bukan saat dipanggil.

#### N-3. Pesan error RPC indexer memuat URL lengkap, termasuk API key (Sedang)

**Masalahnya apa.**
`rpc.ts:88`, `:116`, `:133` menaruh `targetUrl` ke pesan error. `main.ts:82-84` menulis pesan itu ke stderr. Dijalankan dengan URL `https://rpc.example/KEY123` dan fetch yang gagal: pesan akhir berisi `[https://rpc.example/KEY123]` dua kali.

**Kenapa penting.**
URL RPC komersial biasanya membawa API key di path. Log sering dikirim ke layanan yang aksesnya lebih longgar dari env.

**Contoh kejadian.**
RPC down sebentar. Log "ingestion tick failed: All 1 RPC endpoints failed ... [https://rpc.provider/<KEY>]" masuk ke layanan log pihak ketiga.

**Cara memperbaiki.**
Beri label endpoint ("primary", "fallback-1") atau tampilkan hanya host, dan saring URL dari pesan error sebelum dicatat.

**Bedanya setelah diperbaiki.**
Log tetap menunjukkan endpoint mana yang gagal tanpa membuka kredensial.

#### N-4. Nilai default produksi ditulis tetap di `main.ts` dan env tidak divalidasi (Sedang)

**Masalahnya apa.**
`main.ts:15-21,68` punya default untuk URL RPC (`https://rpc.testnet.chain.robinhood.com`), alamat vault, alamat strategi, `CHAIN_ID=46630`, dan `DEPLOY_BLOCK=157460000`. `Number(...)` dipakai tanpa validasi (nilai kosong atau salah ketik menjadi 0 atau NaN; `setInterval` dengan NaN berjalan sangat rapat). `expectedChainId` tidak diteruskan (S-6). Proses `ingest` memakai alamat vault dari env tanpa cek chain.

**Kenapa penting.**
Kesalahan konfigurasi tidak gagal keras. Env yang lupa diisi membuat indexer diam-diam membaca vault testnet bawaan dan menulis ke database yang mungkin untuk lingkungan lain.

**Contoh kejadian.**
Deploy staging tanpa `VAULT_ADDRESS`. Indexer mengisi database staging dengan data vault testnet.

**Cara memperbaiki.**
Wajibkan `RPC_URL`, `VAULT_ADDRESS`, `CHAIN_ID`, `DEPLOY_BLOCK` tanpa default; validasi dengan fungsi `integer()`/`address()` seperti di keeper; teruskan `expectedChainId`.

**Bedanya setelah diperbaiki.**
Env yang kurang menghentikan proses di awal dengan pesan yang jelas.

#### N-5. Migrasi 0002 memuat `BEGIN`/`COMMIT` di dalam transaksi runner (Rendah; dari membaca kode, tidak dijalankan)

**Masalahnya apa.**
`migrate.ts:77-83` membungkus tiap migrasi dalam `withTransaction`. `0002_role_events_role_bit_pk.sql:14,33` menulis `BEGIN;` dan `COMMIT;` sendiri. Menurut perilaku Postgres, `BEGIN` kedua hanya peringatan, lalu `COMMIT` menutup transaksi runner lebih awal. Insert ke `schema_migrations` jalan di luar transaksi, dan `COMMIT` terakhir runner hanya peringatan. Komentar di `0002:9` juga menyebut "IF NOT EXISTS guards the index" padahal tidak ada. Migrasi menghapus baris `role_bit IS NULL` (`:18`), tanpa jejak.

**Kenapa penting.**
Jaminan komentar `migrate.ts:75-76` (DDL dan checksum commit bersama) tidak berlaku untuk 0002. Bila proses mati di antara `COMMIT` migrasi dan insert checksum, 0002 dijalankan ulang saat start berikutnya.

**Contoh kejadian.**
Database sudah punya baris `role_events` lama dengan `role_bit` kosong; baris itu terhapus diam-diam saat migrasi.

**Cara memperbaiki.**
Hapus `BEGIN`/`COMMIT` dari file SQL, dan jalankan test migrasi dari awal pada Postgres sungguhan.

**Bedanya setelah diperbaiki.**
Tiap migrasi dan checksumnya atomik.

#### N-6. `Keeper.runOnce` menunggu receipt sampai 60 detik, sementara timer 5 detik tetap menembak (Sedang)

**Masalahnya apa.**
`viemSender.ts:54` menunggu hingga 60 dtk di dalam `runOnce`. `keeper/main.ts:125` memanggil `tick()` tiap `intervalMs` (minimum 5 dtk, `config.ts:62`). Tiap tick yang bertumpuk memanggil `runOnce`, yang melempar "runOnce is not reentrant" (`keeper.ts:67`), lalu `main.ts:91-93` mencatatnya sebagai `error`. Setelah timeout, hasil "failed" dicatat dan nonce sudah maju (`keeper.ts:117`), padahal tx mungkin masih pending dan baru bisa masuk blok kemudian.

**Kenapa penting.**
Setiap tx yang lambat menghasilkan belasan log error palsu, dan menutupi error asli. Setelah timeout, tick berikutnya bisa merencanakan job yang sama dari state lama (lihat S-1).

**Contoh kejadian.**
Blok lambat 40 detik. Delapan baris `keeper failed: runOnce is not reentrant` muncul, lalu pada receipt yang tidak datang keeper mengirim tx kedua.

**Cara memperbaiki.**
Pakai loop berurutan (`await` lalu `setTimeout`) alih-alih `setInterval`, tangani "masih berjalan" sebagai `skipped` level info, dan setelah timeout cek status tx sebelum merencanakan ulang.

**Bedanya setelah diperbaiki.**
Log bersih, dan tx lambat tidak diduplikasi.

#### N-7. API indexer hanya bind ke 127.0.0.1, tidak terjangkau dari luar kontainer (Sedang)

**Masalahnya apa.**
`api.ts:376` memanggil `server.listen(port, "127.0.0.1")`. Dockerfile (`EXPOSE 3001`, `CMD node src/main.ts`) menjalankan `main.ts` di dalam kontainer. Port yang dipetakan dari host tidak sampai ke soket yang hanya mendengarkan loopback kontainer. Shutdown (`main.ts:95-103`) juga tidak menunggu `ingestTick` yang sedang berjalan sebelum `pool.end()`.

**Kenapa penting.**
Kontainer terlihat hidup tetapi API tidak bisa diakses oleh frontend atau health check. Shutdown di tengah ingest bisa memutus transaksi.

**Contoh kejadian.**
`docker run -p 3001:3001` lalu `curl localhost:3001/health` dari host gagal koneksi. (Dari membaca kode, tidak dijalankan.)

**Cara memperbaiki.**
Buat host dapat diatur (`HOST`, default `0.0.0.0` di kontainer), dan tunggu `inFlight` selesai sebelum menutup pool.

**Bedanya setelah diperbaiki.**
API terjangkau lewat port yang dipetakan, dan shutdown tidak memutus ingest.

#### N-8. Klien RPC indexer menyamar sebagai browser Chrome (Rendah)

**Masalahnya apa.**
`rpc.ts:80` mengirim `user-agent` Chrome/Windows palsu untuk menghindari penolakan WAF (komentar `:5`). Ini juga mengubah `403` menjadi kasus yang di-retry (`:86`), sehingga blokir sungguhan diperlakukan sebagai gangguan sementara.

**Kenapa penting.**
Penyedia RPC bisa menganggapnya pelanggaran ketentuan, dan operator tidak bisa membedakan trafik indexer dari trafik pengguna.

**Contoh kejadian.**
Penyedia memblokir IP server setelah mendeteksi pola UA palsu dan volume tinggi.

**Cara memperbaiki.**
Pakai UA jujur (`avenor-indexer/<versi>`), minta allowlist ke penyedia, dan jangan retry `403`.

**Bedanya setelah diperbaiki.**
Identitas klien jelas, dan blokir terlihat sebagai error, bukan retry diam-diam.

### Yang tidak sempat diperiksa

- Test indexer (`api`, `ingest`, `migrations`, `reconcile`): tidak dijalankan, butuh `TEST_DATABASE_URL`. Perilaku migrasi 0002/0003 pada Postgres sungguhan, ingest Deposit/Withdraw, dan rollback belum terbukti dengan eksekusi.
- Tipe: `tsc` tidak dijalankan, jadi N-2 (config tidak lengkap) dibuktikan lewat pembacaan tipe dan cek `BigInt(undefined)`, bukan lewat kompilasi.
- Perilaku pesan error viem yang memuat URL (S-5 untuk keeper): pengetahuan umum, tidak dijalankan.
- CI sungguhan (S-24) dan image runner tidak diperiksa.
- Dokumen (`docs/KEEPER.md`, `ACCEPTANCE_EVIDENCE.md`) tidak dibaca ulang; kebenaran klaim di dalamnya tidak dinilai.
- Folder `apps/web`, kontrak, dan `scripts/reorg-test.py` tidak diperiksa ulang.

---

# LAMPIRAN C: Cek ulang dokumen dan kejujuran klaim (D-1..D-22, R-01..R-16) — sub-agent Sonnet

## Tahap 3 Recheck: Dokumen vs Kode (D-1..D-22) dan Kejujuran Dokumen Baru

Sifat: baca saja. Tanpa jaringan. Repo tidak diubah, tidak ada commit/push/pull.
Repo: `.../avenor/repo`, HEAD `53e1d7e` (27 Nov 2026). Tag `v1.0.0-rc.1` menunjuk `38b1ef2`.
Pembanding: Lampiran C di `GAP_ANALYSIS_Avenor.md` (baseline 25 Nov) dan `BRIEF.md` §15-§17.

Yang saya jalankan sendiri (semua lokal): `python3 scripts/check-test-integrity.py` (hasil: 31 referensi test ada di disk), `cast sig` untuk menghitung selector fungsi, `git log/diff/show` baca saja, `grep`/`wc`. Saya TIDAK menjalankan forge test, npm test, atau skrip yang memanggil RPC.

Label bukti: **kode** = saya baca file:baris; **hitung** = saya hitung dengan grep/wc; **dokumen** = hanya dibandingkan antar dokumen.

---

### 1. Ringkasan jumlah

| Status | Jumlah | ID |
|---|---|---|
| ✅ Diperbaiki | 3 | D-12, D-19, D-20 |
| 🟡 Sebagian | 17 | D-1, D-2, D-3, D-4, D-5, D-6, D-7, D-8, D-9, D-10, D-11, D-13, D-14, D-15, D-17, D-21, D-22 |
| ❌ Belum | 2 | D-16, D-18 |
| ❓ Tidak bisa diverifikasi | 0 | (bagian yang butuh chain ditulis di tiap baris dan di bagian 5) |

Catatan penting: dokumen GAP milik developer (`repo/GAP_ANALYSIS_Avenor.md`) sudah mencentang `[x]` hampir semua tugas (142 `[x]`, 5 `[ ]`), termasuk tugas yang menurut kode/bukti belum selesai (lihat R-01, R-04).

---

### 2. Tabel status D-1 sampai D-22

| ID | Status | Bukti sekarang (file:baris) | Yang masih kurang |
|---|---|---|---|
| D-1 Kunci Safe/keeper dari `makeAddr` | 🟡 | **Kode diperbaiki untuk deploy baru:** `packages/contracts/script/DeployTestnet.s.sol:78-86` (di chain bukan 31337, guardian/keeper/treasury wajib dari env, kalau kosong revert), `:121-137` (3 pemilik governance dari env, harus unik, tidak boleh deployer); `makeAddr` tinggal di cabang 31337 (`:88-98`). Tes: `test/unit/DeployTestnet.t.sol` (1 tes, hanya cek revert di 46630). **Deployment live tidak berubah:** alamat Safe dan keeper di `packages/config/46630.json` dan `46630.stage.json` sama dengan sebelum perbaikan; `docs/TESTNET_EVIDENCE.md:203,218,233,238` masih mencatat pemilik Safe governance = deployer + `0x445be78A…` + `0xAaB2…` (alamat yang pada baseline saya cocokkan dengan hasil `makeAddr`). Keeper masih `0x9c4D…5d75`. | Pemilik Safe dan keeper di testnet belum diganti; tidak ada `getOwners()` baru; tidak ada cek otomatis "pemilik bukan hasil makeAddr"; skrip guardian/treasury non-lokal tidak membuat Safe (hanya terima alamat). Lihat R-04. |
| D-2 Bukti fork vs testnet saling bertentangan | 🟡 | Banner koreksi ada dan tanggal sudah 2026-11-24 (`ACCEPTANCE_EVIDENCE.md:7`, `DRILL_EVIDENCE.md:7`). `RUNBOOK.md:209-220` kini berjudul "FORK LOKAL ANVIL" dan baris D1-D4 "LULUS (fork lokal; testnet belum)". Soak 7 hari diakui harness (`ACCEPTANCE_EVIDENCE.md:126`). | `ARCHITECTURE.md:239` ("menunggu staging") dan `:319` ("⛔ belum") tidak diubah. `ACCEPTANCE_EVIDENCE.md:111-122` (§3.D) masih menulis "Otoritas EOA deployer sepenuhnya dicabut" dan `role_manager()` = timelock tanpa label fork di bagian itu; di testnet nyata `role_manager()` masih deployer (`TESTNET_EVIDENCE.md:~230`). Tidak ada kolom "Lingkungan". |
| D-3 `REMEDIATION.md` rujuk test/fitur tidak ada | 🟡 | Nama file dan fungsi test sudah benar; skrip baru `scripts/check-test-integrity.py` (hanya memeriksa REMEDIATION dan ACCEPTANCE) lolos: 31 referensi ada (hitung). Judul sekarang "Register Internal" (`REMEDIATION.md:1,6`); tidak ada lagi kata "TERTUTUP DENGAN BUKTI REGRESI". `emergency_zero_assets` tidak ditemukan lagi di docs/kode (grep). | **Klaim fitur yang tidak ada tetap ada:** "minimum deposit 10 USDG pada web dan SDK" (`REMEDIATION.md:68,72`); grep di `apps/web/src/lib/deposit.ts`, `deposit.test.ts`, `packages/sdk/src` tidak menemukan batas minimum 10 USDG. "Seeding 1.000 USDG ke dEaD" (`:67`) tapi manifest testnet `seedAssets: 0`. Tabel §1 masih menghitung 11 dari 12 "ditutup". LOW-01 (`:2.11`) masih menyatakan residu deployer tertutup padahal deployer masih `role_manager` di testnet. Lihat R-07. |
| D-4 `TESTNET_EVIDENCE.md` salah nama peran | 🟡 | `TESTNET_EVIDENCE.md:89-94` sekarang cocok dengan `src/interfaces/Roles.sol:14-27`: 3995 = 9 bit tanpa FORCE_REVOKE; 4 = FORCE_REVOKE_MANAGER; 8192 = EMERGENCY_MANAGER; 96 = 32+64; 4096 = DEBT_PURCHASER (saya hitung). "$1.40" sudah hilang. | `:31` masih "100% byte-for-byte match" (BASELINE memakai "setelah mask immutable dan CBOR"). Kolom "Verified" untuk mock USDG/venue tanpa tautan/penjelasan (`:§3`). |
| D-5 Safe 3/5 vs 2/3; stack testnet tak dijelaskan | 🟡 | `ROLE_PERMISSION_MATRIX.md:44-48` kini tabel "Rencana Prod" vs "Testnet 46630"; `ARCHITECTURE.md:144-145` dan `RUNBOOK.md:183` menulis dua topologi; `WEB_APP.md:182-190` menyebut 46630. | `DEPLOYMENT.md` tidak menyebut `DeployTestnet.s.sol`, mock, atau 46630 (grep kosong). `ROLE_PERMISSION_MATRIX.md:79` aturan 4 tetap "Semua Safe = 3/5". Tabel matriks menulis "kunci terverifikasi" untuk Governance Safe testnet (`:46`) padahal salah satu pemilik hasil `makeAddr` (lihat R-04). `SIGNER_POLICY.md:17` menulis Treasury "2-of-2" sedangkan semua dokumen lain bilang 2/3. |
| D-6 `AUDIT_SCOPE.md` tidak cocok kode | 🟡 | Versi Solidity sekarang 0.8.18 (`pragma` di `MorphoVaultStrategy.sol:2`, `DepositCapHook.sol:2` cocok). `DeployTestnet.s.sol` dimasukkan ke lingkup (`:§2.1`). Status reviewer: "independen, belum ada". | Kolom "Baris (SLOC)" sebenarnya jumlah baris fisik (`wc -l`: 343, 256, 1233, 175, 63 = 2070), bukan SLOC; baris kode tanpa komentar/kosong: 101, 147, 858, 146, 33 (hitung). `IMorphoVaultV2.sol` ada di pohon "in-scope" tapi tidak di tabel/jumlah. §4.3 menyuruh memverifikasi `ReentrancyGuardUpgradeable` di hook, padahal `DepositCapHook.sol` tidak punya (grep). §4.2 "fee ke Timelock/Treasury": penerima fee adalah Treasury Safe (`46630.stage.json feeConfig.feeRecipient`). `:79` dan §3.5 mengulang minimum deposit 10 USDG yang tidak ada. |
| D-7 "Batas keras" fee | 🟡 | `FEE_CONFIG.md:70-81` kini memisahkan "Batas Keras Kontrak" (50% dan 2%) dari "Batas Kebijakan Avenor" (20%/0%). Judul bagian dan "tiga lapis" di FEE_CONFIG sudah "Empat komponen" (`:40`). | `feeManager` di testnet tetap deployer EOA: `46630.stage.json feeConfig.feeManager = 0x56d8…8648`; `Deploy.s.sol:769` memang menetapkan feeManager = actor untuk mode non-prod. Tidak ada tx pemindahan ke Safe. Tugas GAP "pindahkan feeManager" dicentang `[x]` dengan bukti "`SIGNER_POLICY.md §3` dan `Deploy.s.sol`" (`GAP:356-357`); §3 SIGNER_POLICY membahas timelock, bukan feeManager. |
| D-8 `management` strategi tanpa timelock | 🟡 | `ROLE_PERMISSION_MATRIX.md:61` sekarang menulis "`management` = Timelock / Safe". Strategi testnet `strategyManagement` = Governance Safe (`46630.stage.json`), diterima di tx `0xb887…f19b` (`TESTNET_EVIDENCE.md:§4.3, S8`). | Tidak ada keputusan tertulis mana yang berlaku di testnet dan risikonya (Safe 2/3 tanpa jeda 48 jam). `SecuritySection.tsx:15` tetap bilang perubahan administratif lewat timelock. `DEPLOYMENT.md:93` default `MANAGEMENT_ADDRESS` = timelock, bertentangan dengan testnet. |
| D-9 Matriks peran vs runbook | 🟡 | `3999` sudah tidak ada (grep docs kosong). Matriks menandai `TimelockExecutor` dan `DebtAllocator` "tidak dipakai" (`:50`). `RUNBOOK.md:23` kini: shutdown oleh Safe guardian. | `RUNBOOK.md:196` (bagian J) masih: "Governance Timelock memanggil `vault.shutdown_vault()`", padahal timelock = 3995 tidak memuat EMERGENCY_MANAGER (8192) dan baris `:23` sendiri menyebut guardian. `SIGNER_POLICY.md:§4` menempatkan DEBT_MANAGER di Timelock, REVOKE_STRATEGY di Guardian, FORCE_REVOKE di Timelock: semuanya salah terhadap `46630.stage.json roleMatrix` (lihat R-08). |
| D-10 Runbook/monitor kurang dari brief §13 | 🟡 | `RUNBOOK.md` kini ada bagian A-J (10 bagian): missed report (E), keeper crash (F), RPC (G), likuiditas (D), valuasi (H), kunci bocor (I), pause/shutdown (A,B), user exit (J). | Tidak ada: stablecoin depeg (kata "depeg" hanya muncul sebagai peringatan di `:160`), emergency recall. Kode alert di judul E-J (`report-stale`, `keeper-crash`, `keeper-heartbeat`, `rpc-lag`, `rpc-outage`, `valuation-drift`, `key-compromise`, `orderly-shutdown`) **tidak ada** di `services/*/src` (grep kosong); `monitor.ts` hanya punya `vault-shutdown`, `vault-paused`, `deposits-closed`, `no-withdrawal-capacity`, `total-assets-moved`, `deposit-limit-changed`, `fee-config-changed` (`monitor.ts:66-98`). Tautan alert `baseUrl#kode` (`monitor.ts:62`) tidak cocok dengan slug judul "A. `vault-paused` — …". Tidak ada deteksi report-stale di keeper (grep "stale" kosong). Lihat R-05. |
| D-11 Klaim keeper/indexer tak ada di kode | 🟡 | Cek `eth_chainId` ditambahkan di indexer (`services/indexer/src/rpc.ts:146,188`). Keeper punya fallback RPC (`config.ts:48`, `main.ts:46-47`). | `maxRatio`/`targetRatio`/konsentrasi 80%/5% masih diklaim (`VENUE_INTEGRATIONS.md:14`, `ARCHITECTURE.md:104`, `MANDATE_ESTIMATES.md` gate G6) dan tidak ada di kode (grep `services`, `packages/sdk/src`, `contracts/src`: kosong). Alarm kas idle 25%/24 jam (`ARCHITECTURE.md:106`) tidak ada. Keeper dan SDK tidak memeriksa chain ID (grep). File `rpcFailover.ts` yang disebut `FINAL_DELIVERY_REPORT.md` Sprint 5 tidak ada (find). |
| D-12 BASELINE §7 | ✅ | `BASELINE.md:115` kini cocok dengan `MorphoVaultStrategy.sol:266-270` (0 dari venue dilaporkan `type(uint256).max`). Status "belum ada deployment" diganti (`BASELINE.md:3`); "(belum dibuat)" di SECURITY_DIFF hilang (grep). | - |
| D-13 `RISK_DISCLOSURE.md` | 🟡 | Ditambah: fee 0%/10% (`:88-90`), keeper (`:79-80`), mockUSDG/MockMorphoVault testnet (`:97-98`). | `:48` masih menulis "alokasi debt … memerlukan proposal publik 48 jam" (salah: `update_debt` dipegang keeper, bit 96, tanpa delay). `:16` tetap pakai kata "instan" (dengan syarat). `apps/web/app/docs/page.tsx` tidak memuat isi RISK_DISCLOSURE (hanya Architecture, Fee, Role, Known Limitations, Operational References). |
| D-14 Teks web vs dokumen | 🟡 | `SecuritySection.tsx:39` sekarang "6 decimals for USDG and vault shares". Link "Terms & Risk Disclosures" sudah tidak ada (grep). `transparency/page.tsx:16-17` diperbarui ke testnet 46630. | "Protocol Guarantees" tetap judul di `app/vaults/[address]/deposit/page.tsx:218`. Halaman `/docs` baru berisi pernyataan salah ("Fork-only deployment: all contract addresses are fork addresses", "indexer tidak punya tabel Deposit/Withdraw", `app/docs/page.tsx:~125-150`), dan transparency kini berlebihan ("Live & Verified · Mainnet 4663 Ready", lihat R-14). |
| D-15 Dokumen yang diminta §17 | 🟡 | Ada: `SIGNER_POLICY.md`, `BACKUP_RECOVERY.md`, `KNOWN_LIMITATIONS.md`, `MANDATE_ESTIMATES.md`. Verifikasi source: `DEPLOYMENT.md:182` jujur "prod tidak memverifikasi source". | Isi keempat dokumen punya kesalahan terhadap kode (R-08, R-09, R-10, R-15). Halaman product docs ada (`/docs`) tapi tidak memuat risk disclosure dan memuat kesalahan. Tautan verifikasi source per alamat testnet: tidak ada. |
| D-16 Nomor baris `VaultV3.vy` | ❌ | - | `ACCOUNTING.md:69` masih `:1069` = `_process_report`, `SECURITY_DIFF.md:40` masih `:1069` = `_update_debt`. `ROLE_PERMISSION_MATRIX.md:15` `set_auto_allocate :1438` vs `SECURITY_DIFF.md:51` `:1429`. `BASELINE.md:97` mengaku "penomoran baris disinkronkan dengan source kanonik `referensi/yearn-vaults-v3/...`" tetapi folder itu tidak ada di repo (`ls referensi`: docs.yearn.fi, eips, kassora.org, yearn.fi; find `VaultV3.vy` kosong). Tidak bisa diverifikasi, dan klaim sinkron tidak didukung. |
| D-17 Angka test basi; kerapian | 🟡 | FEE_CONFIG "Empat komponen" dan hanya satu "## 7" (`FEE_CONFIG.md:40,121`). | `ACCOUNTING.md:50` masih "tiga lapis". `DEPLOYMENT.md:134` masih `4663.<mode>.json`. Angka test tidak konsisten antar dokumen: README:64 "115", TESTNET_EVIDENCE S9 "112 unit / 104 web", FINAL/ACCEPTANCE/REMEDIATION "124 + 122 = 320". Hitungan saya di disk: 143 fungsi `test*`/`invariant*` di 21 file `.t.sol` (FINAL bilang 18 suite, 124 tes). Lihat R-06. |
| D-18 Dead shares dan hook di testnet | ❌ | - | `46630.stage.json`: `seedAssets: 0`, `pendingActions` masih "seed dead shares once treasury is funded". `Deploy.s.sol` tidak menyebut hook (grep "hook" kosong). Tidak ada alamat `DepositCapHook` di `46630.json`/`46630.stage.json`. Tidak ada dokumen yang menulis "belum diterapkan di testnet"; sebaliknya `FINAL_DELIVERY_REPORT.md:138` mencantumkan alamat hook `0xD6c8…93C3` yang tidak ada di file mana pun selain laporan itu (grep). Lihat R-03. |
| D-19 Link `file:///c:/laragon` | ✅ | grep `file:///c:` di `docs`, `README.md`, `AGENTS.md`: kosong. | - |
| D-20 `NOTICE` | ✅ | `NOTICE:25-28` kini memuat butir 5 "Yearn Vault Periphery" (Accountant.sol commit 672de1c, IVault.sol commit f449264, AGPL-3.0). | Keputusan penawaran source AGPL tidak saya cari ulang. |
| D-21 Metadata `46630.json` | 🟡 | `46630.stage.json` kini punya `recordedOn: "chain"`, `gitRev`, `l1BlockNumber`/`l2BlockNumber`/`blockNote`, `placeholdersUsed: false`. | `46630.json _meta.observed_at.blockNumber` 157460667 tetap lebih awal dari blok deploy 157503812 di file yang sama; catatan "probed live at block …" belum dipisah dari data baru. Catatan: `deployment.blockNumber` di stage.json = 12207721 (blok L1) sedangkan dokumen memakai 157503812 (L2); sudah dijelaskan di `blockNote`, tapi field `blockNumber` tetap berbeda dengan `46630.json deployments.stage.blockNumber`. |
| D-22 Batas minimum shares deposit | 🟡 | SDK: `packages/sdk/src/writes.ts:50-56,105-106` (`minShares`, `SlippageExceededError` jika hasil simulasi < batas). Web: `apps/web/src/lib/deposit.ts:141-184` (minShares 50 bps), `:235` TTL kuotasi `quote_expired`, `:272-298`. Tes: `deposit.test.ts:259`. | Perlindungan hanya di sisi klien (simulasi dan pengecekan setelah receipt, `:295-298` tidak bisa membatalkan transaksi yang sudah masuk). Tidak ada perlindungan onchain/router. Keputusan tidak ditulis di `ARCHITECTURE.md` (grep `minShares` di ARCHITECTURE dan WEB_APP kosong). |

---

### 3. Tabel kepatuhan brief §17 (diperbarui)

Legenda: ✅ ada dan cocok dengan kode; 🟡 ada tapi ada celah/ketidakcocokan; ❌ belum ada.

| # | Deliverable | Status | Bukti dan catatan |
|---|---|---|---|
| 1 | Source frontend, contracts, indexer, keeper, scripts + lockfile | 🟡 | Semua ada (`apps/web`, `packages/contracts`, `services/indexer`, `services/keeper`, `scripts/*.py`). `package-lock.json` hanya di `apps/web`, `services/keeper`, `services/indexer`, `packages/sdk` (find); tidak ada lockfile Python. Tidak ada `apps/admin`/`infra/` (ada `docker-compose.prod.yml`). Skrip baru yang bermasalah: `execute-handover.py` (R-02), `testnet-lifecycle-drill.py` (hanya forge lokal, R-01), `await-handover-maturity.py` (opsi `--auto-execute` hanya ada di docstring). `check-handover.py` selector benar (saya cocokkan dengan `cast sig`), tapi toleransi delay 171.000 detik (`:109`) lebih longgar dari 48 jam dan tidak memeriksa `getOwners()`. |
| 2 | `BASELINE.md`, `REFERENCE_CAPTURE.md` | 🟡 | BASELINE kini konsisten dengan kode (D-12). Klaim "100% bytecode cocok" di FINAL/AUDIT_SUBMISSION lebih kuat dari BASELINE ("setelah mask immutable dan CBOR"). `REFERENCE_CAPTURE.md:17` masih bilang tidak ada screenshot (screenshot di `docs/evidence/testnet-web/` adalah milik web Avenor, bukan capture referensi). |
| 3 | `ARCHITECTURE.md`, `ACCOUNTING.md`, `WITHDRAWAL_SEMANTICS.md`, role matrix | 🟡 | Ada. Ketidakcocokan tersisa: `ARCHITECTURE.md:239,319`, "tiga lapis" `ACCOUNTING.md:50`, `:1069` (D-16), matriks vs SIGNER_POLICY. |
| 4 | `VENUE_INTEGRATIONS.md` | 🟡 | Ada, satu venue; di testnet venue = mock (`46630.json venues.steakUSDG.kind = MockMorphoVault`). Gate G6 (konsentrasi) tidak ada di kode. `MANDATE_ESTIMATES.md` menulis alamat steakUSDG `0xb75D…` sedangkan semua dokumen lain `0xBeEff033…409dd` (R-15). |
| 5 | `FEE_CONFIG.md`, timelock policy, manifest, ABI, verifikasi source, owner addresses | 🟡 | FEE_CONFIG diperbaiki. Manifest ada dan `recordedOn` terisi. `SIGNER_POLICY.md` ada tapi salah di beberapa tempat (R-08). Timelock policy: tidak ada dokumen terpisah. Verifikasi source: belum (diakui `DEPLOYMENT.md:182`). Owner addresses: pemilik Safe ketiga Safe tidak tercatat lengkap; `TESTNET_EVIDENCE` hanya mencatat dua pemilik Governance Safe. |
| 6 | Test report, temuan + perbaikan, known limitations | 🟡 | `REMEDIATION.md` diperbaiki (judul, nama test) tapi mengulang fitur yang tidak ada (R-07). `KNOWN_LIMITATIONS.md` ada tapi berisi pernyataan yang bertentangan dengan kode (R-10). Tidak ada laporan test tersendiri; angka test berbeda antar dokumen (R-06). |
| 7 | Runbook, monitoring, signer policy, backup/recovery | 🟡 | RUNBOOK diperluas (A-J), tapi kode alert E-J tidak ada di monitor (R-05). `SIGNER_POLICY.md` dan `BACKUP_RECOVERY.md` ada tapi memuat kesalahan peran (R-08, R-09). Tidak ada konfigurasi dashboard monitoring. |
| 8 | `ACCEPTANCE_EVIDENCE.md` (chain, tx hash, jumlah, blok, explorer, live/simulated) | 🟡 | Dokumen jujur bahwa hash lama adalah fork lokal. Satu-satunya tx nyata di testnet adalah deploy (26 tx), `acceptManagement`, dan `timelock.schedule` (`TESTNET_EVIDENCE.md`). Tidak ada satu pun tx deposit/withdraw/report/pause di testnet 46630 (`TESTNET_EVIDENCE.md` S9: `totalAssets 0`, `totalSupply 0`). `LIFECYCLE_EVIDENCE.md` tidak berisi hash. Tidak ada link explorer per tx. Eksekusi handover (role_manager ke timelock) belum terjadi: operasi baru matang `2026-11-28T02:09:09Z` (timestamp 1795831749, saya hitung). |
| 9 | Product docs sesuai implementasi; share token dipisah | 🟡 | Rute `/docs` sekarang ada (`apps/web/app/docs/page.tsx`), tapi memuat klaim yang salah (fork-only, tabel Deposit/Withdraw belum ada, rujukan `packages/sdk/src/reads.ts` yang tidak ada). Risk disclosure belum tampil di web. |
| 10 | Estimasi scope/biaya mandat lanjutan + dependency | 🟡 | `MANDATE_ESTIMATES.md` ada dengan matriks dependency dan estimasi orang-minggu. Klaim ekosistem ("Aave/Fluid/Pendle/perp DEX belum ada di 4663") tidak punya sumber/tanggal pengecekan di dokumen; saya tidak bisa memeriksa (tanpa jaringan). Mandat 1 ditulis "Complete" dan "Ready for Mainnet" padahal testnet memakai mock venue dan mock USDG. |

Ringkas: ✅ 0, 🟡 10, ❌ 0. (Baseline 25 Nov: ✅ 1, 🟡 7, ❌ 2.) Deliverable #9 dan #10 yang tadinya ❌ kini berwujud, dan #1 turun dari ✅ ke 🟡 karena skrip baru bermasalah; tidak ada yang bersih.

Brief §7-§9 tambahan (dari tabel baseline): batas stale report dan aturan stale accounting (§7.4, §8.1): masih tidak ada di `monitor.ts`/keeper (grep "stale" kosong). Konsentrasi per venue (§8.1): tidak ada di kode. Pending governance old/new/executable time (§8.2): `services/indexer/src/api.ts` tidak punya endpoint operasi governance (grep "operations" kosong); halaman `/operator` baru tidak saya telusuri isinya.

---

### 4. Klaim berlebihan atau tidak didukung (R-xx)

Format besar: 5 bagian (Masalah, Bukti, Kenapa penting, Cara memperbaiki, Setelah diperbaiki). Format kecil: satu paragraf.

#### R-01. "Testnet lifecycle drill" hanya menjalankan forge test lokal, dan dipakai menutup tugas yang butuh transaksi testnet · BESAR

**Masalah.** `LIFECYCLE_EVIDENCE.md` dan `scripts/testnet-lifecycle-drill.py` dipresentasikan sebagai bukti drill testnet 46630 yang menutup AV-3 ("Lifecycle normal dengan tx hash", dicentang `[x]` di `GAP_ANALYSIS_Avenor.md:375-385`). Skripnya tidak mengirim satu pun transaksi.

**Bukti.**
- `scripts/testnet-lifecycle-drill.py:46-60`: hanya `subprocess.run([forge, "test", "--root", "packages/contracts", "--match-contract", "LifecycleDrillTest", "-vv"])`, lalu mencari string `[PASS] test_...` di stdout. Tidak ada RPC, kunci, atau `cast send`.
- `packages/contracts/test/unit/LifecycleDrill.t.sol`: memakai `MockERC20`, `MockVenue`, `MockYearnFactory`, `vm.etch(TS_IMPL, ...)` (`:55`) dan `makeAddr`; tidak ada `createSelectFork`. Semua in-memory.
- `LIFECYCLE_EVIDENCE.md`: tidak ada satu pun tx hash, blok, atau alamat testnet; kata "local"/"in-memory" tidak muncul. Judulnya menyebut "(4663 / Testnet 46630)" dan "bukti on-chain".
- `TESTNET_EVIDENCE.md` S9: vault testnet `totalAssets 0`, `totalSupply 0`, `deposit_limit 0` (belum pernah ada deposit).
- Nama test dan skenario DRILL-1..5 memang ada di file (saya cek `grep "function test"`), jadi yang salah adalah pelabelan, bukan keberadaan test.

**Kenapa penting.** Brief §15/§16.E meminta drill akses/pause/illiquidity di testnet dan §17.8 meminta tx hash. Pembaca akan mengira ada tx nyata.

**Cara memperbaiki.** (1) Beri label "simulasi forge lokal, bukan transaksi testnet" di judul dan bagian 1 LIFECYCLE_EVIDENCE dan di docstring skrip; ganti nama skrip (mis. `local-lifecycle-drill.py`). (2) Kembalikan centang GAP lifecycle (`:375-385`) ke `[ ]`. (3) Jalankan lifecycle sungguhan di 46630 (mint mockUSDG, deposit, `update_debt`, report, withdraw, redeem, pause, freeze) dan catat hash.

**Bedanya setelah diperbaiki.** Satu kata "testnet" berarti ada hash di explorer; hasil simulasi tidak lagi menutup tugas yang butuh transaksi.

#### R-02. `execute-handover.py` memakai selector dan salt yang salah, mode `--execute` hanya stub, dan runbook bergantung padanya · BESAR

**Masalah.** Skrip yang diklaim "handover execution engine" menghasilkan calldata Safe yang tidak akan berhasil, dan tidak pernah mengirim transaksi.

**Bukti (selector dihitung dengan `cast sig`, lokal).**
- `scripts/execute-handover.py:46`: `SEL_EXECUTE = "0x2e1a7d4d"` dengan komentar `execute(address,uint256,bytes,bytes32,bytes32)`. `cast sig "execute(address,uint256,bytes,bytes32,bytes32)"` = `0x134008d3`; `0x2e1a7d4d` = `withdraw(uint256)`.
- `:45`: `SEL_ACCEPT_ROLE_MANAGER = "0x32356507"`; `cast sig "accept_role_manager()"` = `0xf776bf1f`, yang juga tercatat di `docs/TESTNET_GOVERNANCE_HANDOFF.json` dan `TESTNET_EVIDENCE.md:§6.2`.
- `:245,286`: salt = 32 byte nol, padahal operasi yang dijadwalkan memakai `salt = 1` (`TESTNET_GOVERNANCE_HANDOFF.json step2_timelockSchedule.salt` = `0x…01`; `TESTNET_EVIDENCE.md` "Salt = 1"; `scripts/governance_execute_46630.py:11` "salt=1").
- `_bmad-output/safe-handover-execution.json` (ter-commit): `data` dimulai `0x2e1a7d4d…`, inner `data: 0x32356507`, `salt` nol. Jika dimuat di Safe Transaction Builder (langkah 3 `MAINNET_GO_LIVE_RUNBOOK.md` Fase 1), transaksi memanggil fungsi yang tidak ada di timelock.
- `:300-307`: `if args.execute:` hanya mencetak "Executing handover via broadcaster..." dan "Ready to broadcast transaction." Komentar "Broadcaster logic goes here". Tidak ada kirim transaksi.
- `scripts/await-handover-maturity.py:12`: docstring menyebut `--auto-execute` dan `BROADCASTER_PRIVATE_KEY`; `argparse` hanya punya `--config --poll --interval --check-only` (grep `auto-execute` hanya di docstring).
- Jalur yang benar sudah ada sejak sebelumnya: `scripts/governance_execute_46630.py` (salt 1).

**Kenapa penting.** Handover `role_manager` ke timelock adalah satu-satunya langkah yang menutup AV-1 dan jatuh tempo `2026-11-28T02:09:09Z`. Operator yang mengikuti `MAINNET_GO_LIVE_RUNBOOK.md` Fase 1 akan gagal atau, bila ada Safe yang menerima calldata aneh, membuang slot nonce.

**Cara memperbaiki.** Ganti selector (`0x134008d3`, `0xf776bf1f`), salt `…01`, hitung ulang operation id di skrip dan bandingkan dengan `timelockOperationId`; regenerasi `safe-handover-execution.json`; tambahkan tes kecil yang membandingkan selector dengan ABI; hapus atau implementasikan `--execute`/`--auto-execute`; di runbook arahkan ke `governance_execute_46630.py` sampai ini beres.

**Bedanya setelah diperbaiki.** Calldata yang diekspor sama dengan operasi yang dijadwalkan; tidak ada opsi yang berpura-pura mengirim.

#### R-03. `FINAL_DELIVERY_REPORT.md` §4.2 memuat enam alamat yang bertentangan dengan manifest testnet · BESAR

**Masalah.** Bagian "Topologi Kontrak On-Chain (Testnet Staging 46630)" mencantumkan alamat yang bukan milik deployment yang tercatat.

**Bukti** (bandingkan `FINAL_DELIVERY_REPORT.md:132-142` dengan `packages/config/46630.json` dan `46630.stage.json`; grep seluruh repo):

| Komponen | Di FINAL | Di manifest/config | Ada di tempat lain? |
|---|---|---|---|
| Accountant | `0x6aBE…a787` | `0xA499…8e32` | tidak |
| DepositCapHook | `0xD6c8…93C3` | tidak ada di manifest | tidak |
| Emergency Timelock | `0xa575…C6c2` | `0xde3f…D4b6` | tidak |
| Guardian Safe | `0x9183…2FEA` | `0x8322…5af1` | hanya `.env.production.example:23` |
| Treasury Safe | `0x3841…9aFf` | `0x8AA6…e58` | hanya `.env.production.example:24` |
| Keeper | `0x1535…D9b1` | `0x9c4D…5d75` | tidak |

Hanya Vault, Strategy, Timelock 48 jam, dan Governance Safe yang cocok. `.env.production.example` (ter-commit di `4ca09db`) memuat `GUARDIAN_SAFE` dan `TREASURY_SAFE` yang sama dengan FINAL, tapi berbeda dari config 46630.

**Kenapa penting.** Pembaca yang menyalin alamat dari laporan final akan memeriksa kontrak yang bukan bagian dari deployment (atau tidak ada). Brief §17.5 meminta manifest dan owner address yang benar.

**Cara memperbaiki.** Buat tabel topologi dari `46630.stage.json` dengan skrip (bukan ketik tangan); hapus baris DepositCapHook sampai benar-benar dideploy; samakan `.env.production.example`.

**Bedanya setelah diperbaiki.** Semua alamat dalam laporan dapat dicocokkan mesin dengan manifest.

#### R-04. Perbaikan D-1 diklaim selesai, padahal Safe dan keeper live tidak berubah, dan beberapa dokumen menyebut kunci "terverifikasi/terpisah" · BESAR

**Masalah.** Kode deploy sudah fail-closed, tetapi (a) tidak ada rotasi pemilik Safe/keeper di testnet, (b) dokumen mengaku sebaliknya atau tidak konsisten dengan skrip.

**Bukti.**
- `packages/config/46630.json` dan `46630.stage.json`: alamat `governanceSafe 0x24e9…4AA`, `guardianSafe 0x8322…5af1`, `treasurySafe 0x8AA6…e58`, `keeper 0x9c4D…5d75` sama dengan sebelum perbaikan (`git diff 146a6e0 HEAD` pada dua file itu hanya menambah `governanceHandoff`, `gitRev`, `recordedOn`, `l1/l2BlockNumber`).
- `TESTNET_EVIDENCE.md:203,218,233,238` (S8, 26 Nov): penandatangan Governance Safe = deployer + `0x445be78A…`; pemilik = `0x56d8…, 0x445b…, 0xAaB2…`. Pada baseline 25 Nov alamat 0x445b… dan 0xAaB2… saya cocokkan sebagai hasil `makeAddr`. Kesimpulan tetap: kunci kedua dipegang pihak yang bisa menghitungnya. (Saya tidak membaca `getOwners()` ulang; tanpa jaringan.)
- `ROLE_PERMISSION_MATRIX.md:46-48` menulis Governance Safe testnet "kunci terverifikasi", Guardian dan Treasury "kunci terpisah". Tidak ada bukti `getOwners()` Guardian/Treasury di dokumen mana pun.
- GAP developer `:599` mencentang `[x]` "ganti semua kunci dan pemilik Safe dari makeAddr"; `:354` `[x]` "catat siapa pemegang tiap pemilik Safe (testnet)" dengan bukti hanya `SIGNER_POLICY.md` (yang berisi nama variabel env, bukan alamat).
- Nama env tidak cocok: `SIGNER_POLICY.md:86-88` dan `REMEDIATION.md:4.1` menyebut `SAFE_GOVERNANCE_OWNERS`/`SAFE_GUARDIAN_OWNERS`/`SAFE_TREASURY_OWNERS`; skrip membaca `GOVERNANCE_OWNER_1/2/3` (`DeployTestnet.s.sol:121-124`) dan, di chain non-lokal, hanya `GUARDIAN_ADDRESS`/`TREASURY_ADDRESS` sebagai alamat tunggal (tidak membuat Safe guardian/treasury).
- `check-handover.py` tidak memeriksa pemilik Safe.

**Kenapa penting.** Governance Safe 2/3 yang salah satu pemiliknya bisa dihitung publik tetap bisa dikuasai dengan satu kunci lain (deployer). Dokumen menyebutnya "terverifikasi".

**Cara memperbaiki.** Rotasi pemilik (`swapOwner`) dan keeper di testnet dengan kunci nyata atau deploy ulang; catat `getOwners()` ketiga Safe; ubah dokumen ke nama env yang benar; kembalikan centang `[x]` GAP ke `[ ]` sampai ada bukti; tambah pengecekan pemilik di `check-handover.py`.

**Bedanya setelah diperbaiki.** Tidak ada pemilik/keeper yang bisa dihitung dari teks repo, dan ada bukti yang bisa dicek.

#### R-05. RUNBOOK dan laporan akhir: "7 skenario terhubung kode alert keeper monitor" tidak didukung · BESAR

**Masalah.** Bagian E-J RUNBOOK diberi judul berupa kode alert, dan laporan akhir menyatakannya terhubung ke monitor. Kode tersebut tidak ada.

**Bukti.**
- `FINAL_DELIVERY_REPORT.md` baris Deliverable #9, Sprint 7, dan `AUDIT_SCOPE.md:§5`: "7 skenario insiden terhubung kode alert keeper monitor".
- `RUNBOOK.md:103-192` judul: `report-stale`, `keeper-crash`/`keeper-heartbeat`, `rpc-lag`/`rpc-outage`, `valuation-drift`, `key-compromise`, `orderly-shutdown`. `grep` ke `services/*/src` untuk semua string itu: tidak ada hasil.
- `services/keeper/src/monitor.ts:66-98` hanya mengeluarkan 7 kode (`vault-shutdown`, `vault-paused`, `deposits-closed`, `no-withdrawal-capacity`, `total-assets-moved`, `deposit-limit-changed`, `fee-config-changed`).
- URL alert dibuat `${runbookBaseUrl}#${code}` (`monitor.ts:62`); judul markdown "## A. `vault-paused` — penarikan berhenti" tidak menghasilkan anchor `#vault-paused`.
- Keeper tidak punya deteksi laporan terlambat (grep `stale|heartbeat|lastReport` di `services/keeper/src`: kosong); bagian E bergantung pada sinyal itu.
- `RUNBOOK.md:196` (J): "Governance Timelock memanggil `vault.shutdown_vault()`", bertentangan dengan `:23` dan dengan bitmask (timelock 3995 tanpa bit 8192).

**Kenapa penting.** Operator mencari prosedur dari kode alert yang tidak pernah muncul; kegagalan diam (report terlambat, keeper mati) tidak punya alarm sama sekali.

**Cara memperbaiki.** Bangun kode alert yang disebut (atau hapus dari judul dan tulis "belum ada alarm"), beri anchor eksplisit, perbaiki bagian J ke Guardian Safe, tambah skenario depeg dan emergency recall.

**Bedanya setelah diperbaiki.** Setiap alert yang benar-benar terbit punya langkah; setiap langkah menunjuk pemegang peran yang benar.

#### R-06. Klaim "320/320 lolos" dan blok "VERIFICATION GATE REPORT" tidak dihasilkan oleh alat

- Rincian 320 = 124 Foundry + 12 SDK + 38 indexer + 24 keeper + 122 web. Hitungan grep saya cocok untuk empat terakhir (SDK 12, indexer 38, keeper 24, web 122 dari pola `it(`/`test(`) = 196. Foundry: 143 fungsi `test*`/`invariant*` di 21 file `.t.sol` (termasuk 11 fork dan 8 invariant), bukan 124 di 18 suite. Mungkin ada yang dikecualikan atau dilewati; tidak bisa dipastikan tanpa menjalankan forge. Status: angka Foundry tidak didukung hitungan saya; hasil lulus tidak saya jalankan.
- `FINAL_DELIVERY_REPORT.md:§5` menampilkan blok seperti keluaran skrip ("AVENOR VERIFICATION GATE REPORT ... OVERALL STATUS: ✅ ALL 320 MONOREPO TESTS PASSED — SYSTEM FULLY AUDIT-READY"). grep string itu di `scripts/` dan `.github/` kosong; `verify-all.py` tidak memanggil `check-handover.py` atau drill (hanya `check-test-integrity.py` baris 137). Blok itu ditulis tangan.
- Baris "[PASS] Governance Handover: Deposit limit 0, management govSafe, timelock 48h verified": `role_manager` vault masih deployer (`46630.json`, `TESTNET_EVIDENCE.md` S9; handover pending sampai 2026-11-28T02:09:09Z). `check-handover.py` tanpa `--strict` menganggap pending sebagai lolos.
- Frasa "audit-ready"/"FULLY AUDIT-READY" muncul di judul REMEDIATION, FINAL, dan AUDIT_SUBMISSION. Maksudnya "siap diaudit", tapi tidak ada reviewer independen dan beberapa temuan di dokumen ini masih terbuka.
- Angka test antar dokumen: README:64 "115", `TESTNET_EVIDENCE.md` S9 "112 unit/104 web", ACCEPTANCE/REMEDIATION "124/122/119". Tidak ada satu log lari yang menjadi sumber.

#### R-07. Fitur yang tidak ada di kode masih diklaim ada (minimum deposit 10 USDG, seed 1.000 USDG)

- `REMEDIATION.md:67-72` (HIGH-01), `ARCHITECTURE.md:127` (ADR-7), `AUDIT_SCOPE.md:79`, `WEB_DEPLOYMENT_GUIDE.md:60` (UAT-2: "input di bawah 10 USDG ... menonaktifkan tombol submit"): grep `10_000_000n`, `minimum`, `MIN_DEPOSIT` di `apps/web/src/lib/deposit.ts`, `apps/web/test/deposit.test.ts`, `packages/sdk/src`: tidak ada batas 10 USDG. `deposit.test.ts` yang dirujuk hanya menguji `minShares` dan kuotasi kedaluwarsa.
- "Skrip deploy melakukan seeding otomatis 1.000 USDG ke 0xdEaD" (`REMEDIATION.md:67`, `AUDIT_SCOPE.md:79`, `MAINNET_GO_LIVE_RUNBOOK.md` langkah 3): `Deploy.s.sol:156,1053` seed default 0 (`SEED_ASSETS` env), dan test memakai 10e6 (`DeployScript.t.sol:256`), bukan 1.000 USDG. `46630.stage.json seedAssets: 0`.
- Dampak: perlindungan inflasi share yang dijanjikan dokumen tidak ada di testnet dan batas minimum tidak ada sama sekali.

#### R-08. `SIGNER_POLICY.md` salah soal delay, peran, dan struktur Safe

- `:34`: "deployed timelock has `minDelay = 171,081 s ≈ 47.5 h`; satisfies ≥ 48 h within tolerance". Salah: 171.081 detik adalah sisa waktu operasi saat pengukuran (`TESTNET_EVIDENCE.md:~245`), sedangkan `getMinDelay()` = 172.800 (`TESTNET_EVIDENCE.md` §3 dan S8). 171.081 < 172.800, jadi "memenuhi" tidak benar. `check-handover.py:109-110` mengikuti salah paham itu ("tolerance of 171,000s allowed").
- `:§4` tabel peran: DEBT_MANAGER → Timelock (sebenarnya keeper, bit 96); REVOKE_STRATEGY_MANAGER → Guardian (sebenarnya timelock 3995 memuat bit 2; guardian hanya 8192); FORCE_REVOKE → "TimelockController" (sebenarnya Emergency Timelock, bit 4); MAX_DEBT, MINIMUM_IDLE, WITHDRAW_LIMIT tidak dicantumkan. Bandingkan `46630.stage.json roleMatrix`.
- `:§6`: "Keeper holds only REPORTING_MANAGER"; manifest: 96 = REPORTING + DEBT_MANAGER. "Guardian Safe can revoke REPORTING_MANAGER via the bounded fast lane": Guardian hanya memegang 8192 dan tidak punya `set_role` (hanya `role_manager` yang punya).
- `:17` Treasury Safe 2-of-2 vs 2/3 di dokumen lain; `:20-23` nama env (lihat R-04).
- `:2` status "fork-only staging", padahal ada deployment testnet.

#### R-09. `BACKUP_RECOVERY.md` menggambarkan wewenang yang tidak dimiliki Guardian

- `§2c`: "Guardian Safe: call `vault.set_role(compromisedKeeper, 0)` ... Fast lane — executes immediately." `set_role` hanya bisa dipanggil `role_manager` (saat ini deployer; setelah handover, timelock 48 jam). Guardian punya 8192 saja (`46630.stage.json roleMatrix`, `Roles.sol:27`).
- `§2d` langkah 2: "Guardian can grant REPORTING_MANAGER to a temporary keeper": sama, tidak mungkin.
- `§1`: Treasury Safe 2 perangkat, Keeper "hardware wallet or HSM" dengan seed phrase; keeper nyata memakai hot key di env (`KEEPER_PRIVATE_KEY`).
- Status "fork-only staging" dan keluaran "Refer to BASELINE fork endpoints" mengabaikan testnet.
- Dampak: prosedur pemulihan kunci keeper tidak bisa dijalankan sesuai tertulis.

#### R-10. `KNOWN_LIMITATIONS.md` dan halaman `/docs` memuat pernyataan yang dibantah kode

- L-4 dan `app/docs/page.tsx` ("Fork-only deployment ... all contract addresses are fork addresses ... No deployment exists"): ada deployment di testnet 46630 (manifest).
- L-8 dan `/docs` ("indexer belum punya tabel Deposit/Withdraw, S-20 ditunda"): `services/indexer/migrations/0003_deposits_withdrawals.sql` ada, dan `FINAL_DELIVERY_REPORT.md` Sprint 3 mengklaimnya selesai. Dua dokumen bertentangan.
- L-6: "fast lane includes REVOKE_STRATEGY_MANAGER, REPORTING_MANAGER, EMERGENCY_MANAGER": jalur cepat nyata = `FORCE_REVOKE` lewat Emergency Timelock 6 jam, dan EMERGENCY_MANAGER langsung; REVOKE_STRATEGY (bit 2) ada di timelock 48 jam; REPORTING di keeper.
- L-10: keeper "holds only REPORTING_MANAGER" dan "Guardian can revoke immediately": salah (R-08).
- L-1/L-2 memakai angka pin 118337511 (mainnet) tanpa menyebut bahwa venue testnet adalah mock.
- `/docs` merujuk `packages/sdk/src/reads.ts` (tidak ada; `ls packages/sdk/src`: abi, amounts, index, previews, vault, writes).
- Tidak ada limitation yang menyebut: handover role_manager belum selesai, feeManager masih deployer, dead shares/hook belum ada di testnet, pemilik Safe predictable.

#### R-11. `WEB_DEPLOYMENT_GUIDE.md` memakai variabel lingkungan dan endpoint yang tidak dibaca web

- `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_FALLBACK_RPCS`, `NEXT_PUBLIC_VAULT_ADDRESS`, `NEXT_PUBLIC_INDEXER_API`: grep di `apps/web/src`, `app`, `next.config.mjs` kosong. Yang dibaca web: `NEXT_PUBLIC_RPC_URL` dan `AVENOR_VAULTS` (`src/config/vaults.ts`, `TESTNET_EVIDENCE.md:§7`).
- `https://indexer.testnet.avenor.fi` dan `https://indexer.avenor.fi`: tidak muncul di kode atau dokumen lain; tidak ada bukti domain itu ada.
- UAT-2 butir 1 (minimum 10 USDG): R-07. UAT-4: "tautan explorer blok yang benar" untuk tiap alamat: tidak saya periksa di web.

#### R-12. Klaim fitur di `FINAL_DELIVERY_REPORT.md` yang tidak ada di kode

- Sprint 5: "`rpcFailover.ts` terdistribusi dengan failover otomatis dan verifikasi chain ID di SDK, Keeper, dan Indexer". File `rpcFailover.ts` tidak ada (find). SDK: tidak ada failover (grep `fallback` kosong). Keeper: ada `fallback([...])` viem (`main.ts:46-47`) tapi tidak ada cek chain ID. Indexer: ada `eth_chainId` di `rpc.ts`.
- Deliverable #5: "SDK ... multi-RPC failover": sama.
- Tahap G "LENGKAP: rehearsal testnet & pengujian lifecycle komprehensif": lihat R-01 (tidak ada tx lifecycle di testnet).
- Tahap C/F "LENGKAP", "Governance Safe 2/3 ... memegang peran tata kelola melalui TimelockController": `role_manager` masih deployer; handover belum eksekusi.
- "Bytecode deterministik 100% cocok dengan upstream" (`:§1`, `AUDIT_SUBMISSION_PACKAGE.md:§1`): BASELINE menyebut setelah mask immutable dan CBOR metadata.
- Laporan "disahkan secara konsensus oleh Tim BMAD (Winston, Amelia, Sally, Mary, John)" dan AUDIT_SUBMISSION "disetujui oleh Mary (Auditor)": persona internal, bukan reviewer independen.

#### R-13. `AUDIT_SUBMISSION_PACKAGE.md` dan `AUDIT_SCOPE.md`

- "2.070 SLOC": jumlah baris fisik 343+256+1233+175+63 (hitung `wc -l`); SLOC tanpa komentar/kosong: 101+147+858+146+33 = 1.285 (hitung dengan grep, perkiraan kasar). `IMorphoVaultV2.sol` (103 baris) ada di lingkup `AUDIT_SCOPE.md` tapi tidak masuk hitungan.
- `AUDIT_SUBMISSION_PACKAGE.md:§4` V2: "penerima fee performa terkunci secara immutable ke kontrak Treasury Timelock": penerima fee = Treasury Safe (`46630.stage.json feeConfig.feeRecipient`), dan `Accountant.setFeeRecipient` (`lib/yearn-periphery/.../Accountant.sol:584`) bisa diganti `feeManager` yang di testnet adalah deployer EOA. Tidak immutable.
- "`_freeFunds` pada baris 170–210": fungsi mulai di `MorphoVaultStrategy.sol:174` (rentang dekat, tidak saya hitung ulang akhirnya).
- Plafon global 100.000 USDG / dompet 10.000 USDG: nilai `100_000_000_000` dan `10_000_000_000` benar untuk 6 desimal (saya hitung); namun hook belum dideploy di testnet (D-18).
- Tag `v1.0.0-rc.1` ada dan menunjuk `38b1ef2` (git). HEAD sudah 6 commit di depan; isi paket (bundle) tidak saya buka.

#### R-14. Halaman `/transparency` terlalu kuat

`apps/web/app/transparency/page.tsx:16-17`: "Testnet 46630 Live & Verified · Mainnet 4663 Ready" dan "All smart contracts, dual-speed timelocks, and multi-sigs are fully verified on Testnet 46630". Source belum diverifikasi di explorer (`DEPLOYMENT.md:182`), venue dan USDG adalah mock, handover belum selesai, dan mainnet belum punya deployment. Halaman yang sama menolak badge audit; kata "Verified"/"Ready" bertentangan dengan semangat §15 ("mainnet fork/testnet mock bukan bukti"). `README.md:5` juga menulis "multi-sig Safe terverifikasi on-chain".

#### R-15. `MANDATE_ESTIMATES.md`

- Alamat steakUSDG mainnet `0xb75D…` (Mandate 1) vs `0xBeEff033F34C046626B8D0A041844C5d1A5409dd` di BASELINE, AUDIT_SCOPE, AUDIT_SUBMISSION.
- Mandate 1 "Complete in Sprint 1–5", "Ready for Mainnet", dan "Operational drill engine verified (`testnet-lifecycle-drill.py`)": drill hanya lokal (R-01).
- Estimasi "3 weeks / 6 engineer-weeks" dan peta jalan "+1 to +3 Months": estimasi internal tanpa dasar yang ditunjukkan; "Aave/Fluid/Pendle/perp DEX tidak ada di 4663" tanpa sumber atau tanggal cek (tidak bisa saya verifikasi).
- Gate G6 (batas 80% per venue) memakai keeper yang tidak punya logika itu (D-11).

#### R-16. Dokumen lama yang masih menyatakan hal berbeda

- `ARCHITECTURE.md:239,319` ("menunggu staging", "⛔ belum").
- `ACCEPTANCE_EVIDENCE.md:111-122` (§3.D): "Otoritas EOA deployer sepenuhnya dicabut" tanpa label fork.
- `TESTNET_EVIDENCE.md:31` "100% byte-for-byte"; tabel §3 "Verified" tanpa tautan.
- `GAP_ANALYSIS_Avenor.md` (salinan di repo): 142 `[x]` dan 5 `[ ]`; item yang dicentang tetapi tidak sesuai bukti: `:354-357` (pemilik Safe, feeManager), `:375-385` (lifecycle testnet), `:404` (keeper di testnet; bukti yang dikutip hanya kode `waitForTransactionReceipt`, bukan run testnet), `:599` (kunci `makeAddr`). Lima `[ ]` yang tersisa jujur (execute handover, redeploy web, backfill indexer).

---

### 5. Yang tidak sempat diperiksa

- Chain: tanpa jaringan. Tidak membaca `getOwners()` ketiga Safe, `role_manager()`, `getMinDelay()`, `keeper`, saldo, atau kode on-chain. Semua pernyataan tentang kondisi live berasal dari file manifest dan `TESTNET_EVIDENCE.md`, bukan dari chain.
- Menjalankan test: tidak menjalankan `forge test`, `npm test`, `verify-all.py`, `check-handover.py` (butuh RPC), `fork-test.py`. Jumlah test adalah hitungan grep; "lulus" tidak terbukti oleh saya. Hanya `check-test-integrity.py` (31 referensi ada) yang saya jalankan.
- Nomor baris `VaultV3.vy`: source Vyper tidak ada di repo.
- Isi bundle audit `_bmad-output/audit-bundle` dan `generate-audit-bundle.py` (hanya dibaca kepalanya); `check-secrets.py`, `.github/workflows/ci.yml` (versi Foundry 1.9.0 tidak saya cocokkan).
- Web: tidak merender halaman; `/operator`, `/activity`, isi `app/docs/page.tsx` selain bagian Known Limitations/Operational References tidak saya baca penuh; tautan explorer di halaman tidak diperiksa.
- Dokumen yang tidak dibaca penuh: `ACCOUNTING.md`, `WITHDRAWAL_SEMANTICS.md`, `VENUE_INTEGRATIONS.md` (hanya grep), `SECURITY_DIFF.md`, `REPRODUCIBILITY.md`, `COMPATIBILITY_MATRIX.md`, `KEEPER.md`, `WEB_APP.md` (hanya grep), `AVENOR_TESTNET_REPORT.md`, `docs/superpowers/*`, `_bmad*`.
- `docs/evidence/testnet-web/*.png` dan `*-qa.json`: hanya daftar file; isi gambar tidak dilihat.
- Kode keeper/indexer/SDK: hanya fungsi dan string yang dirujuk dokumen; tidak ada telaah keamanan penuh.
- Keputusan penawaran source AGPL (D-20) dan `lib/VENDOR.md`.
- `scripts/governance_handoff_46630.py` dan `governance_execute_46630.py`: hanya dibaca bagian yang menyebut salt; logika lain tidak dicek.
- Apakah `0x445be78A…`/`0xAaB2…` memang pemilik Safe saat ini: saya mengandalkan catatan S8 di `TESTNET_EVIDENCE.md` dan hitungan baseline 25 Nov; tidak dihitung ulang kali ini.
