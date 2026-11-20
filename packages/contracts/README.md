# packages/contracts

Foundry project for Avenor's on-chain layer: the `TokenizedStrategy` adapter that
points the pinned Yearn V3 vault at the Morpho V2 venue, plus the harness that
proves it behaves on chain 4663.

## What is here (and what is not)

| Path | Contents |
|---|---|
| `src/interfaces/IVaultV3.sol` | Generated from `packages/core/artifacts/VaultV3.json`. Do not hand-edit. |
| `src/interfaces/IVaultFactory.sol` | Generated from `packages/core/artifacts/VaultFactory.json`. |
| `src/interfaces/IMorphoVaultV2.sol` | Hand-written venue subset, each function tagged with its evidence level. |
| `src/strategies/` | `MorphoVaultStrategy` (ticket 2). |
| `script/` | `Deploy.s.sol` (ticket 4). |
| `test/unit/` | Interface + config guards, no RPC needed. |
| `test/fork/` | Chain 4663 fork tests at the pinned block (tickets 3 and 5). |
| `lib/` | Vendored, hash-verified dependencies — see `lib/VENDOR.md`. |

There is **no** copy of `VaultV3.vy` here. The vault core is the pinned Yearn
contract, deployed from `packages/core/artifacts`; Avenor does not modify, fork or
patch it (`docs/ARCHITECTURE.md`, ADR-1). A `pragma solidity` project cannot
compile Vyper, so any "vault" implementation in this repo would be a different
contract wearing the same name.

## Pinned build settings

`foundry.toml` is the single source of truth and is deliberately strict:

- `solc = "0.8.18"` with `auto_detect_solc = false` — a pragma range can never
  silently pull a different compiler.
- `evm_version = "paris"` — matches `vyper --evm-version paris` used for the
  verified core, and avoids `PUSH0`, which the chain's EVM level was not proven to
  support at the pinned block.
- `optimizer = true`, `optimizer_runs = 200`, `via_ir = false`.
- `bytecode_hash = "ipfs"`, `cbor_metadata = true` — stated explicitly because
  metadata changes the deployed bytecode hash.

Changing any of these changes the strategy's runtime hash. If that hash is
recorded in `docs/BASELINE.md`, update the doc **and** re-run
`scripts/check-vendor.py`, or the build no longer matches what was reviewed.

## Commands

```bash
# from packages/contracts
forge build
forge test                                   # unit only, no network
forge test --match-path 'test/fork/*'        # needs an RPC (see below)
forge fmt --check
```

```bash
# from repo root: everything at once, in dependency order, stops at first failure
python scripts/verify-all.py                 # add --no-bytecode to skip the slow Vyper run

# or one at a time
python scripts/check-vendor.py               # dependency hashes + pinned constants
python scripts/gen-interfaces.py --check     # generated interfaces match artifacts
python scripts/verify-bytecode.py all        # core bytecode evidence (14 checks)
```

Expected last line of `scripts/verify-all.py`: `ALL CHECKS PASSED`. As of
2026-11-19 that is 601 vendored files, 2 generated interfaces, 12 unit tests and
14/14 bytecode checks.

Fork tests read `packages/config/4663.json` for addresses, decimals and the pinned
block (`118337511`). Public RPCs are **not archive nodes**, so a fork test that
cannot fetch the pinned block must fail loudly rather than fork `latest` — a
`latest` fork silently changes decimals, curator and venue liquidity, and would
make a green test meaningless (`docs/VENUE_INTEGRATIONS.md` §4).

## Conventions

- ABI for the vault and factory comes **only** from `packages/core/artifacts`.
  Not from `cast interface`, not from docs, not from npm. The artifacts carry the
  compiler argv and source keccak that produced them.
- Overloaded functions (`withdraw`, `redeem`, `update_debt`, `add_strategy`,
  `set_deposit_limit`, `protocol_fee_config`) are never referenced by bare member
  name in Solidity: the lookup is ambiguous and fails to compile. Tests assert
  their selectors as constants instead — the same numbers the SDK sends.
- Asset decimals (6) and venue share decimals (18) are never used
  interchangeably. A 1e12 error here does not revert; it silently misprices debt.
- No `transfer_hook` in v1. Reason and code basis: `docs/SECURITY_DIFF.md` §2.3.

## Status

Ticket 1 of epic 2 (`_bmad-output/avenor-managed-vaults/epic-vault-core-and-adapter`)
is the scaffold: this file, the interfaces, the vendored deps, the chain config and
the unit guards. Strategy, deploy script and fork tests land in tickets 2–5.