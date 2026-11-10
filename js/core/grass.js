// Lawn grass types. The lawn tasks, guide and alerts follow the grass in
// settings.grass; a ZIP lookup suggests one from the local climate.
import { store } from './store.js';

export const GRASSES = {
  tallfescue: { name: 'Tall fescue', group: 'cool', mow: '3–4 in', mowSeg: [3, 3.5, 4], n: [2, 3, 4], nDefault: 3, nNote: 'Tall fescue does best on 2–4 lb N a year, most of it in fall.' },
  coolmix: { name: 'Bluegrass, ryegrass & fine fescue', short: 'Bluegrass mix', group: 'cool', mow: '2.5–3.5 in', mowSeg: [2.5, 3, 3.5], n: [2, 3, 4], nDefault: 3, nNote: 'Bluegrass and ryegrass lawns do best on 2–4 lb N a year, most of it in fall. Fine fescue in shade needs only 1–2 lb.' },
  bermuda: { name: 'Bermudagrass', group: 'warm', mow: '1–2 in', mowSeg: [1, 1.5, 2], n: [2, 3, 4], nDefault: 3, nNote: 'Bermudagrass uses 2–4 lb N a year, all of it while the lawn is green and growing.' },
  zoysia: { name: 'Zoysiagrass', group: 'warm', mow: '1–2.5 in', mowSeg: [1, 1.5, 2], n: [1, 2, 3], nDefault: 2, nNote: 'Zoysiagrass needs only 1–2 lb N a year, in late spring and midsummer. More builds thatch.' },
  staug: { name: 'St. Augustinegrass', group: 'warm', mow: '2.5–4 in', mowSeg: [2.5, 3, 4], n: [2, 3, 4], nDefault: 3, nNote: 'St. Augustinegrass uses 2–4 lb N a year, from full green-up to late summer.' },
  centipede: { name: 'Centipedegrass', group: 'warm', mow: '1.5–2 in', mowSeg: [1.5, 2], n: [1, 2], nDefault: 1, nNote: 'Centipedegrass needs only ½–1 lb N a year. Extra nitrogen is the usual cause of centipede decline.' },
};
export const GRASS_ORDER = ['tallfescue', 'coolmix', 'bermuda', 'zoysia', 'staug', 'centipede'];

export const grassId = (s = store.settings) => (GRASSES[s.grass] ? s.grass : 'tallfescue');
export const grassOf = (s = store.settings) => GRASSES[grassId(s)];
export const isWarm = (s = store.settings) => grassOf(s).group === 'warm';

/** Does a task, issue or product tagged with `grass` apply to this lawn? Untagged applies to all. */
export function grassMatch(tag, s = store.settings) {
  if (!tag) return true;
  const id = grassId(s);
  const group = GRASSES[id].group;
  return [].concat(tag).some((g) => g === id || g === group);
}

/**
 * Pick the usual lawn grass for a climate. zr = hardiness zone rank
 * (zone number × 2, +1 for "b"), julyHi = normal July high in °F.
 */
export function suggestGrass({ zr, julyHi, lon }) {
  if (julyHi < 83) return 'coolmix';            // cool summers: Pacific Northwest, northern tier, mountains, coast
  if (zr >= 18) return lon < -100 ? 'bermuda' : 'staug'; // zone 9a and warmer
  if (zr >= 16) return 'bermuda';               // zone 8
  if (zr >= 12) return 'tallfescue';            // zones 6–7: transition zone
  return 'coolmix';
}
