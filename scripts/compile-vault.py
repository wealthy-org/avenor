#!/usr/bin/env python3
"""Compile pinned Yearn V3 sources into packages/core/artifacts/*.json.

Design rules:
  * every number comes from a real compiler run, never from a doc;
  * the pin is asserted before compiling, so a moved checkout fails loudly;
  * `--check` recompiles and diffs against the stored artifact instead of
    silently rewriting it.

Usage:
  python scripts/compile-vault.py            # write artifacts
  python scripts/compile-vault.py --check    # verify artifacts are current
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PINS = {
    "yearn-vaults-v3": {
        "path": ROOT / "referensi" / "yearn-vaults-v3",
        "commit": "f449264ff4f8bebe9a6bf72e43095304fdf101b8",
        "describe": "v3.1.1-2-gf449264",
    },
    "tokenized-strategy": {
        "path": ROOT / "referensi" / "tokenized-strategy",
        "commit": "48c53aba0395885b3f579d0a4b426de276a7b69e",
        "describe": "v3.1.1",
    },
    "vault-periphery": {
        "path": ROOT / "referensi" / "vault-periphery",
        "commit": "672de1c98450ab4485fd0da1f5d3d47dc97500b8",
        "describe": "v3.0.4-7-g672de1c",
    },
}

VYPER_TARGETS = [
    {
        "name": "VaultV3",
        "repo": "yearn-vaults-v3",
        "source": "contracts/VaultV3.vy",
        "vyper_env": ".venv-ape",
        "vyper_version": "0.3.10",
        "flags": ["--optimize", "codesize", "--evm-version", "paris"],
    },
    {
        "name": "VaultFactory",
        "repo": "yearn-vaults-v3",
        "source": "contracts/VaultFactory.vy",
        "vyper_env": ".venv-ape",
        "vyper_version": "0.3.10",
        "flags": ["--optimize", "codesize", "--evm-version", "paris"],
    },
]

ARTIFACT_DIR = ROOT / "packages" / "core" / "artifacts"


def run(cmd: list[str], cwd: Path | None = None) -> str:
    result = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(
            f"command failed ({result.returncode}): {' '.join(cmd)}\n{result.stderr}"
        )
    return result.stdout


def keccak_hex(data: bytes) -> str:
    try:
        from vyper.utils import keccak256 as _k

        return "0x" + _k(data).hex()
    except Exception:  # pragma: no cover - fallback for hosts without vyper
        raise SystemExit("keccak helper unavailable: run with .venv-ape/Scripts/python.exe")


def sha256_hex(data: bytes) -> str:
    return "0x" + hashlib.sha256(data).hexdigest()


def head_commit(repo_path: Path) -> str:
    return run(["git", "rev-parse", "HEAD"], cwd=repo_path).strip()


def assert_pins() -> dict[str, str]:
    versions: dict[str, str] = {}
    for name, pin in PINS.items():
        path = pin["path"]
        if not path.exists():
            raise SystemExit(f"missing pinned checkout: {path}")
        actual = head_commit(path)
        if actual != pin["commit"]:
            raise SystemExit(
                f"{name}: HEAD is {actual}, expected pinned {pin['commit']}"
            )
        versions[name] = actual
    return versions


def vyper_binary(env_name: str) -> Path:
    for candidate in (
        ROOT / env_name / "Scripts" / "vyper.exe",
        ROOT / env_name / "bin" / "vyper",
    ):
        if candidate.exists():
            return candidate
    raise SystemExit(f"vyper not found in {env_name}")


def compile_vyper(target: dict) -> dict:
    repo = PINS[target["repo"]]["path"]
    source = repo / target["source"]
    if not source.exists():
        raise SystemExit(f"missing source: {source}")
    source_bytes = source.read_bytes()
    binary = vyper_binary(target["vyper_env"])

    def emit(fmt: str) -> str:
        out = run(
            [str(binary), *target["flags"], "-f", fmt, str(source.name)],
            cwd=source.parent,
        ).strip()
        return out.splitlines()[-1] if fmt != "abi" else out

    runtime_hex = emit("bytecode_runtime")
    creation_hex = emit("bytecode")
    abi_json = json.loads(emit("abi"))

    runtime = bytes.fromhex(runtime_hex.removeprefix("0x"))
    creation = bytes.fromhex(creation_hex.removeprefix("0x"))

    version = run([str(binary), "--version"]).strip().splitlines()[0]

    return {
        "contractName": target["name"],
        "source": {
            "repo": target["repo"],
            "path": target["source"],
            "pin": PINS[target["repo"]]["commit"],
            "describe": PINS[target["repo"]]["describe"],
            "bytes": len(source_bytes),
            "keccak256": keccak_hex(source_bytes),
            "sha256": sha256_hex(source_bytes),
        },
        "compiler": {
            "language": "vyper",
            "version": version,
            "argv": ["vyper", *target["flags"]],
            "evmVersion": "paris",
            "optimize": "codesize",
        },
        "bytecode": {
            "runtimeBytes": len(runtime),
            "runtimeKeccak256": keccak_hex(runtime),
            "creationBytes": len(creation),
            "creationKeccak256": keccak_hex(creation),
        },
        "deployedBytecode": "0x" + runtime.hex(),
        "bytecodeObject": "0x" + creation.hex(),
        "abi": abi_json,
        "notes": [
            "Compiled directly from the pinned checkout; no post-processing.",
            "Vyper honours '#pragma optimize codesize' only when no CLI flag overrides it; the flag is always passed explicitly here.",
        ],
    }


def write_atomic(path: Path, payload: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", delete=False, dir=path.parent, encoding="utf-8", newline="\n"
    ) as fh:
        fh.write(payload)
        tmp = Path(fh.name)
    shutil.move(str(tmp), path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    pins = assert_pins()
    print("pins verified:", json.dumps(pins, indent=2))

    status = 0
    for target in VYPER_TARGETS:
        artifact = compile_vyper(target)
        payload = json.dumps(artifact, indent=2, sort_keys=False) + "\n"
        out_path = ARTIFACT_DIR / f"{target['name']}.json"
        b = artifact["bytecode"]
        print(
            f"{target['name']}: runtime {b['runtimeBytes']} B {b['runtimeKeccak256']}\n"
            f"{' ' * len(target['name'])}  creation {b['creationBytes']} B {b['creationKeccak256']}"
        )
        if args.check:
            if not out_path.exists():
                print(f"MISSING artifact {out_path}", file=sys.stderr)
                status = 1
                continue
            stored = json.loads(out_path.read_text(encoding="utf-8"))
            if stored.get("bytecode") != artifact["bytecode"]:
                print(f"STALE artifact {out_path}", file=sys.stderr)
                status = 1
            elif stored.get("source", {}).get("keccak256") != artifact["source"]["keccak256"]:
                print(f"STALE source hash in {out_path}", file=sys.stderr)
                status = 1
            else:
                print(f"OK {out_path}")
        else:
            write_atomic(out_path, payload)
            print(f"wrote {out_path}")

    if args.check and status == 0:
        print("all artifacts current")
    return status


if __name__ == "__main__":
    raise SystemExit(main())