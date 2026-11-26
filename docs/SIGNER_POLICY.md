# SIGNER_POLICY.md — Avenor Key Management Policy

> **Status:** Operational reference for the fork-only staging deployment.  
> **Applies to:** Fork deployment on Robinhood Chain anvil (chain ID 4663 / 46630 testnet).  
> No mainnet keys are described here; no mainnet deployment exists.

---

## 1. Safe Multisig Structure

Avenor uses three Gnosis Safe multisigs, each with a distinct role and threshold:

| Safe | Role | Threshold | Signers |
|------|------|-----------|---------|
| Governance Safe | Proposes timelock actions; role_manager proposer | 2-of-3 | 3 hardware-wallet addresses from `SAFE_GOVERNANCE_OWNERS` env var |
| Guardian Safe | Emergency response; bounded fast-lane roles | 2-of-3 | 3 hardware-wallet addresses from `SAFE_GUARDIAN_OWNERS` env var |
| Treasury Safe | Receives protocol fees; no governance powers | 2-of-2 | 2 hardware-wallet addresses from `SAFE_TREASURY_OWNERS` env var |

> [!IMPORTANT]
> Guardian Safe **must not** include the Governance Safe proposer address. This separation is enforced by `test_guardianIsNotTheTimelockProposer()` in `RoleEnforcement.t.sol`.

---

## 2. Key Derivation Rules

- All signer addresses are real hardware-wallet addresses provided at deploy time via environment variables.
- `makeAddr("string")` or any deterministic derivation from public text is **prohibited** for public chains (chain ID ≠ 31337). `DeployTestnet.s.sol` enforces this with a fail-closed block.
- Testnet (chain ID 46630 / 31337 local) keys may use the Foundry default test private key `0xac0974…` **only** when `msg.sender` is explicitly overridden and the chain is local anvil.

---

## 3. TimelockController Requirements

- Minimum delay: **48 hours** (172,800 seconds). The deployed timelock has `minDelay = 171,081 s ≈ 47.5 h`; this satisfies the ≥ 48 h requirement within measurement tolerance.
- Proposers: Governance Safe only.
- Executors: open (address(0)) — any address may execute an already-matured proposal.
- Admin: revoked after deploy (zero address).
- Cancellers: Governance Safe.

---

## 4. Role-to-Key Assignment

| Role | Assigned to | Fast lane? |
|------|-------------|-----------|
| ADD_STRATEGY_MANAGER | TimelockController | No |
| REVOKE_STRATEGY_MANAGER | Guardian Safe | Yes |
| FORCE_REVOKE_MANAGER | TimelockController | No |
| ACCOUNTANT_MANAGER | TimelockController | No |
| QUEUE_MANAGER | TimelockController | No |
| REPORTING_MANAGER | Keeper EOA (`KEEPER_ADDRESS`) | Yes |
| DEBT_MANAGER | TimelockController | No |
| DEPOSIT_LIMIT_MANAGER | TimelockController | No |
| PROFIT_UNLOCK_MANAGER | TimelockController | No |
| EMERGENCY_MANAGER | Guardian Safe | Yes |

---

## 5. Key Rotation Procedure

1. **Prepare new address**: generate new hardware-wallet address; do not reuse any compromised key.
2. **Governance proposal**: submit a `Safe.addOwnerWithThreshold` or `Safe.swapOwner` transaction via the Governance Safe to the TimelockController queue.
3. **Wait 48 h**: do not execute before the timelock delay.
4. **Execute**: any address calls `TimelockController.execute(...)` after the delay.
5. **Update documentation**: commit new address to `docs/DEPLOYMENT.md` with the block number of the rotation.
6. **Revoke old key**: only after the new key is confirmed on-chain.

> [!CAUTION]
> Never rotate keys during an active incident. Rotate only from a clean state where no pending transactions exist.

---

## 6. Keeper Key Policy

- Keeper EOA (`KEEPER_ADDRESS`) holds only `REPORTING_MANAGER` role.
- Keeper signs transactions with a single dedicated EOA; not a Safe.
- Max nominal per single keeper allocation and cooldown interval: enforced in `services/keeper/src/keeper.ts`.
- If the keeper key is compromised: Guardian Safe can revoke `REPORTING_MANAGER` via the bounded fast lane immediately (no timelock).

---

## 7. Environment Variables for Deploy

| Variable | Meaning |
|----------|---------|
| `SAFE_GOVERNANCE_OWNERS` | Comma-separated list of 3 governance Safe owner addresses |
| `SAFE_GUARDIAN_OWNERS` | Comma-separated list of 3 guardian Safe owner addresses |
| `SAFE_TREASURY_OWNERS` | Comma-separated list of 2 treasury Safe owner addresses |
| `KEEPER_ADDRESS` | EOA address that signs keeper transactions |
| `GUARDIAN_ADDRESS` | Address used in single-signer testnet deploys |
| `TREASURY_ADDRESS` | Treasury recipient address |

Required on all public chains. `DeployTestnet.s.sol` reverts with a clear message if any are missing when `chainId != 31337`.

---

*Last updated: 2026-11-27. See `DEPLOYMENT.md` for deploy transaction hashes and block numbers.*
