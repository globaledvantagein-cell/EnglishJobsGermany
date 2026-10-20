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
  // Shareable filter links (homepage quick links, FAQ): ?visa=1,
  // ?relocation=1, ?workplace=remote, ?experience=entry, ?category=Sales (comma-separated lists).
  const list = (key: string) => (searchParams.get(key) || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  const urlFilters = {
    ...(searchParams.get('visa') === '1' && { visa: true }),
    ...(searchParams.get('relocation') === '1' && { relocation: true }),
    ...(list('workplace').length > 0 && { workplace: list('workplace') }),
    ...(list('experience').length > 0 && { experience: list('experience') }),
    ...(list('employment').length > 0 && { employment: list('employment') }),
    // Category names are case-sensitive ("Sales", "AI / ML"), so not lower-cased.
    ...(searchParams.get('category') && { category: searchParams.get('category')!.split(',').map(v => v.trim()).filter(Boolean) }),
  };

  const {
    filters, setFilters, clearFilters, hasActiveFilters, activeFilterCount,
    companyOptions, categoryOptions, facetCounts,
    jobs, totalJobs, hasMore,
    loading, loadingMore, loadMore, error, retry,
  } = useJobFilters(companyParam || undefined, searchParam || undefined, urlFilters);

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
          filteredCount={totalJobs /* all matches, not just the loaded page */}
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
