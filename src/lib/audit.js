import { store } from './store';

export async function audit(actorEmail, action, entity, entityId = '', detail = {}) {
  try {
    await store.insert('audit_logs', {
      actor_email: actorEmail,
      action,
      entity,
      entity_id: entityId,
      detail,
    });
  } catch (err) {
    console.error('audit write failed', err.message);
  }
}
