// Shared page chrome: header, desktop nav, mobile tab bar + "More" sheet,
// footer, settings dialog, site-wide search, toasts, theme, service worker.
import { html, raw, render, $, $$, on, esc, debounce } from './dom.js';
import { icon, brandMark } from './icons.js';
import { store, DEFAULT_LOCATION } from './store.js';
import { previewDate, fromISO, fmtDate, toISO, fromMMDD, mmdd, today } from './dates.js';
import { loadData } from './data.js';

export const NAV = [
  { id: 'today', href: 'index.html', label: 'Today', icon: 'home', tab: true },
  { id: 'calendar', href: 'calendar.html', label: 'Calendar', icon: 'calendar', tab: true },
  { id: 'lawn', href: 'lawn.html', label: 'Lawn', icon: 'lawn', tab: true },
  { id: 'beds', href: 'beds.html', label: 'Beds', icon: 'beds' },
  { id: 'garden', href: 'garden.html', label: 'Veggies', icon: 'veg', tab: true },
  { id: 'tools', href: 'tools.html', label: 'Tools', icon: 'calculator' },
  { id: 'products', href: 'products.html', label: 'Products', icon: 'bag' },
  { id: 'journal', href: 'journal.html', label: 'Journal', icon: 'journal' },
  { id: 'library', href: 'library.html', label: 'Library', icon: 'book' },
];

const attr = (cond, a) => (cond ? raw(a) : '');

/* ---------------- theme ---------------- */
export function applyTheme(t = store.settings.theme) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#111510' : '#f6f4ee';
}

/* ---------------- chrome ---------------- */
export function mountChrome(page) {
  applyTheme();
  const loc = store.settings.location || {};
  const sub = loc.name && loc.name !== DEFAULT_LOCATION.name ? `${loc.name}` : 'Kansas City · Zone 6b';

  let header = $('#site-header');
  if (!header) {
    header = document.createElement('header');
    header.id = 'site-header';
    document.body.prepend(header);
  }
  header.className = 'site-header';
  render(header, html`
    <div class="container header-inner">
      <a class="brand" href="index.html" aria-label="KC Lawn and Garden Almanac, home">
        ${brandMark()}
        <span class="brand-text">
          <span class="brand-name"><span class="long">KC Lawn &amp; Garden Almanac</span><span class="short">KC Lawn Almanac</span></span>
          <span class="brand-sub">${sub}</span>
        </span>
      </a>
      <nav class="main-nav" aria-label="Main">
        <ul>${NAV.map((n) => html`<li><a href="${n.href}" ${attr(n.id === page, 'aria-current="page"')}>${icon(n.icon)}${n.label}</a></li>`)}</ul>
      </nav>
      <div class="header-actions">
        <button type="button" class="icon-btn" data-action="search" aria-label="Search the almanac" title="Search ( / )">${icon('search')}</button>
        <button type="button" class="icon-btn" data-action="settings" aria-label="Settings" title="Settings">${icon('settings')}</button>
      </div>
    </div>`);

  if (!$('.skip-link')) {
    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#main';
    skip.textContent = 'Skip to content';
    document.body.prepend(skip);
  }

  // Preview banner (?date=YYYY-MM-DD lets you see the plan for any day)
  const pd = previewDate();
  if (pd) {
    const bar = document.createElement('div');
    bar.className = 'callout callout-warn no-print';
    bar.style.cssText = 'border-radius:0;border-left:0;border-right:0;justify-content:center';
    render(bar, html`${icon('clock')}<span>Previewing the plan as of <strong>${fmtDate(fromISO(pd), { month: 'long', day: 'numeric', year: 'numeric' })}</strong>. <a href="${location.pathname.split('/').pop() || 'index.html'}">Back to today</a></span>`);
    header.after(bar);
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!/^[a-z0-9-]+\.html/i.test(href) || /[?&]date=/.test(href)) return;
      if (a.textContent.trim() === 'Back to today') return;
      const [base, hash] = href.split('#');
      a.setAttribute('href', `${base}${base.includes('?') ? '&' : '?'}date=${pd}${hash ? '#' + hash : ''}`);
    }, true);
  }

  // Mobile tab bar
  const tabbar = document.createElement('nav');
  tabbar.className = 'tabbar';
  tabbar.setAttribute('aria-label', 'Main');
  const inMore = !NAV.find((n) => n.id === page && n.tab);
  render(tabbar, html`<ul>
    ${NAV.filter((n) => n.tab).map((n) => html`<li><a href="${n.href}" ${attr(n.id === page, 'aria-current="page"')}><span class="tab-ico">${icon(n.icon)}</span>${n.label}</a></li>`)}
    <li><button type="button" data-action="more" aria-haspopup="dialog" ${attr(inMore, 'aria-current="page"')}><span class="tab-ico">${icon('more')}</span>More</button></li>
  </ul>`);
  document.body.appendChild(tabbar);

  // Footer
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  render(footer, html`<div class="container footer-grid">
      <div>
        <p><strong>KC Lawn &amp; Garden Almanac</strong>: a free month-by-month plan for rain-fed tall fescue lawns, flower beds and vegetable gardens around Kansas City.</p>
        <p>It summarizes University of Missouri and K-State Extension guidance plus peer-reviewed research. Always read and follow the product label; the label is the law. Your checkmarks, notes and journal are stored only in this browser.</p>
      </div>
      <div><ul class="footer-links">
        <li><a href="library.html">Sources &amp; research</a></li>
        <li><a href="library.html#local">Local help</a></li>
        <li><a href="journal.html#data">Backup &amp; restore</a></li>
      </ul></div>
      <div><ul class="footer-links">
        <li>Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></li>
        <li><a href="library.html#credits">Credits</a></li>
      </ul></div>
    </div>`);
  const main = $('main');
  (main || tabbar).after(footer);

  // Global actions
  on(document, 'click', '[data-action]', (e, el) => {
    const a = el.dataset.action;
    if (a === 'settings') { e.preventDefault(); openSettings(); }
    else if (a === 'search') { e.preventDefault(); openSearch(); }
    else if (a === 'more') { e.preventDefault(); openMore(page); }
  });
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      openSearch();
    }
  });

  store.subscribe((s, reason) => { if (['settings', 'replace', 'sync'].includes(reason)) applyTheme(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());

  if (store.memoryOnly) {
    setTimeout(() => toast('This browser is blocking storage, so checkmarks and notes will not be saved after you close the tab.', { timeout: 8000 }), 600);
  }
  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !/[?&]sw=1/.test(location.search)) return; // keep dev reloads fresh
  if (location.protocol !== 'https:' && !local) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------------- toasts ---------------- */
export function toast(msg, { action, timeout = 4000 } = {}) {
  let wrap = $('.toasts');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toasts';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  const span = document.createElement('span');
  span.textContent = msg;
  t.appendChild(span);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => { action.fn(); t.remove(); });
    t.appendChild(b);
  }
  wrap.appendChild(t);
  setTimeout(() => t.remove(), timeout);
}

/* ---------------- generic dialog helper ---------------- */
export function makeDialog(id, cls = '') {
  let dlg = document.getElementById(id);
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = id;
    if (cls) dlg.className = cls;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      // click on backdrop closes
      if (e.target === dlg) dlg.close();
    });
  }
  return dlg;
}

export function confirmDialog(message, { ok = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = makeDialog('confirm-dlg');
    render(dlg, html`<form method="dialog">
      <div class="dlg-body"><p style="margin:0">${message}</p></div>
      <div class="dlg-foot"><button class="btn" value="cancel">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok">${ok}</button></div>
    </form>`);
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

/* ---------------- More sheet (mobile) ---------------- */
function openMore(page) {
  const dlg = makeDialog('more-dlg', 'sheet');
  render(dlg, html`
    <div class="dlg-head"><h2>More</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="dlg-body">
      <div class="more-grid">
        ${NAV.map((n) => html`<a href="${n.href}" ${attr(n.id === page, 'aria-current="page"')}>${icon(n.icon)}${n.label}</a>`)}
        <button type="button" data-action="search">${icon('search')}Search</button>
        <button type="button" data-action="settings">${icon('settings')}Settings</button>
      </div>
    </div>`);
  $('[data-close]', dlg).addEventListener('click', () => dlg.close());
  $$('[data-action]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.showModal();
}

/* ---------------- Settings ---------------- */
const REGION_HELP = {
  central: 'University of Missouri "Central" planting dates. They fit the Kansas City metro (the Missouri River runs along the North/Central line), with an average last frost around April 15.',
  north: 'MU "North" dates, about a week later in spring and earlier in fall. Use them if your yard is a cold, low spot or you want a safety margin.',
  custom: 'Enter your own average frost dates and every planting window shifts to match. Useful if you live outside the KC area.',
};

export function openSettings() {
  const dlg = makeDialog('settings-dlg');
  const draw = () => {
    const s = store.settings;
    const y = today().getFullYear();
    const dateVal = (m) => toISO(fromMMDD(m, y));
    const seg = (key, opts) => html`<div class="seg" role="group">${opts.map(([v, l]) => html`<button type="button" data-seg="${key}" data-val="${v}" aria-pressed="${String(String(s[key]) === String(v))}">${l}</button>`)}</div>`;
    const sw = (key, label, hint) => html`<label class="switch"><input type="checkbox" data-setting="${key}" ${attr(s[key], 'checked')}><span class="track"></span><span>${label}${hint ? html`<br><span class="subtle" style="font-weight:400">${hint}</span>` : ''}</span></label>`;
    render(dlg, html`
      <div class="dlg-head"><h2>Settings</h2><button type="button" class="icon-btn" data-close aria-label="Close settings">${icon('x')}</button></div>
      <div class="dlg-body stack">
        <fieldset>
          <legend>Your yard</legend>
          <div class="field-row">
            <div class="field"><label for="s-lawn">Lawn</label><div class="input-affix"><input id="s-lawn" type="number" inputmode="numeric" min="50" step="50" data-setting="lawnSqFt" value="${s.lawnSqFt}"><span class="affix">sq ft</span></div></div>
            <div class="field"><label for="s-veg">Vegetable garden</label><div class="input-affix"><input id="s-veg" type="number" inputmode="numeric" min="0" step="10" data-setting="vegSqFt" value="${s.vegSqFt}"><span class="affix">sq ft</span></div></div>
            <div class="field"><label for="s-bed">Flower beds</label><div class="input-affix"><input id="s-bed" type="number" inputmode="numeric" min="0" step="10" data-setting="bedSqFt" value="${s.bedSqFt}"><span class="affix">sq ft</span></div></div>
          </div>
          <p class="subtle" style="margin:8px 0 0">These sizes feed the calculators and shopping list. Not sure? <a href="tools.html#area">Measure your lawn</a>.</p>
        </fieldset>

        <fieldset>
          <legend>Planting dates</legend>
          ${seg('region', [['central', 'MU Central (KC)'], ['north', 'MU North (cautious)'], ['custom', 'My frost dates']])}
          <p class="subtle" style="margin:8px 0 0">${REGION_HELP[s.region] || ''}</p>
          ${s.region === 'custom' ? html`<div class="field-row" style="margin-top:10px">
            <div class="field"><label for="s-lf">Average last spring frost</label><input id="s-lf" type="date" data-frost="lastFrost" value="${dateVal(s.lastFrost)}"></div>
            <div class="field"><label for="s-ff">Average first fall frost</label><input id="s-ff" type="date" data-frost="firstFrost" value="${dateVal(s.firstFrost)}"></div>
          </div>` : ''}
        </fieldset>

        <fieldset>
          <legend>Weather location</legend>
          <div class="field"><label for="s-place">Find a town or ZIP</label>
            <div class="row" style="flex-wrap:nowrap"><input id="s-place" type="search" placeholder="e.g. Overland Park, KS" autocomplete="off"><button type="button" class="btn" data-geo-search>${icon('search')}<span class="sr-only">Search</span></button></div>
          </div>
          <ul class="list-plain stack-sm" data-geo-results style="margin-top:8px"></ul>
          <p class="subtle" style="margin:8px 0">Now using <strong>${s.location.name}</strong> (${Number(s.location.lat).toFixed(3)}, ${Number(s.location.lon).toFixed(3)}).</p>
          <div class="btn-group"><button type="button" class="btn btn-sm" data-geo-me>${icon('pin')}Use my location</button><button type="button" class="btn btn-sm btn-ghost" data-geo-reset>Reset to Kansas City</button></div>
        </fieldset>

        <fieldset>
          <legend>Lawn program</legend>
          <p class="subtle" style="margin:0 0 8px">Yearly nitrogen for tall fescue, in lb N per 1,000 sq ft. MU recommends 3–4 lb, mostly in fall.</p>
          ${seg('nTarget', [[2, '2 lb · low input'], [3, '3 lb · standard'], [4, '4 lb · max']])}
        </fieldset>

        <fieldset>
          <legend>Preferences</legend>
          <div class="stack-sm">
            ${sw('hoseTimer', 'I have a hose-end sprinkler + timer', 'Shows timer-based watering steps for new seed and drought soaks.')}
            ${sw('preferOrganic', 'Prefer organic options', 'Lists organic products first where one exists.')}
            ${sw('showOptional', 'Show optional tasks')}
            ${sw('weather', 'Live weather & alerts', 'Free Open-Meteo forecast; your location is sent only to Open-Meteo.')}
          </div>
          <div class="field" style="margin-top:12px"><span class="toolbar-label" style="min-width:0">Theme</span>
            ${seg('theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}
          </div>
        </fieldset>

        <p class="subtle">Everything is saved in this browser as you go. <a href="journal.html#data">Back up or restore your data</a>.</p>
      </div>
      <div class="dlg-foot"><button type="button" class="btn btn-primary" data-close>Done</button></div>`);
  };
  draw();

  if (!dlg.dataset.wired) {
    dlg.dataset.wired = '1';
    on(dlg, 'click', '[data-close]', () => dlg.close());
    on(dlg, 'click', '[data-seg]', (e, b) => {
      const key = b.dataset.seg;
      let v = b.dataset.val;
      if (key === 'nTarget') v = Number(v);
      store.setSettings({ [key]: v });
      draw();
    });
    on(dlg, 'change', '[data-setting]', (e, el) => {
      const key = el.dataset.setting;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.type === 'number') {
        v = Math.max(0, Number(v) || 0);
      }
      store.setSettings({ [key]: v });
    });
    on(dlg, 'change', '[data-frost]', (e, el) => {
      if (!el.value) return;
      store.setSettings({ [el.dataset.frost]: mmdd(fromISO(el.value)) });
    });
    const geoSearch = async () => {
      const q = $('#s-place', dlg).value.trim();
      const list = $('[data-geo-results]', dlg);
      if (!q) return;
      render(list, html`<li class="subtle">Searching…</li>`);
      try {
        const zip = /^\d{5}$/.test(q);
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json${zip ? '&countryCode=US' : ''}`;
        const r = await fetch(url);
        const j = await r.json();
        const res = (j.results || []);
        if (!res.length) { render(list, html`<li class="subtle">No places found. Try "Town, State".</li>`); return; }
        render(list, res.map((p) => html`<li><button type="button" class="btn btn-sm" style="width:100%;justify-content:flex-start" data-pick='${JSON.stringify({ name: `${p.name}${p.admin1 ? ', ' + p.admin1 : ''}`, lat: p.latitude, lon: p.longitude })}'>${icon('pin')}${p.name}${p.admin1 ? `, ${p.admin1}` : ''}${p.country_code && p.country_code !== 'US' ? ` (${p.country_code})` : ''}</button></li>`));
      } catch (err) {
        render(list, html`<li class="subtle">Couldn't reach the place search. Check your connection.</li>`);
      }
    };
    on(dlg, 'click', '[data-geo-search]', geoSearch);
    on(dlg, 'keydown', '#s-place', (e) => { if (e.key === 'Enter') { e.preventDefault(); geoSearch(); } });
    on(dlg, 'click', '[data-pick]', (e, b) => {
      const loc = JSON.parse(b.dataset.pick);
      store.setSettings({ location: loc });
      toast(`Weather location set to ${loc.name}`);
      draw();
    });
    on(dlg, 'click', '[data-geo-me]', () => {
      if (!navigator.geolocation) { toast('Location is not available in this browser.'); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          store.setSettings({ location: { name: 'My location', lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4) } });
          toast('Weather location set to your current position');
          draw();
        },
        () => toast('Could not get your location (permission denied?).'),
        { timeout: 10000 },
      );
    });
    on(dlg, 'click', '[data-geo-reset]', () => {
      store.setSettings({ location: { ...DEFAULT_LOCATION } });
      draw();
    });
    dlg.addEventListener('close', () => {
      // let pages re-render with new settings
      document.dispatchEvent(new CustomEvent('settings-closed'));
    });
  }
  dlg.showModal();
}

/* ---------------- Search ---------------- */
let searchIndex = null;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

async function buildIndex() {
  if (searchIndex) return searchIndex;
  const d = await loadData('tasks', 'products', 'crops', 'plants', 'issues', 'sources', 'glossary', 'pruning');
  const idx = [];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (const t of d.tasks) {
    idx.push({ kind: 'Task', title: t.title, desc: `${t.months.map((m) => MON[m - 1]).join(', ')} · ${t.summary || ''}`, href: `calendar.html#/task/${t.id}`, text: [t.title, t.summary, t.details, (t.tags || []).join(' '), t.category].join(' '), w: 3 });
  }
  for (const p of d.products) {
    idx.push({ kind: 'Product', title: p.name, desc: `${p.activeIngredient || p.analysis || ''} · ${p.use || ''}`, href: `products.html#p-${p.id}`, text: [p.name, p.brand, p.activeIngredient, p.use, p.type, (p.tags || []).join(' ')].join(' '), w: 2 });
  }
  for (const c of d.crops) {
    idx.push({ kind: 'Veggie', title: c.name, desc: `${(c.varieties || []).slice(0, 4).map((v) => v.name).join(', ')}`, href: `garden.html#/crop/${c.id}`, text: [c.name, c.family, (c.varieties || []).map((v) => v.name).join(' '), (c.pests || []).join(' '), (c.aka || []).join(' ')].join(' '), w: 3 });
  }
  for (const p of d.plants) {
    idx.push({ kind: 'Plant', title: p.name, desc: `${p.latin || ''} · ${p.type}`, href: `beds.html#plant-${p.id}`, text: [p.name, p.latin, p.type, p.notes].join(' '), w: 1 });
  }
  for (const i of d.issues) {
    idx.push({ kind: i.group === 'weed' ? 'Weed' : i.group === 'disease' ? 'Disease' : i.group === 'insect' ? 'Insect' : 'Lawn issue', title: i.name, desc: i.id_tips || i.symptoms || '', href: `lawn.html#issue-${i.id}`, text: [i.name, (i.aka || []).join(' '), i.id_tips, i.symptoms, i.cultural, i.control].join(' '), w: 3 });
  }
  for (const p of d.pruning) {
    idx.push({ kind: 'Pruning', title: p.plant, desc: `${p.when} · ${p.how || ''}`, href: `beds.html#prune-${p.id}`, text: [p.plant, p.when, p.how].join(' '), w: 1 });
  }
  for (const s of d.sources) {
    idx.push({ kind: 'Source', title: s.title, desc: `${s.org || ''} · ${s.takeaway || ''}`, href: `library.html#src-${s.id}`, text: [s.title, s.org, s.authors, s.takeaway].join(' '), w: 1 });
  }
  for (const g of d.glossary) {
    idx.push({ kind: 'Glossary', title: g.term, desc: g.def, href: `library.html#g-${g.id}`, text: [g.term, g.def].join(' '), w: 1 });
  }
  for (const n of NAV) idx.push({ kind: 'Page', title: n.label, desc: '', href: n.href, text: n.label, w: 4 });
  for (const e of idx) { e.nt = norm(e.title); e.nx = norm(e.text); }
  searchIndex = idx;
  return idx;
}

function searchIn(idx, q) {
  const toks = norm(q).split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const out = [];
  for (const e of idx) {
    let score = 0;
    let ok = true;
    for (const t of toks) {
      const inTitle = e.nt.includes(t);
      if (!inTitle && !e.nx.includes(t)) { ok = false; break; }
      score += inTitle ? 12 : 3;
      if (e.nt.startsWith(t)) score += 10;
    }
    if (!ok) continue;
    if (e.nt === norm(q)) score += 40;
    out.push({ e, score: score + e.w });
  }
  return out.sort((a, b) => b.score - a.score || a.e.title.localeCompare(b.e.title)).slice(0, 40).map((x) => x.e);
}

export async function openSearch(initial = '') {
  const dlg = makeDialog('search-dlg', 'search-dlg');
  render(dlg, html`
    <div class="search-input">${icon('search')}<input type="search" placeholder="Search tasks, weeds, products, veggies…" aria-label="Search the almanac" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list" value="${initial}"></div>
    <p class="search-status subtle" role="status" aria-live="polite"></p>
    <ul class="search-results" id="search-results" role="listbox" aria-label="Results"></ul>
    <div class="search-hint">Try <em>crabgrass</em>, <em>garlic</em>, <em>grub</em>, <em>Tenacity</em>, <em>brown patch</em>, <em>prune hydrangea</em>. <kbd>↑</kbd><kbd>↓</kbd> to move, <kbd>Enter</kbd> to open, <kbd>Esc</kbd> to close.</div>`);
  dlg.setAttribute('aria-label', 'Search');
  const input = $('input', dlg);
  const list = $('.search-results', dlg);
  const status = $('.search-status', dlg);
  let results = [];
  let sel = 0;
  const draw = () => {
    const q = input.value.trim();
    const shown = q ? results : [];
    status.textContent = !q ? '' : shown.length ? `${shown.length}${shown.length === 40 ? '+' : ''} results` : 'No matches. Try a simpler word.';
    input.setAttribute('aria-expanded', String(shown.length > 0));
    if (shown.length) input.setAttribute('aria-activedescendant', `sr-opt-${sel}`); else input.removeAttribute('aria-activedescendant');
    render(list, shown.map((r, i) => html`<li role="presentation"><a href="${r.href}" id="sr-opt-${i}" role="option" aria-selected="${String(i === sel)}"><span class="sr-kind">${r.kind}</span><span><span class="sr-title">${r.title}</span>${r.desc ? html`<span class="sr-desc">${r.desc}</span>` : ''}</span></a></li>`));
  };
  const run = debounce(async () => {
    const idx = await buildIndex().catch(() => []);
    results = searchIn(idx, input.value);
    sel = 0;
    draw();
  }, 80);
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); draw(); $('[aria-selected="true"]', list)?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); $('[aria-selected="true"]', list)?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && results[sel]) { e.preventDefault(); goTo(results[sel].href); dlg.close(); }
    else if (e.key === 'Escape') { e.preventDefault(); dlg.close(); } // one press closes, instead of first clearing the field
  });
  list.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) { e.preventDefault(); goTo(a.getAttribute('href')); dlg.close(); }
  });
  dlg.showModal();
  input.focus();
  if (initial) run();
  buildIndex().catch(() => {});
}

function goTo(href) {
  const [page] = href.split('#');
  const here = location.pathname.split('/').pop() || 'index.html';
  const pd = previewDate();
  if (page === here) {
    location.hash = href.includes('#') ? href.slice(href.indexOf('#')) : '';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.href = pd ? href.replace(/(\.html)/, `$1?date=${pd}`) : href;
  }
}

/* ---------------- misc helpers ---------------- */
export function setTitle(t) { document.title = `${t} · KC Lawn & Garden Almanac`; }

export function loadingBlock(msg = 'Loading…') {
  return html`<div class="loading"><span class="spinner"></span>${msg}</div>`;
}

export function errorBlock(err) {
  return html`<div class="callout callout-critical">${icon('alert')}<div><strong>Something went wrong loading this page.</strong><p>${err && err.message ? err.message : String(err)}</p><p>If you opened the file directly from disk, serve this folder with a local web server instead (for example <code>python3 -m http.server</code>).</p></div></div>`;
}

export { esc };
