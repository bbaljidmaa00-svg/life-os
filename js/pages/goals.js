/**
 * Хүсэл, зорилго, төсөл.
 *   #/goals             → (анхдагч) төслүүд: ⚡ Жижиг ба 🌱 Том гэж хоёр хуваан
 *   #/goals?tab=wishes  → хүсэл мөрөөдөл: 4 ангилал (Болох · Хийх · Эзэмших · Өгөх), хугацаагүй
 *   #/goals?tab=goals   → goal cards with progress, filter + sort, loose projects
 *   #/goals/<id>?p=<projectId> → тухайн төсөл рүү гүйлгэнэ
 *   #/goals/<id>        → one goal: its wish, its projects, each with its tasks
 *   #/goals/none        → projects that don't belong to a goal
 *
 * Гинж:  Хүсэл  →  Зорилго (goals.wish_id)  →  Төсөл (projects.goal_id)  →  Хийх зүйлс (tasks.project_id)
 */
import {
  goalsService, projectsService, goalProgress, projectProgress, deleteGoal, deleteProject, STATUSES, STATUS_TONE,
  wishesService, WISH_CATEGORIES, wishCategory, goalsOfWish, wishProgress,
  PROJECT_KINDS, projectKind, reflectionsService, projectDay,
} from '../services/goalsService.js';
import { tasksService, sortTasks } from '../services/tasksService.js';
import { taskListHTML, handleTaskAction } from '../components/taskItem.js';
import { openGoalForm, openProjectForm, openWishForm, openReflectionForm, reflectMood } from '../components/forms.js';
import { parseTaskInput } from '../lib/nlp.js';
import { prefs } from '../state/prefs.js';
import { emptyState, pageHead, progressBar, confirmDialog, openMenu, toast, options } from '../lib/ui.js';
import { esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { navigate, parseRoute } from '../lib/nav.js';
import { todayKey, diffDays, fmt, relDay, keyOfTimestamp } from '../lib/dates.js';

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

/** Хүсэл → Зорилго → Төсөл → Хийх зүйлс гинжийг харуулах жижиг мөр. */
const chainHTML = () => `<span class="chain" aria-label="Хүсэл, зорилго, төсөл, хийх зүйлсийн холбоо">
  <span class="chain-step is-wish">${icon('sparkle', 13)}Хүсэл</span>${icon('chevronRight', 13)}
  <span class="chain-step is-goal">${icon('goals', 13)}Зорилго</span>${icon('chevronRight', 13)}
  <span class="chain-step is-project">${icon('folder', 13)}Төсөл</span>${icon('chevronRight', 13)}
  <span class="chain-step is-task">${icon('tasks', 13)}Хийх зүйлс</span></span>`;

const wishChip = (wish) => (wish ? `<span class="goal-wish" style="--wc:${wishCategory(wish.category).color}">${icon(wishCategory(wish.category).icon, 12)}${esc(wish.title)}</span>` : '');

/* ───────────── Хүсэл мөрөөдөл ───────────── */
function wishItem(w) {
  const goals = goalsOfWish(w.id);
  const achieved = Boolean(w.achieved_at);
  return `<li class="wish ${achieved ? 'is-achieved' : ''}" data-wish-id="${w.id}">
    <div class="wish-row">
      <button type="button" class="wish-main" data-action="edit-wish">
        <span class="wish-title">${achieved ? '✨ ' : ''}${esc(w.title)}</span>
        ${w.note ? `<span class="wish-note">${esc(w.note)}</span>` : ''}
      </button>
      <button type="button" class="icon-btn icon-btn-sm" data-action="wish-menu" aria-label="Сонголт: ${esc(w.title)}" aria-haspopup="menu">${icon('more', 16)}</button>
    </div>
    ${goals.length ? `<ul class="wish-goals">${goals.map((g) => {
    const p = goalProgress(g.id);
    return `<li><a class="wish-goal ${g.status === 'completed' ? 'is-done' : ''}" href="#/goals/${g.id}">
        <span class="wg-name">${icon('goals', 13)}${esc(g.title)}</span>
        <span class="wg-sub">${p.projects} төсөл · ${p.pct}%</span>
        ${progressBar(p.pct)}
      </a></li>`;
  }).join('')}</ul>` : ''}
    ${achieved ? '' : `<div class="wish-actions">
      <button type="button" class="wish-to-goal ${goals.length ? 'is-more' : ''}" data-action="to-goal">${icon(goals.length ? 'plus' : 'arrowRight', 14)}${goals.length ? 'Өөр зорилго' : 'Зорилго болгох'}</button>
    </div>`}
  </li>`;
}

function wishesTab() {
  const total = wishesService.all().length;
  const intro = total ? '' : `<div class="card wish-intro">
      <span class="wish-intro-icon">${icon('sparkle', 22)}</span>
      <div><p class="wish-intro-title">Мөрөөдлөө чөлөөтэй бич</p>
      <p class="small muted">Хүсэлд хугацаа хэрэггүй. Болмоор, хиймээр, эзэмшмээр, бусдад өгмөөр байгаа бүхнээ доорх 4 хайрцагт бичээрэй. Бэлэн болсон үедээ «Зорилго болгох» дарж хугацаа, төсөлтэй болгоно.</p></div>
    </div>`;
  return `${intro}<div class="wish-board">${WISH_CATEGORIES.map((c) => {
    const list = wishesService.byCategory(c.value);
    const open = list.filter((w) => !w.achieved_at).length;
    return `<section class="card wish-col" style="--wc:${c.color}" aria-label="${esc(c.label)}">
      <header class="wish-head">
        <span class="wish-icon">${icon(c.icon, 20)}</span>
        <div class="wish-head-text"><h2 class="wish-cat">${esc(c.label)}</h2><p class="wish-hint">${esc(c.hint)}</p></div>
        <span class="wish-count" title="${open} хүсэл">${list.length}</span>
      </header>
      <form class="wish-add" data-cat="${c.value}" autocomplete="off">
        <input class="wish-add-input" id="wishAdd-${c.value}" placeholder="${esc(c.example)}" aria-label="${esc(c.label)} — хүсэл нэмэх" maxlength="200">
        <button type="submit" class="wish-add-btn" aria-label="Нэмэх">${icon('plus', 16)}</button>
      </form>
      ${list.length ? `<ul class="wish-list">${list.map(wishItem).join('')}</ul>` : '<p class="wish-empty small faint">Энд хүслээ бичээд Enter дарна.</p>'}
    </section>`;
  }).join('')}</div>`;
}

/* ───────────── Зорилго ───────────── */
function goalsTab() {
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
      ${wishChip(wishesService.get(g.wish_id))}
      <h3 class="goal-card-title">${esc(g.title)}</h3>
      ${g.description ? `<p class="goal-card-desc">${esc(g.description)}</p>` : ''}
      ${progressBar(p.pct)}
      <div class="goal-card-meta"><span>${icon('folder', 14)}${p.projects} төсөл</span><span>${icon('tasks', 14)}${p.done}/${p.total} зүйл</span></div>
      <p class="goal-card-target small">${icon('flag', 13)}${targetText(g.target_date, g.status)}</p>
    </a>`;
  }).join('');

  return `
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
      text: 'Зорилго бол утга учиртай үр дүн — “Хагас марафон гүйх”, “Портфолиогоо нийтлэх”. Хүслээсээ эхлүүлж болно: «Хүсэл мөрөөдөл» табаас «Зорилго болгох» дарна.',
      actions: `<button type="button" class="btn btn-primary" data-action="new-goal">${icon('plus', 16)} Шинэ зорилго</button>`,
    })}</div>`}
    ${loose.length ? `<h2 class="section-title">${icon('folder', 16)} Зорилгогүй төслүүд <span class="faint">${loose.length}</span><span class="spacer"></span><a class="card-link" href="#/goals/none">Нээх ${icon('chevronRight', 14)}</a></h2>
      <div class="card card-list">${loose.map((p) => {
    const pr = projectProgress(p.id);
    return `<a class="project-row" href="#/goals/none"><span class="project-row-title">${projectKind(p.kind).emoji} ${esc(p.title)}</span>${statusBadge(p.status)}<span class="project-row-bar">${progressBar(pr.pct)}</span><span class="small faint">${pr.done}/${pr.total}</span></a>`;
  }).join('')}</div>` : ''}`;
}

/* ───────────── Төслүүд: Жижиг / Том ───────────── */
function projectTile(p) {
  const pr = projectProgress(p.id);
  const goal = p.goal_id ? goalsService.get(p.goal_id) : null;
  const href = `#/goals/${goal ? goal.id : 'none'}?p=${p.id}`;
  const next = sortTasks(tasksService.byProject(p.id).filter((t) => t.status !== 'done'))[0];
  const notes = reflectionsService.byProject(p.id).length;
  let when = '';
  if (p.kind === 'long') when = `<span class="project-day">${projectDay(p)} дэх өдөр</span>`;
  else if (p.due_date) {
    const days = diffDays(todayKey(), p.due_date);
    when = days < 0 ? `<span class="text-danger">${-days} хоног хэтэрсэн</span>` : days === 0 ? '<span class="text-warning">Өнөөдөр дуусна</span>' : `<span>${days} хоног үлдсэн</span>`;
  }
  return `<article class="card proj-tile kind-${p.kind}" data-project-id="${p.id}">
    <a class="pt-main" href="${href}">
      <span class="pt-title">${esc(p.title)}</span>
      <span class="pt-goal">${goal ? `${icon('goals', 12)}${esc(goal.title)}` : `${icon('folder', 12)}Зорилгогүй`}</span>
    </a>
    <div class="pt-progress">${progressBar(pr.pct)}<span class="pt-pct">${pr.pct}%</span></div>
    <div class="pt-meta"><span>${pr.done}/${pr.total} алхам</span>${when}${notes ? `<span>${icon('sparkle', 12)}${notes} тэмдэглэл</span>` : ''}</div>
    ${next ? `<div class="pt-next"><span class="pt-next-label">Дараагийн алхам</span>${taskListHTML([next], { showProject: false })}</div>`
    : pr.total ? '<p class="pt-done small">Бүх алхам дууссан 🎉 <button type="button" class="link-btn" data-action="complete-project">Төслийг дуусгах</button></p>'
      : `<a class="pt-add small" href="${href}">${icon('plus', 13)} Алхам нэмэх</a>`}
  </article>`;
}

function projectsTab() {
  const all = projectsService.all();
  if (!all.length) {
    return `<div class="card">${emptyState({
      icon: 'folder', title: 'Эхний төслөө нэмье',
      text: '⚡ Жижиг төсөл — цөөн алхамтай, хурдан дуусна (цүнх авах). 🌱 Том төсөл — олон, давтагдах үйлдэлтэй (турах, эрт унтдаг болох).',
      actions: PROJECT_KINDS.map((k) => `<button type="button" class="btn ${k.value === 'quick' ? '' : 'btn-primary'}" data-action="new-project" data-kind="${k.value}">${k.emoji} ${esc(k.label)} төсөл</button>`).join(''),
    })}</div>`;
  }
  return `<div class="proj-board">${PROJECT_KINDS.map((k) => {
    const list = all.filter((p) => p.kind === k.value);
    const open = list.filter((p) => p.status !== 'completed')
      .sort((a, b) => (a.status === 'paused') - (b.status === 'paused') || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) || String(a.created_at).localeCompare(String(b.created_at)));
    const done = list.filter((p) => p.status === 'completed');
    return `<section class="proj-col kind-${k.value}" aria-label="${esc(k.label)} төслүүд">
      <header class="proj-col-head">
        <span class="proj-col-emoji" aria-hidden="true">${k.emoji}</span>
        <div><h2 class="proj-col-title">${esc(k.label)} төслүүд <span class="count">${open.length}</span></h2><p class="small muted">${esc(k.hint)} · ${esc(k.example)}</p></div>
        <button type="button" class="btn btn-sm" data-action="new-project" data-kind="${k.value}">${icon('plus', 14)} Нэмэх</button>
      </header>
      ${open.length ? `<div class="proj-tiles">${open.map(projectTile).join('')}</div>` : `<p class="small faint proj-empty">Идэвхтэй ${esc(k.label.toLowerCase())} төсөл алга.</p>`}
      ${done.length ? `<details class="proj-done"><summary>${icon('check', 14)} Дууссан <span class="count">${done.length}</span></summary>
        <ul>${done.map((p) => `<li><a href="#/goals/${p.goal_id && goalsService.get(p.goal_id) ? p.goal_id : 'none'}?p=${p.id}">${esc(p.title)}</a><span class="small faint">${reflectionsService.byProject(p.id).length} тэмдэглэл</span></li>`).join('')}</ul></details>` : ''}
    </section>`;
  }).join('')}</div>`;
}

/** Хүслээс зорилго үүсгээд, шууд төсөл нэмэх санал тавина. */
function goalFromWish(wish) {
  openGoalForm(null, {
    defaults: { title: wish.title, wish_id: wish.id, description: wish.note || '' },
    quiet: true,
    onSaved: (g) => toast(`“${g.title}” зорилго боллоо`, { action: () => openProjectForm(null, { goal_id: g.id }), actionLabel: 'Төсөл нэмэх', duration: 8000 }),
  });
}

function renderList(root, route = parseRoute()) {
  delete root.dataset.focused;
  const tab = ['wishes', 'goals'].includes(route.query?.tab) ? route.query.tab : 'projects';
  const projects = projectsService.all();
  const wishes = wishesService.all();
  const goals = goalsService.all();
  const linked = goals.filter((g) => g.wish_id && wishesService.get(g.wish_id)).length;

  root.innerHTML = `
    ${pageHead({
    eyebrow: tab === 'wishes' ? `${wishes.length} хүсэл · ${wishes.filter((w) => w.achieved_at).length} биелсэн · ${linked} зорилготой холбогдсон`
      : tab === 'projects' ? PROJECT_KINDS.map((k) => `${k.emoji} ${projects.filter((p) => p.kind === k.value && p.status !== 'completed').length} ${k.label.toLowerCase()}`).join(' · ')
        : 'Чиглэл',
    title: 'Зорилго ба төсөл',
    sub: chainHTML(),
    actions: tab === 'wishes'
      ? `<button type="button" class="btn" data-action="new-goal">${icon('goals', 16)} Шинэ зорилго</button><button type="button" class="btn btn-primary" data-action="new-wish">${icon('sparkle', 16)} Шинэ хүсэл</button>`
      : tab === 'projects'
        ? `<button type="button" class="btn" data-action="new-goal">${icon('goals', 16)} Шинэ зорилго</button><button type="button" class="btn btn-primary" data-action="new-project">${icon('plus', 16)} Шинэ төсөл</button>`
      : `<button type="button" class="btn" data-action="new-project">${icon('folder', 16)} Шинэ төсөл</button><button type="button" class="btn btn-primary" data-action="new-goal">${icon('plus', 16)} Шинэ зорилго</button>`,
  })}
    <nav class="tabs page-tabs" aria-label="Хүсэл ба зорилго">
      <a class="tab ${tab === 'wishes' ? 'is-active' : ''}" href="#/goals?tab=wishes" ${tab === 'wishes' ? 'aria-current="page"' : ''}>${icon('sparkle', 15)} Хүсэл мөрөөдөл<span class="count">${wishes.length}</span></a>
      <a class="tab ${tab === 'goals' ? 'is-active' : ''}" href="#/goals?tab=goals" ${tab === 'goals' ? 'aria-current="page"' : ''}>${icon('goals', 15)} Зорилго<span class="count">${goals.length}</span></a>
      <a class="tab ${tab === 'projects' ? 'is-active' : ''}" href="#/goals" ${tab === 'projects' ? 'aria-current="page"' : ''}>${icon('folder', 15)} Төслүүд<span class="count">${projects.filter((p) => p.status !== 'completed').length}</span></a>
    </nav>
    ${tab === 'wishes' ? wishesTab() : tab === 'goals' ? goalsTab() : projectsTab()}`;

  root.onclick = (e) => {
    if (handleTaskAction(e)) return;
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const tileProject = projectsService.get(el.closest('[data-project-id]')?.dataset.projectId || '');
    const wishId = el.closest('[data-wish-id]')?.dataset.wishId;
    const wish = wishId && wishesService.get(wishId);
    switch (el.dataset.action) {
      case 'new-goal': openGoalForm(null, { onSaved: (g) => navigate(`goals/${g.id}`) }); break;
      case 'new-project': openProjectForm(null, el.dataset.kind ? { kind: el.dataset.kind } : {}); break;
      case 'complete-project': projectsService.update(tileProject.id, { status: 'completed' }).then(() => toast(`“${tileProject.title}” төсөл дууслаа 🎉`)); break;
      case 'new-wish': openWishForm(); break;
      case 'filter': statusFilter = el.dataset.value; renderList(root, route); break;
      case 'edit-wish': openWishForm(wish); break;
      case 'to-goal': goalFromWish(wish); break;
      case 'wish-menu': {
        const free = goalsService.all().filter((g) => !g.wish_id || !wishesService.get(g.wish_id));
        openMenu(el, [
          { label: 'Засах', icon: 'edit', onSelect: () => openWishForm(wish) },
          { label: 'Зорилго болгох', icon: 'goals', onSelect: () => goalFromWish(wish) },
          ...(free.length ? [{
            label: 'Байгаа зорилго холбох', icon: 'link',
            onSelect: () => openMenu(el, free.map((g) => ({
              label: g.title, icon: 'goals',
              onSelect: () => goalsService.update(g.id, { wish_id: wish.id }).then(() => toast(`“${g.title}” → “${wish.title}”-д холбогдлоо`)).catch((err) => toast(err.message, { tone: 'danger' })),
            }))),
          }] : []),
          wish.achieved_at
            ? { label: 'Биелээгүй болгох', icon: 'refresh', onSelect: () => wishesService.toggleAchieved(wish) }
            : { label: 'Биелсэн ✨', icon: 'check', onSelect: () => wishesService.toggleAchieved(wish).then(() => toast(`✨ “${wish.title}” биелжээ! Баяр хүргэе`)) },
        ]);
        break;
      }
      default:
    }
  };
  root.onchange = (e) => { if (e.target.id === 'goalSort') { sortBy = e.target.value; renderList(root, route); } };
  root.onsubmit = async (e) => {
    const form = e.target.closest('.wish-add');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input');
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    try {
      input.value = '';
      await wishesService.create({ title, category: form.dataset.cat });
      requestAnimationFrame(() => document.getElementById(`wishAdd-${form.dataset.cat}`)?.focus());
    } catch (err) { input.value = title; toast(err.message, { tone: 'danger' }); }
  };
}

/* ───────────── Detail ───────────── */
/** «Юу сурсан бэ?» тэмдэглэлүүд — төслийн доор. */
function reflectionsHTML(p) {
  const list = reflectionsService.byProject(p.id);
  const add = `<button type="button" class="btn btn-sm btn-ghost" data-action="add-reflection">${icon('edit', 14)} Тэмдэглэл бичих</button>`;
  if (!list.length) {
    return `<div class="reflections is-empty"><p class="small faint">${p.kind === 'long' ? 'Алхам бүрээ ✓ хийх бүрт юу сурснаа бичвэл энд таны замнал харагдана.' : 'Алхмаа ✓ хийхэд «Юу сурсан бэ?» гэж асууна.'}</p>${add}</div>`;
  }
  return `<details class="reflections" ${p.kind === 'long' ? 'open' : ''}>
    <summary>${icon('sparkle', 15)} Сурсан зүйлс, сэтгэгдэл <span class="count">${list.length}</span></summary>
    <ul class="reflection-list">${list.map((r) => {
    const m = reflectMood(r.mood);
    return `<li><button type="button" class="reflection" data-action="edit-reflection" data-id="${r.id}">
        <span class="rf-head">${m ? `<span class="rf-mood" title="${esc(m.label)}">${m.emoji}</span>` : ''}<span class="rf-step">${esc(r.task_title || 'Тэмдэглэл')}</span><span class="rf-date">${esc(relDay(keyOfTimestamp(r.created_at) || todayKey()))}</span></span>
        ${r.learned ? `<span class="rf-learned"><b>Сурсан:</b> ${esc(r.learned)}</span>` : ''}
        ${r.feeling ? `<span class="rf-feeling">${esc(r.feeling)}</span>` : ''}
      </button></li>`;
  }).join('')}</ul>
    ${add}
  </details>`;
}

function projectCard(p) {
  const pr = projectProgress(p.id);
  const tasks = sortTasks(tasksService.byProject(p.id));
  const kind = projectKind(p.kind);
  const due = p.due_date ? `${icon('calendar', 13)}${p.status !== 'completed' && p.due_date < todayKey() ? `<span class="text-danger">Дуусах: ${fmt.short(p.due_date)}</span>` : `Дуусах: ${fmt.short(p.due_date)}`}` : '';
  const dayText = p.kind === 'long' && p.status !== 'completed' ? `<span class="project-day">${projectDay(p)} дэх өдөр</span>` : '';
  return `<section class="card project-card kind-${p.kind}" data-project-id="${p.id}">
    <header class="project-head">
      <div class="project-head-main">
        <h3 class="project-title"><span class="project-kind" title="${esc(kind.label)}: ${esc(kind.hint)}">${kind.emoji}</span>${esc(p.title)}</h3>
        <div class="project-meta">${statusBadge(p.status)}<span class="kind-badge is-${p.kind}">${esc(kind.label)}</span>${dayText}<span>${pr.done}/${pr.total} алхам</span>${due ? `<span>${due}</span>` : ''}</div>
      </div>
      <div class="project-progress"><span>${pr.pct}%</span>${progressBar(pr.pct)}</div>
      <button type="button" class="icon-btn" data-action="project-menu" aria-label="Төслийн сонголт: ${esc(p.title)}" aria-haspopup="menu">${icon('more')}</button>
    </header>
    ${p.description ? `<p class="project-desc">${esc(p.description)}</p>` : ''}
    <div class="project-tasks">
      ${tasks.length ? taskListHTML(tasks, { showProject: false }) : `<p class="project-empty small faint">${p.kind === 'long' ? 'Өдөр бүр хийх алхмаа нэмээрэй — жишээ нь “22:30-д утсаа унтраах”.' : 'Хийх алхмаа нэмээрэй — жишээ нь “Дэлгүүрээс үнэ харьцуулах”.'}</p>`}
      <form class="inline-add" data-add-to="${p.id}" autocomplete="off">
        ${icon('plus', 16)}<input class="inline-add-input" id="add-${p.id}" placeholder="Алхам нэмэх…" aria-label="Алхам нэмэх: ${esc(p.title)}" maxlength="200">
        <button type="submit" class="btn btn-sm">Нэмэх</button>
      </form>
    </div>
    ${reflectionsHTML(p)}
  </section>`;
}

function renderDetail(root, goalId, route = parseRoute()) {
  const isLoose = goalId === 'none';
  const goal = isLoose ? null : goalsService.get(goalId);
  if (!isLoose && !goal) {
    root.innerHTML = `<a class="back-link" href="#/goals?tab=goals">${icon('arrowLeft', 16)} Бүх зорилго</a>
      <div class="card" style="margin-top:20px">${emptyState({ icon: 'goals', title: 'Зорилго олдсонгүй', text: 'Устгагдсан байж магадгүй.', actions: '<a class="btn" href="#/goals?tab=goals">Зорилго руу буцах</a>' })}</div>`;
    root.onclick = null;
    return;
  }
  const projects = isLoose
    ? projectsService.all().filter((p) => !p.goal_id || !goalsService.get(p.goal_id))
    : projectsService.byGoal(goal.id);
  const progress = goal ? goalProgress(goal.id) : null;

  root.innerHTML = `
    <a class="back-link" href="#/goals?tab=goals">${icon('arrowLeft', 16)} Бүх зорилго</a>
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
      ${(() => {
    const w = wishesService.get(goal.wish_id);
    return w
      ? `<a class="wish-link-bar" href="#/goals?tab=wishes" style="--wc:${wishCategory(w.category).color}">${icon(wishCategory(w.category).icon, 16)}<span>Энэ зорилго <b>«${esc(w.title)}»</b> хүслийн төлөө</span><span class="faint small">${esc(wishCategory(w.category).label)}</span></a>`
      : `<button type="button" class="wish-link-bar is-empty" data-action="edit-goal">${icon('sparkle', 16)}<span>Энэ зорилгыг аль нэг хүсэлтэйгээ холбох</span>${icon('chevronRight', 14)}</button>`;
  })()}
      <div class="card goal-summary">
        <div class="goal-summary-main"><span class="goal-summary-pct">${progress.pct}%</span>${progressBar(progress.pct)}<span class="small muted">${progress.total} алхмаас ${progress.done} нь дууссан</span></div>
        <div class="goal-summary-stat"><span class="small faint">Зорилт</span><strong>${goal.target_date ? fmt.medium(goal.target_date) : '—'}</strong><span class="small muted">${targetText(goal.target_date, goal.status)}</span></div>
        <div class="goal-summary-stat"><span class="small faint">Төсөл</span><strong>${projects.length}</strong><span class="small muted">${projects.filter((p) => p.status === 'completed').length} дууссан</span></div>
      </div>`
    : pageHead({ eyebrow: 'Төслүүд', title: 'Зорилгогүй төслүүд', sub: 'Төсөл бүрийн цэс → “Төсөл засах” хэсгээс зорилготой холбоно.' })}
    <div class="section-title">${icon('folder', 16)} Төслүүд <span class="faint">${projects.length}</span><span class="spacer"></span>
      <button type="button" class="btn btn-sm" data-action="new-project">${icon('plus', 14)} Төсөл нэмэх</button></div>
    ${projects.length ? PROJECT_KINDS.map((k) => {
    const list = projects.filter((p) => p.kind === k.value);
    return list.length ? `<h3 class="kind-title is-${k.value}">${k.emoji} ${esc(k.label)} төслүүд <span class="faint">${list.length}</span><span class="kind-title-hint small faint">${esc(k.hint)}</span></h3><div class="stack">${list.map(projectCard).join('')}</div>` : '';
  }).join('')
    : `<div class="card">${emptyState({
      icon: 'folder', title: 'Төсөл алга байна', text: goal ? 'Энэ зорилгоо төслүүдэд хуваагаарай: ⚡ жижиг (цүнх авах) эсвэл 🌱 том (эрт унтдаг болох).' : 'Энд зорилгогүй төслүүд харагдана.',
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
      case 'add-reflection': openReflectionForm({ project }); break;
      case 'edit-reflection': {
        const r = reflectionsService.get(el.dataset.id);
        if (r) openReflectionForm({ project: projectsService.get(r.project_id), reflection: r });
        break;
      }
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
              try { await deleteGoal(goal.id); toast('Зорилго устгагдлаа'); navigate('goals?tab=goals'); } catch (err) { toast(err.message, { tone: 'danger' }); }
            },
          },
        ]);
        break;
      case 'project-menu':
        openMenu(el, [
          { label: 'Төсөл засах', icon: 'edit', onSelect: () => openProjectForm(project) },
          project.kind === 'long'
            ? { label: '⚡ Жижиг төсөл болгох', icon: 'zap', onSelect: () => projectsService.update(project.id, { kind: 'quick' }) }
            : { label: '🌱 Том төсөл болгох', icon: 'refresh', onSelect: () => projectsService.update(project.id, { kind: 'long' }) },
          { label: 'Тэмдэглэл бичих', icon: 'edit', onSelect: () => openReflectionForm({ project }) },
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

  // #/goals/<id>?p=<projectId> → тухайн төсөл рүү нэг удаа гүйлгээд тодруулна
  const focusId = route.query?.p;
  if (focusId && root.dataset.focused !== focusId) {
    root.dataset.focused = focusId;
    const card = root.querySelector(`[data-project-id="${CSS.escape(focusId)}"]`);
    if (card) requestAnimationFrame(() => { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); card.classList.add('is-focus'); setTimeout(() => card.classList.remove('is-focus'), 1800); });
  } else if (!focusId) delete root.dataset.focused;
}

export default {
  title: 'Зорилго ба төсөл',
  render(root, route) {
    if (route.params[0]) renderDetail(root, route.params[0], route);
    else renderList(root, route);
  },
};
