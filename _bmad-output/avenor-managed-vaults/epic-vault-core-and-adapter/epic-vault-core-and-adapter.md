---
type: epic
title: "Slice S1 — Vault Core Deployment, Morpho Adapter & Fork Parity"
parent: "initiative-avenor-managed-vaults"
covers: ["S1"]
status: draft
---

# Epic 2: Vault Core Deployment, Morpho Adapter & Fork Parity

## Intent
Membuktikan alur dana nyata: USDG masuk vault Yearn V3, dialokasikan ke `steakUSDG` lewat adapter kita, di-report, lalu ditarik kembali — seluruhnya di fork `4663` dengan venue asli, sebelum ada satu baris UI.

## Outcome
`Deploy.s.sol` menghasilkan state yang bisa diulang (vault + strategi + queue + cap), dan test fork membuktikan deposit → report → withdraw penuh serta withdraw parsial saat likuiditas venue terbatas.

## Done When
1. `packages/contracts` (solc 0.8.18, evm paris, optimizer 200) berisi `MorphoVaultStrategy` + interface + script, `forge build` hijau tanpa warning baru.
2. `MorphoVaultStrategy.totalAssets()` = share venue + idle USDG; `availableDepositLimit`, `availableWithdrawLimit` berperilaku sesuai `VENUE_INTEGRATIONS.md` §3.
3. Fork test `4663`: `deposit 10.000 USDG → update_debt → report → withdraw penuh` lulus; kas idle venue lebih kecil dari nilai posisi menghasilkan penarikan parsial tanpa revert buta. (`maxWithdraw(venue)` **bukan** sinyal: di pin `118337511` ia membalas `0` padahal kas ada dan posisi 8,33 juta bisa ditebus — lihat `docs/VENUE_INTEGRATIONS.md` §4.)
4. `Deploy.s.sol` menjalankan urutan `ARCHITECTURE.md` §5 langkah 1–7 di `anvil --fork` dengan `role_manager` = TimelockController 48 jam (bukan EOA).
5. `deployments/4663.dry-run.json` tercatat: alamat, parameter, tx hash anvil, dan assert bahwa `role_manager` adalah timelock.
6. Tidak ada perubahan pada file Vyper core (dibuktikan dengan `git status` bersih pada `packages/core`).

## Boundaries
- Belum ada indexer/app/keeper.
- Belum deploy mainnet; `--broadcast` hanya boleh setelah epic 3 dan review.
- Tidak menambahkan oracle, leverage, atau DEX swap.

## Risiko
- Venue `steakUSDG` **tidak** punya gate yang terbukti: `maxDeposit` membalas `0` untuk semua alamat sambil menerima `deposit(10_000e6)`, jadi adapter melaporkan "tanpa batas adapter" saat venue membalas nol dan mencoba deposit (dana idle + `VenueDepositSkipped` bila ditolak) — bukan `availableDepositLimit = 0`. Lihat `docs/VENUE_INTEGRATIONS.md` §4a.
- Kas idle venue (`USDG.balanceOf(venue)`) berubah antar blok → test harus pin block number, dan jalur "likuiditas turun" diuji terpisah. Batas yang diuji = `min(convertToAssets(balanceOf(strategy)), kas idle)`.
- Salah mengartikan `convertToAssets` vs `previewRedeem` → accounting melenceng; test harus membandingkan keduanya dan mendokumentasikan selisih.