'use client';

import { Suspense, type ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider } from '../theme/ThemeProvider';
import { AuthProvider } from '../context/AuthContext';
import { AppliedJobsProvider } from '../context/AppliedJobsContext';
import { SavedJobsProvider } from '../context/SavedJobsContext';
import PostHogInit from './PostHogInit';
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
              <PostHogInit />
              {/* GAPageView reads useSearchParams, which needs a Suspense
                  boundary during prerender. */}
              <Suspense fallback={null}>
                <GAPageView />
              </Suspense>
              {children}
              {/* <CookieConsent /> intentionally not rendered — tracking is
                  ungated (see utils/consent.ts). The component and the consent
                  helpers are kept intact so this is a one-line re-enable. */}
            </SavedJobsProvider>
          </AppliedJobsProvider>
        </AuthProvider>
      </GoogleOAuthProvider>
    </ThemeProvider>
  );
}
