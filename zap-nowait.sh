#!/usr/bin/env bash
set +e
PORT=8090
LOG=reports/zap-no-wait.log
mkdir -p reports
> "$LOG"

T0=$(date +%s)

nohup zap.sh -daemon -host 0.0.0.0 -port "$PORT" -config api.disablekey=true \
    > /dev/null 2>&1 &
P=$!
echo "nohup PID: $P"

FIRST_200=""
for i in $(seq 1 90); do
    R=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT" 2>/dev/null)
    ELAPSED=$(( $(date +%s) - T0 ))
    printf "%5ss  check %3d  → HTTP %s\n" "$ELAPSED" "$i" "$R" | tee -a "$LOG"
    [ "$R" = "200" ] && { FIRST_200=$ELAPSED; break; }
    sleep 2
done

TOTAL=$(( $(date +%s) - T0 ))
echo ""
echo "RESULT: First 200 in ${FIRST_200:-TIMEOUT}s  |  Total: ${TOTAL}s  |  Checks: $(( FIRST_200 > 0 ? (FIRST_200+1)/2 : 90 ))"

[ -z "$FIRST_200" ] && echo "⚠  ZAP did not respond within ${TOTAL}s"

# clean up
pkill -f "zap-2" 2>/dev/null || true
ss -tlnp 2>/dev/null | grep ":${PORT} " && echo "port leak" || echo "port $PORT CLEAR"
