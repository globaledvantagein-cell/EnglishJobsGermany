// Analytics loaders, run ONLY after the visitor accepts cookies.
//
// Before a choice, and after "Only necessary", none of Google Analytics,
// PostHog or Microsoft Clarity is loaded: no script, no cookies, no
// localStorage ids, no requests. German law (TTDSG §25) requires consent
// before any non-essential storage on the visitor's device, and session
// recordings additionally need GDPR consent. utils/consent.ts decides when
// these run; nothing else should call them.
//
// Each tool is configured by its own NEXT_PUBLIC_* id. Next.js inlines these
// at BUILD time, so they must be in the server's frontend .env before
// `next build`; an unset id turns that tool off. Our own testing never loads
// any of them (utils/internalTraffic.ts).

import posthog from 'posthog-js';
import { isTrackingAllowed } from './internalTraffic';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const POSTHOG_TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';
const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

let posthogStarted = false;
let gaStarted = false;
let clarityStarted = false;

/** Start PostHog (pageviews, clicks, session recordings). Idempotent. */
export function startPostHog(): void {
  if (!POSTHOG_TOKEN || !isTrackingAllowed()) return;
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
  if (!GA_MEASUREMENT_ID || !isTrackingAllowed()) return;
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
 * Inject Microsoft Clarity (heatmaps, session recordings) and pass the
 * visitor's consent with Clarity's Consent API v2 — required for EEA visitors
 * since 31 Oct 2025, otherwise Clarity runs in a cookieless "no consent" mode.
 * Only analytics storage is granted: we run no ads. Idempotent.
 */
export function startClarity(): void {
  if (!CLARITY_PROJECT_ID || !isTrackingAllowed()) return;
  if (!clarityStarted) {
    clarityStarted = true;
    // Microsoft's install snippet: queue calls until the tag loads.
    window.clarity = window.clarity || function clarity(...args: unknown[]) {
      (window.clarity!.q = window.clarity!.q || []).push(args);
    };
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
    document.head.appendChild(script);
  }
  window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
}

/**
 * Withdraw consent mid-session (or mark the device internal): stop PostHog
 * capture and recording, tell GA and Clarity to stop using storage, and delete
 * the analytics data already on the device.
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
  // Denying analytics storage makes Clarity delete its cookies and end the session.
  window.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
  window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  // GA's documented kill switch: window['ga-disable-<measurement id>'] = true.
  if (GA_MEASUREMENT_ID) (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = true;

  // GA cookies: _ga, _ga_<id>, _gid, _gat; Clarity: _clck, _clsk (covers a
  // page where Clarity isn't loaded to hear the deny). Expire them on this host
  // and the parent domain (both set them on the registrable domain).
  const host = window.location.hostname;
  const domains = ['', host, `.${host.split('.').slice(-2).join('.')}`];
  document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(name => /^(_g(a|id|at)|_cl(ck|sk))/.test(name)).forEach(name => {
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
