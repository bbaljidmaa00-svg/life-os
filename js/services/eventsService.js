/**
 * Calendar events service — table: TABLES.events
 * Events have a date, optional start/end time, or are all-day.
 */
import { TABLES } from '../config.js';
import { createService } from './createService.js';
import { eventsMap } from './dbMapping.js';

export const EVENT_CATEGORIES = [
  { value: 'work', label: 'Ажил' },
  { value: 'personal', label: 'Хувийн' },
  { value: 'health', label: 'Эрүүл мэнд' },
  { value: 'social', label: 'Нийгэм' },
  { value: 'focus', label: 'Төвлөрөл' },
  { value: 'other', label: 'Бусад' },
];
const CATEGORY_IDS = EVENT_CATEGORIES.map((c) => c.value);

const COLUMNS = ['id', 'title', 'description', 'event_date', 'start_time', 'end_time', 'all_day', 'location', 'category', 'created_at'];

function normalize(row) {
  return {
    ...row,
    title: row.title || '',
    description: row.description || '',
    event_date: row.event_date ? String(row.event_date).slice(0, 10) : null,
    start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
    end_time: row.end_time ? String(row.end_time).slice(0, 5) : null,
    all_day: Boolean(row.all_day),
    location: row.location || '',
    category: CATEGORY_IDS.includes(row.category) ? row.category : 'other',
  };
}

const base = createService({ key: 'events', tableName: TABLES.events, columns: COLUMNS, normalize, mapping: eventsMap });

/** By date, then all-day first, then by start time. */
export function compareEvents(a, b) {
  if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
  const aAll = a.all_day || !a.start_time;
  const bAll = b.all_day || !b.start_time;
  if (aAll !== bAll) return aAll ? -1 : 1;
  return String(a.start_time || '').localeCompare(String(b.start_time || ''));
}
export const sortEvents = (list) => [...list].sort(compareEvents);

export const eventsService = {
  ...base,
  on: (key) => sortEvents(base.all().filter((e) => e.event_date === key)),
  between: (fromKey, toKey) => sortEvents(base.all().filter((e) => e.event_date >= fromKey && e.event_date <= toKey)),
};

export const eventColor = (category) => `var(--ev-${CATEGORY_IDS.includes(category) ? category : 'other'})`;
