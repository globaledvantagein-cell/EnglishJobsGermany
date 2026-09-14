'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Plus, Building2, RefreshCw, Search, ArrowUpDown } from 'lucide-react';
import { Container, PageHeader, Button, FormField, Input, Card, Badge, Alert, EmptyState } from '../components/ui';
import CompanyCard from '../components/DirectoryCard';
import SkeletonCompanyCard from '../components/SkeletonCompanyCard';
import Pagination from '../components/Pagination';
import type { SortOption } from '../hooks/useCompanies';
import type { ICompany } from '../types';
import { apiGet, apiPost, apiDelete } from '../utils/jobApi';

const ITEMS_PER_PAGE = 24;

export default function AdminCompanies() {
  const [allCompanies, setAllCompanies] = useState<ICompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [nc, setNc] = useState({ name: '', domain: '', cities: '' });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search, sort, pagination state
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('a-z');
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { fetchCompanies(); }, []);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const d = await apiGet<ICompany[]>('/api/jobs/directory', { noAuth: true });
      setAllCompanies(Array.isArray(d) ? d : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  // Filter, sort, paginate
  const q = debouncedSearch.toLowerCase().trim();
  let filtered = allCompanies;
  if (q) {
    filtered = allCompanies.filter(c =>
      c.companyName.toLowerCase().includes(q) ||
      c.cities.some((city: string) => city.toLowerCase().includes(q))
    );
  }
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'a-z') return a.companyName.localeCompare(b.companyName);
    if (sort === 'z-a') return b.companyName.localeCompare(a.companyName);
    if (sort === 'most-hiring') return (b.openRoles || 0) - (a.openRoles || 0);
    return 0;
  });
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const companies = sorted.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const addCompany = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setAdding(true);
    try {
      await apiPost('/api/jobs/companies', nc);
      setNc({ name: '', domain: '', cities: '' });
      fetchCompanies();
      setMsg({ type: 'success', text: 'Company added.' });
    } catch { setMsg({ type: 'error', text: 'Failed to add company.' }); }
    finally { setAdding(false); }
  };

  const deleteCompany = async (c: ICompany) => {
    if (!window.confirm(`Delete ${c.companyName}?`)) return;
    if (c.source !== 'manual') {
      alert('You can only delete manually-added companies here.');
      return;
    }
    try {
      await apiDelete(`/api/jobs/companies/${c._id}`);
      setAllCompanies(p => p.filter(x => x._id !== c._id));
    } catch { alert('Network Error'); }
  };

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--surface-solid)', borderBottom: '1.25px solid var(--border)', padding: '32px 0' }}>
        <Container>
          <PageHeader label="Admin" title={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Building2 size={22} color="var(--primary)" />Manage Directory</span>}
            subtitle={`${allCompanies.length} companies in directory`}
            actions={<Button variant="ghost" size="sm" onClick={fetchCompanies} loading={loading}><RefreshCw size={13} />Refresh</Button>} />
        </Container>
      </div>
      <Container style={{ padding: '32px 24px' }}>
        {/* Add form */}
        <Card style={{ marginBottom: 24 }}>
          <p className="font-sketch" style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: 18 }}>Add Company</p>
          <form onSubmit={addCompany} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, alignItems: 'end' }}>
            <FormField label="Company Name *"><Input required placeholder="ACME GmbH" value={nc.name} onChange={e => setNc(p => ({ ...p, name: e.target.value }))} /></FormField>
            <FormField label="Domain *"><Input required placeholder="acme.com" value={nc.domain} onChange={e => setNc(p => ({ ...p, domain: e.target.value }))} /></FormField>
            <FormField label="Cities (comma-separated)"><Input placeholder="Berlin, Munich" value={nc.cities} onChange={e => setNc(p => ({ ...p, cities: e.target.value }))} /></FormField>
            <Button loading={adding} style={{ alignSelf: 'flex-end', marginBottom: 0 }}><Plus size={14} />Add</Button>
          </form>
          {msg && <div style={{ marginTop: 14 }}><Alert type={msg.type}>{msg.text}</Alert></div>}
        </Card>

        {/* Search + Sort bar */}
        <div className="sticky-filter-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 320, minWidth: 160 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--subtle-ink)', pointerEvents: 'none' }} />
              <input type="text" placeholder="Search…" aria-label="Search companies" value={searchInput} onChange={e => handleSearchChange(e.target.value)}
                style={{ width: '100%', padding: '10px 14px 10px 38px', fontFamily: 'inherit', fontSize: '0.875rem', background: 'var(--paper2)', color: 'var(--ink)', border: '1.25px solid var(--border)', borderRadius: 10, outline: 'none' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = 'var(--focus-ring)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }} />
            </div>
            <Badge variant="neutral">{total} result{total !== 1 ? 's' : ''}</Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowUpDown size={14} style={{ color: 'var(--subtle-ink)' }} />
            <select value={sort} onChange={e => { setSort(e.target.value as SortOption); setPage(1); }} aria-label="Sort"
              style={{
                padding: '8px 32px 8px 10px', fontFamily: 'inherit', fontSize: '0.85rem', background: 'var(--paper2)', color: 'var(--ink)', border: '1.25px solid var(--border)', borderRadius: 10, outline: 'none', cursor: 'pointer', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236F6F6F' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center'
              }}>
              <option value="a-z">A → Z</option>
              <option value="z-a">Z → A</option>
              <option value="most-hiring">Most Hiring</option>
            </select>
          </div>
        </div>

        {/* Company grid */}
        {loading ? (
          <div className="companies-grid">{Array.from({ length: 6 }).map((_, i) => <SkeletonCompanyCard key={i} />)}</div>
        ) : companies.length === 0 ? (
          <EmptyState icon={<Building2 size={32} />} title="No companies found" body={debouncedSearch ? 'Try a different search term.' : 'Add your first company above.'} />
        ) : (
          <>
            <div className="companies-grid stagger">
              {companies.map(c => (
                <CompanyCard
                  key={c._id}
                  company={c}
                  adminActions={
                    <button onClick={(e) => { e.stopPropagation(); deleteCompany(c); }} aria-label={`Delete ${c.companyName}`}
                      style={{ background: 'none', border: '1.25px solid var(--border)', borderRadius: 7, padding: 6, cursor: 'pointer', color: 'var(--subtle-ink)', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'background-color 0.22s, border-color 0.22s, color 0.22s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--danger)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--subtle-ink)'; }}>
                      <Trash2 size={13} />
                    </button>
                  }
                />
              ))}
            </div>
            <Pagination page={safePage} totalPages={totalPages} onPageChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          </>
        )}
      </Container>
    </div>
  );
}