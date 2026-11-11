/**
 * Task row used on every page (dashboard, tasks, calendar, goals, assistant).
 * Pages call handleTaskAction(event) first in their click handler; it returns
 * true when the click was a task action (complete / edit / delete).
 */
import { tasksService, PRIORITY_LABEL } from '../services/tasksService.js';
import { projectsService } from '../services/goalsService.js';
import { openTaskForm, deleteWithUndo } from './forms.js';
import { toast } from '../lib/ui.js';
import { esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { todayKey, relDay, fmtTime, fmtDuration } from '../lib/dates.js';

export function taskItemHTML(t, { showDate = true, showProject = true } = {}) {
  const done = t.status === 'done';
  const overdue = !done && t.due_date && t.due_date < todayKey();
  const meta = [];
  if (t.priority !== 'low' && !done) meta.push(`<span class="meta-item is-${t.priority}">${icon('flag', 13)}${PRIORITY_LABEL[t.priority]}</span>`);
  if (showDate && t.due_date) meta.push(`<span class="meta-item ${overdue ? 'is-danger' : ''}">${icon('calendar', 13)}${esc(relDay(t.due_date))}${t.due_time ? ` · ${fmtTime(t.due_time)}` : ''}</span>`);
  else if (t.due_time) meta.push(`<span class="meta-item">${icon('clock', 13)}${fmtTime(t.due_time)}</span>`);
  if (t.estimated_minutes) meta.push(`<span class="meta-item">${icon('clock', 13)}${fmtDuration(t.estimated_minutes)}</span>`);
  if (t.category) meta.push(`<span class="meta-item tag">${esc(t.category)}</span>`);
  if (showProject && t.project_id) {
    const project = projectsService.get(t.project_id);
    if (project) meta.push(`<span class="meta-item">${icon('folder', 13)}${esc(project.title)}</span>`);
  }
  return `<li class="task prio-${t.priority} ${done ? 'is-done' : ''}" data-task-id="${t.id}">
    <button type="button" class="task-check" data-action="task-toggle" aria-pressed="${done}" aria-label="${done ? 'Дуусаагүй болгох' : 'Дуусгах'}: ${esc(t.title)}">${icon('check', 13)}</button>
    <button type="button" class="task-main" data-action="task-edit" aria-label="Засах: ${esc(t.title)}">
      <span class="task-title">${esc(t.title)}</span>
      ${meta.length ? `<span class="task-meta">${meta.join('')}</span>` : ''}
    </button>
    <button type="button" class="icon-btn icon-btn-sm task-del" data-action="task-delete" aria-label="Устгах: ${esc(t.title)}">${icon('trash', 15)}</button>
  </li>`;
}

export function taskListHTML(tasks, opts) {
  return `<ul class="task-list">${tasks.map((t) => taskItemHTML(t, opts)).join('')}</ul>`;
}

export async function toggleTask(task, row) {
  row?.classList.toggle('is-done', task.status !== 'done');
  try {
    const updated = await tasksService.toggle(task.id);
    if (updated.status === 'done') toast(`“${updated.title}” дууслаа`, { action: () => tasksService.toggle(task.id) });
  } catch (err) {
    row?.classList.toggle('is-done');
    toast(err.message, { tone: 'danger' });
  }
}

export function handleTaskAction(event) {
  const button = event.target.closest('[data-action^="task-"]');
  if (!button) return false;
  const row = button.closest('[data-task-id]');
  const task = row && tasksService.get(row.dataset.taskId);
  if (!task) return false;
  switch (button.dataset.action) {
    case 'task-toggle': toggleTask(task, row); break;
    case 'task-edit': openTaskForm(task); break;
    case 'task-delete': deleteWithUndo(tasksService, task, task.title).catch((err) => toast(err.message, { tone: 'danger' })); break;
    default: return false;
  }
  return true;
}
