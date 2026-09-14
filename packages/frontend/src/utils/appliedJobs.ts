/**
 * LocalStorage helpers for the "Did you apply?" feature.
 *
 * Two stores:
 *   - pendingApplyConfirmations: jobs the user clicked Apply on but hasn't confirmed yet
 *   - appliedJobs: job IDs the user has confirmed they applied to (anonymous fallback)
 */

const PENDING_KEY = 'ejg_pending_apply';
const APPLIED_KEY = 'ejg_applied_jobs';
const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — auto-expire stale pending items

export interface PendingItem {
  jobId: string;
  jobTitle: string;
  company: string;
  timestamp: number;
}

// ── Pending confirmations ─────────────────────────────────────────────────

export function getPendingConfirmations(): PendingItem[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const items: PendingItem[] = JSON.parse(raw);
    const now = Date.now();
    const fresh = items.filter(i => now - i.timestamp < STALE_MS);
    if (fresh.length !== items.length) {
      localStorage.setItem(PENDING_KEY, JSON.stringify(fresh));
    }
    return fresh;
  } catch { return []; }
}

export function addPendingConfirmation(item: PendingItem): void {
  try {
    const items = getPendingConfirmations();
    if (items.some(i => i.jobId === item.jobId)) return;
    items.push(item);
    localStorage.setItem(PENDING_KEY, JSON.stringify(items));
  } catch { /* localStorage full or unavailable */ }
}

export function removePendingConfirmation(jobId: string): void {
  try {
    const items = getPendingConfirmations();
    const filtered = items.filter(i => i.jobId !== jobId);
    localStorage.setItem(PENDING_KEY, JSON.stringify(filtered));
  } catch { /* ignore */ }
}

// ── Applied jobs (anonymous fallback) ─────────────────────────────────────

export function getLocalAppliedIds(): string[] {
  try {
    const raw = localStorage.getItem(APPLIED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addLocalAppliedId(jobId: string): void {
  try {
    const ids = getLocalAppliedIds();
    if (!ids.includes(jobId)) {
      ids.push(jobId);
      localStorage.setItem(APPLIED_KEY, JSON.stringify(ids));
    }
  } catch { /* ignore */ }
}