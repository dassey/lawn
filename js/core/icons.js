// Hand-drawn 24×24 stroke icons (no external icon library).
import { raw } from './dom.js';

const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  lawn: '<path d="M2.5 20.5h19"/><path d="M5 20.5c0-4.5-.8-7.5-2.5-9.5"/><path d="M8.5 20.5c0-6 1-10 3.5-13"/><path d="M13.5 20.5c0-5 1.5-8.5 4.5-10.5"/><path d="M18 20.5c0-2.5.8-4.5 3-5.5"/>',
  beds: '<path d="M12 21v-9.5"/><path d="M7 4.5 9.5 7 12 4l2.5 3L17 4.5V8a5 5 0 0 1-10 0z"/><path d="M12 17.5c1.8-2.6 4.4-3.1 6-2.3-.9 2-3.3 3.1-6 2.3z"/><path d="M12 15c-1.6-2-3.8-2.4-5.2-1.7.8 1.7 2.8 2.5 5.2 1.7z"/>',
  veg: '<path d="M12 7.5c-4.4 0-8 3-8 6.7S7.6 21 12 21s8-2.6 8-6.8-3.6-6.7-8-6.7z"/><path d="M12 7.5V4"/><path d="M8.5 6.5 12 8l3.5-1.5"/><path d="M9.5 9.8 12 8l2.5 1.8"/>',
  yard: '<path d="M12 21v-4.5"/><path d="M12 3.5c-3 0-5.5 2.3-5.5 5.2 0 .6.1 1.1.3 1.6A4 4 0 0 0 8 17.5h8a4 4 0 0 0 1.2-7.2c.2-.5.3-1 .3-1.6 0-2.9-2.5-5.2-5.5-5.2z"/>',
  tools: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5l-5.4 5.4a1.8 1.8 0 0 0 2.5 2.5l5.4-5.4a4 4 0 0 0 5-5.3l-2.4 2.4-2.3-.4-.4-2.3z"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15v3M8.5 18h.01M12 18h.01"/>',
  bag: '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  journal: '<path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14.5a1.5 1.5 0 0 1-1.5 1.5H6z"/><path d="M6 3.5v17M9.5 8h5.5M9.5 11.5h5.5"/><path d="M4 7h3M4 12h3M4 17h3"/>',
  book: '<path d="M4.5 19V5.5A2.5 2.5 0 0 1 7 3h12.5v14H7a2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 7 22h12.5v-5"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 10a4.3 4.3 0 0 1-.5 8.5z"/>',
  partly: '<path d="M8 3.5V5M3.5 8H5M4.8 4.8l1 1M12.2 4.8l-1 1"/><path d="M5.6 10.5a3 3 0 1 1 5-3"/><path d="M9 19.5a3.8 3.8 0 0 1-.3-7.6 5 5 0 0 1 9.6 1A3.4 3.4 0 0 1 18 19.5z"/>',
  rain: '<path d="M7 15a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 6.5a4.3 4.3 0 0 1-.5 8.5z"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>',
  storm: '<path d="M7 14.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 6a4.3 4.3 0 0 1-.5 8.5"/><path d="m12.5 12-2.5 4.5h4l-2.5 4.5"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>',
  fog: '<path d="M4 9h16M4 13h16M6 17h12"/>',
  drop: '<path d="M12 3.5s-6 6.5-6 10.5a6 6 0 0 0 12 0c0-4-6-10.5-6-10.5z"/>',
  thermo: '<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9.5v6"/>',
  wind: '<path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 13h15a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 17h7"/>',
  flower: '<ellipse cx="12" cy="7" rx="2.6" ry="3.4"/><ellipse cx="12" cy="17" rx="2.6" ry="3.4"/><ellipse cx="7" cy="12" rx="3.4" ry="2.6"/><ellipse cx="17" cy="12" rx="3.4" ry="2.6"/><circle cx="12" cy="12" r="1.6"/>',
  bug: '<rect x="7.5" y="8" width="9" height="12" rx="4.5"/><path d="M12 8v12M9 8.5a3 3 0 0 1 6 0M4 12.5h3.5M16.5 12.5H20M4.5 18.5l3.2-1.5M19.5 18.5l-3.2-1.5M5 6.5l3 2M19 6.5l-3 2"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z"/>',
  print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M4.5 19.5h15"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  sprout: '<path d="M12 20.5V11"/><path d="M12 11c0-3.9 2.9-6.5 7-6.5 0 3.9-2.9 6.5-7 6.5z"/><path d="M12 13.5c0-3-2.3-5-5.5-5 0 3 2.3 5 5.5 5z"/>',
  shovel: '<path d="M13.5 10.5 20 4M17.5 2.5l4 4"/><path d="M5 13.5 10.5 8l5.5 5.5L10.5 19c-2 2-5 2-6.5.5S3 15.5 5 13.5z"/>',
  spray: '<path d="M9 8h5l1.5 3V20a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 20v-9z"/><path d="M9 8V5h4v3M13 5h3.5l1 1.5M19.5 4v.01M20.5 7v.01M19.5 10v.01"/>',
  scissors: '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M8.6 8 20 17.5M8.6 16 20 6.5"/>',
  basket: '<path d="M4 10h16l-1.8 9.2a1.5 1.5 0 0 1-1.5 1.3H7.3a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M8 10l3-6M16 10l-3-6M9 14v3M12 14v3M15 14v3"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4v5h-5"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  flask: '<path d="M9.5 3.5h5M10 3.5v6L4.8 18.3a1.5 1.5 0 0 0 1.3 2.2h11.8a1.5 1.5 0 0 0 1.3-2.2L14 9.5v-6"/><path d="M7.5 15h9"/>',
  phone: '<path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5L16 14l4 1.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  cart: '<path d="M3.5 4.5H6l2.2 10.5h10.3L20.5 8H7.2"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  dollar: '<path d="M12 3.5v17"/><path d="M16.5 7.5c-.8-1.2-2.4-2-4.5-2-2.6 0-4.5 1.3-4.5 3.2 0 4.3 9.2 2.2 9.2 6.6 0 1.9-2 3.2-4.7 3.2-2.3 0-4.1-.9-4.9-2.3"/>',
  ruler: '<path d="M3.5 16.5 16.5 3.5l4 4-13 13z"/><path d="m7 13 1.8 1.8M10 10l1.8 1.8M13 7l1.8 1.8"/>',
  can: '<path d="M5 9h9.5v9.5a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 18.5z"/><path d="M14.5 11.5 20 8M7.5 9V6.5a2.5 2.5 0 0 1 5 0V9"/>',
  soil: '<path d="M3 11h18M3 15.5h18M3 20h18"/><path d="M12 11V4M9.5 6.5 12 4l2.5 2.5"/>',
  leaf: '<path d="M5 19.5c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19.5l8-8"/>',
  share: '<circle cx="6" cy="12" r="2.3"/><circle cx="17.5" cy="6" r="2.3"/><circle cx="17.5" cy="18" r="2.3"/><path d="m8 11 7.5-4M8 13l7.5 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  sparkle: '<path d="M12 3.5 13.8 9l5.7 2-5.7 2-1.8 5.5-1.8-5.5-5.7-2 5.7-2z"/>',
  flag: '<path d="M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9V6z"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.8 0-3.9 3.3-5.7 3.8-9.7 2.6 1.6 3.9 3.7 3.7 6.1 1.1-.5 1.9-1.6 2.1-2.9 1.6 1.7 2.4 3.9 2.4 6.3 0 3.6-2.4 6-6 6z"/>',
  mower: '<path d="M3.5 15.5h13l2-6.5H21"/><path d="M5.5 15.5V12h8.5"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>',
  bee: '<ellipse cx="12" cy="13.5" rx="4" ry="5.5"/><path d="M8.2 12h7.6M8.5 15.5h7M12 8V5.5M10 4l2 1.5L14 4"/><path d="M8.5 10.5C5 9 3.5 6.5 5 5.5s4 1.5 4.5 4M15.5 10.5C19 9 20.5 6.5 19 5.5s-4 1.5-4.5 4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  seed: '<path d="M12 20.5c-4.2 0-7-3.4-7-7.5C5 8 9 4.5 12 3.5c3 1 7 4.5 7 9.5 0 4.1-2.8 7.5-7 7.5z"/><path d="M12 7.5v9"/>',
};

export const ICONS = Object.keys(P);

export function icon(name, cls = '') {
  const p = P[name] || P.info;
  return raw(`<svg class="i ${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`);
}

/** Brand mark (also used as favicon). */
export function brandMark(cls = 'brand-mark') {
  return raw(`<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="16" fill="#3f7d3a"/><circle cx="45" cy="21" r="8" fill="#f2c14e"/><path d="M9 51h46" stroke="#b5651d" stroke-width="5" stroke-linecap="round"/><path d="M16 49c0-10-2-16-6-20M24 49c0-14 2-22 7-28M34 49c0-10 3-17 9-21M44 49c0-6 2-10 7-12" stroke="#eaf4e2" stroke-width="4" stroke-linecap="round" fill="none"/></svg>`);
}

/** WMO weather code → icon name. */
export function wxIcon(code) {
  if (code == null) return 'cloud';
  if (code === 0) return 'sun';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  return 'rain';
}

export const CAT_ICON = { lawn: 'lawn', beds: 'beds', veg: 'veg', yard: 'yard' };
