#!/usr/bin/env bash
# verify-zap.sh — fast validation that the Jenkins ZAP stage fix works locally.
# Runs the same daemon startup logic as Agent/Jenkinsfile lines 594–731.

set +e

REPORT_DIR="reports"
HTTP_PORT=8090

mkdir -p "$REPORT_DIR"

echo "=== ZAP Stage Verification (stand-alone) ==="
echo "Time: $(date -u)"
echo ""

# ── Phase 1: start daemon (exact flags from Jenkins stage) ──────────────────
echo "Starting ZAP daemon..."
nohup zap.sh -daemon \
    -host 0.0.0.0 \
    -port "$HTTP_PORT" \
    -config api.disablekey=true > "$REPORT_DIR/zap.log" 2>&1 &

ZAP_PID=$!
echo "ZAP PID: $ZAP_PID"
echo ""

# ── Phase 2: pre-wait before first check ───────────────────────────────────
echo "Pre-waiting 30s for ZAP Java process to initialise..."
sleep 30

# ── Phase 3: readiness loop ─────────────────────────────────────────────────
echo "Polling http://127.0.0.1:$HTTP_PORT (up to ~5 min)…"
ATTEMPTS=0
READY_CODE=""

for i in {1..60}; do
    READY_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$HTTP_PORT" 2>/dev/null)

    if [ "$READY_CODE" = "200" ]; then
        ATTEMPTS=$i
        echo "  ✓ Check $i — HTTP 200 — ZAP is ready"
        break
    fi

    echo "  · Check $i — HTTP $READY_CODE — retrying in 5s…"
    sleep 5
done

# ── Phase 4: result ─────────────────────────────────────────────────────────
echo ""
if [ "$READY_CODE" = "200" ]; then
    echo "RESULT  ✓ ZAP started and responded on port $HTTP_PORT"
    echo "         Ready on attempt $ATTEMPTS ($(( ATTEMPTS * 5 ))s after pre-wait)"
else
    echo "RESULT  ✗ ZAP did NOT respond on port $HTTP_PORT within timeout"
    echo "         Last HTTP code: $READY_CODE"
    echo "--- ZAP log (last 60 lines) ---"
    tail -n 60 "$REPORT_DIR/zap.log" || echo "(zap.log not found)"
    kill "$ZAP_PID" 2>/dev/null || true
    exit 1
fi

# ── Phase 5: verify a real ZAP API call works ───────────────────────────────
VERSION=$(curl -s "http://127.0.0.1:$HTTP_PORT/JSON/core/view/version/" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('version','<no version key>'))" 2>/dev/null || echo "<parse-failed>")
echo "         ZAP API /version → $VERSION"

# ── Phase 6: clean shutdown ─────────────────────────────────────────────────
echo ""
echo "Stopping ZAP (PID $ZAP_PID)…"
kill "$ZAP_PID" 2>/dev/null || true
sleep 2
if kill -0 "$ZAP_PID" 2>/dev/null; then
    echo "  SIGTERM didn't stop it, sending SIGKILL…"
    kill -9 "$ZAP_PID" 2>/dev/null || true
fi
echo "  ZAP stopped."
echo ""
echo "=== All checks passed ==="
exit 0
