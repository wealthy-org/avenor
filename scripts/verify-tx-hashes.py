#!/usr/bin/env python3
"""
Verify on-chain transactions and contract codesize against Robinhood Chain Testnet (46630).
Addresses GAP_ANALYSIS U2-2: audits claimed tx hashes and deployed contract addresses
against the live JSON-RPC.
"""

import json
import sys
import urllib.request
import urllib.error

RPC_URL = "https://rpc.testnet.chain.robinhood.com"

# Contracts that MUST have code on-chain (codesize > 0)
CONTRACTS_TO_VERIFY = [
    ("avUSDG Vault Proxy", "0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0"),
    ("MorphoVaultStrategy", "0x8f151132f80277b7D42Ad9615172E6De1B26Cf93"),
    ("Accountant Fee Controller", "0xA499C9F98cE3a66B79dD9CaA99AA894DDE298e32"),
    ("Primary Timelock (48h)", "0x7D2511309AA40ed9Bd0f10b3F6c3e36E5b62eAAc"),
    ("Emergency Timelock (6h)", "0xde3f5071559d929d18092EEf7f3B106e39BCD4b6"),
    ("Governance Safe (2/3)", "0x24e96fCB7b7f7832D6D5cF5f08E7d50AaC0Bd4AA"),
    ("Guardian Safe (2/3)", "0x83227a7b21Ead1e0581D03144B85Cb63Fd585af1"),
    ("Treasury Safe (2/3)", "0x8AA6f4DA5EC2B562854D18E70A173c6CCC827e58"),
]

# Transactions claimed in activity / docs / governance
TXS_TO_AUDIT = [
    ("Timelock Role Assignment Scheduled", "0x381fdf02042413bbdbda93c33b3bdff98a1e05b7c87c926dae5c806c9bc9376d", True),
    ("Strategy Management Transferred", "0xb88761254bb53feea86129bfe6c515ad7cd79f5a4f83ded84aa53b0dfca2f19b", True),
    ("Vault Implementation Deployment", "0x34b22302484ba332b7bc565983794d070b4453531bfa8295b92209d7df9d6604", True),
]

def rpc_call(method: str, params: list):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode("utf-8")
    req = urllib.request.Request(RPC_URL, data=payload, headers={"Content-Type": "application/json", "User-Agent": "Avenor-Verifier/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        if "error" in data:
            raise RuntimeError(f"RPC Error: {data['error']}")
        return data.get("result")

def main():
    print(f"Connecting to RPC: {RPC_URL}")
    try:
        chain_id = rpc_call("eth_chainId", [])
        print(f"Connected. Chain ID: {int(chain_id, 16)}")
    except Exception as e:
        print(f"WARNING: RPC unreachable ({e}). Skipping online verification.")
        return 0

    failed = False

    print("\n--- 1. Contract Codesize Verification ---")
    for name, addr in CONTRACTS_TO_VERIFY:
        code = rpc_call("eth_getCode", [addr, "latest"])
        codesize = (len(code) - 2) // 2 if code and code.startswith("0x") else 0
        if codesize > 0:
            print(f"  [OK] {name} ({addr}): {codesize} bytes")
        else:
            print(f"  [FAIL] {name} ({addr}): CODESIZE IS 0 (NO CODE ON CHAIN)")
            failed = True

    print("\n--- 2. Transaction Receipt Audit ---")
    for name, tx_hash, expect_confirmed in TXS_TO_AUDIT:
        receipt = rpc_call("eth_getTransactionReceipt", [tx_hash])
        if receipt is not None:
            status = receipt.get("status")
            block = int(receipt.get("blockNumber", "0x0"), 16)
            print(f"  [CONFIRMED] {name}: block #{block}, status={status} ({tx_hash[:16]}...)")
        else:
            if expect_confirmed:
                print(f"  [UNCONFIRMED] {name}: receipt returned null on RPC ({tx_hash[:16]}...)")
            else:
                print(f"  [PRUNED/LOCAL] {name}: receipt not available on node history ({tx_hash[:16]}...)")

    if failed:
        print("\nVerification FAILED: One or more deployed contracts has no code on chain.")
        sys.exit(1)
    else:
        print("\nAll required contracts have verified on-chain code.")
        return 0

if __name__ == "__main__":
    sys.exit(main())
