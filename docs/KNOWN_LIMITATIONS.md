# KNOWN_LIMITATIONS.md — Exhaustive Limitations Register

This document lists every known limitation of the Avenor vault system as of the current state of the repository. It is not a list of bugs — these are deliberate design trade-offs or external constraints, each with an explanation of why the limitation exists and what the UI/SDK does to handle it.

---

## L-1: No Instant Full Liquidity

**What:** Only idle cash (`totalIdle`) is available for withdrawal without a strategy queue cycle.

**Numbers at pin block 118337511 (2026-11-19):**
- `totalIdle`: 27,024,457.98 USDG
- `totalAssets` (TVL): 538,856,055.99 USDG
- Immediately liquid: **5.02%** of TVL

**Why:** The remaining 94.98% is deployed to SteakUSDG via the allocator strategy. SteakUSDG's `maxWithdraw()` returns `0` at this block — it does not support instant partial exit without a queue cycle.

**How handled:** The UI always shows "position value" and "withdrawable now" as separate numbers. `maxWithdraw` on the venue is never used as a liquidity signal. SDK callers must check `vault.maxWithdraw(user)` and expect a value less than their position.

---

## L-2: maxWithdraw Returns 0 for the Venue

**What:** Calling `maxWithdraw()` on the SteakUSDG venue at pin block `118337511` returns `0`.

**Why:** The venue adapter reports `0` when no instant redemption path is available. This is correct contract behaviour, not a bug.

**How handled:** The SDK and UI explicitly do not use venue `maxWithdraw` as a signal. Any code that relies on `maxWithdraw > 0` to gate a UI affordance must also check `vault.totalIdle`.

---

## L-3: Audit Status

**What:** The 2026 Robinhood Chain pin, Avenor adapters, DepositCapHook, and Avenor configuration have not been independently audited.

**What is covered:** The 2023 upstream Yearn V3 audit covers `packages/core` with its stated scope and date. See `docs/REMEDIATION.md` for citation.

**How handled:** No "audited" badge is claimed for any Avenor-authored code anywhere in the UI, SDK, or documentation. The transparency page states "audit status: not claimed".

---

## L-4: Fork-Only Deployment

**What:** All contract addresses exist on a local anvil fork of Robinhood Chain. `eth_getCode` for the vault address returns `0x` on Robinhood Chain mainnet (block 118337511).

**Why:** Avenor is in pre-launch staging. No mainnet deployment exists or is implied.

**How handled:** Every page that shows a contract address includes a "staging fork" disclosure. The transparency page leads with this. No money moves on mainnet.

---

## L-5: Explicit max_loss Required

**What:** The SDK does not use VaultV3 default `max_loss` values (`10000` for `redeem`, `0` for `withdraw`). Every SDK call requires the caller to supply `max_loss` explicitly.

**Why:** Silent defaults are a source of grief: `0` for `withdraw` means "revert if any loss", which surprises users during partial strategy exits; `10000` for `redeem` means "accept 100% loss", which is dangerous.

**How handled:** `writes.ts` enforces `max_loss` as a required parameter. The DepositForm supplies a default and shows it to the user. SDK callers that omit it get a TypeScript error.

---

## L-6: 48-Hour Timelock Delay

**What:** All governance actions (strategy additions, fee changes, role grants, deposit limit changes) are subject to a 48-hour delay enforced by the TimelockController.

**Why:** This is a security property, not a limitation. It is listed here because it means no governance change takes effect immediately — operators must plan 48 h ahead.

**Exception:** Guardian-role actions on the bounded fast lane execute immediately (no timelock). The fast lane includes: `REVOKE_STRATEGY_MANAGER`, `REPORTING_MANAGER`, `EMERGENCY_MANAGER`.

---

## L-7: Shutdown Is Irreversible

**What:** Calling `vault.shutdown_vault()` (via `EMERGENCY_MANAGER`) cannot be undone. The vault permanently stops accepting deposits.

**Why:** This is a deliberate safety property of VaultV3.

**How handled:** The keeper and UI check `isShutdown` and display a clear warning. The keeper does not submit any transactions to a shutdown vault.

---

## L-8: No Deposit/Withdraw Event Table in Indexer (S-20)

**What:** The indexer does not yet store a dedicated `Deposit`/`Withdraw` event table. Per-depositor history cannot be derived from events alone.

**Why:** S-20 (Deposit/Withdraw indexing) is deferred to a later sprint.

**Impact on reconciliation:** The daily reconciliation formula is architecturally correct per VaultV3 semantics (deposits do not independently change `totalAssets` between snapshots), so reconciliation drift is not caused by this gap. However, per-user deposit history is not available from the indexer until S-20 is implemented.

**How handled:** The reconcile comment in `services/indexer/src/reconcile.ts` documents this explicitly.

---

## L-9: RPC Archive Dependency

**What:** Fork tests and historical data reads require an archive RPC endpoint that serves state at block 118337511.

**Known working endpoints:**
- `https://rpc.solidrpc.io/public/evm/4663`
- `https://robinhood.api.onfinality.io/public`

**Known dead endpoints:** `drpc` (~150–200 block window), `publicnode` (requires personal token), `thirdweb` (no historical state).

**How handled:** Fork tests run via `python scripts/fork-test.py` (not `forge test --fork-url` directly), which starts a local anvil with `--fork-state-by-number` and verifies the pin before running. See `docs/REPRODUCIBILITY.md` §7.1.

---

## L-10: Keeper Non-Custodial But Single EOA

**What:** The keeper EOA signs and submits `report()` transactions. It holds only `REPORTING_MANAGER` — it cannot move assets or change configuration. However, it is a single key, not a multisig.

**Why:** `report()` must be callable by an EOA efficiently; a multisig keeper would add unacceptable latency to the reporting cycle.

**Risk:** If the keeper key is compromised, an attacker can submit fraudulent `report()` calls. VaultV3's accountant validates gain/loss values, so the attack surface is limited to forcing a report at an unfavourable time.

**How handled:** Guardian Safe can revoke `REPORTING_MANAGER` immediately (fast lane). The keeper enforces an in-flight guard and a cooldown interval to limit report frequency.

---

## L-11: Windows Forge Build Shows No Error Detail

**What:** `forge build` on Windows prints `Error: Compiler run failed:` without the solc error message.

**How handled:** Always use `forge build --json` to see solc error details. This is documented in `AGENTS.md` and `docs/REPRODUCIBILITY.md`.

---

*Last updated: 2026-11-27. Add new limitations here when discovered; never remove a limitation entry without replacing it with evidence of resolution.*
