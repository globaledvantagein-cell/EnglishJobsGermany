'use client';

// Publishes --chrome-inset-bottom on <html>: how much of the layout viewport
// Safari's own UI (iOS 26's floating toolbar, or the on-screen keyboard)
// covers right now. env(safe-area-inset-bottom) only covers the home
// indicator, so a `position: fixed; bottom: 0` bar can sit behind the
// toolbar. Bottom bars add this variable to their padding (job page Apply bar,
// mobile filter sheets). 0px everywhere else.
//
// window.innerHeight stays the full layout viewport while visualViewport
// shrinks or shifts as browser chrome appears; the difference is the cover.
// Same method as github.com/dengf/budget_planner PR #89 (found on device).

import { useEffect } from 'react';

export default function ViewportChromeInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      root.style.setProperty('--chrome-inset-bottom', `${Math.max(0, Math.round(gap))}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return null;
}
