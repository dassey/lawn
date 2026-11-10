// Task/crop timing windows. Data stores "MM-DD" windows (KC / MU Central);
// the planting-region setting shifts them so the same data works for MU North
// dates, for custom frost dates, or for the frost dates worked out from a ZIP.
import { store } from './store.js';
import {
  windowFor, fromMMDD, shiftMMDD, diffDays, inRange, fmtRange, monthShort, monthName, monthsOfWindow, pad, doyMMDD,
} from './dates.js';

export const KC_LAST_FROST = '04-15';
export const KC_FIRST_FROST = '10-25';
export const MAX_SHIFT = 45; // days; past this the KC plan no longer fits anyway

const clamp = (n) => Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, n));

/** Frost dates in use when the plan follows them (custom, or local from a ZIP). */
export function frostSetting(s = store.settings) {
  if (s.region === 'custom') return { last: s.lastFrost || KC_LAST_FROST, first: s.firstFrost || KC_FIRST_FROST };
  if (s.region === 'local' && s.local) return { last: s.local.lastFrost, first: s.local.firstFrost };
  return null;
}

export function regionShiftDays(kind, s = store.settings) {
  if (!kind) return 0;
  if (s.region === 'north') return kind === 'spring' ? 7 : -5;
  const f = frostSetting(s);
  if (f) {
    if (kind === 'spring') return clamp(diffDays(fromMMDD(KC_LAST_FROST, 2001), fromMMDD(f.last, 2001)));
    if (kind === 'fall') return clamp(diffDays(fromMMDD(KC_FIRST_FROST, 2001), fromMMDD(f.first, 2001)));
  }
  return 0;
}

/**
 * Days to move a KC date that carries no explicit spring/fall tag, when the
 * plan follows frost dates. Spring work (Feb to May) moves with the last
 * frost and fall work (September to November) with the first frost; the
 * shift fades to nothing at midsummer and midwinter, where the calendar
 * matters more than the frost date.
 */
const SEASON_PTS = [[1, 0], [32, 'sp'], [152, 'sp'], [201, 0], [248, 'fa'], [335, 'fa'], [365, 0]];
export function seasonShift(mmddStr, s = store.settings) {
  if (!frostSetting(s)) return 0;
  const v = { sp: regionShiftDays('spring', s), fa: regionShiftDays('fall', s) };
  if (!v.sp && !v.fa) return 0;
  const d = doyMMDD(mmddStr);
  for (let i = 1; i < SEASON_PTS.length; i++) {
    const [d0, a] = SEASON_PTS[i - 1];
    const [d1, b] = SEASON_PTS[i];
    if (d <= d1) {
      const y0 = v[a] ?? a;
      const y1 = v[b] ?? b;
      return Math.round(y0 + ((y1 - y0) * (d - d0)) / (d1 - d0));
    }
  }
  return 0;
}

const lastDay = (m) => new Date(2001, m, 0).getDate();
const spanDays = (w) => (doyMMDD(w.end) - doyMMDD(w.start) + 365) % 365;

/** Group months into runs of neighbours; a run may wrap from December into January. */
function monthRuns(months) {
  const ms = [...new Set(months || [])].sort((a, b) => a - b);
  if (!ms.length) return [];
  const runs = [];
  let run = [ms[0]];
  for (let i = 1; i < ms.length; i++) {
    if (ms[i] === ms[i - 1] + 1) run.push(ms[i]);
    else { runs.push(run); run = [ms[i]]; }
  }
  runs.push(run);
  if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1].slice(-1)[0] === 12) {
    const first = runs.shift();
    runs[runs.length - 1] = runs[runs.length - 1].concat(first);
  }
  return runs;
}

/**
 * The months a whole-month task is listed under, moved with the seasons (see
 * seasonShift). Each run of months is shifted like a window, and a month
 * counts once the run covers about half of it.
 */
function shiftedMonths(t, s) {
  const ms = t.months || [];
  if (t.custom || !frostSetting(s) || new Set(ms).size >= 12) return ms;
  const out = [];
  for (const r of monthRuns(ms)) {
    const w = { start: `${pad(r[0])}-01`, end: `${pad(r[r.length - 1])}-${lastDay(r[r.length - 1])}` };
    const a = shiftMMDD(w.start, seasonShift(w.start, s) + 15) || w.start;
    const b = shiftMMDD(w.end, seasonShift(w.end, s) - 15) || w.end;
    const run = spanDays({ start: a, end: b }) > spanDays(w) + 2 * MAX_SHIFT ? [Number(a.slice(0, 2))] : monthsOfWindow(a, b);
    for (const m of run) if (!out.includes(m)) out.push(m);
  }
  return out;
}

/** All MM-DD windows for a task (explicit window, or runs of whole months). */
export function baseWindows(t, months = t.months) {
  if (t.window) return [{ start: t.window.start, end: t.window.end || t.window.start }];
  return monthRuns(months).map((r) => ({ start: `${pad(r[0])}-01`, end: `${pad(r[r.length - 1])}-${lastDay(r[r.length - 1])}` }));
}

export function mmddWindows(t, s = store.settings) {
  if (!t.window) return baseWindows(t, shiftedMonths(t, s));
  const w = baseWindows(t)[0];
  if (t.shift) {
    const n = regionShiftDays(t.shift, s);
    return [{ start: shiftMMDD(w.start, n), end: shiftMMDD(w.end, n) }];
  }
  if (t.custom) return [w];
  const a = seasonShift(w.start, s);
  const out = { start: shiftMMDD(w.start, a), end: shiftMMDD(w.end, seasonShift(w.end, s)) };
  // Opposite shifts at each end can fold a short window inside out; if so, move it whole.
  if (spanDays(out) > spanDays(w) + 2 * MAX_SHIFT) out.end = shiftMMDD(w.end, a);
  return [out];
}

export function taskMonths(t, s = store.settings) {
  if (!t.window) return shiftedMonths(t, s);
  if (t.custom || (t.shift ? !regionShiftDays(t.shift, s) : !frostSetting(s))) return t.months;
  const w = mmddWindows(t, s)[0];
  return w.start === t.window.start && w.end === (t.window.end || t.window.start) ? t.months : monthsOfWindow(w.start, w.end);
}

export function datedWindows(t, year, s = store.settings) {
  return mmddWindows(t, s).map((w) => windowFor(w.start, w.end, year));
}

export function taskStatus(t, date, s = store.settings) {
  const y = date.getFullYear();
  const all = [y - 1, y, y + 1].flatMap((yy) => datedWindows(t, yy, s));
  const cur = all.find((w) => inRange(date, w.start, w.end));
  if (cur) return { state: 'now', ...cur, daysLeft: diffDays(date, cur.end), daysIn: diffDays(cur.start, date) };
  const next = all.filter((w) => w.start > date).sort((a, b) => a.start - b.start)[0];
  const prev = all.filter((w) => w.end < date).sort((a, b) => b.end - a.end)[0];
  return {
    state: 'out', next, prev,
    daysToNext: next ? diffDays(date, next.start) : null,
    daysSincePrev: prev ? diffDays(prev.end, date) : null,
  };
}

export function whenLabel(t, year, s = store.settings) {
  if (t.window) {
    const w = datedWindows(t, year, s)[0];
    return fmtRange(w.start, w.end);
  }
  const ms = shiftedMonths(t, s);
  if (ms.length === 1) return `All of ${monthName(ms[0])}`;
  return baseWindows(t, ms).map((r) => {
    const a = Number(r.start.slice(0, 2));
    const b = Number(r.end.slice(0, 2));
    return a === b ? monthShort(a) : `${monthShort(a)}–${monthShort(b)}`;
  }).join(' & ');
}

/* ---- crop windows (exact MU columns, or shifted Central for custom frost) ---- */
export function cropWindow(c, which, s = store.settings) {
  const w = c[which];
  if (!w) return null;
  if (s.region === 'north' && w.north) return { start: w.north[0], end: w.north[1] };
  const base = { start: w.central[0], end: w.central[1] };
  if (frostSetting(s)) {
    const k = which === 'fall' ? 'fall' : 'spring';
    const n = regionShiftDays(k, s);
    return { start: shiftMMDD(base.start, n), end: shiftMMDD(base.end, n) };
  }
  if (s.region === 'north' && !w.north) {
    const n = regionShiftDays(which === 'fall' ? 'fall' : 'spring', s);
    return { start: shiftMMDD(base.start, n), end: shiftMMDD(base.end, n) };
  }
  return base;
}

/** Shift applied to a crop's harvest window so it tracks the planting window. */
export function cropHarvestWindow(c, which, s = store.settings) {
  const h = c.harvest && c.harvest[which];
  if (!h) return null;
  const plant = c[which];
  let n = 0;
  if (plant) {
    const eff = cropWindow(c, which, s);
    n = diffDays(fromMMDD(plant.central[0], 2001), fromMMDD(eff.start, 2001));
    if (n > 180) n -= 365;
    if (n < -180) n += 365;
  }
  return { start: shiftMMDD(h[0], n), end: shiftMMDD(h[1], n) };
}
