'use client';

import { Suspense, type ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AuthProvider } from '../context/AuthContext';
import { AppliedJobsProvider } from '../context/AppliedJobsContext';
import { SavedJobsProvider } from '../context/SavedJobsContext';
import TrackingInit from './TrackingInit';
import ViewportChromeInset from './ViewportChromeInset';
import CookieConsent from './CookieConsent';
import GAPageView from './GAPageView';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

if (!GOOGLE_CLIENT_ID && typeof window !== 'undefined') {
  console.warn('[Providers] NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set — Google login will not work.');
}

/**
 * All client-side context providers, in one boundary. Rendered once by the
 * root server layout. Replaces the provider stack from the old App.tsx + main.tsx.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthProvider>
          <AppliedJobsProvider>
            <SavedJobsProvider>
              <TrackingInit />
              <ViewportChromeInset />
              {/* GAPageView reads useSearchParams, which needs a Suspense
                  boundary during prerender. */}
              <Suspense fallback={null}>
                <GAPageView />
              </Suspense>
              {children}
              {/* Asks once per device; analytics load only after "Accept". */}
              <CookieConsent />
            </SavedJobsProvider>
          </AppliedJobsProvider>
        </AuthProvider>
      </GoogleOAuthProvider>
    </ThemeProvider>
  );
}
