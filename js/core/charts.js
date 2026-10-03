// Minimal inline-SVG charts (bars and lines) that follow the page theme via
// CSS classes. Each chart carries an aria-label summary for screen readers.
import { raw, esc } from './dom.js';

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

/**
 * Bar chart.
 * opts: labels[], values[], max?, unit, fmt(v), highlight (index), faded (Set of indices),
 *       height, barClass, ariaLabel, ticks
 */
export function barChart(opts) {
  const {
    labels, values, unit = '', height = 190, highlight = -1, faded = new Set(), barClass = 'bar',
    ariaLabel = 'Bar chart', fmt = (v) => (v ? String(v) : ''), ticks = 4,
  } = opts;
  const W = 640;
  const H = height;
  const m = { l: 34, r: 8, t: 18, b: 24 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = opts.max ?? niceMax(Math.max(...values, 0));
  const bw = iw / values.length;
  const pad = Math.min(10, bw * 0.22);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">`;
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    const y = m.t + ih - (v / max) * ih;
    s += `<line class="grid-line" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/>`;
    s += `<text x="${m.l - 6}" y="${y + 4}" text-anchor="end">${+v.toFixed(2)}${i === ticks ? esc(unit) : ''}</text>`;
  }
  values.forEach((v, i) => {
    const x = m.l + i * bw + pad / 2;
    const h = max ? (Math.max(0, v) / max) * ih : 0;
    const y = m.t + ih - h;
    if (i === highlight) s += `<rect class="now-band" x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${ih}"/>`;
    s += `<rect class="${faded.has(i) ? 'bar-opt' : barClass}" x="${x}" y="${y}" width="${bw - pad}" height="${h}" rx="3"><title>${esc(labels[i])}: ${esc(fmt(v) || '0')}${esc(unit)}</title></rect>`;
    const lbl = fmt(v);
    if (lbl) s += `<text class="val" x="${x + (bw - pad) / 2}" y="${y - 5}" text-anchor="middle">${esc(lbl)}</text>`;
    s += `<text x="${m.l + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" ${i === highlight ? 'style="font-weight:700;fill:var(--ink)"' : ''}>${esc(labels[i])}</text>`;
  });
  s += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}"/>`;
  s += '</svg>';
  return raw(s);
}

/**
 * Line chart with one or more series.
 * opts: labels[], series: [{ values[], cls, dotCls, name }], min, max, unit, height, highlight, ariaLabel
 */
export function lineChart(opts) {
  const { labels, series, unit = '', height = 200, highlight = -1, ariaLabel = 'Line chart', ticks = 4 } = opts;
  const W = 640;
  const H = height;
  const m = { l: 36, r: 10, t: 16, b: 24 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const all = series.flatMap((s) => s.values);
  const min = opts.min ?? Math.floor(Math.min(...all) / 10) * 10;
  const max = opts.max ?? Math.ceil(Math.max(...all) / 10) * 10;
  const x = (i) => m.l + (iw / (labels.length - 1)) * i;
  const y = (v) => m.t + ih - ((v - min) / (max - min)) * ih;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaLabel)}">`;
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) / ticks) * i;
    s += `<line class="grid-line" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    s += `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}${esc(unit)}</text>`;
  }
  if (highlight >= 0) s += `<rect class="now-band" x="${x(highlight) - iw / (labels.length - 1) / 2}" y="${m.t}" width="${iw / (labels.length - 1)}" height="${ih}"/>`;
  for (const se of series) {
    const d = se.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    s += `<path class="${se.cls}" d="${d}"/>`;
    se.values.forEach((v, i) => {
      s += `<circle class="${se.dotCls}" cx="${x(i)}" cy="${y(v)}" r="3.5"><title>${esc(se.name || '')} ${esc(labels[i])}: ${v}${esc(unit)}</title></circle>`;
    });
  }
  labels.forEach((l, i) => {
    s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" ${i === highlight ? 'style="font-weight:700;fill:var(--ink)"' : ''}>${esc(l)}</text>`;
  });
  s += '</svg>';
  return raw(s);
}
