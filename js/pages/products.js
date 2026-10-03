// Products: specific recommendations with rates & timing, season kits and a
// shopping list sized to your yard.
import { mountChrome, setTitle, loadingBlock, errorBlock, toast } from '../core/ui.js';
import { html, raw, md, render, $, $$, on, fmtNum, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { loadData, byId } from '../core/data.js';
import { store } from '../core/store.js';
import { today, MON, monthName } from '../core/dates.js';
import { sourceItems, EVIDENCE } from '../core/tasks.js';
import { productTotal, seedLbs } from '../core/calc.js';

mountChrome('products');
setTitle('Products & shopping list');
const app = $('#app');
render(app, loadingBlock('Loading products…'));

const NOW = today();
let D, S, P, TASKS_BY_PRODUCT;
const f = { type: 'all', month: 0, organic: false, q: '' };

const TYPES = [
  ['all', 'All', 'bag'],
  ['fertilizer', 'Fertilizer & soil', 'sprout'],
  ['seed', 'Grass seed', 'seed'],
  ['herbicide-pre', 'Weed preventers', 'shield'],
  ['herbicide-post', 'Weed killers', 'spray'],
  ['insecticide', 'Insects', 'bug'],
  ['fungicide', 'Diseases', 'alert'],
  ['garden', 'Veggie garden', 'veg'],
  ['tool', 'Tools & watering', 'tools'],
  ['critter', 'Critters', 'yard'],
];

/** Suggested purchase quantity for this yard. */
export function suggestQty(p, s = store.settings) {
  const pkg = p.package || {};
  if (p.nPercent && pkg.unit === 'lb') {
    const area = p.cat === 'veg' ? s.vegSqFt : s.lawnSqFt;
    const n = p.cat === 'veg' ? 0.3 * 10 : 1; // lb N/1,000 (veg: ≈ 3 lb of 10-10-10 per 100 sq ft)
    const lbs = productTotal(n, p.nPercent, area);
    return { qty: Math.max(1, Math.ceil(lbs / pkg.size)), why: `${fmtNum(lbs, 1)} lb for one ${p.cat === 'veg' ? 'pre-plant' : '1 lb N'} feeding of ${fmtNum(area, 0)} sq ft` };
  }
  if (p.type === 'seed' && pkg.unit === 'lb') {
    const lbs = seedLbs(4.5, s.lawnSqFt);
    return { qty: Math.max(1, Math.ceil(lbs / pkg.size)), why: `${fmtNum(lbs, 1)} lb to overseed ${fmtNum(s.lawnSqFt, 0)} sq ft at 4.5 lb/1,000` };
  }
  if (p.coverageSqFt) {
    const area = p.cat === 'beds' ? s.bedSqFt : p.cat === 'veg' ? s.vegSqFt : s.lawnSqFt;
    return { qty: Math.max(1, Math.ceil(area / p.coverageSqFt)), why: `covers ${fmtNum(p.coverageSqFt, 0)} sq ft each; your area is ${fmtNum(area, 0)} sq ft` };
  }
  return { qty: 1, why: '' };
}

async function main() {
  D = await loadData('products', 'sources', 'tasks');
  S = byId(D.sources);
  P = byId(D.products);
  TASKS_BY_PRODUCT = {};
  for (const t of D.tasks) for (const id of t.products || []) (TASKS_BY_PRODUCT[id] ||= []).push(t);

  render(app, html`
    <section class="page-head">
      <span class="eyebrow">Specific picks, with the why</span>
      <h1>Products &amp; shopping list</h1>
      <p class="lede">Named products for each job, with active ingredient, rate, timing and where to find them around Kansas City. Quantities are sized to your yard (${fmtNum(store.settings.lawnSqFt, 0)} sq ft lawn). Prices are rough 2026 estimates, so check locally. <strong>Read and follow the label.</strong></p>
    </section>
    <div class="layout-main">
      <div>
        <div class="toolbar" id="pbar"></div>
        <div id="kits"></div>
        <div id="plist"></div>
      </div>
      <aside class="cart-aside"><section class="card" id="cart"></section></aside>
    </div>
    <a class="cart-fab" id="cart-fab" href="#cart" hidden></a>`);

  on(app, 'click', '[data-ptype]', (e, b) => { f.type = b.dataset.ptype; drawBar(); drawList(); });
  on(app, 'change', '#p-month', (e, el) => { f.month = Number(el.value); drawList(); });
  on(app, 'change', '#p-org', (e, el) => { f.organic = el.checked; drawList(); });
  on(app, 'input', '#p-q', debounce((e) => { f.q = e.target.value; drawList(); }, 120));
  on(app, 'click', '[data-add]', (e, b) => {
    const p = P[b.dataset.add];
    const { qty } = suggestQty(p);
    store.update((s) => { s.shopping[p.id] = (s.shopping[p.id] || 0) + qty; }, 'shopping');
    toast(`Added ${qty} × ${p.name}`);
  });
  on(app, 'click', '[data-kit]', (e, b) => {
    const kit = KITS.find((k) => k.id === b.dataset.kit);
    store.update((s) => { for (const id of kit.items) if (P[id]) s.shopping[id] = Math.max(s.shopping[id] || 0, suggestQty(P[id]).qty); }, 'shopping');
    toast(`${kit.name} added to your list`);
  });
  on(app, 'change', '[data-cart-qty]', (e, el) => {
    const id = el.dataset.cartQty;
    const v = Math.max(0, Math.round(Number(el.value) || 0));
    store.update((s) => { if (v) s.shopping[id] = v; else delete s.shopping[id]; }, 'shopping');
  });
  on(app, 'click', '[data-cart-del]', (e, b) => store.update((s) => { delete s.shopping[b.dataset.cartDel]; }, 'shopping'));
  on(app, 'click', '[data-cart-clear]', () => store.update((s) => { s.shopping = {}; }, 'shopping'));
  on(app, 'click', '[data-cart-copy]', async () => {
    const txt = cartText();
    try { await navigator.clipboard.writeText(txt); toast('Shopping list copied'); } catch { prompt('Copy your list:', txt); }
  });
  on(app, 'click', '[data-cart-print]', () => {
    document.body.classList.add('print-cart');
    window.addEventListener('afterprint', () => document.body.classList.remove('print-cart'), { once: true });
    window.print();
  });

  store.subscribe((s, r) => { if (['shopping', 'replace', 'sync', 'settings'].includes(r)) drawCart(); });
  drawBar();
  drawKits();
  drawList();
  drawCart();
  const h = location.hash.slice(1);
  if (h.startsWith('p-')) {
    const p = P[h.slice(2)];
    if (p) { f.type = 'all'; f.q = ''; drawBar(); drawList(); }
    setTimeout(() => {
      const el = document.getElementById(h);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.boxShadow = '0 0 0 3px var(--brand)'; setTimeout(() => { el.style.boxShadow = ''; }, 2500); }
    }, 80);
  }
}

const KITS = [
  { id: 'fall-lawn', name: 'Fall lawn renovation kit', icon: 'seed', desc: 'Seed, starter fertilizer, the two fall feedings, and a timer for watering new seed.', items: ['kc-marathon', 'scotts-starter', 'scotts-turf-builder', 'urea-46', 'aerator-rental', 'hose-timer', 'oscillating-sprinkler'] },
  { id: 'spring-lawn', name: 'Spring lawn kit', icon: 'shield', desc: 'Season-long crabgrass preventer, a spreader, and a broadleaf spot spray.', items: ['dimension-granular', 'spreader', 'weedbgon-ccox', 'sharpening'] },
  { id: 'veg-start', name: 'Veggie garden starter kit', icon: 'veg', desc: 'Everything for a first KC vegetable garden that you water without a sprinkler system.', items: ['compost', 'espoma-garden-tone', 'soaker-drip', 'hose-timer', 'straw-mulch', 'row-cover', 'tomato-cage', 'bt', 'rabbit-fence'] },
  { id: 'measure', name: 'Measure-don\'t-guess kit', icon: 'target', desc: 'A rain gauge, soil thermometer and soil probe take the guesswork out of every alert on this site.', items: ['rain-gauge', 'soil-thermometer', 'soil-probe'] },
];

function drawBar() {
  const months = html`<select id="p-month" style="width:auto" aria-label="Used in month"><option value="0">Used in: any month</option>${MON.map((m, i) => html`<option value="${i + 1}" ${f.month === i + 1 ? raw('selected') : ''}>Used in ${monthName(i + 1)}</option>`)}</select>`;
  render($('#pbar'), html`
    <div class="toolbar-row"><div class="chips">${TYPES.map(([k, l, ic]) => html`<button type="button" class="chip" data-ptype="${k}" aria-pressed="${String(f.type === k)}">${icon(ic)}${l}</button>`)}</div></div>
    <div class="toolbar-row">
      <div class="search-input" style="flex:1;min-width:180px">${icon('search')}<input type="search" id="p-q" value="${f.q}" placeholder="Search products or ingredients…" aria-label="Search products"></div>
      ${months}
      <label class="switch"><input type="checkbox" id="p-org" ${f.organic ? raw('checked') : ''}><span class="track"></span>Organic only</label>
    </div>`);
}

function drawKits() {
  render($('#kits'), html`<div class="section-head" style="margin-top:4px"><h2>Ready-made kits</h2><span class="subtle">One tap adds everything, sized to your yard</span></div>
  <div class="grid-auto" style="margin-bottom:20px">${KITS.map((k) => html`<article class="card card-tight">
    <h3 style="display:flex;gap:8px;align-items:center;margin:0 0 4px">${icon(k.icon)}${k.name}</h3>
    <p class="subtle" style="margin:0 0 10px">${k.desc}</p>
    <button type="button" class="btn btn-sm" data-kit="${k.id}">${icon('cart')}Add kit to list</button>
  </article>`)}</div>`);
}

function matches(p) {
  if (f.type !== 'all' && p.type !== f.type) return false;
  if (f.organic && !p.organic) return false;
  if (f.month && !(p.months || []).includes(f.month)) return false;
  const q = f.q.trim().toLowerCase();
  if (q && ![p.name, p.brand, p.activeIngredient, p.analysis, p.use, (p.tags || []).join(' ')].join(' ').toLowerCase().includes(q)) return false;
  return true;
}

function card(p) {
  const tasks = TASKS_BY_PRODUCT[p.id] || [];
  const sq = suggestQty(p);
  const typeLabel = (TYPES.find(([k]) => k === p.type) || [, p.type])[1];
  return html`<article class="card item-card" id="p-${p.id}">
    <div class="ic-head">
      <div style="flex:1"><h3>${p.name}</h3>${p.brand ? html`<div class="ic-sub" style="font-style:normal">${p.brand}</div>` : ''}</div>
      ${p.organic ? html`<span class="badge badge-organic">${icon('leaf')}Organic</span>` : ''}
    </div>
    <div class="tags"><span class="tag">${typeLabel}</span>${p.tier === 'pro' ? html`<span class="tag" title="Professional product sold to homeowners online or at SiteOne">pro product</span>` : ''}${p.evidence === 'vendor' ? html`<span class="ev ev-vendor">Vendor claim</span>` : ''}</div>
    <p style="margin:0">${md(p.use)}</p>
    <dl>
      ${p.activeIngredient ? html`<dt>Active</dt><dd>${p.activeIngredient}</dd>` : ''}
      ${p.analysis ? html`<dt>Analysis</dt><dd>${p.analysis}</dd>` : ''}
      ${p.rate ? html`<dt>Rate</dt><dd>${md(p.rate)}</dd>` : ''}
      ${p.months && p.months.length ? html`<dt>When</dt><dd>${p.months.map((m) => MON[m - 1]).join(', ')}</dd>` : ''}
      ${p.package ? html`<dt>Size</dt><dd>${p.package.label || `${p.package.size} ${p.package.unit}`}</dd>` : ''}
      ${p.where ? html`<dt>Where</dt><dd>${p.where}</dd>` : ''}
      ${p.cost ? html`<dt>Cost</dt><dd>${p.cost}</dd>` : ''}
    </dl>
    ${p.cautions && p.cautions.length ? html`<div class="callout callout-warn" style="font-size:.85rem">${icon('alert')}<ul style="margin:0;padding-left:1.1em">${p.cautions.map((c) => html`<li>${md(c)}</li>`)}</ul></div>` : ''}
    ${tasks.length ? html`<p class="subtle" style="margin:0">Used in: ${tasks.slice(0, 4).map((t, i) => html`${i ? ', ' : ''}<a href="calendar.html#/task/${t.id}">${t.title}</a>`)}${tasks.length > 4 ? ` +${tasks.length - 4} more` : ''}</p>` : ''}
    ${p.sources ? sourceItems(p.sources, S) : ''}
    <div class="ic-foot">
      <button type="button" class="btn btn-sm btn-primary" data-add="${p.id}">${icon('cart')}Add ${sq.qty > 1 ? `${sq.qty} ` : ''}to list</button>
      ${p.url ? html`<a class="btn btn-sm btn-ghost" href="${p.url}" target="_blank" rel="noopener">${icon('external')}Label / info</a>` : ''}
      ${sq.why ? html`<span class="subtle" style="font-size:.78rem">${sq.why}</span>` : ''}
    </div>
  </article>`;
}

function drawList() {
  const list = D.products.filter(matches);
  const groups = TYPES.filter(([k]) => k !== 'all').map(([k, l, ic]) => ({ k, l, ic, items: list.filter((p) => p.type === k) })).filter((g) => g.items.length);
  render($('#plist'), list.length ? html`${groups.map((g) => html`<section class="section" style="margin-top:20px">
    <div class="section-head"><h2 style="display:flex;gap:8px;align-items:center">${icon(g.ic)}${g.l}</h2><span class="subtle">${g.items.length}</span></div>
    <div class="grid-auto">${g.items.map(card)}</div></section>`)}` : html`<div class="empty">No products match those filters.</div>`);
}

/** Price range for one package. Prices quoted per lb (bulk seed) are scaled to the package. */
function priceRange(p) {
  const cost = String(p.cost || '');
  const m = cost.match(/\$(\d+(?:\.\d+)?)(?:\s*[–-]\s*\$?(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  const k = /^[^;(]*\/\s*lb\b/.test(cost) && p.package?.unit === 'lb' ? p.package.size || 1 : 1;
  return [Number(m[1]) * k, Number(m[2] || m[1]) * k];
}

// Only measured sizes are worth showing ("25 lb each"); skip counts like "1 timer".
const MEASURED = new Set(['lb', 'oz', 'fl oz', 'gal', 'cu ft', 'cu yd', 'ft']);
const pkgLabel = (p) => (p.package && p.package.size && MEASURED.has(p.package.unit) ? `${p.package.size} ${p.package.unit}` : '');

function cartText() {
  const items = Object.entries(store.state.shopping).filter(([id]) => P[id]);
  return ['KC Lawn & Garden shopping list', ...items.map(([id, q]) => `[ ] ${q} × ${P[id].name}${P[id].package ? ` (${P[id].package.label || P[id].package.size + ' ' + P[id].package.unit})` : ''}${P[id].where ? ` - ${P[id].where}` : ''}`)].join('\n');
}

function drawCart() {
  const items = Object.entries(store.state.shopping).filter(([id]) => P[id]);
  let lo = 0;
  let hi = 0;
  for (const [id, q] of items) { const r = priceRange(P[id]); if (r) { lo += r[0] * q; hi += r[1] * q; } }
  const fab = $('#cart-fab');
  fab.hidden = !items.length;
  render(fab, html`${icon('cart')}Shopping list · ${items.length}`);
  render($('#cart'), html`
    <div class="card-head"><h2>${icon('cart')}Shopping list</h2><span class="badge">${items.length}</span></div>
    ${items.length ? html`
      <ul class="list-plain stack-sm">${items.map(([id, q]) => html`<li class="row" style="flex-wrap:nowrap;align-items:center">
        <input type="number" min="0" value="${q}" data-cart-qty="${id}" aria-label="Quantity of ${P[id].name}" style="width:64px;min-height:36px;padding:4px 8px">
        <span style="flex:1;min-width:0;font-size:.9rem"><a href="#p-${id}">${P[id].name}</a>${pkgLabel(P[id]) ? html` <span class="subtle" style="white-space:nowrap">· ${pkgLabel(P[id])} each</span>` : ''}</span>
        <button type="button" class="icon-btn" data-cart-del="${id}" aria-label="Remove ${P[id].name}" style="width:34px;height:34px">${icon('x')}</button>
      </li>`)}</ul>
      ${hi ? html`<p style="margin:12px 0 0"><strong>Estimated: $${fmtNum(lo, 0)}–$${fmtNum(hi, 0)}</strong> <span class="subtle">(rough)</span></p>` : ''}
      <div class="btn-group" style="margin-top:12px">
        <button type="button" class="btn btn-sm" data-cart-copy>${icon('copy')}Copy</button>
        <button type="button" class="btn btn-sm" data-cart-print>${icon('print')}Print</button>
        <button type="button" class="btn btn-sm btn-ghost" data-cart-clear>Clear</button>
      </div>` : html`<p class="subtle" style="margin:0">Add products or a kit. Quantities are sized to your yard (change sizes in Settings).</p>`}`);
}

main().catch((err) => { console.error(err); render(app, errorBlock(err)); });
