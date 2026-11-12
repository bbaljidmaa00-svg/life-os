/**
 * AI Assistant — conversation UI.
 *
 * Messages go through aiService.send(). Without AI_ENDPOINT the replies come
 * from local rules (clearly labelled). Replies can carry "actions" — proposed
 * changes the user confirms with a button (add task, add event, schedule,
 * break a project into tasks…). Nothing changes until the user clicks.
 */
import { aiService } from '../services/aiService.js';
import { KEY_QUESTIONS } from '../lib/localAssistant.js';
import { tasksService } from '../services/tasksService.js';
import { eventsService } from '../services/eventsService.js';
import { projectsService, goalsService } from '../services/goalsService.js';
import { taskItemHTML, handleTaskAction } from '../components/taskItem.js';
import { openTaskForm, openEventForm } from '../components/forms.js';
import { emptyState, openModal, confirmDialog, toast } from '../lib/ui.js';
import { esc, plural } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { navigate, rerender } from '../lib/nav.js';
import { todayKey, addDaysKey, fmt, relDay, fmtTime, fmtDuration, fromKey, keyOfTimestamp } from '../lib/dates.js';
import { PRIORITY_LABEL } from '../services/tasksService.js';
import { EVENT_CATEGORIES } from '../services/eventsService.js';

let activeId = null;
let composer = '';
let pending = false;
let lastRouteKey = null;
let lastCount = 0;
const drafts = new Map(); // edited breakdown steps, keyed "messageId:index"

const SUGGESTIONS = [
  ...KEY_QUESTIONS,
  { label: 'Өдрөө төлөвлөх', icon: 'calendar', prompt: 'Өдрөө төлөвлө' },
  { label: 'Статистик', icon: 'analytics', prompt: 'Статистикаа харуул' },
];

const CAPABILITIES = [
  { icon: 'tasks', title: 'Ажил нэмэх', text: 'Огноо, цаг, ач холбогдол, #ангиллаар нь бич.', prompt: 'Ажил: Баасан гарагт 15 цагт улирлын тайлан илгээх чухал #ажил 1 цаг' },
  { icon: 'calendar', title: 'Үйл явдал нэмэх', text: 'Уулзалт, хичээл, оройн хоол — цагтай нь.', prompt: 'Маргааш 12:30-13:30 Маятай үдийн хоол' },
  { icon: 'layers', title: 'Төслийг задлах', text: 'Төслийг ажлын жагсаалт болгох.', prompt: 'Төслийг задла: Портфолио вэбсайт гаргах' },
  { icon: 'clock', title: 'Өдрөө төлөвлөх', text: 'Дуусаагүй зүйлсийг өнөөдрийн үйл явдлын завсарт багтаах.', prompt: 'Өдрөө төлөвлө' },
  { icon: 'list', title: 'Дуусаагүй зүйлс', text: 'Хугацаа хэтэрснийг харж, дахин товлох.', prompt: 'Дуусаагүй зүйлс юу байна?' },
  { icon: 'zap', title: 'Бүтээмжийн статистик', text: 'Гүйцэтгэл, ажилласан хугацаа, сэтгэл санааны хэв маяг.', prompt: 'Статистикаа харуул' },
];

/* ───────────── text & helpers ───────────── */
function formatText(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

const statusLine = (a, appliedText) => {
  if (a.status === 'applied') return `<p class="ac-status is-ok">${icon('check', 14)} ${esc(appliedText)}</p>`;
  if (a.status === 'dismissed') return `<p class="ac-status">Татгалзсан</p>`;
  return '';
};

const btn = (label, action, msgId, i, cls = '', extra = '') => `<button type="button" class="btn btn-sm ${cls}" data-action="${action}" data-msg="${msgId}" data-i="${i}" ${extra}>${label}</button>`;

/* ───────────── action cards ───────────── */
function taskCard(m, a, i) {
  const d = a.data;
  return `<div class="action-card">
    <p class="ac-kicker">${icon('tasks', 14)} Санал болгосон ажил</p>
    <p class="ac-title">${esc(d.title)}</p>
    <dl class="ac-fields">
      <div><dt>Эцсийн хугацаа</dt><dd>${d.due_date ? `${esc(fmt.medium(d.due_date))}${d.due_time ? ` · ${fmtTime(d.due_time)}` : ''}` : 'Байхгүй'}</dd></div>
      <div><dt>Ач холбогдол</dt><dd>${PRIORITY_LABEL[d.priority] || 'Дунд'}</dd></div>
      <div><dt>Ангилал</dt><dd>${esc(d.category || '—')}</dd></div>
      <div><dt>Хугацаа</dt><dd>${d.estimated_minutes ? fmtDuration(d.estimated_minutes) : '—'}</dd></div>
    </dl>
    ${a.status === 'pending' ? `<div class="ac-actions">${btn(`${icon('plus', 14)} Ажил нэмэх`, 'ac-apply', m.id, i, 'btn-primary')}${btn('Засаад нэмэх', 'ac-edit', m.id, i)}${btn('Татгалзах', 'ac-dismiss', m.id, i, 'btn-ghost')}</div>`
    : `${statusLine(a, 'Хийх зүйлст нэмэгдлээ')}${a.status === 'applied' && tasksService.get(a.result_id) ? `<div class="ac-actions">${btn('Нээх', 'ac-open-task', m.id, i, 'btn-ghost')}</div>` : ''}`}
  </div>`;
}

function eventCard(m, a, i) {
  const d = a.data;
  const cat = EVENT_CATEGORIES.find((c) => c.value === d.category)?.label || 'Бусад';
  return `<div class="action-card">
    <p class="ac-kicker">${icon('calendar', 14)} Санал болгосон үйл явдал</p>
    <p class="ac-title">${esc(d.title)}</p>
    <dl class="ac-fields">
      <div><dt>Огноо</dt><dd>${esc(fmt.medium(d.event_date))}</dd></div>
      <div><dt>Цаг</dt><dd>${d.all_day ? 'Өдөржин' : `${fmtTime(d.start_time)} – ${fmtTime(d.end_time)}`}</dd></div>
      <div><dt>Ангилал</dt><dd>${cat}</dd></div>
    </dl>
    ${a.status === 'pending' ? `<div class="ac-actions">${btn(`${icon('plus', 14)} Календарьт нэмэх`, 'ac-apply', m.id, i, 'btn-primary')}${btn('Засаад нэмэх', 'ac-edit', m.id, i)}${btn('Татгалзах', 'ac-dismiss', m.id, i, 'btn-ghost')}</div>`
    : `${statusLine(a, 'Календарьт нэмэгдлээ')}${a.status === 'applied' ? `<div class="ac-actions"><a class="btn btn-sm btn-ghost" href="#/calendar?view=day&date=${d.event_date}">Календарьт нээх</a></div>` : ''}`}
  </div>`;
}

function memoryCard(m, a, i) {
  return `<div class="action-card">
    <p class="ac-kicker">${icon('bookmark', 14)} Санамж</p>
    <p class="ac-quote">“${esc(a.data.content)}”</p>
    ${a.status === 'pending' ? `<div class="ac-actions">${btn('Санамж хадгалах', 'ac-apply', m.id, i, 'btn-primary')}${btn('Татгалзах', 'ac-dismiss', m.id, i, 'btn-ghost')}</div>` : statusLine(a, 'Санамжид хадгалагдлаа')}
  </div>`;
}

function scheduleDayCard(m, a, i) {
  const plan = a.data;
  const taskBlocks = plan.blocks.filter((b) => b.kind === 'task');
  const missed = plan.unscheduled.map((id) => tasksService.get(id)).filter(Boolean);
  return `<div class="action-card">
    <p class="ac-kicker">${icon('clock', 14)} Хуваарийн ноорог · ${esc(relDay(plan.date))}</p>
    <ol class="ac-timeline">${plan.blocks.map((b) => `
      <li class="ac-block is-${b.kind} ${b.priority ? `prio-${b.priority}` : ''}">
        <span class="ac-time">${fmtTime(b.start)}–${fmtTime(b.end)}</span>
        <span class="ac-block-title">${icon(b.kind === 'event' ? 'calendar' : 'tasks', 13)}${esc(b.title)}</span>
      </li>`).join('')}
    </ol>
    ${missed.length ? `<p class="ac-note">${icon('alert', 14)} Багтаагүй: ${missed.map((t) => esc(t.title)).join(', ')}</p>` : ''}
    ${a.status === 'pending' && taskBlocks.length
    ? `<div class="ac-actions">${btn(`${icon('plus', 14)} ${taskBlocks.length} блокийг календарьт нэмэх`, 'ac-apply', m.id, i, 'btn-primary')}<a class="btn btn-sm" href="#/calendar?view=day&date=${plan.date}">Өдрийг нээх</a>${btn('Татгалзах', 'ac-dismiss', m.id, i, 'btn-ghost')}</div>`
    : `${statusLine(a, `Календарьт ${a.result_count || 0} блок нэмэгдлээ`)}${a.status === 'applied' ? `<div class="ac-actions"><a class="btn btn-sm btn-ghost" href="#/calendar?view=day&date=${plan.date}">Өдрийг нээх</a></div>` : ''}`}
  </div>`;
}

function scheduleWeekCard(m, a, i) {
  const plan = a.data;
  return `<div class="action-card">
    <p class="ac-kicker">${icon('calendar', 14)} Ирэх 7 хоног</p>
    <div class="ac-week">${plan.days.map((d) => {
    const pct = d.capacity ? Math.min(100, Math.round((d.planned / d.capacity) * 100)) : (d.planned ? 100 : 0);
    const over = d.planned > d.capacity;
    return `<div class="ac-week-row ${over ? 'is-over' : ''}">
        <span class="ac-day">${fmt.weekdayShort(fromKey(d.date))} <b>${fromKey(d.date).getDate()}</b></span>
        <div class="ac-load" title="${fmtDuration(d.capacity)} чөлөөт цагаас ${fmtDuration(d.planned)} төлөвлөсөн"><span style="width:${pct}%"></span></div>
        <span class="ac-load-text">${fmtDuration(d.planned)} / ${fmtDuration(d.capacity)}</span>
        ${d.tasks.length ? `<p class="ac-day-tasks">${d.tasks.map((t) => `<span class="${t.reason === 'suggested' ? 'is-suggested' : t.reason === 'overdue' ? 'is-overdue' : ''}">${esc(t.title)}</span>`).join('')}</p>` : ''}
      </div>`;
  }).join('')}</div>
    <p class="ac-legend small faint"><span class="is-suggested">Санал болгосон өдөр</span> <span class="is-overdue">Хэтэрсэн</span> · багтаамж = ажлын цаг − үйл явдал</p>
    ${a.status === 'pending' && plan.suggestions.length
    ? `<div class="ac-actions">${btn(`${plan.suggestions.length} санал болгосон огноог тохируулах`, 'ac-apply', m.id, i, 'btn-primary')}<a class="btn btn-sm" href="#/calendar?view=week&date=${todayKey()}">Долоо хоногийг нээх</a>${btn('Татгалзах', 'ac-dismiss', m.id, i, 'btn-ghost')}</div>`
    : a.status === 'pending' ? `<div class="ac-actions"><a class="btn btn-sm" href="#/calendar?view=week&date=${todayKey()}">Долоо хоногийг нээх</a></div>` : statusLine(a, `${a.result_count || 0} ажилд огноо тохирууллаа`)}
  </div>`;
}

function reviewCard(m, a) {
  const tasks = a.data.task_ids.map((id) => tasksService.get(id)).filter(Boolean);
  const overdueOpen = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < todayKey());
  return `<div class="action-card">
    <p class="ac-kicker">${icon('list', 14)} Дуусаагүй зүйлс</p>
    ${tasks.length ? `<ul class="task-list ac-review">${tasks.map((t) => taskItemHTML(t)).join('')}</ul>` : '<p class="small faint">Эдгээр ажил устгагдсан.</p>'}
    ${overdueOpen.length ? `<div class="ac-actions"><button type="button" class="btn btn-sm btn-primary" data-action="ac-move-overdue" data-ids="${overdueOpen.map((t) => t.id).join(',')}">Хэтэрсэн ${overdueOpen.length} зүйлийг өнөөдөр рүү шилжүүлэх</button></div>` : ''}
  </div>`;
}

function insightsCard(a) {
  const d = a.data;
  const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
  return `<div class="action-card">
    <p class="ac-kicker">${icon('zap', 14)} Сүүлийн 7 хоног</p>
    <div class="ac-stats">
      <div><span>Дууссан</span><strong>${d.completed}</strong><small>өмнөх 7 хоногоос ${d.completed - d.prevCompleted >= 0 ? '+' : ''}${d.completed - d.prevCompleted}</small></div>
      <div><span>Дуусах ёстойгоос</span><strong>${pct(d.completionRate)}</strong></div>
      <div><span>Хугацаандаа</span><strong>${pct(d.onTimeRate)}</strong></div>
      <div><span>Ажилласан хугацаа</span><strong>${fmtDuration(d.focusMinutes)}</strong></div>
    </div>
    <div class="ac-actions"><a class="btn btn-sm" href="#/analytics">Шинжилгээ нээх</a>${d.overdue ? '<a class="btn btn-sm btn-ghost" href="#/tasks?due=overdue">Хэтэрснийг харах</a>' : ''}</div>
  </div>`;
}

function breakdownCard(m, a, i) {
  const key = `${m.id}:${i}`;
  if (!drafts.has(key)) drafts.set(key, { steps: [...a.data.steps], target: a.data.project_id || 'new' });
  const draft = drafts.get(key);
  if (a.status !== 'pending') {
    const project = projectsService.get(a.result_project_id);
    return `<div class="action-card"><p class="ac-kicker">${icon('layers', 14)} Задаргаа · ${esc(a.data.title)}</p>
      ${statusLine(a, `${project ? `“${project.title}” төсөлд ` : ''}${a.result_count || 0} ажил үүслээ`)}
      ${a.status === 'applied' && project ? `<div class="ac-actions"><a class="btn btn-sm btn-ghost" href="#/goals/${project.goal_id || 'none'}">Төслийг нээх</a></div>` : ''}</div>`;
  }
  const projects = projectsService.all();
  return `<div class="action-card">
    <p class="ac-kicker">${icon('layers', 14)} Задаргаа · ${esc(a.data.title)} <span class="badge">Ерөнхий загвар</span></p>
    <ol class="ac-steps">${draft.steps.map((s, j) => `
      <li><input class="input input-sm" id="step-${m.id}-${i}-${j}" data-step="${j}" data-msg="${m.id}" data-i="${i}" value="${esc(s)}" aria-label="Алхам ${j + 1}">
        <button type="button" class="icon-btn icon-btn-sm" data-action="ac-step-remove" data-msg="${m.id}" data-i="${i}" data-step="${j}" aria-label="Хасах: алхам ${j + 1}">${icon('x', 15)}</button></li>`).join('')}
    </ol>
    <button type="button" class="link-btn ac-add-step" data-action="ac-step-add" data-msg="${m.id}" data-i="${i}">${icon('plus', 14)} Алхам нэмэх</button>
    <div class="field ac-target"><label for="target-${m.id}-${i}">Хийх зүйлсийг аль төсөлд үүсгэх вэ</label>
      <select class="select select-sm" id="target-${m.id}-${i}" data-target data-msg="${m.id}" data-i="${i}">
        <option value="new" ${draft.target === 'new' ? 'selected' : ''}>Шинэ төсөл: “${esc(a.data.title)}”</option>
        ${projects.map((p) => `<option value="${p.id}" ${draft.target === p.id ? 'selected' : ''}>${esc(p.title)}${goalsService.get(p.goal_id) ? ` — ${esc(goalsService.get(p.goal_id).title)}` : ''}</option>`).join('')}
      </select></div>
    <div class="ac-actions">${btn(`${draft.steps.filter((s) => s.trim()).length} ажил үүсгэх`, 'ac-apply', m.id, i, 'btn-primary')}${btn('Татгалзах', 'ac-dismiss', m.id, i, 'btn-ghost')}</div>
  </div>`;
}

function renderAction(m, a, i) {
  switch (a.type) {
    case 'create_task': return taskCard(m, a, i);
    case 'create_event': return eventCard(m, a, i);
    case 'create_memory': return memoryCard(m, a, i);
    case 'schedule_day': return scheduleDayCard(m, a, i);
    case 'schedule_week': return scheduleWeekCard(m, a, i);
    case 'review': return reviewCard(m, a);
    case 'insights': return insightsCard(a);
    case 'breakdown': return breakdownCard(m, a, i);
    case 'link': return `<div class="ac-actions ac-inline"><a class="btn btn-sm" href="${esc(a.data.href)}">${esc(a.data.label)}</a></div>`;
    default: return '';
  }
}

function messageHTML(m) {
  const sent = new Date(m.created_at);
  const time = fmtTime(`${String(sent.getHours()).padStart(2, '0')}:${String(sent.getMinutes()).padStart(2, '0')}`);
  if (m.role === 'user') {
    return `<div class="msg msg-user"><div class="msg-bubble">${formatText(m.content)}</div></div>`;
  }
  const source = m.source === 'ai' ? 'AI' : m.source === 'error' ? 'Алдаа' : 'Таны өгөгдлөөс тооцоолсон · API-гүй';
  return `<div class="msg msg-assistant">
    <div class="msg-avatar" aria-hidden="true">${icon('assistant', 16)}</div>
    <div class="msg-content">
      <div class="msg-bubble ${m.source === 'error' ? 'is-error' : ''}">${formatText(m.content)}</div>
      ${m.actions.map((a, i) => renderAction(m, a, i)).join('')}
      <p class="msg-source">${source} · ${time}</p>
    </div>
  </div>`;
}

/* ───────────── panels ───────────── */
function memoriesPanel() {
  const mems = [...aiService.memories.all()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const today = todayKey();
  return `<div class="mem-panel">
    <div class="mem-head"><h2 class="card-title">${icon('bookmark')} Санамж</h2><span class="badge">${mems.length}</span></div>
    <p class="small muted">Туслахын санаж байх ёстой таны тухай баримтууд. Таны өгөгдөлтэй хамт хадгалагдаж, AI загвар холбогдсоны дараа хүсэлт бүртэй хамт илгээгдэнэ.</p>
    <form class="mem-form" data-mem-form autocomplete="off">
      <input class="input input-sm" name="memory" id="memInput" placeholder="жишээ нь: Би үдээс өмнө сайн төвлөрдөг" maxlength="300" aria-label="Шинэ санамж">
      <button type="submit" class="btn btn-sm">Хадгалах</button>
    </form>
    ${mems.length ? `<ul class="mem-list">${mems.map((m) => `<li class="mem-item"><span>${esc(m.content)}</span><button type="button" class="icon-btn icon-btn-sm" data-action="mem-delete" data-id="${m.id}" aria-label="Санамж устгах">${icon('trash', 14)}</button></li>`).join('')}</ul>`
    : '<p class="small faint mem-empty">Санамж алга байна.</p>'}
    <div class="mem-context">
      <p class="label">Туслахад ашиглагдах мэдээлэл</p>
      <ul>
        <li>${icon('tasks', 14)} ${tasksService.open().length} дуусаагүй ажил</li>
        <li>${icon('calendar', 14)} ирэх 7 хоногт ${eventsService.between(today, addDaysKey(today, 6)).length} үйл явдал</li>
        <li>${icon('goals', 14)} ${goalsService.all().filter((g) => g.status === 'active').length} идэвхтэй зорилго</li>
      </ul>
    </div>
  </div>`;
}

function welcomeHTML() {
  return `<div class="ai-welcome">
    <div class="ai-welcome-mark">${icon('assistant', 26)}</div>
    <h2>Юу асуух вэ?</h2>
    <p class="muted">Таны хуанли, хичээл, ээлж, хийх зүйлсээс шууд тооцоолж хариулна.</p>
    <div class="key-questions">${KEY_QUESTIONS.map((q) => `<button type="button" class="key-q" data-action="suggest" data-prompt="${esc(q.prompt)}"><span class="key-q-emoji" aria-hidden="true">${q.emoji}</span><span>${esc(q.label)}</span></button>`).join('')}</div>
    <p class="small faint ai-welcome-more">Эсвэл ажил, үйл явдлаа энгийн үгээр бичээрэй — өөрчлөлт бүрийг эхлээд санал хэлбэрээр харуулж, та баталгаажуулна.</p>
    <div class="ai-capabilities">${CAPABILITIES.map((c) => `
      <button type="button" class="ai-cap" data-action="suggest" data-prompt="${esc(c.prompt)}">
        <span class="ai-cap-icon">${icon(c.icon, 17)}</span><span class="ai-cap-title">${esc(c.title)}</span><span class="ai-cap-text">${esc(c.text)}</span>
      </button>`).join('')}</div>
  </div>`;
}

/* ───────────── actions ───────────── */
async function send(text) {
  const value = text.trim();
  if (!value || pending) return;
  composer = '';
  pending = true;
  rerender();
  try {
    let id = activeId;
    if (!id || !aiService.conversations.get(id)) {
      const convo = await aiService.startConversation(value);
      id = convo.id;
      activeId = id;
      navigate(`assistant/${id}`, { replace: true });
    }
    await aiService.send(id, value);
  } catch (err) {
    toast(err.message, { tone: 'danger' });
    composer = value;
  } finally {
    pending = false;
    rerender();
  }
}

async function apply(messageId, index) {
  const message = aiService.messages.get(messageId);
  const a = message?.actions[index];
  if (!a || a.status !== 'pending') return;
  try {
    switch (a.type) {
      case 'create_task': {
        const t = await tasksService.create({ ...a.data });
        await aiService.updateAction(messageId, index, { status: 'applied', result_id: t.id });
        toast('Ажил нэмэгдлээ');
        break;
      }
      case 'create_event': {
        const ev = await eventsService.create({ ...a.data });
        await aiService.updateAction(messageId, index, { status: 'applied', result_id: ev.id });
        toast('Үйл явдал нэмэгдлээ');
        break;
      }
      case 'create_memory': {
        await aiService.memories.create({ content: a.data.content, source: 'assistant' });
        await aiService.updateAction(messageId, index, { status: 'applied' });
        toast('Санамж хадгалагдлаа');
        break;
      }
      case 'schedule_day': {
        const blocks = a.data.blocks.filter((b) => b.kind === 'task');
        for (const b of blocks) {
          await eventsService.create({
            title: `Төвлөрөл: ${b.title}`, event_date: a.data.date, start_time: b.start, end_time: b.end,
            all_day: false, category: 'focus', description: 'Туслахын хуваариас үүсгэсэн төвлөрлийн блок.',
          });
        }
        await aiService.updateAction(messageId, index, { status: 'applied', result_count: blocks.length });
        toast(`${blocks.length} блок нэмэгдлээ`);
        break;
      }
      case 'schedule_week': {
        let n = 0;
        for (const s of a.data.suggestions) {
          const t = tasksService.get(s.task_id);
          if (t && !t.due_date && t.status !== 'done') { await tasksService.update(t.id, { due_date: s.date }); n += 1; }
        }
        await aiService.updateAction(messageId, index, { status: 'applied', result_count: n });
        toast(`${n} ажилд огноо тохирууллаа`);
        break;
      }
      case 'breakdown': {
        const draft = drafts.get(`${messageId}:${index}`) || { steps: a.data.steps, target: 'new' };
        const steps = draft.steps.map((s) => s.trim()).filter(Boolean);
        if (!steps.length) { toast('Эхлээд дор хаяж нэг алхам нэмнэ үү.', { tone: 'danger' }); return; }
        let projectId = draft.target;
        if (projectId === 'new' || !projectsService.get(projectId)) {
          projectId = (await projectsService.create({ title: a.data.title, status: 'active' })).id;
        }
        for (const s of steps) await tasksService.create({ title: s, project_id: projectId });
        await aiService.updateAction(messageId, index, { status: 'applied', result_count: steps.length, result_project_id: projectId });
        drafts.delete(`${messageId}:${index}`);
        toast(`${steps.length} ажил үүслээ`);
        break;
      }
      default:
    }
  } catch (err) {
    toast(err.hint ? `${err.message} — ${err.hint}` : err.message, { tone: 'danger' });
  }
}

function editFirst(messageId, index) {
  const a = aiService.messages.get(messageId).actions[index];
  const onSaved = (item) => aiService.updateAction(messageId, index, { status: 'applied', result_id: item.id });
  if (a.type === 'create_task') openTaskForm(null, a.data, { onSaved });
  if (a.type === 'create_event') openEventForm(null, a.data, { onSaved });
}

function bindMemoryForm(container, refresh) {
  container.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-mem-form]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input');
    const content = input.value.trim();
    if (!content) { input.focus(); return; }
    try {
      await aiService.memories.create({ content, source: 'user' });
      input.value = '';
      toast('Санамж хадгалагдлаа');
      refresh?.();
    } catch (err) { toast(err.message, { tone: 'danger' }); }
  });
  container.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action="mem-delete"]');
    if (!b) return;
    try { await aiService.memories.remove(b.dataset.id); toast('Санамж устгагдлаа'); refresh?.(); } catch (err) { toast(err.message, { tone: 'danger' }); }
  });
}

/* ───────────── page ───────────── */
export default {
  title: 'Туслах',
  render(root, route) {
    if (route.key !== lastRouteKey) {
      lastRouteKey = route.key;
      activeId = route.params[0] || null;
      if (route.query.prompt) composer = route.query.prompt;
      if (route.query.send === '1' && route.query.prompt) {
        const prompt = route.query.prompt;
        composer = '';
        setTimeout(() => send(prompt));
      }
    }
    if (activeId && !aiService.conversations.get(activeId)) activeId = null;
    const conversations = aiService.sortedConversations();
    const messages = activeId ? aiService.messagesFor(activeId) : [];
    const active = activeId ? aiService.conversations.get(activeId) : null;
    const connected = aiService.isConnected();

    root.innerHTML = `
      <div class="ai-layout">
        <aside class="card ai-convos" aria-label="Яриа">
          <button type="button" class="btn btn-block" data-action="new-chat">${icon('plus', 16)} Шинэ яриа</button>
          <p class="ai-convos-label">Сүүлийн яриа</p>
          ${conversations.length ? `<ul class="convo-list">${conversations.map((c) => `
            <li class="convo-item ${c.id === activeId ? 'is-active' : ''}">
              <button type="button" class="convo-open" data-action="open-chat" data-id="${c.id}" ${c.id === activeId ? 'aria-current="true"' : ''}><span class="convo-title">${esc(c.title)}</span><span class="convo-date">${esc(relDay(keyOfTimestamp(c.created_at) || todayKey()))}</span></button>
              <button type="button" class="icon-btn icon-btn-sm" data-action="delete-chat" data-id="${c.id}" aria-label="Яриа устгах: “${esc(c.title)}”">${icon('trash', 14)}</button>
            </li>`).join('')}</ul>`
    : '<p class="small faint convo-empty">Таны яриа энд харагдана.</p>'}
        </aside>

        <section class="card ai-chat" aria-label="Чат">
          <header class="ai-chat-head">
            <div class="ai-chat-title">
              ${conversations.length ? `<select class="select select-sm ai-convo-select" id="convoSelect" aria-label="Яриа сонгох">
                <option value="">Шинэ яриа</option>${conversations.map((c) => `<option value="${c.id}" ${c.id === activeId ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select>` : ''}
              <h2 class="ai-title">${esc(active?.title || 'Шинэ яриа')}</h2>
            </div>
            <span class="badge ${connected ? 'tone-success' : 'tone-info'}" title="${connected ? 'Мессеж таны AI endpoint руу явна' : 'Хариулт таны өгөгдлөөс шууд тооцоологдоно'}">${icon(connected ? 'check' : 'info', 13)} ${connected ? 'AI холбогдсон' : 'API-гүй туслах'}</span>
            <button type="button" class="icon-btn ai-mem-btn" data-action="open-memories" aria-label="Санамж">${icon('bookmark')}</button>
            ${active ? `<button type="button" class="icon-btn ai-new-btn" data-action="new-chat" aria-label="Шинэ яриа">${icon('plus')}</button>` : ''}
          </header>
          ${connected || !messages.length ? '' : `<div class="ai-notice">${icon('info', 16)}<p><strong>API-гүй туслах.</strong> Чөлөөт яриа биш — тогтсон асуултуудад таны өгөгдлөөс тооцоолж хариулна. Доорх товчнуудыг дараарай.</p></div>`}
          <div class="ai-messages" id="aiMessages" aria-live="polite">
            ${messages.length ? messages.map(messageHTML).join('') : welcomeHTML()}
            ${pending ? `<div class="msg msg-assistant"><div class="msg-avatar" aria-hidden="true">${icon('assistant', 16)}</div><div class="msg-content"><div class="msg-bubble typing" aria-label="Боловсруулж байна"><span></span><span></span><span></span></div></div></div>` : ''}
          </div>
          <div class="ai-footer">
          ${messages.length ? `<div class="ai-suggest" aria-label="Санал">${SUGGESTIONS.map((s) => `<button type="button" class="chip-btn" data-action="suggest" data-prompt="${esc(s.prompt)}">${icon(s.icon, 14)}${esc(s.label)}</button>`).join('')}</div>` : ''}
          <form class="ai-composer" id="aiComposer" autocomplete="off">
            <textarea id="aiInput" rows="1" maxlength="2000" placeholder="Ажил, үйл явдал бичих эсвэл төлөвлөгөө асуух…" aria-label="Мессеж">${esc(composer)}</textarea>
            <button type="submit" class="btn btn-primary btn-icon-only" aria-label="Илгээх" ${pending ? 'disabled' : ''}>${icon('send', 17)}</button>
          </form>
          <p class="ai-hint small faint">Enter — илгээх · Shift + Enter — шинэ мөр</p>
          </div>
        </section>

        <aside class="card ai-memories" aria-label="Санамж">${memoriesPanel()}</aside>
      </div>`;

    const list = root.querySelector('#aiMessages');
    list.scrollTop = list.scrollHeight;
    // On phones the whole page scrolls (composer is sticky), so follow new messages there too.
    const count = messages.length + (pending ? 1 : 0);
    if (count !== lastCount && window.matchMedia('(max-width: 760px)').matches) {
      requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight));
    }
    lastCount = count;
    const input = root.querySelector('#aiInput');
    const autosize = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; };
    autosize();

    bindMemoryForm(root.querySelector('.ai-memories'));

    root.oninput = (e) => {
      if (e.target.id === 'aiInput') { composer = e.target.value; autosize(); }
      if (e.target.dataset.step !== undefined && e.target.dataset.msg) {
        const draft = drafts.get(`${e.target.dataset.msg}:${e.target.dataset.i}`);
        if (draft) draft.steps[Number(e.target.dataset.step)] = e.target.value;
      }
    };
    root.onchange = (e) => {
      if (e.target.id === 'convoSelect') {
        activeId = e.target.value || null;
        navigate(activeId ? `assistant/${activeId}` : 'assistant', { replace: true });
      }
      if (e.target.dataset.target !== undefined) {
        const draft = drafts.get(`${e.target.dataset.msg}:${e.target.dataset.i}`);
        if (draft) draft.target = e.target.value;
      }
    };
    root.onkeydown = (e) => {
      if (e.target.id === 'aiInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send(e.target.value);
      }
    };
    root.onsubmit = (e) => {
      if (e.target.id !== 'aiComposer') return;
      e.preventDefault();
      send(input.value);
    };
    root.onclick = async (e) => {
      if (handleTaskAction(e)) return;
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const { msg, i } = el.dataset;
      const index = Number(i);
      switch (el.dataset.action) {
        case 'new-chat': activeId = null; composer = ''; navigate('assistant', { replace: true }); setTimeout(() => document.getElementById('aiInput')?.focus()); break;
        case 'open-chat': activeId = el.dataset.id; navigate(`assistant/${activeId}`, { replace: true }); break;
        case 'delete-chat': {
          const c = aiService.conversations.get(el.dataset.id);
          if (!(await confirmDialog({ title: 'Яриаг устгах уу?', message: `“${c.title}” болон түүний мессежүүд устна. Нэмсэн ажил, үйл явдал хэвээр үлдэнэ.` }))) return;
          try {
            await aiService.deleteConversation(c.id);
            if (activeId === c.id) { activeId = null; navigate('assistant', { replace: true }); }
            toast('Яриа устгагдлаа');
          } catch (err) { toast(err.message, { tone: 'danger' }); }
          break;
        }
        case 'suggest': send(el.dataset.prompt); break;
        case 'open-memories':
          openModal({
            title: 'Санамж',
            body: `<div id="memModalBody">${memoriesPanel()}</div>`,
            onMount(modal) {
              const body = modal.querySelector('#memModalBody');
              bindMemoryForm(body, () => { body.innerHTML = memoriesPanel(); body.querySelector('input')?.focus(); });
            },
          });
          break;
        case 'ac-apply': apply(msg, index); break;
        case 'ac-edit': editFirst(msg, index); break;
        case 'ac-dismiss': aiService.updateAction(msg, index, { status: 'dismissed' }).catch((err) => toast(err.message, { tone: 'danger' })); break;
        case 'ac-open-task': {
          const t = tasksService.get(aiService.messages.get(msg).actions[index].result_id);
          if (t) openTaskForm(t);
          break;
        }
        case 'ac-step-add': {
          const draft = drafts.get(`${msg}:${i}`);
          draft.steps.push('');
          rerender();
          setTimeout(() => document.getElementById(`step-${msg}-${i}-${draft.steps.length - 1}`)?.focus());
          break;
        }
        case 'ac-step-remove': {
          const draft = drafts.get(`${msg}:${i}`);
          draft.steps.splice(Number(el.dataset.step), 1);
          rerender();
          break;
        }
        case 'ac-move-overdue': {
          const ids = el.dataset.ids.split(',');
          try {
            for (const id of ids) if (tasksService.get(id)) await tasksService.update(id, { due_date: todayKey() });
            toast(`${ids.length} зүйлийг өнөөдөр рүү шилжүүллээ`);
          } catch (err) { toast(err.message, { tone: 'danger' }); }
          break;
        }
        default:
      }
    };
  },
};
