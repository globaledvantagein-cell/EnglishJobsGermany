'use client';

// Applies a stored cookie choice on page load: if this device accepted,
// start Google Analytics, PostHog and Clarity; otherwise load nothing.
// First-time visitors are asked by <CookieConsent />. See utils/consent.ts.
// A ?ejg_internal=1 link marks this device as ours first, so testing is never
// tracked (utils/internalTraffic.ts).
//
// Runs in an effect (after hydration) on purpose: the analytics libraries
// inject <script> tags, and doing that before hydration put them in front of
// the JSON-LD <script>s and made React warn on every page load.

import { useEffect } from 'react';
import { applyStoredConsent } from '../utils/consent';
import { applyInternalFlagFromUrl } from '../utils/internalTraffic';

export default function TrackingInit() {
  useEffect(() => {
    applyInternalFlagFromUrl();
    applyStoredConsent();
  }, []);
  return null;
}
