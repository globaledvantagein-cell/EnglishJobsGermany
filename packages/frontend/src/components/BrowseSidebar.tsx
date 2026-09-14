'use client';

/**
 * Desktop filter rail for /jobs.
 *
 * Same filter state and premium gating as DashboardFilterBar — only the
 * arrangement differs: a vertical accordion in a sticky 300px rail instead of a
 * horizontal bar plus a "More filters" popover. DashboardFilterBar is still the
 * mobile surface (top bar + bottom sheet) and is untouched.
 *
 * Everything is an inline list. There are deliberately NO floating dropdowns in
 * the rail: FilterDropdown always opens downward (top = trigger.bottom + 4 with
 * no flip and no viewport clamp), so a trigger low in the rail put its panel
 * below the fold where it could not be reached. Inline lists also match the
 * checklist pattern the rest of the rail uses.
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Lock, Search } from 'lucide-react';
import SearchWithGhost from './filters/SearchWithGhost';
import { track } from '../utils/analytics';
import {
  FILTER_CONTROL_STYLE,
  DATE_DROPDOWN_OPTIONS,
  WORKPLACE_OPTIONS,
  EXPERIENCE_OPTIONS,
  EMPLOYMENT_OPTIONS,
  type FilterState,
  type DateFilter,
  type FilterDropdownOption,
  type IFacetCounts,
} from '../hooks/jobFilterTypes';

/**
 * The shape this rail actually reads. Deliberately looser than FilterState so
 * RemoteFilterState (no visa/relocation, plus country) is assignable too —
 * the two verticals share the rail but not every field.
 */
export type SidebarFilterState = Omit<FilterState, 'visa' | 'relocation'> & {
  visa?: boolean;
  relocation?: boolean;
  country?: string[];
};

interface Props {
  filters: SidebarFilterState;
  setFilters: React.Dispatch<React.SetStateAction<any>>;
  companyOptions: FilterDropdownOption[];
  categoryOptions: FilterDropdownOption[];
  facetCounts?: IFacetCounts | null;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  clearFilters: () => void;
  isPremium?: boolean;
  onPremiumRequired?: () => void;
  /** Autocomplete endpoint — differs per vertical. */
  autocompleteEndpoint?: string;
  /** Vertical-specific sections rendered after Category. */
  extraFilters?: React.ReactNode;

  /**
   * Which vertical this rail is filtering.
   *   'main'   — Germany board: workplace / visa / relocation all meaningful.
   *   'remote' — every job is remote by definition, so Workplace, Visa and
   *              Relocation are hidden (a filter that can only ever match
   *              everything is noise) and Country takes their place.
   */
  variant?: 'main' | 'remote';
  /** Country facet options; only rendered when variant is 'remote'. */
  countryOptions?: FilterDropdownOption[];
}

/** Which accordion sections start expanded. Category only — it is the filter
 *  most people reach for, and opening more than one fills the rail again. */
const DEFAULT_OPEN: Record<string, boolean> = { category: true };

/** Shared cap for every scrollable list inside a section. */
const LIST_MAX_HEIGHT = 280;

// ─── Building blocks ─────────────────────────────────────────────────────────

/**
 * Collapsible section.
 *
 * The body animates with grid-template-rows 0fr → 1fr rather than max-height:
 * it gives a true auto-height transition without guessing a magic pixel cap
 * that would clip a long list or add dead travel to a short one.
 */
function Section({
  label, activeCount, locked, isOpen, onToggle, children,
}: {
  label: string;
  activeCount?: number;
  locked?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const sectionId = `browse-section-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={sectionId}
        className="section-toggle"
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          width: '100%', padding: '10px 0', border: 'none', background: 'none',
          cursor: 'pointer', borderBottom: '1px solid var(--border)',
          fontFamily: 'inherit',
        }}
      >
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase',
            letterSpacing: '0.05em',
            // An active section stays visible as such while collapsed.
            color: activeCount ? 'var(--acid)' : 'var(--text-secondary)',
          }}
        >
          {label}
          {activeCount ? ` (${activeCount})` : ''}
          {locked && <Lock size={10} aria-hidden />}
        </span>
        <ChevronDown
          size={15}
          aria-hidden
          style={{
            color: 'var(--text-muted)', flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        />
      </button>

      <div
        id={sectionId}
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ padding: '8px 0 12px', opacity: isOpen ? 1 : 0, transform: isOpen ? 'none' : 'translateY(-4px)', transition: 'opacity 0.24s ease, transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * One checkbox row. When `locked`, the row is muted and clicking it opens the
 * upgrade modal instead of toggling — the filter never silently no-ops.
 */
function CheckRow({
  label, count, checked, onToggle, locked, onPremiumRequired, filterName, radio,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onToggle: () => void;
  locked?: boolean;
  onPremiumRequired?: () => void;
  filterName?: string;
  /** Renders a radio marker instead of a checkbox (single-select lists). */
  radio?: boolean;
}) {
  const zero = count === 0 && !checked;

  return (
    <button
      type="button"
      onClick={() => {
        if (locked) { track('locked_filter_clicked', { filter: filterName }); onPremiumRequired?.(); return; }
        onToggle();
      }}
      aria-pressed={checked}
      className="check-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '5px 6px', borderRadius: 6, border: 'none',
        background: checked ? 'var(--acid-soft)' : 'transparent',
        color: checked ? 'var(--acid)' : 'var(--text-secondary)',
        fontWeight: checked ? 600 : 400,
        fontSize: '0.78rem', fontFamily: 'inherit', textAlign: 'left',
        cursor: 'pointer',
        // Dim a zero-count option but keep it clickable — hiding it would make
        // the list jump around as filters change.
        opacity: locked ? 0.55 : zero ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden
        className={`check-box ${checked ? 'is-checked' : ''}`}
        style={{
          width: 13, height: 13, flexShrink: 0,
          borderRadius: radio ? '50%' : 3,
          border: checked ? '1px solid var(--acid)' : '1px solid var(--border)',
          background: checked ? 'var(--acid)' : 'transparent',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, lineHeight: 1, color: 'var(--bg-base)', fontWeight: 900,
        }}
      >
        {checked && !radio ? '✓' : ''}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {count != null && (
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>{count}</span>
      )}
      {locked && <Lock size={10} style={{ flexShrink: 0, color: 'var(--acid)' }} aria-hidden />}
    </button>
  );
}

/** Scroll container shared by every long list, so they all cap identically. */
function ScrollList({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="thin-scroll scroll-list"
      // Left bleed only: the right edge stays inside the rail and reserves a
      // stable gutter, so the count column never slides under the scrollbar.
      style={{ maxHeight: LIST_MAX_HEIGHT, overflowY: 'auto', paddingRight: 6, margin: '0 0 0 -6px', scrollbarGutter: 'stable' }}
    >
      {children}
    </div>
  );
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

// ─── The rail ────────────────────────────────────────────────────────────────

export default function BrowseSidebar({
  filters, setFilters, companyOptions, categoryOptions, facetCounts,
  hasActiveFilters, activeFilterCount, clearFilters,
  isPremium = true, onPremiumRequired,
  autocompleteEndpoint = '/api/jobs/autocomplete', extraFilters,
  variant = 'main', countryOptions = [],
}: Props) {
  const isRemote = variant === 'remote';
  // Premium state is NOT known during server render: AuthContext starts at
  // user/token = null and only reads localStorage in an effect, and /jobs is
  // statically prerendered — so the build-time HTML always says "not premium".
  // Deriving `locked` straight from isPremium therefore made the <Lock> icon
  // appear in the server HTML and vanish on the client, which is a hydration
  // mismatch that throws away the whole tree.
  //
  // Gate on mount instead: server and first client render both produce
  // locked = true (fail closed), and the real value takes over after hydration.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  const locked = !hydrated || !isPremium;

  const [open, setOpen] = useState<Record<string, boolean>>(DEFAULT_OPEN);
  const toggleSection = (key: string) => () => setOpen(prev => ({ ...prev, [key]: !prev[key] }));

  // Company list is long; it needs its own filter box like the old dropdown had.
  const [companyQuery, setCompanyQuery] = useState('');

  const setArray = (key: 'category' | 'workplace' | 'experience' | 'employment' | 'company' | 'country') => (value: string) =>
    setFilters((prev: SidebarFilterState) => ({ ...prev, [key]: toggleValue(prev[key] ?? [], value) }));

  const setBool = (key: 'visa' | 'relocation' | 'hasSalary') => () => {
    if (locked) { track('locked_filter_clicked', { filter: key }); onPremiumRequired?.(); return; }
    setFilters((prev: SidebarFilterState) => ({ ...prev, [key]: !prev[key] }));
  };

  // categoryOptions arrive as "Design (155)" — the count is baked into the label
  // by useJobFilters. Split it back out so the checklist can right-align it.
  const categories = useMemo(() => categoryOptions.map(o => {
    const match = /^(.*)\s\((\d+)\)$/.exec(o.label);
    return match
      ? { value: o.value, label: match[1], count: Number(match[2]) }
      : { value: o.value, label: o.label, count: undefined as number | undefined };
  }), [categoryOptions]);

  // 'All' is a dropdown affordance with no meaning in a checklist.
  const companies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    const list = companyOptions.filter(o => o.value !== 'All');
    return q ? list.filter(o => o.label.toLowerCase().includes(q)) : list;
  }, [companyOptions, companyQuery]);

  const numberInput: React.CSSProperties = {
    ...FILTER_CONTROL_STYLE, height: 30, width: '100%', padding: '0 8px',
  };

  const perksActive = (filters.visa ? 1 : 0) + (filters.relocation ? 1 : 0) + (filters.hasSalary ? 1 : 0)
    + (filters.salaryMin.trim() ? 1 : 0) + (filters.salaryMax.trim() ? 1 : 0);
  const countryActive = filters.country?.length ?? 0;

  return (
    <aside className="browse-sidebar thin-scroll" aria-label="Job filters">
      {/* ── Header: active count + clear ─────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 2, minHeight: 22 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600,
              color: 'var(--acid)', textDecoration: 'underline',
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── Search (always visible — never collapsed) ─────────────────── */}
      <div style={{ display: 'flex', margin: '10px 0 6px', padding: '4px 0' }}>
        <SearchWithGhost
          value={filters.search}
          onChange={next => setFilters((prev: SidebarFilterState) => ({ ...prev, search: next }))}
          endpoint={autocompleteEndpoint}
          paddingLeft={32}
          style={{
            ...FILTER_CONTROL_STYLE, borderRadius: 999,
            color: 'var(--text-secondary)',
            borderColor: filters.search.trim() ? 'var(--acid)' : undefined,
          }}
        />
      </div>

      {/* ── Category ─────────────────────────────────────────────────── */}
      <Section
        label="Category"
        activeCount={filters.category.length}
        isOpen={!!open.category}
        onToggle={toggleSection('category')}
      >
        <ScrollList>
          {categories.map(c => (
            <CheckRow
              key={c.value}
              label={c.label}
              count={c.count}
              checked={filters.category.includes(c.value)}
              onToggle={() => setArray('category')(c.value)}
            />
          ))}
        </ScrollList>
      </Section>

      {/* ── Country — remote only ────────────────────────────────────── */}
      {isRemote && countryOptions.length > 0 && (
        <Section
          label="Country"
          activeCount={countryActive}
          isOpen={!!open.country}
          onToggle={toggleSection('country')}
        >
          <ScrollList>
            {countryOptions.map(o => (
              <CheckRow
                key={o.value}
                label={o.label}
                checked={(filters.country ?? []).includes(o.value)}
                onToggle={() => setArray('country')(o.value)}
              />
            ))}
          </ScrollList>
        </Section>
      )}

      {extraFilters}

      {/* ── Date posted ──────────────────────────────────────────────── */}
      <Section
        label="Date posted"
        activeCount={filters.date !== 'All' ? 1 : 0}
        isOpen={!!open.date}
        onToggle={toggleSection('date')}
      >
        <div style={{ margin: '0 -6px' }}>
          {DATE_DROPDOWN_OPTIONS.map(o => (
            <CheckRow
              key={o.value}
              radio
              label={o.label}
              checked={filters.date === o.value}
              onToggle={() => setFilters((prev: SidebarFilterState) => ({ ...prev, date: o.value as DateFilter }))}
            />
          ))}
        </div>
      </Section>

      {/* ── Workplace — hidden on remote: every job there IS remote ──── */}
      {!isRemote && (
      <Section
        label="Workplace"
        activeCount={filters.workplace.length}
        locked={locked}
        isOpen={!!open.workplace}
        onToggle={toggleSection('workplace')}
      >
        <div style={{ margin: '0 -6px' }}>
          {WORKPLACE_OPTIONS.map(o => (
            <CheckRow
              key={o.value} label={o.label} count={facetCounts?.workplace?.[o.value]}
              checked={filters.workplace.includes(o.value)}
              onToggle={() => setArray('workplace')(o.value)}
              locked={locked} onPremiumRequired={onPremiumRequired} filterName="workplace"
            />
          ))}
        </div>
      </Section>
      )}

      {/* ── Experience ───────────────────────────────────────────────── */}
      <Section
        label="Experience"
        activeCount={filters.experience.length}
        locked={locked}
        isOpen={!!open.experience}
        onToggle={toggleSection('experience')}
      >
        <div style={{ margin: '0 -6px' }}>
          {EXPERIENCE_OPTIONS.map(o => (
            <CheckRow
              key={o.value} label={o.label} count={facetCounts?.experience?.[o.value]}
              checked={filters.experience.includes(o.value)}
              onToggle={() => setArray('experience')(o.value)}
              locked={locked} onPremiumRequired={onPremiumRequired} filterName="experience"
            />
          ))}
        </div>
      </Section>

      {/* ── Employment ───────────────────────────────────────────────── */}
      <Section
        label="Employment"
        activeCount={filters.employment.length}
        locked={locked}
        isOpen={!!open.employment}
        onToggle={toggleSection('employment')}
      >
        <div style={{ margin: '0 -6px' }}>
          {EMPLOYMENT_OPTIONS.map(o => (
            <CheckRow
              key={o.value} label={o.label} count={facetCounts?.employment?.[o.value]}
              checked={filters.employment.includes(o.value)}
              onToggle={() => setArray('employment')(o.value)}
              locked={locked} onPremiumRequired={onPremiumRequired} filterName="employment"
            />
          ))}
        </div>
      </Section>

      {/* ── Company — inline searchable checklist, not a dropdown ─────── */}
      <Section
        label="Company"
        activeCount={filters.company.length}
        isOpen={!!open.company}
        onToggle={toggleSection('company')}
      >
        <div style={{ position: 'relative', margin: '2px 4px 8px', padding: '2px 0' }}>
          <Search
            size={13}
            aria-hidden
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
          />
          <input
            value={companyQuery}
            onChange={e => setCompanyQuery(e.target.value)}
            placeholder="Search companies…"
            aria-label="Search companies"
            style={{ ...FILTER_CONTROL_STYLE, height: 30, width: '100%', paddingLeft: 28 }}
          />
        </div>
        <ScrollList>
          {companies.length === 0 ? (
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', padding: '6px' }}>No companies match.</p>
          ) : (
            companies.map(o => (
              <CheckRow
                key={o.value}
                label={o.label}
                checked={filters.company.includes(o.value)}
                onToggle={() => setArray('company')(o.value)}
              />
            ))
          )}
        </ScrollList>
      </Section>

      {/* ── Perks + salary ───────────────────────────────────────────── */}
      <Section
        label={isRemote ? "Salary" : "Perks & salary"}
        activeCount={perksActive}
        locked={locked}
        isOpen={!!open.perks}
        onToggle={toggleSection('perks')}
      >
        <div style={{ margin: '0 -6px' }}>
          {/* Visa + relocation are meaningless when the role has no location. */}
          {!isRemote && (
            <>
              <CheckRow
                label="Visa sponsorship" count={facetCounts?.visa?.available}
                checked={!!filters.visa} onToggle={setBool('visa')}
                locked={locked} onPremiumRequired={onPremiumRequired} filterName="visa"
              />
              <CheckRow
                label="Relocation support" count={facetCounts?.relocation?.available}
                checked={!!filters.relocation} onToggle={setBool('relocation')}
                locked={locked} onPremiumRequired={onPremiumRequired} filterName="relocation"
              />
            </>
          )}
          <CheckRow
            label="Has salary" count={facetCounts?.hasSalary?.count}
            checked={filters.hasSalary} onToggle={setBool('hasSalary')}
            locked={locked} onPremiumRequired={onPremiumRequired} filterName="has_salary"
          />
        </div>

        <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '12px 0 6px' }}>
          Salary (€/yr)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: locked ? 0.55 : 1, position: 'relative' }}>
          <input
            type="number" inputMode="numeric" min={0} max={1000000} step={1000}
            value={filters.salaryMin} disabled={locked}
            onChange={e => setFilters((prev: SidebarFilterState) => ({ ...prev, salaryMin: e.target.value }))}
            placeholder="Min" aria-label="Minimum yearly salary"
            style={numberInput}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>–</span>
          <input
            type="number" inputMode="numeric" min={0} max={1000000} step={1000}
            value={filters.salaryMax} disabled={locked}
            onChange={e => setFilters((prev: SidebarFilterState) => ({ ...prev, salaryMax: e.target.value }))}
            placeholder="Max" aria-label="Maximum yearly salary"
            style={numberInput}
          />
          {locked && (
            <button
              type="button"
              aria-label="Premium feature — upgrade to filter by salary"
              onClick={() => { track('locked_filter_clicked', { filter: 'salary' }); onPremiumRequired?.(); }}
              style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            />
          )}
        </div>
      </Section>

      <div style={{ height: 28 }} />
    </aside>
  );
}
