/**
 * Огнооны туслах функцууд (монгол формат).
 *
 * Хуанлийн өдрийг "огнооны түлхүүр" буюу орон нутгийн цагаар бичсэн
 * "2026-11-01" гэх мөрөөр хадгална. Энэ нь Postgres-ийн `date` баганатай
 * яг таарч, цагийн бүсийн алдаанаас сэргийлнэ.
 */
import { prefs } from '../state/prefs.js';

const pad = (n) => String(n).padStart(2, '0');

export const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}-р сар`);
export const MONTHS_SHORT = Array.from({ length: 12 }, (_, i) => `${i + 1}-р сар`);
export const WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
export const WEEKDAYS_SHORT = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'];

export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function fromKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const todayKey = () => toKey(new Date());
export const isDateKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export function addDays(date, n) {
  const x = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
export const addDaysKey = (key, n) => toKey(addDays(fromKey(key), n));

/** a-аас b хүртэлх бүтэн өдрийн тоо (b − a). */
export const diffDays = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);

export function startOfWeek(date, weekStart = prefs.get().weekStart) {
  const x = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  x.setDate(x.getDate() - ((x.getDay() - Number(weekStart) + 7) % 7));
  return x;
}
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/** ISO хугацааны тэмдгийн (completed_at гэх мэт) орон нутгийн огноо. */
export const keyOfTimestamp = (iso) => (iso ? toKey(new Date(iso)) : null);

/** "11-р сарын 5" — өөр жил бол урд нь "2027 оны". */
function monthDay(d, withYear = d.getFullYear() !== new Date().getFullYear()) {
  return `${withYear ? `${d.getFullYear()} оны ` : ''}${d.getMonth() + 1}-р сарын ${d.getDate()}`;
}

export const fmt = {
  /** "11-р сарын 1, Ням" */
  long: (k) => { const d = fromKey(k); return `${monthDay(d)}, ${WEEKDAYS[d.getDay()]}`; },
  /** "Ня, 11-р сарын 1" */
  medium: (k) => { const d = fromKey(k); return `${WEEKDAYS_SHORT[d.getDay()]}, ${monthDay(d)}`; },
  /** "11-р сарын 1" */
  short: (k) => monthDay(fromKey(k)),
  /** "2026 оны 11-р сар" */
  monthYear: (d) => `${d.getFullYear()} оны ${d.getMonth() + 1}-р сар`,
  weekdayShort: (d) => WEEKDAYS_SHORT[d.getDay()],
  weekdayNarrow: (d) => WEEKDAYS_SHORT[d.getDay()],
  /** "11/1" */
  numeric: (k) => { const d = fromKey(k); return `${d.getMonth() + 1}/${d.getDate()}`; },
};

/** "Өнөөдөр", "Маргааш", "Баасан", "3 өдрийн өмнө", "11-р сарын 12" … */
export function relDay(key) {
  const n = diffDays(todayKey(), key);
  if (n === 0) return 'Өнөөдөр';
  if (n === 1) return 'Маргааш';
  if (n === -1) return 'Өчигдөр';
  if (n === 2) return 'Нөгөөдөр';
  if (n > 2 && n < 7) return WEEKDAYS[fromKey(key).getDay()];
  if (n < -1 && n > -7) return `${-n} өдрийн өмнө`;
  return fmt.short(key);
}

export function timeToMin(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}
export function minToTime(min) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "14:30"-г тохиргооны дагуу 24 эсвэл 12 цагийн форматаар. */
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  if (prefs.get().timeFormat === '24') return `${pad(h)}:${pad(m)}`;
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'ү.ө.' : 'ү.х.'}`;
}

/** 90 → "1 цаг 30 мин" */
export function fmtDuration(min) {
  if (!min) return '0 мин';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} мин`;
  return m ? `${h} цаг ${m} мин` : `${h} цаг`;
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Сайн байна уу';
  if (h < 12) return 'Өглөөний мэнд';
  if (h < 18) return 'Өдрийн мэнд';
  return 'Оройн мэнд';
}

export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
