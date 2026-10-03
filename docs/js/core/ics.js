// iCalendar (.ics) export. Each task becomes an all-day reminder on the
// first day of its window that repeats yearly; the full window, cue and
// steps go in the description.
import { download } from './dom.js';
import { datedWindows, whenLabel } from './windows.js';
import { pad } from './dates.js';

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** Fold lines at 75 octets per RFC 5545. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const l = new TextEncoder().encode(ch).length;
    if (curLen + l > (out.length ? 74 : 75)) { out.push(cur); cur = ''; curLen = 0; }
    cur += ch;
    curLen += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function taskEvents(tasks, year, settings) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const base = new URL('calendar.html', location.href).href;
  const evs = [];
  for (const t of tasks) {
    const w = datedWindows(t, year, settings)[0];
    if (!w) continue;
    const end = new Date(w.start);
    end.setDate(end.getDate() + 1);
    const desc = [
      `When: ${whenLabel(t, year, settings)}`,
      t.trigger && t.trigger.text ? `Cue: ${t.trigger.text}` : '',
      t.summary || '',
      t.howTo && t.howTo.length ? 'Steps:\n' + t.howTo.map((s, i) => `${i + 1}. ${s.replace(/\*\*/g, '')}`).join('\n') : '',
      t.rate ? `Rate: ${t.rate.replace(/\*\*/g, '')}` : '',
      t.noIrrigationNote ? `No sprinkler? ${t.noIrrigationNote.replace(/\*\*/g, '')}` : '',
      `${base}#/task/${t.id}`,
    ].filter(Boolean).join('\n\n');
    evs.push([
      'BEGIN:VEVENT',
      `UID:${t.id}@kc-lawn-almanac`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(w.start)}`,
      `DTEND;VALUE=DATE:${ymd(end)}`,
      'RRULE:FREQ=YEARLY',
      `SUMMARY:${esc(`${t.title}`)}`,
      `DESCRIPTION:${esc(desc)}`,
      `CATEGORIES:${esc(t.category)}`,
      `URL:${base}#/task/${t.id}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ]);
  }
  return evs;
}

export function buildICS(events, name = 'KC Lawn & Garden Almanac') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KC Lawn & Garden Almanac//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    ...events.flat(),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadICS(filename, events, name) {
  download(filename, buildICS(events, name), 'text/calendar;charset=utf-8');
}

/** Generic dated events (e.g., seed-starting dates). */
export function simpleEvents(items) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return items.map((it) => {
    const end = new Date(it.date);
    end.setDate(end.getDate() + 1);
    return [
      'BEGIN:VEVENT',
      `UID:${it.uid}@kc-lawn-almanac`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(it.date)}`,
      `DTEND;VALUE=DATE:${ymd(end)}`,
      it.yearly ? 'RRULE:FREQ=YEARLY' : '',
      `SUMMARY:${esc(it.title)}`,
      it.desc ? `DESCRIPTION:${esc(it.desc)}` : '',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ].filter(Boolean);
  });
}
