/**
 * Journal — daily reflections with mood. A month mood map, simple stats,
 * and a searchable / filterable list of entries.
 */
import { journalService, MOODS, moodLabel } from '../services/journalService.js';
import { openJournalForm } from '../components/forms.js';
import { emptyState, pageHead, options } from '../lib/ui.js';
import { esc, plural } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { todayKey, toKey, fromKey, addDays, addDaysKey, startOfWeek, startOfMonth, addMonths, fmt, relDay } from '../lib/dates.js';

let q = '';
let moodFilter = 'all';
let sort = 'newest';
let month = startOfMonth(new Date());

function streak() {
  let day = journalService.byDate(todayKey()) ? todayKey() : addDaysKey(todayKey(), -1);
  let n = 0;
  while (journalService.byDate(day)) { n += 1; day = addDaysKey(day, -1); }
  return n;
}

function moodMonth() {
  const today = todayKey();
  const gridStart = startOfWeek(month);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const cells = Math.ceil(((last - gridStart) / 86400000 + 1) / 7) * 7;
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt.weekdayNarrow(addDays(gridStart, i)));
  const inMonth = journalService.all().filter((e) => fromKey(e.entry_date).getMonth() === month.getMonth() && fromKey(e.entry_date).getFullYear() === month.getFullYear());
  const moods = inMonth.filter((e) => e.mood).map((e) => e.mood);
  const avg = moods.length ? moods.reduce((s, m) => s + m, 0) / moods.length : null;
  const atCurrentMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();

  return `<section class="card mood-card">
    <div class="card-head">
      <h2 class="card-title">${icon('heart')} ${fmt.monthYear(month)}</h2>
      <div class="btn-group">
        <button type="button" class="icon-btn icon-btn-sm" data-action="month" data-dir="-1" aria-label="Өмнөх сар">${icon('chevronLeft', 16)}</button>
        <button type="button" class="icon-btn icon-btn-sm" data-action="month" data-dir="1" aria-label="Дараах сар" ${atCurrentMonth ? 'disabled' : ''}>${icon('chevronRight', 16)}</button>
      </div>
    </div>
    <div class="card-body">
      <div class="mm-grid">
        ${weekdays.map((w) => `<span class="mm-dow">${w}</span>`).join('')}
        ${Array.from({ length: cells }, (_, i) => {
    const d = addDays(gridStart, i);
    const k = toKey(d);
    const entry = journalService.byDate(k);
    const other = d.getMonth() !== month.getMonth();
    const future = k > today;
    return `<button type="button" class="mm-cell ${other ? 'is-other' : ''} ${k === today ? 'is-today' : ''} ${entry ? 'has-entry' : ''}"
            data-action="day" data-date="${k}" ${future ? 'disabled' : ''}
            style="${entry?.mood ? `--c:var(--mood-${entry.mood})` : ''}"
            aria-label="${fmt.long(k)}${entry ? `: ${moodLabel(entry.mood)}` : future ? '' : ', тэмдэглэлгүй — бичих'}">
            <span>${d.getDate()}</span></button>`;
  }).join('')}
      </div>
      <div class="mm-legend">${MOODS.map((m) => `<span><i style="--c:var(--mood-${m.value})"></i>${m.label}</span>`).join('')}</div>
      <div class="mm-stats">
        <div><span class="small faint">Тэмдэглэл</span><strong>${inMonth.length}</strong></div>
        <div><span class="small faint">Дундаж сэтгэл санаа</span><strong>${avg === null ? '—' : `${moodLabel(Math.round(avg))} · ${avg.toFixed(1)}`}</strong></div>
        <div><span class="small faint">Дараалал</span><strong>${streak()} өдөр</strong></div>
      </div>
    </div>
  </section>`;
}

function entryCard(e) {
  return `<article class="card entry-card" data-action="edit" data-id="${e.id}" tabindex="0" role="button" aria-label="Тэмдэглэл нээх: ${fmt.long(e.entry_date)}">
    <header class="entry-head">
      <span class="entry-date"><strong>${relDay(e.entry_date)}</strong><span class="faint">${fmt.medium(e.entry_date)}</span></span>
      ${e.mood ? `<span class="mood-pill" style="--c:var(--mood-${e.mood})"><i></i>${moodLabel(e.mood)}</span>` : ''}
    </header>
    ${e.title ? `<h3 class="entry-title">${esc(e.title)}</h3>` : ''}
    ${e.reflection ? `<p class="entry-text">${esc(e.reflection)}</p>` : ''}
    ${e.gratitude ? `<p class="entry-grat">${icon('heart', 14)}<span>${esc(e.gratitude)}</span></p>` : ''}
  </article>`;
}

function listHTML() {
  const all = journalService.all();
  if (!all.length) {
    return `<div class="card">${emptyState({
      icon: 'journal', title: 'Тэмдэглэлээ эхлүүлэх',
      text: 'Орой бүр хэдэн мөр хангалттай: өдөр ямар санагдсан, юу сурсан, нэг талархах зүйл.',
      actions: `<button type="button" class="btn btn-primary" data-action="new">${icon('plus', 16)} Өнөөдрийн тэмдэглэл бичих</button>`,
    })}</div>`;
  }
  const term = q.trim().toLowerCase();
  const list = journalService.sorted(sort === 'newest').filter((e) => (moodFilter === 'all' || String(e.mood) === moodFilter)
    && (!term || [e.title, e.reflection, e.gratitude].some((v) => v && v.toLowerCase().includes(term))));
  if (!list.length) {
    return `<div class="card">${emptyState({ icon: 'search', title: 'Тохирох тэмдэглэл алга', text: 'Өөр үг эсвэл сэтгэл санаагаар хайгаарай.', actions: '<button type="button" class="btn" data-action="clear">Шүүлтүүр арилгах</button>' })}</div>`;
  }
  return `<div class="entry-list">${list.map(entryCard).join('')}</div>`;
}

export default {
  title: 'Тэмдэглэл',
  render(root) {
    const todayEntry = journalService.byDate(todayKey());
    root.innerHTML = `
      ${pageHead({
    eyebrow: 'Эргэцүүлэл',
    title: 'Тэмдэглэл',
    sub: 'Өдрүүд тань ямар санагддагийн хэв маягийг ажиглаарай. Сэтгэл санаа Шинжилгээ хуудсанд бүтээмжийн хажууд харагдана.',
    actions: `<button type="button" class="btn btn-primary" data-action="new">${icon(todayEntry ? 'edit' : 'plus', 16)} ${todayEntry ? 'Өнөөдрийн тэмдэглэл засах' : 'Өнөөдрийн тэмдэглэл бичих'}</button>`,
  })}
      <div class="journal-layout">
        <div class="journal-side">${moodMonth()}</div>
        <div class="journal-main">
          <div class="toolbar">
            <label class="search-field">${icon('search', 16)}<input id="journalSearch" type="search" class="input" placeholder="Тэмдэглэл хайх" value="${esc(q)}" aria-label="Тэмдэглэл хайх"></label>
            <select class="select" id="journalMood" aria-label="Сэтгэл санаагаар шүүх">${options([{ value: 'all', label: 'Бүх сэтгэл санаа' }, ...MOODS.map((m) => ({ value: String(m.value), label: m.label }))], moodFilter)}</select>
            <select class="select" id="journalSort" aria-label="Эрэмбэлэх">${options([{ value: 'newest', label: 'Шинэ нь эхэнд' }, { value: 'oldest', label: 'Хуучин нь эхэнд' }], sort)}</select>
          </div>
          <div id="journalList">${listHTML()}</div>
        </div>
      </div>`;

    const refreshList = () => { document.getElementById('journalList').innerHTML = listHTML(); };
    root.oninput = (e) => { if (e.target.id === 'journalSearch') { q = e.target.value; refreshList(); } };
    root.onchange = (e) => {
      if (e.target.id === 'journalMood') { moodFilter = e.target.value; refreshList(); }
      if (e.target.id === 'journalSort') { sort = e.target.value; refreshList(); }
    };
    root.onclick = (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      switch (el.dataset.action) {
        case 'new': openJournalForm(todayEntry); break;
        case 'edit': openJournalForm(journalService.get(el.dataset.id)); break;
        case 'day': openJournalForm(journalService.byDate(el.dataset.date), { entry_date: el.dataset.date }); break;
        case 'month': month = addMonths(month, Number(el.dataset.dir)); this.render(root); break;
        case 'clear': q = ''; moodFilter = 'all'; this.render(root); break;
        default:
      }
    };
    root.onkeydown = (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('entry-card')) {
        e.preventDefault();
        openJournalForm(journalService.get(e.target.dataset.id));
      }
    };
  },
};
