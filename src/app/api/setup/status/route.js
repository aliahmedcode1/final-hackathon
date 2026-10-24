import { store } from '@/lib/store';
import { json } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { total } = await store.list('users', { limit: 1 });
  return json({ needsSetup: total === 0 });
}
