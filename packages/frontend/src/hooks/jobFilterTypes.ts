/**
 * Constants and types for useJobFilters.
 * Kept separate so non-hook consumers (filter UI) can import without
 * pulling in the React hook bundle.
 */
import type { CSSProperties } from 'react';

export const PAGE_SIZE = 30;
export const SEARCH_DEBOUNCE_MS = 400;
// Salary inputs debounce slower — intermediate values ("5", "50") would fire
// wasteful requests while the user is still typing the full figure.
export const SALARY_DEBOUNCE_MS = 800;

export const DATE_DROPDOWN_OPTIONS = [
  { value: 'All',        label: 'All time'   },
  { value: 'Today',      label: 'Today'      },
  { value: 'This Week',  label: 'This week'  },
  { value: 'This Month', label: 'This month' },
] as const;

// Attribute filter dropdown options (canonical filter* values, backend Chunk 1).
export const WORKPLACE_OPTIONS = [
  { value: 'remote', label: 'Remote'  },
  { value: 'hybrid', label: 'Hybrid'  },
  { value: 'onsite', label: 'On-site' },
] as const;

export const EXPERIENCE_OPTIONS = [
  { value: 'entry',     label: 'Entry level' },
  { value: 'mid',       label: 'Mid level'   },
  { value: 'senior',    label: 'Senior'      },
  { value: 'lead',      label: 'Lead'        },
  { value: 'executive', label: 'Executive'   },
] as const;

export const EMPLOYMENT_OPTIONS = [
  { value: 'fulltime',   label: 'Full-time'  },
  { value: 'parttime',   label: 'Part-time'  },
  { value: 'contract',   label: 'Contract'   },
  { value: 'internship', label: 'Internship' },
] as const;

export const FILTER_CONTROL_STYLE: CSSProperties = {
  height: 34,
  fontSize: '0.76rem',
  color: 'var(--text-secondary)',
  background: 'var(--bg-surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '0 10px',
};

export type DateFilter = 'All' | 'Today' | 'This Week' | 'This Month';

export interface FilterState {
  company:    string[];
  category:   string[];
  date:       DateFilter;
  search:     string;
  // Attribute filters (multi-select arrays of canonical values).
  workplace:  string[];
  experience: string[];
  employment: string[];
  // Boolean toggles.
  visa:       boolean;
  relocation: boolean;
  hasSalary:  boolean;
  // Salary range — kept as strings because they back text inputs.
  salaryMin:  string;
  salaryMax:  string;
}

export const DEFAULT_FILTERS: FilterState = {
  company:    [],
  category:   [],
  date:       'All',
  search:     '',
  workplace:  [],
  experience: [],
  employment: [],
  visa:       false,
  relocation: false,
  hasSalary:  false,
  salaryMin:  '',
  salaryMax:  '',
};

export interface FilterDropdownOption {
  value: string;
  label: string;
}

/** Shape of GET /api/jobs/filter-counts — live facet totals for the badges. */
export interface IFacetCounts {
  workplace: Record<string, number>;
  experience: Record<string, number>;
  employment: Record<string, number>;
  visa: { available: number };
  relocation: { available: number };
  hasSalary: { count: number };
  category: Record<string, number>;
  totalJobs: number;
}

export function buildSearchParams(filters: FilterState, page: number): URLSearchParams {
  const p = new URLSearchParams();
  p.set('page',  String(page));
  p.set('limit', String(PAGE_SIZE));

  filters.company.forEach(c => p.append('company', c));
  filters.category.forEach(c => p.append('category', c));
  filters.workplace.forEach(v => p.append('workplace', v));
  filters.experience.forEach(v => p.append('experience', v));
  filters.employment.forEach(v => p.append('employment', v));

  if (filters.search.trim())     p.set('search', filters.search.trim());
  if (filters.date !== 'All')    p.set('date',   filters.date);

  if (filters.visa)       p.set('visa', 'true');
  if (filters.relocation) p.set('relocation', 'true');
  if (filters.hasSalary)  p.set('hasSalary', 'true');

  // Only send salary bounds that parse to a valid non-negative integer.
  const min = parseInt(filters.salaryMin, 10);
  if (filters.salaryMin.trim() && Number.isFinite(min) && min >= 0) {
    p.set('salaryMin', String(min));
  }
  const max = parseInt(filters.salaryMax, 10);
  if (filters.salaryMax.trim() && Number.isFinite(max) && max >= 0) {
    p.set('salaryMax', String(max));
  }

  return p;
}
