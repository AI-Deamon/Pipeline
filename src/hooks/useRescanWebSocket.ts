import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const RESCAN_EVENT_TYPES = new Set([
  'rescan_requested',
  'rescan_approved',
  'rescan_verification_complete',
]);

/**
 * Subscribes to the dashboard WebSocket channel and, on any rescan-related event,
 * invalidates the affected TanStack Query keys so the UI refreshes in real time.
 *
 * The backend broadcasts these events via `broadcast_global` on the `/api/v1/ws/dashboard`
 * channel with the shape `{ event: string, data: {...} }` (see websockets/manager.py).
 * A previous version listened for a window-level 'websocket-event' CustomEvent that was
 * never dispatched anywhere, so it was dead — real-time refresh only happened because
 * PendingVerificationPage also polls every 5s. This connects to the real socket; the
 * polling remains as a fallback for when the socket is unavailable.
 */
export function useRescanWebSocket(enabled: boolean = true) {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualCloseRef = useRef(false);
  // Finding #57: PendingVerificationPage's "Live/Offline" indicator was hardcoded
  // to `true` forever (the setter was never called) — it kept showing "Live" even
  // if the socket disconnected and the 5s polling fallback also failed. Track the
  // real connection state here so callers can reflect it.
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    manualCloseRef.current = false;

    const handleEvent = (eventType: string, data: { issue_id?: number } | undefined) => {
      if (!RESCAN_EVENT_TYPES.has(eventType)) return;
      qc.invalidateQueries({ queryKey: ['pending-verification'] });
      qc.invalidateQueries({ queryKey: ['tool-issues'] });
      qc.invalidateQueries({ queryKey: ['my-issues'] });
      qc.invalidateQueries({ queryKey: ['project-overview'] });
      if (eventType === 'rescan_verification_complete' && data?.issue_id !== undefined) {
        qc.invalidateQueries({ queryKey: ['issue', data.issue_id] });
      }
    };

    const connect = () => {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = new URL('/api/v1/ws/dashboard', window.location.origin);
      wsUrl.protocol = wsProtocol;

      const ws = new WebSocket(wsUrl.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { event?: string; data?: { issue_id?: number } };
          if (message.event) handleEvent(message.event, message.data);
        } catch {
          // Ignore non-JSON / unexpected frames.
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Reconnect with a fixed short delay unless the component unmounted. The 5s
        // polling in useRescanQueue covers the gap while disconnected.
        if (!manualCloseRef.current) {
          reconnectTimerRef.current = setTimeout(connect, 5000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      manualCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [enabled, qc]);

  return { connected: enabled && connected };
}

export default useRescanWebSocket;
