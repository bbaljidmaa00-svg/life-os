/**
 * Goals & Projects.
 *   #/goals          → goal cards with progress, filter + sort, loose projects
 *   #/goals/<id>     → one goal: its projects, each with its tasks
 *   #/goals/none     → projects that don't belong to a goal
 */
import { goalsService, projectsService, goalProgress, projectProgress, deleteGoal, deleteProject, STATUSES, STATUS_TONE } from '../services/goalsService.js';
import { tasksService, sortTasks } from '../services/tasksService.js';
import { taskListHTML, handleTaskAction } from '../components/taskItem.js';
import { openGoalForm, openProjectForm } from '../components/forms.js';
import { parseTaskInput } from '../lib/nlp.js';
import { prefs } from '../state/prefs.js';
import { emptyState, pageHead, progressBar, confirmDialog, openMenu, toast, options } from '../lib/ui.js';
import { esc, plural } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { navigate } from '../lib/nav.js';
import { todayKey, diffDays, fmt } from '../lib/dates.js';

let statusFilter = 'active';
let sortBy = 'target';

const statusLabel = (s) => STATUSES.find((x) => x.value === s)?.label || s;
const statusBadge = (s) => `<span class="badge tone-${STATUS_TONE[s] || 'accent'}">${statusLabel(s)}</span>`;

function targetText(dateKey, status) {
  if (!dateKey) return 'Зорилтот огноогүй';
  if (status === 'completed') return `Зорилт: ${fmt.short(dateKey)}`;
  const days = diffDays(todayKey(), dateKey);
  if (days < 0) return `<span class="text-danger">Зорилтоос ${-days} хоног хэтэрсэн</span>`;
  if (days === 0) return 'Зорилт өнөөдөр';
  return `${days} хоног үлдсэн · ${fmt.short(dateKey)}`;
}

/* ───────────── List ───────────── */
function renderList(root) {
  const goals = goalsService.all();
  const counts = Object.fromEntries(['active', 'paused', 'completed'].map((s) => [s, goals.filter((g) => g.status === s).length]));
  let list = goals.filter((g) => statusFilter === 'all' || g.status === statusFilter);
  list = [...list].sort((a, b) => {
    if (sortBy === 'progress') return goalProgress(b.id).pct - goalProgress(a.id).pct;
    if (sortBy === 'name') return a.title.localeCompare(b.title);
    return String(a.target_date || '9999').localeCompare(String(b.target_date || '9999'));
  });
  const loose = projectsService.all().filter((p) => !p.goal_id || !goalsService.get(p.goal_id));

  const cards = list.map((g) => {
    const p = goalProgress(g.id);
    return `<a class="card goal-card" href="#/goals/${g.id}">
      <div class="goal-card-top">${statusBadge(g.status)}<span class="goal-card-pct">${p.pct}%</span></div>
      <h3 class="goal-card-title">${esc(g.title)}</h3>
      ${g.description ? `<p class="goal-card-desc">${esc(g.description)}</p>` : ''}
      ${progressBar(p.pct)}
      <div class="goal-card-meta"><span>${icon('folder', 14)}${p.projects} төсөл</span><span>${icon('tasks', 14)}${p.done}/${p.total} ажил</span></div>
      <p class="goal-card-target small">${icon('flag', 13)}${targetText(g.target_date, g.status)}</p>
    </a>`;
  }).join('');

  root.innerHTML = `
    ${pageHead({
    eyebrow: 'Чиглэл',
    title: 'Зорилго ба төсөл',
    sub: 'Зорилго нь хүрэх үр дүнг, төсөл нь түүнд хүрэх алхмыг, ажил нь төсөл бүрийн доторх хийх зүйлийг илэрхийлнэ.',
    actions: `<button type="button" class="btn" data-action="new-project">${icon('folder', 16)} Шинэ төсөл</button><button type="button" class="btn btn-primary" data-action="new-goal">${icon('plus', 16)} Шинэ зорилго</button>`,
  })}
    ${goals.length ? `<div class="toolbar">
      <div class="tabs" role="tablist" aria-label="Зорилго шүүх">
        ${[['active', 'Идэвхтэй'], ['paused', 'Түр зогссон'], ['completed', 'Дууссан'], ['all', 'Бүгд']].map(([v, l]) => `<button type="button" class="tab ${statusFilter === v ? 'is-active' : ''}" data-action="filter" data-value="${v}" role="tab" aria-selected="${statusFilter === v}">${l}<span class="count">${v === 'all' ? goals.length : counts[v]}</span></button>`).join('')}
      </div>
      <span class="spacer"></span>
      <select class="select select-sm" id="goalSort" aria-label="Зорилго эрэмбэлэх">${options([{ value: 'target', label: 'Зорилтот огноогоор' }, { value: 'progress', label: 'Ахицаар' }, { value: 'name', label: 'Нэрээр' }], sortBy)}</select>
    </div>` : ''}
    ${goals.length
    ? (list.length ? `<div class="goal-grid">${cards}</div>` : `<div class="card">${emptyState({ icon: 'goals', title: 'Энэ төлөвтэй зорилго алга', text: 'Бусад зорилгыг харахын тулд шүүлтүүрээ солино уу.' })}</div>`)
    : `<div class="card">${emptyState({
      icon: 'goals', title: 'Эхний зорилгоо тавих',
      text: 'Зорилго бол утга учиртай үр дүн — “Хагас марафон гүйх”, “Портфолиогоо нийтлэх”. Түүнд төсөл, төсөл бүрт ажил нэмэхэд ахиц автоматаар шинэчлэгдэнэ.',
      actions: `<button type="button" class="btn btn-primary" data-action="new-goal">${icon('plus', 16)} Шинэ зорилго</button>`,
    })}</div>`}
    ${loose.length ? `<h2 class="section-title">${icon('folder', 16)} Зорилгогүй төслүүд <span class="faint">${loose.length}</span><span class="spacer"></span><a class="card-link" href="#/goals/none">Нээх ${icon('chevronRight', 14)}</a></h2>
      <div class="card card-list">${loose.map((p) => {
    const pr = projectProgress(p.id);
    return `<a class="project-row" href="#/goals/none"><span class="project-row-title">${esc(p.title)}</span>${statusBadge(p.status)}<span class="project-row-bar">${progressBar(pr.pct)}</span><span class="small faint">${pr.done}/${pr.total}</span></a>`;
  }).join('')}</div>` : ''}`;

  root.onclick = (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'new-goal') openGoalForm(null, { onSaved: (g) => navigate(`goals/${g.id}`) });
    if (el.dataset.action === 'new-project') openProjectForm();
    if (el.dataset.action === 'filter') { statusFilter = el.dataset.value; renderList(root); }
  };
  root.onchange = (e) => { if (e.target.id === 'goalSort') { sortBy = e.target.value; renderList(root); } };
  root.onsubmit = null;
}

/* ───────────── Detail ───────────── */
function projectCard(p) {
  const pr = projectProgress(p.id);
  const tasks = sortTasks(tasksService.byProject(p.id));
  const due = p.due_date ? `${icon('calendar', 13)}${p.status !== 'completed' && p.due_date < todayKey() ? `<span class="text-danger">Дуусах: ${fmt.short(p.due_date)}</span>` : `Дуусах: ${fmt.short(p.due_date)}`}` : '';
  return `<section class="card project-card" data-project-id="${p.id}">
    <header class="project-head">
      <div class="project-head-main">
        <h3 class="project-title">${icon('folder', 16)}${esc(p.title)}</h3>
        <div class="project-meta">${statusBadge(p.status)}<span>${pr.done}/${pr.total} ажил</span>${due ? `<span>${due}</span>` : ''}</div>
      </div>
      <div class="project-progress"><span>${pr.pct}%</span>${progressBar(pr.pct)}</div>
      <button type="button" class="icon-btn" data-action="project-menu" aria-label="Төслийн сонголт: ${esc(p.title)}" aria-haspopup="menu">${icon('more')}</button>
    </header>
    ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
    <div class="project-tasks">
      ${tasks.length ? taskListHTML(tasks, { showProject: false }) : '<p class="project-empty small faint">Энэ төсөлд ажил алга байна.</p>'}
      <form class="inline-add" data-add-to="${p.id}" autocomplete="off">
        ${icon('plus', 16)}<input class="inline-add-input" id="add-${p.id}" placeholder="Ажил нэмэх…" aria-label="Ажил нэмэх: ${esc(p.title)}" maxlength="200">
        <button type="submit" class="btn btn-sm">Нэмэх</button>
      </form>
    </div>
  </section>`;
}

function renderDetail(root, goalId) {
  const isLoose = goalId === 'none';
  const goal = isLoose ? null : goalsService.get(goalId);
  if (!isLoose && !goal) {
    root.innerHTML = `<a class="back-link" href="#/goals">${icon('arrowLeft', 16)} Бүх зорилго</a>
      <div class="card" style="margin-top:20px">${emptyState({ icon: 'goals', title: 'Зорилго олдсонгүй', text: 'Устгагдсан байж магадгүй.', actions: '<a class="btn" href="#/goals">Зорилго руу буцах</a>' })}</div>`;
    root.onclick = null;
    return;
  }
  const projects = isLoose
    ? projectsService.all().filter((p) => !p.goal_id || !goalsService.get(p.goal_id))
    : projectsService.byGoal(goal.id);
  const progress = goal ? goalProgress(goal.id) : null;

  root.innerHTML = `
    <a class="back-link" href="#/goals">${icon('arrowLeft', 16)} Бүх зорилго</a>
    ${goal ? `
      <header class="page-head">
        <div class="page-head-text">
          <p class="eyebrow">Зорилго · ${statusLabel(goal.status)}</p>
          <h1 class="page-title">${esc(goal.title)}</h1>
          ${goal.description ? `<p class="page-sub">${esc(goal.description)}</p>` : ''}
        </div>
        <div class="page-actions">
          <button type="button" class="btn" data-action="edit-goal">${icon('edit', 16)} Засах</button>
          <button type="button" class="icon-btn" data-action="goal-menu" aria-label="Бусад сонголт" aria-haspopup="menu">${icon('more')}</button>
        </div>
      </header>
      <div class="card goal-summary">
        <div class="goal-summary-main"><span class="goal-summary-pct">${progress.pct}%</span>${progressBar(progress.pct)}<span class="small muted">${progress.total} ажлаас ${progress.done} нь дууссан</span></div>
        <div class="goal-summary-stat"><span class="small faint">Зорилт</span><strong>${goal.target_date ? fmt.medium(goal.target_date) : '—'}</strong><span class="small muted">${targetText(goal.target_date, goal.status)}</span></div>
        <div class="goal-summary-stat"><span class="small faint">Төсөл</span><strong>${projects.length}</strong><span class="small muted">${projects.filter((p) => p.status === 'completed').length} дууссан</span></div>
      </div>`
    : pageHead({ eyebrow: 'Төслүүд', title: 'Зорилгогүй төслүүд', sub: 'Төсөл бүрийн цэс → “Төсөл засах” хэсгээс зорилготой холбоно.' })}
    <div class="section-title">${icon('folder', 16)} Төслүүд <span class="faint">${projects.length}</span><span class="spacer"></span>
      <button type="button" class="btn btn-sm" data-action="new-project">${icon('plus', 14)} Төсөл нэмэх</button></div>
    ${projects.length ? `<div class="stack">${projects.map(projectCard).join('')}</div>`
    : `<div class="card">${emptyState({
      icon: 'folder', title: 'Төсөл алга байна', text: goal ? 'Энэ зорилгоо төслүүдэд хуваагаарай — тус бүр өөрийн ажилтай тодорхой хэсгүүд.' : 'Энд зорилгогүй төслүүд харагдана.',
      actions: `<button type="button" class="btn btn-primary" data-action="new-project">${icon('plus', 16)} Төсөл нэмэх</button>`,
    })}</div>`}`;

  root.onclick = (e) => {
    if (handleTaskAction(e)) return;
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const projectId = el.closest('[data-project-id]')?.dataset.projectId;
    const project = projectId && projectsService.get(projectId);
    switch (el.dataset.action) {
      case 'edit-goal': openGoalForm(goal); break;
      case 'new-project': openProjectForm(null, { goal_id: goal?.id || '' }); break;
      case 'goal-menu':
        openMenu(el, [
          goal.status === 'completed'
            ? { label: 'Идэвхжүүлэх', icon: 'refresh', onSelect: () => goalsService.update(goal.id, { status: 'active' }).then(() => toast('Зорилго дахин идэвхжлээ')) }
            : { label: 'Дууссан болгох', icon: 'check', onSelect: () => goalsService.update(goal.id, { status: 'completed' }).then(() => toast('Зорилго биеллээ — баяр хүргэе')) },
          goal.status === 'paused'
            ? { label: 'Үргэлжлүүлэх', icon: 'play', onSelect: () => goalsService.update(goal.id, { status: 'active' }) }
            : { label: 'Түр зогсоох', icon: 'clock', onSelect: () => goalsService.update(goal.id, { status: 'paused' }) },
          'sep',
          {
            label: 'Зорилго устгах', icon: 'trash', tone: 'danger',
            onSelect: async () => {
              const ok = await confirmDialog({ title: 'Энэ зорилгыг устгах уу?', message: `“${goal.title}” устгагдана. Түүний ${projects.length} төсөл, ажлууд хадгалагдаж “Зорилгогүй төслүүд” рүү шилжинэ.` });
              if (!ok) return;
              try { await deleteGoal(goal.id); toast('Зорилго устгагдлаа'); navigate('goals'); } catch (err) { toast(err.message, { tone: 'danger' }); }
            },
          },
        ]);
        break;
      case 'project-menu':
        openMenu(el, [
          { label: 'Төсөл засах', icon: 'edit', onSelect: () => openProjectForm(project) },
          { label: 'Туслахаар задлах', icon: 'assistant', onSelect: () => navigate(`assistant?prompt=${encodeURIComponent(`Төслийг задла: ${project.title}`)}&send=1`) },
          project.status === 'completed'
            ? { label: 'Идэвхжүүлэх', icon: 'refresh', onSelect: () => projectsService.update(project.id, { status: 'active' }) }
            : { label: 'Дууссан болгох', icon: 'check', onSelect: () => projectsService.update(project.id, { status: 'completed' }).then(() => toast('Төсөл дууслаа')) },
          'sep',
          {
            label: 'Төсөл устгах', icon: 'trash', tone: 'danger',
            onSelect: async () => {
              const n = tasksService.byProject(project.id).length;
              const ok = await confirmDialog({ title: 'Энэ төслийг устгах уу?', message: `“${project.title}” устгагдана.${n ? ` Түүний ${n} ажил төсөлгүйгээр хадгалагдана.` : ''}` });
              if (!ok) return;
              try { await deleteProject(project.id); toast('Төсөл устгагдлаа'); } catch (err) { toast(err.message, { tone: 'danger' }); }
            },
          },
        ]);
        break;
      default:
    }
  };

  root.onsubmit = async (e) => {
    const form = e.target.closest('[data-add-to]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input');
    const p = parseTaskInput(input.value);
    if (!p.title) { input.focus(); return; }
    try {
      await tasksService.create({
        title: p.title, project_id: form.dataset.addTo, due_date: p.due_date, due_time: p.due_time,
        priority: p.priority || prefs.get().defaultPriority, category: p.category || '',
        estimated_minutes: p.estimated_minutes || Number(prefs.get().defaultDuration) || null,
      });
      input.value = '';
      toast(`“${p.title}” нэмэгдлээ`);
    } catch (err) { toast(err.message, { tone: 'danger' }); }
  };
  root.onchange = null;
}

export default {
  title: 'Зорилго ба төсөл',
  render(root, route) {
    if (route.params[0]) renderDetail(root, route.params[0]);
    else renderList(root);
  },
};
