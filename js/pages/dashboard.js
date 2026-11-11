/**
 * Dashboard — today at a glance: progress, today's tasks, priorities,
 * upcoming events & birthdays, goal progress, mood check-in, last 7 days.
 */
import { store } from '../state/store.js';
import { tasksService, sortTasks } from '../services/tasksService.js';
import { eventsService, eventColor } from '../services/eventsService.js';
import { goalsService, goalProgress } from '../services/goalsService.js';
import { journalService, MOODS, moodLabel } from '../services/journalService.js';
import { birthdaysService, ageAt } from '../services/birthdaysService.js';
import { loadSampleData } from '../services/sampleData.js';
import { taskListHTML, handleTaskAction } from '../components/taskItem.js';
import { openTaskForm, openEventForm, openGoalForm, openJournalForm, openBirthdayForm } from '../components/forms.js';
import { parseTaskInput, parseNatural, cleanEventTitle } from '../lib/nlp.js';
import { computeStats } from '../lib/insights.js';
import { emptyState, progressBar, toast } from '../lib/ui.js';
import { esc, truncate, plural } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { todayKey, addDaysKey, fmt, relDay, fmtTime, fmtDuration, greeting, fromKey } from '../lib/dates.js';
import { prefs } from '../state/prefs.js';
import { PRIORITIES } from '../services/tasksService.js';
import { schoolDashboardCard } from './school.js';

/* ── Нүүрний том бичих талбар ───────────────────────────────────────────────
   Бичих явцад өгүүлбэрийг задлаад (огноо, цаг, ач холбогдол…) урьдчилан
   харуулна. Enter дарахад цагийн муж байвал үйл явдал, үгүй бол ажил болж
   нэмэгдэнэ — самбар тэр даруй шинэчлэгдэнэ. */
const EXAMPLES = [
  'Маргааш 10 цагт эмч дээр очих',
  'Баасан гарагт 15 цагт тайлан илгээх чухал #ажил 1 цаг',
  '12:30-13:30 Маятай үдийн хоол',
  'Орой 7 цагт 30 мин гүйх #эрүүл',
  'Ирэх даваа ээж рүү залгах',
];
let placeholderTimer = null;
let lastAddedId = null;
let justAdded = null; // { label, when } — нэмсний дараа талбарын доор хэдэн секунд харуулна
let justAddedTimer = null;

function parseComposer(text) {
  const n = parseNatural(text);
  if (n.time && n.endTime) {
    return { kind: 'event', title: cleanEventTitle(n.rest), date: n.date || todayKey(), time: n.time, endTime: n.endTime, category: n.category };
  }
  const t = parseTaskInput(text);
  return { kind: 'task', title: t.title, date: t.due_date || todayKey(), time: t.due_time, priority: t.priority, category: t.category, minutes: t.estimated_minutes };
}

function composerPreview(text) {
  if (!text.trim() && justAdded) {
    return `<span class="cp-done">${icon('check', 14)} ${esc(justAdded.label)}</span><span class="cp-when">${esc(justAdded.when)}</span><span class="cp-hint">Дараагийнхаа бичээрэй</span>`;
  }
  if (!text.trim()) {
    return `<span class="cp-hint">Жишээ:</span>${EXAMPLES.slice(0, 3).map((ex) => `<button type="button" class="cp-example" data-action="example" data-text="${esc(ex)}">${esc(ex)}</button>`).join('')}`;
  }
  const p = parseComposer(text);
  const chips = [`<span class="cp-kind is-${p.kind}">${icon(p.kind === 'event' ? 'calendar' : 'tasks', 13)}${p.kind === 'event' ? 'Үйл явдал' : 'Ажил'}</span>`];
  chips.push(`<span class="cp-title">${esc(p.title || '…')}</span>`);
  chips.push(`<span class="parse-chip">${icon('calendar', 13)}${esc(relDay(p.date))}</span>`);
  if (p.time) chips.push(`<span class="parse-chip">${icon('clock', 13)}${fmtTime(p.time)}${p.endTime ? `–${fmtTime(p.endTime)}` : ''}</span>`);
  if (p.priority) chips.push(`<span class="parse-chip">${icon('flag', 13)}${esc(PRIORITIES.find((x) => x.value === p.priority)?.label || '')}</span>`);
  if (p.category) chips.push(`<span class="parse-chip">#${esc(p.category)}</span>`);
  if (p.minutes) chips.push(`<span class="parse-chip">${fmtDuration(p.minutes)}</span>`);
  return chips.join('');
}

/** «Өдрийн мэнд» → «Өдрийн <strong>мэнд</strong>» — нимгэн + тод үсгийн хослол. */
function heroGreeting(name) {
  return `${greeting()}${name ? `, ${name}` : ''}`;
}

function composerHTML() {
  return `<form class="composer" id="dashQuickAdd" autocomplete="off">
      <span class="composer-icon" aria-hidden="true">${icon('sparkle', 20)}</span>
      <input id="dashQuickInput" class="composer-input" placeholder="${esc(EXAMPLES[0])}" aria-label="Юу хийх вэ? Ажил эсвэл үйл явдлаа бичнэ үү" aria-describedby="dashPreview" maxlength="200" enterkeyhint="done">
      <button type="submit" class="composer-send" aria-label="Нэмэх">${icon('arrowRight', 20)}</button>
    </form>
    <div class="composer-preview" id="dashPreview" aria-live="polite">${composerPreview('')}</div>`;
}

function startPlaceholderCycle() {
  clearInterval(placeholderTimer);
  let i = 0;
  placeholderTimer = setInterval(() => {
    const input = document.getElementById('dashQuickInput');
    if (!input) { clearInterval(placeholderTimer); return; }
    if (input.value || document.activeElement === input) return;
    i = (i + 1) % EXAMPLES.length;
    input.setAttribute('placeholder', EXAMPLES[i]);
  }, 3200);
}

function isEverythingEmpty() {
  return !tasksService.all().length && !eventsService.all().length && !goalsService.all().length
    && !journalService.all().length && !birthdaysService.all().length;
}

function welcome() {
  const session = store.meta().mode === 'session';
  return `<section class="card welcome">
    <div class="welcome-text">
      <p class="eyebrow">Эхлэл</p>
      <h2 class="welcome-title">Ирэх долоо хоногоо тайван удирдах төв.</h2>
      <p class="muted">Бодолд байгаа бүхнээ — ажил, үйл явдал, зорилгоо — нэмээрэй. Энэ хуудас өнөөдрийн төлөвлөгөө, тэргүүлэх ажил, ахицаар дүүрнэ.</p>
      <div class="welcome-actions">
        <button type="button" class="btn btn-primary" data-action="new-task">${icon('plus', 16)} Эхний ажлаа нэмэх</button>
        <button type="button" class="btn" data-action="new-event">${icon('calendar', 16)} Үйл явдал нэмэх</button>
        <button type="button" class="btn" data-action="new-goal">${icon('goals', 16)} Зорилго тавих</button>
      </div>
      ${session ? `<p class="welcome-sample small muted">Зүгээр туршиж үзэх үү? <button type="button" class="link-btn" data-action="sample">Жишээ өгөгдөл ачаалах</button> — дахин ачаалахад устна.</p>` : ''}
    </div>
    <ol class="welcome-steps">
      <li><span>1</span><div><strong>Бичиж авах</strong><p>Ажлаа энгийнээр бич: “Баасан гарагт 15 цагт шүдний эмч рүү залгах чухал”.</p></div></li>
      <li><span>2</span><div><strong>Төлөвлөх</strong><p>Үйл явдлаа календарьт оруулж, Туслахаар өдрийн төлөвлөгөө гаргуул.</p></div></li>
      <li><span>3</span><div><strong>Эргэцүүлэх</strong><p>Өдрөө сэтгэл санаа болон богино тэмдэглэлээр өндөрлө.</p></div></li>
    </ol>
  </section>`;
}

function kpis({ todays, todayDone, plannedMin, overdue, avgGoal, activeGoals }) {
  const pct = todays.length ? Math.round((todayDone / todays.length) * 100) : 0;
  return `<div class="kpis">
    <a class="card kpi" href="#/tasks?due=today">
      <span class="kpi-label">${icon('tasks', 15)} Өнөөдөр</span>
      <span class="kpi-value">${todayDone}<small>/ ${todays.length}</small></span>
      ${progressBar(pct)}
      <span class="kpi-sub">${todays.length ? `${pct}% дууссан` : 'Өнөөдөр дуусах ажил алга'}</span>
    </a>
    <a class="card kpi" href="#/assistant?prompt=${encodeURIComponent('Өдрөө төлөвлө')}&send=1">
      <span class="kpi-label">${icon('clock', 15)} Төлөвлөсөн ажил</span>
      <span class="kpi-value">${plannedMin ? fmtDuration(plannedMin) : '—'}</span>
      <span class="kpi-sub">Өнөөдөр үлдсэн тооцоот хугацаа</span>
    </a>
    <a class="card kpi ${overdue ? 'is-alert' : ''}" href="#/tasks?due=overdue">
      <span class="kpi-label">${icon('alert', 15)} Хугацаа хэтэрсэн</span>
      <span class="kpi-value">${overdue}</span>
      <span class="kpi-sub">${overdue ? 'Шинэ огноо өгөх эсвэл дуусгах' : 'Бүгд хугацаандаа'}</span>
    </a>
    <a class="card kpi" href="#/goals">
      <span class="kpi-label">${icon('goals', 15)} Зорилго</span>
      <span class="kpi-value">${avgGoal === null ? '—' : `${avgGoal}%`}</span>
      ${avgGoal === null ? '' : progressBar(avgGoal)}
      <span class="kpi-sub">${activeGoals ? `${activeGoals} идэвхтэй зорилгын дундаж` : 'Идэвхтэй зорилго алга'}</span>
    </a>
  </div>`;
}

function todayCard(todays, overdueTasks) {
  const list = sortTasks(todays);
  let body;
  if (list.length) body = taskListHTML(list, { showDate: false });
  else if (overdueTasks.length) {
    body = emptyState({ compact: true, icon: 'alert', title: 'Өнөөдөр дуусах ажил алга', text: `Гэхдээ ${overdueTasks.length} ажлын хугацаа хэтэрсэн байна.`, actions: '<a class="btn btn-sm" href="#/tasks?due=overdue">Хоцорсныг харах</a>' });
  } else body = emptyState({ compact: true, icon: 'tasks', title: 'Өнөөдөр дуусах ажил алга', text: 'Дээрх талбарт бичээд Enter дарахад энд гарна.' });

  return `<section class="card">
    <div class="card-head"><h2 class="card-title">${icon('tasks')} Өнөөдрийн ажлууд</h2><a class="card-link" href="#/tasks?due=today">Бүх ажил ${icon('chevronRight', 14)}</a></div>
    <div class="card-body flush">${body}</div>
  </section>`;
}

function prioritiesCard() {
  const weekEnd = addDaysKey(todayKey(), 6);
  const list = sortTasks(tasksService.open().filter((t) => t.priority === 'high' && (!t.due_date || t.due_date <= weekEnd))).slice(0, 5);
  return `<section class="card">
    <div class="card-head"><h2 class="card-title">${icon('flag')} Тэргүүлэх ажлууд</h2><a class="card-link" href="#/tasks?priority=high">Бүгдийг харах ${icon('chevronRight', 14)}</a></div>
    <div class="card-body flush">${list.length
    ? taskListHTML(list)
    : emptyState({ compact: true, icon: 'flag', title: 'Энэ долоо хоногт өндөр ач холбогдолтой ажил алга', text: 'Ажлыг “Өндөр” ач холбогдолтой болговол энд харагдана.' })}</div>
  </section>`;
}

function upcomingCard() {
  const today = todayKey();
  const items = [];
  eventsService.between(today, addDaysKey(today, 6)).forEach((e) => items.push({
    date: e.event_date, time: e.all_day || !e.start_time ? '' : e.start_time,
    html: `<button type="button" class="up-item" data-action="edit-event" data-id="${e.id}">
      <span class="up-bar" style="--c:${eventColor(e.category)}"></span>
      <span class="up-text"><span class="up-title">${esc(e.title)}</span><span class="up-sub">${e.all_day || !e.start_time ? 'Өдөржин' : `${fmtTime(e.start_time)}${e.end_time ? ` – ${fmtTime(e.end_time)}` : ''}`}${e.location ? ` · ${esc(e.location)}` : ''}</span></span></button>`,
  }));
  birthdaysService.upcoming(13).forEach((b) => items.push({
    date: b.next, time: '',
    html: `<button type="button" class="up-item" data-action="edit-birthday" data-id="${b.id}">
      <span class="up-bar" style="--c:var(--ev-birthday)"></span>
      <span class="up-text"><span class="up-title">Төрсөн өдөр: ${esc(b.name)}</span><span class="up-sub">${ageAt(b, b.next) ? `${ageAt(b, b.next)} нас хүрнэ` : 'Төрсөн өдөр'}</span></span></button>`,
  }));
  items.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const byDay = items.reduce((acc, it) => { (acc[it.date] ||= []).push(it); return acc; }, {});
  const days = Object.keys(byDay).slice(0, 5);

  return `<section class="card">
    <div class="card-head"><h2 class="card-title">${icon('calendar')} Удахгүй</h2><a class="card-link" href="#/calendar?view=week&date=${today}">Календарь ${icon('chevronRight', 14)}</a></div>
    <div class="card-body">${days.length ? days.map((k) => `
      <div class="up-day"><p class="up-date">${relDay(k)}<span>${fmt.short(k)}</span></p>${byDay[k].map((i) => i.html).join('')}</div>`).join('')
    : emptyState({ compact: true, icon: 'calendar', title: 'Чөлөөтэй долоо хоног', text: 'Ирэх 7 хоногт үйл явдал, төрсөн өдөр алга.', actions: `<button type="button" class="btn btn-sm" data-action="new-event">${icon('plus', 14)} Үйл явдал нэмэх</button>` })}
    </div>
  </section>`;
}

function goalsCard() {
  const goals = goalsService.all().filter((g) => g.status === 'active').slice(0, 4);
  return `<section class="card">
    <div class="card-head"><h2 class="card-title">${icon('goals')} Зорилгын ахиц</h2><a class="card-link" href="#/goals">Зорилго ${icon('chevronRight', 14)}</a></div>
    <div class="card-body">${goals.length ? `<div class="goal-mini-list">${goals.map((g) => {
    const p = goalProgress(g.id);
    return `<a class="goal-mini" href="#/goals/${g.id}"><span class="goal-mini-top"><span class="goal-mini-title">${esc(g.title)}</span><span class="goal-mini-pct">${p.pct}%</span></span>${progressBar(p.pct)}<span class="small faint">${p.total ? `${p.total} ажлаас ${p.done} нь дууссан` : 'Ажил алга'}${g.target_date ? ` · зорилт ${fmt.short(g.target_date)}` : ''}</span></a>`;
  }).join('')}</div>`
    : emptyState({ compact: true, icon: 'goals', title: 'Идэвхтэй зорилго алга', text: 'Зорилго нь чухал зүйлийн эргэн тойронд төсөл, ажлуудыг нэгтгэнэ.', actions: `<button type="button" class="btn btn-sm" data-action="new-goal">${icon('plus', 14)} Шинэ зорилго</button>` })}</div>
  </section>`;
}

function moodCard() {
  const entry = journalService.byDate(todayKey());
  if (entry) {
    return `<section class="card">
      <div class="card-head"><h2 class="card-title">${icon('journal')} Өнөөдрийн эргэцүүлэл</h2><button type="button" class="card-link" data-action="journal">Засах</button></div>
      <div class="card-body">
        <p class="mood-line"><span class="dot" style="--c:var(--mood-${entry.mood || 3})"></span>${esc(moodLabel(entry.mood))}${entry.title ? ` · <strong>${esc(entry.title)}</strong>` : ''}</p>
        ${entry.reflection ? `<p class="muted small clamp-3">${esc(entry.reflection)}</p>` : ''}
      </div>
    </section>`;
  }
  return `<section class="card">
    <div class="card-head"><h2 class="card-title">${icon('journal')} Өнөөдөр ямар байна?</h2></div>
    <div class="card-body">
      <div class="mood-quick" role="group" aria-label="Өнөөдрийн тэмдэглэлээ эхлүүлэх сэтгэл санаагаа сонго">${MOODS.map((m) => `
        <button type="button" class="mood-quick-btn" data-action="mood" data-mood="${m.value}" style="--c:var(--mood-${m.value})"><span class="mood-dot"></span><span>${m.label}</span></button>`).join('')}
      </div>
      <p class="small faint mood-hint">Сэтгэл санаагаа сонгоод өнөөдрийн тэмдэглэлээ эхлүүлээрэй.</p>
    </div>
  </section>`;
}

function weekCard() {
  const stats = computeStats(7);
  const max = Math.max(1, ...stats.perDay.map((d) => d.count));
  return `<section class="card">
    <div class="card-head"><h2 class="card-title">${icon('analytics')} Сүүлийн 7 хоног</h2><a class="card-link" href="#/analytics">Шинжилгээ ${icon('chevronRight', 14)}</a></div>
    <div class="card-body">
      <div class="mini-bars" role="img" aria-label="Сүүлийн 7 хоногт өдөр бүр дуусгасан ажил">${stats.perDay.map((d) => `
        <div class="mini-bar ${d.date === todayKey() ? 'is-today' : ''}" title="${fmt.medium(d.date)}: ${d.count} ажил">
          <span class="mini-bar-val">${d.count || ''}</span>
          <span class="mini-bar-fill" style="height:${Math.max(4, Math.round((d.count / max) * 64))}px"></span>
          <span class="mini-bar-label">${fmt.weekdayNarrow(fromKey(d.date))}</span>
        </div>`).join('')}
      </div>
      <p class="small muted">${stats.completedCount} ажил дууссан · ${fmtDuration(stats.focusMinutes)} тооцоот ажил</p>
    </div>
  </section>`;
}

export default {
  title: 'Хянах самбар',
  render(root) {
    const today = todayKey();
    const todays = tasksService.dueOn(today);
    const todayDone = todays.filter((t) => t.status === 'done').length;
    const plannedMin = todays.filter((t) => t.status !== 'done').reduce((s, t) => s + (t.estimated_minutes || 0), 0);
    const overdueTasks = tasksService.overdue();
    const activeGoals = goalsService.all().filter((g) => g.status === 'active');
    const avgGoal = activeGoals.length ? Math.round(activeGoals.reduce((s, g) => s + goalProgress(g.id).pct, 0) / activeGoals.length) : null;
    const name = store.meta().user?.user_metadata?.full_name?.split(' ')[0];

    const eventsToday = eventsService.on(today).length;
    const left = todays.length - todayDone;
    const pct = todays.length ? Math.round((todayDone / todays.length) * 100) : 0;
    const summary = isEverythingEmpty() ? 'Өдрөө цэгцлэхэд бэлэн үү?'
      : left || eventsToday ? `Өнөөдөр ${left} ажил, ${eventsToday} үйл явдал хүлээж байна.`
        : 'Өнөөдрийн бүх ажил дууссан. Амраарай.';

    root.innerHTML = `
      <header class="hero">
        <span class="sky-bubble b1" aria-hidden="true"></span><span class="sky-bubble b2" aria-hidden="true"></span><span class="sky-bubble b3" aria-hidden="true"></span>
        <span class="sparkle s1" aria-hidden="true">✦</span><span class="sparkle s2" aria-hidden="true">✦</span><span class="sparkle s3" aria-hidden="true">✧</span>
        <div class="hero-text">
          <p class="eyebrow">${fmt.long(today)}</p>
          <h1 class="page-title hero-title" data-text="${esc(heroGreeting(name))}">${esc(heroGreeting(name))}</h1>
          <p class="hero-sub">${summary}</p>
          ${composerHTML()}
          <div class="hero-actions">
            <a class="btn btn-sm btn-glass" href="#/assistant?prompt=${encodeURIComponent('Өдрөө төлөвлө')}&send=1">${icon('assistant', 15)} Өдрөө төлөвлөх</a>
            <button type="button" class="btn btn-sm btn-glass" data-action="new-task">${icon('edit', 15)} Дэлгэрэнгүй нэмэх</button>
            <button type="button" class="btn btn-sm btn-glass" data-action="new-event">${icon('calendar', 15)} Үйл явдал</button>
          </div>
        </div>
        ${todays.length ? `<a class="hero-ring" href="#/tasks?due=today" aria-label="Өнөөдөр ${todays.length}-аас ${todayDone} ажил дууссан">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle class="ring-track" cx="60" cy="60" r="50" />
            ${pct ? `<circle class="ring-fill" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="${pct} 100" />` : ''}
          </svg>
          <span class="ring-center"><span class="ring-num">${todayDone}<small>/${todays.length}</small></span><span class="ring-label">өнөөдөр</span></span>
        </a>` : ''}
      </header>
      ${isEverythingEmpty() ? welcome() : `
        ${kpis({ todays, todayDone, plannedMin, overdue: overdueTasks.length, avgGoal, activeGoals: activeGoals.length })}
        <div class="dash-grid">
          <div class="dash-col">${todayCard(todays, overdueTasks)}${prioritiesCard()}${weekCard()}</div>
          <div class="dash-col">${schoolDashboardCard()}${upcomingCard()}${moodCard()}${goalsCard()}</div>
        </div>`}`;

    startPlaceholderCycle();
    if (lastAddedId) {
      root.querySelectorAll(`[data-task-id="${lastAddedId}"], [data-id="${lastAddedId}"]`).forEach((el) => el.classList.add('is-new'));
      lastAddedId = null;
    }

    root.oninput = (e) => {
      if (e.target.id === 'dashQuickInput') document.getElementById('dashPreview').innerHTML = composerPreview(e.target.value);
    };

    root.onclick = (e) => {
      if (handleTaskAction(e)) return;
      const el = e.target.closest('[data-action]');
      if (!el) return;
      switch (el.dataset.action) {
        case 'new-task': openTaskForm(); break;
        case 'example': {
          const input = document.getElementById('dashQuickInput');
          input.value = el.dataset.text;
          document.getElementById('dashPreview').innerHTML = composerPreview(input.value);
          input.focus();
          break;
        }
        case 'new-event': openEventForm(); break;
        case 'new-goal': openGoalForm(); break;
        case 'edit-event': openEventForm(eventsService.get(el.dataset.id)); break;
        case 'edit-birthday': openBirthdayForm(birthdaysService.get(el.dataset.id)); break;
        case 'journal': openJournalForm(journalService.byDate(todayKey())); break;
        case 'mood': openJournalForm(null, { entry_date: todayKey(), mood: Number(el.dataset.mood) }); break;
        case 'sample':
          el.disabled = true;
          loadSampleData().then(() => toast('Жишээ өгөгдөл ачаалагдлаа')).catch((err) => toast(err.message, { tone: 'danger' }));
          break;
        default:
      }
    };

    root.onsubmit = async (e) => {
      if (e.target.id !== 'dashQuickAdd') return;
      e.preventDefault();
      const input = e.target.querySelector('input');
      const p = parseComposer(input.value);
      if (!p.title) { input.focus(); e.target.classList.remove('is-shake'); void e.target.offsetWidth; e.target.classList.add('is-shake'); return; }
      try {
        let created;
        if (p.kind === 'event') {
          created = await eventsService.create({ title: p.title, event_date: p.date, start_time: p.time, end_time: p.endTime, all_day: false, category: 'other' });
        } else {
          created = await tasksService.create({
            title: p.title,
            due_date: p.date,
            due_time: p.time,
            priority: p.priority || prefs.get().defaultPriority,
            category: p.category || '',
            estimated_minutes: p.minutes || Number(prefs.get().defaultDuration) || null,
          });
        }
        lastAddedId = created?.id || null;
        const when = `${relDay(p.date)}${p.time ? ` ${fmtTime(p.time)}` : ''}`;
        toast(`${p.kind === 'event' ? 'Үйл явдал' : 'Ажил'} нэмэгдлээ: “${p.title}” · ${when}`);
        justAdded = { label: `“${p.title}” нэмэгдлээ`, when };
        clearTimeout(justAddedTimer);
        justAddedTimer = setTimeout(() => {
          justAdded = null;
          const prev = document.getElementById('dashPreview');
          const inp = document.getElementById('dashQuickInput');
          if (prev && inp && !inp.value) prev.innerHTML = composerPreview('');
        }, 5000);
        requestAnimationFrame(() => {
          const fresh = document.getElementById('dashQuickInput');
          if (fresh) { fresh.value = ''; fresh.focus(); document.getElementById('dashPreview').innerHTML = composerPreview(''); }
        });
      } catch (err) { toast(err.message, { tone: 'danger' }); }
    };
  },
};
