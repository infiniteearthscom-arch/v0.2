// pixelArt/portrait.js -- procedural NPC portraits, 64x64 (v3, 2026-10-06).
//
// Rewritten for a retro sci-fi sprite look (owner: "more pixel arty, like
// Retro Diffusion sprites"). The rules this follows:
//   * one dark 1-px outline around the whole bust, selective interior lines
//   * every material shades from a 5-step ramp (outline / deep / shadow /
//     base / light) with hue-shifted shadows (cooler) and lights (warmer)
//   * cel bands quantised from a lambert term, a 2-px checker dither only
//     at the base/shadow boundary
//   * key light upper-left, cool rim light down the right edge
//   * big readable eyes (5x3 socket, iris, pupil, catchlight), 2-px brows
//   * sci-fi gear: flight helmets with visors, headsets with a mic LED,
//     HUD monocles, high collars with a glowing chest strip, pauldrons
//   * calm background: stepped diagonal, faint scanlines, holo ring, corner
//     brackets like an ID card
// Two races as before: human and cyborg (steel plating, glowing optics,
// respirator grille, cables, rust cowl). Same seed + role = same face.

import { bakeSheet } from '../spriteBake.js';

export const PORTRAIT_PX = 64;
const PX = PORTRAIT_PX;
const cache = new Map();

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() { let t = (this.s += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
  chance(p) { return this.next() < p; }
}

// ---- colour: hex <-> rgb, hsl ramps ----
const hex = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// 5-step ramp: 0 outline, 1 deep shadow, 2 shadow, 3 base, 4 light.
// Shadows swing toward blue/purple, lights toward yellow -- the retro cel look.
// Shadows blend toward a cool navy-purple, lights toward warm cream -- the
// classic pixel-art ramp. Blending (not HSL maths) keeps light skin from
// turning salmon in the shadow steps.
const COOL = [34, 22, 58], WARM = [255, 242, 208];
const ramp = (h, { shade = 1, light = 1 } = {}) => {
  const b = typeof h === 'string' ? hex(h) : h;
  return [
    mix(mix(b, COOL, 0.86), [0, 0, 0], 0.25),
    mix(b, COOL, 0.58 * shade),
    mix(b, COOL, 0.32 * shade),
    b,
    mix(b, WARM, 0.32 * light),
  ];
};
const skinRamp = (h) => ramp(h, { shade: 0.95, light: 0.9 });

export const ROLE_STYLE = {
  vendor:     { bg: ['#141008', '#2e2410'], collar: '#b8862a', accent: '#fbbf24', title: 'Quartermaster',     cyborg: 0.35 },
  broker:     { bg: ['#061a22', '#0a303c'], collar: '#1a7f96', accent: '#22d3ee', title: 'Contract Broker',   cyborg: 0.3 },
  refiner:    { bg: ['#160e06', '#30200c'], collar: '#8a5424', accent: '#f59e0b', title: 'Refinery Chief',    cyborg: 0.7 },
  dockmaster: { bg: ['#0e1216', '#1e262e'], collar: '#56687a', accent: '#a0b8cc', title: 'Dockmaster',        cyborg: 0.5 },
  scientist:  { bg: ['#06160e', '#0c2e22'], collar: '#268256', accent: '#4ade80', title: 'Research Liaison',  cyborg: 0.6 },
  pirate:     { bg: ['#160606', '#301010'], collar: '#8a2626', accent: '#ef4444', title: 'Pirate Captain',    cyborg: 0.45 },
  commander:  { bg: ['#080e1c', '#14243e'], collar: '#2a4a8a', accent: '#60a5fa', title: 'Fleet Commander',   cyborg: 0.25 },
  instructor: { bg: ['#061a22', '#0a303c'], collar: '#1c6498', accent: '#22d3ee', title: 'Flight Instructor', cyborg: 0.2 },
  guide:      { bg: ['#100620', '#22103e'], collar: '#6a2aaa', accent: '#aa66ff', title: 'Guild Contact',     cyborg: 0.4 },
  envoy:      { bg: ['#06160e', '#0c2e22'], collar: '#268256', accent: '#4ade80', title: 'Faction Envoy',     cyborg: 0.3 },
};
const SKIN_HUMAN = ['#f2cfae', '#e6b48c', '#d49a68', '#bd7a48', '#95562c', '#683a1c', '#f6dbc6', '#b4845c'];
const SKIN_CYBORG = ['#b2aeb4', '#a29ea6', '#c4bcb8', '#8c8890', '#cbc3bb'];
const HAIR = ['#1a1a20', '#2e1f14', '#5a3a22', '#8b5a2b', '#b8894a', '#dcc48e', '#8c8c94', '#e8e8ec', '#c0392b', '#2c5fbf', '#7a3fb0', '#1f8a6a', '#e07a2a', '#d14a8a'];
const IRIS = ['#3a2a1a', '#2f6b3a', '#2f4d9a', '#6a4a20', '#22a5b8', '#8a5ad8', '#5a6a7a', '#c08a20'];
const LENS = ['#ff3b3b', '#ff7a1f', '#3bff7a', '#3bd8ff', '#ffd23b'];

// materials (mask ids)
const M = { BG: 0, SKIN: 1, HAIR: 2, GARB: 3, STEEL: 4, HOOD: 5, GEAR: 6, GLASS: 7 };

export function getPortrait(seedStr, role = 'vendor') {
  const key = `v3|${role}|${seedStr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = new Rng(hashStr(`${role}|${seedStr}`));
  const st = ROLE_STYLE[role] || ROLE_STYLE.vendor;
  const race = rng.chance(st.cyborg) ? 'cyborg' : 'human';

  // ---- palette ----
  const R = {
    skin: race === 'cyborg' ? ramp(rng.pick(SKIN_CYBORG), { shade: 0.8 }) : skinRamp(rng.pick(SKIN_HUMAN)),
    hair: ramp(rng.pick(HAIR)),
    garb: ramp(st.collar),
    steel: ramp('#8a96a4'),
    hood: ramp(rng.pick(['#8e2a2a', '#9a3426', '#6e1e22'])),
    gear: ramp(rng.pick(['#3a4048', '#2c3238', '#4a5058'])),
    brass: ramp('#c9a24a'),
  };
  const accent = hex(st.accent), accentL = mix(accent, [255, 255, 255], 0.55), accentD = mix(accent, [0, 0, 0], 0.5);
  const iris = hex(rng.pick(IRIS));
  const lens = hex(rng.pick(LENS));
  const bg0 = hex(st.bg[0]), bg1 = hex(st.bg[1]);
  const OUT = [10, 8, 16]; // universal outline

  // ---- geometry ----
  const cx = 32, cy = 25;
  const headW = rng.int(12, 14), headH = rng.int(14, 16);
  const jaw = rng.pick(['round', 'square', 'narrow', 'round']);
  const eyeY = cy + 2, eyeGap = rng.int(5, 6);
  const browTilt = rng.pick([-1, 0, 0, 1]);          // -1 angry, 1 worried
  const mouthStyle = rng.pick(['flat', 'smile', 'frown', 'flat', 'smirk', 'open']);
  const chinY = cy + headH;
  const shoulderY = chinY + 5;

  // ---- wardrobe rolls ----
  let hairStyle = 'short', gear = 'none';
  if (race === 'human') {
    hairStyle = role === 'pirate'
      ? rng.pick(['short', 'mohawk', 'long', 'undercut', 'bald', 'ponytail', 'swept'])
      : rng.pick(['short', 'long', 'bald', 'bun', 'undercut', 'curly', 'ponytail', 'swept', 'buzz', 'short', 'long']);
    const gearPool = {
      instructor: ['helmet', 'headset', 'headset', 'none'], commander: ['helmet', 'headset', 'none', 'none'],
      dockmaster: ['headset', 'headset', 'cap', 'none'], scientist: ['monocle', 'monocle', 'goggles', 'none'],
      broker: ['monocle', 'none', 'none', 'headset'], vendor: ['cap', 'none', 'none', 'headset'],
      pirate: ['bandana', 'bandana', 'patch', 'none', 'goggles'], guide: ['hood', 'hood', 'none', 'monocle'],
      envoy: ['none', 'none', 'cap'], refiner: ['goggles', 'goggles', 'cap', 'none'],
    };
    gear = rng.pick(gearPool[role] || ['none', 'headset', 'cap']);
  }
  const marks = {
    scar: rng.chance(role === 'pirate' ? 0.5 : 0.12),
    beard: race === 'human' && rng.chance(role === 'pirate' ? 0.55 : 0.28),
    beardStyle: rng.pick(['stubble', 'full', 'goatee']),
    tattoo: rng.chance(role === 'pirate' ? 0.4 : 0.1),
    earring: rng.chance(0.3),
    side: rng.int(0, 1),
  };
  const cyb = {
    cowl: race === 'cyborg' && rng.chance(0.65),
    plating: race === 'cyborg' ? rng.pick(['half_left', 'half_right', 'lower', 'skull', 'brow', 'none']) : 'none',
    optics: race === 'cyborg' ? rng.pick(['left', 'right', 'both', 'both', 'mono']) : 'none',
    grille: race === 'cyborg' && rng.chance(0.55),
    cables: race === 'cyborg' ? rng.int(1, 3) : 0,
    port: race === 'cyborg' && rng.chance(0.6),
  };

  const sheet = bakeSheet({
    fw: PX, fh: PX, frames: 1, extra: { px: PX, race },
    paintFrame: (f, put) => {
      // colour buffer + material mask; everything composes here, then one
      // outline / rim pass, then a single blit.
      const col = new Array(PX * PX).fill(null);
      const mat = new Uint8Array(PX * PX);
      const idx = (x, y) => y * PX + x;
      const inB = (x, y) => x >= 0 && y >= 0 && x < PX && y < PX;
      const set = (x, y, c, m) => { if (!inB(x, y)) return; col[idx(x, y)] = c; if (m != null) mat[idx(x, y)] = m; };
      const paint = (x, y, c) => { if (inB(x, y)) col[idx(x, y)] = c; };
      const getM = (x, y) => (inB(x, y) ? mat[idx(x, y)] : M.BG);
      const rect = (x0, y0, x1, y1, c, m) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c, m); };
      const line = (x0, y0, x1, y1, c, m) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c, m); };

      // head span table: half-width per row, rounded -- pixel-art curves
      // come out cleaner from spans than from testing an ellipse per pixel.
      const span = new Map();
      for (let y = cy - headH; y <= chinY; y++) {
        const t = (y + 0.5 - cy) / headH;
        let hw = headW * Math.sqrt(Math.max(0, 1 - t * t));
        if (t > 0) {
          if (jaw === 'narrow') hw *= 1 - 0.32 * t * t;
          if (jaw === 'square') hw = t < 0.75 ? Math.max(hw, headW * (1 - 0.18 * t)) : hw;
          if (jaw === 'round') hw *= 1 - 0.1 * t * t;
        }
        span.set(y, Math.max(1, Math.round(hw)));
      }
      const inHead = (x, y) => { const hw = span.get(y); return hw != null && Math.abs(x + 0.5 - cx) <= hw; };

      // ---- background ----
      for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
        const t = (x + y * 0.55) / (PX * 1.55);
        let c = t < 0.42 ? bg0 : t < 0.72 ? mix(bg0, bg1, 0.5) : bg1;
        if ((t > 0.40 && t < 0.44) || (t > 0.70 && t < 0.74)) c = ((x + y) & 1) ? mix(bg0, bg1, t < 0.5 ? 0.5 : 1) : (t < 0.5 ? bg0 : mix(bg0, bg1, 0.5));
        if (y % 4 === 3) c = mix(c, [0, 0, 0], 0.18); // scanline
        set(x, y, c, M.BG);
      }
      // holo ring behind the head + soft fill
      for (let y = 0; y < shoulderY; y++) for (let x = 0; x < PX; x++) {
        const nx = (x + 0.5 - cx) / (headW + 7), ny = (y + 0.5 - cy) / (headH + 6), r = nx * nx + ny * ny;
        if (r <= 1) paint(x, y, mix(col[idx(x, y)], accent, 0.07));
        if (r > 0.86 && r <= 1) paint(x, y, mix(col[idx(x, y)], accent, ((x + y) & 1) ? 0.42 : 0.2));
      }
      // corner brackets (ID card)
      for (let i = 0; i < 5; i++) { paint(1 + i, 1, accentD); paint(1, 1 + i, accentD); paint(PX - 2 - i, 1, accentD); paint(PX - 2, 1 + i, accentD); paint(1 + i, PX - 2, accentD); paint(1, PX - 2 - i, accentD); paint(PX - 2 - i, PX - 2, accentD); paint(PX - 2, PX - 2 - i, accentD); }

      // ---- garment: shoulders, collar, chest ----
      const isRobe = race === 'cyborg' && cyb.cowl;
      const G = isRobe ? R.hood : R.garb;
      for (let y = shoulderY; y < PX; y++) {
        const t = y - shoulderY;
        const half = Math.min(31, 7 + t * 2.1 + (t > 2 ? 2 : 0));
        for (let x = 0; x < PX; x++) {
          const dx = x + 0.5 - cx;
          if (Math.abs(dx) > half) continue;
          let tone = 3;
          if (t <= 1) tone = 4;                                         // top highlight
          else if (dx > half * 0.55) tone = 2;                           // right shoulder in shadow
          else if (dx < -half * 0.6) tone = 4;                           // left shoulder catches light
          if (Math.abs(dx) < 6 && t > 2) tone = 2;                       // chest V shadow
          if (Math.abs(dx) < 2 && t > 3) tone = 1;
          if (isRobe && ((t + Math.floor(Math.abs(dx) / 5)) % 6 === 0) && Math.abs(dx) > 6) tone = 2; // folds
          set(x, y, G[tone], M.GARB);
        }
      }
      // pauldron edge lines + glowing chest strip
      for (let t = 3; t < 8; t++) { set(cx - 7 - Math.round(t * 2.1), shoulderY + t, G[1], M.GARB); set(cx + 6 + Math.round(t * 2.1), shoulderY + t, G[1], M.GARB); }
      if (!isRobe) {
        for (let y = shoulderY + 4; y < PX - 2; y++) { set(cx - 1, y, accent, M.GARB); set(cx, y, accentL, M.GARB); set(cx + 1, y, accent, M.GARB); if (y % 3 === 0) { set(cx - 2, y, mix(G[3], accent, 0.4), M.GARB); set(cx + 2, y, mix(G[3], accent, 0.4), M.GARB); } }
        // rank pips on the left breast
        const pips = role === 'commander' ? 3 : role === 'instructor' || role === 'dockmaster' ? 2 : 1;
        for (let i = 0; i < pips; i++) { rect(cx - 15 + i * 3, shoulderY + 9, cx - 14 + i * 3, shoulderY + 10, accentL, M.GARB); }
      } else {
        // brass cog on the robe
        const gx = cx - 13, gy = shoulderY + 11;
        for (let a = 0; a < 8; a++) set(gx + Math.round(3.5 * Math.cos(a * Math.PI / 4)), gy + Math.round(3.5 * Math.sin(a * Math.PI / 4)), R.brass[3], M.GEAR);
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 4) set(gx + x, gy + y, x * x + y * y <= 1 ? R.brass[1] : R.brass[3], M.GEAR);
      }
      // high collar
      for (let y = shoulderY - 2; y <= shoulderY + 2; y++) for (let x = cx - 8; x <= cx + 7; x++) { if (Math.abs(x + 0.5 - cx) > 5 + (y - shoulderY + 2)) continue; set(x, y, G[y === shoulderY - 2 ? 4 : x < cx - 2 ? 3 : 2], M.GARB); }
      set(cx - 1, shoulderY, G[1], M.GARB); set(cx, shoulderY, G[1], M.GARB);

      // ---- neck ----
      for (let y = chinY - 2; y < shoulderY - 1; y++) for (let x = cx - 4; x <= cx + 3; x++) set(x, y, R.skin[x > cx + 1 || y > chinY ? 2 : 3], M.SKIN);

      // ---- head: cel shading from a lambert term ----
      const L = [-0.38, -0.42, 0.82];
      for (let y = cy - headH; y <= chinY; y++) for (let x = cx - headW - 1; x <= cx + headW + 1; x++) {
        if (!inHead(x, y)) continue;
        const nx = (x + 0.5 - cx) / headW, ny = (y + 0.5 - cy) / headH;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const d = nx * L[0] + ny * L[1] + nz * L[2];
        let tone = d > 0.86 ? 4 : d > 0.5 ? 3 : d > 0.22 ? 2 : 1;
        if (tone === 3 && d < 0.55 && ((x + y) & 1)) tone = 2;           // dither band
        if (tone === 4 && d < 0.9 && ((x + y) & 1)) tone = 3;
        if (y >= chinY - 1) tone = Math.min(tone, 1);                     // under-chin
        set(x, y, R.skin[tone], M.SKIN);
      }
      // ears
      for (let y = cy - 1; y <= cy + 3; y++) { set(cx - headW - 1, y, R.skin[3], M.SKIN); set(cx - headW - 2, y, R.skin[y === cy - 1 ? 4 : 3], M.SKIN); set(cx + headW + 1, y, R.skin[2], M.SKIN); set(cx + headW + 2, y, R.skin[2], M.SKIN); }
      set(cx - headW - 1, cy + 1, R.skin[2], M.SKIN); set(cx + headW + 1, cy + 1, R.skin[1], M.SKIN);
      if (marks.earring) { set(cx + headW + 2, cy + 4, R.brass[3], M.GEAR); set(cx + headW + 2, cy + 5, R.brass[4], M.GEAR); }

      // ---- cyborg plating ----
      const plate = (test) => { for (let y = cy - headH; y <= chinY; y++) for (let x = cx - headW - 2; x <= cx + headW + 2; x++) { if (!inHead(x, y) || !test(x, y)) continue; const nx = (x + 0.5 - cx) / headW; let tone = nx < -0.35 ? 4 : nx > 0.45 ? 2 : 3; if (y >= chinY - 1) tone = 1; if ((x % 6 === 0) && (y % 6 === 0)) tone = Math.max(1, tone - 1); set(x, y, R.steel[tone], M.STEEL); } };
      if (cyb.plating === 'half_left') plate((x) => x < cx - 1);
      if (cyb.plating === 'half_right') plate((x) => x > cx + 1);
      if (cyb.plating === 'lower') plate((x, y) => y > cy + 5);
      if (cyb.plating === 'skull') plate(() => true);
      if (cyb.plating === 'brow') plate((x, y) => y < cy - 4);
      if (cyb.plating !== 'none') {
        const pts = cyb.plating === 'half_left' ? [[cx - 1, cy - 8], [cx - 1, cy - 1], [cx - 1, cy + 6], [cx - 1, cy + 12]]
          : cyb.plating === 'half_right' ? [[cx + 2, cy - 8], [cx + 2, cy - 1], [cx + 2, cy + 6], [cx + 2, cy + 12]]
          : cyb.plating === 'lower' ? [[cx - 8, cy + 6], [cx - 3, cy + 6], [cx + 3, cy + 6], [cx + 8, cy + 6]]
          : cyb.plating === 'brow' ? [[cx - 8, cy - 5], [cx, cy - 5], [cx + 8, cy - 5]] : [[cx - 9, cy - 6], [cx + 9, cy - 6], [cx, cy + 12]];
        for (const [x, y] of pts) if (inHead(x, y)) set(x, y, R.brass[2], M.STEEL);
      }
      if (cyb.port) { rect(cx + headW - 5, cy - 7, cx + headW - 2, cy - 4, R.steel[1], M.STEEL); set(cx + headW - 4, cy - 6, lens, M.STEEL); set(cx + headW - 3, cy - 6, mix(lens, [255, 255, 255], 0.5), M.STEEL); }

      // ---- eyes ----
      const lx = cx - eyeGap, rx = cx + eyeGap;
      const eye = (ex, closedLid = false) => {
        // socket shadow, white, iris, pupil, catchlight, lids
        rect(ex - 2, eyeY - 1, ex + 2, eyeY + 1, [244, 244, 248], M.SKIN);
        rect(ex - 1, eyeY - 1, ex + 1, eyeY + 1, iris, M.SKIN);
        set(ex, eyeY, [8, 8, 12], M.SKIN); set(ex, eyeY + 1, mix(iris, [8, 8, 12], 0.5), M.SKIN);
        set(ex - 1, eyeY - 1, [255, 255, 255], M.SKIN);
        for (let x = ex - 3; x <= ex + 3; x++) set(x, eyeY - 2, OUT, M.SKIN);           // upper lid
        set(ex - 3, eyeY - 1, OUT, M.SKIN); set(ex + 3, eyeY - 1, OUT, M.SKIN);
        for (let x = ex - 2; x <= ex + 2; x++) set(x, eyeY + 2, R.skin[2], M.SKIN);      // lower lid
        set(ex - 3, eyeY + 1, R.skin[2], M.SKIN); set(ex + 3, eyeY, R.skin[2], M.SKIN);
        if (closedLid) rect(ex - 2, eyeY - 1, ex + 2, eyeY - 1, OUT, M.SKIN);
      };
      const optic = (ex, big = false) => {
        const r = big ? 4 : 3;
        for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
          const d = x * x + y * y;
          if (d > (r + 1) * (r + 1)) continue;
          const c = d <= 1 ? [255, 255, 255] : d <= (r - 1) * (r - 1) ? lens : d <= r * r ? R.brass[2] : R.steel[1];
          set(ex + x, eyeY + y, c, M.STEEL);
        }
        set(ex - 1, eyeY - 1, mix(lens, [255, 255, 255], 0.7), M.STEEL);
        // bloom
        for (const [dx, dy] of [[-r - 2, 0], [r + 2, 0], [0, -r - 2], [0, r + 2]]) if (getM(ex + dx, eyeY + dy) !== M.BG) paint(ex + dx, eyeY + dy, mix(col[idx(ex + dx, eyeY + dy)], lens, 0.45));
      };
      if (race === 'human') { eye(lx); eye(rx); }
      else if (cyb.optics === 'mono') optic(cx, true);
      else { if (cyb.optics === 'left' || cyb.optics === 'both') optic(lx); else eye(lx); if (cyb.optics === 'right' || cyb.optics === 'both') optic(rx); else eye(rx); }
      // brows: 2 px thick, tilt gives the expression
      if (race === 'human' || cyb.plating === 'none' || cyb.plating === 'lower') {
        const bc = race === 'human' ? R.hair[1] : R.skin[1];
        for (let i = -3; i <= 3; i++) {
          const dyL = browTilt === -1 ? (i > 0 ? -1 : 0) : browTilt === 1 ? (i < 0 ? -1 : 0) : 0;
          const dyR = browTilt === -1 ? (i < 0 ? -1 : 0) : browTilt === 1 ? (i > 0 ? -1 : 0) : 0;
          set(lx + i, eyeY - 4 + dyL, bc, M.SKIN); set(lx + i, eyeY - 5 + dyL, bc, M.SKIN);
          set(rx + i, eyeY - 4 + dyR, bc, M.SKIN); set(rx + i, eyeY - 5 + dyR, bc, M.SKIN);
        }
      }

      // ---- nose: right-side shadow + nostrils ----
      const ny0 = cy + 6;
      for (let y = ny0 - 2; y <= ny0 + 1; y++) set(cx + 1, y, R.skin[2], M.SKIN);
      set(cx + 2, ny0 + 1, R.skin[2], M.SKIN); set(cx - 1, ny0 + 2, R.skin[1], M.SKIN); set(cx + 1, ny0 + 2, R.skin[1], M.SKIN); set(cx, ny0 + 2, R.skin[2], M.SKIN);
      set(cx - 1, ny0 - 1, R.skin[4], M.SKIN);

      // ---- mouth / grille ----
      const my = cy + 10;
      if (race === 'cyborg' && cyb.grille) {
        rect(cx - 6, my - 2, cx + 6, my + 3, R.steel[3], M.STEEL);
        for (let x = cx - 5; x <= cx + 5; x += 2) line(x, my - 1, x, my + 2, R.steel[1], M.STEEL);
        rect(cx - 6, my - 2, cx + 6, my - 2, R.steel[4], M.STEEL); set(cx - 7, my, R.brass[3], M.STEEL); set(cx + 7, my, R.brass[3], M.STEEL);
      } else {
        const lip = R.skin[1], lipL = mix(R.skin[3], [220, 120, 120], race === 'human' ? 0.35 : 0.1);
        if (mouthStyle === 'flat') { line(cx - 3, my, cx + 3, my, lip, M.SKIN); line(cx - 2, my + 1, cx + 2, my + 1, lipL, M.SKIN); }
        else if (mouthStyle === 'smile') { set(cx - 4, my - 1, lip, M.SKIN); line(cx - 3, my, cx + 3, my, lip, M.SKIN); set(cx + 4, my - 1, lip, M.SKIN); line(cx - 2, my + 1, cx + 2, my + 1, lipL, M.SKIN); }
        else if (mouthStyle === 'frown') { set(cx - 4, my + 1, lip, M.SKIN); line(cx - 3, my, cx + 3, my, lip, M.SKIN); set(cx + 4, my + 1, lip, M.SKIN); }
        else if (mouthStyle === 'open') { rect(cx - 3, my, cx + 3, my + 1, lip, M.SKIN); rect(cx - 2, my, cx + 2, my, [240, 240, 244], M.SKIN); }
        else { line(cx - 3, my, cx + 2, my, lip, M.SKIN); set(cx + 3, my - 1, lip, M.SKIN); line(cx - 2, my + 1, cx + 1, my + 1, lipL, M.SKIN); }
      }

      // ---- facial hair / marks ----
      if (marks.beard) {
        for (let y = my - 1; y <= chinY; y++) for (let x = cx - headW; x <= cx + headW; x++) {
          if (!inHead(x, y)) continue;
          const nx = (x + 0.5 - cx) / headW;
          const on = marks.beardStyle === 'stubble' ? ((x * 7 + y * 3) % 4 === 0) : marks.beardStyle === 'goatee' ? Math.abs(nx) < 0.3 && y >= my + 2 : (y >= my + 2 || Math.abs(nx) > 0.5);
          if (on && !(y <= my + 1 && Math.abs(nx) < 0.4)) set(x, y, R.hair[((x + y) & 1) ? 2 : 3], M.HAIR);
        }
      }
      if (marks.scar) { const sx = marks.side ? cx + 4 : cx - 9; for (let i = 0; i < 6; i++) { set(sx + i, cy - 5 + i, mix(R.skin[1], [200, 70, 70], 0.5), M.SKIN); if (i % 2) set(sx + i + 1, cy - 5 + i, R.skin[4], M.SKIN); } }
      if (marks.tattoo) { const tx = marks.side ? cx + headW - 5 : cx - headW + 3; for (let i = 0; i < 5; i++) set(tx + (i % 2), cy - 2 + i * 2, accent, M.SKIN); set(tx + 1, cy - 4, accent, M.SKIN); }

      // ---- cyborg cables + cowl ----
      if (race === 'cyborg') {
        const starts = [[cx + headW - 1, cy - 2], [cx + headW - 3, cy + 9], [cx - headW + 2, cy + 10]];
        for (let i = 0; i < cyb.cables; i++) {
          const [sx, sy] = starts[i], dir = sx > cx ? 1 : -1;
          const ex = cx + dir * (13 + i * 3), ey = shoulderY + 4 + i * 2, mid = [sx + dir * 6, sy + 8];
          line(sx, sy, mid[0], mid[1], R.gear[1], M.GEAR); line(mid[0], mid[1], ex, ey, R.gear[1], M.GEAR);
          line(sx, sy - 1, mid[0], mid[1] - 1, R.gear[3], M.GEAR);
          rect(sx - 1, sy - 1, sx + 1, sy + 1, R.brass[2], M.GEAR); set(sx, sy, R.brass[4], M.GEAR);
          rect(ex - 1, ey - 1, ex + 1, ey + 1, R.steel[1], M.GEAR);
        }
        if (cyb.cowl) {
          for (let y = cy - headH - 6; y < shoulderY + 1; y++) for (let x = cx - headW - 8; x <= cx + headW + 8; x++) {
            const nx = (x + 0.5 - cx) / (headW + 7), ny = (y + 0.5 - cy + 2) / (headH + 7);
            const inner = inHead(x, y) || (y > chinY - 2 && Math.abs(x + 0.5 - cx) < headW - 3);
            if (nx * nx + ny * ny <= 1 && !inner) {
              const sx = (x + 0.5 - cx) / headW, sy = (y + 0.5 - cy) / headH;
              const near = sx * sx + sy * sy < 1.15;
              set(x, y, R.hood[near ? 1 : x < cx - 3 ? 4 : x > cx + 4 ? 2 : 3], M.HOOD);
            }
          }
          for (let x = cx - 5; x <= cx + 5; x++) set(x, cy - headH - 5, R.hood[4], M.HOOD);
        }
      }

      // ---- human hair ----
      const top = cy - headH;
      const H = R.hair;
      const hairTone = (x, y, base = 3) => { let t = x < cx - 4 ? 4 : x > cx + 5 ? 2 : base; if ((x * 3 + y) % 7 === 0) t = Math.max(1, t - 1); return H[t]; };
      const cap = (y0, y1, extra) => { for (let y = y0; y <= y1; y++) for (let x = cx - headW - extra; x <= cx + headW + extra; x++) { const nx = (x + 0.5 - cx) / (headW + extra), ny = (y + 0.5 - cy - 1) / (headH + extra + 1); if (nx * nx + ny * ny <= 1) set(x, y, hairTone(x, y), M.HAIR); } };
      const sideburns = (yEnd) => { for (let y = top + 6; y < yEnd; y++) { set(cx - headW - 1, y, H[3], M.HAIR); set(cx - headW, y, H[3], M.HAIR); set(cx + headW, y, H[2], M.HAIR); set(cx + headW + 1, y, H[2], M.HAIR); } };
      if (race === 'human') switch (hairStyle) {
        case 'short': cap(top - 4, top + 7, 2); sideburns(cy); for (let x = cx - 7; x <= cx + 3; x++) set(x, top + 8, H[2], M.HAIR); for (let x = cx - 9; x <= cx - 6; x++) set(x, top + 9, H[2], M.HAIR); break;
        case 'buzz': for (let y = top - 1; y <= top + 5; y++) for (let x = cx - headW; x <= cx + headW; x++) { const nx = (x + 0.5 - cx) / headW, ny = (y + 0.5 - cy) / headH; if (nx * nx + ny * ny <= 1 && ((x + y) & 1)) set(x, y, H[2], M.HAIR); } break;
        case 'undercut': cap(top - 4, top + 4, 0); for (let x = cx - headW + 3; x <= cx + 1; x++) { set(x, top - 4, H[3], M.HAIR); set(x, top - 5, H[4], M.HAIR); } break;
        case 'swept': cap(top - 4, top + 6, 2); sideburns(cy - 1); for (let i = 0; i < 8; i++) { set(cx - headW + 2 + i, top + 6 + Math.floor(i / 3), H[i % 3 ? 3 : 4], M.HAIR); } for (let i = 0; i < 4; i++) set(cx + 4 + i, top - 3 - (i > 1 ? 1 : 0), H[4], M.HAIR); break;
        case 'long': cap(top - 4, top + 7, 2); for (let y = top + 6; y < chinY + 9; y++) for (let k = 1; k <= 3; k++) { set(cx - headW - k, y, H[k === 3 ? 2 : 3], M.HAIR); set(cx + headW + k, y, H[k === 1 ? 3 : 2], M.HAIR); } break;
        case 'curly': for (let y = top - 4; y <= top + 7; y++) for (let x = cx - headW - 3; x <= cx + headW + 3; x++) { const nx = (x + 0.5 - cx) / (headW + 3), ny = (y + 0.5 - cy) / (headH + 3); if (nx * nx + ny * ny <= 1 && !inHead(x, y + 3) && ((x * 3 + y * 5) % 4 !== 0)) set(x, y, H[((x + y) & 1) ? 3 : 2], M.HAIR); } break;
        case 'bun': cap(top - 3, top + 6, 1); for (let y = top - 7; y < top - 1; y++) for (let x = cx - 3; x <= cx + 3; x++) set(x, y, H[x < cx ? 4 : 3], M.HAIR); break;
        case 'ponytail': cap(top - 4, top + 7, 2); for (let y = top + 4; y < chinY + 8; y++) { set(cx + headW + 2, y, H[3], M.HAIR); set(cx + headW + 3, y, H[2], M.HAIR); } break;
        case 'mohawk': for (let y = top - 8; y < top + 3; y++) for (let x = cx - 2; x <= cx + 2; x++) set(x, y, H[x < cx ? 4 : x > cx ? 2 : 3], M.HAIR); break;
        case 'bald': default: for (let x = cx - 5; x <= cx - 2; x++) set(x, top + 2, R.skin[4], M.SKIN); break;
      }

      // ---- sci-fi gear ----
      const Gr = R.gear;
      if (gear === 'helmet') {
        // dome in the garment colour, visor band over the eyes, chin guard
        for (let y = top - 4; y <= cy + 8; y++) for (let x = cx - headW - 3; x <= cx + headW + 3; x++) {
          const nx = (x + 0.5 - cx) / (headW + 2.5), ny = (y + 0.5 - cy) / (headH + 3);
          if (nx * nx + ny * ny > 1) continue;
          const isVisor = y >= eyeY - 4 && y <= eyeY + 3 && Math.abs(nx) < 0.92;
          if (isVisor) { const vt = (x - (cx - headW)) / (headW * 2); set(x, y, vt < 0.25 && y < eyeY ? accentL : ((x + y * 2) % 11 === 0) ? accent : mix(accentD, [10, 12, 20], 0.6), M.GLASS); }
          else set(x, y, R.garb[y < top + 2 ? 4 : nx < -0.4 ? 4 : nx > 0.5 ? 2 : 3], M.GEAR);
        }
        rect(cx - 2, top - 3, cx + 1, top - 1, accent, M.GEAR); // crest light
      } else if (gear === 'headset') {
        for (let x = cx - headW - 1; x <= cx + headW + 1; x++) { const ny = top - 2 + Math.round(((x - cx) / headW) ** 2 * 3); set(x, ny, Gr[3], M.GEAR); set(x, ny + 1, Gr[1], M.GEAR); }
        rect(cx - headW - 3, cy - 2, cx - headW, cy + 4, Gr[3], M.GEAR); rect(cx - headW - 2, cy - 1, cx - headW - 1, cy + 3, Gr[2], M.GEAR); set(cx - headW - 2, cy, Gr[4], M.GEAR);
        line(cx - headW - 2, cy + 4, cx - 6, cy + 11, Gr[1], M.GEAR); set(cx - 5, cy + 11, accent, M.GEAR); set(cx - 4, cy + 11, accentL, M.GEAR);
      } else if (gear === 'monocle') {
        const ex = marks.side ? rx : lx;
        for (let i = -4; i <= 4; i++) { set(ex + i, eyeY - 3, accent, M.GEAR); set(ex + i, eyeY + 3, accent, M.GEAR); }
        for (let i = -2; i <= 2; i++) { set(ex - 4, eyeY + i, accent, M.GEAR); set(ex + 4, eyeY + i, accent, M.GEAR); }
        for (let y = eyeY - 2; y <= eyeY + 2; y++) for (let x = ex - 3; x <= ex + 3; x++) paint(x, y, mix(col[idx(x, y)], accent, 0.3));
        line(ex + (marks.side ? 4 : -4), eyeY - 3, cx + (marks.side ? headW + 1 : -headW - 1), eyeY - 6, Gr[2], M.GEAR);
      } else if (gear === 'goggles') {
        for (let x = cx - headW - 1; x <= cx + headW + 1; x++) { set(x, top + 3, Gr[1], M.GEAR); set(x, top + 4, Gr[3], M.GEAR); set(x, top + 5, Gr[2], M.GEAR); }
        for (const ex of [cx - 5, cx + 5]) { rect(ex - 3, top + 2, ex + 3, top + 6, Gr[1], M.GEAR); rect(ex - 2, top + 3, ex + 2, top + 5, mix(accentD, [20, 24, 30], 0.5), M.GLASS); set(ex - 2, top + 3, accentL, M.GLASS); }
      } else if (gear === 'cap') {
        for (let y = top - 3; y <= top + 4; y++) for (let x = cx - headW - 2; x <= cx + headW + 2; x++) { const nx = (x + 0.5 - cx) / (headW + 2), ny = (y + 0.5 - cy) / (headH + 2); if (nx * nx + ny * ny <= 1) set(x, y, R.garb[y < top ? 4 : nx > 0.4 ? 2 : 3], M.GEAR); }
        for (let x = cx - headW - 3; x <= cx + 4; x++) { set(x, top + 5, R.garb[1], M.GEAR); set(x, top + 6, R.garb[1], M.GEAR); }
        rect(cx - 2, top, cx + 1, top + 2, accent, M.GEAR);
      } else if (gear === 'hood') {
        for (let y = top - 6; y < shoulderY + 1; y++) for (let x = cx - headW - 8; x <= cx + headW + 8; x++) {
          const nx = (x + 0.5 - cx) / (headW + 7), ny = (y + 0.5 - cy + 2) / (headH + 7);
          if (nx * nx + ny * ny <= 1 && !inHead(x, y) && !(y > chinY - 2 && Math.abs(x + 0.5 - cx) < headW - 3)) {
            const sx = (x + 0.5 - cx) / headW, sy = (y + 0.5 - cy) / headH;
            set(x, y, R.garb[sx * sx + sy * sy < 1.15 ? 1 : x < cx - 3 ? 4 : x > cx + 4 ? 2 : 3], M.HOOD);
          }
        }
      } else if (gear === 'bandana') {
        const B = ramp('#c0392b');
        for (let y = top - 2; y <= top + 4; y++) for (let x = cx - headW - 1; x <= cx + headW + 1; x++) { const nx = (x + 0.5 - cx) / (headW + 1), ny = (y + 0.5 - cy) / (headH + 1); if (nx * nx + ny * ny <= 1) set(x, y, B[x < cx - 3 ? 4 : x > cx + 4 ? 2 : 3], M.GEAR); }
        for (let x = cx - headW - 1; x <= cx + headW + 1; x++) if (inHead(x, top + 5)) set(x, top + 5, B[1], M.GEAR);
        for (let y = top + 3; y < top + 11; y++) { set(cx + headW + 2, y, B[3], M.GEAR); set(cx + headW + 3, y + 1, B[2], M.GEAR); }
      } else if (gear === 'patch') {
        const ex = marks.side ? rx : lx;
        rect(ex - 3, eyeY - 2, ex + 3, eyeY + 2, Gr[1], M.GEAR); rect(ex - 2, eyeY - 1, ex + 1, eyeY + 1, Gr[2], M.GEAR);
        line(ex - 3, eyeY - 2, cx - headW, top + 5, OUT, M.GEAR); line(ex + 3, eyeY - 2, cx + headW, top + 5, OUT, M.GEAR);
      }

      // ---- outline + interior lines + rim light ----
      const outlineOf = (m) => (m === M.SKIN ? R.skin[0] : m === M.HAIR ? R.hair[0] : m === M.GARB ? G[0] : m === M.STEEL ? R.steel[0] : m === M.HOOD ? R.hood[0] : OUT);
      const final = col.slice();
      for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
        const m = mat[idx(x, y)];
        if (m === M.BG) continue;
        const nb = [getM(x - 1, y), getM(x + 1, y), getM(x, y - 1), getM(x, y + 1)];
        if (nb.includes(M.BG)) { final[idx(x, y)] = mix(outlineOf(m), OUT, 0.5); continue; }
        // selective interior lines: hair / hood / gear / steel against skin
        const hard = (a, b) => (a !== b) && ((a === M.SKIN && (b === M.HAIR || b === M.HOOD || b === M.GEAR || b === M.STEEL || b === M.GLASS)) || (a === M.SKIN && b === M.GARB && y < shoulderY - 1));
        if (hard(m, nb[2]) || hard(m, nb[0])) final[idx(x, y)] = R.skin[1];
        if ((m === M.HAIR || m === M.HOOD || m === M.GEAR) && (nb[3] === M.SKIN)) final[idx(x, y)] = outlineOf(m);
      }
      // rim light: right-hand silhouette edge, one pixel in
      for (let y = 2; y < PX - 6; y++) for (let x = 1; x < PX - 1; x++) {
        const m = mat[idx(x, y)];
        if (m === M.BG || m === M.GLASS) continue;
        if (getM(x + 1, y) === M.BG && getM(x + 2, y) === M.BG && getM(x - 1, y) !== M.BG) final[idx(x - 1, y)] = mix(final[idx(x - 1, y)], accentL, 0.55);
        if (getM(x, y - 1) === M.BG && getM(x + 1, y - 1) === M.BG && x > cx && getM(x, y + 1) !== M.BG) final[idx(x, y + 1)] = mix(final[idx(x, y + 1)], accentL, 0.35);
      }
      for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) put(0, x, y, final[idx(x, y)], 255);
    },
  });
  cache.set(key, sheet);
  return sheet;
}

// ---- names + cast (unchanged from v2) ----
const SYL_A = ['Ka', 'Vor', 'Tal', 'Mi', 'Ren', 'Sa', 'Ori', 'Dex', 'Lu', 'Hal', 'Zen', 'Bri', 'Ashe', 'Nik', 'Tam', 'Jov', 'Ely', 'Rho', 'Cass', 'Ibo', 'Mar', 'Ori', 'Sef', 'Ada'];
const SYL_B = ['ra', 'en', 'ik', 'os', 'ael', 'um', 'ith', 'ar', 'ey', 'ok', 'ia', 'ul', 'an', 'es', 'ov', 'ix', 'ine', 'ett'];
const SURN = ['Vance', 'Okoro', 'Reyes', 'Halvorsen', 'Tanaka', 'Mbeki', 'Ashby', 'Kowal', 'Ferreira', 'Dagny', 'Sato', 'Quill', 'Marchetti', 'Ndlovu', 'Brandt', 'Oyelaran', 'Ives', 'Tarrant', 'Zhou', 'Kessler', 'Adeyemi', 'Voss', 'Lindqvist', 'Castellan'];
const CYBORG_DESIG = ['Magos', 'Adept', 'Enginseer', 'Lexmechanic', 'Logis', 'Genetor', 'Artisan'];
const CYBORG_SUFFIX = ['-7', '-13', '-Theta', '-Ix', '-Null', '-Sigma', '-22', '-Kappa'];
export function npcName(seedStr, race = null) {
  const rng = new Rng(hashStr(`name|${seedStr}`));
  if (race === 'cyborg') return `${rng.pick(CYBORG_DESIG)} ${rng.pick(SURN)}${rng.pick(CYBORG_SUFFIX)}`;
  return `${rng.pick(SYL_A)}${rng.pick(SYL_B)} ${rng.pick(SURN)}`;
}
const LINES = {
  vendor: ['Best prices this side of the gate. Probably.', 'Everything is in stock. Everything is negotiable. Nothing is free.', 'Buy, sell, don\'t loiter.'],
  broker: ['Freight moves. Pilots move it. I take my cut.', 'The board refreshes on the hour. So do my expectations.', 'Contested loads pay better for a reason.'],
  refiner: ['Feed it slag, get back ore. The fee keeps the lights on.', 'Higher grade in, higher grade out. Physics, not magic.', 'Bring the Metallurgy papers and I\'ll push the cap.'],
  dockmaster: ['Berth fees are waived. Repairs are not.', 'Keep your wingmen off my landing lanes.', 'Fleet manifest, then dock. Not the other way around.'],
  scientist: ['Every data vault you crack ends up on my desk. Keep them coming.', 'Research is slow. Signatures are faster.', 'Bring me relics and I\'ll bring you tiers.'],
  pirate: ['You brought a fleet. Good. I like an audience.', 'Your cargo is spoken for.', 'Turn around. Last courtesy you get.'],
  commander: ['Clear the sector and we\'ll talk about your next command.', 'The core worlds hold because pilots like you fly out.'],
  instructor: ['Throttle, heading, dock. In that order, cadet.', 'Nobody remembers their first haul. Everybody remembers their first pod.'],
  guide: ['Rumours are currency out here. I pay well.', 'Deeper regions, deeper pockets.'],
  envoy: ['Our faction remembers its friends.', 'Standing is earned one contract at a time.'],
};
const CYBORG_LINES = ['The flesh is a rounding error.', 'Praise the machine; tolerate the pilot.', 'Your ship\'s spirit is displeased with its maintenance.', 'Efficiency is a form of worship.', 'I have logged your arrival. Twice.'];
export function npcLine(role, seedStr, race = null) {
  const rng = new Rng(hashStr(`line|${role}|${seedStr}`));
  if (race === 'cyborg' && rng.chance(0.5)) return rng.pick(CYBORG_LINES);
  return rng.pick(LINES[role] || LINES.vendor);
}
// Race is decided inside getPortrait (seeded); expose it for names/lines.
export function npcRace(seedStr, role) { return getPortrait(seedStr, role).race; }
export function stationCast(systemId, bodyName, { isStation = true } = {}) {
  const base = `${systemId}|${String(bodyName).toLowerCase()}`;
  const roles = isStation ? ['vendor', 'broker', 'dockmaster', 'refiner'] : ['vendor', 'refiner', 'scientist', 'dockmaster'];
  return roles.map(role => {
    const seed = `${base}|${role}`;
    const race = npcRace(seed, role);
    return { role, seed, race, name: npcName(seed, race), title: (ROLE_STYLE[role] || ROLE_STYLE.vendor).title, line: npcLine(role, seed, race) };
  });
}
export const questGiverFor = (category) => ({ tutorial: 'instructor', main: 'commander', side: 'guide', faction: 'envoy' }[category] || 'commander');
