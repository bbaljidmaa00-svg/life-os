/**
 * Loads every table at start-up and offers a full JSON export.
 * A failing table doesn't stop the others; its error is shown in a banner.
 */
import { store } from '../state/store.js';
import { tasksService } from './tasksService.js';
import { eventsService } from './eventsService.js';
import { goalsService, projectsService } from './goalsService.js';
import { journalService } from './journalService.js';
import { birthdaysService } from './birthdaysService.js';
import { aiService } from './aiService.js';
import { subjectsService, classSessionsService, homeworkService } from './schoolService.js';

const LOADERS = [
  ['Ажлууд', tasksService],
  ['Календарийн үйл явдал', eventsService],
  ['Зорилго', goalsService],
  ['Төсөл', projectsService],
  ['Тэмдэглэл', journalService],
  ['Төрсөн өдөр', birthdaysService],
  ['AI яриа', aiService.conversations],
  ['AI мессеж', aiService.messages],
  ['AI санамж', aiService.memories],
  ['Хичээл', subjectsService],
  ['Хичээлийн хуваарь', classSessionsService],
  ['Гэрийн даалгавар', homeworkService],
];

/** Returns a list of { label, message, hint } for tables that failed. */
export async function loadAllData() {
  const results = await Promise.allSettled(LOADERS.map(([, service]) => service.load()));
  return results
    .map((r, i) => (r.status === 'rejected'
      ? { label: LOADERS[i][0], message: r.reason?.message || String(r.reason), hint: r.reason?.hint || '' }
      : null))
    .filter(Boolean);
}

export function exportAllData() {
  return JSON.stringify({ app: 'Life OS', exported_at: new Date().toISOString(), mode: store.meta().mode, data: store.snapshot() }, null, 2);
}
