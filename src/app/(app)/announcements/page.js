'use client';

import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { api, fmtDate } from '@/lib/api';
import { pushToast } from '@/store/store';
import { PageHeader, Spinner, Field, inputCls, btnPrimary, btnGhost, EmptyState } from '@/components/ui';

export default function AnnouncementsPage() {
  const user = useSelector((s) => s.session.user);
  const dispatch = useDispatch();
  const canPost = user?.role === 'admin' || user?.role === 'hr';
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ title: '', body: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api('/announcements').then((r) => setRows(r.rows)).catch((e) => dispatch(pushToast({ type: 'error', message: e.message })));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const post = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/announcements', { method: 'POST', body: form });
      setForm({ title: '', body: '' });
      dispatch(pushToast({ type: 'success', message: 'Announcement posted' }));
      load();
    } catch (e2) { dispatch(pushToast({ type: 'error', message: e2.message })); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Announcements" subtitle="Company-wide notices" />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {canPost && (
          <form onSubmit={post} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="text-sm font-semibold text-zinc-300">New announcement</h2>
            <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} /></Field>
            <Field label="Body"><textarea className={inputCls + ' h-28'} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></Field>
            <button className={`${btnPrimary} w-full justify-center`} disabled={busy}>Post</button>
          </form>
        )}
        <div className="space-y-3">
          {!rows ? <Spinner /> : rows.length === 0 ? (
            <EmptyState title="No announcements yet" hint={canPost ? 'Post the first one.' : 'Check back later.'} />
          ) : (
            rows.map((a) => (
              <article key={a.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-zinc-100">{a.title}</h3>
                  <span className="text-xs text-zinc-600">{fmtDate(a.created_at)} · {a.posted_by}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{a.body}</p>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
