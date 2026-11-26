#!/usr/bin/env python3
"""
scripts/testnet-lifecycle-drill.py

Operational lifecycle drill and emergency verification runner for Avenor USDG Vault.
Performs and asserts:
  1. Full normal round-trip (Deposit -> Allocate -> Yield/Report -> Fee Accrual -> Partial Withdraw -> Full Redeem)
  2. Loss enforcement invariant (max_loss = 0 revert vs max_loss > 0 success)
  3. Operational deposit freeze (deposit_limit = 0 blocks deposits, leaves withdrawals intact)
  4. Emergency pause drill (setPaused(true) blocks both deposits & withdrawals per Yearn V3 core)
  5. Role separation & unauthorized caller rejections

Fulfills Brief §15, §16 Tahap E, and GAP ANALYSIS AV-3.

Authors:
  BMAD Core Team (Winston & Amelia) — Avenor Operations & Safety Drill
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
FORGE = ROOT / ".tools" / "foundry" / "forge.exe"
if not FORGE.exists():
    FORGE = Path("forge")


def run_forge_drill() -> dict[str, Any]:
    """Execute the comprehensive LifecycleDrill test suite via Foundry."""
    cmd = [
        str(FORGE),
        "test",
        "--root",
        "packages/contracts",
        "--match-contract",
        "LifecycleDrillTest",
        "-vv",
    ]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    
    stdout = proc.stdout

    scenarios = [
        {
            "id": "DRILL-1",
            "name": "Normal Lifecycle Round-Trip",
            "scope": "Deposit 100k -> Allocate 80k -> Yield 3k -> 10% Fee -> Partial Withdraw -> Full Redeem",
            "status": "PASS" if "[PASS] test_lifecycle_normal_round_trip" in stdout else "FAIL",
        },
        {
            "id": "DRILL-2",
            "name": "Loss Enforcement & Max Loss Protection",
            "scope": "max_loss = 0 reverts on unrealised venue loss; explicit max_loss > 0 succeeds",
            "status": "PASS" if "[PASS] test_lifecycle_loss_enforcement_drill" in stdout else "FAIL",
        },
        {
            "id": "DRILL-3",
            "name": "Operational Deposit Freeze",
            "scope": "deposit_limit = 0 blocks new deposits while existing withdrawals remain active",
            "status": "PASS" if "[PASS] test_operational_deposit_freeze_drill" in stdout else "FAIL",
        },
        {
            "id": "DRILL-4",
            "name": "Emergency Pause vs Unpause",
            "scope": "setPaused(true) halts deposits AND withdrawals; setPaused(false) restores functionality",
            "status": "PASS" if "[PASS] test_emergency_pause_and_unpause_drill" in stdout else "FAIL",
        },
        {
            "id": "DRILL-5",
            "name": "Role Authorization Enforcements",
            "scope": "Unauthorized calls to update_debt, process_report, set_deposit_limit revert",
            "status": "PASS" if "[PASS] test_unauthorized_role_rejections" in stdout else "FAIL",
        },
    ]

    all_passed = proc.returncode == 0 and all(s["status"] == "PASS" for s in scenarios)

    return {
        "status": "PASS" if all_passed else "FAIL",
        "returncode": proc.returncode,
        "scenarios": scenarios,
        "raw_stdout": stdout,
        "raw_stderr": proc.stderr,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run Avenor USDG Vault Lifecycle & Emergency Operational Drills."
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output raw JSON results.",
    )
    args = parser.parse_args()

    results = run_forge_drill()

    if args.json:
        print(json.dumps(results, indent=2))
        sys.exit(0 if results["status"] == "PASS" else 1)

    print("=" * 78)
    print("AVENOR USDG VAULT — OPERATIONAL LIFECYCLE & EMERGENCY DRILL (BRIEF §15 / AV-3)")
    print("=" * 78)
    print(f"{'ID':<9} | {'SCENARIO':<32} | {'STATUS':<8} | {'SCOPE'}")
    print("-" * 78)

    for sc in results["scenarios"]:
        badge = "✅ PASS" if sc["status"] == "PASS" else "❌ FAIL"
        print(f"{sc['id']:<9} | {sc['name']:<32} | {badge:<8} | {sc['scope']}")

    print("-" * 78)
    if results["status"] == "PASS":
        print("RESULT: ✅ ALL LIFECYCLE AND EMERGENCY DRILLS VERIFIED 100% GREEN.")
        print("        Zero privilege violations, accurate accounting, and strict loss enforcement.")
        print("=" * 78)
        sys.exit(0)
    else:
        print("RESULT: ❌ DRILL FAILED. Inspect logs for details.")
        print("=" * 78)
        print(results["raw_stderr"] or results["raw_stdout"])
        sys.exit(1)


if __name__ == "__main__":
    main()
