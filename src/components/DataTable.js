'use client';

import { useMemo, useState } from 'react';
import { EmptyState } from './ui';

// Client-side sortable/paginated table. columns: {key, label, render?, className?, sortValue?}
export default function DataTable({ columns, rows, pageSize = 10, empty = 'No records', rowKey = (r) => r.id }) {
  const [sort, setSort] = useState({ key: null, asc: true });
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sort.key]);
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      const cmp = x === y ? 0 : (x === null || x === undefined ? -1 : y === null || y === undefined ? 1 : x < y ? -1 : 1);
      return sort.asc ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const view = sorted.slice(cur * pageSize, cur * pageSize + pageSize);

  if (!rows.length) return <EmptyState title={empty} />;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/70 text-left text-xs uppercase tracking-wide text-zinc-500">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`cursor-pointer px-4 py-3 font-medium hover:text-zinc-300 ${c.className || ''}`}
                  onClick={() => setSort((s) => (s.key === c.key ? { key: c.key, asc: !s.asc } : { key: c.key, asc: true }))}
                >
                  {c.label}
                  {sort.key === c.key && <span className="ml-1">{sort.asc ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={rowKey(r) ?? i} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/40">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.className || ''}`}>
                    {c.render ? c.render(r) : (r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
          <span>
            {cur * pageSize + 1}–{Math.min((cur + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-1">
            <button className="rounded-md border border-zinc-800 px-2 py-1 hover:bg-zinc-800 disabled:opacity-40" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Prev</button>
            <button className="rounded-md border border-zinc-800 px-2 py-1 hover:bg-zinc-800 disabled:opacity-40" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
