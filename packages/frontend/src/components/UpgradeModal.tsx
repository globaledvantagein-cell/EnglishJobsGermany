'use client';

/**
 * UpgradeModal — the conversion surface shown whenever a metering gate fires.
 *
 * Copy + CTAs branch on `gateReason` (Chunk 2/3 backend):
 *   signup_required → "sign up free" (no dismiss — drives conversion)
 *   jd_limit        → weekly JD-view limit reached (usage bar + upgrade)
 *   apply_limit     → weekly apply-click limit reached (usage bar + upgrade)
 *   premium_required→ a Premium-only feature (Smart Match, filters, salary…)
 *
 * Design notes: overlay uses rgba(0,0,0,0.5) + backdrop blur; the card reads
 * from the existing token system only (no new colours). On small viewports it
 * goes full-screen instead of a cramped centered card. Escape + click-outside
 * dismiss, EXCEPT for signup_required which has no escape hatch.
 *
 * Also exports the reusable pieces (PromoCodeForm, PremiumFeatureBullets,
 * PremiumPitch, UsageBar) so the profile page and gated pages stay consistent.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from '@/compat/router';
import { X, Crown, Check, Zap, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { redeemPromoCode } from '../utils/jobApi';
import { ApiError } from '../utils/jobApi';
import { track } from '../utils/analytics';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { GateReason, GateUsage } from '../types';

export const PREMIUM_PRICE_LABEL = 'Get early access — free for 3 months';

/**
 * Relative label for the next counter reset. `dateStr` is the LAST reset
 * (weekResetAt, set by the Monday 00:00 UTC cron); the next reset is 7 days
 * later. Relative wording ("in 2 days") stays accurate in every timezone,
 * unlike a fixed weekday name. Falls back to "Monday".
 */
export function resetDayLabel(dateStr?: string | null): string {
  if (!dateStr) return 'Monday';
  const last = new Date(dateStr);
  if (isNaN(last.getTime())) return 'Monday';
  const next = new Date(last.getTime() + 7 * 24 * 60 * 60 * 1000);
  const days = Math.ceil((next.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

// ─── Reusable: thin usage progress bar ───────────────────────────────────────
export function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  // 100% → danger, 80%+ → warning, else accent.
  const fill = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--acid)';
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 5 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600 }}>{used}/{limit}</span>
      </div>
      <div style={{ height: 3, borderRadius: 3, background: 'var(--bg-surface-2)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: fill, borderRadius: 3, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

// ─── Reusable: feature bullets ───────────────────────────────────────────────
const FEATURES: { icon: ReactNode; text: string }[] = [
  { icon: <Zap size={15} />, text: 'Unlimited job descriptions & apply clicks' },
  { icon: <Sparkles size={15} />, text: 'Smart Match & Today’s Matches' },
  { icon: <SlidersHorizontal size={15} />, text: 'Advanced filters & salary insights' },
];

export function PremiumFeatureBullets() {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
      {FEATURES.map((f, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--acid)', display: 'inline-flex', flexShrink: 0 }}>{f.icon}</span>
          {f.text}
        </li>
      ))}
    </ul>
  );
}

// ─── Reusable: promo code redemption form ────────────────────────────────────
export function PromoCodeForm({ onSuccess, source = 'modal', variant = 'default' }: {
  onSuccess?: () => void;
  source?: string;
  /** 'premium' = navy/gold membership styling (Profile subscription card). */
  variant?: 'default' | 'premium';
}) {
  const { refreshUsage } = useAuth();
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setState('submitting');
    setMessage(null);
    try {
      await redeemPromoCode(trimmed);
      setState('success');
      setMessage('Premium activated!');
      track('promo_code_redeemed', { source });
      // Update the auth context immediately so the UI reflects premium…
      await refreshUsage();
      onSuccess?.();
      // …then reload after a beat so every gated view/page picks it up cleanly.
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setState('error');
      const body = err instanceof ApiError ? err.body : null;
      const errorMessage = body?.message || (err instanceof Error ? err.message : 'Could not apply that code.');
      setMessage(errorMessage);
      track('promo_code_failed', { source, error: errorMessage });
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); if (state === 'error') { setState('idle'); setMessage(null); } }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="Invite code"
          aria-label="Invite code"
          disabled={state === 'submitting' || state === 'success'}
          style={{
            flex: 1, minWidth: 0, height: 40, padding: '0 12px',
            fontFamily: 'inherit', fontSize: '0.86rem', letterSpacing: '0.04em',
            textTransform: 'uppercase',
            ...(variant === 'premium' ? {
              background: 'rgba(255,255,255,0.06)', color: '#fff',
              border: `1.25px solid ${state === 'error' ? 'var(--danger)' : 'rgba(212, 169, 74, 0.4)'}`,
            } : {
              background: 'var(--bg-surface)', color: 'var(--text-primary)',
              border: `1.25px solid ${state === 'error' ? 'var(--danger)' : 'var(--border)'}`,
            }),
            borderRadius: 10, outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={state === 'submitting' || state === 'success' || !code.trim()}
          style={{
            height: 40, padding: '0 18px', flexShrink: 0,
            ...(variant === 'premium'
              ? { background: 'linear-gradient(90deg, #d4a94a, #e6c069)', color: '#0f1620', fontWeight: 800 }
              : { background: 'var(--acid)', color: '#fff', fontWeight: 700 }),
            border: 'none', borderRadius: 10,
            fontFamily: 'inherit', fontSize: '0.86rem',
            cursor: state === 'submitting' || !code.trim() ? 'not-allowed' : 'pointer',
            opacity: state === 'submitting' || !code.trim() ? 0.6 : 1,
          }}
        >
          {state === 'submitting' ? 'Applying…' : 'Apply'}
        </button>
      </div>
      {message && (
        <p style={{
          marginTop: 8, fontSize: '0.8rem', fontWeight: 600,
          color: state === 'success' ? (variant === 'premium' ? '#e6c069' : 'var(--acid)') : 'var(--danger)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {state === 'success' && <Check size={14} />}
          {message}
        </p>
      )}
    </div>
  );
}

// ─── Premium gate for full pages (Smart Match / Today's Matches) ─────────────
// No pitch card here anymore — a non-premium user landing on a premium page is
// sent straight to /premium, which is the single conversion surface.
export function PremiumPitch({ icon, title, description }: { icon?: ReactNode; title: string; description: string }) {
  void icon; void title; void description; // kept for call-site compatibility
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/premium', { replace: true });
  }, [navigate]);
  return null;
}

// ─── The modal itself ────────────────────────────────────────────────────────
interface CopyBlock {
  headline: string;
  body: string;
  showUsage: boolean;
  usageLabel?: string;
  showPromo: boolean;
  showBullets: boolean;
}

function copyFor(gateReason: GateReason): CopyBlock {
  switch (gateReason) {
    case 'signup_required':
      return {
        headline: 'Sign up to keep browsing',
        body: 'Create a free account to view up to 20 job descriptions per week and start applying.',
        showUsage: false, showPromo: false, showBullets: false,
      };
    case 'jd_limit':
      return {
        headline: "You've reached your weekly limit",
        body: 'Free accounts can view 20 job descriptions per week. Upgrade to Premium for unlimited access.',
        showUsage: true, usageLabel: 'views used', showPromo: true, showBullets: true,
      };
    case 'apply_limit':
      return {
        headline: "You've used all your weekly apply clicks",
        body: 'Free accounts get 15 apply clicks per week. Upgrade for unlimited.',
        showUsage: true, usageLabel: 'clicks used', showPromo: true, showBullets: true,
      };
    case 'premium_required':
    default:
      return {
        headline: 'This is a Premium feature',
        body: 'Smart Match, Today’s Matches, advanced filters, and salary insights are available with Premium.',
        showUsage: false, showPromo: true, showBullets: true,
      };
  }
}

interface Props {
  gateReason: GateReason;
  usage?: GateUsage | null;
  onClose?: () => void;
}

export default function UpgradeModal({ gateReason, usage, onClose }: Props) {
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const copy = copyFor(gateReason);
  // signup_required is a hard gate: no dismiss affordance.
  const dismissible = gateReason !== 'signup_required';
  const [promoOpen, setPromoOpen] = useState(false);

  // Funnel entry: which gate fired, and on which page.
  useEffect(() => {
    track('paywall_shown', {
      gate_reason: gateReason,
      page: typeof window !== 'undefined' ? window.location.pathname : undefined,
    });
  }, [gateReason]);

  useEffect(() => {
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismissible, onClose]);

  const cardStyle: CSSProperties = isMobile
    ? { position: 'relative', width: '100%', height: '100%', maxWidth: 'none', borderRadius: 0, padding: '28px 20px', overflowY: 'auto' }
    : { position: 'relative', width: '100%', maxWidth: 440, borderRadius: 16, padding: 32, maxHeight: '90vh', overflowY: 'auto' };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.headline}
      onClick={dismissible ? () => onClose?.() : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? 0 : 16,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.18s ease both',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...cardStyle,
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center',
        }}
      >
        {dismissible && (
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Close"
            style={{
              position: 'absolute', top: 14, right: 14,
              width: 32, height: 32, borderRadius: 8,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        )}

        <div style={{
          width: 52, height: 52, borderRadius: 14, background: 'var(--acid-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--acid)', marginTop: 4,
        }}>
          <Crown size={24} />
        </div>

        <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.3rem, 3vw, 1.55rem)', color: 'var(--text-primary)', margin: 0 }}>
          {copy.headline}
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55, margin: 0 }}>
          {copy.body}
        </p>

        {copy.showUsage && usage && (
          <div style={{ width: '100%' }}>
            <UsageBar used={usage.used} limit={usage.limit} label={`${copy.usageLabel}`} />
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 6, textAlign: 'left' }}>
              Resets {resetDayLabel(usage.resetsAt)}
            </p>
          </div>
        )}

        {gateReason === 'signup_required' ? (
          <>
            <button
              type="button"
              onClick={() => navigate('/signup')}
              style={{
                width: '100%', height: 46, background: 'var(--acid)', color: '#fff',
                border: 'none', borderRadius: 12, fontFamily: 'inherit', fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Sign up free
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: '0.84rem', cursor: 'pointer' }}
            >
              Already have an account? <span style={{ color: 'var(--acid)', fontWeight: 600 }}>Log in</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { track('upgrade_cta_clicked', { gate_reason: gateReason, source: 'modal' }); navigate('/premium'); }}
              style={{
                width: '100%', minHeight: 46, background: 'var(--acid)', color: '#fff',
                border: 'none', borderRadius: 12, fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 12px',
              }}
            >
              <Crown size={16} /> {PREMIUM_PRICE_LABEL}
            </button>

            {copy.showPromo && (
              promoOpen ? (
                <PromoCodeForm />
              ) : (
                <button
                  type="button"
                  onClick={() => setPromoOpen(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--acid)', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Or enter an invite code
                </button>
              )
            )}

            {copy.showBullets && (
              <div style={{ width: '100%', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <PremiumFeatureBullets />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
