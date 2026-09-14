'use client';

import { memo } from 'react';
import { Check } from 'lucide-react';

export interface FilterOption {
  value: string;
  label: string;
}

interface Props {
  options: FilterOption[];
  search: string;
  value: string;
  selectedValues: string[];
  multiSelect: boolean;
  isMobile: boolean;
  searchable: boolean;
  onSelect: (val: string) => void;
}

function FilterOptionListImpl({
  options,
  search,
  value,
  selectedValues,
  multiSelect,
  isMobile,
  searchable,
  onSelect,
}: Props) {
  const filtered = searchable && search.trim()
    ? options.filter(o => o.value === 'All' || o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  if (filtered.length === 0) {
    return (
      <div style={{ padding: '10px 12px', fontSize: '0.76rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        No results
      </div>
    );
  }

  return (
    <>
      {filtered.map(option => {
        const selected = multiSelect
          ? (option.value === 'All' ? selectedValues.length === 0 : selectedValues.includes(option.value))
          : option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={selected}
            onMouseDown={e => e.stopPropagation()}
            onClick={() => onSelect(option.value)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%',
              padding: isMobile ? '14px 16px' : '8px 12px',
              fontSize: isMobile ? '0.92rem' : '0.8rem',
              minHeight: isMobile ? 48 : undefined,
              background: selected ? 'var(--acid-soft)' : 'transparent',
              border: 'none', cursor: 'pointer',
              color: selected ? 'var(--acid)' : 'var(--text-secondary)',
              textAlign: 'left', fontFamily: 'inherit',
              fontWeight: selected ? 600 : 400,
              borderBottom: isMobile ? '1px solid var(--border)' : 'none',
              borderLeft: selected ? '2px solid var(--acid)' : '2px solid transparent',
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            <span>{option.label}</span>
            {selected && <Check size={isMobile ? 14 : 11} style={{ flexShrink: 0, marginLeft: 6, color: 'var(--acid)' }} />}
          </button>
        );
      })}
    </>
  );
}

export const FilterOptionList = memo(FilterOptionListImpl);