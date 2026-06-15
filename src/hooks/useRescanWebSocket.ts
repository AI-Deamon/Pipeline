import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RescanRequestedEvent, RescanApprovedEvent, RescanVerificationCompleteEvent } from '../types';

type WSEvent =
  | { type: 'rescan_requested'; data: RescanRequestedEvent }
  | { type: 'rescan_approved'; data: RescanApprovedEvent }
  | { type: 'rescan_verification_complete'; data: RescanVerificationCompleteEvent };

/**
 * Subscribes to the 3 rescan WebSocket event types and invalidates the
 * appropriate TanStack Query keys so the UI refreshes in real-time.
 *
 * Falls back to a window-level 'websocket-event' CustomEvent if a global
 * WebSocket bridge is not available. This keeps the hook usable in test envs.
 */
export function useRescanWebSocket(enabled: boolean = true) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as WSEvent | undefined;
      if (!detail || !detail.type) return;
      switch (detail.type) {
        case 'rescan_requested':
        case 'rescan_approved':
        case 'rescan_verification_complete':
          qc.invalidateQueries({ queryKey: ['pending-verification'] });
          qc.invalidateQueries({ queryKey: ['tool-issues'] });
          qc.invalidateQueries({ queryKey: ['my-issues'] });
          qc.invalidateQueries({ queryKey: ['project-overview'] });
          if (detail.type === 'rescan_verification_complete') {
            qc.invalidateQueries({ queryKey: ['issue', detail.data.issue_id] });
          }
          break;
      }
    };

    window.addEventListener('websocket-event', handler);
    return () => window.removeEventListener('websocket-event', handler);
  }, [enabled, qc]);
}

export default useRescanWebSocket;
