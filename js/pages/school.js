/**
 * Сургууль — гэрийн даалгавар, хичээлийн хуваарь, хичээлүүд.
 * Табууд: ?tab=homework (анхдагч) | schedule | subjects
 */
import {
  subjectsService, classSessionsService, homeworkService,
  subjectById, classesOn, nextClass, dueCountdown, dueMoment, isFinished,
  kindLabel, statusLabel, HOMEWORK_STATUSES,
} from '../services/schoolService.js';
import { openSubjectForm, openClassSessionForm, openHomeworkForm, WEEKDAY_ORDER } from '../components/schoolForms.js';
import { emptyState, pageHead, toast, openMenu } from '../lib/ui.js';
import { esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { parseRoute } from '../lib/nav.js';
import { todayKey, addDaysKey, relDay, fmtTime, fmtDuration, WEEKDAYS } from '../lib/dates.js';

let hwFilter = 'open';

const subjectChip = (subject) => (subject
  ? `<span class="subj-chip" style="--subj:${esc(subject.color)}"><i></i>${esc(subject.name)}</span>`
  : '<span class="subj-chip is-none"><i></i>Хичээлгүй</span>');

const timeRange = (s) => `${fmtTime(s.start_time)}${s.end_time ? `–${fmtTime(s.end_time)}` : ''}`;

/* ── Дараагийн хичээл ──────────────────────────────────────────────────── */
function nextClassCard() {
  const n = nextClass();
  if (!n) return '';
  const { session: s, subject, date, ongoing, minutesUntil } = n;
  let when;
  if (ongoing) when = 'Одоо явагдаж байна';
  else if (minutesUntil !== null && minutesUntil <= 90) when = `${minutesUntil} минутын дараа`;
  else when = `${relDay(date)} ${fmtTime(s.start_time)}`;
  return `<section class="card next-class" style="--subj:${esc(subject?.color || 'var(--accent)')}" aria-label="Дараагийн хичээл">
    <div class="nc-when ${ongoing ? 'is-live' : ''}">${ongoing ? '<span class="live-dot"></span>' : icon('clock', 15)}${esc(when)}</div>
    <div class="nc-main">
      <p class="nc-title">${esc(subject?.name || 'Хичээл')}</p>
      <p class="nc-meta"><span>${timeRange(s)}</span><span class="badge">${esc(kindLabel(s.kind))}</span>${s.room ? `<span class="nc-room">${icon('pin', 14)}${esc(s.room)}</span>` : ''}${subject?.teacher ? `<span>${esc(subject.teacher)}</span>` : ''}</p>
    </div>
  </section>`;
}

/* ── Гэрийн даалгавар ──────────────────────────────────────────────────── */
function homeworkRow(h) {
  const subject = subjectById(h.subject_id);
  const finished = isFinished(h);
  const ms = dueMoment(h) - Date.now();
  const tone = finished ? '' : ms < 0 ? 'is-overdue' : ms < 86400000 ? 'is-soon' : '';
  const start = h.start_date ? `${relDay(h.start_date)}${h.start_time ? ` ${fmtTime(h.start_time)}` : ''}` : '';
  const due = h.due_date ? `${relDay(h.due_date)}${h.due_time ? ` ${fmtTime(h.due_time)}` : ''}` : 'Хугацаагүй';
  return `<li class="hw ${finished ? 'is-done' : ''} ${tone}" data-id="${h.id}">
    <button type="button" class="task-check" data-action="toggle" aria-label="${finished ? 'Дуусаагүй болгох' : 'Дууссан гэж тэмдэглэх'}: ${esc(h.title)}" aria-pressed="${finished}">${icon('check', 14)}</button>
    <button type="button" class="hw-main" data-action="edit">
      <span class="hw-top">${subjectChip(subject)}<span class="hw-status st-${h.status}">${esc(statusLabel(h.status))}</span></span>
      <span class="hw-title">${esc(h.title)}</span>
      <span class="hw-meta">
        ${start ? `<span>${icon('play', 12)}Эхлэх: ${esc(start)}</span>` : ''}
        <span>${icon('flag', 12)}Дуусгах: ${esc(due)}</span>
        ${h.estimated_minutes ? `<span>${icon('clock', 12)}${fmtDuration(h.estimated_minutes)}</span>` : ''}
      </span>
    </button>
    ${finished ? '' : `<span class="hw-count">${esc(dueCountdown(h))}</span>`}
    <button type="button" class="icon-btn icon-btn-sm" data-action="status" aria-label="Төлөв солих" title="Төлөв солих">${icon('more', 16)}</button>
  </li>`;
}

function homeworkGroups(list) {
  const today = todayKey();
  const tomorrow = addDaysKey(today, 1);
  const week = addDaysKey(today, 7);
  const groups = [
    ['Хугацаа хэтэрсэн', (h) => dueMoment(h) < Date.now()],
    ['Өнөөдөр', (h) => h.due_date === today],
    ['Маргааш', (h) => h.due_date === tomorrow],
    ['Ирэх 7 хоногт', (h) => h.due_date && h.due_date <= week],
    ['Дараа', (h) => Boolean(h.due_date)],
    ['Хугацаагүй', () => true],
  ];
  const left = [...list];
  return groups.map(([label, test]) => {
    const items = left.filter(test);
    items.forEach((h) => left.splice(left.indexOf(h), 1));
    return items.length ? `<h2 class="section-title">${label}<span class="count">${items.length}</span></h2>
      <div class="card card-list"><ul class="hw-list">${items.map(homeworkRow).join('')}</ul></div>` : '';
  }).join('');
}

function homeworkTab() {
  const open = homeworkService.open();
  const done = homeworkService.finished();
  const list = hwFilter === 'open' ? open : done;
  const filterBar = `<div class="toolbar"><div class="tabs" role="tablist" aria-label="Даалгавар шүүх">
      <button type="button" class="tab ${hwFilter === 'open' ? 'is-active' : ''}" data-action="hw-filter" data-value="open" role="tab" aria-selected="${hwFilter === 'open'}">Хийх<span class="count">${open.length}</span></button>
      <button type="button" class="tab ${hwFilter === 'done' ? 'is-active' : ''}" data-action="hw-filter" data-value="done" role="tab" aria-selected="${hwFilter === 'done'}">Дууссан<span class="count">${done.length}</span></button>
    </div></div>`;
  if (!homeworkService.all().length) {
    return `<div class="card">${emptyState({
      icon: 'book', title: 'Гэрийн даалгавар алга',
      text: 'Даалгавар бүрийг хичээл, эхлэх ба дуусгах цагтай нь тэмдэглэвэл хугацаа ойртоход энд, нүүр хуудсанд, мэдэгдэлд гарна.',
      actions: `<button type="button" class="btn btn-primary" data-action="new-hw">${icon('plus', 16)} Даалгавар нэмэх</button>`,
    })}</div>`;
  }
  if (!list.length) {
    return `${filterBar}<div class="card">${emptyState({ icon: 'check', title: hwFilter === 'open' ? 'Бүх даалгавар дууссан' : 'Дууссан даалгавар алга', text: hwFilter === 'open' ? 'Гайхалтай! Шинэ даалгавар ирвэл нэмээрэй.' : '' })}</div>`;
  }
  return `${filterBar}${hwFilter === 'open' ? homeworkGroups(list) : `<div class="card card-list"><ul class="hw-list">${list.map(homeworkRow).join('')}</ul></div>`}`;
}

/* ── Хичээлийн хуваарь ─────────────────────────────────────────────────── */
function scheduleTab() {
  if (!subjectsService.all().length) {
    return `<div class="card">${emptyState({
      icon: 'school', title: 'Хичээлийн хуваариа оруулъя',
      text: 'Эхлээд хичээлүүдээ нэмээд, дараа нь гараг, цаг, ангийг нь тэмдэглэнэ. Дараагийн хичээл нүүр хуудсанд харагдана.',
      actions: `<button type="button" class="btn btn-primary" data-action="new-subject">${icon('plus', 16)} Хичээл нэмэх</button>`,
    })}</div>`;
  }
  const todayWd = new Date().getDay();
  // Энэ долоо хоногийн тухайн гарагийн огноо (Даваагаас эхэлсэн)
  const today = todayKey();
  const offsetFromMonday = (todayWd + 6) % 7;
  const monday = addDaysKey(today, -offsetFromMonday);
  return `<div class="week-grid">${WEEKDAY_ORDER.map((wd, i) => {
    const date = addDaysKey(monday, i);
    const sessions = classesOn(date);
    return `<section class="card day-col ${wd === todayWd ? 'is-today' : ''}" aria-label="${WEEKDAYS[wd]}">
      <header class="day-head"><span class="day-name">${WEEKDAYS[wd]}</span>${wd === todayWd ? '<span class="badge">Өнөөдөр</span>' : ''}
        <button type="button" class="icon-btn icon-btn-sm" data-action="new-session" data-weekday="${wd}" aria-label="${WEEKDAYS[wd]} гарагт цаг нэмэх" title="Цаг нэмэх">${icon('plus', 15)}</button></header>
      ${sessions.length ? `<ul class="class-list">${sessions.map((s) => {
    const subject = subjectById(s.subject_id);
    return `<li><button type="button" class="class-item" data-action="edit-session" data-id="${s.id}" style="--subj:${esc(subject?.color || 'var(--accent)')}">
          <span class="ci-time">${timeRange(s)}</span>
          <span class="ci-name">${esc(subject?.name || 'Хичээл')}</span>
          <span class="ci-meta"><span>${esc(kindLabel(s.kind))}</span>${s.room ? `<span>${icon('pin', 12)}${esc(s.room)}</span>` : ''}</span>
        </button></li>`;
  }).join('')}</ul>` : '<p class="small faint day-empty">Хичээлгүй</p>'}
    </section>`;
  }).join('')}</div>`;
}

/* ── Хичээлүүд ─────────────────────────────────────────────────────────── */
function subjectsTab() {
  const list = [...subjectsService.all()].sort((a, b) => a.name.localeCompare(b.name, 'mn'));
  if (!list.length) return scheduleTab();
  return `<div class="card card-list"><ul class="subj-list">${list.map((s) => {
    const sessions = classSessionsService.all().filter((x) => x.subject_id === s.id);
    const openHw = homeworkService.open().filter((h) => h.subject_id === s.id).length;
    const days = [...new Set(sessions.map((x) => x.weekday))].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b)).map((d) => WEEKDAYS[d]).join(', ');
    return `<li><button type="button" class="subj-row" data-action="edit-subject" data-id="${s.id}" style="--subj:${esc(s.color)}">
      <span class="subj-swatch"></span>
      <span class="subj-info"><span class="subj-name">${esc(s.name)}</span>
        <span class="small muted">${[s.teacher, sessions.length ? `7 хоногт ${sessions.length} цаг${days ? ` · ${days}` : ''}` : 'Хуваарьгүй'].filter(Boolean).map(esc).join(' · ')}</span></span>
      ${openHw ? `<span class="badge">${openHw} даалгавар</span>` : ''}
    </button></li>`;
  }).join('')}</ul></div>
  <button type="button" class="btn" data-action="new-subject">${icon('plus', 16)} Хичээл нэмэх</button>`;
}

export default {
  title: 'Сургууль',
  render(root, route = parseRoute()) {
    const tab = ['homework', 'schedule', 'subjects'].includes(route.query?.tab) ? route.query.tab : 'homework';
    const open = homeworkService.open();
    const overdue = homeworkService.overdue().length;
    const todayClasses = classesOn(todayKey()).length;
    const eyebrow = [open.length ? `${open.length} даалгавар хийх` : 'Даалгавар алга', overdue ? `${overdue} хэтэрсэн` : '', `өнөөдөр ${todayClasses} хичээл`].filter(Boolean).join(' · ');

    root.innerHTML = `
      ${pageHead({
    eyebrow,
    title: 'Сургууль',
    actions: `<button type="button" class="btn" data-action="new-session">${icon('school', 16)} Хуваарьт цаг</button>
          <button type="button" class="btn btn-primary" data-action="new-hw">${icon('plus', 16)} Даалгавар</button>`,
  })}
      ${nextClassCard()}
      <nav class="tabs page-tabs" aria-label="Сургуулийн хэсэг">
        <a class="tab ${tab === 'homework' ? 'is-active' : ''}" href="#/school?tab=homework" ${tab === 'homework' ? 'aria-current="page"' : ''}>${icon('book', 15)} Гэрийн даалгавар<span class="count">${open.length}</span></a>
        <a class="tab ${tab === 'schedule' ? 'is-active' : ''}" href="#/school?tab=schedule" ${tab === 'schedule' ? 'aria-current="page"' : ''}>${icon('calendar', 15)} Хуваарь</a>
        <a class="tab ${tab === 'subjects' ? 'is-active' : ''}" href="#/school?tab=subjects" ${tab === 'subjects' ? 'aria-current="page"' : ''}>${icon('school', 15)} Хичээлүүд<span class="count">${subjectsService.all().length}</span></a>
      </nav>
      <div id="schoolBody">${tab === 'schedule' ? scheduleTab() : tab === 'subjects' ? subjectsTab() : homeworkTab()}</div>`;

    root.onclick = async (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const hwId = el.closest('.hw')?.dataset.id;
      const hw = hwId && homeworkService.get(hwId);
      try {
        switch (el.dataset.action) {
          case 'new-hw': openHomeworkForm(); break;
          case 'new-subject': openSubjectForm(); break;
          case 'new-session': openClassSessionForm(null, el.dataset.weekday ? { weekday: Number(el.dataset.weekday) } : {}); break;
          case 'edit-session': openClassSessionForm(classSessionsService.get(el.dataset.id)); break;
          case 'edit-subject': openSubjectForm(subjectsService.get(el.dataset.id)); break;
          case 'edit': openHomeworkForm(hw); break;
          case 'hw-filter': hwFilter = el.dataset.value; this.render(root, route); break;
          case 'toggle': {
            const next = isFinished(hw) ? 'todo' : 'done';
            await homeworkService.setStatus(hw, next);
            if (next === 'done') toast(`“${hw.title}” дууслаа`, { action: () => homeworkService.setStatus(homeworkService.get(hw.id), hw.status) });
            break;
          }
          case 'status':
            openMenu(el, HOMEWORK_STATUSES.map((s) => ({
              label: s.label, icon: s.value === hw.status ? 'check' : undefined,
              onSelect: () => homeworkService.setStatus(hw, s.value).catch((err) => toast(err.message, { tone: 'danger' })),
            })));
            break;
          default:
        }
      } catch (err) { toast(err.message, { tone: 'danger' }); }
    };
  },
};

/** Нүүр хуудасны «Сургууль» карт. */
export function schoolDashboardCard() {
  const n = nextClass();
  const soon = homeworkService.dueWithin(3).slice(0, 4);
  if (!n && !soon.length && !subjectsService.all().length && !homeworkService.all().length) return '';
  const nextLine = n ? (() => {
    const { session: s, subject, date, ongoing, minutesUntil } = n;
    const when = ongoing ? 'Одоо' : minutesUntil !== null && minutesUntil <= 90 ? `${minutesUntil} мин дараа` : `${relDay(date)} ${fmtTime(s.start_time)}`;
    return `<a class="dash-next-class" href="#/school?tab=schedule" style="--subj:${esc(subject?.color || 'var(--accent)')}">
      <span class="dnc-when ${ongoing ? 'is-live' : ''}">${esc(when)}</span>
      <span class="dnc-name">${esc(subject?.name || 'Хичээл')}</span>
      <span class="dnc-meta">${timeRange(s)}${s.room ? ` · ${esc(s.room)}` : ''}</span>
    </a>`;
  })() : '';
  return `<section class="card">
    <div class="card-head"><h2 class="card-title">${icon('school', 18)} Сургууль</h2><a class="card-link" href="#/school">Бүгд</a></div>
    <div class="card-body">${nextLine}
    ${soon.length ? `<ul class="dash-hw">${soon.map((h) => {
    const subject = subjectById(h.subject_id);
    const overdue = dueMoment(h) < Date.now();
    return `<li><a href="#/school" class="dash-hw-item">
        <span class="dh-dot" style="--subj:${esc(subject?.color || 'var(--text-3)')}"></span>
        <span class="dh-title">${esc(h.title)}<span class="small muted">${esc(subject?.name || '')}</span></span>
        <span class="dh-count ${overdue ? 'is-overdue' : ''}">${esc(dueCountdown(h))}</span></a></li>`;
  }).join('')}</ul>` : '<p class="small muted dash-hw-empty">Ойрын 3 хоногт дуусах гэрийн даалгавар алга.</p>'}
  </div></section>`;
}

