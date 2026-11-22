// Identification photos. data/photos.json maps "plant-…", "crop-…" and
// "issue-…" keys to a file in assets/photos plus the credit its license needs.
// Photos load lazily, and only where they help someone recognize something.
import { html } from './dom.js';

/** Small square thumbnail for a row; empty when there is no photo. */
export function thumb(photos, key) {
  const p = photos && photos[key];
  return p ? html`<img class="ph-thumb" src="assets/photos/${p.file}" alt="" loading="lazy" decoding="async" width="56" height="56">` : '';
}

/** Full photo with its credit line; empty when there is no photo. */
export function photo(photos, key, alt) {
  const p = photos && photos[key];
  if (!p) return '';
  return html`<figure class="ph">
    <img src="assets/photos/${p.file}" alt="${alt}" loading="lazy" decoding="async">
    <figcaption>Photo: ${p.by}, <a href="${p.source}" target="_blank" rel="noopener">${p.license}</a>, via Wikimedia Commons</figcaption>
  </figure>`;
}
