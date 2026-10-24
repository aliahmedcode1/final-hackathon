import { z } from 'zod';
import { store } from '@/lib/store';
import { verifyPassword, signSession, setSessionCookie, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Email and password required');

  const { email, password } = parsed.data;
  const user = await store.findOne('users', [['email', 'eq', email.toLowerCase()]]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return fail(401, 'UNAUTHORIZED', 'Invalid email or password');
  }
  if (!user.is_active) return fail(403, 'FORBIDDEN', 'Account deactivated — contact your admin');

  const token = await signSession({ id: user.id, email: user.email, role: user.role, employee_id: user.employee_id });
  await setSessionCookie(token);
  await audit(user.email, 'auth.login', 'users', user.id, {});
  return json({ ok: true, role: user.role, must_change_pw: user.must_change_pw });
}
