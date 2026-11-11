/**
 * Calendar — month, week and day views.
 *  • Month: click a date to see its agenda; double-click to add an event.
 *  • Week / Day: click an empty time slot to create an event there.
 * View and date live in the URL: #/calendar?view=week&date=2026-11-02
 */
import { eventsService, eventColor } from '../services/eventsService.js';
import { tasksService, sortTasks } from '../services/tasksService.js';
import { birthdaysService, ageAt } from '../services/birthdaysService.js';
import { taskListHTML, handleTaskAction } from '../components/taskItem.js';
import { openEventForm, openTaskForm, openBirthdayForm } from '../components/forms.js';
import { shiftsService, shiftsOn, workplaceById, shiftMinutes, isOvernight, shiftSpan, hoursLabel, ordersService, isOrderLate } from '../services/workService.js';
import { openShiftForm, openOrderForm } from '../components/workForms.js';
import { emptyState } from '../lib/ui.js';
import { esc, plural } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { navigate, parseRoute } from '../lib/nav.js';
import {
  todayKey, toKey, fromKey, addDays, addDaysKey, startOfWeek, startOfMonth, addMonths,
  fmt, relDay, fmtTime, timeToMin, minToTime, nowMinutes, isDateKey,
} from '../lib/dates.js';

const HOUR = 48; // px per hour in time grids
const VIEWS = ['month', 'week', 'day'];
const VIEW_LABELS = { month: 'Сар', week: 'Долоо хоног', day: 'Өдөр' };
const state = { view: 'month', date: todayKey() };
let lastRouteKey = null;
let gridScroll = null;

const narrow = window.matchMedia('(max-width: 700px)');
narrow.addEventListener?.('change', () => { if (parseRoute().name === 'calendar') window.dispatchEvent(new Event('lifeos:route')); });

function setState(patch, focusDate) {
  Object.assign(state, patch);
  navigate(`calendar?view=${state.view}&date=${state.date}`, { replace: true });
  if (focusDate) document.querySelector(`.cal-cell[data-date="${focusDate}"]`)?.focus();
}

function itemsOn(key) {
  return {
    events: eventsService.on(key), tasks: sortTasks(tasksService.dueOn(key)), birthdays: birthdaysService.onDate(key),
    shifts: shiftsOn(key), orders: ordersService.open().filter((o) => o.due_date === key),
  };
}

const shiftColor = (s) => workplaceById(s.workplace_id)?.color || 'var(--ev-work)';
const shiftLabel = (s) => `${fmtTime(s.start_time)}–${fmtTime(s.end_time)}${isOvernight(s) ? ' (+1)' : ''}`;
function shiftRow(s) {
  const wp = workplaceById(s.workplace_id);
  return `<button type="button" class="agenda-row" data-action="edit-shift" data-id="${s.id}">
    <span class="agenda-time">${fmtTime(s.start_time)}</span>
    <span class="agenda-bar" style="--c:${shiftColor(s)}"></span>
    <span class="agenda-text"><span class="agenda-name">${icon('briefcase', 12)} Ээлж: ${esc(wp?.name || 'Ажил')}</span>
      <span class="agenda-sub">${shiftLabel(s)} · ${hoursLabel(shiftMinutes(s))}</span></span>
  </button>`;
}
function orderRow(o) {
  return `<button type="button" class="agenda-row" data-action="edit-order" data-id="${o.id}">
    <span class="agenda-time">${o.due_time ? fmtTime(o.due_time) : icon('bag', 14)}</span>
    <span class="agenda-bar" style="--c:${isOrderLate(o) ? 'var(--raspberry)' : 'var(--mint)'}"></span>
    <span class="agenda-text"><span class="agenda-name">Захиалга: ${esc(o.customer_name)}</span>
      <span class="agenda-sub">${esc(o.items)}</span></span>
  </button>`;
}

function title() {
  const d = fromKey(state.date);
  if (state.view === 'month') return fmt.monthYear(d);
  if (state.view === 'day') return fmt.long(state.date);
  const start = startOfWeek(d);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${start.getMonth() + 1}-р сарын ${start.getDate()}–${end.getDate()}`
    : `${start.getMonth() + 1}-р сарын ${start.getDate()} – ${end.getMonth() + 1}-р сарын ${end.getDate()}`;
}

function step(direction) {
  const d = fromKey(state.date);
  if (state.view === 'month') {
    const target = addMonths(d, direction);
    const today = new Date();
    const inThisMonth = target.getFullYear() === today.getFullYear() && target.getMonth() === today.getMonth();
    setState({ date: inThisMonth ? todayKey() : toKey(target) });
  } else setState({ date: addDaysKey(state.date, direction * (state.view === 'week' ? 7 : 1)) });
}

/* ───────────── Month ───────────── */
function chip(text, color, extra = '') {
  return `<span class="cal-chip ${extra}" style="--c:${color}"><i></i><span>${text}</span></span>`;
}

function monthView() {
  const today = todayKey();
  const cur = fromKey(state.date);
  const gridStart = startOfWeek(startOfMonth(cur));
  const lastOfMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
  const cells = Math.ceil(((lastOfMonth - gridStart) / 86400000 + 1) / 7) * 7;
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt.weekdayShort(addDays(gridStart, i)));

  const html = Array.from({ length: cells }, (_, i) => {
    const d = addDays(gridStart, i);
    const k = toKey(d);
    const { events, tasks, birthdays, shifts, orders } = itemsOn(k);
    const chips = [
      ...birthdays.map((b) => chip(`${icon('gift', 11)} ${esc(b.name)}`, 'var(--ev-birthday)', 'is-bday')),
      ...shifts.map((s) => chip(`<b>${fmtTime(s.start_time)}</b> ${esc(workplaceById(s.workplace_id)?.name || 'Ээлж')}`, shiftColor(s), 'is-shift')),
      ...orders.map((o) => chip(`${icon('bag', 11)} ${esc(o.customer_name)}`, isOrderLate(o) ? 'var(--raspberry)' : 'var(--mint)', 'is-order')),
      ...events.map((e) => chip(`${e.all_day || !e.start_time ? '' : `<b>${fmtTime(e.start_time)}</b> `}${esc(e.title)}`, eventColor(e.category))),
      ...tasks.map((t) => chip(esc(t.title), 'var(--ev-task)', `is-task ${t.status === 'done' ? 'is-done' : ''}`)),
    ];
    const total = chips.length;
    const dots = [
      ...birthdays.map(() => 'var(--ev-birthday)'), ...shifts.map(shiftColor), ...events.map((e) => eventColor(e.category)), ...tasks.filter((t) => t.status !== 'done').map(() => 'var(--ev-task)'),
    ].slice(0, 4);
    const cls = [
      'cal-cell',
      d.getMonth() !== cur.getMonth() ? 'is-other' : '',
      k === today ? 'is-today' : '',
      k === state.date ? 'is-selected' : '',
    ].join(' ');
    return `<button type="button" class="${cls}" data-action="select" data-date="${k}" aria-pressed="${k === state.date}" aria-label="${fmt.long(k)}${total ? `, ${plural(total, 'зүйл')}` : ''}" tabindex="${k === state.date ? 0 : -1}">
      <span class="cal-num">${d.getDate()}</span>
      <span class="cal-items">${chips.slice(0, 3).join('')}${total > 3 ? `<span class="cal-more">+${total - 3} бусад</span>` : ''}</span>
      <span class="cal-dots">${dots.map((c) => `<i style="--c:${c}"></i>`).join('')}</span>
    </button>`;
  }).join('');

  return `<div class="cal-layout">
    <div class="card cal-month-card">
      <div class="cal-month" role="grid" aria-label="${fmt.monthYear(cur)}">
        ${weekdays.map((w) => `<div class="cal-dow" role="columnheader">${w}</div>`).join('')}
        ${html}
      </div>
    </div>
    ${agendaPanel(state.date, { showOpenDay: true })}
  </div>`;
}

/* ───────────── Agenda side panel ───────────── */
function eventRow(e) {
  return `<button type="button" class="agenda-row" data-action="edit-event" data-id="${e.id}">
    <span class="agenda-time">${e.all_day || !e.start_time ? 'Өдөржин' : fmtTime(e.start_time)}</span>
    <span class="agenda-bar" style="--c:${eventColor(e.category)}"></span>
    <span class="agenda-text"><span class="agenda-name">${esc(e.title)}</span>
      <span class="agenda-sub">${e.end_time && !e.all_day ? `${fmtTime(e.end_time)} хүртэл` : ''}${e.location ? `${e.end_time && !e.all_day ? ' · ' : ''}${icon('pin', 12)}${esc(e.location)}` : ''}</span></span>
  </button>`;
}

function agendaPanel(key, { showOpenDay = false } = {}) {
  const { events, tasks, birthdays, shifts, orders } = itemsOn(key);
  const empty = !events.length && !tasks.length && !birthdays.length && !shifts.length && !orders.length;
  return `<aside class="card cal-agenda" aria-label="Хуваарь: ${fmt.long(key)}">
    <div class="agenda-head">
      <p class="eyebrow">${relDay(key)}</p>
      <h2 class="agenda-title">${fmt.long(key)}</h2>
      <div class="agenda-actions">
        <button type="button" class="btn btn-sm" data-action="new-event" data-date="${key}">${icon('plus', 14)} Үйл явдал</button>
        <button type="button" class="btn btn-sm" data-action="new-task" data-date="${key}">${icon('plus', 14)} Хийх зүйл</button>
        ${showOpenDay ? `<button type="button" class="btn btn-sm btn-ghost" data-action="goto-day" data-date="${key}">Өдрөөр харах ${icon('arrowRight', 14)}</button>` : ''}
      </div>
    </div>
    ${birthdays.length ? `<div class="agenda-section"><p class="agenda-label">Төрсөн өдөр</p>${birthdays.map((b) => `
      <button type="button" class="agenda-row" data-action="edit-birthday" data-id="${b.id}"><span class="agenda-time">${icon('gift', 14)}</span><span class="agenda-bar" style="--c:var(--ev-birthday)"></span>
      <span class="agenda-text"><span class="agenda-name">Төрсөн өдөр: ${esc(b.name)}</span><span class="agenda-sub">${ageAt(b, key) ? `${ageAt(b, key)} нас хүрнэ` : esc(b.relationship)}</span></span></button>`).join('')}</div>` : ''}
    ${shifts.length ? `<div class="agenda-section"><p class="agenda-label">Ажлын ээлж</p>${shifts.map(shiftRow).join('')}</div>` : ''}
    ${events.length ? `<div class="agenda-section"><p class="agenda-label">Үйл явдал</p>${events.map(eventRow).join('')}</div>` : ''}
    ${orders.length ? `<div class="agenda-section"><p class="agenda-label">Хүргэх захиалга</p>${orders.map(orderRow).join('')}</div>` : ''}
    ${tasks.length ? `<div class="agenda-section"><p class="agenda-label">Хийх зүйлс</p>${taskListHTML(tasks, { showDate: false })}</div>` : ''}
    ${empty ? emptyState({ compact: true, icon: 'calendar', title: 'Төлөвлөсөн зүйл алга', text: 'Энэ өдөрт үйл явдал эсвэл ажил нэмээрэй.' }) : ''}
  </aside>`;
}

/* ───────────── Week & day time grid ───────────── */
function layoutEvents(items) {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const columns = [];
    cluster.forEach((ev) => {
      let col = columns.findIndex((end) => end <= ev.s);
      if (col === -1) { col = columns.length; columns.push(ev.e); } else columns[col] = ev.e;
      ev.col = col;
    });
    cluster.forEach((ev) => { ev.cols = columns.length; out.push(ev); });
    cluster = [];
  };
  sorted.forEach((ev) => {
    if (cluster.length && ev.s >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.e);
  });
  if (cluster.length) flush();
  return out;
}

function allDayChips(key) {
  const chips = [
    ...eventsService.on(key).filter((e) => e.all_day || !e.start_time).map((e) => `<button type="button" class="tg-chip" data-action="edit-event" data-id="${e.id}" style="--c:${eventColor(e.category)}">${esc(e.title)}</button>`),
    ...birthdaysService.onDate(key).map((b) => `<button type="button" class="tg-chip" data-action="edit-birthday" data-id="${b.id}" style="--c:var(--ev-birthday)">${icon('gift', 12)}${esc(b.name)}</button>`),
    ...sortTasks(tasksService.dueOn(key)).map((t) => `<button type="button" class="tg-chip is-task ${t.status === 'done' ? 'is-done' : ''}" data-action="edit-task" data-id="${t.id}" style="--c:var(--ev-task)">${icon('tasks', 12)}${esc(t.title)}</button>`),
  ];
  return chips.join('');
}

function timeGrid(keys) {
  const today = todayKey();
  const now = nowMinutes();
  const hours = Array.from({ length: 24 }, (_, h) => `<div class="tg-hour"><span>${h === 0 ? '' : fmtTime(`${String(h).padStart(2, '0')}:00`)}</span></div>`).join('');
  const cols = keys.map((k) => {
    const items = eventsService.on(k).filter((e) => !e.all_day && e.start_time).map((e) => {
      const s = timeToMin(e.start_time);
      let end = e.end_time ? timeToMin(e.end_time) : s + 60;
      if (end <= s) end = s + 30;
      return { ev: e, s, e: end };
    });
    // Ажлын ээлж — шөнө дундаас хойш үргэлжилбэл тухайн өдрийн төгсгөл хүртэл зурна.
    shiftsOn(k).forEach((sh) => {
      const s = timeToMin(sh.start_time);
      items.push({ shift: sh, s, e: Math.min(24 * 60, s + shiftSpan(sh)) });
    });
    const html = layoutEvents(items).map((x) => {
      const top = (x.s / 60) * HOUR;
      const height = Math.max(((x.e - x.s) / 60) * HOUR - 2, 22);
      const width = 100 / x.cols;
      if (x.shift) {
        const wp = workplaceById(x.shift.workplace_id);
        return `<button type="button" class="tg-event tg-shift ${height < 40 ? 'is-short' : ''}" data-action="edit-shift" data-id="${x.shift.id}"
        style="top:${top}px;height:${height}px;left:calc(${x.col * width}% + 2px);width:calc(${width}% - 4px);--c:${shiftColor(x.shift)}">
        <span class="tg-ev-title">${icon('briefcase', 11)} ${esc(wp?.name || 'Ээлж')}</span><span class="tg-ev-time">${shiftLabel(x.shift)}</span></button>`;
      }
      return `<button type="button" class="tg-event ${height < 40 ? 'is-short' : ''}" data-action="edit-event" data-id="${x.ev.id}"
        style="top:${top}px;height:${height}px;left:calc(${x.col * width}% + 2px);width:calc(${width}% - 4px);--c:${eventColor(x.ev.category)}">
        <span class="tg-ev-title">${esc(x.ev.title)}</span><span class="tg-ev-time">${fmtTime(x.ev.start_time)}${x.ev.end_time ? ` – ${fmtTime(x.ev.end_time)}` : ''}</span></button>`;
    }).join('');
    const nowLine = k === today ? `<div class="tg-now" style="top:${(now / 60) * HOUR}px" aria-hidden="true"></div>` : '';
    return `<div class="tg-col ${k === today ? 'is-today' : ''}" data-action="slot" data-date="${k}" title="Хоосон хэсэг дээр дарж үйл явдал нэмнэ">${html}${nowLine}</div>`;
  }).join('');

  const heads = keys.length > 1 ? `<div class="tg-row tg-headrow"><div class="tg-gutter"></div>${keys.map((k) => {
    const d = fromKey(k);
    return `<button type="button" class="tg-dayhead ${k === today ? 'is-today' : ''}" data-action="goto-day" data-date="${k}" aria-label="Нээх: ${fmt.long(k)}"><span>${fmt.weekdayShort(d)}</span><b>${d.getDate()}</b></button>`;
  }).join('')}</div>` : '';

  return `<div class="tg" style="--cols:${keys.length};--hour:${HOUR}px">
    ${heads}
    <div class="tg-row tg-allday"><div class="tg-gutter tg-gutter-label">Өдөржин</div>${keys.map((k) => `<div class="tg-allday-cell">${allDayChips(k)}</div>`).join('')}</div>
    <div class="tg-scroll" id="tgScroll"><div class="tg-row tg-grid" style="height:${24 * HOUR}px"><div class="tg-gutter tg-hours">${hours}</div>${cols}</div></div>
  </div>`;
}

function weekKeys() {
  const start = startOfWeek(fromKey(state.date));
  return Array.from({ length: 7 }, (_, i) => toKey(addDays(start, i)));
}

function weekView() {
  const keys = weekKeys();
  if (narrow.matches) {
    // Phones: a readable agenda list instead of 7 narrow columns.
    const today = todayKey();
    return `<div class="week-list">${keys.map((k) => {
      const { events, tasks, birthdays, shifts, orders } = itemsOn(k);
      const d = fromKey(k);
      const count = events.length + tasks.length + birthdays.length + shifts.length + orders.length;
      return `<section class="card wl-day ${k === today ? 'is-today' : ''}">
        <div class="wl-head">
          <button type="button" class="wl-date" data-action="goto-day" data-date="${k}"><span>${fmt.weekdayShort(d)}</span><b>${d.getDate()}</b></button>
          <span class="small faint">${count ? plural(count, 'зүйл') : 'Чөлөөтэй'}</span>
          <span class="spacer"></span>
          <button type="button" class="icon-btn icon-btn-sm" data-action="new-event" data-date="${k}" aria-label="Үйл явдал нэмэх: ${fmt.long(k)}">${icon('plus', 16)}</button>
        </div>
        ${birthdays.map((b) => `<button type="button" class="agenda-row" data-action="edit-birthday" data-id="${b.id}"><span class="agenda-time">${icon('gift', 14)}</span><span class="agenda-bar" style="--c:var(--ev-birthday)"></span><span class="agenda-text"><span class="agenda-name">Төрсөн өдөр: ${esc(b.name)}</span></span></button>`).join('')}
        ${shifts.map(shiftRow).join('')}
        ${events.map(eventRow).join('')}
        ${orders.map(orderRow).join('')}
        ${tasks.length ? taskListHTML(tasks, { showDate: false }) : ''}
      </section>`;
    }).join('')}</div>`;
  }
  return `<div class="card tg-card">${timeGrid(keys)}</div>`;
}

function dayView() {
  return `<div class="cal-layout cal-day">
    <div class="card tg-card">${timeGrid([state.date])}</div>
    ${agendaPanel(state.date)}
  </div>`;
}

/* ───────────── Page ───────────── */
export default {
  title: 'Календарь',
  render(root, route) {
    if (route.key !== lastRouteKey) {
      lastRouteKey = route.key;
      if (VIEWS.includes(route.query.view)) state.view = route.query.view;
      if (isDateKey(route.query.date)) state.date = route.query.date;
    }

    const body = state.view === 'month' ? monthView() : state.view === 'week' ? weekView() : dayView();
    root.innerHTML = `
      <header class="page-head cal-head">
        <div class="page-head-text"><p class="eyebrow">Календарь · ${fromKey(state.date).getFullYear()}</p><h1 class="page-title">${esc(title())}</h1></div>
        <div class="page-actions cal-controls">
          <div class="btn-group">
            <button type="button" class="icon-btn" data-action="prev" aria-label="Өмнөх">${icon('chevronLeft')}</button>
            <button type="button" class="btn btn-sm" data-action="today">Өнөөдөр</button>
            <button type="button" class="icon-btn" data-action="next" aria-label="Дараах">${icon('chevronRight')}</button>
          </div>
          <div class="seg" role="group" aria-label="Харагдац">${VIEWS.map((v) => `<button type="button" class="seg-btn ${v === state.view ? 'is-active' : ''}" data-action="view" data-view="${v}" aria-pressed="${v === state.view}">${VIEW_LABELS[v]}</button>`).join('')}</div>
          <button type="button" class="btn btn-primary" data-action="new-event" data-date="${state.date}">${icon('plus', 16)}<span>Үйл явдал</span></button>
        </div>
      </header>
      <div class="cal-body">${body}</div>`;

    // Keep the time grid's scroll position; start at 7 AM the first time.
    const scroller = root.querySelector('#tgScroll');
    if (scroller) {
      scroller.scrollTop = gridScroll ?? HOUR * 7 - 10;
      scroller.addEventListener('scroll', () => { gridScroll = scroller.scrollTop; }, { passive: true });
    }

    root.onclick = (e) => {
      if (handleTaskAction(e)) return;
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const date = el.dataset.date || state.date;
      switch (el.dataset.action) {
        case 'prev': step(-1); break;
        case 'next': step(1); break;
        case 'today': setState({ date: todayKey() }); break;
        case 'view': setState({ view: el.dataset.view }); break;
        case 'select': setState({ date }, date); break;
        case 'goto-day': setState({ view: 'day', date }); break;
        case 'new-event': openEventForm(null, { event_date: date }); break;
        case 'new-task': openTaskForm(null, { due_date: date }); break;
        case 'edit-event': openEventForm(eventsService.get(el.dataset.id)); break;
        case 'edit-task': openTaskForm(tasksService.get(el.dataset.id)); break;
        case 'edit-birthday': openBirthdayForm(birthdaysService.get(el.dataset.id)); break;
        case 'edit-shift': openShiftForm(shiftsService.get(el.dataset.id)); break;
        case 'edit-order': openOrderForm(ordersService.get(el.dataset.id)); break;
        case 'slot': {
          const rect = el.getBoundingClientRect();
          const minutes = Math.max(0, Math.min(23 * 60 + 30, Math.floor(((e.clientY - rect.top) / HOUR) * 2) * 30));
          openEventForm(null, { event_date: date, start_time: minToTime(minutes), end_time: minToTime(minutes + 60) });
          break;
        }
        default:
      }
    };

    root.ondblclick = (e) => {
      const cell = e.target.closest('.cal-cell');
      if (cell) openEventForm(null, { event_date: cell.dataset.date });
    };

    // Arrow keys move the selected day in month view; Enter opens the day.
    root.onkeydown = (e) => {
      const cell = e.target.closest?.('.cal-cell');
      if (!cell) return;
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (moves[e.key]) {
        e.preventDefault();
        const next = addDaysKey(cell.dataset.date, moves[e.key]);
        setState({ date: next }, next);
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        setState({ view: 'day', date: cell.dataset.date });
      }
    };
  },
};
