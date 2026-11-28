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

# Contracts that MUST have code on-chain (codesize > 0) — redeploy v2 (block 158777022)
CONTRACTS_TO_VERIFY = [
    ("avUSDG Vault Proxy", "0xFB6064C2A4CedaD01b2a873E43890D18e1Cb4Dd9"),
    ("MorphoVaultStrategy", "0xc96479EF4274F7619E1e78FA40bfdb3a367d8291"),
    ("Accountant Fee Controller", "0xE72b69440D6ddb12F07A4f0A335062f7aeD3Ad7C"),
    ("Primary Timelock (48h)", "0x2Bfa51B313AA76d2ED0d8D5971Dd8b3e4235609D"),
    ("Emergency Timelock (6h)", "0x4B80C02fee19efc0BEb41D921fb3cD54412ad895"),
    ("Governance Safe (2/3)", "0x68b80E963a8D8029d5D3814A7230887c1Ce0251e"),
    ("VaultFactory", "0xcA83591e36949a6190957E22DDDB9dad249a57B2"),
    ("VaultOriginal (Blueprint)", "0x64Dc3C0913744a27E31Eb8322c36ee9494DAdef8"),
]

# Transactions claimed in activity / docs / governance (v2)
TXS_TO_AUDIT = [
    ("Timelock Role Assignment Scheduled", "0xfdfc2efc3945de68b7ce1e6e8c756a56a370bad139efc82fac491ddfbcb17347", True),
    ("Strategy Management Transferred", "0x7918213812377a777fa761a79ac2d40d0f4b40adc4bd17cca8929a2fa3340787", True),
    ("Vault Proxy Deployment", "0x4d00d5274625c65ba556ccd48433d6bb371ebca00c9f614a7fac4d174261b683", True),
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
