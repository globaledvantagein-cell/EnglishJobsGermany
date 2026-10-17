'use client';

/**
 * The shared match screen: header + profile strip, a sticky filter toolbar,
 * a ranked list on the left and a sticky "why this matches" pane on the right.
 *
 * Used by /smart-match and /today-matches, and by their /admin twins
 * (embedded → tighter spacing, sticky offsets for the admin shell). Pages only
 * fetch data and map it to MatchItem[]; everything visual lives here.
 *
 * Keyboard: j/k or ↑/↓ move through the list, o opens the full job.
 *
 * Below 900px the detail opens as a full-screen sheet rendered in a portal on
 * <body>: the public <main> keeps a transform from its entrance animation,
 * which would otherwise trap a position:fixed sheet inside the page.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Building2, Calendar, ExternalLink, Laptop, MapPin, Search } from 'lucide-react';
import { Link } from '@/compat/router';
import CompanyLogo from '../CompanyLogo';
import SaveJobButton from '../SaveJobButton';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { ResumeProfile } from '../../utils/resumeMatchApi';
import { TIER_LABEL, type MatchItem, type MatchTier } from './matchItem';
import { ProfileStrip, ScoreBadge, ScoreRing, SkillChips, fmtRelative } from './MatchParts';
import './matches.css';

type TierFilter = 'all' | MatchTier;
type SortKey = 'score' | 'newest' | 'company';

const TIERS: MatchTier[] = ['strong', 'good', 'partial'];

interface Props {
  title: string;
  subtitle: ReactNode;
  items: MatchItem[];
  profile?: ResumeProfile | null;
  /** Buttons for the header (Run again, Refresh…). */
  actions?: ReactNode;
  /** Small text next to the actions (e.g. "updated 2h ago"). */
  meta?: ReactNode;
  /** Shown between the header and the toolbar (warnings, stale-result notes). */
  banner?: ReactNode;
  /** Rendered instead of the list when there is nothing to show. */
  state?: ReactNode;
  loading?: boolean;
  embedded?: boolean;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
}

export default function MatchWorkspace({
  title, subtitle, items, profile, actions, meta, banner, state, loading, embedded,
}: Props) {
  const [tier, setTier] = useState<TierFilter>('all');
  const [workplace, setWorkplace] = useState('');
  const [sort, setSort] = useState<SortKey>('score');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const isNarrow = useMediaQuery('(max-width: 900px)');

  const tierCounts = useMemo(() => {
    const counts: Record<TierFilter, number> = { all: items.length, strong: 0, good: 0, partial: 0 };
    items.forEach(item => { counts[item.tier]++; });
    return counts;
  }, [items]);

  const workplaces = useMemo(() => [...new Set(items.map(i => i.workplace).filter(Boolean) as string[])].sort(), [items]);
  const hasDates = items.some(i => i.postedAt);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter(item =>
      (tier === 'all' || item.tier === tier)
      && (!workplace || item.workplace === workplace)
      && (!q || item.title.toLowerCase().includes(q) || item.company.toLowerCase().includes(q)
        || item.location.toLowerCase().includes(q) || item.matched.some(s => s.toLowerCase().includes(q))));
    const sorted = [...filtered];
    if (sort === 'score') sorted.sort((a, b) => b.score - a.score);
    if (sort === 'company') sorted.sort((a, b) => a.company.localeCompare(b.company) || b.score - a.score);
    if (sort === 'newest') sorted.sort((a, b) => new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime());
    return sorted;
  }, [items, tier, workplace, query, sort]);

  const visibleIds = useMemo(() => visible.map(i => i.id), [visible]);
  // Falls back to the top result whenever the selection is filtered out.
  const effectiveId = selectedId && visibleIds.includes(selectedId) ? selectedId : visibleIds[0] ?? null;
  const selected = visible.find(i => i.id === effectiveId) ?? null;

  // Keep the selected row in view while stepping with the keyboard. Only
  // keyboard moves scroll: on first load the top row may sit below the fold
  // (phones), and scrolling the page there would hide the header.
  const scrollOnSelectRef = useRef(false);
  useEffect(() => {
    if (!effectiveId || !scrollOnSelectRef.current) return;
    scrollOnSelectRef.current = false;
    listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(effectiveId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [effectiveId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const step = e.key === 'j' || e.key === 'ArrowDown' ? 1 : e.key === 'k' || e.key === 'ArrowUp' ? -1 : 0;
      if (step && visibleIds.length) {
        e.preventDefault();
        const index = effectiveId ? visibleIds.indexOf(effectiveId) : -1;
        scrollOnSelectRef.current = true;
        setSelectedId(visibleIds[Math.min(visibleIds.length - 1, Math.max(0, index + step))]);
      } else if (e.key === 'o' && effectiveId) {
        window.open(`/jobs/${effectiveId}`, '_blank', 'noopener');
      } else if (e.key === 'Escape') {
        setSheetOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visibleIds, effectiveId]);

  const select = (id: string) => { setSelectedId(id); setSheetOpen(true); };
  const showSheet = isNarrow && sheetOpen && selected !== null;

  // The sheet covers the page; stop the page behind it from scrolling.
  useEffect(() => {
    if (!showSheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [showSheet]);

  // Group headers only make sense while the list is ranked by score.
  const grouped = sort === 'score' && tier === 'all';

  return (
    <div className="mx" data-embedded={embedded ? 'true' : undefined}>
      <header className="mx-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="mx-title">{title}</h1>
          <p className="mx-sub">{subtitle}</p>
        </div>
        <div className="mx-head-actions">
          {meta && <span className="mx-meta">{meta}</span>}
          {actions}
        </div>
        {profile && <ProfileStrip profile={profile} />}
      </header>

      {banner}

      {state ?? (
        <>
          <div className="mx-toolbar" role="toolbar" aria-label="Filter matches">
            <div className="mx-seg" role="group" aria-label="Match strength">
              {(['all', ...TIERS] as TierFilter[]).map(value => (
                <button key={value} type="button" aria-pressed={tier === value} onClick={() => setTier(value)} disabled={value !== 'all' && tierCounts[value] === 0}>
                  {value === 'all' ? 'All' : TIER_LABEL[value].replace(' match', '')}
                  <span className="mx-seg-count">{tierCounts[value]}</span>
                </button>
              ))}
            </div>
            {workplaces.length > 1 && (
              <select className="mx-select" value={workplace} onChange={e => setWorkplace(e.target.value)} aria-label="Workplace">
                <option value="">Any workplace</option>
                {workplaces.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            )}
            <select className="mx-select" value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort">
              <option value="score">Best match</option>
              {hasDates && <option value="newest">Newest</option>}
              <option value="company">Company A–Z</option>
            </select>
            <span className="mx-grow" />
            <label className="mx-search">
              <Search size={14} />
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Title, company or skill" aria-label="Search matches" />
            </label>
            <span className="mx-count">{visible.length} of {items.length}</span>
          </div>

          <div className="mx-split">
            <div className="mx-list" ref={listRef} aria-label="Matches">
              {loading && items.length === 0 ? (
                Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="mx-row" style={{ cursor: 'default' }}>
                    <span className="mx-skel" style={{ width: 28, height: 28 }} />
                    <span><span className="mx-skel" style={{ display: 'block', height: 12, width: '70%' }} /><span className="mx-skel" style={{ display: 'block', height: 10, width: '45%', marginTop: 6 }} /></span>
                    <span className="mx-skel" style={{ width: 42, height: 24 }} />
                  </div>
                ))
              ) : visible.length === 0 ? (
                <div className="mx-empty-detail">No matches for these filters.</div>
              ) : (
                visible.map((item, index) => {
                  const showGroup = grouped && (index === 0 || visible[index - 1].tier !== item.tier);
                  return (
                    <div key={item.id}>
                      {showGroup && (
                        <div className="mx-group-head">
                          <span className="mx-dot" data-tone={item.tier === 'strong' ? 'ok' : item.tier === 'good' ? undefined : 'warn'} style={item.tier === 'good' ? { background: 'var(--info)' } : undefined} />
                          {TIER_LABEL[item.tier]} · {tierCounts[item.tier]}
                        </div>
                      )}
                      <MatchRow item={item} selected={item.id === effectiveId} onSelect={() => select(item.id)} />
                    </div>
                  );
                })
              )}
            </div>

            <aside className="mx-detail" aria-label="Match details">
              {selected
                ? <MatchDetail item={selected} onBack={() => setSheetOpen(false)} />
                : <div className="mx-empty-detail">{loading ? 'Loading…' : 'Select a match to see why it fits.'}</div>}
            </aside>
            {showSheet && createPortal(
              <div className="mx mx-sheet" role="dialog" aria-modal="true" aria-label="Match details">
                <MatchDetail item={selected} onBack={() => setSheetOpen(false)} />
              </div>,
              document.body,
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MatchRow({ item, selected, onSelect }: { item: MatchItem; selected: boolean; onSelect: () => void }) {
  const sub = [item.company, item.location].filter(Boolean).join(' · ');
  return (
    <button type="button" className="mx-row" data-id={item.id} aria-current={selected ? 'true' : undefined} onClick={onSelect}>
      <CompanyLogo companyName={item.company} size={28} />
      <span style={{ minWidth: 0 }}>
        <span className="mx-row-title" style={{ display: 'block' }} title={item.title}>{item.title}</span>
        <span className="mx-row-sub" style={{ display: 'block' }} title={sub}>
          {sub}{item.workplace ? ` · ${item.workplace}` : ''}
        </span>
        {item.matched.length > 0 && (
          <span className="mx-row-skills">
            {item.matched.slice(0, 4).map(s => <span key={s} className="mx-chip" data-kind="matched">{s}</span>)}
            {item.matched.length > 4 && <span className="mx-chip" data-kind="outline">+{item.matched.length - 4}</span>}
          </span>
        )}
      </span>
      <span className="mx-row-side">
        <ScoreBadge score={item.score} tier={item.tier} />
        {item.requiredCount != null && <span className="mx-coverage">{item.matched.length}/{item.requiredCount} skills</span>}
        {item.requiredCount == null && item.missing.length > 0 && <span className="mx-coverage">{item.missing.length} gap{item.missing.length === 1 ? '' : 's'}</span>}
      </span>
    </button>
  );
}

function MatchDetail({ item, onBack }: { item: MatchItem; onBack: () => void }) {
  const coverage = item.requiredCount ? Math.round((item.matched.length / item.requiredCount) * 100) : null;
  const posted = fmtRelative(item.postedAt);

  return (
    <>
      <div className="mx-detail-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <button type="button" className="mx-btn mx-back" data-variant="ghost" onClick={onBack} style={{ marginBottom: 8, paddingLeft: 4 }}>
            <ArrowLeft size={14} />All matches
          </button>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <CompanyLogo companyName={item.company} size={36} />
            <div style={{ minWidth: 0 }}>
              <h2 className="mx-detail-title">{item.title}</h2>
              <div className="mx-detail-sub">
                {item.company && <span><Building2 size={13} />{item.company}</span>}
                {item.location && <span><MapPin size={13} />{item.location}</span>}
                {item.workplace && <span><Laptop size={13} />{item.workplace}</span>}
                {posted && <span><Calendar size={13} />Posted {posted}</span>}
              </div>
            </div>
          </div>
        </div>
        <ScoreRing score={item.score} tier={item.tier} caption={item.source === 'smart' ? 'AI' : 'MATCH'} />
      </div>

      <div className="mx-detail-body">
        <div>
          <div className="mx-section-label">{TIER_LABEL[item.tier]}{item.experience ? ` · ${item.experience} level` : ''}{item.category ? ` · ${item.category}` : ''}</div>
          {item.reasoning
            ? <p className="mx-why">{item.reasoning}</p>
            : coverage != null && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 5 }}>
                  <span>You have <strong>{item.matched.length}</strong> of the <strong>{item.requiredCount}</strong> skills this job lists</span>
                  <strong>{coverage}%</strong>
                </div>
                <div className="mx-bar"><span style={{ width: `${coverage}%` }} /></div>
              </div>
            )}
        </div>

        {item.fits.length > 0 && (
          <dl className="mx-fits">
            {item.fits.map(fit => (
              <div key={fit.label}>
                <dt>{fit.label}</dt>
                <dd><span className="mx-dot" data-tone={fit.tone} />{fit.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {item.matched.length > 0 && (
          <div>
            <div className="mx-section-label">Skills you have · {item.matched.length}</div>
            <SkillChips skills={item.matched} kind="matched" />
          </div>
        )}
        {item.missing.length > 0 && (
          <div>
            <div className="mx-section-label">Gaps to address · {item.missing.length}</div>
            <SkillChips skills={item.missing} kind="missing" />
          </div>
        )}
        {item.bonus.length > 0 && (
          <div>
            <div className="mx-section-label">Extra strengths you bring · {item.bonus.length}</div>
            <SkillChips skills={item.bonus} kind="bonus" />
          </div>
        )}
        {item.source === 'skills' && item.requiredCount != null && item.requiredCount > item.matched.length && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--subtle-ink)' }}>
            {item.requiredCount - item.matched.length} more skill{item.requiredCount - item.matched.length === 1 ? '' : 's'} listed on the job. Open it to see the full requirements.
          </p>
        )}
      </div>

      <div className="mx-detail-actions">
        <SaveJobButton jobId={item.id} />
        <span className="mx-grow" />
        {item.applyUrl && (
          <a className="mx-btn" href={item.applyUrl} target="_blank" rel="noopener noreferrer">
            Company site <ExternalLink size={13} />
          </a>
        )}
        <Link to={`/jobs/${item.id}`} className="mx-btn" data-variant="primary">View full job</Link>
      </div>
    </>
  );
}
