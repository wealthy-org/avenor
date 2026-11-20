---
type: prd
title: "PRD — Avenor USDG Managed Yield"
status: draft
version: 0.1
created: 2026-11-19
owner: "John (PM) × Winston (Architect) × Sally (UX) × Amelia (Dev)"
parent: "initiative-avenor-managed-vaults"
---

# PRD: Avenor — USDG Managed Yield (Robinhood Chain)

## 1. Ringkasan produk

Satu vault ERC-4626 di Robinhood Chain (`4663`) yang menerima **USDG** dan mengalokasikannya ke venue yield yang lolos gate, dikelola oleh curator dengan peran yang dibatasi timelock, fee yang bisa dihitung ulang on-chain, dan penarikan yang semantiknya dinyatakan jujur — termasuk saat likuiditas venue terbatas.

Bukan produk: janji yield tetap, "exit selalu instan", leverage, atau strategi yang butuh swap.

## 2. Masalah dan bukti

1. **Likuiditas USDG di `4663` sudah besar tapi terkonsentrasi.** `steakUSDG` memegang ~538 juta USD (≈73,5 juta USDG likuid segera) sementara vault lain di bawah 1 juta USD. Pengguna dengan USDG menganggur punya pilihan: masuk langsung ke satu venue (risiko kurator tunggal, tanpa lapisan kontrol), atau tidak sama sekali.
2. **Alternatif yang ada tidak menyatakan risikonya.** Katalog venue menampilkan APY tanpa konteks likuiditas; APY 19% pada `nnUSDG` datang dengan likuiditas 0.
3. **Produk pesaing (Kassora) belum live dan belum diaudit**, memasarkan enam mandat; klaim "withdrawals never paused"-nya tidak bisa dipenuhi dengan core Yearn V3 tanpa trik. Ruang untuk produk yang lebih jujur dan lebih sempit terbuka.

## 3. Target pengguna

| Persona | Kebutuhan | Yang membuat mereka pergi |
|---|---|---|
| **Holder USDG pasif** (utama) | menempatkan USDG dengan yield wajar, bisa keluar tanpa drama, paham risikonya | angka yang berubah tanpa penjelasan, penarikan gagal tanpa alasan |
| **Trader Robinhood** | parkir idle cash antar posisi | lockup tersembunyi, deposit ditolak tanpa sebab |
| **Kurator/operator** (internal) | alokasi & report yang bisa diaudit | alat yang tidak punya guard |
| **Reviewer/auditor** | memverifikasi klaim dari chain | dokumen yang tidak cocok dengan kode |

## 4. Prinsip produk (mengikat desain)

1. **Satu angka, satu asal.** Setiap angka di UI punya `blockNumber` + sumber (`onchain`/`indexed`).
2. **Tidak ada default yang merugikan user.** `max_loss` selalu eksplisit; default `redeem = 10000` tidak boleh dipakai diam-diam.
3. **Penarikan tidak dibekukan untuk kenyamanan.** Freeze risiko baru = `deposit_limit`/hook, bukan `setPaused`.
4. **Kontrol terlihat sebelum berlaku.** `role_manager` = timelock 48 jam; guardian terpisah.
5. **Risiko venue adalah risiko produk.** Likuiditas venue dan fee venue tampil di halaman utama, bukan catatan kaki.
6. **Tidak ada klaim yang tidak bisa dibuktikan hari ini.** Tidak ada kata "audited" untuk kode 2026; tidak ada "instant liquidity" bila venue hanya 13,6%.

## 5. Ruang lingkup v1

### 5.1 In scope

- Satu vault USDG (`VaultV3`), satu strategi aktif (`MorphoVaultStrategy` → `steakUSDG`), satu strategi cadangan yang belum didanai.
- Fee: performance 10%, management 0, `maxGain` 5%, `maxLoss` 2%, `profit_max_unlock_time` 7 hari.
- Peran: timelock 48 jam, guardian 3/5, keeper hot wallet terbatas.
- App: katalog, detail vault, deposit, withdraw, portfolio, transparency.
- Indexer + keeper + monitoring + runbook.
- Delapan dokumen brief §17 + `SECURITY_DIFF` + `RUNBOOK` + `ACCEPTANCE_EVIDENCE`.
- Launch terbatas: cap + allowlist, lalu naik bertahap.

### 5.2 Out of scope (v1)

- Multi-vault (mandat lain), token pinjaman selain USDG, leverage, DEX swap, oracle sendiri.
- HWM fee, refund loss yang didanai, insentif/liquidity mining.
- Mobile native app, akun abstraksi, fiat on-ramp.
- Klaim "institutional grade" apa pun.

## 6. Functional requirements

### FR-1 Katalog

| ID | Requirement | Acceptance |
|---|---|---|
| FR-1.1 | Menampilkan hanya vault berstatus `live` dengan CTA deposit; vault `research` tampil tanpa CTA dan tanpa angka APY | test render: 0 tombol deposit pada status research |
| FR-1.2 | Setiap kartu menampilkan TVL, `netApy` venue, likuiditas segera %, dan timestamp | nilai diambil dari API; screenshot cocok dengan query |
| FR-1.3 | Status data: `live`, `stale` (> 30 menit), `unknown` | badge berubah sesuai waktu data |

### FR-2 Detail vault

| ID | Requirement | Acceptance |
|---|---|---|
| FR-2.1 | Mandat dalam satu paragraf + daftar aset yang boleh dipegang (hanya USDG) | teks statis terversi |
| FR-2.2 | Alokasi per venue dengan bobot dan batas (`maxRatio`) | cocok dengan `strategies()` on-chain |
| FR-2.3 | Likuiditas: `maxWithdraw` strategi, % dari `totalAssets`, timestamp | cocok dengan `eth_call` |
| FR-2.4 | Fee on-chain: `performanceFee`, `maxFee`, `maxGain`, `maxLoss`, protocol bps, `profitMaxUnlockTime` | semua dibaca, tidak hard-coded |
| FR-2.5 | Peran: alamat + peran + delay timelock + tautan explorer | cocok dengan `roles()` |
| FR-2.6 | `last_report` + umur report; peringatan bila > 48 jam | badge warning |

### FR-3 Deposit

| ID | Requirement | Acceptance |
|---|---|---|
| FR-3.1 | `maxDeposit` dibaca; bila 0, tampilkan alasan (cap/paused/shutdown/hook) | 4 alasan punya copy berbeda |
| FR-3.2 | `previewDeposit` + simulasi sebelum tanda tangan | quote menampilkan block |
| FR-3.3 | `approve` jumlah persis secara default | tx calldata diperiksa di test |
| FR-3.4 | Setelah receipt, shares dari event `Deposit` | quote tidak dipakai sebagai hasil |
| FR-3.5 | Error taxonomy: wrong network, user reject, insufficient gas, cap, paused, shutdown, RPC gagal | 7 state punya UI |

### FR-4 Withdraw

| ID | Requirement | Acceptance |
|---|---|---|
| FR-4.1 | Batas = `maxWithdraw(owner)`/`maxRedeem(owner)` pada block terakhir | tombol "max" memakai nilai itu |
| FR-4.2 | `max_loss` eksplisit (default 0%), ditampilkan dalam assets + persen | calldata memuat nilai eksplisit |
| FR-4.3 | Bila permintaan > batas: tawarkan jumlah maksimum + penjelasan | tidak pernah mengirim tx yang pasti revert |
| FR-4.4 | Penarikan parsial: jelaskan sisa posisi dan sebabnya | copy peringatan + angka |
| FR-4.5 | Hasil dari event `Withdraw` (assets, shares) | tidak memakai estimasi |
| FR-4.6 | Bila `paused`: nonaktifkan withdraw dengan pesan insiden + kanal status | state khusus, bukan error generik |

### FR-5 Portfolio

| ID | Requirement | Acceptance |
|---|---|---|
| FR-5.1 | Posisi = `balanceOf` + `convertToAssets` | cocok dengan on-chain |
| FR-5.2 | "Dapat ditarik sekarang" dipisah dari "nilai posisi" | dua angka, dua label |
| FR-5.3 | Riwayat: deposit, withdraw, report (gain/loss/fee), perubahan peran | dari indexer, dengan hash |

### FR-6 Transparency

| ID | Requirement | Acceptance |
|---|---|---|
| FR-6.1 | Alamat kontrak + `apiVersion()` + hash artefak | cocok dengan `docs/BASELINE.md` |
| FR-6.2 | Tautan delapan dokumen brief §17 | file nyata, bukan anchor kosong |
| FR-6.3 | Riwayat peran (grant/revoke) dengan hash | dari event `RoleSet` |
| FR-6.4 | Bukti transaksi (deposit/report/withdraw) | tautan explorer |

### FR-7 Operasi (admin)

| ID | Requirement | Acceptance |
|---|---|---|
| FR-7.1 | Dashboard: `maxWithdraw` venue, delta TVL, umur report, antrian keeper | data + timestamp |
| FR-7.2 | Aksi darurat hanya lewat timelock/guardian, tidak ada tombol ajaib di app publik | admin app terpisah |

## 7. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Semua nilai uang desimal 6; tidak ada float untuk perhitungan; BigInt di SDK |
| NFR-2 | App p95 render < 2,5 s pada 4G; bundle awal < 250 kB gzip |
| NFR-3 | Aksesibilitas: WCAG 2.1 AA untuk kontras, fokus, label; navigasi keyboard penuh |
| NFR-4 | Semua mutasi on-chain punya state `pending/confirmed/failed` dengan bukti |
| NFR-5 | Indexer: lag < 30 s; rekonsiliasi harian otomatis |
| NFR-6 | Keeper: simulasi wajib; tidak ada retry buta; semua tx terlog |
| NFR-7 | Rahasia (RPC key, keeper key) di secret manager; tidak di repo/log |
| NFR-8 | Tidak ada dependensi npm tanpa lockfile; audit `npm audit` sebelum launch |

## 8. Model data (indexer)

`vaults`, `strategies`, `share_price_snapshots(vault, blockNumber, blockHash, pps, totalAssets, totalSupply)`, `positions(user, vault, shares)`, `reports(strategy, gain, loss, fees, refunds, blockNumber)`, `fees(recipient, shares, assetsAtReport)`, `role_events(account, newRoles)`, `venue_snapshots(venue, totalAssets, maxWithdraw, blockNumber)`, `ingestion_checkpoints`.

## 9. Metrik keberhasilan

| Metrik | Target 30 hari | Sinyal gagal |
|---|---|---|
| Deposit sukses / percobaan | > 70% | < 40% |
| Withdraw yang berakhir revert | < 2% | > 5% |
| Selisih estimasi vs hasil withdraw | median < 0,1% | > 1% |
| Umur report maksimum | < 30 jam | > 48 jam |
| Alarm palsu | ≤ 2/hari | > 5/hari |
| Rekonsiliasi | 0 selisih tak terjelaskan | ada selisih tanpa tiket |

Metrik yang **tidak** dikejar: APY tertinggi di chain, TVL tercepat. Keduanya mendorong perilaku yang bertentangan dengan §4.

## 10. Risiko produk

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Likuiditas venue turun | withdraw parsial, user kecewa | tampilkan likuiditas sejak awal, buffer idle, monitoring |
| Kurator venue menaikkan fee | yield turun | fee terlihat on-chain, diversifikasi venue bertahap |
| Loss venue | pps turun | `maxLoss` healthcheck, `force_revoke` teruji, disclosure |
| Guardian disalahgunakan | pause semua | guardian 3/5 terpisah, alarm publik, timelock untuk perubahan |
| Keeper bug | report/fee salah | simulasi wajib, healthcheck, batas gain/loss |
| Regulator/merek | klaim "yield" dianggap janji | bahasa: "target/realized", bukan "guaranteed"; risk disclosure wajib |

## 11. Kriteria peluncuran (semua harus benar)

1. Epic 1–3 selesai: bytecode tereproduksi, fork e2e, fee & peran teruji.
2. Indexer + keeper stabil 7 hari (epic 6 soak).
3. Review eksternal selesai; critical/high nol atau diterima tertulis.
4. Cap awal + allowlist aktif; guardian & timelock terverifikasi on-chain.
5. `docs/ACCEPTANCE_EVIDENCE.md` berisi deposit, report, withdraw, dan satu withdraw parsial.
6. Risk disclosure tampil di app dan docs; tidak ada klaim yang tidak terbukti.

## 12. Pertanyaan terbuka (butuh keputusan manusia)

1. **Yurisdiksi & entitas.** Siapa penerima fee, dan apakah produk dijual sebagai "managed account" (implikasi izin)? Ini menentukan copy dan disclaimer.
2. **Nama.** "Avenor" masih sementara; perlu cek merek sebelum aset visual dibuat.
3. **Mandat kedua.** Apakah v1.1 menambah vault RWA/stock-token (`gUSDGst`), atau tetap satu vault sampai ada audit kedua? Rekomendasi PM: satu vault sampai soak + review berikutnya.
4. **Allowlist awal.** Siapa 50 wallet pertama, dan bagaimana proses masuk/keluar allowlist dicatat?
5. **Buffer idle.** Target `minimum_total_idle` = 5% atau 10% dari TVL? Trade-off: exit cepat vs drag yield ~0,2–0,4%.
6. **Refund loss.** Apakah Accountant didanai (mis. 1% dari fee) untuk `refundRatio`, atau refund ditunda ke v2? Rekomendasi: tunda.