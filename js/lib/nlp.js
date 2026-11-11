/**
 * Энгийн дүрмээр (AI-гүй) байгалийн хэлийг задлах.
 *
 * Монгол болон англи өгүүлбэрээс огноо, цаг, үргэлжлэх хугацаа, ач холбогдол,
 * #ангиллыг ялгаж авна. Жишээ нь:
 *   "Баасан гарагт 15 цагт тайлан илгээх чухал #ажил 1 цаг"
 *   "Маргааш 12:30-13:30 Маятай үдийн хоол"
 *   "Submit report Friday 3pm high priority #work 45m"
 * Хурдан нэмэх талбарууд болон Туслахын дүрмүүд үүнийг ашиглана.
 *
 * Тэмдэглэл: JavaScript-ийн \b зөвхөн латин үсгийг таньдаг тул кирилл
 * үгсийн хилийг L / R гэсэн lookaround-оор тодорхойлсон.
 */
import { toKey, addDays, startOfWeek } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');
const L = '(?<![\\p{L}\\p{N}])'; // үгийн эхлэл
const R = '(?![\\p{L}\\p{N}])';  // үгийн төгсгөл
const mn = (src) => new RegExp(src, 'iu');

/* ---------- англи ---------- */
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAY_FULL = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const WEEKDAY_ABBR = '(mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)';
const PREP = '(?:\\b(?:due\\s+(?:on\\s+|by\\s+)?|on\\s+|by\\s+|before\\s+|until\\s+))?';
const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 };
const monthIndex = (word) => MONTH_NAMES.indexOf(word.slice(0, 3).toLowerCase());
const weekdayIndex = (word) => DAY_NAMES.indexOf(word.slice(0, 3).toLowerCase());

/* ---------- монгол ---------- */
const MN_WEEKDAYS = { ням: 0, даваа: 1, мягмар: 2, лхагва: 3, пүрэв: 4, баасан: 5, бямба: 6 };
const MN_WEEKDAY_RE = '(даваа|мягмар|лхагва|пүрэв|баасан|бямба|ням)';
const MN_PERIOD = '(өглөө|үдээс\\s+өмнө|үдээс\\s+хойш|өдөр|үдэш|орой|шөнө)';

/** Өнгөрсөн огноо бол дараа жилийнх гэж үзнэ ("3-р сарын 3"-ыг 12-р сард бичвэл). */
function futureDate(today, month, day, year) {
  const d = new Date(year ?? today.getFullYear(), month, day);
  if (d.getMonth() !== month) return null; // 2-р сарын 31 гэх мэт
  if (year == null && d < today) return new Date(today.getFullYear() + 1, month, day);
  return d;
}

function to24(h, min, suffix) {
  let hour = Number(h);
  const m = Number(min || 0);
  if (hour > 23 || m > 59) return null;
  if (suffix) {
    if (hour > 12 || hour === 0) return null;
    hour = (hour % 12) + (/p/i.test(suffix) ? 12 : 0);
  }
  return `${pad(hour)}:${pad(m)}`;
}

/** Монгол цагийн үе (өглөө, орой…) + цаг → 24 цагийн формат. */
function mnHour(period, h, min) {
  let hour = Number(h);
  if (hour > 23 || Number(min || 0) > 59) return null;
  const p = (period || '').replace(/\s+/g, ' ').toLowerCase();
  if (/хойш|үдэш|орой/.test(p) && hour < 12) hour += 12;
  else if (p === 'шөнө' && hour >= 8 && hour < 12) hour += 12;
  else if (/өглөө|өмнө/.test(p) && hour === 12) hour = 0;
  else if (!p && hour >= 1 && hour <= 7) hour += 12; // "3 цагт" ихэвчлэн 15:00
  return `${pad(hour)}:${pad(min || 0)}`;
}

/**
 * { rest, date, time, endTime, priority, category, minutes } буцаана.
 * `rest` нь танигдсан хэсгүүдийг хассан үлдэгдэл текст.
 */
export function parseNatural(input, { now = new Date() } = {}) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out = { rest: '', date: null, time: null, endTime: null, priority: null, category: null, minutes: null };
  let s = ` ${String(input || '')} `;

  // Хэв таарч, боловсруулагч зөвшөөрвөл тухайн хэсгийг текстээс хасна.
  const take = (re, handler) => {
    const m = s.match(re);
    if (!m || handler(m) === false) return false;
    s = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`;
    return true;
  };
  const setDate = (d) => { out.date = toKey(d); };

  // ── #ангилал
  take(/(?:^|\s)#([\p{L}\p{N}_-]+)/u, (m) => { out.category = m[1].charAt(0).toUpperCase() + m[1].slice(1); });

  // ── ач холбогдол
  take(/\bpriority\s*[:=]?\s*(high|medium|med|low)\b/i, (m) => { out.priority = /^med/i.test(m[1]) ? 'medium' : m[1].toLowerCase(); })
    || take(mn(`${L}(?:!өндөр|!чухал)${R}|${L}(?:чухал|яаралтай|нэн\\s+тэргүүнд)${R}|${L}өндөр\\s+ач\\s+холбогдол\\p{L}*`), () => { out.priority = 'high'; })
    || take(mn(`${L}!бага${R}|${L}бага\\s+ач\\s+холбогдол\\p{L}*`), () => { out.priority = 'low'; })
    || take(mn(`${L}!дунд${R}|${L}дунд\\s+ач\\s+холбогдол\\p{L}*`), () => { out.priority = 'medium'; })
    || take(/\s(?:!high|!h|!!+|p1)(?=\s)|\b(?:high[- ]priority|urgent|asap|important)\b/i, () => { out.priority = 'high'; })
    || take(/\s(?:!low|!l|p3)(?=\s)|\blow[- ]priority\b/i, () => { out.priority = 'low'; })
    || take(/\s(?:!medium|!med|!m|p2)(?=\s)|\b(?:medium|normal)[- ]priority\b/i, () => { out.priority = 'medium'; });

  // ── үргэлжлэх хугацаа ("45 мин", "2 цаг", "1 цаг 30 мин", "хагас цаг", "45m", "for 2 hours")
  take(mn(`${L}хагас\\s+цаг(?:ийн)?${R}`), () => { out.minutes = 30; })
    || take(mn(`${L}(\\d+(?:[.,]\\d+)?)\\s*цаг(?!т|аас)(?:ийн)?(?:\\s*(\\d+)\\s*мин\\p{L}*)?${R}`), (m) => {
      out.minutes = Math.round(parseFloat(m[1].replace(',', '.')) * 60 + (m[2] ? Number(m[2]) : 0));
    })
    || take(mn(`${L}(\\d+)\\s*мин(?:ут)?\\p{L}*`), (m) => { out.minutes = Number(m[1]); })
    || take(mn(`${L}нэг\\s+цаг(?:ийн)?${R}`), () => { out.minutes = 60; })
    || take(/\b(?:for\s+|takes?\s+|about\s+)?half\s+an\s+hour\b/i, () => { out.minutes = 30; })
    || take(/\b(?:for\s+|takes?\s+|about\s+|~\s*)?(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b(?:\s*(?:and\s+)?(\d+)\s*(?:m|min|mins|minutes?)\b)?/i, (m) => {
      out.minutes = Math.round(parseFloat(m[1]) * 60 + (m[2] ? Number(m[2]) : 0));
    })
    || take(/\b(?:for\s+|takes?\s+|about\s+|~\s*)?(\d+)\s*(?:m|min|mins|minutes?)\b/i, (m) => { out.minutes = Number(m[1]); })
    || take(/\b(?:for\s+|takes?\s+)?(?:an?|one)\s+hour\b/i, () => { out.minutes = 60; });

  // ── цагийн муж ("12:30-13:30", "14-16 цагт", "2-4pm")
  take(new RegExp(`(?:\\bfrom\\s+)?\\b([01]?\\d|2[0-3]):([0-5]\\d)\\s*(?:-|–|to|until|till)\\s*([01]?\\d|2[0-3]):([0-5]\\d)(?:\\s*(?:цаг(?:т|ийн\\s+хооронд)|-?\\s*н?д)${R})?`, 'iu'), (m) => {
    out.time = `${pad(m[1])}:${m[2]}`;
    out.endTime = `${pad(m[3])}:${m[4]}`;
  })
    || take(mn(`${L}(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s*цаг(?:т|ийн\\s+хооронд)?${R}`), (m) => {
      let a = Number(m[1]);
      let b = Number(m[2]);
      if (a > 23 || b > 23) return false;
      if (b <= 7) { b += 12; if (a <= b - 12) a += 12; }
      out.time = `${pad(a)}:00`;
      out.endTime = `${pad(b)}:00`;
    })
    || take(/\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/i, (m) => {
      const end = to24(m[4], m[5], m[6]);
      let start = to24(m[1], m[2], m[3] || m[6]);
      if (!start || !end) return false;
      if (!m[3] && start > end) start = to24(m[1], m[2], /p/i.test(m[6]) ? 'am' : 'pm');
      out.time = start;
      out.endTime = end;
    });

  // ── нэг цаг ("15 цагт", "орой 7 цагт", "15:00-д", "3pm", "noon")
  if (!out.time) {
    take(mn(`(?:${L}${MN_PERIOD}\\s+)?${L}(\\d{1,2})(?::(\\d{2}))?\\s*цаг(?:т|аас)${R}`), (m) => {
      const t = mnHour(m[1], m[2], m[3]);
      if (!t) return false;
      out.time = t;
    })
      || take(mn(`${L}${MN_PERIOD}\\s+(\\d{1,2}):(\\d{2})(?:\\s*-?\\s*н?д${R}|\\s*цаг(?:т|аас)${R})?`), (m) => {
        const t = mnHour(m[1], m[2], m[3]);
        if (!t) return false;
        out.time = t;
      })
      || take(new RegExp(`(?:\\b(?:at|by|from)\\s*|@\\s*)?\\b([01]?\\d|2[0-3]):([0-5]\\d)(?:\\s*-?\\s*н?д${R}|\\s*цаг(?:т|аас)${R})?`, 'iu'), (m) => { out.time = `${pad(m[1])}:${m[2]}`; })
      || take(/(?:\b(?:at|by|from)\s*|@\s*)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/i, (m) => {
        const t = to24(m[1], m[2], m[3]);
        if (!t) return false;
        out.time = t;
      })
      || take(mn(`${L}үд(?:ийн\\s+цагаар|\\s+дунд)${R}`), () => { out.time = '12:00'; })
      || take(/\b(?:at\s+)?noon\b/i, () => { out.time = '12:00'; })
      || take(/\b(?:at\s+)?midnight\b/i, () => { out.time = '00:00'; })
      || take(/(?:\bat|@)\s*(\d{1,2})\b(?!\s*(?:days?|weeks?|months?|hours?|mins?|minutes?|[%/.-]))/i, (m) => {
        let h = Number(m[1]);
        if (h < 1 || h > 23) return false;
        if (h <= 7) h += 12;
        out.time = `${pad(h)}:00`;
      });
  }

  // ── огноо (монгол)
  const nextWeekStart = () => addDays(startOfWeek(today), 7);
  take(mn(`${L}нөгөөдөр${R}|${L}нөгөөдр\\p{L}*`), () => setDate(addDays(today, 2)))
    || take(mn(`${L}өнөөдөр${R}|${L}өнөөдр\\p{L}*|${L}өнөө(?:\\s+(?:орой|өглөө|үдэш|шөнө))?${R}`), () => setDate(today))
    || take(mn(`${L}маргааш\\p{L}*`), () => setDate(addDays(today, 1)))
    || take(mn(`${L}(\\d+)\\s*долоо\\s+хоног\\p{L}*\\s+дараа\\p{L}*`), (m) => setDate(addDays(today, Number(m[1]) * 7)))
    || take(mn(`${L}(\\d+)\\s*(?:хоног|өдөр|өдр)\\p{L}*\\s+дараа\\p{L}*`), (m) => setDate(addDays(today, Number(m[1]))))
    || take(mn(`${L}(?:ирэх|дараа(?:гийн)?)\\s+долоо\\s+хоног(?:т|од|ийн\\s+эхэнд)?${R}`), () => setDate(nextWeekStart()))
    || take(mn(`${L}(\\d{1,2})\\s*-?\\s*(?:р|дүгээр|дугаар)?\\s*сар(?:ын)?\\s+(\\d{1,2})(?:\\s*-?\\s*(?:нд|ний|ны|д))?${R}`), (m) => {
      const d = futureDate(today, Number(m[1]) - 1, Number(m[2]), null);
      if (!d) return false;
      setDate(d);
    })
    || take(mn(`${L}(?:(ирэх|энэ|дараа\\s+долоо\\s+хоногийн)\\s+)?${MN_WEEKDAY_RE}(?:н?д|т)?(?:\\s+гар[иа]г\\p{L}*)?${R}`), (m) => {
      const target = MN_WEEKDAYS[m[2].toLowerCase()];
      if (m[1] && /^дараа/i.test(m[1])) {
        const start = nextWeekStart();
        setDate(addDays(start, (target - start.getDay() + 7) % 7));
        return true;
      }
      let diff = (target - today.getDay() + 7) % 7;
      if (diff === 0 && !(m[1] && /энэ/i.test(m[1]))) diff = 7;
      setDate(addDays(today, diff));
      return true;
    });

  // ── огноо (англи, тоон)
  if (!out.date) {
    take(/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => {
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      if (d.getMonth() !== +m[2] - 1) return false;
      setDate(d);
    })
      || take(new RegExp(`${PREP}\\b(?:the\\s+)?day\\s+after\\s+tomorrow\\b`, 'i'), () => setDate(addDays(today, 2)))
      || take(new RegExp(`${PREP}\\b(?:today|tonight|this\\s+(?:morning|afternoon|evening))\\b`, 'i'), () => setDate(today))
      || take(new RegExp(`${PREP}\\b(?:tomorrow|tmrw|tmr)\\b`, 'i'), () => setDate(addDays(today, 1)))
      || take(/\bin\s+(\d+|an?|one|two|three|four|five|six|seven|ten)\s+(days?|weeks?)\b/i, (m) => {
        const n = NUM_WORDS[m[1].toLowerCase()] ?? Number(m[1]);
        setDate(addDays(today, n * (/week/i.test(m[2]) ? 7 : 1)));
      })
      || take(new RegExp(`${PREP}\\bnext\\s+week\\b`, 'i'), () => setDate(nextWeekStart()))
      || take(new RegExp(`${PREP}\\b(?:the\\s+)?end\\s+of\\s+(?:the\\s+|this\\s+)?week\\b`, 'i'), () => setDate(addDays(today, (5 - today.getDay() + 7) % 7)))
      || take(new RegExp(`${PREP}\\b(?:this\\s+|the\\s+)?weekend\\b`, 'i'), () => setDate(addDays(today, (6 - today.getDay() + 7) % 7)))
      || take(new RegExp(`${PREP}\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'), (m) => {
        const d = futureDate(today, monthIndex(m[1]), +m[2], m[3] ? +m[3] : null);
        if (!d) return false;
        setDate(d);
      })
      || take(new RegExp(`${PREP}\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?`, 'i'), (m) => {
        const d = futureDate(today, monthIndex(m[2]), +m[1], m[3] ? +m[3] : null);
        if (!d) return false;
        setDate(d);
      })
      || take(new RegExp(`${PREP}\\b(?:(next|this|coming)\\s+)?${WEEKDAY_FULL}\\b`, 'i'), (m) => weekdayDate(m[1], m[2]))
      || take(new RegExp(`\\b(on|by|next|this|due)\\s+${WEEKDAY_ABBR}\\b\\.?`, 'i'), (m) => weekdayDate(/next|this/i.test(m[1]) ? m[1] : null, m[2]))
      || take(new RegExp(`${PREP}\\b(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?\\b`), (m) => {
        const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
        const d = futureDate(today, Number(m[1]) - 1, Number(m[2]), year);
        if (!d) return false;
        setDate(d);
      });
  }

  function weekdayDate(modifier, word) {
    const target = weekdayIndex(word);
    let diff = (target - today.getDay() + 7) % 7;
    if (diff === 0 && !(modifier && /this/i.test(modifier))) diff = 7;
    setDate(addDays(today, diff));
  }

  out.rest = s.replace(/\s+/g, ' ').trim();
  return out;
}

/* ---------- гарчиг цэвэрлэх ---------- */

const TRAILING = /(?:[\s,;:.!\-–]+|\s+(?:on|at|by|for|due|from|in|the|and|to|with|before|until|of|a)|\s+(?:-?н?д|цагт|цагаас|гар[иа]гт|нь|ба|болон|хүртэл))$/i;
function tidy(text) {
  let t = ` ${text} `.replace(/\s+/g, ' ').trim();
  let prev;
  do {
    prev = t;
    t = t.replace(TRAILING, '').trim();
    t = t.replace(/^(?:[,;:\-–]\s*|to\s+|and\s+|-?н?д\s+)/i, '').trim();
  } while (t !== prev);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

export function cleanTaskTitle(text) {
  let t = ` ${text} `;
  // монгол
  t = t.replace(/^\s*(?:шинэ\s+)?(?:ажил|даалгавар|сануулга)\s*(?:нэм(?:эх|ээрэй)?)?\s*[:\-–]\s*/iu, ' ');
  t = t.replace(/^\s*сануул(?:аарай|ах)?\s*[:\-–]?\s*/iu, ' ');
  t = t.replace(/^\s*(?:эцсийн\s+хугацаа|дедлайн)\s*[:\-–]?\s*/iu, ' ');
  t = t.replace(/\s*(?:гэсэн\s+|гэж\s+)?(?:ажил|даалгавар)?\s*(?:нэмээрэй|нэмээч|нэмэх|нэм|оруулаарай)\s*[.!]?\s*$/iu, ' ');
  t = t.replace(/\s*(?:гэж\s+)?сануулаарай\s*[.!]?\s*$/iu, ' ');
  t = t.replace(/\s+(?:хэрэгтэй|ёстой)\s*[.!]?\s*$/iu, ' ');
  // англи
  t = t.replace(/^\s*(?:please\s+)?(?:can you\s+|could you\s+)?(?:add|create|make|new|put)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|todo|to-do|reminder)?\s*(?:to\s+(?:my\s+)?(?:list|tasks)\s*)?(?::|-|–)?\s*/i, ' ');
  t = t.replace(/^\s*(?:task|todo|to-do|reminder)\s*(?::|-|–)\s*/i, ' ');
  t = t.replace(/^\s*remind\s+me\s+(?:to\s+)?/i, ' ');
  t = t.replace(/^\s*(?:i\s+)?(?:need|have|must|should|gotta)\s+(?:to\s+)?/i, ' ');
  t = t.replace(/^\s*deadline\s*(?:for|:|-)?\s*/i, ' ');
  return tidy(t);
}

export function cleanEventTitle(text) {
  let t = ` ${text} `;
  // монгол
  t = t.replace(/^\s*(?:шинэ\s+)?(?:арга\s+хэмжээ|үйл\s+явдал)\s*(?:нэм(?:эх|ээрэй)?)?\s*[:\-–]\s*/iu, ' ');
  t = t.replace(/\s*(?:календарь|хуанли)(?:т|д|нд)?\s*(?:нэмээрэй|нэм|оруулаарай)?\s*[.!]?\s*$/iu, ' ');
  t = t.replace(/\s*(?:товлоорой|товлох|товло|нэмээрэй|нэмэх|нэм)\s*[.!]?\s*$/iu, ' ');
  // англи
  t = t.replace(/^\s*(?:please\s+)?(?:can you\s+|could you\s+)?(?:add|create|schedule|book|put|set\s+up|plan)\s+(?:an?\s+)?(?:new\s+)?(?:event\s*(?::|-|–)?\s*)?/i, ' ');
  t = t.replace(/^\s*event\s*(?::|-|–)\s*/i, ' ');
  t = t.replace(/\s+(?:to|in|on)\s+(?:my\s+)?calendar\b/i, ' ');
  return tidy(t);
}

/** Хурдан нэмэх талбарт: ажлын талбаруудыг буцаана (дурдаагүй бол null). */
export function parseTaskInput(text, options) {
  const p = parseNatural(text, options);
  return {
    title: cleanTaskTitle(p.rest),
    due_date: p.date,
    due_time: p.time,
    priority: p.priority,
    category: p.category,
    estimated_minutes: p.minutes,
  };
}
