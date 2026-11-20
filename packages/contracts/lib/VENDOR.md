# Vendored dependencies — `packages/contracts/lib`

Four source trees are committed as plain source (no git submodules) so a clean
checkout builds without network access and without resolving a moving ref. Each one
is pinned to an exact upstream commit; `scripts/check-vendor.py` re-verifies the file
hashes *and* reads every file back out of the corresponding reference checkout at the
pinned commit, so a local edit cannot pass as provenance.

| Directory | Upstream | Tag | Commit | Copied |
|---|---|---|---|---|
| `lib/openzeppelin-contracts` | `github.com/OpenZeppelin/openzeppelin-contracts` | `v4.9.5` | `bd325d56b4c62c9c5c1aff048c37c6bb18ac0290` | `contracts/`, `LICENSE`, `package.json` |
| `lib/tokenized-strategy` | `github.com/yearn/tokenized-strategy` | `v3.1.1` | `48c53aba0395885b3f579d0a4b426de276a7b69e` | `src/` (without `src/test/`), `LICENSE` |
| `lib/forge-std` | `github.com/foundry-rs/forge-std` | `v1.9.6` | `3b20d60d14b343ee4f908cb8079495c07f5e8981` | `src/`, `LICENSE-MIT`, `package.json` |
| `lib/yearn-periphery` | `github.com/yearn/vault-periphery` | (no tag) | `672de1c98450ab4485fd0da1f5d3d47dc97500b8` | `src/accountants/Accountant.sol` |
| `lib/yearn-periphery` | `github.com/yearn/yearn-vaults-v3` | `v3.0.4` | `f449264ff4f8bebe9a6bf72e43095304fdf101b8` | `contracts/interfaces/IVault.sol` |

`lib/yearn-periphery` is **one directory fed by two upstream repositories**, which is why the
last two rows share a path. It mirrors the import layout the upstream files already use:

```
yearn-periphery/src/accountants/Accountant.sol   ← vault-periphery@672de1c9
yearn-periphery/interfaces/IVault.sol            ← yearn-vaults-v3@f449264f
```

`Accountant.sol` imports `@yearn-vaults/interfaces/IVault.sol`, so `remappings.txt` points that
prefix at `lib/yearn-periphery/interfaces/`. Neither file is edited to fit the layout: both
are byte-identical to upstream at their own pin. Two repositories means two pins; they are
deliberately not reconciled into a single hash.

`IVault.sol` is copied rather than hand-written because `Accountant.report` takes
`IVault.Fee`/`IVault.Report` structs in its public signature — a transcription error in field
order would decode a different fee, while a byte-identical copy cannot. `IAccountant.sol`
(`src/interfaces/`) is the opposite case and *is* hand-written: upstream publishes no artifact
for it, so `test/unit/AccountantFees.t.sol` proves each selector against the compiled
bytecode instead of trusting a signature list.

## Why these versions

- **OZ `v4.9.5`** is the exact version pinned by `yearn-vaults-v3@f449264f`'s own
  submodule (`lib/openzeppelin-contracts` → `bd325d56`). Using a newer OZ would
  compile `BaseStrategy` against code the upstream project never tested; using an
  older one risks missing an `IERC20Permit`/`IERC4626` symbol.
- **tokenized-strategy `v3.1.1` (`48c53ab`)** is the only pin with a matching
  on-chain implementation: runtime 18.224 B, keccak identical to
  `0x3110D1Eec90f0651C18e75AD37711A8777342504` after masking the immutable
  `factory` slot and the 53-byte CBOR metadata (`docs/REPRODUCIBILITY.md` §4).
  An earlier wrong pin (`9b7a1811`, tag `v3.0.0-beta-29`) pointed strategies at an
  address with zero code — see `docs/BASELINE.md` §1.
- **forge-std `v1.9.6`** is test-only. It is not part of any deployed bytecode, so
  its version does not affect the security surface; it does need to compile under
  `solc 0.8.18`, which is checked by `forge build`.

## What was deliberately not vendored

- `tokenized-strategy/src/TokenizedStrategy.sol` **is** included (for reference and
  because `TokenizedStrategyLib`/interfaces describe it), but Avenor never deploys
  it: the implementation at `0x3110D1Ee…` is reused (ADR-1 amendment).
- `src/test/**` from tokenized-strategy: their fuzz/invariant suites are valuable,
  but copying them would silently pin a test harness we did not run. Our own tests
  live in `packages/contracts/test` (tickets 2–5).
- `vault-periphery` beyond `src/accountants/Accountant.sol`: the registry, zap, and the
  other accountant variants are not on any path this product executes. Copying them would
  enlarge the reviewed surface for nothing, since `VaultV3` calls exactly one of them.
- `Yearn-ERC4626-Router`: not needed to compile the strategy.
  They are vendored at repository level (`referensi/`) and their compatibility is
  still an open item (`docs/BASELINE.md` §2, `docs/SECURITY_DIFF.md` §7).

## Verify

```bash
python scripts/check-vendor.py           # hashes + expected constants
python scripts/check-vendor.py --write   # after an intentional re-vendor
```

The check also asserts two source facts that would otherwise rot silently:

1. `lib/tokenized-strategy/src/BaseStrategy.sol` still hardcodes
   `tokenizedStrategyAddress = 0x3110D1Eec90f0651C18e75AD37711A8777342504`.
2. `lib/tokenized-strategy/src/TokenizedStrategy.sol` reports `API_VERSION "3.1.1"`.

If either fails, the vendored pin no longer matches what we verified on chain and
`docs/REPRODUCIBILITY.md` must be re-run before any build is trusted.