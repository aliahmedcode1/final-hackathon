import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const GET = withAuth(null, async () => {
  const { rows } = await store.list('announcements', { order: { col: 'created_at', asc: false } });
  return json({ rows });
});

const schema = z.object({ title: z.string().min(3), body: z.string().min(1) });

export const POST = withAuth(['admin', 'hr'], async (req, ctx, session) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Title and body required');
  const rec = await store.insert('announcements', { ...parsed.data, posted_by: session.email });
  await audit(session.email, 'announcement.post', 'announcements', rec.id, { title: rec.title });
  return json(rec, 201);
});
