---
title: 'Withdraw flow with explicit max_loss and partial withdrawal UX'
type: 'implement'
ticket: 4
created: '2026-11-22'
status: built
baseline_revision: '470fc88'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
review: 'none'
review_source: 'pinned'
---

# Penarikan: `max_loss` eksplisit, plafon satu blok, peringatan yang diuji

## Hasil

- `apps/web`: **83 test** hijau (sembilan berkas), `tsc --noEmit` 0 error, `next build` hijau:
  `/vaults/[address]/withdraw` rute dinamis 4,75 kB (219 kB First Load JS, viem di klien).
- `apps/web/src/lib/withdraw.ts` (16 → 18 test di `test/withdraw.test.ts`): `parseShareInput`,
  `parseLossBps`, `withdrawBlockers`, `withdrawWarnings`, `quoteWithdraw`, `submitWithdraw`,
  `readWithdrawEvent`, `idleCoverageBps`, `maxLossAssets`, `MAX_LOSS_BPS`.
- `apps/web/test/fakeChain.ts` dibagi dengan deposit: satu node JSON-RPC skrip, `chain.logs` mutable,
  `scriptedSigner` merekam `{abi, address, args, functionName, account}`.

## Interaksi yang dijaga

1. `max_loss` dikirim sebagai argumen eksplisit ke `prepareWithdraw`/`prepareRedeem`
   (`args[3]`); test memeriksa `sent.args[3]`, bukan regex pada calldata. `parseLossBps` menolak
   `>= 10000` dengan pesan "seluruh nilai"; SDK juga menolak `maxLoss` yang hilang
   (`MissingMaxLossError`), jadi default kontrak (`withdraw`=0, `redeem`=10000) tidak bisa terpakai.
2. `quoteWithdraw` memakai satu `blockNumber`: preview mode terpilih, plafon mode yang satunya,
   `balanceOf`, `totalIdle`, `convertToAssets(shareBalance)`. Mode `assets` mengambil `maxAssets` dari
   `previewWithdraw` (SDK sudah membaca `maxWithdraw`), mode `shares` dari `previewRedeem`.
3. `withdrawBlockers` menerima kode + kalimat: `paused`, `invalid_loss_limit`, `exceeds_max`,
   `insufficient_shares`, `nothing_to_withdraw`. `submitWithdraw` memeriksa ulang daftar itu sebelum
   menandatangani.
4. `withdrawWarnings` memetakan kasus dokumen ke kalimat yang tampil di UI: W3 (nilai posisi > plafon),
   W4 (10000 bps), W6 (`paused`, dengan kutipan `assert not self.paused`), W7 (shutdown), dan
   `idle` (permintaan melebihi kas idle). Kalimat itu diuji di `test/withdraw.test.ts`, bukan hanya
   ditulis di JSX.
5. Tombol "Maks" mengisi `maxWithdraw`/`maxRedeem`, bukan saldo penuh.
6. Angka final dari event `Withdraw(sender, receiver, owner, assets, shares)`, hanya log vault.
   Receipt sukses tanpa event = `no_event`.

## Batas yang diakui (kenapa `built`, bukan `done`)

1. Belum ada vault hasil `Deploy.s.sol` di chain 4663, jadi tidak ada transaksi penarikan nyata.
   Test berjalan pada node JSON-RPC skrip + penanda tangan skrip.
2. `NEXT_PUBLIC_RPC_URL` belum diset di deployment mana pun; tanpa itu form menolak membaca chain.
3. Estimasi waktu untuk dana di luar kas idle tidak ditampilkan: tidak ada data untuk menghitungnya.
4. `maxWithdraw` venue balas `0` pada pin `118337511`; angka venue tidak dipakai sebagai sinyal
   likuiditas di UI mana pun.

## Verifikasi

```
cd apps/web
node node_modules/typescript/bin/tsc --noEmit
node --test --test-concurrency=1 test/*.test.ts
node node_modules/next/dist/bin/next build
cd ../..
python scripts/verify-all.py
```