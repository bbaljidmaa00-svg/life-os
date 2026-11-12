/**
 * «Claude-д асуух» — API-гүй, үнэгүй арга.
 *
 * Апп таны өгөгдлийн товчлолыг асуулттай нь хамт бэлдээд хуулна → та claude.ai-г нээж
 * өөрийн Claude аккаунтдаа paste хийнэ. Өгөгдөл автоматаар хаашаа ч явахгүй: зөвхөн та
 * өөрөө paste хийсэн үед л Claude руу очно. Хариултаа буцааж paste хийвэл апп-д хадгална.
 */
import { openModal, toast } from '../lib/ui.js';
import { esc } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { freeSlots } from '../lib/planner.js';
import { todayKey, addDaysKey, fromKey, WEEKDAYS, minToTime } from '../lib/dates.js';
import { tasksService } from '../services/tasksService.js';
import { goalsService, projectsService, wishesService, goalProgress, projectProgress, wishCategory, projectKind } from '../services/goalsService.js';
import { homeworkService, subjectById } from '../services/schoolService.js';
import { ordersService } from '../services/workService.js';
import { aiService } from '../services/aiService.js';
import { buildDigest } from '../services/analysisService.js';

export const CLAUDE_NEW_CHAT = 'https://claude.ai/new';
const MAX_CHARS = 60000;

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const dayLabel = (key) => `${key} (${WEEKDAYS[fromKey(key).getDay()]})`;

/** Ирэх 7 хоногийн хуваарь + сул цаг, нээлттэй зүйлс, зорилго — асуултад хариулахад хэрэгтэй бүхэн. */
function upcomingContext() {
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = addDaysKey(today, i);
    const f = freeSlots(key);
    return {
      date: dayLabel(key),
      busy: f.busy.map((b) => `${minToTime(b.s)}–${minToTime(b.e)} ${clip(b.title, 60)}`),
      free: f.slots.map((s) => `${s.start}–${s.end}`),
    };
  });
  const open = tasksService.open();
  return {
    today: dayLabel(today),
    schedule_next_7_days: days,
    open_tasks: open.slice(0, 60).map((t) => ({
      title: clip(t.title, 100), due: t.due_date || null, time: t.due_time || null, priority: t.priority, category: t.category || null,
      minutes: t.estimated_minutes || null, project: projectsService.get(t.project_id)?.title || null,
    })),
    homework: homeworkService.open().slice(0, 20).map((h) => ({ title: clip(h.title, 100), subject: subjectById(h.subject_id)?.name || null, due: h.due_date || null })),
    // Захиалагчийн нэр, утас илгээхгүй — зөвхөн бараа, хугацаа.
    orders: ordersService.open().slice(0, 20).map((o) => ({ items: clip(o.items, 80), due: o.due_date || null, time: o.due_time || null, status: o.status })),
    goals: goalsService.all().filter((g) => g.status !== 'completed').map((g) => ({ title: clip(g.title, 100), target_date: g.target_date || null, pct: goalProgress(g.id).pct })),
    projects: projectsService.all().filter((p) => p.status !== 'completed').map((p) => {
      const next = open.find((t) => t.project_id === p.id);
      return { title: clip(p.title, 100), kind: projectKind(p.kind).label, pct: projectProgress(p.id).pct, next_step: next ? clip(next.title, 100) : null };
    }),
    wishes: wishesService.all().filter((w) => !w.achieved_at).map((w) => `${wishCategory(w.category).label}: ${clip(w.title, 80)}`),
    about_me: aiService.memories.all().map((m) => clip(m.content, 200)),
  };
}

/** Claude-ийн markdown хариултыг аюулгүй HTML болгоно (гарчиг, жагсаалт, **тод**). */
export function mdLite(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.map((x) => `<li>${x}</li>`).join('')}</${list.tag}>`); list = null; } };
  String(text || '').replace(/\r/g, '').split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) { flush(); return; }
    if (/^-{3,}$/.test(line)) { flush(); return; }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { flush(); out.push(`<h3>${inline(h[1])}</h3>`); return; }
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(inline((ul || ol)[1]));
      return;
    }
    flush();
    out.push(`<p>${inline(line)}</p>`);
  });
  flush();
  return out.join('');
}

const fit = (text) => (text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…(богиносгосон)` : text);

/** Туслахын чөлөөт асуулт. */
export function buildAskPrompt(question) {
  return fit(`Чи миний хувийн төлөвлөгч туслах. Доорх нь миний "Life OS" апп-аас хуулсан өгөгдөл. Үүн дээр тулгуурлаж Монгол кирилл үсгээр, товч, тодорхой хариулаарай. Өгөгдөлд байхгүй зүйлийг зохиож болохгүй — мэдэхгүй бол асуу.

МИНИЙ АСУУЛТ: ${question.trim()}

МИНИЙ ӨГӨГДӨЛ (JSON):
${JSON.stringify(upcomingContext(), null, 1)}`);
}

/** «Шинжилгээ» хуудасны тайлан — Edge Function-ийн analyze горимтой ижил бүтэцтэй. */
export function buildAnalyzePrompt(period) {
  const digest = buildDigest(period.from, period.to);
  return fit(`Чи миний хувийн шинжээч. Доорх нь миний "Life OS" апп-ын ${period.label.toLowerCase()}-ийн (${period.from} – ${period.to}) өгөгдлийн товчлол: хийх зүйлс, тэмдэглэл ба сэтгэл санаа, төслүүдээс «юу сурсан бэ» тэмдэглэл, хүсэл, зорилго, төсөл, сургууль, ажил.

Дулаахан, үнэнч, тоо баримттай тайлан бич (Монгол кирилл үсгээр):
1. Гол дүгнэлт — нэг өгүүлбэр
2. Тойм — 2–4 өгүүлбэр
3. Сайн тал, амжилт — 2–5 зүйл
4. Ажиглагдсан хэв маяг — 2–5 (жишээ нь сэтгэл санаа ба хийсэн ажил, гараг, цаг; сурсан зүйлсийг хүсэл, зорилготой минь холбож тайлбарла)
5. Анхаарах зүйл — 0–4, эелдэг
6. Яг 3 жижиг, маргаашаас эхэлж болох санал — тус бүр яагаад гэдгийг өгөгдлөөс
7. Надад эргэцүүлэх нэг асуулт

Зөвхөн өгөгдөлд байгаа баримтад тулгуурла; өгөгдөл цөөн бол шударгаар хэл. Эмнэлгийн онош, сэтгэл зүйн дүгнэлт бүү хий.

ӨГӨГДӨЛ (JSON):
${JSON.stringify(digest, null, 1)}`);
}

/** Хуулах — clipboard API, болохгүй бол сонгоод execCommand. → true/false */
async function copyText(text, fallbackArea) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* доорх арга */ }
  try {
    fallbackArea.removeAttribute('hidden');
    fallbackArea.closest('details')?.setAttribute('open', '');
    fallbackArea.focus();
    fallbackArea.select();
    fallbackArea.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

/**
 * Алхам алхмаар заасан цонх.
 *   getPrompt(question?) → хуулах текст
 *   askQuestion — true бол эхэнд «Асуултаа бич» талбар гарна (question-ийг дамжуулна)
 *   onSaveReply(text, question) — хариултыг апп-д хадгалах (заавал биш)
 */
export function openClaudeHandoff({ title = 'Claude-д асуух', intro = '', getPrompt, askQuestion = false, question = '', onSaveReply, saveLabel = 'Хариултыг хадгалах' }) {
  const n = askQuestion ? 1 : 0;
  const step = (i) => `<span class="ch-num" aria-hidden="true">${i + n}</span>`;
  return openModal({
    title,
    body: `<div class="claude-handoff">
      <p class="ch-intro">${intro || 'API, төлбөр хэрэггүй — өөрийн Claude аккаунтаараа (үнэгүй хувилбар ч болно). Өгөгдөл тань автоматаар хаашаа ч явахгүй: зөвхөн та paste хийсэн үед Claude руу очно.'}</p>
      <ol class="ch-steps">
        ${askQuestion ? `<li class="ch-step">
          <span class="ch-num" aria-hidden="true">1</span>
          <div class="ch-main"><label class="ch-title" for="chQuestion">Асуултаа бич</label>
            <textarea id="chQuestion" class="textarea" rows="2" maxlength="2000" placeholder="жишээ нь: Энэ 7 хоногт шалгалтдаа яаж бэлдэх вэ?">${esc(question)}</textarea></div>
        </li>` : ''}
        <li class="ch-step">
          ${step(1)}
          <div class="ch-main"><p class="ch-title">Хуулах</p>
            <p class="small muted">Таны өгөгдлийн товчлол асуулттай хамт хуулагдана.</p>
            <button type="button" class="btn btn-primary" data-ch="copy">${icon('copy', 16)} Хуулах</button>
            <span class="ch-done small" data-ch-status role="status"></span>
            <details class="ch-preview"><summary class="small">Юу хуулагдах вэ? (харах)</summary>
              <textarea class="textarea ch-text" rows="6" readonly aria-label="Хуулах текст"></textarea></details>
          </div>
        </li>
        <li class="ch-step">
          ${step(2)}
          <div class="ch-main"><p class="ch-title">Claude-г нээх</p>
            <p class="small muted">Шинэ цонхонд нээгдэнэ. Утсан дээр Claude апп суусан бол апп-аар нээгдэж магадгүй.</p>
            <a class="btn" href="${CLAUDE_NEW_CHAT}" target="_blank" rel="noopener noreferrer" data-ch="open">${icon('external', 16)} claude.ai нээх</a>
          </div>
        </li>
        <li class="ch-step">
          ${step(3)}
          <div class="ch-main"><p class="ch-title">Paste хийгээд илгээ</p>
            <p class="small muted">Компьютер: бичих хэсэгт дараад <kbd>Ctrl</kbd>+<kbd>V</kbd> (Mac: <kbd>⌘</kbd>+<kbd>V</kbd>) → <kbd>Enter</kbd>.<br>Утас: бичих хэсгийг удаан дараад «Paste / Буулгах» → илгээх.<br><span class="faint">Урт текст «Pasted text» файл шиг харагдаж болно — хэвийн.</span></p>
          </div>
        </li>
        ${onSaveReply ? `<li class="ch-step">
          ${step(4)}
          <div class="ch-main"><label class="ch-title" for="chReply">Хариултаа хадгалах <span class="faint small">(заавал биш)</span></label>
            <p class="small muted">Claude-ийн хариултыг хуулж (хариултын доорх ⧉ товч) энд paste хийвэл апп-д хадгалагдана.</p>
            <textarea id="chReply" class="textarea" rows="4" maxlength="20000" placeholder="Claude-ийн хариултыг энд paste хий"></textarea>
            <button type="button" class="btn btn-sm" data-ch="save">${icon('check', 14)} ${esc(saveLabel)}</button>
          </div>
        </li>` : ''}
      </ol>
    </div>`,
    onMount(modal, close) {
      const area = modal.querySelector('.ch-text');
      const status = modal.querySelector('[data-ch-status]');
      const q = () => modal.querySelector('#chQuestion')?.value.trim() || '';
      const build = () => getPrompt(q());
      area.value = build();
      modal.querySelector('#chQuestion')?.addEventListener('input', () => { area.value = build(); status.textContent = ''; });
      modal.addEventListener('click', async (e) => {
        const el = e.target.closest('[data-ch]');
        if (!el) return;
        if (el.dataset.ch === 'copy') {
          if (askQuestion && !q()) { toast('Эхлээд асуултаа бичээрэй.'); modal.querySelector('#chQuestion').focus(); return; }
          area.value = build();
          const ok = await copyText(area.value, area);
          status.textContent = ok ? `✓ Хуулагдлаа (${area.value.length.toLocaleString('en-US')} тэмдэгт). Одоо 2-р алхам.` : 'Автоматаар хуулж чадсангүй — доорх текстийг бүгдийг сонгоод хуулна уу.';
          status.classList.toggle('is-ok', ok);
          if (!ok) { modal.querySelector('.ch-preview').open = true; area.select(); }
        }
        if (el.dataset.ch === 'save') {
          const text = modal.querySelector('#chReply').value.trim();
          if (!text) { toast('Хариултаа paste хийнэ үү.'); return; }
          el.disabled = true;
          try {
            await onSaveReply(text, q());
            close();
          } catch (err) {
            toast(err.message, { tone: 'danger' });
            el.disabled = false;
          }
        }
      });
    },
  });
}
