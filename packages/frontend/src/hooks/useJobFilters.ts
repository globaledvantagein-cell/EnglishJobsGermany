/**
 * Server-driven job filters hook.
 *
 * All filtering happens on the backend; ordering is a daily-seeded shuffle.
 * The hook manages:
 *   - filter state (UI updates instantly, search is debounced 400 ms)
 *   - fetching page 1 whenever committed filters change
 *   - appending subsequent pages via `loadMore()`
 *   - company dropdown options fetched once from /api/jobs/company-names
 *   - category dropdown options fetched once from /api/jobs/category-counts
 *   - an `updateJob()` helper so callers can patch individual jobs in-memory
 *     (e.g. after an apply-click count update) without refetching
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IJob } from '../types';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../utils/categorize';
import { apiGet, apiGetCached } from '../utils/jobApi';
import {
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  SALARY_DEBOUNCE_MS,
  DEFAULT_FILTERS,
  buildSearchParams,
  type FilterState,
  type FilterDropdownOption,
  type IFacetCounts,
} from './jobFilterTypes';

// Re-export so existing imports keep working.
export {
  PAGE_SIZE,
  DATE_DROPDOWN_OPTIONS,
  FILTER_CONTROL_STYLE,
  DEFAULT_FILTERS,
  type FilterState,
  type DateFilter,
  type FilterDropdownOption,
} from './jobFilterTypes';

export function useJobFilters(initialCompany?: string, initialSearch?: string) {
  const initialState = useMemo<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    company: initialCompany ? [initialCompany] : [],
    search: initialSearch || DEFAULT_FILTERS.search,
  }), [initialCompany, initialSearch]);

  // UI state — updates immediately
  const [filters, setFiltersInternal] = useState<FilterState>(initialState);
  // Debounced "committed" state — drives API calls
  const [committedFilters, setCommittedFilters] = useState<FilterState>(initialState);

  // Server results
  const [jobs,        setJobs]        = useState<IJob[]>([]);
  const [totalJobs,   setTotalJobs]   = useState(0);
  const [hasMore,     setHasMore]     = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // The thrown error from the page-1 fetch (null when healthy). Surfaced so the
  // page can show a real "server unreachable / request failed" state with a
  // retry instead of an empty "no jobs match" — which was a lie when the
  // backend was simply down.
  const [error,       setError]       = useState<unknown>(null);
  // Bumping this re-runs the page-1 effect with the same filters.
  const [retryTick,   setRetryTick]   = useState(0);

  const [companyOptions, setCompanyOptions] = useState<FilterDropdownOption[]>([
    { value: 'All', label: 'All' },
  ]);

  const [categoryOptions, setCategoryOptions] = useState<FilterDropdownOption[]>(
    CATEGORY_ORDER.map(cat => ({ value: cat, label: CATEGORY_LABELS[cat] })),
  );

  // Live facet totals for the "(N)" badges on filter options. Unfiltered
  // totals, cached like the other dropdown bootstraps — null until loaded.
  const [facetCounts, setFacetCounts] = useState<IFacetCounts | null>(null);

  // Internal refs
  const abortRef       = useRef<AbortController | null>(null);
  const pageRef        = useRef(2);
  const loadingMoreRef = useRef(false);
  const committedRef   = useRef(committedFilters);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    committedRef.current = committedFilters;
  }, [committedFilters]);

  // ── Bootstrap: company names + category counts (parallel, once) ─────────
  useEffect(() => {
    const ctrl = new AbortController();

    // Stable, low-churn dropdown data — cache 10 min (memory + localStorage).
    apiGetCached<string[]>('/api/jobs/company-names', {
      signal: ctrl.signal, noAuth: true,
      memoryTtlMs: 10 * 60 * 1000, localTtlMs: 10 * 60 * 1000,
    })
      .then(names => {
        if (!Array.isArray(names)) return;
        setCompanyOptions([
          { value: 'All', label: 'All' },
          ...names.map(n => ({ value: n, label: n })),
        ]);
      })
      .catch(() => {}); // non-critical

    apiGetCached<Record<string, number>>('/api/jobs/category-counts', {
      signal: ctrl.signal, noAuth: true,
      memoryTtlMs: 10 * 60 * 1000, localTtlMs: 10 * 60 * 1000,
    })
      .then(counts => {
        if (!counts || typeof counts !== 'object') return;
        setCategoryOptions(
          CATEGORY_ORDER.map(cat => ({
            value: cat,
            label: `${CATEGORY_LABELS[cat]} (${counts[cat] || 0})`,
          })),
        );
      })
      .catch(() => {});

    apiGetCached<IFacetCounts>('/api/jobs/filter-counts', {
      signal: ctrl.signal, noAuth: true,
      memoryTtlMs: 10 * 60 * 1000, localTtlMs: 10 * 60 * 1000,
    })
      .then(counts => {
        // totalJobs === 0 almost always means the response was captured while
        // the backend cache was still booting (and then cached client-side for
        // 10 min) — showing "(0)" everywhere is worse than no badges.
        if (counts && typeof counts === 'object' && counts.workplace && counts.totalJobs > 0) {
          setFacetCounts(counts);
        }
      })
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

    const params = buildSearchParams(committedFilters, 1);

    // MUST send auth headers: the backend strips premium-gated filters
    // (workplace/experience/employment/visa/relocation/salary) for
    // anonymous requests. With noAuth, even premium users got unfiltered results.
    apiGet<{ jobs?: IJob[]; totalJobs?: number }>(`/api/jobs?${params}`, { signal: ctrl.signal })
      .then(data => {
        if (ctrl.signal.aborted) return;
        const batch = Array.isArray(data?.jobs) ? data.jobs : [];
        const total = Number(data?.totalJobs) || 0;
        setJobs(batch);
        setTotalJobs(total);
        setHasMore(batch.length === PAGE_SIZE && batch.length < total);
      })
      .catch(err => {
        if (err?.name === 'AbortError' || ctrl.signal.aborted) return;
        console.error('[useJobFilters] fetch error:', err);
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
    const params = buildSearchParams(committedRef.current, page);

    try {
      const data = await apiGet<{ jobs?: IJob[]; totalJobs?: number }>(
        `/api/jobs?${params}`, // auth headers required — see page-1 fetch above
      );
      const batch = Array.isArray(data?.jobs) ? data.jobs : [];
      const total = Number(data?.totalJobs) || 0;

      setJobs(prev => {
        const next = [...prev, ...batch];
        setHasMore(next.length < total);
        return next;
      });
      setTotalJobs(total);
      pageRef.current = page + 1;
    } catch (err) {
      console.error('[useJobFilters] loadMore error:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore]);

  // ── Debounced setFilters ────────────────────────────────────────────────
  const setFilters = useCallback(
    (updater: FilterState | ((prev: FilterState) => FilterState)) => {
      setFiltersInternal(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const searchChanged = next.search !== prev.search;
        const salaryChanged =
          next.salaryMin !== prev.salaryMin || next.salaryMax !== prev.salaryMax;

        // Only free-text inputs are debounced. Salary debounces slower than
        // search; everything else (dropdowns, chips) commits immediately.
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
      company: [], category: [], date: 'All', search: '',
      workplace: [], experience: [], employment: [],
      visa: false, relocation: false, hasSalary: false,
      salaryMin: '', salaryMax: '',
    }));
  }, [setFilters]);

  const updateJob = useCallback((jobId: string, updates: Partial<IJob>) => {
    setJobs(prev =>
      prev.map(job => (job._id === jobId ? { ...job, ...updates } : job)),
    );
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      filters.search.trim() !== ''   ||
      filters.company.length > 0     ||
      filters.category.length > 0    ||
      filters.date !== 'All'         ||
      filters.workplace.length > 0   ||
      filters.experience.length > 0  ||
      filters.employment.length > 0  ||
      filters.visa                   ||
      filters.relocation             ||
      filters.hasSalary              ||
      filters.salaryMin.trim() !== '' ||
      filters.salaryMax.trim() !== '',
    [filters],
  );

  const activeFilterCount = useMemo(
    () =>
      (filters.search.trim()        ? 1 : 0) +
      (filters.company.length > 0   ? 1 : 0) +
      (filters.category.length > 0  ? 1 : 0) +
      (filters.date !== 'All'       ? 1 : 0) +
      (filters.workplace.length > 0 ? 1 : 0) +
      (filters.experience.length > 0 ? 1 : 0) +
      (filters.employment.length > 0 ? 1 : 0) +
      (filters.visa                 ? 1 : 0) +
      (filters.relocation           ? 1 : 0) +
      (filters.hasSalary            ? 1 : 0) +
      (filters.salaryMin.trim()     ? 1 : 0) +
      (filters.salaryMax.trim()     ? 1 : 0),
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
