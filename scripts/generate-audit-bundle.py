#!/usr/bin/env python3
"""
scripts/generate-audit-bundle.py

Packages the official Avenor External Security Review Hand-Off Bundle:
  - In-scope Solidity contracts and interfaces
  - Architecture specs, threat models, and remediation registers
  - Standalone README for external auditors
  - Deterministic SHA256SUMS manifest
  - Creates a compressed tarball: _bmad-output/avenor-audit-bundle-v1.0.0-rc.1.tar.gz

Author:
  BMAD Core Team (Mary & Winston) — Audit & Risk Governance
"""

from __future__ import annotations

import hashlib
import os
import shutil
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "_bmad-output" / "audit-bundle"
BUNDLE_ARCHIVE = ROOT / "_bmad-output" / "avenor-audit-bundle-v1.0.0-rc.1.tar.gz"

IN_SCOPE_FILES = [
    # Contracts
    ("packages/contracts/src/strategies/MorphoVaultStrategy.sol", "contracts/MorphoVaultStrategy.sol"),
    ("packages/contracts/src/hooks/DepositCapHook.sol", "contracts/DepositCapHook.sol"),
    ("packages/contracts/src/interfaces/Roles.sol", "contracts/interfaces/Roles.sol"),
    ("packages/contracts/src/interfaces/IVaultV3.sol", "contracts/interfaces/IVaultV3.sol"),
    ("packages/contracts/src/interfaces/IDepositHook.sol", "contracts/interfaces/IDepositHook.sol"),
    ("packages/contracts/src/interfaces/IMorphoVaultV2.sol", "contracts/interfaces/IMorphoVaultV2.sol"),
    ("packages/contracts/src/interfaces/IAccountant.sol", "contracts/interfaces/IAccountant.sol"),
    ("packages/contracts/src/interfaces/IVaultFactory.sol", "contracts/interfaces/IVaultFactory.sol"),
    ("packages/contracts/script/Deploy.s.sol", "contracts/Deploy.s.sol"),
    ("packages/contracts/script/DeployTestnet.s.sol", "contracts/DeployTestnet.s.sol"),
    # Core Specifications & Threat Models
    ("docs/AUDIT_SCOPE.md", "docs/AUDIT_SCOPE.md"),
    ("docs/AUDIT_SUBMISSION_PACKAGE.md", "docs/AUDIT_SUBMISSION_PACKAGE.md"),
    ("docs/REMEDIATION.md", "docs/REMEDIATION.md"),
    ("docs/ARCHITECTURE.md", "docs/ARCHITECTURE.md"),
    ("docs/ROLE_PERMISSION_MATRIX.md", "docs/ROLE_PERMISSION_MATRIX.md"),
    ("docs/WITHDRAWAL_SEMANTICS.md", "docs/WITHDRAWAL_SEMANTICS.md"),
    ("docs/SECURITY_DIFF.md", "docs/SECURITY_DIFF.md"),
    ("docs/FEE_CONFIG.md", "docs/FEE_CONFIG.md"),
    ("docs/DEPLOYMENT.md", "docs/DEPLOYMENT.md"),
    ("docs/RUNBOOK.md", "docs/RUNBOOK.md"),
    ("docs/TESTNET_EVIDENCE.md", "docs/TESTNET_EVIDENCE.md"),
    ("docs/LIFECYCLE_EVIDENCE.md", "docs/LIFECYCLE_EVIDENCE.md"),
    ("docs/MANDATE_ESTIMATES.md", "docs/MANDATE_ESTIMATES.md"),
    ("docs/FINAL_DELIVERY_REPORT.md", "docs/FINAL_DELIVERY_REPORT.md"),
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    print("========================================================================")
    print("AVENOR AUDIT BUNDLE GENERATOR (v1.0.0-rc.1)")
    print("========================================================================")

    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    copied_files: list[tuple[str, Path]] = []

    for src_rel, dest_rel in IN_SCOPE_FILES:
        src_path = ROOT / src_rel
        dest_path = OUTPUT_DIR / dest_rel
        if not src_path.exists():
            print(f"[ERROR] Missing source file: {src_rel}", file=sys.stderr)
            return 1
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dest_path)
        rel_to_bundle = dest_path.relative_to(OUTPUT_DIR).as_posix()
        copied_files.append((rel_to_bundle, dest_path))

    # Generate README for auditors
    readme_content = """# Avenor Managed Strategy Vaults — External Security Review Package

Welcome to the independent security audit bundle for **Avenor Managed Strategy Vaults** (Release `v1.0.0-rc.1`, Robinhood Chain `4663`).

## 1. Scope Overview
- `contracts/MorphoVaultStrategy.sol`: Custom Yearn V3 adapter for Morpho Blue Steakhouse USDG.
- `contracts/DepositCapHook.sol`: Non-custodial deposit gate, global & wallet caps, allowlists.
- `contracts/interfaces/Roles.sol`: 14-bit permission matrix definitions.
- `contracts/Deploy.s.sol`: Production deployment orchestration with dual-speed timelock.
- `contracts/DeployTestnet.s.sol`: Rehearsal staging deploy script with fail-closed key guard.

## 2. Integrity Verification
All files in this bundle have been cryptographically hashed in `SHA256SUMS`.
To verify:
```bash
sha256sum -c SHA256SUMS
```

## 3. Threat Modeling & Prior Remediation
Please review `docs/AUDIT_SCOPE.md` and `docs/REMEDIATION.md` for detailed threat models (V1–V4) and 31 automated regression tests proving all previous internal findings have been fully mitigated.

Full repository access with automated one-command verification harness:
```bash
git clone https://github.com/wealthy-org/avenor.git
cd avenor
git checkout v1.0.0-rc.1
python scripts/verify-all.py
```
"""
    readme_path = OUTPUT_DIR / "README.md"
    readme_path.write_text(readme_content, encoding="utf-8")
    copied_files.append(("README.md", readme_path))

    # Generate SHA256SUMS
    sha_lines: list[str] = []
    for rel_name, fpath in sorted(copied_files, key=lambda x: x[0]):
        checksum = sha256_file(fpath)
        sha_lines.append(f"{checksum}  {rel_name}\n")

    sums_path = OUTPUT_DIR / "SHA256SUMS"
    sums_path.write_text("".join(sha_lines), encoding="utf-8")

    print(f"Packaged {len(copied_files)} in-scope source & document files.")
    print(f"Generated SHA256SUMS manifest with {len(sha_lines)} entries.")

    # Compress into tar.gz
    with tarfile.open(BUNDLE_ARCHIVE, "w:gz") as tar:
        tar.add(OUTPUT_DIR, arcname="avenor-audit-bundle-v1.0.0-rc.1")

    print(f"Created tarball: {BUNDLE_ARCHIVE.relative_to(ROOT)}")
    archive_size_kb = BUNDLE_ARCHIVE.stat().st_size / 1024
    print(f"Archive Size   : {archive_size_kb:.2f} KB")
    print(f"Archive SHA256 : {sha256_file(BUNDLE_ARCHIVE)}")
    print("========================================================================")
    print("RESULT: ✅ AUDIT BUNDLE GENERATION COMPLETED SUCCESSFULLY")
    print("========================================================================")
    return 0


if __name__ == "__main__":
    sys.exit(main())
