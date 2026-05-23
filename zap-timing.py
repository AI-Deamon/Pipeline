"""
zap-timing.py
Standalone Python re-run of the Jenkins ZAP stage timing simulation.
Produces: reports/zap-py.log
"""

import subprocess
import time
import json
import os
import signal

PORT = 8090
LOG  = "reports/zap-py.log"
LOG_CMD = ["tee", "-a", LOG]

def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}]  {msg}"
    print(line)
    try:
        subprocess.run(["printf", "%s\n", line], stdout=open(LOG, "a"), stderr=subprocess.DEVNULL)
    except Exception:
        pass

def start_zap():
    log("START — nohup zap.sh -daemon …")
    with open(LOG, "a") as f:
        proc = subprocess.Popen(
            ["nohup", "zap.sh", "-daemon",
             "-host", "0.0.0.0", "-port", str(PORT),
             "-config", "api.disablekey=true"],
            stdout=f, stderr=f
        )
    return proc

def http_check():
    try:
        r = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
             f"http://127.0.0.1:{PORT}"],
            capture_output=True, text=True, timeout=5
        )
        return r.stdout.strip()
    except Exception as e:
        log(f"  http_check error: {e}")
        return "000"

def find_java_pid():
    for _ in range(10):
        r = subprocess.run(
            ["pgrep", "-f", "zap-2.*\\.jar"],
            capture_output=True, text=True
        )
        pids = r.stdout.strip().splitlines()
        if pids:
            return pids[0]
        time.sleep(1)
    return None

if __name__ == "__main__":
    os.makedirs("reports", exist_ok=True)
    with open(LOG, "w") as _:
        pass   # truncate

    log(f"=== Python ZAP Timing ===")
    log(f"port: {PORT}")

    # ── pre-clean ──
    subprocess.run(["pkill", "-f", "zap-2"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-f", "zap.sh"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)

    # ── start ──
    t0 = time.monotonic()
    wrapper = start_zap()
    log(f"nohup PID (wrapper): {wrapper.pid}")

    # ── poll until 200 ──
    print()
    log("Polling …  (every 2 s, cap 600 s)")
    print()

    attempt = 0
    first_200 = None

    while True:
        attempt += 1
        code = http_check()
        elapsed = time.monotonic() - t0
        log(f"  check {attempt:3d}  t={elapsed:.1f}s  → HTTP {code}")

        if code == "200":
            first_200 = elapsed
            break
        if elapsed > 600:
            break
        time.sleep(2)

    # ── resolve PID ──
    java_pid = find_java_pid()
    log(f"Java PID : {java_pid or '<not found>'}   |   wrapper PID: {wrapper.pid}")

    # ── result ──
    total = time.monotonic() - t0
    print()
    log("========== RESULTS ==========")
    log(f"  First HTTP 200  : {first_200:.1f}s" if first_200 else "  First HTTP 200  : TIMEOUT")
    log(f"  Total wall-clock: {total:.1f}s")
    log(f"  Total checks    : {attempt}")
    log("==============================")

    if first_200:
        log("RESULT  ✓ ZAP responded in {:.1f}s".format(first_200))
        time.sleep(3)
        r = subprocess.run(
            ["curl", "-s", f"http://127.0.0.1:{PORT}/JSON/core/view/version/"],
            capture_output=True, text=True
        )
        try:
            ver = json.loads(r.stdout).get("version", "?")
        except Exception:
            ver = "<parse-failed>"
        log(f"  ZAP version     : {ver}")

        # clean shutdown
        target_pid = java_pid or wrapper.pid
        log(f"\nShutting down (PID {target_pid})…")
        os.kill(int(target_pid), signal.SIGTERM) if target_pid else None
        for _ in range(10):
            time.sleep(1)
            try:
                os.kill(int(target_pid), 0)
            except (ProcessLookupError, TypeError, ValueError):
                log("ZAP exited cleanly.")
                break
            except Exception as e:
                log(f"  kill probe error: {e}")
        else:
            log("SIGTERM ignored → SIGKILL")
            try:
                os.kill(int(target_pid), signal.SIGKILL)
            except (ProcessLookupError, TypeError, ValueError):
                pass
        log("All checks passed ✓")
    else:
        log("RESULT  ✗ ZAP never came up")
        log("--- captured log tail ---")
        try:
            subprocess.run(["tail", "-n", "100", LOG], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        subprocess.run(["pkill", "-9", "-f", "zap-2"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
