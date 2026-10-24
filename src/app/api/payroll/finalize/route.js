import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notifyEmployee } from '@/lib/notify';

// Admin finalizes a draft → permanently locks the month (PRD 16) + notifies.

const schema = z.object({ run_id: z.string() });

export const POST = withAuth(['admin'], async (req, ctx, session) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'run_id required');

  const run = await store.get('payroll_runs', parsed.data.run_id);
  if (!run) return fail(404, 'NOT_FOUND', 'Payroll run not found');
  if (run.status === 'locked') return fail(409, 'LOCKED', 'Already finalized');

  const { rows: slips } = await store.list('payslips', { where: [['run_id', 'eq', run.id]] });
  if (!slips.length) return fail(422, 'UNPROCESSABLE', 'Run has no payslips');

  const updated = await store.update('payroll_runs', run.id, {
    status: 'locked',
    locked_by: session.email,
    locked_at: new Date().toISOString(),
  });

  for (const slip of slips) {
    await notifyEmployee(slip.employee_id, 'payslip', `Payslip available — ${run.period}`,
      `Net pay PKR ${Number(slip.net).toLocaleString()}. Download it from Payroll.`, '/payroll');
  }

  await audit(session.email, 'payroll.finalize', 'payroll_runs', run.id, { period: run.period, employees: slips.length });
  return json(updated);
});
