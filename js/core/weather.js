// Live conditions from Open-Meteo (free, no API key): 6 weeks of recent
// weather + 7-day forecast + modeled soil temperature. Your own rain-gauge
// and watering entries in the journal override/augment the model.
import { store, isDone } from './store.js';
import { toISO, fromISO, addDays, diffDays, realToday, fmtDate } from './dates.js';

const CACHE_KEY = 'kcAlmanac.wx.v1';
const TTL = 90 * 60 * 1000;
export const TURF_KC = 0.8; // cool-season turf water use ≈ 0.8 × reference ET (FAO-56 style)

export async function fetchWeather(loc, { force = false } = {}) {
  const key = `${Number(loc.lat).toFixed(3)},${Number(loc.lon).toFixed(3)}`;
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { /* ignore */ }
  if (!force && cached && cached.key === key && Date.now() - cached.at < TTL) {
    return { data: cached.data, at: cached.at, cached: true };
  }
  const params = new URLSearchParams({
    latitude: loc.lat,
    longitude: loc.lon,
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,et0_fao_evapotranspiration',
    hourly: 'soil_temperature_6cm',
    past_days: '42',
    forecast_days: '8',
    timezone: 'auto',
    temperature_unit: 'fahrenheit',
    precipitation_unit: 'inch',
    wind_speed_unit: 'mph',
  });
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!r.ok) throw new Error(`Weather service returned HTTP ${r.status}`);
    const data = await r.json();
    if (!data.daily) throw new Error('Unexpected weather response');
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ key, at: Date.now(), data })); } catch { /* quota */ }
    return { data, at: Date.now(), cached: false };
  } catch (err) {
    if (cached && cached.key === key) return { data: cached.data, at: cached.at, cached: true, stale: true, error: err };
    throw err;
  }
}

const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

/** Turn the raw response + journal into daily rows, metrics and alerts. */
export function analyze(raw, { date = realToday(), journal = store.state.journal, climate = null } = {}) {
  const d = raw.daily;
  const u = raw.daily_units || {};
  const etToIn = /mm/i.test(u.et0_fao_evapotranspiration || 'mm') ? 1 / 25.4 : 1;
  const rainToIn = /mm/i.test(u.precipitation_sum || 'inch') ? 1 / 25.4 : 1;

  // soil temperature daily means from hourly
  const soilByDay = {};
  if (raw.hourly && raw.hourly.time) {
    raw.hourly.time.forEach((t, i) => {
      const v = raw.hourly.soil_temperature_6cm?.[i];
      if (v == null) return;
      const k = t.slice(0, 10);
      (soilByDay[k] ||= []).push(v);
    });
  }
  // journal overrides
  const gauge = {};
  const water = {};
  let lastSeed = null;
  for (const j of journal) {
    if (j.type === 'rain' && j.inches != null) gauge[j.date] = (gauge[j.date] || 0) + Number(j.inches);
    if (j.type === 'water' && j.inches != null && (j.cat === 'lawn' || !j.cat)) water[j.date] = (water[j.date] || 0) + Number(j.inches);
    if (j.type === 'seed' && (!lastSeed || j.date > lastSeed)) lastSeed = j.date;
  }

  const todayISO = toISO(date);
  const days = d.time.map((t, i) => {
    const model = (d.precipitation_sum[i] ?? 0) * rainToIn;
    const g = gauge[t];
    const soilArr = soilByDay[t];
    return {
      date: t,
      dt: fromISO(t),
      hi: d.temperature_2m_max[i],
      lo: d.temperature_2m_min[i],
      rainModel: model,
      gauge: g,
      rain: g != null ? g : model,
      water: water[t] || 0,
      pop: d.precipitation_probability_max?.[i],
      wind: d.wind_speed_10m_max?.[i],
      et0: (d.et0_fao_evapotranspiration?.[i] ?? 0) * etToIn,
      code: d.weather_code?.[i],
      soil: soilArr ? soilArr.reduce((a, b) => a + b, 0) / soilArr.length : null,
      isToday: t === todayISO,
      past: t < todayISO,
      future: t > todayISO,
    };
  });

  const past = days.filter((x) => x.past);
  const future = days.filter((x) => x.future);
  const todayRow = days.find((x) => x.isToday) || null;
  const lastN = (n) => past.slice(-n);

  // days since a "soaking" (≥0.5 in within any 2-day span, rain + logged watering)
  let daysSinceSoak = null;
  for (let i = past.length - 1; i >= 0; i--) {
    const a = past[i].rain + past[i].water;
    const b = i > 0 ? past[i - 1].rain + past[i - 1].water : 0;
    if (a >= 0.5 || a + b >= 0.5) { daysSinceSoak = past.length - i; break; }
  }
  if (daysSinceSoak == null) daysSinceSoak = past.length; // none in window (≥42 days)

  const soilDays = past.slice(-5).map((x) => x.soil).filter((v) => v != null);
  const soil5 = soilDays.length ? soilDays.reduce((a, b) => a + b, 0) / soilDays.length : null;
  const soilNow = todayRow?.soil ?? past.slice(-1)[0]?.soil ?? null;

  const next5 = future.slice(0, 5);
  const minLo = future.reduce((m, x) => (x.lo != null && (m == null || x.lo < m.lo) ? x : m), null);
  const maxHi = future.reduce((m, x) => (x.hi != null && (m == null || x.hi > m.hi) ? x : m), null);

  const m = {
    rain7: r2(sum(lastN(7), (x) => x.rain)),
    rain14: r2(sum(lastN(14), (x) => x.rain)),
    rain30: r2(sum(lastN(30), (x) => x.rain)),
    water14: r2(sum(lastN(14), (x) => x.water)),
    et14: r2(sum(lastN(14), (x) => x.et0)),
    hot21: lastN(21).filter((x) => x.hi >= 90).length,
    hot7: lastN(7).filter((x) => x.hi >= 90).length,
    daysSinceSoak,
    soil5: soil5 != null ? r1(soil5) : null,
    soilNow: soilNow != null ? r1(soilNow) : null,
    wet3: r2(sum(lastN(3), (x) => x.rain)),
    rainNext5: r2(sum(next5, (x) => x.rain)),
    rainNext7: r2(sum(future.slice(0, 7), (x) => x.rain)),
    warmNightsNext5: next5.filter((x) => x.lo >= 65).length,
    hotNightsNext5: next5.filter((x) => x.lo >= 75).length,
    minLo, maxHi,
    gaugeDays: Object.keys(gauge).length,
  };
  m.use14 = r2(m.et14 * TURF_KC);
  m.balance14 = r2(m.rain14 + m.water14 - m.use14);

  // normal rain for the last 30 days from monthly normals
  if (climate && climate.monthly) {
    let normal30 = 0;
    for (let i = 1; i <= 30; i++) {
      const dd = addDays(date, -i);
      const mo = climate.monthly[dd.getMonth()];
      const dim = new Date(dd.getFullYear(), dd.getMonth() + 1, 0).getDate();
      normal30 += mo.precip / dim;
    }
    m.normal30 = r2(normal30);
  }

  let seedDays = null;
  if (lastSeed) {
    const n = diffDays(fromISO(lastSeed), date);
    if (n >= 0 && n <= 35) seedDays = n;
  }
  m.seedDays = seedDays;

  return { days, past, future, today: todayRow, m, alerts: buildAlerts(m, date, future, todayRow) };
}

function buildAlerts(m, date, future, todayRow) {
  const A = [];
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  const within = (a, b) => (a <= b ? md >= a && md <= b : md >= a || md <= b);
  const year = date.getFullYear();
  const dayName = (row) => (row ? (row.isToday ? 'today' : fmtDate(row.dt, { weekday: 'short', month: 'short', day: 'numeric' })) : '');
  const f = (n, d = 1) => (n == null ? '—' : Number(n).toFixed(d));

  // 1. New seed moisture
  if (m.seedDays != null && m.seedDays <= 28) {
    const rainSoon = (future[0]?.rain || 0) + (todayRow?.rain || 0) >= 0.2;
    A.push({
      id: 'seed', level: rainSoon ? 'info' : 'high', icon: 'seed',
      title: rainSoon ? 'New seed: rain is covering watering' : 'Keep new seed moist',
      text: rainSoon
        ? `Seeded ${m.seedDays} days ago. Rain is in the forecast, so skip watering while the top ½ in stays damp.`
        : `Seeded ${m.seedDays} days ago. Lightly water 2–3 times a day (5–10 minutes) so the top ½ in never dries out, until seedlings are up (tall fescue takes 7–14 days). Then water less often but deeper.`,
      href: 'calendar.html#/task/lawn-sep-overseed',
    });
  }

  // 2. Lawn drought (May 15 – Oct 15)
  if (within(515, 1015)) {
    if (m.daysSinceSoak >= 21 && (m.hot21 >= 3 || md >= 601 && md <= 915)) {
      A.push({
        id: 'soak', level: 'high', icon: 'drop',
        title: 'Lawn survival soak is due',
        text: `${m.daysSinceSoak >= 42 ? '6+ weeks' : `${m.daysSinceSoak} days`} since ½ in of rain${m.hot21 ? `, with ${m.hot21} days of 90°F+ in the last 3 weeks` : ''}. Put down ½–1 in early in the morning (two cycles 30 minutes apart on clay). Already brown and dormant? Through a long hot drought, give it ½–1 in every 2–3 weeks to keep the crowns alive (UNL says ¼–½ in keeps crowns hydrated; MU's lawn manual says at least 1 in prevents turf loss).`,
        href: 'lawn.html#water',
      });
    } else if (m.daysSinceSoak >= 12 && m.balance14 <= -1) {
      A.push({
        id: 'drying', level: 'med', icon: 'drop',
        title: 'Lawn is drying out',
        text: `${f(m.rain14, 2)} in of rain in 14 days against about ${f(m.use14, 1)} in of lawn water use. Watch for a blue-gray color and footprints that stay. If no rain arrives in about a week, plan a ½–1 in soak.`,
        href: 'lawn.html#water',
      });
    } else if (within(601, 915) && m.balance14 >= 0) {
      A.push({ id: 'wet-ok', level: 'good', icon: 'drop', title: 'Rain is keeping up with the lawn', text: `${f(m.rain14, 2)} in of rain in 14 days covers the ~${f(m.use14, 1)} in the lawn used. No watering needed.` });
    }
  }

  // 3. Brown patch weather
  if (within(601, 925) && m.warmNightsNext5 >= 3) {
    A.push({
      id: 'brownpatch', level: 'med', icon: 'alert',
      title: 'Brown patch weather',
      text: `${m.warmNightsNext5} of the next 5 nights stay at or above 65°F. Water only in the early morning, skip nitrogen, and mow when the grass is dry. Most tall fescue recovers in fall without spraying.`,
      href: 'lawn.html#issue-brown-patch',
    });
  }

  // 4. Crabgrass pre-emergent timing
  if (within(301, 520) && m.soil5 != null) {
    const pre = isDone(year, 'lawn-apr-preemergent') || isDone(year, 'lawn-mar-preemergent-early');
    if (!pre && m.soil5 >= 55) {
      A.push({ id: 'crab', level: 'high', icon: 'lawn', title: 'Crabgrass is germinating', text: `The 5-day soil average is ${f(m.soil5, 0)}°F at 2 in. Apply pre-emergent now. If you're late, dithiopyr (Dimension) also kills crabgrass that has just come up.`, href: 'calendar.html#/task/lawn-apr-preemergent' });
    } else if (!pre && m.soil5 >= 48) {
      A.push({ id: 'crab-soon', level: 'med', icon: 'lawn', title: 'Crabgrass preventer window is open', text: `Soil is ${f(m.soil5, 0)}°F and warming. Crabgrass starts once soil holds near 55°F. Apply this week, or when redbuds reach full bloom.`, href: 'calendar.html#/task/lawn-apr-preemergent' });
    } else if (pre && m.soil5 >= 50) {
      A.push({ id: 'crab-ok', level: 'good', icon: 'check', title: 'Crabgrass preventer is down', text: 'Nice timing. Water it in with ¼ in if you haven\'t, and skip seeding in treated areas.' });
    }
  }

  // 5. Frost / freeze
  if ((within(301, 531) || within(901, 1130)) && m.minLo && m.minLo.lo != null) {
    const spring = md < 700;
    const lo = Math.round(m.minLo.lo);
    if (lo <= 28) {
      A.push({ id: 'freeze', level: 'high', icon: 'snow', title: `Hard freeze ${dayName(m.minLo)} (${lo}°F)`, text: spring ? 'Cover or bring in tender transplants; even cool-season seedlings may need row cover. Water plants the day before (moist soil holds heat).' : 'Harvest tomatoes, peppers, basil, squash and green beans before it hits. Unhook and drain hoses and shut off outdoor faucets.' , href: spring ? 'garden.html' : 'calendar.html#/month/11' });
    } else if (lo <= 33) {
      A.push({ id: 'frost', level: 'high', icon: 'snow', title: `Frost likely ${dayName(m.minLo)} (${lo}°F)`, text: spring ? 'Cover tender plants overnight with row cover or sheets (not plastic touching leaves), and bring in pots.' : 'Pick ripe tender crops or cover them. Frost ends tomatoes, peppers, basil and squash.' });
    } else if (lo <= 36) {
      A.push({ id: 'frost-maybe', level: 'med', icon: 'snow', title: `Frost possible in low spots ${dayName(m.minLo)} (${lo}°F)`, text: 'Clear, calm nights can frost low areas even when the forecast low is in the mid-30s. Cover tender plants to be safe.' });
    }
  }

  // 6. Warm-season planting
  if (within(425, 615) && m.soil5 != null) {
    const cold = m.minLo && m.minLo.lo < 48;
    if (m.soil5 >= 60 && !cold) {
      A.push({ id: 'plant-warm', level: 'good', icon: 'veg', title: 'Warm-season planting weather', text: `Soil ${f(m.soil5, 0)}°F with no cold nights ahead. Tomatoes and peppers can go out; melons, squash and okra do best once soil reaches 65°F.`, href: 'garden.html' });
    } else if (md <= 531) {
      A.push({ id: 'plant-wait', level: 'info', icon: 'thermo', title: `Soil is still cool (${f(m.soil5, 0)}°F)`, text: `Tomatoes want soil of 60°F or more, and peppers, melons and okra 65°F or more.${cold ? ` A ${Math.round(m.minLo.lo)}°F night is coming ${dayName(m.minLo)}.` : ''} Keep hardening off transplants.`, href: 'garden.html' });
    }
  }

  // 7. Fall seeding weather
  if (within(820, 1015) && m.seedDays == null) {
    const maxHi5 = Math.max(...future.slice(0, 5).map((x) => x.hi ?? 0));
    if (m.rainNext5 >= 0.25 && maxHi5 <= 90) {
      A.push({ id: 'seed-window', level: 'good', icon: 'seed', title: 'Good week to seed', text: `About ${f(m.rainNext5, 2)} in of rain is forecast in the next 5 days. Seed just before it arrives so the rain does the watering.`, href: 'calendar.html#/task/lawn-sep-overseed' });
    }
  }

  // 8. Broadleaf spray window
  if (within(915, 1120) || within(401, 520)) {
    const cand = [todayRow, future[0]].filter(Boolean);
    for (let i = 0; i < cand.length; i++) {
      const dday = cand[i];
      const nextRain = (i === 0 ? future[0]?.rain : future[1]?.rain) || 0;
      if (dday.hi >= 55 && dday.hi <= 88 && (dday.rain || 0) < 0.05 && nextRain < 0.1 && (dday.wind ?? 0) <= 12) {
        A.push({ id: 'spray', level: 'good', icon: 'spray', title: `Good spray day for broadleaf weeds: ${dayName(dday)}`, text: 'At least 50°F, dry for the next 24 hours, and a light wind. Don\'t spray new seedings until they\'ve been mowed 3 times.', href: 'lawn.html#weeds' });
        break;
      }
    }
  }

  // 9. Heat
  if (m.maxHi && m.maxHi.hi >= 95) {
    A.push({ id: 'heat', level: 'med', icon: 'flame', title: `Heat: ${Math.round(m.maxHi.hi)}°F ${dayName(m.maxHi)}`, text: 'Skip mowing in the heat of the day and hold off on herbicides and fertilizer. Water vegetables deeply at the base in the morning, and keep mulch topped up.' });
  }

  // 10. Soggy soils
  if (m.wet3 >= 1.5) {
    A.push({ id: 'wet', level: 'info', icon: 'rain', title: `Soggy soil (${f(m.wet3, 1)} in of rain in 3 days)`, text: 'Stay off wet clay to avoid compaction, and don\'t till until a squeezed handful crumbles. Within a week, dump standing water to stop mosquitoes.' });
  }

  // 11. Hot nights → tomato blossom drop
  if (within(615, 831) && m.hotNightsNext5 >= 2) {
    A.push({ id: 'tomato-nights', level: 'info', icon: 'veg', title: 'Hot nights: tomatoes may drop blossoms', text: 'This is normal in KC summers. Keep plants watered and mulched; they set fruit again when nights cool in September.' });
  }

  // 12. Garlic & bulbs
  if (within(1001, 1120) && m.soil5 != null && m.soil5 <= 60) {
    A.push({ id: 'garlic', level: 'good', icon: 'sprout', title: 'Soil is cool enough for garlic & bulbs', text: `Soil is ${f(m.soil5, 0)}°F. Plant garlic cloves 2–3 in deep and tulips or daffodils 6–8 in deep.`, href: 'calendar.html#/task/veg-oct-garlic' });
  }

  const rank = { high: 0, med: 1, good: 2, info: 3 };
  return A.sort((a, b) => rank[a.level] - rank[b.level]);
}
