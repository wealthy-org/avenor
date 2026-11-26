#!/usr/bin/env python3
"""
governance_handoff_46630.py

Executes the Avenor testnet 46630 governance handoff via Safe multisig:
  1. Governance Safe calls strategy.acceptManagement()
  2. Governance Safe calls timelock.schedule(vault, 0, vault.accept_role_manager(), 0, salt=1, delay=172800)

Uses cast.exe subprocesses — no Solidity stack-too-deep issues.

No private key is embedded in this file. Both signer keys are read from the
environment at run time and the signer address is derived from the key:
  $env:PK1="<owner1 key>"; $env:PK2="<owner2 key>"; python scripts/governance_handoff_46630.py

Authors:
  BMAD DevOps Agent — Avenor Testnet 46630 Governance Handoff
"""

import os
import subprocess
import sys
import json
import time

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
CAST = os.path.expanduser(r"~\.foundry\bin\cast.exe")
RPC  = "https://rpc.testnet.chain.robinhood.com"

# Addresses
GOVERNANCE_SAFE = "0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA"
STRATEGY        = "0x8f151132f80277b7D42Ad9615172E6De1B26Cf93"
VAULT           = "0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0"
TIMELOCK        = "0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc"
DEPLOYER        = "0x56d845a35EDe1436B8053f705b4b189c412A8648"

# Owner 2 key comes from the environment only. The address is derived from the
# key, never hard-coded, so a mismatched key fails instead of signing as the
# wrong owner. Owner 3 is not needed for a 2/3 execution.
ADDR2_EXPECTED = "0x445be78AbB762884459FB0EC54FE78A5c9a573E1"

# Timelock salt: 1 (matches deploy script)
TIMELOCK_SALT = "0x0000000000000000000000000000000000000000000000000000000000000001"
TIMELOCK_DELAY = 172800  # 48 hours

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def cast(*args, check=True):
    """Run cast.exe with given args, return stdout stripped."""
    cmd = [CAST] + list(str(a) for a in args)
    result = subprocess.run(cmd, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"[ERROR] cast failed: {' '.join(cmd)}")
        print(result.stderr)
        sys.exit(1)
    return result.stdout.strip()


def cast_send(to, sig, *args, pk, gas=300000):
    """Send a transaction and return the tx hash."""
    cmd = [CAST, "send", to, sig] + [str(a) for a in args]
    cmd += ["--private-key", pk, "--rpc-url", RPC, "--gas-limit", str(gas)]
    print(f"  $ cast send {to} {sig[:40]}... --gas-limit {gas}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[ERROR] cast send failed:")
        print(result.stderr)
        sys.exit(1)
    # Extract tx hash from output
    for line in result.stdout.splitlines():
        if line.startswith("transactionHash"):
            return line.split()[-1]
    # Fallback: return full output
    return result.stdout.strip()


def get_safe_tx_hash(safe, to, data, nonce):
    """Call Safe.getTransactionHash(...) with standard zero params."""
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
    """Sign a 32-byte hash with cast wallet sign --no-hash (raw hash signing)."""
    result = subprocess.run(
        [CAST, "wallet", "sign", "--private-key", pk, "--no-hash", hash_hex],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        # Try without --no-hash (older cast versions)
        result = subprocess.run(
            [CAST, "wallet", "sign", "--private-key", pk, hash_hex],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            print(f"[ERROR] Signing failed: {result.stderr}")
            sys.exit(1)
    return result.stdout.strip()


def build_safe_signatures(hash_hex, signers):
    """
    Build packed signatures for Safe.execTransaction.
    Signers: list of (address, private_key) sorted by address ascending (Safe requirement).
    """
    # Sort by address (lowercase) ascending
    signers_sorted = sorted(signers, key=lambda x: x[0].lower())
    packed = "0x"
    for addr, pk in signers_sorted:
        sig = sign_hash(hash_hex, pk)
        # sig is 65 bytes hex (130 chars without 0x prefix)
        if sig.startswith("0x"):
            sig = sig[2:]
        packed += sig
    return packed


def wait_for_receipt(tx_hash, timeout=60):
    """Poll for transaction receipt."""
    print(f"  Waiting for receipt: {tx_hash}")
    for i in range(timeout // 5):
        result = subprocess.run(
            [CAST, "receipt", tx_hash, "--rpc-url", RPC],
            capture_output=True, text=True
        )
        if result.returncode == 0 and "blockNumber" in result.stdout:
            # Extract status
            for line in result.stdout.splitlines():
                if "status" in line.lower():
                    print(f"  Receipt: {line.strip()}")
                    if "1" in line or "success" in line.lower():
                        return True
                    else:
                        print("[ERROR] Transaction reverted!")
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

    print("\n[0a] Signer identity...")
    print(f"  owner1 (PK1): {addr1}")
    print(f"  owner2 (PK2): {addr2}")
    if addr1 != DEPLOYER.lower():
        print(f"[ERROR] PK1 is not the recorded owner1 {DEPLOYER}")
        sys.exit(1)
    if addr2 != ADDR2_EXPECTED.lower():
        print(f"[ERROR] PK2 is not the recorded owner2 {ADDR2_EXPECTED}")
        sys.exit(1)

    print("=" * 60)
    print("AVENOR TESTNET 46630 — GOVERNANCE HANDOFF")
    print("=" * 60)

    # -------------------------------------------------------------------
    # 0. Pre-flight checks
    # -------------------------------------------------------------------
    print("\n[0] Pre-flight checks...")

    bal = cast("balance", DEPLOYER, "--rpc-url", RPC, "--ether")
    print(f"  Deployer balance: {bal} ETH")
    if float(bal) < 0.001:
        print("[ERROR] Insufficient balance for gas")
        sys.exit(1)

    nonce_raw = cast("call", GOVERNANCE_SAFE, "nonce()(uint256)", "--rpc-url", RPC)
    safe_nonce = int(nonce_raw.split()[0])
    print(f"  Safe nonce: {safe_nonce}")

    pending_mgmt = cast("call", STRATEGY, "pendingManagement()(address)", "--rpc-url", RPC)
    print(f"  strategy.pendingManagement(): {pending_mgmt}")
    if pending_mgmt.lower() != GOVERNANCE_SAFE.lower():
        print("[ERROR] pendingManagement is not the Governance Safe — cannot proceed")
        sys.exit(1)

    future_rm = cast("call", VAULT, "future_role_manager()(address)", "--rpc-url", RPC)
    print(f"  vault.future_role_manager(): {future_rm}")
    if future_rm.lower() != TIMELOCK.lower():
        print("[ERROR] future_role_manager is not the Timelock — cannot proceed")
        sys.exit(1)

    min_delay = int(cast("call", TIMELOCK, "getMinDelay()(uint256)", "--rpc-url", RPC).split()[0])
    print(f"  timelock.getMinDelay(): {min_delay}s")

    print("  [OK] All pre-flight checks passed")

    # -------------------------------------------------------------------
    # 1. Governance Safe calls strategy.acceptManagement()
    # -------------------------------------------------------------------
    print("\n[1] Building Safe tx: strategy.acceptManagement()...")

    # acceptManagement() selector
    accept_mgmt_data = cast("calldata", "acceptManagement()")
    print(f"  acceptManagement() calldata: {accept_mgmt_data}")

    tx1_hash = get_safe_tx_hash(GOVERNANCE_SAFE, STRATEGY, accept_mgmt_data, safe_nonce)
    print(f"  Safe tx hash: {tx1_hash}")

    # Build signatures (need 2/3: use owner1 = deployer, owner2)
    signers_1 = [
        (addr1, pk1),
        (addr2, pk2),
    ]
    packed_sigs_1 = build_safe_signatures(tx1_hash, signers_1)
    print(f"  Packed signatures (2/3): {packed_sigs_1[:40]}...")

    print("\n  Broadcasting Safe.execTransaction for acceptManagement()...")
    tx1_hash_on_chain = cast_send(
        GOVERNANCE_SAFE,
        "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)(bool)",
        STRATEGY,                     # to
        0,                            # value
        accept_mgmt_data,             # data
        0,                            # operation (Call)
        0,                            # safeTxGas
        0,                            # baseGas
        0,                            # gasPrice
        "0x0000000000000000000000000000000000000000",  # gasToken
        "0x0000000000000000000000000000000000000000",  # refundReceiver
        packed_sigs_1,                # signatures
        pk=pk1,
        gas=400000,
    )
    print(f"  TX1 hash: {tx1_hash_on_chain}")
    wait_for_receipt(tx1_hash_on_chain)
    print("  [OK] acceptManagement() executed!")

    # Verify
    actual_mgmt = cast("call", STRATEGY, "management()(address)", "--rpc-url", RPC)
    print(f"  strategy.management() is now: {actual_mgmt}")
    if actual_mgmt.lower() != GOVERNANCE_SAFE.lower():
        print("[WARN] management() not updated yet — may need a block")

    # -------------------------------------------------------------------
    # 2. Governance Safe calls timelock.schedule(vault, 0, accept_role_manager_calldata, 0, salt, delay)
    # -------------------------------------------------------------------
    print("\n[2] Building Safe tx: timelock.schedule(vault.accept_role_manager())...")

    # accept_role_manager() selector on the Vault
    accept_rm_calldata = cast("calldata", "accept_role_manager()")
    print(f"  vault.accept_role_manager() calldata: {accept_rm_calldata}")

    # Build timelock.schedule(target, value, data, predecessor, salt, delay) calldata
    schedule_calldata = cast(
        "calldata",
        "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
        VAULT,              # target
        0,                  # value
        accept_rm_calldata, # data
        "0x0000000000000000000000000000000000000000000000000000000000000000",  # predecessor
        TIMELOCK_SALT,      # salt
        TIMELOCK_DELAY,     # delay (172800 = 48h)
    )
    print(f"  schedule() calldata: {schedule_calldata[:60]}...")

    # Compute Safe tx hash for the schedule call (new nonce = safe_nonce + 1)
    safe_nonce_2 = safe_nonce + 1
    tx2_hash = get_safe_tx_hash(GOVERNANCE_SAFE, TIMELOCK, schedule_calldata, safe_nonce_2)
    print(f"  Safe tx hash: {tx2_hash}")

    packed_sigs_2 = build_safe_signatures(tx2_hash, [
        (addr1, pk1),
        (addr2, pk2),
    ])
    print(f"  Packed signatures (2/3): {packed_sigs_2[:40]}...")

    print("\n  Broadcasting Safe.execTransaction for timelock.schedule()...")
    tx2_hash_on_chain = cast_send(
        GOVERNANCE_SAFE,
        "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)(bool)",
        TIMELOCK,
        0,
        schedule_calldata,
        0,
        0,
        0,
        0,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        packed_sigs_2,
        pk=pk1,
        gas=400000,
    )
    print(f"  TX2 hash: {tx2_hash_on_chain}")
    wait_for_receipt(tx2_hash_on_chain)
    print("  [OK] timelock.schedule() executed!")

    # -------------------------------------------------------------------
    # 3. Verify operation is pending
    # -------------------------------------------------------------------
    print("\n[3] Verifying timelock operation is pending...")

    # Compute operation ID: keccak256(abi.encode(target, value, data, predecessor, salt))
    op_id = cast(
        "call", TIMELOCK,
        "hashOperation(address,uint256,bytes,bytes32,bytes32)(bytes32)",
        VAULT,
        0,
        accept_rm_calldata,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        TIMELOCK_SALT,
        "--rpc-url", RPC,
    )
    print(f"  Operation ID: {op_id}")

    is_pending = cast(
        "call", TIMELOCK,
        "isOperationPending(bytes32)(bool)",
        op_id,
        "--rpc-url", RPC,
    )
    print(f"  isOperationPending: {is_pending}")

    is_ready = cast(
        "call", TIMELOCK,
        "isOperationReady(bytes32)(bool)",
        op_id,
        "--rpc-url", RPC,
    )
    print(f"  isOperationReady: {is_ready}")

    timestamp_raw = cast(
        "call", TIMELOCK,
        "getTimestamp(bytes32)(uint256)",
        op_id,
        "--rpc-url", RPC,
    )
    execute_at = int(timestamp_raw.split()[0])
    print(f"  Execute available at timestamp: {execute_at}")
    print(f"  (Human: approximately {execute_at} unix — 48h from now)")

    if "true" in is_pending.lower():
        print("\n  [OK] TIMELOCK OPERATION SUCCESSFULLY SCHEDULED!")
    else:
        print("\n  [WARN] Operation not yet showing as pending — check tx receipt")

    # -------------------------------------------------------------------
    # 4. Output summary
    # -------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("GOVERNANCE HANDOFF SUMMARY")
    print("=" * 60)
    summary = {
        "network": "Robinhood Chain Testnet (46630)",
        "step1_acceptManagement": {
            "tx": tx1_hash_on_chain,
            "strategy": STRATEGY,
            "newManagement": GOVERNANCE_SAFE,
        },
        "step2_timelockSchedule": {
            "tx": tx2_hash_on_chain,
            "operationId": op_id,
            "executeAfterTimestamp": execute_at,
            "target": VAULT,
            "data": accept_rm_calldata,
            "salt": TIMELOCK_SALT,
            "delay": TIMELOCK_DELAY,
        },
    }
    print(json.dumps(summary, indent=2))

    # Write summary to docs
    summary_path = os.path.join(
        os.path.dirname(__file__), "..", "docs", "TESTNET_GOVERNANCE_HANDOFF.json"
    )
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n  Summary written to docs/TESTNET_GOVERNANCE_HANDOFF.json")
    print("\nDone. Wait for executeAfterTimestamp, then run scripts/governance_execute_46630.py")


if __name__ == "__main__":
    main()
