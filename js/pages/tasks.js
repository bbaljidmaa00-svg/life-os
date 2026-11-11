/**
 * Tasks — quick add with natural-language parsing, search, filters
 * (status, priority, category, deadline, project) and sorting.
 */
import { tasksService, sortTasks, PRIORITY_LABEL } from '../services/tasksService.js';
import { goalsService, projectsService } from '../services/goalsService.js';
import { taskListHTML, handleTaskAction } from '../components/taskItem.js';
import { openTaskForm } from '../components/forms.js';
import { parseTaskInput } from '../lib/nlp.js';
import { prefs } from '../state/prefs.js';
import { emptyState, pageHead, options, toast } from '../lib/ui.js';
import { esc, plural } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { todayKey, addDaysKey, relDay, fmtTime, fmtDuration } from '../lib/dates.js';

const DEFAULTS = { q: '', status: 'open', priority: 'all', category: 'all', due: 'all', project: 'all', sort: 'smart' };
let f = { ...DEFAULTS };
let lastRouteKey = null;

const GROUPS = [
  ['overdue', 'Хугацаа хэтэрсэн'], ['today', 'Өнөөдөр'], ['tomorrow', 'Маргааш'], ['week', 'Ирэх 7 хоног'],
  ['later', 'Дараа'], ['nodate', 'Огноогүй'], ['done', 'Дууссан'],
];

function groupOf(t, today, tomorrow, weekEnd) {
  if (t.status === 'done') return 'done';
  if (!t.due_date) return 'nodate';
  if (t.due_date < today) return 'overdue';
  if (t.due_date === today) return 'today';
  if (t.due_date === tomorrow) return 'tomorrow';
  if (t.due_date <= weekEnd) return 'week';
  return 'later';
}

function filtered() {
  const today = todayKey();
  const weekEnd = addDaysKey(today, 6);
  const q = f.q.trim().toLowerCase();
  return tasksService.all().filter((t) => {
    if (f.status === 'open' && t.status === 'done') return false;
    if (f.status === 'done' && t.status !== 'done') return false;
    if (f.priority !== 'all' && t.priority !== f.priority) return false;
    if (f.category === '__none' && t.category) return false;
    if (f.category !== 'all' && f.category !== '__none' && t.category !== f.category) return false;
    if (f.project === 'none' && t.project_id) return false;
    if (f.project !== 'all' && f.project !== 'none' && t.project_id !== f.project) return false;
    if (f.due === 'overdue' && !(t.due_date && t.due_date < today && t.status !== 'done')) return false;
    if (f.due === 'today' && t.due_date !== today) return false;
    if (f.due === 'week' && !(t.due_date && t.due_date >= today && t.due_date <= weekEnd)) return false;
    if (f.due === 'nodate' && t.due_date) return false;
    if (q && ![t.title, t.notes, t.category].some((v) => v && v.toLowerCase().includes(q))) return false;
    return true;
  });
}

const isFiltered = () => Object.keys(DEFAULTS).some((k) => f[k] !== DEFAULTS[k]);

function resultsHTML() {
  const all = tasksService.all();
  if (!all.length) {
    return `<div class="card">${emptyState({
      icon: 'tasks', title: 'Ажил алга байна',
      text: 'Бодолд байгаа бүхнээ бичээрэй. Дээрх талбарт энгийнээр бичихэд огноо, цаг, ач холбогдол, #ангиллыг автоматаар таньна.',
      actions: `<button type="button" class="btn btn-primary" data-action="new-task">${icon('plus', 16)} Шинэ ажил</button>`,
    })}</div>`;
  }
  const list = filtered();
  const summary = `<div class="results-bar"><span class="small muted">${all.length} ажлаас ${list.length} харагдаж байна</span>${isFiltered() ? '<button type="button" class="link-btn" data-action="clear">Шүүлтүүр арилгах</button>' : ''}</div>`;
  if (!list.length) {
    return `${summary}<div class="card">${emptyState({
      icon: 'search', title: 'Тохирох ажил алга', text: 'Өөр үгээр хайх эсвэл шүүлтүүрээ арилгана уу.',
      actions: '<button type="button" class="btn" data-action="clear">Шүүлтүүр арилгах</button>',
    })}</div>`;
  }

  if (f.sort !== 'smart') return `${summary}<div class="card card-list">${taskListHTML(sortTasks(list, f.sort))}</div>`;

  const today = todayKey();
  const tomorrow = addDaysKey(today, 1);
  const weekEnd = addDaysKey(today, 6);
  const groups = {};
  sortTasks(list).forEach((t) => { (groups[groupOf(t, today, tomorrow, weekEnd)] ||= []).push(t); });
  return `${summary}<div class="card card-list">${GROUPS.filter(([id]) => groups[id]).map(([id, label]) => {
    const items = groups[id];
    const minutes = items.reduce((s, t) => s + (t.status === 'done' ? 0 : t.estimated_minutes || 0), 0);
    return `<section class="task-group">
      <h2 class="task-group-head ${id === 'overdue' ? 'is-danger' : ''}">${label}<span class="count">${items.length}</span><span class="spacer"></span>${minutes ? `<span>${fmtDuration(minutes)}</span>` : ''}</h2>
      ${taskListHTML(items, { showDate: !['today', 'tomorrow'].includes(id) })}
    </section>`;
  }).join('')}</div>`;
}

function projectFilterOptions() {
  const goals = goalsService.all();
  let html = `<option value="all" ${f.project === 'all' ? 'selected' : ''}>Бүх төсөл</option><option value="none" ${f.project === 'none' ? 'selected' : ''}>Төсөлгүй</option>`;
  projectsService.all().forEach((p) => {
    const goal = goals.find((g) => g.id === p.goal_id);
    html += `<option value="${p.id}" ${f.project === p.id ? 'selected' : ''}>${esc(p.title)}${goal ? ` — ${esc(goal.title)}` : ''}</option>`;
  });
  return html;
}

function previewHTML(text) {
  const p = parseTaskInput(text);
  if (!text.trim()) return '<span class="faint">Жишээ: “Баасан гарагт 15 цагт санал бичих чухал #ажил 45 мин”</span>';
  const chips = [];
  if (p.due_date) chips.push(`${icon('calendar', 13)}${esc(relDay(p.due_date))}`);
  if (p.due_time) chips.push(`${icon('clock', 13)}${fmtTime(p.due_time)}`);
  if (p.priority) chips.push(`${icon('flag', 13)}${PRIORITY_LABEL[p.priority]}`);
  if (p.category) chips.push(`#${esc(p.category)}`);
  if (p.estimated_minutes) chips.push(fmtDuration(p.estimated_minutes));
  return `<span class="parse-title">${esc(p.title || '…')}</span>${chips.map((c) => `<span class="parse-chip">${c}</span>`).join('')}`;
}

function updateResults() {
  const el = document.getElementById('taskResults');
  if (el) el.innerHTML = resultsHTML();
}

export default {
  title: 'Ажлууд',
  render(root, route) {
    if (route.key !== lastRouteKey) {
      lastRouteKey = route.key;
      if (route.query.due) f = { ...DEFAULTS, due: route.query.due, status: 'open' };
      if (route.query.priority) f = { ...DEFAULTS, priority: route.query.priority };
    }
    const open = tasksService.open();
    const overdue = tasksService.overdue().length;
    const todayMin = tasksService.dueOn(todayKey()).filter((t) => t.status !== 'done').reduce((s, t) => s + (t.estimated_minutes || 0), 0);
    const categories = tasksService.categories();

    root.innerHTML = `
      ${pageHead({
    eyebrow: `${open.length} дуусаагүй ажил${overdue ? ` · ${overdue} хэтэрсэн` : ''}${todayMin ? ` · өнөөдөр ${fmtDuration(todayMin)}` : ''}`,
    title: 'Ажлууд',
    actions: `<button type="button" class="btn btn-primary" data-action="new-task">${icon('plus', 16)} Шинэ ажил</button>`,
  })}
      <form class="card quick-add" id="taskQuickAdd" autocomplete="off">
        <div class="quick-add-row">
          ${icon('plus', 18)}
          <input id="quickTaskInput" class="quick-add-input" placeholder="Ажил нэмэх — огноо, цаг, ач холбогдол, #ангилал, хугацаа бичиж болно" aria-label="Хурдан ажил нэмэх" aria-describedby="quickPreview" maxlength="200">
          <button type="submit" class="btn btn-primary btn-sm">Нэмэх</button>
        </div>
        <div class="quick-preview" id="quickPreview" aria-live="polite">${previewHTML('')}</div>
      </form>

      <div class="toolbar" role="search">
        <label class="search-field">${icon('search', 16)}<input id="taskSearch" type="search" class="input" placeholder="Ажил хайх" value="${esc(f.q)}" aria-label="Ажил хайх"></label>
        <select class="select" data-filter="status" aria-label="Төлөв">${options([{ value: 'open', label: 'Дуусаагүй' }, { value: 'done', label: 'Дууссан' }, { value: 'all', label: 'Бүх төлөв' }], f.status)}</select>
        <select class="select" data-filter="due" aria-label="Хугацаа">${options([{ value: 'all', label: 'Бүх хугацаа' }, { value: 'overdue', label: 'Хугацаа хэтэрсэн' }, { value: 'today', label: 'Өнөөдөр дуусах' }, { value: 'week', label: 'Ирэх 7 хоног' }, { value: 'nodate', label: 'Огноогүй' }], f.due)}</select>
        <select class="select" data-filter="priority" aria-label="Ач холбогдол">${options([{ value: 'all', label: 'Ач холбогдол' }, { value: 'high', label: 'Өндөр' }, { value: 'medium', label: 'Дунд' }, { value: 'low', label: 'Бага' }], f.priority)}</select>
        <select class="select" data-filter="category" aria-label="Ангилал">${options([{ value: 'all', label: 'Бүх ангилал' }, ...categories, { value: '__none', label: 'Ангилалгүй' }], f.category)}</select>
        <select class="select" data-filter="project" aria-label="Төсөл">${projectFilterOptions()}</select>
        <select class="select" data-filter="sort" aria-label="Эрэмбэлэх">${options([{ value: 'smart', label: 'Хугацаагаар' }, { value: 'priority', label: 'Ач холбогдлоор' }, { value: 'duration', label: 'Богино нь эхэнд' }, { value: 'created', label: 'Шинэ нь эхэнд' }, { value: 'title', label: 'Нэрээр (А–Я)' }], f.sort)}</select>
      </div>
      <div id="taskResults">${resultsHTML()}</div>`;

    root.onclick = (e) => {
      if (handleTaskAction(e)) return;
      const el = e.target.closest('[data-action]');
      if (!el) return;
      if (el.dataset.action === 'new-task') openTaskForm(null, f.due === 'nodate' ? { due_date: null } : {});
      if (el.dataset.action === 'clear') {
        f = { ...DEFAULTS };
        this.render(root, route);
      }
    };
    root.oninput = (e) => {
      if (e.target.id === 'taskSearch') { f.q = e.target.value; updateResults(); }
      if (e.target.id === 'quickTaskInput') document.getElementById('quickPreview').innerHTML = previewHTML(e.target.value);
    };
    root.onchange = (e) => {
      const key = e.target.dataset.filter;
      if (key) { f[key] = e.target.value; updateResults(); }
    };
    root.onsubmit = async (e) => {
      if (e.target.id !== 'taskQuickAdd') return;
      e.preventDefault();
      const input = document.getElementById('quickTaskInput');
      const p = parseTaskInput(input.value);
      if (!p.title) { input.focus(); return; }
      try {
        await tasksService.create({
          title: p.title,
          due_date: p.due_date || (f.due === 'today' ? todayKey() : null),
          due_time: p.due_time,
          priority: p.priority || prefs.get().defaultPriority,
          category: p.category || (f.category !== 'all' && f.category !== '__none' ? f.category : ''),
          estimated_minutes: p.estimated_minutes || Number(prefs.get().defaultDuration) || null,
          project_id: f.project !== 'all' && f.project !== 'none' ? f.project : null,
        });
        toast(`“${p.title}” нэмэгдлээ`);
        requestAnimationFrame(() => {
          const fresh = document.getElementById('quickTaskInput');
          if (fresh) { fresh.value = ''; fresh.focus(); document.getElementById('quickPreview').innerHTML = previewHTML(''); }
        });
      } catch (err) { toast(err.message, { tone: 'danger' }); }
    };
  },
};
