/**
 * Birthdays service — table: TABLES.birthdays
 * Month and day are stored separately so the birth year can be optional.
 */
import { TABLES } from '../config.js';
import { createService } from './createService.js';
import { birthdaysMap } from './dbMapping.js';
import { todayKey, toKey, fromKey, diffDays } from '../lib/dates.js';

export const RELATIONSHIPS = ['Гэр бүл', 'Найз', 'Хань', 'Хамт ажиллагч', 'Бусад'];
export const REMINDER_OPTIONS = [
  { value: 0, label: 'Тухайн өдөр' },
  { value: 1, label: '1 өдрийн өмнө' },
  { value: 3, label: '3 өдрийн өмнө' },
  { value: 7, label: '1 долоо хоногийн өмнө' },
  { value: 14, label: '2 долоо хоногийн өмнө' },
];
export const reminderLabel = (days) => REMINDER_OPTIONS.find((o) => o.value === Number(days))?.label || `${days} өдрийн өмнө`;

const base = createService({
  key: 'birthdays',
  tableName: TABLES.birthdays,
  columns: ['id', 'name', 'birth_month', 'birth_day', 'birth_year', 'relationship', 'reminder_enabled', 'reminder_days', 'notes', 'created_at'],
  mapping: birthdaysMap,
  normalize: (row) => ({
    ...row,
    name: row.name || '',
    birth_month: Number(row.birth_month) || 1,
    birth_day: Number(row.birth_day) || 1,
    birth_year: row.birth_year ? Number(row.birth_year) : null,
    relationship: row.relationship || 'Бусад',
    reminder_enabled: row.reminder_enabled !== false,
    reminder_days: row.reminder_days === null || row.reminder_days === undefined ? 1 : Number(row.reminder_days),
    notes: row.notes || '',
  }),
});

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Date key of this person's birthday in a given year (Feb 29 → Feb 28 in common years). */
export function occurrenceIn(b, year) {
  let day = b.birth_day;
  if (b.birth_month === 2 && day === 29 && !isLeap(year)) day = 28;
  return toKey(new Date(year, b.birth_month - 1, day));
}

export function nextOccurrence(b, from = todayKey()) {
  const year = fromKey(from).getFullYear();
  const thisYear = occurrenceIn(b, year);
  return thisYear >= from ? thisYear : occurrenceIn(b, year + 1);
}

export const daysUntil = (b) => diffDays(todayKey(), nextOccurrence(b));
export const ageAt = (b, key) => (b.birth_year ? fromKey(key).getFullYear() - b.birth_year : null);

export const birthdaysService = {
  ...base,
  onDate(key) {
    const year = fromKey(key).getFullYear();
    return base.all().filter((b) => occurrenceIn(b, year) === key);
  },
  /** Sorted by next occurrence, limited to the next `days` days. */
  upcoming(days = 365) {
    return base.all()
      .map((b) => ({ ...b, next: nextOccurrence(b), days: daysUntil(b) }))
      .filter((b) => b.days <= days)
      .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, 'mn'));
  },
};
