/**
 * AI шинжилгээ — хэрэглэгчийн ӨӨРИЙН өгөгдлийг (санах ойд ачаалсан, RLS-ээр зөвхөн түүнийх)
 * товчлоод Edge Function руу mode: 'analyze'-аар илгээнэ. Тайланг monthly_reports-д хадгална.
 *
 * AI холбогдоогүй үед хуурамч «AI» хариу гаргахгүй — зөвхөн тодорхой шошготой энгийн тооцоо харуулна.
 */
import { TABLES, AI_ENDPOINT, SUPABASE_ANON_KEY, isAiConfigured } from '../config.js';
import { createService } from './createService.js';
import { authService } from './authService.js';
import { tasksService } from './tasksService.js';
import { eventsService } from './eventsService.js';
import { journalService } from './journalService.js';
import {
  goalsService, projectsService, wishesService, reflectionsService, goalProgress, projectProgress, wishCategory, projectKind,
} from './goalsService.js';
import { homeworkService, subjectById, isFinished } from './schoolService.js';
import { earnings, ordersService, workGoalsService, workGoalProgress, isOrderLate } from './workService.js';
import { todayKey, addDaysKey, keyOfTimestamp, fromKey, WEEKDAYS } from '../lib/dates.js';

export const PERIODS = [
  { value: '7', label: 'Сүүлийн 7 хоног', days: 7 },
  { value: '30', label: 'Сүүлийн 30 хоног', days: 30 },
  { value: '90', label: 'Сүүлийн 3 сар', days: 90 },
];

export function periodRange(value) {
  const p = PERIODS.find((x) => x.value === String(value)) || PERIODS[1];
  const to = todayKey();
  return { ...p, from: addDaysKey(to, -(p.days - 1)), to };
}

export const reportsService = createService({
  key: 'reports',
  tableName: TABLES.reports,
  columns: ['id', 'period_start', 'period_end', 'report_data', 'generated_at', 'created_at'],
  normalize: (row) => ({
    ...row,
    period_start: String(row.period_start || '').slice(0, 10),
    period_end: String(row.period_end || '').slice(0, 10),
    report_data: row.report_data && typeof row.report_data === 'object' ? row.report_data : {},
  }),
});

export const latestReports = () => [...reportsService.all()]
  .sort((a, b) => String(b.generated_at || b.created_at).localeCompare(String(a.generated_at || a.created_at)));

const clip = (s, n = 220) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const inRange = (key, from, to) => Boolean(key) && key >= from && key <= to;
const countBy = (list, fn) => list.reduce((acc, x) => { const k = fn(x) || '—'; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
const round1 = (n) => Math.round(n * 10) / 10;

/** Тухайн хугацааны өгөгдлийн товчлол — AI-д илгээх, мөн энгийн тооцоонд ашиглана. */
export function buildDigest(from, to) {
  const tasks = tasksService.all();
  const doneInRange = tasks.filter((t) => t.status === 'done' && inRange(keyOfTimestamp(t.completed_at) || t.due_date, from, to));
  const dueInRange = tasks.filter((t) => inRange(t.due_date, from, to));
  const today = todayKey();
  const overdue = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < today);
  const weekday = Array(7).fill(0);
  const hours = {};
  doneInRange.forEach((t) => {
    if (!t.completed_at) return;
    const d = new Date(t.completed_at);
    weekday[d.getDay()] += 1;
    const h = d.getHours();
    const slot = h < 12 ? 'өглөө' : h < 17 ? 'өдөр' : h < 21 ? 'орой' : 'шөнө';
    hours[slot] = (hours[slot] || 0) + 1;
  });

  const journal = journalService.all().filter((j) => inRange(j.entry_date, from, to))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const moods = journal.filter((j) => j.mood).map((j) => ({ date: j.entry_date, mood: Number(j.mood) }));
  const doneByDay = countBy(doneInRange, (t) => keyOfTimestamp(t.completed_at) || t.due_date);

  const reflections = reflectionsService.all()
    .filter((r) => inRange(keyOfTimestamp(r.created_at), from, to))
    .map((r) => ({
      date: keyOfTimestamp(r.created_at),
      project: projectsService.get(r.project_id)?.title || '',
      step: clip(r.task_title, 80),
      mood: r.mood,
      learned: clip(r.learned, 240),
      feeling: clip(r.feeling, 240),
    })).slice(-40);

  const projects = projectsService.all().map((p) => {
    const pr = projectProgress(p.id);
    return { title: p.title, kind: projectKind(p.kind).label, status: p.status, goal: goalsService.get(p.goal_id)?.title || null, steps_done: pr.done, steps_total: pr.total, pct: pr.pct };
  });
  const goals = goalsService.all().map((g) => ({
    title: g.title, status: g.status, target_date: g.target_date, pct: goalProgress(g.id).pct,
    wish: wishesService.get(g.wish_id)?.title || null,
  }));
  const wishes = wishesService.all().map((w) => ({
    title: w.title, category: wishCategory(w.category).label, achieved: Boolean(w.achieved_at),
    linked_goals: goalsService.all().filter((g) => g.wish_id === w.id).length,
  }));

  const homework = homeworkService.all();
  const hwRange = homework.filter((h) => inRange(h.due_date, from, to));
  const work = earnings(from, to);
  const orders = ordersService.all();

  return {
    period: { from, to, days: Math.round((fromKey(to) - fromKey(from)) / 86400000) + 1 },
    tasks: {
      completed: doneInRange.length,
      due_in_period: dueInRange.length,
      completed_on_time_pct: dueInRange.length ? Math.round((dueInRange.filter((t) => t.status === 'done').length / dueInRange.length) * 100) : null,
      overdue_now: overdue.length,
      open_now: tasks.filter((t) => t.status !== 'done').length,
      completed_by_category: countBy(doneInRange, (t) => t.category),
      completed_by_weekday: Object.fromEntries(WEEKDAYS.map((w, i) => [w, weekday[i]])),
      completed_by_time_of_day: hours,
      completed_examples: doneInRange.slice(-25).map((t) => clip(t.title, 80)),
      overdue_examples: overdue.slice(0, 12).map((t) => ({ title: clip(t.title, 80), due: t.due_date, priority: t.priority })),
    },
    journal: {
      entries: journal.length,
      avg_mood_1_to_5: moods.length ? round1(moods.reduce((s, m) => s + m.mood, 0) / moods.length) : null,
      mood_and_tasks_by_day: moods.map((m) => ({ ...m, tasks_done: doneByDay[m.date] || 0 })),
      notes: journal.slice(-12).map((j) => ({ date: j.entry_date, mood: j.mood || null, text: clip(j.reflection, 260), gratitude: clip(j.gratitude, 160) })),
    },
    reflections,
    wishes,
    goals,
    projects,
    events: { count: eventsService.between(from, to).length, by_category: countBy(eventsService.between(from, to), (e) => e.category) },
    school: {
      homework_due: hwRange.length,
      homework_finished: hwRange.filter(isFinished).length,
      homework_overdue_now: homeworkService.overdue().length,
      subjects: [...new Set(hwRange.map((h) => subjectById(h.subject_id)?.name).filter(Boolean))],
    },
    work: {
      hours_worked: round1(work.minutes / 60),
      earned_mnt: Math.round(work.total),
      received_mnt: Math.round(work.received),
      orders_delivered: orders.filter((o) => o.status === 'delivered' && inRange(keyOfTimestamp(o.delivered_at) || o.due_date, from, to)).length,
      orders_open: ordersService.open().length,
      orders_late: orders.filter((o) => isOrderLate(o)).length,
      near_term_goals: workGoalsService.all().filter((g) => g.end_date >= from).map((g) => ({ title: g.title, pct: workGoalProgress(g).pct })),
    },
  };
}

/** Өгөгдөл хэр их байна — хэт цөөн бол AI-д илгээх нь утгагүй. */
export function digestSize(d) {
  return d.tasks.completed + d.tasks.due_in_period + d.journal.entries + d.reflections.length + d.events.count + d.school.homework_due;
}

/** AI-гүй, зөвхөн тоон дээр тулгуурласан энгийн тойм (шошготойгоор харуулна). */
export function localSummary(d) {
  const lines = [];
  lines.push(`${d.period.days} хоногт ${d.tasks.completed} зүйл дуусгасан${d.tasks.completed_on_time_pct !== null ? `, хугацаандаа гүйцэтгэсэн нь ${d.tasks.completed_on_time_pct}%` : ''}.`);
  const bestDay = Object.entries(d.tasks.completed_by_weekday).sort((a, b) => b[1] - a[1])[0];
  if (bestDay && bestDay[1] > 0) lines.push(`Хамгийн бүтээмжтэй гараг: ${bestDay[0]} (${bestDay[1]} зүйл).`);
  const bestSlot = Object.entries(d.tasks.completed_by_time_of_day).sort((a, b) => b[1] - a[1])[0];
  if (bestSlot) lines.push(`Ихэвчлэн ${bestSlot[0]} ажил дуусгадаг.`);
  const topCat = Object.entries(d.tasks.completed_by_category).sort((a, b) => b[1] - a[1])[0];
  if (topCat && topCat[0] !== '—') lines.push(`Хамгийн их цаг зарцуулсан ангилал: ${topCat[0]} (${topCat[1]}).`);
  if (d.journal.avg_mood_1_to_5) lines.push(`Тэмдэглэлийн дундаж сэтгэл санаа ${d.journal.avg_mood_1_to_5}/5 (${d.journal.entries} тэмдэглэл).`);
  if (d.reflections.length) lines.push(`Төслүүддээ ${d.reflections.length} удаа «юу сурснаа» бичсэн.`);
  if (d.tasks.overdue_now) lines.push(`Одоо ${d.tasks.overdue_now} зүйлийн хугацаа хэтэрсэн байна.`);
  if (d.work.hours_worked) lines.push(`${d.work.hours_worked} цаг ажиллаж, ${d.work.earned_mnt.toLocaleString('en-US')}₮ олсон.`);
  return lines;
}

/** Edge Function-ээр Claude-д шинжлүүлнэ → { report, model } */
export async function analyzeWithAI(period) {
  if (!isAiConfigured()) throw new Error('AI холбогдоогүй байна — Supabase-тэй холбогдож нэвтэрсэн үед ажиллана.');
  const digest = buildDigest(period.from, period.to);
  const headers = { 'Content-Type': 'application/json' };
  const token = await authService.accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (SUPABASE_ANON_KEY) headers.apikey = SUPABASE_ANON_KEY;
  let response;
  try {
    response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mode: 'analyze', digest, period: { from: period.from, to: period.to, label: period.label } }),
    });
  } catch {
    throw new Error('Интернэт холболт тасарсан байж магадгүй.');
  }
  if (!response.ok) {
    let reason = `${response.status}`;
    try { reason = (await response.json()).error || reason; } catch { /* JSON биш */ }
    throw new Error(reason);
  }
  const json = await response.json();
  if (!json.report) throw new Error('Тайлан ирсэнгүй.');
  return { report: json.report, model: json.model || '' };
}

/** Тайланг хадгална — ижил хугацааных байвал шинэчилнэ (period_start+period_end давтагдахгүй). */
export async function saveReport(period, result) {
  const report_data = { source: 'ai', model: result.model, label: period.label, report: result.report };
  const generated_at = new Date().toISOString();
  const existing = reportsService.all().find((r) => r.period_start === period.from && r.period_end === period.to);
  return existing
    ? reportsService.update(existing.id, { report_data, generated_at })
    : reportsService.create({ period_start: period.from, period_end: period.to, report_data, generated_at });
}
