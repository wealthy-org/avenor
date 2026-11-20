# DESIGN.md — Avenor

Arah visual: **ledger / instrument panel**, bukan landing page kripto. Referensi rasa: laporan bank swasta (Sarasin, Pictet), layar terminal, kertas kontrak. Padat, tenang, tipografi kecil yang rapi, angka tabular.

## 1. Prinsip visual

1. **Angka adalah antarmuka utama.** Setiap angka memakai tabular numerals, rata kanan, desimal konsisten (6 desimal khusus USDG, 2 desimal untuk persen).
2. **Satu warna sinyal, bukan pelangi.** Warna hanya untuk status (aman/perhatian/bahaya), bukan dekorasi.
3. **Garis, bukan bayangan.** Pemisahan lewat hairline 1px dan ruang, bukan kartu bertumpuk dengan shadow.
4. **Tidak ada ilustrasi dekoratif.** Tidak ada blob gradient, tidak ada 3D coin, tidak ada glow.
5. **Kepadatan tinggi yang bisa dibaca.** Ini dashboard produk keuangan; whitespace berlebihan = informasi yang disembunyikan.

## 2. Palet

| Token | Hex | Pemakaian |
|---|---|---|
| `--ink-900` | `#0B0D0C` | teks utama, header |
| `--ink-700` | `#1F2624` | teks sekunder kuat |
| `--ink-500` | `#4A5551` | label, metadata |
| `--ink-300` | `#8C9891` | teks disabled, placeholder |
| `--paper` | `#F6F5F1` | latar utama (off-white hangat, bukan putih murni) |
| `--paper-2` | `#EDEBE4` | panel, baris bergantian |
| `--line` | `#D3D1C7` | hairline |
| `--accent` | `#1F4D3A` | aksi utama, tautan (hijau tinta, bukan neon) |
| `--accent-weak` | `#DCE4DE` | latar aksen halus |
| `--signal-ok` | `#2F6B4F` | status aman |
| `--signal-warn` | `#8A5A12` | likuiditas terbatas, report basi |
| `--signal-risk` | `#8C2F2F` | penarikan tertahan, loss, insiden |
| `--focus` | `#1F4D3A` | ring fokus 2px, offset 2px |

Kontras: `--ink-900` di `--paper` = 15,8:1; `--ink-500` di `--paper` = 5,4:1 (AA). Tidak ada teks di bawah 12px untuk konten, 11px hanya untuk label huruf kapital dengan tracking.

## 3. Tipografi

| Peran | Font | Ukuran/berat |
|---|---|---|
| Display (h1 katalog) | `Söhne Breit` fallback `Inter Tight`, `system-ui` | 40/44, 500, tracking −0,02em |
| Judul bagian | `Inter Tight` | 20/26, 550 |
| Teks isi | `Inter` | 15/24, 400 |
| Data utama | `Berkeley Mono` fallback `JetBrains Mono`, `ui-monospace` | 28/32, 500, tabular |
| Data tabel | mono | 13/20, 450, tabular |
| Label mikro | mono, kapital | 11/16, 500, tracking 0,08em |

Angka uang selalu mono. Tidak ada angka uang di font proporsional.

## 4. Grid & spacing

- Skala 4px: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Kontainer maks 1.240px; gutter 24px mobile, 40px desktop.
- Tabel data: kolom kanan untuk angka; baris 44px (mobile 52px agar bisa disentuh).
- Breakpoint: 640 / 900 / 1200 / 1440.

## 5. Komponen inti

| Komponen | Aturan |
|---|---|
| `DataRow` | label kiri (mono, `--ink-500`), nilai kanan (mono, `--ink-900`), hairline bawah |
| `Amount` | manual: desimal 6 untuk USDG, 2 untuk persen, 4 untuk bps→% kecil; `title` berisi nilai penuh |
| `Provenance` | teks mono 11px: `block 12.345.678 · 14:22:31 UTC · onchain` |
| `StatusPill` | teks kapital mono 11px, latar lembut, tanpa ikon warna-warni |
| `VenueBar` | bar horizontal proporsi alokasi; satu warna aksen + garis `maxRatio` |
| `LiquidityMeter` | angka "dapat ditarik sekarang" + persen, warna `--signal-warn` bila < 100% |
| `MaxLossControl` | stepper 0% / 0,25% / 0,5% / 1% + input manual; default 0%; penjelasan satu baris |
| `PrimaryButton` | tinggi 48px, radius 2px, latar `--accent`, teks `--paper` |
| `DangerBanner` | border kiri 3px `--signal-risk`, latar `--paper-2`, tanpa ikon |

Radius global 2px. Tidak ada kartu radius 16px dengan shadow blur besar.

## 6. Motion

- Hanya dua: (a) transisi opacity 120ms untuk state data, (b) progress bar transaksi indeterminate.
- Tidak ada parallax, tidak ada marquee angka, tidak ada confetti.
- `prefers-reduced-motion` mematikan semua transisi non-esensial.

## 7. Halaman

1. **Katalog** — header + satu baris data vault + tabel venue di bawah (tanpa grid kartu 3 kolom).
2. **Detail vault** — dua kolom: kiri narasi mandat & peran, kanan panel transaksi lengket (sticky) dengan angka.
3. **Transaksi** — modal dua langkah: (1) jumlah & konsekuensi, (2) konfirmasi dengan `max_loss` dan estimasi hasil.
4. **Portfolio** — tabel posisi + timeline report/fee.
5. **Transparency** — tabel alamat, tautan dokumen, riwayat peran, bukti transaksi.

## 8. Yang dilarang

- Gradient ungu/biru, glassmorphism, glow, "AI orb", ilustrasi 3D.
- Angka besar tanpa konteks (mis. TVL 538M tanpa label dan timestamp).
- Warna hijau untuk "yield" tanpa arti status.
- Ikon lucide generik sebagai satu-satunya pembeda makna.
- Copy hiperbolik ("maximize", "unlock", "effortless").

## 9. Aksesibilitas

- Semua kontrol ≥ 44×44 px; focus ring terlihat di `--paper` dan `--paper-2`.
- Tabel punya `<caption>` + `scope`; angka punya `aria-label` yang menyebut satuan.
- Status tidak hanya warna: selalu ada teks (lihat `docs` status pill).
- `max_loss` dinyatakan dua cara: persen dan jumlah asset.