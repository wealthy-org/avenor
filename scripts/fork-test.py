#!/usr/bin/env python3
"""Run the chain-4663 fork tests against the pinned block, with the flags they need.

Two things have to be true before a fork test can say anything about the real chain, and
both are easy to get wrong, so they live here instead of in a shell history:

1. **The block has to be reachable.** Fork tests need historical *state*. `fork-status.py`
   answers that question; this script refuses to run if the answer is no.
2. **Foundry and this chain disagree about two things.** Foundry's default hardfork is
   `london`, and the venue's bytecode halts at its first `PUSH0` under those rules, which
   revm reports as `EvmError: NotActivated` — indistinguishable from "state missing". And
   chain 4663 is Arbitrum Orbit: `block.number` is the L1 height, so a fork pinned by L2
   number also has to be queried by number, not by block hash (the free endpoints reject
   EIP-1898 block objects outright).

So: verify the pin, fork it locally with `anvil` at that exact block, and point the tests at
`--hardfork cancun`. The state still comes from the node; the local chain only removes the
endpoint's RPC quirks from the experiment.

Usage:
    python scripts/fork-test.py                 # all fork tests
    python scripts/fork-test.py -vv             # extra forge args are forwarded
    python scripts/fork-test.py --match-test test_pinIsTheStateWeRecorded -vv
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "packages" / "config" / "4663.json"
CONTRACTS = ROOT / "packages" / "contracts"
ANVIL = ROOT / ".tools" / "foundry" / "anvil.exe"
if not ANVIL.exists():
    ANVIL = Path("anvil")

TOTAL_ASSETS_SELECTOR = "0x01e1d114"


def load_fork_status():
    """Import `fork-status.py` (hyphen in the name) as a module, so endpoint ordering and
    `.env` handling stay in one place."""
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "fork_status", ROOT / "scripts" / "fork-status.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def rpc_post(url: str, method: str, params: list) -> dict:
    import urllib.request

    req = urllib.request.Request(
        url,
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def wait_for_pin(url: str, block: int, expected: int, venue: str, deadline: float) -> bool:
    while time.time() < deadline:
        try:
            head = rpc_post(url, "eth_blockNumber", [])
            if "result" not in head:
                time.sleep(0.3)
                continue
            res = rpc_post(
                url, "eth_call", [{"to": venue, "data": TOTAL_ASSETS_SELECTOR}, hex(block)]
            )
            if int(res["result"], 16) == expected:
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.3)
    return False


def main() -> int:
    status = load_fork_status()
    status.load_env()

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    meta = cfg["_meta"]
    block = int(meta["observed_at"]["blockNumber"])
    venue = cfg["venues"]["steakUSDG"]
    address = venue["address"]
    expected = int(venue["snapshot"]["totalAssets"])

    endpoint = None
    for candidate in status.endpoints_from_config():
        ok, payload = status.cast_call(candidate, block, address, TOTAL_ASSETS_SELECTOR)
        if ok and int(payload, 16) == expected:
            endpoint = candidate
            break
    if endpoint is None:
        print("BLOCKED: no configured endpoint serves the pinned state.")
        print("Run `python scripts/fork-status.py` for the per-endpoint reason, then put an")
        print("archive endpoint in `avenor/.env` as FORK_RPC_URL (do not paste it into chat).")
        return 1

    print(f"pin          : block {block}")
    print(f"endpoint     : {status.redact(endpoint)}")
    print(f"fingerprint  : steakUSDG.totalAssets = {expected}")

    # A public endpoint can serve one `eth_call` and still fail to serve a whole fork
    # (rate limits, transient genesis errors), so every endpoint that answered the pin
    # is tried in turn before giving up.
    local = None
    log_path = Path(tempfile.gettempdir()) / "avenor-fork-anvil.log"
    for candidate in [endpoint, *[
        e for e in status.endpoints_from_config() if e != endpoint
    ]]:
        if local is not None:
            break
        ok, payload = status.cast_call(candidate, block, address, TOTAL_ASSETS_SELECTOR)
        if not ok or int(payload, 16) != expected:
            continue

        port = free_port()
        log = log_path.open("w", encoding="utf-8")
        anvil = subprocess.Popen(
            [
                str(ANVIL),
                "--fork-url",
                candidate,
                "--fork-block-number",
                str(block),
                "--chain-id",
                "4663",
                "--port",
                str(port),
                "--silent",
            ],
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        url = f"http://127.0.0.1:{port}"
        if wait_for_pin(url, block, expected, address, time.time() + 240):
            local = url
            print(f"local fork   : state at pin reproduced via {status.redact(candidate)}")
            print()
            break

        print(f"retry        : {status.redact(candidate)} could not serve the whole fork")
        log.close()
        anvil.terminate()
        try:
            anvil.wait(timeout=10)
        except subprocess.TimeoutExpired:
            anvil.kill()

    if local is None:
        print("BLOCKED: no endpoint could serve the pinned state to a local fork.")
        print(f"anvil log: {log_path}")
        return 1

    env = dict(os.environ, FORK_STRICT=os.environ.get("FORK_STRICT", "true"))
    try:
        proc = subprocess.run(
            [
                str(ROOT / ".tools" / "foundry" / "forge.exe"),
                "test",
                "--offline",
                "--match-path",
                "test/fork/*",
                "--fork-url",
                local,
                "--fork-state-by-number",
                "--hardfork",
                "cancun",
                *sys.argv[1:],
            ],
            cwd=CONTRACTS,
            env=env,
        )
        return proc.returncode
    finally:
        anvil.terminate()
        try:
            anvil.wait(timeout=10)
        except subprocess.TimeoutExpired:
            anvil.kill()
        log.close()


if __name__ == "__main__":
    raise SystemExit(main())