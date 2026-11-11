/**
 * Ажил — ажлын газар, ээлж, орлого, захиалга, хамт ажиллагсад, ойрын зорилго.
 * Хүснэгтүүд: TABLES.workplaces, workShifts, income, orders, workContacts, workGoals
 *
 * Ажлын даалгавар нь энгийн «Хийх зүйлс» (ангилал «Ажил»), уулзалт нь
 * календарийн үйл явдал (ангилал «work») — давхар систем үүсгэхгүй.
 *
 * Орлогын дүрэм (давхар тоолохгүйн тулд):
 *  • Цагийн хөлстэй ажил → ээлжээс тооцно (цаг × хөлс + нэмэгдэл).
 *    Тэр ажлаас авсан «Цалин / Урьдчилгаа» бүртгэл нь уг мөнгөний төлөлт тул нийтэд нэмэгдэхгүй.
 *  • Тогтмол цалинтай эсвэл ажлын газаргүй → хүлээн авсан «Цалин / Урьдчилгаа» орлогод орно.
 *  • Урамшуулал, tips, борлуулалт, бусад орлого → үргэлж орно.
 *  • Хүргэсэн захиалгын үнэ → борлуулалтын орлогод орно.
 */
import { TABLES } from '../config.js';
import { createService } from './createService.js';
import { todayKey, addDaysKey, diffDays, fromKey, toKey, timeToMin, startOfWeek, keyOfTimestamp } from '../lib/dates.js';

export const WORK_COLORS = ['#E8508F', '#2E8FD0', '#F0A21E', '#18A58F', '#8A6CF0', '#F07C3E', '#C8105A', '#5B6B8A'];

export const PAY_TYPES = [
  { value: 'hourly', label: 'Цагийн хөлс' },
  { value: 'fixed', label: 'Тогтмол цалин' },
  { value: 'none', label: 'Цалингүй' },
];
export const INCOME_KINDS = [
  { value: 'salary', label: 'Цалин' },
  { value: 'advance', label: 'Урьдчилгаа' },
  { value: 'bonus', label: 'Урамшуулал' },
  { value: 'tips', label: 'Tips / цайны мөнгө' },
  { value: 'sale', label: 'Борлуулалт' },
  { value: 'other', label: 'Бусад' },
];
export const incomeKindLabel = (k) => INCOME_KINDS.find((x) => x.value === k)?.label || 'Орлого';

export const ORDER_STATUSES = [
  { value: 'new', label: 'Шинэ' },
  { value: 'preparing', label: 'Бэлтгэж байна' },
  { value: 'ready', label: 'Бэлэн' },
  { value: 'delivered', label: 'Хүргэсэн' },
  { value: 'cancelled', label: 'Цуцалсан' },
];
export const orderStatusLabel = (s) => ORDER_STATUSES.find((x) => x.value === s)?.label || 'Шинэ';
/** Дараагийн алхмын товч: шинэ → бэлтгэх → бэлэн → хүргэсэн */
export const ORDER_NEXT = {
  new: { status: 'preparing', label: 'Бэлтгэж эхлэх' },
  preparing: { status: 'ready', label: 'Бэлэн боллоо' },
  ready: { status: 'delivered', label: 'Хүргэсэн' },
};
export const isOrderOpen = (o) => o.status !== 'delivered' && o.status !== 'cancelled';

export const GOAL_METRICS = [
  { value: 'hours', label: 'Ажлын цаг', unit: 'цаг' },
  { value: 'income', label: 'Орлого', unit: '₮' },
  { value: 'orders', label: 'Хүргэсэн захиалга', unit: 'захиалга' },
  { value: 'custom', label: 'Өөрөө тоолох', unit: '' },
];
export const metricInfo = (m) => GOAL_METRICS.find((x) => x.value === m) || GOAL_METRICS[3];

const hhmm = (t) => (t ? String(t).slice(0, 5) : null);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const dateOnly = (v) => (v ? String(v).slice(0, 10) : null);

/** 1250000 → "1,250,000₮" (бүхэл төгрөг). */
export function money(n, { sign = false } = {}) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}${s}₮`;
}
/** 1250000 → "1.25 сая₮", 85000 → "85 мянга₮" — жижиг хавтанд. */
export function moneyShort(n) {
  const v = Math.round(Number(n) || 0);
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(Math.abs(v) >= 1e7 ? 0 : 2).replace(/\.?0+$/, '')} сая₮`;
  if (Math.abs(v) >= 1e4) return `${Math.round(v / 1000)} мянга₮`;
  return money(v);
}
/** 510 мин → "8.5 цаг" */
export const hoursLabel = (min) => `${Math.round((min / 60) * 10) / 10} цаг`;

/* ── Сервисүүд ───────────────────────────────────────────────────────────── */
export const workplacesService = createService({
  key: 'workplaces',
  tableName: TABLES.workplaces,
  columns: ['id', 'name', 'color', 'pay_type', 'hourly_rate', 'monthly_salary', 'payday', 'payday_2', 'notes', 'is_active', 'created_at'],
  normalize: (row) => ({
    ...row,
    name: row.name || '',
    color: row.color || WORK_COLORS[0],
    pay_type: row.pay_type || 'hourly',
    hourly_rate: num(row.hourly_rate),
    monthly_salary: num(row.monthly_salary),
    payday: num(row.payday),
    payday_2: num(row.payday_2),
    notes: row.notes || '',
    is_active: row.is_active !== false,
  }),
});

export const shiftsService = createService({
  key: 'workShifts',
  tableName: TABLES.workShifts,
  columns: ['id', 'workplace_id', 'shift_date', 'start_time', 'end_time', 'break_minutes', 'hourly_rate', 'extra_pay', 'notes', 'created_at'],
  normalize: (row) => ({
    ...row,
    shift_date: dateOnly(row.shift_date),
    start_time: hhmm(row.start_time),
    end_time: hhmm(row.end_time),
    break_minutes: Number(row.break_minutes) || 0,
    hourly_rate: num(row.hourly_rate),
    extra_pay: Number(row.extra_pay) || 0,
    notes: row.notes || '',
  }),
});

export const incomeService = createService({
  key: 'income',
  tableName: TABLES.income,
  columns: ['id', 'workplace_id', 'amount', 'received_date', 'kind', 'note', 'created_at'],
  normalize: (row) => ({
    ...row,
    workplace_id: row.workplace_id || null,
    amount: Number(row.amount) || 0,
    received_date: dateOnly(row.received_date),
    kind: row.kind || 'salary',
    note: row.note || '',
  }),
});

const ordersBase = createService({
  key: 'orders',
  tableName: TABLES.orders,
  columns: ['id', 'customer_name', 'customer_contact', 'items', 'quantity', 'price', 'paid_amount', 'status', 'due_date', 'due_time', 'delivery', 'notes', 'delivered_at', 'created_at'],
  normalize: (row) => ({
    ...row,
    customer_name: row.customer_name || '',
    customer_contact: row.customer_contact || '',
    items: row.items || '',
    quantity: Number(row.quantity) || 1,
    price: Number(row.price) || 0,
    paid_amount: Number(row.paid_amount) || 0,
    status: row.status || 'new',
    due_date: dateOnly(row.due_date),
    due_time: hhmm(row.due_time),
    delivery: row.delivery || '',
    notes: row.notes || '',
  }),
});

export const contactsService = createService({
  key: 'workContacts',
  tableName: TABLES.workContacts,
  columns: ['id', 'workplace_id', 'name', 'role', 'contact', 'notes', 'created_at'],
  normalize: (row) => ({ ...row, workplace_id: row.workplace_id || null, name: row.name || '', role: row.role || '', contact: row.contact || '', notes: row.notes || '' }),
});

export const workGoalsService = createService({
  key: 'workGoals',
  tableName: TABLES.workGoals,
  columns: ['id', 'title', 'metric', 'target', 'manual_progress', 'unit', 'workplace_id', 'start_date', 'end_date', 'status', 'completed_at', 'created_at'],
  normalize: (row) => ({
    ...row,
    title: row.title || '',
    metric: row.metric || 'custom',
    target: Number(row.target) || 1,
    manual_progress: Number(row.manual_progress) || 0,
    unit: row.unit || '',
    workplace_id: row.workplace_id || null,
    start_date: dateOnly(row.start_date),
    end_date: dateOnly(row.end_date),
    status: row.status || 'active',
  }),
});

export const workplaceById = (id) => (id ? workplacesService.get(id) : null);

/* ── Ээлж ────────────────────────────────────────────────────────────────── */
/** Ээлжийн нийт минут (завсарлагагүй). end ≤ start бол шөнө дундаас хойш дуусна. */
export function shiftSpan(s) {
  const start = timeToMin(s.start_time) ?? 0;
  const end = timeToMin(s.end_time) ?? start;
  return end > start ? end - start : end + 1440 - start;
}
/** Ажилласан минут = үргэлжлэх хугацаа − завсарлага. */
export const shiftMinutes = (s) => Math.max(0, shiftSpan(s) - (s.break_minutes || 0));
export const isOvernight = (s) => (timeToMin(s.end_time) ?? 0) <= (timeToMin(s.start_time) ?? 0);

export function shiftStart(s) {
  const d = fromKey(s.shift_date);
  const m = timeToMin(s.start_time) ?? 0;
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d;
}
export const shiftEnd = (s) => new Date(shiftStart(s).getTime() + shiftSpan(s) * 60000);

/** 'upcoming' | 'live' | 'done' */
export function shiftState(s, now = Date.now()) {
  if (shiftEnd(s).getTime() <= now) return 'done';
  if (shiftStart(s).getTime() <= now) return 'live';
  return 'upcoming';
}

/** Энэ ээлжийн цагийн хөлс (цагийн хөлстэй ажилд). */
export function shiftRate(s) {
  const wp = workplaceById(s.workplace_id);
  if (!wp || wp.pay_type !== 'hourly') return 0;
  return s.hourly_rate ?? wp.hourly_rate ?? 0;
}
/** Ээлжээс олох мөнгө: цаг × хөлс + нэмэгдэл (тогтмол цалинтай бол зөвхөн нэмэгдэл). */
export const shiftPay = (s) => (shiftMinutes(s) / 60) * shiftRate(s) + (s.extra_pay || 0);

const byStart = (a, b) => shiftStart(a) - shiftStart(b);
export const shiftsOn = (dateKey) => shiftsService.all().filter((s) => s.shift_date === dateKey).sort(byStart);
export const shiftsBetween = (from, to, workplaceId = null) => shiftsService.all()
  .filter((s) => s.shift_date >= from && s.shift_date <= to && (!workplaceId || s.workplace_id === workplaceId))
  .sort(byStart);

/** Одоо явагдаж буй эсвэл дараагийн ээлж. */
export function nextShift(now = Date.now()) {
  return shiftsService.all()
    .filter((s) => shiftEnd(s).getTime() > now)
    .sort(byStart)[0] || null;
}

/** Тухайн өдөр агуулсан долоо хоногийн эхний ба сүүлийн өдөр. */
export function weekRange(dateKey = todayKey()) {
  const from = toKey(startOfWeek(fromKey(dateKey)));
  return { from, to: addDaysKey(from, 6) };
}
/** "2026-11" → { from: '2026-11-01', to: '2026-11-30' } */
export function monthRange(ym = todayKey().slice(0, 7)) {
  const [y, m] = ym.split('-').map(Number);
  return { from: toKey(new Date(y, m - 1, 1)), to: toKey(new Date(y, m, 0)) };
}

/* ── Орлого ──────────────────────────────────────────────────────────────── */
const inRange = (key, from, to) => key && key >= from && key <= to;
/** Захиалгыг хүргэсэн өдөр (delivered_at байхгүй бол хүргэх өдөр). */
export const orderDeliveredKey = (o) => keyOfTimestamp(o.delivered_at) || o.due_date;

/** Цалин/урьдчилгаа бүртгэл нийт орлогод орох эсэх (цагийн хөлстэй ажлынх бол орохгүй). */
function salaryCounts(entry) {
  const wp = workplaceById(entry.workplace_id);
  return !wp || wp.pay_type !== 'hourly';
}

/**
 * Хугацааны орлогын тойм.
 *  minutes, shiftPay      — дууссан ээлжүүд
 *  plannedMinutes/Pay     — хараахан болоогүй ээлжүүд
 *  salaryPaid             — тогтмол цалингийн хүлээн авсан төлбөр
 *  extras                 — урамшуулал, tips, бусад орлого
 *  sales                  — хүргэсэн захиалга + «Борлуулалт» бүртгэл
 *  total                  — олсон нийт орлого (давхардалгүй)
 *  received               — бүх бүртгэлтэй орлого (бодит хүлээн авсан мөнгө)
 */
export function earnings(from, to, { workplaceId = null, now = Date.now() } = {}) {
  const r = { minutes: 0, shiftPay: 0, plannedMinutes: 0, plannedPay: 0, salaryPaid: 0, extras: 0, sales: 0, received: 0, total: 0 };
  shiftsBetween(from, to, workplaceId).forEach((s) => {
    if (shiftEnd(s).getTime() <= now) { r.minutes += shiftMinutes(s); r.shiftPay += shiftPay(s); } else { r.plannedMinutes += shiftMinutes(s); r.plannedPay += shiftPay(s); }
  });
  incomeService.all().forEach((e) => {
    if (!inRange(e.received_date, from, to)) return;
    if (workplaceId && e.workplace_id !== workplaceId) return;
    r.received += e.amount;
    if (e.kind === 'salary' || e.kind === 'advance') { if (salaryCounts(e)) r.salaryPaid += e.amount; } else if (e.kind === 'sale') r.sales += e.amount;
    else r.extras += e.amount;
  });
  if (!workplaceId) {
    ordersBase.all().forEach((o) => { if (o.status === 'delivered' && inRange(orderDeliveredKey(o), from, to)) r.sales += o.price; });
  }
  r.total = r.shiftPay + r.salaryPaid + r.extras + r.sales;
  return r;
}

/** Ажлын газрын сарын хүлээгдэж буй цалин (цагийн хөлс → тухайн сарын бүх ээлж, тогтмол → сарын цалин). */
export function expectedMonthlyPay(wp, ym = todayKey().slice(0, 7)) {
  if (wp.pay_type === 'fixed') return wp.monthly_salary || 0;
  if (wp.pay_type !== 'hourly') return 0;
  const { from, to } = monthRange(ym);
  return shiftsBetween(from, to, wp.id).reduce((sum, s) => sum + shiftPay(s), 0);
}

/** Дараагийн цалингийн өдөр (өнөөдрийг оруулна) → { date, days } | null */
export function nextPayday(wp, from = todayKey()) {
  const days = [wp.payday, wp.payday_2].filter((d) => d >= 1 && d <= 31);
  if (!days.length) return null;
  const base = fromKey(from);
  let best = null;
  for (let add = 0; add < 3; add++) {
    const y = base.getFullYear();
    const m = base.getMonth() + add;
    const last = new Date(y, m + 1, 0).getDate();
    for (const d of days) {
      const key = toKey(new Date(y, m, Math.min(d, last)));
      if (key >= from && (!best || key < best)) best = key;
    }
    if (best) break;
  }
  return best ? { date: best, days: diffDays(from, best) } : null;
}

/* ── Захиалга ────────────────────────────────────────────────────────────── */
export function orderDueMoment(o) {
  if (!o.due_date) return Infinity;
  const d = fromKey(o.due_date);
  const [h, m] = (o.due_time || '23:59').split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
export const orderBalance = (o) => Math.max(0, (o.price || 0) - (o.paid_amount || 0));
export const isOrderLate = (o, now = Date.now()) => isOrderOpen(o) && orderDueMoment(o) < now;

export const ordersService = {
  ...ordersBase,
  open: () => ordersBase.all().filter(isOrderOpen).sort((a, b) => orderDueMoment(a) - orderDueMoment(b)),
  delivered: () => ordersBase.all().filter((o) => o.status === 'delivered').sort((a, b) => String(orderDeliveredKey(b)).localeCompare(String(orderDeliveredKey(a)))),
  dueWithin: (days) => {
    const limit = addDaysKey(todayKey(), days);
    return ordersService.open().filter((o) => o.due_date && o.due_date <= limit);
  },
  async setStatus(o, status) {
    const patch = { status, delivered_at: status === 'delivered' ? (o.delivered_at || new Date().toISOString()) : null };
    // Хүргэхэд үлдэгдэл төлбөрийг төлсөн гэж үзэхгүй — хэрэглэгч өөрөө тэмдэглэнэ.
    return ordersBase.update(o.id, patch);
  },
  markPaid: (o) => ordersBase.update(o.id, { paid_amount: o.price }),
};

/* ── Ойрын зорилго ───────────────────────────────────────────────────────── */
/**
 * → { value, pct, left, daysLeft, timePct, pace: 'done'|'ahead'|'on'|'behind'|'missed', reached }
 * Цаг, орлого, захиалга нь өгөгдлөөс автоматаар тоологдоно.
 */
export function workGoalProgress(g, today = todayKey()) {
  let value;
  if (g.metric === 'hours') value = earnings(g.start_date, g.end_date, { workplaceId: g.workplace_id }).minutes / 60;
  else if (g.metric === 'income') value = earnings(g.start_date, g.end_date, { workplaceId: g.workplace_id }).total;
  else if (g.metric === 'orders') value = ordersBase.all().filter((o) => o.status === 'delivered' && inRange(orderDeliveredKey(o), g.start_date, g.end_date)).length;
  else value = g.manual_progress || 0;
  const pct = Math.min(100, Math.round((value / g.target) * 100));
  const totalDays = diffDays(g.start_date, g.end_date) + 1;
  const elapsed = Math.min(totalDays, Math.max(0, diffDays(g.start_date, today) + 1));
  const timePct = Math.round((elapsed / totalDays) * 100);
  const daysLeft = diffDays(today, g.end_date);
  const reached = value >= g.target;
  let pace;
  if (reached || g.status === 'done') pace = 'done';
  else if (daysLeft < 0) pace = 'missed';
  else if (pct >= timePct + 10) pace = 'ahead';
  else if (pct >= timePct - 10) pace = 'on';
  else pace = 'behind';
  return { value, pct, left: Math.max(0, g.target - value), daysLeft, timePct, pace, reached };
}

export const PACE_LABEL = { done: 'Биелсэн', ahead: 'Түрүүлж байна', on: 'Хэмнэлтэй', behind: 'Хоцорч байна', missed: 'Хугацаа дууссан' };

/** Утгыг хэмжээсээр нь: 12.5 цаг · 450,000₮ · 7 захиалга · 2 кейс */
export function metricValue(g, value) {
  if (g.metric === 'income') return money(value);
  if (g.metric === 'hours') return `${Math.round(value * 10) / 10} цаг`;
  if (g.metric === 'orders') return `${value} захиалга`;
  const v = Math.round(value * 100) / 100;
  return `${v}${g.unit ? ` ${g.unit}` : ''}`;
}

/** Идэвхтэй зорилгууд (хугацаа нь дуусаагүй, биелээгүй) эхэнд, дуусах огноогоор. */
export function activeWorkGoals(today = todayKey()) {
  return workGoalsService.all()
    .filter((g) => g.status === 'active' && g.end_date >= today)
    .sort((a, b) => a.end_date.localeCompare(b.end_date));
}
export function pastWorkGoals(today = todayKey()) {
  return workGoalsService.all()
    .filter((g) => g.status !== 'active' || g.end_date < today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date));
}

/* ── Ажлын даалгавар (Хийх зүйлс, ангилал «Ажил») ───────────────────────── */
export const WORK_CATEGORY = 'Ажил';
export const isWorkTask = (t) => String(t.category || '').trim().toLowerCase() === WORK_CATEGORY.toLowerCase();
