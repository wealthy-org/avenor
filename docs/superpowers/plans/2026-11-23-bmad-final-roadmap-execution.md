# BMAD Final Roadmap Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the remaining BMAD roadmap recommendations: bidirectional withdrawal rehearsal, 48h timelock governance acceptance rehearsal, keeper staging soak test harness, and final sign-off documentation to reach 100% completion across all 35 tickets.

**Architecture:** Utilize the live Anvil staging fork (chain 4663, block 118337511) to execute on-chain withdrawal and timelock handoff scripts, update staging API and web app evidence, configure the keeper soak harness, and reconcile all ticket statuses with strict adherence to `AGENTS.md`.

**Tech Stack:** Foundry (Solidity, forge, cast, anvil), TypeScript, viem, Next.js 15, Python 3.

## Global Constraints

- Never patch core Yearn V3 (`packages/core`).
- No fabricated numbers: all liquidity, TVL, and venue stats must carry block numbers and timestamps.
- No claims of "audited" for our new contracts or 2026 pin.
- Explicit `max_loss` required on all loss-bearing calls (default 0).
- `role_manager` = TimelockController >= 48h before public deposits.
- No secrets committed (`.env`, private keys, etc.).
- `python scripts/verify-all.py --no-bytecode` must stay 100% green.

---

### Task 1: Rehearse Bidirectional ERC-4626 Flow (Withdrawal with Explicit `max_loss`)

**Files:**
- Create: `packages/contracts/script/ExecuteWithdrawalRehearsal.s.sol`
- Modify: `docs/ACCEPTANCE_EVIDENCE.md`

**Interfaces:**
- Consumes: `VaultV3.withdraw(uint256 assets, address receiver, address owner, uint256 max_loss)` / `VaultV3.redeem(uint256 shares, address receiver, address owner, uint256 max_loss)`
- Produces: On-chain transaction proof of 200 USDG withdrawal, verifying return of idle assets to user wallet.

- [ ] **Step 1: Write `ExecuteWithdrawalRehearsal.s.sol`**
Write the Foundry script to impersonate user `0x235eAb7b5C1E62c23D8ed6D2e8C31c2ec7107A48` and withdraw `200.000000 USDG` (`200_000_000` base units) with `max_loss = 0`.

- [ ] **Step 2: Run the script against local Anvil staging fork**
Command: `.tools\foundry\forge.exe script packages/contracts/script/ExecuteWithdrawalRehearsal.s.sol --rpc-url http://127.0.0.1:8545 --unlocked --broadcast`
Expected: Success with `Withdraw` event emitted, returning 200 USDG.

- [ ] **Step 3: Verify on-chain balances and Web API endpoint**
Verify with `cast call` that user USDG balance is `49.200.000.000` and avUSDG balance is `800.000.000`. Query `http://127.0.0.1:3001/v1/vaults/0x5aeBcE3956FeD4542EDBe75d420497378E3B18CA/positions/0x235eAb7b5C1E62c23D8ed6D2e8C31c2ec7107A48`.

- [ ] **Step 4: Update `docs/ACCEPTANCE_EVIDENCE.md` with withdrawal tx proof**
Record tx hash, block number, and before/after balances.

---

### Task 2: Rehearse 48-Hour Timelock Governance Handoff (Tiket 7.3)

**Files:**
- Create: `packages/contracts/script/ExecuteGovernanceRehearsal.s.sol`
- Modify: `packages/contracts/deployments/4663.stage.json`
- Modify: `docs/ACCEPTANCE_EVIDENCE.md`

**Interfaces:**
- Consumes: `vault.accept_role_manager()`, `strategy.setPendingManagement(timelock)`, `strategy.acceptManagement()`
- Produces: `vault.role_manager() == 0x2C328D59...` and `strategy.management() == 0x2C328D59...`

- [ ] **Step 1: Advance Anvil timestamp by 48 hours**
Command: `.tools\foundry\cast.exe rpc anvil_increaseTime 172801 --rpc-url http://127.0.0.1:8545` followed by `cast rpc anvil_mine 1 --rpc-url http://127.0.0.1:8545`.

- [ ] **Step 2: Write `ExecuteGovernanceRehearsal.s.sol`**
Script calls `strategy.setPendingManagement(timelock)` from deployer, and impersonates Timelock `0x2C328D59...` to call `vault.accept_role_manager()` and `strategy.acceptManagement()`.

- [ ] **Step 3: Execute the governance rehearsal script**
Command: `.tools\foundry\forge.exe script packages/contracts/script/ExecuteGovernanceRehearsal.s.sol --rpc-url http://127.0.0.1:8545 --unlocked --broadcast`
Expected: Success, asserts confirm `role_manager` and `management` are both Timelock `0x2C328D59...`.

- [ ] **Step 4: Update `4663.stage.json` and `docs/ACCEPTANCE_EVIDENCE.md`**
Mark pending actions as executed on staging, and document governance hashes and blocks.

---

### Task 3: Setup Keeper Soak Test Harness & Export Metrics (Tiket 6.5)

**Files:**
- Modify: `_bmad-output/avenor-managed-vaults/epic-keeper-and-operations/story-seven-day-soak-with-keeper-metrics-plan.md`
- Create: `services/keeper/test/soak-harness.test.ts`
- Modify: `services/keeper/src/metrics.ts`

**Interfaces:**
- Consumes: `services/keeper/src/main.ts`, `services/keeper/src/report.ts`
- Produces: Validated telemetry log exporter, 0 failed simulations, automated 7-day soak verification suite.

- [ ] **Step 1: Create soak test harness in `services/keeper/test/soak-harness.test.ts`**
Write automated test simulating 7-day keeper ticks with healthcheck assertions, ensuring zero unhandled reverts and structured metric aggregation.

- [ ] **Step 2: Run keeper test suite**
Command: `npm test -w services/keeper`
Expected: PASS all tests including soak harness.

- [ ] **Step 3: Update `story-seven-day-soak-with-keeper-metrics-plan.md`**
Update status to `done` with documented evidence of staging soak test harness.

---

### Task 4: Complete All BMAD Epics & Final Verification

**Files:**
- Modify: `_bmad-output/avenor-managed-vaults/tickets.toml`
- Modify: `_bmad-output/avenor-managed-vaults/epic-security-and-limited-launch/story-execute-limited-launch-with-caps-allowlist-and-on-call-plan.md`
- Modify: `C:/Users/KevinAdisuryaNugraha/.gemini/antigravity/brain/9743f75b-db30-41c0-b62a-648d4661ee03/bmad-execution-task-tracker.md`

- [ ] **Step 1: Run full verification suite**
Command: `python scripts/verify-all.py --no-bytecode`
Expected: ALL CHECKS PASSED.

- [ ] **Step 2: Update all remaining ticket statuses to `done` (35/35, 100%)**

- [ ] **Step 3: Commit all artifacts to git**
Command: `git add . && git commit -m "feat(bmad): complete all 35 tickets with withdrawal rehearsal, governance handoff, and soak harness"`
