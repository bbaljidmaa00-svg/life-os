/**
 * Life OS · AI туслах (Supabase Edge Function)
 *
 * Апп-ын Туслах хуудас энд хүсэлт илгээнэ. Функц:
 *   1. Хэрэглэгч нэвтэрсэн эсэхийг Supabase Auth-аар шалгана.
 *   2. Хэрэглэгчийн ажил, үйл явдал, зорилго, санамжийг контекст болгон
 *      Claude (Anthropic API) руу илгээнэ.
 *   3. { reply, actions } хэлбэрээр хариулна — actions нь апп дээр
 *      «Нэмэх / Татгалзах» карт болж харагдах санал (автоматаар юу ч хийхгүй).
 *   mode = 'analyze' үед: апп хэрэглэгчийн ӨӨРИЙН өгөгдлийн товчлолыг (digest) илгээнэ →
 *      { report } — тойм, амжилт, хэв маяг, анхаарах зүйл, санал, эргэцүүлэх асуулт.
 *
 * Нууц тохиргоо (Supabase → Edge Functions → Secrets):
 *   ANTHROPIC_API_KEY  — заавал. Claude Console (platform.claude.com) → API Keys-ээс авна.
 *   AI_MODEL           — заавал биш. Анхдагч: claude-sonnet-5-5 (хямд: claude-haiku-5-5)
 *   AI_ALLOWED_EMAILS  — заавал биш. Таслалаар тусгаарласан имэйлүүд; тохируулбал
 *                        зөвхөн эдгээр хэрэглэгч AI ашиглана (зардлаа хамгаална).
 */

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = Deno.env.get('AI_MODEL') || 'claude-sonnet-5-5';
const ALLOWED = (Deno.env.get('AI_ALLOWED_EMAILS') ?? '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* ── Хариултын бүтэц (Claude-ийг энэ хэлбэрээр хариулахыг албадна) ───────── */
const DATE = { type: ['string', 'null'], description: 'YYYY-MM-DD' };
const TIME = { type: ['string', 'null'], description: 'HH:MM (24 цаг)' };
const RESPOND_TOOL = {
  name: 'respond',
  description: 'Хэрэглэгчид хариулах. reply = чатад харагдах монгол текст. actions = хэрэглэгч баталгаажуулах санал (хоосон байж болно).',
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'Монгол хэлээр, товч, найрсаг хариулт. Markdown-гүй энгийн текст.' },
      actions: {
        type: 'array',
        items: {
          anyOf: [
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['create_task'] },
                data: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    due_date: DATE,
                    due_time: TIME,
                    priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                    category: { type: 'string', description: 'Жишээ: Ажил, Хувийн, Эрүүл мэнд, Сурлага, Гэр, Санхүү' },
                    estimated_minutes: { type: ['integer', 'null'] },
                    notes: { type: 'string' },
                  },
                  required: ['title'],
                },
              },
              required: ['type', 'data'],
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['create_event'] },
                data: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    event_date: { type: 'string', description: 'YYYY-MM-DD' },
                    start_time: TIME,
                    end_time: TIME,
                    all_day: { type: 'boolean' },
                    category: { type: 'string', enum: ['work', 'personal', 'health', 'social', 'focus', 'other'] },
                    location: { type: 'string' },
                  },
                  required: ['title', 'event_date'],
                },
              },
              required: ['type', 'data'],
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['create_memory'] },
                data: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
              },
              required: ['type', 'data'],
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['breakdown'] },
                data: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Төслийн нэр' },
                    project_id: { type: ['string', 'null'], description: 'Контекстод байгаа төслийн id, эсвэл null' },
                    steps: { type: 'array', items: { type: 'string' }, description: '3–8 тодорхой алхам' },
                  },
                  required: ['title', 'steps'],
                },
              },
              required: ['type', 'data'],
            },
          ],
        },
      },
    },
    required: ['reply', 'actions'],
  },
};

/* ── Шинжилгээний тайлангийн бүтэц ─────────────────────────────────────── */
const REPORT_TOOL = {
  name: 'report',
  description: 'Хэрэглэгчийн өгөгдөлд тулгуурласан хувийн шинжилгээний тайлан. Бүх текст Монгол кирилл.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'Нэг өгүүлбэрээр гол дүгнэлт.' },
      summary: { type: 'string', description: '2–4 өгүүлбэр. Тоо баримтаар.' },
      wins: { type: 'array', items: { type: 'string' }, description: '2–5 амжилт, сайн тал (тоотой).' },
      patterns: { type: 'array', items: { type: 'string' }, description: '2–5 ажиглагдсан хэв маяг, холбоо (жишээ нь сэтгэл санаа ба хийсэн ажил, гараг, цаг).' },
      watch: { type: 'array', items: { type: 'string' }, description: '0–4 анхаарах зүйл (хэтэрсэн ажил, тэнцвэр алдагдал гэх мэт). Эелдэг, шүүмжлэлгүй.' },
      suggestions: {
        type: 'array',
        items: { type: 'object', properties: { title: { type: 'string' }, why: { type: 'string' } }, required: ['title', 'why'] },
        description: 'Яг 3 тодорхой, хэрэгжихүйц санал. title = үйлдэл, why = өгөгдлөөс яагаад.',
      },
      question: { type: 'string', description: 'Хэрэглэгчид эргэцүүлэх нэг асуулт.' },
    },
    required: ['headline', 'summary', 'wins', 'patterns', 'watch', 'suggestions', 'question'],
  },
};

const ANALYZE_SYSTEM = `Чи "Life OS" апп-ын хувийн шинжээч. Хэрэглэгчийн өөрийн өгөгдлийн товчлолыг (JSON) уншаад, түүнд зориулсан дулаахан, үнэнч, тодорхой тайлан бич.
Дүрэм:
- Зөвхөн өгөгдөлд байгаа баримтад тулгуурла, тоо дурд. Байхгүй зүйлийг зохиохгүй. Өгөгдөл цөөн бол үүнийгээ шударгаар хэл.
- Сэтгэл санаа, тэмдэглэлийн талаар эелдэг бай; эмнэлгийн онош, сэтгэл зүйн дүгнэлт бүү хий.
- Сурсан зүйл, сэтгэгдлүүдээс давтагддаг санааг олж, тэдгээрийг хүсэл, зорилготой нь холбож тайлбарла.
- Санал бүр жижиг, маргаашаас эхэлж болохуйц байх.
- Монгол кирилл үсгээр, Markdown-гүй энгийн текстээр бич.
Үргэлж "report" хэрэгслээр хариул.`;

const strList = (v: unknown, n: number, max = 400) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean).slice(0, n);

// deno-lint-ignore no-explicit-any
function cleanReport(r: any) {
  return {
    headline: str(r?.headline, 300),
    summary: str(r?.summary, 1500),
    wins: strList(r?.wins, 5),
    patterns: strList(r?.patterns, 5),
    watch: strList(r?.watch, 4),
    // deno-lint-ignore no-explicit-any
    suggestions: (Array.isArray(r?.suggestions) ? r.suggestions : []).map((x: any) => ({ title: str(x?.title, 200), why: str(x?.why, 500) }))
      .filter((x: { title: string }) => x.title).slice(0, 3),
    question: str(r?.question, 300),
  };
}

async function callClaude(payload: Record<string, unknown>) {
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, ...payload }),
  });
  if (!aiRes.ok) {
    const detail = await aiRes.text();
    console.error('Anthropic API error', aiRes.status, detail.slice(0, 500));
    const hint = aiRes.status === 401 ? 'API түлхүүр буруу байна.'
      : aiRes.status === 429 ? 'Хэт олон хүсэлт — түр хүлээгээд дахин оролдоно уу.'
        : aiRes.status === 400 && /credit|billing/i.test(detail) ? 'Anthropic аккаунтад кредит дууссан байна.'
          : `AI үйлчилгээ алдаа өглөө (${aiRes.status}).`;
    return { error: hint };
  }
  return { data: await aiRes.json() };
}

/* ── Claude-ийн санал болгосон өгөгдлийг шалгаж цэвэрлэнэ ─────────────────── */
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// deno-lint-ignore no-explicit-any
function cleanAction(a: any) {
  const d = a?.data ?? {};
  switch (a?.type) {
    case 'create_task': {
      const title = str(d.title, 200);
      if (!title) return null;
      return {
        type: 'create_task',
        data: {
          title,
          due_date: isDate(d.due_date) ? d.due_date : null,
          due_time: isDate(d.due_date) && isTime(d.due_time) ? d.due_time : null,
          priority: ['high', 'medium', 'low'].includes(d.priority) ? d.priority : 'medium',
          category: str(d.category, 40),
          estimated_minutes: Number.isInteger(d.estimated_minutes) && d.estimated_minutes > 0 && d.estimated_minutes <= 1440 ? d.estimated_minutes : null,
          notes: str(d.notes, 1000),
        },
      };
    }
    case 'create_event': {
      const title = str(d.title, 200);
      if (!title || !isDate(d.event_date)) return null;
      const start = isTime(d.start_time) ? d.start_time : null;
      const end = start && isTime(d.end_time) && d.end_time > start ? d.end_time : null;
      return {
        type: 'create_event',
        data: {
          title,
          event_date: d.event_date,
          start_time: start,
          end_time: end,
          all_day: !start || Boolean(d.all_day),
          category: ['work', 'personal', 'health', 'social', 'focus', 'other'].includes(d.category) ? d.category : 'other',
          location: str(d.location, 200),
        },
      };
    }
    case 'create_memory': {
      const content = str(d.content, 500);
      return content ? { type: 'create_memory', data: { content } } : null;
    }
    case 'breakdown': {
      const title = str(d.title, 200);
      const steps = Array.isArray(d.steps) ? d.steps.map((s: unknown) => str(s, 200)).filter(Boolean).slice(0, 12) : [];
      if (!title || steps.length < 2) return null;
      return { type: 'breakdown', data: { title, project_id: typeof d.project_id === 'string' ? d.project_id : null, steps } };
    }
    default:
      return null;
  }
}

function systemPrompt(body: Record<string, unknown>) {
  const ctx = (body.context ?? {}) as Record<string, unknown>;
  const memories = Array.isArray(body.memories) ? (body.memories as string[]).slice(0, 50) : [];
  return `Чи "Life OS" хувийн төлөвлөгч апп-ын AI туслах. Хэрэглэгч Монгол хэлээр ярина (заримдаа латинаар бичнэ) — үргэлж Монгол кирилл үсгээр хариул.

Өнөөдөр: ${ctx.today ?? 'тодорхойгүй'} · Цагийн бүс: ${ctx.timezone ?? 'Asia/Ulaanbaatar'}

Үүрэг:
- Өдөр, долоо хоногоо төлөвлөх, ажлаа эрэмбэлэх, том ажлыг алхамд задлах, урам өгөхөд туслах.
- Хэрэглэгч ажил/үйл явдал нэмэх, сануулах, задлах гэж хүсвэл actions-д санал болго. Санал зөвхөн хэрэглэгч «Нэмэх» дарсан үед хадгалагдана — «нэмчихлээ» гэж бүү хэл, «Доорх саналыг баталгаажуулна уу» гэж хэл.
- Хэрэглэгч өөрийнхөө тухай тогтмол мэдээлэл хэлж «санаарай» гэвэл create_memory санал болго.
- "Маргааш", "Баасан гарагт" гэх мэтийг өнөөдрийн огноонд тулгуурлан YYYY-MM-DD болго. Цагийг 24 цагаар HH:MM.
- Доорх өгөгдөлд байхгүй зүйлийг зохиож бүү хэл. Мэдэхгүй бол асуу.
- Хариулт товч (2–6 өгүүлбэр), найрсаг, жагсаалт хэрэгтэй бол мөр бүрийг "• "-ээр эхлүүл. Markdown толгой, од ашиглахгүй.

Хэрэглэгчийн санамжууд:
${memories.length ? memories.map((m) => `• ${m}`).join('\n') : '(алга)'}

Дуусаагүй ажлууд (JSON):
${JSON.stringify(ctx.open_tasks ?? []).slice(0, 12000)}

Ирэх 7 хоногийн үйл явдал (JSON):
${JSON.stringify(ctx.events_next_7_days ?? []).slice(0, 6000)}

Идэвхтэй зорилгууд (JSON):
${JSON.stringify(ctx.active_goals ?? []).slice(0, 3000)}

Үргэлж "respond" хэрэгслээр хариул.`;
}

/** Чатын түүхийг Anthropic API-ийн шаардлагад (user-ээр эхэлж, ээлжилсэн) тааруулна. */
function buildMessages(history: unknown, message: string) {
  const raw = (Array.isArray(history) ? history : []).slice(-20);
  // Апп одоогийн мессежийг түүхэнд аль хэдийн хадгалсан байдаг — давхардуулахгүй.
  const tail = raw[raw.length - 1];
  const alreadyIncluded = tail?.role === 'user' && str(tail?.content, 4000) === message.trim();
  const list: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const h of raw) {
    const role = h?.role === 'assistant' ? 'assistant' : h?.role === 'user' ? 'user' : null;
    const content = str(h?.content, 4000);
    if (!role || !content) continue;
    const last = list[list.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else list.push({ role, content });
  }
  while (list.length && list[0].role !== 'user') list.shift();
  if (!alreadyIncluded) {
    const last = list[list.length - 1];
    if (last && last.role === 'user') last.content += `\n\n${message}`;
    else list.push({ role: 'user', content: message });
  }
  return list;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Зөвхөн POST хүсэлт хүлээн авна.' }, 405);

  // 1. Нэвтэрсэн хэрэглэгчийг шалгах
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Нэвтэрнэ үү.' }, 401);
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return json({ error: 'Нэвтрэлт хүчингүй байна. Дахин нэвтэрнэ үү.' }, 401);
  const user = await userRes.json();
  if (ALLOWED.length && !ALLOWED.includes(String(user.email ?? '').toLowerCase())) {
    return json({ error: 'Энэ аккаунтад AI туслах ашиглах эрх алга.' }, 403);
  }

  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY тохируулаагүй байна (Supabase → Edge Functions → Secrets).' }, 503);
  }

  // 2. Хүсэлтийг уншиж Claude руу илгээх
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Хүсэлтийн формат буруу.' }, 400); }

  // 2a. Шинжилгээ — зөвхөн энэ хэрэглэгчийн апп-аас илгээсэн өөрийнх нь өгөгдөл
  if (body.mode === 'analyze') {
    const digest = body.digest;
    if (!digest || typeof digest !== 'object') return json({ error: 'Шинжлэх өгөгдөл алга.' }, 400);
    const period = (body.period ?? {}) as Record<string, unknown>;
    const res = await callClaude({
      max_tokens: 2500,
      system: ANALYZE_SYSTEM,
      messages: [{ role: 'user', content: `Хугацаа: ${str(period.label, 60)} (${str(period.from, 10)} – ${str(period.to, 10)})\n\nМиний өгөгдөл (JSON):\n${JSON.stringify(digest).slice(0, 45000)}` }],
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'report' },
    });
    if (res.error) return json({ error: res.error }, 502);
    // deno-lint-ignore no-explicit-any
    const tool = (res.data.content ?? []).find((c: any) => c.type === 'tool_use' && c.name === 'report');
    if (!tool) return json({ error: 'Тайлан гаргаж чадсангүй. Дахин оролдоно уу.' }, 502);
    return json({ report: cleanReport(tool.input), model: MODEL });
  }

  const message = str(body.message, 4000);
  if (!message) return json({ error: 'Мессеж хоосон байна.' }, 400);

  const res = await callClaude({
    max_tokens: 1500,
    system: systemPrompt(body),
    messages: buildMessages(body.history, message),
    tools: [RESPOND_TOOL],
    tool_choice: { type: 'tool', name: 'respond' },
  });
  if (res.error) return json({ error: res.error }, 502);

  // 3. Хариултыг апп-ын хэлбэрт оруулах
  const data = res.data;
  // deno-lint-ignore no-explicit-any
  const tool = (data.content ?? []).find((c: any) => c.type === 'tool_use' && c.name === 'respond');
  // deno-lint-ignore no-explicit-any
  const textBlock = (data.content ?? []).find((c: any) => c.type === 'text');
  const reply = str(tool?.input?.reply, 6000) || str(textBlock?.text, 6000) || 'Уучлаарай, хариулт гаргаж чадсангүй. Дахин оролдоно уу.';
  const actions = (Array.isArray(tool?.input?.actions) ? tool.input.actions : []).map(cleanAction).filter(Boolean).slice(0, 10);

  return json({ reply, actions });
});
