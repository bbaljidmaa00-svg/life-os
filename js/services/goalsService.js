/**
 * Goals & Projects service — tables: TABLES.goals, TABLES.projects
 *
 * Hierarchy:  Goal  →  Projects (projects.goal_id)  →  Tasks (tasks.project_id)
 * Progress is calculated from task completion, never stored, so it is always accurate.
 */
import { TABLES } from '../config.js';
import { createService } from './createService.js';
import { tasksService } from './tasksService.js';

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
  columns: ['id', 'title', 'description', 'target_date', 'status', 'created_at'],
  normalize: (row) => ({
    ...row,
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
