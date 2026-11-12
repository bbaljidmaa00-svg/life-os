/**
 * Create / edit forms for every entity, shown in modals.
 * Each opener takes (item | null, defaults, { onSaved }) — pass null to create.
 */
import { tasksService, PRIORITIES, DURATIONS } from '../services/tasksService.js';
import { eventsService, EVENT_CATEGORIES } from '../services/eventsService.js';
import {
  goalsService, projectsService, wishesService, deleteWish, goalsOfWish, STATUSES, WISH_CATEGORIES, wishCategory,
  PROJECT_KINDS, projectKind, reflectionsService,
} from '../services/goalsService.js';
import { icon } from '../lib/icons.js';
import { journalService, MOODS } from '../services/journalService.js';
import { birthdaysService, RELATIONSHIPS, REMINDER_OPTIONS } from '../services/birthdaysService.js';
import { prefs } from '../state/prefs.js';
import { openFormModal, openMenu, toast, segmented, options, confirmDialog } from '../lib/ui.js';
import { esc } from '../lib/dom.js';
import { todayKey, addDaysKey, timeToMin, minToTime, fmtDuration, MONTHS } from '../lib/dates.js';

let seq = 0;
const fid = (name) => `f-${name}-${++seq}`;

/** Delete, then offer "Undo" (re-creates the same row, same id). */
export async function deleteWithUndo(service, item, label) {
  await service.remove(item.id);
  toast(`“${label}” устгагдлаа`, { action: () => service.create({ ...item }) });
}

/* ───────────── shared option builders ───────────── */
function durationOptions(selected) {
  const values = [...DURATIONS];
  if (selected && !values.includes(Number(selected))) values.push(Number(selected));
  values.sort((a, b) => a - b);
  return `<option value="">Тооцоогүй</option>${values.map((m) => `<option value="${m}" ${Number(selected) === m ? 'selected' : ''}>${fmtDuration(m)}</option>`).join('')}`;
}

function projectOptions(selected) {
  const goals = goalsService.all();
  const projects = projectsService.all();
  const opt = (p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.title)}</option>`;
  let html = '<option value="">Төсөлгүй</option>';
  goals.forEach((g) => {
    const list = projects.filter((p) => p.goal_id === g.id);
    if (list.length) html += `<optgroup label="${esc(g.title)}">${list.map(opt).join('')}</optgroup>`;
  });
  const loose = projects.filter((p) => !p.goal_id || !goals.some((g) => g.id === p.goal_id));
  if (loose.length) html += `<optgroup label="Зорилгогүй">${loose.map(opt).join('')}</optgroup>`;
  return html;
}

/* ───────────── Task ───────────── */
export function openTaskForm(task = null, defaults = {}, { onSaved } = {}) {
  const p = prefs.get();
  const t = task || {
    title: '', notes: '', due_date: todayKey(), due_time: '', priority: p.defaultPriority,
    category: '', estimated_minutes: Number(p.defaultDuration) || null, project_id: '', ...defaults,
  };
  const id = { title: fid('title'), date: fid('date'), time: fid('time'), cat: fid('cat'), est: fid('est'), proj: fid('proj'), notes: fid('notes'), list: fid('cats') };

  return openFormModal({
    title: task ? 'Хийх зүйл засах' : 'Хийх зүйл нэмэх',
    submitLabel: task ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field"><label for="${id.title}">Гарчиг</label>
        <input id="${id.title}" name="title" class="input" required maxlength="200" value="${esc(t.title)}" placeholder="Юу хийх вэ?" ${task ? '' : 'autofocus'}></div>
      <div class="field-row">
        <div class="field"><label for="${id.date}">Эцсийн хугацаа</label><input id="${id.date}" name="due_date" type="date" class="input" value="${t.due_date || ''}"></div>
        <div class="field"><label for="${id.time}">Цаг</label><input id="${id.time}" name="due_time" type="time" class="input" value="${t.due_time || ''}"></div>
      </div>
      <div class="field"><span class="label">Ач холбогдол</span>${segmented('priority', PRIORITIES, t.priority, { full: true })}</div>
      <div class="field-row">
        <div class="field"><label for="${id.cat}">Ангилал</label>
          <input id="${id.cat}" name="category" class="input" list="${id.list}" value="${esc(t.category || '')}" placeholder="жишээ нь: Ажил" maxlength="40">
          <datalist id="${id.list}">${tasksService.categories().map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
        <div class="field"><label for="${id.est}">Зарцуулах хугацаа</label><select id="${id.est}" name="estimated_minutes" class="select">${durationOptions(t.estimated_minutes)}</select></div>
      </div>
      <div class="field"><label for="${id.proj}">Төсөл</label><select id="${id.proj}" name="project_id" class="select">${projectOptions(t.project_id)}</select></div>
      <div class="field"><label for="${id.notes}">Тэмдэглэл</label><textarea id="${id.notes}" name="notes" class="textarea" rows="3" placeholder="Дэлгэрэнгүй, холбоос, дараагийн алхам…">${esc(t.notes || '')}</textarea></div>
      ${task ? `<label class="check-row"><input type="checkbox" name="done" ${task.status === 'done' ? 'checked' : ''}> Дууссан гэж тэмдэглэх</label>` : ''}`,
    async onSubmit(data) {
      if (data.due_time && !data.due_date) throw new Error('Цаг оруулсан бол эцсийн хугацааны огноог мөн оруулна уу.');
      const payload = {
        title: data.title,
        notes: data.notes,
        due_date: data.due_date || null,
        due_time: data.due_time || null,
        priority: data.priority || 'medium',
        category: data.category,
        estimated_minutes: data.estimated_minutes ? Number(data.estimated_minutes) : null,
        project_id: data.project_id || null,
      };
      let saved;
      if (task) {
        if (data.done !== (task.status === 'done')) {
          payload.status = data.done ? 'done' : 'todo';
          payload.completed_at = data.done ? new Date().toISOString() : null;
        }
        saved = await tasksService.update(task.id, payload);
        toast('Шинэчлэгдлээ');
      } else {
        saved = await tasksService.create(payload);
        toast('Хийх зүйлст нэмэгдлээ');
      }
      onSaved?.(saved);
    },
    onDelete: task ? () => deleteWithUndo(tasksService, task, task.title) : null,
  });
}

/* ───────────── Event ───────────── */
export function openEventForm(ev = null, defaults = {}, { onSaved } = {}) {
  const e = ev || { title: '', event_date: todayKey(), start_time: '09:00', end_time: '10:00', all_day: false, location: '', category: 'personal', description: '', ...defaults };
  if (!ev && defaults.start_time && !defaults.end_time) e.end_time = minToTime(timeToMin(defaults.start_time) + 60);
  const id = { title: fid('title'), date: fid('date'), start: fid('start'), end: fid('end'), cat: fid('cat'), loc: fid('loc'), desc: fid('desc'), allDay: fid('allday') };

  return openFormModal({
    title: ev ? 'Үйл явдал засах' : 'Шинэ үйл явдал',
    submitLabel: ev ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field"><label for="${id.title}">Гарчиг</label>
        <input id="${id.title}" name="title" class="input" required maxlength="200" value="${esc(e.title)}" placeholder="Уулзалт, хичээл, оройн хоол…" ${ev ? '' : 'autofocus'}></div>
      <div class="field-row">
        <div class="field"><label for="${id.date}">Огноо</label><input id="${id.date}" name="event_date" type="date" class="input" required value="${e.event_date || ''}"></div>
        <div class="field field-switch"><span class="label">Өдөржин</span>
          <label class="switch-row" for="${id.allDay}"><span class="switch"><input id="${id.allDay}" type="checkbox" name="all_day" ${e.all_day ? 'checked' : ''}><span></span></span><span class="muted small">Тодорхой цаггүй</span></label></div>
      </div>
      <div class="field-row" data-times>
        <div class="field"><label for="${id.start}">Эхлэх</label><input id="${id.start}" name="start_time" type="time" class="input" value="${e.start_time || ''}" ${e.all_day ? 'disabled' : ''}></div>
        <div class="field"><label for="${id.end}">Дуусах</label><input id="${id.end}" name="end_time" type="time" class="input" value="${e.end_time || ''}" ${e.all_day ? 'disabled' : ''}></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="${id.cat}">Ангилал</label><select id="${id.cat}" name="category" class="select">${options(EVENT_CATEGORIES, e.category)}</select></div>
        <div class="field"><label for="${id.loc}">Байршил</label><input id="${id.loc}" name="location" class="input" value="${esc(e.location || '')}" placeholder="Заавал биш" maxlength="120"></div>
      </div>
      <div class="field"><label for="${id.desc}">Тэмдэглэл</label><textarea id="${id.desc}" name="description" class="textarea" rows="3" placeholder="Хэлэлцэх зүйл, холбоос…">${esc(e.description || '')}</textarea></div>`,
    onMount(form) {
      const allDay = form.querySelector('[name=all_day]');
      const times = form.querySelectorAll('[data-times] input');
      const startInput = form.querySelector('[name=start_time]');
      const endInput = form.querySelector('[name=end_time]');
      allDay.addEventListener('change', () => times.forEach((i) => { i.disabled = allDay.checked; }));
      // Keep the duration when the start time moves.
      let lastStart = startInput.value;
      startInput.addEventListener('change', () => {
        if (lastStart && endInput.value && startInput.value) {
          const shift = timeToMin(startInput.value) - timeToMin(lastStart);
          endInput.value = minToTime(timeToMin(endInput.value) + shift);
        }
        lastStart = startInput.value;
      });
    },
    async onSubmit(data) {
      const allDay = Boolean(data.all_day);
      if (!allDay) {
        if (!data.start_time) throw new Error('Эхлэх цагаа оруулах эсвэл “Өдөржин” гэж тэмдэглэнэ үү.');
        if (data.end_time && timeToMin(data.end_time) <= timeToMin(data.start_time)) throw new Error('Дуусах цаг эхлэх цагаас хойш байх ёстой.');
      }
      const payload = {
        title: data.title,
        event_date: data.event_date,
        all_day: allDay,
        start_time: allDay ? null : data.start_time,
        end_time: allDay ? null : (data.end_time || minToTime(timeToMin(data.start_time) + 60)),
        category: data.category,
        location: data.location,
        description: data.description,
      };
      const saved = ev ? await eventsService.update(ev.id, payload) : await eventsService.create(payload);
      toast(ev ? 'Үйл явдал шинэчлэгдлээ' : 'Үйл явдал нэмэгдлээ');
      onSaved?.(saved);
    },
    onDelete: ev ? () => deleteWithUndo(eventsService, ev, ev.title) : null,
  });
}

/* ───────────── Goal ───────────── */
function wishOptions(selected) {
  const groups = WISH_CATEGORIES.map((c) => {
    const list = wishesService.all().filter((w) => w.category === c.value);
    return list.length ? `<optgroup label="${esc(c.label)}">${list.map((w) => `<option value="${w.id}" ${w.id === selected ? 'selected' : ''}>${esc(w.title)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  return `<option value="">Хүсэлгүй</option>${groups}`;
}

export function openGoalForm(goal = null, { onSaved, defaults = {}, quiet = false } = {}) {
  const g = goal || { title: '', description: '', target_date: '', status: 'active', wish_id: '', ...defaults };
  const id = { title: fid('title'), desc: fid('desc'), date: fid('date'), status: fid('status'), wish: fid('wish') };
  return openFormModal({
    title: goal ? 'Зорилго засах' : 'Шинэ зорилго',
    submitLabel: goal ? 'Хадгалах' : 'Зорилго үүсгэх',
    fields: `
      <div class="field"><label for="${id.title}">Зорилго</label>
        <input id="${id.title}" name="title" class="input" required maxlength="160" value="${esc(g.title)}" placeholder="жишээ нь: Хагас марафон гүйх" ${goal ? '' : 'autofocus'}></div>
      <div class="field"><label for="${id.desc}">Яагаад чухал вэ</label>
        <textarea id="${id.desc}" name="description" class="textarea" rows="3" placeholder="Амжилт ямар харагдах вэ?">${esc(g.description)}</textarea></div>
      <div class="field-row">
        <div class="field"><label for="${id.date}">Зорилтот огноо</label><input id="${id.date}" name="target_date" type="date" class="input" value="${g.target_date || ''}"></div>
        <div class="field"><label for="${id.status}">Төлөв</label><select id="${id.status}" name="status" class="select">${options(STATUSES, g.status)}</select></div>
      </div>
      <div class="field"><label for="${id.wish}">Ямар хүслийн төлөө вэ</label><select id="${id.wish}" name="wish_id" class="select">${wishOptions(g.wish_id)}</select></div>`,
    async onSubmit(data) {
      const payload = { title: data.title, description: data.description, target_date: data.target_date || null, status: data.status, wish_id: data.wish_id || null };
      const saved = goal ? await goalsService.update(goal.id, payload) : await goalsService.create(payload);
      if (!quiet) toast(goal ? 'Зорилго шинэчлэгдлээ' : 'Зорилго үүслээ');
      onSaved?.(saved);
    },
  });
}

/* ───────────── Хүсэл мөрөөдөл ───────────── */
export function openWishForm(wish = null, defaults = {}, { onSaved } = {}) {
  const w = wish || { title: '', category: 'do', note: '', ...defaults };
  const id = { title: fid('title'), note: fid('note'), done: fid('done') };
  return openFormModal({
    title: wish ? 'Хүсэл засах' : 'Шинэ хүсэл',
    submitLabel: wish ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field"><span class="label">Ангилал</span>
        <div class="wish-cat-pick" role="radiogroup" aria-label="Ангилал">
          ${WISH_CATEGORIES.map((c) => `<label class="wish-cat-opt" style="--wc:${c.color}"><input type="radio" name="category" value="${c.value}" ${c.value === w.category ? 'checked' : ''}><span><b>${esc(c.label)}</b><small>${esc(c.hint)}</small></span></label>`).join('')}
        </div></div>
      <div class="field"><label for="${id.title}">Хүсэл</label>
        <input id="${id.title}" name="title" class="input" required maxlength="200" value="${esc(w.title)}" placeholder="${esc(wishCategory(w.category).example)}" ${wish ? '' : 'autofocus'}></div>
      <div class="field"><label for="${id.note}">Яагаад хүсдэг вэ</label>
        <textarea id="${id.note}" name="note" class="textarea" rows="3" placeholder="Биелэхэд ямар мэдрэмж төрөх вэ? Хугацаа хэрэггүй — зүгээр л мөрөөд.">${esc(w.note)}</textarea></div>
      ${wish ? `<label class="switch-row" for="${id.done}"><span class="switch"><input id="${id.done}" type="checkbox" name="achieved" ${wish.achieved_at ? 'checked' : ''}><span></span></span><span>Биелсэн ✨</span></label>` : ''}`,
    onMount(form) {
      const title = form.querySelector('[name=title]');
      form.addEventListener('change', (e) => { if (e.target.name === 'category') title.placeholder = wishCategory(e.target.value).example; });
    },
    async onSubmit(data) {
      const payload = { title: data.title, category: data.category || 'do', note: data.note };
      if (wish) payload.achieved_at = data.achieved ? (wish.achieved_at || new Date().toISOString()) : null;
      const saved = wish ? await wishesService.update(wish.id, payload) : await wishesService.create(payload);
      toast(wish ? 'Хүсэл шинэчлэгдлээ' : `“${saved.title}” хүсэл нэмэгдлээ`);
      onSaved?.(saved);
    },
    onDelete: wish ? async () => {
      const linked = goalsOfWish(wish.id).length;
      if (linked && !(await confirmDialog({ title: 'Энэ хүслийг устгах уу?', message: `Холбоотой ${linked} зорилго хадгалагдана (хүсэлгүй болно).` }))) return;
      await deleteWish(wish.id);
      toast(`“${wish.title}” устгагдлаа`, linked ? {} : { action: () => wishesService.create({ ...wish }) });
    } : null,
  });
}

/* ───────────── Project ───────────── */
export function openProjectForm(project = null, defaults = {}, { onSaved } = {}) {
  const p = project || { title: '', description: '', goal_id: '', due_date: '', status: 'active', kind: 'quick', ...defaults };
  const id = { title: fid('title'), goal: fid('goal'), desc: fid('desc'), date: fid('date'), status: fid('status') };
  const goalOptions = `<option value="">Зорилгогүй</option>${goalsService.all().map((g) => `<option value="${g.id}" ${g.id === p.goal_id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}`;
  return openFormModal({
    title: project ? 'Төсөл засах' : 'Шинэ төсөл',
    submitLabel: project ? 'Хадгалах' : 'Төсөл үүсгэх',
    fields: `
      <div class="field"><label for="${id.title}">Төслийн нэр</label>
        <input id="${id.title}" name="title" class="input" required maxlength="160" value="${esc(p.title)}" placeholder="жишээ нь: ${esc(projectKind(p.kind).example.split(',')[0])}" ${project ? '' : 'autofocus'}></div>
      <div class="field"><span class="label">Төрөл</span>
        <div class="kind-pick" role="radiogroup" aria-label="Төслийн төрөл">
          ${PROJECT_KINDS.map((k) => `<label class="kind-opt is-${k.value}"><input type="radio" name="kind" value="${k.value}" ${k.value === (p.kind || 'quick') ? 'checked' : ''}><span><b>${k.emoji} ${esc(k.label)}</b><small>${esc(k.hint)}</small><small class="faint">${esc(k.example)}</small></span></label>`).join('')}
        </div></div>
      <div class="field"><label for="${id.goal}">Зорилго</label><select id="${id.goal}" name="goal_id" class="select">${goalOptions}</select></div>
      <div class="field-row">
        <div class="field"><label for="${id.date}">Дуусах огноо</label><input id="${id.date}" name="due_date" type="date" class="input" value="${p.due_date || ''}"></div>
        <div class="field"><label for="${id.status}">Төлөв</label><select id="${id.status}" name="status" class="select">${options(STATUSES, p.status)}</select></div>
      </div>
      <div class="field"><label for="${id.desc}">Тайлбар</label><textarea id="${id.desc}" name="description" class="textarea" rows="3" placeholder="Хамрах хүрээ, үр дүн…">${esc(p.description)}</textarea></div>`,
    async onSubmit(data) {
      const payload = { title: data.title, goal_id: data.goal_id || null, due_date: data.due_date || null, status: data.status, description: data.description, kind: data.kind === 'long' ? 'long' : 'quick' };
      const saved = project ? await projectsService.update(project.id, payload) : await projectsService.create(payload);
      toast(project ? 'Төсөл шинэчлэгдлээ' : 'Төсөл үүслээ');
      onSaved?.(saved);
    },
  });
}

/* ───────────── «Юу сурсан бэ?» — төслийн алхам дуусахад ───────────── */
const REFLECT_MOODS = [
  { value: 1, emoji: '😣', label: 'Хэцүү' },
  { value: 2, emoji: '😕', label: 'Тааруу' },
  { value: 3, emoji: '😐', label: 'Зүгээр' },
  { value: 4, emoji: '🙂', label: 'Сайн' },
  { value: 5, emoji: '🤩', label: 'Гайхалтай' },
];
export const reflectMood = (v) => REFLECT_MOODS.find((m) => m.value === Number(v)) || null;

/**
 * Төслийн алхам (task) дуусахад эсвэл зүгээр л төслийн тэмдэглэл бичихэд.
 * Урт хугацааны төсөлд «Маргааш дахин хийх» сонголт гарна (давтагдах дадал).
 */
export function openReflectionForm({ task = null, project, reflection = null } = {}) {
  const r = reflection || { learned: '', feeling: '', mood: null };
  const isLong = project?.kind === 'long';
  const id = { learned: fid('learned'), feeling: fid('feeling'), again: fid('again') };
  const stepTitle = task?.title || reflection?.task_title || '';
  return openFormModal({
    title: reflection ? 'Тэмдэглэл засах' : task ? '🎉 Дууслаа! Юу сурсан бэ?' : 'Төслийн тэмдэглэл',
    submitLabel: 'Хадгалах',
    cancelLabel: reflection ? 'Болих' : 'Алгасах',
    fields: `
      ${stepTitle ? `<p class="reflect-task">${icon('check', 14)}<span><b>${esc(stepTitle)}</b>${project ? `<span class="faint"> · ${esc(project.title)}</span>` : ''}</span></p>` : ''}
      <div class="field"><span class="label">Ямар байсан бэ?</span>
        <div class="reflect-moods" role="radiogroup" aria-label="Мэдрэмж">
          ${REFLECT_MOODS.map((m) => `<label class="reflect-mood" title="${esc(m.label)}"><input type="radio" name="mood" value="${m.value}" ${Number(r.mood) === m.value ? 'checked' : ''}><span class="rm-emoji" aria-hidden="true">${m.emoji}</span><small>${esc(m.label)}</small></label>`).join('')}
        </div></div>
      <div class="field"><label for="${id.learned}">Юу сурсан бэ?</label>
        <textarea id="${id.learned}" name="learned" class="textarea" rows="2" placeholder="Жишээ нь: Орой утсаа 22:30-д унтраавал амархан унтдаг юм байна." ${reflection ? '' : 'autofocus'}>${esc(r.learned)}</textarea></div>
      <div class="field"><label for="${id.feeling}">Сэтгэгдэл</label>
        <textarea id="${id.feeling}" name="feeling" class="textarea" rows="2" placeholder="Ямар мэдрэмж төрсөн бэ? Дараагийн удаа юуг өөрөөр хийх вэ?">${esc(r.feeling)}</textarea></div>
      ${task && isLong ? `<label class="switch-row" for="${id.again}"><span class="switch"><input id="${id.again}" type="checkbox" name="again"><span></span></span><span>🔁 Маргааш дахин хийх <span class="faint small">— энэ алхмыг маргаашийн хийх зүйлст нэмнэ</span></span></label>` : ''}`,
    async onSubmit(data) {
      const learned = (data.learned || '').trim();
      const feeling = (data.feeling || '').trim();
      const mood = data.mood ? Number(data.mood) : null;
      if (data.again && task) {
        await tasksService.create({
          title: task.title, project_id: task.project_id, priority: task.priority, category: task.category,
          estimated_minutes: task.estimated_minutes, due_date: addDaysKey(todayKey(), 1), due_time: task.due_time || null,
        });
      }
      if (!learned && !feeling && !mood) {
        if (reflection) { await reflectionsService.remove(reflection.id); toast('Тэмдэглэл устгагдлаа'); } else if (data.again) toast('Маргааш дахин хийхээр нэмлээ 🔁');
        return;
      }
      const payload = { learned, feeling, mood };
      if (reflection) {
        await reflectionsService.update(reflection.id, payload);
        toast('Тэмдэглэл шинэчлэгдлээ');
      } else {
        await reflectionsService.create({ ...payload, project_id: project.id, task_id: task?.id || null, task_title: task?.title || null });
        toast(data.again ? 'Хадгаллаа · маргааш дахин хийхээр нэмлээ 🔁' : 'Сурсан зүйлээ хадгаллаа ✨');
      }
    },
    onDelete: reflection ? async () => { await reflectionsService.remove(reflection.id); toast('Тэмдэглэл устгагдлаа'); } : null,
  });
}

/* ───────────── Journal ───────────── */
export function openJournalForm(entry = null, defaults = {}, { onSaved } = {}) {
  let existing = entry;
  if (!existing) existing = journalService.byDate(defaults.entry_date || todayKey()); // one entry per day
  const e = existing
    ? { ...existing, mood: defaults.mood ?? existing.mood }
    : { entry_date: todayKey(), mood: null, title: '', reflection: '', gratitude: '', ...defaults };
  const id = { date: fid('date'), title: fid('title'), refl: fid('refl'), grat: fid('grat') };

  return openFormModal({
    title: existing ? 'Тэмдэглэл засах' : 'Шинэ тэмдэглэл',
    submitLabel: 'Хадгалах',
    size: 'lg',
    fields: `
      <div class="field-row">
        <div class="field"><label for="${id.date}">Огноо</label><input id="${id.date}" name="entry_date" type="date" class="input" required max="${todayKey()}" value="${e.entry_date}"></div>
        <div class="field"><label for="${id.title}">Гарчиг</label><input id="${id.title}" name="title" class="input" maxlength="120" value="${esc(e.title)}" placeholder="Заавал биш"></div>
      </div>
      <div class="field"><span class="label">Өнөөдөр ямар санагдав?</span>
        <div class="mood-picker" role="radiogroup" aria-label="Сэтгэл санаа">${MOODS.map((m) => `
          <label class="mood-opt" style="--c:var(--mood-${m.value})"><input type="radio" name="mood" value="${m.value}" ${m.value === Number(e.mood) ? 'checked' : ''}><span class="mood-dot"></span><span class="mood-label">${m.label}</span></label>`).join('')}
        </div></div>
      <div class="field"><label for="${id.refl}">Эргэцүүлэл</label>
        <textarea id="${id.refl}" name="reflection" class="textarea" rows="6" placeholder="Юу болсон бэ? Юу сурсан бэ? Юуг өөрөөр хийх байсан бэ?" ${existing ? '' : 'autofocus'}>${esc(e.reflection)}</textarea></div>
      <div class="field"><label for="${id.grat}">Талархаж буй зүйл</label>
        <textarea id="${id.grat}" name="gratitude" class="textarea" rows="2" placeholder="Нэг хоёр жижиг зүйл">${esc(e.gratitude)}</textarea></div>`,
    async onSubmit(data) {
      if (data.entry_date > todayKey()) throw new Error('Ирээдүйн огноонд тэмдэглэл бичих боломжгүй.');
      if (!data.mood && !data.reflection && !data.gratitude) throw new Error('Хадгалахаас өмнө сэтгэл санаагаа сонгох эсвэл хэдэн үг бичнэ үү.');
      const clash = journalService.byDate(data.entry_date);
      if (clash && clash.id !== existing?.id) throw new Error('Энэ өдөр аль хэдийн тэмдэглэлтэй. Тэмдэглэлийн хуудаснаас нээж засна уу.');
      const payload = { entry_date: data.entry_date, mood: data.mood ? Number(data.mood) : null, title: data.title, reflection: data.reflection, gratitude: data.gratitude };
      const saved = existing ? await journalService.update(existing.id, payload) : await journalService.create(payload);
      toast(existing ? 'Тэмдэглэл шинэчлэгдлээ' : 'Тэмдэглэл хадгалагдлаа');
      onSaved?.(saved);
    },
    onDelete: existing ? () => deleteWithUndo(journalService, existing, existing.title || 'тэмдэглэл') : null,
  });
}

/* ───────────── Birthday ───────────── */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function openBirthdayForm(person = null, { onSaved } = {}) {
  const b = person || { name: '', birth_month: new Date().getMonth() + 1, birth_day: '', birth_year: '', relationship: 'Найз', reminder_enabled: true, reminder_days: 1, notes: '' };
  const id = { name: fid('name'), month: fid('month'), day: fid('day'), year: fid('year'), rel: fid('rel'), rem: fid('rem'), days: fid('days'), notes: fid('notes') };
  const thisYear = new Date().getFullYear();
  return openFormModal({
    title: person ? 'Төрсөн өдөр засах' : 'Төрсөн өдөр нэмэх',
    submitLabel: person ? 'Хадгалах' : 'Нэмэх',
    fields: `
      <div class="field"><label for="${id.name}">Нэр</label>
        <input id="${id.name}" name="name" class="input" required maxlength="80" value="${esc(b.name)}" placeholder="Хэн бэ?" ${person ? '' : 'autofocus'}></div>
      <div class="field-row field-row-3">
        <div class="field"><label for="${id.month}">Сар</label><select id="${id.month}" name="birth_month" class="select" required>${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === Number(b.birth_month) ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label for="${id.day}">Өдөр</label><input id="${id.day}" name="birth_day" type="number" inputmode="numeric" min="1" max="31" class="input" required value="${b.birth_day}"></div>
        <div class="field"><label for="${id.year}">Он</label><input id="${id.year}" name="birth_year" type="number" inputmode="numeric" min="1900" max="${thisYear}" class="input" value="${b.birth_year || ''}" placeholder="Заавал биш"></div>
      </div>
      <div class="field"><label for="${id.rel}">Хамаарал</label><select id="${id.rel}" name="relationship" class="select">${options(RELATIONSHIPS, b.relationship)}</select></div>
      <div class="field-row">
        <div class="field field-switch"><span class="label">Сануулга</span>
          <label class="switch-row" for="${id.rem}"><span class="switch"><input id="${id.rem}" type="checkbox" name="reminder_enabled" ${b.reminder_enabled ? 'checked' : ''}><span></span></span><span class="muted small">Сануулах</span></label></div>
        <div class="field"><label for="${id.days}">Хэзээ</label><select id="${id.days}" name="reminder_days" class="select" ${b.reminder_enabled ? '' : 'disabled'}>${options(REMINDER_OPTIONS, b.reminder_days)}</select></div>
      </div>
      <div class="field"><label for="${id.notes}">Тэмдэглэл, бэлгийн санаа</label><textarea id="${id.notes}" name="notes" class="textarea" rows="2" placeholder="Заавал биш">${esc(b.notes)}</textarea></div>`,
    onMount(form) {
      const toggle = form.querySelector('[name=reminder_enabled]');
      toggle.addEventListener('change', () => { form.querySelector('[name=reminder_days]').disabled = !toggle.checked; });
    },
    async onSubmit(data) {
      const month = Number(data.birth_month);
      const day = Number(data.birth_day);
      if (!day || day < 1 || day > DAYS_IN_MONTH[month - 1]) throw new Error(`${MONTHS[month - 1]} ${DAYS_IN_MONTH[month - 1]} хоногтой — өдрөө шалгана уу.`);
      const year = data.birth_year ? Number(data.birth_year) : null;
      if (year && (year < 1900 || year > thisYear)) throw new Error(`Он 1900–${thisYear} хооронд байх ёстой.`);
      const payload = {
        name: data.name, birth_month: month, birth_day: day, birth_year: year, relationship: data.relationship,
        reminder_enabled: Boolean(data.reminder_enabled),
        reminder_days: data.reminder_days !== undefined ? Number(data.reminder_days) : (person?.reminder_days ?? 1),
        notes: data.notes,
      };
      const saved = person ? await birthdaysService.update(person.id, payload) : await birthdaysService.create(payload);
      toast(person ? 'Төрсөн өдөр шинэчлэгдлээ' : 'Төрсөн өдөр нэмэгдлээ');
      onSaved?.(saved);
    },
    onDelete: person ? () => deleteWithUndo(birthdaysService, person, person.name) : null,
  });
}

/* ───────────── "New" menu (top bar) ───────────── */
export function openNewMenu(anchor, { extra = [] } = {}) {
  openMenu(anchor, [
    { label: 'Хийх зүйл', icon: 'tasks', onSelect: () => openTaskForm() },
    ...extra,
    { label: 'Үйл явдал', icon: 'calendar', onSelect: () => openEventForm() },
    'sep',
    { label: 'Хүсэл мөрөөдөл', icon: 'sparkle', onSelect: () => openWishForm() },
    { label: 'Зорилго', icon: 'goals', onSelect: () => openGoalForm() },
    { label: 'Төсөл', icon: 'folder', onSelect: () => openProjectForm() },
    'sep',
    { label: 'Тэмдэглэл', icon: 'journal', onSelect: () => openJournalForm() },
    { label: 'Төрсөн өдөр', icon: 'gift', onSelect: () => openBirthdayForm() },
  ]);
}
