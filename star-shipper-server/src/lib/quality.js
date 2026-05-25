// quality.js -- single source of truth for module quality math (server).
//
// Crafted module instances carry a `.quality` field stamped by the
// crafting endpoint: `{ purity, stability, potency, density }` each
// 0-100 (q50 baseline). This helper turns that into a multiplier so
// every consumer applies it the same way.
//
// Conventions:
//   - q50 -> 1.0x
//   - q100 -> 2.0x
//   - q25 -> 0.5x
//   - clamped to [0.4, 2.5] so extreme rolls don't break encounter math
//   - opts.invert -> for "less is better" stats (cycle_time, lock_time,
//                    scan_time). Returns 1 / mult instead.
//   - opts.power  -> apply Math.pow(mult, power). Use 0.5 for stats
//                    that should scale by sqrt (range, maneuver), so a
//                    q100 module gives 1.41x not 2.0x.
//
// Pass the FITTED slot value (e.g. ship.fitted_modules.weapon_1), not
// the module type definition. The type's `.stats` is base defaults --
// that's NOT what this helper reads. .stats is always the type
// defaults; .quality is the instance roll.

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

// Average quality 0-100 for tooling / debug logs. Returns null if no
// quality is set on the instance.
export const qualityAverage = (fittedValue) => {
  const q = fittedValue?.quality || fittedValue?.item_data?.quality;
  if (!q) return null;
  return ((q.purity || 0) + (q.stability || 0) +
          (q.potency || 0) + (q.density || 0)) / 4;
};
