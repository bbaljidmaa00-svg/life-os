/**
 * Birthday tracker — upcoming countdown, search, relationship filter,
 * sorting and per-person reminder settings (toggle right from the list).
 */
import { birthdaysService, nextOccurrence, daysUntil, ageAt, RELATIONSHIPS, reminderLabel } from '../services/birthdaysService.js';
import { openBirthdayForm, deleteWithUndo } from '../components/forms.js';
import { emptyState, pageHead, options, toast } from '../lib/ui.js';
import { esc, plural } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { MONTHS, MONTHS_SHORT, fmt } from '../lib/dates.js';

let q = '';
let rel = 'all';
let sort = 'upcoming';

const countdown = (days) => (days === 0 ? 'Өнөөдөр' : days === 1 ? 'Маргааш' : `${days} хоногийн дараа`);

function upcomingStrip() {
  const soon = birthdaysService.upcoming(60).slice(0, 3);
  if (!soon.length) return '';
  return `<div class="bday-upcoming">${soon.map((b) => {
    const age = ageAt(b, b.next);
    return `<button type="button" class="card bday-card ${b.days === 0 ? 'is-today' : ''}" data-action="edit" data-id="${b.id}">
      <span class="bday-count">${b.days === 0 ? icon('gift', 26) : `<strong>${b.days}</strong><span>хоног</span>`}</span>
      <span class="bday-info"><span class="bday-name">${esc(b.name)}</span><span class="small muted">${b.days === 0 ? 'Өнөөдөр төрсөн өдөр' : fmt.medium(b.next)}${age ? ` · ${age} нас хүрнэ` : ''}</span>
      <span class="small faint">${b.reminder_enabled ? `${icon('bell', 12)} ${reminderLabel(b.reminder_days)}` : 'Сануулгагүй'}</span></span>
    </button>`;
  }).join('')}</div>`;
}

function listHTML() {
  const all = birthdaysService.all();
  if (!all.length) {
    return `<div class="card">${emptyState({
      icon: 'gift', title: 'Төрсөн өдрийг бүү март',
      text: 'Чухал хүмүүсээ нэмж, хэзээ сануулахыг сонговол календарь болон мэдэгдэлд харагдана.',
      actions: `<button type="button" class="btn btn-primary" data-action="new">${icon('plus', 16)} Төрсөн өдөр нэмэх</button>`,
    })}</div>`;
  }
  const term = q.trim().toLowerCase();
  let list = all.filter((b) => (rel === 'all' || b.relationship === rel) && (!term || [b.name, b.notes].some((v) => v && v.toLowerCase().includes(term))));
  list = list.map((b) => ({ ...b, next: nextOccurrence(b), days: daysUntil(b) }));
  list.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'mn');
    if (sort === 'month') return a.birth_month - b.birth_month || a.birth_day - b.birth_day;
    return a.days - b.days || a.name.localeCompare(b.name, 'mn');
  });
  if (!list.length) return `<div class="card">${emptyState({ icon: 'search', title: 'Тохирох хүн алга', text: 'Өөр нэр эсвэл хамаарлаар хайгаарай.', actions: '<button type="button" class="btn" data-action="clear">Шүүлтүүр арилгах</button>' })}</div>`;

  return `<div class="card card-list"><ul class="bday-list">${list.map((b) => {
    const age = ageAt(b, b.next);
    return `<li class="bday-row" data-id="${b.id}">
      <span class="date-badge"><span>${b.birth_month}-р сар</span><strong>${b.birth_day}</strong></span>
      <button type="button" class="bday-main" data-action="edit" data-id="${b.id}" aria-label="Засах: ${esc(b.name)}">
        <span class="bday-name">${esc(b.name)}</span>
        <span class="bday-meta"><span class="badge">${esc(b.relationship)}</span><span>${countdown(b.days)}${age ? ` · ${age} нас хүрнэ` : ''}</span>${b.notes ? `<span class="faint">${esc(b.notes)}</span>` : ''}</span>
      </button>
      <button type="button" class="reminder-toggle ${b.reminder_enabled ? 'is-on' : ''}" data-action="toggle-reminder" data-id="${b.id}" aria-pressed="${b.reminder_enabled}" title="${b.reminder_enabled ? `Сануулга: ${reminderLabel(b.reminder_days)} — унтраах бол дарна уу` : 'Сануулга унтраалттай — асаах бол дарна уу'}">
        ${icon(b.reminder_enabled ? 'bell' : 'bellOff', 15)}<span>${b.reminder_enabled ? reminderLabel(b.reminder_days) : 'Унтраалттай'}</span>
      </button>
      <button type="button" class="icon-btn icon-btn-sm" data-action="delete" data-id="${b.id}" aria-label="Устгах: ${esc(b.name)}">${icon('trash', 15)}</button>
    </li>`;
  }).join('')}</ul></div>`;
}

export default {
  title: 'Төрсөн өдөр',
  render(root) {
    const all = birthdaysService.all();
    const thisMonth = all.filter((b) => b.birth_month === new Date().getMonth() + 1).length;
    root.innerHTML = `
      ${pageHead({
    eyebrow: all.length ? `${all.length} хүн · ${MONTHS[new Date().getMonth()]}д ${thisMonth}` : 'Хүмүүс',
    title: 'Төрсөн өдөр',
    actions: `<button type="button" class="btn btn-primary" data-action="new">${icon('plus', 16)} Төрсөн өдөр нэмэх</button>`,
  })}
      ${upcomingStrip()}
      ${all.length ? `<div class="toolbar">
        <label class="search-field">${icon('search', 16)}<input id="bdaySearch" type="search" class="input" placeholder="Хүн хайх" value="${esc(q)}" aria-label="Хүн хайх"></label>
        <select class="select" id="bdayRel" aria-label="Хамаарал">${options([{ value: 'all', label: 'Бүгд' }, ...RELATIONSHIPS], rel)}</select>
        <select class="select" id="bdaySort" aria-label="Эрэмбэлэх">${options([{ value: 'upcoming', label: 'Ойрын нь эхэнд' }, { value: 'name', label: 'Нэрээр' }, { value: 'month', label: 'Сарын дарааллаар' }], sort)}</select>
      </div>` : ''}
      <div id="bdayList">${listHTML()}</div>`;

    const refresh = () => { document.getElementById('bdayList').innerHTML = listHTML(); };
    root.oninput = (e) => { if (e.target.id === 'bdaySearch') { q = e.target.value; refresh(); } };
    root.onchange = (e) => {
      if (e.target.id === 'bdayRel') { rel = e.target.value; refresh(); }
      if (e.target.id === 'bdaySort') { sort = e.target.value; refresh(); }
    };
    root.onclick = async (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const person = el.dataset.id && birthdaysService.get(el.dataset.id);
      try {
        switch (el.dataset.action) {
          case 'new': openBirthdayForm(); break;
          case 'edit': openBirthdayForm(person); break;
          case 'delete': await deleteWithUndo(birthdaysService, person, person.name); break;
          case 'toggle-reminder': {
            const on = !person.reminder_enabled;
            await birthdaysService.update(person.id, { reminder_enabled: on });
            toast(on ? `${person.name}: сануулга асаалаа` : `${person.name}: сануулга унтраалаа`);
            break;
          }
          case 'clear': q = ''; rel = 'all'; this.render(root); break;
          default:
        }
      } catch (err) { toast(err.message, { tone: 'danger' }); }
    };
  },
};
