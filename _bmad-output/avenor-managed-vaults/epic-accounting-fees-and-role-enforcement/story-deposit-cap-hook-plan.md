---
title: 'DepositCapHook with per-wallet cap and allowlist phase'
type: 'implement'
ticket: 5
created: '2026-11-20'
status: done
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['referensi/yearn-vaults-v3/contracts/VaultV3.vy', 'docs/ARCHITECTURE.md', 'docs/WITHDRAWAL_SEMANTICS.md', 'packages/contracts/src/hooks/DepositCapHook.sol']
---

# DepositCapHook with per-wallet cap and allowlist phase

## Design, and what was rejected

- **Hook mengalahkan `deposit_limit`.** `_max_deposit` membaca hook *sebagai ganti* `deposit_limit`
  (`VaultV3.vy:543-546`), dan `set_deposit_hook` menuntut `deposit_limit == max` kecuali
  `override := True` (`:1458-1487`). Jadi wiring resmi = `set_deposit_hook(hook, true)`, satu
  transaksi, dan setelah itu hook adalah satu-satunya plafon. Ditolak: menjaga keduanya sebagai
  "dua lapis" — angka yang dibaca operator akan berbeda dari angka yang ditegakkan.
- **Cap diukur live, bukan counter.** Tidak ada `post_withdraw` di vault, jadi counter akan
  melenceng permanen. `positionOf(receiver) = convertToAssets(balanceOf(receiver))`,
  `globalRemaining = globalCap − totalAssets()`. `post_deposit` mencatat untuk indexer dan
  memeriksa ulang cap, bukan menghitung cap.
- **Cap hanya untuk `deposit`/`mint`.** Share via `transfer` bisa melewati cap wallet. Allowlist
  transfer adalah urusan `transfer_hook` (matriks peran §1 note), bukan hook deposit; mencampurnya
  memblokir exit.
- **Tidak menyentuh penarikan.** `maxWithdraw`/`redeem` tidak membaca deposit hook, sehingga cap 0
  dan allowlist kosong tetap mengizinkan exit penuh (ADR-5). Dikunci dua test.
- **`onlyGovernance` = timelock 48 jam**, tanpa delay kedua di dalam hook.

## Files

| File | Isi |
|---|---|
| `packages/contracts/src/interfaces/IDepositHook.sol` | dua fungsi ABI yang dipanggil vault (`available_deposit_limit`, `post_deposit`) |
| `packages/contracts/src/hooks/DepositCapHook.sol` | implementasi + 6 setter governance + event |
| `packages/contracts/test/unit/DepositCapHook.t.sol` | 10 test lewat vault, bukan lewat hook saja |

## Tests (10, all green)

| Test | Yang dikunci |
|---|---|
| `test_hookBecomesTheOnlyDepositCeiling` | vault lahir tertutup (`deposit_limit == 0`, `maxDeposit == 0`); setelah override: `deposit_limit == max`, `maxDeposit == cap wallet` |
| `test_perWalletCapIsReleasedByWithdrawing` | deposit tepat di cap; +1 unit revert `exceed deposit limit`; withdraw 100.000 membuka ruang 100.000 |
| `test_walletOverrideWinsOverTheDefault` | override 50.000 menang; set 0 kembali ke default (0 tidak pernah berarti "diblokir") |
| `test_globalCapBindsAfterTheWalletCaps` | dua depositor; yang kedua hanya dapat sisa global; setelah penuh `maxDeposit == 0` |
| `test_allowlistRejectsUnlistedAndAcceptsListed` | belum terdaftar = 0; batch add = boleh; revoke saat posisi terbuka memblokir deposit berikutnya |
| `test_rejectEveryoneStillAllowsFullExit` | allowlist aktif tanpa entri: semua `maxDeposit == 0`, deposit revert, `maxWithdraw` penuh, `redeem` keluar 100% |
| `test_capOfZeroDoesNotBlockWithdrawals` | `globalCap = 0`; user tetap bisa withdraw lalu redeem sampai `totalAssets == 0` |
| `test_everySetterIsGovernanceOnly` | 6 setter menolak non-governance dengan `NotGovernance`; `governance()` = timelock |
| `test_postDepositRecordsAndRejectsStrayCallers` | penelepon liar revert `NotVault`; deposit tercatat; post-check benar-benar revert `CapExceeded` saat posisi di atas cap |
| `test_constructorRejectsZeroAddresses` | vault/governance nol ditolak |

Catatan harness: `vm.etch` bytecode `TokenizedStrategy` di alamat kanonik wajib (kalau tidak
`add_strategy` revert di `asset()`), dan `vm.prank` dikonsumsi oleh *panggilan* berikutnya — pada
`test_capOfZeroDoesNotBlockWithdrawals` saldo di-cache dulu karena `vault.balanceOf(...)` adalah
panggilan yang menghabiskan prank.

## Docs updated in the same commit

- `docs/ARCHITECTURE.md` ADR-13 (hook = satu-satunya plafon, cap live, deposit-only, governance).
- `docs/WITHDRAWAL_SEMANTICS.md` kasus W13 (hook menolak semua ≠ penarikan tertahan).
- `docs/DEPLOYMENT.md` langkah 4: `set_deposit_hook(hook, true)`, angka rencana launch terbatas
  (global 250.000, wallet 25.000, allowlist), dan alasan `set_deposit_limit` dulu akan revert
  `"using deposit limit"`.

## Not done here

- Deploy hook di `Deploy.s.sol`: belum. Hook hanya dipasang pada fase limited launch (epik 5) dan
  parameternya keputusan manusia; memaksanya masuk dry-run akan membuat rehearsal gagal karena
  `deposit_limit` awal 0. Wiring diuji di unit test, dan runbook-nya sudah tertulis.
- `transfer_hook` (allowlist transfer) tetap tidak dipakai — §1 matriks peran mencatat efeknya
  (setara penarikan tertahan) dan itu keputusan produk yang belum diambil.

## Evidence

`forge test --match-path test/unit/DepositCapHook.t.sol` → 10 passed, 0 failed.
`python scripts/verify-all.py` → `ALL CHECKS PASSED`.