'use client';

/**
 * Keeps an opened accordion item on screen.
 *
 * FAQ lists use exclusive `<details name="…">` groups (opening one closes the
 * others natively). When the item that closes sits above the one being
 * opened, the page reflows and the new answer can jump off-screen — so after
 * a grouped item opens, scroll its question into view if it isn't visible.
 * One capture-phase listener for the whole app; renders nothing.
 */
import { useEffect } from 'react';

export default function AccordionFocus() {
  useEffect(() => {
    const onToggle = (event: Event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.open || !details.name) return;
      requestAnimationFrame(() => {
        const summary = details.querySelector('summary');
        if (!summary) return;
        const { top, bottom } = summary.getBoundingClientRect();
        const header = 76; // sticky site header
        if (top < header || bottom > window.innerHeight) {
          summary.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      });
    };
    // `toggle` doesn't bubble; capture catches it for every <details>.
    document.addEventListener('toggle', onToggle, true);
    return () => document.removeEventListener('toggle', onToggle, true);
  }, []);
  return null;
}
