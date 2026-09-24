// asteroidRenderer.js -- pixel-art asteroid sprites (2026-09-25), same
// pipeline as planets: a rotation sheet per rock (progressively baked),
// picked by spin fraction in SystemView.
//
// Each rock is an irregular seeded blob with facets, 2-4 craters, a fixed
// upper-left light (the belt reads as one lit field), a 1-px dark outline
// all round plus a 1-px bright rim on the lit edge so rocks pop off the
// dim belt dust. Scanned rocks get ore veins tinted by their quality
// tier; unscanned rocks stay plain grey-brown.

import { progressiveSheet } from './spriteBake.js';

const cache = new Map();
export const AST_QUICK_FRAMES = 6;
export const AST_FULL_FRAMES = 24;

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const hash2 = (seed, x, y) => { let h = (seed ^ (x * 374761393) ^ (y * 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const hex = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const shade = (c, k) => c.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const ROCK_PALETTES = ['#8a7f72', '#7a6e62', '#6f6a66', '#8d7a63', '#5f5a55', '#7d746a', '#9a8c7a'];
const TIER_VEIN = { Impure: '#666e78', Standard: '#b0bcc8', Fine: '#44ff44', Superior: '#4488ff', Pristine: '#aa44ff' };

export const asteroidPixels = (size) => Math.max(14, Math.min(44, Math.round(size * 2.6)));
// rev/s: small rocks tumble faster
export const asteroidSpin = (id, size) => 0.02 + (hash2(hashStr(String(id)), 3, 3) * 0.05) * (12 / Math.max(6, size));

export function getAsteroidSheet(a, tierName = null) {
  const key = `ast|${a.id}|${a.size}|${tierName || ''}`;
  const N = asteroidPixels(a.size);
  const seed = hashStr(String(a.id));
  const base = hex(ROCK_PALETTES[seed % ROCK_PALETTES.length]);
  const lit = shade(base, 1.25), mid = base, dark = shade(base, 0.7), darker = shade(base, 0.45);
  const outline = [14, 12, 10], rim = mix(lit, [255, 255, 255], 0.35);
  const vein = tierName && TIER_VEIN[tierName] ? hex(TIER_VEIN[tierName]) : null;
  // silhouette: radius as a function of angle (3 harmonics)
  const h1 = hash2(seed, 1, 1) * 0.22, h2 = hash2(seed, 2, 2) * 0.16, h3 = hash2(seed, 3, 3) * 0.1;
  const p1 = hash2(seed, 4, 4) * 6.28, p2 = hash2(seed, 5, 5) * 6.28, p3 = hash2(seed, 6, 6) * 6.28;
  const radiusAt = (th) => 0.78 * (1 + h1 * Math.sin(2 * th + p1) + h2 * Math.sin(3 * th + p2) + h3 * Math.sin(5 * th + p3));
  const craters = [];
  const nC = 2 + (seed % 3);
  for (let i = 0; i < nC; i++) craters.push({ th: hash2(seed, 10 + i, 1) * 6.28, r: 0.25 + hash2(seed, 10 + i, 2) * 0.35, s: 0.1 + hash2(seed, 10 + i, 3) * 0.14 });
  const veins = [];
  if (vein) for (let i = 0; i < 6; i++) veins.push({ th: hash2(seed, 30 + i, 1) * 6.28, r: hash2(seed, 30 + i, 2) * 0.7, len: 0.15 + hash2(seed, 30 + i, 3) * 0.2, dir: hash2(seed, 30 + i, 4) * 6.28 });
  const pad = 2, fw = N + pad * 2, fh = N + pad * 2, cx = fw / 2, cy = fh / 2, R = N / 2;

  const spec = (frames) => ({
    fw, fh, frames, extra: { px: N },
    paintFrame: (f, put) => {
      const rot = (f / frames) * Math.PI * 2;
      const inside = (x, y) => {
        const dx = (x + 0.5 - cx) / R, dy = (y + 0.5 - cy) / R;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 1) return false;
        const th = Math.atan2(dy, dx) - rot;
        return d <= radiusAt(th);
      };
      // pass 1: fill with facets/light, craters, veins
      const filled = [];
      for (let y = 0; y < fh; y++) { filled.push(new Array(fw).fill(false)); for (let x = 0; x < fw; x++) {
        if (!inside(x, y)) continue;
        filled[y][x] = true;
        const dx = (x + 0.5 - cx) / R, dy = (y + 0.5 - cy) / R;
        const th = Math.atan2(dy, dx) - rot, d = Math.sqrt(dx * dx + dy * dy);
        const edge = d / Math.max(0.2, radiusAt(th)); // 0 centre .. 1 rim
        // light from upper-left in SCREEN space (doesn't rotate with the rock)
        const l = -dx * 0.7 - dy * 0.7;
        // facet noise in ROCK space so it rotates with the rock
        const fx = Math.cos(th) * d, fy = Math.sin(th) * d;
        const facet = hash2(seed, Math.floor(fx * 4 + 8), Math.floor(fy * 4 + 8)) - 0.5;
        let v = l * 0.55 + facet * 0.35 + (((x + y) & 1) ? 0.04 : -0.04) - edge * 0.25;
        let c = v > 0.28 ? lit : v > 0.05 ? mid : v > -0.2 ? dark : darker;
        for (const cr of craters) {
          const cxr = Math.cos(cr.th) * cr.r, cyr = Math.sin(cr.th) * cr.r;
          const dd = Math.hypot(fx - cxr, fy - cyr);
          if (dd < cr.s) c = dd < cr.s * 0.55 ? darker : dark;
          else if (dd < cr.s * 1.3 && (fx - cxr) < 0 && (fy - cyr) < 0) c = lit; // crater lip catches light
        }
        for (const vn of veins) {
          const vx0 = Math.cos(vn.th) * vn.r, vy0 = Math.sin(vn.th) * vn.r;
          const ax = fx - vx0, ay = fy - vy0;
          const along = ax * Math.cos(vn.dir) + ay * Math.sin(vn.dir), across = Math.abs(-ax * Math.sin(vn.dir) + ay * Math.cos(vn.dir));
          if (along > 0 && along < vn.len && across < 0.045) c = ((x + y) & 1) ? vein : mix(vein, [255, 255, 255], 0.4);
        }
        put(f, x, y, c);
      } }
      // pass 2: outline + lit rim
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        if (filled[y][x]) continue;
        const nb = (filled[y - 1]?.[x]) || (filled[y + 1]?.[x]) || filled[y][x - 1] || filled[y][x + 1];
        if (!nb) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const litSide = (-dx * 0.7 - dy * 0.7) / Math.max(1, Math.hypot(dx, dy)) > 0.45;
        put(f, x, y, litSide ? rim : outline);
      }
    },
  });
  return progressiveSheet(cache, key, AST_QUICK_FRAMES, AST_FULL_FRAMES, spec);
}
