'use client';

/**
 * Remote Jobs (/remote-jobs).
 *
 * A thin wrapper, mirroring Dashboard.tsx: this file owns the data source
 * (useRemoteJobFilters) and nothing else. The layout — sticky filter rail plus
 * job cards — lives in JobBrowsePage, shared with the German vertical, so the
 * two pages cannot drift apart visually.
 *
 * The split view is gone: cards open /remote-jobs/[id] in a new tab, so this
 * page never fetches a job description.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from '@/compat/router';
import JobBrowsePage from './JobBrowsePage';
import { RemoteFilterBar, RemoteMobileFilterSheet } from '../components/RemoteFilterBar';
import { BRAND } from '../theme/brand';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useRemoteJobFilters, COUNTRY_OPTIONS } from '../hooks/useRemoteJobFilters';
import type { FilterDropdownOption } from '../hooks/jobFilterTypes';

// COUNTRY_OPTIONS is a readonly tuple of {value,label}; the sidebar wants a
// plain array of the shared option type.
const COUNTRY_FILTER_OPTIONS: FilterDropdownOption[] =
  COUNTRY_OPTIONS.map(o => ({ value: o.value, label: o.label }));

export default function RemoteDashboard() {
  const [searchParams] = useSearchParams();
  const companyParam = searchParams.get('company');
  const searchParam  = searchParams.get('search');

  const {
    filters, setFilters, clearFilters, hasActiveFilters, activeFilterCount,
    companyOptions, categoryOptions, facetCounts,
    jobs, totalJobs, hasMore,
    loading, loadingMore, loadMore, error, retry,
  } = useRemoteJobFilters(companyParam || undefined, searchParam || undefined);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => { if (!isMobile) setFilterSheetOpen(false); }, [isMobile]);

  // BrowseSidebar is desktop-only (hidden under 768px), so mobile keeps the
  // existing top bar + bottom sheet. Deleting RemoteFilterBar outright would
  // have left phone users with no way to filter at all.
  const mobileFilters = isMobile ? (
    <>
      <div style={{ marginBottom: 10, flexShrink: 0 }}>
        <RemoteFilterBar
          filters={filters} setFilters={setFilters}
          companyOptions={companyOptions} categoryOptions={categoryOptions}
          facetCounts={facetCounts}
          filteredCount={jobs.length} totalCount={totalJobs}
          hasActiveFilters={hasActiveFilters} activeFilterCount={activeFilterCount}
          clearFilters={clearFilters}
          openDropdown={openDropdown} setOpenDropdown={setOpenDropdown}
          onOpenFilterSheet={() => setFilterSheetOpen(true)}
        />
      </div>
      {filterSheetOpen && (
        <RemoteMobileFilterSheet
          filters={filters} setFilters={setFilters}
          companyOptions={companyOptions} categoryOptions={categoryOptions}
          facetCounts={facetCounts}
          filteredCount={jobs.length}
          hasActiveFilters={hasActiveFilters} clearFilters={clearFilters}
          openDropdown={openDropdown} setOpenDropdown={setOpenDropdown}
          onClose={() => setFilterSheetOpen(false)}
        />
      )}
    </>
  ) : null;

  return (
    <JobBrowsePage
      jobs={jobs} totalJobs={totalJobs}
      loading={loading} loadingMore={loadingMore} hasMore={hasMore} loadMore={loadMore}
      error={error} retry={retry}
      filters={filters} setFilters={setFilters} clearFilters={clearFilters}
      hasActiveFilters={hasActiveFilters} activeFilterCount={activeFilterCount}
      companyOptions={companyOptions} categoryOptions={categoryOptions}
      facetCounts={facetCounts as any}
      // The remote vertical is entirely free — nothing here is premium-gated,
      // so the rail renders every filter unlocked.
      isPremium
      jobLinkPrefix="/remote-jobs"
      autocompleteEndpoint="/api/remote-jobs/autocomplete"
      variant="remote"
      countryOptions={COUNTRY_FILTER_OPTIONS}
      pageTitle={`Remote Jobs — ${BRAND.appName}`}
      // "Applied" is tracked against the German jobs collection only.
      showAppliedBadges={false}
      mobileFilters={mobileFilters}
    />
  );
}
