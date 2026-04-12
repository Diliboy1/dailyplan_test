"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  apiFormPost,
  apiPost,
} from "@/lib/api";
import type { Token, UserRead } from "@/lib/types";

type AuthContextValue = {
  user: UserRead | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function parseUserIdFromToken(token: string): number | null {
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) {
      return null;
    }
    const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const payloadString = atob(normalized);
    const payload = JSON.parse(payloadString) as { sub?: string };
    if (!payload.sub) {
      return null;
    }
    const id = Number(payload.sub);
    return Number.isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserRead | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem(AUTH_TOKEN_KEY);
    const savedUser = localStorage.getItem(AUTH_USER_KEY);

    if (savedToken) {
      setToken(savedToken);
    }
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser) as UserRead);
      } catch {
        localStorage.removeItem(AUTH_USER_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const persistAuth = useCallback((nextToken: string, nextUser: UserRead) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem(AUTH_TOKEN_KEY, nextToken);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(nextUser));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const formData = new URLSearchParams();
      formData.set("username", email);
      formData.set("password", password);
      const tokenData = await apiFormPost<Token>("/api/auth/login", formData);

      const parsedId = parseUserIdFromToken(tokenData.access_token) ?? 0;
      const nextUser: UserRead = {
        id: parsedId,
        email,
        created_at: new Date().toISOString(),
      };
      persistAuth(tokenData.access_token, nextUser);
    },
    [persistAuth],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await apiPost<UserRead>("/api/auth/register", { email, password });
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    router.push("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      isLoading,
      login,
      register,
      logout,
    }),
    [user, token, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
