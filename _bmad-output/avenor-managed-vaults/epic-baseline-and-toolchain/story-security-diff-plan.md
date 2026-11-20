---
title: 'Author SECURITY_DIFF between audited 2023 commits and pinned 2026 commits'
type: 'research'
ticket: 4
created: '2026-11-19'
status: 'done'
baseline_revision: 'f449264ff4f8bebe9a6bf72e43095304fdf101b8'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
review: 'none'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['docs/BASELINE.md', 'docs/REFERENCE_CAPTURE.md', 'referensi/yearn-vaults-v3/audits']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Audit yang tersedia (ChainSecurity/Statemind/YAcademy) menargetkan kode 2023, sedangkan pin kita adalah commit 2026 dengan branch `security/node-nov2026-security-fixes`. Menyebut "audited" untuk kode 2026 adalah klaim salah, dan mengabaikan selisih berarti kita tidak tahu bug apa yang pernah ada lalu diperbaiki.

**Approach:** Tentukan commit yang diaudit, diff terhadap pin kita, klasifikasikan setiap perubahan (breaking / security-relevant / perilaku accounting / kosmetik), dan tulis `docs/SECURITY_DIFF.md` berisi dampak per perubahan terhadap desain produk kita.

</frozen-after-approval>

## Implementation Notes

- Mulai dari PDF audit untuk menemukan hash commit yang diaudit (biasanya tercantum di halaman awal/lampiran). Bila tidak ada, pakai tanggal audit + tag rilis terdekat, dan tulis keterbatasannya.
- Diff yang relevan: `contracts/VaultV3.vy`, `contracts/VaultFactory.vy`, `contracts/interfaces/*.vy`. Untuk strategi: `src/TokenizedStrategy.sol`, `src/base/*`.
- Fokus pada area yang kita pakai: `_redeem`/`_max_withdraw`, `_process_report`, `update_debt`, role enforcement, `_convert_to_shares`, hook deposit/withdraw, `shutdown_vault`.
- Setiap perubahan berkategori:
  - **breaking** → ABI/semantik beda, wajib dicek ke app/indexer.
  - **security** → jelaskan bug asal dan apakah pin kita sudah aman.
  - **accounting** → apakah test fee/report kita masih valid.
  - **cosmetic** → dokumentasikan sebagai kosmetik.
- Untuk setiap perubahan security, tambahkan satu test regresi baru (didaftarkan sebagai ticket lanjutan di epic 3), jangan hanya dicatat.
- Jangan mengambil kesimpulan dari judul commit; baca diff.

## Acceptance Evidence

1. `docs/SECURITY_DIFF.md` memuat: commit audit (dengan bukti), commit pin, tabel perubahan berkategori, dan daftar test tambahan.
2. Daftar test tambahan tertaut ke ticket di epic 3 (id disebut eksplisit).
3. `docs/BASELINE.md` §3 diperbarui agar tidak lagi menyiratkan kode 2026 sudah diaudit.
4. Tidak ada frasa "audited" tanpa cakupan dan tanggal.

## Out of Scope

- Menjalankan audit baru (epic 7).
- Perubahan pada core (dilarang).

## Completion Evidence (2026-11-19)

`docs/SECURITY_DIFF.md` ditulis. Isi pokok:

- Rentang `v3.0.2` (`cb9be33`) → `f449264`: 7 commit yang menyentuh `contracts/`, 21 file, +794/−413; `VaultV3.vy` 504 baris berubah.
- Perubahan berkategori (security/accounting/breaking/cosmetic) dengan lokasi baris di pin kita, termasuk: `unsafe_sub` di `_redeem` (`:898`) dan `_update_debt` (`:1069`), fix refund accounting `_process_report` (`:1296`, `:1307`), `transfer_hook` + `@nonreentrant` di `transfer`/`transferFrom` (`:361-363`, `:1952-1966`), `API_VERSION` `3.1.1` (`:192`), `strategy == self` report (`:1150`), `set_auto_allocate` (`:1429`).
- `TokenizedStrategy` `v3.0.0` → `48c53ab`: `TokenizedStrategy.sol` ditulis ulang (1.822 baris), `BaseTokenizedStrategy.sol` → `BaseStrategy.sol`, `TokenizedStrategyLib.sol` baru. Karena kita memakai implementasi kanonik on-chain (ADR-1 amendemen), bukti yang relevan adalah kecocokan bytecode: 18.224 B, masked 18.171 B, 0 byte berbeda di mainnet dan `4663`.
- 7 test regresi (T1–T7) ditautkan ke id tiket epic 3/6 secara eksplisit.

Yang **belum**: diff baris-per-baris seluruh 504 baris `VaultV3.vy`, urutan parameter `deploy_new_vault` di pin kita, dan diff `vault-periphery@672de1c` vs `5b698f94`. Ketiganya tetap tercatat sebagai pekerjaan terbuka di `docs/SECURITY_DIFF.md` §7 dan `docs/BASELINE.md` §6 — statusnya "sebagian tuntas", bukan "tuntas".
