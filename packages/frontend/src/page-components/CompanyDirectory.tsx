'use client';

import { useCallback, useEffect, useMemo, useState, memo, type ReactNode } from 'react';
import { useNavigate } from '@/compat/router';
import { ExternalLink, MapPin, Search, Pencil, Globe } from 'lucide-react';
import { companiesPage } from '../theme/companies-content';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { apiGet, apiPatch } from '../utils/jobApi';
import { useAuth } from '../context/AuthContext';
import CompanyLogo from '../components/CompanyLogo';

interface Company {
  companyName: string;
  source: 'scraped' | 'manual';
  openRoles: number;
  cities?: string[];
  careersUrl?: string;
  domain?: string;
  /** Admin-authored, from the companyProfiles collection. */
  description?: string | null;
  website?: string | null;
  logo?: string | null;
}

// Raw ATS locations arrive messy: "Munich Hybrid (navvis Gmbh)", "Munich Onsite
// (navvis Gmbh)". Strip the parenthetical, drop trailing workplace-type words,
// take the leading city, then dedupe case-insensitively. Returns up to `max`
// unique cities plus how many were hidden.
const WORKPLACE_WORDS_RE = /\b(hybrid|remote|on-?site|office|flexible)\b/gi;

function cleanCities(cities: string[] | undefined, max = 3): { shown: string[]; extra: number } {
  if (!cities || cities.length === 0) return { shown: [], extra: 0 };

  const seen = new Set<string>();
  const unique: string[] = [];

  for (const raw of cities) {
    const cleaned = String(raw)
      .replace(/\([^)]*\)/g, '')       // drop "(navvis Gmbh)"
      .replace(WORKPLACE_WORDS_RE, '') // drop "Hybrid"/"Onsite"/…
      .split(',')[0]                   // keep the leading city token
      .replace(/[;·|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cleaned);
  }

  return { shown: unique.slice(0, max), extra: Math.max(0, unique.length - max) };
}

const CompanyCard = memo(function CompanyCard({
  company, isAdmin, onEdit,
}: { company: Company; isAdmin: boolean; onEdit: (c: Company) => void }) {
  const navigate = useNavigate();
  const isScraped = company.source === 'scraped';

  const handleClick = () => {
    if (company.source === 'scraped') {
      navigate(`/jobs?company=${encodeURIComponent(company.companyName)}`);
    } else if (company.careersUrl) {
      window.open(company.careersUrl, '_blank', 'noopener,noreferrer');
    } else if (company.domain) {
      window.open(`https://${company.domain}/careers`, '_blank', 'noopener,noreferrer');
    } else {
      navigate('/jobs');
    }
  };

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={company.companyName}
      onClick={handleClick}
      onKeyDown={e => { if (e.key === 'Enter') handleClick(); }}
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        outline: 'none',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--primary)';
        e.currentTarget.style.boxShadow = '0 6px 20px 0 rgba(0,0,0,0.06)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
      title={isScraped ? 'Browse jobs at this company' : 'Visit careers page'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <CompanyLogo companyName={company.companyName} domain={company.domain || company.careersUrl || undefined} size={40} />
        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>{company.companyName}</div>
        {isAdmin && (
          <button
            type="button"
            aria-label={`Edit ${company.companyName} description`}
            title="Edit description"
            onClick={e => { e.stopPropagation(); onEdit(company); }}
            style={{
              background: 'none', border: 'none', padding: 4, cursor: 'pointer',
              color: 'var(--text-muted)', display: 'inline-flex', borderRadius: 6,
              transition: 'color 160ms cubic-bezier(0.23, 1, 0.32, 1)',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Pencil size={13} />
          </button>
        )}
      </div>

      {company.description && (
        <p style={{
          fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.55,
          marginTop: 8, marginBottom: 0,
        }}>
          {company.description}
        </p>
      )}

      {company.website && (
        <a
          href={company.website}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            fontSize: '0.76rem', color: 'var(--primary)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8,
          }}
        >
          <Globe size={11} /> Website
        </a>
      )}

      {(() => {
        const { shown, extra } = cleanCities(company.cities);
        if (shown.length === 0) return null;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 10 }}>
            <MapPin size={12} style={{ marginRight: 2, flexShrink: 0 }} />
            {shown.join(', ')}{extra > 0 ? ` +${extra} more` : ''}
          </div>
        );
      })()}
      <div style={{ fontSize: '0.78rem', fontWeight: isScraped ? 600 : 500, color: isScraped ? 'var(--primary)' : 'var(--text-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        {isScraped
          ? <>{companiesPage.scrapedLabel(company.openRoles)}<span style={{ fontSize: 14, marginLeft: 2 }}>→</span></>
          : <>{companiesPage.manualLabel}<ExternalLink size={11} style={{ marginLeft: 3, marginBottom: 1 }} /></>}
      </div>
    </div>
  );
});

function SkeletonCard() {
  return (
    <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', minHeight: 92, display: 'flex', flexDirection: 'column', gap: 10, animation: 'pulse 1.2s infinite ease-in-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--border)', opacity: 0.5 }} />
        <div style={{ width: 90, height: 14, borderRadius: 4, background: 'var(--border)', opacity: 0.5 }} />
      </div>
      <div style={{ width: 70, height: 10, borderRadius: 4, background: 'var(--border)', opacity: 0.4, marginTop: 10 }} />
      <div style={{ width: 120, height: 10, borderRadius: 4, background: 'var(--border)', opacity: 0.3, marginTop: 6 }} />
    </div>
  );
}

// ── Admin: edit a company description ────────────────────────────────────────
// Modal, not a separate page — the admin is already looking at the directory,
// so editing in place beats a context switch.
//
// Motion: modals are NOT anchored to a trigger, so transform-origin stays
// centred (unlike a popover). Enters from scale(0.97) + opacity, never
// scale(0). 180ms on a strong ease-out — under the 300ms UI ceiling.
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

function EditCompanyModal({
  company, onClose, onSaved,
}: { company: Company; onClose: () => void; onSaved: (c: Company) => void }) {
  const [description, setDescription] = useState(company.description || '');
  const [website, setWebsite] = useState(company.website || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  // Next frame, so the browser has a start value to transition FROM.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiPatch<{ profile: { description?: string; website?: string | null; logo?: string | null } }>(
        `/api/admin/company-profiles/${encodeURIComponent(company.companyName)}`,
        { description, website },
      );
      onSaved({
        ...company,
        description: res.profile?.description || null,
        website: res.profile?.website || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        opacity: shown ? 1 : 0,
        transition: `opacity 180ms ${EASE_OUT}`,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${company.companyName}`}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: 20, width: '100%', maxWidth: 460,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          opacity: shown ? 1 : 0,
          transform: shown ? 'scale(1)' : 'scale(0.97)',
          transition: `opacity 180ms ${EASE_OUT}, transform 180ms ${EASE_OUT}`,
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
          {company.companyName}
        </h2>
        <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 14 }}>
          Shown on the public directory card.
        </p>

        <label htmlFor="cp-desc" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
          Description
        </label>
        <textarea
          id="cp-desc"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          placeholder="What does this company do?"
          style={{
            width: '100%', padding: '10px 12px', fontSize: '0.85rem', fontFamily: 'inherit',
            background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
            border: '1px solid var(--border)', borderRadius: 8, outline: 'none',
            resize: 'vertical', marginBottom: 12,
          }}
        />

        <label htmlFor="cp-site" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
          Website
        </label>
        <input
          id="cp-site"
          value={website}
          onChange={e => setWebsite(e.target.value)}
          placeholder="https://example.com"
          style={{
            width: '100%', height: 38, padding: '0 12px', fontSize: '0.85rem', fontFamily: 'inherit',
            background: 'var(--bg-surface-2)', color: 'var(--text-primary)',
            border: '1px solid var(--border)', borderRadius: 8, outline: 'none',
            marginBottom: 12,
          }}
        />

        {error && <p style={{ fontSize: '0.78rem', color: 'var(--error)', marginBottom: 10 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              height: 36, padding: '0 14px', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontSize: '0.84rem', fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{
              height: 36, padding: '0 16px', borderRadius: 8,
              cursor: saving ? 'not-allowed' : 'pointer',
              background: 'var(--primary)', border: '1px solid var(--primary)',
              color: '#fff', fontSize: '0.84rem', fontWeight: 600, fontFamily: 'inherit',
              transition: `transform 120ms ${EASE_OUT}`,
            }}
            onPointerDown={e => { if (!saving) e.currentTarget.style.transform = 'scale(0.97)'; }}
            onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * `header` is the page's <h1> + intro prose, passed in from the server page
 * (app/directory/page.tsx) so it is plain server-rendered HTML: this component
 * is a client component whose company list arrives from the browser, and the
 * heading must not depend on that.
 */
export default function CompanyDirectory({ header }: { header?: ReactNode }) {
  const { isAdmin } = useAuth();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCount, setShowCount] = useState(30);
  const [editing, setEditing] = useState<Company | null>(null);

  const handleSaved = useCallback((updated: Company) => {
    setCompanies(prev => (prev || []).map(c => (c.companyName === updated.companyName ? updated : c)));
    setEditing(null);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    apiGet<Company[]>('/api/jobs/directory', { signal: ctrl.signal, noAuth: true })
      .then(data => setCompanies(Array.isArray(data) ? data : []))
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, []);

  const sortedCompanies = useMemo(() => {
    if (!companies) return [];
    const scraped = companies.filter(c => c.source === 'scraped').sort((a, b) => b.openRoles - a.openRoles);
    const manual = companies.filter(c => c.source === 'manual').sort((a, b) => a.companyName.localeCompare(b.companyName));
    return [...scraped, ...manual];
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return sortedCompanies;
    const q = search.trim().toLowerCase();
    return sortedCompanies.filter(c => (c.companyName || '').toLowerCase().includes(q));
  }, [sortedCompanies, search]);

  const totalCompanies = sortedCompanies.length;
  const totalRoles = sortedCompanies.reduce((sum, c) => sum + (c.openRoles || 0), 0);

  const visibleCompanies = search.trim() ? filteredCompanies : filteredCompanies.slice(0, showCount);
  const moreRemaining = search.trim() ? 0 : Math.max(0, filteredCompanies.length - showCount);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  const gridCols = isMobile ? 'repeat(1, 1fr)' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)';

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', paddingBottom: 48 }}>
      <div style={{
        background: 'linear-gradient(180deg, rgba(147,197,253,0.18) 0%, rgba(134,239,172,0.10) 50%, transparent 100%)',
        paddingTop: 60, paddingBottom: 48, marginBottom: 32, textAlign: 'center',
      }}>
        {header}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowCount(30); }}
              placeholder="Search companies..."
              style={{
                width: '100%', height: 42, borderRadius: 22, background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                paddingLeft: 40, fontSize: '0.88rem', fontFamily: 'inherit', color: 'var(--text-primary)', outline: 'none',
              }}
            />
          </div>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          {totalCompanies} companies · {totalRoles} open roles
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px', marginTop: 38, marginBottom: 10, textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--text-primary)', marginBottom: 2 }}>{companiesPage.sectionTitle}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 18 }}>{companiesPage.sectionSubtitle}</div>
      </div>

      <div
        style={{
          display: 'grid', gap: 14, margin: '0 auto', maxWidth: 1100,
          padding: '0 16px', width: '100%', gridTemplateColumns: gridCols,
        }}
        className="company-directory-grid"
      >
        {loading ? (
          Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)
        ) : visibleCompanies.length > 0 ? (
          visibleCompanies.map((company, i) => (
            <CompanyCard key={company.companyName + i} company={company} isAdmin={isAdmin} onEdit={setEditing} />
          ))
        ) : (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', fontSize: '1.02rem', margin: '32px 0' }}>No companies match your search</div>
        )}
      </div>

      {!search.trim() && moreRemaining > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <button
            onClick={() => setShowCount(c => c + 30)}
            style={{
              height: 40, padding: '0 28px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 10,
              fontSize: '0.92rem', fontWeight: 500, cursor: 'pointer', transition: 'border-color 0.2s, color 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            Load more
          </button>
        </div>
      )}

      <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', textAlign: 'center', maxWidth: 600, margin: '32px auto 0' }}>
        {companiesPage.disclaimer}
      </div>

      {editing && (
        <EditCompanyModal
          company={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}