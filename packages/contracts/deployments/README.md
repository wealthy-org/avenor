# Deployment records

`<chainId>.<mode>.json` ditulis `script/Deploy.s.sol`. Jangan edit manual.

- `4663.dry-run.json` / `4663.stage.json` / `4663.prod.json` — chain nyata.
- `31337.*.json` — rehearsal anvil via `script/DeployLocal.s.sol`. Alamat di dalamnya
  milik chain lokal, bukan chain 4663; `placeholdersUsed: true` menandai bahwa
  guardian/keeper/treasury berasal dari `makeAddr`.

Nama file memuat `chainId` supaya rehearsal lokal tidak pernah menimpa catatan
deployment nyata.

Seksi `feeConfig` adalah bukti fee, bukan dekorasi: `performanceFee`/`maxGain`/`maxLoss`
dibaca dari `Accountant.getVaultConfig(vault)`, dan `strategyPerformanceFee` (harus `0`)
plus `strategyProfitMaxUnlockTime` (harus `0`) dibaca dari strategi. Kalau salah satu dari
yang terakhir bukan nol, deploy gagal sebelum file ditulis — jadi file yang ada tidak pernah
menggambarkan strategi yang menagih fee kedua.
