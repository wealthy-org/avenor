#!/usr/bin/env python3
"""Check whether the pinned chain-4663 block is still servable by the configured RPCs.

Fork tests need *historical state*, not just a block header. Working endpoints come and
go: on 2026-11-19 `https://robinhood.drpc.org` served block 118337511 and had pruned it
within the hour, while `https://rpc.solidrpc.io/public/evm/4663` and
`https://robinhood.api.onfinality.io/public` still serve it. So "the fork test skipped"
must be a visible, explained result rather than a silent pass. This script produces that
explanation on demand.

Usage:
    python scripts/fork-status.py            # human table, exit 1 if no endpoint works
    python scripts/fork-status.py --json     # machine-readable

The probe is an `eth_call` of `steakUSDG.totalAssets()` at the pinned block. A node
that cannot serve the state answers with an error; a node that serves a *different*
state is caught by comparing against the fingerprint in the config.

Endpoints, in order: `FORK_RPC_URL` (environment or `avenor/.env`), `FORK_EXTRA_RPCS`
(comma separated), then the `rpc.primary`/`rpc.fallbacks` recorded in
`packages/config/4663.json`. A candidate archive endpoint is therefore tested by putting
it in `.env` — it does not need to be added to the config file, and it should *not* be
pasted into chat: printed URLs are redacted to scheme+host, so the token in the path or
query never reaches a transcript.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "packages" / "config" / "4663.json"
ENV_FILE = ROOT / ".env"
CAST = ROOT / ".tools" / "foundry" / "cast.exe"
if not CAST.exists():
    CAST = Path("cast")

# Selector for totalAssets() on the venue.
TOTAL_ASSETS_SELECTOR = "0x01e1d114"


def load_env() -> None:
    """Read `.env` without exporting anything: the file is the single place a key lives.

    The shell is not required to have sourced `.env`, because the point of this script is
    to be runnable by an operator (or an agent) that only knows "the URL is in .env".
    Real environment variables win over the file.
    """
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def redact(rpc: str) -> str:
    """Scheme + host only. Paths and query strings routinely carry the API key."""
    parts = urlsplit(rpc)
    if not parts.scheme:
        return "(redacted)"
    host = parts.hostname or ""
    port = f":{parts.port}" if parts.port else ""
    return f"{parts.scheme}://{host}{port}/...(redacted)"


def endpoints_from_config() -> list[str]:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    rpc_cfg = cfg["_meta"]["rpc"]
    out = [rpc_cfg["primary"], *rpc_cfg["fallbacks"]]
    for extra in os.environ.get("FORK_EXTRA_RPCS", "").split(","):
        if extra.strip():
            out.append(extra.strip())
    front = os.environ.get("FORK_RPC_URL", "").strip()
    if front:
        out.insert(0, front)

    seen: set[str] = set()
    ordered: list[str] = []
    for url in out:
        if url and url not in seen:
            seen.add(url)
            ordered.append(url)
    return ordered


def cast_call(rpc: str, block: int, to: str, data: str) -> tuple[bool, str]:
    """Return (ok, payload). ok means the node served historical state."""
    proc = subprocess.run(
        [
            str(CAST),
            "rpc",
            "--rpc-url",
            rpc,
            "eth_call",
            json.dumps({"to": to, "data": data}),
            hex(block),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return False, (proc.stderr or proc.stdout).strip().splitlines()[0][:160]
    return True, proc.stdout.strip().splitlines()[-1].strip().strip('"')


def main() -> int:
    load_env()
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    meta = cfg["_meta"]
    block = int(meta["observed_at"]["blockNumber"])
    venue = cfg["venues"]["steakUSDG"]
    expected = int(venue["snapshot"]["totalAssets"])

    endpoints = endpoints_from_config()

    rows = []
    any_ok = False
    for rpc in endpoints:
        ok, payload = cast_call(rpc, block, venue["address"], TOTAL_ASSETS_SELECTOR)
        value = None
        if ok:
            try:
                value = int(payload, 16)
            except ValueError:
                ok = False
        if ok and value == expected:
            any_ok = True
        rows.append(
            {
                "rpc": redact(rpc),
                "served_state": ok,
                "totalAssets": value,
                "matches_pin": ok and value == expected,
                "detail": "" if ok else payload,
            }
        )

    if "--json" in sys.argv:
        print(
            json.dumps(
                {"block": block, "expected_totalAssets": expected, "endpoints": rows},
                indent=2,
            )
        )
    else:
        print(f"pinned block : {block}")
        print(f"fingerprint  : steakUSDG.totalAssets = {expected}")
        print()
        for row in rows:
            state = "state OK" if row["served_state"] else "state UNAVAILABLE"
            match = "match" if row["matches_pin"] else "MISMATCH"
            print(f"{row['rpc']:46} {state:18} {match:10} {row['detail']}")
        print()
        if any_ok:
            print("OK: at least one endpoint serves the pinned state; fork tests can run.")
        else:
            print("BLOCKED: no configured endpoint serves the pinned state.")
            print("Fork tests will skip. Provide an archive endpoint via FORK_RPC_URL in")
            print("avenor/.env, re-run this script, then set FORK_STRICT=true so that a")
            print("skip becomes a failure instead of a silent pass.")

    return 0 if any_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())