import { getSupabase, supabaseConfigured } from './supabase';
import { localDb } from './local-db';

// Unified table store. Prefers Supabase; falls back to the local JSON store when
// Supabase is unreachable/missing tables so the app always works (NFR-3).
// The backend choice is probed once per process and cached on globalThis.

let backend = null; // 'supabase' | 'local'

async function resolveBackend() {
  if (backend) return backend;
  if (process.env.DB_BACKEND === 'local') return (backend = 'local');
  if (process.env.DB_BACKEND === 'supabase') return (backend = 'supabase');
  if (!supabaseConfigured) return (backend = 'local');
  try {
    const { error } = await Promise.race([
      getSupabase().from('users').select('id').limit(1),
      new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 4000)),
    ]);
    backend = error ? 'local' : 'supabase';
  } catch {
    backend = 'local';
  }
  console.log(`[store] backend = ${backend}`);
  return backend;
}

function applyWhere(query, where = []) {
  for (const [col, op, value] of where) {
    switch (op) {
      case 'eq': query = query.eq(col, value); break;
      case 'neq': query = query.neq(col, value); break;
      case 'gt': query = query.gt(col, value); break;
      case 'gte': query = query.gte(col, value); break;
      case 'lt': query = query.lt(col, value); break;
      case 'lte': query = query.lte(col, value); break;
      case 'in': query = query.in(col, value); break;
      case 'like': query = query.ilike(col, `%${value}%`); break;
      default: throw new Error(`bad op ${op}`);
    }
  }
  return query;
}

export const store = {
  async backendName() { return resolveBackend(); },

  async list(t, opts = {}) {
    if ((await resolveBackend()) === 'local') return localDb.list(t, opts);
    const { where = [], order, limit, offset = 0 } = opts;
    let q = getSupabase().from(t).select('*', { count: 'exact' });
    q = applyWhere(q, where);
    if (order) q = q.order(order.col, { ascending: order.asc !== false });
    if (limit) q = q.range(offset, offset + limit - 1);
    const { data, error, count } = await q;
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return { rows: data || [], total: count ?? (data || []).length };
  },

  async get(t, id) {
    if ((await resolveBackend()) === 'local') return localDb.get(t, id);
    const { data, error } = await getSupabase().from(t).select('*').eq('id', id).maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data;
  },

  async findOne(t, where) {
    if ((await resolveBackend()) === 'local') return localDb.list(t, { where }).rows[0] || null;
    let q = getSupabase().from(t).select('*');
    q = applyWhere(q, where);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data;
  },

  async insert(t, data) {
    if ((await resolveBackend()) === 'local') return localDb.insert(t, data);
    const { data: out, error } = await getSupabase().from(t).insert(data).select();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return Array.isArray(data) ? out : out[0];
  },

  async update(t, id, patch) {
    if ((await resolveBackend()) === 'local') return localDb.update(t, id, patch);
    const { data, error } = await getSupabase().from(t).update(patch).eq('id', id).select();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data?.[0] || null;
  },

  async remove(t, id) {
    if ((await resolveBackend()) === 'local') return localDb.remove(t, id);
    const { error } = await getSupabase().from(t).delete().eq('id', id);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
  },

  async removeWhere(t, where) {
    if ((await resolveBackend()) === 'local') return localDb.removeWhere(t, where);
    let q = getSupabase().from(t).delete();
    q = applyWhere(q, where);
    const { error } = await q;
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
  },
};
