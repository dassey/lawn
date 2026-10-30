// Week planner: puts each in-season task on its best day of the 7-day
// forecast and says why. Every task carries a weather profile (`wx` in
// tasks.json): herbicide wants 24 dry hours, light wind and 50–88°F; granular
// products want light rain soon after to water them in; seed wants rain over
// the next few days; digging wants clay that isn't soggy or frozen; winter
// prep has to beat the first hard freeze; and so on. Weather comes from
// analyze() in weather.js (daily rows, plus hourly temp/rain/wind when present).
import { isDone, doneInfo } from './store.js';
import { taskStatus } from './windows.js';
import { diffDays, toISO } from './dates.js';

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EFFORT = { low: 1, medium: 2, high: 3 };
const EVENT = new Set(['water', 'cover']);
const PRIO = { critical: 0, recommended: 1, optional: 2 };
const DRY = 0.05;
const PLAN_DAYS = 7;

/* ---------------- formatting ---------------- */
export function fmtIn(n) {
  const v = Number(n) || 0;
  return `${v >= 1 ? v.toFixed(1) : String(Number(v.toFixed(2)))}″`;
}
const deg = (n) => `${Math.round(n)}°F`;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pleasant = (d) => d.hi >= 50 && d.hi <= 85;
const isDry = (d) => d.rain < DRY && (d.pop ?? 0) < 50;

/** "today", "tomorrow", "Tuesday". */
export const dayWord = (d) => (d.i === 0 ? 'today' : d.i === 1 ? 'tomorrow' : WEEKDAY[d.dt.getDay()]);
/** "tonight", "tomorrow night", "Tuesday night". */
const nightWord = (d) => (d.i === 0 ? 'tonight' : `${dayWord(d)} night`);

function fmtHour(h) {
  if (h === 0 || h === 24) return 'midnight';
  if (h === 12) return 'noon';
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}
function fmtSpan(a, b) {
  const sa = fmtHour(a);
  const sb = fmtHour(b);
  if (a < 12 && b < 12) return `${a}–${sb}`;
  if (a > 12 && b > 12) return `${a - 12}–${sb}`;
  return `${sa}–${sb}`;
}

/** Short weather description: "dry, 62°F", "0.3″ of rain, 55°F, breezy (21 mph)". */
export function describe(d) {
  const parts = [];
  if (d.rain >= DRY) parts.push(`${fmtIn(d.rain)} of rain`);
  else if ((d.pop ?? 0) >= 30) parts.push(`${d.pop}% chance of a shower`);
  else parts.push('dry');
  parts.push(deg(d.hi));
  if (d.wind >= 18) parts.push(`breezy (${Math.round(d.wind)} mph)`);
  return parts.join(', ');
}

/** One-word read on a day for the week strip. */
export function verdict(d) {
  if (d.lo <= 28) return { tone: 'bad', label: 'Hard freeze' };
  if (d.rain >= 0.5) return { tone: 'water', label: 'Soaking rain' };
  if (d.lo <= 32) return { tone: 'warn', label: 'Frost' };
  if (d.hi >= 95) return { tone: 'bad', label: 'Heat' };
  if (d.rain >= 0.1 || (d.pop ?? 0) >= 60) return { tone: 'water', label: 'Showers' };
  if (d.wind >= 20) return { tone: 'warn', label: 'Windy' };
  if (pleasant(d) && d.rain < DRY) return { tone: 'good', label: 'Great day' };
  return { tone: 'neutral', label: d.hi < 50 ? 'Chilly' : d.hi > 85 ? 'Hot' : 'Fair' };
}

/* ---------------- day contexts ---------------- */
/**
 * Build day contexts from an analysis: today plus 7 days of look-ahead (the
 * plan itself covers the first 7). Returns null if today isn't in the data.
 */
export function buildDays(a, now = new Date()) {
  const all = a.days;
  const start = all.findIndex((x) => x.isToday);
  if (start < 0) return null;
  const nowHour = now.getHours();
  const wet = (row) => (row ? (row.rain || 0) + (row.water || 0) : 0);
  const days = all.slice(start, start + PLAN_DAYS + 1).map((row, i) => {
    const k = start + i;
    let rain7Before = 0;
    for (let j = Math.max(0, k - 7); j < k; j++) rain7Before += wet(all[j]);
    const hours = (row.hours || []).filter((h) => i > 0 || h.h >= nowHour);
    return {
      i,
      row,
      iso: row.date,
      dt: row.dt,
      hi: row.hi ?? 60,
      lo: row.lo ?? 45,
      rain: row.rain || 0,
      pop: row.pop,
      wind: row.wind ?? 0,
      soil: row.soil,
      code: row.code,
      weekend: row.dt.getDay() === 0 || row.dt.getDay() === 6,
      daylight: i === 0 ? Math.max(0, Math.min(12, 19 - nowHour)) : 12,
      hasHours: hours.length > 0,
      hours,
      wetBefore: wet(all[k - 1]) + wet(all[k - 2]),
      rain7Before,
    };
  });
  days.soil5 = a.m?.soil5 ?? null;
  // Lowest observed temperature in the last 30 days (for "after the first frost").
  const past = (a.past || []).slice(-30).filter((x) => x.lo != null);
  days.coldestPast = past.reduce((m, x) => (!m || x.lo < m.lo ? x : m), null);
  return days;
}

/** Rain on the n days after day d (within the forecast). */
function rainAhead(D, d, n) {
  let total = 0;
  let first = null;
  let max = null;
  const end = Math.min(D.length - 1, d.i + n);
  for (let k = d.i + 1; k <= end; k++) {
    const r = D[k].rain;
    total += r;
    if (!first && r >= 0.1) first = D[k];
    if (!max || r > max.rain) max = D[k];
  }
  return { total, first, max, days: end - d.i };
}

/** Longest calm, dry daylight stretch (spray window), from hourly data. */
function calmWindow(d) {
  let best = null;
  let run = null;
  for (const h of d.hours) {
    const good = h.h >= 6 && h.h <= 17 && (h.p ?? 0) < 0.01 && (h.w ?? 99) <= 10 && h.t >= 50 && h.t <= 88;
    if (good) {
      if (run && h.h === run.to) { run.to = h.h + 1; run.maxW = Math.max(run.maxW, h.w); }
      else run = { from: h.h, to: h.h + 1, maxW: h.w };
      if (!best || run.to - run.from > best.to - best.from) best = { ...run };
    } else run = null;
  }
  return best && best.to - best.from >= 2 ? best : null;
}

/** Temperatures for the night after day i (3 pm through 11 am the next day). */
function nightTemps(D, i) {
  const d = D[i];
  const next = D[i + 1];
  return (d ? d.hours.filter((h) => h.h >= 15).map((h) => h.t) : [])
    .concat(next ? next.hours.filter((h) => h.h <= 11).map((h) => h.t) : []);
}

/** Low overnight after day d (evening of d through the next morning). */
function nightLow(D, d) {
  const temps = nightTemps(D, d.i).filter((v) => v != null);
  if (temps.length) return Math.min(...temps);
  return D[d.i + 1] ? D[d.i + 1].lo : null;
}

/**
 * First cold night at or below th (°F), searching forward from now. Returns
 * the last day to get work done before it, and the night's low.
 */
function coldNight(D, th) {
  for (const d of D) {
    if (d.hours.length) {
      const hit = d.hours.find((h) => h.t <= th);
      if (!hit) continue;
      // Early-morning lows belong to the night before.
      const last = hit.h >= 15 ? d.i : d.i - 1;
      if (last < 0) continue;
      const temps = nightTemps(D, last).filter((v) => v != null);
      return { last, lo: Math.round(temps.length ? Math.min(...temps) : hit.t), day: D[last] };
    }
    if (d.i > 0 && d.lo <= th) return { last: d.i - 1, lo: Math.round(d.lo), day: D[d.i - 1] };
  }
  return null;
}

/* ---------------- weather profiles ---------------- */
const no = (reason, extra = {}) => ({ ok: false, score: 10, no: reason, ...extra });

function soggy(d) {
  if (d.rain >= 0.3) return `${fmtIn(d.rain)} of rain`;
  if (d.wetBefore >= 0.75) return `clay is still wet from ${fmtIn(d.wetBefore)} of rain`;
  return null;
}
const late = (d) => (d.daylight < 2 ? 'too late in the day' : null);

const P = {};

P.outdoor = (d) => {
  const x = late(d) || (d.rain >= 0.25 ? `${fmtIn(d.rain)} of rain` : null)
    || (d.hi < 35 ? `too cold (${deg(d.hi)})` : null) || (d.hi >= 100 ? `dangerous heat (${deg(d.hi)})` : null);
  if (x) return no(x);
  let s = 50 + (isDry(d) ? 15 : -5);
  s += pleasant(d) ? 15 : d.hi < 45 ? -10 : d.hi > 90 ? -15 : 0;
  s += d.wind <= 15 ? 5 : d.wind > 22 ? -10 : 0;
  return { ok: true, score: s, why: cap(describe(d)), icon: 'sun' };
};

P.indoor = (d) => {
  const wetDay = d.rain >= 0.1 || (d.pop ?? 0) >= 60;
  const bad = wetDay || d.hi < 40 || d.hi > 92;
  const s = 50 + (bad ? 25 : 0) - (isDry(d) && pleasant(d) ? 10 : 0);
  const why = wetDay ? `Rainy day (${fmtIn(d.rain)}): a good indoor job`
    : d.hi < 40 ? `Cold day (${deg(d.hi)}): a good indoor job`
      : d.hi > 92 ? `Hot day (${deg(d.hi)}): a good indoor job` : 'No weather needed: any day works';
  return { ok: true, score: s, why, icon: 'home' };
};

P.mow = (d) => {
  const x = late(d) || (d.rain >= 0.1 ? `${fmtIn(d.rain)} of rain: wet grass clumps and soft soil ruts` : null)
    || (d.wetBefore >= 0.75 ? `soil is soft after ${fmtIn(d.wetBefore)} of rain` : null)
    || (d.hi < 38 ? 'frozen grass: wait for a thaw' : null);
  if (x) return no(x);
  const prevWet = (d.wetBefore || 0) >= 0.1;
  let s = 60 + (prevWet ? 0 : 10) + (pleasant(d) ? 10 : 0);
  let why = `${prevWet ? 'Grass should be dry by afternoon' : 'Dry grass'}, ${deg(d.hi)}`;
  if (d.hi >= 90) { s -= 15; why = `Mow in the evening; it peaks at ${deg(d.hi)}`; }
  return { ok: true, score: s, why, icon: 'mower' };
};

P.spray = (d, D) => {
  const nx = D[d.i + 1];
  const calm = d.hasHours ? calmWindow(d) : null;
  const x = late(d)
    || (d.hi < 50 ? `too cool (${deg(d.hi)}); weeds must be growing for herbicide to work` : null)
    || (d.hi > 88 ? `too hot (${deg(d.hi)}); drift and turf injury risk` : null)
    || (d.rain >= DRY || (d.pop ?? 0) >= 50 ? 'rain in the forecast' : null)
    || (nx && nx.rain >= 0.1 ? `${fmtIn(nx.rain)} of rain ${dayWord(nx)} would wash it off` : null)
    || (d.hasHours ? (!calm ? `too windy or wet for spraying (gusts to ${Math.round(d.wind)} mph)` : null)
      : d.wind > 12 ? `too windy (${Math.round(d.wind)} mph)` : null);
  if (x) return no(x);
  const s = 60 + (d.hi >= 60 && d.hi <= 80 ? 15 : 5) + (calm && calm.to - calm.from >= 3 ? 10 : 0) + (d.wind <= 8 ? 5 : 0);
  const wind = !calm ? `light wind (${Math.round(d.wind)} mph)`
    : calm.to - calm.from >= 9 ? `light wind all day (${Math.round(calm.maxW)} mph or less)`
      : `calmest ${fmtSpan(calm.from, calm.to)} (wind ${Math.round(calm.maxW)} mph or less)`;
  const why = `Dry for 24 hours at ${deg(d.hi)}; ${wind}`;
  return { ok: true, score: s, why, icon: 'spray' };
};

P.granular = (d, D) => {
  const x = late(d) || (d.rain >= 0.25 ? `${fmtIn(d.rain)} of rain` : null)
    || (d.hi >= 90 ? `${deg(d.hi)} heat can burn the lawn` : null) || (d.hi < 38 ? 'the ground is likely frozen' : null);
  if (x) return no(x);
  const ah = rainAhead(D, d, 3);
  const big = ah.max && ah.max.rain >= 1.25 && ah.max.i <= d.i + 2 ? ah.max : null;
  if (big) return no(`a ${fmtIn(big.rain)} downpour ${dayWord(big)} could wash it off`, { score: 20 });
  let s = 55 + (d.rain < DRY ? 10 : 0) - (d.wind >= 20 ? 10 : 0);
  let why;
  const storm = ah.max && ah.max.rain >= 1 ? ah.max : null;
  const soaks = ah.total >= 0.2 && !storm;
  if (storm) why = `Water it in with ¼″ right away; the ${fmtIn(storm.rain)} storm ${dayWord(storm)} is too heavy to count on`;
  else if (soaks) {
    s += 25;
    why = ah.first ? `${fmtIn(ah.first.rain)} of rain ${dayWord(ah.first)} will water it in` : `Light rain over the next ${ah.days} days will water it in`;
  } else if (ah.total >= 0.05) why = `Only a sprinkle due, so water it in with ¼″ after spreading`;
  else why = 'No rain due, so water it in with ¼″ after spreading';
  if (d.wind >= 20) why += `. Breezy (${Math.round(d.wind)} mph): spread in the calm morning`;
  return { ok: true, score: s, why, icon: soaks ? 'rain' : 'sprout' };
};

P.seed = (d, D) => {
  const x = late(d) || soggy(d) || (d.hi >= 90 ? `${deg(d.hi)} is too hot for new seedlings` : null)
    || (d.hi < 45 ? `too cold (${deg(d.hi)}) for seed to sprout` : null);
  if (x) return no(x);
  const ah = rainAhead(D, d, 5);
  const big = ah.max && ah.max.rain >= 1.5 && ah.max.i <= d.i + 2 ? ah.max : null;
  if (big) return no(`a ${fmtIn(big.rain)} downpour ${dayWord(big)} could wash seed away`, { score: 20 });
  let s = 55;
  let why = 'No rain due: keep the top ½″ damp with light daily watering';
  if (ah.total >= 0.25) {
    s += 25;
    why = `${cap(fmtIn(ah.total))} of rain over the next ${ah.days} days will do most of the watering`;
  }
  return { ok: true, score: s, why, icon: 'seed' };
};

P.soil = (d) => {
  const x = late(d) || soggy(d) || (d.hi < 38 ? 'the ground may be frozen' : null);
  if (x) return no(x);
  const s = 55 + (isDry(d) ? 10 : 0) + (pleasant(d) ? 10 : 0);
  return { ok: true, score: s, why: `Workable soil: ${describe(d)}`, icon: 'shovel' };
};

P.plant = (d, D) => {
  const x = late(d) || soggy(d) || (d.hi < 38 ? 'the ground may be frozen' : null);
  if (x) return no(x);
  if (d.dt.getMonth() < 6) {
    const cold = D.slice(d.i, d.i + 3).reduce((m, y) => (!m || y.lo < m.lo ? y : m), null);
    if (cold && cold.lo <= 28) return no(`a ${deg(cold.lo)} hard freeze ${dayWord(cold)}`);
  }
  let s = 55 + (isDry(d) ? 5 : 0);
  let note = describe(d);
  if (d.hi >= 88) { s -= 15; note = `hot (${deg(d.hi)}), so plant in the evening`; }
  else if (d.hi >= 50 && d.hi <= 80) s += 10;
  if ([2, 3, 45, 48].includes(d.code)) s += 5; // overcast is easy on transplants
  const ah = rainAhead(D, d, 2);
  if (ah.total >= 0.1 && (!ah.max || ah.max.rain < 1.5)) {
    s += 15;
    return { ok: true, score: s, why: `${cap(note)}; ${fmtIn(ah.total)} of rain ${dayWord(ah.first || ah.max)} waters it in`, icon: 'shovel' };
  }
  return { ok: true, score: s, why: `Workable soil: ${note}`, icon: 'shovel' };
};

/** Warm-season planting: soil at or above n°F and no cold nights coming. */
const warm = (n) => (d, D) => {
  const soilT = d.soil ?? D.soil5;
  if (soilT != null && soilT < n) return no(`soil is ${deg(soilT)}; wait for ${n}°F or warmer`, { hard: true });
  const cold = D.slice(d.i, d.i + 4).reduce((m, y) => (!m || y.lo < m.lo ? y : m), null);
  const floor = n >= 60 ? 50 : 45;
  if (cold && cold.lo < floor) return no(`a ${deg(cold.lo)} night ${dayWord(cold)} is too cold for tender plants`, { hard: true });
  const r = P.plant(d, D);
  if (!r.ok) return r;
  return { ...r, why: `${soilT != null ? `Soil ${deg(soilT)}, ` : ''}nights above ${floor}°F. ${r.why}`, icon: 'thermo' };
};
P.warm55 = warm(55);
P.warm60 = warm(60);
P.warm65 = warm(65);

/** Garlic and bulbs: soil cooled to about 60°F. */
P.cool60 = (d, D) => {
  const soilT = d.soil ?? D.soil5;
  if (soilT != null && soilT > 61) return no(`soil is still ${deg(soilT)}; wait until it's under 60°F`, { hard: true });
  const r = P.plant(d, D);
  if (!r.ok) return r;
  return { ...r, why: soilT != null ? `Soil ${deg(soilT)}, cool enough to root without sprouting. ${r.why}` : r.why, icon: 'thermo' };
};

P.prune = (d) => {
  const x = late(d) || (d.rain >= 0.1 ? 'wet: pruning wet plants spreads disease' : null)
    || (d.hi < 28 ? `${deg(d.hi)}: frozen wood splinters` : null);
  if (x) return no(x);
  const s = 55 + (isDry(d) ? 10 : 0) + (d.hi >= 35 ? 10 : 0) + (pleasant(d) ? 5 : 0);
  return { ok: true, score: s, why: `Dry and ${deg(d.hi)}: clean cuts and less disease spread`, icon: 'scissors' };
};

P.harvest = (d, D) => {
  const x = late(d) || (d.rain >= 0.25 ? `${fmtIn(d.rain)} of rain` : null);
  if (x) return no(x);
  let s = 55 + (isDry(d) ? 10 : 0);
  const fz = coldNight(D, 28);
  if (fz && d.i <= fz.last) return { ok: true, score: s + 10, why: `Pick ahead of the ${fz.lo}°F freeze ${nightWord(fz.day)}`, icon: 'basket' };
  if (fz && d.i > fz.last) s -= 10;
  return { ok: true, score: s, why: `Good picking weather: ${describe(d)}`, icon: 'basket' };
};

/** Jobs that must beat the first frost or hard freeze. */
const before = (th, label) => (d, D) => {
  const c = coldNight(D, th);
  const base = P.outdoor(d, D);
  if (c) {
    if (d.i > c.last) return no(`too late: ${c.lo}°F ${label} ${nightWord(c.day)}`, { hard: true });
    if (!base.ok && d.i !== c.last) return base;
    const last = d.i === c.last;
    const why = last
      ? (d.i === 0 ? `Do it today: ${c.lo}°F ${label} tonight` : `Last chance before the ${c.lo}°F ${label} ${nightWord(c.day)}`)
      : `Ahead of the ${c.lo}°F ${label} ${nightWord(c.day)}`;
    return { ok: true, score: (base.ok ? base.score : 40) + 15, why, icon: 'snow' };
  }
  if (!base.ok) return base;
  return { ...base, score: base.score - 10, why: `No ${label} in the forecast yet. ${base.why}` };
};
P.beforeFrost = before(32, 'frost');
P.beforeFreeze = before(28, 'hard freeze');

/** Jobs that wait for frost (pull frosted vines, mulch after hard freeze). */
const after = (th, label) => (d, D) => {
  const seen = D.coldestPast && D.coldestPast.lo <= th ? D.coldestPast : null;
  let ready = 0;
  let why = '';
  if (seen) why = `It already hit ${Math.round(seen.lo)}°F on ${seen.dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  else {
    const c = coldNight(D, th);
    if (!c) return no(`waiting for the first ${label}; none in the 7-day forecast`, { hard: true });
    ready = c.last + 1;
    if (d.i < ready) return no(`wait for the ${c.lo}°F ${label} ${nightWord(c.day)}`, { hard: true });
    why = `Right after the ${c.lo}°F ${label} ${nightWord(c.day)}`;
  }
  const base = P.outdoor(d, D);
  if (!base.ok) return base;
  return { ...base, why: `${why}. ${base.why}`, icon: 'snow' };
};
P.afterFrost = after(32, 'frost');
P.afterFreeze = after(28, 'hard freeze');

P.water = (d, D) => {
  const x = late(d) || (d.hi < 40 ? 'too cold: the ground may be frozen' : null)
    || (d.rain >= 0.25 ? `${fmtIn(d.rain)} of rain` : null);
  if (x) return no(x);
  if (d.rain7Before >= 1) return no(`${fmtIn(d.rain7Before)} of rain in the week before ${dayWord(d)} covers it`);
  const ah = rainAhead(D, d, 3);
  if (ah.total >= 0.5) return no(`${fmtIn(ah.total)} of rain is due by ${dayWord(D[d.i + ah.days])}; let it do the watering`);
  const s = 55 + (isDry(d) ? 10 : 0) + (d.hi >= 80 ? 10 : 0);
  const past = d.rain7Before < 0.01 ? 'No rain' : `Only ${fmtIn(d.rain7Before)} of rain`;
  return { ok: true, score: s, why: `${past} in the past week and little coming: soak the roots`, icon: 'drop' };
};

P.cover = (d, D) => {
  const lo = nightLow(D, d);
  if (lo == null || lo > 34) return no('no frost nights in the forecast', { hard: true });
  return { ok: true, score: 90, why: `Cover tender plants this evening: ${deg(lo)} by morning`, icon: 'snow' };
};

export const PROFILES = P;
export const profileOf = (t) => (t.wx && (P[t.wx] || t.wx === 'watch') ? t.wx : 'outdoor');

/* ---------------- planning ---------------- */
/**
 * Plan the week.
 * @returns {{ days, waiting, ongoing, planned: Set<string>, headline: string[] }}
 */
export function planWeek({ tasks, analysis, settings, year, now = new Date() }) {
  const D = buildDays(analysis, now);
  if (!D) return null;
  const days = D.slice(0, PLAN_DAYS).map((d) => ({ ...d, items: [], load: 0 }));
  const todayISO = toISO(D[0].dt);
  const weekends = settings.yardDays === 'weekends';
  const waiting = [];
  const ongoing = [];
  const planned = new Set();
  const queue = [];

  for (const t of tasks) {
    const st = days.map((d) => taskStatus(t, d.dt, settings));
    const inWin = st.map((s) => s.state === 'now');
    const first = inWin.indexOf(true);
    if (first < 0) continue;
    if (isDone(year, t.id)) {
      const info = doneInfo(year, t.id);
      if (info && info.at && toISO(new Date(info.at)) === todayISO) {
        days[0].items.push({ t, done: true, why: null });
        planned.add(t.id);
      }
      continue;
    }
    const prof = profileOf(t);
    const w = st[first];
    const long = t.priority !== 'critical' && diffDays(w.start, w.end) > 75;
    if (first > 0 && (t.priority === 'optional' || prof === 'watch' || long)) continue; // left for "Coming up"
    if (prof === 'watch') { ongoing.push(t); planned.add(t.id); continue; }
    const fn = P[prof];
    const res = days.map((d, i) => (inWin[i] ? fn(d, D, t) : null));
    // Season-long reminders join the plan only when the weather calls for
    // them (a dry spell for "water young trees", a frost night for row cover).
    if (long && !(EVENT.has(prof) && res.some((r) => r && r.ok))) { ongoing.push(t); planned.add(t.id); continue; }
    const last = inWin.lastIndexOf(true);
    const closes = last < PLAN_DAYS - 1 || diffDays(days[0].dt, st[last].end) < PLAN_DAYS;
    queue.push({ t, res, okDays: res.filter((r) => r && r.ok).length, closes, end: st[last].end });
  }

  // Tightest constraints first, then key tasks, then whatever closes soonest.
  queue.sort((a, b) => a.okDays - b.okDays || (PRIO[a.t.priority] ?? 1) - (PRIO[b.t.priority] ?? 1) || a.end - b.end);

  for (const q of queue) {
    const { t, res } = q;
    let cands = res.map((r, i) => (r && r.ok ? i : -1)).filter((i) => i >= 0);
    let forced = false;
    if (!cands.length) {
      const soft = res.map((r, i) => (r && !r.hard ? i : -1)).filter((i) => i >= 0);
      if (!q.closes || !soft.length) {
        waiting.push({ t, why: waitReason(days, res) });
        planned.add(t.id);
        continue;
      }
      forced = true;
      cands = soft;
    }
    const crit = t.priority === 'critical';
    let best = -1;
    let bestScore = -Infinity;
    for (const i of cands) {
      let s = res[i].score - i * (crit ? 5 : 3) - days[i].load * 6;
      if (weekends) s += days[i].weekend ? 18 : -12;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    const r = res[best];
    const lastDay = days[res.map(Boolean).lastIndexOf(true)];
    const why = forced
      ? `Not ideal (${r.no}), but the window closes ${dayWord(lastDay)}`
      : r.why;
    days[best].items.push({ t, why, icon: forced ? 'alert' : r.icon, forced });
    days[best].load += EFFORT[t.effort] || 1;
    planned.add(t.id);
  }

  for (const d of days) {
    d.verdict = verdict(d);
    d.items.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.forced ? 1 : 0) - (b.forced ? 1 : 0)
      || (PRIO[a.t.priority] ?? 1) - (PRIO[b.t.priority] ?? 1));
  }
  return { days, waiting, ongoing, planned, headline: headline(days, D, weekends) };
}

/** Why a task found no day: the distinct reasons, day by day (up to 3). */
function waitReason(days, res) {
  const fails = res.map((r, i) => (r && !r.ok ? { d: days[i], no: r.no } : null)).filter(Boolean);
  const useful = fails.filter((f) => f.no !== 'too late in the day');
  const list = useful.length ? useful : fails;
  if (!list.length) return 'No good day in the forecast';
  // Same reason every day (numbers aside): say it once.
  const kind = (f) => f.no.replace(/[\d.]+/g, '#');
  const kinds = [...new Set(list.map(kind))];
  if (kinds.length === 1) return list.every((f) => f.no === list[0].no) ? cap(list[0].no) : `Not this week: ${list[0].no}`;
  const seen = new Set();
  const parts = [];
  for (const f of list) {
    if (seen.has(kind(f))) continue;
    seen.add(kind(f));
    parts.push(`${cap(dayWord(f.d))}: ${f.no}`);
    if (parts.length === 3) break;
  }
  return parts.join(' · ');
}

/** Two or three plain sentences that sum up the week. */
function headline(days, D, weekends) {
  const out = [];
  const usable = days.filter((d) => d.daylight >= 3);
  let best = null;
  let bestScore = -Infinity;
  for (const d of usable) {
    const r = P.outdoor(d, D);
    if (!r.ok) continue;
    const s = r.score + (weekends ? (d.weekend ? 18 : -12) : 0) - d.i;
    if (s > bestScore) { bestScore = s; best = d; }
  }
  if (best) out.push(`Best yard day: ${dayWord(best)} (${describe(best)}).`);
  else out.push('No great yard days in the forecast; the plan uses the least-bad ones.');
  const frost = coldNight(D, 32);
  const hard = coldNight(D, 28);
  if (frost && hard && hard.last !== frost.last) out.push(`Frost ${nightWord(frost.day)} (${frost.lo}°F), then a hard freeze ${nightWord(hard.day)} (${hard.lo}°F).`);
  else if (frost) out.push(`${frost.lo <= 28 ? 'Hard freeze' : 'Frost'} ${nightWord(frost.day)} (${frost.lo}°F).`);
  const wet = days.reduce((a, d) => a + d.rain, 0);
  const max = days.reduce((m, d) => (!m || d.rain > m.rain ? d : m), null);
  if (wet >= 0.5) out.push(`${cap(fmtIn(wet))} of rain this week, most of it ${dayWord(max)}.`);
  else if (wet < 0.1) out.push('A dry week ahead.');
  return out;
}

/** Calendar events for a plan (one all-day event per planned task). */
export function planEvents(plan) {
  const base = new URL('calendar.html', location.href).href;
  const items = [];
  for (const d of plan.days) {
    for (const it of d.items) {
      if (it.done) continue;
      items.push({
        uid: `plan-${it.t.id}-${d.iso}`,
        date: d.dt,
        title: it.t.title,
        desc: [it.why, it.t.summary, `${base}#/task/${it.t.id}`].filter(Boolean).join('\n\n'),
      });
    }
  }
  return items;
}
