// alienShipRenderer.js -- sprites for the two non-human enemy factions
// (docs/enemy-factions-spec.md Phase B, 2026-10-07). GENERATED from the
// preview generator on the owner's Desktop (star-shipper-sprites/alien/
// _generator_alien_fleets.mjs) by scratchpad build_alien_renderer.js --
// the anatomy code below is the same text; only the browser wrapper at
// the bottom is hand-written. Re-run the build after tuning the preview.
//
// Each faction draws every ship from its OWN anatomy table keyed by the
// player hull it mirrors (the server's hull_types rows copy the mirrored
// hull's grid, so the keys line up). Sprites are nose-UP like the pirate
// icon canvas, so SystemView's +90 rotation rule (CLAUDE.md pitfall #3)
// is untouched. Icons are cached per hull id and scaled so the BODY (not
// the tentacles) matches the mirrored hull's displaySize.

const CELL = 5;

// ---------- helpers ----------
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
class Rng { constructor(seed) { this.s = (seed >>> 0) || 1; } next() { let t = (this.s += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; } int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); } pick(a) { return a[this.int(0, a.length - 1)]; } chance(p) { return this.next() < p; } }
const hex = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const WARM = [250, 246, 220];
const ramp = (c, { desat = 0.35, cool = [30, 26, 44], out = [28, 32, 26] } = {}) => {
  const raw = Array.isArray(c) ? c : hex(c);
  const lum = Math.round(raw[0] * 0.3 + raw[1] * 0.59 + raw[2] * 0.11);
  const b = mix(raw, [lum, lum, lum], desat);
  return [out, mix(b, cool, 0.55), mix(b, cool, 0.3), b, mix(b, WARM, 0.3), mix(b, WARM, 0.55)];
};
const glowRamp = (c, out) => { const e = hex(c); return [mix(e, out, 0.55), mix(e, [0, 0, 0], 0.15), e, mix(e, [255, 255, 255], 0.45), [255, 250, 240]]; };
const hash2 = (x, y, s) => { let h = (x * 73856093) ^ (y * 19349663) ^ s; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// smooth value noise, period p
const vnoise = (x, y, p, s) => { const gx = Math.floor(x / p), gy = Math.floor(y / p), tx = x / p - gx, ty = y / p - gy; const a = hash2(gx, gy, s), b = hash2(gx + 1, gy, s), c = hash2(gx, gy + 1, s), d = hash2(gx + 1, gy + 1, s); const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy; };

// bilinear occupancy field over the hull cell grid (0..1), cells as centres
const fieldFor = (hull, ox, oy, cell) => (x, y) => {
  const occ = (i, j) => (hull.shape[j]?.[i] ? 1 : 0);
  const fx = (x - ox) / cell - 0.5, fy = (y - oy) / cell - 0.5;
  const i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
  return (occ(i0, j0) * (1 - tx) + occ(i0 + 1, j0) * tx) * (1 - ty) + (occ(i0, j0 + 1) * (1 - tx) + occ(i0 + 1, j0 + 1) * tx) * ty;
};

// shared canvas plumbing
function canvas(W, H) {
  const buf = new Array(W * H).fill(null), tone = new Int8Array(W * H).fill(-1), panel = new Int16Array(W * H).fill(-1);
  const idx = (x, y) => y * W + x, inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  let curPanel = -1, nextPanel = 5000;
  const setT = (x, y, R, t) => { if (!inB(x, y)) return; buf[idx(x, y)] = R[t]; tone[idx(x, y)] = t; if (curPanel >= 0) panel[idx(x, y)] = curPanel; };
  const setC = (x, y, c) => { if (!inB(x, y)) return; buf[idx(x, y)] = c; tone[idx(x, y)] = -1; if (curPanel >= 0) panel[idx(x, y)] = curPanel; };
  const feature = (fn) => { curPanel = nextPanel++; fn(); curPanel = -1; };
  const mirror = () => { const half = Math.floor(W / 2); for (let y = 0; y < H; y++) for (let x = 0; x < half; x++) { const m = W - 1 - x; buf[idx(m, y)] = buf[idx(x, y)]; tone[idx(m, y)] = tone[idx(x, y)]; panel[idx(m, y)] = panel[idx(x, y)]; } };
  const line = (x0, y0, x1, y1, fn) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) fn(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), i / n); };
  const disc = (cx, cy, r, R, center, out) => { for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const d = Math.sqrt(x * x + y * y); if (d > r + 0.5) continue; const X = Math.round(cx + x), Y = Math.round(cy + y); if (d > r - 0.6) setC(X, Y, out); else if (d > r - 1.6) setT(X, Y, R, x < 0 && y < 0 ? 5 : x > 0 && y > 0 ? 1 : 3); else if (d > r * 0.45) setT(X, Y, R, 3 + (x + y < 0 ? 1 : -1)); else setT(X, Y, R, center); } };
  // final passes: grain, outline on silhouette + panel seams, top-edge highlight
  const finish = ({ grain, rampAt, glows, out, seed, highlightSkip = () => false }) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = idx(x, y), t = tone[i]; if (t < 2 || !buf[i]) continue; const R = rampAt(x, y); const n = hash2(x, y, seed); if (n < grain) buf[i] = R[t - 1]; else if (t >= 4 && n > 0.93) buf[i] = R[t - 1]; }
    const final = buf.slice();
    const isBg = (x, y) => !inB(x, y) || buf[idx(x, y)] == null;
    const isGlow = (c) => glows.some(g => g.includes(c));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y); if (!buf[i]) continue;
      if (isGlow(buf[i])) { if (isBg(x - 1, y) || isBg(x + 1, y) || isBg(x, y + 1)) final[i] = glows.find(g => g.includes(buf[i]))[0]; continue; }
      if (isBg(x - 1, y) || isBg(x + 1, y) || isBg(x, y - 1) || isBg(x, y + 1)) { final[i] = out; continue; }
      const pu = panel[idx(x, y - 1)], pl = panel[idx(x - 1, y)];
      if ((pu >= 0 && pu !== panel[i]) || (pl >= 0 && pl !== panel[i])) final[i] = out;
    }
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) { const i = idx(x, y); if (!buf[i] || tone[i] < 1 || final[i] === out || isGlow(buf[i]) || highlightSkip(x, y)) continue; if (final[idx(x, y - 1)] === out) final[i] = rampAt(x, y)[Math.min(5, tone[i] + 2)]; }
    return final;
  };
  return { W, H, buf, tone, panel, idx, inB, setT, setC, feature, mirror, line, disc, finish, get curPanel() { return curPanel; }, set curPanel(v) { curPanel = v; }, nextPanel: () => nextPanel++ };
}



// ---- SWARM (bio) ----
function renderHive(id, hull, variant) {
  const seed = hashStr(`swarm|${id}|${variant}`), rng = new Rng(seed);
  const cell = CELL;
  // ---- anatomy per class (units of cells); the player hull only sets the scale ----
  const P = {
    fighter:    { head: 1.5, thorax: 2.2, abd: 1.4, tail: 2, tent: 2, tentLen: 5,  feel: 2, claws: 0.9, wings: 0,   drill: 0, spines: 2 },
    scout:      { head: 1.7, thorax: 5.0, abd: 1.9, tail: 3, tent: 2, tentLen: 7,  feel: 3, claws: 0.8, wings: 0,   drill: 0, spines: 4 },
    shuttle:    { head: 2.3, thorax: 2.0, abd: 3.6, tail: 1, tent: 3, tentLen: 4,  feel: 1.5, claws: 1.3, wings: 0, drill: 0, spines: 2 },
    freighter:  { head: 2.5, thorax: 3.0, abd: 5.4, tail: 2, tent: 4, tentLen: 7,  feel: 2, claws: 1.0, wings: 0,   drill: 0, spines: 3 },
    frigate:    { head: 2.2, thorax: 2.8, abd: 2.6, tail: 2, tent: 3, tentLen: 6,  feel: 2, claws: 2.4, wings: 7.5, drill: 0, spines: 3 },
    capital:    { head: 3.4, thorax: 7.0, abd: 6.6, tail: 4, tent: 6, tentLen: 11, feel: 3, claws: 2.8, wings: 8.5, drill: 0, spines: 6 },
    prospector: { head: 2.2, thorax: 2.0, abd: 3.0, tail: 1, tent: 2, tentLen: 4,  feel: 0, claws: 0,   wings: 0,   drill: 2.2, spines: 2 },
    excavator:  { head: 2.8, thorax: 3.4, abd: 4.4, tail: 2, tent: 3, tentLen: 6,  feel: 0, claws: 1.4, wings: 0,   drill: 3.0, spines: 3 },
    leviathan:  { head: 3.4, thorax: 4.6, abd: 6.2, tail: 3, tent: 5, tentLen: 9,  feel: 0, claws: 2.2, wings: 0,   drill: 3.8, spines: 5 },
  }[id] || { head: 2, thorax: 3, abd: 3, tail: 2, tent: 3, tentLen: 6, feel: 2, claws: 1, wings: 0, drill: 0, spines: 3 };
  const u = (v) => Math.round(v * cell);
  const span = Math.max(P.abd * 2, P.head * 2, P.wings * 2 + 2, P.claws * 2 + P.head * 2) * cell + 16;
  const topPad = u(Math.max(P.feel, P.drill, 1.5)) + 8;
  const bodyLen = u(P.head * 1.6 + P.thorax + P.abd * 1.7 + P.tail * 1.1);
  const W = Math.round(span) + (Math.round(span) % 2 === 0 ? 1 : 0); // odd width -> true centre column
  const H = topPad + bodyLen + u(P.tentLen) + 10;
  const C = canvas(W, H);
  const OUT = [26, 14, 30];
  const chitin = ramp(['#3a1c48', '#30183c', '#44202e', '#241e40'][variant % 4], { desat: 0.12, cool: [14, 6, 28], out: OUT });
  const flesh = ramp(['#8a3a52', '#7a3a60', '#8a4a3a', '#6a3a62'][variant % 4], { desat: 0.2, cool: [30, 10, 34], out: OUT });
  const membrane = ramp('#9a6a8a', { desat: 0.25, cool: [40, 20, 50], out: OUT });
  const bone = ramp('#cfc0a0', { desat: 0.15, cool: [70, 60, 70], out: OUT });
  const glow = glowRamp(['#5ef0a8', '#7ad8ff', '#c06cff', '#a0ff5a'][variant % 4], OUT);
  const eye = glowRamp('#ffb347', OUT);
  const half = Math.floor(W / 2), cx = half;

  // ---- key points down the spine ----
  const yHead = topPad + u(P.head);                 // head centre
  const yThorax0 = yHead + u(P.head * 0.6);          // thorax starts
  const yAbd = yThorax0 + u(P.thorax) + u(P.abd * 0.8); // abdomen centre
  const yTail0 = yAbd + u(P.abd * 0.85);             // tail starts
  const ell = (x, y, ex, ey, rx, ry) => ((x + 0.5 - ex) / rx) ** 2 + ((y + 0.5 - ey) / ry) ** 2 <= 1;

  // ---- 1. body silhouette (left half, mirrored): head + thorax + abdomen + tail segments ----
  const sil = new Uint8Array(W * H);
  const wob = (x, y) => 0.9 + 0.35 * (vnoise(x, y, 6, seed) - 0.5);
  for (let y = 0; y < H; y++) for (let x = 0; x <= half; x++) {
    const w = wob(x, y);
    let on = ell(x, y, cx, yHead, u(P.head) * w, u(P.head * 0.95) * w);
    // thorax: tapered band between head and abdomen
    if (!on && y >= yThorax0 - 2 && y <= yAbd) { const t = (y - yThorax0) / Math.max(1, yAbd - yThorax0); const hw = (u(P.head * 0.7) * (1 - t) + u(P.abd * 0.75) * t) * w; on = Math.abs(x + 0.5 - cx) <= hw; }
    if (!on) on = ell(x, y, cx, yAbd, u(P.abd) * w, u(P.abd * 0.9) * w);
    // tail segments: shrinking discs
    for (let k = 0; !on && k < P.tail; k++) { const r = u(P.abd * 0.45) * (1 - k / (P.tail + 1)); const ty = yTail0 + k * Math.max(3, r * 1.4) + r * 0.5; on = ell(x, y, cx, ty, Math.max(2, r * w), Math.max(2, r * 1.1)); }
    if (on) { sil[C.idx(x, y)] = 1; sil[C.idx(W - 1 - x, y)] = 1; }
  }
  const inS = (x, y) => C.inB(x, y) && sil[C.idx(x, y)] === 1;
  const dist = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!inS(x, y)) continue; let d = 4; for (let k = 1; k <= 4; k++) if (!inS(x - k, y) || !inS(x + k, y) || !inS(x, y - k) || !inS(x, y + k)) { d = k - 1; break; } dist[C.idx(x, y)] = d; }

  // ---- 2. membrane wings (warships): translucent fins with veins, behind the body ----
  if (P.wings) {
    const wy0 = yThorax0 + u(0.4), wy1 = yAbd + u(P.abd * 0.4), spanPx = u(P.wings);
    C.feature(() => { for (let y = wy0; y <= wy1 + u(1.2); y++) for (let x = 0; x <= half; x++) {
      const t = (y - wy0) / Math.max(1, wy1 - wy0);                       // 0 top .. 1 bottom
      const reach = spanPx * Math.sin(Math.min(1, t) * Math.PI * 0.75) * (1 + 0.15 * (vnoise(x, y, 5, seed + 2) - 0.5));
      const dx = cx - x; if (inS(x, y) || dx > reach || dx < 0) continue;
      const edge = dx > reach - 1.5;
      const vein = Math.abs(((dx * 1.3 + (y - wy0) * 0.6) % 7)) < 1;
      C.setT(x, y, membrane, edge ? 1 : vein ? 2 : t < 0.4 ? 4 : 3);
    } });
  }

  // ---- 3. body shading: tube + arched segments, flank ridges, dorsal soft tissue ----
  const bandH = cell + 1, arch = (x) => 2.0 * Math.sin((x - cx) * 0.25) + 0.012 * (x - cx) ** 2;
  const segOf = (x, y) => Math.floor((y + arch(x)) / bandH);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inS(x, y)) continue;
    const d = dist[C.idx(x, y)], nx = (x + 0.5 - cx) / Math.max(1, u(P.abd));
    let t = d === 0 ? 1 : d === 1 ? 2 : 3;
    if (d >= 2 && nx < -0.25) t = 4; if (d >= 3 && nx < -0.5) t = 5;
    if (d >= 2 && nx > 0.35) t = 2; if (d >= 1 && nx > 0.75) t = 1;
    C.setT(x, y, chitin, t); C.panel[C.idx(x, y)] = segOf(x, y);
    if (t >= 3 && hash2(x, y, seed + 3) < 0.05) C.setT(x, y, chitin, 1);
  }
  for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
    if (!inS(x, y) || !inS(x, y + 1) || segOf(x, y) === segOf(x, y + 1)) continue;
    const nx = Math.abs(x + 0.5 - cx) / Math.max(1, u(P.abd));
    if (nx > 0.3 && dist[C.idx(x, y)] >= 1 && segOf(x, y) % 2 === 0) C.setT(x, y, chitin, (x + 0.5 - cx) < 0 ? 5 : 4);
    if (nx <= 0.3 && dist[C.idx(x, y)] >= 2 && hash2(x, y, seed + 5) < 0.6) C.setT(x, y, flesh, 2);
  }
  // dorsal spine: dark line with bone bumps (spines seen from above)
  C.feature(() => { for (let y = yHead; y < yTail0; y++) if (inS(cx, y)) C.setT(cx, y, chitin, 1); });
  for (let i = 0; i < P.spines; i++) { const y = yThorax0 + Math.round((i + 0.5) / P.spines * (yAbd + u(P.abd * 0.5) - yThorax0)); if (!inS(cx, y)) continue; C.feature(() => { for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [0, 0], [0, -2]]) C.setT(cx + dx, y + dy, bone, dy < 0 ? 5 : dy === 0 && dx === 0 ? 4 : 3); }); }
  // veins
  for (let v = 0; v < rng.int(2, 4); v++) { let x = rng.int(cx - u(P.abd * 0.8), cx - 2), y = rng.int(yThorax0, yAbd); for (let k = 0; k < rng.int(6, 14); k++) { if (inS(x, y) && dist[C.idx(x, y)] >= 1) C.setT(x, y, flesh, 1); x += rng.int(-1, 1); y += rng.int(0, 1); } }

  // ---- 4. bone spurs along the flanks (left side, mirrored) ----
  for (let y = yThorax0; y < yTail0; y += bandH) {
    let ex = -1; for (let x = 0; x < half; x++) if (inS(x, y)) { ex = x; break; }
    if (ex < 0) continue;
    const len = rng.int(4, 7) + Math.round(P.abd), sweep = 0.35 + rng.next() * 0.5;
    C.feature(() => C.line(ex + 1, y, ex - len, y + len * sweep, (px, py, t) => { const tone = t < 0.25 ? 2 : t < 0.7 ? 3 : 5; C.setT(px, py, bone, tone); if (t < 0.75) C.setT(px, py + 1, bone, Math.max(1, tone - 1)); if (t < 0.4) C.setT(px, py - 1, bone, tone); }));
  }
  // ---- 5. pincer claws (from the thorax sides, sweeping forward past the head) ----
  if (P.claws) { const len = u(P.claws * 1.6), rootY = yThorax0 + u(0.3); let rx = -1; for (let x = 0; x < half; x++) if (inS(x, rootY)) { rx = x; break; }
    if (rx >= 0) C.feature(() => { for (let k = 0; k <= len; k++) { const t = k / len; const x = Math.round(rx - 1 - Math.sin(t * Math.PI) * len * 0.5 + t * t * len * 0.35), y = rootY - k; const th = t < 0.5 ? 3 : t < 0.85 ? 2 : 1; const tone = t < 0.3 ? 2 : t < 0.75 ? 3 : 5; for (let w = 0; w < th; w++) C.setT(x + w, y, bone, w === 0 ? tone : Math.max(1, tone - 1)); } }); }
  // ---- 6. drill mandibles (miners): stacked bone cones ahead of the head ----
  if (P.drill) { const n = id === 'prospector' ? 1 : id === 'excavator' ? 2 : 3; const spread = u(P.head * 0.9);
    for (let i = 0; i < n; i++) { const dxx = n === 1 ? 0 : Math.round(-spread / 2 + i * spread / (n - 1)); const top = yHead - u(P.head) - u(P.drill) + 2, base = yHead - u(P.head * 0.4), r0 = Math.max(2, u(P.drill * 0.35));
      C.feature(() => { for (let y = top; y <= base; y++) { const t = (y - top) / Math.max(1, base - top); const r = Math.max(0, Math.round(r0 * t)); for (let x = -r; x <= r; x++) { const tone = x < -r * 0.3 ? 4 : x > r * 0.4 ? 2 : 3; C.setT(cx + dxx + x, y, bone, (y - top) % 3 === 0 ? 1 : tone); } } }); } }
  // ---- 7. feeder tendrils from the head (thin, wavy, forward) ----
  for (let i = 0; i < Math.round(P.feel); i++) { const x0 = cx - u(P.head * 0.45) - i * 2, y0 = yHead - u(P.head * 0.6), len = u(P.feel) + i * 2, ph = rng.next() * 6;
    C.feature(() => { for (let k = 0; k <= len; k++) { const t = k / len; const x = Math.round(x0 - t * (3 + i * 2) + Math.sin(k * 0.6 + ph) * 1.5), y = y0 - k; C.setT(x, y, flesh, t > 0.8 ? 4 : 3); if (t < 0.5) C.setT(x + 1, y, flesh, 2); } }); }
  // ---- 8. eyes: a pair per side on the head ----
  C.feature(() => { for (const [dx, dy] of [[-u(P.head * 0.35), 0], [-u(P.head * 0.65), u(0.4)]]) { const ex = cx + dx, ey = yHead + dy; if (!inS(ex, ey)) continue; for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if (inS(ex + xx, ey + yy)) C.setC(ex + xx, ey + yy, OUT); C.setC(ex, ey, eye[3]); C.setC(ex - 1, ey, eye[1]); } });
  // ---- 9. bio-cannon / engine sacs on the abdomen flanks and rear ----
  const sacs = [[cx - u(P.abd * 0.75), yAbd - u(P.abd * 0.2), Math.max(2, u(P.abd * 0.17))], [cx - u(P.abd * 0.35), yAbd + u(P.abd * 0.7), Math.max(2, u(P.abd * 0.2))]];
  for (const [sx, sy, r] of sacs) C.feature(() => { for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const d = Math.sqrt(x * x + y * y); if (d > r + 0.4) continue; C.setC(sx + x, sy + y, d > r - 0.6 ? glow[0] : d > r * 0.65 ? glow[1] : d > r * 0.4 ? glow[2] : d > r * 0.18 ? glow[3] : glow[4]); } });

  C.mirror();

  // ---- 10. trailing tentacles (both sides, different phases -- NOT mirrored) ----
  const tentacle = (x0, y0, len, dir, ph, thick) => C.feature(() => { for (let k = 0; k <= len; k++) { const t = k / len; const x = Math.round(x0 + dir * (t * len * 0.35 + Math.sin(k * 0.45 + ph) * 2.2)), y = y0 + k; const th = Math.max(1, Math.round(thick * (1 - t * 0.55))); for (let w = -Math.floor(th / 2); w <= Math.floor(th / 2); w++) { const tone = w < 0 ? 4 : w === 0 ? 3 : 2; C.setT(x + w, y, flesh, tone); } if (k % 4 === 0 && th >= 2) C.setT(x, y, bone, 4); if (t > 0.92) C.setC(x, y, glow[3]); } });
  const nT = P.tent;
  for (let i = 0; i < nT; i++) {
    const side = i % 2 === 0 ? -1 : 1, j = Math.floor(i / 2);
    const x0 = cx + side * (u(P.abd * 0.25) + j * Math.max(3, u(P.abd * 0.3)));
    let y0 = yTail0; for (let y = H - 1; y >= 0; y--) if (inS(x0, y)) { y0 = y; break; }
    tentacle(x0, y0 - 1, u(P.tentLen) - j * 3, side, rng.next() * 6.28, i < 2 ? 4 : 3);
  }

  const px = C.finish({ grain: 0.09, rampAt: (x, y) => { const c = C.buf[C.idx(x, y)]; return bone.includes(c) ? bone : flesh.includes(c) ? flesh : membrane.includes(c) ? membrane : chitin; }, glows: [glow, eye], out: OUT, seed });
  return { W, H, px, bodyY0: topPad, bodyY1: topPad + bodyLen };
}

// ---- SYNOD (machine) ----
function renderForge(id, hull, variant) {
  const seed = hashStr(`synod|${id}|${variant}`), rng = new Rng(seed);
  const cell = CELL, u = (v) => Math.round(v * cell);
  // ---- anatomy per class (cells): a stack of modules down a central spine ----
  //   mods: [halfWidth, height] top -> bottom; arms: count per side; ants: antenna masts; dish radius
  const P = {
    fighter:    { mods: [[0.8, 1.4], [1.6, 1.6], [1.0, 1.2]],                           arms: 1, armLen: 2.2, ants: 1, dish: 0,   thr: 1, neon: 2 },
    scout:      { mods: [[0.7, 1.6], [1.2, 3.0], [1.9, 1.6], [1.0, 2.2]],               arms: 1, armLen: 3.0, ants: 3, dish: 1.0, thr: 1, neon: 3 },
    shuttle:    { mods: [[1.4, 1.4], [2.8, 2.4], [2.2, 1.6], [1.4, 1.0]],               arms: 2, armLen: 2.6, ants: 1, dish: 0,   thr: 2, neon: 3 },
    freighter:  { mods: [[1.4, 1.6], [3.2, 2.0], [3.6, 3.2], [3.6, 3.2], [2.4, 1.6]],   arms: 2, armLen: 3.4, ants: 2, dish: 1.2, thr: 3, neon: 4 },
    frigate:    { mods: [[1.0, 1.6], [2.4, 1.8], [5.2, 2.2], [2.8, 1.6], [1.6, 1.2]],   arms: 2, armLen: 4.2, ants: 2, dish: 1.3, thr: 3, neon: 4 },
    capital:    { mods: [[1.4, 2.4], [3.0, 2.6], [5.4, 3.0], [6.4, 4.2], [5.0, 3.0], [3.2, 2.2]], arms: 3, armLen: 5.0, ants: 4, dish: 2.0, thr: 5, neon: 6 },
    prospector: { mods: [[1.6, 1.4], [2.6, 2.6], [2.0, 1.6]],                           arms: 2, armLen: 3.4, ants: 1, dish: 0,   thr: 1, neon: 2, drill: 1 },
    excavator:  { mods: [[1.8, 1.6], [3.6, 3.0], [3.0, 2.2], [2.0, 1.4]],               arms: 3, armLen: 4.0, ants: 2, dish: 1.0, thr: 3, neon: 3, drill: 2 },
    leviathan:  { mods: [[2.2, 2.0], [4.4, 3.4], [5.4, 3.6], [4.0, 2.6], [2.6, 1.6]],   arms: 3, armLen: 5.2, ants: 3, dish: 1.6, thr: 4, neon: 5, drill: 3 },
  }[id];
  const maxHalf = Math.max(...P.mods.map(m => m[0]));
  const topPad = u(2.6) + 6, bodyLen = P.mods.reduce((a, m) => a + u(m[1]), 0);
  const W0 = u(maxHalf * 2 + P.armLen * 2 + 1.5) + 12, W = W0 % 2 ? W0 : W0 + 1, H = topPad + bodyLen + u(2.4) + 8;
  const C = canvas(W, H);
  const OUT = [22, 20, 26];
  const red = ramp(['#8a2a24', '#7a2628', '#92301e', '#6e2030'][variant % 4], { desat: 0.22, cool: [26, 12, 24], out: OUT });
  const bronze = ramp(['#b8742a', '#a86a2c', '#c07c2a', '#9e6428'][variant % 4], { desat: 0.12, cool: [50, 30, 20], out: OUT });
  const silver = ramp('#b8c0c8', { desat: 0.05, cool: [50, 54, 70], out: OUT });
  const iron = ramp('#4a4e58', { desat: 0.2, cool: [20, 20, 30], out: OUT });
  const neon = glowRamp('#3ad8ff', OUT);
  const plume = glowRamp(['#4ac8ff', '#66d8ff', '#3ab8ff', '#80e0ff'][variant % 4], OUT);
  const half = Math.floor(W / 2), cx = half;

  // ---- 1. body: stacked modules (left half, mirrored); alternate red / bronze, silver top module ----
  const mods = []; let y = topPad;
  P.mods.forEach((m, i) => { mods.push({ x0: cx - u(m[0]), x1: cx + u(m[0]), y0: y, y1: y + u(m[1]), R: i === 0 ? silver : (i % 2 ? bronze : red), i }); y += u(m[1]); });
  const sil = new Uint8Array(W * H);
  for (const m of mods) for (let yy = m.y0; yy < m.y1; yy++) { const ch = (yy - m.y0 < 2) ? 2 - (yy - m.y0) : (m.y1 - 1 - yy < 2) ? 2 - (m.y1 - 1 - yy) : 0; for (let xx = m.x0 + ch; xx <= cx; xx++) { sil[C.idx(xx, yy)] = 1; sil[C.idx(W - 1 - xx, yy)] = 1; } }
  const inS = (x, y) => C.inB(x, y) && sil[C.idx(x, y)] === 1;
  for (const m of mods) {
    const pid = C.nextPanel();
    for (let yy = m.y0; yy < m.y1; yy++) for (let xx = m.x0; xx <= cx; xx++) {
      if (!inS(xx, yy)) continue;
      const nx = (xx + 0.5 - cx) / Math.max(1, u(maxHalf)), ty = (yy - m.y0) / Math.max(1, m.y1 - m.y0);
      let t = 3; if (nx < -0.35) t = 4; if (nx < -0.75) t = 5; if (ty < 0.2) t = Math.min(5, t + 1); if (ty > 0.85) t = Math.max(1, t - 1);
      C.setT(xx, yy, m.R, t); C.panel[C.idx(xx, yy)] = pid;
    }
    // silver plating strip down the module's outer edge + sub-panel seams
    C.feature(() => { for (let yy = m.y0 + 1; yy < m.y1 - 1; yy++) { C.setT(m.x0 + 1, yy, silver, 3); C.setT(m.x0 + 2, yy, silver, 2); } });
    if (m.y1 - m.y0 >= 8) { const sy = m.y0 + Math.floor((m.y1 - m.y0) / 2); C.feature(() => { for (let xx = m.x0 + 3; xx <= cx - 2; xx++) C.setT(xx, sy, m.R, 1); }); }
    // vertical panel seams + silver hatches + vent slots inside the module
    for (let xx = m.x0 + 4 + u(0.4); xx < cx - 3; xx += u(1.3)) C.feature(() => { for (let yy = m.y0 + 2; yy < m.y1 - 2; yy++) { if (!inS(xx, yy)) continue; C.setT(xx, yy, m.R, 1); C.setT(xx + 1, yy, m.R, 4); } });
    if (m.y1 - m.y0 >= 7 && m.i > 0) for (let k = 0; k < 1 + Math.floor((m.x1 - m.x0) / u(2.5)); k++) { const hx = m.x0 + 4 + rng.int(0, Math.max(0, cx - m.x0 - 9)), hy = m.y0 + 2 + rng.int(0, Math.max(0, m.y1 - m.y0 - 6));
      if (rng.chance(0.5)) C.feature(() => { for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) if (inS(hx + xx, hy + yy)) C.setT(hx + xx, hy + yy, silver, (xx + yy) === 0 ? 5 : (xx === 2 || yy === 2) ? 1 : 3); });
      else C.feature(() => { for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 4; xx++) if (inS(hx + xx, hy + yy)) C.setT(hx + xx, hy + yy, iron, yy % 2 ? 1 : 3); }); }
  }
  // silver nacelles on the widest module's flanks (rounded blocks with a neon strip)
  { const wide = mods.reduce((a, m) => (m.x1 - m.x0 > a.x1 - a.x0 ? m : a), mods[0]); const nw = u(1.1), nh = Math.max(6, Math.round((wide.y1 - wide.y0) * 0.8)), ny0 = wide.y0 + Math.floor((wide.y1 - wide.y0 - nh) / 2);
    C.feature(() => { for (let yy = ny0; yy < ny0 + nh; yy++) { const ch = (yy - ny0 < 1 || ny0 + nh - 1 - yy < 1) ? 1 : 0; for (let xx = wide.x0 - nw + ch; xx <= wide.x0 + 1; xx++) { sil[C.idx(xx, yy)] = 1; sil[C.idx(W - 1 - xx, yy)] = 1; C.setT(xx, yy, silver, xx < wide.x0 - nw + 2 ? 4 : 3); } }
      for (let yy = ny0 + 2; yy < ny0 + nh - 2; yy++) C.setC(wide.x0 - nw + 1, yy, (yy % 4 === 0) ? neon[4] : neon[2]); }); }
  // central spine: silver column with iron core line
  C.feature(() => { for (let yy = mods[0].y0; yy < mods[mods.length - 1].y1; yy++) { C.setT(cx - 1, yy, silver, 4); C.setT(cx, yy, iron, 2); } });

  // ---- 2. blue neon: strips along module bottoms, dots on the flanks, a reactor eye ----
  mods.forEach((m, i) => { if (i === 0 || i >= P.neon + 1) return; C.feature(() => { for (let xx = m.x0 + 3; xx <= cx - 2; xx += 1) { C.setC(xx, m.y1 - 2, (xx % 5 === 0) ? neon[4] : neon[2]); C.setC(xx, m.y1 - 1, neon[0]); } }); });
  for (let i = 0; i < P.neon; i++) { const m = mods[Math.min(mods.length - 1, 1 + Math.floor(i * mods.length / (P.neon + 1)))]; const yy = m.y0 + 2 + (i * 3) % Math.max(1, m.y1 - m.y0 - 4); C.feature(() => { C.setC(m.x0 + 3, yy, neon[3]); C.setC(m.x0 + 4, yy, neon[1]); }); }
  { const core = mods[Math.floor(mods.length / 2)]; const r = Math.max(2, Math.round((core.y1 - core.y0) * 0.28)), cy = Math.floor((core.y0 + core.y1) / 2);
    C.feature(() => { for (let yy = -r - 1; yy <= r + 1; yy++) for (let xx = -r - 1; xx <= r + 1; xx++) { const d = Math.sqrt(xx * xx + yy * yy); if (d > r + 1.4) continue; if (d > r + 0.4) { C.setT(cx + xx, cy + yy, bronze, 2); continue; } C.setC(cx + xx, cy + yy, d > r - 0.7 ? neon[0] : d > r * 0.6 ? neon[1] : d > r * 0.3 ? neon[3] : neon[4]); } }); }

  // ---- 3. antenna array on the top module: masts, cross-bars, tip lights; a dish on the shoulder ----
  const top = mods[0];
  for (let i = 0; i < P.ants; i++) { const mx = cx - u(0.3) - i * 3, h = u(1.4) + i * 2 + rng.int(0, 3);
    C.feature(() => { for (let yy = top.y0 - 1; yy >= top.y0 - h; yy--) { C.setT(mx, yy, silver, 3); C.setT(mx + 1, yy, iron, 1); } for (let k = -2; k <= 2; k++) C.setT(mx + k, top.y0 - Math.round(h * 0.6), silver, k < 0 ? 4 : 2); C.setC(mx, top.y0 - h - 1, neon[3]); C.setC(mx + 1, top.y0 - h - 1, neon[1]); }); }
  if (P.dish) { const m = mods[1] || mods[0]; const r = u(P.dish * 0.5), dx = m.x0 + r + 1, dy = m.y0 - r + 1;
    C.feature(() => { for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) { const d = Math.sqrt(xx * xx + yy * yy); if (d > r + 0.4) continue; C.setT(dx + xx, dy + yy, silver, d > r - 0.8 ? 1 : (xx + yy) < 0 ? 5 : 3); } C.setT(dx, dy, neon[3] === undefined ? silver : iron, 1); C.setC(dx, dy, neon[3]); for (let k = 1; k <= r; k++) C.setT(dx, dy - k, iron, 2); }); }

  // ---- 4. drill head (miners): bronze cone with silver rings ----
  if (P.drill) { const r0 = u(0.9) + P.drill, h = u(1.2) + P.drill * 2; C.feature(() => { for (let k = 0; k < h; k++) { const r = Math.max(1, Math.round(r0 * k / h)); for (let xx = -r; xx <= r; xx++) C.setT(cx + xx, top.y0 - h + k, k % 3 === 0 ? silver : bronze, xx < -r * 0.3 ? 4 : xx > r * 0.4 ? 2 : 3); } }); }

  // ---- 5. thrusters: iron nozzles with a bronze ring, blue plumes ----
  const bot = mods[mods.length - 1];
  const spacing = Math.max(4, Math.floor((bot.x1 - bot.x0 - 2) / P.thr));
  for (let i = 0; i < P.thr; i++) { const tx = bot.x0 + 2 + Math.floor(spacing * (i + 0.5)); const ew = Math.max(3, spacing - 2), ex0 = tx - Math.floor(ew / 2);
    C.feature(() => { for (let yy = bot.y1 - 4; yy < bot.y1; yy++) for (let xx = ex0; xx < ex0 + ew; xx++) C.setT(xx, yy, (xx === ex0 || xx === ex0 + ew - 1 || yy === bot.y1 - 4) ? bronze : iron, (xx === ex0 || yy === bot.y1 - 4) ? 4 : 1); });
    const plumeH = u(2.2), cxm = ex0 + ew / 2;
    for (let yy = bot.y1; yy < bot.y1 + plumeH; yy++) { const t = (yy - bot.y1) / plumeH, hw = (ew / 2 - 0.5) * (1 - t * 0.55); for (let xx = Math.ceil(cxm - hw - 1); xx <= Math.floor(cxm + hw); xx++) { const d = Math.abs(xx + 0.5 - cxm) / Math.max(1, hw); C.setC(xx, yy, d > 0.95 || t > 0.9 ? plume[0] : d > 0.7 || t > 0.72 ? plume[1] : d > 0.45 || t > 0.5 ? plume[2] : d > 0.25 || t > 0.3 ? plume[3] : plume[4]); } }
  }

  C.mirror();

  // ---- 6. robot arms (both sides, different poses -- not mirrored): shoulder disc, two silver segments, bronze joints, two-prong claw ----
  const arm = (sx, sy, dir, len, pose) => C.feature(() => {
    const seg = (x0, y0, x1, y1, th) => C.line(x0, y0, x1, y1, (px, py) => { for (let w = -Math.floor(th / 2); w <= Math.floor(th / 2); w++) { C.setT(px, py + w, silver, w < 0 ? 4 : w === Math.floor(th / 2) ? 1 : 3); if (th >= 4 && w === 0) C.setT(px, py + w, iron, 2); } });
    const joint = (x, y, r) => { for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r + 1) C.setT(x + xx, y + yy, bronze, (xx + yy) < 0 ? 4 : (xx + yy) > r ? 1 : 3); C.setC(x, y, neon[3]); if (r >= 2) C.setC(x - 1, y, neon[1]); };
    const ex = sx + dir * Math.round(len * 0.55), ey = sy + Math.round(len * (pose === 0 ? 0.15 : 0.45));
    const wx = ex + dir * Math.round(len * 0.45), wy = ey + Math.round(len * (pose === 0 ? -0.35 : 0.1));
    seg(sx, sy, ex, ey, 5); seg(ex, ey, wx, wy, 3); joint(sx, sy, 3); joint(ex, ey, 3); joint(wx, wy, 2);
    // claw: two 2-px prongs
    C.line(wx, wy, wx + dir * 4, wy - 4, (px, py) => { C.setT(px, py, iron, 3); C.setT(px, py + 1, iron, 1); }); C.line(wx, wy, wx + dir * 4, wy + 4, (px, py) => { C.setT(px, py, iron, 3); C.setT(px, py - 1, iron, 4); });
    C.setC(wx + dir * 4, wy - 4, neon[3]); C.setC(wx + dir * 4, wy + 4, neon[3]);
  });
  const armMods = mods.slice(1, -1).length ? mods.slice(1, -1) : mods;
  for (let side of [-1, 1]) for (let i = 0; i < P.arms; i++) {
    const m = armMods[Math.min(armMods.length - 1, Math.floor(i * armMods.length / P.arms))];
    const sy = m.y0 + Math.round((m.y1 - m.y0) * (0.3 + 0.4 * rng.next()));
    const sx = side < 0 ? m.x0 + 1 : m.x1 - 1;
    arm(sx, sy, side, u(P.armLen), rng.int(0, 1));
  }

  const px = C.finish({ grain: 0.1, rampAt: (x, y) => { const c = C.buf[C.idx(x, y)]; return silver.includes(c) ? silver : bronze.includes(c) ? bronze : iron.includes(c) ? iron : red; }, glows: [plume, neon], out: OUT, seed });
  return { W, H, px, bodyY0: mods[0].y0, bodyY1: mods[mods.length - 1].y1 };
}


// ======================================================================
// Hull registry + browser wrapper
// ======================================================================
const MIRROR = {
  swarm_needle: 'fighter', swarm_stalk: 'scout', swarm_grub: 'shuttle', swarm_bloat: 'freighter', swarm_mantis: 'frigate',
  swarm_matriarch: 'capital', swarm_borer: 'prospector', swarm_gnasher: 'excavator', swarm_mawqueen: 'leviathan',
  synod_sprocket: 'fighter', synod_dowser: 'scout', synod_tender: 'shuttle', synod_ledger: 'freighter', synod_caliper: 'frigate',
  synod_orrery: 'capital', synod_auger: 'prospector', synod_mattock: 'excavator', synod_anvilcrown: 'leviathan',
};
// Player hull grids / display sizes (shipRenderer.HULL_SHAPES) -- copied,
// not imported, so this module has no dependency on shipRenderer (which
// imports us).
const PLAYER_GRID = {
  fighter: [5, 9, 5], scout: [7, 18, 7], shuttle: [11, 14, 8], freighter: [13, 22, 10], frigate: [17, 11, 10],
  capital: [19, 32, 14], prospector: [9, 12, 9], excavator: [13, 18, 12], leviathan: [17, 24, 16],
};
const ENGINE_GLOW = { swarm: '#5ef0a8', synod: '#4ac8ff' };

export const ALIEN_HULLS = {};
for (const [id, mirror] of Object.entries(MIRROR)) {
  const faction = id.startsWith('swarm_') ? 'swarm' : 'synod';
  const [gridW, gridH, ds] = PLAYER_GRID[mirror];
  ALIEN_HULLS[id] = {
    id, faction, mirror, gridW, gridH,
    displaySize: Math.round(ds * (faction === 'swarm' ? 1.15 : 1.0)),
    palette: { engine: ENGINE_GLOW[faction], hull: [0x50, 0x40, 0x60], armor: [0x40, 0x30, 0x50], accent: ENGINE_GLOW[faction] },
  };
}
export const isAlienHull = (hullId) => !!ALIEN_HULLS[hullId];

const spriteCache = new Map();
function renderSprite(hullId) {
  const hit = spriteCache.get(hullId);
  if (hit) return hit;
  const h = ALIEN_HULLS[hullId];
  if (!h) return null;
  const variant = hashStr(hullId) % 4;
  const sp = h.faction === 'swarm' ? renderHive(h.mirror, null, variant) : renderForge(h.mirror, null, variant);
  spriteCache.set(hullId, sp);
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

const ICON_TRAIL = 0.6; // trail kept below the body in system-view icons (fraction of body height)
const iconCache = new Map();
// System-view icon: scaled so the body height ~= displaySize * 1.25
// (tentacles / arms trail beyond that). Same return shape as getShipIcon.
export function getAlienShipIcon(hullId) {
  const hit = iconCache.get(hullId);
  if (hit) return hit;
  const sp = renderSprite(hullId);
  if (!sp) return null;
  const h = ALIEN_HULLS[hullId];
  const bodyH = Math.max(1, sp.bodyY1 - sp.bodyY0);
  const s = Math.min(1, (h.displaySize * 1.25) / bodyH);
  const native = spriteToCanvas(sp);
  // Crop the trail (tentacles / plumes) to ICON_TRAIL x body height so a
  // Swarm icon in the system view is not twice as tall as its body; the
  // full sprite still shows in getAlienShipImage (target panel, cards).
  const cropH = Math.min(sp.H, Math.round(sp.bodyY1 + bodyH * ICON_TRAIL));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(sp.W * s)); c.height = Math.max(1, Math.ceil(cropH * s));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = s < 1; // smooth only when shrinking (keeps thin outlines readable)
  ctx.drawImage(native, 0, 0, sp.W, cropH, 0, 0, c.width, c.height);
  const result = { dataUrl: c.toDataURL(), width: c.width, height: c.height };
  iconCache.set(hullId, result);
  return result;
}

const imageCache = new Map();
// Larger art (target panel, bounty cards): native pixels x scale, crisp.
export function getAlienShipImage(hullId, scale = 2) {
  const key = `${hullId}|${scale}`;
  const hit = imageCache.get(key);
  if (hit) return hit;
  const sp = renderSprite(hullId);
  if (!sp) return null;
  const native = spriteToCanvas(sp);
  const c = document.createElement('canvas');
  c.width = sp.W * scale; c.height = sp.H * scale;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(native, 0, 0, c.width, c.height);
  const result = { dataUrl: c.toDataURL(), width: c.width, height: c.height };
  imageCache.set(key, result);
  return result;
}
