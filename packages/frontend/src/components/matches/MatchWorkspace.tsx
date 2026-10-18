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
import { ArrowLeft, Building2, Calendar, ExternalLink, Laptop, MapPin, Search, ThumbsDown } from 'lucide-react';
import { Link } from '@/compat/router';
import CompanyLogo from '../CompanyLogo';
import SaveJobButton from '../SaveJobButton';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useSavedJobs } from '../../context/SavedJobsContext';
import {
  DISMISS_REASONS, sendImpressions, sendMatchEvent, undoDismiss,
  type DismissReason, type MatchAction, type MatchSource,
} from '../../utils/matchFeedbackApi';
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
  /** Enables feedback (Not interested + implicit signals) for this source. */
  source?: MatchSource;
  /** Identifies the shown list (e.g. "today:2026-10-17") for impression logging. */
  listId?: string;
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
}

export default function MatchWorkspace({
  title, subtitle, items: allItems, profile, actions, meta, banner, state, loading, embedded, source, listId,
}: Props) {
  // ── Feedback: hidden ("Not interested") jobs and implicit signals ─────────
  const [dismissed, setDismissed] = useState<Map<string, DismissReason>>(new Map());
  const [undo, setUndo] = useState<{ item: MatchItem; reason: DismissReason } | null>(null);
  const openedRef = useRef<Set<string>>(new Set());
  const items = useMemo(() => allItems.filter(i => !dismissed.has(i.id)), [allItems, dismissed]);

  // Position = rank in the list as delivered (before the user re-sorts).
  const context = (item: MatchItem) => ({ position: allItems.findIndex(i => i.id === item.id), listId });
  const track = (item: MatchItem, action: MatchAction) => { if (source) sendMatchEvent(item.id, source, action, undefined, context(item)); };
  const dismiss = (item: MatchItem, reason: DismissReason) => {
    if (!source) return;
    sendMatchEvent(item.id, source, 'dismiss', reason, context(item));
    setDismissed(prev => new Map(prev).set(item.id, reason));
    setUndo({ item, reason });
  };
  const restore = async () => {
    if (!undo) return;
    const { item } = undo;
    setUndo(null);
    setDismissed(prev => { const next = new Map(prev); next.delete(item.id); return next; });
    await undoDismiss(item.id).catch(() => {});
  };
  // Log the shown list once per listId (reloads of the same list are deduped
  // server-side too).
  const impressedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!source || !listId || allItems.length === 0 || impressedRef.current === listId) return;
    impressedRef.current = listId;
    sendImpressions(source, listId, allItems.map(i => i.id));
  }, [source, listId, allItems]);

  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => setUndo(null), 8000);
    return () => window.clearTimeout(id);
  }, [undo]);

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

  // "Opened" counts once per job per visit, and only when the user picks it
  // (or steps to it) — not for the row auto-selected on load.
  useEffect(() => {
    if (!source || !selectedId || openedRef.current.has(selectedId)) return;
    const item = items.find(i => i.id === selectedId);
    if (!item) return;
    openedRef.current.add(selectedId);
    sendMatchEvent(item.id, source, 'open', undefined, { position: allItems.findIndex(i => i.id === item.id), listId });
  }, [selectedId, items, allItems, source, listId]);
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
                ? <MatchDetail key={selected.id} item={selected} onBack={() => setSheetOpen(false)} onTrack={a => track(selected, a)} onDismiss={source ? r => dismiss(selected, r) : undefined} />
                : <div className="mx-empty-detail">{loading ? 'Loading…' : 'Select a match to see why it fits.'}</div>}
            </aside>
            {showSheet && createPortal(
              <div className="mx mx-sheet" role="dialog" aria-modal="true" aria-label="Match details">
                <MatchDetail key={selected.id} item={selected} onBack={() => setSheetOpen(false)} onTrack={a => track(selected, a)} onDismiss={source ? r => { dismiss(selected, r); setSheetOpen(false); } : undefined} />
              </div>,
              document.body,
            )}
          </div>
        </>
      )}

      {undo && (
        <div className="mx-undo" role="status">
          <span>Hidden “{undo.item.title}”. {DISMISS_REASONS.find(r => r.value === undo.reason)?.hint}.</span>
          <button type="button" onClick={restore}>Undo</button>
        </div>
      )}
    </div>
  );
}

function badgeKind(badge: string): string {
  if (badge === 'New') return 'new';
  if (badge === 'Visa sponsorship' || badge === 'Relocation support') return 'ok';
  return 'neutral';
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
          {item.badges.slice(0, 2).map(b => <span key={b} className="mx-badge" data-kind={badgeKind(b)}>{b}</span>)}
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

function MatchDetail({ item, onBack, onTrack, onDismiss }: {
  item: MatchItem;
  onBack: () => void;
  onTrack: (action: MatchAction) => void;
  onDismiss?: (reason: DismissReason) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reason, setReason] = useState<DismissReason | null>(null);
  const { isSaved } = useSavedJobs();
  const closeDialog = () => { setMenuOpen(false); setReason(null); };
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
              {item.badges.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {item.badges.map(b => <span key={b} className="mx-badge" data-kind={badgeKind(b)}>{b}</span>)}
                </div>
              )}
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

        {item.dimensions.length > 0 && (
          <div>
            <div className="mx-section-label">Why this job is a match</div>
            <div className="mx-dims">
              {item.dimensions.map(d => {
                const pct = d.value == null ? null : Math.round(d.value * 100);
                const tone = pct == null ? undefined : pct >= 75 ? 'ok' : pct >= 50 ? 'warn' : 'bad';
                return (
                  <div key={d.key} className="mx-dim" title={pct == null ? 'The posting does not state this' : `${pct}%`}>
                    <div className="mx-dim-head"><span>{d.label}</span><strong>{pct == null ? 'not stated' : `${pct}%`}</strong></div>
                    <div className="mx-bar" data-tone={tone}><span style={{ width: `${pct ?? 0}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
        {/* Capture phase: read the state BEFORE SaveJobButton toggles it. */}
        <span onClickCapture={() => { if (!isSaved(item.id)) onTrack('save'); }}>
          <SaveJobButton jobId={item.id} />
        </span>
        {onDismiss && (
          <button type="button" className="mx-btn" data-variant="ghost" aria-haspopup="dialog" onClick={() => setMenuOpen(true)}>
            <ThumbsDown size={14} />Not interested
          </button>
        )}
        {onDismiss && menuOpen && createPortal(
          // Portal + fixed overlay: the detail pane clips overflow, and the
          // public <main> keeps a transform that would trap a fixed element.
          <div className="mx mx-overlay" onMouseDown={e => { if (e.target === e.currentTarget) closeDialog(); }}>
            <div className="mx-dialog" role="dialog" aria-modal="true" aria-labelledby="mx-dismiss-title"
              onKeyDown={e => { if (e.key === 'Escape') closeDialog(); }}>
              <h2 id="mx-dismiss-title">Tell us why it&apos;s not a fit</h2>
              <p>We&apos;ll use this to refine your matches.</p>
              <div role="radiogroup" aria-label="Reason" className="mx-reasons">
                {DISMISS_REASONS.map(r => (
                  <label key={r.value} className="mx-reason" data-checked={reason === r.value ? 'true' : undefined}>
                    <input type="radio" name="dismiss-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                    <span><strong>{r.label}</strong><small>{r.hint}</small></span>
                  </label>
                ))}
              </div>
              <div className="mx-dialog-foot">
                <button type="button" className="mx-btn" data-variant="ghost" onClick={closeDialog}>Cancel</button>
                <button type="button" className="mx-btn" data-variant="primary" disabled={!reason}
                  onClick={() => { if (reason) { const r = reason; closeDialog(); onDismiss(r); } }}>
                  Submit
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
        <span className="mx-grow" />
        {item.applyUrl && (
          <a className="mx-btn" href={item.applyUrl} target="_blank" rel="noopener noreferrer" onClick={() => onTrack('company_site')}>
            Company site <ExternalLink size={13} />
          </a>
        )}
        <Link to={`/jobs/${item.id}`} className="mx-btn" data-variant="primary" onClick={() => onTrack('view_job')}>View full job</Link>
      </div>
    </>
  );
}
