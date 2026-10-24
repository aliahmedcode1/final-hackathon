import { store } from '@/lib/store';
import { withAuth, json } from '@/lib/auth';

export const GET = withAuth(null, async (req, ctx, session) => {
  const settingsRow = await store.findOne('company_settings', []);
  let profile = null;
  if (session.employee_id) {
    const emp = await store.get('employees', session.employee_id);
    if (emp) {
      const dept = emp.department_id ? await store.get('departments', emp.department_id) : null;
      const desig = emp.designation_id ? await store.get('designations', emp.designation_id) : null;
      profile = {
        ...emp,
        department: dept?.name || null,
        designation: desig?.name || null,
      };
    }
  }
  const { total: unread } = await store.list('notifications', [
    ['user_id', 'eq', session.id],
    ['read', 'eq', false],
  ]);
  return json({ user: { ...session, profile }, settings: settingsRow, unread });
});
