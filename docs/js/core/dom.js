// Tiny DOM + templating helpers. Every interpolated value is HTML-escaped
// unless it is wrapped with raw() (used for our own trusted SVG/markup).

export class Raw {
  constructor(s) { this.s = String(s); }
  toString() { return this.s; }
}

export const raw = (s) => new Raw(s ?? '');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function renderVal(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  return esc(v);
}

/** Tagged template: html`<p>${userText}</p>` → Raw (escaped). */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += renderVal(vals[i]) + strings[i + 1];
  return new Raw(out);
}

/** Replace an element's content with a template result. */
export function render(el, tpl) {
  if (!el) return;
  el.innerHTML = tpl instanceof Raw ? tpl.s : renderVal(tpl);
}

/**
 * Minimal, safe inline markdown for content strings in the data files:
 * **bold**, *italic*, `code`, [text](url). Input is escaped first.
 */
export function md(s) {
  let t = esc(s ?? '');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const safe = /^(https?:|mailto:|tel:|#|[a-z0-9-]+\.html)/i.test(url) ? url : '#';
    const ext = /^https?:/i.test(safe);
    return `<a href="${safe}"${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
  });
  return new Raw(t);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Delegated event listener. */
export function on(root, type, selector, handler, opts) {
  root.addEventListener(type, (e) => {
    const t = e.target instanceof Element ? e.target.closest(selector) : null;
    if (t && root.contains(t)) handler(e, t);
  }, opts);
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Number formatting helpers. */
export function fmtNum(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  const f = Math.abs(n) >= 100 ? 0 : digits;
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: f, minimumFractionDigits: 0 });
}
export const plural = (n, word, pluralWord) => `${fmtNum(n, 0)} ${n === 1 ? word : (pluralWord || word + 's')}`;

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Trigger a file download of text content. */
export function download(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Read hash-route like "#/month/9" → ['month','9']. */
export function hashParts() {
  return decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
}

/** Scroll an element into view and flash a highlight class. */
export function flash(el, cls = 'is-target', ms = 2400) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
