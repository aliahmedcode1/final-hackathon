'use client';

import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api, fmtDate } from '@/lib/api';
import { pushToast } from '@/store/store';
import { PageHeader, Spinner, btnGhost, EmptyState, Badge } from '@/components/ui';

export default function NotificationsPage() {
  const dispatch = useDispatch();
  const [rows, setRows] = useState(null);

  const load = () => api('/notifications').then((r) => setRows(r.rows)).catch((e) => dispatch(pushToast({ type: 'error', message: e.message })));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const markAll = async () => {
    await api('/notifications', { method: 'PATCH', body: { all: true } }).catch(() => {});
    load();
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Leave decisions, payslips and corrections"
        actions={<button className={btnGhost} onClick={markAll}>Mark all read</button>}
      />
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <EmptyState title="No notifications yet" />
      ) : (
        <div className="space-y-2">
          {rows.map((n) => (
            <div key={n.id} className={`flex items-start justify-between gap-3 rounded-xl border p-4 ${n.read ? 'border-zinc-800/60 bg-zinc-900/30' : 'border-indigo-500/30 bg-indigo-500/5'}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{n.title}</span>
                  <Badge value={n.type} />
                </div>
                {n.body && <p className="mt-1 text-sm text-zinc-400">{n.body}</p>}
                <span className="mt-1 block text-xs text-zinc-600">{fmtDate(n.created_at)}</span>
              </div>
              {!n.read && (
                <button className="text-xs text-indigo-400 hover:underline" onClick={async () => { await api('/notifications', { method: 'PATCH', body: { ids: [n.id] } }); load(); }}>
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
