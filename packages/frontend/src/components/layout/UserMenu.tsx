'use client';

/**
 * Signed-in user menu (desktop nav).
 *
 * Holds the links that don't earn a slot in the main nav — Profile, Applied —
 * plus Log out.
 *
 * Motion notes (per the design-engineering principles):
 *  - transform-origin: top right — the panel scales out of its trigger, not
 *    from its own centre. A popover that grows from the middle reads as
 *    unanchored.
 *  - Enters from scale(0.96), never scale(0). Nothing in the real world
 *    appears out of nothing.
 *  - 150ms with a strong ease-out curve: the user sees movement immediately,
 *    which is the moment they're watching most closely. Well under the 300ms
 *    ceiling for UI.
 *  - CSS transitions, not keyframes, so rapid open/close retargets smoothly
 *    from the current position instead of restarting.
 *  - Exit is faster than enter (110ms): the user has already decided.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from '@/compat/router';
import { LogOut, User as UserIcon, ChevronDown, Crown, ArrowRight } from 'lucide-react';
import { Badge, ProBadge } from '../ui';
import { USER_MENU_LINKS } from './navLinks';
import { useAuth } from '../../context/AuthContext';
import { fetchUsageStats } from '../../utils/jobApi';
import { UsageBar, resetDayLabel } from '../UpgradeModal';
import type { UsageStats } from '../../types';

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

interface Props {
  userName?: string;
  isAdmin: boolean;
  onLogout: () => void;
}

const itemStyle: CSSProperties = {
  display: 'block',
  padding: '8px 12px',
  fontSize: '0.84rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textDecoration: 'none',
  borderRadius: 6,
  transition: `background-color 120ms ${EASE_OUT}, color 120ms ${EASE_OUT}`,
};

export default function UserMenu({ userName, isAdmin, onLogout }: Props) {
  const { isPremium } = useAuth();
  const [open, setOpen] = useState(false);
  const [render, setRender] = useState(false);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Keep the node mounted through the exit transition, then unmount.
  useEffect(() => {
    if (open) { setRender(true); return; }
    const t = setTimeout(() => setRender(false), 110);
    return () => clearTimeout(t);
  }, [open]);

  // Fetch usage only when the dropdown is opened (cached 60s), not on every render.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchUsageStats().then(u => { if (alive) setUsage(u); }).catch(() => {});
    return () => { alive = false; };
  }, [open]);

  const premium = isPremium || usage?.isPremium;

  const close = useCallback(() => setOpen(false), []);

  // Click-outside + Escape. Both are what users reach for to dismiss.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const hoverIn = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.backgroundColor = 'var(--bg-surface-2)';
    e.currentTarget.style.color = 'var(--text-primary)';
  };
  const hoverOut = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
    e.currentTarget.style.color = 'var(--text-secondary)';
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="no-touch-expand"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
          color: 'var(--text-muted)', background: 'none',
          border: '1px solid transparent', borderRadius: 8,
          padding: '6px 10px', cursor: 'pointer',
          // Only transform — never `all`. 120ms keeps the press feeling instant.
          transition: `transform 120ms ${EASE_OUT}`,
        }}
        onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
        onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {/* Premium members get a gold crown as their identity mark. */}
        {isPremium ? <Crown size={13} style={{ color: '#FFD700' }} /> : <UserIcon size={13} />} {userName}
        {isPremium && <ProBadge />}
        {isAdmin && <Badge variant="red" style={{ fontSize: '0.58rem', padding: '2px 6px' }}>ADMIN</Badge>}
        <ChevronDown
          size={12}
          style={{ transition: `transform 150ms ${EASE_OUT}`, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {render && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            minWidth: 170, padding: 6,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
            zIndex: 60,
            // Scales out of the trigger (top-right), not its own centre.
            transformOrigin: 'top right',
            opacity: open ? 1 : 0,
            transform: open ? 'scale(1)' : 'scale(0.96)',
            transition: open
              ? `opacity 150ms ${EASE_OUT}, transform 150ms ${EASE_OUT}`
              : `opacity 110ms ${EASE_OUT}, transform 110ms ${EASE_OUT}`,
          }}
        >
          {/* ── Membership card — the first thing a paying member sees ── */}
          {premium ? (
            <div style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              borderRadius: 8, padding: '10px 14px', margin: '2px 2px 8px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Crown size={14} style={{ color: '#FFD700' }} />
                <span style={{ color: '#FFD700', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em' }}>PRO</span>
              </div>
              <div style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 400, marginTop: 3 }}>
                Unlimited access
              </div>
            </div>
          ) : (
            <Link
              to="/premium"
              role="menuitem"
              onClick={close}
              style={{
                ...itemStyle,
                display: 'flex', alignItems: 'center', gap: 5,
                color: 'var(--acid)', fontWeight: 600,
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--acid-soft)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Crown size={13} /> Upgrade to Pro <ArrowRight size={12} />
            </Link>
          )}

          {USER_MENU_LINKS.map(([path, label]) => (
            <Link
              key={path}
              to={path}
              role="menuitem"
              onClick={close}
              style={itemStyle}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
            >
              {label}
            </Link>
          ))}

          {/* ── Weekly usage summary — FREE users only. Premium members have no
                limits, so no bars: the PRO card above is their whole status. ── */}
          {!premium && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
              <div style={{ padding: '4px 8px 8px' }}>
                {usage ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <UsageBar used={usage.jdViewsUsed} limit={usage.jdViewsLimit ?? 20} label="JD views" />
                    <UsageBar used={usage.applyClicksUsed} limit={usage.applyClicksLimit ?? 15} label="Apply clicks" />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Resets {resetDayLabel(usage.weekResetAt)}
                    </span>
                  </div>
                ) : (
                  <div className="skeleton" style={{ height: 34, borderRadius: 6 }} />
                )}
              </div>
            </>
          )}

          <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />

          <button
            role="menuitem"
            onClick={() => { close(); onLogout(); }}
            style={{
              ...itemStyle,
              width: '100%', textAlign: 'left',
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
          >
            <LogOut size={13} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}