'use client';

/**
 * Measures how long a visitor actively reads a job page and reports it as
 * `job_read_time` analytics events: one each time the tab is hidden (the
 * only exit signal mobile browsers fire reliably) and one when they leave the
 * job. Each carries the seconds since the previous one plus a `view_id`, so
 * time per job view = SUM(active_seconds) GROUP BY view_id — switching tabs
 * and coming back keeps adding to the same view.
 *
 * "Active" follows the engaged-time model used by GA4 (foreground time) and
 * Chartbeat (recent interaction): a second counts only while the tab is
 * visible AND the reader scrolled, moved the pointer, typed or touched in the
 * last IDLE_MS. A tab left open in the background, or a walk away from the
 * desk, doesn't inflate the number.
 *
 * Like every event it goes through track(), so it is only sent with analytics
 * consent and never from our own testing (utils/internalTraffic.ts).
 */
import { useEffect } from 'react';
import { track } from '../utils/analytics';

const TICK_MS = 1000;
const IDLE_MS = 15_000;
/** Longer is almost certainly a forgotten tab; cap so averages stay honest. */
const MAX_SECONDS = 30 * 60;
const ACTIVITY_EVENTS = ['scroll', 'pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

export function useJobReadTime(jobId: string, vertical: 'germany' | 'remote'): void {
  useEffect(() => {
    if (!jobId) return;
    const viewId = `${jobId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    let total = 0;
    let unsent = 0;
    let lastActivity = Date.now();

    const markActive = () => { lastActivity = Date.now(); };
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastActivity < IDLE_MS && total < MAX_SECONDS) {
        total += 1;
        unsent += 1;
      }
    }, TICK_MS);

    const send = () => {
      if (unsent === 0) return;
      track('job_read_time', { job_id: jobId, vertical, view_id: viewId, active_seconds: unsent }, { beacon: true });
      unsent = 0;
    };
    // pagehide covers tab close / reload on desktop; unmount covers in-app navigation.
    const onHide = () => { if (document.visibilityState === 'hidden') send(); };

    ACTIVITY_EVENTS.forEach(name => window.addEventListener(name, markActive, { passive: true }));
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', send);
    return () => {
      window.clearInterval(tick);
      ACTIVITY_EVENTS.forEach(name => window.removeEventListener(name, markActive));
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', send);
      send();
    };
  }, [jobId, vertical]);
}
