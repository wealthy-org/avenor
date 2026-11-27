# MANDATE_ESTIMATES.md — Scope, Cost, and Dependency Analysis for Future Vault Mandates

> **Document Status:** Active Deliverable (Brief §16 Tahap G & §17 Deliverable #10)  
> **Last Updated:** 2026-11-27  
> **Target Network:** Robinhood Chain (`4663` / Testnet `46630`)  
> **Classification:** Architectural & Financial Engineering Roadmap  

---

## 1. Executive Summary & Anti-Speculation Policy

This document provides a disciplined engineering scope, dependency mapping, risk profiling, and resource estimation for future investment mandates within the Avenor ecosystem.

### Strict Policy on Yield and Projections
1. **Zero Invented Numbers:** Avenor strictly bans marketing speculative or estimated APY numbers. Vault share performance is dictated entirely by underlying venue cash flows and interest rate accruals.
2. **Honest Dependency Accounting:** Mandates that rely on third-party protocols or off-chain infrastructure that are **not currently deployed on Robinhood Chain** are explicitly flagged as blocked or pending upstream release.
3. **No Synthetic Leverage:** All mandates operate strictly on spot assets with full accounting transparency and bounded loss parameters (`max_loss`).

---

## 2. Mandate Inventory & Dependency Matrix

The table below outlines the current status, missing prerequisites, and readiness level for each mandate in the Avenor catalog.

| Mandate Name | Asset | Status | On-Chain Contracts Deployed? | Missing Dependencies on Robinhood Chain (`4663`) | Risk Profile |
|:---|:---:|:---:|:---:|:---|:---:|
| **USDG Managed Yield** | USDG | **Active (Stage / Rehearsal)** | Yes (`VaultV3`, `MorphoVaultStrategy`, `Accountant`) | None (Morpho `steakUSDG` live on 4663) | Low–Moderate (Lending counterparty risk) |
| **Cross-Venue Relative Value** | USDG | **Stage D Ready** | Multi-Strategy harness verified; secondary adapter pending | Secondary lending venue on 4663 (Aave V3 or Fluid pending mainnet launch) | Moderate (Cross-protocol smart contract risk) |
| **Treasury Reserve** | USDG | **Architected (Roadmap)** | No (`DepositCapHook` ready, deployment pending) | None (Requires high idle buffer ≥25% & KYC/allowlist policy) | Ultra-Conservative (Capital preservation priority) |
| **ETH Basis Yield** | ETH / USDG | **Conceptual (Roadmap)** | No | Liquid institutional Perp DEX (e.g. Hyperliquid / GMX v2 instance on 4663) | High (Delta-neutral execution & funding rate risk) |
| **Macro / Rate Divergence** | USDG | **Conceptual (Roadmap)** | No | Fixed yield / yield stripping protocols (Pendle or Curve on 4663) | Moderate–High (Duration risk & maturity matching) |

---

## 3. Detailed Mandate Specifications & Engineering Estimates

### Mandate 1: USDG Managed Yield (Primary Active Mandate)
- **Objective:** Systematically harvest risk-adjusted yield on USDG via vetted lending venues on Robinhood Chain, maintaining automated accounting, 48-hour timelock governance, and conservative withdrawal buffers.
- **Current Architecture:**
  - Core Vault: Yearn V3 Allocator Vault (`VaultV3.sol` API 3.1.1) with 6 decimals.
  - Strategy Adapter: `MorphoVaultStrategy.sol` routing capital to `steakUSDG` (`0xb75D...` on mainnet, Mock on testnet).
  - Fee Model: Centrally enforced via `Accountant.sol` (10% performance fee, 0% management fee, 7-day profit unlock window). Zero strategy-level fees (`performanceFee = 0`).
  - Governance: TimelockController (48h delay) + 2/3 multi-sig Safe (Governance, Guardian, Treasury).
- **Status:** Complete in Sprint 1–5. Operational drill engine verified (`scripts/testnet-lifecycle-drill.py`).
- **Outstanding Deliverables:** Mainnet deployment execution upon public launch of Robinhood Chain mainnet sequencer.

---

### Mandate 2: Cross-Venue Relative Value (Stage D Ready)
- **Objective:** Dynamically distribute vault assets across multiple vetted lending venues (e.g., Morpho Vaults, Aave V3 pools, or Fluid lending) based on on-chain spread differentials, while enforcing strict concentration limits.
- **Technical Architecture:**
  - Default Withdrawal Queue: Ordered withdrawal cascading (`Idle Cash` → `Strategy 1` → `Strategy 2`).
  - Debt Allocator Engine: Keeper process computing 24-hour moving average yields and rebalancing capital within defined tolerance bands.
  - Multi-Strategy Invariants: Formally verified in `packages/contracts/test/unit/MultiStrategyAllocation.t.sol` (4/4 tests passing).
- **Missing Dependencies on Robinhood Chain (`4663`):**
  1. *Secondary Vetted Lending Market:* Aave V3 or Fluid contracts are not yet formally deployed and seeded with liquidity on Robinhood Chain (`4663`). Morpho `steakUSDG` is currently the sole institutional-scale USDG venue.
  2. *Chainlink/Pyth Price Feeds:* Multi-collateral lending requires reliable Oracle feeds for secondary venues.
  3. *Secondary Liquidity:* Insufficient AMM pool depth to absorb rapid multi-million USDG reallocations without slippage.
- **Engineering Effort & Scope:**
  - Smart Contracts: 3 weeks (Implement `AaveV3Strategy.sol` / `FluidStrategy.sol` adhering to G1–G8 integration rules).
  - Keeper Hardening: 2 weeks (Add spread calculation engine, minimum reallocation threshold, and gas brake).
  - Indexer & Web UI: 1 week (Multi-strategy allocation pie chart, debt breakdown, and venue risk tags).
  - Estimated Budget / Person-Weeks: ~6 engineer-weeks.

---

### Mandate 3: Treasury Reserve & Institutional Sovereign Buffer
- **Objective:** Tailored for corporate, DAO, and institutional treasuries requiring guaranteed same-block liquidity, zero capital loss tolerance, and regulatory compliance hooks.
- **Technical Architecture:**
  - Minimum Idle Cash Reserve: Enforced at `minimum_total_idle ≥ 250,000` USDG or 25–40% of vault TVL.
  - Zero-Loss Enforcement: Strict `max_loss = 0` enforced on all withdrawals; keeper cannot accept reports with negative yield.
  - Compliance & Transfer Hooks: Integration with `DepositCapHook.sol` or institutional identity allowlists (ERC-3643 / KYC gating).
  - Fee Structure: 0% performance fee, 25 bps management fee to cover dedicated RPC and keeper infrastructure.
- **Dependencies on Robinhood Chain (`4663`):**
  - Fully functional institutional custody solutions (Fireblocks, Copper, or Safe Gateway integration on chain 4663).
  - Direct USDG mint/redeem wire gateways with Paxos/Robinhood off-ramps.
- **Engineering Effort & Scope:**
  - Smart Contracts: 2 weeks (DepositCapHook configuration, custom timelock roles, instant redemption reserve testing).
  - Infrastructure: 1 week (Dedicated private RPC endpoints and institutional alerting webhooks).
  - Estimated Budget / Person-Weeks: ~3 engineer-weeks.

---

### Mandate 4: ETH Basis Yield (Delta-Neutral Funding Carry)
- **Objective:** Harvest perpetual futures funding rate premiums by pairing spot collateral (WETH/USDG) with a short perpetual futures position, delivering delta-neutral yield independent of crypto market directional trends.
- **Technical Architecture:**
  - Off-Chain / Hybrid Vault Strategy: Smart contract holding spot assets with margin routing to a decentralized perp exchange.
  - Keeper Margin Manager: Automated monitoring of liquidation health ratios, margin rebalancing, and roll-over schedules.
- **Missing Dependencies on Robinhood Chain (`4663`):**
  1. *Institutional Perp DEX:* No decentralized perpetual exchange (e.g., GMX, Hyperliquid, dYdX, or Aevo instance) currently operates on Robinhood Chain.
  2. *Open Interest Depth:* Basis trading requires deep perpetual open interest (>$50M) to prevent execution slippage.
  3. *High-Frequency Keeper Infrastructure:* Sub-second liquidation monitoring is required to prevent haircutting during flash market crashes.
- **Risk Disclosures:**
  - Basis risk (divergence between spot index and perp mark price).
  - Negative funding periods (bear market cash drag).
  - Smart contract & settlement risk of the perp venue.
- **Engineering Effort & Scope:**
  - Smart Contracts & Off-chain Hedging Engine: 8–10 weeks.
  - Requires dedicated risk model audit and continuous liquidation stress testing.
  - Estimated Budget / Person-Weeks: ~10 engineer-weeks.

---

### Mandate 5: Macro / Rate Divergence (Fixed vs. Variable Yield)
- **Objective:** Exploit interest rate differentials between variable money market rates and fixed-term yields using yield tokenization protocols (e.g., Pendle Principal Tokens vs. Yield Tokens).
- **Technical Architecture:**
  - Term-Structured Allocator: Strategy locks USDG into discounted Principal Tokens (PT) to lock in guaranteed annualized yields until maturity, or trades yield tokens (YT) based on macro interest rate forecasts.
- **Missing Dependencies on Robinhood Chain (`4663`):**
  1. *Yield Tokenization Engine:* Pendle Finance is not currently deployed on Robinhood Chain.
  2. *Secondary Fixed-Yield AMM:* No active PT/YT liquidity pools exist on Robinhood Chain.
- **Engineering Effort & Scope:**
  - Smart Contracts: 4–6 weeks (Pendle PT/YT tokenized strategy adapter, maturity roll-forward logic).
  - Estimated Budget / Person-Weeks: ~5 engineer-weeks.

---

## 4. Architectural Integration Gates (G1–G8)

Any candidate venue or strategy considered for future mandate inclusion must pass all 8 verification gates prior to testnet deployment:

1. **Gate G1 (No Core Modification):** Must interact with Yearn V3 core strictly as an external ERC-4626 adapter. Core files in `packages/core` must never be modified.
2. **Gate G2 (Single-Asset Cleanliness):** Asset must be purely USDG (`0x5fc5...` on mainnet). No wrapped synthetic rebasing tokens.
3. **Gate G3 (Explicit Loss Parameter):** Strategy must never assume a default `max_loss`. Loss budgets must be enforced by calling transactions.
4. **Gate G4 (Timelock Governance):** Strategy additions or queue alterations must go through the 48-hour TimelockController.
5. **Gate G5 (Central Accounting):** Performance fees must be assessed exclusively at the Vault layer via `Accountant.sol`. Strategy-level fees must be zeroed (`performanceFee = 0`).
6. **Gate G6 (Concentration Bounds):** No single strategy or venue may receive >80% of active vault allocations under multi-strategy mandates.
7. **Gate G7 (Idle Cash Floor):** Vault must maintain a minimum cash buffer (`minimum_total_idle`) to ensure normal withdrawals do not trigger costly unwinds.
8. **Gate G8 (Audit & Formal Verification):** Any custom adapter contract must have 100% unit test coverage, invariant fuzz testing, and formal code review prior to production deposit opening.

---

## 5. Summary & Roadmap Timeline

```
[Now: Stage Rehearsal]
  ├── Mandate 1: USDG Managed Yield (Morpho steakUSDG) -> Ready for Mainnet
  │
[Post-Mainnet Launch: +1 to +3 Months]
  ├── Mandate 3: Treasury Reserve -> Awaiting institutional partner onboarding
  └── Mandate 2: Cross-Venue Relative Value -> Blocked by secondary venue deployment on 4663
  │
[Ecosystem Maturity: +6 to +12 Months]
  ├── Mandate 4: ETH Basis Yield -> Blocked by decentralized Perp DEX on 4663
  └── Mandate 5: Macro Rate Divergence -> Blocked by Pendle/Curve deployment on 4663
```

*Authored by the Avenor Architecture & Quantitative Research Team (Winston & Mary).*
