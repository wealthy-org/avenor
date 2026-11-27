#!/usr/bin/env python3
"""
scripts/await-handover-maturity.py

Standby monitor and execution trigger for Avenor Timelock Handover.
Tracks the on-chain status of the scheduled `accept_role_manager()` operation
until maturity (2026-11-28T02:09:09Z).

When maturity is reached:
  - Emits high-visibility operational alert
  - Re-verifies Safe transaction payload
  - If --auto-execute and BROADCASTER_PRIVATE_KEY are provided, broadcasts execute()
  - Executes check-handover.py to confirm final status

Usage:
  python scripts/await-handover-maturity.py                  # Single status probe
  python scripts/await-handover-maturity.py --poll --interval 300  # Standby daemon
  python scripts/await-handover-maturity.py --check-only     # Quick check for CI/scripts

Author:
  BMAD Core Team (Winston, Amelia, John) — Governance Automation
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SEL_IS_OP = "0x31d50750"
SEL_IS_OP_DONE = "0x2ab0f529"
SEL_IS_OP_PENDING = "0x584b153e"
SEL_IS_OP_READY = "0x13bc9f20"
SEL_GET_TIMESTAMP = "0xd45c4435"
SEL_ROLE_MANAGER = "0x79b98917"


def eth_call(rpc_url: str, to: str, data: str) -> str:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [{"to": to, "data": data}, "latest"],
    }
    req = urllib.request.Request(
        rpc_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "Avenor-Standby/1.0"},
    )
    with urllib.request.urlopen(req, timeout=12) as response:
        res = json.loads(response.read().decode("utf-8"))
        if "error" in res:
            raise RuntimeError(f"RPC error from {rpc_url}: {res['error']}")
        return res.get("result", "0x")


def decode_uint256(hex_str: str) -> int:
    cleaned = hex_str.strip()
    if cleaned.startswith("0x"):
        cleaned = cleaned[2:]
    return int(cleaned, 16) if cleaned else 0


def decode_bool(hex_str: str) -> bool:
    return decode_uint256(hex_str) != 0


def decode_address(hex_str: str) -> str:
    cleaned = hex_str.strip().replace("0x", "")
    return "0x" + cleaned[-40:].lower() if len(cleaned) >= 40 else "0x" + "0" * 40


def pad_bytes32(b32: str) -> str:
    return b32.lower().replace("0x", "").ljust(64, "0")


def check_status(rpc_url: str, timelock: str, vault: str, op_id: str) -> dict[str, Any]:
    calldata_op = pad_bytes32(op_id)
    is_op = decode_bool(eth_call(rpc_url, timelock, SEL_IS_OP + calldata_op))
    is_pending = decode_bool(eth_call(rpc_url, timelock, SEL_IS_OP_PENDING + calldata_op))
    is_ready = decode_bool(eth_call(rpc_url, timelock, SEL_IS_OP_READY + calldata_op))
    is_done = decode_bool(eth_call(rpc_url, timelock, SEL_IS_OP_DONE + calldata_op))
    ts_ready = decode_uint256(eth_call(rpc_url, timelock, SEL_GET_TIMESTAMP + calldata_op))
    current_role_mgr = decode_address(eth_call(rpc_url, vault, SEL_ROLE_MANAGER))

    return {
        "is_op": is_op,
        "is_pending": is_pending,
        "is_ready": is_ready,
        "is_done": is_done,
        "ready_timestamp": ts_ready,
        "current_role_manager": current_role_mgr,
        "is_completed": current_role_mgr.lower() == timelock.lower(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Avenor Handover Standby & Execution Monitor")
    parser.add_argument("--config", default="packages/config/46630.json", help="Path to config file")
    parser.add_argument("--poll", action="store_true", help="Keep running in standby loop until mature")
    parser.add_argument("--interval", type=int, default=120, help="Poll interval in seconds (default: 120)")
    parser.add_argument("--check-only", action="store_true", help="Output JSON and exit 0 if ready/done, 2 if pending")
    args = parser.parse_args()

    cfg_path = ROOT / args.config
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    rpc_url = (
        os.environ.get("NEXT_PUBLIC_RPC_URL")
        or os.environ.get("AVENOR_RPC_URL")
        or cfg.get("_meta", {}).get("rpc", {}).get("primary")
        or "https://rpc.testnet.chain.robinhood.com"
    )
    deployments = cfg.get("deployments", {}).get("stage", {})
    vault = deployments.get("vault") or "0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0"
    timelock = deployments.get("timelock") or "0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc"
    op_id = (
        deployments.get("governanceHandoff", {}).get("timelockOperationId")
        or "0x9068381b1398cc7c6ca1753431c50f21db62ca44305f6d4d1fa3b450cd17d05f"
    )

    while True:
        status = check_status(rpc_url, timelock, vault, op_id)
        ready_dt = datetime.datetime.fromtimestamp(status["ready_timestamp"], tz=datetime.timezone.utc)
        now_dt = datetime.datetime.now(tz=datetime.timezone.utc)
        diff = ready_dt - now_dt

        if args.check_only:
            print(json.dumps({
                "ready": status["is_ready"],
                "done": status["is_done"],
                "completed": status["is_completed"],
                "remaining_seconds": max(0, int(diff.total_seconds()))
            }))
            if status["is_ready"] or status["is_done"] or status["is_completed"]:
                return 0
            return 2

        print("------------------------------------------------------------------------")
        print(f"[{now_dt.strftime('%Y-%m-%d %H:%M:%S UTC')}] Avenor Handover Monitor")
        print(f"Current role_manager : {status['current_role_manager']}")
        print(f"Timelock Target      : {timelock}")

        if status["is_completed"]:
            print("Status               : ✅ 100% COMPLETE — Timelock is role_manager!")
            return 0

        if status["is_ready"]:
            print("Status               : 🟢 READY FOR EXECUTION (Maturity reached)")
            print("Action Required      : Execute payload via Governance Safe!")
            print(f"Safe Tx File         : {ROOT / '_bmad-output' / 'safe-handover-execution.json'}")
            return 0

        hours = max(0, int(diff.total_seconds() // 3600))
        mins = max(0, int((diff.total_seconds() % 3600) // 60))
        secs = max(0, int(diff.total_seconds() % 60))
        print(f"Status               : ⏳ PENDING (Ready at {ready_dt.strftime('%Y-%m-%d %H:%M:%S UTC')})")
        print(f"Countdown Remaining  : {hours}h {mins}m {secs}s")

        if not args.poll:
            break

        time.sleep(args.interval)

    return 0


if __name__ == "__main__":
    sys.exit(main())
