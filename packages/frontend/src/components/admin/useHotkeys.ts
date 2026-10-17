'use client';

/**
 * Single-key shortcuts for admin pages (j/k, a/r, /, …).
 *
 * Ignored while the user is typing in an input, textarea, select or
 * contenteditable — otherwise approving a job by pressing "a" would fire while
 * writing an admin note. Modifier combos (Ctrl/Cmd/Alt) are passed through so
 * browser shortcuts keep working.
 */
import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useHotkeys(map: HotkeyMap, enabled = true) {
  // Ref so callers can pass a fresh object every render without re-binding.
  const mapRef = useRef(map);
  useEffect(() => { mapRef.current = map; });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('.adm-overlay')) return; // dialog open
      const handler = mapRef.current[event.key];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/** Next/previous id in a list, clamped at both ends. */
export function stepSelection(ids: string[], current: string | null | undefined, delta: number): string | null {
  if (ids.length === 0) return null;
  const index = current ? ids.indexOf(current) : -1;
  if (index === -1) return ids[0];
  return ids[Math.min(ids.length - 1, Math.max(0, index + delta))];
}
