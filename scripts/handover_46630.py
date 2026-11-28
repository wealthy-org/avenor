#!/usr/bin/env python3
"""Avenor 46630 governance handover — config-driven.

Phases:
  prep     deployer calls strategy.setPendingManagement(govSafe)
  handoff  Safe 2/3: (1) strategy.acceptManagement()
                      (2) timelock.schedule(vault.accept_role_manager(), delay=48h)
  status   read on-chain handover state
  execute  Safe 2/3: timelock.execute (only after 48h delay)
  verify   full post-handover verification

All addresses read from packages/config/46630.json (deployments.stage).
Owner keys read from env vars GOVERNANCE_OWNER_KEY_1/2/3 (loaded from .env).
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAST = os.path.expanduser(r"~/.foundry/bin/cast.exe")
RPC = os.environ.get("RPC_URL", "https://rpc.testnet.chain.robinhood.com")
CONFIG_PATH = ROOT / "packages" / "config" / "46630.json"
ZERO_ADDR = "0x0000000000000000000000000000000000000000"
ZERO32 = "0x" + "00" * 32
SALT = "0x" + "00" * 31 + "00"  # fresh timelock: first op uses salt 0
DELAY = 172800  # 48 hours


def load_cfg():
    cfg = json.loads(CONFIG_PATH.read_text())
    st = cfg["deployments"]["stage"]
    return {
        "vault": st["vault"],
        "strategy": st["strategy"],
        "accountant": st["accountant"],
        "timelock": st["timelock"],
        "govSafe": st["governanceSafe"],
        "deployer": st["deployer"],
    }


def load_signers():
    out = []
    for i in (1, 2, 3):
        pk = os.environ.get(f"GOVERNANCE_OWNER_KEY_{i}")
        if not pk:
            print(f"[ERROR] GOVERNANCE_OWNER_KEY_{i} missing in environment (source .env)")
            sys.exit(1)
        addr = cast("wallet", "address", "--private-key", pk)
        out.append((addr, pk))
    return out


def cast(*args, tries=5):
    """cast.exe wrapper with RPC-reset retries; injects --rpc-url unless present."""
    args = [a for a in args if a is not None]
    local_cmds = {"calldata", "keccak", "wallet", "from-wei", "to-wei", "to-hex", "from-hex", "abi-encode"}
    is_local = bool(args) and str(args[0]) in local_cmds
    if not is_local and "--rpc-url" not in [str(a) for a in args]:
        args = list(args) + ["--rpc-url", RPC]
    cmd = [CAST] + [str(a) for a in args]
    result = None
    for i in range(tries):
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
        err = ((result.stderr or "") + (result.stdout or "")).lower()
        transient = any(x in err for x in ("reset", "10054", "chain id", "http", "timeout", "econn"))
        if not transient:
            break
        print(f"  [rpc retry {i+1}/{tries}] {cmd[1] if len(cmd)>1 else ''}")
        time.sleep(4)
    if result and result.returncode != 0:
        print(f"[ERROR] cast failed: {' '.join(cmd[:6])}...")
        print((result.stderr or result.stdout or "").strip()[:500])
        sys.exit(1)
    return (result.stdout or "").strip()


def cast_send(to, sig, *args, pk, gas=400000):
    cmd = [CAST, "send", to, sig] + [str(a) for a in args]
    cmd += ["--private-key", pk, "--rpc-url", RPC, "--gas-limit", str(gas)]
    for i in range(5):
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                if line.startswith("transactionHash"):
                    return line.split()[-1]
            return result.stdout.strip()
        err = (result.stderr or "").lower()
        if not any(x in err for x in ("reset", "10054", "http", "timeout")):
            print("[ERROR] cast send failed:")
            print(result.stderr[:800])
            sys.exit(1)
        print(f"  [rpc retry {i+1}/5] cast send")
        time.sleep(5)
    print("[ERROR] cast send: RPC unreachable after retries")
    sys.exit(1)


def get_safe_tx_hash(safe, to, data, nonce):
    return cast(
        "call", safe,
        "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)",
        to, 0, data, 0, 0, 0, 0, ZERO_ADDR, ZERO_ADDR, nonce,
    )


def sign_hash(hash_hex, pk):
    result = subprocess.run(
        [CAST, "wallet", "sign", "--private-key", pk, "--no-hash", hash_hex],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        result = subprocess.run(
            [CAST, "wallet", "sign", "--private-key", pk, hash_hex],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            print(f"[ERROR] signing failed: {result.stderr}")
            sys.exit(1)
    return result.stdout.strip()


def build_safe_signatures(hash_hex, signers):
    packed = "0x"
    for addr, pk in sorted(signers, key=lambda x: x[0].lower()):
        sig = sign_hash(hash_hex, pk)
        if sig.startswith("0x"):
            sig = sig[2:]
        packed += sig
    return packed


def safe_exec(safe, to, data, signers, broadcaster_pk, nonce):
    safe_hash = get_safe_tx_hash(safe, to, data, nonce)
    print(f"  Safe tx hash (nonce {nonce}): {safe_hash}")
    packed = build_safe_signatures(safe_hash, signers)
    return cast_send(
        safe,
        "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)(bool)",
        to, 0, data, 0, 0, 0, 0, ZERO_ADDR, ZERO_ADDR, packed,
        pk=broadcaster_pk,
    )


def wait_receipt(tx_hash, timeout=120):
    for _ in range(timeout // 5):
        r = subprocess.run([CAST, "receipt", tx_hash, "--rpc-url", RPC],
                           capture_output=True, text=True)
        if r.returncode == 0 and "blockHash" in r.stdout:
            ok = "success" in r.stdout or '"status":"0x1"' in r.stdout.replace(" ", "")
            return ok
        time.sleep(5)
    print(f"[WARN] receipt timeout for {tx_hash}")
    return None


def accept_rm_calldata():
    return cast("calldata", "accept_role_manager()")


def op_id_for(vault, tl):
    accept = accept_rm_calldata()
    return cast(
        "call", tl,
        "hashOperation(address,uint256,bytes,bytes32,bytes32)(bytes32)",
        vault, 0, accept, ZERO32, SALT,
    )


# ---------------------------------------------------------------------------
# Phases
# ---------------------------------------------------------------------------

def phase_prep(cfg, deployer_pk):
    print("== PREP: deployer setPendingManagement(govSafe) ==")
    pending = cast("call", cfg["strategy"], "pendingManagement()(address)")
    print(f"  pendingManagement: {pending}")
    if pending.lower() == cfg["govSafe"].lower():
        print("  already set — nothing to do")
        return
    if pending.lower() not in (ZERO_ADDR, cfg["deployer"].lower()):
        print("[ERROR] pendingManagement is a third address — investigate before prep")
        sys.exit(1)
    tx = cast_send(cfg["strategy"], "setPendingManagement(address)", cfg["govSafe"],
                   pk=deployer_pk)
    print(f"  tx: {tx}")
    ok = wait_receipt(tx)
    print(f"  receipt ok: {ok}")
    pending = cast("call", cfg["strategy"], "pendingManagement()(address)")
    print(f"  pendingManagement now: {pending}")
    if pending.lower() != cfg["govSafe"].lower():
        print("[ERROR] pendingManagement not set to govSafe")
        sys.exit(1)
    print("[OK] prep complete")


def phase_handoff(cfg, signers):
    print("== HANDOFF: Safe 2/3 ==")
    pending = cast("call", cfg["strategy"], "pendingManagement()(address)")
    if pending.lower() != cfg["govSafe"].lower():
        print(f"[ERROR] pendingManagement={pending} != govSafe — run `prep` first")
        sys.exit(1)
    nonce = int(cast("call", cfg["govSafe"], "nonce()(uint256)"))
    print(f"  Safe nonce: {nonce}")

    # --- 1. acceptManagement on strategy ---
    print("\n[1] Safe -> strategy.acceptManagement()")
    data1 = cast("calldata", "acceptManagement()")
    tx1 = safe_exec(cfg["govSafe"], cfg["strategy"], data1, signers, signers[0][1], nonce)
    print(f"  broadcast tx: {tx1}")
    print("  receipt ok:", wait_receipt(tx1))
    mgmt = cast("call", cfg["strategy"], "management()(address)")
    print(f"  strategy.management() = {mgmt}")
    if mgmt.lower() != cfg["govSafe"].lower():
        print("[ERROR] management() != govSafe")
        sys.exit(1)

    # --- 2. schedule accept_role_manager on timelock ---
    print("\n[2] Safe -> timelock.schedule(vault.accept_role_manager(), 48h)")
    accept = accept_rm_calldata()
    schedule_data = cast(
        "calldata",
        "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
        cfg["vault"], 0, accept, ZERO32, SALT, DELAY,
    )
    op_id = cast(
        "call", cfg["timelock"],
        "hashOperation(address,uint256,bytes,bytes32,bytes32)(bytes32)",
        cfg["vault"], 0, accept, ZERO32, SALT,
    )
    print(f"  operation id: {op_id}")
    already = cast("call", cfg["timelock"], "isOperationPending(bytes32)(bool)", op_id)
    if already == "true":
        print("  op already scheduled — skipping schedule tx")
    else:
        tx2 = safe_exec(cfg["govSafe"], cfg["timelock"], schedule_data, signers,
                        signers[0][1], nonce + 1)
        print(f"  broadcast tx: {tx2}")
        print("  receipt ok:", wait_receipt(tx2))

    state = cast("call", cfg["timelock"], "isOperationPending(bytes32)(bool)", op_id)
    ready = cast("call", cfg["timelock"], "isOperationReady(bytes32)(bool)", op_id)
    print(f"  isOperationPending: {state}")
    print(f"  isOperationReady:   {ready}")
    ts = cast("block", "latest", "--field", "timestamp")
    print(f"  now: {ts} (execute possible at timestamp + {DELAY})")
    print("[OK] handoff complete — wait 48h, then run `execute`")


def phase_status(cfg):
    print("== STATUS ==")
    future_rm = cast("call", cfg["vault"], "future_role_manager()(address)")
    rm = cast("call", cfg["vault"], "role_manager()(address)")
    mgmt = cast("call", cfg["strategy"], "management()(address)")
    pending = cast("call", cfg["strategy"], "pendingManagement()(address)")
    print(f"  vault.role_manager:          {rm}")
    print(f"  vault.future_role_manager:   {future_rm}")
    print(f"  strategy.management:         {mgmt}")
    print(f"  strategy.pendingManagement:  {pending}")
    accept = accept_rm_calldata()
    op_id = cast(
        "call", cfg["timelock"],
        "hashOperation(address,uint256,bytes,bytes32,bytes32)(bytes32)",
        cfg["vault"], 0, accept, ZERO32, SALT,
    )
    print(f"  operation id:                {op_id}")
    for name in ("isOperationPending", "isOperationReady", "isOperationDone"):
        v = cast("call", cfg["timelock"], f"{name}(bytes32)(bool)", op_id)
        print(f"  {name}: {v}")
    ts = cast("block", "latest", "--field", "timestamp")
    print(f"  block timestamp: {ts}")
    nonce = cast("call", cfg["govSafe"], "nonce()(uint256)")
    print(f"  Safe nonce: {nonce}")


def phase_execute(cfg, signers):
    print("== EXECUTE: Safe -> timelock.execute ==")
    accept = accept_rm_calldata()
    op_id = cast(
        "call", cfg["timelock"],
        "hashOperation(address,uint256,bytes,bytes32,bytes32)(bytes32)",
        cfg["vault"], 0, accept, ZERO32, SALT,
    )
    ready = cast("call", cfg["timelock"], "isOperationReady(bytes32)(bool)", op_id)
    print(f"  operation: {op_id}")
    print(f"  isOperationReady: {ready}")
    if ready != "true":
        print("[BLOCKED] operation not ready yet — 48h delay not elapsed (or not scheduled)")
        sys.exit(1)
    nonce = int(cast("call", cfg["govSafe"], "nonce()(uint256)"))
    exec_data = cast(
        "calldata",
        "execute(address,uint256,bytes,bytes32,bytes32)",
        cfg["vault"], 0, accept, ZERO32, SALT,
    )
    tx = safe_exec(cfg["govSafe"], cfg["timelock"], exec_data, signers, signers[0][1], nonce)
    print(f"  broadcast tx: {tx}")
    print("  receipt ok:", wait_receipt(tx))
    rm = cast("call", cfg["vault"], "role_manager()(address)")
    print(f"  vault.role_manager = {rm}")
    if rm.lower() != cfg["timelock"].lower():
        print("[ERROR] role_manager != timelock")
        sys.exit(1)
    print("[OK] timelock is role_manager — handover COMPLETE")


def phase_verify(cfg):
    print("== VERIFY ==")
    checks = []
    rm = cast("call", cfg["vault"], "role_manager()(address)")
    checks.append(("vault.role_manager == timelock", rm.lower() == cfg["timelock"].lower(), rm))
    future = cast("call", cfg["vault"], "future_role_manager()(address)")
    checks.append(("vault.future_role_manager == 0", future.lower() == ZERO_ADDR, future))
    mgmt = cast("call", cfg["strategy"], "management()(address)")
    checks.append(("strategy.management == govSafe", mgmt.lower() == cfg["govSafe"].lower(), mgmt))
    tl_roles = cast("call", cfg["vault"], "roles(address)(uint256)", cfg["timelock"])
    checks.append(("vault.roles(timelock) == 3995", tl_roles == "3995", tl_roles))
    dep_roles = cast("call", cfg["vault"], "roles(address)(uint256)", cfg["deployer"])
    checks.append(("vault.roles(deployer) == 0", dep_roles == "0", dep_roles))
    api = cast("call", cfg["vault"], "apiVersion()(string)")
    checks.append(("vault.apiVersion == 3.1.1", api == "3.1.1", api))
    limit = cast("call", cfg["vault"], "deposit_limit()(uint256)")
    checks.append(("vault.deposit_limit == 0 (closed)", limit == "0", limit))
    threshold = cast("call", cfg["govSafe"], "getThreshold()(uint256)")
    checks.append(("Safe threshold == 2", threshold == "2", threshold))
    ok = True
    for name, passed, val in checks:
        print(f"  [{'ok' if passed else 'FAIL'}] {name} = {val}")
        ok &= passed
    print("VERIFY:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


def main():
    global RPC
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("phase", choices=["prep", "handoff", "status", "execute", "verify"])
    ap.add_argument("--rpc-url", default=RPC)
    args = ap.parse_args()
    RPC = args.rpc_url

    cfg = load_cfg()
    print(f"vault={cfg['vault']}")
    print(f"strategy={cfg['strategy']}")
    print(f"timelock={cfg['timelock']}")
    print(f"govSafe={cfg['govSafe']}")

    if args.phase == "status":
        phase_status(cfg)
        return
    if args.phase == "verify":
        phase_verify(cfg)
        return

    deployer_pk = os.environ.get("PRIVATE_KEY")
    if not deployer_pk:
        print("[ERROR] PRIVATE_KEY missing (needed for broadcaster txs)")
        sys.exit(1)
    dep_addr = cast("wallet", "address", "--private-key", deployer_pk)
    if dep_addr.lower() != cfg["deployer"].lower():
        print(f"[ERROR] PRIVATE_KEY derives {dep_addr}, config deployer {cfg['deployer']}")
        sys.exit(1)

    signers = load_signers()
    print("signers:", ", ".join(a for a, _ in signers))

    if args.phase == "prep":
        phase_prep(cfg, deployer_pk)
    elif args.phase == "handoff":
        phase_handoff(cfg, signers)
    elif args.phase == "execute":
        phase_execute(cfg, signers)


if __name__ == "__main__":
    main()
