/**
 * Sign-in screen — only shown when Supabase is configured and nobody is
 * signed in. All three methods are real Supabase Auth calls.
 */
import { authService } from '../services/authService.js';
import { SUPABASE_URL } from '../config.js';
import { esc, readForm } from '../lib/dom.js';

let mode = 'signin'; // 'signin' | 'signup' | 'magic'

const COPY = {
  signin: { title: 'Тавтай морил', button: 'Нэвтрэх' },
  signup: { title: 'Бүртгэл үүсгэх', button: 'Бүртгүүлэх' },
  magic: { title: 'Холбоосоор нэвтрэх', button: 'Нэвтрэх холбоос илгээх' },
};

export function renderLogin(app) {
  let host = '';
  try { host = new URL(SUPABASE_URL).host; } catch { host = SUPABASE_URL; }
  app.innerHTML = `
  <div class="auth-wrap">
    <div class="auth-card card">
      <div class="brand auth-brand"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">Life OS</span></div>
      <h1 class="auth-title">${COPY[mode].title}</h1>
      <div class="seg full auth-tabs" role="tablist">
        ${Object.entries({ signin: 'Нууц үг', signup: 'Бүртгүүлэх', magic: 'Имэйл холбоос' }).map(([m, label]) => `
          <button type="button" class="seg-btn ${m === mode ? 'is-active' : ''}" data-mode="${m}" role="tab" aria-selected="${m === mode}">${label}</button>`).join('')}
      </div>
      <form class="form" id="authForm" novalidate>
        <div class="field"><label for="authEmail">Имэйл</label><input id="authEmail" name="email" type="email" class="input" autocomplete="email" required></div>
        ${mode !== 'magic' ? `<div class="field"><label for="authPassword">Нууц үг</label><input id="authPassword" name="password" type="password" class="input" minlength="6" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required></div>` : ''}
        <p class="form-error" role="alert" hidden></p>
        <p class="form-success" role="status" hidden></p>
        <button type="submit" class="btn btn-primary btn-block">${COPY[mode].button}</button>
      </form>
      <p class="auth-foot muted small">Supabase Auth-аар хамгаалагдсан · ${esc(host)}</p>
    </div>
  </div>`;

  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    renderLogin(app);
  }));

  const form = app.querySelector('#authForm');
  const errorEl = form.querySelector('.form-error');
  const okEl = form.querySelector('.form-success');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    okEl.hidden = true;
    const invalid = form.querySelector(':invalid');
    if (invalid) {
      errorEl.textContent = invalid.type === 'email' ? 'Зөв имэйл хаяг оруулна уу.' : 'Нууц үг дор хаяж 6 тэмдэгттэй байна.';
      errorEl.hidden = false;
      invalid.focus();
      return;
    }
    const { email, password } = readForm(form);
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      if (mode === 'signin') await authService.signIn(email, password); // page reloads on success
      if (mode === 'signup') {
        const needsConfirm = await authService.signUp(email, password);
        if (needsConfirm) { okEl.textContent = 'Имэйлээ шалгаж баталгаажуулаад нэвтэрнэ үү.'; okEl.hidden = false; }
      }
      if (mode === 'magic') {
        await authService.sendMagicLink(email);
        okEl.textContent = `${email} хаяг руу нэвтрэх холбоос илгээлээ.`;
        okEl.hidden = false;
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
}
