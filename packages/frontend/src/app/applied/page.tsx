import AppliedJobs from '@/page-components/AppliedJobs';

// AppliedJobs shows its own soft sign-in prompt when unauthenticated, so no
// hard AuthGuard here (matches the original react-router behaviour).
export const metadata = { title: 'Applied Jobs', robots: { index: false } };

export default function AppliedPage() {
  return <AppliedJobs />;
}
