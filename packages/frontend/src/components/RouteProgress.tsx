'use client';

/**
 * Top-of-page navigation progress bar.
 *
 * The App Router has no router events, so "navigation started" is inferred
 * from a click on any same-origin <a> that changes the path (capture phase,
 * so it fires before Next's Link handler), and "navigation finished" from the
 * pathname/search actually changing. If the click didn't produce a navigation
 * (blocked, new tab, hash link) a safety timer clears the bar.
 */
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'active' | 'done'>('idle');
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  // Start on internal link clicks.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      let url: URL;
      try { url = new URL(a.href, location.href); } catch { return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page / hash
      startedRef.current = true;
      if (doneRef.current) clearTimeout(doneRef.current);
      setState('active');
      if (safetyRef.current) clearTimeout(safetyRef.current);
      safetyRef.current = setTimeout(() => { startedRef.current = false; setState('idle'); }, 10000);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Finish when the route actually changes.
  useEffect(() => {
    if (!startedRef.current) return;
    startedRef.current = false;
    if (safetyRef.current) clearTimeout(safetyRef.current);
    setState('done');
    doneRef.current = setTimeout(() => setState('idle'), 350);
  }, [pathname, search]);

  return (
    <div className={`route-progress ${state === 'idle' ? '' : state === 'active' ? 'active' : 'active done'}`} aria-hidden="true">
      <div className="route-progress__bar" />
    </div>
  );
}
