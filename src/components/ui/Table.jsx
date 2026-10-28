// src/components/ui/Table.jsx
//
// Responsive data table with sorting, loading state, and empty fallback.
// Horizontally scrollable on mobile inside an overflow-x: auto container.
//
// Named exports:
//   Table     — wrapper with scroll container, loading/empty state
//   Th        — header cell with optional sort indicator
//   Td        — body cell
//   Tr        — row with optional hover and selected state
//
// Table props:
//   columns   { key, label, align?, sortable?, width? }[]
//   data      any[]
//   keyField  string — used as React key (default: 'id')
//   loading   boolean
//   emptyState ReactNode — shown when data is empty and not loading
//   onSort    (key, dir) => void — dir: 'asc' | 'desc'
//   sortKey   string — currently sorted column key
//   sortDir   'asc' | 'desc'
//   renderRow (row, index) => ReactNode — custom row renderer
//   onRowClick (row) => void — makes rows clickable
//   selected  Set<string> — set of keyField values to highlight
//
// Usage:
//   <Table
//     columns={[
//       { key: 'name',  label: 'Client',   sortable: true },
//       { key: 'year',  label: 'Tax year', align: 'center' },
//       { key: 'agi',   label: 'AGI',      align: 'right'  },
//     ]}
//     data={clients}
//     keyField="id"
//     loading={loading}
//     emptyState={<EmptyState icon="👤" title="No clients" />}
//     onSort={(key, dir) => setSort({ key, dir })}
//     sortKey={sort.key}
//     sortDir={sort.dir}
//     onRowClick={(row) => navigate(`/clients/${row.id}`)}
//   />
//
// Low-level usage (build your own rows):
//   <Table columns={cols} data={[]} emptyState={<EmptyState />}>
//     {data.map(row => (
//       <Tr key={row.id} selected={selected.has(row.id)}>
//         <Td>{row.name}</Td>
//         <Td align="right">{fmt(row.agi)}</Td>
//       </Tr>
//     ))}
//   </Table>

import { useState } from 'react';
import { Spinner } from './Spinner';

export function Th({ children, align = 'left', sortable = false, sortActive = false, sortDir = 'asc', onClick, width, style = {} }) {
  return (
    <th
      onClick={sortable ? onClick : undefined}
      aria-sort={sortActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      style={{
        padding:        '9px 12px',
        fontSize:       '11px',
        fontWeight:     700,
        textTransform:  'uppercase',
        letterSpacing:  '0.05em',
        color:          sortActive ? 'var(--color-purple)' : 'var(--color-muted)',
        background:     'var(--color-bg)',
        borderBottom:   '1.5px solid var(--color-border)',
        textAlign:      align,
        whiteSpace:     'nowrap',
        cursor:         sortable ? 'pointer' : 'default',
        userSelect:     'none',
        width,
        transition:     'color .15s',
        ...style,
      }}
      onMouseEnter={(e) => { if (sortable) e.currentTarget.style.color = 'var(--color-purple)'; }}
      onMouseLeave={(e) => { if (sortable && !sortActive) e.currentTarget.style.color = 'var(--color-muted)'; }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
        {sortable && (
          <span aria-hidden="true" style={{ opacity: sortActive ? 1 : 0.35, fontSize: 10 }}>
            {sortActive && sortDir === 'desc' ? '↓' : '↑'}
          </span>
        )}
      </span>
    </th>
  );
}

export function Td({ children, align = 'left', muted = false, style = {}, ...rest }) {
  return (
    <td
      style={{
        padding:      '10px 12px',
        fontSize:     '13px',
        color:        muted ? 'var(--color-muted)' : 'var(--color-dark)',
        borderBottom: '1px solid var(--color-border)',
        textAlign:    align,
        verticalAlign:'middle',
        ...style,
      }}
      {...rest}
    >
      {children}
    </td>
  );
}

export function Tr({ children, selected = false, onClick, style = {}, ...rest }) {
  return (
    <tr
      onClick={onClick}
      style={{
        background:  selected ? 'var(--color-blue-pale)' : undefined,
        cursor:      onClick  ? 'pointer' : 'default',
        transition:  'background .1s',
        ...style,
      }}
      onMouseEnter={(e) => { if (onClick && !selected) e.currentTarget.style.background = 'var(--color-bg)'; }}
      onMouseLeave={(e) => { if (onClick && !selected) e.currentTarget.style.background = ''; }}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function Table({
  columns       = [],
  data          = [],
  keyField      = 'id',
  loading       = false,
  emptyState,
  onSort,
  sortKey,
  sortDir       = 'asc',
  renderRow,
  onRowClick,
  selected,
  children,
  style         = {},
}) {
  const [internalSortKey, setISK] = useState(null);
  const [internalSortDir, setISD] = useState('asc');
  const activeSortKey = sortKey ?? internalSortKey;
  const activeSortDir = sortKey ? sortDir : internalSortDir;

  function handleSort(key) {
    const newDir = activeSortKey === key && activeSortDir === 'asc' ? 'desc' : 'asc';
    if (onSort) {
      onSort(key, newDir);
    } else {
      setISK(key);
      setISD(newDir);
    }
  }

  // Sort data internally when no external onSort
  const rows = !onSort && activeSortKey
    ? [...data].sort((a, b) => {
        const av = a[activeSortKey] ?? '';
        const bv = b[activeSortKey] ?? '';
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return activeSortDir === 'asc' ? cmp : -cmp;
      })
    : data;

  return (
    <div
      className="ts-table-wrapper"
      style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', ...style }}
    >
      <table
        className="ts-tbl"
        style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'inherit' }}
      >
        {columns.length > 0 && (
          <thead>
            <tr>
              {columns.map(col => (
                <Th
                  key={col.key}
                  align={col.align}
                  sortable={col.sortable}
                  sortActive={activeSortKey === col.key}
                  sortDir={activeSortDir}
                  onClick={() => handleSort(col.key)}
                  width={col.width}
                >
                  {col.label}
                </Th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length || 1} style={{ padding: '40px', textAlign: 'center' }}>
                <Spinner label="Loading data…" />
              </td>
            </tr>
          ) : rows.length === 0 && !children ? (
            <tr>
              <td colSpan={columns.length || 1}>
                {emptyState || (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
                    No data
                  </div>
                )}
              </td>
            </tr>
          ) : children ? (
            children
          ) : (
            rows.map((row, i) => (
              renderRow ? renderRow(row, i) : (
                <Tr
                  key={row[keyField] ?? i}
                  selected={selected?.has(String(row[keyField]))}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map(col => (
                    <Td key={col.key} align={col.align}>
                      {row[col.key] ?? '—'}
                    </Td>
                  ))}
                </Tr>
              )
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
