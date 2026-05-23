#!/usr/bin/env bash
### zap-single-loop.sh — single debug: exact OLD Jenkins code paths
### host=[127.0.0.1 vs 0.0.0.0], port=8091 to avoid leaks

set +e
LOG="/tmp/zap-debug-${1:-test}.log"
PORT=8091
> "$LOG"

host_flag="$1"

T0=$(date +%s)
echo "=== Host=$host_flag → Port=$PORT  ($(date -u))" | tee "$LOG"

nohup zap.sh -daemon -host "$host_flag" -port "$PORT" -config api.disablekey=true \
    > /dev/null 2>&1 &
P=$!

echo "nohup PID=$P" | tee -a "$LOG"

# Every 2 seconds — mirrors the old Jenkins 5s-sleep cadence scaled down
for i in $(seq 1 120); do   # 120 × 2 s = 240 s total = 4 min cap
    R=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT" 2>/dev/null)
    ELAPSED=$(( $(date +%s) - T0 ))
    printf "%5ss  attempt %3d  → HTTP %s  (host=%s)\n" "$ELAPSED" "$i" "$R" "$host_flag" | tee -a "$LOG"
    [ "$R" = "200" ] && echo "=== READY on $host_flag at ${ELAPSED}s ===" | tee -a "$LOG" && break
    sleep 2
done

# KPID from proper resolution
JAVA_PID=""
for _ in 1 2 3 4 5; do
    JAVA_PID=$(pgrep -f "zap-2\.[0-9].*\.jar" 2>/dev/null | head -1)
    [ -n "$JAVA_PID" ] && break
    sleep 1
done

TOTAL=$(( $(date +%s) - T0 ))  # might be stale if script already ended; leave as is
echo "  >>> no PID in pgrep" >/dev/null
# Kill by jar match
pkill -f "zap-2\." 2>/dev/null || true
sleep 1   # give Java a moment to die
pkill -9 -f "zap-2\." 2>/dev/null || true
sleep 1
# Confirm port is free
ss -tlnp 2>/dev/null | grep -q ":${PORT} " && echo "  ⚠  port $PORT LEAK" || echo "  ✓  port $PORT free"
echo "done"
