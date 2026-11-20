---
type: research
title: "Research — Robinhood Chain USDG Venues & Yearn V3 Baseline"
status: complete
created: 2026-11-19
parent: "initiative-avenor-managed-vaults"
---

# Research: venue USDG di Robinhood Chain + baseline Yearn V3

Metode: baca source lokal (bukan asumsi docs), query Morpho Blue API untuk data venue, baca README Kassora. Bukti mentah dan gap ada di `docs/REFERENCE_CAPTURE.md`; dokumen ini menyimpulkan dan merekomendasikan.

## 1. Fakta yang mengubah desain

1. **Hanya satu venue produksi.** `steakUSDG` = ~538 juta USD TVL, ~73,5 juta USDG likuid segera (13,6%). Vault lain: `gUSDGst` 503k, `ymvST-USDG` 208k, `groveUSDG` 100k, `PurintaUSDG` 67k, `nnUSDG` 641k dengan likuiditas 0.
   → Produk harus **menampilkan likuiditas sebagai angka utama**, bukan detail.

2. **Nama "Yearn" di chain ini bukan infrastruktur Yearn V3.** `ymvST-USDG` adalah Morpho vault yang dikurasi Yearn. Tidak ada bukti factory Yearn V3 terdeploy di `4663`.
   → Kita deploy factory sendiri (ADR-2) dan kehilangan manfaat tooling kanonik Yearn.

3. **Core Yearn V3 tidak punya virtual shares.** Share pertama 1:1, donasi ke vault tidak masuk `total_assets` (hanya `total_idle + total_debt`).
   → Anti-inflation memakai seed + minimum deposit (ADR-7), bukan klaim "virtual shares" ala Kassora.

4. **`withdraw` default `max_loss = 0`, `redeem` default `max_loss = 10000`.** Dua default berlawanan.
   → Ini risiko UX terbesar; wajib eksplisit di UI dan test.

5. **`setPaused(true)` memblokir penarikan** (`:774`) dan `maxWithdraw` = 0 (`:592`).
   → Klaim "withdrawals never paused" hanya mungkin dengan `deposit_limit`/hook, bukan pause.

6. **Kombinasi versi upstream tidak konsisten.** Vault v3.1.1 mem-pin strategi v3.0.4; periphery membangun terhadap vault `5b698f94` dan strategi-periphery dari branch `master` tanpa tag.
   → Matriks kompatibilitas empiris wajib (epic 1), bukan asumsi.

## 2. Rekomendasi

| Area | Rekomendasi | Alasan |
|---|---|---|
| Venue v1 | `steakUSDG` saja, cap konsentrasi 80%, buffer idle 10% | satu-satunya venue dengan likuiditas bermakna |
| Fee | performance 10%, management 0, `maxGain` 5%, `maxLoss` 2% | menghindari artefak `maxFee × gain == 0` |
| Peran | timelock 48 jam + guardian 3/5 terpisah + keeper tanpa izin berbahaya | satu kunci tidak boleh bisa pause + ubah peran |
| Anti-inflation | seed 1.000 USDG dead shares + minimum deposit 10 USDG | tidak ada decimals offset di core |
| Alokasi | `auto_allocate = false`, `use_default_queue = true` | alokasi eksplisit dan auditabel |
| Launch | cap + allowlist, naik bertahap | chain baru, venue tunggal, belum audit |

## 3. Yang belum diketahui (jangan diisi dengan tebakan)

- Perilaku gate/whitelist `steakUSDG` terhadap alamat strategi baru.
- Apakah venue punya cooldown penarikan; `maxWithdraw` saja tidak membuktikan waktu proses.
- Fee venue: accrual di `totalAssets` atau shares.
- Status resmi USDG dari sumber Robinhood (TLS/Cloudflare memblokir verifikasi).
- Ketersediaan Aave V3 di `4663` (belum terbukti; jangan diasumsikan).

## 4. Dampak pada rencana

- Epic 2 tidak bisa selesai tanpa fork test venue asli (bukan mock).
- Epic 5 (app) harus punya komponen `LiquidityMeter` sejak halaman pertama.
- Epic 7 (launch) harus memulai keterlibatan reviewer sekarang, karena kombinasi pin 2026 belum pernah diaudit.
- Dokumen `VENUE_INTEGRATIONS.md` adalah dokumen hidup: setiap venue baru menambah baris gate + bukti.