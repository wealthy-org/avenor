# TESTNET_EVIDENCE.md — Robinhood Chain Testnet (46630) Stage Deployment

Documented evidence of the Avenor Vault Stack deployment on Robinhood Chain Testnet (Chain ID `46630`), executed per `AVENOR_TESTNET_REPORT.md` §9, §10, and §11.

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
| `0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc` | Timelock (48h) | `3995` | `governanceRoleSet` (ADD_STRATEGY, REVOKE_STRATEGY, FORCE_REVOKE, ACCOUNTANT_MANAGER, QUEUE_MANAGER, DEPOSIT_LIMIT_MANAGER) |
| `0xde3f5071559d929d18092EEf7f3B106e39BCD4b6` | Emergency Timelock (6h) | `4` | `EMERGENCY_MANAGER` (bounded fast-lane) |
| `0x83227a7b21Ead1e0581D03144B85Cb63Fd585af1` | Guardian Safe (2/3) | `8192` | `DEBT_PURGER` (instant emergency pause) |
| `0x9c4D1f60c74Af03ca92D634A54d55A998CE25d75` | Keeper EOA | `96` | `REPORTING_MANAGER` + `DEBT_ALLOCATOR` |
| `0x8AA6f4DA5EC2B562854D18E70A173c6CCC827e58` | Treasury Safe (2/3) | `4096` | Fees and surplus distribution recipient |
| `0x56d845a35EDe1436B8053f705b4b189c412A8648` | Deployer EOA | `0` | **Zero privilege** (relinquished post-wire) |

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
- Total Gas Cost Paid: **0.0004128 ETH** (~$1.40 equivalent)
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

Execute available after Unix timestamp 1795831749 (chain timestamp was 1795660668
at audit time, so roughly 47,400s of delay remained then).
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

