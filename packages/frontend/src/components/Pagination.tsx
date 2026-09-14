'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    siblingCount?: number;
}

function getPageNumbers(page: number, totalPages: number, siblings: number): (number | '...')[] {
    const pages: (number | '...')[] = [];
    const left = Math.max(2, page - siblings);
    const right = Math.min(totalPages - 1, page + siblings);

    pages.push(1);
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('...');
    if (totalPages > 1) pages.push(totalPages);

    return pages;
}

const btnBase: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 36, height: 36, borderRadius: 10,
    border: '1.25px solid var(--border)', background: 'var(--surface-solid)',
    color: 'var(--ink)', fontSize: '0.875rem', fontWeight: 600,
    cursor: 'pointer', transition: 'background-color 0.22s cubic-bezier(0.2,0.8,0.2,1), border-color 0.22s cubic-bezier(0.2,0.8,0.2,1), color 0.22s cubic-bezier(0.2,0.8,0.2,1)',
    fontFamily: 'inherit', padding: '0 8px',
};
const btnActive: React.CSSProperties = {
    ...btnBase, background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)',
};
const btnDisabled: React.CSSProperties = {
    ...btnBase, opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' as const,
};

export default function Pagination({ page, totalPages, onPageChange, siblingCount = 1 }: PaginationProps) {
    if (totalPages <= 1) return null;

    const pages = getPageNumbers(page, totalPages, siblingCount);

    return (
        <nav aria-label="Pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '24px 0' }}>
            {/* First */}
            <button onClick={() => onPageChange(1)} disabled={page === 1} aria-label="First page"
                style={page === 1 ? btnDisabled : btnBase}
                onMouseEnter={e => { if (page !== 1) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary)'; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)'; }}>
                <ChevronsLeft size={15} />
            </button>
            {/* Prev */}
            <button onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Previous page"
                style={page === 1 ? btnDisabled : btnBase}
                onMouseEnter={e => { if (page !== 1) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary)'; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)'; }}>
                <ChevronLeft size={15} />
            </button>
            {/* Pages */}
            {pages.map((p, i) =>
                p === '...'
                    ? <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--subtle-ink)', fontSize: '0.875rem', userSelect: 'none' }}>…</span>
                    : <button key={p} onClick={() => onPageChange(p)} aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined}
                        style={p === page ? btnActive : btnBase}
                        onMouseEnter={e => { if (p !== page) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary)'; } }}
                        onMouseLeave={e => { if (p !== page) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)'; } }}>
                        {p}
                    </button>
            )}
            {/* Next */}
            <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} aria-label="Next page"
                style={page === totalPages ? btnDisabled : btnBase}
                onMouseEnter={e => { if (page !== totalPages) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary)'; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)'; }}>
                <ChevronRight size={15} />
            </button>
            {/* Last */}
            <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages} aria-label="Last page"
                style={page === totalPages ? btnDisabled : btnBase}
                onMouseEnter={e => { if (page !== totalPages) { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary)'; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)'; }}>
                <ChevronsRight size={15} />
            </button>
        </nav>
    );
}