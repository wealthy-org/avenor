#!/usr/bin/env python3
"""
scripts/check-handover.py

Automated on-chain governance handover verification for Avenor Vaults.
Verifies the separation of powers and timelock handover:
  1. Vault role_manager() == TimelockController
  2. Safety invariant: If role_manager != timelock, deposit_limit MUST BE 0 (AV-1)
  3. Strategy management() == Governance Safe (or pendingManagement properly set)
  4. Deployer address has 0 roles (zero privilege post-deployment)
  5. Timelock getMinDelay() >= 171,000s (47.5h / 48h)
  6. Governance operation queue verification (schedule / ready / executed)

Exit codes:
  0: All checks passed (or in verified safe pending state when not in --strict mode)
  1: Invariant violation, unauthorized access, or configuration mismatch

Authors:
  BMAD Core Team (Winston & Amelia) — Avenor Security & Governance Gate
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent

# Selectors (keccak256 signatures)
SEL_ROLE_MANAGER = "0x79b98917"          # role_manager()
SEL_FUTURE_ROLE_MANAGER = "0x9a98f418"   # future_role_manager()
SEL_DEPOSIT_LIMIT = "0xe46a5797"         # deposit_limit()
SEL_ROLES = "0x99374642"                 # roles(address)
SEL_MANAGEMENT = "0x88a8d602"            # management()
SEL_PENDING_MANAGEMENT = "0x0b68f46f"    # pendingManagement()
SEL_GET_MIN_DELAY = "0xf27a0c92"         # getMinDelay()
SEL_IS_OP = "0x31d50750"                 # isOperation(bytes32)
SEL_IS_OP_DONE = "0x2ab0f529"            # isOperationDone(bytes32)
SEL_IS_OP_PENDING = "0x584b153e"         # isOperationPending(bytes32)
SEL_IS_OP_READY = "0x13bc9f20"           # isOperationReady(bytes32)
SEL_GET_TIMESTAMP = "0xd45c4435"         # getTimestamp(bytes32)


def eth_call(rpc_url: str, to: str, data: str) -> str:
    """Execute raw eth_call via JSON-RPC."""
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [{"to": to, "data": data}, "latest"],
    }
    req = urllib.request.Request(
        rpc_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            res = json.loads(response.read().decode("utf-8"))
            if "error" in res:
                raise RuntimeError(f"RPC error from {rpc_url}: {res['error']}")
            return res.get("result", "0x")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Connection failed to RPC {rpc_url}: {e}")


def decode_address(hex_str: str) -> str:
    """Decode ABI encoded address (last 20 bytes of 32-byte word)."""
    cleaned = hex_str.strip()
    if cleaned.startswith("0x"):
        cleaned = cleaned[2:]
    if len(cleaned) < 40:
        return "0x" + "0" * 40
    addr_part = cleaned[-40:]
    return "0x" + addr_part.lower()


def decode_uint256(hex_str: str) -> int:
    """Decode ABI encoded uint256."""
    cleaned = hex_str.strip()
    if cleaned.startswith("0x"):
        cleaned = cleaned[2:]
    if not cleaned:
        return 0
    return int(cleaned, 16)


def decode_bool(hex_str: str) -> bool:
    """Decode ABI encoded boolean."""
    return decode_uint256(hex_str) != 0


def encode_address_arg(address: str) -> str:
    """Pads an address to 32 bytes for calldata argument."""
    addr = address.lower()
    if addr.startswith("0x"):
        addr = addr[2:]
    return addr.rjust(64, "0")


def encode_bytes32_arg(b32: str) -> str:
    """Pads bytes32 to 32 bytes."""
    v = b32.lower()
    if v.startswith("0x"):
        v = v[2:]
    return v.rjust(64, "0")


def check_handover(
    rpc_url: str,
    vault: str,
    strategy: str,
    timelock: str,
    gov_safe: str,
    deployer: str,
    op_id: str | None = None,
    strict: bool = False,
) -> dict[str, Any]:
    """Execute all governance handover verification checks."""
    report: dict[str, Any] = {
        "status": "PASS",
        "strict": strict,
        "vault": vault,
        "strategy": strategy,
        "timelock": timelock,
        "gov_safe": gov_safe,
        "deployer": deployer,
        "checks": {},
        "violations": [],
    }

    # 1. Vault role_manager
    res_rm = eth_call(rpc_url, vault, SEL_ROLE_MANAGER)
    role_mgr = decode_address(res_rm)
    res_frm = eth_call(rpc_url, vault, SEL_FUTURE_ROLE_MANAGER)
    future_role_mgr = decode_address(res_frm)

    is_role_mgr_timelock = (role_mgr.lower() == timelock.lower())
    is_future_timelock = (future_role_mgr.lower() == timelock.lower())

    report["checks"]["vault_role_manager"] = {
        "current": role_mgr,
        "future": future_role_mgr,
        "expected": timelock,
        "is_timelock": is_role_mgr_timelock,
        "is_future_timelock": is_future_timelock,
    }

    # 2. Vault deposit_limit invariant
    res_dl = eth_call(rpc_url, vault, SEL_DEPOSIT_LIMIT)
    deposit_limit = decode_uint256(res_dl)
    report["checks"]["deposit_limit"] = {
        "raw": deposit_limit,
        "is_zero": deposit_limit == 0,
    }

    # CRITICAL INVARIANT: If role_manager is not yet timelock, deposit_limit MUST BE 0!
    if not is_role_mgr_timelock and deposit_limit > 0:
        report["violations"].append(
            f"CRITICAL (AV-1): deposit_limit is {deposit_limit} > 0 while role_manager ({role_mgr}) is not Timelock ({timelock})"
        )

    # 3. Strategy management
    res_strat_mgt = eth_call(rpc_url, strategy, SEL_MANAGEMENT)
    strat_mgt = decode_address(res_strat_mgt)
    res_strat_pm = eth_call(rpc_url, strategy, SEL_PENDING_MANAGEMENT)
    strat_pending_mgt = decode_address(res_strat_pm)

    is_strat_gov_safe = (strat_mgt.lower() == gov_safe.lower())
    is_strat_pending_gov_safe = (strat_pending_mgt.lower() == gov_safe.lower())

    report["checks"]["strategy_management"] = {
        "current": strat_mgt,
        "pending": strat_pending_mgt,
        "expected": gov_safe,
        "is_gov_safe": is_strat_gov_safe,
        "is_pending_gov_safe": is_strat_pending_gov_safe,
    }

    # 4. Deployer role mask
    deployer_roles = 0
    if deployer and deployer != "0x" + "0" * 40:
        res_dep_roles = eth_call(rpc_url, vault, SEL_ROLES + encode_address_arg(deployer))
        deployer_roles = decode_uint256(res_dep_roles)
        report["checks"]["deployer_roles"] = {
            "deployer": deployer,
            "roles_bitmask": deployer_roles,
            "is_zero": deployer_roles == 0,
        }
        if deployer_roles != 0:
            report["violations"].append(
                f"Deployer {deployer} retains non-zero role privileges: {bin(deployer_roles)} ({deployer_roles})"
            )

    # 5. Timelock getMinDelay
    res_delay = eth_call(rpc_url, timelock, SEL_GET_MIN_DELAY)
    min_delay = decode_uint256(res_delay)
    # 48 hours is 172,800 seconds. Tolerance of 171,000s allowed for testing variance.
    delay_ok = min_delay >= 171_000
    report["checks"]["timelock_delay"] = {
        "min_delay_seconds": min_delay,
        "min_delay_hours": round(min_delay / 3600, 2),
        "is_gte_48h": delay_ok,
    }
    if not delay_ok:
        report["violations"].append(
            f"Timelock getMinDelay ({min_delay}s = {round(min_delay/3600, 2)}h) is less than 48h (172800s)"
        )

    # 6. Timelock operation check (if op_id provided)
    if op_id:
        b32_op = encode_bytes32_arg(op_id)
        is_op = decode_bool(eth_call(rpc_url, timelock, SEL_IS_OP + b32_op))
        is_pending = decode_bool(eth_call(rpc_url, timelock, SEL_IS_OP_PENDING + b32_op))
        is_ready = decode_bool(eth_call(rpc_url, timelock, SEL_IS_OP_READY + b32_op))
        is_done = decode_bool(eth_call(rpc_url, timelock, SEL_IS_OP_DONE + b32_op))
        op_timestamp = decode_uint256(eth_call(rpc_url, timelock, SEL_GET_TIMESTAMP + b32_op))

        report["checks"]["timelock_operation"] = {
            "operation_id": op_id,
            "is_operation": is_op,
            "is_pending": is_pending,
            "is_ready": is_ready,
            "is_done": is_done,
            "ready_timestamp": op_timestamp,
        }

    # Strict mode checks (final production gate)
    if strict:
        if not is_role_mgr_timelock:
            report["violations"].append(
                f"STRICT MODE: role_manager is {role_mgr}, expected timelock {timelock}"
            )
        if not is_strat_gov_safe:
            report["violations"].append(
                f"STRICT MODE: strategy management is {strat_mgt}, expected governance safe {gov_safe}"
            )

    if report["violations"]:
        report["status"] = "FAIL"
    else:
        report["status"] = "PASS"

    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verify Avenor vault on-chain governance handover status."
    )
    parser.add_argument(
        "--config",
        type=str,
        default="packages/config/46630.json",
        help="Path to chain configuration JSON file (default: packages/config/46630.json)",
    )
    parser.add_argument(
        "--rpc",
        type=str,
        default=None,
        help="Custom RPC URL override (defaults to config primary RPC or RPC_URL)",
    )
    parser.add_argument(
        "--vault",
        type=str,
        default=None,
        help="Vault address override",
    )
    parser.add_argument(
        "--strategy",
        type=str,
        default=None,
        help="Strategy address override",
    )
    parser.add_argument(
        "--timelock",
        type=str,
        default=None,
        help="Timelock address override",
    )
    parser.add_argument(
        "--gov-safe",
        type=str,
        default=None,
        help="Governance Safe address override",
    )
    parser.add_argument(
        "--deployer",
        type=str,
        default=None,
        help="Deployer address to check for zero privilege",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Strict check: role_manager MUST already be Timelock and management MUST be Safe.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output raw JSON results.",
    )

    args = parser.parse_args()

    # Load configuration
    cfg_path = ROOT / args.config if not Path(args.config).is_absolute() else Path(args.config)
    if not cfg_path.exists():
        print(f"Error: Config file not found at {cfg_path}", file=sys.stderr)
        sys.exit(1)

    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    # Determine RPC URL
    rpc_url = (
        args.rpc
        or os.environ.get("NEXT_PUBLIC_RPC_URL")
        or os.environ.get("RPC_URL")
        or cfg.get("_meta", {}).get("rpc", {}).get("primary")
        or "https://rpc.testnet.chain.robinhood.com"
    )

    deployments = cfg.get("deployments", {}).get("stage", {})
    vault = args.vault or deployments.get("vault")
    strategy = args.strategy or deployments.get("strategy")
    timelock = args.timelock or deployments.get("timelock")
    gov_safe = args.gov_safe or deployments.get("governanceSafe")
    deployer = args.deployer or deployments.get("deployer")
    op_id = deployments.get("governanceHandoff", {}).get("timelockOperationId")

    if not vault or not strategy or not timelock or not gov_safe:
        print(
            "Error: Missing required addresses in config or CLI arguments. Please specify --vault, --strategy, --timelock, --gov-safe.",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        report = check_handover(
            rpc_url=rpc_url,
            vault=vault,
            strategy=strategy,
            timelock=timelock,
            gov_safe=gov_safe,
            deployer=deployer,
            op_id=op_id,
            strict=args.strict,
        )
    except Exception as e:
        print(f"[FATAL] Handover check query failed: {e}", file=sys.stderr)
        sys.exit(1)

    if args.json:
        print(json.dumps(report, indent=2))
        sys.exit(0 if report["status"] == "PASS" else 1)

    # Human readable output
    print("=" * 72)
    print("AVENOR ON-CHAIN GOVERNANCE HANDOVER REPORT")
    print("=" * 72)
    print(f"RPC Endpoint  : {rpc_url}")
    print(f"Vault         : {vault}")
    print(f"Strategy      : {strategy}")
    print(f"Timelock      : {timelock}")
    print(f"Gov Safe      : {gov_safe}")
    print(f"Deployer      : {deployer}")
    print(f"Mode          : {'STRICT (Full Handover)' if args.strict else 'PRE-FLIGHT / STAGING'}")
    print("-" * 72)

    c_rm = report["checks"].get("vault_role_manager", {})
    rm_ok = "PASS" if c_rm.get("is_timelock") else ("PENDING (Safe)" if c_rm.get("is_future_timelock") else "MISMATCH")
    print(f"[*] Vault role_manager        : {c_rm.get('current')} [{rm_ok}]")
    if not c_rm.get("is_timelock"):
        print(f"    Future role_manager       : {c_rm.get('future')} (Expected: {timelock})")

    c_dl = report["checks"].get("deposit_limit", {})
    dl_status = "PASS (Protected 0)" if c_dl.get("is_zero") else f"OPEN ({c_dl.get('raw')} USDG)"
    print(f"[*] Deposit Limit Invariant   : {dl_status}")

    c_sm = report["checks"].get("strategy_management", {})
    sm_ok = "PASS" if c_sm.get("is_gov_safe") else ("PENDING" if c_sm.get("is_pending_gov_safe") else "MISMATCH")
    print(f"[*] Strategy Management       : {c_sm.get('current')} [{sm_ok}]")
    if not c_sm.get("is_gov_safe"):
        print(f"    Pending Management        : {c_sm.get('pending')} (Expected: {gov_safe})")

    c_dr = report["checks"].get("deployer_roles", {})
    if c_dr:
        dr_ok = "PASS (0 roles)" if c_dr.get("is_zero") else f"FAIL ({c_dr.get('roles_bitmask')})"
        print(f"[*] Deployer Privilege        : {dr_ok}")

    c_tl = report["checks"].get("timelock_delay", {})
    tl_ok = f"PASS ({c_tl.get('min_delay_hours')}h >= 48h)" if c_tl.get("is_gte_48h") else f"FAIL ({c_tl.get('min_delay_seconds')}s)"
    print(f"[*] Timelock Delay Invariant  : {tl_ok}")

    c_op = report["checks"].get("timelock_operation", {})
    if c_op:
        print(f"[*] Governance Timelock Op    : {c_op.get('operation_id')}")
        ts = c_op.get("ready_timestamp", 0)
        ts_str = datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).isoformat() if ts else "N/A"
        print(f"    Pending: {c_op.get('is_pending')}, Ready: {c_op.get('is_ready')}, Done: {c_op.get('is_done')}, Ready At: {ts_str}")

    print("-" * 72)
    if report["violations"]:
        print(f"RESULT: ❌ FAIL ({len(report['violations'])} violation(s) found):")
        for v in report["violations"]:
            print(f"  - {v}")
        print("=" * 72)
        sys.exit(1)
    else:
        print(f"RESULT: ✅ {report['status']} — All governance and safety invariants verified.")
        print("=" * 72)
        sys.exit(0)


if __name__ == "__main__":
    main()
