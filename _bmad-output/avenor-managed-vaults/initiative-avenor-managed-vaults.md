---
type: initiative
title: "Avenor Managed Strategy Vaults on Robinhood Chain"
parent: none
status: in-progress
created: 2026-11-19
---

# Initiative: Avenor — Managed Strategy Vaults (USDG Managed Yield)

Network: Robinhood Chain mainnet `4663` (testnet `46630`). Settlement asset: USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (6 decimals).
Fondasi kontrak: Yearn V3 Allocator Vault, pin `yearn-vaults-v3@f449264f` (API `3.1.1`) + `tokenized-strategy@48c53ab` (tag `v3.1.1`) + `vault-periphery@672de1c9`.
Referensi produk/UX: Kassora (bukan dependensi kontrak, pre-launch, unaudited).
Scope: kontrak adapter + periphery, venue integration, app (katalog/detail/transaksi/portfolio/transparency), indexer, keeper, role management, docs, bukti transaksi.

## Baseline teknis terkunci

- `docs/BASELINE.md` — pin commit, compiler, audit, konflik kombinasi versi.
- `docs/REFERENCE_CAPTURE.md` — bukti referensi + gap yang dilarang diklaim.
- `docs/ARCHITECTURE.md` — ADR-1..ADR-10, peta repo, alur dana.
- `docs/ACCOUNTING.md`, `docs/WITHDRAWAL_SEMANTICS.md`, `docs/FEE_CONFIG.md`, `docs/ROLE_PERMISSION_MATRIX.md`, `docs/VENUE_INTEGRATIONS.md`.

## Aturan produk yang tidak bisa dinegosiasikan

1. Vault core tidak dipatch. Kebutuhan yang tidak didukung core = ditolak/ditunda.
2. `max_loss` selalu eksplisit di UI. Default `withdraw = 0`, default `redeem = 10000` — dua-duanya tidak boleh dipakai tanpa persetujuan user.
3. Freeze deposit pakai `deposit_limit`/`deposit_hook`; `setPaused` hanya insiden, dan UI wajib bilang penarikan ikut berhenti.
4. `role_manager` harus timelock sebelum deposit publik dibuka.
5. Tidak ada klaim "audited" untuk kombinasi versi kita, dan tidak ada klaim likuiditas instan 100% saat venue utama hanya sebagian kecil likuid segera (kas idle 5,02% TVL pada pin `118337511`; `maxWithdraw` venue balas `0` sehingga tidak dipakai).
6. Angka UI berasal dari on-chain dengan `blockNumber` + timestamp; tidak ada APY sintetis.

## Epik (7) — lihat `tickets.toml` untuk dependensi

| # | Slug | Cakupan | Status |
|---|---|---|---|
| 1 | `epic-baseline-and-toolchain` | pin, toolchain, reproduksi bytecode, matriks kompatibilitas, `SECURITY_DIFF` | tickets siap |
| 2 | `epic-vault-core-and-adapter` | adapter `MorphoVaultStrategy`, fork harness, deploy + wiring peran | tickets siap |
| 3 | `epic-accounting-fees-and-role-enforcement` | fee, report, 12 kasus penarikan, invariant, penegakan peran | tickets siap |
| 4 | `epic-indexer-sdk-data-plane` | RPC → Postgres, SDK, provenance, rekonsiliasi | tickets siap |
| 5 | `epic-web-app-and-transactions` | katalog, detail, deposit/withdraw, portfolio, transparency | tickets siap |
| 6 | `epic-keeper-and-operations` | alokasi, report, healthcheck, monitoring, runbook | tickets siap |
| 7 | `epic-security-and-limited-launch` | review eksternal, launch terbatas, bukti transaksi, disclosure | tickets siap |

Story plan yang sudah ditulis: epic 1 (toolchain, bytecode, security diff), epic 2 (adapter, fork harness, deploy script). Epik 3–7 masih berupa tickets tanpa `story-*-plan.md`.

## Artefak perencanaan lain

- `prd-avenor-managed-vaults/prd-avenor-managed-vaults.md` — FR/NFR, state matrix, kriteria launch, pertanyaan terbuka.
- `ux-avenor-managed-vaults/{DESIGN,EXPERIENCE}.md` — arah visual dan perilaku termasuk 12 state.
- `spec-avenor-managed-vaults/spec-avenor-managed-vaults.md` — kernel spesifikasi.
- `prfaq-avenor-managed-vaults/`, `brief-avenor-managed-vaults/`, `research-robinhood-chain-usdg-venues/`.
- `party-mode/party-avenor-full-team-review/party-avenor-full-team-review.html` — review lintas peran + 12 keputusan.

## Definisi selesai inisiatif

Kontrak terdeploy di `4663` dengan source terverifikasi (bila explorer tersedia), indexer & keeper stabil 7 hari, app end-to-end (deposit/withdraw/report/portfolio/transparency), role matrix ter-encode dan terverifikasi, seluruh dokumen `docs/*` final, bukti transaksi tercatat, dan review keamanan eksternal dengan temuan kritis nol.