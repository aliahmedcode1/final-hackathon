import { clearSessionCookie, json } from '@/lib/auth';

export async function POST() {
  await clearSessionCookie();
  return json({ ok: true });
}
