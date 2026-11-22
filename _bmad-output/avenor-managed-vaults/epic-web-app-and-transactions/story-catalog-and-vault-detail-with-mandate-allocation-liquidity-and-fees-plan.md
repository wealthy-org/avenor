---
title: 'Catalog and vault detail with mandate, allocation, liquidity and fees'
type: 'implement'
ticket: 2
created: '2026-11-22'
status: done
baseline_revision: '44458753fb3acb82c9f44ffe502861c2e4108448'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'none'
review_source: 'pinned'
---

# Katalog + detail vault: mandat, alokasi, likuiditas, biaya, peran

## Hasil

Halaman `/vaults/[address]` (`force-dynamic`) merender lima section dari lima endpoint API, masing-masing
dengan provenance sendiri dan kegagalan sendiri. Bukti terukur:

- `apps/web`: **45 test** hijau (`node --test --test-concurrency=1 test/*.test.ts`), `tsc --noEmit` 0 error,
  `next build` hijau: `/` 127 B, `/transparency` 127 B, `/vaults/[address]` 3,46 kB (ƒ dynamic),
  First Load JS 102–105 kB.
- `services/indexer`: **31 test** hijau (`python scripts/db-test.py`).
- Gate `python scripts/verify-all.py`: **ALL CHECKS PASSED** (kontrak 101, SDK, indexer+data plane, keeper,
  web 45, bytecode 14/14, fork di-skip tanpa `--with-fork`).

## Yang dibaca dari chain (bukan dari config)

| Endpoint | Selector | Kenapa |
|---|---|---|
| `/v1/vaults/<a>/live` | `totalAssets() 0x01e1d114`, `totalSupply() 0x18160ddd`, `convertToAssets(1e18) 0x07a2d13a`, `totalIdle() 0x9aa7df94`, `totalDebt() 0xfc7b9c18`, `accountant() 0x4fb3ccc5`, `getVaultConfig(address) 0xde1eb9a3` | angka posisi + biaya yang benar-benar berlaku |
| `/v1/vaults/<a>/allocation?block=` | `default_queue() 0xcb1722ce`, `strategies(address) 0x39ebf823`, `venue() 0xa270a737` | alokasi per strategi tanpa menyimpulkan dari event |
| `/v1/vaults/<a>/roles` | `role_manager() 0x79b98917`, `future_role_manager() 0x9a98f418`, `getMinDelay() 0xf27a0c92` | status timelock dibuktikan, bukan diasumsikan |

Selector dihitung dengan `cast sig`. `Accountant` **tidak** punya getter `performanceFee()`
(`packages/contracts/lib/yearn-periphery/src/accountants/Accountant.sol:472` mengembalikan struct `Fee`);
percobaan pertama memakai `performanceFee() 0x87788782` dibuang sebelum commit. `VaultV3.vy` tidak punya
getter `guardian` — field itu dibuang dari API, bukan diisi angka karangan.

## Aturan yang diuji

- `totalIdle + totalDebt == totalAssets` diperiksa; kalau tidak, `parseLive` melempar error, bukan menampilkan split.
- `source` harus `onchain` untuk `live`/`allocation`/`roles`; body ber-`source: indexed` ditolak.
- Uang tetap `string` → `bigint`; JSON number untuk uang ditolak (`InvalidAmountError`). Basis poin dan
  detik boleh number karena kecil dan eksak.
- `venue()` gagal → `venue: null` + `venueError`; halaman menulis "tidak terbaca (bukan berarti tidak ada)".
- `timelockMinDelaySeconds: null` wajib disertai `timelockError`; keduanya `null` ditolak parser.
- Alokasi selalu diminta pada `?block=<blok live>`; "latest" akan membandingkan dua blok.

## Bug yang ditemukan selama pengerjaan

1. `decodeAddress` memakai `hex.slice(2, 66)` lalu `body.slice(24)` → alamat bergeser dua karakter. Diperbaiki
   di helper, bukan di test.
2. Ekspektasi `debtBps` 9499 salah; nilai benar 9498 (pembulatan `shareBps`). Test dikoreksi ke angka benar.
3. Fixture `addressWordResult` kehilangan leading zero saat `BigInt(VENUE)` diubah ke hex; helper sekarang
   memvalidasi 40 karakter hex.

## Yang tidak diklaim

- Tidak ada CTA deposit; belum ada wallet, belum ada transaksi dari UI (tiket 5.3–5.5).
- Tidak ada angka "dapat ditarik sekarang": `maxWithdraw` venue `0` pada pin `118337511` bukan sinyal.
- Tidak ada APY/TVL dari sumber luar, tidak ada label "audited".
- Halaman belum dijalankan terhadap vault nyata: belum ada vault hasil `Deploy.s.sol` di chain 4663.
  Yang terbukti: parsing, aritmetika `bigint`, dan perilaku error terhadap body API yang dibentuk test.

## Catatan dokumen

`docs/WEB_APP.md` §4 memuat tabel endpoint + enam aturan halaman; `docs/ACCOUNTING.md` §8.1 memuat tabel
selector yang dibaca; `docs/REPRODUCIBILITY.md` §7 diperbarui ke 45 test dan rute dinamis.