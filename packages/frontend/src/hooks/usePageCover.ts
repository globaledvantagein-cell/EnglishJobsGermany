'use client';

/**
 * While a full-screen layer (mobile filters, phone menu) is open: lock the
 * page's scroll. Hiding the page under iOS Safari's glass toolbar is done in
 * CSS ("Page cover for overlays on iOS Safari" in app/globals.css), keyed on
 * the layer's class, so it also covers overlays that don't use this hook.
 */
import { useEffect } from 'react';

export function usePageCover(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [active]);
}
