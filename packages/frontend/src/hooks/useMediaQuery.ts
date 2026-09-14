import { useEffect, useState } from 'react';

/** Uses the matchMedia API (change events, not resize listeners) to react to breakpoint changes. */
export function useMediaQuery(query: string): boolean {
  // Must start `false` on BOTH the server and the first client render so
  // hydration matches; the effect then syncs to the real value after mount.
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    // Sync on mount now that we're client-side.
    setMatches(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsTablet = () => useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
export const useIsLargeDesktop = () => useMediaQuery('(min-width: 1440px)');
