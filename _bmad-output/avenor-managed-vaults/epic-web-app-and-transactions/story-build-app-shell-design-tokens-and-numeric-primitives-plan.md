---
title: 'Build app shell, design tokens and numeric primitives'
type: 'implement'
ticket: 1
created: '2026-11-22'
status: done
baseline_revision: '05bc220c6336c0fcb2b07b6d53efd63e5b7b8b0c'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'none'
review_source: 'pinned'
---

# App shell, design tokens, numeric primitives

## Hasil

`apps/web` (Next.js 15 App Router, React 19, TypeScript tanpa build step) berisi shell + dua rute
statis dan primitif angka/komponen. Bukti terukur:

- `node node_modules/typescript/bin/tsc --noEmit` → exit 0.
- `node --test` 21 test hijau: `test/format.test.ts` (7), `test/vaults.test.ts` (6),
  `test/components.test.ts` (8).
- `next build` → 3 rute (`/`, `/transparency`, `/_not-found`), First Load JS 102 kB.
- Gate `python scripts/verify-all.py` hijau dengan dua step web baru (`web typecheck`, `web tests`).

## Keputusan

1. **Token CSS, bukan Tailwind.** Yang diwajibkan tiket adalah token yang konsisten; `globals.css`
   memenuhinya tanpa rantai build kedua.
2. **Snapshot lewat `react-dom/server`, bukan Storybook.** `test/components.test.ts` merender markup
   nyata dan meng-assert teks yang dilihat pengguna; ini gagal di gate, bukan menunggu dilihat.
3. **Komponen `.ts` + `createElement`.** Node 24 type stripping tidak mem-parse JSX; dengan `.ts`
   komponen yang sama bisa dirender di test tanpa transpiler tambahan.
4. **Katalog kosong adalah keadaan sah.** `AVENOR_VAULTS` tidak diset → "Belum ada vault", bukan vault
   demo. JSON rusak → error, bukan katalog kosong (dua keadaan itu berbeda).
5. **Tanpa APY, TVL, atau label "audited"** di katalog. Fase default `research`; `limited-launch`
   harus dinyatakan eksplisit.
6. **`liquiditySplit` memisahkan nilai posisi dari yang dapat ditarik** dan menolak `idle > totalAssets`;
   `maxWithdraw` bukan input wajib karena venue membalas `0` untuk posisi likuid di pin.

## Penyimpangan yang dicatat

Tailwind dan Storybook tidak dipakai (alasan di `docs/WEB_APP.md` §2). Kalau keputusan itu harus
dibalik, itu pekerjaan terpisah dengan build step terpisah — bukan tambahan diam-diam.

## Yang tidak diklaim

- Rute `/vaults/<alamat>` (5.2) belum ada; katalog menautkannya dan akan 404 sampai tiket itu mendarat.
- Wallet belum terhubung; belum ada transaksi dari UI.
- `next build` belum masuk gate (waktu); dijalankan manual dan dicatat di `docs/REPRODUCIBILITY.md` §7.