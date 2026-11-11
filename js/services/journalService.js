/**
 * Journal service — table: TABLES.journal
 * One entry per day is encouraged (the UI opens the existing entry for a date).
 */
import { TABLES } from '../config.js';
import { createService } from './createService.js';
import { journalMap } from './dbMapping.js';

export const MOODS = [
  { value: 1, label: 'Муу' },
  { value: 2, label: 'Тааруу' },
  { value: 3, label: 'Дунд' },
  { value: 4, label: 'Сайн' },
  { value: 5, label: 'Гайхалтай' },
];
export const moodLabel = (v) => MOODS.find((m) => m.value === Number(v))?.label || 'Сэтгэл санаа тэмдэглээгүй';

const base = createService({
  key: 'journal',
  tableName: TABLES.journal,
  columns: ['id', 'entry_date', 'mood', 'title', 'reflection', 'gratitude', 'created_at'],
  mapping: journalMap,
  normalize: (row) => ({
    ...row,
    entry_date: row.entry_date ? String(row.entry_date).slice(0, 10) : null,
    mood: row.mood ? Number(row.mood) : null,
    title: row.title || '',
    reflection: row.reflection || '',
    gratitude: row.gratitude || '',
  }),
});

export const journalService = {
  ...base,
  byDate: (key) => base.all().find((e) => e.entry_date === key) || null,
  sorted: (newestFirst = true) => [...base.all()].sort((a, b) => (newestFirst ? -1 : 1) * a.entry_date.localeCompare(b.entry_date)),
};
