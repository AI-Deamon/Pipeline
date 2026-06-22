import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode, FC } from 'react';
import type { Role, Permissions } from '../types';

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

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return true;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: Role } | null>(null);

  // Check token expiry on mount and periodically
  useEffect(() => {
    if (token && isTokenExpired(token)) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('API_KEY');
      setToken(null);
      setRole(null);
      setPermissions(null);
      setCurrentUser(null);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic expiry check for mid-session expiration (T024)
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      if (isTokenExpired(token)) {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('API_KEY');
        setToken(null);
        window.location.href = '/login?reason=token-expired';
      }
    }, 60_000); // Check every minute

    return () => clearInterval(interval);
  }, [token]);

  const login = useCallback((newToken: string) => {
    sessionStorage.setItem('token', newToken);
    setToken(newToken);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const { api } = await import('../services/api');
      const user = await api.auth.me();
      setRole(user.role);
      setPermissions(user.permissions);
      setCurrentUser({ id: user.id, username: user.username, role: user.role });
    } catch {
      // Silently fail; user will be redirected on next protected request
    }
  }, [token]);

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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
