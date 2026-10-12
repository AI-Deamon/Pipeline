import { renderHook, waitFor } from '@testing-library/react';
import { vi, afterEach, test, expect, describe } from 'vitest';
import { AuthProvider, useAuth } from '../../hooks/useAuth';

describe('AuthProvider mount hydration', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test('hydrates isAuthenticated from a valid httpOnly refresh cookie on a fresh page load', async () => {
    // No legacy sessionStorage token — this is the post-grace-period, cookie-only state.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-access-token' }),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/auth/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('new-access-token');
  });

  test('leaves user logged out when there is no valid refresh cookie', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
  });
});
