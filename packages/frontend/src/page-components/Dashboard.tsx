'use client';

/**
 * Browse Jobs (/jobs).
 *
 * A thin wrapper: this file owns the data source (useJobFilters), auth, and the
 * mobile filter surface. The layout itself lives in JobBrowsePage, shared with
 * the remote vertical.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from '@/compat/router';
import UpgradeModal from '../components/UpgradeModal';
import { DashboardFilterBar, MobileFilterSheet } from '../components/DashboardFilterBar';
import JobBrowsePage from './JobBrowsePage';
import { useAuth } from '../context/AuthContext';
import type { GateReason } from '../types';
import { BRAND } from '../theme/brand';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useJobFilters } from '../hooks/useJobFilters';

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const companyParam = searchParams.get('company');
  const searchParam  = searchParams.get('search');

  const {
    filters, setFilters, clearFilters, hasActiveFilters, activeFilterCount,
    companyOptions, categoryOptions, facetCounts,
    jobs, totalJobs, hasMore,
    loading, loadingMore, loadMore, error, retry,
  } = useJobFilters(companyParam || undefined, searchParam || undefined);

  const { isPremium } = useAuth();

  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [openDropdown,    setOpenDropdown]    = useState<string | null>(null);
  // Only the premium-filter gate remains — JD gating lives on /jobs/[id].
  const [gateModal,       setGateModal]       = useState<{ reason: GateReason } | null>(null);

  const isMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => { if (!isMobile) setFilterSheetOpen(false); }, [isMobile]);

  const handlePremiumFilter = useCallback(() => {
    setGateModal({ reason: 'premium_required' });
  }, []);

  // Mobile keeps the previous surface: top bar + bottom sheet, unchanged.
  const mobileFilters = isMobile ? (
    <>
      <div style={{ marginBottom: 10, flexShrink: 0 }}>
        <DashboardFilterBar
          filters={filters} setFilters={setFilters}
          companyOptions={companyOptions} categoryOptions={categoryOptions}
          facetCounts={facetCounts}
          filteredCount={jobs.length} totalCount={totalJobs}
          hasActiveFilters={hasActiveFilters} activeFilterCount={activeFilterCount}
          clearFilters={clearFilters}
          openDropdown={openDropdown} setOpenDropdown={setOpenDropdown}
          onOpenFilterSheet={() => setFilterSheetOpen(true)}
          isPremium={isPremium} onPremiumRequired={handlePremiumFilter}
        />
      </div>

      {filterSheetOpen && (
        <MobileFilterSheet
          filters={filters} setFilters={setFilters}
          companyOptions={companyOptions} categoryOptions={categoryOptions}
          facetCounts={facetCounts}
          filteredCount={jobs.length}
          hasActiveFilters={hasActiveFilters} clearFilters={clearFilters}
          openDropdown={openDropdown} setOpenDropdown={setOpenDropdown}
          onClose={() => setFilterSheetOpen(false)}
          isPremium={isPremium} onPremiumRequired={handlePremiumFilter}
        />
      )}
    </>
  ) : null;

  return (
    <>
      <JobBrowsePage
        jobs={jobs} totalJobs={totalJobs}
        loading={loading} loadingMore={loadingMore} hasMore={hasMore} loadMore={loadMore}
        error={error} retry={retry}
        filters={filters} setFilters={setFilters} clearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters} activeFilterCount={activeFilterCount}
        companyOptions={companyOptions} categoryOptions={categoryOptions}
        facetCounts={facetCounts}
        isPremium={isPremium} onPremiumRequired={handlePremiumFilter}
        jobLinkPrefix="/jobs"
        autocompleteEndpoint="/api/jobs/autocomplete"
        pageTitle={`${BRAND.appName} Jobs`}
        mobileFilters={mobileFilters}
      />

      {gateModal && (
        <UpgradeModal
          gateReason={gateModal.reason}
          onClose={() => setGateModal(null)}
        />
      )}
    </>
  );
}
