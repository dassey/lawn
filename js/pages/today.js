// Today: what to do now, what's coming, live conditions, nitrogen tracker.
import { mountChrome, setTitle, loadingBlock, errorBlock } from '../core/ui.js';
import { html, render, $, on, fmtNum } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { loadData, byId } from '../core/data.js';
import { store, isDone } from '../core/store.js';
import { today, fmtDate, monthName, season, diffDays, fromMMDD, shiftMMDD, fmtMMDD } from '../core/dates.js';
import {
  taskCard, wireTasks, visibleTasks, taskStatus, taskMonths, PRIORITY, CATS, CAT_ORDER, nitrogenForYear,
} from '../core/tasks.js';
import { regionShiftDays } from '../core/windows.js';
import { mountWeatherCard } from '../core/wxcard.js';
import { openLogDialog } from '../core/logdlg.js';

mountChrome('today');
setTitle('Today');
const app = $('#app');
render(app, loadingBlock('Loading your plan…'));

let D, P, S, T;
let catFilter = 'all';
let showDoneNow = false;
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

const ctx = () => ({ year: YEAR, P, S, T, settings: store.settings, date: NOW, showRelative: true, showCat: true });

async function main() {
  D = await loadData('tasks', 'products', 'sources', 'months', 'climate');
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
        <div class="bottom-line">${icon('sparkle')}<div><b>Bottom line for ${monthName(M)}</b><span>${month ? month.bottomLine : ''}</span></div></div>
        <div class="hero-stats" id="hero-stats"></div>
      </div>
    </section>

    <div class="layout-main section">
      <div class="stack-lg">
        <section aria-labelledby="now-h">
          <div class="section-head"><h2 id="now-h">Do now</h2><a href="calendar.html#/month/${M}">All of ${monthName(M)} ${icon('arrowRight')}</a></div>
          <div class="chips" id="cat-chips" role="group" aria-label="Filter by area" style="margin-bottom:12px"></div>
          <div id="now"></div>
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
      <div class="ribbon">${D.months.months.map((mo) => html`<a href="calendar.html#/month/${mo.m}" class="${mo.m === M ? 'is-now' : ''}"><span class="rm">${monthName(mo.m)}</span><span class="rl">${mo.bottomLine}</span></a>`)}</div>
    </section>

    <section class="section" aria-labelledby="seasons-h">
      <div class="section-head"><h2 id="seasons-h">Seasons</h2></div>
      <div class="seasons-grid">${D.months.seasons.map((s) => html`<article class="card season season-${s.id}">
        <h3>${s.name} <span class="subtle">${s.span}</span></h3>
        <dl>
          <dt>${icon('lawn')}Lawn</dt><dd>${s.lawn}</dd>
          <dt>${icon('beds')}Beds</dt><dd>${s.beds}</dd>
          <dt>${icon('veg')}Veggies</dt><dd>${s.veg}</dd>
          <dt>${icon('yard')}Yard</dt><dd>${s.yard}</dd>
        </dl></article>`)}</div>
    </section>`);

  wireTasks(app, ctx, drawTasks);
  on(app, 'click', '[data-cat]', (e, b) => { catFilter = b.dataset.cat; drawTasks(); });
  on(app, 'click', '[data-toggle-done]', () => { showDoneNow = !showDoneNow; drawTasks(); });
  on(app, 'click', '[data-quick]', (e, b) => openLogDialog({ type: b.dataset.quick, cat: b.dataset.qcat || undefined }));

  drawTasks();
  drawQuick();
  drawFrost();
  mountWeatherCard($('#wx'));

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

  const nowAll = withStatus.filter((x) => x.st.state === 'now');
  const nowList = nowAll.filter(inCat).sort((a, b) => (PRIORITY[a.t.priority]?.rank ?? 1) - (PRIORITY[b.t.priority]?.rank ?? 1) || a.st.daysLeft - b.st.daysLeft);
  // Long-running reminders (ticks, mosquitoes…) go in a collapsed group so the
  // time-sensitive work stays on top.
  const long = (x) => x.t.priority !== 'critical' && diffDays(x.st.start, x.st.end) > 75;
  const nowOpenAll = nowList.filter((x) => !isDone(YEAR, x.t.id));
  const nowOpen = nowOpenAll.filter((x) => !long(x));
  const ongoing = nowOpenAll.filter(long);
  const nowDone = nowList.filter((x) => isDone(YEAR, x.t.id));

  const soon = withStatus.filter((x) => x.st.state === 'out' && x.st.daysToNext != null && x.st.daysToNext <= 21 && inCat(x))
    .sort((a, b) => a.st.daysToNext - b.st.daysToNext);
  const missed = withStatus.filter((x) => x.st.state === 'out' && x.st.daysSincePrev != null && x.st.daysSincePrev <= 14 && x.st.prev.end.getFullYear() === YEAR && !isDone(YEAR, x.t.id) && x.t.priority !== 'optional' && inCat(x));

  // category chips with counts of open "now" tasks
  const counts = { all: nowAll.filter((x) => !isDone(YEAR, x.t.id)).length };
  for (const c of CAT_ORDER) counts[c] = nowAll.filter((x) => x.t.category === c && !isDone(YEAR, x.t.id)).length;
  render($('#cat-chips'), html`
    <button type="button" class="chip" data-cat="all" aria-pressed="${String(catFilter === 'all')}">All <span class="count">${counts.all}</span></button>
    ${CAT_ORDER.map((c) => html`<button type="button" class="chip cat-${c}" data-cat="${c}" aria-pressed="${String(catFilter === c)}"><span class="dot"></span>${CATS[c].label} <span class="count">${counts[c]}</span></button>`)}`);

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

  render($('#soon'), soon.length
    ? html`<div class="task-list">${soon.slice(0, 12).map((x) => taskCard(x.t, { ...c, compact: true }))}</div>`
    : html`<div class="empty"><p style="margin:0">Nothing new starts in the next 3 weeks.</p></div>`);

  render($('#missed-wrap'), missed.length ? html`<details class="acc">
      <summary>${icon('clock')} Recently closed and not checked off <span class="subtle">(${missed.length})</span></summary>
      <div class="acc-body"><p class="subtle">These windows closed in the last 2 weeks. Check them off if you did them, or read the notes for a late fallback.</p>
      <div class="task-list">${missed.map((x) => taskCard(x.t, { ...c, compact: true }))}</div></div>
    </details>` : '');

  // hero stats
  const monthTasks = all.filter((t) => (t.months || []).includes(M) || taskMonths(t, s).includes(M));
  const doneM = monthTasks.filter((t) => isDone(YEAR, t.id)).length;
  const keyLeft = monthTasks.filter((t) => t.priority === 'critical' && !isDone(YEAR, t.id)).length;
  const nit = nitrogenForYear(YEAR, D.tasks);
  render($('#hero-stats'), html`
    <a class="pill" href="calendar.html#/month/${M}">${icon('check')}${doneM} of ${monthTasks.length} ${monthName(M)} tasks done</a>
    ${keyLeft ? html`<span class="pill is-warn">${icon('alert')}${keyLeft} key task${keyLeft === 1 ? '' : 's'} left this month</span>` : ''}
    <a class="pill" href="#nitro">${icon('sprout')}${fmtNum(nit.n, 2)} / ${s.nTarget} lb N this year</a>`);

  drawNitro(nit);
}

function drawNitro(nit) {
  const s = store.settings;
  const pct = Math.min(100, (nit.n / (s.nTarget || 3)) * 100);
  const plan = [
    ['lawn-apr-light-feed', 'Apr', '½ (optional)'],
    ['lawn-sep-fertilize', 'Sep', '1'],
    ['lawn-oct-fertilize', 'Oct', '1'],
    ['lawn-nov-fertilize', 'Nov', '1'],
  ];
  render($('#nitro'), html`
    <div class="card-head"><h2>${icon('sprout')}Lawn nitrogen · ${YEAR}</h2></div>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${s.nTarget}" aria-valuenow="${nit.n}" aria-label="Nitrogen applied this year"><i style="width:${pct}%"></i></div>
    <div class="meter-labels"><span><strong>${fmtNum(nit.n, 2)}</strong> of ${s.nTarget} lb N / 1,000 sq ft</span><span>${pct >= 100 ? 'Target met' : `${fmtNum(Math.max(0, s.nTarget - nit.n), 2)} to go`}</span></div>
    <div class="pill-list" style="margin-top:12px">
      ${plan.map(([id, mo, amt]) => html`<a class="pill" href="calendar.html#/task/${id}" style="${isDone(YEAR, id) ? 'border-color:var(--ok);color:var(--ok)' : ''}">${isDone(YEAR, id) ? icon('check') : icon('calendar')}${mo}: ${amt} lb</a>`)}
    </div>
    ${nit.parts.length ? html`<ul class="list-plain stack-sm subtle" style="margin-top:10px">${nit.parts.map((p) => html`<li>${p.date}: ${fmtNum(p.n, 2)} lb N · ${p.label}</li>`)}</ul>` : ''}
    <p class="subtle" style="margin:10px 0 0">Tall fescue does best on 3–4 lb N a year, most of it Sep–Nov (MU). Without irrigation, skip May–August feeding.</p>
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
  const region = { central: 'MU Central (KC metro)', north: 'MU North (cautious)', custom: 'your frost dates' }[store.settings.region];
  const f = cl.frost || {};
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
