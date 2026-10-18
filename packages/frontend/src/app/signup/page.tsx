import { Suspense } from 'react';
import Login from '@/page-components/Login';

// Google sign-up. /login never creates accounts; this page is the only place
// that does (see POST /api/auth/google `mode`).
export const metadata = { title: 'Sign up', robots: { index: false } };

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <Login mode="signup" />
    </Suspense>
  );
}
