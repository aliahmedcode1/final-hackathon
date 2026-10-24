import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json, hashPassword, tempPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';

// GET: directory with server-side pagination + search + filters (PRD 07).
// Salary fields are stripped for employees.
export const GET = withAuth(null, async (req, ctx, session) => {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const dept = url.searchParams.get('dept') || '';
  const status = url.searchParams.get('status') || '';
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(100, Number(url.searchParams.get('pageSize') || 10));

  const where = [];
  if (status) where.push(['status', 'eq', status]);
  if (dept) where.push(['department_id', 'eq', dept]);

  const { rows, total } = await store.list('employees', {
    where,
    order: { col: 'code' },
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  // Server-side search across name/email/code (store has no cross-column OR).
  let filtered = rows;
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(needle) ||
        (r.email || '').toLowerCase().includes(needle) ||
        (r.code || '').toLowerCase().includes(needle)
    );
  }

  const [deps, desigs] = await Promise.all([
    store.list('departments', {}),
    store.list('designations', {}),
  ]);
  const depMap = Object.fromEntries(deps.rows.map((d) => [d.id, d.name]));
  const desMap = Object.fromEntries(desigs.rows.map((d) => [d.id, d.name]));

  const shape = (e) => ({
    ...e,
    department: e.department_id ? depMap[e.department_id] || null : null,
    designation: e.designation_id ? desMap[e.designation_id] || null : null,
    ...(session.role === 'employee' ? { basic_salary: undefined, phone: undefined, address: undefined } : {}),
  });

  return json({ rows: filtered.map(shape), total, page, pageSize });
});

const createSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().default(''),
  email: z.string().email(),
  phone: z.string().default(''),
  address: z.string().default(''),
  department_id: z.string().optional(),
  designation_id: z.string().optional(),
  join_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  basic_salary: z.coerce.number().min(0).default(0),
});

async function nextEmployeeCode() {
  const { rows } = await store.list('employees', { order: { col: 'code', asc: false }, limit: 1 });
  const last = rows[0]?.code || 'EMP-000';
  const n = Number(last.split('-')[1] || 0) + 1;
  return `EMP-${String(n).padStart(3, '0')}`;
}

// POST: HR registers an employee; creates the login with a temp password (PRD 06).
export const POST = withAuth(['hr'], async (req, ctx, session) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'Invalid employee', parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  if (await store.findOne('employees', [['email', 'eq', data.email.toLowerCase()]])) {
    return fail(409, 'CONFLICT', 'An employee with this email already exists');
  }

  const employee = await store.insert('employees', {
    ...data,
    email: data.email.toLowerCase(),
    code: await nextEmployeeCode(),
    status: 'active',
  });

  const temp = tempPassword();
  await store.insert('users', {
    email: employee.email,
    password_hash: hashPassword(temp),
    role: 'employee',
    employee_id: employee.id,
    is_active: true,
    must_change_pw: true,
  });

  await audit(session.email, 'employee.create', 'employees', employee.id, { code: employee.code, name: `${employee.first_name} ${employee.last_name}` });
  return json({ employee, temp_password: temp }, 201);
});
