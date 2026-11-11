/**
 * Notifications are calculated from your data every time they're shown:
 * overdue tasks, tasks due today, upcoming events, birthday reminders and
 * goal / project deadlines. Nothing extra needs to be stored.
 *
 * Read / dismissed state is kept in memory for this session. To sync it
 * across devices, add a `notification_states` table (see README).
 *
 * If the browser allows it, a ticker also shows system notifications for
 * events and timed tasks starting within 10 minutes.
 */
import { store } from '../state/store.js';
import { tasksService } from './tasksService.js';
import { eventsService } from './eventsService.js';
import { birthdaysService, daysUntil, nextOccurrence, ageAt } from './birthdaysService.js';
import { homeworkService, subjectById, dueMoment, dueCountdown } from './schoolService.js';
import { goalsService, projectsService } from './goalsService.js';
import {
  shiftsService, shiftEnd, shiftStart, workplaceById, ordersService, isOrderLate, orderBalance, workplacesService, nextPayday,
  activeWorkGoals, workGoalProgress, metricValue, money,
} from './workService.js';
import { todayKey, addDaysKey, diffDays, relDay, fmtTime, timeToMin, nowMinutes } from '../lib/dates.js';
import { plural } from '../lib/dom.js';

const readIds = new Set();
const dismissedIds = new Set();
const touch = () => store.setMeta({ tick: Date.now() });

function compute() {
  const today = todayKey();
  const tomorrow = addDaysKey(today, 1);
  const list = [];

  tasksService.overdue().forEach((t) => list.push({
    id: `task-overdue-${t.id}`, group: 'attention', tone: 'danger', icon: 'alert',
    title: t.title, text: `Хугацаа хэтэрсэн · ${plural(diffDays(t.due_date, today), 'хоног')}`,
    ref: { kind: 'task', id: t.id }, order: 0, date: t.due_date,
  }));

  tasksService.dueOn(today).filter((t) => t.status !== 'done').forEach((t) => list.push({
    id: `task-today-${t.id}`, group: 'attention', tone: 'warning', icon: 'tasks',
    title: t.title, text: t.due_time ? `Өнөөдөр ${fmtTime(t.due_time)} гэхэд` : 'Өнөөдөр дуусах',
    ref: { kind: 'task', id: t.id }, order: 1, date: today,
  }));

  const now = nowMinutes();
  [...eventsService.on(today), ...eventsService.on(tomorrow)].forEach((e) => {
    const timed = !e.all_day && e.start_time;
    if (e.event_date === today && timed && (timeToMin(e.end_time) ?? timeToMin(e.start_time) + 60) < now) return; // already over
    list.push({
      id: `event-${e.id}-${e.event_date}`, group: 'upcoming', tone: 'info', icon: 'calendar',
      title: e.title, text: `${relDay(e.event_date)} · ${timed ? fmtTime(e.start_time) : 'Өдөржин'}${e.location ? ` · ${e.location}` : ''}`,
      ref: { kind: 'event', id: e.id }, order: 2, date: e.event_date,
    });
  });

  homeworkService.open().forEach((h) => {
    if (!h.due_date) return;
    const left = dueMoment(h) - Date.now();
    if (left > 2 * 86400000) return; // зөвхөн 2 хоногийн дотор дуусах эсвэл хэтэрсэн
    const subject = subjectById(h.subject_id);
    list.push({
      id: `homework-${h.id}-${h.due_date}`, group: left < 0 || h.due_date === today ? 'attention' : 'upcoming',
      tone: left < 0 ? 'danger' : 'warning', icon: 'book',
      title: h.title, text: `${subject ? `${subject.name} · ` : ''}${dueCountdown(h)}`,
      ref: { kind: 'homework', id: h.id }, order: 1, date: h.due_date,
    });
  });

  /* Ажил: ойрын ээлж, захиалга, цалингийн өдөр, ойрын зорилго */
  const nowMs = Date.now();
  shiftsService.all().forEach((sh) => {
    if (sh.shift_date !== today && sh.shift_date !== tomorrow) return;
    if (shiftEnd(sh).getTime() <= nowMs) return;
    const wp = workplaceById(sh.workplace_id);
    const live = shiftStart(sh).getTime() <= nowMs;
    list.push({
      id: `shift-${sh.id}-${sh.shift_date}`, group: 'upcoming', tone: 'info', icon: 'briefcase',
      title: `${live ? 'Одоо ээлжтэй' : 'Ээлж'}: ${wp?.name || 'Ажил'}`,
      text: `${relDay(sh.shift_date)} · ${fmtTime(sh.start_time)}–${fmtTime(sh.end_time)}`,
      ref: { kind: 'shift', id: sh.id }, order: 2, date: sh.shift_date,
    });
  });

  ordersService.open().forEach((o) => {
    if (!o.due_date || o.due_date > tomorrow) return;
    const late = isOrderLate(o);
    const left = orderBalance(o);
    list.push({
      id: `order-${o.id}-${o.due_date}`, group: late || o.due_date === today ? 'attention' : 'upcoming',
      tone: late ? 'danger' : 'warning', icon: 'bag',
      title: `Захиалга: ${o.customer_name} — ${o.items}`,
      text: `${late ? 'Хүргэх хугацаа хэтэрсэн' : `${relDay(o.due_date)} хүргэнэ`}${o.due_time ? ` · ${fmtTime(o.due_time)}` : ''}${left ? ` · үлдэгдэл ${money(left)}` : ''}`,
      ref: { kind: 'order', id: o.id }, order: 1, date: o.due_date,
    });
  });

  workplacesService.all().forEach((w) => {
    const pd = nextPayday(w, today);
    if (!pd || pd.days > 1) return;
    list.push({
      id: `payday-${w.id}-${pd.date}`, group: 'upcoming', tone: 'accent', icon: 'wallet',
      title: `${pd.days === 0 ? 'Өнөөдөр' : 'Маргааш'} цалингийн өдөр: ${w.name}`,
      text: 'Хүлээн авсан цалингаа «Ажил → Цалин» хэсэгт бүртгээрэй.',
      ref: { kind: 'payday', id: w.id }, order: 3, date: pd.date,
    });
  });

  activeWorkGoals(today).forEach((g) => {
    const days = diffDays(today, g.end_date);
    if (days > 2) return;
    const p = workGoalProgress(g, today);
    if (p.reached) return;
    list.push({
      id: `wgoal-${g.id}-${g.end_date}`, group: 'upcoming', tone: 'warning', icon: 'target',
      title: `Ойрын зорилго: ${g.title}`,
      text: `${days === 0 ? 'Өнөөдөр дуусна' : `${days} хоног үлдсэн`} · ${p.pct}% · ${metricValue(g, p.left)} дутуу`,
      ref: { kind: 'workGoal', id: g.id }, order: 4, date: g.end_date,
    });
  });

  birthdaysService.all().forEach((b) => {
    const days = daysUntil(b);
    const show = days === 0 || (b.reminder_enabled && days <= b.reminder_days);
    if (!show) return;
    const next = nextOccurrence(b);
    const age = ageAt(b, next);
    list.push({
      id: `birthday-${b.id}-${next}`, group: days === 0 ? 'attention' : 'upcoming', tone: 'accent', icon: 'gift',
      title: days === 0 ? `Өнөөдөр төрсөн өдөр: ${b.name}` : `${days} хоногийн дараа төрсөн өдөр: ${b.name}`,
      text: `${relDay(next)}${age ? ` · ${age} нас хүрнэ` : ''}`,
      ref: { kind: 'birthday', id: b.id }, order: 3, date: next,
    });
  });

  goalsService.all().filter((g) => g.status !== 'completed' && g.target_date).forEach((g) => {
    const days = diffDays(today, g.target_date);
    if (days > 7) return;
    list.push({
      id: `goal-${g.id}-${g.target_date}`, group: days < 0 ? 'attention' : 'upcoming', tone: days < 0 ? 'danger' : 'warning', icon: 'goals',
      title: `Зорилго: ${g.title}`, text: days < 0 ? `Зорилтот огноо ${-days} хоногийн өмнө өнгөрсөн` : `Зорилтот огноо: ${relDay(g.target_date)}`,
      ref: { kind: 'goal', id: g.id }, order: 4, date: g.target_date,
    });
  });

  projectsService.all().filter((p) => p.status !== 'completed' && p.due_date).forEach((p) => {
    const days = diffDays(today, p.due_date);
    if (days > 3) return;
    list.push({
      id: `project-${p.id}-${p.due_date}`, group: days < 0 ? 'attention' : 'upcoming', tone: days < 0 ? 'danger' : 'warning', icon: 'folder',
      title: `Төсөл: ${p.title}`, text: days < 0 ? `Дуусах огноо ${-days} хоногийн өмнө өнгөрсөн` : `Дуусах огноо: ${relDay(p.due_date)}`,
      ref: { kind: 'project', id: p.id, goalId: p.goal_id }, order: 5, date: p.due_date,
    });
  });

  return list
    .filter((n) => !dismissedIds.has(n.id))
    .map((n) => ({ ...n, read: readIds.has(n.id) }))
    .sort((a, b) => a.order - b.order || String(a.date).localeCompare(String(b.date)));
}

export const notificationsService = {
  list: compute,
  unreadCount: () => compute().filter((n) => !n.read).length,
  markRead(id) { readIds.add(id); touch(); },
  markUnread(id) { readIds.delete(id); touch(); },
  markAllRead() { compute().forEach((n) => readIds.add(n.id)); touch(); },
  dismiss(id) { dismissedIds.add(id); touch(); },
  browserSupported: () => 'Notification' in window,
  browserPermission: () => ('Notification' in window ? Notification.permission : 'unsupported'),
  async requestBrowserPermission() {
    if (!('Notification' in window)) return 'unsupported';
    const result = await Notification.requestPermission();
    touch();
    return result;
  },
  showBrowserNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    try { new Notification(title, { body, tag: `${title}-${body}` }); return true; } catch { return false; }
  },
};

/** Runs every minute: system alerts for things starting soon + re-render after midnight. */
export function startNotificationTicker() {
  const alerted = new Set();
  let day = todayKey();
  const tick = () => {
    const today = todayKey();
    if (today !== day) { day = today; touch(); }
    if (notificationsService.browserPermission() !== 'granted') return;
    const now = nowMinutes();
    eventsService.on(today).forEach((e) => {
      if (e.all_day || !e.start_time) return;
      const inMin = timeToMin(e.start_time) - now;
      const key = `e-${e.id}-${today}`;
      if (inMin >= 0 && inMin <= 10 && !alerted.has(key)) {
        alerted.add(key);
        notificationsService.showBrowserNotification(e.title, `${fmtTime(e.start_time)}-д эхэлнэ${e.location ? ` · ${e.location}` : ''}`);
      }
    });
    tasksService.dueOn(today).forEach((t) => {
      if (t.status === 'done' || !t.due_time) return;
      const inMin = timeToMin(t.due_time) - now;
      const key = `t-${t.id}-${today}`;
      if (inMin >= 0 && inMin <= 10 && !alerted.has(key)) {
        alerted.add(key);
        notificationsService.showBrowserNotification(t.title, `${fmtTime(t.due_time)} гэхэд дуусах`);
      }
    });
    // Ажлын ээлж эхлэхээс 30 минутын өмнө
    shiftsService.all().forEach((sh) => {
      if (sh.shift_date !== today) return;
      const inMin = timeToMin(sh.start_time) - now;
      const key = `s-${sh.id}-${today}`;
      if (inMin >= 0 && inMin <= 30 && !alerted.has(key)) {
        alerted.add(key);
        notificationsService.showBrowserNotification(`Ээлж: ${workplaceById(sh.workplace_id)?.name || 'Ажил'}`, `${fmtTime(sh.start_time)}–${fmtTime(sh.end_time)} · ${inMin} минутын дараа`);
      }
    });
  };
  tick();
  setInterval(tick, 60 * 1000);
}
