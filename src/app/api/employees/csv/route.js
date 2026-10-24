import { z } from 'zod';
import { store } from '@/lib/store';
import { withAuth, fail, json, hashPassword, tempPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';

// HR: CSV bulk import with dry-run validation (PRD 08) + CSV export.
// Expected header: first_name,last_name,email,phone,department,designation,join_date,basic_salary

const FIELDS = ['first_name', 'last_name', 'email', 'phone', 'department', 'designation', 'join_date', 'basic_salary'];

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { header: null, rows: [] };
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // naive CSV split honoring double quotes
    const cells = [];
    let cur = '', inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    rows.push({ line: i + 1, cells });
  }
  return { header, rows };
}

async function validate(text) {
  const { header, rows } = parseCsv(text);
  const report = { header_ok: true, rows: [], valid_count: 0, error_count: 0 };
  if (!header || !FIELDS.every((f) => header.includes(f))) {
    report.header_ok = false;
    report.header_expected = FIELDS.join(',');
    return report;
  }

  const [deps, desigs, existing] = await Promise.all([
    store.list('departments', {}),
    store.list('designations', {}),
    store.list('employees', {}),
  ]);
  const depMap = Object.fromEntries(deps.rows.map((d) => [d.name.toLowerCase(), d.id]));
  const desMap = Object.fromEntries(desigs.rows.map((d) => [d.name.toLowerCase(), d.id]));
  const emailSet = new Set(existing.rows.map((e) => e.email));

  const seenEmails = new Set();
  for (const r of rows) {
    const rec = Object.fromEntries(FIELDS.map((f, i) => [f, (r.cells[header.indexOf(f)] ?? '').trim()]));
    const errors = {};
    if (!rec.first_name) errors.first_name = 'required';
    if (!rec.email) errors.email = 'required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.email)) errors.email = 'invalid email format';
    else if (emailSet.has(rec.email.toLowerCase())) errors.email = 'already exists';
    else if (seenEmails.has(rec.email.toLowerCase())) errors.email = 'duplicated within file';
    if (!rec.department || !depMap[rec.department.toLowerCase()]) errors.department = 'unknown department';
    if (rec.designation && !desMap[rec.designation.toLowerCase()]) errors.designation = 'unknown designation';
    if (!rec.join_date || !/^\d{4}-\d{2}-\d{2}$/.test(rec.join_date) || isNaN(new Date(rec.join_date))) errors.join_date = 'expected YYYY-MM-DD';
    if (rec.basic_salary === '' || isNaN(Number(rec.basic_salary)) || Number(rec.basic_salary) < 0) errors.basic_salary = 'expected a non-negative number';

    if (Object.keys(errors).length === 0) {
      seenEmails.add(rec.email.toLowerCase());
      report.valid_count++;
    } else {
      report.error_count++;
    }
    report.rows.push({
      line: r.line,
      data: rec,
      errors: Object.keys(errors).length ? errors : null,
    });
  }
  return { report, depMap, desMap };
}

const bodySchema = z.object({
  csv: z.string().min(1),
  mode: z.enum(['dry', 'commit']).default('dry'),
});

export const POST = withAuth(['hr'], async (req, ctx, session) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(422, 'UNPROCESSABLE', 'csv and mode required');
  const { csv, mode } = parsed.data;

  const { report, depMap, desMap } = await validate(csv);
  if (!report.header_ok) return json({ report }, 200);
  if (mode === 'dry' || report.error_count > 0) {
    // No partial writes on failure — commit rejected when any row is invalid.
    return json({ report, committed: false });
  }

  const { rows: all } = await store.list('employees', { order: { col: 'code', asc: false }, limit: 1 });
  let n = Number(all[0]?.code?.split('-')[1] || 0);

  const created = [];
  for (const r of report.rows) {
    n++;
    const emp = await store.insert('employees', {
      code: `EMP-${String(n).padStart(3, '0')}`,
      first_name: r.data.first_name,
      last_name: r.data.last_name || '',
      email: r.data.email.toLowerCase(),
      phone: r.data.phone || '',
      address: '',
      department_id: depMap[r.data.department.toLowerCase()] || null,
      designation_id: r.data.designation ? desMap[r.data.designation.toLowerCase()] : null,
      join_date: r.data.join_date,
      status: 'active',
      basic_salary: Number(r.data.basic_salary),
    });
    const temp = tempPassword();
    await store.insert('users', {
      email: emp.email,
      password_hash: hashPassword(temp),
      role: 'employee',
      employee_id: emp.id,
      is_active: true,
      must_change_pw: true,
    });
    created.push({ code: emp.code, name: `${emp.first_name} ${emp.last_name}`, email: emp.email, temp_password: temp });
  }
  await audit(session.email, 'employee.csv_import', 'employees', '', { imported: created.length });
  return json({ report, committed: true, created }, 201);
});

export const GET = withAuth(['hr'], async () => {
  const { rows } = await store.list('employees', { order: { col: 'code' } });
  const [deps, desigs] = await Promise.all([store.list('departments', {}), store.list('designations', {})]);
  const depMap = Object.fromEntries(deps.rows.map((d) => [d.id, d.name]));
  const desMap = Object.fromEntries(desigs.rows.map((d) => [d.id, d.name]));
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [FIELDS.join(',')];
  for (const e of rows) {
    lines.push(
      [e.first_name, e.last_name, e.email, e.phone, depMap[e.department_id] || '', desMap[e.designation_id] || '', e.join_date, e.basic_salary]
        .map(esc).join(',')
    );
  }
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="employees.csv"' },
  });
});
