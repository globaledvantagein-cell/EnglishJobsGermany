import { Suspense } from 'react';
import Login from '@/page-components/Login';

export const metadata = { title: 'Log in', robots: { index: false } };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}
