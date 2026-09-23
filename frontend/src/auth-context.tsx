import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { api, setAuthToken } from "./api";
import { saveToken, loadToken, clearToken } from "./token-store";

WebBrowser.maybeCompleteAuthSession();

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
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState>({
  loading: true,
  user: null,
  signIn: async () => {},
  signInWithEmail: async () => {},
  signOut: async () => {},
  refresh: async () => {},
});

const sentSessionIds = new Set<string>();

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const doExchange = useCallback(async (sid: string) => {
    if (sentSessionIds.has(sid)) return;
    sentSessionIds.add(sid);
    try {
      const res = await api.createSession(sid);
      setAuthToken(res.session_token);
      await saveToken(res.session_token);
      setUser(res.user);
    } catch (e) {
      console.error("session exchange failed", e);
    }
  }, []);

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
    const sub = Linking.addEventListener("url", ({ url }) => {
      const sid = extractSessionId(url);
      if (sid) doExchange(sid);
      else setPendingUrl(url);
    });
    return () => sub.remove();
  }, [doExchange]);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") {
          const href = window.location.href;
          const sid = extractSessionId(href);
          if (sid) {
            await doExchange(sid);
            try {
              const url = new URL(href);
              url.hash = "";
              url.searchParams.delete("session_id");
              window.history.replaceState(window.history.state, "", url.toString());
            } catch {}
            setLoading(false);
            return;
          }
        } else {
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) {
            await doExchange(sid);
            setLoading(false);
            return;
          }
        }

        const stored = await loadToken();
        if (stored) {
          setAuthToken(stored);
          await refresh();
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [doExchange, refresh]);

  useEffect(() => {
    if (pendingUrl) setPendingUrl(null);
  }, [pendingUrl]);

  const signIn = useCallback(async () => {
    const redirectUrl = Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    let url: string | null = null;
    if (result.type === "success" && (result as any).url) url = (result as any).url;
    let sid = extractSessionId(url);
    if (!sid) {
      const initial = await Linking.getInitialURL();
      sid = extractSessionId(initial);
    }
    if (sid) await doExchange(sid);
  }, [doExchange]);

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

  const value = useMemo(() => ({ loading, user, signIn, signInWithEmail, signOut, refresh }), [loading, user, signIn, signInWithEmail, signOut, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
