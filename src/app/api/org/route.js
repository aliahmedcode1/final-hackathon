import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json } from '@/lib/auth';
import { audit } from '@/lib/audit';

// departments, designations, public holidays — one resource per `type`.

const TABLES = { department: 'departments', designation: 'designations', holiday: 'public_holidays' };
const NAME_FIELDS = { department: 'name', designation: 'name', holiday: 'name' };

export const GET = withAuth(['admin', 'hr'], async () => {
  const [departments, designations, holidays] = await Promise.all([
    store.list('departments', { order: { col: 'name' } }),
    store.list('designations', { order: { col: 'name' } }),
    store.list('public_holidays', { order: { col: 'date' } }),
  ]);
  return json({
    departments: departments.rows,
    designations: designations.rows,
    holidays: holidays.rows,
  });
});

const createSchema = z.object({
  type: z.enum(['department', 'designation', 'holiday']),
  name: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const POST = withAuth(['admin'], async (req, ctx, session) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Invalid payload', parsed.error.flatten().fieldErrors);
  const { type, name, date } = parsed.data;
  if (type === 'holiday' && !date) return fail(422, 'UNPROCESSABLE', 'Holiday requires a date');

  const table = TABLES[type];
  const where = type === 'holiday' ? [['date', 'eq', date]] : [[NAME_FIELDS[type], 'eq', name]];
  if (await store.findOne(table, where)) return fail(409, 'CONFLICT', `${type} already exists`);

  const row = await store.insert(table, type === 'holiday' ? { date, name } : { name });
  await audit(session.email, `${type}.create`, table, row.id, { name, date });
  return json(row, 201);
});

const deleteSchema = z.object({ type: z.enum(['department', 'designation', 'holiday']), id: z.string() });

export const DELETE = withAuth(['admin'], async (req, ctx, session) => {
  const url = new URL(req.url);
  const parsed = deleteSchema.safeParse({ type: url.searchParams.get('type'), id: url.searchParams.get('id') });
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'type and id required');

  const { type, id } = parsed.data;
  if (type !== 'holiday') {
    const empTable = type === 'department' ? 'employees.department_id' : 'employees.designation_id';
    const inUse = await store.list('employees', { where: [[empTable.split('.')[1], 'eq', id]], limit: 1 });
    if (inUse.total > 0) return fail(409, 'CONFLICT', `${type} is in use by employees`);
  }
  await store.remove(TABLES[type], id);
  await audit(session.email, `${type}.delete`, TABLES[type], id, {});
  return json({ ok: true });
});
