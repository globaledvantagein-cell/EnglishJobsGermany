import { redirect } from 'next/navigation';

// Legacy /signup → /alerts (mirrors the old react-router <Navigate>).
export default function SignupRedirect() {
  redirect('/alerts');
}
