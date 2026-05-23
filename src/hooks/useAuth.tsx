import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode, FC } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isLoading: boolean;
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

  // Check token expiry on mount and periodically
  useEffect(() => {
    if (token && isTokenExpired(token)) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('API_KEY');
      setToken(null);
    }
    setIsLoading(false);
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

  const login = (newToken: string) => {
    sessionStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const logout = useCallback(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('API_KEY');
    setToken(null);
  }, []);

  const value: AuthContextType = {
    isAuthenticated: !!token,
    token,
    login,
    logout,
    isLoading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
