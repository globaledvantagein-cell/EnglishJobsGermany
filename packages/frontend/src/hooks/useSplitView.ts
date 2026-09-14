/**
 * Custom hook that encapsulates the split-view layout logic used across
 * admin pages (Dashboard, ReviewQueue, RejectedJobs, JobTestLogs).
 *
 * Manages: split panel height calculation, mobile detail overlay state,
 * scroll position restoration, and selected-item auto-scrolling.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaQuery } from './useMediaQuery';

interface UseSplitViewOptions {
  /** Additional refs whose size changes should trigger a recalculation */
  observeRefs?: React.RefObject<HTMLElement | null>[];
  /** Deps array that forces a height recalculation when changed */
  recalcDeps?: unknown[];
  /** Bottom padding subtracted from viewport height (default: 16) */
  bottomPadding?: number;
}

export function useSplitView<T extends { _id: string }>(
  items: T[],
  options: UseSplitViewOptions = {},
) {
  const { observeRefs = [], recalcDeps = [], bottomPadding = 16 } = options;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [splitHeight, setSplitHeight] = useState<number | null>(null);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const splitViewRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const savedScrollRef = useRef(0);

  // Auto-select first item when list changes or selected is gone
  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      setMobileDetailOpen(false);
      return;
    }
    const exists = items.some(item => item._id === selectedId);
    if (!selectedId || !exists) {
      setSelectedId(items[0]._id);
      if (isMobile) setMobileDetailOpen(false);
    }
  }, [items, selectedId, isMobile]);

  // Auto-scroll to selected item on desktop
  useEffect(() => {
    if (!selectedId || isMobile) return;
    const node = itemRefs.current[selectedId];
    if (!node) return;
    requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [selectedId, isMobile, items.length]);

  // Calculate split height from viewport
  useEffect(() => {
    const updateSplitHeight = () => {
      if (window.innerWidth < 768 || !splitViewRef.current) {
        setSplitHeight(null);
        return;
      }
      const top = splitViewRef.current.getBoundingClientRect().top;
      const nextHeight = Math.max(window.innerHeight - top - bottomPadding, 320);
      setSplitHeight(nextHeight);
    };

    const observer = new ResizeObserver(() => updateSplitHeight());
    const allNodes = [...observeRefs.map(r => r.current), splitViewRef.current].filter(Boolean) as Element[];
    allNodes.forEach(node => observer.observe(node));
    window.addEventListener('resize', updateSplitHeight);
    updateSplitHeight();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSplitHeight);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, isMobile, ...recalcDeps]);

  const selectItem = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const openMobileDetail = useCallback((id: string) => {
    setSelectedId(id);
    savedScrollRef.current = window.scrollY;
    setMobileDetailOpen(true);
  }, []);

  const closeMobileDetail = useCallback(() => {
    setMobileDetailOpen(false);
    requestAnimationFrame(() => window.scrollTo(0, savedScrollRef.current));
  }, []);

  const selectedItem = items.find(item => item._id === selectedId) || null;
  const desktopSplitHeight = splitHeight ? `${splitHeight}px` : undefined;

  return {
    selectedId,
    selectedItem,
    setSelectedId: selectItem,
    mobileDetailOpen,
    openMobileDetail,
    closeMobileDetail,
    splitViewRef,
    itemRefs,
    desktopSplitHeight,
    isMobile,
  };
}
