// Calculators: lawn area, fertilizer, seed & mixes, sprinkler run time,
// spray mix, mulch/compost, lime, garden fertilizer, unit conversions.
import { mountChrome, setTitle, loadingBlock, errorBlock, toast } from '../core/ui.js';
import { html, raw, render, $, $$, on, fmtNum } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { loadData } from '../core/data.js';
import { store, addJournal } from '../core/store.js';
import { today, toISO } from '../core/dates.js';
import {
  productPer1000, productTotal, nApplied, seedLbs, gallons, minutesFor, cubicFeet, cubicYards,
  perAcreToPer1000, per1000ToPerAcre, parseAnalysis,
} from '../core/calc.js';

mountChrome('tools');
setTitle('Calculators');
const app = $('#app');
render(app, loadingBlock('Loading calculators…'));

let D;
const num = (el) => { const v = Number(el?.value); return Number.isFinite(v) ? v : 0; };
const val = (id) => num($(`#${id}`));

const CALCS = [
  ['area', 'Lawn area', 'ruler'],
  ['fertilizer', 'Fertilizer', 'sprout'],
  ['seed', 'Grass seed', 'seed'],
  ['water', 'Sprinkler run time', 'drop'],
  ['spray', 'Spray mix', 'spray'],
  ['mulch', 'Mulch & compost', 'leaf'],
  ['lime', 'Lime', 'soil'],
  ['garden-fert', 'Garden fertilizer', 'veg'],
  ['convert', 'Conversions', 'calculator'],
];

async function main() {
  D = await loadData('products');
  const s = store.settings;
  const ferts = D.products.filter((p) => p.nPercent);
  const seeds = D.products.filter((p) => p.type === 'seed');
  render(app, html`
    <section class="page-head">
      <span class="eyebrow">Do the math once</span>
      <h1>Calculators</h1>
      <p class="lede">Every calculator starts from your lawn size (${fmtNum(s.lawnSqFt, 0)} sq ft; <button type="button" class="btn-link" data-action="settings">change</button>). Rates are per 1,000 sq ft, the way labels and Extension write them.</p>
    </section>
    <nav class="subnav" aria-label="Calculators"><ul>${CALCS.map(([id, label]) => html`<li><a href="#${id}">${label}</a></li>`)}</ul></nav>

    <div class="grid-2 section">
      <!-- AREA -->
      <article class="card calc" id="area">
        <h2 class="display" style="font-size:1.3rem;margin:0">${icon('ruler')} Measure your lawn</h2>
        <p class="subtle" style="margin:0">Break the yard into rectangles, circles and triangles. Subtract the house, driveway and beds. Pacing works: one normal adult step is about 2.5 ft. Or use Google Maps on a computer: right-click, choose "Measure distance," and click around your lawn.</p>
        <div class="area-rows" id="area-rows"></div>
        <div class="btn-group"><button type="button" class="btn btn-sm" data-area-add="rect">${icon('plus')}Rectangle</button><button type="button" class="btn btn-sm" data-area-add="circle">${icon('plus')}Circle</button><button type="button" class="btn btn-sm" data-area-add="tri">${icon('plus')}Triangle</button></div>
        <div class="calc-result" id="area-out"></div>
      </article>

      <!-- FERTILIZER -->
      <article class="card calc" id="fertilizer">
        <h2 class="display" style="font-size:1.3rem;margin:0">${icon('sprout')} Fertilizer: how much product?</h2>
        <div class="field"><label for="f-prod">Product</label>
          <select id="f-prod"><option value="">Custom analysis…</option>${ferts.map((p) => html`<option value="${p.id}" ${p.id === 'scotts-turf-builder' ? raw('selected') : ''}>${p.name} (${p.analysis})</option>`)}</select></div>
        <div class="field-row">
          <div class="field"><label for="f-an">Analysis (N-P-K)</label><input id="f-an" type="text" value="32-0-4" inputmode="decimal"></div>
          <div class="field"><label for="f-bag">Bag size</label><div class="input-affix"><input id="f-bag" type="number" min="1" step="0.5" value="12.5"><span class="affix">lb</span></div></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="f-n">Nitrogen rate</label><div class="input-affix"><input id="f-n" type="number" min="0.1" max="2" step="0.25" value="1"><span class="affix">lb N/1,000</span></div></div>
          <div class="field"><label for="f-area">Area</label><div class="input-affix"><input id="f-area" type="number" min="1" value="${s.lawnSqFt}"><span class="affix">sq ft</span></div></div>
        </div>
        <div class="calc-result" id="f-out"></div>
        <p class="formula">lb product per 1,000 sq ft = lb N × 100 ÷ %N</p>
        <div class="btn-group"><button type="button" class="btn btn-sm" data-f-log>${icon('journal')}Log this application</button></div>
        <details class="acc"><summary>Whole-season plan with this product</summary><div class="acc-body" id="f-season"></div></details>
      </article>

      <!-- SEED -->
      <article class="card calc" id="seed">
        <h2 class="display" style="font-size:1.3rem;margin:0">${icon('seed')} Grass seed: how much?</h2>
        <div class="field"><label for="sd-mode">Job</label>
          <select id="sd-mode">
            <option value="4.5">Overseed a thin lawn (4–5 lb/1,000)</option>
            <option value="8">Bare soil / new lawn, turf-type tall fescue (7–9 lb)</option>
            <option value="10">Forage type such as KY-31 (10 lb, MU)</option>
            <option value="custom">Custom rate…</option>
          </select></div>
        <div class="field-row">
          <div class="field"><label for="sd-rate">Rate</label><div class="input-affix"><input id="sd-rate" type="number" min="1" max="15" step="0.5" value="4.5"><span class="affix">lb/1,000</span></div></div>
          <div class="field"><label for="sd-area">Area</label><div class="input-affix"><input id="sd-area" type="number" min="1" value="${s.lawnSqFt}"><span class="affix">sq ft</span></div></div>
          <div class="field"><label for="sd-bag">Bag size</label><div class="input-affix"><input id="sd-bag" type="number" min="1" value="25"><span class="affix">lb</span></div></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="sd-germ">Germination %</label><input id="sd-germ" type="number" min="1" max="100" value="90"></div>
          <div class="field"><label for="sd-pur">Purity % (seed kind)</label><input id="sd-pur" type="number" min="1" max="100" value="98"></div>
        </div>
        <div class="calc-result" id="sd-out"></div>
        <details class="acc"><summary>Mix my own blend</summary><div class="acc-body">
          <p class="subtle">MU IPM suggests buying 2–3 single-cultivar tall fescues and mixing equal parts. Enter your recipe:</p>
          <div id="mix-rows"></div>
          <button type="button" class="btn btn-sm" data-mix-add>${icon('plus')}Add component</button>
          <div class="calc-result" style="margin-top:10px" id="mix-out"></div>
        </div></details>
      </article>

      <!-- WATER -->
      <article class="card calc" id="water">
        <h2 class="display" style="font-size:1.3rem;margin:0">${icon('drop')} Sprinkler run time (tuna-can test)</h2>
        <p class="subtle" style="margin:0">Set 4–6 straight-sided cans around the spray pattern, run the sprinkler, and measure the average depth.</p>
        <div class="field-row">
          <div class="field"><label for="w-in">Water collected</label><div class="input-affix"><input id="w-in" type="number" min="0.01" step="0.05" value="0.25"><span class="affix">in</span></div></div>
          <div class="field"><label for="w-min">In this many minutes</label><div class="input-affix"><input id="w-min" type="number" min="1" value="30"><span class="affix">min</span></div></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="w-goal">Goal</label><select id="w-goal"><option value="1">1 in (deep soak)</option><option value="0.5" selected>½ in (survival soak)</option><option value="0.25">¼ in (dormant crown saver)</option><option value="0.1">0.1 in (new seed, light)</option></select></div>
          <div class="field"><label for="w-area">Area watered</label><div class="input-affix"><input id="w-area" type="number" min="1" value="${s.lawnSqFt}"><span class="affix">sq ft</span></div></div>
        </div>
        <div class="calc-result" id="w-out"></div>
        <button type="button" class="btn btn-sm" data-w-save>${icon('check')}Remember my sprinkler rate</button>
      </article>

      <!-- SPRAY -->
      <article class="card calc" id="spray">
        <h2 class="display" style="font-size:1.3rem;margin:0">${icon('spray')} Spray mix</h2>
        <p class="subtle" style="margin:0">Enter the label rate. Labels list it per 1,000 sq ft or per acre.</p>
        <div class="field-row">
          <div class="field"><label for="sp-rate">Label rate</label><input id="sp-rate" type="number" min="0" step="any" value="1"></div>
          <div class="field"><label for="sp-unit">Unit</label><select id="sp-unit"><option value="floz">fl oz</option><option value="tsp">tsp</option><option value="tbsp">tbsp</option><option value="ml">mL</option><option value="oz">oz (dry)</option></select></div>
          <div class="field"><label for="sp-per">Per</label><select id="sp-per"><option value="1000">1,000 sq ft</option><option value="acre">acre</option></select></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="sp-tank">Sprayer size</label><div class="input-affix"><input id="sp-tank" type="number" min="0.25" step="0.25" value="1"><span class="affix">gal</span></div></div>
          <div class="field"><label for="sp-carrier">Spray volume</label><div class="input-affix"><input id="sp-carrier" type="number" min="0.25" step="0.25" value="1"><span class="affix">gal/1,000</span></div><span class="hint">Measure: time how long it takes to spray 1,000 sq ft evenly.</span></div>
          <div class="field"><label for="sp-area">Area to treat</label><div class="input-affix"><input id="sp-area" type="number" min="1" value="${s.lawnSqFt}"><span class="affix">sq ft</span></div></div>
        </div>
        <div class="calc-result" id="sp-out"></div>
        <p class="subtle" style="margin:0">Keep a separate, labeled sprayer for weed killers. Herbicide residue can damage vegetables and shrubs.</p>
      </article>

      <!-- MULCH -->
      <article class="card calc" id="mulch">
        <h2 class="display" style="font-size:1.3rem;margin:0">${icon('leaf')} Mulch, compost &amp; soil</h2>
        <div class="field"><label for="m-mode">Job</label><select id="m-mode">
          <option value="2.5|bed">Bed mulch (2–3 in)</option>
          <option value="0.25|lawn">Compost topdressing after aeration (¼ in)</option>
          <option value="2|amend">Compost worked into a garden bed (2–3 in)</option>
          <option value="10|raised">Fill a raised bed (8–12 in)</option>
        </select></div>
        <div class="field-row">
          <div class="field"><label for="m-area">Area</label><div class="input-affix"><input id="m-area" type="number" min="1" value="${s.bedSqFt}"><span class="affix">sq ft</span></div></div>
          <div class="field"><label for="m-depth">Depth</label><div class="input-affix"><input id="m-depth" type="number" min="0.1" step="0.25" value="2.5"><span class="affix">in</span></div></div>
        </div>
        <div class="calc-result" id="m-out"></div>
      </article>

      <!-- LIME -->
      <article class="card calc" id="lime">
        <h2 class="display" style="font-size:1.3rem;margin:0">${icon('soil')} Lime from your soil test</h2>
        <p class="subtle" style="margin:0">Only lime when your MU soil test calls for it (lawns: salt pH 5.8 or lower). Never put down more than 50 lb per 1,000 sq ft at once.</p>
        <div class="field-row">
          <div class="field"><label for="l-rec">Recommended (from report)</label><div class="input-affix"><input id="l-rec" type="number" min="0" step="5" value="75"><span class="affix">lb/1,000</span></div></div>
          <div class="field"><label for="l-area">Area</label><div class="input-affix"><input id="l-area" type="number" min="1" value="${s.lawnSqFt}"><span class="affix">sq ft</span></div></div>
          <div class="field"><label for="l-bag">Bag</label><div class="input-affix"><input id="l-bag" type="number" min="1" value="40"><span class="affix">lb</span></div></div>
        </div>
        <div class="calc-result" id="l-out"></div>
      </article>

      <!-- GARDEN FERT -->
      <article class="card calc" id="garden-fert">
        <h2 class="display" style="font-size:1.3rem;margin:0">${icon('veg')} Vegetable garden fertilizer</h2>
        <p class="subtle" style="margin:0">With no soil test, MU's default is about 3 lb of 10-10-10 per 100 sq ft worked in before planting. Organic options need more product for the same nitrogen.</p>
        <div class="field-row">
          <div class="field"><label for="g-area">Garden area</label><div class="input-affix"><input id="g-area" type="number" min="1" value="${s.vegSqFt}"><span class="affix">sq ft</span></div></div>
          <div class="field"><label for="g-an">Product analysis</label><select id="g-an"><option value="10-10-10">10-10-10</option><option value="3-4-4">3-4-4 (Espoma Garden-tone)</option><option value="3-4-6">3-4-6 (Espoma Tomato-tone)</option><option value="5-10-5">5-10-5</option></select></div>
        </div>
        <div class="calc-result" id="g-out"></div>
      </article>

      <!-- CONVERT -->
      <article class="card calc" id="convert">
        <h2 class="display" style="font-size:1.3rem;margin:0">${icon('calculator')} Conversions</h2>
        <div class="field-row">
          <div class="field"><label for="c-acre">Per acre</label><input id="c-acre" type="number" step="any" value="8"></div>
          <div class="field"><label for="c-k">= per 1,000 sq ft</label><input id="c-k" type="number" step="any"></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="c-floz">Fluid ounces</label><input id="c-floz" type="number" step="any" value="1"></div>
          <div class="field"><span style="font-weight:600;font-size:.9rem">Equals</span><div id="c-floz-out" class="muted"></div></div>
        </div>
        <ul class="list-plain stack-sm subtle">
          <li>1 in of water on 1,000 sq ft ≈ 623 gallons (MU rounds to 620)</li>
          <li>1 cubic yard = 27 cubic feet ≈ 13½ two-cubic-foot bags</li>
          <li>1 acre = 43,560 sq ft · 1 lb = 16 oz = 454 g</li>
        </ul>
      </article>
    </div>`);

  wireArea();
  wireFert(ferts);
  wireSeed();
  wireWater();
  wireSpray();
  wireMulch();
  wireLime();
  wireGarden();
  wireConvert();

  const h = location.hash.slice(1);
  if (h) setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

/* ---------- area ---------- */
let areaRows = [];
function wireArea() {
  try { areaRows = JSON.parse(localStorage.getItem('kcAlmanac.area') || '[]'); } catch { areaRows = []; }
  if (!areaRows.length) areaRows = [{ shape: 'rect', a: 60, b: 40, sign: 1, label: 'Back yard' }, { shape: 'rect', a: 50, b: 30, sign: 1, label: 'Front yard' }, { shape: 'rect', a: 12, b: 20, sign: -1, label: 'Beds / patio' }];
  const save = () => { try { localStorage.setItem('kcAlmanac.area', JSON.stringify(areaRows)); } catch { /* ignore */ } };
  const area = (r) => (r.shape === 'rect' ? r.a * r.b : r.shape === 'circle' ? Math.PI * (r.a / 2) ** 2 : 0.5 * r.a * r.b);
  const draw = () => {
    render($('#area-rows'), html`${areaRows.map((r, i) => html`<div class="area-row">
      <div class="field"><label for="ar-l-${i}" class="sr-only">Label</label><input id="ar-l-${i}" type="text" data-ar="${i}:label" value="${r.label || ''}" placeholder="${r.shape === 'rect' ? 'Rectangle' : r.shape === 'circle' ? 'Circle' : 'Triangle'}"></div>
      <div class="field"><label for="ar-a-${i}" class="subtle">${r.shape === 'rect' ? 'Length ft' : r.shape === 'circle' ? 'Diameter ft' : 'Base ft'}</label><input id="ar-a-${i}" type="number" min="0" data-ar="${i}:a" value="${r.a}"></div>
      <div class="field">${r.shape !== 'circle' ? html`<label for="ar-b-${i}" class="subtle">${r.shape === 'rect' ? 'Width ft' : 'Height ft'}</label><input id="ar-b-${i}" type="number" min="0" data-ar="${i}:b" value="${r.b}">` : html`<span class="subtle">&nbsp;</span>`}</div>
      <div class="row" style="flex-wrap:nowrap"><button type="button" class="btn btn-sm" data-ar-sign="${i}" title="Add or subtract">${r.sign > 0 ? '+ Add' : '− Subtract'}</button><button type="button" class="icon-btn" data-ar-del="${i}" aria-label="Remove">${icon('trash')}</button></div>
    </div>`)}`);
    drawTotal();
  };
  const drawTotal = () => {
    const total = Math.max(0, areaRows.reduce((a, r) => a + r.sign * area(r), 0));
    render($('#area-out'), html`<span class="big">${fmtNum(total, 0)}<small> sq ft of lawn</small></span><p>${fmtNum(total / 1000, 2)} thousand sq ft · ${fmtNum(total / 43560, 3)} acre</p>
      <div><button type="button" class="btn btn-sm btn-primary" data-ar-use="${Math.round(total)}">${icon('check')}Use as my lawn size</button></div>`);
  };
  on($('#area'), 'input', '[data-ar]', (e, el) => {
    const [i, k] = el.dataset.ar.split(':');
    areaRows[i][k] = k === 'label' ? el.value : Number(el.value) || 0;
    save();
    drawTotal();
  });
  on($('#area'), 'click', '[data-ar-sign]', (e, b) => { const r = areaRows[b.dataset.arSign]; r.sign = -r.sign; save(); draw(); });
  on($('#area'), 'click', '[data-ar-del]', (e, b) => { areaRows.splice(Number(b.dataset.arDel), 1); save(); draw(); });
  on($('#area'), 'click', '[data-area-add]', (e, b) => { areaRows.push({ shape: b.dataset.areaAdd, a: 20, b: 10, sign: 1, label: '' }); save(); draw(); });
  on($('#area'), 'click', '[data-ar-use]', (e, b) => {
    store.setSettings({ lawnSqFt: Number(b.dataset.arUse) });
    toast(`Lawn size set to ${fmtNum(Number(b.dataset.arUse), 0)} sq ft`);
    ['f-area', 'sd-area', 'w-area', 'sp-area', 'l-area'].forEach((id) => { const el = $(`#${id}`); if (el) { el.value = b.dataset.arUse; el.dispatchEvent(new Event('input', { bubbles: true })); } });
  });
  draw();
}

/* ---------- fertilizer ---------- */
function wireFert(ferts) {
  const P = Object.fromEntries(ferts.map((p) => [p.id, p]));
  const card = $('#fertilizer');
  const pick = () => {
    const p = P[$('#f-prod').value];
    if (p) {
      $('#f-an').value = p.analysis;
      if (p.package && p.package.unit === 'lb') $('#f-bag').value = p.package.size;
    }
    draw();
  };
  const draw = () => {
    const an = parseAnalysis($('#f-an').value);
    const pct = an ? an.n : 0;
    const n = val('f-n');
    const area = val('f-area');
    const bag = val('f-bag') || 1;
    if (!pct) { render($('#f-out'), html`<p>Enter an analysis like 32-0-4 (the first number is % nitrogen).</p>`); return; }
    const per = productPer1000(n, pct);
    const tot = productTotal(n, pct, area);
    const bags = tot / bag;
    const p = P[$('#f-prod').value];
    render($('#f-out'), html`<span class="big">${fmtNum(tot, 1)}<small> lb of product</small></span>
      <p>${fmtNum(per, 2)} lb per 1,000 sq ft · about <strong>${fmtNum(Math.ceil(bags * 10) / 10, 1)} bags</strong> of ${fmtNum(bag, 1)} lb (buy ${Math.ceil(bags)}) · supplies ${fmtNum(n * area / 1000, 2)} lb N total.</p>
      <p>Spreader tip: set it to half the label setting and walk the lawn twice, in two directions, to avoid stripes.${p && p.quickRelease ? ' Water quick-release nitrogen in with ¼ in (or apply before rain) to prevent burn.' : ''}</p>`);
    const plan = [['Early Sep', 1], ['Mid Oct', 1], ['Early Nov', 1]];
    const sn = store.settings.nTarget || 3;
    const seasonPlan = sn >= 4 ? [['Mid Apr (optional)', 0.5], ['Early Sep', 1.25], ['Mid Oct', 1.25], ['Early Nov', 1]] : sn <= 2 ? [['Early Sep', 1], ['Early Nov', 1]] : plan;
    const lbs = seasonPlan.map(([, x]) => productTotal(x, pct, area));
    const totalLbs = lbs.reduce((a, b) => a + b, 0);
    render($('#f-season'), html`<div class="table-wrap"><table class="table-compact">
      <thead><tr><th>When</th><th class="num">lb N/1,000</th><th class="num">Product</th></tr></thead>
      <tbody>${seasonPlan.map(([w, x], i) => html`<tr><td>${w}</td><td class="num">${x}</td><td class="num">${fmtNum(lbs[i], 1)} lb</td></tr>`)}
      <tr><td><strong>Season</strong></td><td class="num"><strong>${seasonPlan.reduce((a, [, x]) => a + x, 0)}</strong></td><td class="num"><strong>${fmtNum(totalLbs, 1)} lb ≈ ${Math.ceil(totalLbs / bag)} bags</strong></td></tr></tbody>
    </table></div><p class="subtle">Based on your ${sn} lb N yearly target (Settings). For November, many people switch to a quick-release product like urea (46-0-0).</p>`);
  };
  card.addEventListener('input', (e) => { if (e.target.id !== 'f-prod') draw(); });
  $('#f-prod').addEventListener('change', pick);
  on(card, 'click', '[data-f-log]', () => {
    const an = parseAnalysis($('#f-an').value);
    const p = P[$('#f-prod').value];
    const n = val('f-n');
    addJournal({ date: toISO(today()), cat: 'lawn', type: 'fertilize', title: `Fertilized: ${p ? p.name : $('#f-an').value}`, n, product: p ? p.id : '', amount: +productTotal(n, an ? an.n : 0, val('f-area')).toFixed(1), unit: 'lb', notes: `${n} lb N/1,000 sq ft over ${val('f-area')} sq ft` });
    toast('Logged to your journal: it counts toward this year\'s nitrogen.');
  });
  pick();
}

/* ---------- seed ---------- */
let mixRows = [{ name: 'Tall fescue cultivar A', pct: 30 }, { name: 'Tall fescue cultivar B', pct: 30 }, { name: 'Tall fescue cultivar C', pct: 30 }, { name: 'Kentucky bluegrass', pct: 10 }];
function wireSeed() {
  const card = $('#seed');
  const draw = () => {
    const mode = $('#sd-mode').value;
    if (mode !== 'custom' && document.activeElement !== $('#sd-rate')) $('#sd-rate').value = mode;
    const rate = val('sd-rate');
    const area = val('sd-area');
    const bag = val('sd-bag') || 1;
    const pls = (val('sd-germ') * val('sd-pur')) / 100;
    const base = seedLbs(rate, area);
    const adj = pls > 0 && pls < 85 ? base * (85 / pls) : base;
    render($('#sd-out'), html`<span class="big">${fmtNum(adj, 1)}<small> lb of seed</small></span>
      <p>${fmtNum(rate, 1)} lb/1,000 over ${fmtNum(area, 0)} sq ft = ${fmtNum(base, 1)} lb${adj > base ? `, raised to ${fmtNum(adj, 1)} lb because only ${fmtNum(pls, 0)}% is pure live seed` : ''}. That's <strong>${Math.ceil(adj / bag)} bag${Math.ceil(adj / bag) === 1 ? '' : 's'}</strong> of ${bag} lb.</p>
      <p>Spread half going one direction and half crosswise (MU). Seed right after core aerating so seed lands in the holes.</p>`);
    drawMix(adj);
  };
  const drawMix = (total) => {
    const sum = mixRows.reduce((a, r) => a + (Number(r.pct) || 0), 0);
    render($('#mix-rows'), html`${mixRows.map((r, i) => html`<div class="field-row" style="margin-bottom:6px">
      <div class="field"><input type="text" data-mix="${i}:name" value="${r.name}" aria-label="Component name"></div>
      <div class="field"><div class="input-affix"><input type="number" min="0" max="100" data-mix="${i}:pct" value="${r.pct}" aria-label="Percent"><span class="affix">%</span></div></div>
    </div>`)}`);
    render($('#mix-out'), html`${Math.abs(sum - 100) > 0.5 ? html`<p style="color:var(--warn)">Percentages add up to ${fmtNum(sum, 1)}%.</p>` : ''}
      <ul class="list-plain">${mixRows.map((r) => html`<li><strong>${fmtNum((total * (Number(r.pct) || 0)) / (sum || 100), 1)} lb</strong> ${r.name}</li>`)}</ul>`);
  };
  card.addEventListener('input', (e) => {
    if (e.target.dataset.mix) {
      const [i, k] = e.target.dataset.mix.split(':');
      mixRows[i][k] = k === 'pct' ? Number(e.target.value) : e.target.value;
      const total = Number(($('#sd-out .big')?.textContent || '0').replace(/[^\d.]/g, '')) || 0;
      const sum = mixRows.reduce((a, r) => a + (Number(r.pct) || 0), 0);
      render($('#mix-out'), html`${Math.abs(sum - 100) > 0.5 ? html`<p style="color:var(--warn)">Percentages add up to ${fmtNum(sum, 1)}%.</p>` : ''}<ul class="list-plain">${mixRows.map((r) => html`<li><strong>${fmtNum((total * (Number(r.pct) || 0)) / (sum || 100), 1)} lb</strong> ${r.name}</li>`)}</ul>`);
      return;
    }
    if (e.target.id === 'sd-rate') $('#sd-mode').value = 'custom';
    draw();
  });
  on(card, 'click', '[data-mix-add]', () => { mixRows.push({ name: 'Component', pct: 0 }); draw(); });
  draw();
}

/* ---------- water ---------- */
function wireWater() {
  const card = $('#water');
  const saved = store.settings.sprinklerRate;
  if (saved) { $('#w-in').value = saved; $('#w-min').value = 60; }
  const draw = () => {
    const rate = (val('w-in') / Math.max(1, val('w-min'))) * 60;
    const goal = Number($('#w-goal').value);
    const mins = minutesFor(goal, rate);
    const gal = gallons(goal, val('w-area'));
    const cycles = rate > 0.5 ? Math.ceil(goal / 0.5) : 1;
    render($('#w-out'), html`<span class="big">${fmtNum(mins, 0)}<small> minutes</small></span>
      <p>Your sprinkler puts down about <strong>${fmtNum(rate, 2)} in/hour</strong>. ${goal} in takes ${fmtNum(mins, 0)} minutes per spot${cycles > 1 ? html`. On clay, split that into <strong>${cycles} runs of ~${fmtNum(mins / cycles, 0)} min</strong>, 30 minutes apart (few Missouri lawn soils absorb more than ½ in/hour)` : ''}.</p>
      <p>${fmtNum(gal, 0)} gallons for ${fmtNum(val('w-area'), 0)} sq ft. Water between 4 and 10 a.m.</p>`);
  };
  card.addEventListener('input', draw);
  card.addEventListener('change', draw);
  on(card, 'click', '[data-w-save]', () => {
    const rate = (val('w-in') / Math.max(1, val('w-min'))) * 60;
    store.setSettings({ sprinklerRate: +rate.toFixed(3) });
    toast(`Saved: your sprinkler applies ${fmtNum(rate, 2)} in/hour.`);
  });
  draw();
}

/* ---------- spray ---------- */
const TO_FLOZ = { floz: 1, tsp: 1 / 6, tbsp: 0.5, ml: 1 / 29.5735, oz: 1 };
function wireSpray() {
  const card = $('#spray');
  const draw = () => {
    const unit = $('#sp-unit').value;
    let rate = val('sp-rate');
    if ($('#sp-per').value === 'acre') rate = perAcreToPer1000(rate);
    const tank = val('sp-tank');
    const carrier = Math.max(0.01, val('sp-carrier'));
    const areaPerTank = (tank / carrier) * 1000;
    const perTank = rate * (areaPerTank / 1000);
    const need = rate * (val('sp-area') / 1000);
    const tanks = val('sp-area') / areaPerTank;
    const inTsp = unit === 'oz' ? null : (perTank * TO_FLOZ[unit]) * 6;
    render($('#sp-out'), html`<span class="big">${fmtNum(perTank, 3)}<small> ${unit === 'floz' ? 'fl oz' : unit} per tank</small></span>
      <p>${inTsp != null && unit !== 'tsp' ? `≈ ${fmtNum(inTsp, 2)} tsp · ` : ''}one ${tank}-gal tank covers ${fmtNum(areaPerTank, 0)} sq ft. For ${fmtNum(val('sp-area'), 0)} sq ft you need ${fmtNum(need, 2)} ${unit === 'floz' ? 'fl oz' : unit} total (${fmtNum(tanks, 1)} tanks).</p>
      <p>Rate used: ${fmtNum(rate, 3)} ${unit === 'floz' ? 'fl oz' : unit} per 1,000 sq ft (${fmtNum(per1000ToPerAcre(rate), 1)} per acre).</p>`);
  };
  card.addEventListener('input', draw);
  card.addEventListener('change', draw);
  draw();
}

/* ---------- mulch ---------- */
function wireMulch() {
  const card = $('#mulch');
  $('#m-mode').addEventListener('change', () => {
    const [d, kind] = $('#m-mode').value.split('|');
    $('#m-depth').value = d;
    if (kind === 'lawn') $('#m-area').value = store.settings.lawnSqFt;
    else if (kind === 'amend' || kind === 'raised') $('#m-area').value = store.settings.vegSqFt;
    else $('#m-area').value = store.settings.bedSqFt;
    draw();
  });
  const draw = () => {
    const cf = cubicFeet(val('m-area'), val('m-depth'));
    const cy = cubicYards(val('m-area'), val('m-depth'));
    render($('#m-out'), html`<span class="big">${fmtNum(cy, 2)}<small> cubic yards</small></span>
      <p>${fmtNum(cf, 1)} cu ft = <strong>${Math.ceil(cf / 2)} bags</strong> of 2 cu ft or <strong>${Math.ceil(cf / 3)} bags</strong> of 3 cu ft. Past about 2 yards, bulk delivery from a local yard is usually cheaper.</p>`);
  };
  card.addEventListener('input', draw);
  draw();
}

/* ---------- lime ---------- */
function wireLime() {
  const card = $('#lime');
  const draw = () => {
    const rec = val('l-rec');
    const apps = Math.max(1, Math.ceil(rec / 50));
    const per = rec / apps;
    const total = (rec * val('l-area')) / 1000;
    render($('#l-out'), rec ? html`<span class="big">${fmtNum(total, 0)}<small> lb total · ${Math.ceil(total / (val('l-bag') || 40))} bags</small></span>
      <p>${apps > 1 ? html`Split into <strong>${apps} applications</strong> of ${fmtNum(per, 0)} lb/1,000 sq ft (MU max is 50 lb at a time), a few months apart, fall and winter first.` : 'One application, ideally in fall or early winter.'} Pelletized lime spreads cleanly through a broadcast spreader.</p>` : html`<p>No lime needed.</p>`);
  };
  card.addEventListener('input', draw);
  draw();
}

/* ---------- garden fertilizer ---------- */
function wireGarden() {
  const card = $('#garden-fert');
  const draw = () => {
    const area = val('g-area');
    const an = parseAnalysis($('#g-an').value);
    const nPer100 = 0.3; // 3 lb of 10-10-10 per 100 sq ft = 0.3 lb N
    const lb = ((nPer100 * 100) / an.n) * (area / 100);
    render($('#g-out'), html`<span class="big">${fmtNum(lb, 1)}<small> lb of ${$('#g-an').value}</small></span>
      <p>That matches the nitrogen in 3 lb of 10-10-10 per 100 sq ft, about ${fmtNum(lb / (area / 100), 1)} lb per 100 sq ft. Work it into the top few inches before planting. Heavy feeders (tomatoes, peppers, corn, squash) get a side-dressing when fruit sets. A soil test tells you whether you need the phosphorus at all.</p>`);
  };
  card.addEventListener('input', draw);
  card.addEventListener('change', draw);
  draw();
}

/* ---------- conversions ---------- */
function wireConvert() {
  const a = $('#c-acre');
  const k = $('#c-k');
  a.addEventListener('input', () => { k.value = +perAcreToPer1000(num(a)).toFixed(4); });
  k.addEventListener('input', () => { a.value = +per1000ToPerAcre(num(k)).toFixed(3); });
  k.value = +perAcreToPer1000(num(a)).toFixed(4);
  const f = $('#c-floz');
  const drawF = () => render($('#c-floz-out'), html`${fmtNum(num(f) * 6, 2)} tsp · ${fmtNum(num(f) * 2, 2)} tbsp · ${fmtNum(num(f) * 29.5735, 1)} mL`);
  f.addEventListener('input', drawF);
  drawF();
}

main().catch((err) => { console.error(err); render(app, errorBlock(err)); });
