/**
 * Analytics & Reports — completion, focus time, categories, priorities,
 * weekday rhythm, mood trend and goal progress over 7 / 30 / 90 days.
 * Includes a written summary, a table view, CSV export and print.
 */
import { computeStats } from '../lib/insights.js';
import { tasksService, PRIORITY_LABEL } from '../services/tasksService.js';
import { goalsService, projectsService, goalProgress } from '../services/goalsService.js';
import { MOODS, moodLabel } from '../services/journalService.js';
import { columnChart, hbarChart, splitBarChart, moodLineChart, bindChartTooltips } from '../components/charts.js';
import { emptyState, pageHead, progressBar, toast } from '../lib/ui.js';
import { esc, plural, downloadFile } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { todayKey, addDaysKey, fromKey, fmt, fmtDuration, keyOfTimestamp, WEEKDAYS, WEEKDAYS_SHORT } from '../lib/dates.js';
import { prefs } from '../state/prefs.js';
import { PERIODS, periodRange, buildDigest, digestSize, localSummary, analyzeWithAI, saveReport, saveChatReport, latestReports, reportsService } from '../services/analysisService.js';
import { aiReady, aiStatusText } from '../services/aiStatus.js';
import { openClaudeHandoff, buildAnalyzePrompt, mdLite } from '../components/claudeHandoff.js';
import { openJournalForm } from '../components/forms.js';

const RANGES = [{ days: 7, label: '7 хоног' }, { days: 30, label: '30 хоног' }, { days: 90, label: '90 хоног' }];
let range = 7;

const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);

function delta(current, previous, { unit = '', goodWhenUp = true } = {}) {
  if (previous === null || previous === undefined || current === null || current === undefined) return '';
  const diff = Math.round((current - previous) * (unit === '%' ? 100 : 1));
  if (!diff) return '<span class="kpi-delta">Өмнөх үетэй ижил</span>';
  const good = goodWhenUp ? diff > 0 : diff < 0;
  return `<span class="kpi-delta ${good ? 'is-good' : 'is-bad'}">өмнөх ${range} хоногоос ${diff > 0 ? '+' : ''}${diff}${unit}</span>`;
}

function tile(label, value, sub) {
  return `<div class="card kpi"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span>${sub || '<span class="kpi-delta">&nbsp;</span>'}</div>`;
}

function completedChart(s) {
  let data;
  if (range <= 30) {
    data = s.perDay.map((d) => ({
      label: range === 7 ? fmt.weekdayShort(fromKey(d.date)) : String(fromKey(d.date).getDate()),
      value: d.count,
      tip: `${fmt.medium(d.date)} — ${d.count} ажил дууссан${d.minutes ? `, ${fmtDuration(d.minutes)}` : ''}`,
      highlight: d.date === todayKey(),
    }));
  } else {
    // 90 days → weekly totals so bars stay readable.
    data = [];
    for (let i = 0; i < s.perDay.length; i += 7) {
      const week = s.perDay.slice(i, i + 7);
      const count = week.reduce((sum, d) => sum + d.count, 0);
      data.push({ label: fmt.short(week[0].date), value: count, tip: `${fmt.short(week[0].date)}-аас эхлэх 7 хоног — ${count} ажил дууссан` });
    }
  }
  return columnChart(data, {
    labelEvery: range === 7 ? 1 : range === 30 ? 5 : 3,
    ariaLabel: `Сүүлийн ${range} хоногт ${range > 30 ? 'долоо хоног' : 'өдөр'} бүр дууссан ажил`,
  });
}

function weekdayChart(s) {
  const start = Number(prefs.get().weekStart);
  const order = Array.from({ length: 7 }, (_, i) => (start + i) % 7);
  return columnChart(order.map((d) => ({ label: WEEKDAYS_SHORT[d], value: s.weekday[d], tip: `${WEEKDAYS[d]} — ${s.weekday[d]} ажил дууссан` })), {
    height: 140, ariaLabel: 'Гарагаар дууссан ажил',
  });
}

function moodChart(s) {
  if (s.moods.length < 2) {
    return emptyState({ compact: true, icon: 'heart', title: s.moods.length ? 'Ганцхан удаа тэмдэглэсэн' : 'Сэтгэл санаа тэмдэглээгүй', text: 'Хандлагыг харахын тулд сэтгэл санаатай тэмдэглэл бичээрэй.', actions: '<a class="btn btn-sm" href="#/journal">Тэмдэглэл нээх</a>' });
  }
  const span = Math.max(1, s.days - 1);
  const points = s.moods.map((m) => ({ x: (fromKey(m.date) - fromKey(s.startKey)) / 86400000 / span, y: m.mood, tip: `${fmt.medium(m.date)} — ${moodLabel(m.mood)}` }));
  const xLabels = [{ x: 0, label: fmt.short(s.startKey) }, { x: 1, label: fmt.short(s.endKey) }];
  return moodLineChart(points, { yLabels: MOODS.map((m) => m.label), xLabels, ariaLabel: 'Сэтгэл санааны хандлага' });
}

function summary(s, prev) {
  const lines = [];
  lines.push(`Сүүлийн ${range} хоногт <strong>${s.completedCount} ажил</strong> дуусгасан — өмнөх ${range} хоногт ${prev.completedCount} байсан.`);
  if (s.completionRate !== null) lines.push(`Энэ хугацаанд дуусах ёстой ${s.dueCount} ажлын <strong>${pct(s.completionRate)}</strong> нь дууссан${s.onTimeRate !== null ? `, эцсийн хугацаатай дууссан ажлын ${pct(s.onTimeRate)} нь хугацаандаа дууссан` : ''}.`);
  if (s.focusMinutes) lines.push(`Дууссан ажлууд нийт <strong>${fmtDuration(s.focusMinutes)}</strong> орчим тооцоот хугацаатай${s.byCategory[0] ? `, ихэнх нь “${esc(s.byCategory[0].name)}” ангилалд` : ''}.`);
  if (s.bestWeekday) lines.push(`Энэ хугацаанд хамгийн бүтээмжтэй өдөр: ${s.bestWeekday}.`);
  if (s.avgMood !== null) lines.push(`Дундаж сэтгэл санаа <strong>5-аас ${s.avgMood.toFixed(1)}</strong> (${moodLabel(Math.round(s.avgMood))}).${s.moodGoodAvg !== null && s.moodLowAvg !== null ? ` Сэтгэл сайхан өдрүүдэд дунджаар ${s.moodGoodAvg.toFixed(1)} ажил, муу өдрүүдэд ${s.moodLowAvg.toFixed(1)} ажил дуусгасан.` : ''}`);
  if (s.overdueNow) lines.push(`Яг одоо ${s.overdueNow} ажлын хугацаа хэтэрсэн — <a class="link-btn" href="#/tasks?due=overdue">харах</a>.`);
  return lines.map((l) => `<li>${l}</li>`).join('');
}

function tableView(s) {
  return `<details class="card table-card">
    <summary>${icon('list', 16)} Өгөгдлийг хүснэгтээр харах</summary>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th scope="col">Огноо</th><th scope="col">Дууссан</th><th scope="col">Тооцоот хугацаа</th><th scope="col">Сэтгэл санаа</th></tr></thead>
      <tbody>${[...s.perDay].reverse().map((d) => {
    const mood = s.moods.find((m) => m.date === d.date);
    return `<tr><td>${fmt.medium(d.date)}</td><td>${d.count}</td><td>${d.minutes ? fmtDuration(d.minutes) : '—'}</td><td>${mood ? moodLabel(mood.mood) : '—'}</td></tr>`;
  }).join('')}</tbody>
    </table></div>
  </details>`;
}

function csv(s) {
  const startKey = s.startKey;
  const rows = tasksService.all().filter((t) => {
    const done = keyOfTimestamp(t.completed_at);
    return (done && done >= startKey) || (t.due_date && t.due_date >= startKey && t.due_date <= s.endKey);
  });
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Гарчиг', 'Төлөв', 'Ач холбогдол', 'Ангилал', 'Эцсийн хугацаа', 'Дууссан огноо', 'Тооцоот минут', 'Төсөл'];
  const body = rows.map((t) => [t.title, t.status, t.priority, t.category, t.due_date, t.completed_at, t.estimated_minutes, projectsService.get(t.project_id)?.title].map(cell).join(','));
  // \uFEFF (BOM) — Excel кирилл үсгийг зөв харуулахад хэрэгтэй.
  return `\uFEFF${[header.map(cell).join(','), ...body].join('\n')}`;
}

/* ── ✨ AI шинжилгээ ─────────────────────────────────────────────────────── */
const ai = { period: '30', busy: false, error: '', selectedId: null };

function aiErrorHint(msg) {
  if (/ANTHROPIC_API_KEY/.test(msg)) return 'Claude-ийн API түлхүүр Supabase-д хараахан нэмэгдээгүй байна: Supabase → Edge Functions → Secrets → ANTHROPIC_API_KEY.';
  if (/эрх алга|эзэмшигч|AI_ALLOWED_EMAILS/.test(msg)) return 'AI зөвхөн AI_ALLOWED_EMAILS-д бичсэн имэйлээр нэвтэрсэн аккаунтад ажиллана.';
  if (/хугацаа нь дууссан|буруу/.test(msg)) return 'platform.claude.com/settings/keys дээр шинэ түлхүүр үүсгээд Supabase-д солино.';
  if (/workspace/.test(msg)) return 'Түлхүүр үүсгэхдээ workspace сонгоно уу.';
  if (/кредит/.test(msg)) return 'Claude Console-д кредит нэмэх хэрэгтэй.';
  return '';
}

const listBlock = (cls, title, items) => (items?.length ? `<div class="ai-block ${cls}"><h3>${title}</h3><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');

function reportHTML(row) {
  const d = row.report_data || {};
  const r = d.report || {};
  const when = row.generated_at ? new Date(row.generated_at) : null;
  const stamp = `${esc(d.label || '')} (${fmt.short(row.period_start)} – ${fmt.short(row.period_end)})${when ? ` · ${fmt.short(keyOfTimestamp(row.generated_at))} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}` : ''}`;
  if (d.source === 'claude-chat') {
    return `<article class="ai-report is-chat">
      <div class="ai-md">${mdLite(d.text)}</div>
      <p class="ai-meta small faint">${icon('copy', 12)} Claude (claude.ai-аас хуулсан) · ${stamp}</p>
    </article>`;
  }
  return `<article class="ai-report">
    <p class="ai-headline">${esc(r.headline || '')}</p>
    ${r.summary ? `<p class="ai-summary">${esc(r.summary)}</p>` : ''}
    <div class="ai-grid">
      ${listBlock('is-wins', '🏆 Сайн тал', r.wins)}
      ${listBlock('is-patterns', '🔍 Хэв маяг', r.patterns)}
      ${listBlock('is-watch', '⚠️ Анхаарах', r.watch)}
    </div>
    ${r.suggestions?.length ? `<div class="ai-block is-sugg"><h3>💡 Санал</h3><ol>${r.suggestions.map((s, i) => `<li><b>${esc(s.title)}</b><span>${esc(s.why)}</span>
      <button type="button" class="link-btn" data-action="ai-sugg" data-i="${i}">${icon('plus', 12)} Хийх зүйл болгох</button></li>`).join('')}</ol></div>` : ''}
    ${r.question ? `<div class="ai-question"><span>❓ ${esc(r.question)}</span><button type="button" class="btn btn-sm" data-action="ai-journal">${icon('journal', 14)} Тэмдэглэлдээ хариулах</button></div>` : ''}
    <p class="ai-meta small faint">${icon('sparkle', 12)} Claude${d.model ? ` (${esc(d.model)})` : ''} · ${esc(d.label || '')} (${fmt.short(row.period_start)} – ${fmt.short(row.period_end)})${when ? ` · ${fmt.short(keyOfTimestamp(row.generated_at))} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}` : ''}</p>
  </article>`;
}

function aiCard() {
  const configured = aiReady();
  const period = periodRange(ai.period);
  const digest = buildDigest(period.from, period.to);
  const reports = latestReports();
  const shown = (ai.selectedId && reportsService.get(ai.selectedId)) || reports[0] || null;
  const local = localSummary(digest);
  const thin = digestSize(digest) < 3;
  let body;
  if (ai.busy) {
    body = `<div class="ai-busy"><span class="ai-spinner" aria-hidden="true"></span><span>Claude таны ${esc(period.label.toLowerCase())}-ийн өгөгдлийг уншиж байна… <span class="faint">(10–40 секунд)</span></span></div>`;
  } else if (ai.error) {
    const hint = aiErrorHint(ai.error);
    body = `<div class="ai-error">${icon('alert', 16)}<div><b>AI шинжилгээ ажилласангүй:</b> ${esc(ai.error)}${hint ? `<br><span class="small">${esc(hint)}</span>` : ''}</div></div>
      <div class="ai-local"><p class="ai-local-label">Энгийн тооцоо <span class="faint">(AI биш — зөвхөн тоонууд)</span></p><ul>${local.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  } else if (shown) {
    body = reportHTML(shown);
  } else {
    body = `<div class="ai-intro">
      <p>Хийх зүйлс, тэмдэглэл ба сэтгэл санаа, «юу сурсан бэ» тэмдэглэлүүд, хүсэл, зорилго, төсөл, сургууль, ажлын мэдээллээс чинь Claude хэв маяг олж, сайн тал, анхаарах зүйл, 3 санал гаргана.</p>
      ${configured ? '' : `<div class="ai-free-tip">${icon('copy', 16)}<p><b>Үнэгүй арга:</b> «Claude-д асуух» дараад өгөгдлийнхөө товчлолыг хуулж, өөрийн Claude аккаунтдаа шинжлүүлээрэй. Хариултыг нь буцааж хадгалж болно.</p></div>
      <p class="small faint">${esc(aiStatusText())}</p>`}
      ${local.length ? `<div class="ai-local"><p class="ai-local-label">Энгийн тооцоо <span class="faint">(AI биш)</span></p><ul>${local.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
    </div>`;
  }
  return `<section class="card ai-card" id="aiCard">
    <div class="card-head ai-head">
      <div><h2 class="card-title">${icon('sparkle', 18)} AI шинжилгээ</h2><p class="card-sub">🔒 Зөвхөн таны аккаунтын өгөгдөл Claude руу илгээгдэнэ</p></div>
      <div class="ai-controls no-print">
        <select class="select select-sm" id="aiPeriod" aria-label="Шинжлэх хугацаа">${PERIODS.map((p) => `<option value="${p.value}" ${p.value === ai.period ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
        ${configured ? `<button type="button" class="btn btn-primary btn-sm" data-action="ai-run" ${ai.busy ? 'disabled' : ''}>${icon('sparkle', 14)} ${shown ? 'Дахин шинжлүүлэх' : 'Шинжлүүлэх'}</button>` : ''}
        <button type="button" class="btn ${configured ? '' : 'btn-primary'} btn-sm" data-action="ai-claude" ${ai.busy ? 'disabled' : ''}>${icon('copy', 14)} Claude-д асуух</button>
      </div>
    </div>
    <div class="card-body">
      ${thin && !shown && !ai.busy ? '<p class="small muted ai-thin">Энэ хугацаанд өгөгдөл цөөн байна — хэдэн өдөр хэрэглэсний дараа шинжилгээ илүү утга учиртай болно.</p>' : ''}
      ${body}
      ${reports.length > 1 ? `<div class="ai-history no-print"><span class="small faint">Өмнөх:</span>${reports.slice(0, 6).map((r) => `<button type="button" class="chip-btn ${shown && r.id === shown.id ? 'is-active' : ''}" data-action="ai-show" data-id="${r.id}">${fmt.short(r.period_end)} · ${esc(r.report_data?.label || '')}</button>`).join('')}</div>` : ''}
    </div>
  </section>`;
}

export default {
  title: 'Шинжилгээ',
  render(root) {
    const hasData = tasksService.all().length > 0;
    const s = computeStats(range);
    const prev = computeStats(range, addDaysKey(todayKey(), -range));
    const goals = goalsService.all().filter((g) => g.status !== 'completed');

    root.innerHTML = `<div class="analytics" id="analyticsRoot">
      ${pageHead({
    eyebrow: `${fmt.short(s.startKey)} – ${fmt.short(s.endKey)}`,
    title: 'Шинжилгээ ба тайлан',
    actions: `
          <div class="seg" role="group" aria-label="Хугацааны муж">${RANGES.map((r) => `<button type="button" class="seg-btn ${r.days === range ? 'is-active' : ''}" data-action="range" data-days="${r.days}" aria-pressed="${r.days === range}">${r.label}</button>`).join('')}</div>
          ${window.LIFEOS_SANDBOX ? '' : `<button type="button" class="btn no-print" data-action="csv" ${hasData ? '' : 'disabled'}>${icon('download', 16)} CSV</button>
          <button type="button" class="btn no-print" data-action="print" ${hasData ? '' : 'disabled'}>${icon('printer', 16)} Хэвлэх</button>`}`,
  })}
      ${aiCard()}
      ${!hasData ? `<div class="card">${emptyState({
    icon: 'analytics', title: 'Хэмжих зүйл алга байна',
    text: 'Хэдэн ажил дуусгаж, тэмдэглэлдээ сэтгэл санаагаа бичээрэй — график, тайлан энд автоматаар гарна.',
    actions: `<a class="btn btn-primary" href="#/tasks">${icon('tasks', 16)} Хийх зүйлс рүү</a><a class="btn" href="#/journal">Тэмдэглэл нээх</a>`,
  })}</div>` : `
      <div class="kpis">
        ${tile(`${icon('check', 15)} Дууссан`, s.completedCount, delta(s.completedCount, prev.completedCount))}
        ${tile(`${icon('tasks', 15)} Дуусах ёстойгоос`, pct(s.completionRate), s.completionRate === null ? '<span class="kpi-delta">Дуусах ажил байгаагүй</span>' : `<span class="kpi-delta">${s.dueCount} ажлаас ${s.dueDoneCount} нь</span>`)}
        ${tile(`${icon('clock', 15)} Хугацаандаа`, pct(s.onTimeRate), delta(s.onTimeRate, prev.onTimeRate, { unit: '%' }))}
        ${tile(`${icon('zap', 15)} Ажилласан хугацаа`, fmtDuration(s.focusMinutes), delta(s.focusMinutes / 60, prev.focusMinutes / 60, { unit: ' цаг' }))}
      </div>

      <div class="analytics-grid">
        <section class="card chart-card span-2">
          <div class="card-head"><div><h2 class="card-title">Дууссан ажлууд</h2><p class="card-sub">${range > 30 ? 'Долоо хоног' : 'Өдөр'} бүрээр · өнөөдрийг тодруулсан</p></div></div>
          <div class="card-body">${s.completedCount ? completedChart(s) : emptyState({ compact: true, icon: 'check', title: 'Энэ хугацаанд дууссан ажил алга' })}</div>
        </section>

        <section class="card chart-card">
          <div class="card-head"><div><h2 class="card-title">Сэтгэл санааны хандлага</h2><p class="card-sub">Тэмдэглэлээс</p></div>${s.avgMood !== null ? `<span class="badge">дундаж ${s.avgMood.toFixed(1)}</span>` : ''}</div>
          <div class="card-body">${moodChart(s)}</div>
        </section>

        <section class="card chart-card">
          <div class="card-head"><div><h2 class="card-title">Гарагийн хэмнэл</h2><p class="card-sub">Гараг бүрээр дууссан ажил</p></div></div>
          <div class="card-body">${s.completedCount ? weekdayChart(s) : emptyState({ compact: true, icon: 'calendar', title: 'Өгөгдөл хангалтгүй' })}</div>
        </section>

        <section class="card chart-card">
          <div class="card-head"><div><h2 class="card-title">Ангиллаар зарцуулсан хугацаа</h2><p class="card-sub">Дууссан ажлын тооцоот хугацаа</p></div></div>
          <div class="card-body">${s.byCategory.length ? hbarChart(s.byCategory.slice(0, 6).map((c) => ({
    label: c.name, value: c.minutes || c.count, display: c.minutes ? fmtDuration(c.minutes) : `${c.count} ажил`,
    tip: `${c.name} — ${c.count} ажил${c.minutes ? `, ${fmtDuration(c.minutes)}` : ''}`,
  })), { ariaLabel: 'Ангиллаар дууссан ажлын хугацаа' }) : emptyState({ compact: true, icon: 'list', title: 'Дууссан ажил алга' })}</div>
        </section>

        <section class="card chart-card">
          <div class="card-head"><div><h2 class="card-title">Ач холбогдол</h2><p class="card-sub">Энэ хугацаанд дууссан ба дуусаагүй</p></div></div>
          <div class="card-body">${splitBarChart(s.priority.map((p) => ({
    label: PRIORITY_LABEL[p.priority], a: p.done, b: p.open,
    tip: `${PRIORITY_LABEL[p.priority]} — ${p.done} дууссан, ${p.open} дуусаагүй`,
  })), { legend: ['Дууссан', 'Дуусаагүй'], ariaLabel: 'Ач холбогдлоор дууссан ба дуусаагүй ажил' })}</div>
        </section>

        <section class="card chart-card span-2">
          <div class="card-head"><div><h2 class="card-title">Зорилгын ахиц</h2><p class="card-sub">Зорилго бүрийн төслийн ажлуудын гүйцэтгэл</p></div><a class="card-link" href="#/goals?tab=goals">Зорилго ${icon('chevronRight', 14)}</a></div>
          <div class="card-body">${goals.length ? `<div class="goal-progress-list">${goals.map((g) => {
    const p = goalProgress(g.id);
    return `<a class="goal-progress-row" href="#/goals/${g.id}"><span class="gp-title">${esc(g.title)}</span><span class="gp-bar">${progressBar(p.pct)}</span><span class="gp-val">${p.pct}%</span><span class="gp-sub small faint">${p.done}/${p.total} ажил</span></a>`;
  }).join('')}</div>` : emptyState({ compact: true, icon: 'goals', title: 'Идэвхтэй зорилго алга', actions: '<a class="btn btn-sm" href="#/goals?tab=goals">Зорилго тавих</a>' })}</div>
        </section>

        <section class="card report-card span-2">
          <div class="card-head"><h2 class="card-title">${icon('journal')} Тайлан · сүүлийн ${range} хоног</h2></div>
          <div class="card-body"><ul class="report-list">${summary(s, prev)}</ul></div>
        </section>
      </div>
      ${tableView(s)}`}</div>`;

    // Bind to the freshly rendered container (not #page) so listeners never pile up.
    bindChartTooltips(root.querySelector('#analyticsRoot'));

    root.onchange = (e) => { if (e.target.id === 'aiPeriod') { ai.period = e.target.value; ai.error = ''; this.render(root); } };
    root.onclick = async (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const shownRow = (ai.selectedId && reportsService.get(ai.selectedId)) || latestReports()[0];
      if (el.dataset.action === 'ai-run') {
        const period = periodRange(ai.period);
        ai.busy = true; ai.error = ''; this.render(root);
        try {
          const result = await analyzeWithAI(period);
          const saved = await saveReport(period, result);
          ai.selectedId = saved.id;
          toast('AI шинжилгээ бэлэн боллоо ✨');
        } catch (err) { ai.error = err.message || 'Алдаа гарлаа'; }
        ai.busy = false;
        this.render(root);
        return;
      }
      if (el.dataset.action === 'ai-claude') {
        const period = periodRange(ai.period);
        openClaudeHandoff({
          title: `Claude-д шинжлүүлэх · ${period.label}`,
          getPrompt: () => buildAnalyzePrompt(period),
          saveLabel: 'Тайлан болгож хадгалах',
          onSaveReply: async (text) => {
            const saved = await saveChatReport(period, text);
            ai.selectedId = saved.id; ai.error = '';
            toast('Тайлан хадгалагдлаа');
            this.render(root);
          },
        });
        return;
      }
      if (el.dataset.action === 'ai-show') { ai.selectedId = el.dataset.id; ai.error = ''; this.render(root); return; }
      if (el.dataset.action === 'ai-sugg') {
        const s = shownRow?.report_data?.report?.suggestions?.[Number(el.dataset.i)];
        if (s) {
          try { await tasksService.create({ title: s.title.slice(0, 200), due_date: addDaysKey(todayKey(), 1), priority: 'medium', category: 'Хувийн', notes: s.why }); toast(`“${s.title}” маргаашийн хийх зүйлст нэмэгдлээ`); } catch (err) { toast(err.message, { tone: 'danger' }); }
        }
        return;
      }
      if (el.dataset.action === 'ai-journal') {
        const q = shownRow?.report_data?.report?.question;
        if (q) openJournalForm(null, { title: q.slice(0, 120) });
        return;
      }
      if (el.dataset.action === 'range') { range = Number(el.dataset.days); this.render(root); }
      if (el.dataset.action === 'csv') { downloadFile(`life-os-report-${todayKey()}-${range}d.csv`, csv(s), 'text/csv'); toast('CSV татагдлаа'); }
      if (el.dataset.action === 'print') window.print();
    };
  },
};
