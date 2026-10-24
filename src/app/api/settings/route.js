import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const GET = withAuth(['admin', 'hr'], async () => {
  const settings = await store.findOne('company_settings', []);
  return json(settings);
});

const schema = z.object({
  name: z.string().min(2),
  address: z.string().default(''),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  grace_minutes: z.coerce.number().int().min(0).max(240),
  halfday_hours: z.coerce.number().min(1).max(12).default(5),
  weekend_days: z.array(z.coerce.number().int().min(0).max(6)).min(1),
  latitude: z.coerce.number(),
  longitude: z.coerce.number(),
  radius_m: z.coerce.number().int().min(30).max(10000),
  quotas: z.object({
    annual: z.coerce.number().int().min(0),
    sick: z.coerce.number().int().min(0),
    casual: z.coerce.number().int().min(0),
  }),
});

export const PUT = withAuth(['admin'], async (req, ctx, session) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(422, 'UNPROCESSABLE', 'Invalid settings', parsed.error.flatten().fieldErrors);
  }
  const existing = await store.findOne('company_settings', []);
  const updated = await store.update('company_settings', existing.id, {
    ...parsed.data,
    setup_done: true,
    updated_at: new Date().toISOString(),
  });
  await audit(session.email, 'settings.update', 'company_settings', updated.id, parsed.data);
  return json(updated);
});
