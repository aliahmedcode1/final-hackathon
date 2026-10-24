import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json, hashPassword, tempPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';

// Admin: HR user provisioning + credential management (PRD feature 05).

export const GET = withAuth(['admin'], async () => {
  const { rows } = await store.list('users', { order: { col: 'created_at', asc: true } });
  return json(rows.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    employee_id: u.employee_id,
    is_active: u.is_active,
    must_change_pw: u.must_change_pw,
    created_at: u.created_at,
  })));
});

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(), // omitted → temp password generated
  role: z.enum(['hr', 'employee']),
  employee_id: z.string().optional(),
});

export const POST = withAuth(['admin'], async (req, ctx, session) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Invalid payload', parsed.error.flatten().fieldErrors);
  const { email, password, role, employee_id } = parsed.data;

  if (await store.findOne('users', [['email', 'eq', email.toLowerCase()]])) {
    return fail(409, 'CONFLICT', 'A user with this email already exists');
  }
  const temp = password || tempPassword();
  const user = await store.insert('users', {
    email: email.toLowerCase(),
    password_hash: hashPassword(temp),
    role,
    employee_id: employee_id || null,
    is_active: true,
    must_change_pw: !password,
  });
  await audit(session.email, 'user.create', 'users', user.id, { email, role });
  return json({ id: user.id, email: user.email, role, temp_password: password ? undefined : temp }, 201);
});

const patchSchema = z.object({
  id: z.string(),
  action: z.enum(['deactivate', 'activate', 'reset']),
});

export const PATCH = withAuth(['admin'], async (req, ctx, session) => {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Invalid payload');
  const { id, action } = parsed.data;

  const user = await store.get('users', id);
  if (!user) return fail(404, 'NOT_FOUND', 'User not found');
  if (user.id === session.id && action === 'deactivate') {
    return fail(422, 'UNPROCESSABLE', 'You cannot deactivate your own account');
  }

  if (action === 'reset') {
    const temp = tempPassword();
    await store.update('users', id, { password_hash: hashPassword(temp), must_change_pw: true });
    await audit(session.email, 'user.reset_password', 'users', id, { email: user.email });
    return json({ ok: true, temp_password: temp });
  }
  await store.update('users', id, { is_active: action === 'activate' });
  await audit(session.email, `user.${action}`, 'users', id, { email: user.email });
  return json({ ok: true });
});
