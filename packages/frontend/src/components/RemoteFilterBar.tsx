'use client';

/**
 * Filter bar for the REMOTE jobs vertical.
 *
 * Structurally a mirror of DashboardFilterBar: same single always-visible row
 * (search · Category · Date · "More filters" · Sort · count), same anchored
 * popover for advanced filters, same active-filter pills, same mobile bottom
 * sheet. It can't literally reuse that component — DashboardFilterBar is typed
 * against the German FilterState (an invariant Dispatch type) and carries
 * premium locking, so the two would fight each other.
 *
 * Differences, all remote-specific:
 *   - a Country dropdown (German jobs are all DE, so they have none)
 *   - no premium locking: every filter is free
 *   - no workplace select (all remote), no visa / relocation toggles
 */
import { useState, useEffect, useRef } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import FilterDropdown from './FilterDropdown';
import SearchWithGhost from './filters/SearchWithGhost';
import { Input } from './ui';
import {
  DATE_DROPDOWN_OPTIONS,
  EXPERIENCE_OPTIONS,
  EMPLOYMENT_OPTIONS,
  FILTER_CONTROL_STYLE,
  type DateFilter,
  type FilterDropdownOption,
} from '../hooks/jobFilterTypes';
import {
  COUNTRY_OPTIONS,
  type RemoteFilterState,
  type IRemoteFacetCounts,
} from '../hooks/useRemoteJobFilters';

// Pill-shaped search field style — matches the .filter-pill control language.
const searchPillStyle = { borderRadius: 999 } as const;

const EXPERIENCE_LABEL: Record<string, string> = Object.fromEntries(EXPERIENCE_OPTIONS.map(o => [o.value, o.label] as [string, string]));
const EMPLOYMENT_LABEL: Record<string, string> = Object.fromEntries(EMPLOYMENT_OPTIONS.map(o => [o.value, o.label] as [string, string]));
const COUNTRY_LABEL: Record<string, string> = Object.fromEntries(COUNTRY_OPTIONS.map(o => [o.value, o.label] as [string, string]));

function fmtSalary(s: string): string {
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return '';
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}
function salaryPill(min: string, max: string): string {
  const lo = fmtSalary(min);
  const hi = fmtSalary(max);
  if (lo && hi) return `${lo}–${hi}`;
  if (lo) return `${lo}+`;
  return `≤${hi}`;
}

// Append "(N)" to each option label when live facet counts are available.
function withCounts(
  options: readonly { value: string; label: string }[],
  counts?: Record<string, number>,
): FilterDropdownOption[] {
  if (!counts) return options as unknown as FilterDropdownOption[];
  return options.map(o => ({ ...o, label: `${o.label} (${counts[o.value] ?? 0})` }));
}

// type=number still accepts 'e', 'E', '+', '-' — meaningless for a salary.
function blockNonNumericKeys(e: React.KeyboardEvent<HTMLInputElement>) {
  if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
}

// ── Shared sub-controls (used by both the popover and the mobile sheet) ──────

type CommonProps = {
  filters: RemoteFilterState;
  setFilters: React.Dispatch<React.SetStateAction<RemoteFilterState>>;
  openDropdown: string | null;
  setOpenDropdown: (id: string | null) => void;
};

/**
 * Country picker — single-select, since a visitor filters to one market at a
 * time. "All Countries" is the empty selection. Names only, no flag emoji:
 * Windows ships no flag glyphs, so 🇺🇸 degrades to the letters "US".
 */
export function CountrySelect({ filters, setFilters, openDropdown, setOpenDropdown, widthOverride, facetCounts }: CommonProps & { widthOverride?: number | string; facetCounts?: IRemoteFacetCounts | null }) {
  const counts = facetCounts?.country;
  const options: FilterDropdownOption[] = [
    { value: '', label: 'All Countries' },
    ...COUNTRY_OPTIONS.map(o => ({
      value: o.value,
      label: counts ? `${o.label} (${counts[o.value] ?? 0})` : o.label,
    })),
  ];
  return (
    <FilterDropdown
      id="country"
      label="Country"
      value={filters.country[0] ?? ''}
      options={options}
      onChange={val => setFilters(prev => ({ ...prev, country: val ? [val] : [] }))}
      openId={openDropdown}
      onOpenChange={setOpenDropdown}
      active={filters.country.length > 0}
      width={widthOverride ?? 170}
    />
  );
}

function CompanySelect({ filters, setFilters, openDropdown, setOpenDropdown, companyOptions, widthOverride }: CommonProps & { companyOptions: FilterDropdownOption[]; widthOverride?: number | string }) {
  return (
    <FilterDropdown
      id="company" label="Company" value=""
      options={companyOptions}
      onChange={() => {}}
      multiSelect
      selectedValues={filters.company}
      onMultiChange={vals => setFilters(prev => ({ ...prev, company: vals }))}
      openId={openDropdown} onOpenChange={setOpenDropdown}
      active={filters.company.length > 0}
      width={widthOverride ?? 160}
      searchable
    />
  );
}

function CategorySelect({ filters, setFilters, openDropdown, setOpenDropdown, categoryOptions, widthOverride }: CommonProps & { categoryOptions: FilterDropdownOption[]; widthOverride?: number | string }) {
  return (
    <FilterDropdown
      id="category" label="Category" value=""
      options={categoryOptions}
      onChange={() => {}}
      multiSelect
      selectedValues={filters.category}
      onMultiChange={vals => setFilters(prev => ({ ...prev, category: vals }))}
      openId={openDropdown} onOpenChange={setOpenDropdown}
      active={filters.category.length > 0}
      width={widthOverride ?? 180}
      searchable
    />
  );
}

function DateSelect({ filters, setFilters, openDropdown, setOpenDropdown, widthOverride }: CommonProps & { widthOverride?: number | string }) {
  return (
    <FilterDropdown
      id="date" label="Date" value={filters.date}
      options={DATE_DROPDOWN_OPTIONS as unknown as FilterDropdownOption[]}
      onChange={val => setFilters(prev => ({ ...prev, date: val as DateFilter }))}
      openId={openDropdown} onOpenChange={setOpenDropdown}
      active={filters.date !== 'All'}
      width={widthOverride ?? 120}
    />
  );
}

function AttributeSelects({ filters, setFilters, openDropdown, setOpenDropdown, facetCounts, widthOverride }: CommonProps & { facetCounts?: IRemoteFacetCounts | null; widthOverride?: number | string }) {
  return (
    <>
      <FilterDropdown
        id="experience" label="Experience" value=""
        options={withCounts(EXPERIENCE_OPTIONS, facetCounts?.experience)}
        onChange={() => {}}
        multiSelect
        selectedValues={filters.experience}
        onMultiChange={vals => setFilters(prev => ({ ...prev, experience: vals }))}
        openId={openDropdown} onOpenChange={setOpenDropdown}
        active={filters.experience.length > 0}
        width={widthOverride ?? 125}
      />
      <FilterDropdown
        id="employment" label="Employment" value=""
        options={withCounts(EMPLOYMENT_OPTIONS, facetCounts?.employment)}
        onChange={() => {}}
        multiSelect
        selectedValues={filters.employment}
        onMultiChange={vals => setFilters(prev => ({ ...prev, employment: vals }))}
        openId={openDropdown} onOpenChange={setOpenDropdown}
        active={filters.employment.length > 0}
        width={widthOverride ?? 130}
      />
    </>
  );
}

function SalaryRangeInputs({ filters, setFilters, stretch = false }: Pick<CommonProps, 'filters' | 'setFilters'> & { stretch?: boolean }) {
  const min = parseInt(filters.salaryMin, 10);
  const max = parseInt(filters.salaryMax, 10);
  const invalidRange = Number.isFinite(min) && Number.isFinite(max) && min > max;
  const active = filters.salaryMin.trim() !== '' || filters.salaryMax.trim() !== '';

  const inputStyle: React.CSSProperties = {
    ...FILTER_CONTROL_STYLE,
    border: 'none', background: 'transparent', height: 30,
    width: stretch ? '100%' : 74, padding: '0 6px',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
  };

  return (
    <div
      className="filter-pill"
      title={invalidRange ? 'Min salary is higher than max — this range is ignored' : 'Yearly salary range'}
      style={{
        display: 'inline-flex', alignItems: 'center',
        height: 34, paddingInline: 10,
        flex: stretch ? 1 : undefined, flexShrink: 0,
        border: invalidRange ? '1.5px solid var(--danger)' : active ? '1.5px solid var(--acid)' : '1px solid var(--border)',
        background: active && !invalidRange ? 'var(--acid-soft)' : 'transparent',
        transition: 'border-color 0.18s, background 0.18s',
      }}
    >
      <span style={{ fontSize: '0.66rem', fontWeight: 600, marginRight: 6, whiteSpace: 'nowrap', color: invalidRange ? 'var(--danger)' : active ? 'var(--acid)' : 'var(--text-muted)', flexShrink: 0 }}>
        Salary /yr
      </span>
      <input
        type="number" inputMode="numeric" min={0} max={1000000} step={1000}
        value={filters.salaryMin}
        onChange={e => setFilters(prev => ({ ...prev, salaryMin: e.target.value }))}
        onKeyDown={blockNonNumericKeys}
        placeholder="Min" aria-label="Minimum yearly salary" aria-invalid={invalidRange}
        style={inputStyle}
      />
      <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem', flexShrink: 0 }}>–</span>
      <input
        type="number" inputMode="numeric" min={0} max={1000000} step={1000}
        value={filters.salaryMax}
        onChange={e => setFilters(prev => ({ ...prev, salaryMax: e.target.value }))}
        onKeyDown={blockNonNumericKeys}
        placeholder="Max" aria-label="Maximum yearly salary" aria-invalid={invalidRange}
        style={inputStyle}
      />
    </div>
  );
}

// ── The bar ─────────────────────────────────────────────────────────────────

export interface RemoteFilterBarProps {
  filters: RemoteFilterState;
  setFilters: React.Dispatch<React.SetStateAction<RemoteFilterState>>;
  companyOptions: FilterDropdownOption[];
  categoryOptions: FilterDropdownOption[];
  facetCounts?: IRemoteFacetCounts | null;
  filteredCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  clearFilters: () => void;
  openDropdown: string | null;
  setOpenDropdown: (id: string | null) => void;
  onOpenFilterSheet: () => void;
}

export function RemoteFilterBar({
  filters,
  setFilters,
  companyOptions,
  categoryOptions,
  facetCounts,
  filteredCount,
  totalCount,
  hasActiveFilters,
  activeFilterCount,
  clearFilters,
  openDropdown,
  setOpenDropdown,
  onOpenFilterSheet,
}: RemoteFilterBarProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const popoverAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (popoverAnchorRef.current?.contains(target)) return;
      // FilterDropdown portals its option list into document.body, so an option
      // click lands OUTSIDE this popover's subtree. Without this guard we'd
      // unmount the popover on pointerdown and the option's click would never
      // fire. Same escape hatch DashboardFilterBar uses.
      if (target.closest?.('[data-dropdown-id], .bottom-sheet, .bottom-sheet-overlay')) return;
      setPanelOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [panelOpen]);

  const base = { filters, setFilters, openDropdown, setOpenDropdown };

  // ── Active advanced-filter pills (everything not in the visible row) ──────
  const removeArr = (field: 'experience' | 'employment' | 'company' | 'country', val: string) =>
    setFilters(prev => ({ ...prev, [field]: prev[field].filter(v => v !== val) }));
  const clearSalary = () => setFilters(prev => ({ ...prev, salaryMin: '', salaryMax: '' }));

  const advancedPills: { key: string; label: string; remove: () => void }[] = [];
  filters.country.forEach(v => advancedPills.push({ key: 'cn_' + v, label: COUNTRY_LABEL[v] || v, remove: () => removeArr('country', v) }));
  filters.experience.forEach(v => advancedPills.push({ key: 'ex_' + v, label: EXPERIENCE_LABEL[v] || v, remove: () => removeArr('experience', v) }));
  filters.employment.forEach(v => advancedPills.push({ key: 'em_' + v, label: EMPLOYMENT_LABEL[v] || v, remove: () => removeArr('employment', v) }));
  filters.company.forEach(v => advancedPills.push({ key: 'co_' + v, label: v, remove: () => removeArr('company', v) }));
  if (filters.hasSalary) advancedPills.push({ key: 'hassal', label: 'Has salary', remove: () => setFilters(prev => ({ ...prev, hasSalary: false })) });
  if (filters.salaryMin.trim() || filters.salaryMax.trim()) advancedPills.push({ key: 'sal', label: salaryPill(filters.salaryMin, filters.salaryMax), remove: clearSalary });
  const advancedCount = advancedPills.length;

  const countLabel = (
    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
      {filteredCount} of {totalCount} jobs
    </span>
  );

  const moreActive = panelOpen || advancedCount > 0;
  const moreFiltersBtn = (
    <button
      type="button"
      onClick={() => setPanelOpen(o => !o)}
      aria-expanded={panelOpen}
      style={{
        height: 34, padding: '0 14px', flexShrink: 0, borderRadius: 8,
        border: '1px solid', borderColor: moreActive ? 'var(--acid)' : 'var(--border)',
        background: moreActive ? 'var(--acid-soft)' : 'transparent',
        color: moreActive ? 'var(--acid)' : 'var(--text-secondary)',
        fontSize: '0.78rem', fontWeight: moreActive ? 600 : 400, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontFamily: 'inherit',
      }}
    >
      {advancedCount > 0 && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--acid)', flexShrink: 0 }} />}
      <SlidersHorizontal size={14} />
      {advancedCount > 0 ? `Filters (${advancedCount})` : 'More filters'}
    </button>
  );

  const pillStyle: React.CSSProperties = {
    fontSize: '0.72rem', background: 'var(--acid-soft)', border: '1px solid var(--acid)',
    borderRadius: 16, padding: '2px 8px 2px 10px', color: 'var(--acid)',
    display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
  };

  const searchInput = (fullWidth: boolean) => (
    <div style={{ display: 'flex', ...(fullWidth ? { flex: 1, minWidth: 0 } : { flex: '1 1 200px', minWidth: 180, maxWidth: 280 }) }}>
      <SearchWithGhost
        value={filters.search}
        onChange={next => setFilters(prev => ({ ...prev, search: next }))}
        endpoint="/api/remote-jobs/autocomplete"
        placeholder="Search remote jobs..."
        paddingLeft={fullWidth ? 32 : 34}
        style={{ ...FILTER_CONTROL_STYLE, ...searchPillStyle, color: 'var(--text-secondary)', borderColor: filters.search.trim() ? 'var(--acid)' : undefined }}
      />
    </div>
  );

  return (
    <>
      {/* Mobile — search + "Filters" button that opens the bottom sheet. */}
      <div className="filter-bar-mobile">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {searchInput(true)}
            <button
              onClick={onOpenFilterSheet}
              style={{
                height: 34, paddingInline: 14, borderRadius: 999, border: '1px solid',
                borderColor: activeFilterCount > 0 ? 'var(--acid)' : 'var(--border)',
                background: activeFilterCount > 0 ? 'var(--acid-soft)' : 'transparent',
                color: activeFilterCount > 0 ? 'var(--acid)' : 'var(--text-secondary)',
                fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              }}
            >
              <SlidersHorizontal size={13} />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          </div>
          {countLabel}
        </div>
      </div>

      {/* Tablet + Desktop (≥768px) — single row + "More filters" popover. */}
      <div className="filter-bar-full" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          {searchInput(false)}
          <CategorySelect {...base} categoryOptions={categoryOptions} />
          <DateSelect {...base} />

          <div ref={popoverAnchorRef} style={{ position: 'relative', flexShrink: 0 }}>
            {moreFiltersBtn}
            {panelOpen && (
              <div
                role="dialog"
                aria-label="More filters"
                style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 40,
                  background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: '16px 20px',
                  minWidth: 600, maxWidth: 800,
                }}
              >
                {/* Row 1 — Country (remote-only) / Experience / Employment / Company */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <CountrySelect {...base} facetCounts={facetCounts} />
                  <AttributeSelects {...base} facetCounts={facetCounts} />
                  <CompanySelect {...base} companyOptions={companyOptions} />
                </div>

                {/* Row 2 — Has salary · divider · Salary range */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setFilters(prev => ({ ...prev, hasSalary: !prev.hasSalary }))}
                    aria-pressed={filters.hasSalary}
                    className="filter-pill"
                    style={{
                      height: 34, padding: '0 12px', fontSize: '0.76rem', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                      flexShrink: 0, fontFamily: 'inherit',
                      border: filters.hasSalary ? '1.5px solid var(--acid)' : '1px solid var(--border)',
                      background: filters.hasSalary ? 'var(--acid-soft)' : 'transparent',
                      color: filters.hasSalary ? 'var(--acid)' : 'var(--text-secondary)',
                      fontWeight: filters.hasSalary ? 600 : 400,
                    }}
                  >
                    {filters.hasSalary && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--acid)', flexShrink: 0 }} />}
                    Has salary
                    {facetCounts?.hasSalary?.count != null && (
                      <span style={{ fontSize: '0.68rem', color: filters.hasSalary ? 'var(--acid)' : 'var(--text-muted)', fontWeight: 400 }}>
                        {facetCounts.hasSalary.count}
                      </span>
                    )}
                  </button>
                  <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />
                  <SalaryRangeInputs filters={filters} setFilters={setFilters} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 14 }}>
                  {hasActiveFilters && (
                    <button
                      type="button" onClick={clearFilters}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.76rem', fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      <X size={11} /> Clear filters
                    </button>
                  )}
                  <button
                    type="button" onClick={() => setPanelOpen(false)}
                    style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 20px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Count sits right-aligned on this row — matching /jobs. */}
          <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {countLabel}
          </div>
        </div>

        {!panelOpen && advancedCount > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 }}>
            {advancedPills.map(p => (
              <span key={p.key} style={pillStyle}>
                {p.label}
                <button type="button" onClick={p.remove} aria-label={`Remove ${p.label} filter`}
                  style={{ background: 'none', border: 'none', color: 'var(--acid)', cursor: 'pointer', padding: 0, marginLeft: 2, fontSize: '1rem', lineHeight: 1, display: 'inline-flex' }}>
                  ×
                </button>
              </span>
            ))}
            <button
              type="button" onClick={clearFilters}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 2 }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Mobile filter bottom sheet ──────────────────────────────────────────────

export interface RemoteMobileFilterSheetProps {
  filters: RemoteFilterState;
  setFilters: React.Dispatch<React.SetStateAction<RemoteFilterState>>;
  companyOptions: FilterDropdownOption[];
  categoryOptions: FilterDropdownOption[];
  facetCounts?: IRemoteFacetCounts | null;
  filteredCount: number;
  hasActiveFilters: boolean;
  clearFilters: () => void;
  openDropdown: string | null;
  setOpenDropdown: (id: string | null) => void;
  onClose: () => void;
}

export function RemoteMobileFilterSheet({
  filters,
  setFilters,
  companyOptions,
  categoryOptions,
  facetCounts,
  filteredCount,
  hasActiveFilters,
  clearFilters,
  openDropdown,
  setOpenDropdown,
  onClose,
}: RemoteMobileFilterSheetProps) {
  const base = { filters, setFilters, openDropdown, setOpenDropdown };
  const sectionLabelStyle = { fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginTop: 4, marginBottom: 2 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-base)', borderRadius: '20px 20px 0 0',
        padding: '16px 16px calc(16px + env(safe-area-inset-bottom))',
        maxHeight: '80dvh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Filters</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={sectionLabelStyle}>Filter by</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <CountrySelect {...base} facetCounts={facetCounts} widthOverride="100%" />
            <CategorySelect {...base} categoryOptions={categoryOptions} widthOverride="100%" />
            <CompanySelect {...base} companyOptions={companyOptions} widthOverride="100%" />
            <DateSelect {...base} widthOverride="100%" />
          </div>

          <div style={sectionLabelStyle}>More filters</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <AttributeSelects {...base} facetCounts={facetCounts} widthOverride="100%" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SalaryRangeInputs filters={filters} setFilters={setFilters} stretch />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {hasActiveFilters && (
            <button
              onClick={() => { clearFilters(); onClose(); }}
              style={{ flex: 1, height: 46, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.9rem', cursor: 'pointer' }}
            >
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            style={{ flex: 2, height: 46, borderRadius: 10, border: 'none', background: 'var(--acid)', color: '#000', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Show {filteredCount} results
          </button>
        </div>
      </div>
    </div>
  );
}
