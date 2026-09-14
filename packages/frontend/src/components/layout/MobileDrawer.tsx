'use client';

import { Link } from '@/compat/router';
import { LogOut, User as UserIcon, X } from 'lucide-react';
import { Badge, Button } from '../ui';
import { USER_MENU_LINKS } from './navLinks';

interface User {
  name: string;
}

interface Props {
  open: boolean;
  closing: boolean;
  links: ReadonlyArray<readonly [string, string]>;
  isActive: (path: string) => boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  user: User | null;
  onClose: () => void;
  onLogout: () => void;
}

function DrawerLink({
  path, label, active, onClick,
}: { path: string; label: string; active: boolean; onClick: () => void }) {
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '13px 20px',
    fontSize: '1rem',
    fontWeight: 600,
    color: active ? 'var(--acid)' : 'var(--text-primary)',
    textDecoration: 'none',
    borderLeft: active ? '3px solid var(--acid)' : '3px solid transparent',
    background: active ? 'var(--acid-soft)' : 'transparent',
    transition: 'background 0.15s, color 0.15s',
  };

  // Every route is a Next.js page now — instant client navigation.
  return (
    <Link to={path} onClick={onClick} style={style}>
      {label}
    </Link>
  );
}

export default function MobileDrawer({
  open, closing, links, isActive, isAuthenticated, isAdmin, user, onClose, onLogout,
}: Props) {
  if (!open) return null;

  return (
    <>
      <div className="nav-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <div
        id="mobile-nav-drawer"
        className={`nav-drawer${closing ? ' closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo.jpeg" alt="English Jobs in Germany" style={{ height: 26, width: 'auto', display: 'block' }} />
            <span style={{ fontFamily: "'Playfair Display',serif", fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              English <span style={{ color: 'var(--primary)' }}>Jobs</span>
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="no-touch-expand"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 6 }}
          >
            <X size={18} />
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto' }} aria-label="Mobile navigation">
          {links.map(([path, label]) => (
            <DrawerLink
              key={path}
              path={path}
              label={label}
              active={isActive(path)}
              onClick={onClose}
            />
          ))}

          {/* Profile / Applied live in the user menu on desktop — the drawer
              has no such menu, so they go here instead of vanishing. */}
          {isAuthenticated && !isAdmin && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
              {USER_MENU_LINKS.map(([path, label]) => (
                <DrawerLink
                  key={path}
                  path={path}
                  label={label}
                  active={isActive(path)}
                  onClick={onClose}
                />
              ))}
            </>
          )}
        </nav>

        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', flexShrink: 0, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {isAuthenticated ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Link
                to="/profile"
                onClick={onClose}
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                <UserIcon size={13} /> {user?.name}
                {isAdmin && <Badge variant="red" style={{ fontSize: '0.58rem', padding: '2px 6px' }}>ADMIN</Badge>}
              </Link>
              <button
                onClick={() => { onLogout(); onClose(); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: '0.9rem', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}
              >
                <LogOut size={14} /> Logout
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <Link to="/login" onClick={onClose} style={{ flex: 1 }}>
                <Button variant="ghost" size="sm" style={{ width: '100%', justifyContent: 'center' }}>Log in</Button>
              </Link>
              <Link to="/signup" onClick={onClose} style={{ flex: 1 }}>
                <Button size="sm" style={{ width: '100%', justifyContent: 'center' }}>Sign up</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}