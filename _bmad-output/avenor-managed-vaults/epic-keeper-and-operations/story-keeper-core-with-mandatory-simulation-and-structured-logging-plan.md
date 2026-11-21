---
title: "Keeper core with mandatory simulation and structured logging"
ticket: 1
status: done
baseline_revision: '8ceb03880b022eba5fb5087c29cddde9c9aaf0de'
route: 'full'
risk: 'high'
review: 'keeper tests + verify-all gate'
context: 'epic 6, S5'
---

# Keeper core with mandatory simulation and structured logging

## Tujuan

Runtime keeper yang tidak pernah mengirim transaksi yang sudah gagal di simulasi, dapat menjelaskan
setiap keputusan dari log, dan bisa dihentikan tanpa meninggalkan transaksi setengah jalan.

## Yang dibangun

| File | Isi |
| --- | --- |
| `services/keeper/src/log.ts` | `LogEntry` (`ts, level, job, blockNumber, status, reason?, txHash?, calldata?, nonce?, detail?`), `jsonLogger`, `memoryLogger` |
| `services/keeper/src/sender.ts` | `KeeperSender` (`address`, `nonce()`, `simulate()`, `send()`), `isNonceError` |
| `services/keeper/src/keeper.ts` | `Keeper.runOnce()`: plan → simulate → send, satu in-flight, retry nonce sekali, `stop()` |
| `services/keeper/src/viemSender.ts` | implementasi produksi: `eth_call` untuk simulasi, `sendTransaction` gas `1_500_000`, `revertReason()` |
| `services/keeper/src/config.ts` | parsing env dengan pesan yang menyebut nama variabel |
| `services/keeper/src/main.ts` | loop job + monitor, file kill switch, `SIGINT`/`SIGTERM` |

## Bukti

`node --test --test-concurrency=1 services/keeper/test/keeper.test.ts services/keeper/test/monitor.test.ts`
→ **22 test lulus**.

Yang dibuktikan test dan bukan sekadar diklaim:

- transaksi yang gagal simulasi: `status: "skipped"`, `level: "alert"`, alasan
  `simulation reverted: execution reverted: too much loss`, `sender.sent.length === 0`;
- log memuat `blockNumber` (`"100"`) dan `calldata`, termasuk saat skip;
- kill switch: setelah `stop()`, `runOnce()` melempar `KeeperStoppedError` dan job yang belum
  dijalankan tidak pernah di-plan (counter `planned` tetap 2 dari run pertama);
- nonce basi: kirim gagal `nonce too low` → nonce dibaca ulang, retry sekali, entri `sent` dengan
  nonce baru (10), bukan dua entri palsu;
- error non-nonce (`insufficient funds`) → `status: "failed"`, `sent.length === 0`, tidak di-retry;
- error saat *plan* tidak menghentikan job berikutnya (entri `failed` lalu `skipped`);
- `viemSender` terhadap node HTTP lokal: simulasi `ok`, revert `"too much loss"` terbaca sebagai
  alasan, dan `send` menghasilkan hash dengan raw transaction yang memuat selector `update_debt`;
- `config` menolak `MIN_GAIN_BPS=10001`, address 3 byte, key 2 byte, dan menyebut nama variabel.

## Keputusan

- **Satu transaksi in-flight**; `runOnce` menolak re-entry. Simulasi kedua akan dihitung atas state
  yang sudah tidak ada.
- **Retry hanya untuk error nonce**, sekali. Error lain tidak berubah dalam satu detik; retry buta
  menyembunyikan wallet yang salah isi.
- **`onSent` hanya setelah kirim sukses**, supaya baseline tidak maju pada transaksi gagal.
- **Kill switch menghentikan job, bukan monitor**; file `.keeper-stop` dan signal.
- **Tanpa library nonce management**; konsekuensi serialisasi diterima.

## Batas

- Belum pernah mengirim transaksi ke vault yang dideploy; test memakai node palsu (HTTP lokal).
- `main.ts` adalah wiring dan tidak punya test sendiri; semua keputusan yang di-wire diuji di modul
  yang dipanggil. Ini dicatat di `docs/KEEPER.md` §10, bukan disembunyikan.