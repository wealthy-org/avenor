---
epic: epic-vault-core-and-adapter
date: 2026-11-20
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Retro: Epic 2 — Vault Core Deployment, Morpho Adapter & Fork Parity

## Epic summary

| Ref | Tiket | Status |
|---|---|---|
| 2.1 | Scaffold contracts package with pinned build settings and vendored core | done |
| 2.2 | `MorphoVaultStrategy` adapter with liquidity-aware `freeFunds` | done |
| 2.3 | Fork harness for chain 4663 with pinned block | done |
| 2.4 | `Deploy.s.sol` with role wiring and safety asserts | done |
| 2.5 | Fork end-to-end: deposit, allocate, report, full and partial withdraw | done |

`pending_tickets` kosong (`tickets.py status` → `{"total":5,"done":5}`); tidak ada tiket `built`.

**Rentang diff: tidak dapat diturunkan, dan kali ini alasannya struktural.** Kelima plan memberi `baseline_revision` berupa pin vendor (`f449264…` atau `48c53ab…`), bukan commit repo. Lebih dari itu, seluruh kode epik 1–2 masuk ke repo dalam **satu commit** `40f4729` ("Avenor: vault ERC-4626 USDG di Robinhood Chain (4663)"), jadi bahkan bila baseline-nya commit repo, batas antar-tiket tidak akan terlihat di riwayat. Analisis di bawah karena itu memakai pohon `HEAD` + output alat yang benar-benar dijalankan, dan tidak ada klaim tentang "apa yang berubah di tiket X".

**Inventaris bukti.** Ada: epic file, 5 plan, `docs/*`, `scripts/*`, dan output test yang dijalankan pada sesi ini. Tidak ada: story file (tidak ada tiket yang di-pull), session log, retro epik 2 sebelumnya. Retro epik 1 **ada** (ditulis beberapa menit sebelum dokumen ini) dan dipakai untuk follow-through.

## Findings

### Aggregate views

**F1 — Implementasi mendahului tiketnya, sehingga urutan tiket kehilangan sinyal.** *(sumber: commit `40f4729` memuat `test/fork/VaultE2E.t.sol` (352 baris, 4 test) sekaligus `tickets.toml` yang menandai 2.5 belum selesai; plan 2.5 baru `status: done` pada commit `2a6d2e5`)*
Efeknya konkret: 2.5 berstatus `ready` padahal test-nya sudah ada di pohon, dan yang benar-benar kurang hanyalah **menjalankannya di pin**. Itu membuat "tiket selesai" berarti dua hal berbeda di epik ini (kode ditulis vs bukti dijalankan). Bukan cacat produk; cacat keterlacakan. → *accept as-is* untuk epik ini (tidak ada yang bisa diperbaiki mundur), tetapi dicatat sebagai alasan mengapa retro ini tidak mengklaim batas antar-tiket.

**F2 — `Done When` 5 menyebut nama berkas yang tidak ada.** *(sumber: `epic-vault-core-and-adapter.md:22` → `deployments/4663.dry-run.json`; kenyataannya `packages/contracts/deployments/31337.dry-run.json`; plan 2.4 baris 48 vs 71 dan 89 sudah memakai `<chainId>`)*
Anvil lokal ber-chain-id `31337`, jadi skrip menamai output menurut chain id tempat ia benar-benar berjalan — perilaku yang benar. Yang basi adalah kalimat kriteria. → *fix now (dokumen): rekonsiliasi DW5 ke `deployments/<chainId>.dry-run.json`*.

**F3 — `Deploy.s.sol` 1141 baris: besar, tapi tidak mencampur invariant.** *(sumber: `wc -l` → `script/Deploy.s.sol` 1141; 41 fungsi; blok `_assert*` `:580-806`, `writeOutput`/`_writeFeeConfig` `:807-954`)*
Empat tanggung jawab dalam satu berkas (parse env, deploy+wiring, assertion, output JSON). Tidak ada state global yang dibagi antar blok, dan tidak ada invariant yang bocor antar bagian. → *defer* dengan pemicu: epik 3 menambah assertion → pecah lebih dulu.

**F4 — Angka venue dipakai dengan benar, dan itu terlihat di kode bukan hanya di dokumen.** *(sumber: `src/strategies/MorphoVaultStrategy.sol:299-321`; `test/fork/VenueProbe.t.sol::test_maxWithdrawIsZeroButIdleCashCoversThePosition`)*
Batas penarikan = `min(convertToAssets(shares), USDG.balanceOf(venue))` + idle; `venue.maxWithdraw()` sengaja tidak dipakai, dengan alasan tertulis di kode (venue membalas `0` untuk posisi 8,21 juta share sementara kas idle `27_024_457.979514` USDG bisa menebus seluruhnya). Ini satu-satunya keputusan di epik ini yang salahnya akan diam-diam: bila seseorang "merapikan" kode ini menjadi `maxWithdraw`, tidak ada test unit yang menangkapnya — hanya fork test. → *accept as-is*, tetapi dicatat: **fork test adalah satu-satunya penjaga invariant ini**.

**F5 — Determinisme yang diklaim lebih sempit daripada yang biasa diartikan.** *(sumber: output `fork-test.py` dua run: gas keempat test `VaultE2E` identik; satu percobaan lain `BLOCKED: no endpoint could serve the pinned state` + anvil `failed to create genesis` sementara `fork-status.py` masih `state OK / match`)*
"Deterministik" di sini berarti: pada pin yang sama, dua run menghasilkan eksekusi identik (gas sama). Bukan berarti fork test selalu bisa dijalankan — transport bisa gagal, dan gagalnya berisik, bukan diam-diam pindah blok. Pembeda itu berguna: `fork-status.py` memisahkan "state hilang" dari "test gagal". → *accept as-is*.

**F6 — Cakupan yang tetap belum ada.** *(sumber: `docs/REPRODUCIBILITY.md` §8.3; `docs/VENUE_INTEGRATIONS.md` §4a)*
Pola perubahan kas idle venue antar blok tidak diuji (butuh banyak pin arsip), dan perilaku venue yang menerima deposit sambil membalas `maxDeposit = 0` hanya diuji pada satu pin. Keduanya sudah dinyatakan sebagai gap di dokumen, bukan temuan baru. → *defer*.

### Diff-scope review (inline, scope dipersempit)

Lensa adversarial/edge-case/verification-gap dijalankan inline atas berkas yang benar-benar berubah di `HEAD~1..HEAD` (dokumen + `tickets.toml`, tanpa kode) dan atas berkas produk epik ini (`MorphoVaultStrategy.sol`, `Deploy.s.sol`, `test/fork/*`). Tidak ada subagent; penyempitan dicatat. Tidak ada temuan kode baru dari lensa ini di luar F4–F6.

## Behavior verification

Dijalankan pada sesi ini, bukan diasumsikan:

- `python scripts/verify-all.py` → `ALL CHECKS PASSED`, termasuk **67 unit test** dan 14/14 bytecode.
- `python scripts/fork-test.py` → **11 test lulus, 0 gagal** pada pin `118337511`: 7 `VenueProbe` + 4 `VaultE2E` (`deposit→allocate→report→withdrawAll`, withdraw parsial, akrual venue dilaporkan sebagai gain + fee, shortfall tidak terjangkau).
- Ketiga skenario yang diminta tiket 2.5 ada di suite, dan keempat test `VaultE2E` menghasilkan gas identik pada dua run terpisah (2.394.348 / 2.461.292 / 2.697.109 / 20.214).
- `git status packages/core` bersih sebelum dan sesudah (tidak ada Vyper disentuh).

Tidak dijalankan: deploy ke rantai nyata (`--broadcast`), dan tidak ada transaksi mainnet — sesuai `Boundaries` epik.

## Previous-retro follow-through

Retro sebelumnya: `epic-baseline-and-toolchain/epic-baseline-and-toolchain-retrospective.md` (ada, ditulis 2026-11-20).

| Item retro 1 | Pemilik | Status bukti |
|---|---|---|
| A1 — rekonsiliasi `Done When` 4 epik 1 | pemilik dokumen arsitektur | **belum**: `epic-baseline-and-toolchain.md:21` masih berbunyi "`Accountant`, `RoleManager`, `DebtAllocator` … berjalan". Menunggu keputusan manusia, sesuai aturan retro (tidak auto-apply). |
| A2 — status tiket hanya lewat `tickets.py mark`, jangan ke entri `tickets.toml` | agen repo | **sebagian**: disiplinnya dijalankan (plan 1.3/1.5 ditulis, entri `status` di `tickets.toml` dihapus), tetapi belum dicatat sebagai aturan di `AGENTS.md`. |
| A3 — enum `status` epic divalidasi | agen repo | **ya**: 5 epic yang belum mulai tidak lagi menyimpan `status: draft`; `tickets.py status` kini keluar bersih untuk kedua epik. |
| A4 — `scripts/lib/rpc.py` | pemilik tooling | **defer**, belum ada pemakai ketiga. |
| A5 — `fork-test.py --record` | pemilik tooling | **defer**, belum dikerjakan. |
| A6 — pecah `Deploy.s.sol` | pemilik kontrak | **defer**, pemicu belum terjadi (epik 3 belum mulai). |

## Action items

| # | Item | Pemilik | Jenis |
|---|---|---|---|
| B1 | Rekonsiliasi `Done When` 5 epik 2 ke `deployments/<chainId>.dry-run.json` + sebut chain id lokal `31337` beserta alasan (anvil). | pemilik dokumen arsitektur | spec reconciliation (menunggu persetujuan manusia) |
| B2 | Tambahkan komentar penjaga di `MorphoVaultStrategy._venueLiquidity()` bahwa invariant `min(value, venue cash)` **hanya** dijaga fork test, agar "perapian" ke `venue.maxWithdraw()` tidak lolos review. | pemilik kontrak | fix now (kecil, satu komentar) |
| B3 | Sebelum menutup tiket, jalankan buktinya (bukan hanya menulis test): status tiket = bukti dijalankan, bukan kode ada. | agen repo | process lesson (kandidat baris `AGENTS.md`) |
| B4 | Uji pola kas idle venue antar minimal 2 pin saat endpoint arsip stabil; sampai itu, gap tetap dinyatakan. | pemilik test | defer |
| B5 | Pecah `_assert*`/`writeOutput` dari `Deploy.s.sol` bila epik 3 menambah assertion baru. | pemilik kontrak | defer (berpemicu) |

## Acceptance verdict

**accepted-with-open-items**, kriteria **declared**.

`Done When` 1, 2, 3, 4, 6 terbukti: build hijau tanpa warning baru (gate `verify-all`), `totalAssets`/`availableDepositLimit`/`availableWithdrawLimit` sesuai §3 `VENUE_INTEGRATIONS.md` dengan test unit + fork, e2e fork lulus termasuk withdraw parsial, `Deploy.s.sol` menjalankan urutan `ARCHITECTURE.md` §5 dengan `role_manager` = `TimelockController` 48 jam (dibuktikan `DeployScript.t.sol` 16 test, termasuk penolakan EOA proposer/guardian/timelock dan `guardian != proposer`), dan `packages/core` bersih. Butir 5 terpenuhi secara substansi (`roleMatrix`, `pendingActions`, `feeConfig`, alamat, assert `role_manager` timelock) tetapi nama berkasnya berbeda dari yang tertulis di epik → dirutekan sebagai B1.

Tidak ada temuan blocking terbuka; semua tiket `done`.

## Open questions

1. Apakah `venue.maxWithdraw()` boleh dipakai sebagai *sinyal tambahan* (bukan batas) untuk UI "dapat ditarik sekarang"? Hari ini kode menolaknya sebagai batas, dokumen menolaknya sebagai sinyal. Jawaban yang konsisten dengan `WITHDRAWAL_SEMANTICS.md` masih perlu ditulis di UX saat epik 5.
2. Apakah `verify-all --with-fork` dijadikan gate? Bukti sesi ini: transport bisa gagal satu kali dari tiga percobaan, jadi gate wajib akan merah secara acak kecuali ada retry eksplisit.

## Assumptions

Tidak ada konfirmasi manusia di tengah run ini. Pilihan yang dibuat tanpa konfirmasi:

- Epik yang di-retro: `epic-vault-core-and-adapter` (semua tiketnya habis).
- `status: draft` → `in-progress` pada epic file, hanya agar `tickets.py status` dapat berjalan.
- Verdict `accepted-with-open-items` dipilih tanpa konfirmasi; B1 tetap menunggu persetujuan manusia sebelum epic file diubah.
- Lensa review dijalankan inline (tanpa subagent) dengan scope yang dinyatakan di atas.