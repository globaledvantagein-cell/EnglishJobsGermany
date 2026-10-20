'use client';

/**
 * Kill switches, frontend side (see KILL_SWITCHES.md at the repo root).
 *
 * One switch per feature lives in the backend (`backend/src/features`). The
 * same switch that makes the API answer 503 FEATURE_DISABLED also hides or
 * pauses the UI here:
 *
 *   const on = useFeature('smartMatch');        // in components
 *   if (!isFeatureOn('applyTracking')) return;   // in plain functions
 *   export default withFeature('smartMatch', SmartMatch, <FeaturePaused … />);
 *
 * FAIL-OPEN: until /api/features answers (SSR, first paint, network error)
 * every feature counts as ON, so SEO HTML and hydration never change.
 * Polls every minute and on tab focus, so a flip reaches open tabs quickly.
 */
import { useSyncExternalStore } from 'react';

// Mirrors backend/src/features/featureRegistry.js (keys with a UI side).
export type FeatureKey =
  | 'smartMatch' | 'todayMatches' | 'resumeUpload' | 'matchFeedback' | 'jobPreferences'
  | 'googleLogin' | 'emailSignup' | 'promoCodes'
  | 'savedJobs' | 'applyTracking' | 'remoteJobs' | 'searchAutocomplete'
  | 'feedbackWidget'
  | 'cronValidator'
  | 'adminMaintenance' | 'adminSubscribers';

const POLL_MS = 60_000;

let features: Partial<Record<FeatureKey, boolean>> = {};
const listeners = new Set<() => void>();
let started = false;

async function refresh() {
  try {
    const res = await fetch('/api/features', { cache: 'no-store' });
    if (!res.ok) return;
    const next = (await res.json()).features ?? {};
    if (JSON.stringify(next) === JSON.stringify(features)) return;
    features = next;
    listeners.forEach(fn => fn());
  } catch { /* fail-open: keep last known state */ }
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void refresh();
  window.setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
  window.addEventListener('focus', () => void refresh());
}

function subscribe(fn: () => void) {
  start();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Non-hook read for event handlers and API helpers. */
export function isFeatureOn(key: FeatureKey): boolean {
  start();
  return features[key] !== false;
}

/** Re-poll now — call after an admin flip so this tab updates instantly. */
export const refreshFeatures = refresh;

export function useFeature(key: FeatureKey): boolean {
  return useSyncExternalStore(subscribe, () => features[key] !== false, () => true);
}
