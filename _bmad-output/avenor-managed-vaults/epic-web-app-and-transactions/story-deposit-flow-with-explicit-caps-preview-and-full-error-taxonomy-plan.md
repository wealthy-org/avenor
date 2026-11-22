---
title: 'Deposit flow with explicit caps, preview and full error taxonomy'
type: 'implement'
ticket: 3
created: '2026-11-22'
status: built
baseline_revision: '470fc88'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
review: 'none'
review_source: 'pinned'
---

# Deposit: cap eksplisit, preview satu blok, event sebagai angka final

## Hasil

- `apps/web`: **59 test** hijau (tujuh berkas), `tsc --noEmit` 0 error, `next build` hijau:
  `/vaults/[address]/deposit` rute dinamis 108 kB (213 kB First Load JS, viem di klien).
- `services/indexer`: **31 test** hijau; `/live` kini juga membawa `depositLimit`, `isPaused`,
  `isShutdown` dari chain pada blok yang sama.
- Gate `python scripts/verify-all.py`: **ALL CHECKS PASSED** (kontrak 101, indexer 31, keeper, web 59,
  bytecode 14/14).

## Interaksi yang dijaga

1. `/vaults/[address]/deposit` (server) membaca `/live`; tanpa angka chain form tidak dirender.
   `deposit_limit = 0`, `isPaused`, atau `isShutdown` menampilkan status dan tidak merender tombol.
2. `quoteDeposit` membaca `previewDeposit`, `maxDeposit`, `allowance`, `balanceOf`, `deposit_limit`,
   `isPaused`, `isShutdown` pada satu `blockNumber`.
3. `depositBlockers` memberi kode + kalimat untuk `shutdown`, `paused`, `deposit_closed`, `cap_full`,
   `exceeds_cap`, `insufficient_balance`. `submitDeposit` memeriksa ulang daftar itu, bukan hanya UI.
4. Approve tepat sebesar deposit, hanya bila `allowance < assets`; approve gagal = berhenti.
5. `prepareApprove`/`prepareDeposit` (SDK) melakukan `simulateContract` sebelum tanda tangan.
6. Share final berasal dari event `Deposit(sender, owner, assets, shares)` di receipt. Receipt sukses
   tanpa event = `no_event`.

Kode error bermakna: `no_provider`, `no_account`, `wrong_network`, `rejected`, `pending_request`,
`invalid_amount`, `insufficient_balance`, `paused`, `shutdown`, `deposit_closed`, `cap_full`,
`exceeds_cap`, `reverted`, `no_event`, `rpc`.

## Bukti test (14 test baru)

`apps/web/test/deposit.test.ts` menjalankan viem sungguhan terhadap node JSON-RPC skrip:

- input: `1` → `1000000n`, `0.000001` → `1n`; `1,5`, `1 000`, `-1`, `1e6`, `01`, `1.0000001` ditolak.
- blocker per kasus, termasuk kasus `exceeds_cap` + `insufficient_balance` yang memang dua-duanya benar.
- kutipan satu blok (`blockNumber` dipin) dan kegagalan baca → `rpc`, bukan nol.
- approve tepat sebesar deposit (2 tx), allowance cukup → 1 tx, approve gagal → berhenti.
- receipt tanpa event → `no_event`; kutipan terblokir → penanda tangan tidak dipanggil sama sekali.
- signature ditolak (4001) → `rejected`; `-32002` terpisah (`pending_request`).
- wallet: tidak ada provider vs tidak ada akun vs chain salah; `wallet_switchEthereumChain` gagal
  melaporkan alasan, bukan mengaku berhasil.

## Gap yang belum tertutup (sebab `built`, bukan `done`)

Acceptance tiket meminta "E2E test untuk 7 error state + happy path". Yang ada adalah test logika
lengkap pada node skrip, **bukan** browser + wallet nyata, karena belum ada vault hasil
`Deploy.s.sol` di chain 4663 dan tidak ada wallet uji. Yang belum dibuktikan:

1. Happy path di browser terhadap vault terdeploy (receipt nyata, event nyata).
2. Tujuh error state lewat UI nyata (wallet menolak, chain salah, cap penuh di UI, dsb).
3. `NEXT_PUBLIC_RPC_URL` belum diset di deployment mana pun.

## Batas kecil yang diakui

- Simbol aset tampil sebagai "aset": database belum menyimpan simbol aset, jadi yang ditampilkan
  alamatnya. Tidak dikarang "USDG" dari konfigurasi.
- `@avenor/sdk` membawa `viem` sendiri (`file:` dependency); tipe `PublicClient` berbeda secara
  nominal dari app. Di-cast di satu batas (`asSdkClient`) dengan komentar, bukan didiamkan.