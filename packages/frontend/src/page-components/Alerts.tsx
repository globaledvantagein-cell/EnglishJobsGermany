'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/compat/router';
import { Sparkles, CheckCircle, Briefcase, Globe, ArrowRight, Shield, Mail, Check, Bell } from 'lucide-react';
import { Button, FormField, Input, Select, Alert } from '../components/ui';
import { CONTENT } from '../theme/content';
import { useAuth } from '../context/AuthContext';
import { apiGet, apiPost } from '../utils/jobApi';

/**
 * Weekly Job Alerts subscription page.
 * Not auth — just adds the user to the talent pool for the weekly digest.
 */

const COUNTRIES = CONTENT.signup.countries;
const CATEGORY_OPTIONS = CONTENT.signup.form.categoryOptions;

const TRUST = [
  { icon: <Mail size={14} />,   text: CONTENT.signup.leftPanel.perks[0] },
  { icon: <Shield size={14} />, text: CONTENT.signup.leftPanel.perks[1] },
  { icon: <Globe size={14} />,  text: CONTENT.signup.leftPanel.perks[2] },
];

type Status = 'idle' | 'loading' | 'success' | 'error' | 'already_subscribed';

export default function Alerts() {
  const { isAuthenticated, token } = useAuth();
  const [fd, setFd] = useState({
    name: '',
    email: '',
    domain: 'Tech' as 'Tech' | 'Non-Tech',
    location: '',
    desiredCategories: [] as string[],
  });
  const [status, setStatus] = useState<Status>('idle');
  const [err, setErr] = useState('');

  // Check if logged-in user is already subscribed + prefill from profile
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    apiGet<any>('/api/auth/me')
      .then(profile => {
        if (profile.isSubscribed) setStatus('already_subscribed');
        setFd(prev => ({
          ...prev,
          name: profile.name || prev.name,
          email: profile.email || prev.email,
        }));
      })
      .catch(() => {});
  }, [isAuthenticated, token]);

  const toggleCategory = (value: string) => {
    setFd(prev => ({
      ...prev,
      desiredCategories: prev.desiredCategories.includes(value)
        ? prev.desiredCategories.filter(c => c !== value)
        : [...prev.desiredCategories, value],
    }));
  };

  const handleDomainSwitch = (nextDomain: 'Tech' | 'Non-Tech') => {
    if (fd.domain === nextDomain) return;
    setFd(prev => ({ ...prev, domain: nextDomain, desiredCategories: [] }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fd.location.startsWith('---')) return;

    if (fd.desiredCategories.length === 0) {
      setErr('Please select at least one job category.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErr('');
    try {
      await apiPost('/api/auth/talent-pool', {
        name: fd.name,
        email: fd.email,
        location: fd.location,
        desiredCategories: fd.desiredCategories,
      }, { noAuth: true });
      setStatus('success');
    } catch (e: any) {
      setStatus('error');
      setErr(e.message || CONTENT.signup.fallbackError);
    }
  };

  const subCategoryOptions = CATEGORY_OPTIONS[fd.domain] || [];

  if (status === 'already_subscribed') {
    return <AlreadySubscribed />;
  }

  if (status === 'success') {
    return <SuccessState />;
  }

  return (
    <div style={{ minHeight: '90vh', display: 'flex', background: 'var(--paper)' }}>
      <BrandPanel />

      <div className="signup-form-panel" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div className="anim-up" style={{ width: '100%', maxWidth: 440 }}>
          <div className="md:hidden" style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ width: 46, height: 46, background: 'var(--primary-soft)', border: '1.25px solid var(--primary)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', margin: '0 auto 14px' }}>
              <Sparkles size={20} />
            </div>
          </div>

          <div style={{ background: 'var(--surface-solid)', border: '1.25px solid var(--border)', borderRadius: 18, padding: '36px 32px', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ marginBottom: 28 }}>
              {/* The page's only heading, so it is the <h1>. */}
              <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 6 }}>Weekly Job Alerts</h1>
              <p style={{ color: 'var(--subtle-ink)', fontSize: '0.9rem' }}>{CONTENT.signup.form.subtitle}</p>
            </div>
            {status === 'error' && <div style={{ marginBottom: 18 }}><Alert type="error">{err}</Alert></div>}
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {isAuthenticated ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--paper2)', border: '1.25px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary-soft)', border: '1.25px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 700, flexShrink: 0 }}>
                    {fd.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fd.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fd.email}</div>
                  </div>
                </div>
              ) : (
                <>
                  <FormField label={CONTENT.signup.form.labels.fullName}>
                    <Input type="text" required placeholder={CONTENT.signup.form.placeholders.fullName} value={fd.name} onChange={e => setFd({ ...fd, name: e.target.value })} />
                  </FormField>
                  <FormField label={CONTENT.signup.form.labels.email}>
                    <Input type="email" required placeholder={CONTENT.signup.form.placeholders.email} value={fd.email} onChange={e => setFd({ ...fd, email: e.target.value })} />
                  </FormField>
                </>
              )}

              <div>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted-ink)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Briefcase size={11} />{CONTENT.signup.form.labels.jobInterest}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {CONTENT.signup.form.domainOptions.map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleDomainSwitch(v as 'Tech' | 'Non-Tech')}
                      style={{
                        padding: '11px', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600,
                        background: fd.domain === v ? 'var(--primary-soft)' : 'var(--paper2)',
                        color: fd.domain === v ? 'var(--primary)' : 'var(--muted-ink)',
                        border: `1.25px solid ${fd.domain === v ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 10, cursor: 'pointer', transition: 'background 0.22s, color 0.22s, border-color 0.22s',
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted-ink)', marginBottom: 8, letterSpacing: '0.04em' }}>
                  Select categories you're interested in
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {subCategoryOptions.map(option => {
                    const isSelected = fd.desiredCategories.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleCategory(option.value)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '7px 12px', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
                          borderRadius: 8, cursor: 'pointer', transition: 'background 0.18s, color 0.18s, border-color 0.18s',
                          border: isSelected ? '1.25px solid var(--acid)' : '1.25px solid var(--border)',
                          background: isSelected ? 'var(--acid-soft)' : 'var(--paper2)',
                          color: isSelected ? 'var(--acid)' : 'var(--muted-ink)',
                        }}
                      >
                        {isSelected && <Check size={12} strokeWidth={3} />}
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {fd.desiredCategories.length === 0 && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--subtle-ink)', marginTop: 6, fontStyle: 'italic' }}>
                    Tap to select at least one category
                  </p>
                )}
              </div>

              <FormField label={CONTENT.signup.form.labels.currentCountry}>
                <Select required value={fd.location} onChange={e => setFd({ ...fd, location: e.target.value })}>
                  <option value="" disabled>{CONTENT.signup.form.countryPlaceholder}</option>
                  {COUNTRIES.map((c, i) => <option key={i} value={c} disabled={c.startsWith('---')}>{c}</option>)}
                </Select>
              </FormField>
              <Button loading={status === 'loading'} style={{ width: '100%', justifyContent: 'center', padding: '13px', marginTop: 4 }}>
                <Sparkles size={14} />{CONTENT.signup.form.submitCta}
              </Button>
            </form>
            {!isAuthenticated && (
              <p style={{ textAlign: 'center', marginTop: 18, fontSize: '0.875rem', color: 'var(--subtle-ink)' }}>
                Want full access?{' '}
                <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
                  Sign in with Google
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── States ────────────────────────────────────────────────────────────────

function BrandPanel() {
  return (
    <div className="hidden md:flex" style={{ flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '48px', background: 'var(--paper2)', borderRight: '1.25px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
      <div className="grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.4 }} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 360, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, background: 'var(--primary-soft)', border: '1.25px solid var(--primary)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', margin: '0 auto 24px' }}>
          <Sparkles size={24} />
        </div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 12 }}>{CONTENT.signup.leftPanel.heading}</h2>
        <p style={{ color: 'var(--muted-ink)', marginBottom: 36, lineHeight: 1.65, fontSize: '0.95rem' }}>{CONTENT.signup.leftPanel.subtitle}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
          {TRUST.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted-ink)', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--primary)', flexShrink: 0 }}>{t.icon}</span>{t.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SuccessState() {
  return (
    <div style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', padding: 24, position: 'relative', overflow: 'hidden' }}>
      <div className="orb" style={{ width: 400, height: 400, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--primary-soft)' }} />
      <div className="anim-scale" style={{ textAlign: 'center', padding: 56, maxWidth: 400, position: 'relative', zIndex: 1, background: 'var(--surface-solid)', border: '1.25px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ width: 58, height: 58, background: 'var(--success-soft)', border: '1.25px solid var(--success)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', margin: '0 auto 22px' }}>
          <CheckCircle size={26} />
        </div>
        <h2 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>{CONTENT.signup.success.heading}</h2>
        <p style={{ color: 'var(--muted-ink)', lineHeight: 1.75, marginBottom: 30, fontSize: '0.92rem' }}>{CONTENT.signup.success.subtitle}</p>
        <Link to="/jobs"><Button>{CONTENT.signup.success.cta} <ArrowRight size={14} /></Button></Link>
      </div>
    </div>
  );
}

function AlreadySubscribed() {
  return (
    <div style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', padding: 24, position: 'relative', overflow: 'hidden' }}>
      <div className="orb" style={{ width: 400, height: 400, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--primary-soft)' }} />
      <div className="anim-scale" style={{ textAlign: 'center', padding: 56, maxWidth: 420, position: 'relative', zIndex: 1, background: 'var(--surface-solid)', border: '1.25px solid var(--border)', borderRadius: 18, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ width: 58, height: 58, background: 'var(--primary-soft)', border: '1.25px solid var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', margin: '0 auto 22px' }}>
          <Bell size={26} />
        </div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>You're already subscribed</h2>
        <p style={{ color: 'var(--muted-ink)', lineHeight: 1.75, marginBottom: 30, fontSize: '0.92rem' }}>
          You're receiving weekly job alerts. You can manage your email preferences from your profile.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/profile"><Button>Manage Preferences</Button></Link>
          <Link to="/jobs"><Button style={{ background: 'var(--paper2)', color: 'var(--ink)', border: '1.25px solid var(--border)' }}>Browse Jobs <ArrowRight size={14} /></Button></Link>
        </div>
      </div>
    </div>
  );
}