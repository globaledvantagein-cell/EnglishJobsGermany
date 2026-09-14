import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ICompany } from '../types';
import { apiGet } from '../utils/jobApi';

export type SortOption = 'a-z' | 'z-a' | 'most-hiring';

interface UseCompaniesParams {
    page: number;
    limit: number;
    search: string;
    sort: SortOption;
}

interface UseCompaniesResult {
    companies: ICompany[];
    allCompanies: ICompany[];
    total: number;
    totalPages: number;
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useCompanies({ page, limit, search, sort }: UseCompaniesParams): UseCompaniesResult {
    const [allCompanies, setAllCompanies] = useState<ICompany[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchCompanies = useCallback(() => {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);
        setError(null);

        apiGet<ICompany[]>('/api/jobs/directory', { signal: ctrl.signal, noAuth: true })
            .then(d => setAllCompanies(Array.isArray(d) ? d : []))
            .catch(e => {
                if (e.name !== 'AbortError') {
                    console.error(e);
                    setError('Failed to load companies.');
                }
            })
            .finally(() => {
                if (!ctrl.signal.aborted) setLoading(false);
            });
    }, []);

    useEffect(() => {
        fetchCompanies();
        return () => { abortRef.current?.abort(); };
    }, [fetchCompanies]);

    const { companies, total, totalPages } = useMemo(() => {
        const q = search.toLowerCase().trim();
        let filtered = allCompanies;

        if (q) {
            filtered = allCompanies.filter(c =>
                c.companyName.toLowerCase().includes(q) ||
                c.cities.some(city => city.toLowerCase().includes(q))
            );
        }

        const sorted = [...filtered].sort((a, b) => {
            if (sort === 'a-z') return a.companyName.localeCompare(b.companyName);
            if (sort === 'z-a') return b.companyName.localeCompare(a.companyName);
            if (sort === 'most-hiring') return (b.openRoles || 0) - (a.openRoles || 0);
            return 0;
        });

        const total = sorted.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * limit;
        const companies = sorted.slice(start, start + limit);

        return { companies, total, totalPages };
    }, [allCompanies, search, sort, page, limit]);

    return { companies, allCompanies, total, totalPages, loading, error, refetch: fetchCompanies };
}
