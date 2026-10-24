import fs from 'fs';
import path from 'path';

// Local JSON-file database used when Supabase is unreachable or DB_BACKEND=local.
// Shape: { tableName: [rows] } persisted to .data/db.json.

const DATA_DIR = path.join(process.cwd(), '.data');
const FILE = path.join(DATA_DIR, 'db.json');

function load() {
  if (!globalThis.__hcmLocalDb) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      globalThis.__hcmLocalDb = fs.existsSync(FILE)
        ? JSON.parse(fs.readFileSync(FILE, 'utf8'))
        : {};
    } catch {
      globalThis.__hcmLocalDb = {};
    }
  }
  return globalThis.__hcmLocalDb;
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(load(), null, 2));
  } catch (err) {
    console.error('local-db persist failed', err.message);
  }
}

function table(name) {
  const db = load();
  if (!db[name]) db[name] = [];
  return db[name];
}

function matches(row, where) {
  return where.every(([col, op, value]) => {
    const v = row[col];
    switch (op) {
      case 'eq': return v === value;
      case 'neq': return v !== value;
      case 'gt': return v > value;
      case 'gte': return v >= value;
      case 'lt': return v < value;
      case 'lte': return v <= value;
      case 'in': return Array.isArray(value) && value.includes(v);
      case 'like': return String(v ?? '').toLowerCase().includes(String(value).toLowerCase());
      default: return false;
    }
  });
}

export const localDb = {
  list(t, { where = [], order, limit, offset = 0 } = {}) {
    let rows = table(t).filter((r) => matches(r, where));
    if (order) {
      const { col, asc = true } = order;
      rows = [...rows].sort((a, b) => {
        const x = a[col], y = b[col];
        const cmp = x < y ? -1 : x > y ? 1 : 0;
        return asc ? cmp : -cmp;
      });
    }
    const total = rows.length;
    rows = rows.slice(offset, limit ? offset + limit : undefined);
    return { rows, total };
  },
  get(t, id) {
    return table(t).find((r) => r.id === id) || null;
  },
  insert(t, data) {
    const rows = Array.isArray(data) ? data : [data];
    const out = rows.map((r) => ({ id: r.id || crypto.randomUUID(), created_at: r.created_at || new Date().toISOString(), ...r }));
    table(t).push(...out);
    persist();
    return Array.isArray(data) ? out : out[0];
  },
  update(t, id, patch) {
    const row = table(t).find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, patch);
    persist();
    return row;
  },
  remove(t, id) {
    const rows = table(t);
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) { rows.splice(i, 1); persist(); }
  },
  removeWhere(t, where) {
    const rows = table(t);
    const keep = rows.filter((r) => !matches(r, where));
    if (keep.length !== rows.length) {
      load()[t] = keep;
      persist();
    }
  },
};
