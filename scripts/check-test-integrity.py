#!/usr/bin/env python
"""
check-test-integrity.py — Verifies that tests referenced in documentation exist on disk.

Ensures that docs/REMEDIATION.md and docs/ACCEPTANCE_EVIDENCE.md do not reference
ghost tests, misspelled filenames, or non-existent test functions.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

TEST_DIRS = [
    ROOT / "packages" / "contracts" / "test",
    ROOT / "packages" / "sdk" / "test",
    ROOT / "services" / "keeper" / "test",
    ROOT / "services" / "indexer" / "test",
    ROOT / "apps" / "web" / "test",
]


def find_test_file(filename: str) -> Path | None:
    for base in TEST_DIRS:
        for match in base.rglob(filename):
            if match.is_file():
                return match
    return None


def verify_docs() -> int:
    target_docs = [DOCS / "REMEDIATION.md", DOCS / "ACCEPTANCE_EVIDENCE.md"]
    missing = []
    verified_count = 0

    # Pattern for Contract.t.sol::test_function
    func_pattern = re.compile(r"([A-Za-z0-9_]+\.t\.sol)::([A-Za-z0-9_]+)")
    # Pattern for any test file *.t.sol or *.test.ts
    file_pattern = re.compile(r"([A-Za-z0-9_]+\.(?:t\.sol|test\.ts))")

    for doc_path in target_docs:
        if not doc_path.exists():
            continue
        text = doc_path.read_text(encoding="utf-8")

        # 1. Check specific function calls
        for match in func_pattern.finditer(text):
            filename, func_name = match.group(1), match.group(2)
            disk_file = find_test_file(filename)
            if disk_file is None:
                missing.append(f"{doc_path.name}: file {filename} not found on disk")
                continue
            content = disk_file.read_text(encoding="utf-8")
            if f"function {func_name}" not in content:
                missing.append(
                    f"{doc_path.name}: function {func_name} not found in {disk_file.relative_to(ROOT)}"
                )
            else:
                verified_count += 1

        # 2. Check standalone test files
        for match in file_pattern.finditer(text):
            filename = match.group(1)
            disk_file = find_test_file(filename)
            if disk_file is None:
                missing.append(f"{doc_path.name}: file {filename} not found on disk")
            else:
                verified_count += 1

    if missing:
        print("[FAIL] Test integrity check failed:")
        for m in sorted(set(missing)):
            print(f"  - {m}")
        return 1

    print(f"OK: {verified_count} test references verified against disk (0 missing)")
    return 0


if __name__ == "__main__":
    sys.exit(verify_docs())
