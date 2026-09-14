'use client';

/**
 * SavedJobsContext — tracks which jobs the user has bookmarked.
 *
 * Authenticated only. Saving is a per-account action (the backend stores it
 * on the user doc), so unlike AppliedJobsContext there is no localStorage
 * fallback for anonymous visitors — isSaved() simply returns false for them.
 *
 * toggleSave() updates local state optimistically and rolls back if the
 * request fails, so the bookmark icon never lies about what the server holds.
 */
import {
  createContext, useContext, useCallback, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { apiGet, apiPost, apiDelete } from '../utils/jobApi';

interface SavedJobsContextValue {
  isSaved: (jobId: string) => boolean;
  toggleSave: (jobId: string) => Promise<void>;
  savedIds: Set<string>;
  /** Bumped after every successful toggle so pages can refetch the saved list. */
  savedVersion: number;
}

const SavedJobsContext = createContext<SavedJobsContextValue | null>(null);

export function SavedJobsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [savedVersion, setSavedVersion] = useState(0);

  // ── Hydrate from the server for authenticated users ────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setSavedIds(new Set());
      return;
    }
    apiGet<{ ids: string[] }>('/api/jobs/saved-ids')
      .then(data => setSavedIds(new Set(data?.ids || [])))
      .catch(() => { /* silent — bookmarks just render as unsaved */ });
  }, [isAuthenticated, authLoading]);

  const isSaved = useCallback(
    (jobId: string) => savedIds.has(jobId),
    [savedIds]
  );

  const toggleSave = useCallback(async (jobId: string) => {
    if (!isAuthenticated) return;

    const wasSaved = savedIds.has(jobId);

    // Optimistic — flip immediately so the icon feels instant.
    setSavedIds(prev => {
      const next = new Set(prev);
      if (wasSaved) next.delete(jobId);
      else next.add(jobId);
      return next;
    });

    try {
      if (wasSaved) await apiDelete(`/api/jobs/${jobId}/save`);
      else await apiPost(`/api/jobs/${jobId}/save`, {});
      setSavedVersion(v => v + 1);
    } catch {
      // Roll back to the real state on failure.
      setSavedIds(prev => {
        const next = new Set(prev);
        if (wasSaved) next.add(jobId);
        else next.delete(jobId);
        return next;
      });
    }
  }, [isAuthenticated, savedIds]);

  const value = useMemo(() => ({
    isSaved, toggleSave, savedIds, savedVersion,
  }), [isSaved, toggleSave, savedIds, savedVersion]);

  return (
    <SavedJobsContext.Provider value={value}>
      {children}
    </SavedJobsContext.Provider>
  );
}

export function useSavedJobs(): SavedJobsContextValue {
  const ctx = useContext(SavedJobsContext);
  if (!ctx) throw new Error('useSavedJobs must be used within SavedJobsProvider');
  return ctx;
}