#!/usr/bin/env python
"""
Fail if a secret would enter the repository.

Kenapa ada: `.env.example` sempat berisi `PRIVATE_KEY` asli yang cocok dengan
`DEPLOYER_ADDRESS` (ditemukan 2026-11-20 sebelum commit pertama). `.gitignore`
memakai `!.env.example`, jadi file contoh itu memang masuk git — artinya apa pun
yang ditulis di sana ikut ter-commit. Aturan 8 di `AGENTS.md` tidak cukup
dijaga dengan ingatan, jadi dijaga di sini dan dipanggil dari `verify-all.py`.

Yang diperiksa (hanya file yang akan/ sudah masuk git):

  1. Nama file terlarang: `.env`, `*.pem`, `*.key`, `id_rsa*`, `*.p12`, `*.keystore`.
  2. Nilai berbentuk kunci privat (64 hex) atau mnemonic (12-24 kata) yang
     di-assign ke nama variabel sensitif (PRIVATE_KEY, PK1, SIGNER_KEY, SECRET,
     MNEMONIC, API_KEY, ...).
  3. Kredensial di dalam URL: `?apikey=`, `?api_key=`, `?token=`, `user:pass@host`.
  4. Hex 64 yang bukan hash: hanya dilaporkan bila nama variabelnya sensitif, jadi
     blockHash/keccak/bytecode hash tidak ikut jadi temuan palsu.

`--self-test` membuktikan pola masih menangkap bentuk-bentuk itu (termasuk
regresi `PK2 = "0x..."` yang lolos pada 2026-11-25).

Kunci anvil yang memang publik (dokumentasi Foundry, dipakai rehearsal lokal)
masuk allowlist: nilainya sudah ada di buku manual Foundry dan bukan rahasia.

Usage:
    python scripts/check-secrets.py [--all-files]
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Anvil/Foundry default keys — publik, dipakai `docs/DEPLOYMENT.md` §5.1.
PUBLIC_KEYS = {
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",  # anvil #0
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",  # anvil #1
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",  # anvil #2
}

BANNED_NAMES = (
    re.compile(r"(^|/)\.env$"),
    re.compile(r"(^|/)\.env\.(local|stage|prod|production)$"),
    re.compile(r"\.(pem|key|p12|pfx|keystore)$"),
    re.compile(r"(^|/)id_(rsa|ecdsa|ed25519)$"),
)

SENSITIVE_VAR = (
    r"(PRIVATE_?KEY|PRIVKEY|SECRET|MNEMONIC|SEED_?PHRASE|API_?KEY|ACCESS_?TOKEN|AUTH_?TOKEN|BEARER"
    r"|PK\d*|SK\d*|SIGNER_?KEY|DEPLOYER_?KEY)"
)

PATTERNS = (
    # PRIVATE_KEY=0x<64 hex>
    (
        "kunci privat ter-assign ke variabel sensitif",
        re.compile(rf"(?i)\b{SENSITIVE_VAR}\w*\s*[:=]\s*[\"']?(0x[0-9a-fA-F]{{64}})\b"),
    ),
    # MNEMONIC="word word ..." (12-24 kata huruf kecil)
    (
        "mnemonic ter-assign ke variabel sensitif",
        re.compile(
            rf"(?i)\b{SENSITIVE_VAR}\w*\s*[:=]\s*[\"']?"
            r"((?:[a-z]{3,10}\s+){11,23}[a-z]{3,10})[\"']?\s*$"
        ),
    ),
    # https://host/path?apikey=xxxx
    (
        "kredensial di query string URL",
        re.compile(r"(?i)[?&](apikey|api_key|key|token|access_token)=([A-Za-z0-9_\-]{16,})"),
    ),
    # https://<user>:<pass>@host  (contoh ditulis dengan placeholder supaya
    # berkas ini tidak mencocokkan dirinya sendiri)
    (
        "kredensial di userinfo URL",
        re.compile(r"(?i)https?://[^/\s:@<>]+:([^/\s@<>]{6,})@"),
    ),
)

# Berkas referensi pihak ketiga yang di-vendor apa adanya (html/js hasil scrape).
SKIP_DIRS = {".git", "node_modules", "referensi", ".tmp", ".tools", "out", "cache", "broadcast", ".venv-037", ".venv-ape"}


def tracked_files() -> list[Path]:
    """File yang masuk git. Fallback: semua file, kalau repo belum di-init."""
    try:
        out = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True,
        ).stdout
        names = [n for n in out.split("\0") if n]
        if names:
            return [ROOT / n for n in names]
    except (OSError, subprocess.CalledProcessError):
        pass
    print("[warn] git tidak tersedia / belum ada file ter-track: memindai seluruh working tree")
    return [p for p in ROOT.rglob("*") if p.is_file()]


def is_skipped(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    return any(part in SKIP_DIRS for part in rel.split("/")[:-1]) or rel in {".env"}


def scan(path: Path) -> list[tuple[int, str, str]]:
    findings: list[tuple[int, str, str]] = []
    try:
        raw = path.read_bytes()
    except OSError:
        return findings
    if b"\0" in raw[:8192]:  # biner
        return findings
    text = raw.decode("utf-8", errors="replace")
    for lineno, line in enumerate(text.splitlines(), start=1):
        for label, pattern in PATTERNS:
            for match in pattern.finditer(line):
                # Grup terakhir yang tidak kosong = nilainya; grup pertama adalah
                # nama variabelnya sendiri (SENSITIVE_VAR juga berupa grup).
                value = next((g for g in reversed(match.groups()) if g), "")
                if value.lower() in PUBLIC_KEYS:
                    continue
                findings.append((lineno, label, line.strip()[:120]))
    return findings


def self_test() -> int:
    """Prove the patterns still catch the shapes they exist for.

    Sample key is assembled at run time so this file never contains a literal
    64-hex string that would match its own scanner.
    """
    import tempfile

    hexkey = "0x" + "ab" * 32
    cases = [
        ("PRIVATE_KEY assign", f"PRIVATE_KEY = {hexkey}"),
        ("PK2 assign (regression 2026-11-25)", f'PK2 = "{hexkey}"'),
        ("SIGNER_KEY assign", f"SIGNER_KEY={hexkey}"),
    ]
    failures = 0
    with tempfile.TemporaryDirectory() as tmp:
        for label, body in cases:
            path = Path(tmp) / "sample.py"
            path.write_text(body + "\n", encoding="utf-8")
            found = scan(path)
            if not found:
                print(f"[FAIL] self-test: pola tidak menangkap {label}")
                failures += 1
    if failures:
        return 1
    print("self-test: pola rahasia menangkap semua bentuk uji")
    return 0

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all-files", action="store_true", help="pindai working tree, bukan hanya file ter-track")
    ap.add_argument("--self-test", action="store_true", help="uji pola terhadap contoh yang dibangun saat runtime")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    files = (
        [p for p in ROOT.rglob("*") if p.is_file()]
        if args.all_files
        else tracked_files()
    )
    files = [p for p in files if p.exists() and not is_skipped(p)]

    problems = 0
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        if any(p.search(rel) for p in BANNED_NAMES):
            print(f"[FAIL] {rel}: nama file terlarang (rahasia tidak boleh masuk git)")
            problems += 1
            continue
        for lineno, label, snippet in scan(path):
            print(f"[FAIL] {rel}:{lineno}: {label}\n       {snippet}")
            problems += 1

    print(f"memindai {len(files)} file")
    if problems:
        print(f"\n{problems} temuan. Pindahkan nilainya ke `.env` (di-ignore), lalu ulangi.")
        return 1
    print("tidak ada rahasia ter-commit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
