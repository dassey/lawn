// Garden beds: care calendar, pruning guide, native plant finder, trees,
// invasives, bulbs & mulch.
import { mountChrome, setTitle, loadingBlock, errorBlock } from '../core/ui.js';
import { html, raw, md, render, $, $$, on, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { loadData, byId } from '../core/data.js';
import { store, isDone } from '../core/store.js';
import { today, MON, monthName } from '../core/dates.js';
import { sourceItems, taskMonths, visibleTasks, whenLabel } from '../core/tasks.js';

mountChrome('beds');
setTitle('Garden beds');
const app = $('#app');
render(app, loadingBlock('Loading garden beds…'));

const NOW = today();
const YEAR = NOW.getFullYear();
const M = NOW.getMonth() + 1;
let D, S;
const pf = { type: 'all', sun: 'all', moist: 'all', bloom: 0, native: false, clay: false, deer: false, q: '' };
let pruneQ = '';

async function main() {
  D = await loadData('beds', 'plants', 'pruning', 'tasks', 'sources');
  S = byId(D.sources);
  const B = D.beds;
  render(app, html`
    <section class="page-head">
      <span class="eyebrow">Flower beds, shrubs &amp; trees</span>
      <h1>Garden beds</h1>
      <p class="lede">${B.intro}</p>
    </section>
    <nav class="subnav" aria-label="On this page"><ul>
      <li><a href="#care">Care calendar</a></li><li><a href="#pruning">Pruning guide</a></li><li><a href="#plants">Plant finder</a></li>
      <li><a href="#trees">Trees</a></li><li><a href="#invasives">Invasives</a></li><li><a href="#bulbs">Bulbs &amp; mulch</a></li>
    </ul></nav>

    <section class="section">
      <div class="section-head"><h2>Six habits of easy beds</h2></div>
      <div class="grid-auto">${B.principles.map((p) => html`<article class="card"><h3 style="display:flex;gap:8px;align-items:center">${icon(p.icon || 'beds')}${p.title}</h3><p style="margin:0">${md(p.text)}</p>${p.sources ? html`<div style="margin-top:8px">${sourceItems(p.sources, S)}</div>` : ''}</article>`)}</div>
    </section>

    <section class="section" id="care">
      <div class="section-head"><h2>Bed care, month by month</h2><a href="calendar.html#/month/${M}">Open the calendar ${icon('arrowRight')}</a></div>
      <div id="care-grid"></div>
    </section>

    <section class="section" id="pruning">
      <div class="section-head"><h2>What to prune when</h2></div>
      <div class="callout" style="margin-bottom:12px">${icon('scissors')}<div>${md(B.pruneRule)}</div></div>
      <div class="search-input" style="max-width:420px;margin-bottom:12px">${icon('search')}<input type="search" id="prune-q" placeholder="Find a plant (e.g. hydrangea)…" aria-label="Search pruning guide"></div>
      <div id="prune-table"></div>
    </section>

    <section class="section" id="plants">
      <div class="section-head"><h2>Plant finder</h2><span class="subtle">Proven performers for KC clay, heat and cold</span></div>
      <div class="toolbar" id="pf-bar"></div>
      <div id="pf-list"></div>
    </section>

    <section class="section" id="trees">
      <div class="section-head"><h2>Tree &amp; shrub care</h2></div>
      <div class="grid-auto">${B.trees.map((t) => html`<article class="card" id="tree-${t.id}"><h3 style="display:flex;gap:8px;align-items:center">${icon(t.icon || 'yard')}${t.title}</h3><p style="margin:0">${md(t.text)}</p>${t.sources ? html`<div style="margin-top:8px">${sourceItems(t.sources, S)}</div>` : ''}</article>`)}</div>
    </section>

    <section class="section" id="invasives">
      <div class="section-head"><h2>Invasive plants to remove</h2></div>
      <p class="subtle">${md(B.invasivesIntro)}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Plant</th><th>Why it's a problem</th><th>How &amp; when to remove</th><th>Plant instead</th></tr></thead>
        <tbody>${B.invasives.map((i) => html`<tr><td><strong>${i.name}</strong>${i.latin ? html`<br><em class="subtle">${i.latin}</em>` : ''}</td><td>${md(i.why)}</td><td>${md(i.remove)}</td><td>${md(i.instead)}</td></tr>`)}</tbody>
      </table></div>
      <div style="margin-top:8px">${sourceItems(B.invasiveSources, S)}</div>
    </section>

    <section class="section" id="bulbs">
      <div class="section-head"><h2>Bulbs &amp; mulch</h2></div>
      <div class="grid-2">
        <article class="card"><h3>${icon('flower')}Spring bulbs (plant Oct–Nov)</h3>
          <div class="table-wrap"><table class="table-compact"><thead><tr><th>Bulb</th><th>Depth</th><th>Notes</th></tr></thead>
          <tbody>${B.bulbs.map((b) => html`<tr><td><strong>${b.name}</strong></td><td class="nowrap">${b.depth}</td><td>${md(b.note)}</td></tr>`)}</tbody></table></div>
        </article>
        <article class="card"><h3>${icon('leaf')}Mulch that helps (not hurts)</h3>
          <ul class="list-check">${B.mulch.map((m) => html`<li>${md(m)}</li>`)}</ul>
          <p style="margin:12px 0 0"><a class="btn btn-sm" href="tools.html#mulch">${icon('calculator')}How much mulch do I need?</a></p>
        </article>
      </div>
    </section>`);

  on(app, 'input', '#prune-q', debounce((e) => { pruneQ = e.target.value; drawPrune(); }, 120));
  on(app, 'click', '[data-pf]', (e, b) => {
    const [k, v] = b.dataset.pf.split(':');
    if (['native', 'clay', 'deer'].includes(k)) pf[k] = !pf[k];
    else pf[k] = v;
    drawPF();
  });
  on(app, 'change', '#pf-bloom', (e, el) => { pf.bloom = Number(el.value); drawPF(); });
  on(app, 'input', '#pf-q', debounce((e) => { pf.q = e.target.value; drawPFList(); }, 120));

  drawCare();
  drawPrune();
  drawPF();
  const h = location.hash.slice(1);
  if (h.startsWith('prune-') || h.startsWith('plant-')) {
    setTimeout(() => {
      const el = document.getElementById(h);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '3px solid var(--beds)'; setTimeout(() => { el.style.outline = ''; }, 2500); }
    }, 80);
  }
  store.subscribe((s, r) => { if (r === 'done' || r === 'replace') drawCare(); });
}

function drawCare() {
  const tasks = visibleTasks(D.tasks, store.settings).filter((t) => t.category === 'beds');
  render($('#care-grid'), html`<div class="grid-auto">${MON.map((mn, i) => {
    const m = i + 1;
    const list = tasks.filter((t) => taskMonths(t, store.settings).includes(m));
    return html`<article class="card card-tight cat-beds" style="${m === M ? 'border-color:var(--beds);box-shadow:0 0 0 2px var(--beds-soft)' : ''}">
      <h3 style="margin:0 0 6px"><a href="calendar.html#/month/${m}">${monthName(m)}</a>${m === M ? html` <span class="badge badge-cat">Now</span>` : ''}</h3>
      ${list.length ? html`<ul class="list-plain stack-sm" style="font-size:.9rem">${list.map((t) => html`<li>${isDone(YEAR, t.id) ? html`<span style="color:var(--ok)">✓</span> ` : ''}<a href="calendar.html#/task/${t.id}">${t.title}</a> <span class="subtle">· ${whenLabel(t, YEAR, store.settings)}</span></li>`)}</ul>` : html`<p class="subtle" style="margin:0">Rest. Enjoy the garden.</p>`}
    </article>`;
  })}</div>`);
}

function drawPrune() {
  const q = pruneQ.trim().toLowerCase();
  const list = D.pruning.filter((p) => !q || [p.plant, p.group, p.when, p.how].join(' ').toLowerCase().includes(q));
  render($('#prune-table'), list.length ? html`<div class="table-wrap"><table>
    <thead><tr><th>Plant</th><th>When</th><th>How</th></tr></thead>
    <tbody>${list.map((p) => html`<tr id="prune-${p.id}"><td><strong>${p.plant}</strong><br><span class="subtle">${p.group}</span></td>
      <td>${p.months ? html`<span class="row" style="gap:2px;margin-bottom:4px">${MON.map((mn, i) => html`<span title="${mn}" style="width:14px;height:14px;border-radius:3px;font-size:.55rem;font-weight:700;display:inline-grid;place-items:center;${p.months.includes(i + 1) ? 'background:var(--beds);color:#fff' : 'background:var(--bg-sunk);color:var(--ink-3)'}">${mn[0]}</span>`)}</span><br>` : ''}${md(p.when)}</td>
      <td>${md(p.how)}${p.why ? html`<br><span class="subtle">${md(p.why)}</span>` : ''}</td></tr>`)}</tbody>
  </table></div>` : html`<div class="empty">No match. Try the plant's common name.</div>`);
}

function drawPF() {
  const chip = (k, v, label) => html`<button type="button" class="chip" data-pf="${k}:${v}" aria-pressed="${String(String(pf[k]) === String(v))}">${label}</button>`;
  const tog = (k, label) => html`<button type="button" class="chip" data-pf="${k}:1" aria-pressed="${String(pf[k])}">${label}</button>`;
  render($('#pf-bar'), html`
    <div class="toolbar-row"><span class="toolbar-label">Type</span><div class="chips">${chip('type', 'all', 'All')}${chip('type', 'perennial', 'Perennials')}${chip('type', 'grass', 'Grasses')}${chip('type', 'shrub', 'Shrubs')}${chip('type', 'tree', 'Trees')}${chip('type', 'groundcover', 'Groundcovers')}</div></div>
    <div class="toolbar-row"><span class="toolbar-label">Sun</span><div class="chips">${chip('sun', 'all', 'Any')}${chip('sun', 'full', 'Full sun')}${chip('sun', 'part', 'Part shade')}${chip('sun', 'shade', 'Shade')}</div></div>
    <div class="toolbar-row"><span class="toolbar-label">Soil</span><div class="chips">${chip('moist', 'all', 'Any')}${chip('moist', 'dry', 'Dry')}${chip('moist', 'medium', 'Average')}${chip('moist', 'wet', 'Wet')}</div></div>
    <div class="toolbar-row"><span class="toolbar-label">Must be</span><div class="chips">${tog('native', 'Missouri native')}${tog('clay', 'Clay tolerant')}${tog('deer', 'Deer resistant')}</div>
      <select id="pf-bloom" style="width:auto" aria-label="Blooms in"><option value="0">Blooms: any month</option>${MON.map((mn, i) => html`<option value="${i + 1}" ${pf.bloom === i + 1 ? raw('selected') : ''}>Blooms in ${monthName(i + 1)}</option>`)}</select>
      <div class="search-input" style="flex:1;min-width:160px">${icon('search')}<input type="search" id="pf-q" placeholder="Search plants…" value="${pf.q}" aria-label="Search plants"></div></div>`);
  drawPFList();
}

function drawPFList() {
  const q = pf.q.trim().toLowerCase();
  const list = D.plants.filter((p) => (pf.type === 'all' || p.type === pf.type)
    && (pf.sun === 'all' || (p.sun || []).includes(pf.sun))
    && (pf.moist === 'all' || (p.moisture || []).includes(pf.moist))
    && (!pf.bloom || (p.bloom || []).includes(pf.bloom))
    && (!pf.native || p.native) && (!pf.clay || p.clay) && (!pf.deer || p.deer)
    && (!q || [p.name, p.latin, p.notes, p.color].join(' ').toLowerCase().includes(q)));
  const sunL = { full: 'Full sun', part: 'Part shade', shade: 'Shade' };
  render($('#pf-list'), html`<p class="subtle">${list.length} plant${list.length === 1 ? '' : 's'}</p>
    ${list.length ? html`<div class="grid-auto">${list.map((p) => html`<article class="card item-card cat-beds" id="plant-${p.id}">
      <div class="ic-head"><div style="flex:1"><h3>${p.name}</h3><div class="ic-sub">${p.latin}</div></div>${p.native ? html`<span class="badge badge-organic" title="Native to Missouri">${icon('leaf')}MO native</span>` : ''}</div>
      <div class="tags">
        <span class="tag">${p.type}</span>${(p.sun || []).map((s) => html`<span class="tag">${sunL[s] || s}</span>`)}
        ${p.clay ? html`<span class="tag">clay OK</span>` : ''}${p.deer ? html`<span class="tag">deer resistant</span>` : ''}
      </div>
      <dl>
        ${p.height ? html`<dt>Size</dt><dd>${p.height}</dd>` : ''}
        ${p.bloom && p.bloom.length ? html`<dt>Blooms</dt><dd>${p.bloom.map((m) => MON[m - 1]).join(', ')}${p.color ? ` · ${p.color}` : ''}</dd>` : ''}
        ${p.moisture ? html`<dt>Soil</dt><dd>${p.moisture.join(' to ')}</dd>` : ''}
        ${p.wildlife ? html`<dt>Wildlife</dt><dd>${p.wildlife}</dd>` : ''}
      </dl>
      ${p.notes ? html`<p style="margin:0;font-size:.9rem">${md(p.notes)}</p>` : ''}
    </article>`)}</div>` : html`<div class="empty">No plants match all of those filters. Loosen one.</div>`}`);
}

main().catch((err) => { console.error(err); render(app, errorBlock(err)); });
