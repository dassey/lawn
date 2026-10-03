// Lawn guide: program, watering decision tool, seed guide + tag checker,
// mowing, weeds/diseases/insects reference, soil tests.
import { mountChrome, setTitle, loadingBlock, errorBlock } from '../core/ui.js';
import { html, raw, md, render, $, $$, on, fmtNum, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { loadData, byId } from '../core/data.js';
import { store } from '../core/store.js';
import { today, monthShort, MON, fmtDate, fromISO } from '../core/dates.js';
import { barChart } from '../core/charts.js';
import { sourceItems, EVIDENCE } from '../core/tasks.js';
import { fetchWeather, analyze } from '../core/weather.js';
import { openLogDialog } from '../core/logdlg.js';

mountChrome('lawn');
setTitle('Lawn guide');
const app = $('#app');
render(app, loadingBlock('Loading the lawn guide…'));

const NOW = today();
const M = NOW.getMonth() + 1;
let D, P, S;
let issueGroup = 'weed';
let issueQ = '';
let wx = null;

const GROUPS = [
  ['weed', 'Weeds', 'lawn'],
  ['disease', 'Diseases', 'alert'],
  ['insect', 'Insects', 'bug'],
  ['other', 'Critters & other', 'yard'],
];

async function main() {
  D = await loadData('lawn', 'issues', 'products', 'sources', 'climate');
  P = byId(D.products);
  S = byId(D.sources);
  const L = D.lawn;

  render(app, html`
    <section class="page-head">
      <span class="eyebrow">Tall fescue · no sprinkler system</span>
      <h1>Lawn guide</h1>
      <p class="lede">${L.intro}</p>
    </section>
    <nav class="subnav" aria-label="On this page"><ul>
      <li><a href="#program">Program</a></li><li><a href="#water">Watering</a></li><li><a href="#seed">Seed</a></li>
      <li><a href="#mowing">Mowing</a></li><li><a href="#weeds">Weeds</a></li><li><a href="#problems">Diseases &amp; insects</a></li>
      <li><a href="#soil">Soil</a></li><li><a href="#more">Leaves, shade &amp; more</a></li>
    </ul></nav>

    <section class="section" id="program">
      <div class="section-head"><h2>The year-round program</h2><a href="calendar.html">Month by month ${icon('arrowRight')}</a></div>
      <div class="grid-auto">${L.principles.map((p) => html`<article class="card">
        <h3 style="display:flex;gap:8px;align-items:center">${icon(p.icon || 'check')}${p.title}</h3>
        <p style="margin:0">${md(p.text)}</p>
        ${p.sources ? html`<div style="margin-top:10px">${sourceItems(p.sources, S)}</div>` : ''}
      </article>`)}</div>
      <div class="grid-2 section">
        <article class="card">
          <div class="card-head"><h3>${icon('sprout')}Nitrogen by month (lb N / 1,000 sq ft)</h3></div>
          ${barChart({ labels: MON.map((x) => x[0]), values: L.nSchedule.map((x) => x.n), highlight: M - 1, faded: new Set(L.nSchedule.filter((x) => x.optional).map((x) => x.m - 1)), fmt: (v) => (v ? String(v) : ''), max: 1.5, ariaLabel: 'Nitrogen schedule: optional half pound in April, one pound each in September, October and November.' })}
          <p class="subtle" style="margin:6px 0 0">${L.nNote}</p>
        </article>
        <article class="card">
          <div class="card-head"><h3>${icon('mower')}Mowing height by month (inches)</h3></div>
          ${barChart({ labels: MON.map((x) => x[0]), values: L.mowing.map((x) => x.h), highlight: M - 1, fmt: (v) => (v ? String(v) : ''), max: 4.5, barClass: 'bar', ariaLabel: 'Mowing height: about 3 to 3.5 inches in spring and fall, 4 inches in summer.' })}
          <p class="subtle" style="margin:6px 0 0">${L.mowNote}</p>
        </article>
      </div>
      <div class="table-wrap section">
        <table>
          <thead><tr><th>When</th><th>What</th><th>Why</th></tr></thead>
          <tbody>${L.keyDates.map((k) => html`<tr><td class="nowrap"><strong>${k.when}</strong></td><td>${md(k.what)}</td><td class="muted">${md(k.why)}</td></tr>`)}</tbody>
        </table>
      </div>
    </section>

    <section class="section" id="water">
      <div class="section-head"><h2>Watering without a sprinkler system</h2></div>
      <div class="layout-main">
        <div class="stack">
          <div class="callout callout-water">${icon('drop')}<div><strong>The short version</strong><p>${md(L.water.short)}</p></div></div>
          <article class="card" id="decide"></article>
          <article class="card">
            <h3>${icon('target')}Measure your sprinkler: the tuna-can test</h3>
            <ol>${L.water.tunaCan.map((x) => html`<li>${md(x)}</li>`)}</ol>
            <p style="margin:0"><a class="btn btn-sm" href="tools.html#water">${icon('calculator')}Sprinkler run-time calculator</a></p>
          </article>
        </div>
        <aside class="stack">
          <article class="card">
            <h3>${icon('flask')}What the research says</h3>
            <ul class="list-plain stack">${L.water.facts.map((f) => html`<li><p style="margin:0 0 4px">${md(f.text)}</p>${sourceItems(f.sources, S)}</li>`)}</ul>
          </article>
        </aside>
      </div>
    </section>

    <section class="section" id="seed">
      <div class="section-head"><h2>Grass seed: what to buy</h2><a href="tools.html#seed">Seed calculator ${icon('arrowRight')}</a></div>
      <div class="grid-2">
        <article class="card">
          <h3>${icon('seed')}${L.seed.blend.title}</h3>
          <p>${md(L.seed.blend.text)}</p>
          <ul class="list-check">${L.seed.blend.points.map((x) => html`<li>${md(x)}</li>`)}</ul>
        </article>
        <article class="card">
          <h3>${icon('flask')}Cultivars with the best local data</h3>
          <p class="subtle">${md(L.seed.cultivarsIntro)}</p>
          <div class="table-wrap"><table class="table-compact">
            <thead><tr><th>Cultivar</th><th>Evidence</th></tr></thead>
            <tbody>${L.seed.cultivars.map((c) => html`<tr><td><strong>${c.name}</strong></td><td>${md(c.why)}</td></tr>`)}</tbody>
          </table></div>
          <div style="margin-top:10px">${sourceItems(L.seed.cultivarSources, S)}</div>
        </article>
      </div>
      <div class="grid-2 section">
        <article class="card">
          <h3>${icon('bag')}Blends you can buy in KC</h3>
          <ul class="list-plain stack-sm">${D.products.filter((p) => p.type === 'seed').map((p) => html`<li><a href="products.html#p-${p.id}"><strong>${p.name}</strong></a>${p.brand ? html` <span class="subtle">· ${p.brand}</span>` : ''}<br><span class="subtle">${p.use}</span>${p.evidence === 'vendor' ? html` <span class="ev ev-vendor">Vendor claim</span>` : ''}</li>`)}</ul>
        </article>
        <article class="card">
          <h3>${icon('x')}Skip these</h3>
          <ul class="list-check list-x">${L.seed.avoid.map((x) => html`<li>${md(x)}</li>`)}</ul>
          <h3 style="margin-top:16px">${icon('ruler')}Seeding rates</h3>
          <div class="table-wrap"><table class="table-compact"><tbody>${L.seed.rates.map((r) => html`<tr><td>${r.what}</td><td class="nowrap"><strong>${r.rate}</strong></td></tr>`)}</tbody></table></div>
        </article>
      </div>
      <article class="card section" id="tag">
        <div class="card-head"><h3>${icon('search')}Seed tag checker</h3></div>
        <p class="subtle">Type in what the bag's label (the "seed tag") says. The checker flags forage fescue, ryegrass-heavy mixes, old tests and weedy lots.</p>
        <form id="tag-form" class="stack" onsubmit="return false">
          <div class="field-row">
            ${[['tf', 'Tall fescue %', 90], ['kbg', 'Kentucky bluegrass %', 10], ['prg', 'Perennial ryegrass %', 0], ['arg', 'Annual ryegrass %', 0], ['ff', 'Fine fescue %', 0]].map(([k, l, v]) => html`<div class="field"><label for="tg-${k}">${l}</label><input id="tg-${k}" name="${k}" type="number" min="0" max="100" step="0.01" value="${v}"></div>`)}
          </div>
          <div class="field-row">
            ${[['germ', 'Germination % (tall fescue)', 90], ['weed', 'Weed seed %', 0.02], ['crop', 'Other crop %', 0.1], ['inert', 'Inert matter %', 1.5]].map(([k, l, v]) => html`<div class="field"><label for="tg-${k}">${l}</label><input id="tg-${k}" name="${k}" type="number" min="0" max="100" step="0.01" value="${v}"></div>`)}
            <div class="field"><label for="tg-date">Test date</label><input id="tg-date" name="date" type="month"></div>
          </div>
          <div class="stack-sm">
            <label class="switch"><input type="checkbox" name="ky31"><span class="track"></span>Tag says "Kentucky 31", "KY-31" or "variety not stated"</label>
            <label class="switch"><input type="checkbox" name="noxious"><span class="track"></span>Tag lists any noxious weed seeds</label>
          </div>
        </form>
        <div id="tag-out" style="margin-top:14px"></div>
      </article>
    </section>

    <section class="section" id="mowing">
      <div class="section-head"><h2>Mowing</h2></div>
      <div class="grid-2">
        <article class="card"><ul class="list-check">${L.mowTips.map((x) => html`<li>${md(x)}</li>`)}</ul></article>
        <article class="card">
          <h3>${icon('ruler')}The ⅓ rule</h3>
          <p class="subtle">Never cut off more than a third of the blade at once. Pick your height:</p>
          <div class="seg" role="group" aria-label="Mowing height" id="third-seg">${[3, 3.5, 4].map((h) => html`<button type="button" data-h="${h}" aria-pressed="${String(h === 4)}">${h} in</button>`)}</div>
          <div class="calc-result" style="margin-top:12px" id="third-out"></div>
        </article>
      </div>
    </section>

    <section class="section" id="weeds">
      <div class="section-head"><h2>Weeds, diseases, insects &amp; critters</h2></div>
      <div class="toolbar">
        <div class="toolbar-row">
          <div class="chips" role="group" aria-label="Type">${GROUPS.map(([g, label, ic]) => html`<button type="button" class="chip" data-group="${g}" aria-pressed="${String(g === issueGroup)}">${icon(ic)}${label}<span class="count">${D.issues.filter((i) => i.group === g).length}</span></button>`)}</div>
          <div class="search-input" style="flex:1;min-width:200px">${icon('search')}<input type="search" id="issue-q" placeholder="Search by name or symptom…" aria-label="Search lawn problems"></div>
        </div>
      </div>
      <div id="problems"></div>
    </section>

    <section class="section" id="soil">
      <div class="section-head"><h2>Soil &amp; soil testing</h2></div>
      <div class="grid-2">
        <article class="card">
          <h3>${icon('soil')}How to take a soil test</h3>
          <ol>${L.soil.howTo.map((x) => html`<li>${md(x)}</li>`)}</ol>
          <div>${sourceItems(L.soil.sources, S)}</div>
        </article>
        <article class="card" id="soil-results"></article>
      </div>
      <div class="grid-auto section">${L.soil.notes.map((n) => html`<article class="card card-tight"><h3>${n.title}</h3><p style="margin:0">${md(n.text)}</p></article>`)}</div>
    </section>

    <section class="section" id="more">
      <div class="section-head"><h2>Leaves, shade, dogs &amp; more</h2></div>
      <div class="grid-auto">${L.more.map((n) => html`<article class="card"><h3>${icon(n.icon || 'leaf')} ${n.title}</h3><p style="margin:0">${md(n.text)}</p>${n.sources ? html`<div style="margin-top:8px">${sourceItems(n.sources, S)}</div>` : ''}</article>`)}</div>
    </section>`);

  // interactions
  on(app, 'click', '[data-group]', (e, b) => { issueGroup = b.dataset.group; $$('[data-group]', app).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawIssues(); });
  $('#issue-q').addEventListener('input', debounce((e) => { issueQ = e.target.value; drawIssues(); }, 120));
  on(app, 'click', '[data-h]', (e, b) => { $$('[data-h]', app).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawThird(Number(b.dataset.h)); });
  $('#tag-form').addEventListener('input', drawTag);
  on(app, 'click', '[data-log-soil]', () => openLogDialog({ type: 'soil', cat: 'lawn', title: 'Soil test' }));
  document.addEventListener('journal-changed', drawSoil);

  drawThird(4);
  drawTag();
  drawIssues();
  drawSoil();
  drawDecide();
  if (store.settings.weather) {
    try {
      const res = await fetchWeather(store.settings.location);
      wx = analyze(res.data, { climate: D.climate });
      drawDecide(true);
    } catch { /* offline: decision tool still works manually */ }
  }
  // deep link to an issue
  const h = location.hash.replace('#', '');
  if (h.startsWith('issue-')) openIssue(h.slice(6));
  window.addEventListener('hashchange', () => {
    const hh = location.hash.replace('#', '');
    if (hh.startsWith('issue-')) openIssue(hh.slice(6));
  });
}

/* ---------- Should I water? ---------- */
const dec = { look: 'green', days: 7, hot: false, rainSoon: false };
function drawDecide(fromWx = false) {
  if (fromWx && wx) {
    dec.days = wx.m.daysSinceSoak;
    dec.hot = wx.m.hot21 >= 3;
    dec.rainSoon = wx.m.rainNext5 >= 0.25;
    if (wx.m.seedDays != null && wx.m.seedDays <= 28) dec.look = 'seed';
  }
  const el = $('#decide');
  const opt = (v, l) => html`<button type="button" data-look="${v}" aria-pressed="${String(dec.look === v)}">${l}</button>`;
  const ans = decide();
  render(el, html`
    <div class="card-head"><h3>${icon('drop')}Should I water today?</h3>${wx ? html`<span class="badge badge-water">${icon('cloud')}Filled from live weather</span>` : ''}</div>
    <div class="decision">
      <div class="q"><span>How does the lawn look?</span>
        <div class="seg" role="group" aria-label="Lawn appearance">${opt('green', 'Green')}${opt('wilt', 'Blue-gray, footprints stay')}${opt('dormant', 'Tan / brown')}${opt('seed', 'Newly seeded')}</div></div>
      <div class="field-row">
        <div class="field"><label for="dc-days">Days since ½ in of rain</label><input id="dc-days" type="number" min="0" max="90" value="${dec.days}"></div>
        <div class="field"><span style="font-weight:600;font-size:.9rem">Conditions</span>
          <label class="switch"><input type="checkbox" id="dc-hot" ${dec.hot ? raw('checked') : ''}><span class="track"></span>Highs around 90°F+ lately</label>
          <label class="switch"><input type="checkbox" id="dc-rain" ${dec.rainSoon ? raw('checked') : ''}><span class="track"></span>¼ in+ rain likely in 3–5 days</label>
        </div>
      </div>
      <div class="answer a-${ans.cls}"><h3>${icon(ans.icon)}${ans.title}</h3><p style="margin:0">${md(ans.text)}</p></div>
    </div>`);
  if (!el.dataset.wired) {
    el.dataset.wired = '1';
    on(el, 'click', '[data-look]', (e, b) => { dec.look = b.dataset.look; drawDecide(); });
    on(el, 'change', '#dc-days', (e, i) => { dec.days = Number(i.value) || 0; drawDecide(); });
    on(el, 'change', '#dc-hot', (e, i) => { dec.hot = i.checked; drawDecide(); });
    on(el, 'change', '#dc-rain', (e, i) => { dec.rainSoon = i.checked; drawDecide(); });
  }
}

function decide() {
  const { look, days, hot, rainSoon } = dec;
  const timer = store.settings.hoseTimer;
  const how = timer ? 'Use your hose timer early in the morning (4–10 a.m.): two runs 30 minutes apart so clay can soak it up.' : 'Water early in the morning (4–10 a.m.). On clay, split it into two runs 30 minutes apart so it soaks in instead of running off.';
  if (look === 'seed') {
    if (rainSoon) return { cls: 'wait', icon: 'rain', title: 'Let the rain do it, but don\'t let seed dry out', text: 'If the top ½ in of soil is still damp, skip watering and let the forecast rain handle it. If it dries before the rain comes, give it a light sprinkle.' };
    return { cls: 'urgent', icon: 'seed', title: 'Yes: keep new seed moist', text: `Water lightly **2–3 times a day** (about 5–10 minutes each) so the top ½ in never dries out, until seedlings are up (tall fescue takes about 7–14 days). After that, water every few days and more deeply. ${timer ? 'Set the timer for 3 short cycles a day.' : 'A $30–60 hose-end sprinkler on a timer makes this easy.'}` };
  }
  if (rainSoon && look !== 'dormant') return { cls: 'wait', icon: 'rain', title: 'Wait for the rain', text: 'Rain is likely soon. Skip watering and check again in a couple of days.' };
  if (look === 'green') {
    return days >= 14 && hot
      ? { cls: 'wait', icon: 'eye', title: 'Not yet, but watch closely', text: 'It\'s still green, but it has been dry and hot. Water only when you see a blue-gray color or footprints that stay, then give it one deep soak (½–1 in).' }
      : { cls: 'wait', icon: 'check', title: 'No water needed', text: 'Deep-rooted tall fescue is fine. Mow high (4 inches in summer) and let rain do the work.' };
  }
  if (look === 'wilt') {
    return (days >= 10 || hot)
      ? { cls: 'water', icon: 'drop', title: 'Yes: one deep soak (½–1 in)', text: `This is when watering does the most good. Put down **½–1 in** at once, not light daily sprinkles, which grow shallow roots. ${how} Then don't water again until it wilts again or you pass 3 weeks without rain.` }
      : { cls: 'wait', icon: 'clock', title: 'Give it a day or two', text: 'Afternoon wilting on a hot day is normal. If it hasn\'t bounced back by the next morning, give it ½–1 in.' };
  }
  // dormant
  if (days >= 21 || (days >= 14 && hot)) {
    return { cls: 'water', icon: 'drop', title: 'Yes: a crown-saver soak (½–1 in)', text: `Dormant tall fescue survives about 3–4 weeks of heat (above 80°F). Past that, crowns start to die. Give **½–1 in** now and every 2–3 weeks until rain returns. (UNL says ¼–½ in keeps crowns hydrated without greening the lawn; MU's lawn manual says at least 1 in every 2–3 weeks prevents turf loss.) ${how}` };
  }
  return { cls: 'wait', icon: 'check', title: 'Let it stay dormant', text: 'Brown, dormant fescue is protecting itself. Don\'t water it green and let it go dormant again, because each cycle drains its reserves. Keep traffic off it, and start crown-saver watering after about 3 weeks without rain.' };
}

/* ---------- seed tag checker ---------- */
function drawTag() {
  const f = $('#tag-form');
  const v = Object.fromEntries(new FormData(f).entries());
  const n = (k) => Number(v[k]) || 0;
  const checks = [];
  const add = (ok, text, lvl) => checks.push({ ok, text, lvl: lvl || (ok ? 'good' : 'bad') });
  const species = n('tf') + n('kbg') + n('prg') + n('arg') + n('ff');
  add(n('tf') >= 80, `Tall fescue is ${n('tf')}% of the bag. ${n('tf') >= 80 ? 'Good.' : 'Aim for 85–90%+ for a KC lawn.'}`);
  if (n('kbg') > 0) add(n('kbg') <= 20, `Kentucky bluegrass ${n('kbg')}%: ${n('kbg') <= 20 ? 'about 10% helps fill gaps.' : 'more than ~20% struggles without irrigation.'}`, n('kbg') <= 20 ? 'good' : 'warn');
  if (n('prg') > 0) add(n('prg') <= 10, `Perennial ryegrass ${n('prg')}%: ${n('prg') <= 10 ? 'acceptable as a quick "nurse" grass.' : 'too much. MU warns ryegrass often won\'t survive a Missouri summer.'}`, n('prg') <= 10 ? 'warn' : 'bad');
  if (n('arg') > 0) add(false, `Annual ryegrass ${n('arg')}%: MU says it's "not a suitable turfgrass species in Missouri." Skip this bag.`);
  if (n('ff') > 20) add(false, `Fine fescue is ${n('ff')}%. That's fine for shade, but it means you can't use Tenacity (mesotrione) at seeding (label limit is 20%).`, 'warn');
  if (v.ky31) add(false, '"Kentucky 31" or "variety not stated" usually means forage-type tall fescue: coarse, clumpy and pale. MU restricts it to roadsides.');
  add(n('germ') >= 85, `Germination ${n('germ')}%: ${n('germ') >= 85 ? 'good.' : 'low. Look for 85–90% or more.'}`, n('germ') >= 85 ? 'good' : 'warn');
  add(n('weed') <= 0.1, `Weed seed ${n('weed')}%: ${n('weed') === 0 ? 'perfect.' : n('weed') <= 0.1 ? 'OK, but 0% is available.' : 'too weedy for a lawn. Pick a bag with 0–0.1%.'}`, n('weed') <= 0.1 ? 'good' : 'bad');
  add(n('crop') <= 0.5, `Other crop seed ${n('crop')}%: ${n('crop') <= 0.5 ? 'fine.' : 'high. "Crop" can include unwanted grasses like orchardgrass or timothy.'}`, n('crop') <= 0.5 ? 'good' : 'warn');
  if (v.noxious) add(false, 'Lists noxious weeds. Don\'t buy it.');
  if (v.date) {
    const [y, mo] = v.date.split('-').map(Number);
    const months = (NOW.getFullYear() - y) * 12 + (NOW.getMonth() + 1 - mo);
    add(months <= 12, `Tested ${months} month${months === 1 ? '' : 's'} ago: ${months <= 9 ? 'fresh.' : months <= 12 ? 'OK.' : 'old. Germination drops with age, so look for a test within the last 9–12 months.'}`, months <= 9 ? 'good' : months <= 12 ? 'warn' : 'bad');
  }
  if (Math.abs(species + n('weed') + n('crop') + n('inert') - 100) > 3 && species > 0) add(false, `Percentages add up to ${fmtNum(species + n('weed') + n('crop') + n('inert'), 1)}%. Double-check the tag.`, 'warn');
  const pls = (n('tf') * n('germ')) / 100;
  const bad = checks.filter((c) => c.lvl === 'bad').length;
  const warn = checks.filter((c) => c.lvl === 'warn').length;
  const verdict = bad ? { cls: 'callout-critical', t: 'Keep shopping' } : warn ? { cls: 'callout-warn', t: 'Usable, with caveats' } : { cls: 'callout-ok', t: 'Good lawn seed' };
  render($('#tag-out'), html`
    <div class="callout ${verdict.cls}">${icon(bad ? 'x' : warn ? 'alert' : 'check')}<div><strong>${verdict.t}</strong>
      <p>About <strong>${fmtNum(pls, 0)}%</strong> of the bag is live tall fescue seed (pure live seed = purity × germination). ${pls > 0 && pls < 75 ? `Raise your seeding rate by about ${fmtNum((85 / pls - 1) * 100, 0)}% to make up for it.` : ''}</p></div></div>
    <ul class="list-plain stack-sm" style="margin-top:10px">${checks.map((c) => html`<li style="display:flex;gap:8px;align-items:flex-start"><span style="color:${c.lvl === 'good' ? 'var(--ok)' : c.lvl === 'warn' ? 'var(--warn)' : 'var(--critical)'}">${icon(c.lvl === 'good' ? 'check' : c.lvl === 'warn' ? 'alert' : 'x')}</span><span>${c.text}</span></li>`)}</ul>`);
}

/* ---------- ⅓ rule ---------- */
function drawThird(h) {
  const max = h * 1.5;
  render($('#third-out'), html`<span class="big">${fmtNum(max, 2)}<small> in</small></span><p>Mow at ${h} in once the grass reaches about <strong>${fmtNum(max, 2)} in</strong>. In spring, that can mean mowing every 4–5 days. If it gets away from you, bring it down over two mowings a few days apart.</p>`);
}

/* ---------- issues ---------- */
function monthStrip(ms) {
  return html`<span class="row" style="gap:2px" aria-label="Active months">${MON.map((mn, i) => html`<span title="${mn}" style="width:16px;height:16px;border-radius:4px;font-size:.6rem;font-weight:700;display:inline-grid;place-items:center;${(ms || []).includes(i + 1) ? 'background:var(--brand);color:var(--brand-contrast)' : 'background:var(--bg-sunk);color:var(--ink-3)'}">${mn[0]}</span>`)}</span>`;
}

function issueCard(i) {
  const prods = (i.products || []).map((id) => P[id]).filter(Boolean);
  return html`<details class="acc" id="issue-${i.id}">
    <summary><span style="display:inline-flex;flex-direction:column;gap:4px"><span>${i.name}${i.aka && i.aka.length ? html`<span class="subtle">${i.aka.join(', ')}</span>` : ''}</span><span class="row" style="gap:6px">${i.type ? html`<span class="tag">${i.type}</span>` : ''}${monthStrip(i.months)}</span></span></summary>
    <div class="acc-body stack-sm">
      ${i.id_tips ? html`<p><strong>How to spot it:</strong> ${md(i.id_tips)}</p>` : ''}
      ${i.symptoms ? html`<p><strong>Symptoms:</strong> ${md(i.symptoms)}</p>` : ''}
      ${i.when ? html`<p><strong>When to act:</strong> ${md(i.when)}</p>` : ''}
      ${i.threshold ? html`<p><strong>Threshold:</strong> ${md(i.threshold)}</p>` : ''}
      ${i.cultural ? html`<p><strong>Prevent / cultural fix:</strong> ${md(i.cultural)}</p>` : ''}
      ${i.control ? html`<p><strong>Control:</strong> ${md(i.control)}</p>` : ''}
      ${prods.length ? html`<div class="link-chips">${prods.map((p) => html`<a class="link-chip" href="products.html#p-${p.id}">${icon(p.organic ? 'leaf' : 'bag')}${p.name}</a>`)}</div>` : ''}
      ${i.note ? html`<div class="callout">${icon('info')}<div>${md(i.note)}</div></div>` : ''}
      ${i.sources ? sourceItems(i.sources, S) : ''}
    </div>
  </details>`;
}

function drawIssues() {
  const q = issueQ.trim().toLowerCase();
  const list = D.issues.filter((i) => (q ? [i.name, (i.aka || []).join(' '), i.id_tips, i.symptoms, i.type].join(' ').toLowerCase().includes(q) : i.group === issueGroup));
  render($('#problems'), list.length ? html`<div>${list.map(issueCard)}</div>` : html`<div class="empty">No matches.</div>`);
}

function openIssue(id) {
  const i = D.issues.find((x) => x.id === id);
  if (!i) return;
  issueQ = '';
  const qi = $('#issue-q');
  if (qi) qi.value = '';
  issueGroup = i.group;
  $$('[data-group]', app).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.group === i.group)));
  drawIssues();
  const el = document.getElementById(`issue-${id}`);
  if (el) { el.open = true; setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }
}

/* ---------- soil results from journal ---------- */
function drawSoil() {
  const tests = store.state.journal.filter((j) => j.type === 'soil').sort((a, b) => b.date.localeCompare(a.date));
  const t = tests[0];
  const phNote = (ph) => (ph == null ? '' : ph < 5.8 ? 'Low. Lime per your report (≤50 lb/1,000 sq ft per application, fall or winter).' : ph <= 7.3 ? 'Fine for tall fescue. No lime needed.' : 'High (alkaline). Don\'t lime. Iron may look pale; ask Extension.');
  render($('#soil-results'), html`
    <div class="card-head"><h3>${icon('journal')}Your soil tests</h3><button type="button" class="btn btn-sm" data-log-soil>${icon('plus')}Add results</button></div>
    ${t ? html`
      <p class="subtle" style="margin-top:0">Latest: ${fmtDate(fromISO(t.date), { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      <div class="grid-4">
        <div class="stat"><span class="stat-label">pH (salt)</span><span class="stat-value">${t.ph ?? '—'}</span></div>
        <div class="stat"><span class="stat-label">P lb/acre</span><span class="stat-value">${t.p ?? '—'}</span></div>
        <div class="stat"><span class="stat-label">K lb/acre</span><span class="stat-value">${t.k ?? '—'}</span></div>
        <div class="stat"><span class="stat-label">Org. matter</span><span class="stat-value">${t.om != null ? `${t.om}%` : '—'}</span></div>
      </div>
      ${t.ph != null ? html`<p style="margin-top:10px">${phNote(t.ph)}</p>` : ''}
      <p class="subtle">Your MU report gives exact fertilizer and lime amounts; those numbers beat any rule of thumb. ${Number(t.date.slice(0, 4)) <= NOW.getFullYear() - 3 ? html`<strong>This test is 3+ years old. Time to retest.</strong>` : ''}</p>
      ${tests.length > 1 ? html`<details class="acc"><summary>Earlier tests (${tests.length - 1})</summary><div class="acc-body"><ul class="list-plain">${tests.slice(1).map((x) => html`<li>${x.date}: pH ${x.ph ?? '—'}, P ${x.p ?? '—'}, K ${x.k ?? '—'}, OM ${x.om ?? '—'}%</li>`)}</ul></div></details>` : ''}`
    : html`<p>No soil test logged yet. When your MU results come back, add pH, phosphorus, potassium and organic matter here to track them over time.</p>
      <p class="subtle">Most KC lawns never need phosphorus once established, and don't need lime unless the test says so.</p>`}`);
}

main().catch((err) => { console.error(err); render(app, errorBlock(err)); });
