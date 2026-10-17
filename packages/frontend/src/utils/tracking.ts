// Analytics loaders, run ONLY after the visitor accepts cookies.
//
// Before a choice, and after "Only necessary", neither Google Analytics nor
// PostHog is loaded: no script, no cookies, no localStorage ids, no requests.
// German law (TTDSG §25) requires consent before any non-essential storage on
// the visitor's device, and session recordings additionally need GDPR consent.
// utils/consent.ts decides when these run; nothing else should call them.

import posthog from 'posthog-js';

const GA_MEASUREMENT_ID = 'G-3WM8L7XDH7';
const POSTHOG_TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

let posthogStarted = false;
let gaStarted = false;

/** Start PostHog (pageviews, clicks, session recordings). Idempotent. */
export function startPostHog(): void {
  if (typeof window === 'undefined' || !POSTHOG_TOKEN) return;
  if (posthogStarted) {
    // Re-accepting after a reject in the same session.
    posthog.set_config({ disable_persistence: false });
    posthog.opt_in_capturing();
    posthog.startSessionRecording();
    return;
  }
  posthogStarted = true;
  posthog.init(POSTHOG_TOKEN, {
    api_host: POSTHOG_HOST,
    persistence: 'localStorage',
    person_profiles: 'identified_only',
    // 'history_change' fires $pageview on every client-side navigation, which
    // the App Router needs; `true` would only capture the first load.
    capture_pageview: 'history_change',
    capture_pageleave: true,
    autocapture: true,
    disable_session_recording: false,
    session_recording: { recordHeaders: false, recordBody: false },
    opt_in_site_apps: true,
  });
}

/** Inject the GA4 tag and send the initial page_view. Idempotent. */
export function startGoogleAnalytics(): void {
  if (typeof window === 'undefined') return;
  if (gaStarted) {
    (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
    window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
    return;
  }
  gaStarted = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js expects the arguments object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/**
 * Withdraw consent mid-session: stop PostHog capture and recording, tell GA to
 * stop using storage, and delete the analytics data already on the device.
 */
export function stopTracking(): void {
  if (typeof window === 'undefined') return;
  if (posthogStarted) {
    try {
      posthog.stopSessionRecording();
      posthog.opt_out_capturing();
      // Without this, PostHog re-saves its state to localStorage after we
      // delete it below.
      posthog.set_config({ disable_persistence: true });
    } catch { /* never break the page over analytics */ }
  }
  window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  // GA's documented kill switch: window['ga-disable-<measurement id>'] = true.
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = true;

  // GA cookies: _ga, _ga_<id>, _gid, _gat. Expire them on this host and the
  // parent domain (GA sets them on the registrable domain).
  const host = window.location.hostname;
  const domains = ['', host, `.${host.split('.').slice(-2).join('.')}`];
  document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(name => /^_g(a|id|at)/.test(name)).forEach(name => {
    domains.forEach(domain => {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
    });
  });
  // Deferred one tick so any write PostHog queued during opt-out lands first.
  window.setTimeout(() => {
    try {
      Object.keys(localStorage).filter(key => key.startsWith('ph_')).forEach(key => localStorage.removeItem(key));
    } catch { /* storage blocked */ }
  }, 0);
}
