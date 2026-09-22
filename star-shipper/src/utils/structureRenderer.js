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

// Frame counts (v2: doubled after playtest read as steppy at 6-10 fps).
export const STAR_FRAMES = 16;
export const GATE_FRAMES = 12;
export const WARP_FRAMES = 12;
export const STATION_FRAMES = 2;

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

function makeSheet(fw, fh, frames, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = fw * frames; canvas.height = fh;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(fw * frames, fh);
  const data = img.data;
  const put = (f, x, y, rgb, a = 255) => {
    if (x < 0 || y < 0 || x >= fw || y >= fh) return;
    const i = (y * fw * frames + f * fw + x) * 4;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = a;
  };
  for (let f = 0; f < frames; f++) paint(f, put);
  ctx.putImageData(img, 0, 0);
  return { dataUrl: canvas.toDataURL(), fw, fh, frames };
}

// ============================================
// STARS
// ============================================
// colors: { core, mid, outer }; returns a sheet whose disc spans `px`.
export function getStarSheet(starType, colors, hasAccretionDisk) {
  const key = `star|${starType}`;
  if (cache.has(key)) return cache.get(key);
  const px = 48;
  const pad = hasAccretionDisk ? 40 : 12;
  const fw = px + pad * 2, fh = px + pad * 2;
  const seed = strSeed(starType);
  const core = hexToRgb(colors.core), mid = hexToRgb(colors.mid), outer = hexToRgb(colors.outer);
  const ramp = [mix(outer, [0, 0, 0], 0.35), outer, mid, core];
  const sheet = makeSheet(fw, fh, STAR_FRAMES, (f, put) => {
    const cx = fw / 2, cy = fh / 2, R = px / 2;
    if (hasAccretionDisk) {
      // Rotating accretion ring: hot inner edge -> orange -> dark. Tilted ellipse.
      const acc = hexToRgb(colors.accretion || '#ff6600');
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const dx = (x + 0.5 - cx), dy = (y + 0.5 - cy);
        const ex = dx / (R * 2.6), ey = dy / (R * 0.75);
        const ed = Math.sqrt(ex * ex + ey * ey);
        if (ed > 0.45 && ed < 1) {
          const ang = Math.atan2(ey, ex) + f * (Math.PI * 2 / STAR_FRAMES);
          const streak = (Math.sin(ang * 5) + hash(seed, x + f * 7, y)) * 0.5;
          const t = (ed - 0.45) / 0.55;
          let rgb = t < 0.25 ? mix([255, 240, 200], acc, t * 4) : mix(acc, [60, 20, 0], (t - 0.25) / 0.75);
          if (streak > 0.7) rgb = mix(rgb, [255, 255, 255], 0.25);
          if (streak < 0.15 && t > 0.3) continue; // gaps for a dusty look
          if (dx * dx + dy * dy < R * R * 0.9 && dy < 0) continue; // behind the hole (top half)
          put(f, x, y, rgb);
        }
      }
      // Event horizon + lensing ring.
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const dx = (x + 0.5 - cx), dy = (y + 0.5 - cy);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < R * 0.85) put(f, x, y, [0, 0, 0]);
        else if (d < R * 0.95) put(f, x, y, [235, 235, 255], 200);
      }
      return;
    }
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const dx = (x + 0.5 - cx), dy = (y + 0.5 - cy);
      const d = Math.sqrt(dx * dx + dy * dy) / R;
      if (d <= 1) {
        // radial ramp with granulation near the rim (flickers per frame)
        const g = hash(seed + f * 31, x, y);
        let step = d < 0.35 ? 3 : d < 0.7 ? 2 : d < 0.9 ? 1 : 0;
        if (d > 0.55 && g > 0.82) step = Math.min(3, step + 1);
        if (d > 0.8 && g < 0.15) step = Math.max(0, step - 1);
        put(f, x, y, ramp[step]);
      } else if (d <= 1.55) {
        // corona: 12 spikes whose length breathes per frame + sparse sparks
        const ang = Math.atan2(dy, dx);
        const spike = Math.pow(Math.abs(Math.cos(ang * 6)), 24);
        const len = 1 + 0.18 + 0.3 * spike * (0.6 + 0.4 * Math.sin(f / STAR_FRAMES * Math.PI * 2 + ang * 3));
        if (d < len) put(f, x, y, ramp[1], d < 1.12 ? 220 : 150);
        else if (hash(seed + f * 13, x, y) > 0.985) put(f, x, y, ramp[2], 180);
      }
    }
  });
  const out = { ...sheet, px };
  cache.set(key, out);
  return out;
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
        if (d < 4 && (x + y + f) % 2 === 0) { put(f, x, y, green, 150); continue; }
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
      else if (hash(77, x + f, y) > 0.93) put(f, x, y, p3, 160);
    }
  });
  const out = { ...sheet, px: fw };
  cache.set(key, out);
  return out;
}
