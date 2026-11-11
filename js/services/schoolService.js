/**
 * Сургууль — хичээл, хичээлийн хуваарь, гэрийн даалгавар.
 * Хүснэгтүүд: TABLES.subjects, TABLES.classSessions, TABLES.homework
 */
import { TABLES } from '../config.js';
import { createService } from './createService.js';
import { todayKey, addDaysKey, diffDays, fromKey, timeToMin, nowMinutes } from '../lib/dates.js';

/** Хичээлийн өнгө — сонгох боломжтой 8 өнгө (CSS дээр токен биш, хэрэглэгчийн сонголт). */
export const SUBJECT_COLORS = ['#DB2E72', '#14A09C', '#F0A21E', '#1F6FB5', '#7357D9', '#F07C3E', '#2E9E5B', '#8A93A3'];

export const CLASS_KINDS = [
  { value: 'lecture', label: 'Лекц' },
  { value: 'seminar', label: 'Семинар' },
  { value: 'lab', label: 'Лаборатори' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'other', label: 'Бусад' },
];
export const kindLabel = (k) => CLASS_KINDS.find((x) => x.value === k)?.label || 'Хичээл';

export const HOMEWORK_STATUSES = [
  { value: 'todo', label: 'Эхлээгүй' },
  { value: 'in_progress', label: 'Хийж байна' },
  { value: 'done', label: 'Дууссан' },
  { value: 'submitted', label: 'Илгээсэн' },
];
export const statusLabel = (s) => HOMEWORK_STATUSES.find((x) => x.value === s)?.label || 'Эхлээгүй';
export const isFinished = (h) => h.status === 'done' || h.status === 'submitted';

const hhmm = (t) => (t ? String(t).slice(0, 5) : null);

export const subjectsService = createService({
  key: 'subjects',
  tableName: TABLES.subjects,
  columns: ['id', 'name', 'teacher', 'color', 'created_at'],
  normalize: (row) => ({ ...row, name: row.name || '', teacher: row.teacher || '', color: row.color || SUBJECT_COLORS[0] }),
});

export const classSessionsService = createService({
  key: 'classSessions',
  tableName: TABLES.classSessions,
  columns: ['id', 'subject_id', 'weekday', 'start_time', 'end_time', 'room', 'kind', 'created_at'],
  normalize: (row) => ({
    ...row,
    weekday: Number(row.weekday) || 0,
    start_time: hhmm(row.start_time),
    end_time: hhmm(row.end_time),
    room: row.room || '',
    kind: row.kind || 'lecture',
  }),
});

const homeworkBase = createService({
  key: 'homework',
  tableName: TABLES.homework,
  columns: ['id', 'subject_id', 'title', 'description', 'assigned_date', 'start_date', 'start_time', 'due_date', 'due_time', 'estimated_minutes', 'status', 'completed_at', 'created_at'],
  normalize: (row) => ({
    ...row,
    title: row.title || '',
    description: row.description || '',
    start_time: hhmm(row.start_time),
    due_time: hhmm(row.due_time),
    estimated_minutes: row.estimated_minutes ? Number(row.estimated_minutes) : null,
    status: row.status || 'todo',
  }),
});

/** Дуусах агшин (ms) — цаггүй бол тухайн өдрийн төгсгөл. Хугацаагүй бол Infinity. */
export function dueMoment(h) {
  if (!h.due_date) return Infinity;
  const d = fromKey(h.due_date);
  const [hh, mm] = (h.due_time || '23:59').split(':').map(Number);
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

/** «2 өдөр 4 цаг», «3 цаг», «Хугацаа хэтэрсэн» гэх мэт. */
export function dueCountdown(h, now = Date.now()) {
  const ms = dueMoment(h) - now;
  if (!Number.isFinite(ms)) return 'Хугацаагүй';
  if (ms < 0) {
    const days = diffDays(h.due_date, todayKey());
    return days > 0 ? `${days} хоног хэтэрсэн` : 'Хугацаа хэтэрсэн';
  }
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const hrs = Math.floor((mins % 1440) / 60);
  if (d > 0) return hrs ? `${d} өдөр ${hrs} цаг үлдсэн` : `${d} өдөр үлдсэн`;
  if (hrs > 0) return `${hrs} цаг ${mins % 60} мин үлдсэн`;
  return `${mins} мин үлдсэн`;
}

export const homeworkService = {
  ...homeworkBase,
  open: () => homeworkBase.all().filter((h) => !isFinished(h)).sort((a, b) => dueMoment(a) - dueMoment(b)),
  finished: () => homeworkBase.all().filter(isFinished).sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || ''))),
  overdue: () => homeworkService.open().filter((h) => dueMoment(h) < Date.now()),
  /** `days` хоногийн дотор дуусах (хэтэрснийг оруулна). */
  dueWithin: (days) => {
    const limit = addDaysKey(todayKey(), days);
    return homeworkService.open().filter((h) => h.due_date && h.due_date <= limit);
  },
  async setStatus(h, status) {
    const done = status === 'done' || status === 'submitted';
    return homeworkBase.update(h.id, { status, completed_at: done ? (h.completed_at || new Date().toISOString()) : null });
  },
};

export const subjectById = (id) => (id ? subjectsService.get(id) : null);

/** Тухайн өдрийн хичээлүүд (гарагаар), эхлэх цагаар эрэмбэлсэн. */
export function classesOn(dateKey) {
  const weekday = fromKey(dateKey).getDay();
  return classSessionsService.all()
    .filter((s) => s.weekday === weekday)
    .sort((a, b) => (timeToMin(a.start_time) ?? 0) - (timeToMin(b.start_time) ?? 0));
}

/**
 * Дараагийн хичээл — өнөөдөр одоо явагдаж буй эсвэл эхлээгүй хичээл, байхгүй бол
 * ирэх 7 хоногийн эхнийх. → { session, subject, date, minutesUntil, ongoing } | null
 */
export function nextClass() {
  const now = nowMinutes();
  for (let i = 0; i < 8; i++) {
    const date = addDaysKey(todayKey(), i);
    for (const session of classesOn(date)) {
      const start = timeToMin(session.start_time) ?? 0;
      const end = timeToMin(session.end_time) ?? start + 80;
      if (i === 0 && end <= now) continue;
      const ongoing = i === 0 && start <= now;
      return { session, subject: subjectById(session.subject_id), date, ongoing, minutesUntil: i === 0 ? start - now : null };
    }
  }
  return null;
}
