---
title: 'Compatibility matrix and Router decision'
type: 'research'
ticket: 3
created: '2026-11-19'
status: 'done'
completed: '2026-11-20'
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['docs/BASELINE.md', 'docs/SECURITY_DIFF.md', 'packages/contracts/lib/VENDOR.md', 'referensi/yearn-vaults-v3']
---

# Compatibility matrix and Router decision

## Intent

Menutup pertanyaan yang menggantung sejak `BASELINE.md` §2 butir 2: modul `vault-periphery@672de1c` dibangun terhadap `yearn-vaults-v3@5b698f94` (v3.1.0), bukan `f449264` yang kita deploy. Tanpa jawaban eksplisit, setiap pemakaian `Accountant` adalah asumsi.

## Yang dikerjakan

1. Menelusuri modul mana yang benar-benar ada di jalur produk (bukan yang tersedia di upstream).
2. Menolak `Yearn-ERC4626-Router` lewat ADR baru, dengan alasan yang bisa dibantah.
3. Menulis `docs/COMPATIBILITY_MATRIX.md`: satu baris per modul, pin, permukaan ABI yang menyentuh vault, bukti test, vonis.

## Hasil

| Modul | Vonis |
|---|---|
| `VaultV3`/`VaultFactory` (`f449264`) | kompatibel, teruji (bytecode 14/14 + fork e2e) |
| `TokenizedStrategy` impl `0x3110D1Ee…` (`48c53ab`) | kompatibel, teruji (runtime hash + `VenueProbe`) |
| `Accountant` (`672de1c`) | kompatibel, teruji (8 unit test + wiring deploy) |
| `IVault.sol` (`f449264`) | kompatibel, teruji (generated-interface check) |
| `RoleManager`, `TimelockExecutor`, `DebtAllocator` | **tidak dipakai** → tidak diuji, tidak diklaim |
| `Yearn-ERC4626-Router` (`fc96fe36`) | **ditolak** (ADR-11) |

Alasan `RoleManager`/`DebtAllocator` tidak dipakai: `role_manager` dipegang OZ `TimelockController` langsung (ADR-4) dan `auto_allocate = false` (ADR-6). Bukan karena modul itu buruk, tapi karena keduanya menggantikan mekanisme yang sudah lebih ketat.

Alasan Router ditolak (ADR-11): sembilan panggilan yang dipakai app sudah ada di ABI vault, dan Router menyembunyikan `max_loss` di balik helper, padahal aturan produk 2 menuntut `max_loss` eksplisit di setiap panggilan. Menolak berarti tidak ada kontrak AGPL di jalur transaksi dan tidak ada lapisan `approve`/`transferFrom` tambahan yang bisa salah.

## Verification

- `python scripts/check-vendor.py` → 603 file vendor, impl `0x3110D1Ee…`, API `3.1.1`
- `python scripts/verify-bytecode.py` → 14/14
- `forge test` unit → 67 test lulus (termasuk `AccountantFees` 8 test)
- `python scripts/fork-test.py` → 11 test lulus di pin `118337511`

Tidak ada file Vyper/Solidity yang berubah untuk tiket ini; `git status packages/core` bersih.

## Catatan jujur

Kriteria `Done When` epik 1 butir 4 menyebut `Accountant`, `RoleManager`, `DebtAllocator` "berjalan terhadap vault pin kita". Yang terbukti hanya `Accountant`. Dua modul lain tidak dijalankan karena tidak dipakai; itu deviasi terhadap kriteria, bukan pencapaian kriteria. Deviasi dicatat di `docs/COMPATIBILITY_MATRIX.md` §2 dan di retro epik 1 sebagai item rekonsiliasi.