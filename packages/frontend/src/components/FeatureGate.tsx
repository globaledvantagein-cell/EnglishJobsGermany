'use client';

/**
 * UI half of a kill switch (see hooks/useFeature.ts and KILL_SWITCHES.md).
 *
 *   withFeature(key, Component)                      → renders nothing while OFF
 *   withFeature(key, Component, <FeaturePaused …/>)  → renders the notice while OFF
 */
import type { ComponentType, ReactNode } from 'react';
import { PauseCircle } from 'lucide-react';
import { useFeature, type FeatureKey } from '../hooks/useFeature';

export function FeaturePaused({ title, body }: { title: string; body?: string }) {
  return (
    <div role="status" style={{
      maxWidth: 520, margin: '48px auto', padding: '28px 24px', textAlign: 'center',
      border: '1px solid var(--border)', borderRadius: 14, background: 'var(--bg-surface)',
    }}>
      <PauseCircle size={28} style={{ opacity: 0.6, marginBottom: 10 }} aria-hidden />
      <h2 style={{ fontSize: 18, fontWeight: 650, margin: '0 0 6px' }}>{title} is temporarily paused</h2>
      <p style={{ margin: 0, opacity: 0.75, fontSize: 14.5, lineHeight: 1.5 }}>
        {body ?? "We're fixing something behind the scenes. Please check back shortly — your data is safe."}
      </p>
    </div>
  );
}

export function FeatureGate({ feature, fallback = null, children }: { feature: FeatureKey; fallback?: ReactNode; children: ReactNode }) {
  return useFeature(feature) ? <>{children}</> : <>{fallback}</>;
}

export function withFeature<P extends object>(feature: FeatureKey, Component: ComponentType<P>, fallback: ReactNode = null) {
  function Gated(props: P) {
    return useFeature(feature) ? <Component {...props} /> : <>{fallback}</>;
  }
  Gated.displayName = `withFeature(${feature})`;
  return Gated;
}
