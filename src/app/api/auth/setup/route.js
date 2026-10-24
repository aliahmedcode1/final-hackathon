import { z } from 'zod';
import { store } from '@/lib/store';
import { hashPassword, signSession, setSessionCookie, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';

const schema = z.object({
  company: z.object({
    name: z.string().min(2),
    address: z.string().default(''),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    grace_minutes: z.coerce.number().int().min(0).max(240),
    weekend_days: z.array(z.number().int().min(0).max(6)).min(1),
    latitude: z.coerce.number(),
    longitude: z.coerce.number(),
    radius_m: z.coerce.number().int().min(30).max(10000),
  }),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail(422, 'UNPROCESSABLE', 'Invalid setup payload', parsed.error.flatten().fieldErrors);
  }
  const { company, admin } = parsed.data;

  const { total } = await store.list('users', { limit: 1 });
  if (total > 0) return fail(409, 'CONFLICT', 'Setup already completed');

  const existing = await store.findOne('company_settings', []);
  const settings = existing
    ? await store.update('company_settings', existing.id, {
        ...company,
        quotas: existing.quotas || { annual: 14, sick: 8, casual: 10 },
        setup_done: true,
        updated_at: new Date().toISOString(),
      })
    : await store.insert('company_settings', {
        ...company,
        halfday_hours: 5,
        quotas: { annual: 14, sick: 8, casual: 10 },
        currency: 'PKR',
        setup_done: true,
      });

  const user = await store.insert('users', {
    email: admin.email.toLowerCase(),
    password_hash: hashPassword(admin.password),
    role: 'admin',
    is_active: true,
    must_change_pw: false,
  });

  await audit(user.email, 'setup.first_run', 'company_settings', settings.id, { company: company.name });

  const token = await signSession({ id: user.id, email: user.email, role: user.role });
  await setSessionCookie(token);
  return json({ ok: true, role: user.role }, 201);
}
