#!/usr/bin/env bash
set +e
PORT=8090
LOG=reports/zap-one.log
mkdir -p reports
> "$LOG"   # truncate

exec > >(tee -a "$LOG") 2>&1   # fork-tee into log

echo "=== ZAP One-Shot Debug ==="
date -u

T0=$(date +%s)

nohup zap.sh -daemon -host 0.0.0.0 -port "$PORT" -config api.disablekey=true \
    > /dev/null 2>&1 &
P=$!
echo "nohup PID: $P"

sleep 30   # 30-s pre-wait (mirrors Jenkins fix)
echo "30 s pre-wait done"

READY=""
for i in 1 2 3 4 5 6 7 8 9; do
    R=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT" 2>/dev/null)
    ELAPSED=$(( $(date +%s) - T0 ))
    echo "check $i  t=${ELAPSED}s  → HTTP $R"
    [ "$R" = "200" ] && { READY=200; break; }
    sleep 5
done

# Read back from log to avoid pipe-buffer confusion
sleep 1
READY=$(grep "^check " "$LOG" | grep "HTTP 200" | head -1 | grep -oP "HTTP \K[0-9]+" || echo "")

TOTAL=$(( $(date +%s) - T0 ))
echo ""
echo "=== RESULT ==="
echo "First 200: ${READY:-TIMEOUT}   Total time: ${TOTAL}s"

if [ -z "$READY" ]; then
    echo "✗ ZAP didn't respond in ${TOTAL}s"
    # show ZAP's own log
    echo "--- ZAP_DAEMON_LOG (last 80 lines) ---"
    grep -v "^check\|^===.*===\|^check.*t=\|^RESULT\|^nohup\|^30\|^\(Start\|Total\)" "$LOG" 2>/dev/null | tail -n 80 || true
    pkill -f "zap-2" 2>/dev/null || true
    exit 1
fi

echo "✓ ZAP up"

VERSION=$(curl -s "http://127.0.0.1:$PORT/JSON/core/view/version/" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('version','?'))" 2>/dev/null)
echo "ZAP API version: $VERSION"

# kill: try wrapper pid then java
KILL_P=$P
pkill -f "zap-2" 2>/dev/null || true   # soft kill
sleep 2
pkill -9 -f "zap-2" 2>/dev/null || true # hard kill fallback

ss -tlnp 2>/dev/null | grep ":${PORT} " && echo "port leak!" || echo "port $PORT CLEAR"
echo done
exit 0
