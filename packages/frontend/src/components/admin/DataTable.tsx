'use client';

/**
 * Dense, sortable table with a sticky header and optional row selection.
 *
 * Column widths are fixed (table-layout: fixed) so long titles truncate with an
 * ellipsis instead of pushing other columns off screen. The selected row is
 * scrolled into view whenever it changes, which is what makes j/k navigation
 * usable on long lists. onEndReached fires near the bottom for progressive
 * loading of server-paginated lists.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** CSS width, e.g. 96 or '30%'. Omit on exactly one column to let it fill. */
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
  /** Present → the column is sortable by this value. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Tooltip for truncated cells. */
  title?: (row: T) => string | undefined;
  className?: string;
  hideOnSmall?: boolean;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  selectedKey?: string | null;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  onEndReached?: () => void;
  empty?: ReactNode;
  footer?: ReactNode;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

const END_REACHED_PX = 240;

export function DataTable<T>({
  rows, columns, rowKey, selectedKey, onRowClick, initialSort, onEndReached, empty, footer,
}: Props<T>) {
  const [sort, setSort] = useState<SortState>(initialSort ?? null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find(c => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const direction = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
      return String(left).localeCompare(String(right)) * direction;
    });
  }, [rows, columns, sort]);

  useEffect(() => {
    if (!selectedKey || !wrapRef.current) return;
    const row = wrapRef.current.querySelector<HTMLTableRowElement>(`tr[data-key="${CSS.escape(selectedKey)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey]);

  const toggleSort = (column: Column<T>) => {
    if (!column.sortValue) return;
    setSort(prev => {
      if (!prev || prev.key !== column.key) return { key: column.key, dir: 'asc' };
      if (prev.dir === 'asc') return { key: column.key, dir: 'desc' };
      return null;
    });
  };

  const handleScroll = () => {
    const el = wrapRef.current;
    if (!el || !onEndReached) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < END_REACHED_PX) onEndReached();
  };

  return (
    <>
      <div className="adm-table-wrap" ref={wrapRef} onScroll={handleScroll}>
        <table className="adm-table">
          <colgroup>
            {columns.map(c => (
              <col key={c.key} className={c.hideOnSmall ? 'adm-hide-sm' : undefined} style={c.width != null ? { width: c.width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map(c => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={c.hideOnSmall ? 'adm-hide-sm' : undefined}
                    data-sortable={c.sortValue ? 'true' : undefined}
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    style={{ textAlign: c.align }}
                    onClick={() => toggleSort(c)}
                  >
                    <span className="adm-th">
                      {c.header}
                      {active && (sort!.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  data-key={key}
                  aria-selected={selectedKey === key ? 'true' : undefined}
                  data-clickable={onRowClick ? 'true' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map(c => (
                    <td
                      key={c.key}
                      className={[c.className, c.hideOnSmall ? 'adm-hide-sm' : ''].filter(Boolean).join(' ') || undefined}
                      style={{ textAlign: c.align }}
                      title={c.title?.(row)}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {sortedRows.length === 0 && empty}
      </div>
      {footer && <div className="adm-table-foot">{footer}</div>}
    </>
  );
}
