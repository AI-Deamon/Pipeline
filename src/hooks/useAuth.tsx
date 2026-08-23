import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode, FC } from 'react';
import type { Role, Permissions } from '../types';
import { isLegacyAuthGracePeriodActive } from '../utils/authGracePeriod';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  role: Role | null;
  permissions: Permissions | null;
  currentUser: { id: string; username: string; role: Role } | null;
  login: (token: string) => void;
  logout: () => void;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  refreshAccessToken?: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    const legacy = sessionStorage.getItem('token');
    if (!legacy) {
      return null;
    }
    if (isLegacyAuthGracePeriodActive()) {
      console.warn('[auth] SessionStorage token detected — grace period active, will be removed after migration window closes.');
      return legacy;
    }
    // Grace period has expired: stop honoring the legacy token entirely.
    sessionStorage.removeItem('token');
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: Role } | null>(null);

  // Check token expiry on mount
  useEffect(() => {
    // For cookie-based auth, we rely on the backend to reject expired tokens.
    // No client-side expiry check needed — the httpOnly cookie handles it.
    setIsLoading(false);
  }, []);

  const login = useCallback((newToken: string) => {
    // Only write the legacy sessionStorage copy while the migration grace period is
    // still open; once it closes, the httpOnly cookie set by the backend is the only
    // credential store, and never writing here removes an XSS-readable copy entirely.
    if (isLegacyAuthGracePeriodActive()) {
      sessionStorage.setItem('token', newToken);
    }
    setToken(newToken);
  }, []);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setToken(data.access_token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const refreshUser = useCallback(async (retriesLeft = 2): Promise<void> => {
    try {
      const { api } = await import('../services/api');
      const user = await api.auth.me();
      setRole(user.role);
      setPermissions(user.permissions);
      setCurrentUser({ id: user.id, username: user.username, role: user.role });
    } catch (err) {
      // A 401 is a real auth failure — the response interceptor already handles the
      // redirect, so there's nothing to retry. For transient errors (network blip,
      // 5xx), retry with backoff so role/permissions don't get stuck null and leave
      // role-gated UI incorrectly locked out until a manual refresh.
      const status = (err as { status?: number })?.status;
      if (status === 401) return;
      if (retriesLeft > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (3 - retriesLeft)));
        return refreshUser(retriesLeft - 1);
      }
      console.error('[auth] Failed to load user info after retries:', err);
    }
  }, []);

  // Load user info on mount when token exists
  useEffect(() => {
    if (token) {
      refreshUser();
    }
  }, [token, refreshUser]);

  const logout = useCallback(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('API_KEY');
    setToken(null);
    setRole(null);
    setPermissions(null);
    setCurrentUser(null);
    // The access/refresh cookies are httpOnly — document.cookie cannot read or clear
    // them at all, so client state alone was never enough (finding #13). Clear them
    // server-side via /auth/logout; fire-and-forget so a network hiccup doesn't block
    // the user from being logged out of the UI immediately.
    fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  const value: AuthContextType = {
    isAuthenticated: !!token,
    token,
    role,
    permissions,
    currentUser,
    login,
    logout,
    isLoading,
    refreshUser,
    refreshAccessToken: refreshToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
