/**
 * UI preferences (theme, week start, time format, working hours…).
 *
 * These are device display settings, NOT personal data, so they are kept in
 * localStorage. Your tasks, events, journal etc. are never stored here —
 * they live in Supabase (or in tab memory while in session mode).
 */
const KEY = 'lifeos.prefs';

export const PREF_DEFAULTS = {
  theme: 'system',        // 'system' | 'light' | 'dark'
  weekStart: 1,           // 0 = Sunday, 1 = Monday
  timeFormat: '24',       // '24' | '12'
  workStart: '09:00',     // used by the day/week planner
  workEnd: '18:00',
  defaultDuration: 30,    // minutes, for new tasks
  defaultPriority: 'medium',
};

function read() {
  try {
    return { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...PREF_DEFAULTS };
  }
}

let current = read();
const listeners = new Set();

export const prefs = {
  get: () => current,
  set(patch) {
    current = { ...current, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage blocked: keep in memory */ }
    applyTheme();
    listeners.forEach((fn) => fn(current));
  },
  reset() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    current = { ...PREF_DEFAULTS };
    applyTheme();
    listeners.forEach((fn) => fn(current));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function effectiveTheme() {
  if (current.theme === 'light' || current.theme === 'dark') return current.theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Sets data-theme on <html>. "system" removes it so the CSS media query decides —
 * but only if this app set it, so a theme chosen by a host page (e.g. an embed) is kept.
 */
let ownTheme = false;
export function applyTheme() {
  const root = document.documentElement;
  if (current.theme === 'light' || current.theme === 'dark') {
    root.setAttribute('data-theme', current.theme);
    ownTheme = true;
  } else if (ownTheme || !window.LIFEOS_DEMO) {
    root.removeAttribute('data-theme');
    ownTheme = false;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effectiveTheme() === 'dark' ? '#171A3D' : '#B9E4FA');
}
