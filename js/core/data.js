// Loads the JSON data files once per page. Bump DATA_VERSION when data changes
// so browsers (and the service worker) pick up fresh copies.
export const DATA_VERSION = '2026-09-29';

const cache = new Map();

export function loadJSON(name) {
  if (!cache.has(name)) {
    const p = fetch(`data/${name}.json?v=${DATA_VERSION}`).then((r) => {
      if (!r.ok) throw new Error(`Could not load data/${name}.json (HTTP ${r.status})`);
      return r.json();
    });
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
