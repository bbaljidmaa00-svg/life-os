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
      ${!hasData ? `<div class="card">${emptyState({
    icon: 'analytics', title: 'Хэмжих зүйл алга байна',
    text: 'Хэдэн ажил дуусгаж, тэмдэглэлдээ сэтгэл санаагаа бичээрэй — график, тайлан энд автоматаар гарна.',
    actions: `<a class="btn btn-primary" href="#/tasks">${icon('tasks', 16)} Ажлууд руу</a><a class="btn" href="#/journal">Тэмдэглэл нээх</a>`,
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
          <div class="card-head"><div><h2 class="card-title">Зорилгын ахиц</h2><p class="card-sub">Зорилго бүрийн төслийн ажлуудын гүйцэтгэл</p></div><a class="card-link" href="#/goals">Зорилго ${icon('chevronRight', 14)}</a></div>
          <div class="card-body">${goals.length ? `<div class="goal-progress-list">${goals.map((g) => {
    const p = goalProgress(g.id);
    return `<a class="goal-progress-row" href="#/goals/${g.id}"><span class="gp-title">${esc(g.title)}</span><span class="gp-bar">${progressBar(p.pct)}</span><span class="gp-val">${p.pct}%</span><span class="gp-sub small faint">${p.done}/${p.total} ажил</span></a>`;
  }).join('')}</div>` : emptyState({ compact: true, icon: 'goals', title: 'Идэвхтэй зорилго алга', actions: '<a class="btn btn-sm" href="#/goals">Зорилго тавих</a>' })}</div>
        </section>

        <section class="card report-card span-2">
          <div class="card-head"><h2 class="card-title">${icon('journal')} Тайлан · сүүлийн ${range} хоног</h2></div>
          <div class="card-body"><ul class="report-list">${summary(s, prev)}</ul></div>
        </section>
      </div>
      ${tableView(s)}`}</div>`;

    // Bind to the freshly rendered container (not #page) so listeners never pile up.
    bindChartTooltips(root.querySelector('#analyticsRoot'));

    root.onclick = (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      if (el.dataset.action === 'range') { range = Number(el.dataset.days); this.render(root); }
      if (el.dataset.action === 'csv') { downloadFile(`life-os-report-${todayKey()}-${range}d.csv`, csv(s), 'text/csv'); toast('CSV татагдлаа'); }
      if (el.dataset.action === 'print') window.print();
    };
  },
};
