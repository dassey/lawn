// Task/crop timing windows. Data stores "MM-DD" windows (KC / MU Central);
// the planting-region setting shifts veggie windows so the same data works
// for MU North dates or for any custom frost dates.
import { store } from './store.js';
import {
  windowFor, fromMMDD, shiftMMDD, diffDays, inRange, fmtRange, monthShort, monthName, monthsOfWindow, pad,
} from './dates.js';

export const KC_LAST_FROST = '04-15';
export const KC_FIRST_FROST = '10-25';

export function regionShiftDays(kind, s = store.settings) {
  if (!kind) return 0;
  if (s.region === 'north') return kind === 'spring' ? 7 : -5;
  if (s.region === 'custom') {
    if (kind === 'spring') return diffDays(fromMMDD(KC_LAST_FROST, 2001), fromMMDD(s.lastFrost || KC_LAST_FROST, 2001));
    if (kind === 'fall') return diffDays(fromMMDD(KC_FIRST_FROST, 2001), fromMMDD(s.firstFrost || KC_FIRST_FROST, 2001));
  }
  return 0;
}

const lastDay = (m) => new Date(2001, m, 0).getDate();

/** All MM-DD windows for a task (explicit window, or runs of whole months). */
export function baseWindows(t) {
  if (t.window) return [{ start: t.window.start, end: t.window.end || t.window.start }];
  const ms = [...new Set(t.months || [])].sort((a, b) => a - b);
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
  return runs.map((r) => ({ start: `${pad(r[0])}-01`, end: `${pad(r[r.length - 1])}-${lastDay(r[r.length - 1])}` }));
}

export function mmddWindows(t, s = store.settings) {
  const shift = t.window ? regionShiftDays(t.shift, s) : 0;
  return baseWindows(t).map((w) => ({ start: shiftMMDD(w.start, shift), end: shiftMMDD(w.end, shift) }));
}

export function taskMonths(t, s = store.settings) {
  if (!t.window || !t.shift || !regionShiftDays(t.shift, s)) return t.months;
  const w = mmddWindows(t, s)[0];
  return monthsOfWindow(w.start, w.end);
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
  const ms = t.months || [];
  if (ms.length === 1) return `All of ${monthName(ms[0])}`;
  return baseWindows(t).map((r) => {
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
  if (s.region === 'custom') {
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
