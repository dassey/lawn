// "Your area": turns a ZIP code (or any picked location) into local frost
// dates, a hardiness zone, climate normals and a suggested lawn grass, so the
// plan fits wherever the visitor lives.
//
// How: 15 years of daily highs, lows and rain for the spot come from the
// Open-Meteo archive (ERA5 reanalysis). Gridded weather runs a little off
// from real weather stations, so nothing is used raw: each local number is
// compared with the same number computed the same way for the reference
// station (climate.json → "model"), and that difference is applied to the
// station's NOAA normals. The result lands in settings.local; windows.js
// does the date shifting from there.
import { store } from './store.js';
import { MON, MONTHS, shiftMMDD, fmtMMDD, mmdd, addDays } from './dates.js';
import { loadRaw } from './data.js';
import { GRASSES, suggestGrass } from './grass.js';

export const NORMAL_YEARS = [2010, 2024];
const FLASH_KEY = 'kcAlmanac.flash';

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

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

/** US ZIP → { name, lat, lon, zip, state }. Throws if the ZIP can't be found. */
export async function lookupZip(zip) {
  try {
    const j = await getJSON(`https://api.zippopotam.us/us/${zip}`);
    const p = j.places && j.places[0];
    if (p) return { name: `${p['place name']}, ${p['state abbreviation']}`, lat: +Number(p.latitude).toFixed(4), lon: +Number(p.longitude).toFixed(4), zip, state: p.state || null };
  } catch { /* fall through to the second service */ }
  const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${zip}&count=1&language=en&format=json&countryCode=US`);
  const p = j.results && j.results[0];
  if (!p) throw new Error(`Couldn't find ZIP ${zip}`);
  return { name: `${p.name}${p.admin1 ? ', ' + p.admin1 : ''}`, lat: +p.latitude.toFixed(4), lon: +p.longitude.toFixed(4), zip, state: p.admin1 || null };
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

/* ---------------- reference station → local ---------------- */
function zoneFromTemp(t) {
  const n = Math.max(0, Math.min(25, Math.floor((t + 60) / 5)));
  return `${Math.floor(n / 2) + 1}${n % 2 ? 'b' : 'a'}`;
}
export const zoneRank = (z) => { const m = /^(\d+)([ab])?$/.exec(z || ''); return m ? Number(m[1]) * 2 + (m[2] === 'b' ? 1 : 0) : null; };
export const zoneNumber = (z) => { const m = /^(\d+)/.exec(z || ''); return m ? Number(m[1]) : null; };

const stationDoy = (label) => { const [mo, d] = label.split(' '); return doyOf(MON.indexOf(mo) + 1, Number(d)); };
const doyToMMDD = (doy) => mmdd(addDays(new Date(2001, 0, 1), Math.round(doy) - 1));
const bound = (n, a, b) => Math.max(a, Math.min(b, n));

/** Combine a local summary with the reference station's normals. Pure; no I/O. */
export function buildLocal(sum, base, loc, zone = null) {
  const ref = base.model;
  const dSpring = Math.round(sum.frost[32].sMed - ref.frost[32].sMed);
  const dFall = Math.round(sum.frost[32].fMed - ref.frost[32].fMed);
  const lastFrost = doyToMMDD(bound(doyOf(4, 15) + dSpring, 1, 181));
  const firstFrost = doyToMMDD(bound(doyOf(10, 25) + dFall, 213, 365));

  const monthly = base.monthly.map((st, i) => {
    const a = sum.monthly[i];
    const k = ref.monthly[i];
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
  const z = zone || zoneFromTemp(-2.5 + sum.extMin - ref.extMin);
  const zr = zoneRank(z);

  // freeze table: station date + (local − reference) from the same gridded history
  const cell = (th, col, stLabel) => {
    const v = sum.frost[th][col];
    if (v <= 0 || v >= 366) return 'Rare';
    return fmtMMDD(doyToMMDD(bound(stationDoy(stLabel) + v - ref.frost[th][col], 1, 365)));
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
  const dryClimate = annual.precip < 25;

  const climate = {
    place: loc.name,
    station: `Estimate for ${loc.name} · ${span} weather history, adjusted to NOAA normals`,
    monthly,
    annual,
    rainNote: `The wettest month is ${MONTHS[wet.m - 1]} (${wet.precip.toFixed(1)} in) and the driest is ${MONTHS[dry.m - 1]} (${dry.precip.toFixed(1)} in). ${dryClimate ? 'That is too little for a lawn to stay green on rain alone, so the plan assumes you water.' : 'In most years that carries a lawn through with only an occasional deep soak.'}`,
    heatNote: annual.days90 >= 60
      ? 'Long, hot summers favor warm-season grasses, which grow fastest in the heat. Cool-season grass struggles here without shade and steady water.'
      : 'Every day above 90°F stresses cool-season grass. Mow high, skip summer fertilizer, and watch for dry spells longer than about three weeks.',
    frost: {
      station: `${loc.name}, estimate`,
      table,
      note: `"1-in-10 late" means 1 year in 10 the last freeze comes on or after that date; "1-in-10 early" means 1 year in 10 the first freeze comes on or before it. These dates are estimated from ${span} weather history for ${loc.name}, so your own yard can run a week either side. Low spots frost first.`,
      springNote: frosty
        ? `Half of years see the last 32°F freeze by ${k32.springMedian}, but 1 year in 10 it comes after ${k32.spring10}. That's why tomatoes and peppers wait for about ${fmtMMDD(shiftMMDD('05-10', bound(dSpring, -75, 45)) || '05-10')}.`
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
    state: loc.state || null,
    zone: z,
    zoneEst,
    lastFrost,
    firstFrost,
    frostFree: !frosty,
    cold: frosty && zr < 19,      // winters cold enough for freeze-protection jobs (zone 9a and colder)
    dry: dryClimate,
    grass: suggestGrass({ zr, julyHi: monthly[6].hi, lon: Number(loc.lon) }),
    climate,
    at: new Date().toISOString(),
  };
}

/* ---------------- actions ---------------- */
/**
 * Switch the almanac to a location. Sets the weather location, and fits the
 * plan when the climate history loads. Returns { ok, local, message }.
 */
export async function setPlace(loc) {
  const location = { name: loc.name, lat: loc.lat, lon: loc.lon, ...(loc.zip ? { zip: loc.zip } : {}), ...(loc.state ? { state: loc.state } : {}) };
  if (Number(loc.lat) < 15 || Number(loc.lon) > -60) {
    return { ok: false, local: null, notFound: true, message: 'This almanac covers the United States. Enter a US ZIP code.' };
  }
  const s = store.settings;
  try {
    const [base, daily, zone] = await Promise.all([loadRaw('climate'), fetchDaily(loc), loc.zip ? fetchZone(loc.zip) : null]);
    const local = buildLocal(summarize(daily), base, loc, zone);
    const patch = { location, region: 'local', local };
    // Follow the climate unless the visitor has picked these themselves.
    if (!s.grassChosen) { patch.grass = local.grass; patch.nTarget = GRASSES[local.grass].nDefault; }
    if (!s.wateringChosen) patch.watering = local.dry ? 'irrigate' : 'rain';
    store.setSettings(patch);
    return { ok: true, local, message: `Plan fitted to ${loc.name}.` };
  } catch (err) {
    console.warn('place: climate lookup failed', err);
    // Keep any earlier adjustment only if it was for this same spot.
    const keep = s.local && s.local.key === locKey(loc);
    store.setSettings({ location, ...(keep ? {} : { local: null, region: s.region === 'local' ? 'central' : s.region }) });
    return { ok: false, local: null, message: `Weather is set to ${loc.name}, but its climate history didn't load, so the dates aren't fitted to your area yet. Try again in a few minutes.` };
  }
}

export async function setPlaceByZip(zip) {
  let loc;
  try { loc = await lookupZip(zip); } catch { return { ok: false, local: null, notFound: true, message: `Couldn't find ZIP ${zip}. Check the number, or your connection.` }; }
  return setPlace(loc);
}

/** Climate normals for the visitor's area, or null until they have set one. */
export function climateFor(base, s = store.settings) {
  const L = activeLocal(s);
  return L && L.climate ? L.climate : null;
}

/** "last frost about May 9, first about Oct 10", or a plain note where it rarely freezes. */
export function frostWords(L) {
  return L.frostFree ? 'freezes are rare' : `last frost about ${fmtMMDD(L.lastFrost)}, first about ${fmtMMDD(L.firstFrost)}`;
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
