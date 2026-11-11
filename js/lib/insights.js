/**
 * Productivity statistics, calculated from your own data.
 * Shared by the Analytics page and the Assistant's "insights" command.
 */
import { tasksService } from '../services/tasksService.js';
import { journalService } from '../services/journalService.js';
import { todayKey, addDaysKey, keyOfTimestamp, fromKey, WEEKDAYS } from './dates.js';

export const rangeKeys = (days, endKey = todayKey()) => Array.from({ length: days }, (_, i) => addDaysKey(endKey, i - days + 1));
const average = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null);

export function computeStats(days = 7, endKey = todayKey()) {
  const keys = rangeKeys(days, endKey);
  const startKey = keys[0];
  const inRange = (k) => Boolean(k) && k >= startKey && k <= endKey;

  const tasks = tasksService.all();
  const completed = tasks.filter((t) => t.status === 'done' && inRange(keyOfTimestamp(t.completed_at)));
  const due = tasks.filter((t) => inRange(t.due_date));
  const dueDone = due.filter((t) => t.status === 'done');
  const completedWithDue = completed.filter((t) => t.due_date);
  const onTime = completedWithDue.filter((t) => keyOfTimestamp(t.completed_at) <= t.due_date);

  const perDay = keys.map((k) => {
    const list = completed.filter((t) => keyOfTimestamp(t.completed_at) === k);
    return { date: k, count: list.length, minutes: list.reduce((s, t) => s + (t.estimated_minutes || 0), 0) };
  });

  const weekday = Array(7).fill(0);
  completed.forEach((t) => { weekday[fromKey(keyOfTimestamp(t.completed_at)).getDay()] += 1; });
  const best = Math.max(...weekday);

  const categories = {};
  completed.forEach((t) => {
    const name = t.category || 'Ангилалгүй';
    categories[name] ??= { count: 0, minutes: 0 };
    categories[name].count += 1;
    categories[name].minutes += t.estimated_minutes || 0;
  });
  const byCategory = Object.entries(categories)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.minutes - a.minutes || b.count - a.count);

  const priority = ['high', 'medium', 'low'].map((p) => ({
    priority: p,
    done: completed.filter((t) => t.priority === p).length,
    open: tasks.filter((t) => t.status !== 'done' && t.priority === p).length,
  }));

  const moods = journalService.all()
    .filter((e) => inRange(e.entry_date) && e.mood)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    .map((e) => ({ date: e.entry_date, mood: e.mood }));

  const countOn = (k) => perDay.find((p) => p.date === k)?.count ?? 0;
  const goodDays = moods.filter((m) => m.mood >= 4).map((m) => countOn(m.date));
  const lowDays = moods.filter((m) => m.mood <= 2).map((m) => countOn(m.date));

  return {
    days, startKey, endKey, keys,
    completed,
    completedCount: completed.length,
    focusMinutes: completed.reduce((s, t) => s + (t.estimated_minutes || 0), 0),
    dueCount: due.length,
    dueDoneCount: dueDone.length,
    completionRate: due.length ? dueDone.length / due.length : null,
    onTimeRate: completedWithDue.length ? onTime.length / completedWithDue.length : null,
    perDay,
    weekday,
    bestWeekday: best > 0 ? WEEKDAYS[weekday.indexOf(best)] : null,
    byCategory,
    priority,
    moods,
    avgMood: average(moods.map((m) => m.mood)),
    moodGoodAvg: goodDays.length >= 2 ? average(goodDays) : null,
    moodLowAvg: lowDays.length >= 2 ? average(lowDays) : null,
    overdueNow: tasksService.overdue().length,
    openNow: tasksService.open().length,
  };
}
