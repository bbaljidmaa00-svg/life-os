/**
 * Wishes, Goals & Projects service — tables: TABLES.wishes, TABLES.goals, TABLES.projects
 *
 * Hierarchy:  Wish (хугацаагүй хүсэл)  →  Goal (goals.wish_id)  →  Projects (projects.goal_id)  →  Tasks (tasks.project_id)
 * Progress is calculated from task completion, never stored, so it is always accurate.
 */
import { TABLES } from '../config.js';
import { createService } from './createService.js';
import { tasksService } from './tasksService.js';
import { store } from '../state/store.js';

export const STATUSES = [
  { value: 'active', label: 'Идэвхтэй' },
  { value: 'paused', label: 'Түр зогссон' },
  { value: 'completed', label: 'Дууссан' },
];
const STATUS_IDS = STATUSES.map((s) => s.value);
export const STATUS_TONE = { active: 'accent', paused: 'warning', completed: 'success' };

const normalizeStatus = (s) => (STATUS_IDS.includes(s) ? s : 'active');

export const goalsService = createService({
  key: 'goals',
  tableName: TABLES.goals,
  columns: ['id', 'title', 'description', 'target_date', 'status', 'wish_id', 'created_at'],
  normalize: (row) => ({
    ...row,
    wish_id: row.wish_id || null,
    title: row.title || '',
    description: row.description || '',
    target_date: row.target_date ? String(row.target_date).slice(0, 10) : null,
    status: normalizeStatus(row.status),
  }),
});

const projectsBase = createService({
  key: 'projects',
  tableName: TABLES.projects,
  columns: ['id', 'goal_id', 'title', 'description', 'status', 'due_date', 'created_at'],
  normalize: (row) => ({
    ...row,
    goal_id: row.goal_id || null,
    title: row.title || '',
    description: row.description || '',
    due_date: row.due_date ? String(row.due_date).slice(0, 10) : null,
    status: normalizeStatus(row.status),
  }),
});

export const projectsService = {
  ...projectsBase,
  byGoal: (goalId) => projectsBase.all().filter((p) => p.goal_id === goalId),
};

/** { done, total, pct } for one project. */
export function projectProgress(projectId) {
  const project = projectsService.get(projectId);
  const tasks = tasksService.byProject(projectId);
  if (!tasks.length) return { done: 0, total: 0, pct: project?.status === 'completed' ? 100 : 0 };
  const done = tasks.filter((t) => t.status === 'done').length;
  return { done, total: tasks.length, pct: Math.round((done / tasks.length) * 100) };
}

/** { done, total, pct, projects } for one goal, across all its projects' tasks. */
export function goalProgress(goalId) {
  const goal = goalsService.get(goalId);
  const projects = projectsService.byGoal(goalId);
  const tasks = projects.flatMap((p) => tasksService.byProject(p.id));
  const done = tasks.filter((t) => t.status === 'done').length;
  let pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  if (!tasks.length && projects.length) {
    pct = Math.round((projects.filter((p) => p.status === 'completed').length / projects.length) * 100);
  }
  if (goal?.status === 'completed') pct = 100;
  return { done, total: tasks.length, pct, projects: projects.length };
}

/* ── Хүсэл мөрөөдөл ───────────────────────────────────────────────────────
 * Хүсэлд огноо байхгүй — зүгээр л бичээд, бэлэн болсон үед зорилго болгоно.
 * 4 ангилал (Be / Do / Have / Give): Болох · Хийх · Эзэмших · Өгөх
 */
export const WISH_CATEGORIES = [
  { value: 'be', label: 'Болох', hint: 'Ямар хүн болмоор байна?', icon: 'sparkle', color: 'var(--lilac)', example: 'Өөртөө итгэлтэй илтгэгч болох' },
  { value: 'do', label: 'Хийх', hint: 'Юу хийж, туулж үзмээр байна?', icon: 'plane', color: 'var(--sky)', example: 'Японд сакура цэцэглэхийг харах' },
  { value: 'have', label: 'Эзэмших', hint: 'Юутай болмоор байна?', icon: 'home', color: 'var(--peach)', example: 'Өөрийн гэсэн жижиг студитэй болох' },
  { value: 'give', label: 'Өгөх', hint: 'Бусдад юу өгмөөр байна?', icon: 'heart', color: 'var(--pink)', example: 'Ээждээ аялал бэлэглэх' },
];
const WISH_IDS = WISH_CATEGORIES.map((c) => c.value);
export const wishCategory = (v) => WISH_CATEGORIES.find((c) => c.value === v) || WISH_CATEGORIES[1];

const wishesBase = createService({
  key: 'wishes',
  tableName: TABLES.wishes,
  columns: ['id', 'title', 'category', 'note', 'achieved_at', 'created_at'],
  normalize: (row) => ({
    ...row,
    title: row.title || '',
    category: WISH_IDS.includes(row.category) ? row.category : 'do',
    note: row.note || '',
    achieved_at: row.achieved_at || null,
  }),
});

export const wishesService = {
  ...wishesBase,
  byCategory: (cat) => wishesBase.all()
    .filter((w) => w.category === cat)
    .sort((a, b) => (a.achieved_at ? 1 : 0) - (b.achieved_at ? 1 : 0) || String(a.created_at).localeCompare(String(b.created_at))),
  toggleAchieved: (w) => wishesBase.update(w.id, { achieved_at: w.achieved_at ? null : new Date().toISOString() }),
};

/** Хүсэлтэй холбоотой зорилгууд. */
export const goalsOfWish = (wishId) => goalsService.all().filter((g) => g.wish_id === wishId);

/** { goals, projects, pct } — холбоотой зорилгуудын дундаж ахиц. */
export function wishProgress(wishId) {
  const goals = goalsOfWish(wishId);
  if (!goals.length) return { goals: 0, projects: 0, pct: 0 };
  const list = goals.map((g) => goalProgress(g.id));
  return {
    goals: goals.length,
    projects: list.reduce((s, p) => s + p.projects, 0),
    pct: Math.round(list.reduce((s, p) => s + p.pct, 0) / list.length),
  };
}

/** Хүсэл устгахад зорилгууд нь үлдэнэ (хүсэлгүй болно) — сан дээр ON DELETE SET NULL. */
export async function deleteWish(wishId) {
  await wishesBase.remove(wishId);
  store.set('goals', store.get('goals').map((g) => (g.wish_id === wishId ? { ...g, wish_id: null } : g)));
}

/** Deleting a goal keeps its projects (they move to "No goal"). */
export async function deleteGoal(goalId) {
  for (const p of projectsService.byGoal(goalId)) await projectsService.update(p.id, { goal_id: null });
  await goalsService.remove(goalId);
}

/** Deleting a project keeps its tasks (they lose the project link). */
export async function deleteProject(projectId) {
  for (const t of tasksService.byProject(projectId)) await tasksService.update(t.id, { project_id: null });
  await projectsService.remove(projectId);
}
