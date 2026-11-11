/**
 * App shell: sidebar (desktop), icon rail (tablet), bottom tab bar (mobile),
 * top bar with global search, notifications and the "New" menu, plus the
 * status banner (session mode / connection problems).
 */
import { store } from '../state/store.js';
import { prefs, effectiveTheme } from '../state/prefs.js';
import { tasksService } from '../services/tasksService.js';
import { notificationsService } from '../services/notificationsService.js';
import { bindSearch, openSearchSheet } from './search.js';
import { openNewMenu, openTaskForm } from './forms.js';
import { openHomeworkForm } from './schoolForms.js';
import { openModal } from '../lib/ui.js';
import { esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { todayKey } from '../lib/dates.js';

export const NAV = [
  { id: 'dashboard', label: 'Хянах самбар', icon: 'dashboard' },
  { id: 'calendar', label: 'Календарь', icon: 'calendar' },
  { id: 'tasks', label: 'Ажлууд', icon: 'tasks' },
  { id: 'goals', label: 'Зорилго ба төсөл', icon: 'goals' },
  { id: 'school', label: 'Сургууль', icon: 'school' },
  { id: 'assistant', label: 'AI туслах', icon: 'assistant' },
  { section: 'Амьдрал' },
  { id: 'journal', label: 'Тэмдэглэл', icon: 'journal' },
  { id: 'birthdays', label: 'Төрсөн өдөр', icon: 'gift' },
  { section: 'Тойм' },
  { id: 'notifications', label: 'Мэдэгдэл', icon: 'bell' },
  { id: 'analytics', label: 'Шинжилгээ ба тайлан', icon: 'analytics' },
  { id: 'settings', label: 'Тохиргоо', icon: 'settings' },
];
const MOBILE_NAV = [
  { id: 'dashboard', label: 'Нүүр', icon: 'dashboard' },
  { id: 'calendar', label: 'Календарь', icon: 'calendar' },
  { id: 'tasks', label: 'Ажлууд', icon: 'tasks' },
  { id: 'school', label: 'Сургууль', icon: 'school' },
];

let bannerDismissed = false;

const navLink = (item) => `
  <a class="nav-item" href="#/${item.id}" data-nav="${item.id}" title="${esc(item.label)}">
    ${icon(item.icon)}<span class="nav-label">${esc(item.label)}</span><span class="nav-badge" data-badge="${item.id}" hidden></span>
  </a>`;

export function renderShell(app) {
  app.innerHTML = `
  <a class="skip-link" href="#page">Агуулга руу алгасах</a>
  <div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/dashboard" aria-label="Life OS — нүүр"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">Life OS</span></a>
      <nav class="nav" aria-label="Үндсэн цэс">
        ${NAV.map((item) => (item.section ? `<p class="nav-section">${item.section}</p>` : navLink(item))).join('')}
      </nav>
      <div class="sidebar-foot">
        <a class="conn-pill" id="connPill" href="#/settings?section=connection"></a>
        <button type="button" class="icon-btn" data-shell="theme" id="themeBtn"></button>
      </div>
    </aside>

    <div class="main-col">
      <header class="topbar" id="topbar">
        <a class="topbar-brand" href="#/dashboard"><span class="brand-mark" aria-hidden="true"></span><span id="topbarTitle">Хянах самбар</span></a>
        <div class="search" role="search">
          ${icon('search', 16)}
          <input id="searchInput" type="search" placeholder="Ажил, үйл явдал, зорилго, тэмдэглэлээс хайх…" autocomplete="off" aria-label="Бүгдээс хайх" aria-controls="searchResults">
          <kbd class="kbd">/</kbd>
          <div class="search-results" id="searchResults" role="listbox" hidden></div>
        </div>
        <div class="topbar-actions">
          <button type="button" class="icon-btn show-mobile" data-shell="search" aria-label="Хайх">${icon('search')}</button>
          <a class="icon-btn bell" href="#/notifications" aria-label="Мэдэгдэл" id="bellLink">${icon('bell')}<span class="bell-badge" id="bellBadge" hidden></span></a>
          <button type="button" class="btn btn-primary btn-new" data-shell="new" aria-haspopup="menu" aria-expanded="false">${icon('plus', 16)}<span class="hide-mobile">Шинэ</span></button>
        </div>
      </header>
      <div id="bannerSlot"></div>
      <main id="page" class="page" tabindex="-1"></main>
    </div>

    <nav class="bottom-nav" aria-label="Үндсэн цэс">
      ${MOBILE_NAV.map((item) => `<a class="bn-item" href="#/${item.id}" data-nav="${item.id}">${icon(item.icon, 21)}<span>${item.label}</span></a>`).join('')}
      <button type="button" class="bn-item" data-shell="more" data-nav="more" aria-haspopup="dialog">${icon('menu', 21)}<span>Бусад</span><span class="bn-dot" id="moreDot" hidden></span></button>
    </nav>
  </div>`;

  bindSearch(document.getElementById('searchInput'), document.getElementById('searchResults'));

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-shell]');
    if (!el) return;
    switch (el.dataset.shell) {
      case 'theme': prefs.set({ theme: effectiveTheme() === 'dark' ? 'light' : 'dark' }); break;
      case 'search': openSearchSheet(); break;
      case 'new': openNewMenu(el, { extra: [{ label: 'Гэрийн даалгавар', icon: 'book', onSelect: () => openHomeworkForm() }] }); break;
      case 'more': openMoreSheet(); break;
      case 'banner-dismiss': bannerDismissed = true; updateBanner(); break;
      case 'reload': location.reload(); break;
      default:
    }
  });

  // Keyboard shortcuts: "/" search, "n" new task (ignored while typing).
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.modal-wrap')) return;
    if (e.key === '/') {
      e.preventDefault();
      const input = document.getElementById('searchInput');
      if (input.offsetParent) input.focus(); else openSearchSheet();
    } else if (e.key === 'n') {
      e.preventDefault();
      openTaskForm();
    }
  });

  const topbar = document.getElementById('topbar');
  window.addEventListener('scroll', () => topbar.classList.toggle('is-scrolled', window.scrollY > 4), { passive: true });
}

function openMoreSheet() {
  openModal({
    title: 'Цэс',
    size: 'sm',
    body: `<nav class="more-nav" aria-label="Бүх хуудас">${NAV.filter((n) => !n.section).map((n) => `
      <a class="more-item" href="#/${n.id}" data-close>${icon(n.icon)}<span>${esc(n.label)}</span>${n.id === 'notifications' ? `<span class="nav-badge" ${notificationsService.unreadCount() ? '' : 'hidden'}>${notificationsService.unreadCount()}</span>` : ''}</a>`).join('')}
      <button type="button" class="more-item" data-close data-shell="theme">${icon(effectiveTheme() === 'dark' ? 'sun' : 'moon')}<span>${effectiveTheme() === 'dark' ? 'Гэгээлэг' : 'Харанхуй'} горим</span></button>
    </nav>`,
  });
}

function updateBanner() {
  const slot = document.getElementById('bannerSlot');
  if (!slot) return;
  const meta = store.meta();
  if (meta.loadErrors.length) {
    slot.innerHTML = `<div class="banner banner-danger" role="alert">${icon('alert')}
      <div class="banner-text"><strong>Supabase-ээс зарим өгөгдлийг ачаалж чадсангүй.</strong>
        ${meta.loadErrors.map((e) => `<span>${esc(e.label)}: ${esc(e.hint || e.message)}</span>`).join('')}</div>
      <div class="banner-actions"><a class="btn btn-sm" href="#/settings?section=connection">Холболт шалгах</a><button type="button" class="btn btn-sm" data-shell="reload">Дахин оролдох</button></div>
    </div>`;
  } else if (meta.mode === 'session' && !bannerDismissed) {
    slot.innerHTML = `<div class="banner">${icon('database')}
      <div class="banner-text"><strong>Session горим</strong><span>Одоогоор юу ч хадгалагдахгүй — өгөгдөл зөвхөн энэ цонхонд байж, дахин ачаалахад устна. Хадгалахын тулд Supabase холбоно уу.</span></div>
      <div class="banner-actions"><a class="btn btn-sm" href="#/settings?section=connection">Холбох заавар</a><button type="button" class="icon-btn icon-btn-sm" data-shell="banner-dismiss" aria-label="Энэ мэдэгдлийг нуух">${icon('x', 16)}</button></div>
    </div>`;
  } else slot.innerHTML = '';
}

/** Called by the router after every render. */
export function updateShell(route) {
  const active = route.name;
  document.querySelectorAll('[data-nav]').forEach((el) => {
    if (el.dataset.nav === active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  const mobileIds = MOBILE_NAV.map((n) => n.id);
  const more = document.querySelector('.bn-item[data-nav="more"]');
  if (more) more.classList.toggle('is-active', !mobileIds.includes(active));
  const title = NAV.find((n) => n.id === active)?.label || 'Life OS';
  document.getElementById('topbarTitle').textContent = title;

  // Badges: tasks due today or overdue; unread notifications.
  const today = todayKey();
  const taskCount = tasksService.open().filter((t) => t.due_date && t.due_date <= today).length;
  const overdue = tasksService.overdue().length;
  const unread = notificationsService.unreadCount();
  setBadge('tasks', taskCount, overdue > 0);
  setBadge('notifications', unread, true);
  const bell = document.getElementById('bellBadge');
  bell.hidden = !unread;
  bell.textContent = unread > 9 ? '9+' : String(unread);
  document.getElementById('bellLink').setAttribute('aria-label', unread ? `Мэдэгдэл, ${unread} уншаагүй` : 'Мэдэгдэл');
  document.getElementById('moreDot').hidden = !unread;

  // Connection pill
  const meta = store.meta();
  const pill = document.getElementById('connPill');
  const state = meta.loadErrors.length ? 'is-error' : meta.mode === 'supabase' ? 'is-live' : 'is-session';
  const label = meta.loadErrors.length ? 'Холболтын алдаа' : meta.mode === 'supabase' ? (meta.user?.email || 'Холбогдсон') : 'Session горим';
  pill.className = `conn-pill ${state}`;
  pill.title = meta.mode === 'supabase' ? `Supabase-тэй синк хийгдэж байна: ${meta.user?.email || ''}` : 'Хадгалагдахгүй — Тохиргооноос Supabase холбоно уу';
  pill.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="conn-text">${esc(label)}</span>`;

  const dark = effectiveTheme() === 'dark';
  const themeBtn = document.getElementById('themeBtn');
  themeBtn.innerHTML = icon(dark ? 'sun' : 'moon');
  themeBtn.setAttribute('aria-label', dark ? 'Гэгээлэг горим руу шилжих' : 'Харанхуй горим руу шилжих');
  themeBtn.title = themeBtn.getAttribute('aria-label');

  updateBanner();
}

function setBadge(id, count, alert) {
  const el = document.querySelector(`[data-badge="${id}"]`);
  if (!el) return;
  el.hidden = !count;
  el.textContent = String(count);
  el.classList.toggle('is-alert', Boolean(alert && count));
}
