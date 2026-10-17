// Cookie/analytics consent.
//
// Nothing non-essential runs until the visitor accepts: Google Analytics and
// PostHog (including session recordings) are only loaded by applyConsent
// ('accepted'). "Only necessary" — or no answer yet — means neither is loaded.
// The choice is stored per device; the footer "Cookie settings" link reopens
// the banner to change it, and withdrawing stops tracking immediately.
//
// The loaders live in utils/tracking.ts. components/TrackingInit.tsx applies a
// stored choice on page load; components/CookieConsent.tsx asks for one.

import { startGoogleAnalytics, startPostHog, stopTracking } from './tracking';

/** Bump this when the cookie policy changes to re-prompt everyone once. */
// v2: tracking became consent-gated, so earlier answers (which changed
// nothing) are discarded and everyone is asked once.
export const CONSENT_VERSION = 2;

const STORAGE_KEY = 'ejg_cookie_consent';

export type ConsentChoice = 'accepted' | 'rejected';

export interface StoredConsent {
  version: number;
  choice: ConsentChoice;
  timestamp: string;
}

/** The current stored consent, or null if never answered / version outdated. */
export function getConsent(): StoredConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed?.version !== CONSENT_VERSION) return null; // policy changed → re-ask
    if (parsed.choice !== 'accepted' && parsed.choice !== 'rejected') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist a choice and apply it immediately. */
export function setConsent(choice: ConsentChoice): void {
  if (typeof window === 'undefined') return;
  try {
    const stored: StoredConsent = { version: CONSENT_VERSION, choice, timestamp: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* storage full/blocked — still apply for this session */
  }
  applyConsent(choice);
}

/** Start or stop analytics to match a choice. */
export function applyConsent(choice: ConsentChoice): void {
  if (choice === 'accepted') {
    startPostHog();
    startGoogleAnalytics();
  } else {
    stopTracking();
  }
}

/** On page load: start analytics only if this device already accepted. */
export function applyStoredConsent(): void {
  if (getConsent()?.choice === 'accepted') applyConsent('accepted');
}

/** Event name used by the footer "Cookie settings" link to reopen the banner. */
export const OPEN_COOKIE_SETTINGS_EVENT = 'ejg:open-cookie-settings';

export function openCookieSettings(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
