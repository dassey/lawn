// Today: this week's plan (each task on its best day of the forecast, see
// planner.js) or the plain in-season list, what's coming, live conditions,
// nitrogen tracker.
import { mountChrome, setTitle, loadingBlock, errorBlock, toast } from '../core/ui.js';
import { html, raw, render, $, on, fmtNum } from '../core/dom.js';
import { icon, wxIcon } from '../core/icons.js';
import { loadData, byId } from '../core/data.js';
import { store, isDone } from '../core/store.js';
import { today, fmtDate, monthName, season, diffDays, fromMMDD, shiftMMDD, fmtMMDD, previewDate } from '../core/dates.js';
import {
  taskCard, wireTasks, visibleTasks, taskStatus, taskMonths, PRIORITY, CATS, CAT_ORDER, nitrogenForYear, monthBrief,
} from '../core/tasks.js';
import { regionShiftDays, frostSetting, datedWindows } from '../core/windows.js';
import { climateFor, activeLocal } from '../core/place.js';
import { grassOf, isWarm } from '../core/grass.js';
import { mountWeatherCard } from '../core/wxcard.js';
import { openLogDialog } from '../core/logdlg.js';
import { planWeek, planEvents, fmtIn } from '../core/planner.js';
import { downloadICS, simpleEvents } from '../core/ics.js';

mountChrome('today');
setTitle('Today');
const app = $('#app');
render(app, loadingBlock('Loading your plan…'));

let D, P, S, T;
let catFilter = 'all';
let showDoneNow = false;
// Week planner state: the latest weather analysis, or why there isn't one
// ('preview', 'off', 'slow' or an Error).
let WX = null;
let wxFail = previewDate() ? 'preview' : null;
let PLAN = null;
const NOW = today();
const YEAR = NOW.getFullYear();
const M = NOW.getMonth() + 1;

function frostDates() {
  const s = store.settings;
  const last = shiftMMDD('04-15', regionShiftDays('spring', s));
  const first = shiftMMDD('10-25', regionShiftDays('fall', s));
  return { last, first };
}

function phase(date) {
  const d = date.getDate();
  const p = d <= 10 ? 'Early' : d <= 20 ? 'Mid' : 'Late';
  return `${p} ${monthName(date.getMonth() + 1)}`;
}

function frostLine() {
  if (!frostSetting(store.settings)) return 'Enter your ZIP code above for local dates';
  if (activeLocal()?.frostFree) return 'Freezes are rare here';
  const { last, first } = frostDates();
  const lastD = fromMMDD(last, YEAR);
  const firstD = fromMMDD(first, YEAR);
  if (NOW < lastD) {
    const n = diffDays(NOW, lastD);
    return `${n} day${n === 1 ? '' : 's'} to the average last frost (${fmtMMDD(last)})`;
  }
  if (NOW < firstD) {
    const n = diffDays(NOW, firstD);
    return n <= 60 ? `${n} days to the average first frost (${fmtMMDD(first)})` : `Growing season · first frost averages ${fmtMMDD(first)}`;
  }
  const nextLast = fromMMDD(last, YEAR + 1);
  return `Frost season · ${diffDays(NOW, nextLast)} days to the average last frost`;
}

/** First visit: ask for a ZIP before showing a plan as if it were local. */
function placeNote() {
  if (store.settings.location || frostSetting(store.settings)) return '';
  return html`<section class="section" id="place">
    <div class="callout">${icon('pin')}<div>
      <strong>Start with your ZIP code</strong>
      <p>Type it in the bar at the top. The almanac then works out your frost dates, hardiness zone and usual lawn grass, moves every task and planting date to your seasons, and switches on your local forecast. Until then you are looking at a sample plan for a tall fescue lawn with a last frost in mid-April.</p>
    </div>
  </section>`;
}

const ctx = () => ({ year: YEAR, P, S, T, settings: store.settings, date: NOW, showRelative: true, showCat: true });

async function main() {
  D = await loadData('tasks', 'products', 'sources', 'months', 'climate');
  D.climate = climateFor(D.climate);
  P = byId(D.products);
  S = byId(D.sources);
  T = byId(D.tasks);
  const month = D.months.months.find((x) => x.m === M);
  const seasonId = season(M);
  const seasonCls = { winter: 'cat-yard', spring: 'cat-lawn', summer: 'cat-veg', fall: 'cat-veg' }[seasonId];

  render(app, html`
    <section class="section">
      <div class="hero ${seasonCls}">
        <span class="eyebrow">Today in the yard</span>
        <h1 class="hero-date">${fmtDate(NOW, { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
        <p class="hero-season">${phase(NOW)} · ${frostLine()}</p>
        <div class="bottom-line">${icon('sparkle')}<div><b>Key jobs for ${monthName(M)}</b><span>${monthBrief(D.tasks, M).text}</span></div></div>
        <div class="hero-stats" id="hero-stats"></div>
      </div>
    </section>
    ${placeNote()}

    <div class="layout-main section">
      <div class="stack-lg">
        <section aria-labelledby="now-h">
          <div class="section-head">
            <h2 id="now-h">This week</h2>
            <div class="seg view-seg" role="group" aria-label="Arrange tasks">
              <button type="button" data-view="plan">${icon('calendar')}By day</button>
              <button type="button" data-view="list">${icon('list')}List</button>
            </div>
          </div>
          <div id="week"></div>
          <div class="chips" id="cat-chips" role="group" aria-label="Filter by area" style="margin-bottom:12px"></div>
          <div id="now"></div>
          <p class="section-foot"><a href="calendar.html#/month/${M}">All of ${monthName(M)} ${icon('arrowRight')}</a></p>
        </section>
        <section aria-labelledby="soon-h">
          <div class="section-head"><h2 id="soon-h">Coming up</h2><span class="subtle">Next 3 weeks</span></div>
          <div id="soon"></div>
        </section>
        <section id="missed-wrap"></section>
      </div>
      <aside class="stack" aria-label="Conditions and progress">
        <section class="card" id="wx"></section>
        <section class="card" id="nitro"></section>
        <section class="card" id="quick"></section>
        <section class="card" id="frost"></section>
      </aside>
    </div>

    <section class="section" aria-labelledby="year-h">
      <div class="section-head"><h2 id="year-h">The year at a glance</h2><a href="calendar.html#/year">Year view ${icon('arrowRight')}</a></div>
      <div class="ribbon">${D.months.months.map((mo) => html`<a href="calendar.html#/month/${mo.m}" class="${mo.m === M ? 'is-now' : ''}"><span class="rm">${monthName(mo.m)}</span><span class="rl">${monthBrief(D.tasks, mo.m).text}</span></a>`)}</div>
    </section>

    <section class="section" aria-labelledby="seasons-h">
      <div class="section-head"><h2 id="seasons-h">Seasons</h2></div>
      <div class="seasons-grid">${D.months.seasons.map((s) => html`<article class="card season season-${s.id}">
        <h3>${s.name}</h3>
        <dl>
          <dt>${icon('lawn')}Lawn</dt><dd>${isWarm() && s.lawnWarm ? s.lawnWarm : s.lawn}</dd>
          <dt>${icon('beds')}Beds</dt><dd>${s.beds}</dd>
          <dt>${icon('veg')}Veggies</dt><dd>${s.veg}</dd>
          <dt>${icon('yard')}Yard</dt><dd>${s.yard}</dd>
        </dl></article>`)}</div>
    </section>`);

  wireTasks(app, ctx, drawTasks);
  on(app, 'click', '[data-cat]', (e, b) => { catFilter = b.dataset.cat; drawTasks(); });
  on(app, 'click', '[data-toggle-done]', () => { showDoneNow = !showDoneNow; drawTasks(); });
  on(app, 'click', '[data-quick]', (e, b) => openLogDialog({ type: b.dataset.quick, cat: b.dataset.qcat || undefined }));
  on(app, 'click', '[data-view]', (e, b) => store.setSettings({ todayView: b.dataset.view }));
  on(app, 'click', '[data-yard-days]', (e, b) => store.setSettings({ yardDays: b.dataset.yardDays }));
  on(app, 'click', '[data-week-ics]', () => {
    if (!PLAN) return;
    const items = planEvents(PLAN);
    if (!items.length) { toast('Nothing left to add this week.'); return; }
    const first = PLAN.days[0];
    downloadICS(`yard-plan-${first.iso}.ics`, simpleEvents(items), `Yard plan · week of ${fmtDate(first.dt)}`);
    toast(`Calendar file with ${items.length} job${items.length === 1 ? '' : 's'} downloaded. Open it to add them.`);
  });

  if (!wxFail && !store.settings.weather) wxFail = 'off';
  drawTasks();
  drawQuick();
  drawFrost();
  // If the forecast is slow, fall back to the list rather than an empty plan.
  setTimeout(() => { if (!WX && !wxFail) { wxFail = 'slow'; drawTasks(); } }, 6000);
  mountWeatherCard($('#wx'), {
    onAnalysis: (a) => {
      if (previewDate()) return;
      WX = a;
      wxFail = null;
      try { drawTasks(); } catch (err) { console.error(err); }
    },
    onError: (err) => {
      if (err === 'off') WX = null;
      if (!WX && !previewDate()) { wxFail = err; drawTasks(); }
    },
  });

  store.subscribe((s, reason) => { if (!['note'].includes(reason)) { drawTasks(); } });
  document.addEventListener('settings-closed', () => { drawTasks(); drawFrost(); });
  document.addEventListener('journal-changed', () => drawTasks());
}

function drawTasks() {
  const s = store.settings;
  const all = visibleTasks(D.tasks, s);
  for (const t of all) T[t.id] = t;
  const withStatus = all.map((t) => ({ t, st: taskStatus(t, NOW, s) }));
  const inCat = (x) => catFilter === 'all' || x.t.category === catFilter;

  const wantPlan = s.todayView !== 'list';
  PLAN = null;
  if (wantPlan && WX) {
    try { PLAN = planWeek({ tasks: all, analysis: WX, settings: s, year: YEAR }); } catch (err) { console.error(err); }
  }
  $('#now-h').textContent = wantPlan && (PLAN || !wxFail) ? 'This week' : 'Do now';
  app.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === (wantPlan ? 'plan' : 'list'))));

  if (PLAN) drawPlan(PLAN, inCat);
  else if (wantPlan && !wxFail) drawPlanLoading();
  else drawList(withStatus, inCat, wantPlan);

  const planned = PLAN ? PLAN.planned : new Set();
  const soon = withStatus.filter((x) => x.st.state === 'out' && x.st.daysToNext != null && x.st.daysToNext <= 21 && inCat(x) && !planned.has(x.t.id))
    .sort((a, b) => a.st.daysToNext - b.st.daysToNext);
  const missed = withStatus.filter((x) => x.st.state === 'out' && x.st.daysSincePrev != null && x.st.daysSincePrev <= 14 && x.st.prev.end.getFullYear() === YEAR && !isDone(YEAR, x.t.id) && x.t.priority !== 'optional' && inCat(x));

  const c = ctx();
  render($('#soon'), soon.length
    ? html`<div class="task-list">${soon.slice(0, 12).map((x) => taskCard(x.t, { ...c, compact: true }))}</div>`
    : html`<div class="empty"><p style="margin:0">Nothing new starts in the next 3 weeks.</p></div>`);

  render($('#missed-wrap'), missed.length ? html`<details class="acc">
      <summary>${icon('clock')} Recently closed and not checked off <span class="subtle">(${missed.length})</span></summary>
      <div class="acc-body"><p class="subtle">These windows closed in the last 2 weeks. Check them off if you did them, or read the notes for a late fallback.</p>
      <div class="task-list">${missed.map((x) => taskCard(x.t, { ...c, compact: true }))}</div></div>
    </details>` : '');

  // hero stats
  const monthTasks = all.filter((t) => (!frostSetting(s) && (t.months || []).includes(M)) || taskMonths(t, s).includes(M));
  const doneM = monthTasks.filter((t) => isDone(YEAR, t.id)).length;
  const keyLeft = monthTasks.filter((t) => t.priority === 'critical' && !isDone(YEAR, t.id)).length;
  const nit = nitrogenForYear(YEAR, D.tasks);
  render($('#hero-stats'), html`
    <a class="pill" href="calendar.html#/month/${M}">${icon('check')}${doneM} of ${monthTasks.length} ${monthName(M)} tasks done</a>
    ${keyLeft ? html`<span class="pill is-warn">${icon('alert')}${keyLeft} key task${keyLeft === 1 ? '' : 's'} left this month</span>` : ''}
    <a class="pill" href="#nitro">${icon('sprout')}${fmtNum(nit.n, 2)} / ${s.nTarget} lb N this year</a>`);

  drawNitro(nit);
}

/* ---------- category chips ---------- */
function drawChips(counts) {
  render($('#cat-chips'), html`
    <button type="button" class="chip" data-cat="all" aria-pressed="${String(catFilter === 'all')}">All <span class="count">${counts.all}</span></button>
    ${CAT_ORDER.map((c) => html`<button type="button" class="chip cat-${c}" data-cat="${c}" aria-pressed="${String(catFilter === c)}"><span class="dot"></span>${CATS[c].label} <span class="count">${counts[c]}</span></button>`)}`);
}

/* ---------- list view: everything in season, by priority ---------- */
function drawList(withStatus, inCat, wantPlan) {
  const nowAll = withStatus.filter((x) => x.st.state === 'now');
  const nowList = nowAll.filter(inCat).sort((a, b) => (PRIORITY[a.t.priority]?.rank ?? 1) - (PRIORITY[b.t.priority]?.rank ?? 1) || a.st.daysLeft - b.st.daysLeft);
  // Long-running reminders (ticks, mosquitoes…) go in a collapsed group so the
  // time-sensitive work stays on top.
  const long = (x) => x.t.priority !== 'critical' && diffDays(x.st.start, x.st.end) > 75;
  const nowOpenAll = nowList.filter((x) => !isDone(YEAR, x.t.id));
  const nowOpen = nowOpenAll.filter((x) => !long(x));
  const ongoing = nowOpenAll.filter(long);
  const nowDone = nowList.filter((x) => isDone(YEAR, x.t.id));

  const counts = { all: nowAll.filter((x) => !isDone(YEAR, x.t.id)).length };
  for (const c of CAT_ORDER) counts[c] = nowAll.filter((x) => x.t.category === c && !isDone(YEAR, x.t.id)).length;
  drawChips(counts);

  const note = !wantPlan ? ''
    : wxFail === 'preview' ? html`${icon('info')}<span>You're previewing another date, and the day-by-day plan needs a live forecast, so here is everything in season.</span>`
      : wxFail === 'off' && !store.settings.location ? html`${icon('info')}<span>Enter your ZIP code at the top of the page to get a day-by-day plan built around your forecast. Here is everything in season on the sample plan.</span>`
      : wxFail === 'off' ? html`${icon('info')}<span>Turn on live weather in <button type="button" class="btn-link" data-action="settings">Settings</button> to get a day-by-day plan built around the forecast. Here is everything in season.</span>`
        : html`${icon('cloud')}<span>The forecast didn't load, so here is everything in season. The day-by-day plan comes back once the weather does.</span>`;
  render($('#week'), note ? html`<p class="week-note">${note}</p>` : '');

  const c = ctx();
  render($('#now'), html`
    ${nowOpen.length ? html`<div class="task-list">${nowOpen.map((x) => taskCard(x.t, c))}</div>`
      : html`<div class="empty">${icon('check')}<p style="margin:0">${nowDone.length ? 'Everything time-sensitive right now is done. Nice work.' : 'Nothing time-sensitive is scheduled right now for this area.'}</p></div>`}
    ${ongoing.length ? html`<details class="acc" style="margin-top:12px">
      <summary>${icon('clock')} Ongoing this season <span class="subtle">(${ongoing.length} reminders)</span></summary>
      <div class="acc-body"><div class="task-list">${ongoing.map((x) => taskCard(x.t, { ...c, compact: true }))}</div></div>
    </details>` : ''}
    ${nowDone.length ? html`<p style="margin-top:10px"><button type="button" class="btn btn-sm btn-ghost" data-toggle-done>${showDoneNow ? 'Hide' : 'Show'} ${nowDone.length} done</button></p>
      ${showDoneNow ? html`<div class="task-list">${nowDone.map((x) => taskCard(x.t, { ...c, compact: true }))}</div>` : ''}` : ''}`);
}

/* ---------- plan view: each task on its best day of the forecast ---------- */
function drawPlanLoading() {
  render($('#week'), html`<div class="week" aria-busy="true">
    <p class="week-lede">${icon('sparkle')}<span>Planning your week around the forecast…</span></p>
    <ol class="week-strip is-loading" aria-hidden="true">${Array.from({ length: 7 }, () => html`<li><div class="wk-day"></div></li>`)}</ol>
  </div>`);
  render($('#cat-chips'), '');
  render($('#now'), loadingBlock('Checking the forecast…'));
}

const dayTitle = (d) => (d.i === 0 ? 'Today' : d.i === 1 ? 'Tomorrow' : fmtDate(d.dt, { weekday: 'long' }));
const rainText = (d) => (d.rain >= 0.05 ? fmtIn(d.rain) : (d.pop ?? 0) >= 30 ? `${d.pop}%` : '');

function stripDay(d, n) {
  const label = d.i === 0 ? 'Today' : fmtDate(d.dt, { weekday: 'short' });
  const aria = `${fmtDate(d.dt, { weekday: 'long', month: 'long', day: 'numeric' })}: ${d.verdict.label}, high ${Math.round(d.hi)}, low ${Math.round(d.lo)}${d.rain >= 0.05 ? `, ${fmtIn(d.rain)} of rain` : ''}. ${n ? `${n} job${n === 1 ? '' : 's'} planned` : 'Nothing planned'}.`;
  const inner = html`
    <span class="wk-d">${label}</span><span class="wk-n">${d.dt.getDate()}</span>
    ${icon(wxIcon(d.code))}
    <span class="wk-t">${Math.round(d.hi)}°<small>${Math.round(d.lo)}°</small></span>
    <span class="wk-r">${rainText(d)}</span>
    <span class="wk-v">${d.verdict.label}</span>
    <span class="wk-c">${n ? html`${n}<span class="wk-cl"> job${n === 1 ? '' : 's'}</span>` : '–'}</span>`;
  const cls = `wk-day tone-${d.verdict.tone} ${d.i === 0 ? 'is-today' : ''}`;
  return n
    ? html`<li><a class="${cls}" href="#day-${d.iso}" aria-label="${aria}">${inner}</a></li>`
    : html`<li><div class="${cls} is-free" role="group" aria-label="${aria}">${inner}</div></li>`;
}

function drawPlan(plan, inCat) {
  const s = store.settings;
  const show = (it) => inCat({ t: it.t });
  const counts = { all: 0 };
  for (const c of CAT_ORDER) counts[c] = 0;
  for (const d of plan.days) {
    for (const it of d.items) {
      if (it.done) continue;
      counts.all += 1;
      if (counts[it.t.category] != null) counts[it.t.category] += 1;
    }
  }
  drawChips(counts);

  const why = {};
  for (const d of plan.days) for (const it of d.items) if (it.why) why[it.t.id] = { text: it.why, icon: it.icon, forced: it.forced };
  const c = { ...ctx(), why };

  render($('#week'), html`<div class="week">
    <p class="week-lede">${icon('sparkle')}<span>${plan.headline.join(' ')}</span></p>
    <ol class="week-strip" aria-label="The next 7 days">${plan.days.map((d) => stripDay(d, d.items.filter((it) => !it.done && show(it)).length))}</ol>
    <div class="week-tools">
      <div class="row"><span class="toolbar-label">Plan around</span>
        <div class="seg" role="group" aria-label="When you do yard work">
          <button type="button" data-yard-days="any" aria-pressed="${String(s.yardDays !== 'weekends')}">Any day</button>
          <button type="button" data-yard-days="weekends" aria-pressed="${String(s.yardDays === 'weekends')}">Weekends</button>
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-ghost" data-week-ics>${icon('download')}Add week to calendar</button>
    </div>
  </div>`);

  const groups = plan.days.map((d) => ({ d, items: d.items.filter(show) })).filter((g) => g.items.length);
  const waiting = plan.waiting.filter(show);
  const ongoing = plan.ongoing.filter((t) => show({ t }));
  const waitCtx = { ...c, compact: true, why: Object.fromEntries(waiting.map((w) => [w.t.id, { text: w.why, icon: 'clock', forced: true }])) };

  render($('#now'), html`
    ${groups.length ? groups.map(({ d, items }) => html`<section class="day-group" id="day-${d.iso}" aria-labelledby="dh-${d.iso}">
      <div class="day-head">
        <h3 id="dh-${d.iso}">${dayTitle(d)} <span class="day-date">${fmtDate(d.dt, d.i < 2 ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' })}</span></h3>
        <span class="day-wx tone-${d.verdict.tone}">${icon(wxIcon(d.code))}<b>${d.verdict.label}</b><span>${Math.round(d.hi)}° / ${Math.round(d.lo)}°${rainText(d) ? ` · ${rainText(d)}` : ''}</span></span>
      </div>
      <div class="task-list">${items.map((it) => taskCard(it.t, { ...c, compact: it.done || it.t.priority === 'optional' }))}</div>
    </section>`)
    : html`<div class="empty">${icon('check')}<p style="margin:0">Nothing needs doing this week${catFilter === 'all' ? '' : ' in this area'}. Enjoy the yard.</p></div>`}
    ${waiting.length ? html`<details class="acc" style="margin-top:18px" ${waiting.some((w) => w.t.priority === 'critical') ? raw('open') : ''}>
      <summary>${icon('clock')} Waiting on the weather <span class="subtle">(${waiting.length})</span></summary>
      <div class="acc-body"><p class="subtle">In season, but nothing in the 7-day forecast suits them yet. The plan updates as the forecast changes.</p>
      <div class="task-list">${waiting.map((w) => taskCard(w.t, waitCtx))}</div></div>
    </details>` : ''}
    ${ongoing.length ? html`<details class="acc" style="margin-top:${waiting.length ? 8 : 18}px">
      <summary>${icon('eye')} Ongoing and things to watch for <span class="subtle">(${ongoing.length})</span></summary>
      <div class="acc-body"><div class="task-list">${ongoing.map((t) => taskCard(t, { ...c, compact: true }))}</div></div>
    </details>` : ''}`);
}

function drawNitro(nit) {
  const s = store.settings;
  const pct = Math.min(100, (nit.n / (s.nTarget || 3)) * 100);
  // This lawn's own feedings, in local calendar order.
  const plan = D.tasks.filter((t) => t.category === 'lawn' && t.nitrogen)
    .map((t) => ({ t, at: datedWindows(t, YEAR, s)[0].start }))
    .sort((x, y) => x.at - y.at)
    .map(({ t, at }) => [t.id, fmtDate(at, { month: 'short' }), `${t.nitrogen === 0.5 ? '½' : fmtNum(t.nitrogen)}${t.priority === 'optional' ? ' (optional)' : ''}`]);
  render($('#nitro'), html`
    <div class="card-head"><h2>${icon('sprout')}Lawn nitrogen · ${YEAR}</h2></div>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${s.nTarget}" aria-valuenow="${nit.n}" aria-label="Nitrogen applied this year"><i style="width:${pct}%"></i></div>
    <div class="meter-labels"><span><strong>${fmtNum(nit.n, 2)}</strong> of ${s.nTarget} lb N / 1,000 sq ft</span><span>${pct >= 100 ? 'Target met' : `${fmtNum(Math.max(0, s.nTarget - nit.n), 2)} to go`}</span></div>
    <div class="pill-list" style="margin-top:12px">
      ${plan.map(([id, mo, amt]) => html`<a class="pill" href="calendar.html#/task/${id}" style="${isDone(YEAR, id) ? 'border-color:var(--ok);color:var(--ok)' : ''}">${isDone(YEAR, id) ? icon('check') : icon('calendar')}${mo}: ${amt} lb</a>`)}
    </div>
    ${nit.parts.length ? html`<ul class="list-plain stack-sm subtle" style="margin-top:10px">${nit.parts.map((p) => html`<li>${p.date}: ${fmtNum(p.n, 2)} lb N · ${p.label}</li>`)}</ul>` : ''}
    <p class="subtle" style="margin:10px 0 0">${grassOf().nNote}</p>
    <div class="btn-group" style="margin-top:12px">
      <button type="button" class="btn btn-sm" data-quick="fertilize" data-qcat="lawn">${icon('plus')}Log fertilizer</button>
      <a class="btn btn-sm btn-ghost" href="tools.html#fertilizer">${icon('calculator')}How much to buy</a>
    </div>`);
}

function drawQuick() {
  const q = [
    ['mow', 'lawn', 'mower', 'Mowed'],
    ['fertilize', 'lawn', 'sprout', 'Fertilized'],
    ['water', 'lawn', 'drop', 'Watered'],
    ['rain', 'yard', 'rain', 'Rain gauge'],
    ['harvest', 'veg', 'basket', 'Harvest'],
    ['note', '', 'journal', 'Note'],
  ];
  render($('#quick'), html`
    <div class="card-head"><h2>${icon('journal')}Quick log</h2><a class="subtle" href="journal.html">Journal</a></div>
    <div class="more-grid">${q.map(([type, cat, ic, label]) => html`<button type="button" data-quick="${type}" data-qcat="${cat}">${icon(ic)}${label}</button>`)}</div>`);
}

function drawFrost() {
  const cl = D.climate;
  const { last, first } = frostDates();
  if (!frostSetting(store.settings)) {
    render($('#frost'), html`<div class="card-head"><h2>${icon('snow')}Frost dates</h2></div>
      <p class="subtle" style="margin:0">Enter your ZIP code at the top of the page to see your local frost dates. Every task and planting window follows them.</p>`);
    return;
  }
  const region = store.settings.region === 'custom' ? 'your frost dates' : activeLocal()?.name;
  const f = (cl && cl.frost) || {};
  const doy = (mmdd) => { const d = fromMMDD(mmdd, 2001); return (d - new Date(2001, 0, 1)) / 864e5; };
  const pos = (mmdd) => `${(doy(mmdd) / 365) * 100}%`;
  const todayPos = `${((NOW - new Date(YEAR, 0, 1)) / 864e5 / 365) * 100}%`;
  render($('#frost'), html`
    <div class="card-head"><h2>${icon('snow')}Frost dates</h2><button type="button" class="btn btn-sm btn-ghost" data-action="settings">Change</button></div>
    <p class="subtle" style="margin:0 0 10px">Planning dates for ${region}.</p>
    <div class="frost-band" aria-hidden="true">
      <span class="fb fb-risk" style="left:0;width:${pos(last)}"></span>
      <span class="fb fb-risk rev" style="left:${pos(first)};right:0"></span>
      <span class="fb fb-today" style="left:${todayPos}"></span>
      <span class="fb-label" style="left:${pos(last)}">${fmtMMDD(last)}</span>
      <span class="fb-label" style="left:${pos(first)}">${fmtMMDD(first)}</span>
    </div>
    <div class="meter-labels"><span>Jan</span><span>Jul</span><span>Dec</span></div>
    <ul class="list-plain stack-sm" style="margin-top:10px;font-size:.9rem">
      <li><strong>Last spring frost ≈ ${fmtMMDD(last)}.</strong> ${f.springNote || ''}</li>
      <li><strong>First fall frost ≈ ${fmtMMDD(first)}.</strong> ${f.fallNote || ''}</li>
    </ul>`);
}

main().catch((err) => { console.error(err); render(app, errorBlock(err)); });
