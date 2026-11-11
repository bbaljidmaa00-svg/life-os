/**
 * Data adapter — the single place that talks to storage.
 *
 * Every service calls table(name).list / insert / update / remove.
 * Two interchangeable implementations sit behind that interface:
 *
 *  • supabase — real reads/writes to your PostgreSQL tables (RLS protected).
 *  • session  — no backend at all. It just stamps ids/timestamps and hands the
 *               row back; the in-memory store is the only copy, so data is
 *               gone when the tab reloads. It does not pretend to be a server.
 *
 * The mode is chosen once at start-up in main.js.
 */
import { getSupabase } from './supabaseClient.js';
import { uid } from './dom.js';

let mode = 'session';
let userId = null;

export function setDataMode(nextMode, nextUserId = null) {
  mode = nextMode;
  userId = nextUserId;
}
export const getDataMode = () => mode;

/* ---------- session mode ---------- */
const sessionImpl = {
  async list() { return []; },
  async insert(_table, row) {
    const now = new Date().toISOString();
    return { ...row, id: row.id || uid(), created_at: row.created_at || now, updated_at: now };
  },
  async update(_table, id, patch) {
    return { ...patch, id, updated_at: new Date().toISOString() };
  },
  async remove() { return true; },
};

/* ---------- Supabase mode ---------- */
function friendly(error, table) {
  const err = new Error(`${table}: ${error.message}`);
  err.code = error.code;
  if (error.code === '42P01' || /does not exist/i.test(error.message)) {
    err.hint = `"${table}" хүснэгт олдсонгүй. supabase/schema.sql-ээр үүсгэх эсвэл js/config.js доторх TABLES-ийг засна уу.`;
  } else if (error.code === '42703') {
    err.hint = `"${table}" хүснэгтэд багана дутуу байна. supabase/schema.sql-тэй харьцуулна уу.`;
  } else if (error.code === '42501' || /row-level security/i.test(error.message)) {
    err.hint = `"${table}" дээр Row Level Security хүсэлтийг хаалаа. supabase/schema.sql доторх policy-г шалгана уу.`;
  }
  return err;
}

const supabaseImpl = {
  async list(table) {
    const sb = await getSupabase();
    // RLS limits rows to the signed-in user. Supabase returns up to 1000 rows by default;
    // add .range() pagination here if you ever need more.
    const { data, error } = await sb.from(table).select('*').order('created_at', { ascending: true });
    if (error) throw friendly(error, table);
    return data || [];
  },
  async insert(table, row) {
    const sb = await getSupabase();
    const { data, error } = await sb.from(table).insert({ ...row, user_id: userId }).select().single();
    if (error) throw friendly(error, table);
    return data;
  },
  async update(table, id, patch) {
    const sb = await getSupabase();
    const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
    if (error) throw friendly(error, table);
    return data;
  },
  async remove(table, id) {
    const sb = await getSupabase();
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw friendly(error, table);
    return true;
  },
};

const impl = () => (mode === 'supabase' ? supabaseImpl : sessionImpl);

/** Returns a small CRUD object bound to one table. */
export function table(name) {
  return {
    list: () => impl().list(name),
    insert: (row) => impl().insert(name, row),
    update: (id, patch) => impl().update(name, id, patch),
    remove: (id) => impl().remove(name, id),
  };
}
