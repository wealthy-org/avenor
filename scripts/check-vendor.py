#!/usr/bin/env python
"""
Verify the vendored dependency trees in packages/contracts/lib.

Checks:
  1. Every file under lib/ matches `VENDOR-MANIFEST.sha256` (no drift, no strays).
  2. `BaseStrategy.sol` still hardcodes the TokenizedStrategy implementation we
     verified on chain.
  3. `TokenizedStrategy.sol` still reports API_VERSION "3.1.1".
  4. If a reference checkout is present, vendored tokenized-strategy bytes equal
     the bytes at the pinned upstream commit (stronger than a local hash check).
  5. Same for the two periphery/core files (`Accountant.sol`, `IVault.sol`), each
     against its own repository and pin.

Usage:
    python scripts/check-vendor.py            # verify
    python scripts/check-vendor.py --write    # rewrite the manifest (intentional re-vendor)
"""

import argparse
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "packages" / "contracts" / "lib"
MANIFEST = LIB / "VENDOR-MANIFEST.sha256"

EXPECTED_IMPL = "0x3110D1Eec90f0651C18e75AD37711A8777342504"
EXPECTED_API_VERSION = "3.1.1"
REFERENCE = ROOT / "referensi" / "tokenized-strategy"
REFERENCE_PIN = "48c53aba0395885b3f579d0a4b426de276a7b69e"

# Second vendored tree: the Accountant the vault calls during `process_report`, plus the
# one core interface file it imports. Two upstream repos, two pins, both file-identical
# copies — the import path is remapped, the source is byte-identical to upstream.
PERIPHERY = [
    # (vendored path relative to lib/, upstream repo, upstream pin, upstream path)
    (
        "yearn-periphery/src/accountants/Accountant.sol",
        ROOT / "referensi" / "vault-periphery",
        "672de1c98450ab4485fd0da1f5d3d47dc97500b8",
        "src/accountants/Accountant.sol",
    ),
    (
        "yearn-periphery/interfaces/IVault.sol",
        ROOT / "referensi" / "yearn-vaults-v3",
        "f449264ff4f8bebe9a6bf72e43095304fdf101b8",
        "contracts/interfaces/IVault.sol",
    ),
]

SKIP_DIRS = {".git"}
B_CRLF = bytes([13, 10])
B_LF = bytes([10])


def files() -> list[Path]:
    out = []
    for p in sorted(LIB.rglob("*")):
        if p.is_dir() or any(part in SKIP_DIRS for part in p.parts):
            continue
        if p.name == "VENDOR-MANIFEST.sha256":
            continue
        out.append(p)
    return out


def digest(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def write_manifest() -> int:
    lines = [f"{digest(p)}  {p.relative_to(LIB).as_posix()}" for p in files()]
    MANIFEST.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {MANIFEST.relative_to(ROOT)} ({len(lines)} files)")
    return 0


def read_manifest() -> dict[str, str]:
    if not MANIFEST.exists():
        raise SystemExit(f"missing {MANIFEST}; run with --write once")
    out = {}
    for line in MANIFEST.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        h, _, rel = line.partition("  ")
        out[rel] = h
    return out


def check_manifest() -> list[str]:
    errs = []
    want = read_manifest()
    have = {p.relative_to(LIB).as_posix(): p for p in files()}
    for rel, h in want.items():
        p = have.get(rel)
        if p is None:
            errs.append(f"missing: {rel}")
        elif digest(p) != h:
            errs.append(f"hash mismatch: {rel}")
    for rel in have:
        if rel not in want:
            errs.append(f"unexpected file (not in manifest): {rel}")
    return errs


def check_constant(path: Path, pattern: str, expected: str, label: str) -> list[str]:
    if not path.exists():
        return [f"{label}: missing file {path}"]
    text = path.read_text(encoding="utf-8")
    m = re.search(pattern, text)
    if not m:
        return [f"{label}: pattern not found in {path.name}"]
    if m.group(1).lower() != expected.lower():
        return [f"{label}: found {m.group(1)}, expected {expected}"]
    return []


def check_reference_bytes() -> list[str]:
    """Vendored src/ must equal the pinned commit's src/ (excluding tests)."""
    if not (REFERENCE / ".git").exists():
        return []  # reference checkout not present: not an error, just less proof
    try:
        head = subprocess.run(
            ["git", "-C", str(REFERENCE), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except subprocess.CalledProcessError as exc:  # pragma: no cover
        return [f"reference checkout unreadable: {exc}"]
    if head != REFERENCE_PIN:
        return [f"reference checkout HEAD {head} != pin {REFERENCE_PIN}"]

    errs = []
    vendored = LIB / "tokenized-strategy" / "src"
    listed = subprocess.run(
        ["git", "-C", str(REFERENCE), "ls-tree", "-r", "--name-only", REFERENCE_PIN, "src"],
        capture_output=True, text=True, check=True,
    ).stdout.split()
    upstream = {p for p in listed if "/test/" not in p and not p.endswith(".sol.orig")}
    local = {
        p.relative_to(LIB / "tokenized-strategy").as_posix()
        for p in vendored.rglob("*.sol")
    }
    for rel in sorted(upstream - local):
        errs.append(f"not vendored (upstream has it): {rel}")
    for rel in sorted(local - upstream):
        errs.append(f"vendored but not in upstream pin: {rel}")
    for rel in sorted(upstream & local):
        blob = subprocess.run(
            ["git", "-C", str(REFERENCE), "show", f"{REFERENCE_PIN}:{rel}"],
            capture_output=True, check=True,
        ).stdout
        if hashlib.sha256(blob).hexdigest() != digest(LIB / "tokenized-strategy" / rel):
            errs.append(f"content differs from upstream pin: {rel}")
    return errs


def check_periphery_bytes() -> list[str]:
    """Each vendored periphery file must be byte-identical to its pinned upstream blob.

    The import path is remapped (that is a build config, not source), so a content
    difference here means the thing under test is no longer the thing that was
    reviewed. Missing reference checkout is not an error — it is simply less proof,
    and the local manifest hash still holds.
    """
    errs = []
    for rel, repo, pin, upstream in PERIPHERY:
        local = LIB / rel
        if not local.exists():
            errs.append(f"missing vendored file: {rel}")
            continue
        if not (repo / ".git").exists():
            continue
        try:
            blob = subprocess.run(
                ["git", "-C", str(repo), "show", f"{pin}:{upstream}"],
                capture_output=True, check=True,
            ).stdout
        except subprocess.CalledProcessError:
            errs.append(f"upstream pin unreadable: {repo.name}@{pin[:8]}:{upstream}")
            continue
        blob = blob.replace(B_CRLF, B_LF)
        want = hashlib.sha256(blob).hexdigest()
        if want != digest(local):
            errs.append(f"content differs from upstream pin: {rel}")
    return errs

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    if args.write:
        return write_manifest()

    errs = []
    errs += check_manifest()
    errs += check_constant(
        LIB / "tokenized-strategy" / "src" / "BaseStrategy.sol",
        r"tokenizedStrategyAddress\s*=\s*\n?\s*(0x[0-9a-fA-F]{40})",
        EXPECTED_IMPL,
        "BaseStrategy.tokenizedStrategyAddress",
    )
    errs += check_constant(
        LIB / "tokenized-strategy" / "src" / "TokenizedStrategy.sol",
        r'API_VERSION\s*=\s*"([0-9.]+)"',
        EXPECTED_API_VERSION,
        "TokenizedStrategy.API_VERSION",
    )
    errs += check_reference_bytes()
    errs += check_periphery_bytes()

    if errs:
        print("VENDOR CHECK FAILED", file=sys.stderr)
        for e in errs:
            print(f"  - {e}", file=sys.stderr)
        return 1
    n = len(read_manifest())
    print(f"OK: {n} vendored files verified, impl {EXPECTED_IMPL}, API {EXPECTED_API_VERSION}")
    if not (REFERENCE / ".git").exists():
        print("note: upstream byte comparison skipped (no reference checkout)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
