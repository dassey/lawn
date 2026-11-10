// "Your area": turns a ZIP code (or any picked location) into local frost
// dates, a hardiness zone and climate normals, so the Kansas City plan can be
// shifted to fit somewhere else.
//
// How: 15 years of daily highs, lows and rain for the spot come from the
// Open-Meteo archive (ERA5 reanalysis). Gridded weather runs a little off
// from real weather stations, so nothing is used raw: each local number is
// compared with the same number computed the same way for Kansas City
// (climate.json → "model"), and that difference is applied to KC's NOAA
// station normals. The result lands in settings.local; windows.js does the
// date shifting from there.
import { store, DEFAULT_LOCATION } from './store.js';
import { MON, MONTHS, shiftMMDD, fmtMMDD, mmdd, addDays } from './dates.js';
import { loadJSON } from './data.js';

export const KC_LAST_FROST = '04-15';
export const KC_FIRST_FROST = '10-25';
export const NORMAL_YEARS = [2010, 2024];
const FLASH_KEY = 'kcAlmanac.flash';

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.02;

export const isHome = (loc) => !loc || (near(loc.lat, DEFAULT_LOCATION.lat) && near(loc.lon, DEFAULT_LOCATION.lon));
export const locKey = (loc) => `${Number(loc.lat).toFixed(2)},${Number(loc.lon).toFixed(2)}`;

/** The saved local adjustment, when it is the one in use. */
export function activeLocal(s = store.settings) {
  return s.region === 'local' && s.local ? s.local : null;
}

/* ---------------- lookups ---------------- */
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** US ZIP → { name, lat, lon, zip }. Throws if the ZIP can't be found. */
export async function lookupZip(zip) {
  try {
    const j = await getJSON(`https://api.zippopotam.us/us/${zip}`);
    const p = j.places && j.places[0];
    if (p) return { name: `${p['place name']}, ${p['state abbreviation']}`, lat: +Number(p.latitude).toFixed(4), lon: +Number(p.longitude).toFixed(4), zip };
  } catch { /* fall through to the second service */ }
  const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${zip}&count=1&language=en&format=json&countryCode=US`);
  const p = j.results && j.results[0];
  if (!p) throw new Error(`Couldn't find ZIP ${zip}`);
  return { name: `${p.name}${p.admin1 ? ', ' + p.admin1 : ''}`, lat: +p.latitude.toFixed(4), lon: +p.longitude.toFixed(4), zip };
}

/** USDA hardiness zone for a ZIP (2023 map), or null. */
async function fetchZone(zip) {
  try {
    const j = await getJSON(`https://phzmapi.org/${zip}.json`);
    return /^\d+[ab]?$/.test(j.zone || '') ? j.zone : null;
  } catch { return null; }
}

async function fetchDaily(loc) {
  const params = new URLSearchParams({
    latitude: loc.lat,
    longitude: loc.lon,
    start_date: `${NORMAL_YEARS[0]}-01-01`,
    end_date: `${NORMAL_YEARS[1]}-12-31`,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    temperature_unit: 'fahrenheit',
    precipitation_unit: 'inch',
    timezone: 'auto',
  });
  const j = await getJSON(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  if (!j.daily || !j.daily.time || j.daily.time.length < 3650) throw new Error('Not enough weather history for this spot');
  return j.daily;
}

/* ---------------- climate summary ---------------- */
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const doyOf = (m, d) => Math.min(365, CUM[m - 1] + d);
const SPLIT = doyOf(7, 15); // spring frosts before, fall frosts after
export const THRESHOLDS = [36, 32, 28];

function quantile(sorted, q) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/**
 * Boil daily history down to the handful of numbers the plan needs.
 * Frost dates are day-of-year; a year with no frost counts as day 0 in
 * spring and day 366 in fall, so mild climates sort to the ends.
 */
export function summarize(daily) {
  const years = new Map();
  const mon = Array.from({ length: 12 }, () => ({ hi: 0, lo: 0, n: 0, precip: 0, d90: 0 }));
  daily.time.forEach((t, i) => {
    const hi = daily.temperature_2m_max[i];
    const lo = daily.temperature_2m_min[i];
    if (hi == null || lo == null) return;
    const y = Number(t.slice(0, 4));
    const m = Number(t.slice(5, 7));
    const doy = doyOf(m, Number(t.slice(8, 10)));
    let Y = years.get(y);
    if (!Y) { Y = { min: Infinity, last: {}, first: {} }; years.set(y, Y); }
    if (lo < Y.min) Y.min = lo;
    for (const th of THRESHOLDS) {
      if (lo > th) continue;
      if (doy < SPLIT) Y.last[th] = doy;
      else if (Y.first[th] == null) Y.first[th] = doy;
    }
    const b = mon[m - 1];
    b.hi += hi; b.lo += lo; b.n += 1;
    b.precip += daily.precipitation_sum[i] || 0;
    if (hi >= 90) b.d90 += 1;
  });
  const Ys = [...years.values()];
  const n = Ys.length;
  const frost = {};
  for (const th of THRESHOLDS) {
    const sp = Ys.map((Y) => Y.last[th] ?? 0).sort((a, b) => a - b);
    const fa = Ys.map((Y) => Y.first[th] ?? 366).sort((a, b) => a - b);
    frost[th] = { sMed: r1(quantile(sp, 0.5)), s90: r1(quantile(sp, 0.9)), fMed: r1(quantile(fa, 0.5)), f10: r1(quantile(fa, 0.1)) };
  }
  return {
    years: n,
    frost,
    noFreeze: r2(Ys.filter((Y) => Y.last[32] == null && Y.first[32] == null).length / n),
    extMin: r1(Ys.reduce((a, Y) => a + Y.min, 0) / n),
    monthly: mon.map((b) => ({ hi: r1(b.hi / b.n), lo: r1(b.lo / b.n), precip: r2(b.precip / n), days90: r1(b.d90 / n) })),
  };
}

/* ---------------- KC plan → local ---------------- */
function zoneFromTemp(t) {
  const n = Math.max(0, Math.min(25, Math.floor((t + 60) / 5)));
  return `${Math.floor(n / 2) + 1}${n % 2 ? 'b' : 'a'}`;
}
const zoneRank = (z) => { const m = /^(\d+)([ab])?$/.exec(z || ''); return m ? Number(m[1]) * 2 + (m[2] === 'b' ? 1 : 0) : null; };

const stationDoy = (label) => { const [mo, d] = label.split(' '); return doyOf(MON.indexOf(mo) + 1, Number(d)); };
const doyToMMDD = (doy) => mmdd(addDays(new Date(2001, 0, 1), Math.round(doy) - 1));
const bound = (n, a, b) => Math.max(a, Math.min(b, n));

/** How well the tall-fescue, rain-fed plan suits this climate. */
function fitNotes({ zone, noFreeze, precip, dSpring, dFall }) {
  const zr = zoneRank(zone);
  const out = [];
  if (noFreeze > 0.5 || (zr != null && zr >= 17)) {
    out.push({ id: 'warm', level: 'high', text: 'Lawns here are warm-season grass (bermuda, zoysia, St. Augustine, centipede), so skip the tall fescue lawn schedule: those grasses are fed in summer, not fall. With little or no frost, winter is a growing season too, so treat the shifted veggie dates as rough and check your state Extension planting calendar.' });
  } else if (zr === 16) {
    out.push({ id: 'south', level: 'med', text: 'Tall fescue is near its southern limit here. If your lawn is bermuda or zoysia, skip the lawn fertilizer and seeding schedule (warm-season grass is fed in summer, not fall). The rest of the plan applies.' });
  } else if (zr != null && zr <= 8) {
    out.push({ id: 'cold', level: 'med', text: 'Winters here are hard on tall fescue. Kentucky bluegrass and fine fescue are the usual lawn grasses; the timing still applies to them, but ask your state Extension which seed to buy.' });
  }
  if (precip < 25) {
    out.push({ id: 'dry', level: 'high', text: `About ${Math.round(precip)} in of rain falls here in a year (Kansas City gets 39). A lawn won't stay green on rain alone, so the rain-fed watering advice doesn't fit; plan on regular irrigation or a drought-tolerant lawn.` });
  }
  if (!out.some((x) => x.id === 'warm') && Math.max(Math.abs(dSpring), Math.abs(dFall)) > 45) {
    out.push({ id: 'far', level: 'med', text: 'The seasons here run more than 6 weeks off Kansas City\'s. Dates are shifted as far as the plan stretches (6 weeks), so treat them as rough.' });
  }
  return out;
}

/** Combine a local summary with KC's station normals. Pure; no I/O. */
export function buildLocal(sum, base, loc, zone = null) {
  const kc = base.model;
  const dSpring = Math.round(sum.frost[32].sMed - kc.frost[32].sMed);
  const dFall = Math.round(sum.frost[32].fMed - kc.frost[32].fMed);
  const lastFrost = doyToMMDD(bound(doyOf(4, 15) + dSpring, 1, 181));
  const firstFrost = doyToMMDD(bound(doyOf(10, 25) + dFall, 213, 365));

  const monthly = base.monthly.map((st, i) => {
    const a = sum.monthly[i];
    const k = kc.monthly[i];
    return {
      m: st.m,
      hi: r1(st.hi + a.hi - k.hi),
      lo: r1(st.lo + a.lo - k.lo),
      precip: r2(k.precip > 0.05 ? st.precip * (a.precip / k.precip) : a.precip),
      days90: r1(Math.max(0, Math.min(31, a.days90 > 0 || k.days90 > 0 ? st.days90 + a.days90 - k.days90 : 0))),
    };
  });
  const avg = (f) => monthly.reduce((t, x) => t + f(x), 0) / 12;
  const annual = {
    hi: r1(avg((x) => x.hi)), lo: r1(avg((x) => x.lo)), mean: r1(avg((x) => (x.hi + x.lo) / 2)),
    precip: r2(monthly.reduce((t, x) => t + x.precip, 0)), days90: r1(monthly.reduce((t, x) => t + x.days90, 0)),
  };

  const zoneEst = !zone;
  const z = zone || zoneFromTemp(-2.5 + sum.extMin - kc.extMin);

  // freeze table: KC station date + (local − KC) from the same gridded history
  const cell = (th, col, stLabel) => {
    const v = sum.frost[th][col];
    if (v <= 0 || v >= 366) return 'Rare';
    return fmtMMDD(doyToMMDD(bound(stationDoy(stLabel) + v - kc.frost[th][col], 1, 365)));
  };
  const table = base.frost.table.map((row, i) => {
    const th = THRESHOLDS[i];
    return { t: row.t, springMedian: cell(th, 'sMed', row.springMedian), spring10: cell(th, 's90', row.spring10), fallMedian: cell(th, 'fMed', row.fallMedian), fall10: cell(th, 'f10', row.fall10) };
  });
  const k32 = table[1];
  const k28 = table[2];
  const wet = monthly.reduce((a, b) => (b.precip > a.precip ? b : a));
  const dry = monthly.reduce((a, b) => (b.precip < a.precip ? b : a));
  const span = `${NORMAL_YEARS[0]}–${NORMAL_YEARS[1]}`;
  const frosty = k32.springMedian !== 'Rare' && k32.fallMedian !== 'Rare';

  const climate = {
    local: true,
    place: loc.name,
    station: `Estimate for ${loc.name} · ${span} weather history, adjusted to NOAA normals`,
    monthly,
    annual,
    rainNote: `The wettest month is ${MONTHS[wet.m - 1]} (${wet.precip.toFixed(1)} in) and the driest is ${MONTHS[dry.m - 1]} (${dry.precip.toFixed(1)} in). The plan's rain-fed watering advice was written for Kansas City's 39 in a year.`,
    heatNote: 'Every day above 90°F stresses cool-season grass. That\'s why this plan mows at 4 in, skips summer fertilizer, and watches the 3-week dry-spell rule.',
    frost: {
      station: `${loc.name}, estimate`,
      table,
      note: `"1-in-10 late" means 1 year in 10 the last freeze comes on or after that date; "1-in-10 early" means 1 year in 10 the first freeze comes on or before it. These dates are estimated by comparing ${span} gridded weather history for ${loc.name} with Kansas City's, so your own yard can run a week either side. Low spots frost first.`,
      springNote: frosty
        ? `Half of years see the last 32°F freeze by ${k32.springMedian}, but 1 year in 10 it comes after ${k32.spring10}. That's why tomatoes and peppers wait for about ${fmtMMDD(shiftMMDD('05-10', bound(dSpring, -45, 45)))}.`
        : 'Freezes are rare here, so the spring frost date is only a planning marker.',
      fallNote: frosty
        ? `The first 32°F freeze comes by about ${k32.fallMedian} in half of years (1 in 10 before ${k32.fall10})${k28.fallMedian !== 'Rare' ? `, and a hard 28°F freeze by about ${k28.fallMedian}` : ''}. Pick or cover tender crops when frost is forecast; the Today page alerts you.`
        : 'Freezes are rare here, so the fall frost date is only a planning marker.',
    },
  };

  return {
    key: locKey(loc),
    name: loc.name,
    zip: loc.zip || null,
    zone: z,
    zoneEst,
    lastFrost,
    firstFrost,
    dSpring,
    dFall,
    frostFree: !frosty,
    fit: fitNotes({ zone: z, noFreeze: sum.noFreeze, precip: annual.precip, dSpring, dFall }),
    climate,
    at: new Date().toISOString(),
  };
}

/* ---------------- actions ---------------- */
/**
 * Switch the almanac to a location. Always sets the weather location; also
 * shifts the plan when the climate history loads. Returns { ok, local, message }.
 */
export async function setPlace(loc) {
  if (isHome(loc)) { resetPlace(); return { ok: true, local: null, message: 'Back to the Kansas City plan.' }; }
  const location = { name: loc.name, lat: loc.lat, lon: loc.lon, ...(loc.zip ? { zip: loc.zip } : {}) };
  if (Number(loc.lat) < 0) {
    store.setSettings({ location, local: null, region: store.settings.region === 'local' ? 'central' : store.settings.region });
    return { ok: false, local: null, message: `Weather is set to ${loc.name}, but the plan's seasons only shift within the northern hemisphere.` };
  }
  try {
    const [base, daily, zone] = await Promise.all([loadJSON('climate'), fetchDaily(loc), loc.zip ? fetchZone(loc.zip) : null]);
    const local = buildLocal(summarize(daily), base, loc, zone);
    store.setSettings({ location, region: 'local', local });
    return { ok: true, local, message: `Plan adjusted for ${loc.name}.` };
  } catch (err) {
    console.warn('place: climate lookup failed', err);
    // Keep any earlier adjustment only if it was for this same spot.
    const s = store.settings;
    const keep = s.local && s.local.key === locKey(loc);
    store.setSettings({ location, ...(keep ? {} : { local: null, region: s.region === 'local' ? 'central' : s.region }) });
    return { ok: false, local: null, message: `Weather is set to ${loc.name}, but its climate history didn't load, so dates are ${keep ? 'unchanged' : 'still Kansas City\'s'}. Try again in a few minutes.` };
  }
}

export async function setPlaceByZip(zip) {
  let loc;
  try { loc = await lookupZip(zip); } catch { return { ok: false, local: null, notFound: true, message: `Couldn't find ZIP ${zip}. Check the number, or your connection.` }; }
  return setPlace(loc);
}

export function resetPlace() {
  const s = store.settings;
  store.setSettings({ location: { ...DEFAULT_LOCATION }, local: null, region: s.region === 'local' ? 'central' : s.region });
}

/** Climate normals for pages: the local estimate when one is in use, else KC's. */
export function climateFor(base, s = store.settings) {
  const L = activeLocal(s);
  return L && L.climate ? L.climate : base;
}

/** "last frost about May 9, first about Oct 10", or a plain note where it rarely freezes. */
export function frostWords(L) {
  return L.frostFree ? 'freezes are rare' : `last frost about ${fmtMMDD(L.lastFrost)}, first about ${fmtMMDD(L.firstFrost)}`;
}

/** "9 days later than Kansas City" / "about the same as Kansas City". */
export function shiftWords(n) {
  const a = Math.abs(n);
  if (a < 3) return 'about the same as Kansas City';
  const amt = a < 14 ? `${a} days` : `${Math.round(a / 7)} weeks`;
  return `${amt} ${n > 0 ? 'later' : 'earlier'} than Kansas City`;
}

/* A one-line message that survives the page reload after a location change. */
export function setFlash(msg) { try { sessionStorage.setItem(FLASH_KEY, msg); } catch { /* ignore */ } }
export function takeFlash() {
  try {
    const m = sessionStorage.getItem(FLASH_KEY);
    if (m) sessionStorage.removeItem(FLASH_KEY);
    return m;
  } catch { return null; }
}
