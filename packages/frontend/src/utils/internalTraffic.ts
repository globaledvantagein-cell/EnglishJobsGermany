// Keeps our own testing out of Google Analytics, PostHog and Clarity.
//
// Filtering in the vendors' dashboards only hides internal data after it was
// sent (PostHog's "Filter out internal and test users" still ingests it), so
// instead the trackers are never started when:
//   - the page isn't served from a production host (localhost, LAN IP, a
//     preview build) — NEXT_PUBLIC_ANALYTICS_HOSTS lists the allowed hosts;
//   - this device is marked internal. That happens automatically when an
//     admin signs in (AuthContext), and by hand by opening any page with
//     ?ejg_internal=1 (undo with ?ejg_internal=0) — for test phones and
//     teammates without an admin account. The mark survives logout.
//
// utils/tracking.ts checks isTrackingAllowed() before loading anything.

const INTERNAL_KEY = 'ejg_internal';
const URL_PARAM = 'ejg_internal';

const PRODUCTION_HOSTS = (process.env.NEXT_PUBLIC_ANALYTICS_HOSTS || 'englishjobsgermany.com,www.englishjobsgermany.com')
  .split(',')
  .map(host => host.trim().toLowerCase())
  .filter(Boolean);

/** True when this device was marked as ours (admin login or ?ejg_internal=1). */
export function isInternalDevice(): boolean {
  try {
    return localStorage.getItem(INTERNAL_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mark or unmark this device as internal. */
export function setInternalDevice(internal: boolean): void {
  try {
    if (internal) localStorage.setItem(INTERNAL_KEY, '1');
    else localStorage.removeItem(INTERNAL_KEY);
  } catch { /* storage blocked: nothing to persist */ }
}

/**
 * Applies ?ejg_internal=1 / ?ejg_internal=0 from the current URL, then removes
 * the parameter so it isn't shared or bookmarked. Returns the new state, or
 * null when the URL didn't carry the parameter.
 */
export function applyInternalFlagFromUrl(): boolean | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const value = url.searchParams.get(URL_PARAM);
  if (value !== '1' && value !== '0') return null;
  setInternalDevice(value === '1');
  url.searchParams.delete(URL_PARAM);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  return value === '1';
}

/** Analytics may load only on a production host, on a device that isn't ours. */
export function isTrackingAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  return PRODUCTION_HOSTS.includes(window.location.hostname.toLowerCase()) && !isInternalDevice();
}
