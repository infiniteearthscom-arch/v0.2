// quality.js -- single source of truth for module quality math (client).
// Mirror of star-shipper-server/src/lib/quality.js. See that file for
// the full conventions doc.
//
// Crafted module instances carry `.quality = {purity, stability,
// potency, density}` (0-100, q50 baseline). This helper turns that into
// a multiplier so weapons.js / fleetStats.js / future stat aggregators
// all apply quality the same way.

export const qualityMultiplier = (fittedValue, opts = {}) => {
  const q = fittedValue?.quality || fittedValue?.item_data?.quality;
  if (!q) return 1.0;
  const avg = ((q.purity || 0) + (q.stability || 0) +
               (q.potency || 0) + (q.density || 0)) / 4;
  if (avg <= 0) return 1.0;
  let mult = avg / 50;
  if (opts.power && opts.power !== 1) mult = Math.pow(mult, opts.power);
  mult = Math.max(0.4, Math.min(2.5, mult));
  if (opts.invert) mult = 1 / mult;
  return mult;
};

export const qualityAverage = (fittedValue) => {
  const q = fittedValue?.quality || fittedValue?.item_data?.quality;
  if (!q) return null;
  return ((q.purity || 0) + (q.stability || 0) +
          (q.potency || 0) + (q.density || 0)) / 4;
};
