/**
 * AI-г зөвхөн эзэмшигчийн аккаунтад асаана.
 *
 * Апп нэвтэрсний дараа Edge Function-оос { mode: 'status' } асууна (Claude дуудахгүй, үнэгүй):
 *   • allowed — энэ аккаунт AI_ALLOWED_EMAILS-д байгаа эсэх
 *   • ready   — allowed + ANTHROPIC_API_KEY тохируулсан
 * ready биш бол Туслах, шинжилгээ API-гүй горимоороо ажиллана — хуурамч «AI» хариу гарахгүй.
 */
import { AI_ENDPOINT, SUPABASE_ANON_KEY, isAiConfigured } from '../config.js';
import { authService } from './authService.js';
import { store } from '../state/store.js';

const EMPTY = { checked: false, ready: false, allowed: false, ownerSet: false, keySet: false, model: '', error: '' };
let current = { ...EMPTY };
let inflight = null;

export const aiStatus = () => current;
export const aiReady = () => isAiConfigured() && current.ready;

/** Хэрэглэгчид ойлгомжтой нэг мөр — яагаад AI асаагүй байгааг хэлнэ. */
export function aiStatusText() {
  if (!isAiConfigured()) return 'AI холбоогүй (API-гүй горим).';
  if (!current.checked) return 'AI-н төлөвийг шалгаж байна…';
  if (current.ready) return `AI бэлэн${current.model ? ` · ${current.model}` : ''}.`;
  if (current.error) return `AI-н төлөв шалгаж чадсангүй: ${current.error}`;
  if (!current.ownerSet) return 'AI_ALLOWED_EMAILS тохируулаагүй — AI хэнд ч нээгдээгүй.';
  if (!current.allowed) return 'AI зөвхөн эзэмшигчийн аккаунтад нээлттэй.';
  return 'Claude API түлхүүр (ANTHROPIC_API_KEY) нэмээгүй байна.';
}

export function checkAiStatus({ force = false } = {}) {
  if (!isAiConfigured()) return Promise.resolve(current);
  if (inflight) return inflight;
  if (current.checked && !force) return Promise.resolve(current);
  inflight = (async () => {
    let next;
    try {
      const token = await authService.accessToken();
      if (!token) {
        next = { ...EMPTY, checked: true, error: 'нэвтрээгүй байна' };
      } else {
        const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        if (SUPABASE_ANON_KEY) headers.apikey = SUPABASE_ANON_KEY;
        const res = await fetch(AI_ENDPOINT, { method: 'POST', headers, body: JSON.stringify({ mode: 'status' }) });
        const json = await res.json().catch(() => ({}));
        next = res.ok
          ? {
            checked: true,
            ready: json.ready === true,
            allowed: json.allowed === true,
            ownerSet: json.owner_set === true,
            keySet: json.key_set === true,
            model: String(json.model || ''),
            error: '',
          }
          : { ...EMPTY, checked: true, error: String(json.error || res.status) };
      }
    } catch {
      next = { ...EMPTY, checked: true, error: 'интернэт холболт тасарсан байж магадгүй' };
    }
    current = next;
    inflight = null;
    store.setMeta({ ai: next });
    return next;
  })();
  return inflight;
}
