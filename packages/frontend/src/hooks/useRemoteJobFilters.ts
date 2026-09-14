/**
 * Server-driven filter hook for the REMOTE jobs vertical.
 *
 * Same contract as useJobFilters (debounced state → committed state → fetch,
 * loadMore, dropdown bootstraps), with two differences:
 *   - the API base is /api/remote-jobs instead of /api/jobs
 *   - a `country` filter, and NO premium gating of any filter (remote is free)
 *
 * Visa / relocation are dropped entirely — meaningless for fully remote roles.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IJob } from '../types';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../utils/categorize';
import {
  fetchRemoteJobs,
  fetchRemoteCompanyNames,
  fetchRemoteCategoryCounts,
  fetchRemoteFilterCounts,
  type IRemoteFacetCounts,
} from '../utils/remoteJobApi';
import {
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  SALARY_DEBOUNCE_MS,
  type DateFilter,
  type FilterDropdownOption,
} from './jobFilterTypes';

export { PAGE_SIZE } from './jobFilterTypes';
export type { IRemoteFacetCounts } from '../utils/remoteJobApi';

/**
 * The countries the remote scraper collects, in dropdown order. Full names —
 * never the raw ISO code, which is what the badges show too. The empty
 * "All Countries" choice is added by the dropdown itself.
 */
export const COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States'  },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada'         },
  { value: 'AU', label: 'Australia'      },
  { value: 'IE', label: 'Ireland'        },
  { value: 'NZ', label: 'New Zealand'    },
  { value: 'SG', label: 'Singapore'      },
] as const;

// Country display names live in utils/remoteJob.ts (getCountryLabel) — the
// badges and the location line share them.

export interface RemoteFilterState {
  company:    string[];
  category:   string[];
  /** Remote-only facet. Empty = all countries. */
  country:    string[];
  date:       DateFilter;
  search:     string;
  workplace:  string[];
  experience: string[];
  employment: string[];
  hasSalary:  boolean;
  // Salary range — kept as strings because they back text inputs.
  salaryMin:  string;
  salaryMax:  string;
}

export const DEFAULT_REMOTE_FILTERS: RemoteFilterState = {
  company:    [],
  category:   [],
  country:    [],
  date:       'All',
  search:     '',
  workplace:  [],
  experience: [],
  employment: [],
  hasSalary:  false,
  salaryMin:  '',
  salaryMax:  '',
};

export function buildRemoteSearchParams(filters: RemoteFilterState, page: number): URLSearchParams {
  const p = new URLSearchParams();
  p.set('page',  String(page));
  p.set('limit', String(PAGE_SIZE));

  filters.company.forEach(c => p.append('company', c));
  filters.category.forEach(c => p.append('category', c));
  filters.country.forEach(c => p.append('country', c));
  filters.workplace.forEach(v => p.append('workplace', v));
  filters.experience.forEach(v => p.append('experience', v));
  filters.employment.forEach(v => p.append('employment', v));

  if (filters.search.trim())     p.set('search', filters.search.trim());
  if (filters.date !== 'All')    p.set('date',   filters.date);
  if (filters.hasSalary)         p.set('hasSalary', 'true');

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

export function useRemoteJobFilters(initialCompany?: string, initialSearch?: string) {
  const initialState = useMemo<RemoteFilterState>(() => ({
    ...DEFAULT_REMOTE_FILTERS,
    company: initialCompany ? [initialCompany] : [],
    search: initialSearch || DEFAULT_REMOTE_FILTERS.search,
  }), [initialCompany, initialSearch]);

  // UI state — updates immediately
  const [filters, setFiltersInternal] = useState<RemoteFilterState>(initialState);
  // Debounced "committed" state — drives API calls
  const [committedFilters, setCommittedFilters] = useState<RemoteFilterState>(initialState);

  // Server results
  const [jobs,        setJobs]        = useState<IJob[]>([]);
  const [totalJobs,   setTotalJobs]   = useState(0);
  const [hasMore,     setHasMore]     = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // See useJobFilters — page-1 failure surfaced for a real error state.
  const [error,       setError]       = useState<unknown>(null);
  const [retryTick,   setRetryTick]   = useState(0);

  const [companyOptions, setCompanyOptions] = useState<FilterDropdownOption[]>([
    { value: 'All', label: 'All' },
  ]);

  const [categoryOptions, setCategoryOptions] = useState<FilterDropdownOption[]>(
    CATEGORY_ORDER.map(cat => ({ value: cat, label: CATEGORY_LABELS[cat] })),
  );

  const [facetCounts, setFacetCounts] = useState<IRemoteFacetCounts | null>(null);

  // Internal refs
  const abortRef       = useRef<AbortController | null>(null);
  const pageRef        = useRef(2);
  const loadingMoreRef = useRef(false);
  const committedRef   = useRef(committedFilters);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    committedRef.current = committedFilters;
  }, [committedFilters]);

  // ── Bootstrap: company names + category counts + facet counts (once) ────
  useEffect(() => {
    const ctrl = new AbortController();

    fetchRemoteCompanyNames({ signal: ctrl.signal })
      .then(names => {
        if (names.length === 0) return;
        setCompanyOptions([
          { value: 'All', label: 'All' },
          ...names.map(n => ({ value: n, label: n })),
        ]);
      })
      .catch(() => {}); // non-critical

    fetchRemoteCategoryCounts({ signal: ctrl.signal })
      .then(counts => {
        setCategoryOptions(
          CATEGORY_ORDER.map(cat => ({
            value: cat,
            label: `${CATEGORY_LABELS[cat]} (${counts[cat] || 0})`,
          })),
        );
      })
      .catch(() => {});

    fetchRemoteFilterCounts({ signal: ctrl.signal })
      .then(counts => { if (counts) setFacetCounts(counts); })
      .catch(() => {}); // badges just don't render — non-critical

    return () => ctrl.abort();
  }, []);

  // ── Fetch page 1 on every committedFilters change ───────────────────────
  useEffect(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);
    setJobs([]);
    pageRef.current = 2;

    const params = buildRemoteSearchParams(committedFilters, 1);

    fetchRemoteJobs(params, { signal: ctrl.signal })
      .then(({ jobs: batch, totalJobs: total }) => {
        if (ctrl.signal.aborted) return;
        setJobs(batch);
        setTotalJobs(total);
        setHasMore(batch.length === PAGE_SIZE && batch.length < total);
      })
      .catch(err => {
        if (err?.name === 'AbortError' || ctrl.signal.aborted) return;
        console.error('[useRemoteJobFilters] fetch error:', err);
        setError(err);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [committedFilters, retryTick]);

  const retry = useCallback(() => setRetryTick(t => t + 1), []);

  // ── Load next page ──────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    const page   = pageRef.current;
    const params = buildRemoteSearchParams(committedRef.current, page);

    try {
      const { jobs: batch, totalJobs: total } = await fetchRemoteJobs(params);

      setJobs(prev => {
        const next = [...prev, ...batch];
        setHasMore(next.length < total);
        return next;
      });
      setTotalJobs(total);
      pageRef.current = page + 1;
    } catch (err) {
      console.error('[useRemoteJobFilters] loadMore error:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore]);

  // ── Debounced setFilters ────────────────────────────────────────────────
  const setFilters = useCallback(
    (updater: RemoteFilterState | ((prev: RemoteFilterState) => RemoteFilterState)) => {
      setFiltersInternal(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const searchChanged = next.search !== prev.search;
        const salaryChanged =
          next.salaryMin !== prev.salaryMin || next.salaryMax !== prev.salaryMax;

        // Only free-text inputs are debounced; dropdowns and chips commit
        // immediately. Salary debounces slower than search.
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        if (salaryChanged) {
          searchTimerRef.current = setTimeout(() => setCommittedFilters(next), SALARY_DEBOUNCE_MS);
        } else if (searchChanged) {
          searchTimerRef.current = setTimeout(() => setCommittedFilters(next), SEARCH_DEBOUNCE_MS);
        } else {
          setCommittedFilters(next);
        }
        return next;
      });
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters(prev => ({
      ...prev,
      company: [], category: [], country: [], date: 'All', search: '',
      workplace: [], experience: [], employment: [],
      hasSalary: false, salaryMin: '', salaryMax: '',
    }));
  }, [setFilters]);

  const updateJob = useCallback((jobId: string, updates: Partial<IJob>) => {
    setJobs(prev =>
      prev.map(job => (job._id === jobId ? { ...job, ...updates } : job)),
    );
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      filters.search.trim() !== ''    ||
      filters.company.length > 0      ||
      filters.category.length > 0     ||
      filters.country.length > 0      ||
      filters.date !== 'All'          ||
      filters.workplace.length > 0    ||
      filters.experience.length > 0   ||
      filters.employment.length > 0   ||
      filters.hasSalary               ||
      filters.salaryMin.trim() !== '' ||
      filters.salaryMax.trim() !== '',
    [filters],
  );

  const activeFilterCount = useMemo(
    () =>
      (filters.search.trim()         ? 1 : 0) +
      (filters.company.length > 0    ? 1 : 0) +
      (filters.category.length > 0   ? 1 : 0) +
      (filters.country.length > 0    ? 1 : 0) +
      (filters.date !== 'All'        ? 1 : 0) +
      (filters.workplace.length > 0  ? 1 : 0) +
      (filters.experience.length > 0 ? 1 : 0) +
      (filters.employment.length > 0 ? 1 : 0) +
      (filters.hasSalary             ? 1 : 0) +
      (filters.salaryMin.trim()      ? 1 : 0) +
      (filters.salaryMax.trim()      ? 1 : 0),
    [filters],
  );

  return {
    filters,
    setFilters,
    clearFilters,
    hasActiveFilters,
    activeFilterCount,
    jobs,
    setJobs,
    totalJobs,
    hasMore,
    loading,
    loadingMore,
    loadMore,
    error,
    retry,
    updateJob,
    companyOptions,
    categoryOptions,
    facetCounts,
  };
}
