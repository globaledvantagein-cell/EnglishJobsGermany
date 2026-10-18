import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False on the server and while a component is hydrating, true afterwards.
 *
 * Use it to gate UI that depends on browser-only state (sign-in from
 * localStorage, media queries). Streamed segments such as /jobs/[id] hydrate
 * after AuthProvider's effect has already restored the session, so reading
 * `isAuthenticated` directly there renders signed-in markup over signed-out
 * server HTML and React throws a hydration mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
