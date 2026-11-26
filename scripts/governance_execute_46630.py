#!/usr/bin/env python3
"""
governance_execute_46630.py

Second half of the Avenor testnet 46630 governance handoff: executes the queued
timelock operation that hands the vault's role_manager to the 48h TimelockController.

Steps:
  1. Pre-flight: operation ready (48h elapsed), vault role_manager is still the
     deployer, vault future_role_manager is the timelock, Safe owners match keys.
  2. Governance Safe calls timelock.execute(vault, 0, accept_role_manager(), 0, salt=1).
  3. Post-flight: vault role_manager() == timelock, operation no longer pending.

No private key is embedded in this file. Both signer keys come from the environment:
  $env:PK1="<owner1 key>"; $env:PK2="<owner2 key>"; python scripts/governance_execute_46630.py

Authors:
  BMAD DevOps Agent - Avenor Testnet 46630 Governance Execute
"""

import os
import subprocess
import sys
import json
import time

# ---------------------------------------------------------------------------
# Config (must match scripts/governance_handoff_46630.py)
# ---------------------------------------------------------------------------
CAST = os.path.expanduser(r"~\.foundry\bin\cast.exe")
RPC = "https://rpc.testnet.chain.robinhood.com"

GOVERNANCE_SAFE = "0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA"
STRATEGY = "0x8f151132f80277b7D42Ad9615172E6De1B26Cf93"
VAULT = "0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0"
TIMELOCK = "0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc"
DEPLOYER = "0x56d845a35EDe1436B8053f705b4b189c412A8648"
ADDR2_EXPECTED = "0x445be78AbB762884459FB0EC54FE78A5c9a573E1"

TIMELOCK_SALT = "0x0000000000000000000000000000000000000000000000000000000000000001"
ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000"

EXPECTED_OPERATION_ID = "0x9068381b1398cc7c6ca1753431c50f21db62ca44305f6d4d1fa3b450cd17d05f"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def cast(*args, check=True):
    result = subprocess.run([CAST] + [str(a) for a in args], capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"[ERROR] cast failed: {' '.join([CAST] + [str(a) for a in args])}")
        print(result.stderr)
        sys.exit(1)
    return result.stdout.strip()


def first_word(text):
    return text.split()[0]


def get_safe_tx_hash(safe, to, data, nonce):
    return cast(
        "call", safe,
        "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)",
        to, 0, data, 0, 0, 0, 0,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        nonce,
        "--rpc-url", RPC,
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
            print(f"[ERROR] Signing failed: {result.stderr}")
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


def send(to, sig, *args, pk, gas):
    cmd = [CAST, "send", to, sig] + [str(a) for a in args]
    cmd += ["--private-key", pk, "--rpc-url", RPC, "--gas-limit", str(gas)]
    print(f"  $ cast send {to} execTransaction(...) --gas-limit {gas}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("[ERROR] cast send failed:")
        print(result.stderr)
        sys.exit(1)
    for line in result.stdout.splitlines():
        if line.startswith("transactionHash"):
            return line.split()[-1]
    return result.stdout.strip()


def wait_for_receipt(tx_hash, timeout=90):
    print(f"  Waiting for receipt: {tx_hash}")
    for _ in range(timeout // 5):
        result = subprocess.run([CAST, "receipt", tx_hash, "--rpc-url", RPC],
                                capture_output=True, text=True)
        if result.returncode == 0 and "blockNumber" in result.stdout:
            status_line = [l.strip() for l in result.stdout.splitlines() if l.lower().startswith("status")]
            if status_line and "1" in status_line[0]:
                print(f"  {status_line[0]}")
                return True
            print(f"[ERROR] Transaction did not succeed: {status_line}")
            sys.exit(1)
        time.sleep(5)
    print("[ERROR] Timeout waiting for receipt")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    pk1 = os.environ.get("PK1") or os.environ.get("PRIVATE_KEY")
    pk2 = os.environ.get("PK2")
    if not pk1:
        print("[ERROR] Set PK1 environment variable to owner1 private key")
        sys.exit(1)
    if not pk2:
        print("[ERROR] Set PK2 environment variable to owner2 private key")
        sys.exit(1)

    addr1 = cast("wallet", "address", "--private-key", pk1).lower()
    addr2 = cast("wallet", "address", "--private-key", pk2).lower()

    print("=" * 60)
    print("AVENOR TESTNET 46630 - TIMELOCK EXECUTE (accept_role_manager)")
    print("=" * 60)

    print("\n[0] Signer identity...")
    print(f"  owner1 (PK1): {addr1}")
    print(f"  owner2 (PK2): {addr2}")
    if addr1 != DEPLOYER.lower():
        print(f"[ERROR] PK1 is not the recorded owner1 {DEPLOYER}")
        sys.exit(1)
    if addr2 != ADDR2_EXPECTED.lower():
        print(f"[ERROR] PK2 is not the recorded owner2 {ADDR2_EXPECTED}")
        sys.exit(1)

    owners = cast("call", GOVERNANCE_SAFE, "getOwners()(address[])", "--rpc-url", RPC)
    if addr1 not in owners.lower() or addr2 not in owners.lower():
        print(f"[ERROR] Signers are not Safe owners. Owners: {owners}")
        sys.exit(1)

    safe_nonce = int(first_word(cast("call", GOVERNANCE_SAFE, "nonce()(uint256)", "--rpc-url", RPC)))
    print(f"  Governance Safe nonce: {safe_nonce}")

    # -------------------------------------------------------------------
    # 1. Pre-flight
    # -------------------------------------------------------------------
    print("\n[1] Pre-flight checks...")

    accept_rm_calldata = cast("calldata", "accept_role_manager()")
    print(f"  vault.accept_role_manager() calldata: {accept_rm_calldata}")

    op_id = cast(
        "call", TIMELOCK,
        "hashOperation(address,uint256,bytes,bytes32,bytes32)(bytes32)",
        VAULT, 0, accept_rm_calldata, ZERO32, TIMELOCK_SALT,
        "--rpc-url", RPC,
    )
    print(f"  Operation ID: {op_id}")
    if op_id.lower() != EXPECTED_OPERATION_ID.lower():
        print(f"[ERROR] Operation ID does not match the recorded schedule {EXPECTED_OPERATION_ID}")
        sys.exit(1)

    is_pending = cast("call", TIMELOCK, "isOperationPending(bytes32)(bool)", op_id, "--rpc-url", RPC)
    is_ready = cast("call", TIMELOCK, "isOperationReady(bytes32)(bool)", op_id, "--rpc-url", RPC)
    is_done = cast("call", TIMELOCK, "isOperationDone(bytes32)(bool)", op_id, "--rpc-url", RPC)
    execute_at = int(first_word(cast("call", TIMELOCK, "getTimestamp(bytes32)(uint256)", op_id, "--rpc-url", RPC)))
    now_ts = int(first_word(cast("block", "latest", "--rpc-url", RPC, "--field", "timestamp")))

    print(f"  isOperationPending: {is_pending}")
    print(f"  isOperationReady:   {is_ready}")
    print(f"  isOperationDone:    {is_done}")
    print(f"  executeAfter:       {execute_at}")
    print(f"  chain timestamp:    {now_ts}")
    print(f"  wait remaining:     {max(0, execute_at - now_ts)}s")

    if "true" in is_done.lower():
        print("\n[OK] Operation already executed; nothing to do. Verify role_manager below.")
    elif "true" not in is_ready.lower():
        print(f"\n[ERROR] Operation not ready yet. Retry after timestamp {execute_at}.")
        sys.exit(1)
    else:
        role_manager = cast("call", VAULT, "role_manager()(address)", "--rpc-url", RPC)
        future_rm = cast("call", VAULT, "future_role_manager()(address)", "--rpc-url", RPC)
        print(f"  vault.role_manager():        {role_manager}")
        print(f"  vault.future_role_manager(): {future_rm}")
        if role_manager.lower() != DEPLOYER.lower():
            print(f"[ERROR] role_manager is no longer the deployer {DEPLOYER} - refusing to replay")
            sys.exit(1)
        if future_rm.lower() != TIMELOCK.lower():
            print(f"[ERROR] future_role_manager is not the timelock {TIMELOCK}")
            sys.exit(1)
        print("  [OK] Pre-flight checks passed")

        # ---------------------------------------------------------------
        # 2. Safe executes timelock.execute(...)
        # ---------------------------------------------------------------
        print("\n[2] Building Safe tx: timelock.execute(...)...")
        execute_calldata = cast(
            "calldata",
            "execute(address,uint256,bytes,bytes32,bytes32)",
            VAULT, 0, accept_rm_calldata, ZERO32, TIMELOCK_SALT,
        )
        safe_tx_hash = get_safe_tx_hash(GOVERNANCE_SAFE, TIMELOCK, execute_calldata, safe_nonce)
        print(f"  Safe tx hash: {safe_tx_hash}")

        packed_sigs = build_safe_signatures(safe_tx_hash, [(addr1, pk1), (addr2, pk2)])
        print(f"  Packed signatures (2/3): {packed_sigs[:40]}...")

        print("\n  Broadcasting Safe.execTransaction for timelock.execute()...")
        tx_hash = send(
            GOVERNANCE_SAFE,
            "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)(bool)",
            TIMELOCK, 0, execute_calldata, 0, 0, 0, 0,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            packed_sigs,
            pk=pk1,
            gas=500000,
        )
        print(f"  TX hash: {tx_hash}")
        wait_for_receipt(tx_hash)
        print("  [OK] timelock.execute() executed!")

    # -------------------------------------------------------------------
    # 3. Post-flight
    # -------------------------------------------------------------------
    print("\n[3] Post-flight verification...")
    role_manager = cast("call", VAULT, "role_manager()(address)", "--rpc-url", RPC)
    future_rm = cast("call", VAULT, "future_role_manager()(address)", "--rpc-url", RPC)
    is_done = cast("call", TIMELOCK, "isOperationDone(bytes32)(bool)", op_id, "--rpc-url", RPC)

    print(f"  vault.role_manager():        {role_manager}")
    print(f"  vault.future_role_manager(): {future_rm}")
    print(f"  isOperationDone:             {is_done}")

    ok = (
        role_manager.lower() == TIMELOCK.lower()
        and future_rm == "0x0000000000000000000000000000000000000000"
        and "true" in is_done.lower()
    )
    if not ok:
        print("\n[FAIL] Post-flight state does not match the expected handoff")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("TIMELOCK EXECUTE SUMMARY")
    print("=" * 60)
    print(json.dumps({
        "network": "Robinhood Chain Testnet (46630)",
        "operationId": op_id,
        "vault": VAULT,
        "role_manager": role_manager,
        "future_role_manager": future_rm,
        "isOperationDone": True,
    }, indent=2))
    print("\nDone. Vault role_manager is now the 48h TimelockController.")


if __name__ == "__main__":
    main()
