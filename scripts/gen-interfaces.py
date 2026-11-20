#!/usr/bin/env python
"""
Generate Solidity interfaces from the pinned Vyper build artifacts.

Why: `VaultV3`/`VaultFactory` ABI must come from the bytecode we actually verified
(`scripts/verify-bytecode.py`), never from docs, npm packages, or `cast interface`
against a live deployment. Hand-written interfaces drift; generated ones cannot.

Usage:
    python scripts/gen-interfaces.py            # write packages/contracts/src/interfaces
    python scripts/gen-interfaces.py --check    # fail if generated files differ

Source of truth: packages/core/artifacts/<Contract>.json (produced by
scripts/compile-vault.py, which asserts the git pin before compiling).
"""

import argparse
import os
import shutil
import subprocess
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "packages" / "core" / "artifacts"
OUT = ROOT / "packages" / "contracts" / "src" / "interfaces"

TARGETS = [
    # (artifact file, contract name, output file)
    ("VaultV3.json", "VaultV3", "IVaultV3.sol"),
    ("VaultFactory.json", "VaultFactory", "IVaultFactory.sol"),
]

# Solidity keywords + reserved words that show up as ABI parameter names
# (real example: VaultV3.set_deposit_hook(..., bool override)).
RESERVED = {
    "abstract", "address", "after", "alias", "anonymous", "apply", "as", "assembly", "auto",
    "bool", "break", "byte", "bytes", "calldata", "case", "catch", "constant", "constructor",
    "continue", "contract", "copyof", "default", "define", "delete", "do", "else", "emit",
    "enum", "error", "ether", "event", "external", "fallthrough", "false", "final", "fixed",
    "for", "function", "gwei", "if", "immutable", "implements", "import", "in", "indexed",
    "inline", "int", "interface", "internal", "is", "leave", "let", "library", "macro",
    "mapping", "match", "memory", "modifier", "mutable", "new", "null", "of", "override",
    "partial", "payable", "pragma", "private", "promise", "public", "pure", "receive",
    "reference", "relocatable", "return", "returns", "revert", "sealed", "seconds", "sizeof",
    "static", "storage", "string", "struct", "super", "supports", "switch", "this", "throw",
    "true", "try", "type", "typedef", "typeof", "ufixed", "uint", "unchecked", "using", "var",
    "view", "virtual", "wei", "while", "years",
}


def safe_name(name: str) -> str:
    """Solidity-safe identifier for an ABI parameter name."""
    if not name:
        return ""
    cleaned = re.sub(r"[^0-9a-zA-Z_]", "_", name)
    if cleaned[0].isdigit():
        cleaned = "_" + cleaned
    if cleaned in RESERVED or re.fullmatch(r"u?int\d*", cleaned) or re.fullmatch(r"bytes\d*", cleaned):
        cleaned += "_"
    return cleaned


# Human names for the few structs that carry meaning; everything else is generated.
STRUCT_NAMES = {
    ("strategies", "outputs", 0): "StrategyParams",
}

ELEMENTARY = {
    "address": "address",
    "bool": "bool",
    "string": "string",
    "bytes": "bytes",
    "function": "bytes24",
}


def camel(name: str) -> str:
    parts = re.split(r"[^0-9a-zA-Z]+", name)
    return "".join(p[:1].upper() + p[1:] for p in parts if p)


def solidity_type(param: dict) -> str:
    t = param["type"]
    if t.startswith("tuple"):
        return t  # resolved by caller once struct name is known
    if t in ELEMENTARY:
        return ELEMENTARY[t]
    if t.startswith("uint") or t.startswith("int"):
        bits = t[4:] if t.startswith("uint") else t[3:]
        if bits and bits not in ("8", "16", "24", "32", "40", "48", "56", "64", "72", "80",
                                 "88", "96", "104", "112", "120", "128", "136", "144", "152",
                                 "160", "168", "176", "184", "192", "200", "208", "216", "224",
                                 "232", "240", "248", "256"):
            raise SystemExit(f"unexpected integer width in ABI: {t}")
        return t
    if t.startswith("bytes") and t != "bytes":
        return t
    if t.endswith("]"):
        base, _, dim = t.rpartition("[")
        return solidity_type({"type": base}) + "[" + dim
    raise SystemExit(f"unmapped ABI type: {t}")


DYNAMIC = ("string", "bytes")


def needs_location(t: str) -> bool:
    """Dynamic types need an explicit data location in external signatures."""
    return t in DYNAMIC or t.endswith("]") or t in ("tuple",) or t.startswith("tuple")


def locate(t: str, direction: str) -> str:
    if not needs_location(t):
        return t
    return f"{t} {'calldata' if direction == 'inputs' else 'memory'}"


def collect_structs(contract: str, abi: list) -> dict:
    """Map (function, direction, index) -> (struct name, components)."""
    structs = {}

    def walk(entry_name: str, direction: str, index: int, param: dict):
        if not param["type"].startswith("tuple"):
            return
        comps = param.get("components") or []
        base = camel(entry_name) + ("Output" if direction == "outputs" else "Input")
        name = STRUCT_NAMES.get((entry_name, direction, index), base)
        if index > 0:
            name = f"{base}{index}"
        structs[(entry_name, direction, index)] = (name, comps)
        for i, c in enumerate(comps):
            walk(entry_name + camel(c.get("name", "")), direction, i, c)

    for entry in abi:
        if entry["type"] not in ("function", "event"):
            continue
        name = entry.get("name", "")
        for direction in ("inputs", "outputs"):
            for i, p in enumerate(entry.get(direction) or []):
                walk(name, direction, i, p)
    return structs


def struct_decls(structs: dict) -> str:
    seen = {}
    for (_, _, _), (name, comps) in structs.items():
        fields = []
        for c in comps:
            ctype = solidity_type(c) if not c["type"].startswith("tuple") else "tuple"
            if ctype == "tuple":
                # nested tuple: fall back to flattened uint256 surfacing is not safe
                raise SystemExit(f"nested tuple in struct {name} not supported by generator")
            fields.append(f"        {ctype} {safe_name(c['name'])};")
        seen[name] = fields
    out = []
    for name, fields in seen.items():
        out.append(f"    struct {name} {{")
        out.extend(fields)
        out.append("    }")
        out.append("")
    return "\n".join(out).rstrip() + "\n" if out else ""


def render_params(params: list, struct_name_for, direction: str) -> str:
    rendered = []
    for i, p in enumerate(params):
        if p["type"].startswith("tuple"):
            struct_name = struct_name_for(i)
            t = f"{struct_name} {'calldata' if direction == 'inputs' else 'memory'}"
        else:
            t = locate(solidity_type(p), direction)
        nm = safe_name(p.get("name") or "")
        rendered.append(f"{t} {nm}".strip())
    return "(" + ", ".join(rendered) + ")"


def emits(entry: dict, function_name: str, structs: dict) -> str:
    def sn(i, direction):
        return structs[(entry["name"], direction, i)][0]

    ins = render_params(entry.get("inputs") or [], lambda i: sn(i, "inputs"), "inputs")
    mut = entry.get("stateMutability", "nonpayable")
    if entry["type"] == "event":
        parts = []
        for i, p in enumerate(entry.get("inputs") or []):
            # Event parameters never take data locations, indexed or not.
            t = sn(i, "inputs") if p["type"].startswith("tuple") else solidity_type(p)
            idx = " indexed" if p.get("indexed") else ""
            parts.append(f"{t}{idx} {safe_name(p.get('name') or '')}".strip())
        return f"    event {entry['name']}({', '.join(parts)});"
    outs = entry.get("outputs") or []
    head = f"    function {entry['name']}{ins} external"
    if mut in ("view", "pure"):
        head += f" {mut}"
    elif mut == "payable":
        head += " payable"
    if outs:
        head += " returns " + render_params(outs, lambda i: sn(i, "outputs"), "outputs")
    return head + ";"


def generate(artifact_path: Path, contract: str) -> str:
    data = json.loads(artifact_path.read_text(encoding="utf-8"))
    abi = data["abi"]
    structs = collect_structs(contract, abi)

    entries = [e for e in abi if e["type"] in ("function", "event")]
    entries.sort(key=lambda e: (e["type"] != "function", e.get("name", "")))

    functions = [emits(e, e.get("name", ""), structs) for e in entries if e["type"] == "function"]
    events = [emits(e, e.get("name", ""), structs) for e in entries if e["type"] == "event"]

    src = data.get("source") or {}
    comp = data.get("compiler") or {}
    bc = data.get("bytecode") or {}
    pin = src.get("pin", "")
    source_keccak = src.get("keccak256", "")
    source_sha = hashlib.sha256(artifact_path.read_bytes()).hexdigest()

    header = f"""// SPDX-License-Identifier: MIT
// GENERATED FILE — DO NOT EDIT BY HAND.
// Generator : scripts/gen-interfaces.py
// Artifact  : packages/core/artifacts/{artifact_path.name} (sha256 {source_sha})
// Contract  : {contract}
// Compiler  : {comp.get("language", "")} {comp.get("version", "")} {comp.get("argv", "")}
// Source    : {src.get("repo", "")}/{src.get("path", "")} @ {pin} ({src.get("describe", "")})
// SourceKey : keccak {source_keccak} ({src.get("bytes", "")} bytes)
// Runtime   : keccak {bc.get("runtimeKeccak256", "")} ({bc.get("runtimeBytes", "")} bytes)
// Regenerate: python scripts/gen-interfaces.py
pragma solidity 0.8.18;

interface I{contract} {{
"""
    body = []
    sd = struct_decls(structs)
    if sd:
        body.append(sd.rstrip())
        body.append("")
    body.extend(events)
    if events and functions:
        body.append("")
    body.extend(functions)
    return header + "\n".join(body) + "\n}\n"


FOUNDRY_ROOT = ROOT / "packages" / "contracts"
LOCAL_FORGE = ROOT / ".tools" / "foundry" / ("forge.exe" if os.name == "nt" else "forge")


def forge_bin() -> str:
    """Prefer the repo-pinned forge; fall back to PATH."""
    if LOCAL_FORGE.exists():
        return str(LOCAL_FORGE)
    found = shutil.which("forge")
    if not found:
        raise SystemExit("forge not found (expected .tools/foundry/forge or PATH)")
    return found


def forge_fmt() -> None:
    """Run the project formatter over the whole project.

    Deliberately *not* `forge fmt <path>`: a path-scoped run does not apply the
    project's `[fmt] line_length` the same way a project-wide run does (observed:
    a 130-char declaration survived a single-file run and was reflowed by the
    project-wide one). One formatter, one invocation mode, so `forge fmt --check`
    and this generator can never disagree.
    """
    subprocess.run([forge_bin(), "fmt"], cwd=FOUNDRY_ROOT, check=True,
                   capture_output=True, text=True)


def formatted(text: str, out_file: str) -> str:
    """Return `text` after project formatting, without touching the real target."""
    scratch_dir = FOUNDRY_ROOT / "src" / ".gen-check"
    scratch_dir.mkdir(parents=True, exist_ok=True)
    scratch = scratch_dir / out_file
    scratch.write_text(text, encoding="utf-8", newline=chr(10))
    try:
        forge_fmt()
        return scratch.read_text(encoding="utf-8")
    finally:
        shutil.rmtree(scratch_dir, ignore_errors=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    changed = []

    # Generate everything first, then format once: `forge fmt` is project-wide.
    generated = []
    for artifact_file, contract, out_file in TARGETS:
        artifact_path = ARTIFACTS / artifact_file
        if not artifact_path.exists():
            print(f"MISSING artifact: {artifact_path}", file=sys.stderr)
            return 2
        generated.append((artifact_path, contract, out_file))

    if args.check:
        stale = []
        for artifact_path, contract, out_file in generated:
            expected = formatted(generate(artifact_path, contract), out_file)
            target = OUT / out_file
            old = target.read_text(encoding="utf-8") if target.exists() else None
            if old != expected:
                stale.append(str(target))
        if stale:
            print("STALE generated interfaces: " + "; ".join(stale), file=sys.stderr)
            return 1
        print(f"OK: {len(generated)} generated interfaces up to date")
        return 0

    for artifact_path, contract, out_file in generated:
        target = OUT / out_file
        text = generate(artifact_path, contract)
        target.write_text(text, encoding="utf-8", newline=chr(10))
        print(f"wrote {target.relative_to(ROOT)} ({len(text.splitlines())} lines)")
    forge_fmt()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())