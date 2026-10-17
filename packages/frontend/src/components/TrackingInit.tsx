'use client';

// Applies a stored cookie choice on page load: if this device accepted,
// start Google Analytics + PostHog; otherwise load nothing. First-time
// visitors are asked by <CookieConsent />. See utils/consent.ts.
//
// Runs in an effect (after hydration) on purpose: the analytics libraries
// inject <script> tags, and doing that before hydration put them in front of
// the JSON-LD <script>s and made React warn on every page load.

import { useEffect } from 'react';
import { applyStoredConsent } from '../utils/consent';

export default function TrackingInit() {
  useEffect(() => { applyStoredConsent(); }, []);
  return null;
}
