/**
 * Notifications — reminders computed from your data, with read / unread,
 * dismiss, quick actions, and an opt-in for browser (system) notifications.
 */
import { notificationsService } from '../services/notificationsService.js';
import { tasksService } from '../services/tasksService.js';
import { eventsService } from '../services/eventsService.js';
import { birthdaysService } from '../services/birthdaysService.js';
import { openTaskForm, openEventForm, openBirthdayForm } from '../components/forms.js';
import { openHomeworkForm } from '../components/schoolForms.js';
import { homeworkService } from '../services/schoolService.js';
import { shiftsService, ordersService, workGoalsService } from '../services/workService.js';
import { openShiftForm, openOrderForm, openWorkGoalForm } from '../components/workForms.js';
import { toggleTask } from '../components/taskItem.js';
import { emptyState, pageHead, toast } from '../lib/ui.js';
import { esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { navigate } from '../lib/nav.js';

let tab = 'all';

function openRef(n) {
  notificationsService.markRead(n.id);
  const { kind, id, goalId } = n.ref;
  if (kind === 'task') openTaskForm(tasksService.get(id));
  if (kind === 'event') {
    const ev = eventsService.get(id);
    navigate(`calendar?view=day&date=${ev.event_date}`);
    openEventForm(ev);
  }
  if (kind === 'birthday') openBirthdayForm(birthdaysService.get(id));
  if (kind === 'homework') openHomeworkForm(homeworkService.get(id));
  if (kind === 'shift') openShiftForm(shiftsService.get(id));
  if (kind === 'order') openOrderForm(ordersService.get(id));
  if (kind === 'workGoal') openWorkGoalForm(workGoalsService.get(id));
  if (kind === 'payday') navigate('work?tab=pay');
  if (kind === 'goal') navigate(`goals/${id}`);
  if (kind === 'project') navigate(`goals/${goalId || 'none'}`);
}

function itemHTML(n) {
  return `<li class="notif ${n.read ? '' : 'is-unread'}" data-id="${esc(n.id)}">
    <span class="notif-icon tone-${n.tone}">${icon(n.icon, 17)}</span>
    <button type="button" class="notif-body" data-action="open">
      <span class="notif-title">${esc(n.title)}</span>
      <span class="notif-text">${esc(n.text)}</span>
    </button>
    <div class="notif-actions">
      ${n.ref.kind === 'task' ? '<button type="button" class="btn btn-sm" data-action="complete">Дуусгах</button>' : ''}
      <button type="button" class="icon-btn icon-btn-sm" data-action="toggle-read" aria-label="${n.read ? 'Уншаагүй болгох' : 'Уншсан болгох'}" title="${n.read ? 'Уншаагүй болгох' : 'Уншсан болгох'}">${icon(n.read ? 'circle' : 'check', 15)}</button>
      <button type="button" class="icon-btn icon-btn-sm" data-action="dismiss" aria-label="Хаах" title="Хаах">${icon('x', 15)}</button>
    </div>
  </li>`;
}

function browserCard() {
  const perm = notificationsService.browserPermission();
  if (perm === 'granted' || perm === 'unsupported') return '';
  return `<div class="card notif-optin">
    <span class="notif-icon tone-info">${icon('bell', 17)}</span>
    <div><p class="notif-title">Удахгүй эхлэх үйл явдлын сануулга авах</p>
      <p class="small muted">${perm === 'denied' ? 'Хөтчийн мэдэгдэл хаагдсан байна. Сануулга авахын тулд хөтчийн тохиргооноос энэ сайтад зөвшөөрнө үү.' : 'Энэ цонх нээлттэй үед үйл явдал, цагтай ажлаас 10 минутын өмнө хөтөч сануулна.'}</p></div>
    ${perm === 'denied' ? '' : '<button type="button" class="btn btn-sm" data-action="enable-browser">Сануулга асаах</button>'}
  </div>`;
}

export default {
  title: 'Мэдэгдэл',
  render(root) {
    const all = notificationsService.list();
    const unread = all.filter((n) => !n.read).length;
    const list = tab === 'unread' ? all.filter((n) => !n.read) : all;
    const attention = list.filter((n) => n.group === 'attention');
    const upcoming = list.filter((n) => n.group === 'upcoming');

    root.innerHTML = `
      ${pageHead({
    eyebrow: unread ? `${unread} уншаагүй` : 'Ирсэн',
    title: 'Мэдэгдэл',
    actions: `<button type="button" class="btn" data-action="read-all" ${unread ? '' : 'disabled'}>${icon('check', 16)} Бүгдийг уншсан болгох</button>`,
  })}
      ${browserCard()}
      <div class="toolbar">
        <div class="tabs" role="tablist" aria-label="Мэдэгдэл шүүх">
          <button type="button" class="tab ${tab === 'all' ? 'is-active' : ''}" data-action="tab" data-value="all" role="tab" aria-selected="${tab === 'all'}">Бүгд<span class="count">${all.length}</span></button>
          <button type="button" class="tab ${tab === 'unread' ? 'is-active' : ''}" data-action="tab" data-value="unread" role="tab" aria-selected="${tab === 'unread'}">Уншаагүй<span class="count">${unread}</span></button>
        </div>
      </div>
      ${list.length ? `
        ${attention.length ? `<h2 class="section-title is-attention">Анхаарах</h2><div class="card card-list"><ul class="notif-list">${attention.map(itemHTML).join('')}</ul></div>` : ''}
        ${upcoming.length ? `<h2 class="section-title">Удахгүй</h2><div class="card card-list"><ul class="notif-list">${upcoming.map(itemHTML).join('')}</ul></div>` : ''}`
    : `<div class="card">${emptyState({
      icon: 'bell', title: tab === 'unread' ? 'Уншаагүй мэдэгдэл алга' : 'Шинэ мэдэгдэл алга',
      text: 'Хугацаа хэтэрсэн ажил, өнөөдрийн хугацаа, удахгүй болох үйл явдал, төрсөн өдрийн сануулга, зорилгын хугацаа энд автоматаар гарна.',
    })}</div>`}
      <p class="small faint page-note">Уншсан, хаасан төлөв зөвхөн энэ сешнд хадгалагдана.</p>`;

    root.onclick = async (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const id = el.closest('[data-id]')?.dataset.id;
      const n = id && all.find((x) => x.id === id);
      switch (el.dataset.action) {
        case 'tab': tab = el.dataset.value; this.render(root); break;
        case 'read-all': notificationsService.markAllRead(); toast('Бүх мэдэгдлийг уншсан болголоо'); break;
        case 'open': openRef(n); break;
        case 'toggle-read': if (n.read) notificationsService.markUnread(n.id); else notificationsService.markRead(n.id); break;
        case 'dismiss': notificationsService.dismiss(n.id); break;
        case 'complete': {
          const task = tasksService.get(n.ref.id);
          if (task) await toggleTask(task);
          break;
        }
        case 'enable-browser': {
          const result = await notificationsService.requestBrowserPermission();
          if (result === 'granted') {
            notificationsService.showBrowserNotification('Life OS сануулга асаалттай', 'Life OS нээлттэй үед үйл явдлаас 10 минутын өмнө сануулна.');
            toast('Хөтчийн сануулга асаалаа');
          } else toast('Хөтчийн сануулгыг зөвшөөрсөнгүй', { tone: 'danger' });
          this.render(root);
          break;
        }
        default:
      }
    };
  },
};
