// Calendar: month-by-month plan with filters, checklists, print and .ics export.
import { mountChrome, setTitle, loadingBlock, errorBlock, toast, makeDialog } from '../core/ui.js';
import { html, raw, render, $, $$, on, hashParts, fmtNum, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { loadData, byId } from '../core/data.js';
import { store, isDone, uid } from '../core/store.js';
import { today, monthName, monthShort, MON, toISO, fromISO, mmdd, fromMMDD } from '../core/dates.js';
import {
  taskCard, wireTasks, visibleTasks, sortTasks, taskMonths, datedWindows, revealTask, PRIORITY, CATS, CAT_ORDER,
} from '../core/tasks.js';
import { taskEvents, downloadICS } from '../core/ics.js';

mountChrome('calendar');
setTitle('Calendar');
const app = $('#app');
render(app, loadingBlock('Loading the calendar…'));

const NOW = today();
const UI_KEY = 'kcAlmanac.ui.calendar';
const ui = (() => {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { /* private mode */ }
  return {
    month: NOW.getMonth() + 1,
    year: NOW.getFullYear(),
    view: 'month',
    cats: new Set(saved.cats || CAT_ORDER),
    pris: new Set(saved.pris || ['critical', 'recommended', 'optional']),
    hideDone: !!saved.hideDone,
    group: saved.group || 'category',
    q: '',
  };
})();
const saveUI = () => {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ cats: [...ui.cats], pris: [...ui.pris], hideDone: ui.hideDone, group: ui.group })); } catch { /* ignore */ }
};

let D, P, S, T;
const ctx = () => ({ year: ui.year, P, S, T, settings: store.settings, date: NOW });

function allTasks() {
  const list = visibleTasks(D.tasks, store.settings);
  for (const t of list) T[t.id] = t;
  return list;
}
const inMonth = (t, m) => taskMonths(t, store.settings).includes(m);

function parseRoute() {
  const [kind, arg] = hashParts();
  if (kind === 'month' && +arg >= 1 && +arg <= 12) { ui.view = 'month'; ui.month = +arg; return null; }
  if (kind === 'year') { ui.view = 'year'; return null; }
  if (kind === 'task' && arg) {
    const t = T[arg] || allTasks().find((x) => x.id === arg);
    if (t) {
      ui.view = 'month';
      const ms = taskMonths(t, store.settings);
      ui.month = ms.includes(NOW.getMonth() + 1) ? NOW.getMonth() + 1 : ms[0];
      // make sure filters don't hide it
      ui.cats.add(t.category);
      ui.pris.add(t.priority);
      ui.q = '';
      return t.id;
    }
  }
  return null;
}

async function main() {
  D = await loadData('tasks', 'products', 'sources', 'months', 'climate');
  P = byId(D.products);
  S = byId(D.sources);
  T = byId(D.tasks);
  allTasks();
  const target = parseRoute();
  drawShell();
  draw();
  if (target) setTimeout(() => revealTask(app, target), 60);

  window.addEventListener('hashchange', () => {
    const t = parseRoute();
    draw();
    if (t) setTimeout(() => revealTask(app, t), 60);
  });
  store.subscribe((s, reason) => { if (!['note'].includes(reason)) draw(); });
  document.addEventListener('settings-closed', draw);
}

function drawShell() {
  render(app, html`
    <section class="page-head">
      <span class="eyebrow">Month-by-month plan</span>
      <h1>Calendar</h1>
      <p class="lede">Every lawn, bed, vegetable and yard task for the Kansas City area, with the cue that tells you when. Check tasks off as you go; your progress is saved in this browser and resets each year.</p>
    </section>
    <div id="cal"></div>`);
  wireTasks(app, ctx, () => draw());

  on(app, 'click', '[data-month]', (e, b) => { e.preventDefault(); location.hash = `#/month/${b.dataset.month}`; });
  on(app, 'click', '[data-step]', (e, b) => {
    let m = ui.month + Number(b.dataset.step);
    if (m < 1) { m = 12; ui.year -= 1; }
    if (m > 12) { m = 1; ui.year += 1; }
    location.hash = `#/month/${m}`;
  });
  on(app, 'click', '[data-view]', (e, b) => { location.hash = b.dataset.view === 'year' ? '#/year' : `#/month/${ui.month}`; });
  on(app, 'click', '[data-fcat]', (e, b) => {
    const c = b.dataset.fcat;
    if (c === 'all') ui.cats = new Set(CAT_ORDER);
    else if (ui.cats.size === CAT_ORDER.length) ui.cats = new Set([c]);
    else if (ui.cats.has(c)) { ui.cats.delete(c); if (!ui.cats.size) ui.cats = new Set(CAT_ORDER); }
    else ui.cats.add(c);
    saveUI(); draw();
  });
  on(app, 'click', '[data-fpri]', (e, b) => {
    const p = b.dataset.fpri;
    if (ui.pris.has(p) && ui.pris.size > 1) ui.pris.delete(p); else ui.pris.add(p);
    saveUI(); draw();
  });
  on(app, 'change', '[data-hide-done]', (e, el) => { ui.hideDone = el.checked; saveUI(); draw(); });
  on(app, 'click', '[data-group]', (e, b) => { ui.group = b.dataset.group; saveUI(); draw(); });
  on(app, 'input', '[data-q]', debounce((e) => { ui.q = e.target.value; drawTasksOnly(); }, 150));
  on(app, 'change', '[data-year]', (e, el) => { ui.year = Number(el.value); draw(); });
  on(app, 'click', '[data-act]', (e, b) => {
    const a = b.dataset.act;
    if (a === 'print-month') printMonth();
    if (a === 'print-year') printYear();
    if (a === 'ics-month') icsMonth();
    if (a === 'ics-year') icsYear();
    if (a === 'add-task') addTaskDialog();
    if (a === 'expand-all') $$('.task-details', app).forEach((d) => { d.hidden = false; });
    if (a === 'collapse-all') $$('.task-details', app).forEach((d) => { d.hidden = true; });
  });
  on(app, 'click', '[data-cell]', (e, b) => {
    const [cat, m] = b.dataset.cell.split(':');
    ui.cats = new Set([cat]);
    saveUI();
    location.hash = `#/month/${m}`;
  });
}

function monthCounts(m) {
  const list = allTasks().filter((t) => inMonth(t, m));
  const done = list.filter((t) => isDone(ui.year, t.id)).length;
  const cats = CAT_ORDER.filter((c) => list.some((t) => t.category === c));
  return { total: list.length, done, cats };
}

function filtered(m) {
  const q = ui.q.trim().toLowerCase();
  return allTasks().filter((t) => inMonth(t, m)
    && ui.cats.has(t.category)
    && ui.pris.has(t.priority)
    && !(ui.hideDone && isDone(ui.year, t.id))
    && (!q || [t.title, t.summary, t.details, (t.tags || []).join(' ')].join(' ').toLowerCase().includes(q)));
}

function draw() {
  const el = $('#cal');
  if (!el) return;
  if (ui.view === 'year') { drawYear(el); return; }
  const m = ui.month;
  const mo = D.months.months.find((x) => x.m === m);
  const cl = D.climate.monthly[m - 1];
  const isNow = m === NOW.getMonth() + 1 && ui.year === NOW.getFullYear();
  const years = [NOW.getFullYear() - 1, NOW.getFullYear(), NOW.getFullYear() + 1];
  const mc = monthCounts(m);
  const pct = mc.total ? Math.round((mc.done / mc.total) * 100) : 0;
  const all = allTasks();
  const countCat = (c) => all.filter((t) => inMonth(t, m) && t.category === c && ui.pris.has(t.priority)).length;
  const countPri = (p) => all.filter((t) => inMonth(t, m) && t.priority === p && ui.cats.has(t.category)).length;

  render(el, html`
    <div class="month-nav">
      <button type="button" class="btn btn-icon" data-step="-1" aria-label="Previous month">${icon('chevronLeft')}</button>
      <h2>${monthName(m)} <span class="muted" style="font-weight:500">${ui.year}</span></h2>
      <button type="button" class="btn btn-icon" data-step="1" aria-label="Next month">${icon('chevronRight')}</button>
    </div>
    <div class="month-grid" role="tablist" aria-label="Choose a month">
      ${MON.map((name, i) => {
        const c = monthCounts(i + 1);
        const now = i + 1 === NOW.getMonth() + 1;
        return html`<button type="button" role="tab" class="month-btn ${now ? 'is-now' : ''}" data-month="${i + 1}" aria-selected="${String(i + 1 === m)}" title="${monthName(i + 1)}: ${c.done} of ${c.total} done${now ? ' (this month)' : ''}">
          ${name}
          <span class="mdots">${c.cats.map((cat) => html`<i class="cat-${cat}"></i>`)}</span>
          <span class="mprog"><i style="width:${c.total ? (c.done / c.total) * 100 : 0}%"></i></span>
        </button>`;
      })}
    </div>

    <section class="section">
      <div class="hero cat-${mo?.accent || 'lawn'}" style="padding:18px">
        <div class="row-between" style="align-items:flex-start">
          <div style="flex:1;min-width:240px">
            <span class="eyebrow">${isNow ? 'This month' : monthName(m)} · ${mo?.headline || ''}</span>
            <div class="bottom-line">${icon('sparkle')}<div><b>Bottom line</b><span>${mo?.bottomLine || ''}</span></div></div>
            ${mo?.summary ? html`<p style="margin:12px 0 0;color:var(--ink-2)">${mo.summary}</p>` : ''}
          </div>
          <div class="ring" style="--p:${pct};--size:72px" role="img" aria-label="${mc.done} of ${mc.total} tasks done"><span>${pct}%</span></div>
        </div>
        <div class="hero-stats">
          <span class="pill" title="KCI 1991–2020 normal">${icon('thermo')}Avg ${cl.hi}° / ${cl.lo}°F</span>
          <span class="pill" title="KCI 1991–2020 normal">${icon('rain')}${cl.precip} in rain</span>
          ${cl.days90 ? html`<span class="pill">${icon('flame')}~${cl.days90} days ≥90°F</span>` : ''}
          ${mo?.frost ? html`<span class="pill">${icon('snow')}${mo.frost}</span>` : ''}
          <label class="pill" style="gap:4px">Year <select data-year aria-label="Checklist year" style="min-height:0;padding:0 4px;border:0;background:transparent;font:inherit;width:auto">${years.map((y) => html`<option ${y === ui.year ? raw('selected') : ''}>${y}</option>`)}</select></label>
        </div>
      </div>
    </section>

    <div class="toolbar no-print" role="region" aria-label="Filters">
      <div class="toolbar-row">
        <span class="toolbar-label">Area</span>
        <div class="chips">
          <button type="button" class="chip" data-fcat="all" aria-pressed="${String(ui.cats.size === CAT_ORDER.length)}">All</button>
          ${CAT_ORDER.map((c) => html`<button type="button" class="chip cat-${c}" data-fcat="${c}" aria-pressed="${String(ui.cats.has(c) && ui.cats.size !== CAT_ORDER.length)}"><span class="dot"></span>${CATS[c].label}<span class="count">${countCat(c)}</span></button>`)}
        </div>
      </div>
      <div class="toolbar-row">
        <span class="toolbar-label">Priority</span>
        <div class="chips">${Object.entries(PRIORITY).map(([k, v]) => html`<button type="button" class="chip" data-fpri="${k}" aria-pressed="${String(ui.pris.has(k))}">${v.label}<span class="count">${countPri(k)}</span></button>`)}</div>
      </div>
      <div class="toolbar-row">
        <div class="search-input" style="flex:1;min-width:200px">${icon('search')}<input type="search" data-q placeholder="Filter this month…" value="${ui.q}" aria-label="Filter tasks"></div>
        <label class="switch"><input type="checkbox" data-hide-done ${ui.hideDone ? raw('checked') : ''}><span class="track"></span>Hide done</label>
        <div class="seg" role="group" aria-label="Group by"><button type="button" data-group="category" aria-pressed="${String(ui.group === 'category')}">By area</button><button type="button" data-group="timing" aria-pressed="${String(ui.group === 'timing')}">By date</button></div>
      </div>
      <div class="toolbar-row">
        <button type="button" class="btn btn-sm" data-act="add-task">${icon('plus')}Add my own task</button>
        <button type="button" class="btn btn-sm" data-act="ics-month">${icon('calendar')}Add month to calendar</button>
        <button type="button" class="btn btn-sm" data-act="print-month">${icon('print')}Print checklist</button>
        <button type="button" class="btn btn-sm btn-ghost" data-act="expand-all">Expand all</button>
        <button type="button" class="btn btn-sm btn-ghost" data-view="year">${icon('grid')}Year view</button>
      </div>
    </div>
    <div id="tasks"></div>`);
  drawTasksOnly();
}

function drawTasksOnly() {
  const el = $('#tasks');
  if (!el) return;
  const m = ui.month;
  const list = sortTasks(filtered(m), ui.year, store.settings);
  const c = ctx();
  if (!list.length) {
    render(el, html`<div class="empty">${icon('filter')}<p style="margin:0">No tasks match these filters.</p></div>`);
    return;
  }
  if (ui.group === 'timing') {
    const buckets = [['Early', 1, 10], ['Mid', 11, 20], ['Late', 21, 31]];
    const startDay = (t) => {
      if (!t.window) return 0;
      const w = datedWindows(t, ui.year, store.settings)[0];
      return w.start.getMonth() + 1 === m ? w.start.getDate() : 0;
    };
    const whole = list.filter((t) => startDay(t) === 0);
    render(el, html`
      ${whole.length ? html`<div class="task-group"><div class="task-group-head"><h3>${icon('calendar')}All month / continuing</h3><span class="count">${whole.length}</span></div><div class="task-list">${whole.map((t) => taskCard(t, { ...c, showCat: true }))}</div></div>` : ''}
      ${buckets.map(([label, a, b]) => {
        const g = list.filter((t) => { const d = startDay(t); return d >= a && d <= b; });
        return g.length ? html`<div class="task-group"><div class="task-group-head"><h3>${icon('clock')}${label} ${monthName(m)} <span class="subtle">(starts ${monthShort(m)} ${a}–${b})</span></h3><span class="count">${g.length}</span></div><div class="task-list">${g.map((t) => taskCard(t, { ...c, showCat: true }))}</div></div>` : '';
      })}`);
    return;
  }
  render(el, html`${CAT_ORDER.filter((cat) => list.some((t) => t.category === cat)).map((cat) => {
    const g = list.filter((t) => t.category === cat);
    const done = g.filter((t) => isDone(ui.year, t.id)).length;
    return html`<section class="task-group cat-${cat}">
      <div class="task-group-head"><span class="gi">${icon(CATS[cat].icon)}</span><h3>${CATS[cat].label}</h3><span class="count">${done}/${g.length} done</span></div>
      <div class="task-list">${g.map((t) => taskCard(t, c))}</div>
    </section>`;
  })}`);
}

function drawYear(el) {
  const all = allTasks();
  const nowM = NOW.getMonth() + 1;
  const cell = (cat, m) => {
    const list = all.filter((t) => t.category === cat && inMonth(t, m));
    const crit = list.filter((t) => t.priority === 'critical').length;
    const heat = list.length === 0 ? 0 : list.length <= 2 ? 1 : list.length <= 5 ? 2 : 3;
    return html`<button type="button" class="cat-${cat} ${m === nowM ? 'is-now' : ''}" data-cell="${cat}:${m}" data-heat="${heat}" title="${CATS[cat].label}, ${monthName(m)}: ${list.length} tasks">
      <span class="n">${list.length || '·'}</span>${crit ? html`<span class="c">${crit} key</span>` : ''}</button>`;
  };
  render(el, html`
    <div class="row-between" style="margin-bottom:12px">
      <h2 style="margin:0">The whole year</h2>
      <div class="btn-group">
        <button type="button" class="btn btn-sm" data-view="month">${icon('list')}Month view</button>
        <button type="button" class="btn btn-sm" data-act="ics-year">${icon('calendar')}Add all to calendar</button>
        <button type="button" class="btn btn-sm" data-act="print-year">${icon('print')}Print the plan</button>
      </div>
    </div>
    <p class="subtle">Tap a cell to open that month filtered to one area. Numbers count tasks; red counts are key tasks.</p>
    <div class="table-wrap" style="padding:10px">
      <div class="matrix">
        <span></span>${MON.map((n, i) => html`<span class="mh" style="${i + 1 === nowM ? 'color:var(--brand-ink)' : ''}">${n}</span>`)}
        ${CAT_ORDER.map((cat) => html`<span class="mr cat-${cat}">${icon(CATS[cat].icon)}${CATS[cat].label}</span>${MON.map((n, i) => cell(cat, i + 1))}`)}
      </div>
    </div>
    <section class="section">
      <h2>Key tasks by month</h2>
      <div class="grid-auto">
        ${D.months.months.map((mo) => {
          const crit = sortTasks(all.filter((t) => inMonth(t, mo.m) && t.priority === 'critical'), ui.year, store.settings);
          return html`<article class="card card-tight ${mo.m === nowM ? '' : 'is-flat'}" style="${mo.m === nowM ? 'border-color:var(--brand)' : ''}">
            <h3 style="margin:0 0 4px"><a href="#/month/${mo.m}">${monthName(mo.m)}</a></h3>
            <p class="subtle" style="margin:0 0 8px">${mo.bottomLine}</p>
            ${crit.length ? html`<ul class="list-check" style="font-size:.9rem">${crit.map((t) => html`<li class="${isDone(ui.year, t.id) ? 'muted' : ''}"><a href="#/task/${t.id}">${t.title}</a></li>`)}</ul>` : html`<p class="subtle" style="margin:0">No key tasks; a light month.</p>`}
          </article>`;
        })}
      </div>
    </section>`);
}

/* ---------- export / print ---------- */
function icsMonth() {
  const list = filtered(ui.month);
  downloadICS(`kc-yard-${MON[ui.month - 1].toLowerCase()}.ics`, taskEvents(list, ui.year, store.settings), `KC yard: ${monthName(ui.month)}`);
  toast(`${list.length} reminders exported. Open the file to add them (they repeat yearly).`);
}
function icsYear() {
  const list = allTasks().filter((t) => ui.cats.has(t.category) && ui.pris.has(t.priority));
  downloadICS('kc-lawn-garden-year.ics', taskEvents(list, ui.year, store.settings), 'KC Lawn & Garden Almanac');
  toast(`${list.length} yearly reminders exported.`);
}
function printMonth() {
  document.body.classList.add('print-expand');
  window.print();
  setTimeout(() => document.body.classList.remove('print-expand'), 500);
}
function printYear() {
  const c = ctx();
  const holder = document.createElement('div');
  holder.className = 'print-only';
  holder.id = 'print-root';
  const all = allTasks();
  render(holder, html`${D.months.months.map((mo) => {
    const list = sortTasks(all.filter((t) => inMonth(t, mo.m) && ui.cats.has(t.category) && ui.pris.has(t.priority)), ui.year, store.settings);
    return html`<section class="print-month"><h2>${monthName(mo.m)}: ${mo.bottomLine}</h2><div class="task-list">${list.map((t) => taskCard(t, { ...c, compact: true, showCat: true }))}</div></section>`;
  })}`);
  const cal = $('#cal');
  cal.style.display = 'none';
  $('.page-head').style.display = 'none';
  app.appendChild(holder);
  window.print();
  setTimeout(() => { holder.remove(); cal.style.display = ''; $('.page-head').style.display = ''; }, 500);
}

/* ---------- custom tasks ---------- */
function addTaskDialog() {
  const dlg = makeDialog('add-task-dlg');
  const m = ui.month;
  render(dlg, html`<form>
    <div class="dlg-head"><h2>Add my own task</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="dlg-body stack">
      <div class="field"><label for="ct-title">Task</label><input id="ct-title" name="title" type="text" required placeholder="e.g. Fertilize the fig tree"></div>
      <div class="field-row">
        <div class="field"><label for="ct-cat">Area</label><select id="ct-cat" name="category">${CAT_ORDER.map((c) => html`<option value="${c}">${CATS[c].label}</option>`)}</select></div>
        <div class="field"><label for="ct-pri">Priority</label><select id="ct-pri" name="priority"><option value="recommended">Recommended</option><option value="critical">Key task</option><option value="optional">Optional</option></select></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="ct-start">Start</label><input id="ct-start" name="start" type="date" value="${toISO(new Date(ui.year, m - 1, 1))}"></div>
        <div class="field"><label for="ct-end">End</label><input id="ct-end" name="end" type="date" value="${toISO(new Date(ui.year, m - 1, 15))}"></div>
      </div>
      <div class="field"><label for="ct-details">Details</label><textarea id="ct-details" name="details" placeholder="How, what product, anything to remember"></textarea></div>
      <p class="subtle" style="margin:0">It repeats every year on the same dates and is saved in this browser (include it in backups from the Journal page).</p>
    </div>
    <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn btn-primary">${icon('plus')}Add task</button></div>
  </form>`);
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  $('form', dlg).addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const title = String(fd.get('title') || '').trim();
    if (!title) return;
    const s = fromISO(String(fd.get('start')));
    let en = fromISO(String(fd.get('end') || fd.get('start')));
    if (en < s) en = s;
    const start = mmdd(s);
    const end = mmdd(en);
    const months = [];
    for (let k = s.getMonth() + 1, guard = 0; guard < 12; guard++) { months.push(k); if (k === en.getMonth() + 1) break; k = (k % 12) + 1; }
    const task = { id: `my-${uid()}`, title, category: fd.get('category'), priority: fd.get('priority'), months, window: { start, end }, details: String(fd.get('details') || ''), custom: true };
    store.update((st) => { st.custom.push(task); }, 'custom');
    dlg.close();
    toast('Task added');
  });
  dlg.showModal();
  $('#ct-title', dlg).focus();
}

main().catch((err) => { console.error(err); render(app, errorBlock(err)); });
