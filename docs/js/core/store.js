// Versioned localStorage envelope. Everything the user creates lives here:
// settings, task completions (keyed "year:taskId"), notes, journal (including
// rain-gauge readings), garden plan and shopping list. Nothing leaves the device.

const KEY = 'kcAlmanac.v1';
const VERSION = 1;

export const DEFAULT_LOCATION = { name: 'Kansas City, MO', lat: 39.0997, lon: -94.5786 };

export const DEFAULT_SETTINGS = {
  lawnSqFt: 5000,
  bedSqFt: 300,
  vegSqFt: 128,
  region: 'central',          // central | north | custom
  lastFrost: '04-15',         // used when region === 'custom'
  firstFrost: '10-25',
  location: { ...DEFAULT_LOCATION },
  hoseTimer: false,           // owns a hose-end sprinkler + timer
  sprinklerRate: null,        // in/hr from the tuna-can test (Tools)
  nTarget: 3,                 // lb N per 1,000 sq ft per year
  preferOrganic: false,
  showOptional: true,
  weather: true,
  theme: 'auto',              // auto | light | dark
};

function defaults() {
  return {
    v: VERSION,
    createdAt: new Date().toISOString(),
    settings: structuredCloneSafe(DEFAULT_SETTINGS),
    done: {},        // "2026:lawn-sep-overseed" -> { at: ISO }
    notes: {},       // taskId -> text
    journal: [],     // { id, date, cat, type, title, notes, n, inches, product, crop, amount, unit, ... }
    garden: { starred: [], beds: [], plan: {}, seedStarted: {} },
    custom: [],      // user-added tasks
    shopping: {},    // productId -> quantity
  };
}

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

function migrate(s) {
  const d = defaults();
  if (!s || typeof s !== 'object') return d;
  const out = { ...d, ...s };
  out.settings = { ...d.settings, ...(s.settings || {}) };
  out.settings.location = { ...d.settings.location, ...((s.settings || {}).location || {}) };
  out.garden = { ...d.garden, ...(s.garden || {}) };
  for (const k of ['done', 'notes', 'shopping']) if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {};
  for (const k of ['journal', 'custom']) if (!Array.isArray(out[k])) out[k] = [];
  out.v = VERSION;
  return out;
}

let memoryOnly = false;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : defaults();
  } catch (e) {
    memoryOnly = true;
    return defaults();
  }
}

let state = read();
const subs = new Set();

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    memoryOnly = false;
  } catch (e) {
    memoryOnly = true;
  }
}

function emit(reason) {
  for (const fn of subs) {
    try { fn(state, reason); } catch (e) { console.error(e); }
  }
}

window.addEventListener('storage', (e) => {
  if (e.key === KEY) { state = read(); emit('sync'); }
});

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const store = {
  get state() { return state; },
  get settings() { return state.settings; },
  get memoryOnly() { return memoryOnly; },
  update(fn, reason = 'update') { fn(state); write(); emit(reason); },
  setSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    write();
    emit('settings');
  },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  replaceAll(obj) { state = migrate(obj); write(); emit('replace'); },
  mergeIn(obj) {
    const inc = migrate(obj);
    state.done = { ...inc.done, ...state.done };
    state.notes = { ...inc.notes, ...state.notes };
    const seen = new Set(state.journal.map((j) => j.id));
    state.journal = state.journal.concat(inc.journal.filter((j) => !seen.has(j.id)));
    const seenC = new Set(state.custom.map((c) => c.id));
    state.custom = state.custom.concat(inc.custom.filter((c) => !seenC.has(c.id)));
    state.garden.starred = Array.from(new Set([...state.garden.starred, ...inc.garden.starred]));
    write();
    emit('replace');
  },
  reset() { state = defaults(); write(); emit('replace'); },
  exportJSON() {
    return JSON.stringify({ app: 'kc-lawn-garden-almanac', exportedAt: new Date().toISOString(), ...state }, null, 2);
  },
};

/* ---- task completion ---- */
export const doneKey = (year, id) => `${year}:${id}`;
export const isDone = (year, id) => !!state.done[doneKey(year, id)];
export const doneInfo = (year, id) => state.done[doneKey(year, id)] || null;
export function setDone(year, id, value) {
  store.update((s) => {
    const k = doneKey(year, id);
    if (value) s.done[k] = { at: new Date().toISOString() };
    else delete s.done[k];
  }, 'done');
}

/* ---- journal ---- */
export function addJournal(entry) {
  const e = { id: uid(), createdAt: new Date().toISOString(), ...entry };
  store.update((s) => { s.journal.push(e); }, 'journal');
  return e;
}
export function updateJournal(id, patch) {
  store.update((s) => {
    const e = s.journal.find((j) => j.id === id);
    if (e) Object.assign(e, patch);
  }, 'journal');
}
export function removeJournal(id) {
  store.update((s) => { s.journal = s.journal.filter((j) => j.id !== id); }, 'journal');
}
