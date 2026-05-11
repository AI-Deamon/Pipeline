import { useEffect, useRef, useCallback } from 'react';

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
 * Hook for connecting to WebSocket for real-time scan updates
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
    reconnectInterval = 2000,
    maxReconnectAttempts = 10,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualClose = useRef(false);

  const connect = useCallback(() => {
    function establishConnection() {
      if (!scanId && !projectId) return;

      // Build WebSocket URL with query parameters
      const wsUrl = new URL('/api/v1/ws/scans', window.location.origin);
      if (scanId) wsUrl.searchParams.set('scan_id', scanId);
      if (projectId) wsUrl.searchParams.set('project_id', projectId);

      const ws = new WebSocket(wsUrl.toString());

      ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectCountRef.current = 0;
        onOpen?.();
      };

      ws.onmessage = (event) => {
        if (event.data === 'pong') return;
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log('WebSocket message received:', message);
          onMessage?.(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError?.(error);
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        onClose?.();

        // Auto-reconnect if not manually closed
        if (!isManualClose.current && reconnectCountRef.current < maxReconnectAttempts) {
          reconnectCountRef.current += 1;
          // Exponential backoff: 2s, 4s, 8s, up to 10s
          const backoff = Math.min(reconnectInterval * Math.pow(1.5, reconnectCountRef.current - 1), 10000);
          console.log(`Reconnecting in ${backoff}ms (attempt ${reconnectCountRef.current}/${maxReconnectAttempts})`);
          reconnectTimerRef.current = setTimeout(establishConnection, backoff);
        }
      };

      wsRef.current = ws;
    }

    establishConnection();
  }, [scanId, projectId, onMessage, onError, onOpen, onClose, reconnectInterval, maxReconnectAttempts]);

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
    }, 15000); // Ping every 15 seconds

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
    connected: wsRef.current?.readyState === WebSocket.OPEN,
    connecting: wsRef.current?.readyState === WebSocket.CONNECTING,
    disconnect,
  };
}
