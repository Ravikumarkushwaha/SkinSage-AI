import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import type { User } from "@/services/api";
import * as api from "@/services/api";

const TOKEN_KEY = "dermai_token";
const USER_KEY = "dermai_user";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (emailOrUsername: string, password: string) => Promise<void>;
  signup: (email: string, username: string, password: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserSettings: (settings: Partial<NonNullable<User["settings"]>>) => Promise<void>;
  logout: () => void;
  isReady: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    const u = localStorage.getItem(USER_KEY);
    if (t && u) {
      try {
        setToken(t);
        setUser(JSON.parse(u));
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setIsReady(true);
  }, []);

  const login = useCallback(async (emailOrUsername: string, password: string) => {
    const { token: t, user: u } = await api.login(emailOrUsername, password);
    setToken(t);
    setUser(u);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  }, []);

  const signup = useCallback(async (email: string, username: string, password: string) => {
    const { token: t, user: u } = await api.signup(email, username, password);
    setToken(t);
    setUser(u);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const latest = await api.getMe(token);
    setUser(latest);
    localStorage.setItem(USER_KEY, JSON.stringify(latest));
  }, [token]);

  const updateUserSettings = useCallback(async (settings: Partial<NonNullable<User["settings"]>>) => {
    if (!token) throw new Error("Login required");
    const updatedUser = await api.updateSettings(token, settings);
    setUser(updatedUser);
    localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
  }, [token]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, signup, refreshUser, updateUserSettings, logout, isReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
