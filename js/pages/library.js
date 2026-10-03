// Library: research highlights, extension guides, local help, KC climate,
// myths vs facts, glossary, credits and the full source list.
import { mountChrome, setTitle, loadingBlock, errorBlock } from '../core/ui.js';
import { html, md, render, $, $$, on, debounce, fmtNum } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { loadData, byId } from '../core/data.js';
import { today, MON } from '../core/dates.js';
import { lineChart, barChart } from '../core/charts.js';
import { EVIDENCE } from '../core/tasks.js';

mountChrome('library');
setTitle('Library & sources');
const app = $('#app');
render(app, loadingBlock('Loading the library…'));

const NOW = today();
const M = NOW.getMonth();
let D;
let srcFilter = 'all';
let gq = '';

async function main() {
  D = await loadData('sources', 'library', 'glossary', 'climate');
  const L = D.library;
  const cl = D.climate;
  const research = D.sources.filter((s) => s.type === 'peer-reviewed').sort((a, b) => (b.year || 0) - (a.year || 0));
  const guides = D.sources.filter((s) => s.type === 'extension');

  render(app, html`
    <section class="page-head">
      <span class="eyebrow">Why the plan says what it says</span>
      <h1>Library</h1>
      <p class="lede">The research, Extension guides, local experts and climate data behind every task, plus myths to skip and a glossary. Evidence badges show where each recommendation comes from.</p>
    </section>
    <nav class="subnav" aria-label="On this page"><ul>
      <li><a href="#research">Latest research</a></li><li><a href="#guides">Extension guides</a></li><li><a href="#local">Local help</a></li>
      <li><a href="#buy">Where to buy</a></li><li><a href="#climate">KC climate</a></li><li><a href="#myths">Myths</a></li>
      <li><a href="#glossary">Glossary</a></li><li><a href="#credits">Credits</a></li><li><a href="#sources">All sources</a></li>
    </ul></nav>

    <section class="section" id="research">
      <div class="section-head"><h2>Latest research, in plain English</h2><span class="subtle">${research.length} papers</span></div>
      <div class="callout" style="margin-bottom:14px">${icon('flask')}<div>${md(L.researchIntro)}</div></div>
      <div class="grid-2">${research.map((s) => html`<article class="card" id="src-${s.id}">
        <div class="row" style="margin-bottom:6px"><span class="ev ev-peer-reviewed">Peer-reviewed</span>${s.year ? html`<span class="badge">${s.year}</span>` : ''}${s.local ? html`<span class="badge badge-recommended">${s.local}</span>` : ''}${s.status ? html`<span class="badge badge-warn">${s.status}</span>` : ''}</div>
        <h3 style="margin:0 0 4px">${s.url ? html`<a href="${s.url}" target="_blank" rel="noopener">${s.title}</a>` : s.title}</h3>
        <p class="subtle" style="margin:0 0 8px">${s.authors}${s.journal ? html` · <em>${s.journal}</em>` : ''}</p>
        <p style="margin:0 0 6px"><strong>Finding:</strong> ${md(s.takeaway)}</p>
        ${s.caveat ? html`<p class="subtle" style="margin:0"><strong>Caveat:</strong> ${md(s.caveat)}</p>` : ''}
      </article>`)}</div>
    </section>

    <section class="section" id="guides">
      <div class="section-head"><h2>Extension guides this plan follows</h2></div>
      <div class="grid-auto">${guides.map((s) => html`<article class="card card-tight" id="src-${s.id}">
        <span class="subtle" style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${s.org}</span>
        <h3 style="margin:2px 0 6px">${s.url ? html`<a href="${s.url}" target="_blank" rel="noopener">${s.title}</a>` : s.title}</h3>
        <p style="margin:0;font-size:.9rem">${md(s.takeaway)}</p>
      </article>`)}</div>
    </section>

    <section class="section" id="local">
      <div class="section-head"><h2>Local help around Kansas City</h2></div>
      <div class="grid-auto">${L.local.map((x) => html`<article class="card">
        <h3 style="margin:0 0 4px">${x.name}</h3>
        <p style="margin:0 0 8px">${md(x.what)}</p>
        <ul class="list-plain stack-sm" style="font-size:.9rem">
          ${x.phone ? html`<li>${icon('phone')} <a href="tel:${x.phone.replace(/[^\d+]/g, '')}">${x.phone}</a></li>` : ''}
          ${x.where ? html`<li>${icon('pin')} ${x.where}</li>` : ''}
          ${x.url ? html`<li>${icon('external')} <a href="${x.url}" target="_blank" rel="noopener">${x.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a></li>` : ''}
        </ul>
      </article>`)}</div>
    </section>

    <section class="section" id="buy">
      <div class="section-head"><h2>Where to buy</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Store</th><th>Good for</th><th>Where</th></tr></thead>
        <tbody>${L.suppliers.map((x) => html`<tr><td><strong>${x.url ? html`<a href="${x.url}" target="_blank" rel="noopener">${x.name}</a>` : x.name}</strong></td><td>${md(x.what)}</td><td>${x.where || ''}</td></tr>`)}</tbody>
      </table></div>
    </section>

    <section class="section" id="climate">
      <div class="section-head"><h2>Kansas City climate</h2><span class="subtle">${cl.station}</span></div>
      <div class="grid-2">
        <article class="card">
          <h3>${icon('thermo')}Average high &amp; low (°F)</h3>
          ${lineChart({ labels: MON.map((m) => m[0]), series: [{ values: cl.monthly.map((x) => x.hi), cls: 'line-hi', dotCls: 'dot-hi', name: 'High' }, { values: cl.monthly.map((x) => x.lo), cls: 'line-lo', dotCls: 'dot-lo', name: 'Low' }], min: 10, max: 100, unit: '°', highlight: M, ariaLabel: 'Monthly normal highs and lows at Kansas City International Airport, 1991 to 2020.' })}
          <div class="chart-legend"><span><i style="background:var(--veg)"></i>High</span><span><i style="background:var(--yard)"></i>Low</span></div>
        </article>
        <article class="card">
          <h3>${icon('rain')}Rain by month (in) · ${fmtNum(cl.annual.precip, 2)} in a year</h3>
          ${barChart({ labels: MON.map((m) => m[0]), values: cl.monthly.map((x) => x.precip), highlight: M, barClass: 'bar-rain', fmt: (v) => v.toFixed(1), max: 6, ariaLabel: 'Monthly normal precipitation: wettest in May and June, driest in January.' })}
          <p class="subtle" style="margin:6px 0 0">${md(cl.rainNote)}</p>
        </article>
      </div>
      <div class="grid-2 section">
        <article class="card">
          <h3>${icon('snow')}Freeze dates (${cl.frost.station})</h3>
          <div class="table-wrap"><table class="table-compact">
            <thead><tr><th>Temperature</th><th>Last in spring (median)</th><th>1-in-10 late</th><th>First in fall (median)</th><th>1-in-10 early</th></tr></thead>
            <tbody>${cl.frost.table.map((r) => html`<tr><td><strong>${r.t}</strong></td><td>${r.springMedian}</td><td>${r.spring10}</td><td>${r.fallMedian}</td><td>${r.fall10}</td></tr>`)}</tbody>
          </table></div>
          <p class="subtle" style="margin:8px 0 0">${md(cl.frost.note)}</p>
        </article>
        <article class="card">
          <h3>${icon('flame')}Heat &amp; what it means</h3>
          ${barChart({ labels: MON.map((m) => m[0]), values: cl.monthly.map((x) => x.days90), highlight: M, barClass: 'bar', fmt: (v) => (v >= 1 ? v.toFixed(0) : ''), max: 15, ariaLabel: 'Average days at or above 90 degrees: about 7 in June, 13 in July, 12 in August.' })}
          <p class="subtle" style="margin:6px 0 0">Average days at or above 90°F (${fmtNum(cl.annual.days90, 1)} a year). ${md(cl.heatNote)}</p>
        </article>
      </div>
    </section>

    <section class="section" id="myths">
      <div class="section-head"><h2>Myths &amp; costly mistakes</h2></div>
      <div class="grid-auto">${L.myths.map((m) => html`<article class="card">
        <p style="margin:0 0 6px;font-weight:700;display:flex;gap:8px;align-items:flex-start"><span style="color:var(--critical)">${icon('x')}</span><span>${m.myth}</span></p>
        <p style="margin:0;display:flex;gap:8px;align-items:flex-start"><span style="color:var(--ok)">${icon('check')}</span><span>${md(m.fact)}</span></p>
      </article>`)}</div>
    </section>

    <section class="section" id="glossary">
      <div class="section-head"><h2>Glossary</h2></div>
      <div class="search-input" style="max-width:420px;margin-bottom:12px">${icon('search')}<input type="search" id="g-q" placeholder="Find a term…" aria-label="Search glossary"></div>
      <div id="g-list"></div>
    </section>

    <section class="section" id="credits">
      <div class="section-head"><h2>Credits &amp; inspiration</h2></div>
      <p class="subtle">${md(L.creditsIntro)}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Project</th><th>Idea borrowed</th><th>License</th></tr></thead>
        <tbody>${L.credits.map((c) => html`<tr><td><a href="${c.url}" target="_blank" rel="noopener"><strong>${c.name}</strong></a></td><td>${md(c.idea)}</td><td class="nowrap">${c.license}</td></tr>`)}</tbody>
      </table></div>
      <ul class="list-plain stack-sm section subtle">${L.dataCredits.map((c) => html`<li>${md(c)}</li>`)}</ul>
    </section>

    <section class="section" id="sources">
      <div class="section-head"><h2>All sources</h2><span class="subtle">${D.sources.length}</span></div>
      <div class="chips" id="src-chips" style="margin-bottom:12px"></div>
      <div id="src-list"></div>
    </section>`);

  $('#g-q').addEventListener('input', debounce((e) => { gq = e.target.value; drawGlossary(); }, 120));
  on(app, 'click', '[data-src]', (e, b) => { srcFilter = b.dataset.src; drawSources(); });
  drawGlossary();
  drawSources();
  const h = location.hash.slice(1);
  if (h.startsWith('src-') || h.startsWith('g-')) {
    setTimeout(() => {
      let el = document.getElementById(h);
      if (!el && h.startsWith('src-')) { srcFilter = 'all'; drawSources(); el = document.querySelector(`#sources [data-sid="${h.slice(4)}"]`); }
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '3px solid var(--brand)'; setTimeout(() => { el.style.outline = ''; }, 2500); }
    }, 80);
  } else if (h) setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: 'smooth' }), 60);
}

function drawGlossary() {
  const q = gq.trim().toLowerCase();
  const list = D.glossary.filter((g) => !q || (g.term + ' ' + g.def).toLowerCase().includes(q)).sort((a, b) => a.term.localeCompare(b.term));
  render($('#g-list'), html`<div class="grid-auto">${list.map((g) => html`<div class="card card-tight" id="g-${g.id}"><strong>${g.term}</strong><p style="margin:4px 0 0;font-size:.9rem">${md(g.def)}</p></div>`)}</div>`);
}

function drawSources() {
  const types = ['all', ...new Set(D.sources.map((s) => s.type))];
  render($('#src-chips'), html`${types.map((t) => html`<button type="button" class="chip" data-src="${t}" aria-pressed="${String(srcFilter === t)}">${t === 'all' ? 'All' : EVIDENCE[t] || t}<span class="count">${t === 'all' ? D.sources.length : D.sources.filter((s) => s.type === t).length}</span></button>`)}`);
  const list = D.sources.filter((s) => srcFilter === 'all' || s.type === srcFilter).sort((a, b) => a.title.localeCompare(b.title));
  render($('#src-list'), html`<div class="table-wrap"><table class="table-compact">
    <thead><tr><th>Source</th><th>Type</th><th>Key takeaway</th></tr></thead>
    <tbody>${list.map((s) => html`<tr data-sid="${s.id}"><td><strong>${s.url ? html`<a href="${s.url}" target="_blank" rel="noopener">${s.title}</a>` : s.title}</strong><br><span class="subtle">${[s.org, s.authors, s.year].filter(Boolean).join(' · ')}</span></td>
      <td><span class="ev ev-${s.type}">${EVIDENCE[s.type] || s.type}</span></td><td>${md(s.takeaway || '')}</td></tr>`)}</tbody>
  </table></div>`);
}

main().catch((err) => { console.error(err); render(app, errorBlock(err)); });
