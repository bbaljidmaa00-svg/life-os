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
import { goalsService, projectsService } from './goalsService.js';
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
  };
  tick();
  setInterval(tick, 60 * 1000);
}
