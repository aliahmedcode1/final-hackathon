import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';

export const GET = withAuth(null, async (req, ctx, session) => {
  const { rows } = await store.list('notifications', {
    where: [['user_id', 'eq', session.id]],
    order: { col: 'created_at', asc: false },
    limit: 50,
  });
  return json({ rows, unread: rows.filter((r) => !r.read).length });
});

const schema = z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() });

// PATCH: mark read (specific ids or all).
export const PATCH = withAuth(null, async (req, ctx, session) => {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const { rows } = await store.list('notifications', { where: [['user_id', 'eq', session.id], ['read', 'eq', false]] });
  const ids = parsed.success && parsed.data.ids ? new Set(parsed.data.ids) : null;
  for (const n of rows) {
    if (ids && !ids.has(n.id)) continue;
    await store.update('notifications', n.id, { read: true });
  }
  return json({ ok: true });
});
