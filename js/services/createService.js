/**
 * Builds a standard CRUD service for one table.
 *
 *  key        – where the rows live in the in-memory store (e.g. 'tasks')
 *  tableName  – the database table (from TABLES in config.js)
 *  columns    – the ONLY fields sent to the database. Anything else on the
 *               object is ignored, so UI-only fields never reach Supabase.
 *  normalize  – cleans up a row coming back (types, defaults, "HH:MM:SS" → "HH:MM")
 *  mapping    – optional { toDb, fromDb } when the database columns differ from
 *               the app's field names (see dbMapping.js)
 *
 * Every method updates the store after the database call succeeds, so the UI
 * never shows data that failed to save.
 */
import { store } from '../state/store.js';
import { table } from '../lib/dataAdapter.js';

const IDENTITY = { toDb: (row) => row, fromDb: (row) => row };

export function createService({ key, tableName, columns, normalize = (row) => row, mapping = IDENTITY }) {
  const db = table(tableName);

  /** Keep only known columns; empty strings become null (Postgres rejects '' for dates/numbers). */
  const pick = (obj) => Object.fromEntries(
    Object.entries(obj)
      .filter(([k]) => columns.includes(k))
      .map(([k, v]) => [k, v === '' ? null : v]),
  );

  const service = {
    all: () => store.get(key),
    get: (id) => store.get(key).find((row) => row.id === id) || null,

    async load() {
      const rows = await db.list();
      store.set(key, rows.map((r) => normalize(mapping.fromDb(r))));
    },

    async create(data) {
      const clean = pick(data);
      const row = await db.insert(mapping.toDb(clean, clean));
      const item = normalize({ ...clean, ...mapping.fromDb(row) });
      store.add(key, item);
      return item;
    },

    async update(id, patch) {
      const current = service.get(id);
      if (!current) throw new Error('Энэ зүйл устсан байна.');
      const clean = pick(patch);
      const row = await db.update(id, mapping.toDb(clean, { ...current, ...clean }));
      const item = normalize({ ...current, ...clean, ...mapping.fromDb(row) });
      store.replace(key, item);
      return item;
    },

    async remove(id) {
      await db.remove(id);
      store.remove(key, id);
    },
  };
  return service;
}
