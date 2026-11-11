/**
 * In-memory application state.
 *
 * Services load rows from the database into this store, and every page
 * renders from it. When a service changes data it updates the store, the
 * store notifies subscribers, and the router re-renders the current page.
 *
 * This is a cache of the database, not a replacement for it: nothing here is
 * persisted. In session mode (no Supabase configured) it is the only copy,
 * which is why everything is cleared on reload.
 */
const state = {
  tasks: [],
  events: [],
  goals: [],
  projects: [],
  journal: [],
  birthdays: [],
  conversations: [],
  messages: [],
  memories: [],
  subjects: [],
  classSessions: [],
  homework: [],
  workplaces: [],
  workShifts: [],
  income: [],
  orders: [],
  workContacts: [],
  workGoals: [],
  wishes: [],
};

const meta = {
  mode: 'session',   // 'session' | 'supabase'
  user: null,        // Supabase auth user when signed in
  loadErrors: [],    // [{ label, message }] when a table failed to load
  tick: 0,           // bumped to force a re-render (e.g. date changed at midnight)
};

const listeners = new Set();
const changed = new Set();
let queued = false;

/** Batch notifications: many changes in one tick → one re-render. */
function emit(key) {
  changed.add(key);
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    const keys = [...changed];
    changed.clear();
    listeners.forEach((fn) => fn(keys));
  });
}

export const store = {
  get: (key) => state[key],
  set(key, rows) { state[key] = rows; emit(key); },
  add(key, item) { state[key] = [...state[key], item]; emit(key); },
  replace(key, item) { state[key] = state[key].map((r) => (r.id === item.id ? item : r)); emit(key); },
  remove(key, id) { state[key] = state[key].filter((r) => r.id !== id); emit(key); },
  clearAll() { Object.keys(state).forEach((k) => { state[k] = []; }); emit('all'); },
  snapshot: () => JSON.parse(JSON.stringify(state)),

  meta: () => meta,
  setMeta(patch) { Object.assign(meta, patch); emit('meta'); },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
