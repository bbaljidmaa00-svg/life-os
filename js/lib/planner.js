/**
 * Deterministic schedule builder (no AI).
 *
 * planDay  – fits open tasks into the free gaps between events inside your
 *            working hours, highest priority first.
 * planWeek – spreads open tasks over the next 7 days, keeping deadlines and
 *            suggesting days for undated tasks where there is free capacity.
 *
 * Working hours come from Settings. Tasks without an estimate count as 30 min.
 */
import { prefs } from '../state/prefs.js';
import { tasksService, PRIORITY_RANK } from '../services/tasksService.js';
import { eventsService } from '../services/eventsService.js';
import { shiftsOn, shiftSpan, workplaceById } from '../services/workService.js';
import { classesOn, subjectById } from '../services/schoolService.js';
import { todayKey, addDaysKey, timeToMin, minToTime, nowMinutes } from './dates.js';

export const DEFAULT_ESTIMATE = 30;

const byUrgency = (a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))
  || String(a.due_time || '99').localeCompare(String(b.due_time || '99'));

function workHours() {
  const p = prefs.get();
  const start = timeToMin(p.workStart) ?? 9 * 60;
  let end = timeToMin(p.workEnd) ?? 18 * 60;
  if (end <= start) end = Math.min(start + 8 * 60, 24 * 60 - 1);
  return { start, end };
}

function eventIntervals(dateKey) {
  return eventsService.on(dateKey)
    .filter((e) => !e.all_day && e.start_time)
    .map((e) => {
      const s = timeToMin(e.start_time);
      let end = e.end_time ? timeToMin(e.end_time) : s + 60;
      if (end <= s) end = s + 30;
      return { s, e: end, title: e.title, id: e.id };
    })
    // Ажлын ээлж ч завгүй цаг — төлөвлөгч түүний дээр юм тавихгүй.
    .concat(shiftsOn(dateKey).map((sh) => {
      const s = timeToMin(sh.start_time);
      return { s, e: Math.min(24 * 60, s + shiftSpan(sh)), title: `Ээлж: ${workplaceById(sh.workplace_id)?.name || 'Ажил'}`, id: sh.id, shift: true };
    }))
    // Хичээлийн хуваарь ч завгүй цаг.
    .concat(classesOn(dateKey).filter((c) => c.start_time && c.end_time).map((c) => ({
      s: timeToMin(c.start_time), e: timeToMin(c.end_time), title: `Хичээл: ${subjectById(c.subject_id)?.name || ''}`.trim(), id: c.id, cls: true,
    })))
    .sort((a, b) => a.s - b.s);
}

/**
 * Тухайн өдрийн сул цагууд (үйл явдал, ажлын ээлж, хичээлийг хассан).
 * window — өдрийн хүрээ (анхдагч 08:00–22:00). Өнөөдрийнх бол одооноос эхэлнэ.
 * → { date, slots: [{ start, end, minutes }], freeMinutes, busy: [...] }
 */
export function freeSlots(dateKey = todayKey(), { from = '08:00', to = '22:00', minMinutes = 30, now = new Date() } = {}) {
  const winStart = timeToMin(from);
  const winEnd = timeToMin(to);
  const start = dateKey === todayKey() ? Math.max(winStart, Math.ceil(nowMinutes(now) / 15) * 15) : winStart;
  const busy = eventIntervals(dateKey);
  const slots = [];
  let cursor = start;
  for (const b of busy) {
    if (b.e <= cursor) continue;
    if (b.s >= winEnd) break;
    if (b.s - cursor >= minMinutes) slots.push({ s: cursor, e: Math.min(b.s, winEnd) });
    cursor = Math.max(cursor, b.e);
  }
  if (winEnd - cursor >= minMinutes) slots.push({ s: cursor, e: winEnd });
  const list = slots.filter((x) => x.e - x.s >= minMinutes).map((x) => ({ start: minToTime(x.s), end: minToTime(x.e), minutes: x.e - x.s }));
  return { date: dateKey, slots: list, freeMinutes: list.reduce((sum, x) => sum + x.minutes, 0), busy, dayOver: start >= winEnd };
}

export function planDay(dateKey = todayKey(), now = new Date()) {
  const work = workHours();
  const isToday = dateKey === todayKey();
  const start = isToday ? Math.max(work.start, Math.ceil(nowMinutes(now) / 15) * 15) : work.start;
  const events = eventIntervals(dateKey);

  // Free gaps between events, inside working hours.
  const gaps = [];
  let cursor = start;
  for (const ev of events) {
    if (ev.e <= cursor) continue;
    if (ev.s >= work.end) break;
    if (ev.s > cursor) gaps.push({ s: cursor, e: Math.min(ev.s, work.end) });
    cursor = Math.max(cursor, ev.e);
  }
  if (cursor < work.end) gaps.push({ s: cursor, e: work.end });
  const freeMinutes = gaps.reduce((sum, g) => sum + (g.e - g.s), 0);

  const open = tasksService.open();
  const mustDo = open.filter((t) => t.due_date && t.due_date <= dateKey).sort(byUrgency); // overdue + due that day
  const optional = open.filter((t) => !t.due_date).sort(byUrgency);                       // fill leftover time

  const blocks = [];
  const unscheduled = [];
  const place = (t) => {
    const minutes = t.estimated_minutes || DEFAULT_ESTIMATE;
    const gap = gaps.find((g) => g.e - g.s >= minutes);
    if (!gap) return false;
    blocks.push({ kind: 'task', start: minToTime(gap.s), end: minToTime(gap.s + minutes), title: t.title, ref: t.id, priority: t.priority, estimated: Boolean(t.estimated_minutes) });
    gap.s += minutes;
    return true;
  };
  mustDo.forEach((t) => { if (!place(t)) unscheduled.push(t.id); });
  optional.forEach(place);

  const all = [
    ...events.map((ev) => ({ kind: 'event', start: minToTime(ev.s), end: minToTime(ev.e), title: ev.title, ref: ev.id })),
    ...blocks,
  ].sort((a, b) => a.start.localeCompare(b.start));

  return {
    date: dateKey,
    blocks: all,
    unscheduled,
    freeMinutes,
    workStart: minToTime(work.start),
    workEnd: minToTime(work.end),
    dayOver: start >= work.end,
  };
}

export function planWeek(fromKey = todayKey()) {
  const work = workHours();
  const dayMinutes = work.end - work.start;
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysKey(fromKey, i);
    const busy = eventIntervals(date)
      .reduce((sum, ev) => sum + Math.max(0, Math.min(ev.e, work.end) - Math.max(ev.s, work.start)), 0);
    return { date, capacity: Math.max(0, dayMinutes - busy), eventMinutes: busy, planned: 0, tasks: [] };
  });
  const lastKey = days[6].date;
  const open = tasksService.open();

  const assign = (day, t, reason) => {
    const minutes = t.estimated_minutes || DEFAULT_ESTIMATE;
    day.tasks.push({ id: t.id, title: t.title, minutes, priority: t.priority, reason });
    day.planned += minutes;
  };

  open.filter((t) => t.due_date && t.due_date < fromKey).sort(byUrgency).forEach((t) => assign(days[0], t, 'overdue'));
  open.filter((t) => t.due_date && t.due_date >= fromKey && t.due_date <= lastKey).sort(byUrgency)
    .forEach((t) => assign(days.find((d) => d.date === t.due_date), t, 'due'));

  const suggestions = [];
  const unscheduled = [];
  open.filter((t) => !t.due_date).sort(byUrgency).forEach((t) => {
    const minutes = t.estimated_minutes || DEFAULT_ESTIMATE;
    const best = [...days].sort((a, b) => (b.capacity - b.planned) - (a.capacity - a.planned))[0];
    if (best.capacity - best.planned >= minutes) {
      assign(best, t, 'suggested');
      suggestions.push({ task_id: t.id, date: best.date });
    } else unscheduled.push(t.id);
  });

  return { from: fromKey, to: lastKey, days, suggestions, unscheduled };
}
