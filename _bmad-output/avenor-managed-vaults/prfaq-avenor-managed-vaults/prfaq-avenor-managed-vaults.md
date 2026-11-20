---
type: prfaq
title: "PRFAQ — Avenor USDG Managed Yield"
status: draft
created: 2026-11-19
parent: "initiative-avenor-managed-vaults"
---

# PRFAQ — Avenor

## Press release (fiktif, ditulis seolah sudah rilis)

**Avenor membuka akses USDG ke vault terkelola pertama di Robinhood Chain yang menyatakan batas penarikannya sejak awal**

*Singapura, 19 November 2026* — Avenor hari ini membuka USDG Managed Yield, satu vault ERC-4626 di Robinhood Chain yang menempatkan USDG ke venue pinjaman terpilih dan menampilkan, di halaman depan, berapa banyak yang bisa ditarik saat ini juga. Vault dibangun di atas Yearn V3 Allocator Vault (`API 3.1.1`) dengan pengendalian timelock 48 jam, guardian terpisah, dan fee performa 10% yang dihitung on-chain saat report.

Berbeda dari katalog yield yang menampilkan APY tanpa konteks, Avenor menampilkan tiga angka bersamaan: nilai posisi, jumlah yang dapat ditarik sekarang, dan waktu report terakhir. Pada hari peluncuran, venue utama menempatkan sekitar 13,6% asetnya dalam bentuk likuid segera; Avenor menampilkan angka itu apa adanya dan memberi tahu pengguna sebelum mereka menandatangani transaksi.

"Kami tidak menjual exit instan yang tidak ada," kata tim Avenor. "Kami menjual aturan yang bisa diperiksa: siapa yang bisa melakukan apa, dengan jeda berapa lama, dan apa yang terjadi kalau likuiditas sedang tipis."

Peluncuran dilakukan dengan kapasitas terbatas dan daftar tunggu. Alamat kontrak, hash artefak, matriks peran, dan bukti transaksi (deposit, report, penarikan penuh, penarikan parsial) dipublikasikan di halaman transparency.

## FAQ eksternal

**Apakah pokok saya dijamin?** Tidak. Kerugian venue — gagal bayar pinjaman, oracle, atau likuidasi — mengurangi nilai vault. Tidak ada asuransi, tidak ada jaminan, tidak ada refund otomatis.

**Bisakah saya menarik kapan saja?** Anda bisa mengirim permintaan penarikan kapan saja selama vault tidak dalam mode insiden. Jumlah yang berhasil ditarik dibatasi likuiditas venue saat itu; sisanya tetap menjadi posisi Anda. Produk ini menampilkan batas tersebut sebelum Anda menandatangani.

**Kenapa penarikan bisa berhenti?** Hanya jika guardian mengaktifkan mode insiden (`paused`). Itu memblokir deposit **dan** penarikan. Kami memilih mengatakannya terang-terangan daripada mengklaim exit yang tidak bisa kami jamin.

**Apakah ini audited?** Kontrak inti Yearn V3 versi 2023 telah diaudit ChainSecurity, Statemind, dan YAcademy. Kombinasi versi yang kami pin (2026), adapter kami, dan konfigurasi kami menjalani review terpisah; hasilnya dipublikasikan. Kami tidak menyebut produk ini "audited" tanpa menyebut cakupannya.

**Bagaimana fee bekerja?** 10% dari keuntungan yang terealisasi saat report, dibayar dalam shares vault yang dibuka bertahap selama 7 hari. Tidak ada fee deposit/withdraw. Fee venue dibayar di dalam venue dan mempengaruhi net APY yang kami tampilkan.

**Apa yang terjadi jika venue utama penuh atau rusak?** Alokasi baru dihentikan, dana ditarik sebisanya, dan bila perlu strategi dicabut lewat jalur `force_revoke` yang mengakui kerugian secara eksplisit. Kedua jalur itu diuji dan punya runbook.

## FAQ internal (yang harus dijawab sebelum rilis)

1. **Siapa legal issuer dan penerima fee?** Belum diputuskan; menentukan disclaimer dan pajak.
2. **Apakah cap awal 250.000 USDG atau 1.000.000 USDG?** Butuh data uji soak dan kapasitas tim support.
3. **Berapa `minimum_total_idle`?** 5% (yield drag kecil, exit lebih lambat) vs 10% (exit lebih baik, drag ~0,37% × 10% = 0,037%).
4. **Apakah kami menyediakan venue kedua di v1?** Rekomendasi: tidak, sampai satu venue terbukti dalam produksi.
5. **Apa respons kami bila `steakUSDG` menaikkan fee?** Tampilkan, hitung ulang net APY, dan siapkan rencana migrasi ke venue yang lolos gate.
6. **Apa yang kami lakukan bila guardian salah menekan pause?** Runbook unpause via timelock 48 jam — konsekuensi yang harus diterima karena guardian tidak boleh sekaligus menjadi timelock.

## Risiko yang diakui terbuka

- Ketergantungan pada satu kurator venue.
- Likuiditas segera yang kecil relatif TVL.
- Ketiadaan audit untuk kombinasi versi kita.
- Ketiadaan pengalaman produksi di chain yang masih baru.
- Regulasi produk "managed yield" yang belum dianalisis hukum.