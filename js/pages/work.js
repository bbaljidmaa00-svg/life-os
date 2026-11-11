/**
 * Ажил — ээлж/цаг, цалин/орлого, захиалга, төсөл/уулзалт, ойрын зорилго.
 * Табууд: ?tab=shifts (анхдагч) | pay | orders | projects | goals
 * Долоо хоног: ?week=YYYY-MM-DD · сар: ?month=YYYY-MM
 */
import {
  workplacesService, shiftsService, incomeService, ordersService, contactsService, workGoalsService,
  workplaceById, shiftsOn, shiftsBetween, nextShift, shiftState, shiftStart, shiftEnd, shiftMinutes, shiftPay, isOvernight,
  weekRange, monthRange, earnings, expectedMonthlyPay, nextPayday,
  ORDER_STATUSES, ORDER_NEXT, orderStatusLabel, orderBalance, orderDueMoment, isOrderLate, orderDeliveredKey,
  incomeKindLabel, workGoalProgress, metricValue, metricInfo, activeWorkGoals, pastWorkGoals, PACE_LABEL,
  money, moneyShort, hoursLabel, isWorkTask, WORK_CATEGORY, PAY_TYPES,
} from '../services/workService.js';
import {
  openWorkplaceForm, openShiftForm, openIncomeForm, openOrderForm, openContactForm, openWorkGoalForm,
} from '../components/workForms.js';
import { tasksService, sortTasks } from '../services/tasksService.js';
import { eventsService, eventColor } from '../services/eventsService.js';
import { openEventForm } from '../components/forms.js';
import { taskListHTML, handleTaskAction } from '../components/taskItem.js';
import { parseTaskInput } from '../lib/nlp.js';
import { prefs } from '../state/prefs.js';
import { emptyState, pageHead, toast, openMenu, progressBar } from '../lib/ui.js';
import { esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { parseRoute } from '../lib/nav.js';
import {
  todayKey, addDaysKey, fromKey, toKey, relDay, fmt, fmtTime, fmtDuration, WEEKDAYS, isDateKey, diffDays,
} from '../lib/dates.js';

const TABS = [
  { id: 'shifts', label: 'Ээлж, цаг', icon: 'clock' },
  { id: 'pay', label: 'Цалин, орлого', icon: 'wallet' },
  { id: 'orders', label: 'Захиалга', icon: 'bag' },
  { id: 'projects', label: 'Төсөл, уулзалт', icon: 'briefcase' },
  { id: 'goals', label: 'Ойрын зорилго', icon: 'target' },
];
let orderFilter = 'open';

const wpChip = (wp) => (wp
  ? `<span class="subj-chip" style="--subj:${esc(wp.color)}"><i></i>${esc(wp.name)}</span>`
  : '<span class="subj-chip is-none"><i></i>Ажлын газаргүй</span>');
const shiftTime = (s) => `${fmtTime(s.start_time)}–${fmtTime(s.end_time)}${isOvernight(s) ? ' (+1)' : ''}`;
const ymOf = (key) => key.slice(0, 7);
const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return fmt.monthYear(new Date(y, m - 1, 1)); };
const shiftYm = (ym, n) => { const [y, m] = ym.split('-').map(Number); return toKey(new Date(y, m - 1 + n, 1)).slice(0, 7); };

/* ── Дараагийн ээлж ───────────────────────────────────────────────────── */
function shiftWhen(s, now = Date.now()) {
  const state = shiftState(s, now);
  if (state === 'live') return { live: true, text: `Одоо ажиллаж байна · ${fmtDuration(Math.max(1, Math.round((shiftEnd(s) - now) / 60000)))} үлдсэн` };
  const mins = Math.round((shiftStart(s) - now) / 60000);
  return { live: false, text: mins <= 90 ? `${mins} минутын дараа` : `${relDay(s.shift_date)} ${fmtTime(s.start_time)}` };
}

function nextShiftCard() {
  const s = nextShift();
  if (!s) return '';
  const wp = workplaceById(s.workplace_id);
  const when = shiftWhen(s);
  const pay = shiftPay(s);
  return `<section class="card next-class" style="--subj:${esc(wp?.color || 'var(--accent)')}" aria-label="Дараагийн ээлж">
    <div class="nc-when ${when.live ? 'is-live' : ''}">${when.live ? '<span class="live-dot"></span>' : icon('clock', 15)}${esc(when.text)}</div>
    <div class="nc-main">
      <p class="nc-title">${esc(wp?.name || 'Ээлж')}</p>
      <p class="nc-meta"><span>${shiftTime(s)}</span><span class="badge">${hoursLabel(shiftMinutes(s))}</span>${pay ? `<span>≈ ${money(pay)}</span>` : ''}${s.notes ? `<span>${esc(s.notes)}</span>` : ''}</p>
    </div>
    <button type="button" class="btn btn-sm" data-action="edit-shift" data-id="${s.id}">${icon('edit', 14)} Засах</button>
  </section>`;
}

const stat = (label, value, { tone = '', sub = '' } = {}) => `<div class="ws ${tone}"><span class="ws-label">${label}</span><b class="ws-value">${value}</b>${sub ? `<span class="ws-sub">${sub}</span>` : ''}</div>`;

/* ── Ээлж, цаг ────────────────────────────────────────────────────────── */
function shiftsTab(route) {
  if (!workplacesService.all().length) {
    return `<div class="card">${emptyState({
      icon: 'briefcase', title: 'Ажлын газраа нэмье',
      text: 'Ажлын газар, цагийн хөлс эсвэл сарын цалингаа оруулбал ээлж бүрийн цаг, олох мөнгө, цалингийн өдөр автоматаар тооцоологдоно.',
      actions: `<button type="button" class="btn btn-primary" data-action="new-workplace">${icon('plus', 16)} Ажлын газар нэмэх</button>`,
    })}</div>`;
  }
  const anchor = isDateKey(route.query.week) ? route.query.week : todayKey();
  const { from, to } = weekRange(anchor);
  const isThisWeek = from === weekRange().from;
  const e = earnings(from, to);
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(from, i));
  const count = shiftsBetween(from, to).length;

  return `
    <div class="toolbar week-nav">
      <div class="row">
        <a class="icon-btn" href="#/work?tab=shifts&week=${addDaysKey(from, -7)}" aria-label="Өмнөх долоо хоног">${icon('chevronLeft', 18)}</a>
        <h2 class="week-label">${fmt.short(from)} – ${fmt.short(to)}</h2>
        <a class="icon-btn" href="#/work?tab=shifts&week=${addDaysKey(from, 7)}" aria-label="Дараагийн долоо хоног">${icon('chevronRight', 18)}</a>
        ${isThisWeek ? '' : `<a class="btn btn-sm btn-ghost" href="#/work?tab=shifts">Энэ долоо хоног</a>`}
      </div>
    </div>
    <div class="work-stats">
      ${stat('Ажилласан', hoursLabel(e.minutes))}
      ${stat('Төлөвлөсөн', hoursLabel(e.plannedMinutes))}
      ${stat('Ээлжийн цалин', money(e.shiftPay + e.plannedPay), { sub: e.plannedPay ? `${money(e.shiftPay)} нь баталгаажсан` : '' })}
      ${stat('Ээлж', String(count))}
    </div>
    <div class="week-grid">${days.map((k) => {
    const list = shiftsOn(k);
    const d = fromKey(k);
    return `<section class="card day-col ${k === today ? 'is-today' : ''}" aria-label="${fmt.long(k)}">
        <header class="day-head"><span class="day-name">${WEEKDAYS[d.getDay()]} <span class="faint small">${d.getDate()}</span></span>${k === today ? '<span class="badge">Өнөөдөр</span>' : ''}
          <button type="button" class="icon-btn icon-btn-sm" data-action="new-shift" data-date="${k}" aria-label="${fmt.long(k)}-нд ээлж нэмэх" title="Ээлж нэмэх">${icon('plus', 15)}</button></header>
        ${list.length ? `<ul class="class-list">${list.map((s) => {
      const wp = workplaceById(s.workplace_id);
      const st = shiftState(s);
      const pay = shiftPay(s);
      return `<li><button type="button" class="class-item shift-item is-${st}" data-action="edit-shift" data-id="${s.id}" style="--subj:${esc(wp?.color || 'var(--accent)')}">
            <span class="ci-time">${shiftTime(s)}${st === 'live' ? ' · <b class="live-text">Одоо</b>' : ''}</span>
            <span class="ci-name">${esc(wp?.name || 'Ээлж')}</span>
            <span class="ci-meta"><span>${hoursLabel(shiftMinutes(s))}</span>${pay ? `<span>${money(pay)}</span>` : ''}${s.break_minutes ? `<span>завсар ${s.break_minutes} мин</span>` : ''}</span>
          </button></li>`;
    }).join('')}</ul>` : '<p class="small faint day-empty">Чөлөөтэй</p>'}
      </section>`;
  }).join('')}</div>

    <h2 class="section-title">Ажлын газрууд<span class="count">${workplacesService.all().length}</span></h2>
    <div class="card card-list"><ul class="subj-list">${[...workplacesService.all()].sort((a, b) => a.name.localeCompare(b.name, 'mn')).map((w) => {
    const pd = nextPayday(w);
    const payText = w.pay_type === 'hourly' ? (w.hourly_rate ? `Цагийн хөлс ${money(w.hourly_rate)}` : 'Цагийн хөлс тодорхойгүй')
      : w.pay_type === 'fixed' ? (w.monthly_salary ? `Сарын цалин ${money(w.monthly_salary)}` : 'Тогтмол цалин') : 'Цалингүй';
    return `<li><button type="button" class="subj-row" data-action="edit-workplace" data-id="${w.id}" style="--subj:${esc(w.color)}">
        <span class="subj-swatch"></span>
        <span class="subj-info"><span class="subj-name">${esc(w.name)}</span>
          <span class="small muted">${esc(payText)}${pd ? ` · цалин ${esc(relDay(pd.date))}` : ''}</span></span>
        <span class="badge">${esc(PAY_TYPES.find((p) => p.value === w.pay_type)?.label || '')}</span>
      </button></li>`;
  }).join('')}</ul></div>
    <button type="button" class="btn section-btn" data-action="new-workplace">${icon('plus', 16)} Ажлын газар нэмэх</button>`;
}

/* ── Цалин, орлого ────────────────────────────────────────────────────── */
function payTab(route) {
  const ym = /^\d{4}-\d{2}$/.test(route.query.month || '') ? route.query.month : ymOf(todayKey());
  const { from, to } = monthRange(ym);
  const e = earnings(from, to);
  const isThisMonth = ym === ymOf(todayKey());
  const wps = [...workplacesService.all()].sort((a, b) => a.name.localeCompare(b.name, 'mn'));
  const entries = incomeService.all().filter((x) => x.received_date >= from && x.received_date <= to)
    .sort((a, b) => b.received_date.localeCompare(a.received_date));

  const parts = [
    ['Ээлжийн цалин', e.shiftPay, 'var(--pink)'],
    ['Тогтмол цалин', e.salaryPaid, 'var(--sky)'],
    ['Урамшуулал, бусад', e.extras, 'var(--lilac)'],
    ['Борлуулалт', e.sales, 'var(--mint)'],
  ].filter(([, v]) => v > 0);
  const breakdown = e.total > 0 ? `<div class="income-bar" role="img" aria-label="Орлогын задаргаа">${parts.map(([l, v, c]) => `<span style="flex:${v};--c:${c}" title="${esc(l)}: ${money(v)}"></span>`).join('')}</div>
    <ul class="income-legend">${parts.map(([l, v, c]) => `<li><i style="--c:${c}"></i><span>${esc(l)}</span><b>${money(v)}</b></li>`).join('')}</ul>` : '';

  const paydays = wps.map((w) => ({ w, pd: nextPayday(w) })).filter((x) => x.pd).sort((a, b) => a.pd.days - b.pd.days);

  return `
    <div class="toolbar week-nav">
      <div class="row">
        <a class="icon-btn" href="#/work?tab=pay&month=${shiftYm(ym, -1)}" aria-label="Өмнөх сар">${icon('chevronLeft', 18)}</a>
        <h2 class="week-label">${monthLabel(ym)}</h2>
        <a class="icon-btn" href="#/work?tab=pay&month=${shiftYm(ym, 1)}" aria-label="Дараагийн сар">${icon('chevronRight', 18)}</a>
        ${isThisMonth ? '' : '<a class="btn btn-sm btn-ghost" href="#/work?tab=pay">Энэ сар</a>'}
      </div>
      <button type="button" class="btn btn-primary btn-sm" data-action="new-income">${icon('plus', 15)} Орлого бүртгэх</button>
    </div>
    <div class="kpis work-kpis">
      <div class="card kpi"><span class="kpi-label">${icon('wallet', 15)} Олсон орлого</span><span class="kpi-value">${moneyShort(e.total)}</span><span class="kpi-sub">${money(e.total)}</span></div>
      <div class="card kpi"><span class="kpi-label">${icon('clock', 15)} Ажилласан</span><span class="kpi-value">${hoursLabel(e.minutes)}</span><span class="kpi-sub">${e.plannedMinutes ? `+ ${hoursLabel(e.plannedMinutes)} төлөвлөсөн` : 'Дууссан ээлжүүд'}</span></div>
      <div class="card kpi"><span class="kpi-label">${icon('check', 15)} Хүлээн авсан</span><span class="kpi-value">${moneyShort(e.received)}</span><span class="kpi-sub">Бүртгэсэн бүх мөнгө</span></div>
      <div class="card kpi"><span class="kpi-label">${icon('zap', 15)} Хүлээгдэж буй</span><span class="kpi-value">${moneyShort(e.plannedPay)}</span><span class="kpi-sub">Үлдсэн ээлжүүдээс</span></div>
    </div>
    <div class="work-split">
      <section class="card">
        <div class="card-head"><h2 class="card-title">${icon('briefcase', 18)} Ажлын газраар</h2></div>
        <div class="card-body">${wps.length ? `<ul class="wp-pay">${wps.map((w) => {
    const we = earnings(from, to, { workplaceId: w.id });
    const expected = expectedMonthlyPay(w, ym);
    const main = w.pay_type === 'hourly' ? we.shiftPay : w.pay_type === 'fixed' ? we.salaryPaid + we.shiftPay : we.extras;
    return `<li style="--subj:${esc(w.color)}"><span class="subj-swatch"></span>
          <span class="wpp-info"><b>${esc(w.name)}</b><span class="small muted">${hoursLabel(we.minutes)}${w.pay_type === 'hourly' && w.hourly_rate ? ` × ${money(w.hourly_rate)}` : ''}${expected ? ` · сарын тооцоо ${money(expected)}` : ''}</span></span>
          <b class="wpp-amount">${money(main)}</b></li>`;
  }).join('')}</ul>` : emptyState({ compact: true, icon: 'briefcase', title: 'Ажлын газар алга', actions: `<button type="button" class="btn btn-sm" data-action="new-workplace">${icon('plus', 14)} Нэмэх</button>` })}
        ${breakdown}
      </div></section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">${icon('calendar', 18)} Цалингийн өдөр</h2></div>
        <div class="card-body">${paydays.length ? `<ul class="payday-list">${paydays.map(({ w, pd }) => `<li class="${pd.days <= 1 ? 'is-soon' : ''}" style="--subj:${esc(w.color)}">
            <span class="pd-day"><b>${fromKey(pd.date).getDate()}</b><span>${fromKey(pd.date).getMonth() + 1}-р сар</span></span>
            <span class="wpp-info"><b>${esc(w.name)}</b><span class="small muted">${pd.days === 0 ? 'Өнөөдөр!' : pd.days === 1 ? 'Маргааш' : `${pd.days} хоногийн дараа`}</span></span>
          </li>`).join('')}</ul>` : '<p class="small muted">Ажлын газрын тохиргоонд цалингийн өдрөө оруулбал энд тоолж харуулна.</p>'}
      </div></section>
    </div>
    <h2 class="section-title">Орлогын бүртгэл<span class="count">${entries.length}</span></h2>
    ${entries.length ? `<div class="card card-list"><ul class="income-list">${entries.map((x) => {
    const w = workplaceById(x.workplace_id);
    return `<li><button type="button" class="income-row" data-action="edit-income" data-id="${x.id}">
        <span class="ir-date">${esc(relDay(x.received_date))}</span>
        <span class="ir-main"><b>${esc(incomeKindLabel(x.kind))}</b><span class="small muted">${esc(w?.name || 'Бусад эх үүсвэр')}${x.note ? ` · ${esc(x.note)}` : ''}</span></span>
        <b class="ir-amount">${money(x.amount, { sign: true })}</b></button></li>`;
  }).join('')}</ul></div>` : `<div class="card">${emptyState({ compact: true, icon: 'wallet', title: 'Энэ сард бүртгэсэн орлого алга', text: 'Цалин, урамшуулал, tips зэрэг хүлээн авсан мөнгөө тэмдэглээрэй.' })}</div>`}
    <p class="small muted work-note">${icon('info', 14)} Цагийн хөлстэй ажлын цалинг ээлжээс тооцдог тул тэр ажлаас авсан «Цалин»-гийн бүртгэл орлогод давхар нэмэгдэхгүй. Тогтмол цалин, урамшуулал, tips, хүргэсэн захиалга шууд орлогод орно.</p>`;
}

/* ── Захиалга ─────────────────────────────────────────────────────────── */
function orderCard(o) {
  const late = isOrderLate(o);
  const left = orderBalance(o);
  const next = ORDER_NEXT[o.status];
  const due = o.due_date ? `${relDay(o.due_date)}${o.due_time ? ` ${fmtTime(o.due_time)}` : ''}` : 'Огноогүй';
  const soon = !late && o.due_date && orderDueMoment(o) - Date.now() < 86400000;
  return `<li class="order ${late ? 'is-overdue' : ''} st-${o.status}" data-id="${o.id}">
    <button type="button" class="order-main" data-action="edit-order">
      <span class="order-top"><b class="order-cust">${esc(o.customer_name)}</b><span class="order-due ${late ? 'is-late' : soon ? 'is-soon' : ''}">${icon('truck', 13)}${esc(late ? `Хоцорсон · ${due}` : due)}</span></span>
      <span class="order-items">${esc(o.items)}${o.quantity > 1 ? ` <span class="faint">× ${o.quantity}</span>` : ''}</span>
      <span class="order-meta">${o.price ? `<span class="order-price">${money(o.price)}</span>` : ''}${left > 0 && o.status !== 'cancelled' ? `<span class="order-debt">Үлдэгдэл ${money(left)}</span>` : o.price ? '<span class="order-paid">Төлөгдсөн</span>' : ''}${o.delivery ? `<span>${icon('pin', 12)}${esc(o.delivery)}</span>` : ''}${o.customer_contact ? `<span>${icon('phone', 12)}${esc(o.customer_contact)}</span>` : ''}</span>
    </button>
    <div class="order-actions">
      ${next ? `<button type="button" class="btn btn-sm ${o.status === 'ready' ? 'btn-primary' : ''}" data-action="order-next">${esc(next.label)} ${icon('arrowRight', 13)}</button>` : `<span class="hw-status st-${o.status === 'delivered' ? 'done' : 'todo'}">${esc(orderStatusLabel(o.status))}</span>`}
      <button type="button" class="icon-btn icon-btn-sm" data-action="order-menu" aria-label="Бусад үйлдэл" title="Бусад">${icon('more', 16)}</button>
    </div>
  </li>`;
}

function ordersTab() {
  const all = ordersService.all();
  if (!all.length) {
    return `<div class="card">${emptyState({
      icon: 'bag', title: 'Захиалга алга',
      text: 'Дэлгүүр, онлайн бизнесийн захиалга бүрийг захиалагч, үнэ, хүргэх өдөртэй нь тэмдэглэвэл төлөв, үлдэгдэл төлбөр, хүргэлтийн сануулга энд гарна.',
      actions: `<button type="button" class="btn btn-primary" data-action="new-order">${icon('plus', 16)} Захиалга нэмэх</button>`,
    })}</div>`;
  }
  const open = ordersService.open();
  const late = open.filter((o) => isOrderLate(o)).length;
  const dueSoon = ordersService.dueWithin(1).length;
  const debt = all.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + orderBalance(o), 0);
  const { from, to } = monthRange();
  const monthSales = all.filter((o) => o.status === 'delivered' && orderDeliveredKey(o) >= from && orderDeliveredKey(o) <= to).reduce((s, o) => s + o.price, 0);
  const delivered = ordersService.delivered();
  const cancelled = all.filter((o) => o.status === 'cancelled');

  const filter = `<div class="toolbar"><div class="tabs" role="tablist" aria-label="Захиалга шүүх">
      ${[['open', 'Идэвхтэй', open.length], ['delivered', 'Хүргэсэн', delivered.length], ['cancelled', 'Цуцалсан', cancelled.length]].map(([v, l, n]) => `<button type="button" class="tab ${orderFilter === v ? 'is-active' : ''}" data-action="order-filter" data-value="${v}" role="tab" aria-selected="${orderFilter === v}">${l}<span class="count">${n}</span></button>`).join('')}
    </div><button type="button" class="btn btn-primary btn-sm" data-action="new-order">${icon('plus', 15)} Захиалга</button></div>`;

  let body;
  if (orderFilter === 'open') {
    body = open.length ? `<div class="order-board">${['new', 'preparing', 'ready'].map((st) => {
      const list = open.filter((o) => o.status === st);
      return `<section class="card order-col"><h3 class="order-col-title">${esc(orderStatusLabel(st))}<span class="count">${list.length}</span></h3>
        ${list.length ? `<ul class="order-list">${list.map(orderCard).join('')}</ul>` : '<p class="small faint day-empty">Хоосон</p>'}</section>`;
    }).join('')}</div>` : `<div class="card">${emptyState({ compact: true, icon: 'check', title: 'Бүх захиалга хүргэгдсэн', text: 'Шинэ захиалга ирвэл нэмээрэй.' })}</div>`;
  } else {
    const list = orderFilter === 'delivered' ? delivered : cancelled;
    body = list.length ? `<div class="card card-list"><ul class="order-list is-flat">${list.map(orderCard).join('')}</ul></div>` : `<div class="card">${emptyState({ compact: true, icon: 'bag', title: 'Энд захиалга алга' })}</div>`;
  }
  return `<div class="work-stats">
      ${stat('Хүлээгдэж буй', String(open.length))}
      ${stat('Өнөөдөр/маргааш', String(dueSoon), { tone: late ? 'is-alert' : '', sub: late ? `${late} хоцорсон` : '' })}
      ${stat('Төлөгдөөгүй', money(debt), { tone: debt ? 'is-debt' : '' })}
      ${stat('Энэ сарын борлуулалт', money(monthSales))}
    </div>${filter}${body}`;
}

/* ── Төсөл, уулзалт ───────────────────────────────────────────────────── */
function projectsTab() {
  const today = todayKey();
  const work = tasksService.all().filter(isWorkTask);
  const open = sortTasks(work.filter((t) => t.status !== 'done'));
  const doneWeek = work.filter((t) => t.status === 'done' && t.completed_at && diffDays(String(t.completed_at).slice(0, 10), today) <= 7).length;
  const limit = addDaysKey(today, 30);
  const meetings = eventsService.all()
    .filter((e) => e.category === 'work' && e.event_date >= today && e.event_date <= limit)
    .sort((a, b) => `${a.event_date}${a.start_time || ''}`.localeCompare(`${b.event_date}${b.start_time || ''}`));
  const contacts = [...contactsService.all()].sort((a, b) => a.name.localeCompare(b.name, 'mn'));

  return `<div class="work-split">
    <section class="card">
      <div class="card-head"><h2 class="card-title">${icon('tasks', 18)} Ажлын даалгавар</h2><a class="card-link" href="#/tasks">Хийх зүйлс</a></div>
      <div class="card-body flush">
      <form class="inline-add" id="workTaskAdd" autocomplete="off">
        ${icon('plus', 16)}<input class="inline-add-input" id="workTaskInput" placeholder="Даалгавар нэмэх — “Баасан 15 цагт тайлан илгээх чухал”" aria-label="Ажлын даалгавар нэмэх" maxlength="200">
      </form>
      ${open.length ? taskListHTML(open) : '<p class="small muted day-empty">Хийх ажлын даалгавар алга.</p>'}
      <p class="small faint work-note">«${WORK_CATEGORY}» ангилалтай хийх зүйлс энд харагдана${doneWeek ? ` · сүүлийн 7 хоногт ${doneWeek} дуусгасан` : ''}.</p>
    </div></section>
    <div class="dash-col">
      <section class="card">
        <div class="card-head"><h2 class="card-title">${icon('calendar', 18)} Уулзалт</h2><button type="button" class="btn btn-sm" data-action="new-meeting">${icon('plus', 14)} Уулзалт</button></div>
        <div class="card-body flush">${meetings.length ? meetings.map((e) => `<button type="button" class="agenda-row" data-action="edit-meeting" data-id="${e.id}">
            <span class="agenda-time">${e.all_day || !e.start_time ? 'Өдөржин' : fmtTime(e.start_time)}</span>
            <span class="agenda-bar" style="--c:${eventColor(e.category)}"></span>
            <span class="agenda-text"><span class="agenda-name">${esc(e.title)}</span>
              <span class="agenda-sub">${esc(relDay(e.event_date))}${e.location ? ` · ${esc(e.location)}` : ''}</span></span>
          </button>`).join('') : '<p class="small muted day-empty">Ирэх 30 хоногт ажлын уулзалт алга. Календарийн «Ажил» ангилалтай үйл явдлууд энд гарна.</p>'}
      </div></section>
      <section class="card">
        <div class="card-head"><h2 class="card-title">${icon('users', 18)} Хамт ажиллагсад</h2><button type="button" class="btn btn-sm" data-action="new-contact">${icon('plus', 14)} Нэмэх</button></div>
        <div class="card-body">${contacts.length ? `<ul class="contact-list">${contacts.map((c) => {
    const w = workplaceById(c.workplace_id);
    return `<li><button type="button" class="contact-row" data-action="edit-contact" data-id="${c.id}" style="--subj:${esc(w?.color || 'var(--lilac)')}">
            <span class="contact-avatar" aria-hidden="true">${esc((c.name.trim()[0] || '?').toUpperCase())}</span>
            <span class="contact-info"><b>${esc(c.name)}</b><span class="small muted">${[c.role, w?.name].filter(Boolean).map(esc).join(' · ') || 'Хамт ажиллагч'}</span>
              ${c.notes ? `<span class="contact-note">${esc(c.notes)}</span>` : ''}</span>
            ${c.contact ? `<span class="small muted contact-handle">${esc(c.contact)}</span>` : ''}
          </button></li>`;
  }).join('')}</ul>` : '<p class="small muted day-empty">Менежер, хамт олныхоо холбоо барих мэдээлэл, ярилцсан зүйлсээ тэмдэглэ.</p>'}
      </div></section>
    </div>
  </div>`;
}

/* ── Ойрын зорилго ────────────────────────────────────────────────────── */
const GOAL_IDEAS = [
  { title: 'Энэ 7 хоногт 20 цаг ажиллах', metric: 'hours', target: 20, period: 'week' },
  { title: 'Энэ сард 1,000,000₮ олох', metric: 'income', target: 1000000, period: 'month' },
  { title: 'Энэ сард 10 захиалга хүргэх', metric: 'orders', target: 10, period: 'month' },
  { title: 'Портфолиод 3 шинэ ажил нэмэх', metric: 'custom', target: 3, unit: 'ажил', period: 'month' },
];

function goalCard(g) {
  const p = workGoalProgress(g);
  const urgent = (p.pace === 'behind' && p.daysLeft <= 2) || p.pace === 'missed';
  const daysText = g.status === 'done' ? 'Дууссан' : p.daysLeft < 0 ? `${-p.daysLeft} хоногийн өмнө дууссан` : p.daysLeft === 0 ? 'Өнөөдөр дуусна' : `${p.daysLeft} хоног үлдсэн`;
  const wp = workplaceById(g.workplace_id);
  return `<li class="card wgoal pace-${p.pace} ${urgent ? 'is-urgent' : ''}" data-id="${g.id}">
    <div class="wg-top">
      <span class="wg-metric">${icon(g.metric === 'hours' ? 'clock' : g.metric === 'income' ? 'wallet' : g.metric === 'orders' ? 'bag' : 'target', 14)}${esc(metricInfo(g.metric).label)}${wp ? ` · ${esc(wp.name)}` : ''}</span>
      <span class="wg-pace">${esc(PACE_LABEL[p.pace])}</span>
    </div>
    <button type="button" class="wg-title" data-action="edit-goal">${esc(g.title)}</button>
    <div class="wg-numbers"><b>${esc(metricValue(g, p.value))}</b><span>/ ${esc(metricValue(g, g.target))}</span><span class="wg-pct">${p.pct}%</span></div>
    <div class="wg-bar">${progressBar(p.pct)}<span class="wg-time" style="left:${p.timePct}%" title="Хугацааны ${p.timePct}% өнгөрсөн" aria-hidden="true"></span></div>
    <div class="wg-foot">
      <span class="small muted">${esc(daysText)}${!p.reached && p.daysLeft >= 0 && g.status !== 'done' ? ` · ${esc(metricValue(g, p.left))} дутуу` : ''}</span>
      <span class="wg-actions">
        ${g.metric === 'custom' && g.status === 'active' ? `<button type="button" class="icon-btn icon-btn-sm" data-action="goal-dec" aria-label="Явц хасах">${icon('minus', 15)}</button><button type="button" class="icon-btn icon-btn-sm wg-plus" data-action="goal-inc" aria-label="Явц нэмэх">${icon('plus', 15)}</button>` : ''}
        <button type="button" class="icon-btn icon-btn-sm" data-action="goal-menu" aria-label="Бусад үйлдэл">${icon('more', 16)}</button>
      </span>
    </div>
  </li>`;
}

function goalsTab() {
  const active = activeWorkGoals();
  const past = pastWorkGoals();
  const ideas = `<div class="goal-ideas"><span class="small muted">Санаа:</span>${GOAL_IDEAS.map((x, i) => `<button type="button" class="chip-btn" data-action="goal-idea" data-i="${i}">${icon('sparkle', 13)}${esc(x.title)}</button>`).join('')}</div>`;
  return `<div class="toolbar"><p class="small muted">Цаг, орлого, захиалгын зорилго таны ээлж, бүртгэлээс автоматаар тоологдоно. Босоо зураас нь хугацааны хэр хэсэг өнгөрснийг заана.</p>
      <button type="button" class="btn btn-primary btn-sm" data-action="new-goal">${icon('plus', 15)} Зорилго</button></div>
    ${active.length ? `<ul class="wgoal-grid">${active.map(goalCard).join('')}</ul>` : `<div class="card">${emptyState({ icon: 'target', title: 'Ойрын зорилго тавья', text: 'Энэ долоо хоног эсвэл сард хүрэх жижиг, хэмжигдэхүйц зорилго — явцыг нь апп өөрөө тоолно.' })}</div>`}
    ${ideas}
    ${past.length ? `<h2 class="section-title">Өмнөх зорилго<span class="count">${past.length}</span></h2><ul class="wgoal-grid is-past">${past.slice(0, 8).map(goalCard).join('')}</ul>` : ''}`;
}

/* ── Хуудас ───────────────────────────────────────────────────────────── */
export default {
  title: 'Ажил',
  render(root, route = parseRoute()) {
    const tab = TABS.some((t) => t.id === route.query?.tab) ? route.query.tab : 'shifts';
    const week = weekRange();
    const we = earnings(week.from, week.to);
    const openOrders = ordersService.open();
    const late = openOrders.filter((o) => isOrderLate(o)).length;
    const counts = { orders: openOrders.length, goals: activeWorkGoals().length, projects: tasksService.all().filter((t) => isWorkTask(t) && t.status !== 'done').length };
    const eyebrow = [
      `Энэ 7 хоногт ${hoursLabel(we.minutes + we.plannedMinutes)}`,
      openOrders.length ? `${openOrders.length} захиалга` : '',
      late ? `${late} хоцорсон` : '',
    ].filter(Boolean).join(' · ');
    const body = { shifts: shiftsTab, pay: payTab, orders: ordersTab, projects: projectsTab, goals: goalsTab }[tab](route);

    root.innerHTML = `
      ${pageHead({
    eyebrow,
    title: 'Ажил',
    actions: `<button type="button" class="btn" data-action="new-shift">${icon('clock', 16)} Ээлж</button>
          <button type="button" class="btn btn-primary" data-action="add-menu" aria-haspopup="menu">${icon('plus', 16)} Нэмэх</button>`,
  })}
      ${tab === 'shifts' ? nextShiftCard() : ''}
      <nav class="tabs page-tabs" aria-label="Ажлын хэсэг">
        ${TABS.map((t) => `<a class="tab ${tab === t.id ? 'is-active' : ''}" href="#/work?tab=${t.id}" ${tab === t.id ? 'aria-current="page"' : ''}>${icon(t.icon, 15)} ${t.label}${counts[t.id] ? `<span class="count">${counts[t.id]}</span>` : ''}</a>`).join('')}
      </nav>
      <div id="workBody">${body}</div>`;

    // Утсан дээр табууд хажуу тийш гүйдэг — идэвхтэйг нь харагдахаар гүйлгэнэ.
    const tabsNav = root.querySelector('.page-tabs');
    const activeTab = tabsNav?.querySelector('.is-active');
    if (tabsNav && activeTab && tabsNav.scrollWidth > tabsNav.clientWidth) {
      tabsNav.scrollLeft = Math.max(0, activeTab.offsetLeft - tabsNav.offsetLeft - 16);
    }

    root.onsubmit = async (e) => {
      if (e.target.id !== 'workTaskAdd') return;
      e.preventDefault();
      const input = document.getElementById('workTaskInput');
      const p = parseTaskInput(input.value);
      if (!p.title) { input.focus(); return; }
      try {
        await tasksService.create({
          title: p.title, due_date: p.due_date, due_time: p.due_time,
          priority: p.priority || prefs.get().defaultPriority, category: WORK_CATEGORY,
          estimated_minutes: p.estimated_minutes || Number(prefs.get().defaultDuration) || null,
        });
        toast(`“${p.title}” ажлын даалгаварт нэмэгдлээ`);
        requestAnimationFrame(() => document.getElementById('workTaskInput')?.focus());
      } catch (err) { toast(err.message, { tone: 'danger' }); }
    };

    root.onclick = async (e) => {
      if (handleTaskAction(e)) return;
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const orderId = el.closest('.order')?.dataset.id;
      const order = orderId && ordersService.get(orderId);
      const goalId = el.closest('.wgoal')?.dataset.id;
      const goal = goalId && workGoalsService.get(goalId);
      try {
        switch (el.dataset.action) {
          case 'add-menu':
            openMenu(el, [
              { label: 'Ээлж', icon: 'clock', onSelect: () => openShiftForm() },
              { label: 'Орлого', icon: 'wallet', onSelect: () => openIncomeForm() },
              { label: 'Захиалга', icon: 'bag', onSelect: () => openOrderForm() },
              'sep',
              { label: 'Уулзалт', icon: 'calendar', onSelect: () => openEventForm(null, { category: 'work' }) },
              { label: 'Хамт ажиллагч', icon: 'users', onSelect: () => openContactForm() },
              { label: 'Ойрын зорилго', icon: 'target', onSelect: () => openWorkGoalForm() },
              'sep',
              { label: 'Ажлын газар', icon: 'briefcase', onSelect: () => openWorkplaceForm() },
            ]);
            break;
          case 'new-workplace': openWorkplaceForm(); break;
          case 'edit-workplace': openWorkplaceForm(workplacesService.get(el.dataset.id)); break;
          case 'new-shift': openShiftForm(null, el.dataset.date ? { shift_date: el.dataset.date } : {}); break;
          case 'edit-shift': openShiftForm(shiftsService.get(el.dataset.id)); break;
          case 'new-income': openIncomeForm(); break;
          case 'edit-income': openIncomeForm(incomeService.get(el.dataset.id)); break;
          case 'new-order': openOrderForm(); break;
          case 'edit-order': openOrderForm(order); break;
          case 'order-filter': orderFilter = el.dataset.value; this.render(root, route); break;
          case 'order-next': {
            const next = ORDER_NEXT[order.status];
            await ordersService.setStatus(order, next.status);
            toast(`${order.customer_name}: ${orderStatusLabel(next.status)}`, { action: () => ordersService.setStatus(ordersService.get(order.id), order.status) });
            break;
          }
          case 'order-menu':
            openMenu(el, [
              ...ORDER_STATUSES.map((s) => ({
                label: s.label, icon: s.value === order.status ? 'check' : undefined,
                onSelect: () => ordersService.setStatus(order, s.value).catch((err) => toast(err.message, { tone: 'danger' })),
              })),
              'sep',
              ...(orderBalance(order) > 0 ? [{ label: `Бүрэн төлсөн (${money(order.price)})`, icon: 'wallet', onSelect: () => ordersService.markPaid(order).then(() => toast('Төлбөр бүрэн төлөгдлөө')).catch((err) => toast(err.message, { tone: 'danger' })) }] : []),
              { label: 'Засах', icon: 'edit', onSelect: () => openOrderForm(order) },
            ]);
            break;
          case 'new-meeting': openEventForm(null, { category: 'work' }); break;
          case 'edit-meeting': openEventForm(eventsService.get(el.dataset.id)); break;
          case 'new-contact': openContactForm(); break;
          case 'edit-contact': openContactForm(contactsService.get(el.dataset.id)); break;
          case 'new-goal': openWorkGoalForm(); break;
          case 'goal-idea': openWorkGoalForm(null, { ...GOAL_IDEAS[Number(el.dataset.i)] }); break;
          case 'edit-goal': openWorkGoalForm(goal); break;
          case 'goal-inc':
          case 'goal-dec': {
            const step = el.dataset.action === 'goal-inc' ? 1 : -1;
            const value = Math.max(0, (goal.manual_progress || 0) + step);
            await workGoalsService.update(goal.id, { manual_progress: value });
            if (step > 0 && value >= goal.target && (goal.manual_progress || 0) < goal.target) toast(`🎉 “${goal.title}” биеллээ!`);
            break;
          }
          case 'goal-menu':
            openMenu(el, [
              goal.status === 'active'
                ? { label: 'Дууссан гэж тэмдэглэх', icon: 'check', onSelect: () => workGoalsService.update(goal.id, { status: 'done', completed_at: new Date().toISOString() }).catch((err) => toast(err.message, { tone: 'danger' })) }
                : { label: 'Дахин идэвхжүүлэх', icon: 'refresh', onSelect: () => workGoalsService.update(goal.id, { status: 'active', completed_at: null }).catch((err) => toast(err.message, { tone: 'danger' })) },
              { label: 'Засах', icon: 'edit', onSelect: () => openWorkGoalForm(goal) },
            ]);
            break;
          default:
        }
      } catch (err) { toast(err.message, { tone: 'danger' }); }
    };
  },
};

/* ── Нүүр хуудасны «Ажил» карт ─────────────────────────────────────────── */
export function workDashboardCard() {
  const hasData = workplacesService.all().length || ordersService.all().length || workGoalsService.all().length;
  if (!hasData) return '';
  const s = nextShift();
  const week = weekRange();
  const we = earnings(week.from, week.to);
  const orders = ordersService.dueWithin(2).slice(0, 3);
  const goals = activeWorkGoals().slice(0, 2);
  const shiftLine = s ? (() => {
    const wp = workplaceById(s.workplace_id);
    const when = shiftWhen(s);
    return `<a class="dash-next-class" href="#/work" style="--subj:${esc(wp?.color || 'var(--accent)')}">
      <span class="dnc-when ${when.live ? 'is-live' : ''}">${esc(when.text)}</span>
      <span class="dnc-name">${esc(wp?.name || 'Ээлж')}</span>
      <span class="dnc-meta">${shiftTime(s)} · ${hoursLabel(shiftMinutes(s))}</span>
    </a>`;
  })() : '';
  return `<section class="card">
    <div class="card-head"><h2 class="card-title">${icon('briefcase', 18)} Ажил</h2><a class="card-link" href="#/work">Бүгд</a></div>
    <div class="card-body">${shiftLine}
    <p class="dash-work-week"><span>Энэ 7 хоног</span><b>${hoursLabel(we.minutes + we.plannedMinutes)}</b><b>≈ ${money(we.shiftPay + we.plannedPay)}</b></p>
    ${orders.length ? `<ul class="dash-hw">${orders.map((o) => {
    const late = isOrderLate(o);
    return `<li><a href="#/work?tab=orders" class="dash-hw-item">
        <span class="dh-dot" style="--subj:${late ? 'var(--raspberry)' : 'var(--mint)'}"></span>
        <span class="dh-title">${esc(o.customer_name)}<span class="small muted">${esc(o.items)}</span></span>
        <span class="dh-count ${late ? 'is-overdue' : ''}">${esc(late ? 'Хоцорсон' : relDay(o.due_date))}</span></a></li>`;
  }).join('')}</ul>` : ''}
    ${goals.map((g) => {
    const p = workGoalProgress(g);
    return `<a class="goal-mini" href="#/work?tab=goals"><span class="goal-mini-top"><span class="goal-mini-title">${esc(g.title)}</span><span class="goal-mini-pct">${p.pct}%</span></span>${progressBar(p.pct)}</a>`;
  }).join('')}
  </div></section>`;
}
