import { renderHook, waitFor } from '@testing-library/react';
import { vi, afterEach, test, expect, describe } from 'vitest';
import { AuthProvider, useAuth } from '../../hooks/useAuth';

/**
 * Regression test: a hard page reload has no legacy sessionStorage token, but
 * the backend's httpOnly access/refresh cookies are still valid. AuthProvider
 * must bootstrap the session from those cookies via /auth/refresh before
 * settling isLoading — otherwise ProtectedRoute sees isAuthenticated=false and
 * redirects to /login even though the user has a live session.
 */
describe('AuthProvider session bootstrap on mount', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    sessionStorage.clear();
  });

  test('restores isAuthenticated from a valid refresh cookie when no legacy token exists', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'restored-token' }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('restored-token');
  });

  test('stays logged out when there is no valid refresh cookie', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
  });
});
