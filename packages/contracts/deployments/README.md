# Deployment records

`<chainId>.<mode>.json` ditulis `script/Deploy.s.sol`. Jangan edit manual.

- `4663.dry-run.json` / `4663.stage.json` / `4663.prod.json` — ditulis untuk `chainId` `4663`.
- `31337.*.json` — rehearsal anvil via `script/DeployLocal.s.sol`. Alamat di dalamnya
  milik chain lokal, bukan chain 4663; `placeholdersUsed: true` menandai bahwa
  guardian/keeper/treasury berasal dari `makeAddr`.

**Field `deployment.recordedOn` wajib menentukan sumbernya** (`"chain"` atau `"anvil-fork"`).
Anvil fork mempertahankan `chainId` `4663` dari state yang difork, jadi `chainId` saja tidak
membedakan deploy nyata dari rehearsal.

> **`4663.stage.json` saat ini `recordedOn: "anvil-fork"`.** Isinya rekaman run rehearsal di
> anvil fork yang mengemulasi `chainId` `4663` (record `blockNumber` `26450152` milik run
> lokal itu, bukan fork yang dipin di `118337511`). `eth_getCode` untuk vault, factory, dan
> emergency timelock di chain `4663` mengembalikan `0x`, jadi file ini **bukan** bukti deploy
> dan tidak boleh dipakai sebagai sumber alamat produksi.

Nama file memuat `chainId` supaya rehearsal lokal tidak pernah menimpa catatan
deployment nyata.

Seksi `feeConfig` adalah bukti fee, bukan dekorasi: `performanceFee`/`maxGain`/`maxLoss`
dibaca dari `Accountant.getVaultConfig(vault)`, dan `strategyPerformanceFee` (harus `0`)
plus `strategyProfitMaxUnlockTime` (harus `0`) dibaca dari strategi. Kalau salah satu dari
yang terakhir bukan nol, deploy gagal sebelum file ditulis — jadi file yang ada tidak pernah
menggambarkan strategi yang menagih fee kedua.
