#!/usr/bin/env python
"""
One command that answers "is this repo still in the state we claim?".

Runs, in order, stopping at the first failure:

  1. scripts/check-secrets.py        no private key / mnemonic / URL credential is tracked
  2. scripts/check-vendor.py         vendored dependency hashes + pinned constants
  3. scripts/gen-interfaces.py --check   generated interfaces match the artifacts
  4. scripts/gen-sdk-abi.py --check  the SDK's ABI is still the verified artifact's ABI
  5. forge build                     compiles with the pinned solc/evm/optimizer
  6. forge fmt --check               formatting gate
  7. forge test --no-match-path 'test/fork/*'   unit tests (no network)
  8. node --test packages/sdk        SDK previews, formatting, explicit max_loss
  9. scripts/db-test.py              indexer schema, ingestion, reorg, reconciliation, API
 10. scripts/verify-bytecode.py all  core bytecode evidence (slow; skip with --no-bytecode)

Steps 8 and 9 need Node 22.6+; step 9 also needs a local Postgres (`initdb`/`pg_ctl`) because it
runs against a real database in `.tmp/`, not a mock. It fails loudly when Postgres is missing
instead of skipping, because a silently skipped data-plane gate is worse than a red one.

Fork tests are deliberately excluded: they need a live archive RPC and an `anvil` fork with
three specific flags, so they run through `python scripts/fork-test.py` (which verifies the
pinned state before spending ~90s on `forge`). Running them here without those flags produces
a fake failure. `--with-fork` delegates to that script instead of reimplementing it.

Every step is something a reviewer can run alone; this script exists so nobody has
to remember the list, not to hide it.

Usage:
    python scripts/verify-all.py [--no-bytecode] [-q]
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACTS = ROOT / "packages" / "contracts"
PY = ROOT / ".venv-ape" / "Scripts" / "python.exe"
if not PY.exists():
    PY = Path(sys.executable)
LOCAL_FORGE = ROOT / ".tools" / "foundry" / "forge.exe"


def python() -> str:
    return str(PY)


def forge() -> str:
    if LOCAL_FORGE.exists():
        return str(LOCAL_FORGE)
    found = shutil.which("forge")
    if not found:
        raise SystemExit("forge not found (expected .tools/foundry/forge.exe or PATH)")
    return found


def run(label: str, argv: list[str], cwd: Path, quiet: bool) -> None:
    print(f"[..] {label}")
    # Forge writes UTF-8 (warnings include box-drawing and non-ASCII source snippets);
    # decoding with the Windows default cp1252 blew up inside subprocess' reader thread.
    proc = subprocess.run(
        argv,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        print(f"[FAIL] {label}")
        out = (proc.stdout or "") + (proc.stderr or "")
        print(out.rstrip()[-4000:])
        raise SystemExit(1)
    tail = [ln for ln in (proc.stdout or "").strip().splitlines() if ln.strip()]
    print(f"[ok] {label}" + (f": {tail[-1]}" if tail and not quiet else ""))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-bytecode", action="store_true", help="skip the slow Vyper recompile")
    ap.add_argument(
        "--with-fork",
        action="store_true",
        help="also run scripts/fork-test.py (needs archive RPC; ~90s)",
    )
    ap.add_argument("-q", "--quiet", action="store_true")
    args = ap.parse_args()

    run("no secrets tracked", [python(), "scripts/check-secrets.py"], ROOT, args.quiet)
    run("vendored dependencies", [python(), "scripts/check-vendor.py"], ROOT, args.quiet)
    run(
        "generated interfaces",
        [python(), "scripts/gen-interfaces.py", "--check"],
        ROOT,
        args.quiet,
    )
    run("sdk abi matches artifact", [python(), "scripts/gen-sdk-abi.py", "--check"], ROOT, args.quiet)
    run("forge build", [forge(), "build", "--offline"], CONTRACTS, args.quiet)
    run("forge fmt --check", [forge(), "fmt", "--check"], CONTRACTS, args.quiet)
    run(
        "forge test (unit)",
        [forge(), "test", "--offline", "--no-match-path", "test/fork/*"],
        CONTRACTS,
        args.quiet,
    )
    run("sdk tests", ["node", "--test", "packages/sdk/test/sdk.test.ts"], ROOT, args.quiet)
    run("indexer + data plane tests", [python(), "scripts/db-test.py"], ROOT, args.quiet)
    if args.with_fork:
        run("fork test (pin 118337511)", [python(), "scripts/fork-test.py"], ROOT, args.quiet)
    else:
        print("[--] fork test skipped (pass --with-fork; needs an archive RPC)")
    if args.no_bytecode:
        print("[--] bytecode evidence skipped (--no-bytecode)")
    else:
        run(
            "bytecode evidence (14 checks)",
            [python(), "scripts/verify-bytecode.py", "all"],
            ROOT,
            args.quiet,
        )
    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())