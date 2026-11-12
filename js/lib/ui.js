/**
 * Reusable UI building blocks: toasts, modals, confirm dialogs, form modals,
 * popover menus, empty states and small HTML helpers.
 */
import { esc, readForm } from './dom.js';
import { icon } from './icons.js';

/* ───────────── Toasts ───────────── */
export function toast(message, { action, actionLabel = 'Буцаах', tone = 'default', duration } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast-action">${esc(actionLabel)}</button>` : ''}`;
  root.append(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  requestAnimationFrame(() => el.classList.add('show'));
  const close = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    el.querySelector('.toast-action').addEventListener('click', () => {
      close();
      Promise.resolve(action()).catch((err) => toast(err.message, { tone: 'danger' }));
    });
  }
  setTimeout(close, duration ?? (action ? 6000 : 3200));
}

/* ───────────── Modal ───────────── */
let modalSeq = 0;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Opens a dialog. `body` is an HTML string. `onMount(modalEl, close)` wires events.
 * Returns the close() function. Escape, the backdrop and [data-close] buttons close it.
 */
export function openModal({ title, body, size = 'md', onMount, onClose }) {
  const id = `modal-${++modalSeq}`;
  const previousFocus = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <section class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="${id}-title" tabindex="-1">
      <header class="modal-head">
        <h2 id="${id}-title">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Хаах">${icon('x')}</button>
      </header>
      <div class="modal-body">${body}</div>
    </section>`;
  document.getElementById('modal-root').append(wrap);
  document.body.classList.add('has-modal');
  requestAnimationFrame(() => wrap.classList.add('open'));
  const modal = wrap.querySelector('.modal');

  const isTop = () => {
    const all = document.querySelectorAll('.modal-wrap');
    return all[all.length - 1] === wrap;
  };
  function onKey(e) {
    if (!isTop()) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const items = [...modal.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    wrap.classList.remove('open');
    setTimeout(() => {
      wrap.remove();
      if (!document.querySelector('.modal-wrap')) document.body.classList.remove('has-modal');
    }, 200);
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus?.({ preventScroll: true });
    onClose?.();
  }
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  onMount?.(modal, close);
  setTimeout(() => (modal.querySelector('[autofocus]') || modal).focus({ preventScroll: true }), 40);
  return close;
}

/** Promise-based confirmation dialog → resolves true/false. */
export function confirmDialog({ title = 'Итгэлтэй байна уу?', message = '', confirmLabel = 'Устгах', tone = 'danger' } = {}) {
  return new Promise((resolve) => {
    let confirmed = false;
    openModal({
      title,
      size: 'sm',
      body: `<p class="muted">${esc(message)}</p>
        <div class="modal-foot"><span class="spacer"></span>
          <button type="button" class="btn" data-close>Болих</button>
          <button type="button" class="btn btn-${tone}" data-confirm autofocus>${esc(confirmLabel)}</button>
        </div>`,
      onMount(modal, close) {
        modal.querySelector('[data-confirm]').addEventListener('click', () => { confirmed = true; close(); });
      },
      onClose: () => resolve(confirmed),
    });
  });
}

/**
 * A modal containing a <form>. `onSubmit(data, form)` may be async; if it
 * throws, the error is shown inside the form and the modal stays open.
 * Inputs with `required` are checked before onSubmit runs.
 */
export function openFormModal({ title, fields, submitLabel = 'Хадгалах', cancelLabel = 'Болих', onSubmit, onDelete, deleteLabel = 'Устгах', size = 'md', onMount }) {
  return openModal({
    title,
    size,
    body: `<form class="form" novalidate>
        ${fields}
        <p class="form-error" role="alert" hidden></p>
        <div class="modal-foot">
          ${onDelete ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash', 16)}<span>${esc(deleteLabel)}</span></button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn" data-close>${esc(cancelLabel)}</button>
          <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
        </div>
      </form>`,
    onMount(modal, close) {
      const form = modal.querySelector('form');
      const errorEl = form.querySelector('.form-error');
      const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = !msg; };
      form.addEventListener('input', () => showError(''));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const invalid = form.querySelector(':invalid');
        if (invalid) {
          const label = invalid.closest('.field')?.querySelector('label, .label')?.textContent?.replace('*', '').trim() || 'Энэ талбар';
          const v = invalid.validity;
          showError(v.rangeOverflow ? `«${label}» хамгийн ихдээ ${invalid.max} байна.`
            : v.rangeUnderflow ? `«${label}» хамгийн багадаа ${invalid.min} байна.`
              : `«${label}» талбарыг бөглөнө үү.`);
          invalid.focus();
          return;
        }
        const button = form.querySelector('[type=submit]');
        button.disabled = true;
        button.classList.add('is-loading');
        try {
          await onSubmit(readForm(form), form);
          close();
        } catch (err) {
          // Plain Errors are validation messages for the user; log only real failures (bugs, database errors).
          if (err.name !== 'Error' || err.code) console.error(err);
          showError(err.hint ? `${err.message} — ${err.hint}` : err.message || 'Алдаа гарлаа.');
        } finally {
          button.disabled = false;
          button.classList.remove('is-loading');
        }
      });
      if (onDelete) {
        form.querySelector('[data-delete]').addEventListener('click', async () => {
          close();
          try { await onDelete(); } catch (err) { toast(err.message, { tone: 'danger' }); }
        });
      }
      onMount?.(form, close);
    },
  });
}

/* ───────────── Popover menu ───────────── */
let closeOpenMenu = null;

/** items: [{ label, icon, onSelect, tone }] or 'sep' for a divider. */
export function openMenu(anchor, items, { align = 'end' } = {}) {
  closeOpenMenu?.();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items.map((it, i) => (it === 'sep'
    ? '<hr>'
    : `<button type="button" role="menuitem" data-i="${i}" class="${it.tone === 'danger' ? 'danger' : ''}">${it.icon ? icon(it.icon, 16) : ''}<span>${esc(it.label)}</span></button>`)).join('');
  document.body.append(menu);

  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  let left = align === 'end' ? r.right - w : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  anchor.setAttribute('aria-expanded', 'true');

  const close = () => {
    menu.remove();
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
    closeOpenMenu = null;
  };
  const outside = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onKey = (e) => {
    const buttons = [...menu.querySelectorAll('button')];
    const idx = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(idx + 1) % buttons.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(idx - 1 + buttons.length) % buttons.length].focus(); }
  };
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    close();
    items[Number(b.dataset.i)].onSelect();
  });
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
  });
  document.addEventListener('keydown', onKey, true);
  menu.querySelector('button')?.focus({ preventScroll: true });
  closeOpenMenu = close;
  return close;
}

/* ───────────── HTML helpers ───────────── */
export function emptyState({ icon: name = 'info', title, text = '', actions = '', compact = false }) {
  return `<div class="empty ${compact ? 'compact' : ''}">
    <div class="empty-icon">${icon(name, 22)}</div>
    <h3>${esc(title)}</h3>
    ${text ? `<p>${esc(text)}</p>` : ''}
    ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
  </div>`;
}

/** Page header. `sub` and `actions` are trusted HTML. */
export function pageHead({ eyebrow = '', title, sub = '', actions = '' }) {
  return `<header class="page-head">
    <div class="page-head-text">
      ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
      <h1 class="page-title" data-text="${esc(title)}"><span class="hl">${esc(title)}</span></h1>
      ${sub ? `<p class="page-sub">${sub}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

/** Radio-button segmented control. */
export function segmented(name, options, value, { full = false, attrs = '' } = {}) {
  return `<div class="seg ${full ? 'full' : ''}" role="radiogroup">${options.map((o) => `
    <label class="seg-opt"><input type="radio" name="${name}" value="${esc(o.value)}" ${String(o.value) === String(value) ? 'checked' : ''} ${attrs}><span>${esc(o.label)}</span></label>`).join('')}
  </div>`;
}

export function options(list, selected) {
  return list.map((o) => {
    const value = typeof o === 'object' ? o.value : o;
    const label = typeof o === 'object' ? o.label : o;
    return `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

export const progressBar = (pct, tone = '') => `<div class="progress ${tone}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;
