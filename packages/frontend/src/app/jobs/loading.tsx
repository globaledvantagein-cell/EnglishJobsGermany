import { BrowsePageSkeleton } from '@/components/jobs/JobCardSkeleton';

// Shown the instant a navigation to /jobs starts (while the route's payload
// streams / compiles). Without it the previous page sits frozen until the
// segment resolves, which reads as the whole app hanging.
export default function Loading() {
  return <BrowsePageSkeleton />;
}
