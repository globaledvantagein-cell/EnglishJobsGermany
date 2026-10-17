'use client';

import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { track } from '../../utils/analytics';

export type GateState = 'loading' | 'blocked' | 'allowed';

/**
 * Premium gate shared by the match pages. Admins are always premium; everyone
 * else is unknown until the usage fetch returns. A block is reported once to
 * the funnel analytics as premium_feature_blocked.
 */
export function usePremiumGate(feature: 'smart_match' | 'today_matches'): GateState {
  const { isLoading, isPremium, isAdmin, usage } = useAuth();
  const known = !isLoading && (isAdmin || usage !== null);
  const state: GateState = !known ? 'loading' : isPremium ? 'allowed' : 'blocked';

  useEffect(() => {
    if (state === 'blocked') track('premium_feature_blocked', { feature });
  }, [state, feature]);

  return state;
}
