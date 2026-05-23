#!/usr/bin/env bash
### zap-debug.sh
### Manual recreation of the Jenkins "ZAP Scan" stage (Agent/Jenkinsfile 594-731)
### with extra timing instrumentation to surface the real startup delay.
###
### Run:  ./zap-debug.sh
### Output: timing written to STDOUT; log to reports/zap-debug.log

set +e

REPORT_DIR="reports"
LOG="$REPORT_DIR/zap-debug.log"
PORT=8090

mkdir -p "$REPORT_DIR"

run() {
    echo "[$(date +%T.%N | cut -c1-12)]  $*" | tee -a "$LOG"
    eval "$@" | tee -a "$LOG"
}

# ── Helpers ──────────────────────────────────────────────────────────────────

wait_for_http() {
    local label="$1"  timeout_s="$2"  url="$3"
    local start=$(date +%s)
    local attempt=1

    while [ "$(( $(date +%s) - start ))" -lt "$timeout_s" ]; do
        code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
        echo "[$(date +%T.%N | cut -c1-12)]  wait_for_http($label): attempt $attempt → HTTP $code" | tee -a "$LOG"

        if [ "$code" = "200" ]; then
            echo "[$(date +%T.%N | cut -c1-12)]  ✓ $label UP after $(( $(date +%s) - start ))s" | tee -a "$LOG"
            return 0
        fi
        sleep 3
        attempt=$(( attempt + 1 ))
    done

    echo "[$(date +%T.%N | cut -c1-12)]  ✗ $label TIMEOUT after $timeout_s s (last code $code)" | tee -a "$LOG"
    return 1
}

port_listening() {
    # Returns 0 if something is bound to PORT (ss or netstat version)
    ss -tlnp 2>/dev/null | grep -qE "[.:]$PORT\b" || \
    netstat -tlnp 2>/dev/null | grep -qE "[: ]$PORT " 
}

# ── Pre-clean ────────────────────────────────────────────────────────────────
echo "=== ZAP Manual Debug ===" | tee "$LOG"
echo "Time: $(date -u)" | tee -a "$LOG"
echo "" | tee -a "$LOG"

# Kill any ZAP that may still be running
pkill -f "zap.sh"     2>/dev/null
pkill -f "ZAP-daemon" 2>/dev/null
pkill -f "zap-2."     2>/dev/null
sleep 2

# Confirm nothing is holding 8090
if ss -tlnp 2>/dev/null | grep -q ":${PORT} " ; then
    echo "FATAL: port $PORT still in use after cleanup" | tee -a "$LOG"
    ss -tlnp | grep ":${PORT} "
    exit 1
fi
echo "Port $PORT is free." | tee -a "$LOG"

# ── Phase 1: timestamp showpoints ──────────────────────────────────────────
T0=$(date +%s.%N)
echo "" | tee -a "$LOG"
echo "── Phase 1: daemon start (t=0) ──────────────────────────────────────────" | tee -a "$LOG"

nohup zap.sh -daemon \
    -host 0.0.0.0 \
    -port "$PORT" \
    -config api.disablekey=true > "$LOG" 2>&1 &
ZAP_PID=$!

echo "nohup PID: $ZAP_PID  (wrapper)" | tee -a "$LOG"

# ── Phase 2: hunt the real java PID ─────────────────────────────────────────
sleep 1
sleep 2
sleep 3
sleep 5

# At t=11s, probe for the actual java PID
JAVA_PID=""
for probe in 1 2 3 4 5; do
    JAVA_PID=$(pgrep -f "zap-2\.[0-9].*\.jar" 2>/dev/null | head -1)
    [ -n "$JAVA_PID" ] && break
    sleep 3
done

if [ -z "$JAVA_PID" ]; then
    echo "[$(date +%T.%N | cut -c1-12)]  WARNING: could not find java PID after 26s; searching by parent PID=$ZAP_PID" | tee -a "$LOG"
    # Try ppid-based rescue
    for pid in $(pgrep -P "$ZAP_PID" 2>/dev/null); do
        echo "    child of $ZAP_PID: $pid $(ps -p $pid -o comm= 2>/dev/null)" | tee -a "$LOG"
    done
fi

echo "Java PID resolved: ${JAVA_PID:-unknown}" | tee -a "$LOG"

# ── Phase 3: wait_for_http (mirrors pipeline) ───────────────────────────────
echo "" | tee -a "$LOG"
echo "── Phase 2: pre-wait + readiness loop  ───────────────────────────────────" | tee -a "$LOG"
sleep 25   # brings us to ~t=35s (30s config + small gaps)

wait_for_http "ZAP API" 300 "http://127.0.0.1:$PORT"
result=$?

# ── Phase 4: final report ───────────────────────────────────────────────────
echo "" | tee -a "$LOG"
echo "── Phase 3: result  ─────────────────────────────────────────────────────" | tee -a "$LOG"

T_END=$(date +%s.%N)
ELAPSED=$(python3 -c "print(f'{$T_END - $T0:.1f}')" 2>/dev/null || echo "?")

echo "" | tee -a "$LOG"
echo "=== SUMMARY ===" | tee -a "$LOG"
echo "Wall-clock elapsed : ${ELAPSED}s" | tee -a "$LOG"
echo "ZAP API HTTP 200   : $([ $result -eq 0 ] && echo YES || echo NO)" | tee -a "$LOG"
echo "Java PID (resolved): ${JAVA_PID:-unknown}" | tee -a "$LOG"
echo "nohup PID (wrapper): $ZAP_PID" | tee -a "$LOG"
echo "" | tee -a "$LOG"

if [ $result -eq 0 ]; then
    echo "── Phase 4: API smoke test ──────────────────────────────────────────────" | tee -a "$LOG"
    VERSION=$(curl -s "http://127.0.0.1:$PORT/JSON/core/view/version/" \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('version','<missing>'))" 2>/dev/null)
    echo "ZAP version API  : $VERSION" | tee -a "$LOG"

    # Audit count
    ALERTS=$(curl -s "http://127.0.0.1:$PORT/JSON/alert/view/alertsSummary/?baseurl=http://127.0.0.1:$PORT" 2>/dev/null \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total','?'))" 2>/dev/null || echo "?")
    echo "Alerts (baseline) : $ALERTS" | tee -a "$LOG"

    # ── Phase 5: clean shutdown ─────────────────────────────────────────────
    echo "" | tee -a "$LOG"
    echo "── Phase 5: clean shutdown  ─────────────────────────────────────────────" | tee -a "$LOG"

    # Kill by java PID (not wrapper)
    if [ -n "$JAVA_PID" ]; then
        echo "Sending SIGTERM → Java PID $JAVA_PID…" | tee -a "$LOG"
        kill "$JAVA_PID" 2>/dev/null

        # Wait up to 10 s for it to go
        for _ in 1 2 3 4 5 6 7 8 9 10; do
            kill -0 "$JAVA_PID" 2>/dev/null || { echo "  ZAP exited cleanly." | tee -a "$LOG"; break; }
            sleep 1
        done
        if kill -0 "$JAVA_PID" 2>/dev/null; then
            echo "  SIGTERM ignored at 10 s, sending SIGKILL…" | tee -a "$LOG"
            kill -9 "$JAVA_PID" 2>/dev/null || true
            sleep 1
        fi
    else
        # Fallback: kill everything with the zap jar in the command line
        echo "Unknown java PID, using pkill -f fallback…" | tee -a "$LOG"
        pkill -9 -f "zap-2" 2>/dev/null
        sleep 1
    fi

    # Double-check port is free
    if ssh -tlnp 2>/dev/null | grep -q ".${PORT} "; then
        echo "  ⚠  Port $PORT STILL LISTENING — Sleeper PID leak?" | tee -a "$LOG"
    else
        echo "  Port $PORT is clear." | tee -a "$LOG"
    fi

    echo "" | tee -a "$LOG"
    echo "All checks passed ✓" | tee -a "$LOG"
    exit 0
else
    echo "" | tee -a "$LOG"
    echo "ZAP did NOT start — debug output below (tail zap.log):" | tee -a "$LOG"
    echo "--- CAPTURED LOG (last 100 lines) ---" | tee -a "$LOG"
    tail -n 100 "$LOG" | tee -a "$LOG"
    echo "-------------------------------------" | tee -a "$LOG"

    # Kill attempts
    [ -n "$JAVA_PID" ] && kill "$JAVA_PID" 2>/dev/null || pkill -f "zap-2" 2>/dev/null
    exit 1
fi
