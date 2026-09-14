'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { FilterOptionList, type FilterOption } from './filters/FilterOptionList';

export type FilterDropdownOption = FilterOption;

interface Props {
  id: string;
  label: string;
  value: string;
  options: FilterDropdownOption[];
  onChange: (value: string) => void;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  active?: boolean;
  style?: CSSProperties;
  width?: number | string;
  searchable?: boolean;
  multiSelect?: boolean;
  selectedValues?: string[];
  onMultiChange?: (value: string[]) => void;
}

export default function FilterDropdown({
  id,
  label,
  value,
  options,
  onChange,
  openId,
  onOpenChange,
  active = false,
  style,
  width,
  searchable = false,
  multiSelect = false,
  selectedValues = [],
  onMultiChange,
}: Props) {
  const isOpen = openId === id;
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [search, setSearch] = useState('');
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, minWidth: 100 });
  const [ready, setReady] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
  }, []);

  const toggleOpen = () => {
    if (isOpen) {
      onOpenChange(null);
      return;
    }
    if (triggerRef.current && !isMobile) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
      setReady(true);
    }
    onOpenChange(id);
  };

  // ── Open/close lifecycle effects ────────────────────────────────────────
  useEffect(() => { if (!isOpen) setReady(false); }, [isOpen]);
  useEffect(() => { if (isOpen && !isMobile) updatePos(); }, [isOpen, isMobile, updatePos]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!isOpen || isMobile) return;
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [isOpen, isMobile, updatePos]);

  // Close on outside click (desktop only)
  useEffect(() => {
    if (!isOpen || isMobile) return;
    let handler: ((e: MouseEvent | TouchEvent) => void) | null = null;

    const rafId = requestAnimationFrame(() => {
      handler = (e: MouseEvent | TouchEvent) => {
        const target = e.target as Node;
        if (triggerRef.current?.contains(target)) return;
        if (panelRef.current?.contains(target)) return;
        if ((target as HTMLElement).closest?.(`[data-dropdown-id="${id}"]`)) return;
        onOpenChange(null);
      };
      document.addEventListener('mousedown', handler);
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (handler) document.removeEventListener('mousedown', handler);
    };
  }, [isOpen, isMobile, onOpenChange, id]);

  // Escape to close + reset search on close + autofocus on open
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      return;
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(null); };
    document.addEventListener('keydown', onEsc);
    if (searchable) {
      const t = setTimeout(() => searchRef.current?.focus(), 30);
      return () => { document.removeEventListener('keydown', onEsc); clearTimeout(t); };
    }
    return () => document.removeEventListener('keydown', onEsc);
  }, [isOpen, onOpenChange, searchable]);

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (isOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, isMobile]);

  const selectedOption = options.find(o => o.value === value);
  const displayLabel = multiSelect
    ? (selectedValues.length > 0 ? `${selectedValues.length} selected` : label)
    : (value === 'All' || !selectedOption ? label : selectedOption.label);

  const handleSelect = useCallback((val: string) => {
    if (!multiSelect) {
      onChange(val);
      onOpenChange(null);
      return;
    }
    if (!onMultiChange) return;
    if (val === 'All') {
      onMultiChange([]);
    } else if (selectedValues.includes(val)) {
      onMultiChange(selectedValues.filter(v => v !== val));
    } else {
      onMultiChange([...selectedValues, val]);
    }
  }, [multiSelect, onChange, onOpenChange, onMultiChange, selectedValues]);

  // ── MOBILE: bottom sheet ────────────────────────────────────────────────
  const mobilePanel = isOpen && isMobile ? (
    <>
      <div className="bottom-sheet-overlay" onClick={() => onOpenChange(null)} />
      <div className="bottom-sheet" role="dialog" aria-label={`Select ${label}`}>
        <div className="bottom-sheet-handle" />
        <div className="bottom-sheet-header">
          <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>{label}</span>
          <button
            onClick={() => onOpenChange(null)}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>
        {searchable && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              style={{
                width: '100%', height: 40, fontSize: '0.9rem',
                background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '0 12px', color: 'var(--text-secondary)', fontFamily: 'inherit',
              }}
            />
          </div>
        )}
        <div className="bottom-sheet-body" style={{ padding: 0 }} role="listbox">
          <FilterOptionList
            options={options}
            search={search}
            value={value}
            selectedValues={selectedValues}
            multiSelect={multiSelect}
            isMobile={true}
            searchable={searchable}
            onSelect={handleSelect}
          />
        </div>
      </div>
    </>
  ) : null;

  // ── DESKTOP: anchored panel ─────────────────────────────────────────────
  const desktopPanel = isOpen && !isMobile && ready ? (
    <div
      ref={panelRef}
      data-dropdown-id={id}
      role="listbox"
      style={{
        position: 'fixed',
        top: panelPos.top,
        left: panelPos.left,
        minWidth: panelPos.minWidth,
        width: searchable ? Math.max(panelPos.minWidth, 220) : panelPos.minWidth,
        zIndex: 10001,
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.08s ease both',
      }}
    >
      {searchable && (
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onMouseDown={e => e.stopPropagation()}
            placeholder="Search companies…"
            style={{
              width: '100%', height: 28, fontSize: '0.75rem',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '0 8px', color: 'var(--text-secondary)', fontFamily: 'inherit',
            }}
          />
        </div>
      )}
      <div style={{ overflowY: 'auto', maxHeight: searchable ? 240 : 280 }}>
        <FilterOptionList
          options={options}
          search={search}
          value={value}
          selectedValues={selectedValues}
          multiSelect={multiSelect}
          isMobile={false}
          searchable={searchable}
          onSelect={handleSelect}
        />
      </div>
    </div>
  ) : null;

  return (
    <>
      <div
        style={{
          position: 'relative', display: 'inline-block',
          width: width ?? 'auto',
          minWidth: typeof width === 'number' ? width : undefined,
          ...style,
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={toggleOpen}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`${label}: ${displayLabel}`}
          className="filter-pill"
          style={{
            height: 34, fontSize: '0.76rem',
            color: active ? 'var(--acid)' : 'var(--text-secondary)',
            background: active ? 'var(--acid-soft)' : 'var(--bg-surface-2)',
            border: `1.5px solid ${active ? 'var(--acid)' : 'var(--border)'}`,
            paddingLeft: 12, paddingRight: 28, cursor: 'pointer',
            display: 'flex', alignItems: 'center',
            width: '100%', textAlign: 'left', position: 'relative', fontFamily: 'inherit',
            fontWeight: active ? 600 : 400,
          }}
        >
          <span
            style={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {active && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--acid)', flexShrink: 0 }} />}
            {displayLabel}
          </span>
          <ChevronDown
            size={12}
            style={{
              position: 'absolute', right: 8, top: '50%',
              transform: `translateY(-50%) rotate(${isOpen ? 180 : 0}deg)`,
              transition: 'transform 0.18s', color: active ? 'var(--acid)' : 'var(--text-muted)', pointerEvents: 'none',
            }}
          />
        </button>
      </div>
      {mobilePanel && createPortal(mobilePanel, document.body)}
      {desktopPanel && createPortal(desktopPanel, document.body)}
    </>
  );
}