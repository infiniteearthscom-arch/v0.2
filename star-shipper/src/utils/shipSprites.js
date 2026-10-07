// shipSprites.js -- pixel sprites for the player and Reaver hulls
// (owner 2026-10-07: "crisp and very greebly"; one pixel density for every
// hull). GENERATED from the Desktop preview generator
// (star-shipper-sprites/_generator_ship_sprites.mjs) by the scratchpad
// build_ship_sprites.js -- the drawing code below is that file's text;
// only the browser wrapper at the bottom is hand-written. Re-run the build
// after tuning the preview.
//
// Three seeded VARIANTS per hull (pod count, plate layout, greebles).
// A ship's variant is derived from its own id (shipRenderer.shipVariant),
// so it is random at purchase and fixed for the life of the hull, and the
// same ship looks the same in the system view, the Fleet window and the
// Fitting window. Enemies derive theirs from their manifest id.
// Sprites are nose-UP like the old icon canvas (pitfall #3 untouched).

// ---------- helpers ----------
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
class Rng { constructor(seed) { this.s = (seed >>> 0) || 1; } next() { let t = (this.s += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; } int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); } pick(a) { return a[this.int(0, a.length - 1)]; } chance(p) { return this.next() < p; } }
const hex = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const COOL = [30, 26, 44], WARM = [250, 246, 220], OUT = [28, 32, 26];
const ramp = (c, desat = 0.45) => {
  const raw = Array.isArray(c) ? c : hex(c);
  const lum = Math.round(raw[0] * 0.3 + raw[1] * 0.59 + raw[2] * 0.11);
  const b = mix(raw, [lum, lum, lum], desat);
  return [OUT, mix(b, COOL, 0.55), mix(b, COOL, 0.3), b, mix(b, WARM, 0.3), mix(b, WARM, 0.55)];
};
// hot glow ramp: dark edge -> orange -> salmon -> white, from the hull's engine colour
const glowRamp = (c) => { const e = hex(c); return [mix(e, OUT, 0.55), mix(e, [0, 0, 0], 0.15), e, mix(e, [255, 255, 255], 0.45), [255, 250, 240]]; };


// ---------- sprite renderer ----------
function renderHull(id, hull, variant) {
  const rng = new Rng(hashStr(`${id}|${variant}`));
  const cell = 5; // uniform density: a seam is 1 px on every hull (owner 2026-10-07)
  const W = hull.gridW * cell + 6, H = hull.gridH * cell + cell * 2 + 8; // room for the plume
  const ox = 3, oy = 3;
  const buf = new Array(W * H).fill(null);      // colour or null (transparent)
  const tone = new Int8Array(W * H).fill(-1);
  const panel = new Int16Array(W * H).fill(-1);
  const idx = (x, y) => y * W + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const lift = (c) => mix(Array.isArray(c) ? c : hex(c), [255, 255, 255], 0.16);
  const hullR = ramp(lift(hull.palette.hull), 0.45), armorR = ramp(lift(hull.palette.armor), 0.45);
  const accR = ramp(hull.palette.accent, 0.25), glow = glowRamp(hull.palette.engine);
  const glass = ramp(hull.palette.viewport, 0.2);
  const cellAt = (cx, cy) => hull.shape[cy]?.[cx] || 0;
  const mirrorX = (x) => W - 1 - x + (W % 2 === 0 ? 0 : 0);

  // 1. silhouette from the cell grid (left half only, mirrored at the end)
  const inHull = (x, y) => { const cx = Math.floor((x - ox) / cell), cy = Math.floor((y - oy) / cell); return x >= ox && y >= oy && cx < hull.gridW && cy < hull.gridH && cellAt(cx, cy) > 0; };
  // round the convex corners of the cell silhouette by 1 px so big cells don't read as Lego
  const inSil = (x, y) => {
    if (!inHull(x, y)) return false;
    if (cell < 5) return true;
    const l = inHull(x - 1, y), r = inHull(x + 1, y), u = inHull(x, y - 1), d = inHull(x, y + 1);
    return !((!l && !u) || (!r && !u) || (!l && !d) || (!r && !d));
  };

  // 2. panels: rectilinear plates -- random row bands x column bands on the
  //    cell grid (left half, mirrored), with a per-band offset so seams stagger
  const bandsOf = (n, lo, hi) => { const out = []; let acc = 0; while (acc < n) { const w = Math.min(n - acc, rng.int(lo, hi)); out.push([acc, acc + w]); acc += w; } return out; };
  const rowBands = bandsOf(hull.gridH, 1, 5);
  const colBandsPerRow = []; const mergeUp = [];
  rowBands.forEach((rb, i) => { const reuse = i > 0 && rng.chance(0.3); colBandsPerRow.push(reuse ? colBandsPerRow[i - 1] : bandsOf(Math.ceil(hull.gridW / 2) + 1, 1, 4)); mergeUp.push(reuse); });
  const panelOf = (x, y) => {
    const mx = x < W / 2 ? x : W - 1 - x;
    const cx = Math.floor((mx - ox) / cell), cy = Math.floor((y - oy) / cell);
    const rb = rowBands.findIndex(([a, b]) => cy >= a && cy < b); if (rb < 0) return 0;
    const cb = colBandsPerRow[rb].findIndex(([a, b]) => cx >= a && cx < b);
    let r = rb; while (r > 0 && mergeUp[r]) r--; return r * 32 + Math.max(0, cb);
  };
  const sideBand = (x, y) => { const cx = Math.floor((x - ox) / cell); return cellAt(cx, Math.floor((y - oy) / cell)) === 1; };

  // 3. base fill with cel shading: light from the upper-left, armour edge cells darker
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inSil(x, y)) continue;
    const p = panelOf(x, y); panel[idx(x, y)] = p;
    const R = sideBand(x, y) ? armorR : hullR;
    const nx = (x + 0.5 - W / 2) / (W / 2), ny = (y - oy) / (hull.gridH * cell);
    let t = 3;
    if (nx > 0.25) t = 2; if (nx > 0.7) t = 1;
    if (nx < -0.3) t = 4;
    if (ny < 0.15 && t < 5) t += 1;
    if (ny > 0.85) t = Math.max(1, t - 1);
    // per-panel tone nudge so adjacent plates differ
    const nud = (p * 7919) % 3; if (nud === 0 && t > 1) t -= 1; if (nud === 2 && t < 4) t += 1;
    buf[idx(x, y)] = R[t]; tone[idx(x, y)] = t;
  }
  let curPanel = -1, nextPanel = 5000;
  const setT = (x, y, R, t) => { if (!inB(x, y)) return; buf[idx(x, y)] = R[t]; tone[idx(x, y)] = t; if (curPanel >= 0) panel[idx(x, y)] = curPanel; };
  const setC = (x, y, c) => { if (!inB(x, y)) return; buf[idx(x, y)] = c; tone[idx(x, y)] = -1; if (curPanel >= 0) panel[idx(x, y)] = curPanel; };
  const feature = (fn) => { curPanel = nextPanel++; fn(); curPanel = -1; };

  // 4. greebles (left half, mirrored later): vents, rivets, stripes, pods, turrets
  const halfW = Math.floor(W / 2);
  const greeble = (x, y, kind, R) => {
    if (kind === 'vent') { for (let i = 0; i < 3; i++) { for (let k = 0; k < cell - 1; k++) { if (inSil(x + k, y + i * 2)) setT(x + k, y + i * 2, R, 1); if (inSil(x + k, y + i * 2 - 1)) setT(x + k, y + i * 2 - 1, R, 4); } } }
    if (kind === 'rivet') { if (inSil(x, y)) { setT(x, y, R, 1); setT(x + 1, y, R, 5); } }
    if (kind === 'stripe') { for (let k = 0; k < cell * 2; k++) if (inSil(x, y + k)) setT(x, y + k, accR, k % 4 === 0 ? 4 : 3); }
    if (kind === 'hatch') { feature(() => { for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) if (inSil(x + xx, y + yy)) setT(x + xx, y + yy, R, (xx + yy) === 0 ? 5 : (xx === 2 || yy === 2) ? 1 : 2); }); }
    if (kind === 'pipe') { feature(() => { for (let k = 0; k < cell * 2 + 1; k++) { if (inSil(x, y + k)) setT(x, y + k, R, 4); if (inSil(x + 1, y + k)) setT(x + 1, y + k, R, 1); if (k % 5 === 0 && inSil(x - 1, y + k)) setT(x - 1, y + k, R, 2); } }); }
  };
  for (let cy = 0; cy < hull.gridH; cy++) for (let cx = 0; cx <= Math.floor(hull.gridW / 2); cx++) {
    if (cellAt(cx, cy) !== 2) continue;
    const px = ox + cx * cell + 1, py = oy + cy * cell + 1;
    const r = rng.next();
    if (r < 0.2) greeble(px, py, 'vent', hullR);
    else if (r < 0.38) greeble(px, py, 'rivet', hullR);
    else if (r < 0.5 && cy > 1 && cy < hull.gridH - 2) greeble(px + cell - 2, py, 'stripe', hullR);
    else if (r < 0.62) greeble(px, py, 'hatch', hullR);
    else if (r < 0.7) greeble(px, py, 'pipe', armorR);
  }
  // circular pods on the widest row(s), and a few small turrets
  const widest = hull.shape.map((row, y) => [row.reduce((a, v) => a + (v ? 1 : 0), 0), y]).sort((a, b) => b[0] - a[0])[0][1];
  const podR = Math.max(3, Math.round(cell * (hull.gridH >= 20 ? 2.2 : hull.gridH >= 14 ? 1.6 : 1.1)));
  const pods = [];
  { const row = hull.shape[widest]; let first = row.findIndex(v => v > 0); pods.push([ox + first * cell + podR + 1, oy + widest * cell + cell / 2]); }
  if (hull.gridH >= 14) { const y2 = Math.max(1, Math.round(hull.gridH * 0.22)); const row = hull.shape[y2]; const first = row.findIndex(v => v > 0); if (first >= 0) pods.push([ox + first * cell + podR, oy + y2 * cell + cell / 2]); }
  const disc = (cx, cy, r, R, center) => { for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const d = Math.sqrt(x * x + y * y); if (d > r + 0.5) continue; const X = Math.round(cx + x), Y = Math.round(cy + y); if (d > r - 0.6) setC(X, Y, OUT); else if (d > r - 1.6) setT(X, Y, R, x < 0 && y < 0 ? 5 : x > 0 && y > 0 ? 1 : 3); else if (d > r * 0.45) setT(X, Y, R, 3 + (x + y < 0 ? 1 : -1)); else setT(X, Y, R, center); } };
  for (const [px, py] of pods) feature(() => disc(px, py, podR, hullR, 1));
  const turrets = hull.gridH >= 11 ? rng.int(1, 2) : 0;
  for (let i = 0; i < turrets; i++) { const cy = rng.int(Math.floor(hull.gridH * 0.35), Math.floor(hull.gridH * 0.75)); const row = hull.shape[cy]; const cxs = row.map((v, i) => v === 2 ? i : -1).filter(v => v >= 0 && v < hull.gridW / 2); if (!cxs.length) continue; const cx = rng.pick(cxs); feature(() => disc(ox + cx * cell + cell / 2, oy + cy * cell + cell / 2, Math.max(2, Math.round(cell * 0.7)), armorR, 4)); }
  // fins on the outer edge + a nose antenna (bigger hulls only)
  if (hull.gridH >= 7) {
    const noseA = hull.shape[0].findIndex(v => v > 0);
    if (noseA >= 0) feature(() => { const nx = ox + noseA * cell + Math.floor(cell / 2); const h = 3 + variant; for (let y = oy - 1; y >= Math.max(0, oy - h); y--) setT(nx, y, armorR, 2); setC(nx, Math.max(0, oy - h), accR[4]); if (variant === 2) for (let k = -2; k <= 2; k++) setT(nx + k, oy - 2, armorR, 3); });
  }
  if (hull.gridH >= 11) {
    const fy = Math.round(hull.gridH * (0.45 + rng.next() * 0.25));
    const row = hull.shape[fy]; const first = row.findIndex(v => v > 0);
    if (first >= 0) feature(() => { for (let y = oy + fy * cell; y < oy + (fy + 2) * cell; y++) for (let x = ox + first * cell - Math.max(2, cell - 1); x < ox + first * cell + 1; x++) setT(x, y, armorR, y < oy + fy * cell + 2 ? 4 : 2); });

  }

  // 5. bridge / canopy: dark glass block with a light streak
  { curPanel = nextPanel++; const bx = ox + hull.bridgeX * cell, by = oy + hull.bridgeRow * cell, bw = hull.bridgeWidth * cell, bh = Math.max(3, Math.round(cell * 1.3));
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) { if (!inSil(x, y)) continue; const edge = x === bx || x === bx + bw - 1 || y === by || y === by + bh - 1; setC(x, y, edge ? OUT : (x - bx) + (y - by) < Math.max(2, bw / 3) ? glass[5] : (x - bx) + (y - by) < bw * 0.6 ? glass[3] : glass[1]); } curPanel = -1; }

  // 6. engines: nozzles + plume below the hull
  const bottom = oy + hull.gridH * cell;
  for (const e of hull.engines) {
    const ex0 = ox + e.x * cell, ew = e.w * cell;
    { let low = bottom; for (let y = bottom - 1; y >= oy; y--) { let any = false; for (let x = ex0; x < ex0 + ew; x++) if (inSil(x, y)) any = true; if (any) { low = y + 1; break; } }
      for (let y = low - cell; y < low; y++) for (let x = ex0; x < ex0 + ew; x++) { if (!inSil(x, y)) continue; const edge = x === ex0 || x === ex0 + ew - 1; setT(x, y, armorR, edge ? 0 : 1); } }
    let base = bottom; for (let y = bottom - 1; y >= oy; y--) { let any = false; for (let x = ex0; x < ex0 + ew; x++) if (inSil(x, y)) any = true; if (any) { base = y + 1; break; } }
    const plumeH = cell * 2 + 2, cxm = ex0 + ew / 2;
    for (let y = base; y < base + plumeH; y++) {
      const t = (y - base) / plumeH, half = (ew / 2 - 0.5) * (1 - t * 0.55);
      for (let x = Math.ceil(cxm - half - 1); x <= Math.floor(cxm + half); x++) {
        const d = Math.abs(x + 0.5 - cxm) / Math.max(1, half);
        const c = d > 0.95 || t > 0.9 ? glow[0] : d > 0.7 || t > 0.72 ? glow[1] : d > 0.45 || t > 0.5 ? glow[2] : d > 0.25 || t > 0.3 ? glow[3] : glow[4];
        setC(x, y, c);
      }
    }
  }

  // 7. mirror the left half onto the right (symmetry like the reference)
  for (let y = 0; y < H; y++) for (let x = 0; x < halfW; x++) { const mx = W - 1 - x; buf[idx(mx, y)] = buf[idx(x, y)]; tone[idx(mx, y)] = tone[idx(x, y)]; panel[idx(mx, y)] = panel[idx(x, y)]; }

  // 8. grain
  const noise = (x, y) => { let h = (x * 73856093) ^ (y * 19349663) ^ hashStr(id + variant); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y), t = tone[i]; if (t < 2 || !buf[i]) continue;
    const R = sideBand(x, y) ? armorR : hullR; const n = noise(x, y);
    if (n < 0.09) buf[i] = R[t - 1]; else if (t >= 4 && n > 0.94) buf[i] = R[t - 1];
  }

  // 9. outlines: silhouette + panel seams (lower/right side), then 1-px top-edge highlight
  const final = buf.slice();
  const isBg = (x, y) => !inB(x, y) || buf[idx(x, y)] == null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y); if (!buf[i]) continue;
    const g = glow.includes(buf[i]);
    if (g) { if (isBg(x - 1, y) || isBg(x + 1, y) || isBg(x, y + 1)) final[i] = glow[0]; continue; }
    if (isBg(x - 1, y) || isBg(x + 1, y) || isBg(x, y - 1) || isBg(x, y + 1)) { final[i] = OUT; continue; }
    const pu = panel[idx(x, y - 1)], pl = panel[idx(x - 1, y)];
    if ((pu >= 0 && pu !== panel[i]) || (pl >= 0 && pl !== panel[i])) final[i] = OUT;
    // armour band vs hull interior seam
    if (sideBand(x, y) !== sideBand(x, y - 1) && !isBg(x, y - 1)) final[i] = OUT;
  }
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y); if (!buf[i] || tone[i] < 1 || final[i] === OUT) continue;
    if (final[idx(x, y - 1)] === OUT && !glow.includes(buf[i])) { const R = sideBand(x, y) ? armorR : hullR; final[i] = R[Math.min(5, tone[i] + 2)]; }
  }
  return { W, H, px: final };
}


// ======================================================================
// Browser wrapper
// ======================================================================
export const SHIP_VARIANTS = 3;
const spriteCache = new Map();
function renderSprite(hullId, hull, variant) {
  const key = `${hullId}|${variant}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const sp = renderHull(hullId, hull, variant);
  spriteCache.set(key, sp);
  return sp;
}
function spriteToCanvas(sp) {
  const c = document.createElement('canvas');
  c.width = sp.W; c.height = sp.H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(sp.W, sp.H);
  for (let i = 0; i < sp.px.length; i++) {
    const p = sp.px[i]; if (!p) continue;
    img.data[i * 4] = p[0]; img.data[i * 4 + 1] = p[1]; img.data[i * 4 + 2] = p[2]; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
const iconCache = new Map();
// System-view icon: body height (hull rows x cell) scaled to displaySize x 1.15;
// the plume trails below. Smoothing only when shrinking.
export function getHumanShipIcon(hullId, hull, variant = 0) {
  const key = `${hullId}|${variant}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const sp = renderSprite(hullId, hull, variant);
  const bodyH = Math.max(1, hull.gridH * 5);
  const s = Math.min(1, ((hull.displaySize || 10) * 1.15) / bodyH);
  const native = spriteToCanvas(sp);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(sp.W * s)); c.height = Math.max(1, Math.ceil(sp.H * s));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = s < 1;
  ctx.drawImage(native, 0, 0, c.width, c.height);
  const result = { dataUrl: c.toDataURL(), width: c.width, height: c.height };
  iconCache.set(key, result);
  return result;
}
const imageCache = new Map();
// Thumbnails (Fleet / Fitting windows): native pixels x an integer scale, crisp.
export function getHumanShipImage(hullId, hull, variant = 0, intScale = 1) {
  const k = Math.max(1, Math.round(intScale));
  const key = `${hullId}|${variant}|${k}`;
  const hit = imageCache.get(key);
  if (hit) return hit;
  const sp = renderSprite(hullId, hull, variant);
  const native = spriteToCanvas(sp);
  const c = document.createElement('canvas');
  c.width = sp.W * k; c.height = sp.H * k;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(native, 0, 0, c.width, c.height);
  const result = { dataUrl: c.toDataURL(), width: c.width, height: c.height };
  imageCache.set(key, result);
  return result;
}
