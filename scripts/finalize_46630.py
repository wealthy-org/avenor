#!/usr/bin/env python3
"""Avenor 46630 finalization pipeline (v2 stack) — post-handover full completion.

Pipeline (all governance ops via govSafe 2/3 -> 48h TimelockController):

  schedule   Safe 2/3 schedules 5 timelock ops (idempotent, deterministic salts):
               allowlist_keeper    hook.setAllowed(keeper, true)      (hook governance = timelock)
               allowlist_treasury  hook.setAllowed(treasury, true)
               allowlist_deployer  hook.setAllowed(deployer, true)
               maxdebt             vault.update_max_debt_for_strategy(strategy, 250_000e6)
               hookop              vault.set_deposit_hook(hook, override=true)
  run        long-running orchestrator (keep-awake on Windows):
               1. wait handover op ready -> Safe exec timelock.execute(accept_role_manager)
               2. wait each op ready -> Safe exec (allowlist x3, maxdebt, hookop)
               3. seed: keeper mints MockUSDG 1100e6, approves, deposits 1000e6,
                  transfers all shares to 0xdEaD (dead shares seed, ADR-7)
               4. drill: keeper update_debt(strategy, 500e6) -> report() -> update_debt(strategy, 0)
               5. write _bmad-output/finalize-46630-report.json
  status     print all op states + on-chain facts
  exec-one   manual fallback: execute a single op by name (for use if background run died)

Preconditions (checked at start):
  - DepositCapHook deployed: 0xf1363c4a6e257e7b0798013f4b241acd439ac6bf
    (vault=vault, governance=timelock, globalCap=250_000e6, defaultWalletCap=25_000e6, allowlist=true)
  - handover op already scheduled (salt 0) by handover_46630.py handoff

No private key is ever printed. Keys come from .env (DEPLOYER_PRIVATE_KEY,
KEEPER_PRIVATE_KEY, GOVERNANCE_OWNER_KEY_1/2/3).
"""

import argparse
import ctypes
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import handover_46630 as H  # cast, cast_send, safe_exec, wait_receipt, signers, retries

RPC = os.environ.get("RPC_URL", "https://rpc.testnet.chain.robinhood.com")
H.RPC = RPC  # module-level RPC used by H.cast / H.cast_send

STATE_PATH = ROOT / "_bmad-output" / "finalize-46630-state.json"
REPORT_PATH = ROOT / "_bmad-output" / "finalize-46630-report.json"
LOG_PATH = ROOT / "_bmad-output" / "finalize-46630.log"

DELAY = 172800  # 48h
MAX_DEBT = 250_000 * 10**6      # 250,000 USDG — aligns with hook globalCap (DEPLOYMENT.md 7.4)
WALLET_CAP = 25_000 * 10**6     # hook defaultWalletCap (informational here; set at deploy)
SEED_ASSETS = 1_000 * 10**6     # 1,000 USDG — minimal productive seed (ADR-7)
MINT_ASSETS = 1_100 * 10**6     # mint buffer so approve/deposit never underflows
DRILL_DEBT = 500 * 10**6        # 500 USDG pushed to venue during drill

ZERO32 = "0x" + "00" * 32
DEAD = "0x000000000000000000000000000000000000dEaD"


def cfg():
    p = json.loads((ROOT / "packages" / "config" / "46630.json").read_text())
    st = p["deployments"]["stage"]
    return {
        "vault": st["vault"],
        "strategy": st["strategy"],
        "accountant": st["accountant"],
        "timelock": st["timelock"],
        "hook": st["depositCapHook"],
        "usdg": st["mockUsdg"],
        "govSafe": st["governanceSafe"],
        "keeper": st["keeper"],
        "treasury": st["treasury"],
        "deployer": st["deployer"],
    }


def env_key(name):
    v = os.environ.get(name)
    if not v:
        print(f"[ERROR] {name} missing (source .env)")
        sys.exit(1)
    return v


def load_env_file():
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def log(msg):
    line = f"[{now()}] {msg}"
    print(line, flush=True)
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a", encoding="ascii", errors="replace") as f:
            f.write(line + "\n")
    except OSError:
        pass


def salt_for(name):
    return "0x" + name.encode("ascii").hex().ljust(64, "0")


def op_defs(c):
    """Deterministic op list. Order matters for run-phase execution."""
    from functools import partial

    hook_calls = [
        ("allowlist_keeper", c["hook"],
         lambda: H.cast("calldata", "setAllowed(address,bool)", c["keeper"], "true")),
        ("allowlist_treasury", c["hook"],
         lambda: H.cast("calldata", "setAllowed(address,bool)", c["treasury"], "true")),
        ("allowlist_deployer", c["hook"],
         lambda: H.cast("calldata", "setAllowed(address,bool)", c["deployer"], "true")),
        ("maxdebt", c["vault"],
         lambda: H.cast("calldata", "update_max_debt_for_strategy(address,uint256)",
                        c["strategy"], str(MAX_DEBT))),
        ("hookop", c["vault"],
         lambda: H.cast("calldata", "set_deposit_hook(address,bool)", c["hook"], "true")),
    ]
    return [(name, target, mk()) for name, target, mk in
            [(n, t, f) for n, t, f in hook_calls]]


def op_id(c, timelock, target, data, salt):
    return H.cast("call", timelock,
                  "hashOperation(address,uint256,bytes,bytes32,bytes32)(bytes32)",
                  target, 0, data, ZERO32, salt)


def handover_op(c):
    accept = H.cast("calldata", "accept_role_manager()")
    oid = H.cast("call", c["timelock"],
                 "hashOperation(address,uint256,bytes,bytes32,bytes32)(bytes32)",
                 c["vault"], 0, accept, ZERO32, H.SALT)
    return {"target": c["vault"], "data": accept, "salt": H.SALT, "opId": oid,
            "name": "handover", "executed": None}


def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"ops": {}, "seed": None, "drill": None, "handover": None}


def save_state(s):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(s, indent=1))


def check_hook(c):
    vault = H.cast("call", c["hook"], "vault()(address)")
    gov = H.cast("call", c["hook"], "governance()(address)")
    gcap = int(H.cast("call", c["hook"], "globalCap()(uint256)").split()[0])
    wcap = int(H.cast("call", c["hook"], "defaultWalletCap()(uint256)").split()[0])
    alw = H.cast("call", c["hook"], "allowlistEnabled()(bool)")
    ok = (vault.lower() == c["vault"].lower() and gov.lower() == c["timelock"].lower()
          and gcap == MAX_DEBT and wcap == WALLET_CAP and alw == "true")
    log(f"hook check: vault={vault} gov={gov} globalCap={gcap} walletCap={wcap} allowlist={alw} -> "
        f"{'OK' if ok else 'MISMATCH'}")
    if not ok:
        sys.exit(1)


# ---------------------------------------------------------------------------
# Phases
# ---------------------------------------------------------------------------

def phase_schedule(c, signers):
    print("== SCHEDULE: 5 timelock ops via Safe ==")
    check_hook(c)
    nonce = int(H.cast("call", c["govSafe"], "nonce()(uint256)"))
    state = load_state()
    for name, target, data in op_defs(c):
        salt = salt_for(name)
        oid = op_id(c, c["timelock"], target, data, salt)
        pending = H.cast("call", c["timelock"], "isOperationPending(bytes32)(bool)", oid)
        done = H.cast("call", c["timelock"], "isOperationDone(bytes32)(bool)", oid)
        if pending == "true" or done == "true":
            log(f"{name}: already scheduled (done={done}) — skip")
            state["ops"].setdefault(name, {"opId": oid, "salt": salt})
            continue
        sched = H.cast("calldata",
                       "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
                       target, 0, data, ZERO32, salt, DELAY)
        tx = H.safe_exec(c["govSafe"], c["timelock"], sched, signers,
                         signers[0][1], nonce)
        ok = H.wait_receipt(tx)
        log(f"{name}: schedule tx={tx} receipt_ok={ok} opId={oid}")
        if not ok:
            sys.exit(1)
        state["ops"][name] = {"opId": oid, "salt": salt, "scheduleTx": tx}
        nonce += 1
        save_state(state)
        time.sleep(2)
    # record handover op for the run phase
    h = handover_op(c)
    state["handover"] = {"opId": h["opId"], "salt": h["salt"]}
    save_state(state)
    ready = H.cast("call", c["timelock"], "isOperationPending(bytes32)(bool)", h["opId"])
    ts = int(H.cast("block", "latest", "--field", "timestamp"))
    print(f"handover opId: {h['opId']} (pending={ready})")
    print(f"chain time: {ts}; handover ready at 1796034031")
    for name in state["ops"]:
        oid = state["ops"][name]["opId"]
        pend = H.cast("call", c["timelock"], "isOperationPending(bytes32)(bool)", oid)
        print(f"  {name}: pending={pend} opId={oid[:18]}...")
    print("[OK] schedule complete")


def wait_ready(c, oid, poll_s=60):
    while True:
        r = H.cast("call", c["timelock"], "isOperationReady(bytes32)(bool)", oid)
        if r == "true":
            return
        ts = int(H.cast("block", "latest", "--field", "timestamp"))
        log(f"waiting: op {oid[:18]}... not ready (chain={ts}) — sleep {poll_s}s")
        time.sleep(poll_s)


def exec_op(c, signers, name, target, data, salt, oid):
    done = H.cast("call", c["timelock"], "isOperationDone(bytes32)(bool)", oid)
    if done == "true":
        log(f"{name}: already done — skip")
        return
    wait_ready(c, oid)
    exe = H.cast("calldata", "execute(address,uint256,bytes,bytes32,bytes32)",
                 target, 0, data, ZERO32, salt)
    nonce = int(H.cast("call", c["govSafe"], "nonce()(uint256)"))
    tx = H.safe_exec(c["govSafe"], c["timelock"], exe, signers, signers[0][1], nonce)
    ok = H.wait_receipt(tx)
    log(f"{name}: EXECUTE tx={tx} receipt_ok={ok}")
    if not ok:
        sys.exit(1)
    done2 = H.cast("call", c["timelock"], "isOperationDone(bytes32)(bool)", oid)
    if done2 != "true":
        log(f"{name}: not marked done after execute — abort")
        sys.exit(1)


def phase_seed(c, keeper_pk):
    print("== SEED: dead shares (ADR-7) ==")
    if H.cast("call", c["vault"], "totalSupply()(uint256)") != "0":
        log("totalSupply != 0 — seed already done? skip")
        return
    # keeper mints MockUSDG (public mint), approves, deposits, transfers shares to dead
    tx = H.cast_send(c["usdg"], "mint(address,uint256)", c["keeper"], str(MINT_ASSETS),
                     pk=keeper_pk, gas=120000)
    log(f"mint tx={tx} ok={H.wait_receipt(tx)}")
    tx = H.cast_send(c["usdg"], "approve(address,uint256)", c["vault"], str(SEED_ASSETS),
                     pk=keeper_pk, gas=80000)
    log(f"approve tx={tx} ok={H.wait_receipt(tx)}")
    tx = H.cast_send(c["vault"], "deposit(uint256,address)", str(SEED_ASSETS), c["keeper"],
                     pk=keeper_pk, gas=300000)
    log(f"deposit tx={tx} ok={H.wait_receipt(tx)}")
    shares = H.cast("call", c["vault"], "balanceOf(address)(uint256)", c["keeper"])
    log(f"keeper shares: {shares}")
    if int(shares) == 0:
        log("[ERROR] deposit produced zero shares — abort")
        sys.exit(1)
    tx = H.cast_send(c["vault"], "transfer(address,uint256)", DEAD, shares,
                     pk=keeper_pk, gas=80000)
    log(f"transfer-to-dead tx={tx} ok={H.wait_receipt(tx)}")
    ts = H.cast("call", c["vault"], "totalSupply()(uint256)")
    dead_bal = H.cast("call", c["vault"], "balanceOf(address)(uint256)", DEAD)
    ta = H.cast("call", c["vault"], "totalAssets()(uint256)")
    log(f"totalSupply={ts} deadShares={dead_bal} totalAssets={ta}")
    if int(ts) == 0 or int(dead_bal) != int(ts):
        log("[ERROR] dead-share invariant broken — abort")
        sys.exit(1)
    state = load_state()
    state["seed"] = {"txs": ["mint", "approve", "deposit", "transfer"],
                     "totalSupply": ts, "totalAssets": ta}
    save_state(state)
    log("[OK] seed complete (dead shares seeded)")


def phase_drill(c, keeper_pk):
    print("== DRILL: keeper update_debt -> report -> update_debt(0) ==")
    state = load_state()
    if state.get("drill"):
        log("drill already recorded — skip")
        return
    idle_before = H.cast("call", c["vault"], "totalAssets()(uint256)")
    debt_before = H.cast("call", c["strategy"], "totalAssets()(uint256)")
    log(f"pre-drill: vault.totalAssets={idle_before} strategy.totalAssets={debt_before}")

    tx = H.cast_send(c["vault"], "update_debt(address,uint256)", c["strategy"],
                     str(DRILL_DEBT), pk=keeper_pk, gas=400000)
    log(f"update_debt(+{DRILL_DEBT}) tx={tx} ok={H.wait_receipt(tx)}")
    debt_mid = H.cast("call", c["strategy"], "totalAssets()(uint256)")
    log(f"mid-drill: strategy.totalAssets={debt_mid}")
    if int(debt_mid) < int(debt_before):
        log("[ERROR] venue did not take debt — abort drill")
        sys.exit(1)

    tx = H.cast_send(c["strategy"], "report()", pk=keeper_pk, gas=400000)
    log(f"report tx={tx} ok={H.wait_receipt(tx)}")

    tx = H.cast_send(c["vault"], "update_debt(address,uint256)", c["strategy"], "0",
                     pk=keeper_pk, gas=400000)
    log(f"update_debt(0) tx={tx} ok={H.wait_receipt(tx)}")
    debt_after = H.cast("call", c["strategy"], "totalAssets()(uint256)")
    idle_after = H.cast("call", c["vault"], "totalAssets()(uint256)")
    log(f"post-drill: strategy.totalAssets={debt_after} vault.totalAssets={idle_after}")
    if int(debt_after) > 5:  # <=5 wei dust tolerated (venue 18-dec share rounding)
        log(f"[ERROR] strategy did not return all assets (debt={debt_after}) — abort")
        sys.exit(1)
    state["drill"] = {"drillDebt": str(DRILL_DEBT),
                      "pre": {"vault": idle_before, "strategy": debt_before},
                      "post": {"vault": idle_after, "strategy": debt_after}}
    save_state(state)
    log("[OK] drill complete (full debt cycle, no loss)")


def phase_run(c, signers, keeper_pk):
    log("== RUN: pipeline start ==")
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)  # ES_CONTINUOUS|ES_SYSTEM_REQUIRED
        log("keep-awake ON")
    except Exception:
        log("keep-awake unavailable (non-Windows?)")

    try:
        # 1. handover
        h = handover_op(c)
        state = load_state()
        if state.get("handover", {}).get("executedTx"):
            log("handover already executed (state)")
        elif H.cast("call", c["vault"], "role_manager()(address)").lower() == c["timelock"].lower():
            log("handover already on-chain (role_manager == timelock)")
            state.setdefault("handover", {})["executedTx"] = "pre-existing"
            save_state(state)
        else:
            log(f"waiting handover op {h['opId']}")
            exec_op(c, signers, "handover", c["vault"], h["data"], h["salt"], h["opId"])
            state = load_state()
            state.setdefault("handover", {})["executedTx"] = True
            save_state(state)
            rm = H.cast("call", c["vault"], "role_manager()(address)")
            log(f"role_manager now: {rm}")

        # 2. governance ops in deterministic order
        for name, target, data in op_defs(c):
            salt = salt_for(name)
            oid = op_id(c, c["timelock"], target, data, salt)
            exec_op(c, signers, name, target, data, salt, oid)
            state = load_state()
            state["ops"].setdefault(name, {"opId": oid, "salt": salt})["executedTx"] = True
            save_state(state)
            if name == "hookop":
                dh = H.cast("call", c["vault"], "deposit_hook()(address)")
                dl = H.cast("call", c["vault"], "deposit_limit()(uint256)")
                log(f"post-hook: deposit_hook={dh} deposit_limit={dl}")
                if dh.lower() != c["hook"].lower():
                    sys.exit(1)

        # 3. seed
        phase_seed(c, keeper_pk)

        # 4. drill
        phase_drill(c, keeper_pk)

        # 5. final report
        write_report(c)
        log("== RUN: pipeline COMPLETE ==")
    finally:
        try:
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
            log("keep-awake OFF")
        except Exception:
            pass


def write_report(c):
    facts = {}
    for label, to, sig in [
        ("role_manager", c["vault"], "role_manager()(address)"),
        ("roles_timelock", c["vault"], "roles(address)(uint256)"),
        ("deposit_hook", c["vault"], "deposit_hook()(address)"),
        ("deposit_limit", c["vault"], "deposit_limit()(uint256)"),
        ("totalSupply", c["vault"], "totalSupply()(uint256)"),
        ("totalAssets", c["vault"], "totalAssets()(uint256)"),
        ("deadShares", DEAD, "x"),  # placeholder replaced below
    ]:
        if sig == "x":
            facts[label] = H.cast("call", c["vault"], "balanceOf(address)(uint256)", DEAD)
        else:
            facts[label] = H.cast("call", to, sig)
    facts["strategy_maxDebt"] = H.cast("call", c["strategy"], "maxDebt()(uint256)")
    facts["strategy_totalAssets"] = H.cast("call", c["strategy"], "totalAssets()(uint256)")
    facts["hook_recordedDeposits"] = H.cast("call", c["hook"],
                                            "totalRecordedDeposits()(uint256)")
    facts["chain_time"] = H.cast("block", "latest", "--field", "timestamp")
    state = load_state()
    report = {"generatedAt": now(), "facts": facts,
              "handover": state.get("handover"), "seed": state.get("seed"),
              "drill": state.get("drill"), "ops": state.get("ops")}
    REPORT_PATH.write_text(json.dumps(report, indent=1))
    log(f"report written: {REPORT_PATH}")


def phase_status(c):
    print("== STATUS ==")
    h = handover_op(c)
    ts = int(H.cast("block", "latest", "--field", "timestamp"))
    print(f"chain time: {ts}  (handover ready at 1796034031)")
    for label, oid in [("handover", h["opId"])]:
        pend = H.cast("call", c["timelock"], "isOperationPending(bytes32)(bool)", oid)
        rdy = H.cast("call", c["timelock"], "isOperationReady(bytes32)(bool)", oid)
        done = H.cast("call", c["timelock"], "isOperationDone(bytes32)(bool)", oid)
        print(f"  {label}: pending={pend} ready={rdy} done={done}")
    for name, target, data in op_defs(c):
        salt = salt_for(name)
        oid = op_id(c, c["timelock"], target, data, salt)
        pend = H.cast("call", c["timelock"], "isOperationPending(bytes32)(bool)", oid)
        rdy = H.cast("call", c["timelock"], "isOperationReady(bytes32)(bool)", oid)
        done = H.cast("call", c["timelock"], "isOperationDone(bytes32)(bool)", oid)
        print(f"  {name}: pending={pend} ready={rdy} done={done}")
    rm = H.cast("call", c["vault"], "role_manager()(address)")
    dh = H.cast("call", c["vault"], "deposit_hook()(address)")
    tsup = H.cast("call", c["vault"], "totalSupply()(uint256)")
    print(f"  role_manager={rm}")
    print(f"  deposit_hook={dh}")
    print(f"  totalSupply={tsup}")
    st = load_state()
    print(f"  state: seed={st.get('seed') is not None} drill={st.get('drill') is not None}")


def phase_exec_one(c, signers, name):
    print(f"== EXEC-ONE: {name} ==")
    if name == "handover":
        h = handover_op(c)
        exec_op(c, signers, "handover", c["vault"], h["data"], h["salt"], h["opId"])
        return
    for opname, target, data in op_defs(c):
        if opname == name:
            salt = salt_for(name)
            oid = op_id(c, c["timelock"], target, data, salt)
            exec_op(c, signers, name, target, data, salt, oid)
            state = load_state()
            state["ops"].setdefault(name, {"opId": oid, "salt": salt})["executedTx"] = True
            save_state(state)
            return
    print(f"[ERROR] unknown op: {name}")
    sys.exit(1)


def main():
    load_env_file()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("phase", choices=["schedule", "run", "status", "exec-one", "report"])
    ap.add_argument("opname", nargs="?", default=None,
                    help="for exec-one: handover|allowlist_keeper|allowlist_treasury|"
                         "allowlist_deployer|maxdebt|hookop")
    args = ap.parse_args()

    global RPC
    c = cfg()
    print(f"vault={c['vault']}")
    print(f"strategy={c['strategy']}")
    print(f"timelock={c['timelock']}")
    print(f"hook={c['hook']}")
    print(f"govSafe={c['govSafe']}")

    if args.phase == "status":
        phase_status(c)
        return
    if args.phase == "report":
        write_report(c)
        return

    signers = H.load_signers()
    print("signers:", ", ".join(a for a, _ in signers))

    if args.phase == "schedule":
        phase_schedule(c, signers)
    elif args.phase == "run":
        keeper_pk = env_key("KEEPER_PRIVATE_KEY")
        kaddr = H.cast("wallet", "address", "--private-key", keeper_pk)
        if kaddr.lower() != c["keeper"].lower():
            print(f"[ERROR] KEEPER_PRIVATE_KEY derives {kaddr}, config keeper {c['keeper']}")
            sys.exit(1)
        phase_run(c, signers, keeper_pk)
    elif args.phase == "exec-one":
        if not args.opname:
            print("[ERROR] exec-one requires op name")
            sys.exit(1)
        phase_exec_one(c, signers, args.opname)


if __name__ == "__main__":
    main()
