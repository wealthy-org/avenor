---
epic: epic-baseline-and-toolchain
date: 2026-11-20
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Retro: Epic 1 — Baseline Reproduction, Toolchain & Compatibility Matrix

## Epic summary

| Ref | Tiket | Status |
|---|---|---|
| 1.1 | Install and pin host toolchain | done |
| 1.2 | Reproduce `VaultV3` bytecode | done |
| 1.3 | Compatibility matrix and Router decision | done |
| 1.4 | `SECURITY_DIFF` 2023 → 2026 | done |
| 1.5 | Pin on-chain reference capture (USDG + venue) | done |

Tidak ada tiket tersisa berstatus `built`, dan `pending_tickets` kosong (`tickets.py status` → `{"total":5,"done":5}`). Kedua tiket yang ditutup pada sesi ini (1.3, 1.5) sebelumnya **tidak punya plan file**, sehingga `tickets.py` membacanya sebagai `planned` walau pekerjaannya sudah selesai; plan-nya ditulis sekarang (`story-compatibility-matrix-plan.md`, `story-reference-capture-pin-plan.md`).

**Rentang diff: tidak dapat diturunkan.** Kedelapan plan di epik 1–2 memberi `baseline_revision` berupa pin vendor (`f449264…`, `48c53ab…`), bukan commit repo ini — `git cat-file -t` pada keduanya gagal. Konsekuensi: tidak ada rentang per-plan; `git_evidence.py` hanya bisa dijalankan pada riwayat repo yang ada (3 commit, `40f4729` → `8b8c485` → `2a6d2e5`). Analisis di bawah memakai pohon pada `HEAD` + riwayat 3 commit itu, dan batas ini dicatat, bukan disembunyikan.

**Inventaris bukti.** Ada: epic file, `tickets.toml`, 5 plan (2 di antaranya ditulis saat retro-prep), `docs/*` dan `scripts/*` di `HEAD`. Tidak ada: story file (tidak ada tiket yang di-pull), session log, retro sebelumnya. Karena session log tidak ada, analisis pelajaran proses dijalankan dari jejak file (plan, commit, output alat), dan itu batasnya.

## Findings

### Aggregate views

**F1 — Kriteria `Done When` 4 tidak tercapai apa adanya. [spec reconciliation]** *(sumber: `epic-baseline-and-toolchain.md:21`, `docs/COMPATIBILITY_MATRIX.md:17,19,28-29`)*
Kriteria menuntut "`Accountant`, `RoleManager`, `DebtAllocator` periphery berjalan terhadap vault pin kita". Yang terbukti hanya `Accountant` (8 unit test pada bytecode `VaultV3` asli dari `packages/core/artifacts`, `test/unit/AccountantFees.t.sol:16-29`). `RoleManager` dan `DebtAllocator` **tidak dijalankan sama sekali**; keduanya tidak dipakai jalur produk (ADR-4: `role_manager` = OZ `TimelockController`; ADR-6: `auto_allocate = false`). Verifikasi tingkat tiket (`tickets.toml` 1.3: "Setiap modul yang dipakai punya test") **terpenuhi**; yang basi adalah kalimat kriteria epiknya. → *fix now (dokumen): rekonsiliasi DW4 ke "modul yang dipakai"*.

**F2 — Tidak ada god-class baru; satu kandidat besar yang tetap kohesif.** *(sumber: `wc -l` di `packages/contracts/script/Deploy.s.sol` = 1141 baris, 41 fungsi; `src/strategies/MorphoVaultStrategy.sol` = 336)*
`Deploy.s.sol` adalah berkas terbesar di repo dan menggabungkan empat tanggung jawab: parse env, deploy+wiring, `_assert*` (~200 baris), dan `writeOutput`+`_writeFeeConfig` (~160 baris). Setiap blok punya batas fungsi yang jelas dan tidak berbagi state global, jadi ini "besar karena pekerjaannya besar", bukan kelas dewa yang mencampur invariant. → *defer*, dengan pemicu: bila epik 3 menambah assertion baru ke berkas ini, pecah `_assert*` dan `writeOutput` ke library terpisah lebih dulu.

**F3 — Duplikasi nyata antara dua skrip operator.** *(sumber: `scripts/fork-test.py:48,61,67,79` vs `scripts/fork-status.py:47,67,77,97`)*
Keduanya menulis ulang resolusi endpoint (`FORK_RPC_URL` → fallback config) dan `eth_call` sendiri-sendiri. Bukan duplikasi hipotetis: `fork-status.py` memakai `cast_call`, `fork-test.py` memakai `rpc_post`, dua implementasi untuk satu protokol yang sama, dan perbedaan redaksi URL sudah berbeda di keduanya. → *defer* (risiko rendah, keduanya < 210 baris), tapi dicatat sebagai kandidat `scripts/lib/rpc.py` saat epik 4 (data plane) mulai menambah pemakai ketiga.

**F4 — Konvensi status tiket dilanggar oleh sesi ini sendiri, dua kali.** *(sumber: error `tickets.py status` → `epic-accounting-fees-and-role-enforcement.md: status 'draft' is not one of in-progress, done, dropped`; `tickets.py status` sebelum perbaikan → `[('1.3','','planned'),('1.5','','planned')]`)*
(a) Lima epic file belum mulai menyimpan `status: draft`, nilai yang bukan anggota enum, dan itu menggagalkan `status` untuk **seluruh** inisiatif, bukan hanya epik itu. (b) Menutup tiket dengan menulis `status = "done"` ke entri `tickets.toml` tidak berpengaruh: status tiket hanya dibaca dari plan. Dua-duanya kesalahan proses, bukan bug produk. → *fix now (sudah diperbaiki di sesi ini)*: `status` dihapus dari 5 epic yang belum mulai; status 1.3/1.5 dipindah ke plan. Pelajaran yang dicegah ke depan: jalankan `tickets.py status` **sebelum** menyatakan tiket selesai, jangan mengarang cara menulis status.

**F5 — Klaim matriks lebih kuat dari buktinya pada satu sel.** *(sumber: `docs/COMPATIBILITY_MATRIX.md:15` baris `IVault.sol`, `packages/contracts/test/unit/GeneratedInterfaces.t.sol`)*
Sel "kompatibel, teruji" untuk salinan `IVault.sol` bersandar pada pemeriksaan generated-interface, bukan pada test yang akan gagal bila urutan field `IVault.Fee` berubah. Peredam riilnya: `AccountantFees.t.sol` memang mendecode fee hasil `report()` vault nyata, jadi kesalahan urutan field akan memunculkan angka salah di test itu. → *accept as-is*, dengan alasan tertulis; klaim yang boleh dibuat: "dipakai dan teramati lewat `AccountantFees`", bukan "punya test khusus urutan field".

### Diff-scope review (inline, scope dipersempit)

Lensa adversarial/edge-case/verification-gap dijalankan **inline** atas berkas yang berubah di `HEAD~1..HEAD` (8 berkas, semuanya dokumentasi + `tickets.toml`) dan atas artefak bukti epik (`COMPATIBILITY_MATRIX.md`, `scripts/fork-*.py`). Tidak ada subagent; penyempitan dicatat di sini. Tidak ada temuan kode dari rentang itu — rentangnya memang tidak memuat kode.

**F6 — Angka matriks dapat diaudit ulang, tapi tidak dapat direproduksi otomatis.** *(sumber: `docs/COMPATIBILITY_MATRIX.md` §3 tabel gas; `scripts/fork-test.py`)*
Tabel gas di dokumen adalah transkrip manual dari output forge. Kalau seseorang mengubah test, tabelnya tidak ikut berubah dan tidak ada gate yang gagal. → *defer*: usulkan `fork-test.py --record` yang menulis tabel itu dari hasil run, saat `verify-all --with-fork` mulai dipakai sebagai gate.

## Behavior verification

Yang benar-benar dijalankan pada sesi ini, bukan diasumsikan:

- `python scripts/verify-all.py` → `ALL CHECKS PASSED`: no secrets, 603 file vendor, 2 generated interface, build, `fmt --check`, **67 unit test lulus**, 14/14 bytecode.
- `python scripts/check-vendor.py` (bagian dari gate) → impl `0x3110D1Eec90f0651C18e75AD37711A8777342504`, API `3.1.1`.
- `python scripts/fork-status.py` → pin `118337511`, fingerprint `steakUSDG.totalAssets = 538856055994280`, dua endpoint `state OK / match`.
- `python scripts/fork-test.py` → 11 test lulus (7 `VenueProbe` + 4 `VaultE2E`) pada pin tersebut, dua run dengan gas identik untuk keempat test `VaultE2E`.
- `python scripts/verify-bytecode.py` → 14/14.

Yang **tidak** dijalankan: tidak ada transaksi ke mainnet, tidak ada deploy ke rantai nyata, dan tidak ada pembacaan venue lewat blok selain pin (pola kas idle antar blok tetap belum diuji — konsisten dengan `docs/REPRODUCIBILITY.md` §8.3).

## Previous-retro follow-through

Tidak ada retro sebelumnya: ini epik pertama yang di-retro di inisiatif ini, dan `epic-baseline-and-toolchain-retrospective.md` belum pernah ada. Jadi tidak ada item yang bisa ditindaklanjuti — dicatat sebagai "belum ada retro sebelumnya", bukan "tidak ada item terbuka".

## Action items

| # | Item | Pemilik | Jenis |
|---|---|---|---|
| A1 | Rekonsiliasi `Done When` 4 epik 1: ganti "`Accountant`, `RoleManager`, `DebtAllocator` … berjalan" menjadi "setiap modul yang dipakai jalur produk punya test; modul yang tidak dipakai dicatat beserta alasannya", dengan rujukan `docs/COMPATIBILITY_MATRIX.md` §1–2. | pemilik dokumen arsitektur | spec reconciliation (menunggu persetujuan manusia) |
| A2 | Jalankan `tickets.py status <folder>` sebelum menandai tiket selesai; status tiket hanya lewat `tickets.py mark` (menulis ke plan), tidak pernah ke entri `tickets.toml`. | agen yang bekerja di repo ini | process lesson (dicatat di `AGENTS.md` bila disetujui) |
| A3 | `errors=` enum epic file divalidasi sebelum commit: `status` hanya `in-progress`/`done`/`dropped`, atau tidak ada sama sekali. Satu nilai salah mematikan `tickets.py status` untuk seluruh inisiatif. | agen yang bekerja di repo ini | process lesson |
| A4 | Pertimbangkan `scripts/lib/rpc.py` untuk resolusi endpoint + `eth_call`, saat pemakai ketiga muncul (epik 4). | pemilik tooling | defer |
| A5 | Pertimbangkan `fork-test.py --record` yang menulis tabel gas ke `COMPATIBILITY_MATRIX.md` §3, agar angka di dokumen tidak menjadi transkrip manual. | pemilik tooling | defer |
| A6 | Pecah `_assert*`/`writeOutput` dari `Deploy.s.sol` bila epik 3 menambah assertion baru ke berkas itu. | pemilik kontrak | defer (berpemicu) |

## Acceptance verdict

**accepted-with-open-items**, kriteria **declared** (epik punya `Done When`).

Alasan: `Done When` 1, 2, 3, 5, 6 terbukti dengan bukti yang bisa ditunjuk (verifikasi bytecode 14/14, 67 unit test, `packages/core/artifacts` dipakai SDK lewat `GeneratedInterfaces.t.sol`, `SECURITY_DIFF.md` ada dengan cakupan yang dinyatakan, capture on-chain lengkap dengan block+timestamp). Butir 4 hanya terpenuhi untuk `Accountant`; sisa namanya adalah modul yang tidak dipakai, sehingga yang salah adalah kalimat kriteria, bukan produk — dan itu dirutekan sebagai A1, bukan dihapus diam-diam.

Tidak ada temuan blocking yang terbuka. Semua tiket epik ini `done`, jadi tidak ada alasan untuk `rejected` dari kelengkapan.

## Open questions

1. Apakah `RoleManager`/`DebtAllocator` benar-benar tidak akan dipakai, atau hanya belum? Keputusan hari ini bergantung pada ADR-4 dan ADR-6; bila keeper (epik 6) kelak butuh batas alokasi otomatis, jawaban ini berubah dan `COMPATIBILITY_MATRIX.md` harus diisi ulang.
2. Apakah `verify-all --with-fork` dijadikan gate wajib? Sekarang opsional karena endpoint publik bisa `429`, dan bukti di sesi ini menunjukkan kegagalan transport memang terjadi satu kali. Gate yang gagal acak akan diabaikan orang.

## Assumptions

Tidak ada user yang dikonfirmasi di tengah run ini (perintahnya satu: eksekusi maksimal, terstruktur, jujur). Pilihan yang dibuat tanpa konfirmasi, dicatat:

- Epic yang di-retro: `epic-baseline-and-toolchain` dan `epic-vault-core-and-adapter` — keduanya epik yang tiketnya sudah habis.
- `status: draft` dihapus dari 5 epic yang belum mulai, dan `epic-vault-core-and-adapter` diubah `draft` → `in-progress`, semata agar `tickets.py status` dapat berjalan; tidak ada pekerjaan yang diklaim selesai oleh perubahan itu.
- Plan untuk 1.3 dan 1.5 ditulis saat retro-prep, karena tiket itu ditutup tanpa plan; isi plan diambil dari pekerjaan yang benar-benar dilakukan di sesi sebelumnya, bukan dari ingatan.
- Verdict `accepted-with-open-items` dipilih tanpa konfirmasi manusia; A1 tetap menunggu persetujuan manusia sebelum dokumen epik diubah.