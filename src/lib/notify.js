import { store } from './store';

export async function notify(userId, type, title, body = '', link = '') {
  if (!userId) return;
  try {
    await store.insert('notifications', { user_id: userId, type, title, body, link, read: false });
  } catch (err) {
    console.error('notify failed', err.message);
  }
}

// Notify the user account attached to an employee (e.g. payslip available).
export async function notifyEmployee(employeeId, type, title, body = '', link = '') {
  const user = await store.findOne('users', [['employee_id', 'eq', employeeId]]);
  if (user) await notify(user.id, type, title, body, link);
}
