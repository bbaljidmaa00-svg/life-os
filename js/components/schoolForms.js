/**
 * Сургуулийн маягтууд: хичээл, хичээлийн цаг (хуваарь), гэрийн даалгавар.
 */
import {
  subjectsService, classSessionsService, homeworkService,
  SUBJECT_COLORS, CLASS_KINDS, HOMEWORK_STATUSES,
} from '../services/schoolService.js';
import { DURATIONS } from '../services/tasksService.js';
import { store } from '../state/store.js';
import { openFormModal, confirmDialog, toast, options } from '../lib/ui.js';
import { esc } from '../lib/dom.js';
import { todayKey, addDaysKey, timeToMin, minToTime, fmtDuration, WEEKDAYS } from '../lib/dates.js';

let seq = 0;
const fid = (name) => `s-${name}-${++seq}`;

/** Даваагаас эхэлсэн гарагийн жагсаалт (сургуулийн хуваарьт ойлгомжтой). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

async function removeWithUndo(service, item, label) {
  await service.remove(item.id);
  toast(`“${label}” устгагдлаа`, { action: () => service.create({ ...item }) });
}

function subjectOptions(selected, { allowNone = false } = {}) {
  const list = [...subjectsService.all()].sort((a, b) => a.name.localeCompare(b.name, 'mn'));
  return `${allowNone ? '<option value="">Хичээлгүй</option>' : ''}${list.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}`;
}

function durationOptions(selected) {
  const values = [...DURATIONS];
  if (selected && !values.includes(Number(selected))) values.push(Number(selected));
  values.sort((a, b) => a - b);
  return `<option value="">Тооцоогүй</option>${values.map((m) => `<option value="${m}" ${Number(selected) === m ? 'selected' : ''}>${fmtDuration(m)}</option>`).join('')}`;
}

/* ── Хичээл ─────────────────────────────────────────────────────────────── */
export function openSubjectForm(subject = null, { onSaved } = {}) {
  const used = new Set(subjectsService.all().map((s) => s.color));
  const s = subject || { name: '', teacher: '', color: SUBJECT_COLORS.find((c) => !used.has(c)) || SUBJECT_COLORS[0] };
  const id = { name: fid('name'), teacher: fid('teacher') };
  return openFormModal({
    title: subject ? 'Хичээл засах' : 'Хичээл нэмэх',
    submitLabel: subject ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field"><label for="${id.name}">Хичээлийн нэр</label>
        <input id="${id.name}" name="name" class="input" required maxlength="120" value="${esc(s.name)}" placeholder="Жишээ нь: Бизнесийн математик" ${subject ? '' : 'autofocus'}></div>
      <div class="field"><label for="${id.teacher}">Багш</label>
        <input id="${id.teacher}" name="teacher" class="input" maxlength="120" value="${esc(s.teacher)}" placeholder="Заавал биш"></div>
      <div class="field"><span class="label">Өнгө</span>
        <div class="color-pick" role="radiogroup" aria-label="Хичээлийн өнгө">
          ${SUBJECT_COLORS.map((c, i) => `<label class="color-dot" style="--dot:${c}"><input type="radio" name="color" value="${c}" ${c === s.color ? 'checked' : ''} aria-label="Өнгө ${i + 1}"><span></span></label>`).join('')}
        </div></div>`,
    async onSubmit(data) {
      const payload = { name: data.name, teacher: data.teacher, color: data.color || s.color };
      const saved = subject ? await subjectsService.update(subject.id, payload) : await subjectsService.create(payload);
      toast(subject ? 'Хичээл шинэчлэгдлээ' : `“${saved.name}” хичээл нэмэгдлээ`);
      onSaved?.(saved);
    },
    onDelete: subject ? async () => {
      const sessions = classSessionsService.all().filter((x) => x.subject_id === subject.id).length;
      const ok = await confirmDialog({
        title: `“${subject.name}”-ийг устгах уу?`,
        message: sessions ? `Энэ хичээлийн хуваарийн ${sessions} цаг хамт устна. Гэрийн даалгаврууд үлдэнэ (хичээлгүй болно).` : 'Гэрийн даалгаврууд үлдэнэ (хичээлгүй болно).',
      });
      if (!ok) return;
      await subjectsService.remove(subject.id);
      // Сан дээр цаг нь CASCADE-ээр устаж, даалгаврын subject_id нь NULL болно — санах ойд ч мөн адил.
      store.set('classSessions', store.get('classSessions').filter((x) => x.subject_id !== subject.id));
      store.set('homework', store.get('homework').map((x) => (x.subject_id === subject.id ? { ...x, subject_id: null } : x)));
      toast('Хичээл устгагдлаа');
    } : null,
  });
}

/* ── Хичээлийн цаг (хуваарь) ────────────────────────────────────────────── */
export function openClassSessionForm(session = null, defaults = {}, { onSaved } = {}) {
  if (!subjectsService.all().length) {
    toast('Эхлээд хичээл нэмнэ үү.');
    return openSubjectForm(null, { onSaved: () => openClassSessionForm(session, defaults, { onSaved }) });
  }
  const c = session || { subject_id: subjectsService.all()[0].id, weekday: 1, start_time: '08:00', end_time: '09:20', room: '', kind: 'lecture', ...defaults };
  const id = { subj: fid('subj'), day: fid('day'), start: fid('start'), end: fid('end'), room: fid('room'), kind: fid('kind') };
  return openFormModal({
    title: session ? 'Хичээлийн цаг засах' : 'Хуваарьт цаг нэмэх',
    submitLabel: session ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field"><label for="${id.subj}">Хичээл</label><select id="${id.subj}" name="subject_id" class="select" required>${subjectOptions(c.subject_id)}</select></div>
      <div class="field-row">
        <div class="field"><label for="${id.day}">Гараг</label><select id="${id.day}" name="weekday" class="select">${WEEKDAY_ORDER.map((d) => `<option value="${d}" ${Number(c.weekday) === d ? 'selected' : ''}>${WEEKDAYS[d]}</option>`).join('')}</select></div>
        <div class="field"><label for="${id.kind}">Төрөл</label><select id="${id.kind}" name="kind" class="select">${options(CLASS_KINDS, c.kind)}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="${id.start}">Эхлэх</label><input id="${id.start}" name="start_time" type="time" class="input" required value="${c.start_time || ''}"></div>
        <div class="field"><label for="${id.end}">Дуусах</label><input id="${id.end}" name="end_time" type="time" class="input" value="${c.end_time || ''}"></div>
      </div>
      <div class="field"><label for="${id.room}">Анги / танхим</label><input id="${id.room}" name="room" class="input" maxlength="80" value="${esc(c.room)}" placeholder="Жишээ нь: 305 тоот, А байр"></div>`,
    onMount(form) {
      const start = form.querySelector('[name=start_time]');
      const end = form.querySelector('[name=end_time]');
      let last = start.value;
      start.addEventListener('change', () => {
        if (last && end.value && start.value) end.value = minToTime(timeToMin(start.value) + (timeToMin(end.value) - timeToMin(last)));
        else if (start.value && !end.value) end.value = minToTime(timeToMin(start.value) + 80);
        last = start.value;
      });
    },
    async onSubmit(data) {
      if (data.end_time && timeToMin(data.end_time) <= timeToMin(data.start_time)) throw new Error('Дуусах цаг эхлэх цагаас хойш байх ёстой.');
      const payload = { subject_id: data.subject_id, weekday: Number(data.weekday), start_time: data.start_time, end_time: data.end_time || null, room: data.room, kind: data.kind };
      const saved = session ? await classSessionsService.update(session.id, payload) : await classSessionsService.create(payload);
      toast(session ? 'Хуваарь шинэчлэгдлээ' : 'Хуваарьт нэмэгдлээ');
      onSaved?.(saved);
    },
    onDelete: session ? () => removeWithUndo(classSessionsService, session, 'Хичээлийн цаг') : null,
  });
}

/* ── Гэрийн даалгавар ───────────────────────────────────────────────────── */
export function openHomeworkForm(hw = null, defaults = {}, { onSaved } = {}) {
  const h = hw || {
    subject_id: subjectsService.all()[0]?.id || '', title: '', description: '',
    assigned_date: todayKey(), start_date: todayKey(), start_time: '', due_date: addDaysKey(todayKey(), 2), due_time: '23:59',
    estimated_minutes: '', status: 'todo', ...defaults,
  };
  const id = { subj: fid('subj'), title: fid('title'), desc: fid('desc'), sd: fid('sd'), st: fid('st'), dd: fid('dd'), dt: fid('dt'), est: fid('est'), status: fid('status'), ad: fid('ad') };
  return openFormModal({
    title: hw ? 'Гэрийн даалгавар засах' : 'Гэрийн даалгавар нэмэх',
    submitLabel: hw ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field"><label for="${id.title}">Даалгавар</label>
        <input id="${id.title}" name="title" class="input" required maxlength="200" value="${esc(h.title)}" placeholder="Жишээ нь: 3-р бүлгийн бодлого 1–10" ${hw ? '' : 'autofocus'}></div>
      <div class="field-row">
        <div class="field"><label for="${id.subj}">Хичээл</label><select id="${id.subj}" name="subject_id" class="select">${subjectOptions(h.subject_id, { allowNone: true })}</select></div>
        <div class="field"><label for="${id.status}">Төлөв</label><select id="${id.status}" name="status" class="select">${options(HOMEWORK_STATUSES, h.status)}</select></div>
      </div>
      <p class="form-sub">Хэзээ эхлэх</p>
      <div class="field-row">
        <div class="field"><label for="${id.sd}">Эхлэх өдөр</label><input id="${id.sd}" name="start_date" type="date" class="input" value="${h.start_date || ''}"></div>
        <div class="field"><label for="${id.st}">Эхлэх цаг</label><input id="${id.st}" name="start_time" type="time" class="input" value="${h.start_time || ''}"></div>
      </div>
      <p class="form-sub">Хэзээ дуусгах (илгээх)</p>
      <div class="field-row">
        <div class="field"><label for="${id.dd}">Дуусгах өдөр</label><input id="${id.dd}" name="due_date" type="date" class="input" required value="${h.due_date || ''}"></div>
        <div class="field"><label for="${id.dt}">Дуусгах цаг</label><input id="${id.dt}" name="due_time" type="time" class="input" value="${h.due_time || ''}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="${id.est}">Хэр удаан хийх</label><select id="${id.est}" name="estimated_minutes" class="select">${durationOptions(h.estimated_minutes)}</select></div>
        <div class="field"><label for="${id.ad}">Өгсөн өдөр</label><input id="${id.ad}" name="assigned_date" type="date" class="input" value="${h.assigned_date || ''}"></div>
      </div>
      <div class="field"><label for="${id.desc}">Тайлбар</label><textarea id="${id.desc}" name="description" class="textarea" rows="3" placeholder="Даалгаврын нөхцөл, хуудас, холбоос…">${esc(h.description)}</textarea></div>`,
    async onSubmit(data) {
      if (data.start_date && data.due_date && data.start_date > data.due_date) throw new Error('Эхлэх өдөр дуусгах өдрөөс өмнө байх ёстой.');
      if (data.start_date && data.start_date === data.due_date && data.start_time && data.due_time && timeToMin(data.due_time) <= timeToMin(data.start_time)) {
        throw new Error('Дуусгах цаг эхлэх цагаас хойш байх ёстой.');
      }
      const done = data.status === 'done' || data.status === 'submitted';
      const payload = {
        subject_id: data.subject_id || null,
        title: data.title,
        description: data.description,
        assigned_date: data.assigned_date || null,
        start_date: data.start_date || null,
        start_time: data.start_time || null,
        due_date: data.due_date,
        due_time: data.due_time || null,
        estimated_minutes: data.estimated_minutes ? Number(data.estimated_minutes) : null,
        status: data.status,
        completed_at: done ? (hw?.completed_at || new Date().toISOString()) : null,
      };
      const saved = hw ? await homeworkService.update(hw.id, payload) : await homeworkService.create(payload);
      toast(hw ? 'Даалгавар шинэчлэгдлээ' : `“${saved.title}” даалгавар нэмэгдлээ`);
      onSaved?.(saved);
    },
    onDelete: hw ? () => removeWithUndo(homeworkService, hw, hw.title) : null,
  });
}
