#!/usr/bin/env python
"""
Generate the SDK's vault ABI from the verified Vyper artifact.

Why: the epic says "kontrak typings (dari artefak)". The artifact that matters is the one
`scripts/verify-bytecode.py` pins and checks (`packages/core/artifacts/VaultV3.json`), not a
copy-pasted ABI from docs or an explorer. Generated output is committed so the SDK works without
a Vyper toolchain; `--check` keeps it honest in the gate.

Usage:
    python scripts/gen-sdk-abi.py            # write packages/sdk/src/abi/vault.ts
    python scripts/gen-sdk-abi.py --check    # fail if the committed file is stale
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "packages" / "core" / "artifacts" / "VaultV3.json"
TARGET = ROOT / "packages" / "sdk" / "src" / "abi" / "vault.ts"

HEADER = """// GENERATED FILE — do not edit.
//
// Source: packages/core/artifacts/VaultV3.json (the artifact scripts/verify-bytecode.py checks).
// Regenerate: python scripts/gen-sdk-abi.py
//
// The full ABI is copied, not a hand-picked subset: a missing entry would only show up as a
// runtime "function not found" in the app, and the file is 21 kB.
"""


def render() -> str:
    artifact = json.loads(SOURCE.read_text(encoding="utf-8"))
    abi = artifact["abi"] if isinstance(artifact, dict) else artifact
    body = json.dumps(abi, indent=2, sort_keys=False)
    return (
        HEADER
        + "\nexport const vaultV3Abi = "
        + body
        + " as const;\n\nexport type VaultV3Abi = typeof vaultV3Abi;\n"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    if not SOURCE.exists():
        print(f"missing artifact {SOURCE.relative_to(ROOT)} (run scripts/compile-vault.py)", file=sys.stderr)
        return 1

    expected = render()
    if args.check:
        if not TARGET.exists():
            print(f"missing {TARGET.relative_to(ROOT)} (run python scripts/gen-sdk-abi.py)", file=sys.stderr)
            return 1
        if TARGET.read_text(encoding="utf-8") != expected:
            print(f"{TARGET.relative_to(ROOT)} is stale (run python scripts/gen-sdk-abi.py)", file=sys.stderr)
            return 1
        print("sdk abi matches the artifact")
        return 0

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(expected, encoding="utf-8", newline="\n")
    print(f"wrote {TARGET.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())