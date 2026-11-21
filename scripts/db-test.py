#!/usr/bin/env python
"""
Run the indexer's schema tests against a throwaway Postgres.

Why a temporary cluster instead of "point it at your dev database": the tests drop the `public`
schema, and a test suite that can wipe a developer's database is a gun pointed at a foot. This
script creates a cluster in `.tmp/`, listens on a free loopback port, runs `node --test`, and
deletes everything afterwards. Nothing outside the repo is touched, and no credential is needed.

The Postgres binaries are located, in order:
  1. `$PG_BIN` (explicit override)
  2. `initdb`/`pg_ctl` on PATH
  3. the Laragon install used by this host

Usage:
    python scripts/db-test.py            # run the suite, clean up
    python scripts/db-test.py --keep     # leave the cluster for debugging (prints the URL)
    python scripts/db-test.py -q         # quiet
"""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEXER = ROOT / "services" / "indexer"
TMP = ROOT / ".tmp"
LARAGON_PG = Path("C:/laragon/bin/postgresql/postgresql-14.5-1/bin")

EXE = ".exe" if os.name == "nt" else ""


def find_bin(name: str) -> str:
    override = os.environ.get("PG_BIN")
    if override:
        candidate = Path(override) / f"{name}{EXE}"
        if candidate.exists():
            return str(candidate)
        raise SystemExit(f"PG_BIN is set but {candidate} does not exist")

    found = shutil.which(name)
    if found:
        return found

    candidate = LARAGON_PG / f"{name}{EXE}"
    if candidate.exists():
        return str(candidate)

    raise SystemExit(
        f"{name} not found. Install PostgreSQL, put it on PATH, or set PG_BIN to its bin directory."
    )


def wait_for_port(port: int, timeout: float = 60.0) -> None:
    """Poll until the cluster accepts TCP connections.

    `pg_ctl -w start` hangs on this host: on Windows it inherits the parent's stdin and blocks
    forever when stdout/stderr are pipes. Starting `pg_ctl` detached and polling the port is the
    same guarantee without the blocking wait.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.25)
    raise SystemExit(f"Postgres did not start listening on 127.0.0.1:{port} within {timeout:.0f}s")


def stop_cluster(pg_ctl: str, data: Path) -> None:
    """Stop the cluster without trusting `pg_ctl`'s exit behaviour."""
    try:
        run([pg_ctl, "-D", str(data), "-m", "immediate", "stop"], timeout=60)
    except (subprocess.TimeoutExpired, SystemExit):
        pass
    pid_file = data / "postmaster.pid"
    if pid_file.exists():
        pid = pid_file.read_text(encoding="ascii", errors="ignore").splitlines()[0].strip()
        if pid.isdigit():
            subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True) if os.name == "nt" else subprocess.run(
                ["kill", "-9", pid], capture_output=True
            )


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def run(
    argv: list[str],
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    timeout: float = 180.0,
) -> None:
    proc = subprocess.run(
        argv,
        cwd=str(cwd) if cwd else None,
        env=env,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        print(proc.stdout)
        print(proc.stderr, file=sys.stderr)
        raise SystemExit(f"command failed ({proc.returncode}): {' '.join(argv)}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="keep the cluster (prints TEST_DATABASE_URL)")
    ap.add_argument("-q", "--quiet", action="store_true")
    args = ap.parse_args()

    initdb = find_bin("initdb")
    pg_ctl = find_bin("pg_ctl")
    createdb = find_bin("createdb")
    node = shutil.which("node")
    if not node:
        raise SystemExit("node not found on PATH; the indexer tests need Node >= 22.6")

    TMP.mkdir(parents=True, exist_ok=True)
    data = TMP / f"pg-{os.getpid()}"
    if data.exists():
        shutil.rmtree(data)

    port = free_port()
    url = f"postgres://postgres@127.0.0.1:{port}/avenor_test"

    started = False
    try:
        if not args.quiet:
            print(f"[..] initdb {data}")
        run(
            [initdb, "-D", str(data), "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"],
        )

        logfile = data / "server.log"
        if not args.quiet:
            print(f"[..] pg_ctl start on port {port}")
        start_flags = 0
        if os.name == "nt":
            start_flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        subprocess.Popen(
            [
                pg_ctl,
                "-D",
                str(data),
                "-l",
                str(logfile),
                "-o",
                f"-p {port} -c listen_addresses=127.0.0.1 -c fsync=off -c full_page_writes=off",
                "start",
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=start_flags,
            start_new_session=os.name != "nt",
        )
        started = True
        wait_for_port(port)

        run([createdb, "-h", "127.0.0.1", "-p", str(port), "-U", "postgres", "avenor_test"])

        env = dict(os.environ)
        env["TEST_DATABASE_URL"] = url
        # Node 24 strips types by default; older Node needs the flag, and passing it twice is
        # harmless. `--test` runs every *.test.ts under test/.
        test_files = sorted(str(p.relative_to(INDEXER)).replace("\\", "/") for p in (INDEXER / "test").glob("*.test.ts"))
        if not test_files:
            raise SystemExit("no test files found under services/indexer/test")
        if not args.quiet:
            print(f"[..] node --test services/indexer ({len(test_files)} files)")
        proc = subprocess.run(
            [node, "--test", "--test-concurrency=1", *test_files],
            cwd=str(INDEXER),
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=300,
        )
        if proc.returncode != 0:
            print("[FAIL] indexer schema tests", file=sys.stderr)
            return 1
        if not args.quiet:
            print("[ok] indexer schema tests")
        return 0
    finally:
        if started and args.keep:
            print(f"cluster kept at {data}")
            print(f"TEST_DATABASE_URL={url}")
            print(f"stop with: {pg_ctl} -D {data} -m immediate stop")
        elif started:
            stop_cluster(pg_ctl, data)

    if not args.keep and data.exists():
        # pg_ctl stop can return before Windows releases the files; retry briefly.
        for _ in range(20):
            try:
                shutil.rmtree(data)
                break
            except OSError:
                time.sleep(0.25)


if __name__ == "__main__":
    raise SystemExit(main())