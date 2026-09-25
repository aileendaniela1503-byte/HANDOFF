import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

import { api, setAuthToken } from "./api";
import { saveToken, loadToken, clearToken } from "./token-store";

type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  subscription_tier: string;
};

type AuthState = {
  loading: boolean;
  user: User | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState>({
  loading: true,
  user: null,
  signInWithEmail: async () => {},
  signOut: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
      setAuthToken(null);
      await clearToken();
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await loadToken();
        if (stored) {
          setAuthToken(stored);
          await refresh();
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setAuthToken(res.session_token);
    await saveToken(res.session_token);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {}
    setAuthToken(null);
    await clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ loading, user, signInWithEmail, signOut, refresh }),
    [loading, user, signInWithEmail, signOut, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
