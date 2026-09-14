'use client';

/**
 * Pill that appears when the browser goes offline and confirms briefly when
 * it comes back. Complements ErrorState (which covers "backend down while
 * online") — this one is about the client's own connection.
 *
 * Online/offline is read through useSyncExternalStore so the server render
 * (always "online") and the first client render agree, and no state is set
 * synchronously inside an effect.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
const getOnline = () => navigator.onLine;
const getServerOnline = () => true;

export default function ConnectionBanner() {
  const online = useSyncExternalStore(subscribe, getOnline, getServerOnline);
  const [justBack, setJustBack] = useState(false);
  const wasOffline = useRef(false);

  // Show "Back online" for a moment after a recovery. The setState here is
  // inside a timer callback (an external event), not the effect body.
  useEffect(() => {
    if (!online) { wasOffline.current = true; return; }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    const show = setTimeout(() => setJustBack(true), 0);
    const hide = setTimeout(() => setJustBack(false), 2500);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [online]);

  if (online && !justBack) return null;

  return (
    <div className={`conn-banner ${online ? 'conn-banner--online' : ''}`} role="status" aria-live="polite">
      <span className="conn-banner__dot" aria-hidden="true" />
      {online ? 'Back online' : 'You’re offline — listings can’t refresh until you reconnect.'}
    </div>
  );
}
