'use client';

// PostHog client-side initialization — runs in an effect, i.e. AFTER React has
// hydrated. It used to live in instrumentation-client.ts, which executes when
// the client bundle loads (pre-hydration): posthog.init() injects its
// array.js / site-app <script> tags into the DOM immediately, and those nodes
// landed in front of the JSON-LD <script>s at the top of <body>, so React
// paired the wrong nodes during hydration and warned on every page load.
//
// Tracking posture — DELIBERATELY UNGATED (see utils/consent.ts). Everything
// is on for every visitor from first paint; the consent banner is not rendered
// and applyConsent() is a no-op:
//   - persistence: 'localStorage' — the anonymous distinct id survives a tab
//     close (in-memory persistence lost ~95% of it).
//   - person_profiles: 'identified_only' — anonymous visitors still get NO
//     person profile. A profile is created only when we call
//     posthog.identify() on login (utils/analytics.ts).
//   - opt_out_capturing_by_default: false — pageviews/clicks captured
//     immediately, no opt-in step.
//   - disable_session_recording: false — session replay runs for everyone.
//     This is the piece that would normally require consent under GDPR; it is
//     ungated by explicit decision. recordHeaders/recordBody stay false so
//     request payloads are never captured.

import { useEffect } from 'react';
import posthog from 'posthog-js';

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

let initialized = false;

export default function PostHogInit() {
  useEffect(() => {
    // Skip silently when the token is absent (e.g. local dev without a key) —
    // posthog.capture() then no-ops behind the guard in utils/analytics.ts.
    if (initialized || !token) return;
    initialized = true;

    posthog.init(token, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
      persistence: 'localStorage',
      person_profiles: 'identified_only',
      opt_out_capturing_by_default: false,
      // 'history_change' makes PostHog fire $pageview on every client-side
      // navigation (next/link pushState), not just the first server render —
      // required for the App Router. Plain `true` would only capture the
      // initial load.
      capture_pageview: 'history_change',
      capture_pageleave: true,
      autocapture: true,
      disable_session_recording: false,
      session_recording: { recordHeaders: false, recordBody: false },
      opt_in_site_apps: true,
    });
  }, []);

  return null;
}
