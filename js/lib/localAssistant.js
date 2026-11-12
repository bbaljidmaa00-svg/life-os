/**
 * Туслах хуудасны дүрэмд суурилсан туслагч.
 *
 * ⚠️ Энэ бол AI загвар БИШ. Тогтсон командуудыг энгийн дүрмээр (regex)
 * таньж, таны өөрийн өгөгдөл (planner + insights) дээр тулгуурлан хариулна.
 * UI дээр хариулт бүр "Дүрмийн хариулт" гэсэн шошготой. config.js-д AI_ENDPOINT
 * тохируулбал aiService мессежийг жинхэнэ загвар руу илгээнэ.
 *
 * Хариултын хэлбэр нь жинхэнэ загварынхтай ижил:
 *   { content: string, actions: Action[], source: 'local-rules' }
 * Actions нь хэрэглэгч товчоор баталгаажуулах саналууд (pages/assistant.js).
 * Монгол болон англи командыг хоёуланг нь таньдаг.
 */
import { parseNatural, cleanTaskTitle, cleanEventTitle } from './nlp.js';
import { planDay, planWeek, freeSlots, DEFAULT_ESTIMATE } from './planner.js';
import { computeStats } from './insights.js';
import { tasksService, compareTasks, sortTasks } from '../services/tasksService.js';
import { eventsService } from '../services/eventsService.js';
import { projectsService, goalsService } from '../services/goalsService.js';
import { homeworkService, dueMoment as homeworkDue, dueCountdown, subjectById } from '../services/schoolService.js';
import { ordersService, isOrderLate } from '../services/workService.js';
import { birthdaysService } from '../services/birthdaysService.js';
import { prefs } from '../state/prefs.js';
import { todayKey, addDaysKey, relDay, fmt, fmtTime, fmtDuration, minToTime, timeToMin, nowMinutes, diffDays } from './dates.js';

/* Гол 3 асуулт — Туслах хуудасны товчнууд ч эдгээрийг ашиглана. */
export const KEY_QUESTIONS = [
  { label: 'Би хэзээ завтай вэ?', icon: 'clock', emoji: '🕐', prompt: 'Би хэзээ завтай вэ?' },
  { label: 'Юу хийгээгүй байна?', icon: 'list', emoji: '📋', prompt: 'Юу юу хийгээгүй байна?' },
  { label: 'Хамгийн чухал нь юу вэ?', icon: 'zap', emoji: '⭐', prompt: 'Хамгийн чухал хийх зүйл юу вэ?' },
];
const FREE_RE = /завтай|зав\s*(гарах|байх|байна|хэзээ)|хэзээ\s*зав|чөлөөтэй|чөлөөт\s*цаг|сул\s*цаг|zawtai|zavtai|zaw\s*(bai|bgaa|ba)|chuluutei|when am i free|free time|\bam i free\b/;
const NOTDONE_RE = /хийгээгүй|хийгдээгүй|дуусаагүй|хоцорсон|хугацаа хэтэрсэн|үлдсэн ажил|юу\s+үлдсэн|hiigeegui|hiigegui|hiigdeegui|duusaagui|uldsen/;
const IMPORTANT_RE = /хамгийн\s+чухал|чухал\s+нь\s+юу|юунаас\s+эхл|эхлээд\s+юу|юуг\s+эхлээд|юу\s+хийх\s+ёстой|hamgiin\s+ch[uy]k?hal|ch[uy]k?hal\s+n[iy]?\s|ehleed\s+yu|most important|what should i do first|priorit/;

// Кирилл үгэнд \b ажилладаггүй тул энгийн "агуулж байна уу" шалгалт хийнэ.
const has = (text, re) => re.test(text);
const EVENT_WORDS = /\b(meeting|meet with|appointment|call with|lunch|dinner|breakfast|brunch|coffee with|interview|class|lecture|seminar|event|party|conference|webinar|workshop|doctor|dentist|concert|flight)\b|уулзалт|уулзах|хурал|үдийн хоол|оройн хоол|өглөөний цай|кофе|ярилцлага|хичээл|лекц|семинар|сургалт|эмч|тоглолт|үдэшлэг|арга хэмжээ|нислэг|вебинар/i;

const reply = (content, actions = []) => ({ content, actions, source: 'local-rules' });
const proposal = (type, data) => ({ type, data, status: 'pending' });

/** "Өнөөдөр, 11-р сарын 1" эсвэл "11-р сарын 6, Баасан" */
function dayLabel(key) {
  const rel = relDay(key);
  return ['Өнөөдөр', 'Маргааш', 'Нөгөөдөр'].includes(rel) ? `${rel}, ${fmt.short(key)}` : fmt.long(key);
}

/** 3 гол асуулт уу? — эдгээрийг AI асаалттай үед ч энд (үнэгүй, хичээл/ээлж тооцсон) хариулна. */
export function isKeyQuestion(text) {
  const low = String(text || '').trim().toLowerCase();
  return FREE_RE.test(low) || IMPORTANT_RE.test(low) || NOTDONE_RE.test(low);
}

export function respond(text) {
  const t = String(text || '').trim();
  const low = t.toLowerCase();
  if (!t) return fallback();

  // Тодорхой командууд түлхүүр үгээс түрүүлж шийдэгдэнэ ("Ажил: тайлан илгээх" бол ажил).
  if (/^(please\s+)?((add|create|new|make)\s+(a\s+|an\s+)?(new\s+)?(task|todo|to-do|reminder)\b|remind me\b|(task|todo|to-do)\s*:)/.test(low)
    || /^(шинэ\s+)?(ажил|даалгавар|сануулга)\s*(нэм(эх|ээрэй)?)?\s*[:\-–]|^сануул/.test(low)
    || /(ажил|даалгавар)\s+нэм(ээрэй|ээч|эх)?\s*[.!]?$|сануулаарай\s*[.!]?$/.test(low)) {
    return taskProposal(t, /deadline|эцсийн хугацаа|дедлайн/.test(low));
  }
  if (/^(please\s+)?((add|create|new|schedule|book)\s+(an?\s+)?(new\s+)?(event|meeting|appointment)\b|event\s*:)/.test(low)
    || /^(шинэ\s+)?(арга хэмжээ|үйл явдал)\s*(нэм(эх|ээрэй)?)?\s*[:\-–]|(календарь|хуанли)(т|д|нд)?\s*(нэм|оруул)/.test(low)) {
    return eventProposal(t);
  }

  if (FREE_RE.test(low)) return freeTime(t);
  if (IMPORTANT_RE.test(low)) return mostImportant();
  if (NOTDONE_RE.test(low)) return notDone();
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b[!. ]*$/i.test(t) || /^(сайн уу|сайн байна уу|сайн байцгаана уу|сайхан амарсан уу)[!.?\s]*$/i.test(t)) return help(true);
  if (/\b(help|what can you do|commands)\b/.test(low) || has(low, /тусламж|юу хийж чадах|команд/)) return help(false);
  if (/\b(break(?:ing)?\s+(?:it\s+|this\s+)?down|break\b.+\binto\b|split\b.+\binto\b|sub-?tasks?|steps\s+(?:for|to))\b/.test(low) || has(low, /задла|дэд ажил|алхам болго|хэсэгчил/)) return breakdown(t);
  if (/^(please\s+)?remember\b/.test(low) || /^(санаарай|санаж ав|тэмдэглэж ав)|гэдгийг санаарай\s*[.!]?$/.test(low)) return memory(t);
  if (/\b(unfinished|overdue|incomplete|pending|what'?s left|left to do|review (?:my )?tasks|open tasks|not done|backlog)\b/.test(low) || has(low, /дуусаагүй|хоцорсон|хугацаа хэтэрсэн|үлдсэн ажил|хийгээгүй|хийгдээгүй/)) return review();
  if (/\b(insights?|productiv\w*|stats|statistics|how am i doing|how did i do|my progress|(weekly|progress|productivity) report)\b/.test(low) || has(low, /статистик|бүтээмж|үзүүлэлт|ахиц|яаж байна/)) return insights();
  if (/\b(plan|schedule|organi[sz]e|map out)\b.*\bweek\b|\bweekly\s+(plan|schedule)\b/.test(low) || has(low, /долоо хоног.*(төлөвлө|хуваарь|хуваарила)|(төлөвлө|хуваарь).*долоо хоног/)) return weekPlan();
  if (!EVENT_WORDS.test(low) && (/\b(plan|schedule|organi[sz]e|map out)\b.*\b(day|today|tomorrow)\b|\bdaily\s+(plan|schedule)\b|\bwhat should i (do|work on)\b/.test(low)
    || has(low, /(өдр(өө|ийг|ийн)|өнөөдр(өө|ийг)|маргааш(ийг|ийн)?).*(төлөвлө|хуваарь)|(төлөвлө|хуваарь).*(өдөр|өдр|маргааш)|юу хийх вэ|юу хийвэл/))) {
    return dayPlan(/\btomorrow\b|маргааш/.test(low) ? addDaysKey(todayKey(), 1) : todayKey());
  }
  if ((/^(what|when|which|show|list|do i have|anything)\b/.test(low) && /\b(today|tomorrow|agenda|calendar|events?|meetings?|schedule|on)\b/.test(low))
    || has(low, /(юу|ямар).*(байгаа|байна|төлөвлөсөн|товлосон)|календарь(т|д)? юу|хуваарь(т)? юу/)) return agenda(t);
  if (EVENT_WORDS.test(low)) return eventProposal(t);
  const parsed = parseNatural(t);
  if (/\b(add|create|new|remind me|todo|to-do|task|need to|have to|must|deadline|due)\b/.test(low) || has(low, /нэм|хэрэгтэй|ёстой|эцсийн хугацаа/) || parsed.date || parsed.time) {
    return taskProposal(t, /deadline|эцсийн хугацаа|дедлайн/.test(low));
  }
  return fallback();
}

/* ---------- командууд ---------- */

function taskProposal(text, isDeadline) {
  const p = parseNatural(text);
  const title = cleanTaskTitle(p.rest);
  if (!title) return reply('Ажил нэмж болно, гэхдээ ажлын нэрийг олсонгүй. Жишээ нь: “Ажил: Баасан гарагт паспорт сунгах”.');
  const data = {
    title,
    due_date: p.date,
    due_time: p.time,
    priority: p.priority || (isDeadline ? 'high' : prefs.get().defaultPriority),
    category: p.category || '',
    estimated_minutes: p.minutes || Number(prefs.get().defaultDuration) || DEFAULT_ESTIMATE,
  };
  const notes = [];
  if (!p.date) notes.push('огноо дурдаагүй тул эцсийн хугацаагүй');
  if (!p.minutes) notes.push(`хугацааг ${fmtDuration(data.estimated_minutes)} гэж тооцсон`);
  return reply(`Таны мессежээс ингэж ойлголоо. Мэдээллээ шалгаад нэмээрэй${notes.length ? ` (${notes.join('; ')})` : ''}.`, [proposal('create_task', data)]);
}

function guessCategory(text) {
  if (/doctor|dentist|gym|yoga|run|therapy|clinic|эмч|фитнесс|йог|гүйлт|эмнэлэг|спорт/i.test(text)) return 'health';
  if (/lunch|dinner|coffee|party|drinks|brunch|friend|concert|үдийн хоол|оройн хоол|кофе|үдэшлэг|найз|тоглолт/i.test(text)) return 'social';
  if (/meeting|call|interview|client|stand-?up|review|workshop|conference|webinar|seminar|уулзалт|хурал|ярилцлага|үйлчлүүлэгч|семинар|сургалт|вебинар/i.test(text)) return 'work';
  return 'personal';
}

function eventProposal(text) {
  const p = parseNatural(text);
  const title = cleanEventTitle(p.rest);
  if (!title) return reply('Үйл явдал нэмж болно, гэхдээ нэрийг нь олсонгүй. Жишээ нь: “Маргааш 12:30-13:30 Маятай үдийн хоол”.');
  const date = p.date || todayKey();
  let start = p.time;
  if (!start) start = date === todayKey() ? minToTime(Math.min(Math.ceil((nowMinutes() + 1) / 60) * 60, 23 * 60)) : '09:00';
  const end = p.endTime || minToTime(Math.min(timeToMin(start) + (p.minutes || 60), 24 * 60 - 1));
  const assumed = [];
  if (!p.date) assumed.push('өнөөдөр');
  if (!p.time) assumed.push(`${fmtTime(start)}-д эхэлнэ`);
  if (!p.minutes && !p.endTime) assumed.push('1 цаг үргэлжилнэ');
  const data = { title, event_date: date, start_time: start, end_time: end, all_day: false, category: guessCategory(text), location: '' };
  return reply(`Үйл явдлыг ингэж ойлголоо${assumed.length ? ` — ${assumed.join(', ')} гэж тооцсон` : ''}. Нэмэхээсээ өмнө засаж болно.`, [proposal('create_event', data)]);
}

function memory(text) {
  const content = text
    .replace(/^(please\s+)?remember\s+(that\s+)?/i, '')
    .replace(/^(санаарай|санаж ав(аарай)?|тэмдэглэж ав(аарай)?)\s*[:\-–,]?\s*/i, '')
    .replace(/\s*гэдгийг\s+санаарай\s*[.!]?$/i, '')
    .trim();
  if (!content) return reply('Юуг санах вэ? Жишээ нь: “Санаарай: Би өглөө хамгийн сайн төвлөрдөг.”');
  return reply('Үүнийг санамжид хадгалах уу? Санамжууд таны өгөгдөлтэй хамт хадгалагдаж, AI загвар холбогдсоны дараа хүсэлт бүртэй хамт илгээгдэнэ.', [
    proposal('create_memory', { content: content.charAt(0).toUpperCase() + content.slice(1) }),
  ]);
}

/* ── 🕐 Би хэзээ завтай вэ? ───────────────────────────────────────────── */
function freeTime(text) {
  const parsed = parseNatural(text);
  const days = parsed.date ? [parsed.date] : Array.from({ length: 7 }, (_, i) => addDaysKey(todayKey(), i));
  const results = days.map((d) => freeSlots(d));
  const lines = ['Таны сул цаг (08:00–22:00 хооронд — үйл явдал, хичээл, ажлын ээлжийг хассан):'];
  results.forEach((r) => {
    if (r.dayOver) { lines.push(`• ${dayLabel(r.date)}: өнөөдрийн өдөр дуусах дөхжээ — амраарай 🌙`); return; }
    if (!r.slots.length) { lines.push(`• ${dayLabel(r.date)}: бүтэн завгүй`); return; }
    const parts = r.slots.slice(0, 4).map((x) => `${fmtTime(x.start)}–${fmtTime(x.end)}`);
    lines.push(`• ${dayLabel(r.date)}: ${parts.join(', ')}${r.slots.length > 4 ? ` (+${r.slots.length - 4})` : ''} — нийт ${fmtDuration(r.freeMinutes)}`);
  });
  const first = results.find((r) => r.slots.length);
  if (first) lines.push('', `👉 Хамгийн ойрын зав: ${dayLabel(first.date)} ${fmtTime(first.slots[0].start)}–${fmtTime(first.slots[0].end)} (${fmtDuration(first.slots[0].minutes)}).`);
  if (results.length > 1) {
    const best = [...results].sort((a, b) => b.freeMinutes - a.freeMinutes)[0];
    if (best.freeMinutes) lines.push(`🌟 Хамгийн их завтай өдөр: ${dayLabel(best.date)} — ${fmtDuration(best.freeMinutes)}.`);
  }
  return reply(lines.join('\n'), [
    { type: 'link', status: 'info', data: { label: 'Календарьт харах', href: `#/calendar?view=${parsed.date ? 'day' : 'week'}&date=${parsed.date || todayKey()}` } },
  ]);
}

/* ── 📋 Юу хийгээгүй байна? ──────────────────────────────────────────── */
function notDone() {
  const today = todayKey();
  const tomorrow = addDaysKey(today, 1);
  const open = tasksService.open();
  const overdue = sortTasks(open.filter((t) => t.due_date && t.due_date < today));
  const dueToday = sortTasks(open.filter((t) => t.due_date === today));
  const homework = homeworkService.open().filter((h) => h.due_date && h.due_date <= tomorrow);
  const orders = ordersService.open().filter((o) => o.due_date && o.due_date <= tomorrow);
  const shown = new Set([...overdue, ...dueToday].map((t) => t.id));
  const steps = projectsService.all().filter((p) => p.status === 'active')
    .map((p) => ({ p, t: sortTasks(tasksService.byProject(p.id).filter((t) => t.status !== 'done'))[0] }))
    .filter((x) => x.t && !shown.has(x.t.id)).slice(0, 4);
  const later = open.filter((t) => t.due_date && t.due_date > today).length;
  const undated = open.filter((t) => !t.due_date).length;

  if (!overdue.length && !dueToday.length && !homework.length && !orders.length && !steps.length) {
    return reply(`Яаралтай хийх зүйл алга — бүгдийг хийчихсэн байна 🎉${later || undated ? `\nДараа хийх ${later} зүйл, огноогүй ${undated} зүйл үлдсэн.` : ''}`);
  }
  const list = (items, fmtItem, max = 5) => [...items.slice(0, max).map(fmtItem), ...(items.length > max ? [`  …бас ${items.length - max}`] : [])];
  const lines = ['Хийгээгүй зүйлс:'];
  if (overdue.length) lines.push('', `⏰ Хугацаа хэтэрсэн (${overdue.length}):`, ...list(overdue, (t) => `• ${t.title} — ${diffDays(t.due_date, today)} хоног хэтэрсэн`));
  if (dueToday.length) lines.push('', `📅 Өнөөдөр хийх (${dueToday.length}):`, ...list(dueToday, (t) => `• ${t.title}${t.due_time ? ` (${fmtTime(t.due_time)} гэхэд)` : ''}`));
  if (homework.length) lines.push('', `📚 Гэрийн даалгавар (${homework.length}):`, ...list(homework, (h) => `• ${h.title}${subjectById(h.subject_id) ? ` · ${subjectById(h.subject_id).name}` : ''} — ${dueCountdown(h)}`));
  if (orders.length) lines.push('', `📦 Захиалга (${orders.length}):`, ...list(orders, (o) => `• ${o.customer_name} — ${o.items}${isOrderLate(o) ? ' — хоцорсон!' : ` — ${relDay(o.due_date)}`}`));
  if (steps.length) lines.push('', '🌱 Төслүүдийн дараагийн алхам:', ...steps.map(({ p, t }) => `• ${p.title} → ${t.title}`));
  if (later || undated) lines.push('', `Мөн дараа хийх ${later} зүйл, огноогүй ${undated} зүйл бий.`);
  const ids = [...overdue, ...dueToday].slice(0, 12).map((t) => t.id);
  return reply(lines.join('\n'), ids.length ? [proposal('review', { task_ids: ids })] : []);
}

/* ── ⭐ Хамгийн чухал хийх зүйл юу вэ? ───────────────────────────────── */
function mostImportant() {
  const now = Date.now();
  const today = todayKey();
  const tomorrow = addDaysKey(today, 1);
  const cands = [];
  tasksService.open().forEach((t) => {
    let score = 0;
    const why = [];
    if (t.due_date) {
      const d = diffDays(today, t.due_date);
      if (d < 0) { score += 100 + Math.min(30, -d * 5); why.push(`${-d} хоног хэтэрсэн`); } else if (d === 0) { score += 70; why.push(t.due_time ? `өнөөдөр ${fmtTime(t.due_time)} гэхэд` : 'өнөөдөр дуусах'); } else if (d === 1) { score += 45; why.push('маргааш дуусах'); } else if (d <= 3) { score += 25; why.push(`${d} хоногийн дараа`); } else if (d <= 7) score += 10;
    }
    if (t.priority === 'high') { score += 35; why.push('өндөр ач холбогдол'); } else if (t.priority === 'medium') score += 12;
    const proj = t.project_id && projectsService.get(t.project_id);
    const goal = proj?.goal_id && goalsService.get(proj.goal_id);
    if (goal) { score += 12; why.push(`«${goal.title}» зорилгын алхам`); } else if (proj) { score += 6; why.push(`«${proj.title}» төсөл`); }
    cands.push({ task: t, title: t.title, score, why, minutes: t.estimated_minutes || DEFAULT_ESTIMATE });
  });
  homeworkService.open().forEach((h) => {
    const hours = (homeworkDue(h) - now) / 3600000;
    let score = 15;
    const why = [subjectById(h.subject_id)?.name || 'гэрийн даалгавар'];
    if (hours < 0) { score += 110; why.push('хугацаа хэтэрсэн'); } else if (hours < 24) { score += 80; why.push(dueCountdown(h)); } else if (hours < 48) { score += 50; why.push(dueCountdown(h)); } else if (hours < 72) score += 25;
    cands.push({ title: `📚 ${h.title}`, score, why, minutes: h.estimated_minutes || 60 });
  });
  ordersService.open().forEach((o) => {
    let score = 20;
    const why = ['захиалагч хүлээж байна'];
    if (isOrderLate(o)) { score += 100; why.unshift('хүргэх хугацаа хэтэрсэн'); } else if (o.due_date === today) { score += 75; why.unshift('өнөөдөр хүргэх'); } else if (o.due_date === tomorrow) { score += 45; why.unshift('маргааш хүргэх'); }
    cands.push({ title: `📦 ${o.customer_name} — ${o.items}`, score, why, minutes: 30 });
  });
  if (!cands.length) return reply('Одоогоор хийх зүйл алга — амарч болно 🌸 Шинэ зүйл нэмбэл чухлыг нь эрэмбэлээд хэлж өгнө.');
  cands.sort((a, b) => b.score - a.score);
  const top = cands.slice(0, 3);
  const lines = ['⭐ Хамгийн чухал 3 зүйл:'];
  top.forEach((c, i) => lines.push(`${i + 1}. ${c.title}${c.why.length ? ` — ${c.why.join(', ')}` : ''}`));
  // №1-ийг хийх сул цаг
  let slot = null;
  for (let i = 0; i < 3 && !slot; i++) {
    const r = freeSlots(addDaysKey(today, i));
    const s = r.slots.find((x) => x.minutes >= Math.min(top[0].minutes, 120));
    if (s) slot = { date: r.date, ...s };
  }
  lines.push('', `👉 Эхлээд №1-ийг хий${slot ? ` — ${dayLabel(slot.date)} ${fmtTime(slot.start)}-аас ${fmtDuration(slot.minutes)} зав байна` : ''}.`);
  lines.push('Эрэмбэ: хугацаа (хэтэрсэн, ойрхон) + ач холбогдол + зорилготой холбоотой эсэх.');
  const ids = top.filter((c) => c.task).map((c) => c.task.id);
  return reply(lines.join('\n'), ids.length ? [proposal('review', { task_ids: ids })] : []);
}

function review() {
  const open = tasksService.open();
  if (!open.length) return reply('Дуусаагүй зүйл алга — бүгдийг нь дуусгасан байна.');
  const today = todayKey();
  const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
  const dueToday = open.filter((t) => t.due_date === today).length;
  const noDate = open.filter((t) => !t.due_date).length;
  const later = open.length - overdue - dueToday - noDate;
  const ids = [...open].sort(compareTasks).slice(0, 12).map((t) => t.id);
  const lines = [
    `Танд ${open.length} дуусаагүй ажил байна:`,
    `• ${overdue} хугацаа хэтэрсэн`, `• ${dueToday} өнөөдөр дуусах`, `• ${later} дараа дуусах`, `• ${noDate} огноогүй`,
  ];
  if (overdue) lines.push('', 'Хугацаа хэтэрснээс эхлээрэй — доор дуусгах эсвэл өнөөдөр рүү шилжүүлж болно.');
  return reply(lines.join('\n'), [proposal('review', { task_ids: ids })]);
}

function insights() {
  if (!tasksService.all().length) return reply('Ажлын түүх алга тул шинжлэх зүйл байхгүй байна. Хэдэн ажил дуусгаад дахин асуугаарай.');
  const s = computeStats(7);
  const prev = computeStats(7, addDaysKey(todayKey(), -7));
  const diff = s.completedCount - prev.completedCount;
  const lines = [`• Сүүлийн 7 хоногт ${s.completedCount} ажил дуусгасан (өмнөх 7 хоногоос ${diff >= 0 ? '+' : ''}${diff}).`];
  if (s.completionRate !== null) lines.push(`• Энэ хугацаанд дуусах ёстой ажлын ${Math.round(s.completionRate * 100)}% нь дууссан.`);
  if (s.onTimeRate !== null) lines.push(`• Эцсийн хугацаатай дууссан ажлын ${Math.round(s.onTimeRate * 100)}% нь хугацаандаа дууссан.`);
  if (s.bestWeekday) lines.push(`• Хамгийн бүтээмжтэй өдөр: ${s.bestWeekday}.`);
  if (s.byCategory[0]?.minutes) lines.push(`• Хамгийн их цаг “${s.byCategory[0].name}” ангилалд зарцуулагдсан (${fmtDuration(s.byCategory[0].minutes)}).`);
  if (s.overdueNow) lines.push(`• Яг одоо ${s.overdueNow} ажлын хугацаа хэтэрсэн байна.`);
  if (s.avgMood !== null) lines.push(`• Дундаж сэтгэл санаа: 5-аас ${s.avgMood.toFixed(1)} (${s.moods.length} тэмдэглэлээр).`);
  if (s.moodGoodAvg !== null && s.moodLowAvg !== null) {
    lines.push(`• Сэтгэл сайхан өдрүүдэд дунджаар ${s.moodGoodAvg.toFixed(1)} ажил, муу өдрүүдэд ${s.moodLowAvg.toFixed(1)} ажил дуусгасан.`);
  }
  return reply(`Эдгээр тоо таны өгөгдлөөс шууд тооцоологдсон:\n${lines.join('\n')}`, [{
    type: 'insights',
    status: 'info',
    data: { completed: s.completedCount, prevCompleted: prev.completedCount, completionRate: s.completionRate, onTimeRate: s.onTimeRate, focusMinutes: s.focusMinutes, overdue: s.overdueNow },
  }]);
}

function dayPlan(dateKey) {
  let plan = planDay(dateKey);
  let note = '';
  if (plan.dayOver) {
    note = `Өнөөдрийн ажлын цаг (${fmtTime(plan.workStart)}–${fmtTime(plan.workEnd)}) дууссан тул маргаашийн төлөвлөгөө гаргалаа.\n\n`;
    plan = planDay(addDaysKey(dateKey, 1));
  }
  const taskBlocks = plan.blocks.filter((b) => b.kind === 'task');
  if (!taskBlocks.length && !plan.unscheduled.length) {
    return reply(`${note}Хуваарьт оруулах дуусаагүй ажил алга (${dayLabel(plan.date)}). Эцсийн хугацаатай эсвэл огноогүй ажил нэмээд дахин асуугаарай.`, [
      { type: 'link', status: 'info', data: { label: 'Календарь нээх', href: `#/calendar?view=day&date=${plan.date}` } },
    ]);
  }
  const minutes = taskBlocks.reduce((sum, b) => sum + (timeToMin(b.end) - timeToMin(b.start)), 0);
  const lines = [`${note}Хуваарийн ноорог — ${dayLabel(plan.date)}. Ажлын цаг (${fmtTime(plan.workStart)}–${fmtTime(plan.workEnd)}), үйл явдлууд, ач холбогдлоор эрэмбэлсэн ажлууд дээр үндэслэв:`];
  lines.push(`• ${taskBlocks.length} ажил хуваарьт орсон — нийт ${fmtDuration(minutes)} төвлөрсөн ажил`);
  if (plan.unscheduled.length) lines.push(`• Эцсийн хугацаатай ${plan.unscheduled.length} ажил багтсангүй — шилжүүлэх хэрэгтэй байж магадгүй`);
  if (taskBlocks.some((b) => !b.estimated)) lines.push(`• Хугацаа тооцоогүй ажлуудад ${DEFAULT_ESTIMATE} минут өгсөн`);
  return reply(lines.join('\n'), [proposal('schedule_day', plan)]);
}

function weekPlan() {
  const plan = planWeek(todayKey());
  const total = plan.days.reduce((s, d) => s + d.tasks.length, 0);
  if (!total && !plan.unscheduled.length) return reply('Ирэх 7 хоногт төлөвлөх дуусаагүй ажил алга. Хэдэн ажил нэмээд дахин асуугаарай.');
  const over = plan.days.filter((d) => d.planned > d.capacity);
  const lines = [`Ирэх 7 хоногийн (${fmt.short(plan.from)} – ${fmt.short(plan.to)}) ажлын хуваарилалт. Ажлууд эцсийн хугацаагаа хадгална; огноогүй ажлуудыг хамгийн их чөлөөт цагтай өдрүүдэд санал болгов.`];
  if (plan.suggestions.length) lines.push(`• ${plan.suggestions.length} огноогүй ажилд өдөр санал болгосон`);
  if (over.length) lines.push(`• Ачаалал хэтэрсэн: ${over.map((d) => fmt.medium(d.date)).join(', ')}`);
  if (plan.unscheduled.length) lines.push(`• ${plan.unscheduled.length} ажил энэ долоо хоногт багтсангүй`);
  return reply(lines.join('\n'), [proposal('schedule_week', plan)]);
}

function agenda(text) {
  const key = parseNatural(text).date || todayKey();
  const events = eventsService.on(key);
  const tasks = tasksService.dueOn(key).filter((t) => t.status !== 'done');
  const birthdays = birthdaysService.onDate(key);
  const link = { type: 'link', status: 'info', data: { label: 'Календарьт нээх', href: `#/calendar?view=day&date=${key}` } };
  if (!events.length && !tasks.length && !birthdays.length) return reply(`${dayLabel(key)} — төлөвлөсөн зүйл алга.`, [link]);
  const lines = [`${dayLabel(key)}:`];
  events.forEach((e) => lines.push(`• ${e.all_day || !e.start_time ? 'Өдөржин' : fmtTime(e.start_time)} — ${e.title}`));
  birthdays.forEach((b) => lines.push(`• Төрсөн өдөр: ${b.name}`));
  tasks.forEach((t) => lines.push(`• Ажил: ${t.title}${t.due_time ? ` (${fmtTime(t.due_time)} гэхэд)` : ''}`));
  return reply(lines.join('\n'), [link]);
}

function breakdown(text) {
  const name = text
    .replace(/^(please\s+)?(can you\s+|could you\s+|help me\s+)?/i, '')
    .replace(/\b(break(ing)?\s+(it\s+|this\s+)?down|break|split|into\s+(sub-?tasks?|steps|tasks|smaller\s+\w+)|sub-?tasks?\s+(for|of)|steps\s+(for|to)|the\s+project|project)\b\s*:?/gi, ' ')
    .replace(/(төсл(ийг|өө|ийн)?|төсөл|задла(х|аарай|ж өгөөч|ж өг)?|дэд\s+ажл?(ууд)?(д|аар|ыг)?|алхам(ууд)?\s+болго(ж)?(\s+өг(өөч)?)?|хэсэгчил(ж)?(\s+өг(өөч)?)?)\s*:?/gi, ' ')
    .replace(/[“”"'«»]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(the|my|a)\s+/i, '')
    .replace(/[\s:,.]+$/, '')
    .trim();
  if (!name) return reply('Аль төслийг задлах вэ? Жишээ нь: “Төслийг задла: Портфолио вэбсайт гаргах”.');
  const lower = name.toLowerCase();
  const project = projectsService.all().find((p) => p.title.toLowerCase() === lower)
    || projectsService.all().find((p) => p.title.toLowerCase().includes(lower) || lower.includes(p.title.toLowerCase()));
  const steps = [
    'Үр дүн болон “дууссан” гэдгийг тодорхойлох',
    'Шаардлагатай зүйлсийг жагсаах — мэдээлэл, хүн, хэрэгсэл',
    'Эхний бодит ажлыг хийх',
    'Үр дүнг хянаж, дутууг засах',
    'Дуусгаж хүлээлгэн өгөх',
  ];
  const title = project ? project.title : name.charAt(0).toUpperCase() + name.slice(1);
  return reply(`“${title}” төслийг яг тохирсон дэд ажлууд болгон задлахад AI загвар хэрэгтэй, одоогоор холбогдоогүй байна. Оронд нь ерөнхий жагсаалт бэлдлээ — алхмуудыг засаж, нэмж, хасаад ажил болгон үүсгээрэй.`, [
    proposal('breakdown', { title, project_id: project?.id || null, steps }),
  ]);
}

function help(greet) {
  return reply(`${greet ? 'Сайн байна уу! ' : ''}Би API-гүй туслах — таны өгөгдлөөс шууд тооцоолж хариулна. Гол 3 асуулт:
• “Би хэзээ завтай вэ?” — үйл явдал, хичээл, ээлжийн завсрын сул цаг
• “Юу юу хийгээгүй байна?” — хэтэрсэн, өнөөдрийн, даалгавар, захиалга
• “Хамгийн чухал хийх зүйл юу вэ?” — эрэмбэлсэн 3 зүйл, хийх цагтай нь
Мөн:
• Ажил нэмэх — “Баасан гарагт 15 цагт тайлан илгээх чухал #ажил 1 цаг”
• Үйл явдал нэмэх — “Маргааш 12:30-13:30 Маятай үдийн хоол”
• Өдрөө төлөвлөх — “Өдрөө төлөвлө” эсвэл “Маргаашийг төлөвлө”
• Долоо хоногоо төлөвлөх — “Долоо хоногоо төлөвлө”
• Дуусаагүй зүйлс — “Дуусаагүй зүйлс юу байна?”
• Бүтээмжийн статистик — “Статистикаа харуул”
• Хуваарь — “Маргааш юу байгаа вэ?”
• Төслийг задлах — “Төслийг задла: Вэбсайт гаргах”
• Санамж хадгалах — “Санаарай: Би өглөө хамгийн сайн төвлөрдөг”`);
}

function fallback() {
  return reply(`Үүнийг ойлгосонгүй 🙈 Би API-гүй туслах тул тогтсон асуултуудад хариулдаг. Иймэрхүү асуугаарай:
• “Би хэзээ завтай вэ?” · “Маргааш хэзээ завтай вэ?”
• “Юу юу хийгээгүй байна?”
• “Хамгийн чухал хийх зүйл юу вэ?”
• “Ажил: …” — огноо, цаг, ач холбогдолтой
• “Өдрөө төлөвлө” / “Долоо хоногоо төлөвлө”
• “Дуусаагүй зүйлс” / “Статистикаа харуул”
• “Төслийг задла: …”`);
}
