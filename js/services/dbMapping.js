/**
 * Апп ↔ өгөгдлийн сангийн баганын хөрвүүлэлт.
 *
 * Таны Supabase сан өөрийн бүтэцтэй (жишээ нь ажлын хугацаа нэг `due_at`
 * timestamptz баганад, апп-д `due_date` + `due_time` хоёр талбар). Хуудсууд
 * апп-ын хэлбэрээр ажилласаар, энэ файл зөвхөн сантай харьцах үед хөрвүүлнэ.
 *
 *  toDb(clean, merged) — апп-ын талбаруудыг сангийн багана руу.
 *      clean  = хадгалах гэж буй талбарууд (шинэчлэхэд зөвхөн өөрчлөгдсөн нь)
 *      merged = одоогийн мөр + өөрчлөлт (хоёр талбараас нэг багана үүсгэхэд)
 *  fromDb(row) — сангийн мөрийг апп-ын талбар руу. Зөвхөн мөрөнд байгаа
 *      баганыг хөрвүүлнэ (хэсэгчилсэн мөр ч болно).
 *
 * Огноо, цагийг хэрэглэгчийн хөтчийн цагийн бүсээр (Улаанбаатар) тооцно.
 */
import { toKey } from '../lib/dates.js';

const has = (obj, ...keys) => keys.some((k) => k in obj);
const pad = (n) => String(n).padStart(2, '0');

/** '2026-11-12' + '15:30' → ISO (локал цагаар). */
export function localISO(dateKey, time = '00:00', seconds = 0) {
  const [y, m, d] = String(dateKey).slice(0, 10).split('-').map(Number);
  const [hh, mm] = String(time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, seconds).toISOString();
}

/** ISO → { date: '2026-11-12', time: '15:30', seconds } локал цагаар. */
export function splitLocal(iso) {
  const dt = new Date(iso);
  return { date: toKey(dt), time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`, seconds: dt.getSeconds() };
}

/* Цаггүй эцсийн хугацааг өдрийн төгсгөлөөр (23:59:59) хадгална — апп-ын
   цаг секундгүй тул 23:59:59 нь «цаг заагаагүй» гэдгийг давхардалгүй илэрхийлнэ. */
const END_OF_DAY = ['23:59', 59];

/* ── Ажил: notes↔description, done↔completed, due_date+due_time↔due_at ── */
export const tasksMap = {
  toDb(clean, merged = clean) {
    const out = { ...clean };
    if ('notes' in clean) { out.description = clean.notes ?? null; delete out.notes; }
    if ('status' in clean) out.status = clean.status === 'done' ? 'completed' : 'todo';
    if ('category' in clean) out.category = clean.category ?? ''; // багана null хүлээж авахгүй
    if (has(clean, 'due_date', 'due_time')) {
      const date = merged.due_date;
      out.due_at = date ? (merged.due_time ? localISO(date, merged.due_time) : localISO(date, ...END_OF_DAY)) : null;
      delete out.due_date; delete out.due_time;
    }
    return out;
  },
  fromDb(row) {
    const out = { ...row };
    if ('description' in row) { out.notes = row.description ?? ''; delete out.description; }
    if ('status' in row) out.status = row.status === 'completed' ? 'done' : 'todo';
    if ('due_at' in row) {
      if (row.due_at) {
        const s = splitLocal(row.due_at);
        out.due_date = s.date;
        out.due_time = s.time === END_OF_DAY[0] && s.seconds === END_OF_DAY[1] ? null : s.time;
      } else { out.due_date = null; out.due_time = null; }
      delete out.due_at;
    }
    return out;
  },
};

/* ── Үйл явдал: category↔event_type, event_date+start/end↔starts_at/ends_at ── */
export const eventsMap = {
  toDb(clean, merged = clean) {
    const out = { ...clean };
    if ('category' in clean) { out.event_type = clean.category || 'other'; delete out.category; }
    if (has(clean, 'event_date', 'start_time', 'end_time', 'all_day')) {
      const allDay = Boolean(merged.all_day) || !merged.start_time;
      out.all_day = allDay;
      out.starts_at = localISO(merged.event_date, allDay ? '00:00' : merged.start_time);
      out.ends_at = !allDay && merged.end_time ? localISO(merged.event_date, merged.end_time) : null;
      delete out.event_date; delete out.start_time; delete out.end_time;
    }
    return out;
  },
  fromDb(row) {
    const out = { ...row };
    if ('event_type' in row) { out.category = !row.event_type || row.event_type === 'event' ? 'other' : row.event_type; delete out.event_type; }
    if ('starts_at' in row) {
      const s = splitLocal(row.starts_at);
      out.event_date = s.date;
      out.start_time = row.all_day ? null : s.time;
      out.end_time = !row.all_day && row.ends_at ? splitLocal(row.ends_at).time : null;
      delete out.starts_at; delete out.ends_at;
    }
    return out;
  },
};

/* ── Тэмдэглэл: reflection↔content, сэтгэл санаа 1–5 ↔ текст ── */
const MOOD_KEYS = ['terrible', 'bad', 'okay', 'good', 'great'];
export const journalMap = {
  toDb(clean) {
    const out = { ...clean };
    if ('reflection' in clean) { out.content = clean.reflection ?? ''; delete out.reflection; }
    if ('mood' in clean) out.mood = clean.mood ? MOOD_KEYS[Number(clean.mood) - 1] ?? null : null;
    return out;
  },
  fromDb(row) {
    const out = { ...row };
    if ('content' in row) { out.reflection = row.content ?? ''; delete out.content; }
    if ('mood' in row) {
      const i = MOOD_KEYS.indexOf(row.mood);
      out.mood = i >= 0 ? i + 1 : (Number(row.mood) >= 1 && Number(row.mood) <= 5 ? Number(row.mood) : null);
    }
    return out;
  },
};

/* ── Төрсөн өдөр: name↔person_name, сар/өдөр/он ↔ birth_date (+ birth_year_known) ── */
const PLACEHOLDER_YEAR = 2000; // өндөр жил — 2-р сарын 29 хүчинтэй
export const birthdaysMap = {
  toDb(clean, merged = clean) {
    const out = { ...clean };
    if ('name' in clean) { out.person_name = clean.name; delete out.name; }
    if (has(clean, 'birth_month', 'birth_day', 'birth_year')) {
      const year = merged.birth_year ? Number(merged.birth_year) : null;
      out.birth_date = `${year || PLACEHOLDER_YEAR}-${pad(merged.birth_month)}-${pad(merged.birth_day)}`;
      out.birth_year_known = Boolean(year);
      delete out.birth_month; delete out.birth_day; delete out.birth_year;
    }
    return out;
  },
  fromDb(row) {
    const out = { ...row };
    if ('person_name' in row) { out.name = row.person_name; delete out.person_name; }
    if ('birth_date' in row && row.birth_date) {
      const [y, m, d] = String(row.birth_date).slice(0, 10).split('-').map(Number);
      out.birth_month = m; out.birth_day = d;
      out.birth_year = row.birth_year_known === false ? null : y;
      delete out.birth_date; delete out.birth_year_known;
    }
    return out;
  },
};

/* ── AI мессеж: actions + source ↔ metadata (jsonb) ── */
export const aiMessagesMap = {
  toDb(clean, merged = clean) {
    const out = { ...clean };
    if ('content' in clean) out.content = clean.content ?? '';
    if (has(clean, 'actions', 'source')) {
      out.metadata = { actions: merged.actions ?? [], source: merged.source ?? null };
      delete out.actions; delete out.source;
    }
    return out;
  },
  fromDb(row) {
    const out = { ...row };
    if ('metadata' in row) {
      out.actions = row.metadata?.actions ?? [];
      out.source = row.metadata?.source ?? null;
      delete out.metadata;
    }
    return out;
  },
};
