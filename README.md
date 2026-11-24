# Avenor — USDG Managed Yield (Robinhood Chain)

Vault ERC-4626 di Robinhood Chain (`4663`) yang mengalokasikan USDG ke venue pinjaman terpilih, dibangun di atas **Yearn V3 Allocator Vault (`API 3.1.1`)** tanpa mem-patch core, dengan peran bertimelock, fee yang dihitung on-chain, dan pengungkapan likuiditas apa adanya.

> Status: **perencanaan + dokumen teknis + toolchain terverifikasi**. Belum ada kontrak yang dideploy, belum ada audit untuk kombinasi versi 2026, dan belum ada transaksi mainnet. Semua klaim di repo ini harus bisa ditelusuri ke `docs/`.

## Baca dulu

| Dokumen | Isi |
|---|---|
| [`docs/BASELINE.md`](docs/BASELINE.md) | pin commit, toolchain, konflik versi, definition of done |
| [`docs/REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md) | cara mengulang build + bukti bytecode (14/14 cek) dan keadaan chain `4663` |
| [`docs/REFERENCE_CAPTURE.md`](docs/REFERENCE_CAPTURE.md) | bukti yang diambil dari sumber, gap, tabel venue |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | peta repo, ADR-1..ADR-10, alur dana, urutan deploy |
| [`docs/ACCOUNTING.md`](docs/ACCOUNTING.md) | formula share price, report, fee 3 lapis, definisi angka UI |
| [`docs/WITHDRAWAL_SEMANTICS.md`](docs/WITHDRAWAL_SEMANTICS.md) | `max_loss`, pause vs shutdown, antrean, 12 test case |
| [`docs/VENUE_INTEGRATIONS.md`](docs/VENUE_INTEGRATIONS.md) | gate G1–G8, spesifikasi adapter, 6 venue, failure mode |
| [`docs/FEE_CONFIG.md`](docs/FEE_CONFIG.md) | parameter Accountant, jebakan `maxFee`, config v1 |
| [`docs/ROLE_PERMISSION_MATRIX.md`](docs/ROLE_PERMISSION_MATRIX.md) | 14 bit peran → fungsi, penugasan, test wajib |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | mode deploy, urutan yang tidak boleh ditukar, env var, assert, pending actions |

Perencanaan BMAD: [`_bmad-output/avenor-managed-vaults/`](_bmad-output/avenor-managed-vaults/) — initiative, 7 epik + tickets, PRD, UX, spec, PRFAQ, research, dan catatan review tim (`party-mode/`).

## Fakta yang membentuk desain

- `steakUSDG` (`0xBeEff033F34C046626B8D0A041844C5d1A5409dd`) adalah venue utama: ~538 juta USD TVL dengan ~73,5 juta USDG likuid segera (**13,6%**). Bukan likuiditas instan.
- `setPaused(true)` memblokir penarikan (`VaultV3.vy:774`, `:592`). Karena itu freeze risiko memakai `deposit_limit`/`deposit_hook`, bukan pause.
- `withdraw` default `max_loss = 0`; `redeem` default `max_loss = 10000`. SDK tidak boleh mengekspos default itu.
- Core tidak punya virtual shares → anti share-inflation lewat seed dead shares + minimum deposit.
- Audit yang tersedia menargetkan kode 2023, bukan pin 2026. Tidak ada klaim "audited" untuk kombinasi kita.

## Struktur target

```
packages/core        artefak beku VaultV3/VaultFactory (Vyper tidak dipatch) + script verifikasi
packages/contracts   MorphoVaultStrategy, DepositCapHook, script deploy, test (Foundry, sudah ada)
packages/contracts/lib  dependensi vendored + hash-verified (OZ 4.9.5, tokenized-strategy 3.1.1, forge-std 1.9.6)
packages/sdk         pembaca state, penulis tx, encode max_loss wajib, parser log
packages/indexer     RPC → Postgres, rekonsiliasi
packages/keeper      alokasi, report, healthcheck
packages/app         katalog, detail, transaksi, portfolio, transparency
packages/config      alamat + parameter per chain
docs/                dokumen wajib brief §17
deployments/         catatan deploy per mode
```

## Batasan yang tidak boleh dilanggar

1. Core Yearn V3 tidak dipatch; kode baru hanya adapter + hook.
2. `max_loss` selalu eksplisit di setiap transaksi.
3. `role_manager` = `TimelockController` ≥ 48 jam sebelum deposit publik.
4. Tidak ada angka UI tanpa provenance (`blockNumber` + sumber).
5. Tidak ada klaim "audited", "instant liquidity", "principal protected", atau janji hasil.

## Blocker saat ini

- Verifikasi source on-chain belum bisa: `robinhoodchain.blockscout.com` diblokir Cloudflare dan `docs.robinhood.com` gagal TLS (sertifikat kedaluwarsa + redirect ISP). Jalur pengganti yang dipakai: bandingkan keccak bytecode lokal vs `eth_getCode`.
- RPC publik chain `4663` tidak punya arsip (`403 "Archive requests require a personal token"`), jadi analisis historis harus dari indexer sendiri, bukan query blok lama.
- Belum ada transaksi mainnet → `docs/ACCEPTANCE_EVIDENCE.md` (ticket 4 epic 7) belum bisa diisi.
- Kombinasi `vault-periphery@672de1c` vs `yearn-vaults-v3@5b698f94` (v3.1.0) belum diuji terhadap ABI vault kita (`Accountant`/`RoleManager`/`DebtAllocator`).

Sudah selesai dan terverifikasi: toolchain (Foundry `1.9.0`, Python 3.11 + Vyper `0.3.10`/`0.3.7`, solc `0.8.18`), reproduksi bytecode v3.0.2 on-chain, build deterministik pin v3.1.1, dan kecocokan `TokenizedStrategy v3.1.1` dengan implementasi kanonik di chain `4663`. Rincian: `docs/REPRODUCIBILITY.md`.

`packages/contracts` sudah berdiri: build hijau (`forge build`, `forge fmt --check`, 101 unit test), strategi `MorphoVaultStrategy` + `script/Deploy.s.sol` (termasuk `Accountant` fee/limit) + `DeployLocal.s.sol` rehearsal, interface `IVaultV3`/`IVaultFactory` **di-generate** dari artefak yang diverifikasi (bukan `cast interface`), dependensi vendored + dicek `scripts/check-vendor.py` (603 file, byte-for-byte sama dengan commit pin), dan `packages/config/4663.json` sebagai satu sumber alamat + provenance blok.

Fork test chain `4663` (pin `118337511`) **hijau**: 11 test melawan state venue asli (`VenueProbe` 7 probe + `VaultE2E` 4 test), dua run berurutan. Perintahnya satu, dan tiga flag wajib (`--fork-state-by-number`, `--hardfork cancun`, anvil lokal) sudah dibungkus di script:

```bash
python scripts/fork-status.py        # apakah pin masih dilayani RPC mana pun
python scripts/fork-test.py -vv      # anvil fork + verifikasi fingerprint + forge test
```

Temuan yang mengubah kode: `steakUSDG.maxWithdraw()` membalas `0` walau kas idle `27.024.457,979514` USDG (dan seluruh posisi 8,33 juta bisa ditebus). Adapter sekarang mengukur `min(nilai posisi, kas idle venue)` — lihat `docs/VENUE_INTEGRATIONS.md` §4.

Satu perintah untuk memeriksa ulang seluruh klaim yang bisa diperiksa lokal:

```bash
python scripts/verify-all.py          # dependensi vendored, interface, build, fmt, test, bytecode
python scripts/verify-all.py --with-web-build   # + `next build` app (~40s, opt-in)
```

`verify-all.py` tidak menjalankan fork test (butuh jaringan); jalankan `scripts/fork-test.py` terpisah.
Gate yang tidak jalan (fork, bytecode, web build) selalu disebut namanya di ringkasan, dan run parsial
mencetak `ALL CHECKED CHECKS PASSED — N GATE(S) NOT RUN`, bukan `ALL CHECKS PASSED`.

Rencana kerja: lihat `_bmad-output/avenor-managed-vaults/initiative-avenor-managed-vaults.md` dan `tickets.toml`.