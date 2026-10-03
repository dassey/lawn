// Date helpers. Windows in the data are "MM-DD" strings so one plan works
// every year; a window whose end is before its start wraps into next year.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (m) => MONTHS[(m - 1 + 12) % 12];
export const monthShort = (m) => MON[(m - 1 + 12) % 12];
export const pad = (n) => String(n).padStart(2, '0');
const DAY = 86400000;

export function fromISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const mmdd = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function fromMMDD(s, year) {
  const [m, d] = String(s).split('-').map(Number);
  return new Date(year, m - 1, d);
}
export const stripTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** Whole days from a to b (b − a). */
export const diffDays = (a, b) => Math.round((stripTime(b) - stripTime(a)) / DAY);

/* "Today", with an optional ?date=YYYY-MM-DD preview override for planning ahead. */
let _today = null;
export function previewDate() {
  const q = new URLSearchParams(location.search).get('date');
  return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null;
}
/** The real calendar date, ignoring any ?date= preview (live weather is always "now"). */
export function realToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
export function today() {
  if (!_today) {
    const q = previewDate();
    const n = new Date();
    _today = q ? fromISO(q) : new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  return new Date(_today);
}

export function fmtDate(d, opts = { month: 'short', day: 'numeric' }) {
  return d.toLocaleDateString('en-US', opts);
}
export function fmtMMDD(s) {
  if (!s) return '';
  const [m, d] = s.split('-').map(Number);
  return `${MON[m - 1]} ${d}`;
}
/** "May 10–20", "Apr 25 – May 5". Accepts Date objects. */
export function fmtRange(a, b) {
  if (!a) return '';
  if (!b || diffDays(a, b) === 0) return fmtDate(a);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${MON[a.getMonth()]} ${a.getDate()}–${b.getDate()}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}
export function fmtRelative(d, base = today()) {
  const n = diffDays(base, d);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 0) return n < 14 ? `in ${n} days` : n < 60 ? `in ${Math.round(n / 7)} weeks` : `in ${Math.round(n / 30)} months`;
  return -n < 14 ? `${-n} days ago` : `${Math.round(-n / 7)} weeks ago`;
}

/** Resolve an MM-DD window to real dates for a given (start) year. */
export function windowFor(start, end, year) {
  const s = fromMMDD(start, year);
  let e = fromMMDD(end || start, year);
  if (e < s) e = fromMMDD(end, year + 1);
  return { start: s, end: e };
}
export const inRange = (d, s, e) => stripTime(d) >= stripTime(s) && stripTime(d) <= stripTime(e);

/** Shift an MM-DD string by n days (computed in a non-leap year). */
export function shiftMMDD(s, n) {
  if (!s || !n) return s;
  const d = addDays(fromMMDD(s, 2001), n);
  return mmdd(d);
}
/** Day of year (1..365) for an MM-DD in a non-leap year — used for timelines. */
export function doyMMDD(s) {
  const d = fromMMDD(s, 2001);
  return Math.round((d - new Date(2001, 0, 1)) / DAY) + 1;
}
export const doy = (d) => Math.round((stripTime(d) - new Date(d.getFullYear(), 0, 1)) / DAY) + 1;

/** Months (1-12) touched by an MM-DD window. */
export function monthsOfWindow(start, end) {
  const out = [];
  let m = Number(start.slice(0, 2));
  const em = Number((end || start).slice(0, 2));
  for (let i = 0; i < 12; i++) {
    out.push(m);
    if (m === em) break;
    m = (m % 12) + 1;
  }
  return out;
}

export function season(m) {
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'fall';
}
