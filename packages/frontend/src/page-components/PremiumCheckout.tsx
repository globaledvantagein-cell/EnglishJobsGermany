'use client';

/**
 * /premium — invite-only Premium page.
 *
 * Premium is free for early users, gated by personal invite codes:
 *   1. "Join the waitlist" → POST /api/auth/join-waitlist generates a
 *      one-time EJG-XXXX-XXXX code and emails it a few minutes later.
 *   2. "Have an invite code?" → redeems the code (POST /api/auth/redeem-promo)
 *      and activates 3 months of Premium. No payment details of any kind.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, Link } from '@/compat/router';
import {
  Crown, Check, Shield, RefreshCw, Sparkles, KeyRound, MailPlus, Zap, CreditCard,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { redeemPromoCode, joinWaitlist, fetchWaitlistStatus, ApiError } from '../utils/jobApi';
import { track } from '../utils/analytics';
import { Spinner } from '../components/ui';
import { useMediaQuery } from '../hooks/useMediaQuery';

const PLAN_PRICE = '€14.99';

const FEATURES: string[] = [
  'Unlimited job description views',
  'Unlimited apply clicks',
  'Smart Match — AI resume scoring',
  "Today's Matches — daily personalized picks",
  'Advanced filters — salary, visa, relocation, experience, workplace',
  'Salary insights — extracted amounts with confidence tier',
  'Priority support',
];

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

type WaitlistState = 'checking' | 'idle' | 'joining' | 'joined';

export default function PremiumCheckout() {
  const nav = useNavigate();
  const { isAuthenticated, isLoading, isPremium, usage, refreshUsage } = useAuth();
  const isMobile = useMediaQuery('(max-width: 767px)');

  // Hydration guard: auth state and the media query only resolve on the
  // client, so SSR HTML and the first client render must both show the same
  // neutral loading state. Real content appears after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Waitlist card state. Starts 'checking' — the DB is the source of truth
  // for "already joined", restored via /waitlist-status on load so a refresh
  // (or another device) keeps the secured-spot state.
  const [waitlist, setWaitlist] = useState<WaitlistState>('checking');
  const [waitlistNote, setWaitlistNote] = useState('Your personal invite code arrives by email · Usually within minutes');

  // Invite-code card state.
  const [inviteCode, setInviteCode] = useState('');
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Auth gate — bounce anonymous users to login (preserving intent).
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      nav('/login?redirect=/premium', { replace: true });
    }
  }, [isLoading, isAuthenticated, nav]);

  // Funnel: page viewed (once).
  useEffect(() => { track('premium_page_viewed'); }, []);

  // Restore waitlist state from the DB (survives refresh + other devices).
  // Expired/redeemed codes report onWaitlist: false, so users with a dead
  // code can simply claim a fresh spot. Errors fail open to the join button.
  useEffect(() => {
    if (isLoading || !isAuthenticated || isPremium) return;
    let cancelled = false;
    fetchWaitlistStatus()
      .then(s => {
        if (cancelled) return;
        if (s.onWaitlist) {
          setWaitlist('joined');
          setWaitlistNote('Your invite code is on its way. Keep an eye on your inbox.');
        } else {
          setWaitlist('idle');
        }
      })
      .catch(() => { if (!cancelled) setWaitlist('idle'); });
    return () => { cancelled = true; };
  }, [isLoading, isAuthenticated, isPremium]);

  const handleJoinWaitlist = async () => {
    if (waitlist !== 'idle') return;
    setWaitlist('joining');
    try {
      const res = await joinWaitlist();
      track('waitlist_joined', { alreadyJoined: Boolean(res.alreadyJoined) });
      setWaitlist('joined');
      setWaitlistNote(res.alreadyJoined
        ? "You're already in line. Your invite code is on its way, check your inbox."
        : 'Your personal invite code is being prepared. It lands in your inbox within minutes.');
    } catch (err) {
      const body = err instanceof ApiError ? err.body : null;
      if (body?.error === 'already_premium') {
        nav('/jobs');
        return;
      }
      setWaitlist('idle');
      setWaitlistNote('Something went wrong — please try again.');
    }
  };

  const handleActivate = async () => {
    const code = inviteCode.trim();
    if (!code || activating || activated) return;
    setActivating(true);
    setCodeError(null);
    try {
      await redeemPromoCode(code);
      track('premium_activated', { source: 'premium_page', method: 'invite_code' });
      await refreshUsage();
      setActivated(true);
      setTimeout(() => nav('/jobs'), 2000);
    } catch (err) {
      const body = err instanceof ApiError ? err.body : null;
      setCodeError(body?.message || (err instanceof Error ? err.message : 'That code could not be activated.'));
      setActivating(false);
    }
  };

  // ── Loading / redirect states ───────────────────────────────────────────
  if (!mounted || isLoading || !isAuthenticated) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        <Spinner size={20} />
      </div>
    );
  }

  // ── Already premium ─────────────────────────────────────────────────────
  // `!activated` so a just-completed activation keeps its success state until
  // the 2s redirect instead of snapping to this card.
  if (isPremium && !activated) {
    const premiumExpiry = formatDate(usage?.premiumExpiresAt);
    return (
      <div style={{ minHeight: '80vh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{
          maxWidth: 420, width: '100%', textAlign: 'center',
          background: 'var(--surface-solid)', border: '1.25px solid var(--border)',
          borderRadius: 16, padding: 32, boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        }}>
          <span style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--acid-soft)', color: 'var(--acid)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Crown size={26} />
          </span>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', color: 'var(--text-primary)', margin: 0 }}>
            You&apos;re already on Premium
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            {premiumExpiry ? `Active until ${premiumExpiry}.` : 'You have full access to every Premium feature.'}
          </p>
          <button
            type="button"
            onClick={() => nav('/jobs')}
            style={{ marginTop: 4, height: 44, padding: '0 22px', background: 'var(--acid)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'inherit', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}
          >
            Back to jobs
          </button>
        </div>
      </div>
    );
  }

  // ── Left column — dark membership plan card ─────────────────────────────
  // Navy + gold, matching the invite email so inbox → page reads as one
  // continuous brand moment. Fixed colors on purpose: identical in both themes.
  const gold = '#d4a94a';
  const cardMuted = '#8a94a6';
  const planSummary = (
    <div style={{
      background: 'linear-gradient(165deg, #131c29 0%, #0f1620 55%, #0c1219 100%)',
      border: '1px solid rgba(212, 169, 74, 0.28)',
      borderRadius: 16, padding: '20px 20px 18px', boxShadow: 'var(--shadow-lg)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${gold}, transparent)` }} />

      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: gold,
      }}>
        <Crown size={13} /> Premium · Early access
      </span>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '2.15rem', fontWeight: 700, color: cardMuted, textDecoration: 'line-through', letterSpacing: '-0.01em', lineHeight: 1 }}>
          {PLAN_PRICE}
          <span style={{ fontSize: '1rem', fontWeight: 600 }}>/mo</span>
        </span>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '2.15rem', fontWeight: 700, color: 'var(--acid)', letterSpacing: '-0.01em', lineHeight: 1 }}>Free</span>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: gold, letterSpacing: '0.02em' }}>First 3 months free · invite only · no credit card</p>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '14px 0 12px' }} />

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {FEATURES.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: '0.85rem', color: '#c7d0dd', lineHeight: 1.45 }}>
            <span style={{ color: gold, flexShrink: 0, marginTop: 1 }}><Check size={14} /></span>
            {f}
          </li>
        ))}
      </ul>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '12px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: '0.8rem', color: cardMuted }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Shield size={13} style={{ color: gold, flexShrink: 0 }} /> Full access, nothing held back
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={13} style={{ flexShrink: 0 }} /> No auto-renewal, no surprise charges
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={13} style={{ flexShrink: 0 }} /> No credit card required
        </span>
      </div>
    </div>
  );

  // ── Right column — waitlist + invite code cards ─────────────────────────
  // Same navy/gold membership language as the plan card and the invite
  // email: gold hairline, gold eyebrows, dark CTA. One brand, one moment.
  const sectionLabel: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
    color: '#b98a2e', margin: 0,
  };
  const cardShell: CSSProperties = {
    background: 'var(--surface-solid)', border: '1px solid rgba(212, 169, 74, 0.35)',
    borderRadius: 16, padding: 20, boxShadow: 'var(--shadow-md)',
    position: 'relative', overflow: 'hidden',
  };
  const goldHairline = (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${gold}, transparent)` }} />
  );

  const waitlistCard = (
    <div style={cardShell}>
      {goldHairline}
      <h2 style={sectionLabel}><Sparkles size={13} /> Invite only · Limited spots</h2>
      <ul style={{ listStyle: 'none', margin: '12px 0 14px', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          <><strong style={{ color: 'var(--text-primary)' }}>3 months free</strong>, a &euro;44.97 value, zero to pay</>,
          <>Your code is <strong style={{ color: 'var(--text-primary)' }}>reserved for this account only</strong></>,
          <>Small batches: <strong style={{ color: 'var(--text-primary)' }}>limited codes</strong> released at a time</>,
          <>One click to claim, no credit card ever</>,
        ].map((item, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: '0.87rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
            <span style={{ color: gold, flexShrink: 0, marginTop: 2 }}><Check size={14} /></span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={handleJoinWaitlist}
        disabled={waitlist !== 'idle'}
        style={{
          width: '100%', height: 46, borderRadius: 10,
          background: '#0f1620',
          border: waitlist === 'joined' ? `1px solid ${gold}` : '1px solid rgba(212, 169, 74, 0.5)',
          color: waitlist === 'joined' ? gold : '#f5f2ea',
          fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
          cursor: waitlist === 'idle' ? 'pointer' : 'default',
          opacity: waitlist === 'checking' ? 0.6 : 1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'background 0.2s, opacity 0.2s',
        }}
      >
        {waitlist === 'joined' ? (<><Check size={17} /> Spot secured. You&apos;re in!</>)
          : waitlist === 'joining' ? (<><Spinner size={16} /> Securing your spot…</>)
          : waitlist === 'checking' ? (<><Spinner size={16} /></>)
          : (<><MailPlus size={17} /> Claim my spot</>)}
      </button>
      <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        {waitlistNote}
      </p>
    </div>
  );

  const codeCard = (
    <div style={cardShell}>
      {goldHairline}
      <h2 style={sectionLabel}><KeyRound size={13} /> Have an invite code?</h2>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          type="text" autoComplete="off"
          placeholder="EJG-XXXX-XXXX" maxLength={20}
          value={inviteCode}
          onChange={e => { setInviteCode(e.target.value.toUpperCase()); setCodeError(null); }}
          onKeyDown={e => { if (e.key === 'Enter') handleActivate(); }}
          aria-label="Invite code"
          style={{
            flex: 1, minWidth: 0, height: 44, fontSize: 15, borderRadius: 8, padding: '0 12px',
            border: `1px solid ${codeError ? 'var(--danger)' : 'var(--border)'}`,
            background: 'var(--bg-surface, var(--surface-solid))',
            color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}
        />
        <button
          type="button"
          onClick={handleActivate}
          disabled={!inviteCode.trim() || activating || activated}
          style={{
            height: 44, padding: '0 20px', flexShrink: 0, borderRadius: 8,
            background: activated ? 'var(--success, #22c55e)' : '#0f1620',
            border: activated ? 'none' : '1px solid rgba(212, 169, 74, 0.5)',
            color: activated ? '#fff' : '#f5f2ea', fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
            cursor: !inviteCode.trim() || activating || activated ? 'default' : 'pointer',
            opacity: !inviteCode.trim() && !activated ? 0.6 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          {activated ? (<><Check size={15} /> Activated!</>)
            : activating ? (<><Spinner size={15} /></>)
            : 'Activate'}
        </button>
      </div>
      {codeError && (
        <p style={{ margin: '8px 0 0', fontSize: '0.8rem', fontWeight: 600, color: 'var(--danger)' }}>{codeError}</p>
      )}
      {activated && (
        <p style={{ margin: '8px 0 0', fontSize: '0.8rem', fontWeight: 600, color: 'var(--success, #22c55e)' }}>
          Premium activated! Taking you to jobs…
        </p>
      )}
    </div>
  );

  const orDivider = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>or</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );

  const trustFooter = (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 14 }}>
      {[
        { icon: <CreditCard size={13} />, text: 'No credit card' },
        { icon: <Zap size={13} />, text: 'Instant activation' },
        { icon: <RefreshCw size={13} />, text: 'No auto-renewal' },
      ].map((t, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
          {t.icon} {t.text}
        </span>
      ))}
    </div>
  );

  const legalNotice = (
    <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
      By activating, you agree to our{' '}
      <Link to="/legal?tab=terms" style={{ color: 'var(--acid)', textDecoration: 'none' }}>Terms</Link> and{' '}
      <Link to="/legal?tab=privacy" style={{ color: 'var(--acid)', textDecoration: 'none' }}>Privacy Policy</Link>.
    </p>
  );

  return (
    <div style={{ background: 'var(--paper)', minHeight: '90vh', padding: isMobile ? '20px 16px 32px' : '18px 24px 20px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(1.4rem, 2.4vw, 1.7rem)', color: 'var(--text-primary)', margin: '0 0 2px' }}>
          Upgrade to <em style={{ fontStyle: 'italic', color: '#b98a2e' }}>Premium</em>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 14px' }}>
          Unlock unlimited access to every English-speaking role in Germany.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.15fr', gap: isMobile ? 16 : 24, alignItems: 'start' }}>
          {planSummary}
          <div>
            {waitlistCard}
            {orDivider}
            {codeCard}
            {trustFooter}
            {legalNotice}
          </div>
        </div>
      </div>
    </div>
  );
}
