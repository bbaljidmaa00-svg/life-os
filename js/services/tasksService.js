/**
 * Tasks service — table: TABLES.tasks
 * Columns: see COLUMNS below and supabase/schema.sql.
 */
import { TABLES } from '../config.js';
import { createService } from './createService.js';
import { tasksMap } from './dbMapping.js';
import { prefs } from '../state/prefs.js';
import { todayKey } from '../lib/dates.js';

export const PRIORITIES = [
  { value: 'high', label: 'Өндөр' },
  { value: 'medium', label: 'Дунд' },
  { value: 'low', label: 'Бага' },
];
export const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
export const PRIORITY_LABEL = { high: 'Өндөр', medium: 'Дунд', low: 'Бага' };
export const DEFAULT_CATEGORIES = ['Ажил', 'Хувийн', 'Эрүүл мэнд', 'Сурлага', 'Гэр', 'Санхүү'];
export const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

const COLUMNS = [
  'id', 'title', 'notes', 'status', 'priority', 'category',
  'due_date', 'due_time', 'estimated_minutes', 'project_id', 'completed_at', 'created_at',
];

function normalize(row) {
  return {
    ...row,
    title: row.title || '',
    notes: row.notes || '',
    status: row.status === 'done' ? 'done' : 'todo',
    priority: PRIORITY_RANK[row.priority] !== undefined ? row.priority : 'medium',
    category: row.category || '',
    due_date: row.due_date ? String(row.due_date).slice(0, 10) : null,
    due_time: row.due_time ? String(row.due_time).slice(0, 5) : null,
    estimated_minutes: row.estimated_minutes ? Number(row.estimated_minutes) : null,
    project_id: row.project_id || null,
    completed_at: row.completed_at || null,
  };
}

const base = createService({ key: 'tasks', tableName: TABLES.tasks, columns: COLUMNS, normalize, mapping: tasksMap });

export const tasksService = {
  ...base,

  create(data) {
    return base.create({ status: 'todo', priority: prefs.get().defaultPriority, ...data });
  },

  /** Complete ↔ reopen. completed_at powers Analytics. */
  toggle(id) {
    const task = base.get(id);
    const done = task.status !== 'done';
    return base.update(id, { status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null });
  },

  open: () => base.all().filter((t) => t.status !== 'done'),
  dueOn: (key) => base.all().filter((t) => t.due_date === key),
  byProject: (projectId) => base.all().filter((t) => t.project_id === projectId),
  overdue() {
    const today = todayKey();
    return base.all().filter((t) => t.status !== 'done' && t.due_date && t.due_date < today);
  },
  categories() {
    const used = base.all().map((t) => t.category).filter(Boolean);
    return [...new Set([...DEFAULT_CATEGORIES, ...used])].sort((a, b) => a.localeCompare(b, 'mn'));
  },
};

/** Default ordering: open first → earliest deadline → time → priority → oldest. */
export function compareTasks(a, b) {
  if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
  const ad = a.due_date || '9999-12-31';
  const bd = b.due_date || '9999-12-31';
  if (ad !== bd) return ad < bd ? -1 : 1;
  const at = a.due_time || '99:99';
  const bt = b.due_time || '99:99';
  if (at !== bt) return at < bt ? -1 : 1;
  const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (pr) return pr;
  return String(a.created_at || '').localeCompare(String(b.created_at || ''));
}

export function sortTasks(list, by = 'smart') {
  const items = [...list];
  switch (by) {
    case 'priority':
      return items.sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || compareTasks(a, b));
    case 'created':
      return items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    case 'duration':
      return items.sort((a, b) => (a.estimated_minutes ?? 9999) - (b.estimated_minutes ?? 9999) || compareTasks(a, b));
    case 'title':
      return items.sort((a, b) => a.title.localeCompare(b.title, 'mn'));
    default:
      return items.sort(compareTasks);
  }
}
