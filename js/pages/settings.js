/**
 * Settings — account, appearance, calendar & time, task defaults,
 * notifications, data & Supabase connection, keyboard shortcuts.
 */
import { store } from '../state/store.js';
import { prefs, PREF_DEFAULTS } from '../state/prefs.js';
import { authService } from '../services/authService.js';
import { notificationsService } from '../services/notificationsService.js';
import { exportAllData } from '../services/index.js';
import { loadSampleData } from '../services/sampleData.js';
import { testConnection } from '../lib/supabaseClient.js';
import { SUPABASE_URL, TABLES, isSupabaseConfigured, isAiConfigured } from '../config.js';
import { segmented, options, toast, confirmDialog } from '../lib/ui.js';
import { esc, downloadFile, plural } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { fmtDuration, timeToMin, todayKey } from '../lib/dates.js';
import { DURATIONS, PRIORITIES } from '../services/tasksService.js';

const SECTIONS = [
  ['account', 'Бүртгэл', 'user'],
  ['appearance', 'Харагдах байдал', 'sun'],
  ['time', 'Календарь ба цаг', 'calendar'],
  ['tasks', 'Хийх зүйлс', 'tasks'],
  ['notifications', 'Мэдэгдэл', 'bell'],
  ['connection', 'Өгөгдөл ба холболт', 'database'],
  ['about', 'Товчлол ба тухай', 'info'],
];
let lastRouteKey = null;
let testResult = null;

const row = (label, help, control) => `<div class="setting-row"><div class="setting-text"><p class="setting-label">${label}</p>${help ? `<p class="setting-help">${help}</p>` : ''}</div><div class="setting-control">${control}</div></div>`;
const status = (ok, text) => `<span class="status-chip ${ok ? 'is-ok' : 'is-off'}">${icon(ok ? 'check' : 'x', 13)}${text}</span>`;

function totalRows() {
  const snap = store.snapshot();
  return Object.values(snap).reduce((s, list) => s + list.length, 0);
}

function connectionSection() {
  const meta = store.meta();
  const configured = isSupabaseConfigured();
  let host = '';
  try { host = configured ? new URL(SUPABASE_URL).host : ''; } catch { host = SUPABASE_URL; }
  return `<section class="card settings-section" id="connection">
    <h2 class="settings-title">${icon('database')} Өгөгдөл ба холболт</h2>
    <div class="status-grid">
      <div class="status-item"><span class="small faint">Хадгалалт</span>${meta.mode === 'supabase' ? status(true, 'Supabase') : status(false, 'Зөвхөн сешн — хадгалагдахгүй')}</div>
      <div class="status-item"><span class="small faint">Supabase төсөл</span>${configured ? status(true, esc(host)) : status(false, 'Тохируулаагүй')}</div>
      <div class="status-item"><span class="small faint">Нэвтэрсэн</span>${meta.user ? status(true, esc(meta.user.email || 'Тийм')) : status(false, 'Үгүй')}</div>
      <div class="status-item"><span class="small faint">AI endpoint</span>${isAiConfigured() ? status(true, 'Тохируулсан') : status(false, 'Холбогдоогүй')}</div>
    </div>
    ${meta.loadErrors.length ? `<div class="form-error">${meta.loadErrors.map((e) => `<p><strong>${esc(e.label)}:</strong> ${esc(e.message)}${e.hint ? ` — ${esc(e.hint)}` : ''}</p>`).join('')}</div>` : ''}
    ${row('Холболт шалгах', 'Ажлын хүснэгтээс нэг бодит унших хүсэлт илгээнэ.', `<button type="button" class="btn btn-sm" data-action="test">${icon('refresh', 14)} Шалгах</button>`)}
    ${testResult ? `<p class="${testResult.ok ? 'form-success' : 'form-error'}">${esc(testResult.message)}</p>` : ''}

    ${configured ? '' : `<div class="steps">
      <p class="setting-label">Supabase төслөө холбох</p>
      <ol>
        <li><code>js/config.js</code>-ийг нээж <strong>Project URL</strong> болон <strong>anon public key</strong>-ээ хуулна (Supabase → Project Settings → API). service_role түлхүүрийг хэзээ ч бүү ашигла.</li>
        <li>Хүснэгтүүдээ <code>supabase/schema.sql</code>-тэй харьцуулна. Дутуу хүснэгтийг SQL Editor-т тэр файлыг ажиллуулж үүсгэнэ; өөр нэртэй бол config.js доторх <code>TABLES</code>-д бичнэ.</li>
        <li>Supabase → Authentication → URL Configuration хэсэгт энэ сайтын хаягийг (<code>${esc(location.origin + location.pathname)}</code>) Site URL болон Redirect URL болгон нэмнэ.</li>
        <li>Хуудсаа дахин ачаалж нэвтэрнэ. Ингэснээр өгөгдөл тань сан руу хадгалагдана.</li>
      </ol>
      <p class="small faint">Одоогийн хүснэгтийн нэрс: ${Object.values(TABLES).map((t) => `<code>${esc(t)}</code>`).join(' ')}</p>
    </div>`}

    ${window.LIFEOS_SANDBOX ? '' : row('Бүх өгөгдлийг экспортлох', `Ачаалсан бүх өгөгдлийг (${totalRows()} бичлэг) JSON файлаар татах.`, `<button type="button" class="btn btn-sm" data-action="export">${icon('download', 14)} JSON татах</button>`)}
    ${meta.mode === 'session' ? `
      ${row('Жишээ өгөгдөл', 'Апп-тай танилцахын тулд энэ сешнийг жишээ ажил, үйл явдал, зорилгоор дүүргэнэ. Дахин ачаалахад устна.', '<button type="button" class="btn btn-sm" data-action="sample">Жишээ өгөгдөл ачаалах</button>')}
      ${row('Сешний өгөгдөл цэвэрлэх', 'Энэ цонхны санах ойгоос бүгдийг одоо устгана.', `<button type="button" class="btn btn-sm btn-ghost-danger" data-action="clear-session">${icon('trash', 14)} Цэвэрлэх</button>`)}` : ''}
  </section>`;
}

function render(root) {
  const p = prefs.get();
  const meta = store.meta();
  const perm = notificationsService.browserPermission();
  const durationOpts = DURATIONS.map((m) => ({ value: m, label: fmtDuration(m) }));

  root.innerHTML = `
    <header class="page-head"><div class="page-head-text"><p class="eyebrow">Сонголтууд</p><h1 class="page-title">Тохиргоо</h1></div></header>
    <div class="settings-layout">
      <nav class="settings-nav" aria-label="Тохиргооны хэсгүүд">${SECTIONS.map(([id, label, ic]) => `<a href="#/settings?section=${id}" data-section="${id}">${icon(ic, 16)}${label}</a>`).join('')}</nav>
      <div class="settings-body">

        <section class="card settings-section" id="account">
          <h2 class="settings-title">${icon('user')} Бүртгэл</h2>
          ${meta.user ? `
            ${row('Нэвтэрсэн хаяг', esc(meta.user.email || ''), `<button type="button" class="btn btn-sm" data-action="sign-out">${icon('logout', 14)} Гарах</button>`)}
            ${row('Хэрэглэгчийн ID', `<code>${esc(meta.user.id)}</code>`, '')}`
    : `<p class="setting-help">Та нэвтрээгүй байна. Нэвтрэлт Supabase Auth ашигладаг бөгөөд Supabase холбогдсоны дараа идэвхжинэ — локал бүртгэлийн систем байхгүй тул хуурамчаар нэвтрүүлэхгүй.</p>
            <a class="btn btn-sm" href="#/settings?section=connection">Холбох заавар</a>`}
        </section>

        <section class="card settings-section" id="appearance">
          <h2 class="settings-title">${icon('sun')} Харагдах байдал</h2>
          ${row('Өнгөний горим', '“Систем” нь төхөөрөмжийн тохиргоог дагана.', segmented('theme', [{ value: 'system', label: 'Систем' }, { value: 'light', label: 'Гэгээлэг' }, { value: 'dark', label: 'Харанхуй' }], p.theme, { attrs: 'data-pref="theme"' }))}
        </section>

        <section class="card settings-section" id="time">
          <h2 class="settings-title">${icon('calendar')} Календарь ба цаг</h2>
          ${row('Долоо хоног эхлэх өдөр', '', `<select class="select select-sm" data-pref="weekStart" data-type="number" aria-label="Долоо хоног эхлэх өдөр">${options([{ value: 1, label: 'Даваа' }, { value: 0, label: 'Ням' }, { value: 6, label: 'Бямба' }], p.weekStart)}</select>`)}
          ${row('Цагийн формат', '', segmented('timeFormat', [{ value: '24', label: '24 цаг' }, { value: '12', label: '12 цаг' }], p.timeFormat, { attrs: 'data-pref="timeFormat"' }))}
          ${row('Ажлын цаг', '“Өдрөө төлөвлө” болон долоо хоногийн төлөвлөгч ашиглана.', `<div class="row"><input type="time" class="input input-sm" data-pref="workStart" value="${p.workStart}" aria-label="Ажил эхлэх"><span class="faint">–</span><input type="time" class="input input-sm" data-pref="workEnd" value="${p.workEnd}" aria-label="Ажил дуусах"></div>`)}
        </section>

        <section class="card settings-section" id="tasks">
          <h2 class="settings-title">${icon('tasks')} Хийх зүйлс</h2>
          ${row('Анхдагч хугацаа', 'Шинэ ажилд урьдчилан бөглөгдөнө.', `<select class="select select-sm" data-pref="defaultDuration" data-type="number" aria-label="Анхдагч хугацаа">${options(durationOpts, p.defaultDuration)}</select>`)}
          ${row('Анхдагч ач холбогдол', '', segmented('defaultPriority', PRIORITIES, p.defaultPriority, { attrs: 'data-pref="defaultPriority"' }))}
        </section>

        <section class="card settings-section" id="notifications">
          <h2 class="settings-title">${icon('bell')} Мэдэгдэл</h2>
          ${row('Хөтчийн сануулга', perm === 'unsupported' ? 'Энэ хөтөч мэдэгдэл дэмждэггүй.' : perm === 'denied' ? 'Хаагдсан — хөтчийн тохиргооноос энэ сайтад мэдэгдэл зөвшөөрнө үү.' : 'Life OS нээлттэй үед үйл явдал, цагтай ажлаас 10 минутын өмнө сануулна.',
    perm === 'granted' ? `<div class="row">${status(true, 'Асаалттай')}<button type="button" class="btn btn-sm" data-action="test-notification">Туршилт илгээх</button></div>`
      : perm === 'default' ? '<button type="button" class="btn btn-sm" data-action="enable-notifications">Асаах</button>' : status(false, perm === 'denied' ? 'Хаагдсан' : 'Дэмжигдэхгүй'))}
          ${row('Төрсөн өдрийн сануулга', 'Төрсөн өдөр хуудсанд хүн бүрээр тохируулна.', '<a class="btn btn-sm" href="#/birthdays">Тохируулах</a>')}
        </section>

        ${connectionSection()}

        <section class="card settings-section" id="about">
          <h2 class="settings-title">${icon('info')} Товчлол ба тухай</h2>
          <dl class="shortcuts">
            <div><dt><kbd class="kbd">/</kbd></dt><dd>Бүгдээс хайх</dd></div>
            <div><dt><kbd class="kbd">n</kbd></dt><dd>Шинэ ажил</dd></div>
            <div><dt><kbd class="kbd">Esc</kbd></dt><dd>Цонх, цэс хаах</dd></div>
            <div><dt><kbd class="kbd">← → ↑ ↓</kbd></dt><dd>Сарын календарьт өдөр хооронд шилжих</dd></div>
          </dl>
          ${row('Тохиргоог сэргээх', 'Энэ төхөөрөмж дээрх өнгө, цаг, ажлын анхдагч тохиргоог сэргээнэ.', '<button type="button" class="btn btn-sm" data-action="reset-prefs">Сэргээх</button>')}
          <p class="small faint">Life OS · цэвэр HTML, CSS, JavaScript · Supabase-д бэлэн. Энэ хуудасны тохиргоо энэ төхөөрөмж дээр хадгалагдана; таны өгөгдөл биш.</p>
        </section>
      </div>
    </div>`;
}

export default {
  title: 'Тохиргоо',
  render(root, route) {
    render(root);
    const section = route.query.section;
    if (route.key !== lastRouteKey) {
      lastRouteKey = route.key;
      if (section) requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    root.querySelectorAll('[data-section]').forEach((a) => a.classList.toggle('is-active', a.dataset.section === (section || 'account')));

    root.onchange = (e) => {
      const el = e.target;
      const key = el.dataset.pref;
      if (!key) return;
      let value = el.dataset.type === 'number' ? Number(el.value) : el.value;
      if (key === 'workStart' || key === 'workEnd') {
        const start = key === 'workStart' ? value : prefs.get().workStart;
        const end = key === 'workEnd' ? value : prefs.get().workEnd;
        if (!value || timeToMin(end) <= timeToMin(start)) {
          toast('Ажлын цаг эхлэхээсээ хойш дуусах ёстой.', { tone: 'danger' });
          el.value = prefs.get()[key];
          return;
        }
      }
      if (value === '' || Number.isNaN(value)) value = PREF_DEFAULTS[key];
      prefs.set({ [key]: value });
      toast('Энэ төхөөрөмж дээр хадгалагдлаа');
    };

    root.onclick = async (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      try {
        switch (el.dataset.action) {
          case 'test':
            el.disabled = true;
            testResult = await testConnection();
            render(root);
            break;
          case 'export':
            downloadFile(`life-os-export-${todayKey()}.json`, exportAllData(), 'application/json');
            toast('Экспорт татагдлаа');
            break;
          case 'sample':
            if (totalRows() && !(await confirmDialog({ title: 'Жишээ өгөгдөл нэмэх үү?', message: 'Жишээ бичлэгүүд энэ сешн дэх өгөгдлийн хажууд нэмэгдэнэ.', confirmLabel: 'Нэмэх', tone: 'primary' }))) return;
            await loadSampleData();
            toast('Жишээ өгөгдөл ачаалагдлаа');
            break;
          case 'clear-session':
            if (!(await confirmDialog({ title: 'Сешний өгөгдлийг цэвэрлэх үү?', message: 'Энэ цонхны бүх өгөгдөл устна. Буцаах боломжгүй.', confirmLabel: 'Бүгдийг цэвэрлэх' }))) return;
            store.clearAll();
            toast('Сешний өгөгдөл цэвэрлэгдлээ');
            break;
          case 'sign-out':
            await authService.signOut(); // page reloads via the auth listener
            break;
          case 'enable-notifications': {
            const result = await notificationsService.requestBrowserPermission();
            toast(result === 'granted' ? 'Хөтчийн сануулга асаалаа' : 'Хөтчийн сануулгыг зөвшөөрсөнгүй', { tone: result === 'granted' ? 'default' : 'danger' });
            render(root);
            break;
          }
          case 'test-notification':
            if (!notificationsService.showBrowserNotification('Life OS туршилт', 'Мэдэгдэл ажиллаж байна.')) toast('Хөтөч мэдэгдлийг харуулсангүй.', { tone: 'danger' });
            break;
          case 'reset-prefs':
            prefs.reset();
            toast('Тохиргоо сэргээгдлээ');
            break;
          default:
        }
      } catch (err) {
        toast(err.message, { tone: 'danger' });
      }
    };
  },
};
