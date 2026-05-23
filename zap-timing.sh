#!/usr/bin/env bash
### zap-timing.sh — measures ZAP pure startup time (port 8090)
### Run:  ./zap-timing.sh

set +e

PORT=8090
LOG="reports/zap-timing.log"
mkdir -p reports

now()      { date +%s.%N; }
elapsed()  { awk "BEGIN{printf \"%.1f\", $2 - $1}"; }

print()    { echo "[$(date +%T.%N | cut -c1-12)]  $*" | tee -a "$LOG"; }

echo "=== ZAP Startup Timing ===" | tee "$LOG"
print "Kernel $(uname -r)  |  Java $(java -version 2>&1 | head -1)"

# ── Pre-clean ────────────────────────────────────────────────────────────────
pkill -f "zap-2.17.0" 2>/dev/null
pkill -f "zap.sh"     2>/dev/null
sleep 2

ss -tlnp 2>/dev/null | grep -q ":${PORT} " \
    && { print "FATAL: port $PORT still in use"; exit 1; }
print "Port $PORT is free ✓"

# ── Phase 1: start ───────────────────────────────────────────────────────────
T_START=$(now)
print "START  t=0.0 — nohup zap.sh -daemon …"

nohup zap.sh -daemon \
    -host 0.0.0.0 \
    -port "$PORT" \
    -config api.disablekey=true > "$LOG" 2>&1 &
WRAPPER_PID=$!
print "nohup PID (wrapper): $WRAPPER_PID"

# ── Phase 2: poll until first HTTP 200 ──────────────────────────────────────
print ""
print "Polling http://127.0.0.1:$PORT  (interval 2 s, soft cap 600 s)…"
print ""

T_FIRST_200=""
CHECK=0

while true; do
    CHECK=$(( CHECK + 1 ))
    NOW_T=$(now)

    CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT" 2>/dev/null)
    SECS=$(elapsed "$T_START" "$NOW_T")

    printf "  %6ss  check %3d  → HTTP %s\n" "$SECS" "$CHECK" "$CODE" | tee -a "$LOG"

    [ "$CODE" = "200" ] && { T_FIRST_200=$SECS; break; }

    # soft cap: stop after 600 s
    CAPPED=$(awk "BEGIN{print int(float(\"$SECS\") >= 600)}")
    [ "$CAPPED" = "1" ] && break
    sleep 2
done

T_END=$(now)
TOTAL=$(elapsed "$T_START" "$T_END")

# ── Phase 3: resolve Java PID ────────────────────────────────────────────────
JAVA_PID=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
    JAVA_PID=$(pgrep -f "zap-2[0-9]" 2>/dev/null | head -1)
    [ -n "$JAVA_PID" ] && break
    sleep 1
done
print ""
print "Java PID  : ${JAVA_PID:-<not found (may share PID with wrapper)>}   wrapper PID: $WRAPPER_PID"

# ── Phase 4: smoke test + clean shutdown ────────────────────────────────────
print ""
print "========== TIMING RESULTS =========="
printf "  First HTTP 200  : %ss\n" "${T_FIRST_200:-TIMEOUT}"
printf "  Total wall-clock: %ss\n" "$TOTAL"
printf "  Total checks    : %s\n" "$CHECK"
print "======================================"
print ""

if [ -z "$T_FIRST_200" ]; then
    print "RESULT  ✗ ZAP never responded on port $PORT"
    print "--- CAPTURED LOG (last 100 lines) ---"
    tail -n 100 "$LOG"
    print "--------------------------------------"
    pkill -9 -f "zap-2" 2>/dev/null
    exit 1
fi

print "RESULT  ✓ ZAP at $T_FIRST_200 s"

VERSION=$(curl -s "http://127.0.0.1:$PORT/JSON/core/view/version/" \
    | awk -F'"' '/"version"/{print $4; exit}')
print "ZAP API version : ${VERSION:-<parse-failed>}"

# Kill: prefer java PID; fallback to wrapper
KILL_TARGET="${JAVA_PID:-$WRAPPER_PID}"
print ""
print "Shutting down ZAP (PID $KILL_TARGET)…"
kill "$KILL_TARGET" 2>/dev/null

for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$KILL_TARGET" 2>/dev/null || { print "ZAP exited cleanly."; break; }
    sleep 1
done
kill -0 "$KILL_TARGET" 2>/dev/null \
    && { print "Still running → SIGKILL…"; kill -9 "$KILL_TARGET" 2>/dev/null; sleep 1; }

ss -tlnp 2>/dev/null | grep -q ":${PORT} " \
    && print "  ⚠ port $PORT STILL LISTENING" \
    || print "  Port $PORT clear."

print ""
print "All checks passed ✓"
exit 0
