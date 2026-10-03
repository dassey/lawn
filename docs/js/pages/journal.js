// Journal: everything you did (entries + checked-off tasks), yearly totals,
// and backup / restore / CSV export of all data kept in this browser.
import { mountChrome, setTitle, loadingBlock, errorBlock, toast, confirmDialog } from '../core/ui.js';
import { html, raw, render, $, $$, on, fmtNum, download, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { loadData, byId } from '../core/data.js';
import { store, removeJournal } from '../core/store.js';
import { today, monthName, fromISO, fmtDate, toISO } from '../core/dates.js';
import { openLogDialog, LOG_TYPES, LOG_TYPE, LOG_CATS } from '../core/logdlg.js';
import { nitrogenForYear, CATS } from '../core/tasks.js';

mountChrome('journal');
setTitle('Yard journal');
const app = $('#app');
render(app, loadingBlock('Loading your journal…'));

const NOW = today();
let D, T, P, C;
const f = { year: NOW.getFullYear(), cat: 'all', type: 'all', q: '', showTasks: true };

async function main() {
  D = await loadData('tasks', 'products', 'crops');
  T = byId(D.tasks);
  P = byId(D.products);
  C = byId(D.crops);
  render(app, html`
    <section class="page-head">
      <span class="eyebrow">Your record</span>
      <h1>Yard journal</h1>
      <p class="lede">Log what you did and what happened: fertilizer (it feeds the nitrogen tracker), seeding, sprays, rain-gauge readings (they feed the drought alerts), harvests and soil tests. Checked-off tasks show up here too.</p>
      <div class="btn-group" style="margin-top:14px">
        <button type="button" class="btn btn-primary" data-new="note">${icon('plus')}New entry</button>
        <button type="button" class="btn" data-new="mow">${icon('mower')}Mowed</button>
        <button type="button" class="btn" data-new="fertilize">${icon('sprout')}Fertilized</button>
        <button type="button" class="btn" data-new="rain">${icon('rain')}Rain gauge</button>
        <button type="button" class="btn" data-new="harvest">${icon('basket')}Harvest</button>
      </div>
    </section>
    <section class="section" id="summary"></section>
    <section class="section">
      <div class="toolbar" id="jbar"></div>
      <div id="jlist"></div>
    </section>
    <section class="section" id="data">
      <div class="section-head"><h2>Backup, restore &amp; export</h2></div>
      <div class="grid-2">
        <article class="card">
          <h3>${icon('shield')}Your data lives in this browser</h3>
          <p>Checkmarks, notes, journal entries, beds, settings and your shopping list are saved in this browser's local storage. Nothing is uploaded. Clearing site data, private windows and switching devices all start fresh, so <strong>download a backup</strong> now and then.</p>
          <p class="subtle" id="usage"></p>
          <div class="btn-group">
            <button type="button" class="btn btn-primary" data-export>${icon('download')}Download backup (.json)</button>
            <button type="button" class="btn" data-csv>${icon('download')}Journal as CSV</button>
          </div>
        </article>
        <article class="card">
          <h3>${icon('upload')}Restore or move to another device</h3>
          <p>Pick a backup file. <strong>Merge</strong> adds anything missing and keeps what's here; <strong>Replace</strong> swaps everything for the backup.</p>
          <div class="field"><label for="imp-file">Backup file</label><input id="imp-file" type="file" accept="application/json,.json"></div>
          <div class="btn-group" style="margin-top:10px">
            <button type="button" class="btn" data-import="merge">${icon('upload')}Merge</button>
            <button type="button" class="btn btn-danger" data-import="replace">Replace</button>
          </div>
          <hr>
          <button type="button" class="btn btn-sm btn-danger" data-reset>${icon('trash')}Erase everything in this browser</button>
        </article>
      </div>
    </section>`);

  on(app, 'click', '[data-new]', (e, b) => openLogDialog({ type: b.dataset.new, cat: LOG_TYPE[b.dataset.new]?.cat || 'lawn' }));
  on(app, 'click', '[data-edit]', (e, b) => {
    const entry = store.state.journal.find((j) => j.id === b.dataset.edit);
    if (entry) openLogDialog({ ...entry });
  });
  on(app, 'click', '[data-del]', async (e, b) => {
    const entry = store.state.journal.find((j) => j.id === b.dataset.del);
    if (!entry) return;
    removeJournal(entry.id);
    toast('Entry deleted', { action: { label: 'Undo', fn: () => store.update((s) => { s.journal.push(entry); }, 'journal') } });
  });
  on(app, 'change', '#jf-year', (e, el) => { f.year = Number(el.value); draw(); });
  on(app, 'change', '#jf-type', (e, el) => { f.type = el.value; drawList(); });
  on(app, 'click', '[data-jcat]', (e, b) => { f.cat = b.dataset.jcat; drawBar(); drawList(); });
  on(app, 'change', '#jf-tasks', (e, el) => { f.showTasks = el.checked; drawList(); });
  on(app, 'input', '#jf-q', debounce((e) => { f.q = e.target.value; drawList(); }, 150));

  on(app, 'click', '[data-export]', () => {
    download(`kc-lawn-almanac-backup-${toISO(new Date())}.json`, store.exportJSON(), 'application/json');
    toast('Backup downloaded');
  });
  on(app, 'click', '[data-csv]', () => {
    const rows = [['date', 'area', 'type', 'title', 'notes', 'lb_N_per_1000', 'inches', 'product', 'crop', 'amount', 'unit', 'cost']];
    for (const j of store.state.journal.slice().sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([j.date, j.cat, j.type, j.title, j.notes, j.n, j.inches, P[j.product]?.name || j.product, C[j.crop]?.name || j.crop, j.amount, j.unit, j.cost]);
    }
    const csv = rows.map((r) => r.map((v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`)).join(',')).join('\n');
    download(`yard-journal-${toISO(new Date())}.csv`, csv, 'text/csv');
  });
  on(app, 'click', '[data-import]', async (e, b) => {
    const file = $('#imp-file').files[0];
    if (!file) { toast('Choose a backup file first'); return; }
    try {
      const obj = JSON.parse(await file.text());
      if (!obj || typeof obj !== 'object' || !('journal' in obj || 'done' in obj || 'settings' in obj)) throw new Error('Not an almanac backup');
      if (b.dataset.import === 'replace') {
        if (!(await confirmDialog('Replace everything in this browser with the backup?', { ok: 'Replace', danger: true }))) return;
        store.replaceAll(obj);
      } else store.mergeIn(obj);
      toast('Backup restored');
    } catch (err) {
      toast(`Couldn't read that file: ${err.message}`);
    }
  });
  on(app, 'click', '[data-reset]', async () => {
    if (!(await confirmDialog('Erase all checkmarks, notes, journal entries, beds and settings in this browser? Download a backup first if you might want them.', { ok: 'Erase everything', danger: true }))) return;
    store.reset();
    toast('Everything was erased');
  });

  store.subscribe((s, r) => { if (r !== 'note') draw(); });
  document.addEventListener('journal-changed', draw);
  draw();
  if (location.hash === '#data') setTimeout(() => $('#data').scrollIntoView({ behavior: 'smooth' }), 60);
}

function draw() { drawSummary(); drawBar(); drawList(); drawUsage(); }

function yearEntries() {
  return store.state.journal.filter((j) => String(j.date).startsWith(String(f.year)));
}

function drawSummary() {
  const es = yearEntries();
  const sum = (type, k) => es.filter((j) => j.type === type).reduce((a, j) => a + (Number(j[k]) || 0), 0);
  const nit = nitrogenForYear(f.year, D.tasks);
  const done = Object.keys(store.state.done).filter((k) => k.startsWith(`${f.year}:`)).length;
  const harvestLb = es.filter((j) => j.type === 'harvest' && (j.unit || 'lb') === 'lb').reduce((a, j) => a + (Number(j.amount) || 0), 0);
  const spent = sum('buy', 'cost');
  const mows = es.filter((j) => j.type === 'mow').length;
  render($('#summary'), html`<div class="section-head"><h2>${f.year} at a glance</h2></div>
    <div class="grid-auto-sm">
      <div class="stat"><span class="stat-label">Tasks done</span><span class="stat-value">${done}</span></div>
      <div class="stat"><span class="stat-label">Lawn nitrogen</span><span class="stat-value">${fmtNum(nit.n, 2)}<small> lb/1,000</small></span><span class="stat-note">Target ${store.settings.nTarget}</span></div>
      <div class="stat"><span class="stat-label">Rain (gauge)</span><span class="stat-value">${fmtNum(sum('rain', 'inches'), 2)}<small> in</small></span><span class="stat-note">${es.filter((j) => j.type === 'rain').length} readings</span></div>
      <div class="stat"><span class="stat-label">Watering</span><span class="stat-value">${fmtNum(sum('water', 'inches'), 2)}<small> in</small></span></div>
      <div class="stat"><span class="stat-label">Mowings</span><span class="stat-value">${mows}</span></div>
      <div class="stat"><span class="stat-label">Harvest</span><span class="stat-value">${fmtNum(harvestLb, 1)}<small> lb</small></span><span class="stat-note"><a href="garden.html#/harvest">By crop</a></span></div>
      <div class="stat"><span class="stat-label">Spent</span><span class="stat-value">$${fmtNum(spent, 0)}</span><span class="stat-note">Logged purchases</span></div>
    </div>`);
}

function drawBar() {
  const years = [...new Set(store.state.journal.map((j) => Number(String(j.date).slice(0, 4))).concat(Object.keys(store.state.done).map((k) => Number(k.split(':')[0]))).concat([NOW.getFullYear()]))].filter(Boolean).sort((a, b) => b - a);
  render($('#jbar'), html`
    <div class="toolbar-row">
      <select id="jf-year" style="width:auto" aria-label="Year">${years.map((y) => html`<option ${y === f.year ? raw('selected') : ''}>${y}</option>`)}</select>
      <div class="chips"><button type="button" class="chip" data-jcat="all" aria-pressed="${String(f.cat === 'all')}">All areas</button>${LOG_CATS.map(([k, l]) => html`<button type="button" class="chip cat-${k}" data-jcat="${k}" aria-pressed="${String(f.cat === k)}"><span class="dot"></span>${l}</button>`)}</div>
    </div>
    <div class="toolbar-row">
      <select id="jf-type" style="width:auto" aria-label="Entry type"><option value="all">All kinds</option>${LOG_TYPES.map((t) => html`<option value="${t.id}" ${f.type === t.id ? raw('selected') : ''}>${t.label}</option>`)}</select>
      <div class="search-input" style="flex:1;min-width:180px">${icon('search')}<input type="search" id="jf-q" value="${f.q}" placeholder="Search notes…" aria-label="Search journal"></div>
      <label class="switch"><input type="checkbox" id="jf-tasks" ${f.showTasks ? raw('checked') : ''}><span class="track"></span>Include checked-off tasks</label>
    </div>`);
}

function drawList() {
  const q = f.q.trim().toLowerCase();
  let items = yearEntries().map((j) => ({ kind: 'entry', date: j.date, j }));
  if (f.showTasks && (f.type === 'all' || f.type === 'task')) {
    for (const [k, v] of Object.entries(store.state.done)) {
      const [y, id] = k.split(':');
      if (Number(y) !== f.year) continue;
      const t = T[id] || (store.state.custom || []).find((c) => c.id === id);
      if (!t) continue;
      items.push({ kind: 'task', date: String(v.at).slice(0, 10), t });
    }
  }
  items = items.filter((it) => {
    const cat = it.kind === 'entry' ? it.j.cat : it.t.category;
    if (f.cat !== 'all' && cat !== f.cat) return false;
    if (it.kind === 'entry' && f.type !== 'all' && it.j.type !== f.type) return false;
    if (q) {
      const txt = it.kind === 'entry' ? [it.j.title, it.j.notes, P[it.j.product]?.name, C[it.j.crop]?.name].join(' ') : it.t.title;
      if (!txt.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  if (!items.length) {
    render($('#jlist'), html`<div class="empty">${icon('journal')}<p>Nothing logged ${f.year === NOW.getFullYear() ? 'yet this year' : `for ${f.year}`}. Use the buttons above, or "Log it" on any task.</p></div>`);
    return;
  }
  const byMonth = {};
  for (const it of items) (byMonth[it.date.slice(0, 7)] ||= []).push(it);
  render($('#jlist'), html`${Object.entries(byMonth).map(([ym, list]) => html`<article class="card" style="margin-bottom:14px">
    <h3 style="margin:0 0 4px">${monthName(Number(ym.slice(5, 7)))} ${ym.slice(0, 4)} <span class="subtle">· ${list.length}</span></h3>
    ${list.map((it) => (it.kind === 'entry' ? entryRow(it.j) : taskRow(it)))}
  </article>`)}`);
}

function entryRow(j) {
  const t = LOG_TYPE[j.type] || LOG_TYPE.note;
  const d = fromISO(j.date);
  const meta = [];
  if (j.n) meta.push(html`<span class="badge badge-recommended">${fmtNum(Number(j.n), 2)} lb N/1,000</span>`);
  if (j.inches != null) meta.push(html`<span class="badge badge-water">${fmtNum(Number(j.inches), 2)} in</span>`);
  if (j.height) meta.push(html`<span class="badge">${j.height} in cut</span>`);
  if (j.product && P[j.product]) meta.push(html`<a class="badge badge-outline" href="products.html#p-${j.product}">${P[j.product].name}</a>`);
  if (j.crop && C[j.crop]) meta.push(html`<span class="badge badge-outline">${C[j.crop].name}</span>`);
  if (j.amount) meta.push(html`<span class="badge">${fmtNum(Number(j.amount), 2)} ${j.unit || ''}</span>`);
  if (j.cost) meta.push(html`<span class="badge">$${fmtNum(Number(j.cost), 2)}</span>`);
  if (j.type === 'soil') meta.push(html`<span class="badge">pH ${j.ph ?? '—'} · P ${j.p ?? '—'} · K ${j.k ?? '—'} · OM ${j.om ?? '—'}%</span>`);
  if (j.taskId && T[j.taskId]) meta.push(html`<a class="badge badge-outline" href="calendar.html#/task/${j.taskId}">task</a>`);
  return html`<div class="journal-entry cat-${j.cat || 'lawn'}">
    <div class="je-date">${fmtDate(d, { month: 'short', day: 'numeric' })}<small>${fmtDate(d, { weekday: 'short' })}</small></div>
    <div>
      <div class="je-title" style="display:flex;gap:6px;align-items:center"><span style="color:var(--c)">${icon(t.icon)}</span>${j.title || t.label}</div>
      ${j.notes ? html`<div class="je-notes">${j.notes}</div>` : ''}
      ${meta.length ? html`<div class="je-meta">${meta}</div>` : ''}
    </div>
    <div class="row" style="flex-wrap:nowrap;gap:2px">
      <button type="button" class="icon-btn" data-edit="${j.id}" aria-label="Edit entry">${icon('edit')}</button>
      <button type="button" class="icon-btn" data-del="${j.id}" aria-label="Delete entry">${icon('trash')}</button>
    </div>
  </div>`;
}

function taskRow(it) {
  const d = fromISO(it.date);
  const cat = CATS[it.t.category] || CATS.yard;
  return html`<div class="journal-entry cat-${cat.id}">
    <div class="je-date">${fmtDate(d, { month: 'short', day: 'numeric' })}<small>${fmtDate(d, { weekday: 'short' })}</small></div>
    <div><div class="je-title" style="display:flex;gap:6px;align-items:center"><span style="color:var(--ok)">${icon('check')}</span><a href="calendar.html#/task/${it.t.id}">${it.t.title}</a></div>
      ${store.state.notes[it.t.id] ? html`<div class="je-notes">${store.state.notes[it.t.id]}</div>` : ''}
      <div class="je-meta"><span class="badge badge-cat">${cat.label}</span><span class="badge">task</span></div></div>
    <div></div>
  </div>`;
}

function drawUsage() {
  let bytes = 0;
  try { bytes = (localStorage.getItem('kcAlmanac.v1') || '').length * 2; } catch { /* ignore */ }
  render($('#usage'), html`${store.state.journal.length} journal entries · ${Object.keys(store.state.done).length} checkmarks · about ${fmtNum(bytes / 1024, 0)} KB stored.${store.memoryOnly ? ' ⚠ Storage is blocked in this browser, so nothing will be kept after you close the tab.' : ''}`);
}

main().catch((err) => { console.error(err); render(app, errorBlock(err)); });
