# EXPERIENCE.md — Avenor

Bagaimana produk berperilaku, termasuk saat gagal. Setiap state di sini punya pasangan di `docs/WITHDRAWAL_SEMANTICS.md` §6.

## 1. Model mental yang ingin ditanamkan

1. "Saya menaruh USDG di satu vault; vault meminjamkan/menempatkannya ke venue yang disebutkan namanya."
2. "Yield bisa turun dan bisa negatif; yang dijamin hanya aturan mainnya, bukan hasilnya."
3. "Kalau likuiditas venue sedang tipis, saya bisa keluar sebagian sekarang dan sisanya nanti — dan saya tahu itu sebelum menekan tombol."

## 2. Perjalanan utama

### 2.1 Pertama kali (0–60 detik)

1. Katalog: satu vault, angka besar = TVL; di bawahnya baris `netApy venue 3,71% · likuid segera 13,6% · block 12.345.678`.
2. Klik → detail: mandat satu paragraf, alokasi 100% ke `steakUSDG` (dengan nama venue, bukan kode), peran + timelock, fee.
3. Panel kanan: input jumlah, `previewDeposit`, estimasi shares.
4. Connect wallet → salah jaringan → banner: "Anda di chain 1. Avenor hanya di Robinhood Chain (4663)." + tombol switch, tanpa auto-pindah paksa.
5. `approve` jumlah persis → deposit → pending → confirmed → shares dari event, dengan tautan tx.

### 2.2 Kembali untuk menarik

1. Portfolio: dua angka bersebelahan — "Nilai posisi 12.480,00 USDG" dan "Dapat ditarik sekarang 3.120,00 USDG (25%)".
2. Bila user memasukkan > dapat ditarik: tombol berubah menjadi "Set ke maksimum (3.120,00)" + satu paragraf sebab (likuiditas venue).
3. Pilih `max_loss` 0% (default) → copy: "Jika penarikan memerlukan penjualan dengan kerugian, transaksi akan gagal. Dana Anda tetap di vault."
4. Konfirmasi: assets, shares dibakar, `max_loss`, perkiraan waktu.
5. Hasil: "Ditarik 3.120,00 USDG. 9.360,00 USDG tetap di vault."

### 2.3 Saat report menunjukkan loss

1. Badge `--signal-warn` di detail: "Report terakhir mencatat kerugian 0,42%."
2. Timeline di portfolio menjelaskan: loss dibakar dari supply, `pps` turun, tidak ada fee performa.
3. Copy tidak menyalahkan "pasar" secara kabur: sebut venue dan tanggal.

## 3. State matrix (wajib ada, bukan opsional)

| State | Pemicu | Tampilan | Aksi tersedia |
|---|---|---|---|
| `idle` | data segar | angka normal | deposit / withdraw |
| `data-stale` | > 30 menit tanpa update | pill "data per block N" | refresh, tetap boleh tx setelah refetch |
| `deposit-capped` | `maxDeposit = 0`, `deposit_limit` penuh | "Kapasitas penuh" + angka cap | notifikasi saat cap naik |
| `deposit-paused` | `paused = true` | banner insiden + kanal status | — |
| `deposit-shutdown` | `shutdown = true` | "Vault ditutup permanen; penarikan tetap dibuka" | withdraw |
| `withdraw-partial` | `maxWithdraw < diminta` | slider turun otomatis + sebab | tarik sebagian |
| `withdraw-loss-guard` | `max_loss = 0` dan perlu loss | penjelasan + opsi naikkan `max_loss` | ubah toleransi |
| `withdraw-halted` | `paused = true` | banner insiden dengan waktu mulai + update terakhir | — |
| `tx-pending` | tx dikirim | progress + hash | lihat explorer |
| `tx-replaced` | nonce diganti | "Transaksi diganti" + hash baru | — |
| `tx-failed` | revert | alasan yang dipetakan (bukan raw hex) | coba lagi |
| `rpc-error` | node gagal | "Tidak bisa membaca chain" + retry | retry |

## 4. Copy (nada: tenang, spesifik, tanpa hiperbola)

| Konteks | Tulis ini | Jangan tulis ini |
|---|---|---|
| Judul katalog | "USDG Managed Yield" | "Maximize your USDG" |
| APY | "Venue net APY 3,71% (24 jam terakhir)" | "Earn up to 12% APY" |
| Likuiditas | "Dapat ditarik sekarang: 73,5 juta USDG dari 538,4 juta (13,6%)" | "Instant withdrawals" |
| Risiko | "Kerugian venue mengurangi nilai vault. Tidak ada jaminan pokok." | "Principal protected" |
| Pause | "Penarikan dihentikan sementara karena insiden. Alasan dan ETA di kanal status." | "Sedang maintenance" |
| Fee | "Fee 10% dari keuntungan saat report, dibayar dalam shares vault." | "Low fees" |
| Audit | "Kontrak inti Yearn V3 (versi 2023) telah diaudit ChainSecurity; kombinasi versi dan adapter Avenor belum diaudit." | "Audited & secure" |

## 5. Edukasi dalam konteks (bukan halaman FAQ panjang)

- Di dekat `max_loss`: satu baris definisi + tautan `docs/WITHDRAWAL_SEMANTICS.md`.
- Di dekat alokasi: tooltip "venue" yang menjelaskan bahwa dana ada di kontrak pihak ketiga dengan kurator bernama.
- Di dekat `pps`: "Harga per share naik saat profit terealisasi, bertahap selama 7 hari."
- Di halaman transparency: daftar dokumen dengan status (`final`/`draft`), jangan menyembunyikan yang masih draft.

## 6. Mobile (390×844)

- Panel transaksi menjadi bottom sheet dengan dua tinggi: `peek` (jumlah + tombol) dan `full` (rincian + `max_loss`).
- Tabel data menjadi daftar `DataRow`; tidak ada horizontal scroll untuk angka uang.
- Angka besar tetap terbaca tanpa zoom; minimum 15px untuk teks isi.

## 7. Onboarding wallet

1. Connect (injected + WalletConnect).
2. Cek chain; tawarkan switch; jangan memaksa `wallet_addEthereumChain` tanpa konfirmasi.
3. Tampilkan saldo USDG + allowance; bila 0, arahkan ke sumber USDG (tanpa menjanjikan on-ramp yang tidak ada).
4. Tidak ada login/email; tidak ada penyimpanan kunci.

## 8. Kriteria UX lulus

1. Pengguna bisa menjelaskan, tanpa dibantu, mengapa "nilai posisi" ≠ "dapat ditarik" setelah 30 detik di halaman detail.
2. Tidak ada jalur di mana transaksi dikirim dengan `max_loss` default yang tidak dilihat user.
3. Semua 12 state di §3 punya copy final dan screenshot di PR.
4. Tidak ada teks yang mengklaim hasil pasti, audit versi kita, atau likuiditas instan penuh.