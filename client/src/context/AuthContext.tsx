import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { useServer } from './ServerContext';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password?: string) => Promise<void>;
  authenticate: (username: string, password?: string) => Promise<{ token: string; user: User }>;
  completeLogin: (data: { token: string; user: User }) => void;
  loginAsRole: (roleOrUsername: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('ama_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { fetchApi } = useServer();

  useEffect(() => {
    let isMounted = true;

    // Hard safety watchdog: isLoading must NEVER hang longer than 2.5s under any condition
    const safetyWatchdog = setTimeout(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    }, 2500);

    if (token) {
      refreshUser().finally(() => {
        if (isMounted) {
          clearTimeout(safetyWatchdog);
          setIsLoading(false);
        }
      });
    } else {
      clearTimeout(safetyWatchdog);
      setIsLoading(false);
    }

    return () => {
      isMounted = false;
      clearTimeout(safetyWatchdog);
    };
  }, [token]);

  const refreshUser = async () => {
    try {
      const data = await fetchApi<{ user: User }>('/api/auth/me', { timeoutMs: 2000 } as any);
      if (data && data.user) {
        setUser(data.user);
      } else {
        logout();
      }
    } catch (err) {
      logout();
    }
  };

  const authenticate = async (username: string, password?: string): Promise<{ token: string; user: User }> => {
    const data = await fetchApi<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      timeoutMs: 35000,
    });
    return data;
  };

  const completeLogin = (data: { token: string; user: User }) => {
    localStorage.setItem('ama_token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const login = async (username: string, password?: string) => {
    const data = await authenticate(username, password);
    completeLogin(data);
  };

  const loginAsRole = async (roleOrUsername: string) => {
    const data = await fetchApi<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: roleOrUsername, role: roleOrUsername }),
    });

    localStorage.setItem('ama_token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('ama_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        authenticate,
        completeLogin,
        loginAsRole,
        logout,
        isLoading,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
