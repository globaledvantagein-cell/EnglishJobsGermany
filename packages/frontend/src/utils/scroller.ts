// Which element scrolls the page?
//
// On iPhone Safari the page scrolls inside <body> (see "iPhone: the page scrolls
// inside <body>" in app/globals.css) so nothing is ever drawn scrolling under
// iOS 26's glass status bar and toolbar. Everywhere else the document scrolls.
// Code that used window.scrollY / window.scrollTo / window "scroll" events goes
// through here so it works in both cases.

export function getScroller(): HTMLElement {
  const body = document.body;
  const cs = getComputedStyle(body);
  if (cs.position === 'fixed' && /auto|scroll/.test(cs.overflowY)) return body;
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

export function isBodyScroller(): boolean {
  return getScroller() === document.body;
}

/** Subscribe to scrolling of whichever element scrolls the page. Element
 *  scroll events don't bubble, so listen on document in the capture phase
 *  (this also still catches the window scroll). Returns an unsubscribe fn. */
export function onPageScroll(handler: () => void): () => void {
  document.addEventListener('scroll', handler, { capture: true, passive: true });
  window.addEventListener('resize', handler, { passive: true });
  return () => {
    document.removeEventListener('scroll', handler, { capture: true });
    window.removeEventListener('resize', handler);
  };
}
