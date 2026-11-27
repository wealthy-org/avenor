# WEB_DEPLOYMENT_GUIDE — Panduan Deployment & Uji Penerimaan Pengguna (UAT)

Panduan resmi untuk **deployment antarmuka web ke lingkungan produksi (Vercel)** dan **Protokol Uji Penerimaan Pengguna (User Acceptance Testing / UAT)** dengan dompet nyata, disusun oleh **Sally** (UX Designer & Frontend Lead) bersama **Amelia** (Lead Developer).

---

## 1. Arsitektur Antarmuka Web Avenor

Antarmuka web Avenor dibangun di atas **Next.js 15 (App Router)** dengan prinsip non-kustodian, transparan, dan fail-closed:
- **10/10 Static Routes Terkompilasi:** Prerendering penuh untuk `/`, `/activity`, `/docs`, `/operator`, `/portfolio`, `/transparency`, `/vaults/[address]`, `/vaults/[address]/deposit`, `/vaults/[address]/withdraw`, `/robots.txt`, dan `/sitemap.xml`.
- **EIP-1193 Global Wallet Navbar:** Terintegrasi di [`apps/web/src/components/Navbar.tsx`](../apps/web/src/components/Navbar.tsx), mendeteksi perubahan akun (`accountsChanged`) dan rantai (`chainChanged`) secara reaktif.
- **Header Keamanan Ketat (CSP):** Dikonfigurasi pada `next.config.mjs` meliputi Content Security Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, dan `Referrer-Policy: strict-origin-when-cross-origin`.

---

## 2. Konfigurasi Deployment Vercel

### 2.1 Variabel Lingkungan (Environment Variables)

Atur variabel lingkungan berikut pada dashboard Vercel (**Project Settings > Environment Variables**):

| Nama Variabel | Nilai Staging (Testnet 46630) | Nilai Produksi (Mainnet 4663) | Keterangan |
|---|---|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `46630` | `4663` | Chain ID target jaringan. |
| `NEXT_PUBLIC_RPC_URL` | `https://rpc.testnet.chain.robinhood.com` | `https://rpc.solidrpc.io/public/evm/4663` | Endpoint RPC utama. |
| `NEXT_PUBLIC_FALLBACK_RPCS` | `https://robinhood.api.onfinality.io/public` | `https://robinhood.api.onfinality.io/public` | RPC cadangan multi-failover. |
| `NEXT_PUBLIC_VAULT_ADDRESS` | `0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0` | *(Diisi pasca deploy mainnet)* | Alamat VaultV3 aktif. |
| `NEXT_PUBLIC_INDEXER_API` | `https://indexer.testnet.avenor.fi` | `https://indexer.avenor.fi` | Endpoint API data plane indexer. |

### 2.2 Langkah Deployment:
```bash
# 1. Masuk ke direktori web
cd apps/web

# 2. Pastikan build statis lulus lokal
npm ci
npm run build

# 3. Deploy via Vercel CLI (atau hubungkan ke git repository)
vercel --prod
```

---

## 3. Protokol Uji Penerimaan Pengguna (UAT Protocol)

Pengujian dilakukan menggunakan dompet Web3 nyata (**Rabby Wallet**, **MetaMask**, atau **Rainbow**) pada jaringan target:

### Skenario UAT-1: Koneksi Dompet Global (Navbar Bar)
- **Langkah:** Buka halaman landing `/`, klik tombol **Connect Wallet** di pojok kanan atas navbar.
- **Kriteria Penerimaan:**
  1. Modal pemilihan dompet terbuka, meminta otorisasi EIP-1193.
  2. Setelah terhubung, tombol berubah menjadi pill alamat terpotong (misal: `0x1234...5678`) dan indikator jaringan hijau.
  3. Mengklik pill akun langsung mengarahkan pengguna ke halaman `/portfolio`.
  4. Beralih akun pada ekstensi dompet memicu pembaruan instan pada UI (`accountsChanged`).

### Skenario UAT-2: Alur Deposit dengan Proteksi Slippage & Kuotasi TTL
- **Langkah:** Buka halaman `/vaults/<alamat>/deposit`, masukkan nominal USDG.
- **Kriteria Penerimaan:**
  1. Validasi batas minimum: input di bawah 10 USDG menampilkan pesan peringatan dan menonaktifkan tombol submit.
  2. Perhitungan `minShares` (toleransi slippage default 50 bps) tampil transparan di bawah form.
  3. Terdapat timestamp kuotasi dengan countdown 60 detik; setelah 60 detik lewat, form meminta refresh kuotasi sebelum submit.
  4. Jika vault dalam status `research` atau `deposit_limit == 0`, tombol deposit otomatis terkunci dengan label status yang jelas.

### Skenario UAT-3: Alur Penarikan Fail-Closed (Zero-Loss Default)
- **Langkah:** Buka halaman `/vaults/<alamat>/withdraw`, masukkan jumlah share untuk ditarik.
- **Kriteria Penerimaan:**
  1. Parameter `max_loss` secara ketat disetel ke **0 bps (0%)** secara default untuk menjamin penarikan modal utuh.
  2. UI membedakan secara tegas antara "Nilai Posisi Total" dan "Kapasitas Dapat Ditarik Saat Ini" (berdasarkan kas idle venue).
  3. Jika kas idle venue tidak mencukupi, transaksi ditolak dengan estimasi shortfall daripada membiarkan user mengalami slippage tersembunyi.

### Skenario UAT-4: Transparansi & Pemeriksaan Kontrak On-Chain
- **Langkah:** Navigasi ke menu **Transparency** (`/transparency`) dan **Activity** (`/activity`).
- **Kriteria Penerimaan:**
  1. Daftar seluruh alamat kontrak (Vault, Strategi, Accountant, Hook, Timelock, Safes) tampil dengan tautan explorer blok yang benar.
  2. Seluruh log transaksi dan aktivitas keeper dapat difilter per blok dengan data provenance yang jelas.

---

*Disahkan oleh Sally (UX Lead) & Amelia (Dev Lead) pada 27 November 2026.*
