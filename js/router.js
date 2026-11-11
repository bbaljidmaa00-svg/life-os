/**
 * Hash router. Each page module exports { title, render(root, route, ctx) }.
 *
 * The current page re-renders whenever the store or preferences change,
 * so pages are simple "data → HTML" functions. Focus and scroll position are
 * preserved on re-render so typing or reading is never interrupted.
 */
import { store } from './state/store.js';
import { prefs } from './state/prefs.js';
import { parseRoute } from './lib/nav.js';
import { preserveFocus } from './lib/dom.js';
import { updateShell } from './components/shell.js';

import dashboard from './pages/dashboard.js';
import calendar from './pages/calendar.js';
import tasks from './pages/tasks.js';
import goals from './pages/goals.js';
import assistant from './pages/assistant.js';
import journal from './pages/journal.js';
import birthdays from './pages/birthdays.js';
import notifications from './pages/notifications.js';
import analytics from './pages/analytics.js';
import settings from './pages/settings.js';

export const ROUTES = { dashboard, calendar, tasks, goals, assistant, journal, birthdays, notifications, analytics, settings };

let lastPageKey = null;
let frame = 0;

function render() {
  const route = parseRoute();
  const page = ROUTES[route.name];
  if (!page) {
    location.replace('#/dashboard');
    return;
  }
  const root = document.getElementById('page');
  // A "new page" = different page or different path params. Query changes (e.g. calendar date) are not.
  const pageKey = `${route.name}/${route.params.join('/')}`;
  const isNewPage = pageKey !== lastPageKey;
  const scrollY = window.scrollY;

  preserveFocus(() => page.render(root, route, { isNewPage }), !isNewPage);
  document.title = `${page.title} · Life OS`;
  updateShell(route);

  if (isNewPage) {
    root.classList.remove('page-enter');
    void root.offsetWidth; // restart the CSS animation
    root.classList.add('page-enter');
    if (lastPageKey !== null) {
      window.scrollTo(0, 0);
      if (!document.querySelector('.modal-wrap')) root.focus({ preventScroll: true });
    }
    lastPageKey = pageKey;
  } else {
    window.scrollTo(0, scrollY);
  }
}

function scheduleRender() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  window.addEventListener('lifeos:route', render);
  store.subscribe(scheduleRender);
  prefs.subscribe(scheduleRender);
  if (!location.hash) history.replaceState(null, '', '#/dashboard');
  render();
}
