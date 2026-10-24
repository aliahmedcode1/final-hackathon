import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notify, notifyEmployee } from '@/lib/notify';
import { leaveContext, checkQuota } from '@/lib/leave-core';

// HR approves/rejects with comment (PRD 13). Re-validates quota at approval time.

const schema = z.object({
  id: z.string(),
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().default(''),
});

export const PATCH = withAuth(['hr'], async (req, ctx, session) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Invalid payload');
  const { id, decision, comment } = parsed.data;

  const rec = await store.get('leave_requests', id);
  if (!rec) return fail(404, 'NOT_FOUND', 'Leave request not found');
  if (rec.status !== 'pending') return fail(409, 'CONFLICT', 'Already decided');

  if (decision === 'approved' && rec.type !== 'unpaid') {
    const { settings, requests } = await leaveContext(rec.employee_id);
    const quotaErr = checkQuota({
      type: rec.type, days: rec.days,
      year: rec.from_date.slice(0, 4),
      requests, quotas: settings?.quotas,
    });
    if (quotaErr) return fail(422, 'UNPROCESSABLE', quotaErr);
  }

  const updated = await store.update('leave_requests', id, {
    status: decision,
    decided_by: session.email,
    comment,
  });
  await audit(session.email, `leave.${decision}`, 'leave_requests', id, { days: rec.days, type: rec.type });
  await notifyEmployee(rec.employee_id, 'leave', `Leave ${decision}`,
    `${rec.type} leave ${rec.from_date} → ${rec.to_date} (${rec.days}d) was ${decision}${comment ? ` — ${comment}` : ''}`, '/leave');
  return json(updated);
});
