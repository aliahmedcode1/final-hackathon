import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, verifyPassword, hashPassword, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';

const schema = z.object({
  current: z.string().min(1),
  next: z.string().min(8, 'New password must be at least 8 characters'),
});

export const PATCH = withAuth(null, async (req, ctx, session) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(422, 'UNPROCESSABLE', 'Invalid payload', parsed.error.flatten().fieldErrors);
  }
  const user = await store.get('users', session.id);
  if (!user || !verifyPassword(parsed.data.current, user.password_hash)) {
    return fail(422, 'UNPROCESSABLE', 'Current password is incorrect');
  }
  await store.update('users', session.id, {
    password_hash: hashPassword(parsed.data.next),
    must_change_pw: false,
  });
  await audit(session.email, 'auth.change_password', 'users', session.id, {});
  return json({ ok: true });
});
