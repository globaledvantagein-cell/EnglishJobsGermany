'use client';

/**
 * AppliedJobsContext — tracks which jobs the user has confirmed applying to.
 *
 * Authenticated users: synced to server via GET /api/jobs/applied-ids
 * Anonymous users: localStorage only (best-effort)
 *
 * Also manages the "pending confirmation" queue — jobs the user clicked Apply
 * on but hasn't confirmed yet. The Layout component reads this queue to show
 * the "Did you apply?" toast when the tab regains focus.
 */
import {
  createContext, useContext, useCallback, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { apiGet, apiPost } from '../utils/jobApi';
import {
  getPendingConfirmations,
  addPendingConfirmation,
  removePendingConfirmation,
  getLocalAppliedIds,
  addLocalAppliedId,
  type PendingItem,
} from '../utils/appliedJobs';

interface AppliedJobsContextValue {
  isApplied: (jobId: string) => boolean;
  addPending: (jobId: string, jobTitle: string, company: string) => void;
  pendingItems: PendingItem[];
  resolvePending: (jobId: string, confirmed: boolean) => void;
}

const AppliedJobsContext = createContext<AppliedJobsContextValue | null>(null);

export function AppliedJobsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [appliedIds, setAppliedIds] = useState<Set<string>>(() => new Set(getLocalAppliedIds()));
  const [pendingItems, setPendingItems] = useState<PendingItem[]>(() => getPendingConfirmations());

  // ── Fetch server-side applied IDs for authenticated users ──────────────
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    apiGet<{ ids: string[] }>('/api/jobs/applied-ids')
      .then(data => {
        if (data?.ids?.length) {
          setAppliedIds(prev => {
            const merged = new Set(prev);
            for (const id of data.ids) merged.add(id);
            return merged;
          });
        }
      })
      .catch(() => { /* silent — local IDs still work */ });
  }, [isAuthenticated, authLoading]);

  const isApplied = useCallback(
    (jobId: string) => appliedIds.has(jobId),
    [appliedIds]
  );

  const addPending = useCallback((jobId: string, jobTitle: string, company: string) => {
    if (appliedIds.has(jobId)) return;
    const item: PendingItem = { jobId, jobTitle, company, timestamp: Date.now() };
    addPendingConfirmation(item);
    setPendingItems(getPendingConfirmations());
  }, [appliedIds]);

  const resolvePending = useCallback((jobId: string, confirmed: boolean) => {
    removePendingConfirmation(jobId);
    setPendingItems(getPendingConfirmations());

    if (confirmed) {
      addLocalAppliedId(jobId);
      setAppliedIds(prev => new Set(prev).add(jobId));

      if (isAuthenticated) {
        apiPost(`/api/jobs/${jobId}/confirm-applied`, {}).catch(() => { /* silent */ });
      }
    }
  }, [isAuthenticated]);

  const value = useMemo(() => ({
    isApplied, addPending, pendingItems, resolvePending,
  }), [isApplied, addPending, pendingItems, resolvePending]);

  return (
    <AppliedJobsContext.Provider value={value}>
      {children}
    </AppliedJobsContext.Provider>
  );
}

export function useAppliedJobs(): AppliedJobsContextValue {
  const ctx = useContext(AppliedJobsContext);
  if (!ctx) throw new Error('useAppliedJobs must be used within AppliedJobsProvider');
  return ctx;
}