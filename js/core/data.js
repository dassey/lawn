// Loads the JSON data files once per page. Bump DATA_VERSION when data changes
// so browsers (and the service worker) pick up fresh copies.
//
// loadJSON also fits the data to the visitor: dates written into the prose
// move to the local calendar, and lawn content follows their grass type.
import { store } from './store.js';
import { localizeData } from './windows.js';
import { grassMatch, grassId, isWarm } from './grass.js';

export const DATA_VERSION = '2026-11-11';

const rawCache = new Map();
const cache = new Map();

/** The file exactly as stored. */
export function loadRaw(name) {
  if (!rawCache.has(name)) {
    const p = fetch(`data/${name}.json?v=${DATA_VERSION}`).then((r) => {
      if (!r.ok) throw new Error(`Could not load data/${name}.json (HTTP ${r.status})`);
      return r.json();
    });
    rawCache.set(name, p);
    p.catch(() => rawCache.delete(name));
  }
  return rawCache.get(name);
}

const clone = (o) => JSON.parse(JSON.stringify(o));

async function prepare(name) {
  const s = store.settings;
  const local = s.region === 'local' ? s.local : null;
  let data;
  if (name === 'tasks') {
    const [base, warm] = await Promise.all([loadRaw('tasks'), loadRaw('tasks-warm')]);
    const grass = grassId(s);
    data = clone(base.concat(warm))
      .filter((t) => grassMatch(t.grass, s))
      .filter((t) => !(t.cold && local && !local.cold));
    for (const t of data) if (t.nitrogenBy && t.nitrogenBy[grass] != null) t.nitrogen = t.nitrogenBy[grass];
  } else if (name === 'lawn') {
    data = clone(await loadRaw(isWarm(s) ? 'lawn-warm' : 'lawn'));
  } else if (name === 'issues') {
    const [base, warm] = await Promise.all([loadRaw('issues'), loadRaw('issues-warm')]);
    data = clone(base.concat(warm)).filter((i) => grassMatch(i.grass, s));
  } else if (name === 'products') {
    data = clone(await loadRaw(name)).filter((p) => grassMatch(p.grass, s));
  } else {
    data = clone(await loadRaw(name));
  }
  return name === 'climate' ? data : localizeData(data, s);
}

export function loadJSON(name) {
  if (!cache.has(name)) {
    const p = prepare(name);
    cache.set(name, p);
    p.catch(() => cache.delete(name));
  }
  return cache.get(name);
}

export async function loadData(...names) {
  const vals = await Promise.all(names.map(loadJSON));
  return Object.fromEntries(names.map((n, i) => [n, vals[i]]));
}

export const byId = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]));
