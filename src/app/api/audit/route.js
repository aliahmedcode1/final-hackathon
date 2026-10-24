import { store } from '@/lib/store';
import { withAuth, json } from '@/lib/auth';

export const GET = withAuth(['admin'], async (req) => {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(100, Number(url.searchParams.get('pageSize') || 20));
  const { rows, total } = await store.list('audit_logs', {
    order: { col: 'at', asc: false },
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return json({ rows, total, page, pageSize });
});
