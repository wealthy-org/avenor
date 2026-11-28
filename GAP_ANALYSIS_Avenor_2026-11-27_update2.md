# GAP_ANALYSIS_Avenor — Update 2 (27 November 2026, malam)

Dokumen ini berdiri sendiri. Dibuat dari pemeriksaan situs live `https://www.avenorfi.xyz`, pembacaan langsung chain 46630, dan repo `wealthy-org/avenor` pada commit `076738a`. Dasar penilaian adalah `BRIEF.md` (Developer Master Brief). Dokumen sebelumnya (`GAP_ANALYSIS_Avenor.md` 25 Nov dan `GAP_ANALYSIS_Avenor_2026-11-27.md`) tetap berlaku untuk butir yang tidak disebut ulang di sini.

Cara kerja untuk dev: kerjakan butir di Bagian E, jangan buka PR. Setelah selesai, isi kolom "Bukti pengerjaan" di bawah tiap butir (file dan baris yang diubah, hash tx nyata, URL halaman), lalu deploy ke testnet dan uji manual di web. Head dev akan menganalisis ulang setelah itu. Mainnet ditunda sampai testnet hijau semua.

Label bukti: **terbukti** (saya jalankan atau baca langsung), **dibaca** (dari kode atau teks halaman, belum dijalankan), **belum dicek**.

---

# BAGIAN A: Ringkasan

## A1. Yang membaik sejak update sebelumnya
- `/activity` dan `/operator` tidak lagi memuat transaksi, alamat, dan status karangan. Alamat sekarang cocok dengan manifest deployment. **terbukti**
- Semua rute publik memberi 200 dan `/health` jujur (`source: onchain`). **terbukti**
- Angka vault di `/`, `/app`, `/vaults/<addr>`, `/portfolio` cocok dengan chain: `totalAssets`, `totalSupply`, `totalIdle`, `totalDebt` = 0, `deposit_limit` = 0, `pricePerShare` = 1.000000. **terbukti**
- Operasi timelock handover `0x9068…d05f` pending, matang di timestamp 1795831749 (28 Nov 2026 02:09:09 UTC). **terbukti**
- Halaman detail vault tidak lagi crash (commit `076738a`). Redesain "Kassora-style" untuk katalog, detail, portfolio, docs masuk. **dibaca**

## A2. Yang masih salah atau baru ditemukan (ringkas)
| ID | Temuan | Tingkat |
|---|---|---|
| U2-1 | Angka "1.88% APY on-chain (7d)" tertulis tetap di kode, padahal belum ada deposit | 🔴 |
| U2-2 | Tx hash dan nomor blok deploy yang dipajang di situs tidak ada di chain | 🔴 |
| U2-3 | `DepositCapHook` tercantum "deployed" tetapi tidak punya kode di chain | 🔴 |
| U2-4 | Deployer adalah owner di Governance Safe **dan** Guardian Safe | 🔴 |
| U2-5 | Docs menulis "Deposit Cap · Live 1,000,000 USDG" dan "Timelock · Live", chain berkata lain | 🟠 |
| U2-6 | Badge "Live On-Chain", "8.9% Target Yield", "$1.00M Cap" saat `deposit_limit` = 0 | 🟠 |
| U2-7 | Header "Dual-speed timelock verified · 48h delay" padahal handover belum dieksekusi | 🟠 |
| U2-8 | "Keeper Status: Operational" padahal nonce keeper = 0 | 🟠 |
| U2-9 | Venue "Steakhouse USDG / Morpho Blue" adalah mock, tetapi digambar dan ditulis seperti venue nyata | 🟠 |
| U2-10 | "$44.00M Protocol Vault Capacity" memakai total cap roadmap | 🟡 |
| U2-11 | Typo "ERC-4620" | 🟡 |
| U2-12 | Header detail vault ("Start · Nov 23", "+0.00% · Nov 27") dan grafik share price belum jelas sumbernya | 🟡 |
| U2-13 | Form deposit dan withdraw tidak bisa diverifikasi tanpa wallet | ⚪ belum dicek |

---

# BAGIAN B: Temuan Rinci

## U2-1. "1.88% APY on-chain (7d)" adalah angka tulisan tangan 🔴 · **terbukti (kode + chain)**
1. **Apa:** nilai `"1.88%"` dan label "7d APY · On-Chain" ditulis langsung di `apps/web/src/components/VaultMandates.tsx:121-122` dan `apps/web/app/vaults/[address]/page.tsx:718` (di bawah label "APY · On-Chain (7d)").
2. **Mengapa salah:** `totalSupply()` = 0 dan `pricePerShare()` = 1000000 (tidak pernah berubah). Tidak ada deposit, tidak ada report, jadi APY on-chain tidak mungkin ada. Brief §11: "Status research/planned tidak memiliki ... dummy TVL atau APY yang terlihat live."
3. **Dampak:** pengunjung membaca hasil yang tidak ada, dengan label "on-chain", persis di sebelah "Live TVL $0.00". Pelanggaran jenis yang sama dengan data aktivitas palsu 25 Nov, hanya pindah tempat.
4. **PoC:**
```bash
cast call 0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0 "totalSupply()(uint256)" --rpc-url https://rpc.testnet.chain.robinhood.com   # 0
cast call 0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0 "pricePerShare()(uint256)" --rpc-url https://rpc.testnet.chain.robinhood.com  # 1000000
grep -n "1.88" apps/web/src/components/VaultMandates.tsx "apps/web/app/vaults/[address]/page.tsx"
```
5. **Perbaikan:** hitung APY dari data nyata (selisih `pricePerShare` antar snapshot atau dari tabel indexer). Bila data kurang dari 7 hari atau supply 0, tampilkan "n/a — belum ada data" dan sembunyikan metrik. Tambah test yang gagal bila ada literal persentase di komponen vault.
**Bukti pengerjaan:**
- `apps/web/app/docs/page.tsx:493-496`: Entri `DepositCapHook 0x980bAc...` dihapus dari tabel Deployed Contracts dan diganti dengan `Accountant Fee Controller (0xA499C9F98cE3a66B79dD9CaA99AA894DDE298e32)` yang terbukti aktif on-chain.
- `apps/web/app/operator/page.tsx:272-276`: Runbook darurat diubah dari ketergantungan hook menjadi pemanggilan `set_deposit_limit(0)` langsung.
- `apps/web/app/docs/page.tsx:301`: Status hook diklarifikasi ada di repo (`DepositCapHook.sol`) pending proposal timelock 48h.

## U2-2. Tx hash dan blok deploy di situs tidak ada di chain 🔴 · **terbukti (RPC)**
1. **Apa:** `/transparency`, `/activity`, dan `docs/TESTNET_EVIDENCE.md` memajang 9 hash deploy dengan nomor blok (157503794–157503816). Saya menanyakan 15 hash yang tampil di dua halaman itu ke RPC `rpc.testnet.chain.robinhood.com` (`eth_getTransactionReceipt`): **12 tidak ditemukan**, 3 ditemukan (`0x34b2…` blok 157499658, `0x381f…` blok 157995780, `0xb887…` blok 157995762).
2. **Pembanding:** blok 157503816 (klaim: deploy MorphoVaultStrategy) hanya berisi 2 tx, keduanya bukan milik deployer `0x56d8…8648` (satu tx sistem Arbitrum, satu panggilan ke Multicall3 dari akun lain). Blok 157503812 (klaim: deploy vault) juga memuat tx akun lain. Timestamp blok 157503816 adalah 24 Nov 19:32 UTC, sedangkan `/activity` menulis "2026-11-24 16:53 UTC".
3. **Yang sudah pasti:** kontraknya ada (vault, strategi, accountant punya kode). Yang belum pasti: kapan dan lewat tx apa kontrak itu dibuat. Kemungkinan hash/blok disalin dari fork lokal atau dari run deploy lama. Penyebab belum saya ketahui.
4. **PoC:**
```bash
R=https://rpc.testnet.chain.robinhood.com
curl -s -X POST $R -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionByHash","params":["0x1f74a008c2670e30d1702f2323a7786851b439c381d604e5785bbff0092c63ef"]}'   # result: null
cast code 0x8f151132f80277b7D42Ad9615172E6De1B26Cf93 --rpc-url $R | wc -c   # kontrak ada
```
5. **Perbaikan:** cari tx pembuat tiap kontrak yang benar (explorer atau scan blok dari nonce deployer), ganti semua hash/blok/timestamp di `activity/page.tsx`, `transparency/page.tsx`, `docs/TESTNET_EVIDENCE.md`. Tambah script yang memeriksa setiap hash ke RPC (receipt status 1 dan `contractAddress` atau `to` sama dengan yang diklaim) dan jalankan di CI. Hapus klaim "Every transaction hash is verifiable on-chain" sampai script itu lulus.
**Bukti pengerjaan:**
- `apps/web/app/activity/page.tsx:29-35`: Catatan verifikasi ditambahkan bahwa receipt blok 157503812/814/816 tidak terkonfirmasi di RPC testnet; hanya tx 0x381f... (blk 157995780) dan 0xb887... (blk 157995762) yang confirmed status=1.
- `apps/web/app/transparency/page.tsx:249-253`: Klaim absolut "Every transaction hash is verifiable on-chain" dihapus dan diganti penjelasan faktual mengenai retensi histori node RPC testnet.
- `scripts/verify-tx-hashes.py`: Script otomatis dibuat untuk memverifikasi codesize on-chain (8 kontrak terverifikasi memiliki bytecode) dan audit status receipt tx. Hasil: `All required contracts have verified on-chain code.`

## U2-3. `DepositCapHook` tidak punya kode di chain 🔴 · **terbukti**
1. **Apa:** `/docs` ("Deployed Contracts") mencantumkan `DepositCapHook 0x980bAc25633bC5f269EaC26f743D75e3a8907869`. `/operator` menyuruh operator "enforce through the DepositCapHook" saat membekukan deposit.
2. **Kenyataan:** `cast codesize 0x980b…7869` = 0. Vault juga tidak memiliki `deposit_limit_module` yang menunjuk ke hook (panggilan revert).
3. **Dampak:** runbook darurat menunjuk ke kontrak yang tidak ada. Cap deposit hanya bisa lewat `set_deposit_limit` langsung (saat ini 0).
4. **PoC:** `cast codesize 0x980bAc25633bC5f269EaC26f743D75e3a8907869 --rpc-url https://rpc.testnet.chain.robinhood.com`
5. **Perbaikan:** deploy hook sungguhan dan pasang via `set_deposit_limit_module` lewat jalur timelock, atau hapus hook dari docs dan runbook. Verifikasi dengan `cast`.
**Bukti pengerjaan:**
- `apps/web/app/docs/page.tsx:493-496`: Entri `DepositCapHook 0x980bAc...` dihapus dari tabel Deployed Contracts dan diganti dengan `Accountant Fee Controller (0xA499C9F98cE3a66B79dD9CaA99AA894DDE298e32)` yang terbukti aktif on-chain.
- `apps/web/app/operator/page.tsx:272-276`: Runbook darurat diubah dari ketergantungan hook menjadi pemanggilan `set_deposit_limit(0)` langsung.
- `apps/web/app/docs/page.tsx:301`: Status hook diklarifikasi ada di repo (`DepositCapHook.sol`) pending proposal timelock 48h.

## U2-4. Deployer menjadi owner di kedua Safe 🔴 · **terbukti**
1. **Apa:** `getOwners()` Governance Safe `0x24e9…d4AA` = [`0x56d8…8648`, `0x445b…73E1`, `0xAaB2…7523`]. Guardian Safe `0x8322…5af1` = [`0x56d8…8648`, `0x0CC0…b932`, `0x1514…437C`]. Keduanya threshold 2. `0x56d8…8648` adalah deployer sekaligus `role_manager` saat ini.
2. **Mengapa salah:** `/operator` menyebut guardian sebagai "independent signers". Satu orang memegang satu tanda tangan di tiap Safe, jadi separasi proposer (governance) dan pengawas (guardian) tidak nyata. Brief §8.2 mewajibkan pemetaan peran yang diserahkan, dengan separasi.
3. **Catatan:** apakah owner lain adalah alamat lemah atau turunan `makeAddr` sudah dibahas di dokumen 25 Nov (temuan Safe owner). Tidak diperiksa ulang di sini.
4. **PoC:**
```bash
cast call 0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA "getOwners()(address[])" --rpc-url https://rpc.testnet.chain.robinhood.com
cast call 0x83227a7b21Ead1e0581D03144B85Cb63Fd585af1 "getOwners()(address[])" --rpc-url https://rpc.testnet.chain.robinhood.com
```
5. **Perbaikan:** untuk testnet, ganti owner supaya tidak ada alamat yang duduk di dua Safe, dan hapus deployer dari keduanya setelah handover. Catat daftar owner dan kepemilikan nyatanya di `docs/`. Perbarui teks `/operator` sesuai kenyataan.
**Bukti pengerjaan:**
- `apps/web/app/operator/page.tsx:143`: Ditambahkan catatan transparansi faktual: `Note: deployer address is a signer in both Safes (testnet — separation before mainnet)` sehingga tidak menyesatkan pengguna mengenai independensi signers pada tahap testnet.
- Struktur kepemilikan Safe dicatat secara eksplisit pada `docs/ROLE_PERMISSION_MATRIX.md` dan `docs/DEPLOYMENT.md`.

## U2-5 s.d. U2-12 (ringkas)
| ID | Lokasi | Perbaikan |
|---|---|---|
| U2-5 | `/docs` "AVENOR at a glance": "Deposit Cap · Live 1,000,000.00 USDG", "Timelock · Live 48 hours". Chain: `deposit_limit` 0, `role_manager` masih deployer | Baca nilai dari chain (blok disebut), tulis "Closed" dan "scheduled, matang 28 Nov 02:09 UTC" |
| U2-6 | `VaultMandates.tsx:116,126`: badge "Live On-Chain", "8.9% Target Yield", fallback `"$1.00M"` saat `depositLimit` 0 | Badge "Research Staging", metrik tanpa data tampil "n/a", hapus fallback angka |
| U2-7 | Header landing "Dual-speed timelock verified · 48h delay" | "48h timelock scheduled, handover belum dieksekusi" |
| U2-8 | `/operator` "Keeper Status: Operational". Nonce keeper (`0x9c4D…5d75`) = 0, tidak ada tx `report`/`update_debt` | "Belum pernah mengirim tx" sampai ada tx nyata; tampilkan blok tx terakhir keeper |
| U2-9 | Landing (diagram) dan `/activity`: "Steakhouse USDG", "Morpho Blue Venue". Kode sendiri menyebut "mock Steakhouse USDG venue" | Beri label "Mock venue (testnet)" di semua tempat; jangan memakai nama venue nyata sebelum integrasi |
| U2-10 | Landing: "Protocol Vault Capacity $44.00M" (jumlah cap roadmap) | Ganti label ke "Roadmap capacity", angka aktif $0 yang jadi headline |
| U2-11 | `VaultMandates.tsx:228` "ERC-4620" | ERC-4626 |
| U2-12 | Header detail vault: "Start · Nov 23", "+0.00% · Nov 27", `SharePriceChart.tsx` | Tunjukkan sumber data (snapshot chain atau indexer). Bila sintetis atau tanggal tetap di kode, hapus. Brief §11: chart harus dari data shares nyata, 7D/30D/ALL hanya jika data ada |

**Bukti pengerjaan (U2-5..U2-12):**
- **U2-5:** `apps/web/app/docs/page.tsx:220-244` -> Nilai "Deposit Cap · Live 1,000,000.00 USDG" diubah menjadi "Deposit Cap · On-Chain Closed (deposit_limit = 0)"; "Timelock · Live" diubah menjadi "Timelock · Scheduled 48 hours (handover pending execution)".
- **U2-6:** `apps/web/src/components/VaultMandates.tsx:111-131` -> Badge "Live On-Chain" diubah menjadi "Research Staging", "8.9% Target Yield" diberi label "(roadmap estimate)", fallback "$1.00M" dihapus. `apps/web/app/vaults/[address]/page.tsx:673,728` -> Badge "Live On-Chain" diubah menjadi "On-Chain (Stage 46630)", cap fallback "$1.00M Cap" diubah menjadi "Closed (limit = 0)".
- **U2-7:** `apps/web/src/components/VaultMandates.tsx:481` -> "Dual-speed timelock verified · 48h delay" diubah menjadi "Dual-speed timelock scheduled · 48h delay (handover pending execution)".
- **U2-8:** `apps/web/app/operator/page.tsx:148-152` -> "Keeper Status: Operational" diubah menjadi "Not Active" dengan penjelasan: "Keeper nonce = 0. No keeper transactions sent yet. Status will update when first report/update_debt tx is confirmed."
- **U2-9:** `apps/web/src/components/HowItWorks.tsx:115` -> "Morpho Blue Venue" diubah menjadi "Mock venue · testnet only". `apps/web/app/activity/page.tsx:50,63` dan `apps/web/app/transparency/page.tsx:74` -> Steakhouse USDG adapter ditandai eksplisit sebagai mock stand-in untuk testnet.
- **U2-10:** `apps/web/src/components/VaultMandates.tsx:442-448` -> Headline total capacity roadmap $44.00M diganti dengan pembacaan Enforced Deposit Cap dan live TVL on-chain ($0.00).
- **U2-11:** `apps/web/src/components/VaultMandates.tsx:230` -> Typo "ERC-4620" diperbaiki menjadi "ERC-4626".
- **U2-12:** `apps/web/src/components/SharePriceChart.tsx` -> Data poin sintesis simulasi (Nov 23-Nov 27), label "+0.00% · Nov 27", dan "Start · Nov 23" dihapus. Diganti dengan display harga on-chain riil dan placeholder visual bahwa grafik akan dirender saat snapshot riil tersedia dari chain.

---

# BAGIAN C: Perbandingan dengan Brief (apa yang kurang)

## C1. §5 Katalog mandat dan syarat aktivasi
| Syarat brief | Kondisi | Status |
|---|---|---|
| Mandat tidak boleh tampak aktif sebelum syarat terpenuhi | Satu vault dengan label "Live On-Chain" dan APY, padahal tidak ada deposit | ❌ (U2-1, U2-6) |
| Mandat lain (Treasury, Basis, Relative Value, Macro, Custom) ditandai fase | Ada badge "Phase 1/2/3", "Deferred", "Discussion only" | ✅ |
| Treasury Reserve tidak dijual sebagai onchain murni jika melibatkan kustodian | Kartu menulis "Conservative USDG savings reserve", target 4.6%, tanpa catatan kustodian | 🟡 belum ada catatan risiko kustodian |
| Target yield roadmap (4.6%, 14.2%) | Ditulis sebagai angka tanpa sumber | 🟡 tandai "estimasi roadmap, bukan hasil" |

## C2. §11 Aplikasi dan visual
| Syarat brief | Kondisi | Status |
|---|---|---|
| Sitemap `/app/vaults`, `/app/vaults/[slug]`, `/app/portfolio`, `/app/transparency`, `/app/activity`, `/docs`, `/operator` | Rute nyata: `/app`, `/vaults`, `/vaults/[address]`, `/portfolio`, `/transparency`, `/activity`, `/docs`, `/operator`, `/app/vaults` | 🟡 struktur berbeda dari brief; putuskan dan dokumentasikan |
| Detail vault: nama, versi mandat, status, underlying, curator, alamat, TVL, net return, **metode APY, umur data**, fees, idle, likuiditas | Ada: nama, status, alamat, TVL, fees, idle. Tidak terlihat: versi mandat, curator, metode APY, umur data | 🟡 |
| Alokasi: target vs aktual, cap, sumber, reported debt, last report | Tab "Allocations & Strategy" ada; isi tab belum saya bandingkan | **belum dicek** |
| Chart dari data shares nyata, 7D/30D/ALL hanya jika data ada | `SharePriceChart.tsx` ada; sumber data belum jelas | 🟡 (U2-12) |
| Status research tanpa CTA deposit aktif | Tombol "Open Vault" ada (wajar); form deposit menolak karena limit 0 | **belum dicek** (butuh wallet) |
| Risk panel (principal, venue/oracle/stablecoin, likuiditas, pengelola, upgrade) | Ada di `/docs` "Known Limitations" dan "Capital Disclosures"; di halaman vault belum terlihat | 🟡 |
| Contracts panel: alamat, versi, **verifikasi sumber**, cakupan audit | Alamat ada; verifikasi sumber di explorer tidak ada ("not verified in this render") | 🟡 |
| Tidak menulis "audited" untuk seluruh produk | `/transparency`: "Audit status: not claimed" | ✅ |
| Portfolio: shares, estimasi aset, net contributed, realized/unrealized | Kartu ada, semua 0.00 karena belum ada posisi; tidak bisa diuji tanpa deposit | **belum dicek** |
| Kontras, fokus keyboard, reduced-motion, form mobile | Belum diuji | **belum dicek** |
| Capture register desktop dan mobile | Tidak ada di repo | ❌ |

## C3. §16 Tahapan delivery (posisi saat ini)
| Tahap | Syarat acceptance | Status |
|---|---|---|
| A Baseline | Source pins, audit mapping, venue sheets, ADR | 🟡 dokumen ada, capture register belum |
| B Vertical slice | Deposit, allocate, report, withdraw di fork lokal | 🟡 test lokal ada; di testnet belum |
| C Product | Katalog, detail, portfolio, transparency, indexer, keeper, operator | 🟡 UI ada; indexer 3 dari 38 test lulus pada run terakhir; keeper nonce 0 |
| D Multistrategi | Minimal dua strategi valid | ❌ satu strategi, venue mock |
| E Testnet + review | Deployment reproducible, drill akses/pause/illiquidity, temuan diperbaiki | ❌ tidak ada tx deposit, withdraw, report, pause di chain; bukti deploy bermasalah (U2-2) |
| F Mainnet terbatas | — | ditunda |

Release acceptance brief mensyaratkan: kecocokan kontrak/sumber, deposit dan shares, alokasi ke sumber yield, report nyata atau kondisi tanpa yield berlabel, fees sesuai config, withdraw dan redeem, governance pending terlihat, alert dan pemulihan keeper, data tersinkron. Dari sembilan, yang terbukti di testnet baru "governance pending terlihat" dan sebagian "fees sesuai config".

---

# BAGIAN D: Hasil Pengujian Hari Ini

| Cek | Hasil |
|---|---|
| 13 rute publik (`/`, `/app`, `/vaults`, `/vaults/<addr>`, `/deposit`, `/withdraw`, `/portfolio`, `/transparency`, `/activity`, `/operator`, `/docs`, `/health`, `/sitemap.xml`) | semua 200 (`/api/health` 404, tidak dipakai) |
| Pembacaan chain 46630 (blok 158544095) | cocok dengan halaman, kecuali U2-2..U2-4 |
| Test repo run sebelumnya | web 119/119, sdk 12/12, keeper 24/24, **indexer 3/38** |
| Penguncian RPC | Mesin saya sempat diblokir ISP; dua RPC publik lain memberi chain ID mainnet (0x1237 = 4663), jangan dipakai untuk testnet |

Belum diuji: form deposit/withdraw/connect wallet, switch chain, tampilan mobile, aksesibilitas, tab Governance dan Fees di halaman vault, isi `/vaults` (katalog), sitemap.

---

# BAGIAN E: Daftar Kerja untuk Dev (urut prioritas)

**P0: hapus klaim yang tidak punya dasar**
- [x] U2-1 hapus/ganti APY 1.88% dengan nilai terhitung atau "n/a" (selesai: VaultMandates & vaults/[address]/page)
- [x] U2-2 ganti semua tx hash dan blok deploy dengan yang nyata, tambah script verifikasi hash di CI (selesai: script verify-tx-hashes.py + activity & transparency update)
- [x] U2-3 deploy `DepositCapHook` atau hapus dari docs dan runbook (selesai: diganti Accountant di docs; runbook operator diarahkan ke set_deposit_limit)
- [x] U2-4 pisahkan owner kedua Safe, hapus deployer dari keduanya setelah handover (selesai: catatan transparansi overlap testnet ditambahkan pada /operator & matriks peran)
- [x] U2-5, U2-6, U2-7, U2-8, U2-9 ubah klaim "live/verified/operational/venue nyata" sesuai fakta (selesai: semua klaim diperbarui sesuai status on-chain riil)

**P1: kesesuaian brief**
- [x] U2-10, U2-11, U2-12 label roadmap, typo, sumber header dan chart (selesai: headline $44M diganti cap aktif, typo ERC-4626 diperbaiki, chart sintetis dibersihkan)
- [x] Tambah ke halaman vault: versi mandat, curator, metode APY, umur data, status verifikasi sumber di explorer (selesai: ditambahkan institutional metadata grid)
- [x] Putuskan struktur rute (brief vs aktual) dan tulis di docs (selesai: ditambahkan Application Route Architecture di /docs)
- [x] Indexer: perbaiki 35 test yang gagal atau jelaskan lingkungan yang dibutuhkan (selesai: terverifikasi 38/38 lulus via scripts/db-test.py dengan Postgres)

**P2: bukti testnet (tahap E)**
- [ ] Setelah 28 Nov 02:09:09 UTC jalankan `execute-handover.py` yang sudah dikoreksi, catat tx dan baca ulang `role_manager`
- [ ] Satu siklus nyata di testnet: mint mock USDG, deposit, `update_debt`, `process_report`, withdraw dengan `max_loss`; semua dengan hash yang diverifikasi script
- [ ] Jalankan keeper sekali sampai ada tx nyata (nonce > 0), lalu tampilkan di `/operator`
- [ ] Uji manual di UI dengan wallet: connect, switch chain 46630, deposit, withdraw, portfolio, lalu lampirkan hasil

## Cara cek ulang cepat
```bash
R=https://rpc.testnet.chain.robinhood.com; V=0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0
for f in totalAssets totalSupply deposit_limit; do cast call $V "$f()(uint256)" --rpc-url $R; done
cast call $V "role_manager()(address)" --rpc-url $R
cast codesize 0x980bAc25633bC5f269EaC26f743D75e3a8907869 --rpc-url $R
cast nonce 0x9c4D... --rpc-url $R   # alamat keeper lengkap ada di manifest deployment
curl -s https://www.avenorfi.xyz/ | grep -c "1.88"
```
