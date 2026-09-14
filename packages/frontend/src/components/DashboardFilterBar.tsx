'use client';

/**
 * Dashboard filter bar — three responsive variants (mobile/tablet/desktop)
 * + the mobile filter bottom sheet. Renders the shared filter dropdowns
 * from ./filters/jobFilterSelects.
 */
import { useState, useEffect, useRef } from 'react';
import { Search, SlidersHorizontal, X, Crown } from 'lucide-react';
import { Input } from './ui';
import { FILTER_CONTROL_STYLE, type FilterState, type FilterDropdownOption } from '../hooks/useJobFilters';
import { WORKPLACE_OPTIONS, EXPERIENCE_OPTIONS, EMPLOYMENT_OPTIONS, type IFacetCounts } from '../hooks/jobFilterTypes';
import {
  FilterSelects, AttributeSelects, ToggleChips, SalaryRangeInputs, PremiumBadge,
  CategorySelect, DateSelect, CompanySelect,
} from './filters/jobFilterSelects';
import SearchWithGhost from './filters/SearchWithGhost';

// Pill-shaped search field style — matches the .filter-pill control language.
const searchPillStyle = { borderRadius: 999 } as const;

// value → label maps for the active-filter pills.
const WORKPLACE_LABEL: Record<string, string> = Object.fromEntries(WORKPLACE_OPTIONS.map(o => [o.value, o.label] as [string, string]));
const EXPERIENCE_LABEL: Record<string, string> = Object.fromEntries(EXPERIENCE_OPTIONS.map(o => [o.value, o.label] as [string, string]));
const EMPLOYMENT_LABEL: Record<string, string> = Object.fromEntries(EMPLOYMENT_OPTIONS.map(o => [o.value, o.label] as [string, string]));

function fmtSalary(s: string): string {
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return '';
  return n >= 1000 ? `€${Math.round(n / 1000)}k` : `€${n}`;
}
function salaryPill(min: string, max: string): string {
  const lo = fmtSalary(min);
  const hi = fmtSalary(max);
  if (lo && hi) return `${lo}–${hi}`;
  if (lo) return `${lo}+`;
  return `≤${hi}`;
}

// Gold used for the popover's Premium badge. Hard-coded rather than a theme
// token because there is no --text-warning in themes.ts; --warning (#D97706)
// is the amber alert color, which reads as a warning, not as a paid tier.
const PREMIUM_GOLD = '#C9A84C';

/**
 * The "More filters" popover's Premium badge — a real badge, not a footnote.
 * Local to this file so the shared PremiumBadge (still used by the mobile
 * sheet and the locked-control overlays) is left untouched.
 */
function PopoverPremiumBadge() {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: PREMIUM_GOLD, lineHeight: 1.4,
        border: `1px solid ${PREMIUM_GOLD}`, borderRadius: 6,
        padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      <Crown size={12} aria-hidden />
      Premium
    </span>
  );
}

/**
 * Text-weight bumps for the controls INSIDE the "More filters" popover.
 *
 * FilterDropdown and jobFilterSelects set their weights as inline styles, which
 * beat any class rule — so overriding them without editing those shared
 * components needs `!important`, scoped to `.more-filters-popover` so nothing
 * else in the app (the mobile sheet, the always-visible row, /remote-jobs) is
 * affected. The dropdown option lists portal to <body>, so they're outside this
 * scope and keep their own styling.
 */
const POPOVER_TEXT_CSS = `
.more-filters-popover button.filter-pill { font-weight: 500 !important; }
/* An active dropdown renders a dot <span> nested inside its label <span>;
   that nesting is the only marker of active state in the DOM, so it's how we
   keep active triggers heavier than the 500 baseline above. */
.more-filters-popover button.filter-pill:has(> span > span) { font-weight: 600 !important; }
/* Toggle chips (Visa sponsor / Relocation / Has salary) — aria-pressed is a
   reliable active flag here, unlike the dropdown triggers. */
.more-filters-popover button[aria-pressed="true"] { font-weight: 600 !important; }
/* The count beside each chip (0, 0, 2) — a direct-child span of the chip. */
.more-filters-popover button[aria-pressed] > span:last-child { font-weight: 600 !important; }
`;

interface FilterBarProps {
  filters: FilterState;
  companyOptions: FilterDropdownOption[];
  categoryOptions: FilterDropdownOption[];
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  filteredCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  clearFilters: () => void;
  openDropdown: string | null;
  setOpenDropdown: (id: string | null) => void;
  onOpenFilterSheet: () => void;
  facetCounts?: IFacetCounts | null;
  /** false = non-premium → advanced filters render locked. Defaults to premium. */
  isPremium?: boolean;
  /** Fired when a non-premium user clicks a locked advanced filter. */
  onPremiumRequired?: () => void;
}

export function DashboardFilterBar({
  filters,
  setFilters,
  filteredCount,
  totalCount,
  hasActiveFilters,
  activeFilterCount,
  companyOptions,
  categoryOptions,
  clearFilters,
  openDropdown,
  setOpenDropdown,
  onOpenFilterSheet,
  facetCounts,
  isPremium = true,
  onPremiumRequired,
}: FilterBarProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  // Anchor for the floating "More filters" popover — click-outside + Escape close it.
  const popoverAnchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (popoverAnchorRef.current?.contains(target)) return;
      // FilterDropdown renders its option list through createPortal() into
      // document.body, so an option click is physically OUTSIDE this popover's
      // DOM subtree. Without this guard we'd close (and unmount) the popover on
      // pointerdown, destroying the option before its click could fire — the
      // dropdowns would silently do nothing. Same `[data-dropdown-id]` escape
      // hatch FilterDropdown's own outside-click handler uses.
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

  const premiumProps = { locked: !isPremium, onPremiumRequired };
  const selectsProps = { filters, setFilters, companyOptions, categoryOptions, openDropdown, setOpenDropdown };
  const dropdownProps = { filters, setFilters, openDropdown, setOpenDropdown, facetCounts, ...premiumProps };
  const toggleProps = { filters, setFilters, facetCounts, ...premiumProps };
  const baseSelect = { filters, setFilters, openDropdown, setOpenDropdown };

  // ── Active advanced-filter pills (everything not in the always-visible row) ─
  const removeArr = (field: 'workplace' | 'experience' | 'employment' | 'company', val: string) =>
    setFilters(prev => ({ ...prev, [field]: prev[field].filter(v => v !== val) }));
  const setBool = (field: 'visa' | 'relocation' | 'hasSalary', v: boolean) =>
    setFilters(prev => ({ ...prev, [field]: v }));
  const clearSalary = () => setFilters(prev => ({ ...prev, salaryMin: '', salaryMax: '' }));

  const advancedPills: { key: string; label: string; remove: () => void }[] = [];
  filters.workplace.forEach(v => advancedPills.push({ key: 'wp_' + v, label: WORKPLACE_LABEL[v] || v, remove: () => removeArr('workplace', v) }));
  filters.experience.forEach(v => advancedPills.push({ key: 'ex_' + v, label: EXPERIENCE_LABEL[v] || v, remove: () => removeArr('experience', v) }));
  filters.employment.forEach(v => advancedPills.push({ key: 'em_' + v, label: EMPLOYMENT_LABEL[v] || v, remove: () => removeArr('employment', v) }));
  filters.company.forEach(v => advancedPills.push({ key: 'co_' + v, label: v, remove: () => removeArr('company', v) }));
  if (filters.visa) advancedPills.push({ key: 'visa', label: 'Visa', remove: () => setBool('visa', false) });
  if (filters.relocation) advancedPills.push({ key: 'reloc', label: 'Relocation', remove: () => setBool('relocation', false) });
  if (filters.hasSalary) advancedPills.push({ key: 'hassal', label: 'Has salary', remove: () => setBool('hasSalary', false) });
  if (filters.salaryMin.trim() || filters.salaryMax.trim()) advancedPills.push({ key: 'sal', label: salaryPill(filters.salaryMin, filters.salaryMax), remove: clearSalary });
  const advancedCount = advancedPills.length;

  // Mobile-only search (full width; the desktop search is capped at 280).
  const searchInput = (
    <SearchWithGhost
      value={filters.search}
      onChange={next => setFilters(prev => ({ ...prev, search: next }))}
      endpoint="/api/jobs/autocomplete"
      paddingLeft={32}
      style={{ ...FILTER_CONTROL_STYLE, ...searchPillStyle, color: 'var(--text-secondary)', borderColor: filters.search.trim() ? 'var(--acid)' : undefined }}
    />
  );

  const countLabel = (
    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
      {filteredCount} of {totalCount} jobs
    </span>
  );

  // "More filters" gateway button. Highlighted (acid scheme) while the popover
  // is open OR when any advanced filter is active — then it reads "Filters (N)".
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

  return (
    <>
      {/* Mobile — search + "Filters" button that opens the bottom sheet (unchanged). */}
      <div className="filter-bar-mobile">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {searchInput}
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

      {/* Tablet + Desktop (≥768px) — single row + "More filters" panel. */}
      <div className="filter-bar-full" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, width: '100%' }}>
        {/* The always-visible single row. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <div style={{ display: 'flex', flex: '1 1 200px', minWidth: 180, maxWidth: 280 }}>
            <SearchWithGhost
              value={filters.search}
              onChange={next => setFilters(prev => ({ ...prev, search: next }))}
              endpoint="/api/jobs/autocomplete"
              paddingLeft={34}
              style={{ ...FILTER_CONTROL_STYLE, ...searchPillStyle, color: 'var(--text-secondary)', borderColor: filters.search.trim() ? 'var(--acid)' : undefined }}
            />
          </div>
          <CategorySelect {...baseSelect} categoryOptions={categoryOptions} />
          <DateSelect {...baseSelect} />

          {/* "More filters" button + its floating popover (anchored, overlays). */}
          <div ref={popoverAnchorRef} style={{ position: 'relative', flexShrink: 0 }}>
            {moreFiltersBtn}
            {panelOpen && (
              <div
                role="dialog"
                aria-label="More filters"
                className="more-filters-popover"
                style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 40,
                  background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.12)', padding: '16px 20px',
                  minWidth: 600, maxWidth: 800,
                }}
              >
                <style>{POPOVER_TEXT_CSS}</style>

                {/* Row 1 — Workplace / Experience / Employment / Company */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <AttributeSelects {...dropdownProps} />
                  <CompanySelect {...baseSelect} companyOptions={companyOptions} />
                  {!isPremium && <PopoverPremiumBadge />}
                </div>

                {/* Row 2 — Visa / Relocation / Has salary · divider · Salary range */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <ToggleChips {...toggleProps} />
                  <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />
                  <SalaryRangeInputs {...toggleProps} />
                </div>

                {/* Bottom actions — Clear filters (when active) + Done */}
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

          <div style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {countLabel}
          </div>
        </div>

        {/* Active-filter pills (shown when the popover is closed). */}
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

// ── Mobile filter bottom sheet ──────────────────────────────────

interface MobileFilterSheetProps {
  companyOptions: FilterDropdownOption[];
  categoryOptions: FilterDropdownOption[];
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  filteredCount: number;
  hasActiveFilters: boolean;
  clearFilters: () => void;
  openDropdown: string | null;
  setOpenDropdown: (id: string | null) => void;
  onClose: () => void;
  facetCounts?: IFacetCounts | null;
  isPremium?: boolean;
  onPremiumRequired?: () => void;
}

export function MobileFilterSheet({
  filters,
  setFilters,
  filteredCount,
  hasActiveFilters,
  clearFilters,
  companyOptions,
  categoryOptions,
  openDropdown,
  setOpenDropdown,
  onClose,
  facetCounts,
  isPremium = true,
  onPremiumRequired,
}: MobileFilterSheetProps) {
  const premiumProps = { locked: !isPremium, onPremiumRequired };
  const selectsProps = { filters, setFilters, companyOptions, categoryOptions, openDropdown, setOpenDropdown };
  const dropdownProps = { filters, setFilters, openDropdown, setOpenDropdown, facetCounts, ...premiumProps };
  const toggleProps = { filters, setFilters, facetCounts, ...premiumProps };
  const sectionLabelStyle = { fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginTop: 4, marginBottom: 2 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
      />
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
            <FilterSelects {...selectsProps} widthOverride="100%" />
          </div>

          <div style={{ ...sectionLabelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
            More filters {!isPremium && <PremiumBadge />}
          </div>
          {/* 1-column: the attribute labels are long and cramp in 2 columns */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <AttributeSelects {...dropdownProps} widthOverride="100%" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ToggleChips {...toggleProps} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SalaryRangeInputs {...toggleProps} stretch />
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