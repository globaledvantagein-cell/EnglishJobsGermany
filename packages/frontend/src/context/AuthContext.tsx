'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiPost, fetchUsageStats, clearUsageCache, STORAGE_KEY_TOKEN, STORAGE_KEY_USER } from '../utils/jobApi';
import { identifyUser, resetAnalytics } from '../utils/analytics';
import type { UsageStats } from '../types';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  avatarUrl?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  loginWithGoogle: (credential: string, acceptedTerms: boolean, extraBody?: Record<string, unknown>) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  /** Weekly usage counters + limits (null until first fetch / for anonymous). */
  usage: UsageStats | null;
  /** True for admins and users with an active premium subscription. */
  isPremium: boolean;
  /** Re-fetch usage/premium status (e.g. after redeeming a promo code). */
  refreshUsage: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [usage, setUsage] = useState<UsageStats | null>(null);

  // Fetch (or clear) usage stats. Force-bypasses the 60s cache so a fresh
  // premium status shows immediately after a promo redemption.
  const refreshUsage = useCallback(async () => {
    if (!localStorage.getItem(STORAGE_KEY_TOKEN)) { setUsage(null); return; }
    try {
      clearUsageCache();
      setUsage(await fetchUsageStats(true));
    } catch { /* non-critical — leave prior value */ }
  }, []);

  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
    const storedUser = localStorage.getItem(STORAGE_KEY_USER);

    // One-time migration from old unprefixed keys (kept transparent for existing users).
    if (!storedToken && !storedUser) {
      const oldToken = localStorage.getItem('token');
      const oldUser = localStorage.getItem('user');
      if (oldToken && oldUser) {
        localStorage.setItem(STORAGE_KEY_TOKEN, oldToken);
        localStorage.setItem(STORAGE_KEY_USER, oldUser);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(oldToken);
        try { setUser(JSON.parse(oldUser)); } catch { /* ignore */ }
        setIsLoading(false);
        return;
      }
    }

    if (storedToken && storedUser) {
      setToken(storedToken);
      try { setUser(JSON.parse(storedUser)); } catch { /* ignore corrupted */ }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem(STORAGE_KEY_TOKEN, newToken);
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const loginWithGoogle = useCallback(async (
    credential: string,
    acceptedTerms: boolean,
    extraBody: Record<string, unknown> = {},
  ) => {
    const res = await apiPost<{ token: string; user: User }>('/api/auth/google', {
      credential,
      acceptedTerms,
      ...extraBody,
    }, { noAuth: true });
    login(res.token, res.user);
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    clearUsageCache();
    resetAnalytics(); // clear PostHog identified state
    setToken(null);
    setUser(null);
    setUsage(null);
  }, []);

  // Pull usage/premium status whenever auth state settles or the token changes.
  useEffect(() => {
    if (token) { refreshUsage(); }
    else { setUsage(null); }
  }, [token, refreshUsage]);

  const isAdmin = user?.role === 'admin';

  // Identify the user to PostHog on login / token-restore. Re-runs when usage
  // resolves so isPremium is kept current as a person property.
  useEffect(() => {
    if (!user) return;
    identifyUser(user.id, {
      email: user.email,
      role: user.role,
      isPremium: isAdmin || (usage?.isPremium ?? false),
    });
  }, [user, usage, isAdmin]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    token,
    login,
    loginWithGoogle,
    logout,
    isAuthenticated: !!token,
    isAdmin,
    isLoading,
    usage,
    // Admins are always premium; otherwise defer to the usage endpoint.
    isPremium: isAdmin || (usage?.isPremium ?? false),
    refreshUsage,
  }), [user, token, login, loginWithGoogle, logout, isLoading, usage, isAdmin, refreshUsage]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}