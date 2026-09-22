// planetRenderer.js -- procedural PIXEL-ART planet sprites (2026-09-21).
//
// Every planet gets a sprite SHEET generated from its seed: one column
// per rotation frame, each a pixel disc whose pixels are sphere-mapped to
// a longitude/latitude and sampled from a per-type texture (bands, noise
// continents, craters, cracks, fissures, swirl). The scene animates
// rotation by picking the frame for the current spin fraction -- zero
// per-frame drawing.
//
// v3 (30 fps): the frame COUNT is per planet -- enough frames that its
// spin plays at TARGET_FPS (48..MAX_FRAMES). Sheets bake progressively
// (utils/spriteBake.js): a QUICK_FRAMES sheet is built synchronously on
// first sight and the full sheet bakes a few frames per timer tick, then
// swaps in. Frame picks are by spin FRACTION, so the swap is seamless.
//
// LIGHTING IS SEPARATE: the texture is baked UNLIT (materials at their
// bright step) and a small SHADE MASK -- one disc per (pixel size, light
// direction), shared by every planet of that size -- is composited over
// it with mix-blend-mode: multiply. Emissive pixels (lava fissures,
// exotic bands) go to a second sheet drawn ABOVE the mask.

import { bakeSheet, progressiveSheet } from './spriteBake.js';

export const TARGET_FPS = 30;
export const QUICK_FRAMES = 16;
export const MAX_FRAMES = 200;
export const FRAMES = QUICK_FRAMES; // legacy export
export const LIGHT_DIRS = 16;
const MIN_PX = 24, MAX_PX = 64;

const sheetCache = new Map();
const maskCache = new Map();

// ---- seeded helpers ----
const hash2 = (seed, x, y) => {
  let h = (seed ^ (x * 374761393) ^ (y * 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const noise = (seed, u, v, P, Q) => {
  const x = ((u % 1) + 1) % 1 * P, y = Math.max(0, Math.min(0.9999, v)) * Q;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n = (ix, iy) => hash2(seed, ((ix % P) + P) % P, iy);
  const a = n(x0, y0), b = n(x0 + 1, y0), c = n(x0, y0 + 1), d = n(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
const fbm = (seed, u, v, P, Q) =>
  0.55 * noise(seed, u, v, P, Q) + 0.3 * noise(seed + 17, u * 2, v * 2, P * 2, Q * 2) + 0.15 * noise(seed + 43, u * 4, v * 4, P * 4, Q * 4);
const seedFromString = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

// ---- colors ----
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgbArr = (r, g, b) => [Math.round(r), Math.round(g), Math.round(b)];
const litColor = (hex) => rgbArr(...mix(hexToRgb(hex), [255, 250, 235], 0.22));
function mixHex(a, b, t) {
  const c = mix(hexToRgb(a), hexToRgb(b), t);
  return `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

// ---- per-type textures ----
const TEXTURES = {
  gas_giant: (seed, base, lon, lat) => {
    const wobble = (noise(seed, lon, (lat + 1) / 2, 6, 4) - 0.5) * 0.35;
    const band = Math.sin((lat + wobble) * Math.PI * 4.5);
    const alt = ['#c9986a', '#e6c088', '#b98357'];
    const i = band > 0.5 ? 1 : band < -0.5 ? 2 : 0;
    const sx = hash2(seed, 7, 7), sy = hash2(seed, 9, 9) * 1.0 - 0.5;
    const dx = Math.min(Math.abs(lon - sx), 1 - Math.abs(lon - sx)) / 0.09, dy = (lat - sy) / 0.12;
    if (dx * dx + dy * dy < 1) return { color: '#d9744a' };
    return { color: i === 0 ? base : alt[i] };
  },
  terran: (seed, base, lon, lat) => {
    if (Math.abs(lat) > 0.82) return { color: '#eef4ff' };
    const e = fbm(seed, lon, (lat + 1) / 2, 8, 6);
    if (e < 0.5) return { color: '#2f66a8' };
    if (e < 0.56) return { color: '#c9b87a' };
    if (e < 0.72) return { color: base === '#4488aa' ? '#4f9a4a' : base };
    return { color: '#7a7f6a' };
  },
  ocean: (seed, base, lon, lat) => {
    if (Math.abs(lat) > 0.86) return { color: '#eef4ff' };
    const e = fbm(seed, lon, (lat + 1) / 2, 8, 6);
    if (e < 0.66) return { color: base };
    return { color: '#5aa06a' };
  },
  rocky: (seed, base, lon, lat) => {
    for (let i = 0; i < 9; i++) {
      const cx = hash2(seed, i, 1), cy = hash2(seed, i, 2) * 1.6 - 0.8, cr = 0.03 + hash2(seed, i, 3) * 0.07;
      const dx = Math.min(Math.abs(lon - cx), 1 - Math.abs(lon - cx)), dy = (lat - cy) * 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < cr * 0.6) return { color: mixHex(base, '#000000', 0.25) };
      if (d < cr) return { color: mixHex(base, '#ffffff', 0.18) };
    }
    const n = noise(seed, lon, (lat + 1) / 2, 10, 6);
    return { color: n > 0.6 ? mixHex(base, '#000000', 0.12) : base };
  },
  barren: (seed, base, lon, lat) => TEXTURES.rocky(seed + 5, base, lon, lat),
  desert: (seed, base, lon, lat) => {
    const w = (noise(seed, lon, (lat + 1) / 2, 5, 3) - 0.5) * 0.5;
    const d = Math.sin((lat + w) * Math.PI * 7);
    return { color: d > 0.3 ? mixHex(base, '#ffffff', 0.15) : d < -0.5 ? mixHex(base, '#000000', 0.15) : base };
  },
  ice: (seed, base, lon, lat) => {
    const n = noise(seed, lon, (lat + 1) / 2, 9, 6);
    if (Math.abs(n - 0.5) < 0.025) return { color: '#4f7fb0' };
    return { color: n > 0.7 ? '#ffffff' : base };
  },
  lava: (seed, base, lon, lat) => {
    const n = fbm(seed, lon, (lat + 1) / 2, 7, 5);
    if (Math.abs(n - 0.5) < 0.035) return { color: '#ffd23a', emissive: true };
    if (Math.abs(n - 0.5) < 0.07) return { color: '#ff6a1e', emissive: true };
    return { color: '#3a1e1a' };
  },
  exotic: (seed, base, lon, lat) => {
    const s = (lon * 3 + lat * 1.2 + fbm(seed, lon, (lat + 1) / 2, 6, 4) * 1.5) % 1;
    const pal = [base, '#ff44aa', '#44ffaa', '#8844ff'];
    return { color: pal[Math.floor(((s % 1) + 1) % 1 * pal.length)], emissive: s > 0.85 };
  },
};
const CLOUD_TYPES = new Set(['terran', 'ocean']);
const EMISSIVE_TYPES = new Set(['lava', 'exotic']);

// ---- geometry shared by texture + mask ----
export const spritePixels = (size) => Math.max(MIN_PX, Math.min(MAX_PX, Math.round(size * 0.9)));
const padFor = (N, rings) => (rings ? Math.ceil(N * 0.5) : 2);

// Revolutions per second by size: small rocks spin visibly, giants slowly.
export const spinRate = (size) => Math.max(0.05, Math.min(0.2, 4.8 / Math.max(10, size)));
// Frames needed so this planet's spin plays at TARGET_FPS.
export const framesFor = (size) => Math.max(48, Math.min(MAX_FRAMES, Math.ceil(TARGET_FPS / spinRate(size))));

// ============================================
// TEXTURE SHEET (unlit) -- progressive, per planet
// ============================================
export function getPlanetSheet(body, baseColor) {
  const key = `${body.id}|${body.planetType}|${body.size}|${baseColor}|${body.hasRings ? 'r' : ''}`;
  const N = spritePixels(body.size);
  const seed = seedFromString(String(body.id) + '|' + (body.planetType || ''));
  const tex = TEXTURES[body.planetType] || TEXTURES.rocky;
  const rings = !!body.hasRings;
  const pad = padFor(N, rings);
  const fw = N + pad * 2, fh = N + pad * 2;
  const emits = EMISSIVE_TYPES.has(body.planetType);

  const colorCache = new Map();
  const lit = (hex) => { let c = colorCache.get(hex); if (!c) { c = litColor(hex); colorCache.set(hex, c); } return c; };
  const atmo = hexToRgb(body.planetType === 'ocean' ? '#7fc3ff' : body.planetType === 'terran' ? '#9fd0ff' : baseColor);
  const ringLit = litColor('#c8b48a'), ringDark = rgbArr(...mix(hexToRgb('#c8b48a'), [8, 6, 20], 0.35));
  const cloud = litColor('#f4f8ff');

  const spec = (frames) => ({
    fw, fh, frames, emissive: emits, extra: { px: N },
    paintFrame: (f, put, putE) => {
      const spin = f / frames;
      for (let py = 0; py < fh; py++) {
        for (let px = 0; px < fw; px++) {
          const nx = (px + 0.5 - fw / 2) / (N / 2);
          const ny = (py + 0.5 - fh / 2) / (N / 2);
          const r2 = nx * nx + ny * ny;
          let ringStep = -1;
          if (rings) {
            const ex = nx / 1.75, ey = ny / 0.42;
            const ed = Math.sqrt(ex * ex + ey * ey);
            if (ed > 0.78 && ed < 1.0 && !(ed > 0.88 && ed < 0.905)) ringStep = (ed > 0.94 || ed < 0.83) ? 0 : 1;
          }
          const ringInFront = ringStep >= 0 && ny > 0;
          if (r2 <= 1) {
            const nz = Math.sqrt(1 - r2);
            const lat = -ny;
            const lon = ((Math.atan2(nx, nz) / (Math.PI * 2)) + spin + 1) % 1;
            const t = tex(seed, baseColor, lon, lat);
            let rgb = lit(t.color);
            let emissive = !!t.emissive;
            if (CLOUD_TYPES.has(body.planetType)) {
              const clon = ((Math.atan2(nx, nz) / (Math.PI * 2)) + spin * 2 + 1) % 1;
              const c = fbm(seed + 99, clon, (lat + 1) / 2, 7, 5);
              if (c > 0.63) { rgb = cloud; emissive = false; }
            }
            if (ringInFront) { rgb = ringStep === 1 ? ringLit : ringDark; emissive = false; }
            put(f, px, py, rgb);
            if (emissive && putE) putE(f, px, py, rgb);
          } else if (ringStep >= 0) {
            put(f, px, py, ringStep === 1 ? ringLit : ringDark);
          } else if (body.hasAtmosphere && r2 <= (1 + 2.2 / N) * (1 + 2.2 / N)) {
            put(f, px, py, atmo, 120);
          }
        }
      }
    },
  });
  return progressiveSheet(sheetCache, key, QUICK_FRAMES, framesFor(body.size), spec);
}

// ============================================
// SHADE MASK -- per (pixel size, rings?, light direction), shared
// ============================================
const SHADE = [0.36, 0.58, 0.8, 1.0]; // darkest, dark, base, lit
export function getShadeMask(size, hasRings, lightIdx) {
  const N = spritePixels(size);
  const key = `${N}|${hasRings ? 'r' : ''}|${lightIdx}`;
  const hit = maskCache.get(key);
  if (hit) return hit;
  const pad = padFor(N, !!hasRings);
  const fw = N + pad * 2, fh = N + pad * 2;
  const la = (lightIdx / LIGHT_DIRS) * Math.PI * 2;
  const L = [Math.cos(la) * 0.85, Math.sin(la) * 0.85, 0.5];
  const Ll = Math.hypot(L[0], L[1], L[2]);
  L[0] /= Ll; L[1] /= Ll; L[2] /= Ll;
  const mask = bakeSheet({
    fw, fh, frames: 1, extra: { px: N },
    paintFrame: (f, put) => {
      for (let py = 0; py < fh; py++) {
        for (let px = 0; px < fw; px++) {
          const nx = (px + 0.5 - fw / 2) / (N / 2);
          const ny = (py + 0.5 - fh / 2) / (N / 2);
          const r2 = nx * nx + ny * ny;
          if (r2 > 1) continue;
          const nz = Math.sqrt(1 - r2);
          const s = nx * L[0] + ny * L[1] + nz * L[2] + (((px + py) & 1) ? 0.05 : -0.05);
          const step = s > 0.55 ? 3 : s > 0.1 ? 2 : s > -0.3 ? 1 : 0;
          const v = Math.round(255 * SHADE[step]);
          put(f, px, py, [v, v, v]);
        }
      }
    },
  });
  maskCache.set(key, mask);
  return mask;
}

// Screen-space light index for a planet at (x, y) with the star at the origin.
export const lightIndexFor = (x, y) => {
  const a = Math.atan2(-y, -x);
  return ((Math.round((a / (Math.PI * 2)) * LIGHT_DIRS) % LIGHT_DIRS) + LIGHT_DIRS) % LIGHT_DIRS;
};
