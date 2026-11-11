/**
 * Lightweight HTML/SVG charts (no library).
 * Rules followed: one axis, thin marks (≤24px bars, 4px rounded data-end,
 * square at the baseline), 2px lines, ≥8px markers with a surface ring,
 * hairline recessive grid, text in text colours, values in tooltips + table view.
 */
import { esc } from '../lib/dom.js';

/** Round an axis maximum up to a clean number (1, 2, 5 × 10ⁿ). */
export function niceMax(value) {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const n = value / exp;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * exp;
}

/**
 * Column chart. data: [{ label, value, tip, highlight }]
 * Every `labelEvery`-th x label is shown so labels never collide.
 */
export function columnChart(data, { height = 170, labelEvery = 1, format = (v) => String(v), ariaLabel = '' } = {}) {
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = [max, max / 2, 0];
  const peak = Math.max(...data.map((d) => d.value));
  const peakIndex = peak > 0 ? data.findIndex((d) => d.value === peak) : -1;
  return `<div class="colchart" style="--h:${height}px" role="img" aria-label="${esc(ariaLabel)}">
    <div class="cc-axis">${ticks.map((t) => `<span>${esc(format(t))}</span>`).join('')}</div>
    <div class="cc-plot">
      <div class="cc-grid">${ticks.map(() => '<i></i>').join('')}</div>
      <div class="cc-bars">${data.map((d, i) => `
        <div class="cc-col ${d.highlight ? 'is-highlight' : ''}" data-tip="${esc(d.tip)}">
          ${i === peakIndex ? `<span class="cc-cap" style="bottom:${(d.value / max) * 100}%">${esc(format(d.value))}</span>` : ''}
          <span class="cc-bar" style="height:${(d.value / max) * 100}%"></span>
        </div>`).join('')}
      </div>
      <div class="cc-x">${data.map((d, i) => `<span>${i % labelEvery === 0 ? esc(d.label) : ''}</span>`).join('')}</div>
    </div>
  </div>`;
}

/** Horizontal bars, one series. data: [{ label, value, display, tip }] */
export function hbarChart(data, { ariaLabel = '' } = {}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return `<div class="hbars" role="img" aria-label="${esc(ariaLabel)}">${data.map((d) => `
    <div class="hbar-row" data-tip="${esc(d.tip)}">
      <span class="hbar-label">${esc(d.label)}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${Math.max(2, (d.value / max) * 100)}%"></span></span>
      <span class="hbar-val">${esc(d.display)}</span>
    </div>`).join('')}</div>`;
}

/** Two-part horizontal bars (e.g. done vs open), separated by a 2px surface gap. */
export function splitBarChart(rows, { legend, ariaLabel = '' } = {}) {
  const max = Math.max(...rows.map((r) => r.a + r.b), 1);
  return `<div class="split-legend">${legend.map((l, i) => `<span><i class="sw sw-${i}"></i>${esc(l)}</span>`).join('')}</div>
  <div class="hbars" role="img" aria-label="${esc(ariaLabel)}">${rows.map((r) => `
    <div class="hbar-row" data-tip="${esc(r.tip)}">
      <span class="hbar-label">${esc(r.label)}</span>
      <span class="hbar-track split">
        ${r.a ? `<span class="seg-a" style="width:${(r.a / max) * 100}%"></span>` : ''}
        ${r.b ? `<span class="seg-b" style="width:${(r.b / max) * 100}%"></span>` : ''}
      </span>
      <span class="hbar-val">${r.a} / ${r.a + r.b}</span>
    </div>`).join('')}</div>`;
}

/**
 * Line chart on a fixed 1–5 scale (mood). points: [{ x: 0..1, y: 1..5, tip }]
 * The line is SVG (non-scaling 2px stroke); markers are HTML so they stay round.
 */
export function moodLineChart(points, { yLabels, height = 170, xLabels = [], ariaLabel = '' } = {}) {
  const toY = (v) => 100 - ((v - 1) / 4) * 100;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${(p.x * 100).toFixed(2)} ${toY(p.y).toFixed(2)}`).join(' ');
  return `<div class="linechart" style="--h:${height}px" role="img" aria-label="${esc(ariaLabel)}">
    <div class="lc-axis">${[5, 4, 3, 2, 1].map((v) => `<span>${esc(yLabels[v - 1])}</span>`).join('')}</div>
    <div class="lc-plot">
      <div class="lc-grid">${[5, 4, 3, 2, 1].map(() => '<i></i>').join('')}</div>
      <div class="lc-area">
        <svg class="lc-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        </svg>
        ${points.map((p) => `<span class="lc-dot" data-tip="${esc(p.tip)}" style="left:${p.x * 100}%;top:${toY(p.y)}%;--c:var(--mood-${p.y})"></span>`).join('')}
      </div>
      <div class="lc-x">${xLabels.map((l) => `<span style="left:${l.x * 100}%">${esc(l.label)}</span>`).join('')}</div>
    </div>
  </div>`;
}

/** One floating tooltip for every [data-tip] inside `root` (hover + keyboard focus). */
export function bindChartTooltips(root) {
  let tip = document.getElementById('chartTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'chartTip';
    tip.className = 'chart-tip';
    tip.setAttribute('role', 'tooltip');
    document.body.append(tip);
  }
  tip.hidden = true;
  const show = (target, x, y) => {
    const text = target.dataset.tip;
    if (!text) return;
    tip.textContent = text;
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8))}px`;
    tip.style.top = `${Math.max(8, y - h - 12)}px`;
  };
  root.addEventListener('pointermove', (e) => {
    const target = e.target.closest('[data-tip]');
    if (!target) { tip.hidden = true; return; }
    show(target, e.clientX, e.clientY);
  });
  root.addEventListener('pointerleave', () => { tip.hidden = true; });
  root.addEventListener('focusin', (e) => {
    const target = e.target.closest('[data-tip]');
    if (!target) return;
    const r = target.getBoundingClientRect();
    show(target, r.left + r.width / 2, r.top);
  });
  root.addEventListener('focusout', () => { tip.hidden = true; });
  window.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true, once: true });
}
