// Shared "Log it" dialog for the journal: fertilizer (with lb N), seeding,
// sprays, watering, rain-gauge readings, harvests, soil tests and notes.
import { html, raw, render, $, on } from './dom.js';
import { icon } from './icons.js';
import { store, addJournal, updateJournal, setDone } from './store.js';
import { toISO, today } from './dates.js';
import { makeDialog, toast } from './ui.js';
import { loadData } from './data.js';

export const LOG_TYPES = [
  { id: 'note', label: 'Note / observation', icon: 'journal' },
  { id: 'task', label: 'Task done', icon: 'check' },
  { id: 'mow', label: 'Mowed', icon: 'mower', cat: 'lawn', fields: ['height'] },
  { id: 'fertilize', label: 'Fertilized', icon: 'sprout', fields: ['n', 'product', 'amount'] },
  { id: 'seed', label: 'Seeded / overseeded', icon: 'seed', cat: 'lawn', fields: ['product', 'amount'] },
  { id: 'weed', label: 'Weed control', icon: 'spray', fields: ['product'] },
  { id: 'pest', label: 'Insect / disease treatment', icon: 'bug', fields: ['product'] },
  { id: 'water', label: 'Watered (hose / sprinkler)', icon: 'drop', fields: ['inches'] },
  { id: 'rain', label: 'Rain gauge reading', icon: 'rain', cat: 'yard', fields: ['inches'] },
  { id: 'plant', label: 'Planted / sowed', icon: 'shovel', fields: ['crop'] },
  { id: 'harvest', label: 'Harvest', icon: 'basket', cat: 'veg', fields: ['crop', 'amount'] },
  { id: 'prune', label: 'Pruned', icon: 'scissors', cat: 'beds' },
  { id: 'soil', label: 'Soil test results', icon: 'soil', fields: ['soil'] },
  { id: 'buy', label: 'Purchase', icon: 'cart', fields: ['product', 'cost'] },
];
export const LOG_TYPE = Object.fromEntries(LOG_TYPES.map((t) => [t.id, t]));
export const LOG_CATS = [['lawn', 'Lawn'], ['beds', 'Beds'], ['veg', 'Veggies'], ['yard', 'Yard & trees']];

let cache = null;
async function refs() {
  if (!cache) {
    cache = await loadData('products', 'crops').catch(() => ({ products: [], crops: [] }));
  }
  return cache;
}

/**
 * Open the log dialog. prefill may include any entry field; pass prefill.id
 * to edit an existing entry.
 */
export async function openLogDialog(prefill = {}, { onSave } = {}) {
  const { products, crops } = await refs();
  const dlg = makeDialog('log-dlg');
  const editing = !!prefill.id;
  const e = {
    date: toISO(today()), cat: 'lawn', type: 'note', title: '', notes: '',
    ...prefill,
  };
  if (!prefill.cat && LOG_TYPE[e.type]?.cat) e.cat = LOG_TYPE[e.type].cat;
  let markDone = !!e.taskId && !editing;

  const draw = () => {
    const tdef = LOG_TYPE[e.type] || LOG_TYPE.note;
    const f = new Set(tdef.fields || []);
    const unitOpts = ['lb', 'oz', 'count', 'bunch', 'qt', 'pint', 'gal'];
    const prodOpts = products.slice().sort((a, b) => a.name.localeCompare(b.name));
    render(dlg, html`<form class="log-form" novalidate>
      <div class="dlg-head"><h2>${editing ? 'Edit entry' : 'Log it'}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="dlg-body stack">
        <div class="field-row">
          <div class="field"><label for="lg-date">Date</label><input id="lg-date" type="date" name="date" value="${e.date}" required></div>
          <div class="field"><label for="lg-type">What</label>
            <select id="lg-type" name="type">${LOG_TYPES.map((t) => html`<option value="${t.id}" ${e.type === t.id ? raw('selected') : ''}>${t.label}</option>`)}</select>
          </div>
          <div class="field"><label for="lg-cat">Area</label>
            <select id="lg-cat" name="cat">${LOG_CATS.map(([v, l]) => html`<option value="${v}" ${e.cat === v ? raw('selected') : ''}>${l}</option>`)}</select>
          </div>
        </div>
        <div class="field"><label for="lg-title">Title</label><input id="lg-title" type="text" name="title" value="${e.title}" placeholder="${tdef.label}"></div>

        ${f.has('n') ? html`<div class="field-row">
          <div class="field"><label for="lg-n">Nitrogen applied</label><div class="input-affix"><input id="lg-n" type="number" step="0.05" min="0" name="n" value="${e.n ?? ''}"><span class="affix">lb N / 1,000 sq ft</span></div>
          <span class="hint">Not sure? Use the <a href="tools.html#fertilizer">fertilizer calculator</a>.</span></div>
        </div>` : ''}
        ${f.has('product') ? html`<div class="field"><label for="lg-prod">Product</label>
          <select id="lg-prod" name="product"><option value="">(none / other)</option>${prodOpts.map((p) => html`<option value="${p.id}" ${e.product === p.id ? raw('selected') : ''}>${p.name}</option>`)}</select></div>` : ''}
        ${f.has('crop') ? html`<div class="field"><label for="lg-crop">Crop</label>
          <select id="lg-crop" name="crop"><option value="">(choose)</option>${crops.map((c) => html`<option value="${c.id}" ${e.crop === c.id ? raw('selected') : ''}>${c.name}</option>`)}</select></div>` : ''}
        ${f.has('amount') ? html`<div class="field-row">
          <div class="field"><label for="lg-amt">Amount</label><input id="lg-amt" type="number" step="any" min="0" name="amount" value="${e.amount ?? ''}"></div>
          <div class="field"><label for="lg-unit">Unit</label><select id="lg-unit" name="unit">${unitOpts.map((u) => html`<option ${(e.unit || 'lb') === u ? raw('selected') : ''}>${u}</option>`)}</select></div>
        </div>` : ''}
        ${f.has('inches') ? html`<div class="field"><label for="lg-in">${e.type === 'rain' ? 'Rain in the gauge' : 'Water applied'}</label><div class="input-affix"><input id="lg-in" type="number" step="0.01" min="0" name="inches" value="${e.inches ?? ''}"><span class="affix">inches</span></div>
          <span class="hint">${e.type === 'rain' ? 'Your gauge overrides the weather model for that day in the drought tracker.' : 'Measure with a straight-sided can (tuna can) under the sprinkler.'}</span></div>` : ''}
        ${f.has('height') ? html`<div class="field"><label for="lg-h">Mowing height</label><div class="input-affix"><input id="lg-h" type="number" step="0.25" min="1" max="6" name="height" value="${e.height ?? ''}"><span class="affix">inches</span></div></div>` : ''}
        ${f.has('cost') ? html`<div class="field"><label for="lg-cost">Cost</label><div class="input-affix"><input id="lg-cost" type="number" step="0.01" min="0" name="cost" value="${e.cost ?? ''}"><span class="affix">$</span></div></div>` : ''}
        ${f.has('soil') ? html`<div class="field-row">
          <div class="field"><label for="lg-ph">pH (MU reports salt pH, "pHs")</label><input id="lg-ph" type="number" step="0.1" min="3" max="10" name="ph" value="${e.ph ?? ''}"></div>
          <div class="field"><label for="lg-p">Phosphorus (lb/acre)</label><input id="lg-p" type="number" step="1" min="0" name="p" value="${e.p ?? ''}"></div>
          <div class="field"><label for="lg-k">Potassium (lb/acre)</label><input id="lg-k" type="number" step="1" min="0" name="k" value="${e.k ?? ''}"></div>
          <div class="field"><label for="lg-om">Organic matter (%)</label><input id="lg-om" type="number" step="0.1" min="0" name="om" value="${e.om ?? ''}"></div>
        </div>` : ''}
        <div class="field"><label for="lg-notes">Notes</label><textarea id="lg-notes" name="notes" placeholder="Details, rates, weather, results…">${e.notes || ''}</textarea></div>
        ${e.taskId && !editing ? html`<label class="switch"><input type="checkbox" data-markdone ${markDone ? raw('checked') : ''}><span class="track"></span><span>Also check off the task</span></label>` : ''}
      </div>
      <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary">${icon('check')}${editing ? 'Save' : 'Add to journal'}</button></div>
    </form>`);
  };
  draw();

  const read = () => {
    const form = $('form', dlg);
    const fd = new FormData(form);
    for (const [k, v] of fd.entries()) e[k] = v;
    for (const k of ['n', 'inches', 'amount', 'cost', 'height', 'ph', 'p', 'k', 'om']) {
      if (k in e) e[k] = e[k] === '' || e[k] == null ? undefined : Number(e[k]);
    }
  };

  if (!dlg.dataset.wired) {
    dlg.dataset.wired = '1';
    on(dlg, 'click', '[data-close]', () => dlg.close());
  }
  // (re)bind per open — handlers reference this call's closure
  dlg.onchange = (ev) => {
    if (ev.target.name === 'type') {
      read();
      if (LOG_TYPE[e.type]?.cat) e.cat = LOG_TYPE[e.type].cat;
      draw();
    }
    if (ev.target.matches('[data-markdone]')) markDone = ev.target.checked;
  };
  dlg.onsubmit = (ev) => {
    ev.preventDefault();
    read();
    if (!e.date) { toast('Pick a date'); return; }
    const entry = Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && v !== ''));
    if (!entry.title) entry.title = LOG_TYPE[entry.type]?.label || 'Note';
    if (editing) updateJournal(entry.id, entry);
    else addJournal(entry);
    if (markDone && entry.taskId) setDone(Number(entry.date.slice(0, 4)), entry.taskId, true);
    dlg.close();
    toast(editing ? 'Entry updated' : 'Added to your journal');
    onSave?.(entry);
    document.dispatchEvent(new CustomEvent('journal-changed'));
  };
  dlg.showModal();
}
