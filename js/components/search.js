/**
 * Global search across tasks, events, goals, projects, journal and birthdays.
 * Desktop: the field in the top bar. Mobile: a search sheet.
 */
import { tasksService } from '../services/tasksService.js';
import { eventsService } from '../services/eventsService.js';
import { goalsService, projectsService } from '../services/goalsService.js';
import { journalService } from '../services/journalService.js';
import { birthdaysService, daysUntil } from '../services/birthdaysService.js';
import { openTaskForm, openEventForm, openJournalForm, openBirthdayForm } from './forms.js';
import { ordersService, contactsService, workplacesService, orderStatusLabel, money } from '../services/workService.js';
import { homeworkService, subjectById } from '../services/schoolService.js';
import { openOrderForm, openContactForm, openWorkplaceForm } from './workForms.js';
import { openHomeworkForm } from './schoolForms.js';
import { navigate } from '../lib/nav.js';
import { openModal } from '../lib/ui.js';
import { esc, truncate, plural } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { fmt, relDay, fmtTime, MONTHS_SHORT } from '../lib/dates.js';

export function searchEverything(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const has = (...values) => values.some((v) => v && String(v).toLowerCase().includes(q));
  const groups = [];
  const add = (label, items) => { if (items.length) groups.push({ label, items: items.slice(0, 5) }); };

  add('Хийх зүйлс', tasksService.all().filter((t) => has(t.title, t.notes, t.category)).map((t) => ({
    icon: 'tasks', title: t.title,
    sub: [t.status === 'done' ? 'Дууссан' : null, t.due_date ? relDay(t.due_date) : 'Огноогүй', t.category].filter(Boolean).join(' · '),
    open: () => openTaskForm(t),
  })));
  add('Үйл явдал', eventsService.all().filter((e) => has(e.title, e.location, e.description)).map((e) => ({
    icon: 'calendar', title: e.title,
    sub: `${fmt.medium(e.event_date)}${e.start_time && !e.all_day ? ` · ${fmtTime(e.start_time)}` : ''}${e.location ? ` · ${e.location}` : ''}`,
    open: () => { navigate(`calendar?view=day&date=${e.event_date}`); openEventForm(e); },
  })));
  add('Зорилго', goalsService.all().filter((g) => has(g.title, g.description)).map((g) => ({
    icon: 'goals', title: g.title, sub: g.target_date ? `Зорилт: ${fmt.short(g.target_date)}` : 'Зорилго',
    open: () => navigate(`goals/${g.id}`),
  })));
  add('Төслүүд', projectsService.all().filter((p) => has(p.title, p.description)).map((p) => ({
    icon: 'folder', title: p.title, sub: goalsService.get(p.goal_id)?.title || 'Зорилгогүй',
    open: () => navigate(`goals/${p.goal_id || 'none'}`),
  })));
  add('Тэмдэглэл', journalService.all().filter((j) => has(j.title, j.reflection, j.gratitude)).map((j) => ({
    icon: 'journal', title: j.title || fmt.long(j.entry_date), sub: truncate(j.reflection || j.gratitude, 70),
    open: () => openJournalForm(j),
  })));
  add('Төрсөн өдөр', birthdaysService.all().filter((b) => has(b.name, b.notes, b.relationship)).map((b) => ({
    icon: 'gift', title: b.name,
    sub: `${b.birth_month}-р сарын ${b.birth_day} · ${daysUntil(b) === 0 ? 'өнөөдөр' : `${daysUntil(b)} хоногийн дараа`}`,
    open: () => openBirthdayForm(b),
  })));
  add('Гэрийн даалгавар', homeworkService.all().filter((h) => has(h.title, h.description)).map((h) => ({
    icon: 'book', title: h.title, sub: [subjectById(h.subject_id)?.name, h.due_date ? relDay(h.due_date) : null].filter(Boolean).join(' · '),
    open: () => openHomeworkForm(h),
  })));
  add('Захиалга', ordersService.all().filter((o) => has(o.customer_name, o.items, o.customer_contact, o.notes)).map((o) => ({
    icon: 'bag', title: `${o.customer_name} — ${o.items}`, sub: [orderStatusLabel(o.status), o.price ? money(o.price) : null, o.due_date ? relDay(o.due_date) : null].filter(Boolean).join(' · '),
    open: () => openOrderForm(o),
  })));
  add('Ажил', [
    ...workplacesService.all().filter((w) => has(w.name, w.notes)).map((w) => ({ icon: 'briefcase', title: w.name, sub: 'Ажлын газар', open: () => openWorkplaceForm(w) })),
    ...contactsService.all().filter((c) => has(c.name, c.role, c.notes, c.contact)).map((c) => ({ icon: 'users', title: c.name, sub: c.role || 'Хамт ажиллагч', open: () => openContactForm(c) })),
  ]);
  return groups;
}

/** Wires a search input to a results container (keyboard friendly). */
export function bindSearch(input, results, { floating = true, onPick } = {}) {
  let flat = [];
  let active = -1;

  const highlight = () => {
    results.querySelectorAll('.sr-item').forEach((el, i) => {
      el.classList.toggle('is-active', i === active);
      el.setAttribute('aria-selected', String(i === active));
      if (i === active) el.scrollIntoView({ block: 'nearest' });
    });
  };

  const draw = () => {
    const value = input.value.trim();
    if (!value) {
      results.innerHTML = floating ? '' : '<p class="sr-empty">Хийх зүйлс, үйл явдал, зорилго, даалгавар, захиалга, тэмдэглэлээс хайна.</p>';
      results.hidden = floating;
      flat = [];
      return;
    }
    const groups = searchEverything(value);
    flat = groups.flatMap((g) => g.items);
    active = flat.length ? 0 : -1;
    let i = -1;
    results.innerHTML = groups.length
      ? groups.map((g) => `<div class="sr-group" role="group" aria-label="${esc(g.label)}"><p class="sr-label">${esc(g.label)}</p>${g.items.map((it) => {
        i += 1;
        return `<button type="button" class="sr-item ${i === active ? 'is-active' : ''}" data-i="${i}" role="option" aria-selected="${i === active}">${icon(it.icon, 16)}<span class="sr-text"><span class="sr-title">${esc(it.title)}</span>${it.sub ? `<span class="sr-sub">${esc(it.sub)}</span>` : ''}</span></button>`;
      }).join('')}</div>`).join('')
      : `<p class="sr-empty">“${esc(value)}” гэсэн илэрц олдсонгүй.</p>`;
    results.hidden = false;
  };

  const pick = (i) => {
    const item = flat[i];
    if (!item) return;
    input.value = '';
    draw();
    input.blur();
    onPick?.();
    item.open();
  };

  input.addEventListener('input', draw);
  input.addEventListener('focus', () => { if (input.value.trim()) draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flat.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length;
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape' && floating) {
      input.value = '';
      draw();
      input.blur();
    }
  });
  results.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus while clicking
  results.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) pick(Number(b.dataset.i));
  });
  if (floating) input.addEventListener('blur', () => setTimeout(() => { results.hidden = true; }, 120));
  draw();
}

export function openSearchSheet() {
  openModal({
    title: 'Хайх',
    body: `<div class="search-sheet">
        <div class="search-field">${icon('search', 16)}<input id="searchSheetInput" type="search" class="input" placeholder="Бүгдээс хайх…" autocomplete="off" aria-label="Бүгдээс хайх" autofocus></div>
        <div class="search-results is-static" id="searchSheetResults" role="listbox"></div>
      </div>`,
    onMount(modal, close) {
      bindSearch(modal.querySelector('#searchSheetInput'), modal.querySelector('#searchSheetResults'), { floating: false, onPick: close });
    },
  });
}
