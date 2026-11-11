/**
 * Small DOM helpers shared by every page and component.
 */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Escape text before inserting it with innerHTML (prevents broken markup and XSS). */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/** Read every named field of a <form> into a plain object. Checkboxes become true/false. */
export function readForm(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') data[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) data[el.name] = el.value;
      else if (!(el.name in data)) data[el.name] = '';
    } else data[el.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
  }
  return data;
}

/** RFC 4122 v4 id. Supabase "uuid" columns accept these. */
export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function debounce(fn, ms = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Run a function that replaces HTML, then put keyboard focus (and the caret)
 * back on the element that had it — so re-rendering never steals your typing.
 */
export function preserveFocus(fn, enabled = true) {
  const active = enabled ? document.activeElement : null;
  const id = active && active.id;
  let start = null;
  let end = null;
  try { start = active.selectionStart; end = active.selectionEnd; } catch { /* not a text field */ }
  fn();
  if (!id) return;
  const el = document.getElementById(id);
  if (!el || el === document.activeElement) return;
  el.focus({ preventScroll: true });
  try { if (start !== null) el.setSelectionRange(start, end); } catch { /* ignore */ }
}

/** Trigger a file download in the browser. */
export function downloadFile(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Монгол хэлэнд нэр үг тоогоор хувирдаггүй: plural(3, 'ажил') → "3 ажил". */
export const plural = (n, word) => `${n} ${word}`;

export function truncate(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
