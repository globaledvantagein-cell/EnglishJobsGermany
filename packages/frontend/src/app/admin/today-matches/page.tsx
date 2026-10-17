import TodayMatches from '@/page-components/TodayMatches';

// Same page users see, rendered inside the admin shell. The wrapper is the
// scroll container, so the match toolbar and detail pane stick inside it.
export default function Page() {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <TodayMatches embedded />
    </div>
  );
}
