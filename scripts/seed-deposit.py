#!/usr/bin/env python3
"""
scripts/seed-deposit.py

Testnet seed script for Avenor USDG Managed Vault.

Performs two on-chain actions using `cast` with the deployer key from .env:
  1. set_deposit_limit(vault, 1_000_000 USDG)  — opens the deposit gate
  2. approve(vault, seed_amount) on the USDG asset
  3. deposit(seed_amount, depositor)  — seeds a small amount so totalSupply > 0
                                        and the share-price chart can populate

Usage:
  python scripts/seed-deposit.py                   # dry-run: prints cast commands, does not broadcast
  python scripts/seed-deposit.py --broadcast        # live broadcast to chain 46630
  python scripts/seed-deposit.py --limit-only       # only open the deposit limit, skip the deposit

Requirements:
  - PRIVATE_KEY in .env (or PRIVATE_KEY env var) for the deployer EOA
  - FORK_RPC_URL or NEXT_PUBLIC_RPC_URL in .env for the RPC endpoint
  - cast binary in .tools/foundry/cast.exe (or on PATH)

AGENTS.md hard rules honored:
  - No secrets printed to stdout (key masked)
  - `max_loss` explicit on the deposit call (deposit does not use max_loss, so N/A)
  - set_deposit_limit used to freeze/open — not setPaused
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── Tool resolution ──────────────────────────────────────────────────────────
CAST = ROOT / ".tools" / "foundry" / "cast.exe"
if not CAST.exists():
    CAST = Path("cast")

# ── Contract addresses ───────────────────────────────────────────────────────
VAULT_ADDRESS   = "0xDa4D625B2e14A3C07D21d6eFfe66f91AED517DA0"
USDG_ADDRESS    = "0x97cb342cf2f6ecf48c1285fb8668f5a4237bf862"  # USDG on Robinhood chain 46630

# ── Amounts (6-decimal USDG) ─────────────────────────────────────────────────
DEPOSIT_LIMIT   = 1_000_000 * 10**6   # 1 000 000 USDG cap
SEED_AMOUNT     =     100 * 10**6     # 100 USDG seed deposit

# ── ABI selectors (4-byte) ───────────────────────────────────────────────────
# set_deposit_limit(uint256)  → 0xbdc8144b
# approve(address,uint256)    → standard ERC-20
# deposit(uint256,address)    → ERC-4626


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                env.setdefault(k.strip(), v.strip())
    # OS env overrides file
    for k, v in os.environ.items():
        env[k] = v
    return env


def pick_rpc(env: dict[str, str]) -> str:
    for key in ("NEXT_PUBLIC_RPC_URL", "FORK_RPC_URL", "RPC_URL"):
        val = env.get(key, "").strip()
        if val:
            return val
    raise SystemExit("No RPC URL found (NEXT_PUBLIC_RPC_URL / FORK_RPC_URL). Set one in .env.")


def cast_send(
    rpc: str,
    private_key: str,
    to: str,
    sig: str,
    *args: str,
    broadcast: bool = False,
) -> tuple[bool, str]:
    """
    Build and optionally execute a `cast send` command.
    Returns (success, output_or_command_string).
    """
    cmd = [
        str(CAST), "send",
        "--rpc-url", rpc,
        "--private-key", private_key,
        to,
        sig,
        *args,
    ]
    masked_cmd = " ".join(
        a if a != private_key else "0x***MASKED***"
        for a in cmd
    )

    if not broadcast:
        return True, f"[DRY-RUN] {masked_cmd}"

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return False, f"FAILED: {result.stderr.strip()}"
    # Extract tx hash from output
    for line in result.stdout.splitlines():
        if "transactionHash" in line or line.startswith("0x"):
            return True, line.strip()
    return True, result.stdout.strip()[:200]


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed deposit for Avenor testnet vault.")
    parser.add_argument("--broadcast", action="store_true", help="Actually broadcast transactions.")
    parser.add_argument("--limit-only", action="store_true", help="Only open deposit limit, skip deposit.")
    parser.add_argument("--seed-amount", type=int, default=SEED_AMOUNT,
                        help=f"Seed amount in raw USDG units (default {SEED_AMOUNT} = 100 USDG)")
    args = parser.parse_args()

    env = load_env()
    rpc = pick_rpc(env)
    private_key = env.get("PRIVATE_KEY", "").strip()
    if not private_key:
        raise SystemExit("PRIVATE_KEY not found in .env — aborting.")
    deployer = env.get("DEPLOYER_ADDRESS", "").strip()

    mode = "BROADCAST" if args.broadcast else "DRY-RUN"
    print(f"{'='*60}")
    print(f"Avenor Seed-Deposit Script ({mode})")
    print(f"{'='*60}")
    print(f"Vault:        {VAULT_ADDRESS}")
    print(f"Asset (USDG): {USDG_ADDRESS}")
    print(f"RPC:          {rpc}")
    print(f"Deployer:     {deployer or '(derived from key)'}")
    print(f"Deposit cap:  {DEPOSIT_LIMIT / 10**6:,.0f} USDG")
    print(f"Seed amount:  {args.seed_amount / 10**6:,.0f} USDG")
    print()

    # Step 1: open deposit limit
    print("Step 1 — set_deposit_limit(vault, 1_000_000 USDG)")
    ok, out = cast_send(rpc, private_key, VAULT_ADDRESS,
                        "set_deposit_limit(uint256)", str(DEPOSIT_LIMIT),
                        broadcast=args.broadcast)
    print(f"  {'✅' if ok else '❌'} {out}")
    if not ok:
        raise SystemExit("set_deposit_limit failed — aborting.")

    if args.limit_only:
        print("\n--limit-only: skipping deposit step.")
        print("Done.")
        return

    # Step 2: approve USDG spend
    print(f"\nStep 2 — ERC-20 approve(vault, {args.seed_amount})")
    ok, out = cast_send(rpc, private_key, USDG_ADDRESS,
                        "approve(address,uint256)", VAULT_ADDRESS, str(args.seed_amount),
                        broadcast=args.broadcast)
    print(f"  {'✅' if ok else '❌'} {out}")
    if not ok:
        raise SystemExit("approve failed — aborting.")

    # Step 3: deposit
    receiver = deployer if deployer else "(deployer EOA)"
    print(f"\nStep 3 — ERC-4626 deposit({args.seed_amount}, {receiver})")
    ok, out = cast_send(rpc, private_key, VAULT_ADDRESS,
                        "deposit(uint256,address)", str(args.seed_amount), deployer,
                        broadcast=args.broadcast)
    print(f"  {'✅' if ok else '❌'} {out}")
    if not ok:
        raise SystemExit("deposit failed — aborting.")

    print("\nDone.")
    if not args.broadcast:
        print("Run with --broadcast to execute live on chain 46630.")
        print("Reminder: ensure the deployer EOA holds USDG before broadcasting.")


if __name__ == "__main__":
    main()
