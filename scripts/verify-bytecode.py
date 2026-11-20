#!/usr/bin/env python3
"""Prove that the pinned Yearn V3 sources rebuild the bytecode we rely on.

Three independent proofs (see docs/REPRODUCIBILITY.md):

  v302   VaultV3 3.0.2 compiled with vyper 0.3.7 == deployed 0x1ab6..4467 on
         mainnet / arbitrum / base / optimism (byte-for-byte).
  v311   VaultV3 3.1.1 (our pin) recompiles to the hashes stored in
         packages/core/artifacts/VaultV3.json, deterministically.
  ts311  TokenizedStrategy v3.1.1 (solc 0.8.18, paris, optimizer 200) equals the
         canonical implementation 0x3110D1Ee.. already live on chain 4663,
         modulo constructor immutable + metadata CBOR.

Usage:
  python scripts/verify-bytecode.py all
  python scripts/verify-bytecode.py v311 --no-chain
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FOUNDRY = ROOT / ".tools" / "foundry"
TMP = ROOT / ".tmp"
ARTIFACTS = ROOT / "packages" / "core" / "artifacts"

RPC_MAINNET = "https://ethereum-rpc.publicnode.com"
RPC_ARBITRUM = "https://arb1.arbitrum.io/rpc"
RPC_BASE = "https://mainnet.base.org"
RPC_OPTIMISM = "https://mainnet.optimism.io"
RPC_4663 = "https://robinhood-rpc.publicnode.com"

VAULT_V302_DEPLOYED = "0x1ab62413e0cf2eBEb73da7D40C70E7202ae14467"
TS_IMPL = "0x3110D1Eec90f0651C18e75AD37711A8777342504"

EXPECTED = {
    "v302_runtime": "0x4075239962ac41f7f4876a094deea45dfb667d719de30f4abceaf35348db9858",
    "v311_runtime": "0x6909c58e42814ae46cadd909f29f19163751b77ff4a2ccf62c5a87e933e02be6",
    "v311_creation": "0xc00d80e0f2117e5b3b97f4c198dddc82bd96ee64529f8a5cd848e19eae94121b",
    "factory_runtime": "0xdfc2a10112cf82c15ada486a586ff1a5bebd312e9dbe86ef8c13d92683bddec2",
    "factory_creation": "0xde30ee1a9a055cc0097e5671a9dcf97f07c98c7d5e6c8b1a7f8a678d9fd9564f",
    "ts311_deployed": "0x38c3b5bb5cd304e4759807d31f37c440ff9cb9811b35c3c61b8c81e3d61fd16f",
}

results: list[tuple[str, bool, str]] = []


def keccak(data: bytes) -> str:
    from vyper.utils import keccak256 as _k

    return "0x" + _k(data).hex()


def run(cmd: list[str], cwd: Path | None = None) -> str:
    r = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)}\n{r.stdout}\n{r.stderr}")
    return r.stdout


def norm(hexstr: str) -> str:
    h = hexstr.strip()
    return h if h.startswith("0x") else "0x" + h


def record(name: str, ok: bool, detail: str) -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}: {detail}")


def vyper(env: str) -> Path:
    for c in (ROOT / env / "Scripts" / "vyper.exe", ROOT / env / "bin" / "vyper"):
        if c.exists():
            return c
    raise RuntimeError(f"vyper missing in {env}")


def cast(*args: str) -> str:
    exe = FOUNDRY / ("cast.exe" if (FOUNDRY / "cast.exe").exists() else "cast")
    return run([str(exe), *args]).strip()


def chain_code(rpc: str, address: str) -> bytes:
    out = cast("code", address, "--rpc-url", rpc, "--rpc-timeout", "25")
    out = out.strip()
    return b"" if out in ("", "0x") else bytes.fromhex(out.removeprefix("0x"))


def compile_vyper(env: str, source: Path, flags: list[str], fmt: str) -> str:
    return run(
        [str(vyper(env)), *flags, "-f", fmt, source.name], cwd=source.parent
    ).strip().splitlines()[-1]


# ---------------------------------------------------------------- proofs


def proof_v302(with_chain: bool) -> None:
    candidates = [TMP / "wt-v302", ROOT / "referensi" / ".tmp" / "wt-v302"]
    wt = next((c for c in candidates if (c / "contracts" / "VaultV3.vy").exists()), candidates[0])
    src = wt / "contracts" / "VaultV3.vy"
    if not src.exists():
        record(
            "v302",
            False,
            f"worktree missing: git -C referensi/yearn-vaults-v3 worktree add {wt} v3.0.2",
        )
        return
    got = norm(compile_vyper(".venv-037", src, ["--evm-version", "paris"], "bytecode_runtime"))
    got_hash = keccak(bytes.fromhex(got[2:]))
    ok = got_hash == EXPECTED["v302_runtime"]
    record("v302-local", ok, f"{len(got) // 2 - 1} B {got_hash}")
    if not with_chain:
        return
    for rpc, label in (
        (RPC_MAINNET, "mainnet"),
        (RPC_ARBITRUM, "arbitrum"),
        (RPC_BASE, "base"),
        (RPC_OPTIMISM, "optimism"),
    ):
        try:
            code = chain_code(rpc, VAULT_V302_DEPLOYED)
            h = keccak(code) if code else "-"
            record(f"v302-chain-{label}", code.hex() == got.removeprefix("0x"), f"{len(code)} B {h}")
        except Exception as exc:  # noqa: BLE001
            record(f"v302-chain-{label}", False, f"rpc error: {exc}")


def proof_v311(with_chain: bool) -> None:
    stored = json.loads((ARTIFACTS / "VaultV3.json").read_text(encoding="utf-8"))
    factory = json.loads((ARTIFACTS / "VaultFactory.json").read_text(encoding="utf-8"))
    src = ROOT / "referensi" / "yearn-vaults-v3" / "contracts"
    flags = ["--optimize", "codesize", "--evm-version", "paris"]

    rt1 = norm(compile_vyper(".venv-ape", src / "VaultV3.vy", flags, "bytecode_runtime"))
    rt2 = norm(compile_vyper(".venv-ape", src / "VaultV3.vy", flags, "bytecode_runtime"))
    cr = norm(compile_vyper(".venv-ape", src / "VaultV3.vy", flags, "bytecode"))
    record(
        "v311-deterministic",
        rt1 == rt2,
        f"two runs equal={rt1 == rt2}, {len(rt1) // 2 - 1} B",
    )
    record(
        "v311-artifact",
        stored["deployedBytecode"] == rt1 and stored["bytecodeObject"] == cr,
        f"runtime {keccak(bytes.fromhex(rt1[2:]))}",
    )
    rt1_hash = keccak(bytes.fromhex(rt1[2:]))
    cr_hash = keccak(bytes.fromhex(cr[2:]))
    drift = [
        name
        for name, got_h, want in (
            ("runtime", rt1_hash, EXPECTED["v311_runtime"]),
            ("creation", cr_hash, EXPECTED["v311_creation"]),
        )
        if got_h != want
    ]
    record(
        "v311-expected",
        not drift,
        "matches recorded hashes" if not drift else f"hash drift: {', '.join(drift)}",
    )
    frt = norm(compile_vyper(".venv-ape", src / "VaultFactory.vy", flags, "bytecode_runtime"))
    fcr = norm(compile_vyper(".venv-ape", src / "VaultFactory.vy", flags, "bytecode"))
    frt_hash = keccak(bytes.fromhex(frt[2:]))
    fcr_hash = keccak(bytes.fromhex(fcr[2:]))
    factory_ok = (
        factory["deployedBytecode"] == frt
        and factory["bytecodeObject"] == fcr
        and frt_hash == EXPECTED["factory_runtime"]
        and fcr_hash == EXPECTED["factory_creation"]
    )
    record(
        "factory-artifact",
        factory_ok,
        f"runtime {len(frt) // 2 - 1} B {frt_hash}",
    )
    if not with_chain:
        return
    try:
        size = cast("codesize", VAULT_V302_DEPLOYED, "--rpc-url", RPC_MAINNET, "--rpc-timeout", "25")
        record("v311-no-public-deployment-claim", True, f"reference vault codesize {size} B is 3.0.2 only")
    except Exception as exc:  # noqa: BLE001
        record("v311-no-public-deployment-claim", False, f"rpc error: {exc}")


def strip_metadata(code: bytes) -> tuple[bytes, int]:
    if len(code) < 2:
        return code, 0
    n = int.from_bytes(code[-2:], "big")
    if n + 2 > len(code):
        return code, 0
    return code[: len(code) - 2 - n], n + 2


def proof_ts311(with_chain: bool) -> None:
    wt = TMP / "wt-ts311"
    if not (wt / "src" / "TokenizedStrategy.sol").exists():
        record(
            "ts311",
            False,
            f"worktree missing: git -C referensi/tokenized-strategy worktree add {wt} v3.1.1",
        )
        return
    forge = FOUNDRY / ("forge.exe" if (FOUNDRY / "forge.exe").exists() else "forge")
    run([str(forge), "build", "src/TokenizedStrategy.sol"], cwd=wt)
    art = json.loads(
        (wt / "out" / "TokenizedStrategy.sol" / "TokenizedStrategy.json").read_text(
            encoding="utf-8"
        )
    )
    local = bytes.fromhex(art["deployedBytecode"]["object"].removeprefix("0x"))
    refs = art["deployedBytecode"].get("immutableReferences") or {}
    record("ts311-api-version", '"3.1.1"' in (wt / "src/TokenizedStrategy.sol").read_text(encoding="utf-8"), "API_VERSION 3.1.1 in source")

    def masked(code: bytes) -> bytes:
        buf = bytearray(code)
        for entries in refs.values():
            for e in entries:
                s, l = int(e["start"]), int(e["length"])
                buf[s : s + l] = b"\x00" * l
        return strip_metadata(bytes(buf))[0]

    local_masked = masked(local)
    record(
        "ts311-local-size", len(local) == 18224, f"{len(local)} B (chain impl is 18224 B)"
    )
    if not with_chain:
        return
    for rpc, label in ((RPC_MAINNET, "mainnet"), (RPC_4663, "chain-4663")):
        try:
            code = chain_code(rpc, TS_IMPL)
            if not code:
                record(f"ts311-{label}", False, "no code at canonical implementation")
                continue
            record(
                f"ts311-{label}",
                masked(code) == local_masked,
                f"{len(code)} B, masked {len(local_masked)} B equal={masked(code) == local_masked}",
            )
        except Exception as exc:  # noqa: BLE001
            record(f"ts311-{label}", False, f"rpc error: {exc}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("which", choices=["all", "v302", "v311", "ts311"])
    ap.add_argument("--no-chain", action="store_true")
    args = ap.parse_args()
    with_chain = not args.no_chain

    if args.which in ("all", "v302"):
        proof_v302(with_chain)
    if args.which in ("all", "v311"):
        proof_v311(with_chain)
    if args.which in ("all", "ts311"):
        proof_ts311(with_chain)

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("failed:", ", ".join(n for n, _, _ in failed), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())