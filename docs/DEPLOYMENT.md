# DEPLOYMENT — Avenor

Dokumen ini menjelaskan **apa yang dijalankan**, **urutan yang tidak boleh ditukar**, dan **assert yang membuat eksekusi gagal** alih-alih menghasilkan deployment yang salah. Sumber kebenaran urutan: `docs/ARCHITECTURE.md` §5; sumber kebenaran wewenang: `docs/ROLE_PERMISSION_MATRIX.md` §2.

Pemegang perintah: satu orang di keyboard, satu orang membaca output `-vv` (aturan review dua orang, `ARCHITECTURE.md` §5 penutup).

---

## 1. Prasyarat: bukti bytecode dulu, deploy kemudian

```bash
cd avenor
python scripts/verify-all.py
```

Harus berakhir `ALL CHECKS PASSED` termasuk `14/14` cek bytecode. Bila tidak: **stop**. Script deploy meng-assert ulang hash di dalam EVM, tapi kegagalan di sini lebih murah dibaca.

Yang di-assert script saat runtime, bukan hanya di CI:

| Objek | Assert | Error |
|---|---|---|
| Blueprint `VaultV3` | `keccak256(code) == 0x6909c58e…` dan `code.length == 23_462` | `BytecodeMismatch` |
| Runtime `VaultFactory` | prefix 3.604 B cocok artifact **dan** ekor 32 B == `abi.encode(blueprint)` | `BytecodeMismatch` |
| Vault | `apiVersion() == "3.1.1"`, `asset`, `decimals`, `FACTORY()`, `deposit_limit == 0`, `auto_allocate == false`, `accountant == 0`, clone → blueprint | `CreationFailed` / `DepositLimitNotZero` |
| Strategi | `tokenizedStrategyAddress() == 0x3110D1Ee…`, `venue`, `management ≈ actor` | `CreationFailed` / `StrategyWiringFailed` |
| Peran | tabel §3 di bawah, dibaca dari `vault.roles(addr)` | `RoleMatrixViolation` |

Ekor immutable itu bukan detail kosmetik: Vyper 0.3.10 menambahkan data section `VAULT_ORIGINAL` (32 B) ke runtime, sehingga `3604 + 32 = 3636` B on-chain vs 3.604 B di artifact. Hash runtime penuh hanya akan cocok untuk satu alamat vault, jadi yang diperiksa adalah prefix + tail.

---

## 2. Mode

| Mode | `DEPLOY_MODE` | `role_manager` vault | Wiring | Kapan |
|---|---|---|---|---|
| Dry-run | `dry-run` | deployer EOA (bootstrap) | dieksekusi script, lalu `transfer_role_manager(timelock)` | anvil / fork. Placeholder `makeAddr` untuk guardian/keeper/treasury, ditandai `placeholdersUsed: true` |
| Stage | `stage` | deployer EOA (bootstrap) | sama dengan dry-run, alamat nyata | testnet / rehearsal |
| Prod | `prod` | **timelock dari block pertama** | **tidak dieksekusi**: script hanya menghasilkan proposal | rilis |

Alasan prod tidak memegang kunci: bila script mengeksekusi wiring, ia harus memegang hot key yang bisa `set_role` apa pun — bertentangan dengan `ROLE_PERMISSION_MATRIX.md` §2 aturan 5. Konsekuensinya prod **tidak** membuka deposit; vault berakhir dengan `deposit_limit == 0` dan proposal yang harus di-*schedule* ke timelock.

---

## 3. Urutan (yang tidak boleh ditukar)

1. **Blueprint** `VaultV3` — raw `CREATE` runtime artifact. Harus sebelum factory: `VaultFactory.deploy_new_vault` memakai `create_minimal_proxy_to(VAULT_ORIGINAL, …)` (`VaultFactory.vy:130-131`).
2. **Timelock darurat** `TimelockController(6 jam, proposer=guardian, executor=guardian)` (ADR-12).
   Dipisah dari timelock governance dan **tidak** bisa menjadi proposer timelock governance.
3. **Factory** `VaultFactory(name, blueprint, governance=timelock)`.
4. **Vault** `deploy_new_vault(asset, name, symbol, role_manager, profit_max_unlock_time=7 hari)`.
   `initialize` tidak menyentuh `deposit_limit`, jadi vault baru tertutup **karena konstruksi**; script tetap meng-assert `deposit_limit == 0`.
5. **Strategi** `new MorphoVaultStrategy(asset, venue, name)`. `venue` immutable — ini sekaligus keputusan venue, tidak bisa diganti tanpa strategi baru.
6. **Wiring** (dry-run/stage dieksekusi; prod masuk proposal):
   - `set_role(timelock, 3995)` — semua bit produk, tanpa `EMERGENCY`/`FORCE_REVOKE`/`DEBT`/`REPORTING`/`DEBT_PURCHASER`
   - `set_role(emergencyTimelock, 4)` — `FORCE_REVOKE_MANAGER` saja (ADR-12)
   - `set_role(guardian, 8192)`, `set_role(keeper, 96)`, `set_role(treasury, 4096)`
   - `set_role(actor, ADD_STRATEGY|QUEUE|MAX_DEBT|DEPOSIT_LIMIT|MINIMUM_IDLE)`
   - `add_strategy(strategy, true)`, `update_max_debt_for_strategy`, `set_minimum_total_idle`, `set_use_default_queue(true)`, `set_deposit_limit(0)`
   - `set_role(actor, 0)` **sebelum** `transfer_role_manager(timelock)`
7. **Handoff strategi** — `strategy.setPendingManagement(management)` + `strategy.setKeeper(keeper)`.
   Dijalankan di **kedua** mode dan sengaja **di luar** proposal timelock.
   Peran `VaultV3` tidak mengatur strategi sama sekali: `management` strategi bisa
   `emergencyWithdraw` ke `performanceFeeRecipient` selamanya, dan timelock bukan
   `management` strategi sehingga ia tidak bisa memanggil `setPendingManagement`.
   Memberi kendali tidak butuh delay — hanya menariknya kembali yang butuh.
8. **Seed** dead shares (opsional, `SEED_ASSETS > 0`, ADR-7): buka `set_deposit_limit(seedAssets)`, `deposit`, `transfer(shares, 0xdEaD)`, `set_deposit_limit(0)`, `set_role(actor, 0)`.
9. **Assert** — `assertSafety()` jalan di setiap mode dan merupakan langkah terakhir, bukan opsional.

Langkah 7 juga yang membuat klaim "vault milik timelock" tidak berhenti di vault: tanpa itu, `role_manager` berpindah tapi strategi tetap di tangan deployer, dan strategi bisa menarik semua dana ke `performanceFeeRecipient` tanpa menyentuh peran vault.

Urutan 6 (`set_role(actor, 0)`) bukan kerapian: tanpa itu, kunci broadcaster yang dicuri setelah deploy masih bisa menambah strategi.

---

## 4. Env var

Disalin dari `.env.example`. `.env` tidak di-commit.

`.env.example` sendiri **di-commit** (`.gitignore` punya `!.env.example`), jadi nilai rahasia tidak boleh ditulis di sana. `PRIVATE_KEY` dan `DEPLOYER_ADDRESS` dibiarkan kosong sebagai contoh. Dijaga oleh `scripts/check-secrets.py`, yang berjalan sebagai langkah pertama `scripts/verify-all.py` dan menolak: nama file terlarang (`.env`, `*.pem`, `*.key`, `id_rsa*`), nilai 64-hex atau mnemonic yang di-assign ke variabel sensitif, serta kredensial di URL. Kunci anvil yang publik masuk allowlist.

| Variabel | Wajib | Default | Catatan |
|---|---|---|---|
| `DEPLOYER_ADDRESS` | ya (broadcast) | `msg.sender` | Alamat penanda tangan. Tidak boleh dibaca `msg.sender` di dalam broadcast, jadi eksplisit. Salah isi → `set_role` pertama revert `NotRoleManager` |
| `PRIVATE_KEY` | salah satu | — | Harus cocok `DEPLOYER_ADDRESS` (kalau tidak: `ZeroAddress("DEPLOYER_ADDRESS != PRIVATE_KEY")`). Kosongkan bila node punya akun terbuka. Isi hanya di `.env`, jangan di `.env.example` |
| `DEPLOY_MODE` | ya | `dry-run` | `dry-run` \| `stage` \| `prod` |
| `USDG_ADDRESS` | — | `0x5fc5360D…d168` | chain 4663 |
| `VENUE_ADDRESS` | — | `0xBeEff033…09dd` | `steakUSDG` |
| `TIMELOCK_ADDRESS` | prod | kosong | Kosong di dry-run → script men-deploy `TimelockController(MIN_DELAY=48 jam, proposers=[proposer], executors=[proposer], admin=0)` |
| `PROPOSER_ADDRESS` | prod | `DEPLOYER_ADDRESS` | Prod menolak EOA dan menolak `== deployer` |
| `GUARDIAN_ADDRESS` | ya | placeholder (dry-run) | Prod menolak EOA. Tidak boleh `== proposer` atau `== keeper` |
| `KEEPER_ADDRESS` | ya | placeholder (dry-run) | |
| `TREASURY_ADDRESS` | ya | placeholder (dry-run) | |
| `MANAGEMENT_ADDRESS` | — | `TIMELOCK_ADDRESS` | Pemilik baru `TokenizedStrategy.management`; handoff tetap dua langkah |
| `STRATEGY_MAX_DEBT` | — | `0` | Batas kredit dalam unit USDG (6 desimal) |
| `MINIMUM_TOTAL_IDLE` | — | `0` | Buffer idle yang tidak boleh di-`update_debt`. Ditulis eksplisit supaya "0 karena lupa" terlihat |
| `SEED_ASSETS` | — | `0` | `0` = lewati seed; minimal produktif 1.000 USDG (ADR-7) |
| `GIT_REV` | — | kosong | Provenance: commit yang dipakai operator, disalin apa adanya ke JSON. Tidak diverifikasi on-chain |
| `VAULT_NAME`, `VAULT_SYMBOL`, `STRATEGY_NAME`, `FACTORY_NAME` | — | `Avenor USDG Managed Vault` / `avUSDG` / `Avenor USDG steakUSDG` / `Avenor Vault Factory` | |

`STRATEGY_MAX_DEBT`/`MINIMUM_TOTAL_IDLE` memakai unit asli token (6 desimal), bukan ether: `1000e6` ditulis `1000000000`.

---

## 5. Perintah

### 5.1 Rehearsal lokal (tanpa RPC asli)

```bash
anvil &
export DEPLOYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/DeployLocal.s.sol --tc DeployLocal \
  --rpc-url http://127.0.0.1:8545 --broadcast -vv
```

`DeployLocal` membuat `MockERC20` + `MockVenue` lalu menjalankan jalur deploy yang sama. Ia juga menaruh salinan `TokenizedStrategy` di alamat kanonik `0x3110D1Ee…` lewat `anvil_setCode`, karena alamat itu kosong di anvil dan setiap panggilan ERC-4626 pada strategi akan `delegatecall` ke ketiadaan.

Output: `packages/contracts/deployments/31337.dry-run.json`. Nama file memuat `block.chainid` supaya rehearsal lokal tidak pernah menimpa catatan deployment 4663.

### 5.2 Chain nyata

```bash
set -a; . ../.env; set +a
forge script script/Deploy.s.sol --tc Deploy \
  --rpc-url "$RPC_URL" --broadcast --verify -vv
```

`--broadcast` hanya setelah dry-run `-vvv` dibaca dua orang. `--verify` akan gagal selama `robinhoodchain.blockscout.com` masih memblokir host ini (Cloudflare) — kegagalan verifikasi bukan alasan mengulang deployment.

---

## 6. Output

`deployments/4663.<mode>.json`:

```json
{
  "deployment": { "chainId", "blockNumber", "timestamp", "mode", "deployer",
                  "vaultOriginal", "factory", "vault", "strategy", "timelock", "emergencyTimelock",
                  "guardian", "keeper", "treasury", "strategyManagement",
                  "profitMaxUnlockTime", "maxDebt", "minimumTotalIdle", "seedAssets",
                  "depositLimit", "placeholdersUsed", "vaultRuntimeHash",
                  "factoryRuntimeHash", "tokenizedStrategyAddress", "gitRev" },
  "pendingActions": { "items": [...] },
  "proposalTargets": { "items": [...] },
  "proposalCalldatas": { "items": [...] },
  "roleMatrix": { "timelock", "emergencyTimelock", "guardian", "keeper", "treasury", "deployer",
                  "strategyActivation", "strategyMaxDebt", "strategyCurrentDebt" }
}
```

`roleMatrix` dibaca balik dari `vault.roles(addr)` dan `vault.strategies(addr)` sesudah wiring — bukan dari niat script. `deployer` harus `0`.

Ditulis sebagai beberapa objek terpisah (`deployment`, `pendingActions`, `proposalTargets`, `proposalCalldatas`): helper `vm.serialize*` Foundry hanya menyimpan satu array per objek, jadi proposal ditempatkan di objeknya sendiri, bukan dicampur.

`pendingActions` adalah bagian jujur dari output: handoff `role_manager` dan `management` adalah **dua langkah**, dan file tersebut mencatat bahwa langkah kedua belum terjadi.

---

## 7. Setelah deploy: yang belum selesai

Semua ini sengaja tidak dilakukan script, dan semuanya tercatat di `pendingActions`:

1. **`accept_role_manager()`** dari timelock (operasi ber-delay 48 jam). Sampai itu terjadi, `role_manager` masih deployer.
2. **`acceptManagement()`** dari `MANAGEMENT_ADDRESS`. Sampai itu terjadi, strategi masih dipegang deployer.
3. **Accountant** (epik 3): sudah di-deploy script (epik 3) dan di-wire; `assertSafety` membaca balik `defaultConfig` + `vaults(vault)` alih-alih mempercayai niat script.
   Di prod keduanya masuk proposal (call 8 dan 9), jadi sampai timelock mengeksekusi, `vault.accountant()` memang masih `address(0)`.
4. **Buka deposit** hanya setelah review limited launch: `set_deposit_hook(hook, override := True)` lewat
   timelock (bukan `set_deposit_limit` dulu). Override menulis `deposit_limit = max` dalam transaksi
   yang sama; tanpa itu panggilan revert `"using deposit limit"`. Setelah hook aktif, satu-satunya
   plafon deposit adalah hook itu sendiri (ADR-13), dan `maxDeposit` = `min(cap global − totalAssets,
   cap wallet − posisi)`. Rencana angka untuk launch terbatas: cap global 250.000 USDG, cap wallet
   default 25.000 USDG, allowlist aktif dengan daftar yang direview di luar repo.
5. **Seed** dead shares bila `SEED_ASSETS == 0`.
6. **Keeper app** (epik 6) — `KEEPER_ROLES`/allowlist.

---

## 8. Batasan yang harus dibaca sebelum prod

- **Timelock tidak punya canceller terpisah.** OZ 4.9.5 `TimelockController` hanya punya `(minDelay, proposers[], executors[], admin)`; argumen canceller baru ada di OZ 5.x. Artinya guardian **tidak** bisa membatalkan operasi yang sudah di-queue. Kekuatan guardian adalah `EMERGENCY_MANAGER` (pause instan), bukan pembatalan proposal. Ini konsekuensi yang diterima, bukan kelalaian.
- **Prod tidak memverifikasi source** secara otomatis; explorer memblokir host ini.
- **`--verify` dan `accept_role_manager` tidak idempoten**: mengulang script membuat set deploy baru. Script idempoten *per run*, bukan *per chain*.
- **Prod menolak EOA** untuk `PROPOSER_ADDRESS`/`GUARDIAN_ADDRESS`, dan menolak proposer == deployer. Di dry-run/stage aturan ini tidak berlaku (Safe belum ada).
- **`MorphoVaultStrategy` argumennya `(asset, venue, name)`** — bukan `(venue, vault)` seperti tertulis di catatan versi lama.

---

## 9. Test

| Berkas | Cakupan |
|---|---|
| `test/unit/DeployScript.t.sol` (12 test) | dry-run lengkap + assert peran; deposit tertutup; handoff strategi dua langkah (dan tidak ada handoff bila target kosong); seed dead shares lalu tutup; prod `role_manager = timelock` dan **tidak ada** grant; prod menolak EOA timelock; prod menolak `getMinDelay < 48 jam`; prod menolak EOA proposer; prod menolak EOA guardian; prod menolak proposer == deployer; guardian == proposer; guardian == keeper |
| `test/unit/Roles.t.sol` (5 test) | `ALL == 16383`, `governanceRoleSet() == 3999`, `keeperRoleSet() == 96`, `dangerousBits() == 13070`, keeper ∩ dangerous == 0 |

Test prod memakai `MockMultisig` (kontrak tanpa perilaku) karena aturan "proposer/guardian harus kontrak" diuji dari sisi `code.length`, bukan dari ABI Safe.

```bash
forge test --offline --match-path 'test/unit/DeployScript.t.sol' -vv
```
