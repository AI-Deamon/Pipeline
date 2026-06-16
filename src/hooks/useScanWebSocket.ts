import { useEffect, useRef, useCallback, useState } from 'react';

export interface WebSocketMessage {
  event: string;
  scan_id: string;
  project_id: string;
  data: {
    scan_id: string;
    project_id: string;
    state: string;
    started_at?: string;
    finished_at?: string;
    results?: Array<{
      stage: string;
      status: string;
      summary?: string;
      artifact_url?: string;
    }>;
    error?: {
      message: string;
      error_type: string;
      jenkins_console_url?: string;
    };
  };
}

export interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

/**
 * Hook for connecting to WebSocket for real-time scan updates.
 *
 * Fixes applied:
 * - T030: isManualClose reset in connect()
 * - T032: connected state is reactive (useState)
 * - T033: Polling fallback after reconnect exhaustion
 * - T034: Connection timeout (fail fast if unreachable)
 */
export function useScanWebSocket(
  scanId?: string,
  projectId?: string,
  options: UseWebSocketOptions = {}
) {
  const {
    onMessage,
    onError,
    onOpen,
    onClose,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualClose = useRef(false);
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});

  // T032: Reactive connection state
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  // T033: Polling fallback state
  const [exhausted, setExhausted] = useState(false);

  const onMessageRef = useRef(onMessage);
  // eslint-disable-next-line react-hooks/refs
  onMessageRef.current = onMessage;
  const onErrorRef = useRef(onError);
  // eslint-disable-next-line react-hooks/refs
  onErrorRef.current = onError;
  const onOpenRef = useRef(onOpen);
  // eslint-disable-next-line react-hooks/refs
  onOpenRef.current = onOpen;
  const onCloseRef = useRef(onClose);
  // eslint-disable-next-line react-hooks/refs
  onCloseRef.current = onClose;

  const connect = useCallback(() => {
    if (!scanId && !projectId) return;

    // T030: Reset isManualClose on each connect attempt
    isManualClose.current = false;
    setExhausted(false);

    // Build WebSocket URL with query parameters
    const wsUrl = new URL('/api/v1/ws/scans', window.location.origin);
    if (scanId) wsUrl.searchParams.set('scan_id', scanId);
    if (projectId) wsUrl.searchParams.set('project_id', projectId);

    const ws = new WebSocket(wsUrl.toString());
    setConnecting(true);

    // T034: Connection timeout — fail fast if unreachable
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }, 10000); // 10 second timeout

    ws.onopen = () => {
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      console.log('WebSocket connected');
      setConnected(true);
      setConnecting(false);
      onOpenRef.current?.();

      // Reset reconnect count only after 30s of stable connection
      if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
      stableTimerRef.current = setTimeout(() => {
        reconnectCountRef.current = 0;
      }, 30000);
    };

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log('WebSocket message received:', message);
        onMessageRef.current?.(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      onErrorRef.current?.(error);
    };

    ws.onclose = () => {
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      setConnected(false);
      setConnecting(false);
      console.log('WebSocket closed');
      onCloseRef.current?.();

      // T033: Auto-reconnect with polling fallback
      if (!isManualClose.current && reconnectCountRef.current < maxReconnectAttempts) {
        reconnectCountRef.current += 1;
        console.log(`Reconnecting in ${reconnectInterval}ms (attempt ${reconnectCountRef.current}/${maxReconnectAttempts})`);
        reconnectTimerRef.current = setTimeout(() => { connectRef.current(); }, reconnectInterval);
      } else if (!isManualClose.current) {
        // Exhausted all reconnect attempts — signal polling fallback
        console.warn('WebSocket reconnect exhausted — falling back to polling');
        setExhausted(true);
      }
    };

    wsRef.current = ws;
  }, [scanId, projectId, reconnectInterval, maxReconnectAttempts]);

  // Keep connectRef pointing at the latest connect() so onclose can call it
  // eslint-disable-next-line react-hooks/refs
  connectRef.current = connect;

  // Connect on mount
  useEffect(() => {
    if (scanId || projectId) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      isManualClose.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (stableTimerRef.current) {
        clearTimeout(stableTimerRef.current);
      }
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, scanId, projectId]);

  // Send ping to keep connection alive
  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 30000); // Ping every 30 seconds

    return () => clearInterval(pingInterval);
  }, []);

  const disconnect = useCallback(() => {
    isManualClose.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
  }, []);

  return {
    connected,
    connecting,
    exhausted, // T033: Signal for polling fallback
    disconnect,
  };
}
