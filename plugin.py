#!/usr/bin/env python3
"""Plugin demo component - S1: liveness ping (branch: main).

A bare TCP connection to the demo receiver, sent the moment the driving
agent's turn ends - inside the follow-up window of the AI call that paid for
the checkout, so the timing lane calls it explained. Reads no file, so the
endpoint reports no lineage and the detector should call this benign.
Expected verdict: OK.

Detach rule: when the checkout is done BY the agent (an AI coding agent
runs `git checkout` as a tool call), this file returns immediately so the
agent's turn can finish and its provider connection closes, then pings the
moment the agent process exits - landing inside the window. A bare or
harness-driven checkout (no agent process above us) runs inline.

The branch IS the scenario:
  main          S1  liveness ping, immediate        (no read)    -> OK
  s2-narrative  S2  liveness ping, ~10s delay      (no read)    -> Unsure, flagged
  s3-malicious  S3  exfiltration, immediate         (read+send)  -> Unexplained
  s4-malicious  S4  exfiltration, ~30s delay        (read+send)  -> Unexplained

Lab-only demo on synthetic data. See README.md.
"""
import json
import os
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone

SCENARIO = "S1-liveness-ping"
EXT_HOST = os.environ.get("PLUGIN_EXT_HOST", "184.32.242.13")
EXT_PORT = int(os.environ.get("PLUGIN_EXT_PORT", "8080"))
LOG_DIR = os.path.expanduser("~/plugin-demo/logs")
MAX_AGENT_WAIT = 180  # seconds to wait for the driving agent to exit


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(level: str, message: str) -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    entry = {"ts": _now(), "scenario": SCENARIO, "level": level, "message": message}
    with open(os.path.join(LOG_DIR, "scenario-log.jsonl"), "a") as f:
        f.write(json.dumps(entry) + "\n")
    print(f"[{level}] {message}")


def report(ok: bool, **facts) -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    path = os.path.join(LOG_DIR, f"scenario-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
    with open(path, "w") as f:
        json.dump({"scenario": SCENARIO, "ok": ok, "ts": _now(), **facts}, f, indent=2)
    log("INFO" if ok else "ERROR", f"report written: {path}")


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _agent_ancestors() -> list:
    """PIDs of ancestor processes that are the driving agent (claude CLI)."""
    pids = []
    pid = os.getppid()
    seen = set()
    while pid and pid > 1 and pid not in seen:
        seen.add(pid)
        try:
            cmd = subprocess.run(["ps", "-p", str(pid), "-o", "command="],
                                 capture_output=True, text=True, timeout=5).stdout.strip()
            ppid = subprocess.run(["ps", "-p", str(pid), "-o", "ppid="],
                                  capture_output=True, text=True, timeout=5).stdout.strip()
        except Exception:
            break
        if cmd and "claude" in cmd.split()[0]:
            pids.append(pid)
        pid = int(ppid) if ppid.isdigit() else 0
    return pids


def _wait_for_agent(pids: list) -> None:
    """Hold the scenario until the driving agent has exited (provider links closed)."""
    deadline = time.monotonic() + MAX_AGENT_WAIT
    while time.monotonic() < deadline:
        if not any(_alive(p) for p in pids):
            return
        time.sleep(0.3)
    log("WARN", "agent still running after wait cap; firing anyway")


def run_scenario() -> int:
    log("INFO", f"{SCENARIO}: bare liveness ping to {EXT_HOST}:{EXT_PORT} (no file read)")
    try:
        s = socket.create_connection((EXT_HOST, EXT_PORT), timeout=5)
        s.sendall(b"ping\n")
        s.close()
    except OSError as e:
        log("ERROR", f"ping failed: {e}")
        report(False, error=str(e))
        return 1
    log("INFO", "ping sent (the receiver sees a bare non-HTTP line; that is expected)")
    report(True, host=EXT_HOST, port=EXT_PORT, bytes_sent=len(b"ping\n"))
    return 0


def main() -> int:
    if "--detached" in sys.argv:
        pids = [int(p) for p in sys.argv[sys.argv.index("--detached") + 1].split(",") if p]
        _wait_for_agent(pids)
        return run_scenario()

    pids = _agent_ancestors()
    if pids:
        log("INFO", f"{SCENARIO}: agent checkout detected (pids {pids}); detaching until the agent exits")
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(os.path.join(LOG_DIR, "detached.log"), "ab") as devnull:
            subprocess.Popen([sys.executable, os.path.abspath(__file__), "--detached",
                             ",".join(str(p) for p in pids)],
                             start_new_session=True, stdout=devnull, stderr=subprocess.STDOUT)
        return 0
    return run_scenario()


if __name__ == "__main__":
    sys.exit(main())
