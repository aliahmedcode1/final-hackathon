'use client';

import { useEffect, useState } from 'react';
import { api, fmtDate } from '@/lib/api';
import { PageHeader, Spinner } from '@/components/ui';
import DataTable from '@/components/DataTable';

export default function AuditPage() {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api('/audit', { query: { page, pageSize: 20 } }).then((r) => { setRows(r.rows); setTotal(r.total); }).catch(() => setRows([]));
  }, [page]);

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <PageHeader title="Audit log" subtitle={`Every administrative action (${total} events)`} />
      {!rows ? <Spinner /> : (
        <>
          <DataTable
            rows={rows}
            empty="No audit events yet"
            pageSize={20}
            columns={[
              { key: 'at', label: 'When', render: (r) => <span className="text-zinc-500">{new Date(r.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span> },
              { key: 'actor_email', label: 'Actor' },
              { key: 'action', label: 'Action', render: (r) => <code className="rounded bg-zinc-950 px-1.5 py-0.5 text-xs text-indigo-300">{r.action}</code> },
              { key: 'entity', label: 'Entity' },
              { key: 'detail', label: 'Detail', render: (r) => <span className="block max-w-72 truncate text-xs text-zinc-500">{JSON.stringify(r.detail)}</span> },
            ]}
          />
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
              <span>Page {page} of {pages}</span>
              <div className="flex gap-1">
                <button className="rounded-md border border-zinc-800 px-2 py-1 hover:bg-zinc-800 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
                <button className="rounded-md border border-zinc-800 px-2 py-1 hover:bg-zinc-800 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
