# BACKUP_RECOVERY.md — Key Backup and Emergency Recovery

> **Status:** Operational runbook for the fork-only staging deployment.  
> No mainnet keys exist; this document describes recovery procedures for the staging environment.

---

## 1. What Must Be Backed Up

| Artifact | Location | Backup method |
|----------|----------|--------------|
| Governance Safe owner private keys | Hardware wallets (3 devices) | BIP-39 seed phrase on steel backup, stored geographically separately |
| Guardian Safe owner private keys | Hardware wallets (3 devices) | BIP-39 seed phrase on steel backup, stored geographically separately |
| Treasury Safe owner private keys | Hardware wallets (2 devices) | BIP-39 seed phrase on steel backup |
| Keeper EOA private key | Hardware wallet or HSM | BIP-39 seed phrase + encrypted digital copy |
| TimelockController deploy parameters | `docs/DEPLOYMENT.md` + git history | Committed to `origin/main`; backed up via git remote |
| Deployed contract addresses | `docs/DEPLOYMENT.md` | Committed to `origin/main` |
| Fork pin block + RPC endpoints | `docs/BASELINE.md` | Committed to `origin/main` |

> [!CAUTION]
> Private keys and seed phrases must **never** be committed to the repository, stored in `.env` files tracked by git, or transmitted unencrypted.

---

## 2. Recovery Procedures

### 2a. Lost Governance Safe Key (1 of 3)

Threshold is 2-of-3; loss of one signer does not break quorum.

1. Identify the remaining two active signers.
2. Using the two active signers, submit `Safe.swapOwner(prevOwner, oldOwner, newOwner)` to the Governance Safe.
3. This is a Safe-internal transaction (not a timelock action); it executes at 2-of-3 threshold.
4. Record the new owner address in `docs/DEPLOYMENT.md`.

### 2b. Lost Guardian Safe Key (1 of 3)

Same procedure as 2a, but on the Guardian Safe. Guardian Safe is 2-of-3.

### 2c. Lost Keeper EOA Key

Guardian Safe can revoke `REPORTING_MANAGER` from the compromised keeper immediately via the bounded fast-lane (no timelock). Steps:

1. Guardian Safe: call `vault.set_role(compromisedKeeper, 0)` to clear all roles. Fast lane — executes immediately.
2. Generate a new keeper EOA on a fresh hardware wallet.
3. Governance Safe submits a timelock proposal to grant `REPORTING_MANAGER` to the new keeper.
4. Wait 48 h; execute the proposal.
5. Update keeper config (`KEEPER_ADDRESS`) and restart the keeper service.

### 2d. Total Loss of Governance Safe (all 3 keys compromised or lost)

> [!CAUTION]
> This is the highest-severity scenario. The timelock's admin was revoked at deploy time (zero address), so there is no backdoor recovery.

Options:
1. If the Guardian Safe is intact: Guardian can invoke `EMERGENCY_MANAGER` to shut the vault down (irreversible). This prevents further deposits and blocks the attacker from draining via governance.
2. After shutdown, users can exit via `redeem()` from idle cash. Strategy debt requires the keeper to cycle report() — the Guardian can grant REPORTING_MANAGER to a temporary keeper.
3. A new vault must be deployed and users migrated manually.

### 2e. RPC Endpoint Failure

Refer to `docs/BASELINE.md` §Fork endpoints. Proven-working archive endpoints:
- `https://rpc.solidrpc.io/public/evm/4663`
- `https://robinhood.api.onfinality.io/public`

Dead endpoints to avoid: `drpc` (window ~150–200 blocks), `publicnode` (requires token), `thirdweb` (no historical state). Diagnose with `python scripts/fork-status.py`.

---

## 3. Incident Response Checklist

```
□ Identify: what was compromised (key? contract? RPC?)
□ Contain: Guardian Safe revokes affected roles immediately (no timelock)
□ If vault at risk: Guardian invokes EMERGENCY_MANAGER → setPaused or shutdown
□ Communicate: document the incident in docs/REMEDIATION.md with block number and timestamp
□ Rotate: follow recovery procedure for the affected key (§2a–2d)
□ Verify: run python scripts/verify-all.py --no-bytecode after recovery
□ Post-mortem: update KNOWN_LIMITATIONS.md and REMEDIATION.md
```

---

## 4. Backup Verification Schedule

Seed phrase backups should be verified (by attempting to derive the first address without exposing the key) on a quarterly schedule. Verification should be logged in an internal operations record (not in this repository).

---

*Last updated: 2026-11-27. See `DEPLOYMENT.md` for contract addresses and deploy blocks.*
