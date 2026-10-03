// Vegetable garden: Gantt timeline, crop cards, seed-starting schedule,
// bed rotation planner, harvest log and evidence-labeled tips.
import { mountChrome, setTitle, loadingBlock, errorBlock, toast, makeDialog } from '../core/ui.js';
import { html, raw, md, render, $, $$, on, fmtNum, debounce, hashParts } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { loadData, byId } from '../core/data.js';
import { store, uid } from '../core/store.js';
import { today, MON, monthName, fromMMDD, fmtMMDD, addDays, toISO, fmtDate, diffDays, doyMMDD, doy, mmdd, fromISO } from '../core/dates.js';
import { cropWindow, cropHarvestWindow } from '../core/windows.js';
import { sourceItems, EVIDENCE } from '../core/tasks.js';
import { downloadICS, simpleEvents } from '../core/ics.js';
import { openLogDialog } from '../core/logdlg.js';
import { barChart } from '../core/charts.js';

mountChrome('garden');
setTitle('Vegetable garden');
const app = $('#app');
render(app, loadingBlock('Loading the garden planner…'));

const NOW = today();
const YEAR = NOW.getFullYear();
let D, C, S, P, FAM;
const TABS = [
  ['timeline', 'Timeline', 'calendar'],
  ['crops', 'Crops & varieties', 'veg'],
  ['seeds', 'Seed starting', 'sprout'],
  ['beds', 'Beds & rotation', 'grid'],
  ['harvest', 'Harvest log', 'basket'],
  ['tips', 'Tips & pests', 'bug'],
];
const ui = { tab: 'timeline', filter: 'all', q: '', harvestYear: YEAR };

const starred = () => new Set(store.state.garden.starred || []);
const toggleStar = (id) => store.update((s) => {
  const set = new Set(s.garden.starred || []);
  if (set.has(id)) set.delete(id); else set.add(id);
  s.garden.starred = [...set];
}, 'garden');

function cropMatches(c) {
  const f = ui.filter;
  const q = ui.q.trim().toLowerCase();
  if (f === 'mine' && !starred().has(c.id)) return false;
  if (['cool', 'warm', 'perennial', 'herb'].includes(f) && c.season !== f) return false;
  if (q && ![c.name, (c.aka || []).join(' '), c.family, (c.varieties || []).map((v) => v.name).join(' ')].join(' ').toLowerCase().includes(q)) return false;
  return true;
}

function route() {
  const [kind, arg] = hashParts();
  if (kind && TABS.some(([t]) => t === kind)) ui.tab = kind;
  if (kind === 'crop' && arg) { ui.tab = 'crops'; ui.filter = 'all'; ui.q = ''; return arg; }
  return null;
}

async function main() {
  D = await loadData('crops', 'garden', 'sources', 'products');
  C = byId(D.crops);
  S = byId(D.sources);
  P = byId(D.products);
  FAM = byId(D.garden.families);
  const target = route();
  shell();
  draw();
  if (target) setTimeout(() => focusCrop(target), 60);
  window.addEventListener('hashchange', () => { const t = route(); draw(); if (t) setTimeout(() => focusCrop(t), 60); });
  store.subscribe((s, reason) => { if (['garden', 'settings', 'replace', 'sync', 'journal'].includes(reason)) draw(); });
  document.addEventListener('settings-closed', draw);
}

function shell() {
  const s = store.settings;
  render(app, html`
    <section class="page-head">
      <span class="eyebrow">Vegetable garden · MU planting calendar</span>
      <h1>Veggie garden planner</h1>
      <p class="lede">What grows well around Kansas City, when to plant it, which varieties hold up to our heat and clay, and how to rotate beds. Dates follow University of Missouri Extension (G6201).</p>
    </section>
    <div class="toolbar" style="margin-top:12px">
      <div class="toolbar-row">
        <span class="toolbar-label">Dates</span>
        <div class="seg" role="group" aria-label="Planting dates" id="region-seg"></div>
        <span class="subtle" id="region-note"></span>
      </div>
    </div>
    <div class="tabs" role="tablist" aria-label="Garden sections">${TABS.map(([id, label, ic]) => html`<button type="button" class="tab" role="tab" data-tab="${id}" aria-selected="${String(ui.tab === id)}">${icon(ic)}${label}</button>`)}</div>
    <div id="panel" role="tabpanel"></div>`);

  on(app, 'click', '[data-tab]', (e, b) => { ui.tab = b.dataset.tab; history.replaceState(null, '', `#/${ui.tab}`); draw(); });
  on(app, 'click', '[data-region]', (e, b) => {
    if (b.dataset.region === 'custom' && store.settings.region !== 'custom') {
      store.setSettings({ region: 'custom' });
      import('../core/ui.js').then((m) => m.openSettings());
      return;
    }
    store.setSettings({ region: b.dataset.region });
  });
  on(app, 'click', '[data-filter]', (e, b) => { ui.filter = b.dataset.filter; draw(); });
  on(app, 'input', '[data-cq]', debounce((e) => { ui.q = e.target.value; drawPanelBody(); }, 150));
  on(app, 'click', '[data-star]', (e, b) => { e.preventDefault(); toggleStar(b.dataset.star); });
  on(app, 'click', '[data-goto-crop]', (e, b) => { e.preventDefault(); location.hash = `#/crop/${b.dataset.gotoCrop}`; });
  on(app, 'click', '[data-log-plant]', (e, b) => openLogDialog({ type: 'plant', cat: 'veg', crop: b.dataset.logPlant, title: `Planted ${C[b.dataset.logPlant]?.name || ''}` }));
  on(app, 'click', '[data-log-harvest]', (e, b) => openLogDialog({ type: 'harvest', cat: 'veg', crop: b.dataset.logHarvest || '', title: 'Harvest', unit: 'lb' }));
  on(app, 'click', '[data-ics-crop]', (e, b) => icsCrop(C[b.dataset.icsCrop]));
  on(app, 'click', '[data-ics-seeds]', () => icsSeeds());
  on(app, 'change', '[data-seed-done]', (e, el) => {
    store.update((s) => { if (el.checked) s.garden.seedStarted[el.dataset.seedDone] = toISO(new Date()); else delete s.garden.seedStarted[el.dataset.seedDone]; }, 'garden');
  });
  on(app, 'change', '[data-hyear]', (e, el) => { ui.harvestYear = Number(el.value); draw(); });
  wireBeds();
  wireTooltip();
}

function draw() {
  const s = store.settings;
  render($('#region-seg'), html`${[['central', 'MU Central (KC)'], ['north', 'MU North'], ['custom', 'My frost dates']].map(([v, l]) => html`<button type="button" data-region="${v}" aria-pressed="${String(s.region === v)}">${l}</button>`)}`);
  render($('#region-note'), s.region === 'custom' ? html`Last frost ${fmtMMDD(s.lastFrost)} · first frost ${fmtMMDD(s.firstFrost)} <button type="button" class="btn btn-sm btn-ghost" data-action="settings">Edit</button>` : s.region === 'north' ? 'Cautious dates, about a week later in spring.' : 'Best fit for the Kansas City metro.');
  $$('[data-tab]', app).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === ui.tab)));
  drawPanelBody();
}

function filterBar(extra = '') {
  const counts = { all: D.crops.length, mine: starred().size };
  for (const k of ['cool', 'warm', 'perennial', 'herb']) counts[k] = D.crops.filter((c) => c.season === k).length;
  const f = [['all', 'All'], ['mine', '★ My garden'], ['cool', 'Cool season'], ['warm', 'Warm season'], ['perennial', 'Perennial & fruit'], ['herb', 'Herbs']];
  return html`<div class="toolbar"><div class="toolbar-row">
    <div class="chips">${f.map(([k, l]) => html`<button type="button" class="chip" data-filter="${k}" aria-pressed="${String(ui.filter === k)}">${l}<span class="count">${counts[k]}</span></button>`)}</div>
    <div class="search-input" style="flex:1;min-width:180px">${icon('search')}<input type="search" data-cq placeholder="Search crops…" value="${ui.q}" aria-label="Search crops"></div>
    ${extra}
  </div></div>`;
}

function drawPanelBody() {
  const p = $('#panel');
  if (!p) return;
  const fn = { timeline: drawTimeline, crops: drawCrops, seeds: drawSeeds, beds: drawBeds, harvest: drawHarvest, tips: drawTips }[ui.tab];
  fn(p);
}

/* ---------------- Timeline (Gantt) ---------------- */
function bars(c) {
  const s = store.settings;
  const out = [];
  const sp = cropWindow(c, 'spring', s);
  const fa = cropWindow(c, 'fall', s);
  if (sp && c.indoor) {
    const a = addDays(fromMMDD(sp.start, 2001), -c.indoor.weeks[1] * 7);
    const b = addDays(fromMMDD(sp.start, 2001), -c.indoor.weeks[0] * 7);
    out.push({ cls: 'b-indoor', lane: 0, start: mmdd(a), end: mmdd(b), label: `Start seeds indoors (${c.indoor.weeks[0]}–${c.indoor.weeks[1]} weeks ahead)` });
  }
  if (sp) out.push({ cls: 'b-plant', lane: 0, start: sp.start, end: sp.end, label: `${c.spring.method || 'Plant'} outdoors` });
  if (fa && c.fall.indoorWeeks) {
    const a = addDays(fromMMDD(fa.start, 2001), -c.fall.indoorWeeks[1] * 7);
    const b = addDays(fromMMDD(fa.start, 2001), -c.fall.indoorWeeks[0] * 7);
    out.push({ cls: 'b-indoor', lane: 0, start: mmdd(a), end: mmdd(b), label: 'Start fall transplants' });
  }
  if (fa) out.push({ cls: 'b-fall', lane: 0, start: fa.start, end: fa.end, label: `Fall planting: ${c.fall.method || ''}` });
  for (const which of ['spring', 'fall']) {
    const h = cropHarvestWindow(c, which, s);
    if (h) out.push({ cls: 'b-harvest', lane: 1, start: h.start, end: h.end, label: `Harvest${which === 'fall' && c.spring ? ' (fall crop)' : ''}` });
  }
  return out;
}

function barEls(b, name) {
  const s = doyMMDD(b.start);
  let e = doyMMDD(b.end);
  const parts = e >= s ? [[s, e]] : [[s, 365], [1, e]];
  return parts.map(([a, z]) => {
    const left = ((a - 1) / 365) * 100;
    const width = Math.max(0.8, ((z - a + 1) / 365) * 100);
    return html`<button type="button" class="g-bar ${b.cls}" style="left:${left}%;width:${width}%;top:${b.lane ? 24 : 9}px" data-tip="${name}|${b.label}|${fmtMMDD(b.start)} – ${fmtMMDD(b.end)}" aria-label="${name}: ${b.label}, ${fmtMMDD(b.start)} to ${fmtMMDD(b.end)}"></button>`;
  });
}

function drawTimeline(p) {
  const list = D.crops.filter(cropMatches);
  const st = starred();
  const todayLeft = ((doy(NOW) - 1) / 365) * 100;
  render(p, html`
    ${filterBar()}
    <div class="g-legend">
      <span><i class="g-bar b-indoor" style="position:static;display:inline-block"></i>Start indoors</span>
      <span><i class="g-bar b-plant" style="position:static;display:inline-block"></i>Plant (spring)</span>
      <span><i class="g-bar b-fall" style="position:static;display:inline-block"></i>Plant (fall)</span>
      <span><i class="g-bar b-harvest" style="position:static;display:inline-block"></i>Harvest</span>
      <span><i class="lg-today"></i>Today</span>
    </div>
    ${list.length ? html`<div class="gantt-wrap"><div class="gantt">
      <div class="g-row g-head"><div class="g-name">Crop</div><div class="g-track"><div class="g-months">${MON.map((m) => html`<span>${m}</span>`)}</div><div class="g-today" style="left:${todayLeft}%" title="Today"></div></div></div>
      ${list.map((c) => html`<div class="g-row">
        <div class="g-name">${st.has(c.id) ? html`<span class="star">${icon('star')}</span>` : ''}<a href="#/crop/${c.id}" data-goto-crop="${c.id}" title="${c.name}">${c.name}</a></div>
        <div class="g-track">
          <div class="g-grid">${MON.map(() => html`<i></i>`)}</div>
          <div class="g-today" style="left:${todayLeft}%"></div>
          ${bars(c).map((b) => barEls(b, c.name))}
        </div>
      </div>`)}
    </div></div>` : html`<div class="empty">No crops match. ${ui.filter === 'mine' ? 'Star crops on the Crops tab to build your list.' : ''}</div>`}
    <p class="subtle" style="margin-top:10px">Tap a bar for exact dates. Windows are University of Missouri planting dates (G6201); harvest bars are typical. Seasons vary ±2 weeks, so watch soil temperature and the forecast (the Today page does this for you).</p>`);
}

function wireTooltip() {
  let tip = null;
  const show = (el) => {
    const [name, label, dates] = el.dataset.tip.split('|');
    if (!tip) { tip = document.createElement('div'); tip.className = 'g-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.innerHTML = '';
    const b = document.createElement('b'); b.textContent = name; tip.appendChild(b);
    tip.appendChild(document.createTextNode(`${label}: ${dates}`));
    const r = el.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - 290, Math.max(8, r.left))}px`;
    tip.style.top = `${r.bottom + 8}px`;
    tip.hidden = false;
  };
  const hide = () => { if (tip) tip.hidden = true; };
  on(app, 'mouseover', '[data-tip]', (e, el) => show(el));
  on(app, 'focusin', '[data-tip]', (e, el) => show(el));
  on(app, 'click', '[data-tip]', (e, el) => show(el));
  on(app, 'mouseout', '[data-tip]', hide);
  on(app, 'focusout', '[data-tip]', hide);
  window.addEventListener('scroll', hide, { passive: true });
}

/* ---------------- Crop cards ---------------- */
function windowText(c, which) {
  const w = cropWindow(c, which, store.settings);
  return w ? `${fmtMMDD(w.start)} – ${fmtMMDD(w.end)}` : '';
}

function cropCard(c) {
  const st = starred().has(c.id);
  const fam = FAM[c.family];
  return html`<article class="card item-card cat-veg" id="crop-${c.id}">
    <div class="ic-head">
      <h3>${c.name}</h3>
      <button type="button" class="icon-btn star-btn" data-star="${c.id}" aria-pressed="${String(st)}" aria-label="${st ? 'Remove from' : 'Add to'} my garden" title="${st ? 'In my garden' : 'Add to my garden'}">${icon('star')}</button>
    </div>
    <div class="tags">
      ${fam ? html`<span class="tag" style="border-color:${fam.color}"><span class="fam-dot" style="background:${fam.color}"></span> ${fam.name}</span>` : ''}
      <span class="tag">${{ cool: 'Cool season', warm: 'Warm season', perennial: 'Perennial', herb: 'Herb' }[c.season] || c.season}</span>
      ${c.difficulty ? html`<span class="tag">${c.difficulty}</span>` : ''}
    </div>
    ${c.kcNote ? html`<p style="margin:0">${md(c.kcNote)}</p>` : ''}
    <dl>
      ${c.spring ? html`<dt>Spring</dt><dd>${windowText(c, 'spring')} · ${c.spring.method}</dd>` : ''}
      ${c.fall ? html`<dt>Fall</dt><dd>${windowText(c, 'fall')} · ${c.fall.method}</dd>` : ''}
      ${c.indoor ? html`<dt>Start inside</dt><dd>${c.indoor.weeks[0]}–${c.indoor.weeks[1]} weeks before planting out</dd>` : ''}
      ${c.soilTemp ? html`<dt>Soil temp</dt><dd>${c.soilTemp}</dd>` : ''}
      ${c.spacing ? html`<dt>Spacing</dt><dd>${c.spacing}</dd>` : ''}
      ${c.depth ? html`<dt>Depth</dt><dd>${c.depth}</dd>` : ''}
      ${c.dtm ? html`<dt>To harvest</dt><dd>${c.dtm}</dd>` : ''}
    </dl>
    ${c.varieties && c.varieties.length ? html`<div><h4 style="margin:6px 0">Varieties that do well here</h4>
      <ul class="variety-list">${c.varieties.map((v) => html`<li>${v.pick ? html`<span title="Top pick" style="color:var(--veg)">★</span> ` : ''}<b>${v.name}</b>${v.note ? html` · <span class="muted">${v.note}</span>` : ''}</li>`)}</ul></div>` : ''}
    ${c.tips && c.tips.length ? html`<details class="acc"><summary>Growing tips</summary><div class="acc-body"><ul>${c.tips.map((t) => html`<li>${md(t)}</li>`)}</ul>
      ${c.harvestCue ? html`<p><strong>Harvest:</strong> ${md(c.harvestCue)}</p>` : ''}
      ${c.pests && c.pests.length ? html`<p><strong>Watch for:</strong> ${c.pests.join(', ')}</p>` : ''}
      ${c.sources ? sourceItems(c.sources, S) : ''}</div></details>` : ''}
    <div class="ic-foot">
      <button type="button" class="btn btn-sm" data-log-plant="${c.id}">${icon('shovel')}Log planting</button>
      <button type="button" class="btn btn-sm btn-ghost" data-ics-crop="${c.id}">${icon('calendar')}Reminders</button>
    </div>
  </article>`;
}

function drawCrops(p) {
  const list = D.crops.filter(cropMatches);
  render(p, html`${filterBar()}${list.length ? html`<div class="grid-auto">${list.map(cropCard)}</div>` : html`<div class="empty">No crops match.</div>`}`);
}

function focusCrop(id) {
  const el = document.getElementById(`crop-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.style.boxShadow = '0 0 0 3px var(--veg)';
  setTimeout(() => { el.style.boxShadow = ''; }, 2400);
}

function icsCrop(c) {
  if (!c) return;
  const items = [];
  const sp = cropWindow(c, 'spring', store.settings);
  const fa = cropWindow(c, 'fall', store.settings);
  if (sp && c.indoor) items.push({ uid: `${c.id}-indoor`, date: addDays(fromMMDD(sp.start, YEAR), -c.indoor.weeks[1] * 7), title: `Start ${c.name} seeds indoors`, desc: `Start ${c.indoor.weeks[0]}–${c.indoor.weeks[1]} weeks before the ${fmtMMDD(sp.start)} planting window.`, yearly: true });
  if (sp) items.push({ uid: `${c.id}-spring`, date: fromMMDD(sp.start, YEAR), title: `Plant ${c.name} (${fmtMMDD(sp.start)}–${fmtMMDD(sp.end)})`, desc: `${c.spring.method}. ${c.spacing ? 'Spacing: ' + c.spacing : ''}`, yearly: true });
  if (fa) items.push({ uid: `${c.id}-fall`, date: fromMMDD(fa.start, YEAR), title: `Fall planting: ${c.name} (${fmtMMDD(fa.start)}–${fmtMMDD(fa.end)})`, desc: c.fall.method, yearly: true });
  downloadICS(`${c.id}-reminders.ics`, simpleEvents(items), `${c.name} reminders`);
  toast(`${items.length} yearly reminder${items.length === 1 ? '' : 's'} exported`);
}

/* ---------------- Seed starting ---------------- */
function seedRows() {
  const rows = [];
  const s = store.settings;
  for (const c of D.crops) {
    const sp = cropWindow(c, 'spring', s);
    if (sp && c.indoor) {
      const a = addDays(fromMMDD(sp.start, YEAR), -c.indoor.weeks[1] * 7);
      const b = addDays(fromMMDD(sp.start, YEAR), -c.indoor.weeks[0] * 7);
      rows.push({ key: `${YEAR}:${c.id}:spring`, c, a, b, out: fromMMDD(sp.start, YEAR), note: c.indoor.note || '' });
    }
    const fa = cropWindow(c, 'fall', s);
    if (fa && c.fall.indoorWeeks) {
      const a = addDays(fromMMDD(fa.start, YEAR), -c.fall.indoorWeeks[1] * 7);
      const b = addDays(fromMMDD(fa.start, YEAR), -c.fall.indoorWeeks[0] * 7);
      rows.push({ key: `${YEAR}:${c.id}:fall`, c, a, b, out: fromMMDD(fa.start, YEAR), note: 'For fall transplants. Start in a bright, cool spot or under lights.', fall: true });
    }
  }
  return rows.sort((x, y) => x.a - y.a);
}

function drawSeeds(p) {
  const rows = seedRows();
  const mine = starred();
  const done = store.state.garden.seedStarted || {};
  const G = D.garden;
  render(p, html`
    <div class="layout-main">
      <div>
        <div class="row-between" style="margin-bottom:10px"><h2 style="margin:0">Seed-starting schedule · ${YEAR}</h2>
          <button type="button" class="btn btn-sm" data-ics-seeds>${icon('calendar')}Add to calendar</button></div>
        <p class="subtle">Counted back from ${store.settings.region === 'custom' ? 'your frost dates' : 'MU planting dates'}. ★ = in your garden list.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Done</th><th>Crop</th><th>Sow indoors</th><th>Plant out</th></tr></thead>
          <tbody>${rows.map((r) => {
            const status = NOW > r.b ? (done[r.key] ? '' : 'late') : NOW >= r.a ? 'now' : '';
            return html`<tr>
              <td><label class="check" style="margin:-10px"><input type="checkbox" data-seed-done="${r.key}" ${done[r.key] ? raw('checked') : ''} aria-label="Started ${r.c.name}"><span class="check-box">${icon('check')}</span></label></td>
              <td><strong>${mine.has(r.c.id) ? '★ ' : ''}${r.c.name}</strong>${r.fall ? html` <span class="tag">fall</span>` : ''}<br><span class="subtle">${r.note}</span></td>
              <td class="nowrap">${fmtDate(r.a)} – ${fmtDate(r.b)}${status === 'now' ? html` <span class="badge badge-recommended">now</span>` : status === 'late' ? html` <span class="badge badge-optional">passed</span>` : ''}</td>
              <td class="nowrap">${fmtDate(r.out)}</td>
            </tr>`;
          })}</tbody>
        </table></div>
      </div>
      <aside class="stack">
        <article class="card"><h3>${icon('sun')}Seed-starting setup</h3><ul class="list-check">${G.seedStart.tips.map((t) => html`<li>${md(t)}</li>`)}</ul></article>
        <article class="card"><h3>${icon('wind')}Hardening off (7–10 days)</h3><ol>${G.seedStart.hardenOff.map((t) => html`<li>${md(t)}</li>`)}</ol></article>
      </aside>
    </div>`);
}

function icsSeeds() {
  const rows = seedRows().filter((r) => starred().size === 0 || starred().has(r.c.id));
  downloadICS('seed-starting.ics', simpleEvents(rows.map((r) => ({ uid: `seed-${r.key.replace(/:/g, '-')}`, date: r.a, title: `Start ${r.c.name} seeds indoors`, desc: `Sow ${fmtDate(r.a)}–${fmtDate(r.b)}; plant out around ${fmtDate(r.out)}.`, yearly: true }))), 'Seed starting');
  toast(`${rows.length} seed-starting reminders exported${starred().size ? ' (your starred crops)' : ''}.`);
}

/* ---------------- Beds & rotation ---------------- */
const ROT_FAMS = new Set(['nightshade', 'cucurbit', 'brassica', 'allium', 'legume', 'umbel', 'goosefoot', 'grass', 'aster']);
function bedWarnings(bedId, year) {
  const plan = store.state.garden.plan || {};
  const here = new Set((plan[year]?.[bedId] || []).map((id) => C[id]?.family).filter((f) => f && ROT_FAMS.has(f)));
  const hits = [];
  for (const y of [year - 1, year - 2]) {
    for (const id of plan[y]?.[bedId] || []) {
      const f = C[id]?.family;
      if (f && here.has(f)) hits.push({ y, fam: FAM[f]?.name || f });
    }
  }
  const seen = new Set();
  return hits.filter((h) => { const k = h.fam; if (seen.has(k)) return false; seen.add(k); return true; });
}

function drawBeds(p) {
  const beds = store.state.garden.beds || [];
  const plan = store.state.garden.plan || {};
  const years = [YEAR - 2, YEAR - 1, YEAR, YEAR + 1];
  render(p, html`
    <div class="row-between" style="margin-bottom:10px">
      <h2 style="margin:0">Beds &amp; crop rotation</h2>
      <button type="button" class="btn btn-sm btn-primary" data-bed-add>${icon('plus')}Add a bed</button>
    </div>
    <p class="subtle">${md(D.garden.rotationRule)}</p>
    ${beds.length ? html`<div class="table-wrap"><table class="rot-table">
      <thead><tr><th>Bed</th>${years.map((y) => html`<th>${y}${y === YEAR ? ' (this year)' : ''}</th>`)}</tr></thead>
      <tbody>${beds.map((b) => html`<tr>
        <td><strong>${b.name}</strong><br><span class="subtle">${b.w && b.l ? `${b.w} × ${b.l} ft · ${b.w * b.l} sq ft` : ''}</span><br>
          <button type="button" class="btn btn-sm btn-ghost" data-bed-edit="${b.id}">${icon('edit')}Edit</button></td>
        ${years.map((y) => {
          const ids = plan[y]?.[b.id] || [];
          const warn = bedWarnings(b.id, y);
          return html`<td><div class="rot-cell">
            ${ids.map((id) => { const c = C[id]; const f = c && FAM[c.family]; return c ? html`<span class="rot-crop" style="--fam-soft:${f ? f.color + '22' : 'var(--bg-sunk)'}"><span class="fam-dot" style="background:${f ? f.color : '#999'}"></span>${c.name}</span>` : ''; })}
            <button type="button" class="btn btn-sm btn-ghost btn-icon" data-bed-pick="${b.id}:${y}" aria-label="Choose crops for ${b.name} in ${y}">${icon(ids.length ? 'edit' : 'plus')}</button>
          </div>${warn.length ? html`<div class="rot-warn">${icon('alert')}${warn.map((w) => `${w.fam} were here in ${w.y}`).join('; ')}</div>` : ''}</td>`;
        })}
      </tr>`)}</tbody>
    </table></div>` : html`<div class="empty">${icon('grid')}<p>Add your beds (for example "Raised bed 1, 4 × 8 ft") to plan rotations and see how many plants fit.</p></div>`}
    <div class="grid-2 section">
      <article class="card"><h3>${icon('info')}Plant families</h3>
        <ul class="list-plain stack-sm">${D.garden.families.map((f) => html`<li><span class="fam-dot" style="background:${f.color}"></span> <strong>${f.name}</strong> <span class="subtle">(${f.latin})</span>: ${f.members}${f.note ? html`<br><span class="subtle">${f.note}</span>` : ''}</li>`)}</ul>
      </article>
      <article class="card" id="fit"><h3>${icon('ruler')}How many plants fit?</h3>
        <div class="field-row">
          <div class="field"><label for="fit-crop">Crop</label><select id="fit-crop">${D.crops.filter((c) => c.perSqFt).map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></div>
          <div class="field"><label for="fit-area">Bed area</label><div class="input-affix"><input id="fit-area" type="number" min="1" value="${beds[0] ? beds[0].w * beds[0].l || 32 : 32}"><span class="affix">sq ft</span></div></div>
        </div>
        <div class="calc-result" style="margin-top:12px" id="fit-out"></div>
      </article>
    </div>`);
  drawFit();
}

function drawFit() {
  const sel = $('#fit-crop');
  if (!sel) return;
  const c = C[sel.value];
  const area = Number($('#fit-area').value) || 0;
  const n = Math.floor(area * (c.perSqFt || 0));
  render($('#fit-out'), html`<span class="big">${n}<small> ${c.name.toLowerCase()} plant${n === 1 ? '' : 's'}</small></span><p>At about ${fmtNum(c.perSqFt, 2)} per sq ft (intensive raised-bed spacing: ${c.spacing || ''}).</p>`);
}

function wireBeds() {
  on(app, 'input', '#fit-crop, #fit-area', drawFit);
  on(app, 'change', '#fit-crop', drawFit);
  on(app, 'click', '[data-bed-add]', () => bedDialog());
  on(app, 'click', '[data-bed-edit]', (e, b) => bedDialog(b.dataset.bedEdit));
  on(app, 'click', '[data-bed-pick]', (e, b) => pickDialog(...b.dataset.bedPick.split(':')));
}

function bedDialog(id) {
  const beds = store.state.garden.beds || [];
  const bed = beds.find((b) => b.id === id) || { id: `bed-${uid()}`, name: `Bed ${beds.length + 1}`, w: 4, l: 8 };
  const dlg = makeDialog('bed-dlg');
  render(dlg, html`<form>
    <div class="dlg-head"><h2>${id ? 'Edit bed' : 'Add a bed'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="dlg-body stack">
      <div class="field"><label for="bd-name">Name</label><input id="bd-name" name="name" type="text" value="${bed.name}" required></div>
      <div class="field-row">
        <div class="field"><label for="bd-w">Width (ft)</label><input id="bd-w" name="w" type="number" min="1" step="0.5" value="${bed.w}"></div>
        <div class="field"><label for="bd-l">Length (ft)</label><input id="bd-l" name="l" type="number" min="1" step="0.5" value="${bed.l}"></div>
      </div>
    </div>
    <div class="dlg-foot">${id ? html`<button type="button" class="btn btn-danger" data-bed-del>${icon('trash')}Delete</button><span class="spacer"></span>` : ''}<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div>
  </form>`);
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  $('[data-bed-del]', dlg)?.addEventListener('click', () => {
    store.update((s) => { s.garden.beds = s.garden.beds.filter((b) => b.id !== id); }, 'garden');
    dlg.close();
  });
  $('form', dlg).addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const nb = { id: bed.id, name: String(fd.get('name')).trim() || bed.name, w: Number(fd.get('w')) || 0, l: Number(fd.get('l')) || 0 };
    store.update((s) => {
      const i = s.garden.beds.findIndex((b) => b.id === nb.id);
      if (i >= 0) s.garden.beds[i] = nb; else s.garden.beds.push(nb);
    }, 'garden');
    dlg.close();
  });
  dlg.showModal();
}

function pickDialog(bedId, year) {
  const plan = store.state.garden.plan || {};
  const cur = new Set(plan[year]?.[bedId] || []);
  const bed = (store.state.garden.beds || []).find((b) => b.id === bedId);
  const dlg = makeDialog('pick-dlg');
  const byFam = D.garden.families.map((f) => ({ f, crops: D.crops.filter((c) => c.family === f.id) })).filter((x) => x.crops.length);
  render(dlg, html`<form>
    <div class="dlg-head"><h2>${bed?.name || 'Bed'} · ${year}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="dlg-body stack">
      ${byFam.map(({ f, crops }) => html`<fieldset><legend><span class="fam-dot" style="background:${f.color}"></span> ${f.name}</legend>
        <div class="picker-list">${crops.map((c) => html`<label><input type="checkbox" name="crop" value="${c.id}" ${cur.has(c.id) ? raw('checked') : ''}>${c.name}</label>`)}</div>
      </fieldset>`)}
    </div>
    <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div>
  </form>`);
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  $('form', dlg).addEventListener('submit', (e) => {
    e.preventDefault();
    const ids = new FormData(e.target).getAll('crop');
    store.update((s) => {
      s.garden.plan[year] = s.garden.plan[year] || {};
      s.garden.plan[year][bedId] = ids;
    }, 'garden');
    dlg.close();
    const w = bedWarnings(bedId, Number(year));
    if (w.length) toast(`Rotation check: ${w[0].fam} grew in this bed in ${w[0].y}.`, { timeout: 6000 });
  });
  dlg.showModal();
}

/* ---------------- Harvest log ---------------- */
function drawHarvest(p) {
  const y = ui.harvestYear;
  const entries = store.state.journal.filter((j) => j.type === 'harvest' && String(j.date).startsWith(String(y)));
  const totals = {};
  for (const e of entries) {
    const k = `${e.crop || 'other'}|${e.unit || 'lb'}`;
    totals[k] = (totals[k] || 0) + (Number(e.amount) || 0);
  }
  const rows = Object.entries(totals).map(([k, v]) => { const [crop, unit] = k.split('|'); return { crop, unit, v }; }).sort((a, b) => b.v - a.v);
  const lbRows = rows.filter((r) => r.unit === 'lb');
  const years = [...new Set(store.state.journal.filter((j) => j.type === 'harvest').map((j) => Number(String(j.date).slice(0, 4))).concat([YEAR]))].sort();
  render(p, html`
    <div class="row-between" style="margin-bottom:12px">
      <h2 style="margin:0">Harvest log</h2>
      <div class="row">
        <select data-hyear aria-label="Year" style="width:auto">${years.map((yy) => html`<option ${yy === y ? raw('selected') : ''}>${yy}</option>`)}</select>
        <button type="button" class="btn btn-primary btn-sm" data-log-harvest>${icon('plus')}Log a harvest</button>
      </div>
    </div>
    ${rows.length ? html`
      ${lbRows.length > 1 ? html`<article class="card" style="margin-bottom:16px">${barChart({ labels: lbRows.slice(0, 12).map((r) => (C[r.crop]?.name || r.crop).slice(0, 9)), values: lbRows.slice(0, 12).map((r) => r.v), unit: '', fmt: (v) => fmtNum(v, 1), barClass: 'bar', ariaLabel: 'Harvest by crop in pounds' })}<p class="subtle" style="margin:4px 0 0">Pounds harvested by crop, ${y}</p></article>` : ''}
      <div class="grid-auto-sm">${rows.map((r) => html`<div class="stat"><span class="stat-label">${C[r.crop]?.name || r.crop}</span><span class="stat-value">${fmtNum(r.v, 1)}<small> ${r.unit}</small></span></div>`)}</div>
      <div class="table-wrap section"><table class="table-compact"><thead><tr><th>Date</th><th>Crop</th><th class="num">Amount</th><th>Notes</th></tr></thead>
        <tbody>${entries.sort((a, b) => b.date.localeCompare(a.date)).map((e) => html`<tr><td class="nowrap">${e.date}</td><td>${C[e.crop]?.name || e.crop || ''}</td><td class="num">${fmtNum(Number(e.amount) || 0, 2)} ${e.unit || ''}</td><td class="muted">${e.notes || ''}</td></tr>`)}</tbody></table></div>`
      : html`<div class="empty">${icon('basket')}<p>No harvests logged for ${y}. Log each pick to see totals by crop (great for deciding what to grow more of next year).</p></div>`}`);
}

/* ---------------- Tips & pests ---------------- */
function drawTips(p) {
  const G = D.garden;
  render(p, html`
    <div class="grid-2">
      ${G.guides.map((g) => html`<article class="card"><h3>${icon(g.icon || 'info')}${g.title}</h3>
        <ul>${g.points.map((x) => html`<li>${md(x)}</li>`)}</ul>
        ${g.sources ? sourceItems(g.sources, S) : ''}</article>`)}
    </div>
    <section class="section">
      <div class="section-head"><h2>Garden pests &amp; problems</h2></div>
      ${G.pests.map((x) => html`<details class="acc" id="pest-${x.id}"><summary>${x.name} <span class="subtle">${x.crops}</span></summary><div class="acc-body">
        <p><strong>Signs:</strong> ${md(x.signs)}</p>
        <p><strong>What to do:</strong> ${md(x.fix)}</p>
        ${x.products ? html`<div class="link-chips">${x.products.map((id) => P[id]).filter(Boolean).map((pp) => html`<a class="link-chip" href="products.html#p-${pp.id}">${icon(pp.organic ? 'leaf' : 'bag')}${pp.name}</a>`)}</div>` : ''}
        ${x.sources ? html`<div style="margin-top:8px">${sourceItems(x.sources, S)}</div>` : ''}
      </div></details>`)}
    </section>
    <section class="section">
      <div class="section-head"><h2>Companion planting: what's real?</h2></div>
      <p class="subtle">Most companion-planting claims come from folklore. Here's what has evidence, labeled so you can decide.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Pairing / practice</th><th>Evidence</th><th>Bottom line</th></tr></thead>
        <tbody>${G.companions.map((c) => html`<tr><td><strong>${c.pair}</strong></td><td><span class="ev ev-${c.evidence}">${EVIDENCE[c.evidence] || c.evidence}</span></td><td>${md(c.note)}</td></tr>`)}</tbody>
      </table></div>
    </section>`);
}

main().catch((err) => { console.error(err); render(app, errorBlock(err)); });
