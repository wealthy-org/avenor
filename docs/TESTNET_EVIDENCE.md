# TESTNET_EVIDENCE.md — Robinhood Chain Testnet (46630) Stage Deployment

Documented evidence of the Avenor Vault Stack deployment on Robinhood Chain Testnet (Chain ID `46630`), executed per `AVENOR_TESTNET_REPORT.md` §9, §10, and §11.

---

### Gate status redeploy v2 (2026-11-28)

- `python scripts/verify-all.py --with-web-build --with-fork` = **ALL CHECKS PASSED**
  (secrets, vendor, interface, build, fmt, unit+invariant, web tests, web build, fork pin 118337511, bytecode 14/14).
- `check-handover.py --strict` FAIL yang diharapkan: role_manager masih deployer sementara
  sampai eksekusi timelock (2026-11-30T10:20:31Z). Semua invariant lain PASS
  (deposit limit 0, deployer 0 peran, delay 48h, strategy mgmt = Safe).
- Web produksi `https://www.avenorfi.xyz` menunjuk vault v2 `0xFB60...4Dd9`
  (Vercel `AVENOR_VAULTS` production, deploy `dpl_32vX5U4cTUPEAS4UbB5Syx4zN25X`).

## 0. REDEPLOY v2 (2026-11-28) — CURRENT ACTIVE DEPLOYMENT

**Status: the deployment documented in §1 onward (deployer `0x56d8…648`, vault `0xDa4D…7DA0`) is SUPERSEDED.** Its governance handover was blocked permanently: all owner keys of the old Governance Safe `0x24e9…d4AA` were lost (key recovery exhausted — see `docs/REFERENCE_CAPTURE.md` 2026-11-28). The old vault holds 0 assets and is not a user risk, but it is unreachable for role changes.

A full redeploy was executed with keys held in the repository `.env` (all derived addresses confirmed to match the operator's MetaMask accounts):

| Property | Value |
|---|---|
| **Deployer** | `0xf6BAE6C6516Ab237d659F97187C475652514c76A` |
| **Deploy block** | `158777022` (2026-11-28), 30/30 tx mined (broadcast `run-1795860249230.json`) |
| **vaultOriginal** | `0x64Dc3C0913744a27E31Eb8322c36ee9494DAdef8` (tx `0xa21a…5325`) |
| **Factory (VaultV3)** | `0xcA83591e36949a6190957E22DDDB9dad249a57B2` (tx `0xeea3…6d81`) |
| **VaultV3 proxy** | `0xFB6064C2A4CedaD01b2a873E43890D18e1Cb4Dd9` — `apiVersion "3.1.1"`, runtime keccak `0x6909c58e…933` (= blueprint gate) |
| **Accountant** | `0xE72b69440D6ddb12F07A4f0A335062f7aeD3Ad7C` (tx `0xc81a…b6f0`) |
| **Strategy (MorphoVaultStrategy)** | `0xc96479EF4274F7619E1e78FA40bfdb3a367d8291` (tx `0x2d0a…d812`), asset = MockUSDG, management = deployer → pendingManagement = GovSafe |
| **Timelock (48 h, proposer+executor = GovSafe)** | `0x2Bfa51B313AA76d2ED0d8D5971Dd8b3e4235609D` (tx `0x89e2…61a5`) |
| **Emergency Timelock (6 h, proposer+executor = Guardian EOA)** | `0x4B80C02fee19efc0BEb41D921fb3cD54412ad895` (tx `0x52cf…013`) |
| **Governance Safe 2/3** | `0x68b80E963a8D8029d5D3814A7230887c1Ce0251e` — Safe v1.3.0, owners = `0x1437…C60e`, `0xDBCF…0084`, `0x4DC9…a17C` (3 kunci di `.env`), threshold 2 |
| **Guardian (EOA)** | `0x1a7202181f7bDdeFd031C5C45aADA3479A173796` |
| **Keeper (EOA)** | `0x60DF56Aec6bb8ae6BDb96538151FCe91b87D2bFA` |
| **Treasury (EOA)** | `0x43bD76147a1c897Fd7e9FDdED517E392528e556b` |
| **MockUSDG** | `0x686Ba15fdd36A40161a9c64AF21cD5AadA4b5Cf3` (tx `0x41dc…b619`) |
| **MockVenue** | `0xd6f72a73108eba0e5bfc382bb6cd9d3dda751f05` (tx `0x4ffc…8cca`) |
| **TokenizedStrategy** | canonical `0x3110D1Eec90f0651C18e75AD37711A8777342504` (reused, §2.1) |
| **Roles at deploy** | timelock `3995`, emergencyTimelock `4`, guardian `8192`, keeper `96`, treasury `4096`, deployer revoked to `0` after `transfer_role_manager` (deployer interim `1433`) |
| **Deposit state** | `deposit_limit 0`, `max_debt 0`, `minimum_total_idle 0` — closed until handover completes |
| **Gas funding** | Chainstack faucet drip 0.01 ETH to deployer; 0.005 ETH deployer→owner1 internal transfer tx `0xe9681968db3b08bc6ac868dafa2dc4664174f6e7bd4fd32df58e751b83afe9bd` |

### Handover progress (v2)

| Step | Evidence |
|---|---|
| `strategy.setPendingManagement(govSafe)` | done during deploy (tx `0xc072…e350`); `pendingManagement()` = `0x68b8…51e` verified |
| Safe tx #1 `strategy.acceptManagement()` | tx `0x7918213812377a777fa761a79ac2d40d0f4b40adc4bd17cca8929a2fa3340787`; `management()` = GovSafe ✓ |
| Safe tx #2 `timelock.schedule(vault.accept_role_manager(), 48h)` | tx `0xfdfc2efc3945de68b7ce1e6e8c756a56a370bad139efc82fac491ddfbcb17347`; opId `0xf4d2cee45c5fcc789452e0cf9620c4db2be34c3dc3a4e86da44070e21333fc90` (salt 0); `executeAfter = 1796034031` (**2026-11-30T10:20:31Z**) |
| `timelock.execute` | pending — dijalankan otomatis oleh `python scripts/finalize_46630.py run` saat `isOperationReady` (fallback manual: `handover_46630.py execute`) |
| Post-handover | pipeline 5 op timelock + seed dead shares + keeper drill — dijalankan otomatis oleh `scripts/finalize_46630.py run` (lihat §0.1) |

Automation: `scripts/handover_46630.py` (phases `prep|handoff|status|execute|verify`, config-driven dari `packages/config/46630.json`); orkestrator pipeline penuh: `scripts/finalize_46630.py` (phases `schedule|run|status|exec-one|report`).

### 0.1. Pipeline finalisasi v2 (terjadwal 2026-11-28)

Prasyarat terpasang: **DepositCapHook** deploy tx `0xf7c1a8344ee429c02b037d8b2bae36bec73840a1ad1cc7202c3c708109fea514` (blok `158792521`) di `0xf1363c4a6e257e7b0798013f4b241acd439ac6bf` — constructor: `vault=0xFB60…4Dd9`, `governance=0x2Bfa…09D` (timelock), `globalCap=250000000000` (250.000 USDG), `defaultWalletCap=25000000000` (25.000 USDG), `allowlistEnabled=true`; semua diverifikasi via `cast call` pasca-deploy. ADR-13: hook = satu-satunya plafon deposit saat aktif.

5 op timelock (delay 172800s, dijadwalkan Safe 2/3 pada 2026-11-28 11:17–11:19 UTC, siap eksekusi ~2026-11-30 11:17–11:19 UTC, sesudah handover):

| Op | Target | Kalldata | opId | Schedule tx |
|---|---|---|---|---|
| allowlist_keeper | hook `setAllowed(keeper,true)` | — | `0x91a8e4c647197a6171c4ffa96ef94e31d9d7ea05759b7df95b6f6f40a750f52d` | `0x9b2804ea98c33f46110884d6459d6452d4038c0a624dccd0429750ae2c0b0dc9` |
| allowlist_treasury | hook `setAllowed(treasury,true)` | — | `0xe0e0f651513af984afec0c9466acb7fb938825e603e1c62f4683c4c461bff340` | `0x17b44d32899cfe4f2ffbb60662d7ec1f541a0bca31afad329f02c7ade9534d9a` |
| allowlist_deployer | hook `setAllowed(deployer,true)` | — | `0x5f79b81fa3207a834c7771c715622a1e9ad1e4e73ad1089b90e4705383a03e1d` | `0xc4e7eb836786185193c660bc0f76ff128e26adcf33f1c3cbf690b314d1447b55` |
| maxdebt | vault `update_max_debt_for_strategy(strategy, 250000000000)` | — | `0xc3f0c84ce35aa89dda4d5c596c4c60f8171062e44360b964f430fe9be82300cc` | `0xafb0793ef1c5876f1105835369b74042948d255f5ea4babf204793dcaba67c4e` |
| hookop | vault `set_deposit_hook(hook, true)` | — | `0x515d0462645bce7ed35271ac61ed0c60abbd8f8eda3628a76382ed7c31dc1bec` | `0x6e5ad1846082cc4cc1cf746222494fad16ec18a6e511ff1e01262bf98912d8d2` |

Eksekusi berurutan (loop `finalize_46630.py run`, idempoten, keep-awake Windows): handover → allowlist ×3 → maxdebt → hookop (asersi `deposit_hook == hook`, `deposit_limit == 2^256-1`) → seed 1.000 USDG dari keeper (mint MockUSDG publik, approve, deposit, transfer seluruh share ke `0xdEaD`) → keeper drill (`update_debt(strategy, 500e6)` → `report()` → `update_debt(strategy, 0)`, asersi debt kembali 0 ± dust). Laporan: `_bmad-output/finalize-46630-report.json`.

Angka kap (global 250.000 / wallet 25.000 USDG) = angka rencana `docs/DEPLOYMENT.md` §7.4 untuk limited launch; fee tidak berubah (10% perf, `docs/FEE_CONFIG.md` tetap).

---

## 1. Network & Toolchain

| Property | Value | Evidence / Note |
|---|---|---|
| **Network Name** | Robinhood Chain Testnet | Chain ID `46630` |
| **RPC Endpoint** | `https://rpc.testnet.chain.robinhood.com` | Official public RPC |
| **Block Explorer** | `https://testnet.robinhoodchain.com` | Official testnet explorer |
| **Faucet** | `https://faucet.testnet.chain.robinhood.com/` | Native testnet gas faucet |
| **Solidity Compiler** | `0.8.18` (paris EVM target) | Pinned in `packages/contracts/foundry.toml` |
| **Vyper Core** | `0.3.10` (paris EVM target) | Bytecode verified via `scripts/verify-bytecode.py` |
| **Deployer EOA** | `0x56d845a35EDe1436B8053f705b4b189c412A8648` | Dedicated testnet deployer key |

---

## 2. Infrastructure Primitives Deployed / Verified

### 2.1. Canonical TokenizedStrategy v3.1.1 (`0x3110D1Ee...`)
- **Address:** `0x3110D1Eec90f0651C18e75AD37711A8777342504`
- **Deployment Transaction:** `0x34b2c8e00e570c8687f7e83f827fda23e9b3083132395407215c2166af990912`
- **Block:** `157499658`
- **Factory:** CreateX `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`
- **Salt:** Permissionless salt `0x0000000000000000000000000000000000000000000000000000000000000a47`
- **Runtime Codesize:** Exactly `18,224` bytes.
- **Runtime Keccak:** `0x38c3b5bb5cd304e4759807d31f37c440ff9cb9811b35c3c61b8c81e3d61fd16f`
- **Provenance:** 100% byte-for-byte match with Ethereum Mainnet, Arbitrum, Base, and Robinhood Chain `4663`.

### 2.2. Gnosis Safe Multisig 2/3 Infrastructure
The canonical Safe ProxyFactory v1.3.0 and Singleton v1.3.0 exist on chain 46630:
- **Safe ProxyFactory v1.3.0:** `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2`
- **Safe Singleton v1.3.0:** `0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552`

Three distinct 2/3 Safe proxies were deployed for testnet governance separation:
1. **Governance / Proposer Safe (2/3):** `0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA`
   - Tx: `0xd73dfebffb4806a12a550fa4ffdfb8b2e1bf3448f76d9bf3c36398f654b9d084` (Block `157503798`)
2. **Guardian Safe (2/3):** `0x83227a7b21Ead1e0581D03144B85Cb63Fd585af1`
   - Tx: `0x9fec3258c42a2010839e55b41fe8da463eb4231b1dd83ea92d83eeb5f242557e` (Block `157503800`)
3. **Treasury Safe (2/3):** `0x8AA6f4DA5EC2B562854D18E70A173c6CCC827e58`
   - Tx: `0x8d511197475f32a6889eb26462c1dfbb86ba7f4749f7ba3a3d5ea72d73be14b8` (Block `157503802`)

---

## 3. Avenor Vault Core Stack Deployed

| Component | Deployed Address | Tx Hash | Block | Status |
|---|---|---|---|---|
| **Mock USDG (6 dec)** | `0xf32FFAfDC3B430D8143e29191bbCCc7AB4e6dB6c` | `0x2c6dd716b32810a9f5d137bc38ee055561a3377dc764263309a6f3b0631e847c` | 157503794 | Verified |
| **Mock Venue (Morpho)** | `0xE20266eFC2E71e8FfC5871CDF25Dcc6522d1b037` | `0x054f15d2f83f0665b16954a1be2e68c62c3f8e5b4b1a415ff699a2c38dc9c05e` | 157503796 | Verified |
| **VaultOriginal (Blueprint)** | `0x8e3C196bcD62772c931fe62aAA76FDb7edAD8258` | `0x7a30485a3c940562e847c2d9e13d96fa3ec41916327cfbbfae20e53a2a4ecb3c` | 157503804 | 23,462 bytes |
| **TimelockController (48h)** | `0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc` | `0x93dd1ff5c9d2f2d9ea182281855a96db5ef98f2441d8eb6973e04cf4c1064560` | 157503806 | Min delay: 172,800s |
| **EmergencyTimelock (6h)** | `0xde3f5071559d929d18092EEf7f3B106e39BCD4b6` | `0x82f9d505ff64bfca109c9527ec31ee5ca9070381669c5e305e55e094002ea7b5` | 157503808 | Min delay: 21,600s |
| **VaultFactory** | `0x351039141Bd6CB9f4a613a24cD26a537a86ED538` | `0xb59b563459c3683f2a588b3aeeb8e778a3c8e4baee6f2b575cf015fbe83537fb` | 157503810 | Verified |
| **avUSDG Vault (V3)** | `0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0` | `0x51c7aa7c1d7e2e340798be121ec252f4477db199991206f4773403a7433230b7` | 157503812 | Verified |
| **Accountant** | `0xA499C9F98cE3a66B79dD9CaA99AA894DDE298e32` | `0x93883a93c72b79313cae6b8c9d2f2d93e5db617bbd6c5bb5d2b78ce13ad373c2` | 157503814 | Verified |
| **MorphoVaultStrategy** | `0x8f151132f80277b7D42Ad9615172E6De1B26Cf93` | `0x1f74a008c2670e30d1702f2323a7786851b439c381d604e5785bbff0092c63ef` | 157503816 | Verified |

---

## 4. Live On-Chain Verification

### 4.1. Vault Parameters
```bash
cast call 0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0 "name()(string)" --rpc-url https://rpc.testnet.chain.robinhood.com
# "Avenor USDG Managed Vault (Testnet)"

cast call 0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0 "symbol()(string)" --rpc-url https://rpc.testnet.chain.robinhood.com
# "avUSDG"

cast call 0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0 "asset()(address)" --rpc-url https://rpc.testnet.chain.robinhood.com
# 0xf32FFAfDC3B430D8143e29191bbCCc7AB4e6dB6c (Mock USDG)

cast call 0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0 "deposit_limit()(uint256)" --rpc-url https://rpc.testnet.chain.robinhood.com
# 0 (Closed by construction)

cast call 0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0 "future_role_manager()(address)" --rpc-url https://rpc.testnet.chain.robinhood.com
# 0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc (48h Timelock Controller)
```

### 4.2. Role Permission Matrix
Verified directly from on-chain storage on Vault `0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0`:

| Account | Entity | Role Bitmask | Interpretation |
|---|---|---|---|
| `0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc` | Timelock (48h) | `3995` | `governanceRoleSet` (ADD_STRATEGY, REVOKE_STRATEGY, ACCOUNTANT, QUEUE, MAX_DEBT, DEPOSIT_LIMIT, WITHDRAW_LIMIT, MINIMUM_IDLE, PROFIT_UNLOCK) |
| `0xde3f5071559d929d18092EEf7f3B106e39BCD4b6` | Emergency Timelock (6h) | `4` | `FORCE_REVOKE_MANAGER` (ADR-12 bounded fast lane) |
| `0x83227a7b21Ead1e0581D03144B85Cb63Fd585af1` | Guardian Safe (2/3) | `8192` | `EMERGENCY_MANAGER` (instant emergency pause & shutdown) |
| `0x9c4D1f60c74Af03ca92D634A54d55A998CE25d75` | Keeper EOA | `96` | `REPORTING_MANAGER` (32) + `DEBT_MANAGER` (64) |
| `0x8AA6f4DA5EC2B562854D18E70A173c6CCC827e58` | Treasury Safe (2/3) | `4096` | `DEBT_PURCHASER` (`buy_debt` recipient) |
| `0x56d845a35EDe1436B8053f705b4b189c412A8648` | Deployer EOA | `0` | **Zero role bits** (`future_role_manager` ditransfer ke Timelock) |

### 4.3. Strategy Parameters & Ownership Handoff
Verified on MorphoVaultStrategy `0x8f151132f80277b7D42Ad9615172E6De1B26Cf93`:
- `management`: `0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA` (Governance Safe, accepted in tx `0xb8876125…`, block `157995762`)
- `performanceFeeRecipient`: `0x8AA6f4DA5EC2B562854D18E70A173c6CCC827e58` (Treasury Safe)
- `performanceFee`: `0` (Zero strategy-level fee; no double-dipping)
- `profitMaxUnlockTime`: `0` (Zero strategy-level lock)
- `keeper`: `0x9c4D1f60c74Af03ca92D634A54d55A998CE25d75`

---

## 5. Gas Consumption

- Total Transactions Broadcast: **26 transactions**
- Total Gas Used: **20,640,165 gas**
- Average Gas Price: **0.020000001 gwei**
- Total Gas Cost Paid: **0.0004128 ETH** (testnet gas, zero financial value)
- Remaining Deployer Balance: **0.0095468 ETH at deploy time**; `0.0097845 ETH` read live at audit block `158001847`


---

## 6. Multisig & Timelock Governance Drill

Per Manager Report `AVENOR_TESTNET_REPORT.md` §11 and operational next steps, the governance handoff flow consists of two specific actions:

### 6.1. Strategy Ownership Acceptance
- **Target:** MorphoVaultStrategy `0x8f151132f80277b7D42Ad9615172E6De1B26Cf93`
- **Caller:** Governance Safe (2/3) `0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA`
- **Method:** `acceptManagement()`
- **Calldata:** `0xc8c2fe6c`
- **Safe Multisig Execution:**
  Governance Safe executes `execTransaction` with `to = 0x8f15...`, `value = 0`, `data = 0xc8c2fe6c`.

### 6.2. 48-Hour Timelock Role Manager Acceptance
- **Target:** Vault `0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0`
- **Executing Timelock:** TimelockController (48h) `0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc`
- **Proposer & Executor:** Governance Safe (2/3) `0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA`
- **Method:** `accept_role_manager()`
- **Calldata:** `0xf776bf1f`
- **Operation Hash (Salt = 1):** `0x9068381b1398cc7c6ca1753431c50f21db62ca44305f6d4d1fa3b450cd17d05f`
- **Flow:**
  1. `timelock.schedule(vault, 0, 0xf776bf1f, bytes32(0), salt=1, delay=172800)`
  2. Wait 48 hours (`172,800` seconds).
  3. `timelock.execute(vault, 0, 0xf776bf1f, bytes32(0), salt=1)`
  4. Vault `role_manager()` transitions to TimelockController.

Automated rehearsal script:
```bash
forge script packages/contracts/script/ExecuteTestnet46630Governance.s.sol:ExecuteTestnet46630Governance \
  --root packages/contracts \
  --rpc-url https://rpc.testnet.chain.robinhood.com -vvv
```

---

## 7. Frontend Staging Connection Guide

The web frontend is deployed and connected. Production alias `https://avenor-kappa.vercel.app`
(deployment `avenor-hp9kreds3-hanscoprojects.vercel.app`, `dpl_EbvTLRzUcTw1nB5Ly21y3ySzaJGq`).
Environment variables set in Vercel for Production and Preview:

```env
# 1. Official Robinhood Chain Testnet RPC
NEXT_PUBLIC_RPC_URL=https://rpc.testnet.chain.robinhood.com

# 2. Vault Catalog Configuration (JSON array)
AVENOR_VAULTS=[{"address":"0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0","label":"Avenor USDG Managed Vault (Testnet)","phase":"research","mandate":"Testnet Stage Rehearsal"}]
```

Verified behaviour (2026-11-26):
- `GET /v1/vaults/0xDa4D…7DA0` returns the live row: `asset_address 0xf32ffafd…db6c`,
  `role_manager 0x56d8…8648`, `accountant 0xa499…8e32`, `deposit_limit "0"`,
  `source "onchain"`, `recorded_block 158010952`.
- `GET /v1/vaults/…/live` returns `totalAssets "0"`, `totalSupply "0"`, `pricePerShare "1000000"`,
  `depositLimit "0"`, `source "onchain"` at block `158010963`
  (`0x4906a848…e7bfa`, `2026-11-26T03:12:25Z`).
- Deposits are blocked by `deposit_limit == 0` (not by `setPaused`), and the page states the
  research phase.
- `GET /v1/vaults/0x5aeb…18ca/live` (the chain-4663 staging vault) returns HTTP 502 with
  `the vault read did not return assets, idle or debt`: the committed capture is not allowed to
  answer for another chain.

Env values were confirmed with `vercel env pull --environment production`, because `vercel env ls`
only prints "Encrypted": `AVENOR_VAULTS` (161 chars) and `NEXT_PUBLIC_RPC_URL` (41 chars). An
earlier entry stored as `--sensitive` pulled back as empty and shipped that way, which is how a
capture `deposit_limit` of `50000000000` appeared under the testnet address.


---

## S8 - Governance Handoff Execution (2026-11-26)

### Executed via: scripts/governance_handoff_46630.py
Receipt blocks: tx1 `157995762`, tx2 `157995780` | RPC: https://rpc.testnet.chain.robinhood.com
Safe nonce after both transactions: `2` (nonce 0 and 1 consumed, both `status 1`).

### Step 1: strategy.acceptManagement() via Governance Safe

| Field | Value |
|---|---|
| TX Hash | 0xb88761254bb53feea86129bfe6c515ad7cd79f5a4f83ded84aa53b0dfca2f19b |
| Block | 157995762 (status 1) |
| Safe | 0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA (2/3 Governance) |
| Target | 0x8f151132f80277b7D42Ad9615172E6De1B26Cf93 (MorphoVaultStrategy) |
| Calldata | 0xc8c2fe6c (acceptManagement()) |
| Status | SUCCESS (status 1) |
| Result | strategy.management() = Governance Safe |
| Signers | Owner1 (deployer 0x56d845a3...) + Owner2 (0x445be78A...) |

### Step 2: timelock.schedule(vault.accept_role_manager()) via Governance Safe

| Field | Value |
|---|---|
| TX Hash | 0x381fdf02042413bbdbda93c33b3bdff98a1e05b7c87c926dae5c806c9bc9376d |
| Block | 157995780 (status 1) |
| Safe | 0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA (2/3 Governance) |
| Target | Timelock 0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc |
| Timelock Target | Vault 0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0 |
| Timelock Data | 0xf776bf1f (accept_role_manager()) |
| Salt | bytes32(1) |
| Delay | 172800 seconds (48 hours) |
| Status | SUCCESS (status 1) |
| Signers | Owner1 (deployer 0x56d845a3...) + Owner2 (0x445be78A...) |

### Step 3: Verification (read at block 158001847)

| Check | Result |
|---|---|
| strategy.management() | 0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA OK |
| strategy.pendingManagement() | 0x0000000000000000000000000000000000000000 (cleared) OK |
| timelock.isOperationPending(opId) | true OK |
| timelock.getTimestamp(opId) | 1795831749 OK |
| timelock.getMinDelay() | 172800 OK |
| timelock.hasRole(PROPOSER/EXECUTOR/CANCELLER, Safe) | true / true / true OK |
| timelock.hasRole(any role, deployer EOA) | false OK |
| vault.role_manager() | 0x56d845a35EDe1436B8053f705b4b189c412A8648 (until execute) |
| vault.future_role_manager() | 0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc OK |
| Safe threshold / owners | 2/3: 0x56d8..., 0x445b..., 0xAaB2... OK |
| Operation ID | 0x9068381b1398cc7c6ca1753431c50f21db62ca44305f6d4d1fa3b450cd17d05f |

Signatures were recovered from the raw `execTransaction` calldata and checked
against `getTransactionHash`: both transactions carry exactly two signatures
from owner1 `0x56d845a35EDe1436B8053f705b4b189c412A8648` and owner2
`0x445be78AbB762884459FB0EC54FE78A5c9a573E1`, matching the Safe tx hashes
`0x428eb974…` (tx1) and `0xa6b6688c…` (tx2) emitted in `ExecutionSuccess`.

### Next: Timelock Execute (after 48h)

Execute available after Unix timestamp 1795831749 (`2026-11-28T02:09:09Z`). The chain
timestamp was 1795660668 when the delay was first measured, so 171,081s (47.5 h) remained
then; re-measured at chain timestamp 1795663264 it was 168,485s (46.8 h).
Run `python scripts/governance_execute_46630.py` after that timestamp; it refuses
to run early, verifies the operation ID, and re-checks the post-handoff state.
Operation ID: 0x9068381b1398cc7c6ca1753431c50f21db62ca44305f6d4d1fa3b450cd17d05f
### S9 - Web Deployment Against Testnet Vault (2026-11-26)

Block used for the UI evidence: `158010963`
(hash `0x4906a8480ab041a2d5aaf7a2326dc7863bb2892650baff79762a720e793e7bfa`,
timestamp `2026-11-26T03:12:25Z`). Reads with
`cast call <vault> <sig> --block 158010963 --rpc-url https://rpc.testnet.chain.robinhood.com`:

| Getter | Value |
| --- | --- |
| `totalAssets()` | `0` |
| `totalSupply()` | `0` |
| `pricePerShare()` | `1000000` |
| `totalIdle()` | `0` |
| `totalDebt()` | `0` |
| `deposit_limit()` | `0` |
| `role_manager()` | `0x56d845a35EDe1436B8053f705b4b189c412A8648` |
| `future_role_manager()` | `0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc` |

These match the deployed page exactly: `https://avenor-kappa.vercel.app/vaults/0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0`,
screenshot `docs/evidence/testnet-web/vault-page-testnet-158010963.png` (1262x624, 69.3 KiB),
allocation row `0x8f15...cf93` with debt `0.00 USDG` and "no venue reported".

Bug found and fixed in this session (the earlier claim that the web env was applied was true for
`NEXT_PUBLIC_RPC_URL` and false for `AVENOR_VAULTS`, and the app could not serve a testnet vault at
all):

1. Production `/vaults/0xDa4D...7DA0` returned HTTP 500. Server log
   (`vercel logs <deployment> --json`): `Error: "" is not an address`, digest `1391027834`.
   Cause: `getVaultMetadata` assembled the row from `forkSnapshot.json` plus constants and ignored
   the requested address, so `asset()` was `""` for a vault the capture does not describe.
2. `GET /v1/vaults/0xDa4D...7DA0` answered `source "captured"` with `deposit_limit "50000000000"`,
   `asset_address 0x5fc5...d168`, `role_manager 0x2c32...6782`, `recorded_block 118337663`: chain-4663
   capture numbers printed under a chain-46630 address.
3. `readPosition` read `STAGING_VAULT` regardless of the `address` path segment, so
   `/v1/vaults/<addr>/positions/<account>` answered 502 `balanceOf(address) returned no data`.

Fix: reads are address-parameterised (`liveSnapshot(rpcUrl, vaultAddress)`,
`readPosition(rpcUrl, account, vaultAddress)`, `readVaultSnapshot(address)`); `getVaultMetadata`
builds the row from the snapshot that answered (`metadataFromSnapshot`), and fails with the getter
name, block and reason when a required getter is missing; the capture may only answer when
`address == STAGING_VAULT` and `eth_chainId == CAPTURE_CHAIN_ID (4663)`
(`captureFallbackAllowed`); `/v1/vaults/<addr>/live` answers 502 with the reason instead of a 500
page; vault/deposit/withdraw/home pages render an `ErrorState` instead of crashing.
Regression tests: `apps/web/test/vaultSource.test.ts` (9 tests, red proof captured by forcing
`captureFallbackAllowed` to `true`), web suite now 104/104.

Gate: `python scripts/verify-all.py --with-web-build --with-fork` -> `ALL CHECKS PASSED`
(secrets + self-test, vendor 603/603, interfaces, SDK ABI, forge build/fmt, 112 unit tests,
SDK/indexer/keeper, web typecheck, 104 web tests, `next build`, fork pin `118337511`, bytecode 14/14).

