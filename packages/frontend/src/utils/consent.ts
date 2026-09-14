// Cookie/analytics consent — currently DISABLED, kept intact for re-enabling.
//
// Tracking is deliberately ungated: PostHog (including session replay) and GA4
// both run for every visitor from first paint, and the consent banner is not
// rendered (components/Providers.tsx). applyConsent() is therefore a no-op —
// nothing in the app changes behaviour based on a stored choice.
//
// Nothing here has been deleted, so restoring consent is a small, contained
// change:
//   1. Render <CookieConsent /> again in components/Providers.tsx.
//   2. Restore the applyConsent() body below (toggle PostHog
//      disable_session_recording, and gtag('consent','update',...) for GA4).
//   3. Re-add GA4 Consent Mode defaults (analytics_storage: 'denied') to the
//      gtag bootstrap in app/layout.tsx, and read the stored choice back in
//      components/PostHogInit.tsx.
//   4. Bump CONSENT_VERSION so every visitor is asked once.
//
// getConsent()/setConsent() still read and write the stored choice, so the
// footer "Cookie settings" entry point keeps working and any choice a visitor
// made previously is preserved — it simply has no effect while this is off.


/** Bump this when the cookie policy changes to re-prompt everyone once. */
export const CONSENT_VERSION = 1;

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

/** Persist a choice. Applying it is currently a no-op — see the file header. */
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

/**
 * No-op. Tracking is ungated, so a consent choice currently changes nothing —
 * neither PostHog nor GA4 is reconfigured. Kept (and still called by
 * setConsent) so restoring consent means filling this body back in rather than
 * rewiring call sites. See the file header for the full re-enable checklist.
 */
export function applyConsent(_choice: ConsentChoice): void {
  return;
}

/** Event name used by the footer "Cookie settings" link to reopen the banner. */
export const OPEN_COOKIE_SETTINGS_EVENT = 'ejg:open-cookie-settings';

export function openCookieSettings(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
