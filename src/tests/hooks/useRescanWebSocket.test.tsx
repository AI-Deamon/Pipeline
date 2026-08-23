import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, afterEach, beforeEach, test, expect, describe } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRescanWebSocket } from '../../hooks/useRescanWebSocket';

/**
 * Regression test for #57: PendingVerificationPage's "Live/Offline" indicator
 * was hardcoded to `useState(true)` with the setter never called — it kept
 * showing "Live" even when the socket was actually disconnected. The hook now
 * tracks and returns the real connection state.
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor() {
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useRescanWebSocket connection state', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    // @ts-expect-error test mock, minimal shape
    globalThis.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  test('reports connected: false before the socket opens', () => {
    const { result } = renderHook(() => useRescanWebSocket(true), { wrapper: createWrapper() });
    expect(result.current.connected).toBe(false);
  });

  test('reports connected: true after onopen fires', async () => {
    const { result } = renderHook(() => useRescanWebSocket(true), { wrapper: createWrapper() });

    await act(async () => {
      MockWebSocket.instances[0].onopen?.();
    });

    await waitFor(() => expect(result.current.connected).toBe(true));
  });

  test('reports connected: false again after the socket closes', async () => {
    const { result } = renderHook(() => useRescanWebSocket(true), { wrapper: createWrapper() });

    await act(async () => {
      MockWebSocket.instances[0].onopen?.();
    });
    await waitFor(() => expect(result.current.connected).toBe(true));

    await act(async () => {
      MockWebSocket.instances[0].onclose?.();
    });
    await waitFor(() => expect(result.current.connected).toBe(false));
  });
});
