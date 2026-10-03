// Lawn & garden math. All rates are per 1,000 sq ft unless noted.

/** 1 inch of water over 1,000 sq ft ≈ 623 gallons (MU rounds to 620). */
export const GAL_PER_INCH_PER_1000 = 623;
export const SQFT_PER_ACRE = 43560;

/** lb of product per 1,000 sq ft to deliver `lbN` of nitrogen: lbN × 100 ÷ %N. */
export const productPer1000 = (lbN, pctN) => (pctN > 0 ? (lbN * 100) / pctN : NaN);
export const productTotal = (lbN, pctN, area) => (productPer1000(lbN, pctN) * area) / 1000;
/** lb N per 1,000 sq ft delivered by spreading `lbProduct` over `area`. */
export const nApplied = (lbProduct, pctN, area) => (area > 0 ? (lbProduct * (pctN / 100)) / (area / 1000) : NaN);

export const seedLbs = (ratePer1000, area) => (ratePer1000 * area) / 1000;
export const gallons = (inches, area) => (inches * GAL_PER_INCH_PER_1000 * area) / 1000;
/** Minutes to apply `inches` at a measured rate (in/hr). */
export const minutesFor = (inches, rateInPerHr) => (rateInPerHr > 0 ? (inches / rateInPerHr) * 60 : NaN);
export const cubicFeet = (area, depthIn) => (area * depthIn) / 12;
export const cubicYards = (area, depthIn) => cubicFeet(area, depthIn) / 27;
export const perAcreToPer1000 = (x) => (x * 1000) / SQFT_PER_ACRE;
export const per1000ToPerAcre = (x) => (x * SQFT_PER_ACRE) / 1000;

/** Parse "32-0-4" → { n:32, p:0, k:4 }. */
export function parseAnalysis(s) {
  const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  return m ? { n: +m[1], p: +m[2], k: +m[3] } : null;
}

export function roundTo(n, step) {
  return Math.round(n / step) * step;
}
