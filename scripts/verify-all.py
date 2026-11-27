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
 10. node --test services/keeper     keeper planning, simulation gate, nonce, monitoring, alerts
 11. tsc + node --test apps/web      web numeric primitives, components and config validation
 12. next build                    the app bundle actually builds (slow; opt-in, see below)
 13. scripts/verify-bytecode.py all  core bytecode evidence (slow; skip with --no-bytecode)
 14. scripts/fork-test.py            fork tests against the pinned block (opt-in, see below)

Steps 8–11 need Node 22.6+ (step 11 also needs `apps/web/node_modules`, i.e. `npm install`); step 9 also needs a local Postgres (`initdb`/`pg_ctl`) because it
runs against a real database in `.tmp/`, not a mock. It fails loudly when Postgres is missing
instead of skipping, because a silently skipped data-plane gate is worse than a red one.

Fork tests are deliberately not in the default path: they need a live archive RPC and an
`anvil` fork with three specific flags, so they run through `python scripts/fork-test.py`
(which verifies the pinned state before spending ~90s on `forge`). Running them here without
those flags produces a fake failure. `--with-fork` (or `AVENOR_WITH_FORK=1`) delegates to that
script instead of reimplementing it.

`next build` is the same shape of gate: ~40s on top of a ~4 minute run, so it is opt-in through
`--with-web-build` (or `AVENOR_WITH_WEB_BUILD=1`) and named in the summary when it does not run.
It is not decoration: `tsc --noEmit` type-checks the sources but never bundles them, so a broken
route, a client/server boundary violation or an unreadable `dynamic` export passes step 11 and
fails only here. Missing `apps/web/node_modules` fails loudly instead of skipping.

**A run that did not cover `test/fork/*` does not print `ALL CHECKS PASSED`.** It prints
`ALL CHECKED CHECKS PASSED` and lists what was not run, because a green summary over a partial
run is the exact claim this script exists to prevent. `--require-fork` turns the same condition
into a failure, for whoever needs the full gate before shipping.

Every step is something a reviewer can run alone; this script exists so nobody has
to remember the list, not to hide it.

Usage:
    python scripts/verify-all.py [--no-bytecode] [-q]
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "apps" / "web"
CONTRACTS = ROOT / "packages" / "contracts"
PY = ROOT / ".venv-ape" / "Scripts" / "python.exe"
if not PY.exists():
    PY = Path(sys.executable)
LOCAL_FORGE = ROOT / ".tools" / "foundry" / "forge.exe"


# The child gates (node --test, forge) emit non-ASCII such as the info glyph. On Windows the
# console default is cp1252, and a UnicodeEncodeError in the reporter would look like a gate failure
# after every real check already passed.
for stream in (sys.stdout, sys.stderr):
    reconfigure = getattr(stream, "reconfigure", None)
    if reconfigure is not None:
        reconfigure(encoding="utf-8", errors="replace")


def python() -> str:
    return str(PY)


def forge() -> str:
    if LOCAL_FORGE.exists():
        return str(LOCAL_FORGE)
    user_forge = Path.home() / ".foundry" / "bin" / ("forge.exe" if os.name == "nt" else "forge")
    if user_forge.exists():
        return str(user_forge)
    found = shutil.which("forge")
    if not found:
        raise SystemExit("forge not found (expected .tools/foundry/forge.exe, ~/.foundry/bin or PATH)")
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
    ap.add_argument(
        "--require-fork",
        action="store_true",
        help="run the fork tests and fail instead of passing when they could not run",
    )
    ap.add_argument(
        "--with-web-build",
        action="store_true",
        help="also run `next build` (needs apps/web/node_modules; ~40s)",
    )
    ap.add_argument("-q", "--quiet", action="store_true")
    args = ap.parse_args()
    # Not run is not passed: every gate that is skipped is named in the final summary.
    not_run: list[str] = []

    run("secret scanner self-test", [python(), "scripts/check-secrets.py", "--self-test"], ROOT, args.quiet)
    run("no secrets tracked", [python(), "scripts/check-secrets.py"], ROOT, args.quiet)
    run("test name integrity", [python(), "scripts/check-test-integrity.py"], ROOT, args.quiet)
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
    run(
        "keeper tests",
        [
            "node",
            "--test",
            "--test-concurrency=1",
            "services/keeper/test/keeper.test.ts",
            "services/keeper/test/monitor.test.ts",
        ],
        ROOT,
        args.quiet,
    )
    # `npx` is a .cmd shim on Windows, which subprocess cannot exec without a shell; call tsc directly.
    run(
        "web typecheck",
        ["node", "node_modules/typescript/bin/tsc", "--noEmit"],
        WEB,
        args.quiet,
    )
    run(
        "web tests",
        [
            "node",
            "--test",
            "--test-concurrency=1",
            "test/format.test.ts",
            "test/vaults.test.ts",
            "test/components.test.ts",
            "test/vaultView.test.ts",
            "test/api.test.ts",
            "test/vaultLoader.test.ts",
            "test/deposit.test.ts",
            "test/withdraw.test.ts",
            "test/evidence.test.ts",
            "test/portfolioCsv.test.ts",
        ],
        WEB,
        args.quiet,
    )
    web_build_requested = (
        args.with_web_build or os.environ.get("AVENOR_WITH_WEB_BUILD", "") == "1"
    )
    if web_build_requested:
        if not (WEB / "node_modules").is_dir():
            # Not a skip: a build gate that quietly does nothing is the failure mode this flag exists
            # to remove. `run()` prints the tail of the child's output on failure, so this fails alone.
            print("[FAIL] web build failed")
            print("apps/web/node_modules is missing: run `npm ci` in apps/web first")
            return 1
        # `npx` is a .cmd shim on Windows; call the Next binary through node directly.
        run(
            "web build (next build)",
            ["node", "node_modules/next/dist/bin/next", "build"],
            WEB,
            args.quiet,
        )
    else:
        print("[!!] web build NOT RUN: this run says nothing about `next build`")
        print("     pass --with-web-build / set AVENOR_WITH_WEB_BUILD=1")
        not_run.append("web build (`next build`, needs `npm ci` in apps/web)")
    # `--require-fork` implies the run: demanding the fork gate without asking for it would just fail.
    fork_requested = (
        args.with_fork or args.require_fork or os.environ.get("AVENOR_WITH_FORK", "") == "1"
    )
    fork_ran = False
    if fork_requested:
        run("fork test (pin 118337511)", [python(), "scripts/fork-test.py"], ROOT, args.quiet)
        fork_ran = True
    else:
        print("[!!] fork test NOT RUN: this run says nothing about test/fork/*")
        print("     run `python scripts/fork-test.py`, or pass --with-fork / set AVENOR_WITH_FORK=1")
        not_run.append("fork test (test/fork/*, pin 118337511)")
    if args.no_bytecode:
        print("[!!] bytecode evidence NOT RUN: --no-bytecode was passed")
        not_run.append("bytecode evidence (14 checks)")
    else:
        run(
            "bytecode evidence (14 checks)",
            [python(), "scripts/verify-bytecode.py", "all"],
            ROOT,
            args.quiet,
        )
    if args.require_fork and not fork_ran:
        print("\n[FAIL] --require-fork was passed and the fork tests did not run")
        return 1

    if not_run:
        print(f"\nALL CHECKED CHECKS PASSED — {len(not_run)} GATE(S) NOT RUN:")
        for item in not_run:
            print(f"  - {item}")
        print("This is a partial result, not a green gate.")
    else:
        print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())