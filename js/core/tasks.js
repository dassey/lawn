// Task engine: card rendering, filtering/sorting, nitrogen bookkeeping and
// delegated interactions. Timing math lives in windows.js.
import { html, raw, md, $, on, debounce, fmtNum } from './dom.js';
import { icon, CAT_ICON } from './icons.js';
import { store, isDone, doneInfo, setDone } from './store.js';
import { fmtDate } from './dates.js';
import { toast } from './ui.js';
import { downloadICS, taskEvents } from './ics.js';
import { openLogDialog } from './logdlg.js';
import { datedWindows, taskStatus, whenLabel } from './windows.js';

export {
  regionShiftDays, baseWindows, mmddWindows, taskMonths, datedWindows, taskStatus, whenLabel,
} from './windows.js';

export const CATS = {
  lawn: { id: 'lawn', label: 'Lawn', icon: 'lawn' },
  beds: { id: 'beds', label: 'Beds', icon: 'beds' },
  veg: { id: 'veg', label: 'Veggies', icon: 'veg' },
  yard: { id: 'yard', label: 'Yard & trees', icon: 'yard' },
};
export const CAT_ORDER = ['lawn', 'beds', 'veg', 'yard'];
export const PRIORITY = {
  critical: { label: 'Key task', cls: 'badge-critical', rank: 0 },
  recommended: { label: 'Recommended', cls: 'badge-recommended', rank: 1 },
  optional: { label: 'Optional', cls: 'badge-optional', rank: 2 },
};
export const TRIGGER_ICON = {
  soilTemp: 'thermo', airTemp: 'thermo', bloom: 'flower', rainfall: 'drop', frost: 'snow',
  growth: 'lawn', pest: 'bug', weather: 'cloud', date: 'flag', harvest: 'basket',
};
export const EVIDENCE = {
  extension: 'Extension',
  'peer-reviewed': 'Peer-reviewed',
  label: 'Product label',
  vendor: 'Vendor claim',
  practice: 'Common practice',
  data: 'Data',
  law: 'Law',
  community: 'Local group',
  tool: 'Tool',
  folklore: 'Folklore',
};

/* ---------------- filtering / sorting ---------------- */
export function visibleTasks(tasks, s = store.settings) {
  const custom = (store.state.custom || []).map((c) => ({ ...c, custom: true }));
  const all = tasks.concat(custom);
  return s.showOptional ? all : all.filter((t) => t.priority !== 'optional');
}

export function sortTasks(list, year, s = store.settings) {
  return list.slice().sort((a, b) => {
    const pa = PRIORITY[a.priority]?.rank ?? 1;
    const pb = PRIORITY[b.priority]?.rank ?? 1;
    const wa = datedWindows(a, year, s)[0];
    const wb = datedWindows(b, year, s)[0];
    const sa = a.window ? wa.start.getTime() : 0;
    const sb = b.window ? wb.start.getTime() : 0;
    return sa - sb || pa - pb || a.title.localeCompare(b.title);
  });
}

/* ---------------- nitrogen bookkeeping ---------------- */
export function nitrogenForYear(year, tasks) {
  const entries = store.state.journal.filter((j) => j.type === 'fertilize' && j.cat !== 'veg' && j.cat !== 'beds' && String(j.date).startsWith(String(year)));
  const linked = new Set(entries.map((j) => j.taskId).filter(Boolean));
  let n = 0;
  const parts = [];
  for (const j of entries) {
    const v = Number(j.n) || 0;
    if (v) { n += v; parts.push({ date: j.date, n: v, label: j.title || 'Fertilizer' }); }
  }
  for (const t of tasks) {
    if (t.nitrogen && isDone(year, t.id) && !linked.has(t.id)) {
      n += t.nitrogen;
      const info = doneInfo(year, t.id);
      parts.push({ date: info?.at?.slice(0, 10) || `${year}`, n: t.nitrogen, label: t.title });
    }
  }
  return { n, parts: parts.sort((a, b) => String(a.date).localeCompare(String(b.date))) };
}

/* ---------------- rendering ---------------- */
function effortDots(e) {
  const n = { low: 1, medium: 2, high: 3 }[e] || 0;
  if (!n) return '';
  return html`<span class="mi" title="Effort: ${e}">${'●'.repeat(n)}${'○'.repeat(3 - n)} <span class="sr-only">effort ${e}</span></span>`;
}

function productChips(ids, ctx) {
  const P = ctx.P || {};
  let list = (ids || []).map((id) => P[id]).filter(Boolean);
  if (ctx.settings?.preferOrganic) list = list.slice().sort((a, b) => (b.organic ? 1 : 0) - (a.organic ? 1 : 0));
  if (!list.length) return '';
  return html`<div class="link-chips">${list.map((p) => html`<a class="link-chip" href="products.html#p-${p.id}">${icon(p.organic ? 'leaf' : 'bag')}${p.name}</a>`)}</div>`;
}

export function sourceItems(ids, S) {
  const list = (ids || []).map((id) => S?.[id]).filter(Boolean);
  if (!list.length) return '';
  return html`<ul class="source-list">${list.map((s) => html`<li><span class="ev ev-${s.type}">${EVIDENCE[s.type] || s.type}</span><span>${s.url ? html`<a href="${s.url}" target="_blank" rel="noopener" title="${s.title}">${s.short || s.title}</a>` : s.short || s.title}<a class="src-more" href="library.html#src-${s.id}" title="About this source" aria-label="About this source: ${s.short || s.title}">${icon('info')}</a></span></li>`)}</ul>`;
}

export function taskCard(t, ctx) {
  const s = ctx.settings || store.settings;
  const year = ctx.year;
  const done = isDone(year, t.id);
  const info = doneInfo(year, t.id);
  const cat = CATS[t.category] || CATS.yard;
  const pr = PRIORITY[t.priority] || PRIORITY.recommended;
  const tr = t.trigger && t.trigger.text ? t.trigger : null;
  const when = whenLabel(t, year, s);
  const status = ctx.date ? taskStatus(t, ctx.date, s) : null;
  let rel = '';
  if (status && ctx.showRelative) {
    if (status.state === 'now') rel = status.daysLeft <= 7 ? (status.daysLeft === 0 ? 'last day' : status.daysLeft === 1 ? '1 day left' : `${status.daysLeft} days left`) : '';
    else if (status.next && status.daysToNext <= 45) rel = status.daysToNext === 1 ? 'starts tomorrow' : `starts in ${status.daysToNext} days`;
  }
  const conflicts = (t.conflicts || []).map((id) => ctx.T?.[id]).filter(Boolean);
  const conflictDone = conflicts.filter((c) => isDone(year, c.id));
  const note = store.state.notes[t.id] || '';
  const showWater = t.noIrrigationNote || (s.hoseTimer && t.hoseTimerNote);
  const detailsId = `td-${t.id}`;

  return html`<article class="task cat-${cat.id} ${done ? 'is-done' : ''} ${ctx.compact ? 'task-compact' : ''}" id="task-${t.id}" data-task="${t.id}">
    <div class="task-main">
      <label class="check" title="${done ? 'Mark not done' : 'Mark done'}">
        <input type="checkbox" data-done="${t.id}" ${done ? raw('checked') : ''} aria-label="Done: ${t.title}">
        <span class="check-box" aria-hidden="true">${icon('check')}</span>
      </label>
      <div class="task-body">
        <div class="task-top">
          <h3 class="task-title"><button type="button" data-expand="${t.id}" aria-controls="${detailsId}">${t.title}</button></h3>
          ${t.priority !== 'recommended' ? html`<span class="badge ${pr.cls}">${pr.label}</span>` : ''}
        </div>
        <div class="task-meta">
          <span class="mi">${icon('calendar')}${when}${rel ? html` · <strong>${rel}</strong>` : ''}</span>
          ${tr ? html`<span class="mi trigger">${icon(TRIGGER_ICON[tr.type] || 'info')}${tr.text}</span>` : ''}
          ${ctx.showCat ? html`<span class="badge badge-cat">${cat.label}</span>` : ''}
          ${t.noIrrigationNote ? html`<span class="mi" title="Has a no-sprinkler tip" style="color:var(--water)">${icon('drop')}<span class="sr-only">No-sprinkler tip</span></span>` : ''}
          ${conflicts.length ? html`<span class="mi" title="Timing conflict" style="color:var(--warn)">${icon('alert')}<span class="sr-only">Timing conflict</span></span>` : ''}
          ${t.custom ? html`<span class="badge badge-outline">My task</span>` : ''}
          ${effortDots(t.effort)}
        </div>
        ${t.summary ? html`<p class="task-summary">${md(t.summary)}</p>` : ''}
        ${done && info ? html`<div class="done-stamp">${icon('check')} Done ${fmtDate(new Date(info.at))}</div>` : ''}
      </div>
      <button type="button" class="icon-btn task-expand" data-expand="${t.id}" aria-expanded="false" aria-controls="${detailsId}" aria-label="Show details">${icon('chevronDown')}</button>
    </div>
    <div class="task-details" id="${detailsId}" hidden>
      ${t.details ? html`<p>${md(t.details)}</p>` : ''}
      ${t.howTo && t.howTo.length ? html`<h4>How to</h4><ol>${t.howTo.map((x) => html`<li>${md(x)}</li>`)}</ol>` : ''}
      ${t.rate || tr ? html`<dl class="kv">
        ${t.rate ? html`<dt>Rate</dt><dd>${md(t.rate)}</dd>` : ''}
        ${tr ? html`<dt>Cue</dt><dd>${tr.text}</dd>` : ''}
        ${t.nitrogen ? html`<dt>Nitrogen</dt><dd>${fmtNum(t.nitrogen)} lb N per 1,000 sq ft (counts toward your yearly total when checked)</dd>` : ''}
      </dl>` : ''}
      ${showWater ? html`<div class="callout callout-water" style="margin-top:12px">${icon('drop')}<div>
        <strong>No sprinkler system?</strong>
        ${t.noIrrigationNote ? html`<p>${md(t.noIrrigationNote)}</p>` : ''}
        ${s.hoseTimer && t.hoseTimerNote ? html`<p><strong>With your hose timer:</strong> ${md(t.hoseTimerNote)}</p>` : ''}
      </div></div>` : ''}
      ${conflicts.length ? html`<div class="callout callout-warn" style="margin-top:12px">${icon('alert')}<div>
        <strong>Timing conflict</strong>
        <p>${t.conflictNote ? md(t.conflictNote) : 'These tasks interfere with each other.'} See: ${conflicts.map((c, i) => html`${i ? ', ' : ''}<a href="calendar.html#/task/${c.id}">${c.title}</a>`)}.</p>
        ${conflictDone.length ? html`<p><strong>Heads up:</strong> you marked ${conflictDone.map((c) => html`<em>${c.title}</em> (${fmtDate(new Date(doneInfo(year, c.id).at))})`)} as done this year.</p>` : ''}
      </div></div>` : ''}
      ${t.safety ? html`<div class="callout" style="margin-top:12px">${icon('shield')}<div><strong>Safety</strong><p>${md(t.safety)}</p></div></div>` : ''}
      ${t.products && t.products.length ? html`<h4>Products</h4>${productChips(t.products, ctx)}` : ''}
      ${t.sources && t.sources.length ? html`<h4>Sources ${t.evidence ? html`<span class="ev ev-${t.evidence}" style="margin-left:6px">${EVIDENCE[t.evidence] || t.evidence}</span>` : ''}</h4>${sourceItems(t.sources, ctx.S)}` : ''}
      ${t.calc ? html`<p style="margin-top:12px"><a class="btn btn-sm" href="tools.html#${t.calc}">${icon('calculator')}Open the calculator</a></p>` : ''}
      <div class="task-actions">
        <button type="button" class="btn btn-sm" data-ics="${t.id}">${icon('calendar')}Add to calendar</button>
        <button type="button" class="btn btn-sm" data-log="${t.id}">${icon('journal')}Log it</button>
        <button type="button" class="btn btn-sm btn-ghost" data-copy="${t.id}">${icon('link')}Copy link</button>
        ${t.custom ? html`<button type="button" class="btn btn-sm btn-danger" data-del-custom="${t.id}">${icon('trash')}Delete</button>` : ''}
      </div>
      <div class="task-note field">
        <label for="note-${t.id}" class="subtle">My notes</label>
        <textarea id="note-${t.id}" data-note="${t.id}" placeholder="What you used, what happened, what to change next year…">${note}</textarea>
      </div>
    </div>
  </article>`;
}

/** Wire all task interactions inside a container (delegated, once). */
export function wireTasks(root, getCtx, rerender) {
  if (root.dataset.tasksWired) return;
  root.dataset.tasksWired = '1';

  on(root, 'change', '[data-done]', (e, el) => {
    const ctx = getCtx();
    const id = el.dataset.done;
    // setDone notifies the store; each page re-renders from its store subscription.
    setDone(ctx.year, id, el.checked);
    const t = ctx.T[id];
    if (el.checked) {
      toast(`Done: ${t ? t.title : 'task'}`, { action: { label: 'Undo', fn: () => setDone(ctx.year, id, false) } });
    }
  });

  on(root, 'click', '[data-expand]', (e, el) => {
    const id = el.dataset.expand;
    const card = el.closest('.task');
    const det = card && card.querySelector('.task-details');
    if (!det) return;
    const open = det.hidden;
    det.hidden = !open;
    card.querySelectorAll('[aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', String(open)));
  });

  on(root, 'click', '[data-ics]', (e, el) => {
    const ctx = getCtx();
    const t = ctx.T[el.dataset.ics];
    if (!t) return;
    downloadICS(`${t.id}.ics`, taskEvents([t], ctx.year, ctx.settings || store.settings));
    toast('Calendar file downloaded; open it to add the reminder (repeats yearly).');
  });

  on(root, 'click', '[data-log]', (e, el) => {
    const ctx = getCtx();
    const t = ctx.T[el.dataset.log];
    if (!t) return;
    openLogDialog({
      cat: t.category, type: t.logType || (t.nitrogen ? 'fertilize' : 'task'), title: t.title, taskId: t.id,
      n: t.nitrogen || '', product: (t.products || [])[0] || '',
    });
  });

  on(root, 'click', '[data-copy]', async (e, el) => {
    const url = new URL(`calendar.html#/task/${el.dataset.copy}`, location.href).href;
    try { await navigator.clipboard.writeText(url); toast('Link copied'); }
    catch { prompt('Copy this link:', url); }
  });

  on(root, 'click', '[data-del-custom]', (e, el) => {
    const id = el.dataset.delCustom;
    store.update((s) => { s.custom = s.custom.filter((c) => c.id !== id); }, 'custom');
    toast('Task deleted');
  });

  const saveNote = debounce((id, v) => {
    store.update((s) => { if (v.trim()) s.notes[id] = v; else delete s.notes[id]; }, 'note');
  }, 400);
  on(root, 'input', '[data-note]', (e, el) => saveNote(el.dataset.note, el.value));
}

/** Expand and scroll to a task card by id. */
export function revealTask(root, id) {
  const card = root.querySelector(`#task-${CSS.escape(id)}`);
  if (!card) return false;
  const det = card.querySelector('.task-details');
  if (det) {
    det.hidden = false;
    card.querySelectorAll('[aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
  }
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('is-target');
  setTimeout(() => card.classList.remove('is-target'), 2600);
  return true;
}

export function catIcon(id) { return icon(CAT_ICON[id] || 'yard'); }
