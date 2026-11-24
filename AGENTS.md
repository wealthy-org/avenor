# AGENTS.md — Avenor

Instruksi untuk agen yang bekerja di repo ini. Baca sebelum mengubah apa pun.

## Konteks

Vault ERC-4626 untuk USDG di Robinhood Chain (`4663`), di atas Yearn V3 Allocator Vault `API 3.1.1`. Dokumen sumber kebenaran ada di `docs/`; rencana ada di `_bmad-output/avenor-managed-vaults/`.

## Aturan keras

1. **Jangan mem-patch core Yearn V3** (`packages/core`). Kode baru hanya adapter, hook, script, test. Bila sebuah fitur menuntut perubahan core, tulis ADR baru yang menolak fitur tersebut — jangan ubah kontrak.
2. **Jangan mengarang angka.** Semua angka venue/TVL/likuiditas harus dari RPC atau API dengan `blockNumber` dan timestamp; simpan query di `docs/REFERENCE_CAPTURE.md`.
3. **Jangan mengklaim "audited"** untuk pin 2026, adapter kita, atau konfigurasi kita. Audit upstream 2023 boleh disebut dengan cakupan dan tanggalnya.
4. **Jangan menjanjikan likuiditas instan.** `steakUSDG` hanya sebagian kecil likuid segera (kas idle `27.024.457,98` USDG vs TVL `538.856.055,99` = **5,02%** pada pin `118337511`; `maxWithdraw` venue balas `0` dan tidak boleh dipakai sebagai sinyal). UI wajib membedakan "nilai posisi" dan "dapat ditarik sekarang".
5. **`max_loss` eksplisit.** Jangan memakai default `redeem` (`10000`) maupun `withdraw` (`0`) secara implisit; SDK harus memaksa parameter.
6. **Freeze deposit pakai `deposit_limit`/`deposit_hook`.** `setPaused` hanya untuk insiden dan harus dinyatakan memblokir penarikan.
7. **`role_manager` = TimelockController ≥ 48 jam** sebelum deposit publik. Guardian harus alamat terpisah dan bukan proposer timelock.
8. Jangan commit rahasia (RPC key, private key, `.env`), `out/`, `cache/`, `.venv*`, `node_modules/`.

## Gaya kerja

- Uang: `uint256` 6 desimal (USDG). Tidak ada float. App memakai `bigint` untuk perhitungan.
- Setter VaultV3 memakai camelCase: `setPaused`, `setProfitMaxUnlockTime`, `setName`, `setSymbol`, `set_accountant`, `set_default_queue`, `set_use_default_queue`, `set_auto_allocate`, `set_deposit_limit`, `set_minimum_total_idle`, `set_transfer_hook`.
- Perubahan kontrak wajib disertai test yang gagal sebelum perbaikan (TDD) dan test regresi untuk setiap bug.
- Perubahan parameter (fee, cap, buffer) wajib memperbarui `docs/FEE_CONFIG.md` atau `docs/ARCHITECTURE.md` pada commit yang sama.

## Verifikasi sebelum menyatakan selesai

- `python scripts/verify-all.py` hijau (secrets → vendor → interface → build → fmt → test → bytecode). Itu entry point tunggal; jangan mengandalkan `forge test` saja.
- `forge fmt --check` dan `forge test` (unit + fork + invariant) hijau.
- Untuk perubahan yang menyentuh angka: sertakan query/`eth_call` dan block-nya.
- Untuk perubahan UI yang menyentuh angka uang: screenshot + nilai on-chain pendukung.
- Jangan melaporkan "selesai" bila ada test dihapus/dilemahkan untuk meloloskan perubahan.

## Pitfall tooling yang sudah memakan waktu

- `forge build` di Windows mencetak `Error: Compiler run failed:` **tanpa detail**. Selalu `forge build --json` untuk melihat pesan solc.
- `forge fmt <path>` (path-scoped) tidak menerapkan `line_length` sama seperti `forge fmt` (project-wide). Untuk gate selalu project-wide.
- `forge build` forge 1.9 juga menjalankan linter. Warning-nya tidak menggagalkan gate tapi menandai bug kelas nyata: `environment-read-across-mutation` pada `block.chainid`/`block.timestamp` di sekitar `vm.createSelectFork`/`vm.warp`, dan `reentrancy-events` untuk `emit` sesudah external call. Pakai `vm.getBlockTimestamp()`; untuk chain id pakai cheatcode `getChainId()` — **tidak** dideklarasikan di `forge-std` 1.9.6 (pin hash-verified, jangan diubah), jadi deklarasikan sendiri lewat `staticcall` ke `address(vm)` dan gagal tertutup. Bila sebuah warning memang diterima, matikan per baris (`// forge-lint: disable-next-line(<nama>)`) dan tulis alasannya. Detail: `docs/REPRODUCIBILITY.md` §7.1.
- Artefak basi (`Detected artifacts built from source files that no longer exist`) muncul setelah file test dihapus dan `forge build` men-skip kompilasi. `forge clean` sekali; `out/` dan `cache/` di-ignore jadi tidak ada yang hilang.
- Unit test strategy tanpa fork: alamat kanonik `TokenizedStrategy` (`0x3110D1Ee…`) tidak punya kode, `delegatecall` ke akun kosong "sukses" tapi storage tidak terinisialisasi. `vm.etch` bytecode vendored di alamat itu sebelum membuat strategy.
- `TokenizedStrategy.report()` memanggil `protocol_fee_config()` pada factory immutable; tanpa factory, `report()` revert.
- Fork chain 4663: endpoint arsip yang **terbukti** melayani pin `118337511` (2026-11-19, keyless) adalah `https://rpc.solidrpc.io/public/evm/4663` dan `https://robinhood.api.onfinality.io/public`. Yang sudah mati: `drpc` (pin dipangkas, `Unknown state. First available state is 1`, jendela ~150-200 blok), `publicnode` (`Archive requests require a personal token`), `thirdweb` (`historical state not available`). Jalankan fork lewat `python scripts/fork-test.py` — bukan `forge test --fork-url` langsung — karena forge 1.9 butuh `eth_getAccountInfo`, mengirim parameter blok EIP-1898 berbentuk object yang ditolak endpoint publik, dan default hardfork `london` membuat bytecode venue `PUSH0` halt (`EvmError: NotActivated`). Script menyalakan anvil lokal + `--fork-state-by-number` + `--hardfork cancun`, memverifikasi pin (`ArbSys.arbBlockNumber()` + fingerprint `totalAssets`/`totalSupply`) sebelum forge dijalankan. Diagnosa: `python scripts/fork-status.py`.

- **Script deploy tidak boleh membaca `msg.sender`/`address(this)` di dalam `broadcast`.** Foundry me-revert: `Usage of msg.sender inside a broadcast in script contract detected`. Penanda tangan harus eksplisit (`DEPLOYER_ADDRESS`) dan seluruh deploy berjalan di konteks kontrak script — mendelegasikan ke helper contract membuat `msg.sender` simulasi berbeda dari yang di-broadcast. `vm.startBroadcast(0)` juga revert, jadi "tanpa kunci" butuh jalur terpisah.
- **`vm.serialize*` Foundry hanya menyimpan satu array per objek.** Menyimpan dua array dalam objek yang sama membuat yang kedua menghapus yang pertama (file sempat berisi `{"proposalCalldatas": []}` saja). Satu objek per array, gabung dengan `vm.writeJson(json, path, key)`.
- Rehearsal `DeployLocal.s.sol` di anvil butuh `anvil_setCode` untuk menaruh `TokenizedStrategy` di alamat kanonik; tanpa itu `add_strategy` revert karena `asset()` pada strategi `delegatecall` ke akun kosong.

## Peta file penting

- `docs/BASELINE.md` — pin, toolchain, konflik versi.
- `docs/ARCHITECTURE.md` — ADR dan urutan deploy (sumber kebenaran arsitektur).
- `docs/WITHDRAWAL_SEMANTICS.md` — perilaku penarikan + 12 test case.
- `docs/ROLE_PERMISSION_MATRIX.md` — bit peran dan penugasannya.
- `docs/DEPLOYMENT.md` — mode, urutan deploy, env var, assert, pending actions.
- `_bmad-output/avenor-managed-vaults/` — initiative, epik, tickets, PRD, UX, spec.