// structureRenderer.js -- pixel-art sprite sheets for stars, stations,
// jump gates and warp points (2026-09-21, follows planetRenderer.js).
//
// Stars: procedural disc with a radial 4-step ramp, animated rim
// granulation + corona spikes (STAR_FRAMES). Black holes get a rotating
// pixel accretion ring around a black disc.
// Stations: STATION_DESIGNS hand-authored 17x17 pixel grids (10 varieties);
// a station's design is picked by hashing its id so it never changes.
// Two frames: window/nav lights blink.
// Jump gate / warp point: ONE design each (same in every system, so they
// read instantly), animated (GATE_FRAMES / WARP_FRAMES).
//
// Same canvas -> dataUrl -> <image image-rendering:pixelated> pipeline as
// ships and planets. Everything is generated once and cached.

import { bakeSheet, progressiveSheet } from './spriteBake.js';

// Frame counts (v3, 30 fps): every loop plays at ~30 fps -- see the
// loop lengths in SystemView. Stars and the pulsar beam bake
// progressively (QUICK_FRAMES first, full sheet in the background);
// gate / warp / stations are small enough to bake synchronously.
export const STAR_FRAMES = 80;   // 2.7s loop
export const GATE_FRAMES = 30;   // 1.0s loop
export const WARP_FRAMES = 26;   // 0.9s loop
export const STATION_FRAMES = 2; // light blink, 1.5 Hz
export const QUICK_FRAMES = 16;

const cache = new Map();

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);
const hash = (seed, x, y) => {
  let h = (seed ^ (x * 374761393) ^ (y * 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const strSeed = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const makeSheet = (fw, fh, frames, paint) => bakeSheet({ fw, fh, frames, paintFrame: paint });

// ============================================
// STARS
// ============================================
// colors: { core, mid, outer }; returns a sheet whose disc spans `px`.
export function getStarSheet(starType, colors, hasAccretionDisk) {
  const key = `star|${starType}`;
  const px = 64;
  const pad = hasAccretionDisk ? 52 : 12;
  const fw = px + pad * 2, fh = px + pad * 2;
  const seed = strSeed(starType);
  const core = hexToRgb(colors.core), mid = hexToRgb(colors.mid), outer = hexToRgb(colors.outer);
  // 6-step ramp: spot-dark, rim-dark, outer, mid, hot, core-white
  const ramp = [mix(outer, [6, 2, 0], 0.62), mix(outer, [10, 4, 0], 0.38), outer, mid, mix(mid, core, 0.5), core];
  const TWO_PI = Math.PI * 2;
  const isCool = starType === 'red_dwarf' || starType === 'orange_star' || starType === 'yellow_star';

  // Convection cells drifting on closed loops (phase = frame) so the
  // surface churns smoothly and the loop is seamless.
  const K = 34;
  const cells = [];
  for (let i = 0; i < K; i++) {
    const ang = hash(seed, i, 1) * TWO_PI, rad = Math.sqrt(hash(seed, i, 2)) * 0.94;
    cells.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, ph: hash(seed, i, 3) * TWO_PI, amp: 0.04 + hash(seed, i, 4) * 0.05, dir: hash(seed, i, 5) > 0.5 ? 1 : -1 });
  }
  // Sunspots (cool stars): dark elliptical groups that drift slowly and
  // pulse in size over the loop. Hot stars get bright plages instead.
  const spots = [];
  const spotCount = isCool ? 3 : 2;
  for (let i = 0; i < spotCount; i++) {
    const ang = hash(seed, 50 + i, 1) * TWO_PI, rad = 0.25 + hash(seed, 50 + i, 2) * 0.5;
    spots.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, r: 0.07 + hash(seed, 50 + i, 3) * 0.08, ph: hash(seed, 50 + i, 4) * TWO_PI, tilt: hash(seed, 50 + i, 5) * Math.PI });
  }

  const paint = (frames) => (f, put) => {
    const cx = fw / 2, cy = fh / 2, R = px / 2;
    const phase = (f / frames) * TWO_PI;
    // faculae flicker state: 16 changes per loop (~6 Hz), not per frame
    const flick = Math.floor((f * 16) / frames);

    if (hasAccretionDisk) {
      const acc = hexToRgb(colors.accretion || '#ff6600');
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const dx = (x + 0.5 - cx), dy = (y + 0.5 - cy);
        const ex = dx / (R * 2.6), ey = dy / (R * 0.75);
        const ed = Math.sqrt(ex * ex + ey * ey);
        if (ed > 0.45 && ed < 1) {
          const ang = Math.atan2(ey, ex) + phase;
          const streak = 0.5 + 0.5 * Math.sin(ang * 5 + ed * 9) * Math.sin(ang * 2.3 - ed * 4);
          const t = (ed - 0.45) / 0.55;
          let rgb = t < 0.25 ? mix([255, 240, 200], acc, t * 4) : mix(acc, [60, 20, 0], (t - 0.25) / 0.75);
          if (streak > 0.8) rgb = mix(rgb, [255, 255, 255], 0.3);
          if (streak < 0.18 && t > 0.3) continue;
          if (dx * dx + dy * dy < R * R * 0.9 && dy < 0) continue;
          put(f, x, y, rgb);
        }
      }
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const dx = (x + 0.5 - cx), dy = (y + 0.5 - cy);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < R * 0.85) put(f, x, y, [0, 0, 0]);
        else if (d < R * 0.95) put(f, x, y, [235, 235, 255], 200);
      }
      return;
    }

    const cpos = cells.map(c => ({ x: c.x + Math.cos(c.ph + phase * c.dir) * c.amp, y: c.y + Math.sin(c.ph + phase * c.dir) * c.amp }));
    const spos = spots.map(sp => ({ x: sp.x + Math.cos(sp.ph + phase) * 0.03, y: sp.y + Math.sin(sp.ph + phase) * 0.03, r: sp.r * (0.85 + 0.15 * Math.sin(phase + sp.ph)), tilt: sp.tilt }));

    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const dx = (x + 0.5 - cx), dy = (y + 0.5 - cy);
      const nx = dx / R, ny = dy / R;
      const d = Math.sqrt(nx * nx + ny * ny);
      const dither = ((x + y) & 1) ? 0.03 : -0.03;
      if (d <= 1) {
        let best = 9, second = 9;
        for (const c of cpos) {
          const ddx = nx - c.x, ddy = ny - c.y; const dd = ddx * ddx + ddy * ddy;
          if (dd < best) { second = best; best = dd; } else if (dd < second) second = dd;
        }
        const edge = Math.sqrt(second) - Math.sqrt(best);
        const limb = 1 - d * d * 0.8;
        let v = limb * (0.8 + 0.3 * Math.min(1, edge * 6)) + dither;
        // faculae: bright specks that show near the limb (real stars do this)
        if (d > 0.72 && hash(seed + flick, x, y) > 0.965) v += 0.35;
        // spots / plages
        for (const sp of spos) {
          const rx = (nx - sp.x) * Math.cos(sp.tilt) + (ny - sp.y) * Math.sin(sp.tilt);
          const ry = -(nx - sp.x) * Math.sin(sp.tilt) + (ny - sp.y) * Math.cos(sp.tilt);
          const sd = Math.sqrt((rx / sp.r) * (rx / sp.r) + (ry / (sp.r * 0.6)) * (ry / (sp.r * 0.6)));
          if (sd < 1) {
            if (isCool) v = sd < 0.55 ? -1 : Math.min(v, 0.22 + dither); // umbra / penumbra
            else v += 0.3;                                              // plage
          }
        }
        const step = v < 0 ? 0 : v > 1.02 ? 5 : v > 0.86 ? 4 : v > 0.66 ? 3 : v > 0.45 ? 2 : 1;
        put(f, x, y, ramp[step]);
      } else if (d <= 1.45) {
        // ejecta only (tendrils removed): sparse particles ride outward and fade
        const ang = Math.atan2(dy, dx);
        const slot = Math.round(ang * 48);
        const r = hash(seed, slot, 9);
        if (hash(seed, slot, 11) > 0.5) {
          const life = ((r + f / frames) % 1);
          const ej = 1.04 + life * 0.4;
          if (Math.abs(d - ej) < 0.028) put(f, x, y, life < 0.35 ? ramp[4] : ramp[3], Math.round(220 * (1 - life)));
        }
      }
    }
  };
  return progressiveSheet(cache, key, QUICK_FRAMES, STAR_FRAMES,
    (frames) => ({ fw, fh, frames, paintFrame: paint(frames), extra: { px } }));
}

// ============================================
// PULSAR BEAM -- pixel sprite of the two-lobed jet, rotating
// ============================================
// Symmetric beam, so half a turn per loop is seamless. Length in disc
// radii is reach; the caller scales it to world units.
export const BEAM_FRAMES = 64; // 2.3s half-turn loop
export function getPulsarBeamSheet(colors) {
  const key = 'pulsar-beam';
  const fw = 112, fh = 112, cx = fw / 2, cy = fh / 2, reach = 52;
  const white = [255, 255, 255], tint = hexToRgb(colors.mid || '#dd88ff');
  const paint = (frames) => (f, put) => {
    const rot = (f / frames) * Math.PI; // half turn per loop
    const ux = Math.cos(rot), uy = Math.sin(rot);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const along = dx * ux + dy * uy;           // signed distance along the beam axis
      const across = Math.abs(-dx * uy + dy * ux);
      const dist = Math.abs(along);
      if (dist < 6 || dist > reach) continue;
      const t = (dist - 6) / (reach - 6);        // 0 near star -> 1 at tip
      const halfW = 1.2 + t * 2.6;               // beam widens toward the tip
      if (across > halfW) continue;
      const dither = ((x + y) & 1) ? 0.06 : -0.06;
      const core = across < halfW * 0.4;
      const a = Math.max(0, 1 - t * 1.05 + dither) * (core ? 1 : 0.7);
      if (a <= 0.05) continue;
      put(f, x, y, core ? white : tint, Math.round(255 * Math.min(1, a)));
    }
  };
  return progressiveSheet(cache, key, QUICK_FRAMES, BEAM_FRAMES,
    (frames) => ({ fw, fh, frames, paintFrame: paint(frames), extra: { px: fw, reach } }));
}

// ============================================
// STATIONS -- hand-authored pixel grids
// ============================================
// Legend: . empty  h hull  d dark hull  l light hull  w window (blinks)
//         a accent (cyan)  r nav light (blinks opposite)  g green pad
const STATION_DESIGNS = [
  // 0 Ring station: torus + hub + 4 spokes
  [
    '......hhhhh......',
    '....hhlllllhh....',
    '...hl.......lh...',
    '..hl....d....lh..',
    '.hl.....d.....lh.',
    '.h......d......h.',
    'hl......d......lh',
    'hl.....dhd.....lh',
    'hlddddhwawhddddlh',
    'hl.....dhd.....lh',
    'hl......d......lh',
    '.h......d......h.',
    '.hl.....d.....lh.',
    '..hl....d....lh..',
    '...hl.......lh...',
    '....hhlllllhh....',
    '......hhhhh......',
  ],
  // 1 Hub and pods
  [
    '.....r.....r.....',
    '....hhh...hhh....',
    '....hwh...hwh....',
    '....hhh...hhh....',
    '......d...d......',
    '.......d.d.......',
    '.hhh....d....hhh.',
    '.hwhddddhddddhwh.',
    '.hhh...hah...hhh.',
    '.......hhh.......',
    '.......d.d.......',
    '......d...d......',
    '....hhh...hhh....',
    '....hwh...hwh....',
    '....hhh...hhh....',
    '.....r.....r.....',
    '.................',
  ],
  // 2 Cross truss
  [
    '.......hhh.......',
    '.......hwh.......',
    '.......hhh.......',
    '........d........',
    '........d........',
    '........d........',
    '.......lhl.......',
    'hhh...lhahl...hhh',
    'hwhddddhhhddddhwh',
    'hhh...lhal.....hhh'.slice(0, 17),
    '.......lhl.......',
    '........d........',
    '........d........',
    '........d........',
    '.......hhh.......',
    '.......hwh.......',
    '.......hhh.......',
  ],
  // 3 Cylinder with docking arms
  [
    '......hhhhh......',
    '.....hlllllh.....',
    '.....hwhhhwh.....',
    '.....hhhhhhh.....',
    '.ddddhwhhhwhdddd.',
    '.r...hhhhhhh...r.',
    '.....hwhhhwh.....',
    '.....hhhhhhh.....',
    '.....hwhhhwh.....',
    '.....hhhhhhh.....',
    '.ddddhwhhhwhdddd.',
    '.r...hhhhhhh...r.',
    '.....hwhhhwh.....',
    '.....hhhhhhh.....',
    '.....hlllllh.....',
    '......hhhhh......',
    '.................',
  ],
  // 4 Relay: hub + big dish
  [
    '.........llll....',
    '.......ll....l...',
    '......l.......l..',
    '.....l........l..',
    '.....l.......l...',
    '.....l....d.l....',
    '......l..d.l.....',
    '.......lddl......',
    '....hhhhhah......',
    '....hwhwhhh......',
    '....hhhhhhh......',
    '.......d.........',
    '.......d.........',
    '.....hhhhh.......',
    '.....hwhwh.......',
    '.....hhhhh.......',
    '......r.r........',
  ],
  // 5 Spire tower
  [
    '........r........',
    '........a........',
    '.......hhh.......',
    '.......hwh.......',
    '.......hhh.......',
    '......hhhhh......',
    '......hwhwh......',
    '......hhhhh......',
    '.......hhh.......',
    '.....hhhwhhh.....',
    '.....hwhhhwh.....',
    '.....hhhhhhh.......'.slice(0, 17),
    '.......hhh.......',
    '....hhhhhhhhh....',
    '....hwhwhwhwh....',
    '....hhhhhhhhh....',
    '.....r.....r.....',
  ],
  // 6 Dock bar with hangar
  [
    '.................',
    '.r.............r.',
    '.hhhhhhhhhhhhhhh.',
    '.hwhwhwhwhwhwhwh.',
    '.hhhhhhhhhhhhhhh.',
    '.......ddd.......',
    '.......ddd.......',
    '....hhhhhhhhh....',
    '....hl.....lh....',
    '....hl..a..lh....',
    '....hl.....lh....',
    '....hhhgggghh....',
    '.......ggg.......',
    '.......ggg.......',
    '....hhhhhhhhh....',
    '....hwhwhwhwh....',
    '.r..hhhhhhhhh..r.',
  ],
  // 7 Asteroid outpost: rock with bolted modules
  [
    '.......dddd......',
    '.....ddddddd.....',
    '....dddhhhdddd...',
    '...ddddhwhddddd..',
    '...dddhhhhhdddd..',
    '..ddddddddddddd..',
    '..dddddddddddddd.',
    '.dddddhhhddddddd.',
    '.dddddhwhdddddd..',
    '.ddddhhhhhddddd..',
    '..dddddddddddd...',
    '..ddddddddddda...',
    '...ddddhhhddda...',
    '....dddhwhdd.....',
    '.....dhhhdd......',
    '......dddd.......',
    '.......r.........',
  ],
  // 8 Twin rings
  [
    '..hhhh.....hhhh..',
    '.hllllh...hllllh.',
    'hl....lh.hl....lh',
    'h......h.h......h',
    'h......hdh......h',
    'h......hah......h',
    'h......hdh......h',
    'h......h.h......h',
    'hl....lh.hl....lh',
    '.hllllh...hllllh.',
    '..hhhh..d..hhhh..',
    '........d........',
    '.......hhh.......',
    '.......hwh.......',
    '.......hhh.......',
    '........r........',
    '.................',
  ],
  // 9 Industrial block with cranes
  [
    '.d.............d.',
    '.d.............d.',
    '.dddd.......dddd.',
    '....d.......d....',
    '..hhhhhhhhhhhhh..',
    '..hwhwhwhwhwhwh..',
    '..hhhhhhhhhhhhh..',
    '..hhhhhhhhhhhhh..',
    '..hhhddhhhhddhh..',
    '..hhhddhhahhddh..'.slice(0, 17),
    '..hhhhhhhhhhhhh..',
    '..hwhwhwhwhwhwh..',
    '..hhhhhhhhhhhhh..',
    '.....ggg.ggg.....',
    '.....ggg.ggg.....',
    '..r...........r..',
    '.................',
  ],
];
export const STATION_VARIETIES = STATION_DESIGNS.length;

const STATION_PAL = {
  h: [107, 127, 153], d: [60, 74, 94], l: [170, 184, 204],
  a: [34, 211, 238], g: [70, 160, 110],
  w: [[255, 209, 102], [110, 92, 50]],   // frame 0 lit, frame 1 dim
  r: [[90, 30, 30], [255, 80, 80]],      // nav lights blink opposite
};

export const pickStationVariety = (stationId) => strSeed(String(stationId)) % STATION_VARIETIES;

export function getStationSheet(variety) {
  const key = `station|${variety}`;
  if (cache.has(key)) return cache.get(key);
  const grid = STATION_DESIGNS[variety % STATION_VARIETIES];
  const fh = grid.length, fw = Math.max(...grid.map(r => r.length));
  // Shading (v2, "they look flat"): light from the upper-left. Hull
  // pixels whose upper/left neighbour is empty get the light step,
  // lower/right-edge pixels the dark step, interior pixels alternate
  // rows for a panel-seam texture; a 1-px outline darkens the silhouette.
  // Windows / lights / accents stay unshaded so they read as emissive.
  const at = (x, y) => (y < 0 || y >= fh || x < 0 || x >= (grid[y] || '').length) ? '.' : grid[y][x];
  const solid = (x, y) => { const c = at(x, y); return c !== '.' && c !== ' '; };
  const shade = (rgb, k) => rgb.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
  const sheet = makeSheet(fw, fh, STATION_FRAMES, (f, put) => {
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const ch = at(x, y);
        if (!solid(x, y)) {
          // outline: empty pixel touching a solid one
          if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) put(f, x, y, [22, 28, 38], 200);
          continue;
        }
        const p = STATION_PAL[ch];
        if (!p) continue;
        if (Array.isArray(p[0])) { put(f, x, y, p[f % p.length]); continue; } // blinking lights
        if (ch === 'a' || ch === 'g') { put(f, x, y, p); continue; }           // emissive accents
        const topLeftOpen = !solid(x, y - 1) || !solid(x - 1, y);
        const bottomRightOpen = !solid(x, y + 1) || !solid(x + 1, y);
        let k = 1.0;
        if (topLeftOpen && !bottomRightOpen) k = 1.28;
        else if (bottomRightOpen && !topLeftOpen) k = 0.66;
        else if (topLeftOpen && bottomRightOpen) k = 0.95;
        else k = (y % 2 === 0) ? 1.0 : 0.88; // interior panel seams
        put(f, x, y, shade(p, k));
      }
    }
  });
  const out = { ...sheet, px: fw };
  cache.set(key, out);
  return out;
}

// ============================================
// JUMP GATE (one design) -- ring + 4 pylons + rotating inner arcs
// ============================================
export function getGateSheet() {
  const key = 'gate';
  if (cache.has(key)) return cache.get(key);
  const fw = 27, fh = 27;
  const hull = [110, 130, 150], dark = [60, 74, 94], green = [68, 255, 136], greenD = [30, 140, 80];
  const sheet = makeSheet(fw, fh, GATE_FRAMES, (f, put) => {
    const cx = 13.5, cy = 13.5;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      // structural ring
      if (d >= 9.5 && d <= 11.5) { put(f, x, y, (x + y) % 3 === 0 ? dark : hull); continue; }
      // 4 pylons at 45° with a green tip
      const a45 = Math.abs(((ang + Math.PI / 4) % (Math.PI / 2)) - Math.PI / 4);
      if (d > 11.5 && d <= 13.5 && a45 < 0.18) { put(f, x, y, d > 12.8 ? green : hull); continue; }
      // inner energy: 3 rotating arcs + core
      if (d < 9.5) {
        const rot = ang - f * (Math.PI * 2 / GATE_FRAMES);
        const arc = ((rot * 3) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (d > 5 && d < 8.5 && arc < 1.1) { put(f, x, y, d > 7.5 ? greenD : green, 200); continue; }
        if (d < 2.5) { put(f, x, y, [200, 255, 220], 230); continue; }
        if (d < 4 && (x + y + (f >> 2)) % 2 === 0) { put(f, x, y, green, 150); continue; }
      }
    }
  });
  const out = { ...sheet, px: fw };
  cache.set(key, out);
  return out;
}

// ============================================
// WARP POINT (one design) -- purple vortex, 3 spiral arms, bright core
// ============================================
export function getWarpSheet() {
  const key = 'warp';
  if (cache.has(key)) return cache.get(key);
  const fw = 27, fh = 27;
  const p1 = [136, 68, 255], p2 = [90, 40, 190], p3 = [204, 170, 255];
  const sheet = makeSheet(fw, fh, WARP_FRAMES, (f, put) => {
    const cx = 13.5, cy = 13.5;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 12.5) continue;
      const ang = Math.atan2(dy, dx) + f * (Math.PI * 2 / WARP_FRAMES);
      // spiral: arm phase depends on radius
      const arm = ((ang * 3 - d * 0.75) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (d < 2.2) { put(f, x, y, [240, 230, 255]); continue; }
      if (d < 4) { put(f, x, y, p3, 230); continue; }
      if (arm < 0.9) put(f, x, y, d > 9 ? p2 : p1, d > 11 ? 120 : 220);
      else if (arm < 1.3) put(f, x, y, p2, 110);
      else if (hash(77, x + (f >> 2), y) > 0.93) put(f, x, y, p3, 160);
    }
  });
  const out = { ...sheet, px: fw };
  cache.set(key, out);
  return out;
}
