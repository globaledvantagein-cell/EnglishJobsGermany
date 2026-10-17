// Thin, SSR-safe wrappers around posthog-js. PostHog is started only after
// cookie consent (utils/tracking.ts); until then — or if the visitor declined —
// every helper here is a silent no-op. Errors are swallowed so analytics can
// never break the UX. Import { track } from here instead of calling posthog
// directly.

import posthog from 'posthog-js';

/** True once PostHog was started (after consent) and capture isn't opted out. */
const isActive = () => typeof window !== 'undefined' && posthog.__loaded && !posthog.has_opted_out_capturing();

/** Capture a custom event. No-ops on the server or without analytics consent. */
export function track(event: string, properties?: Record<string, unknown>): void {
  if (!isActive()) return;
  try {
    posthog.capture(event, properties);
  } catch {
    /* analytics must never throw into product code */
  }
}

/**
 * Associate the current session with a user id + person properties. Called on
 * login only — this is what creates the PostHog person profile
 * (person_profiles: 'identified_only'). Like everything else it only runs
 * once the visitor has accepted analytics cookies.
 */
export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
  if (!isActive()) return;
  try {
    posthog.identify(userId, properties);
  } catch {
    /* ignore */
  }
}

/**
 * Clear the identified state. Call on logout ONLY — never on consent
 * rejection: anonymous capture continues either way.
 */
export function resetAnalytics(): void {
  if (typeof window === 'undefined' || !posthog.__loaded) return;
  try {
    posthog.reset();
  } catch {
    /* ignore */
  }
}
