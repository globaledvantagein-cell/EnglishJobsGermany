'use client';

// Fires a GA4 page_view on every client-side navigation. GA's own
// send_page_view only covers the initial document load; next/link navigations
// are pushState and are otherwise invisible to it.
//
// The first run is skipped deliberately: gtag('config') in the root layout
// already counted the initial load, so firing here too would double-count
// every session's landing page.

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function GAPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialLoad = useRef(true);

  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }
    if (!pathname || typeof window === 'undefined' || !window.gtag) return;

    const query = searchParams?.toString();
    const url = pathname + (query ? `?${query}` : '');

    window.gtag('event', 'page_view', {
      page_path: url,
      page_location: window.location.origin + url,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}
