// pixelArt/portrait.js -- procedural NPC portraits, 64x64 (v2, 2026-09-24).
//
// Two races for now:
//   human  -- skin tones, 12 hair styles, eyes with iris + catchlight,
//             brows, noses, mouths, facial hair, scars / freckles /
//             tattoos, glasses, earrings, role collar + insignia.
//   cyborg -- Mechanicus-flavoured augmented humanoids: rust-red cowl,
//             steel face plating (half / lower / full skull), glowing
//             optic lenses, respirator grille, cables from temple and
//             jaw to the collar, brass cog insignia, grey/pale skin.
// Same seed + role = same face forever. Baked once, cached.

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
const hex = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const shade = (c, k) => c.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export const ROLE_STYLE = {
  vendor:     { bg: ['#1a1408', '#3a2c10'], collar: '#c9962a', accent: '#fbbf24', title: 'Quartermaster',     cyborg: 0.35 },
  broker:     { bg: ['#06202a', '#0c3a48'], collar: '#1c8ea6', accent: '#22d3ee', title: 'Contract Broker',   cyborg: 0.3 },
  refiner:    { bg: ['#1a1208', '#3a2810'], collar: '#8a5a2a', accent: '#f59e0b', title: 'Refinery Chief',    cyborg: 0.7 },
  dockmaster: { bg: ['#101418', '#242c34'], collar: '#5a6a7a', accent: '#a0b0c0', title: 'Dockmaster',        cyborg: 0.5 },
  scientist:  { bg: ['#081a12', '#10382a'], collar: '#2a8a5a', accent: '#4ade80', title: 'Research Liaison',  cyborg: 0.6 },
  pirate:     { bg: ['#1a0808', '#3a1010'], collar: '#8a2a2a', accent: '#ef4444', title: 'Pirate Captain',    cyborg: 0.45 },
  commander:  { bg: ['#0a1020', '#182a4a'], collar: '#2a4a8a', accent: '#60a5fa', title: 'Fleet Commander',   cyborg: 0.25 },
  instructor: { bg: ['#06202a', '#0c3a48'], collar: '#1c6ea6', accent: '#22d3ee', title: 'Flight Instructor', cyborg: 0.2 },
  guide:      { bg: ['#14082a', '#28104a'], collar: '#6a2aaa', accent: '#aa66ff', title: 'Guild Contact',     cyborg: 0.4 },
  envoy:      { bg: ['#081a12', '#10382a'], collar: '#2a8a5a', accent: '#4ade80', title: 'Faction Envoy',     cyborg: 0.3 },
};
const SKIN_HUMAN = ['#f3d2b4', '#e8b993', '#d9a06e', '#c17d4a', '#9c5a2e', '#6e3f1f', '#f7dcc8', '#b98a63'];
const SKIN_CYBORG = ['#b9b3b0', '#a8a39f', '#c8c0b8', '#8f8a86', '#d1c9c0'];
const HAIR = ['#141414', '#2e1f14', '#5a3a22', '#8b5a2b', '#b8894a', '#d9c08a', '#8c8c8c', '#e6e6e6', '#c0392b', '#2c5fbf', '#7a3fb0', '#1f8a6a'];
const IRIS = ['#3a2a1a', '#2f6b3a', '#2f4d9a', '#6a4a20', '#22a5b8', '#8a5ad8', '#5a6a7a'];
const STEEL = ['#8a929c', '#9aa3ad', '#6f7882'];
const BRASS = ['#b08a3a', '#c9a24a', '#8a6a2a'];
const RUST = ['#9a2a2a', '#a8342c', '#7a1e1e'];

export function getPortrait(seedStr, role = 'vendor') {
  const key = `v2|${role}|${seedStr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = new Rng(hashStr(`${role}|${seedStr}`));
  const st = ROLE_STYLE[role] || ROLE_STYLE.vendor;
  const race = rng.chance(st.cyborg) ? 'cyborg' : 'human';
  const skin = hex(rng.pick(race === 'cyborg' ? SKIN_CYBORG : SKIN_HUMAN));
  const skinD = shade(skin, 0.74), skinDD = shade(skin, 0.55), skinL = shade(skin, 1.12);
  const hair = hex(rng.pick(HAIR)), hairD = shade(hair, 0.65), hairL = shade(hair, 1.3);
  const iris = hex(rng.pick(IRIS));
  const collar = hex(st.collar), collarD = shade(collar, 0.6), collarL = shade(collar, 1.25);
  const accent = hex(st.accent);
  const bg0 = hex(st.bg[0]), bg1 = hex(st.bg[1]);
  const steel = hex(rng.pick(STEEL)), steelD = shade(steel, 0.6), steelL = shade(steel, 1.25);
  const brass = hex(rng.pick(BRASS)), brassD = shade(brass, 0.6);
  const rust = hex(rng.pick(RUST)), rustD = shade(rust, 0.55), rustL = shade(rust, 1.25);

  // geometry
  const cx = 32, cy = 27;
  const headW = rng.int(11, 14), headH = rng.int(14, 17);
  const jaw = rng.pick(['round', 'square', 'narrow']);
  const eyeY = cy + 1, eyeGap = rng.int(5, 7);
  const noseStyle = rng.pick(['button', 'straight', 'wide']);
  const mouthStyle = rng.pick(['flat', 'smile', 'frown', 'flat', 'smirk']);
  const browThick = rng.int(1, 2);

  // human features
  const hairStyle = race === 'human'
    ? (role === 'pirate' ? rng.pick(['short', 'mohawk', 'bandana', 'long', 'undercut', 'bald', 'ponytail'])
      : rng.pick(['short', 'long', 'bald', 'bun', 'cap', 'undercut', 'curly', 'ponytail', 'sidepart', 'buzz', 'beret', 'hood']))
    : null;
  const marks = {
    scar: rng.chance(role === 'pirate' ? 0.55 : 0.12),
    beard: race === 'human' && rng.chance(role === 'pirate' ? 0.6 : 0.3),
    beardStyle: rng.pick(['stubble', 'full', 'goatee']),
    freckles: race === 'human' && rng.chance(0.25),
    tattoo: rng.chance(role === 'pirate' ? 0.45 : 0.12),
    glasses: rng.chance(role === 'scientist' || role === 'broker' ? 0.45 : 0.1),
    earring: rng.chance(0.3),
    patch: role === 'pirate' && rng.chance(0.25),
  };
  // cyborg features
  const cy_ = {
    cowl: race === 'cyborg' && rng.chance(0.7),
    plating: race === 'cyborg' ? rng.pick(['half_left', 'half_right', 'lower', 'skull', 'brow', 'none']) : 'none',
    optics: race === 'cyborg' ? rng.pick(['left', 'right', 'both', 'both', 'mono']) : 'none',
    grille: race === 'cyborg' && rng.chance(0.55),
    cables: race === 'cyborg' ? rng.int(1, 3) : 0,
    lensColor: hex(rng.pick(['#ff3b3b', '#ff7a1f', '#3bff7a', '#3bd8ff'])),
    templePort: race === 'cyborg' && rng.chance(0.6),
  };
  const scarSide = rng.int(0, 1);

  const sheet = bakeSheet({
    fw: PX, fh: PX, frames: 1, extra: { px: PX, race },
    paintFrame: (f, put) => {
      const P = (x, y, c, a = 255) => { if (x >= 0 && y >= 0 && x < PX && y < PX) put(0, x, y, c, a); };
      const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) P(x, y, c); };
      const line = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) P(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c); };
      const inHead = (x, y) => {
        const nx = (x + 0.5 - cx) / headW; let ny = (y + 0.5 - cy) / headH;
        if (jaw === 'square' && y > cy + headH * 0.35) ny = (y + 0.5 - cy) / (headH * 1.08);
        if (jaw === 'narrow' && y > cy) return nx * nx * (1 + (y - cy) / headH * 0.6) + ny * ny <= 1;
        return nx * nx + ny * ny <= 1;
      };

      // ---- background: gradient + dither + faint role pattern ----
      for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
        const t = y / PX, d = ((x + y) & 1) ? 0.03 : -0.03;
        let c = mix(bg0, bg1, 1 - t + d);
        if (((x - y) % 9 === 0) && x > 40 - y * 0.2) c = mix(c, accent, 0.06);
        P(x, y, c);
      }
      // rim light ring behind the head
      for (let y = cy - headH - 4; y <= cy + headH + 4; y++) for (let x = cx - headW - 6; x <= cx + headW + 6; x++) {
        const nx = (x + 0.5 - cx) / (headW + 5), ny = (y + 0.5 - cy) / (headH + 4);
        const r = nx * nx + ny * ny;
        if (r <= 1 && r > 0.8 && ((x + y) & 1)) P(x, y, mix(bg1, accent, 0.25));
      }

      // ---- shoulders / garment (rows 46..63) ----
      const isRobe = race === 'cyborg' && cy_.cowl;
      for (let y = 46; y < PX; y++) {
        const half = 9 + (y - 46) * 1.55;
        for (let x = 0; x < PX; x++) {
          const dx = x + 0.5 - cx;
          if (Math.abs(dx) > half) continue;
          const base = isRobe ? rust : collar;
          const edge = Math.abs(dx) > half - 2 || y === 46;
          let c = edge ? shade(base, 0.6) : dx < -half * 0.4 ? shade(base, 1.15) : dx > half * 0.5 ? shade(base, 0.8) : base;
          if (isRobe && ((y - 46) % 5 === 0) && Math.abs(dx) < half - 3) c = shade(c, 0.85); // robe folds
          P(x, y, c);
        }
      }
      // collar detail: lapels + insignia / cog
      for (let y = 46; y < 54; y++) { P(cx - 5 + (y - 46), y, collarL); P(cx + 4 - (y - 46), y, collarL); }
      if (race === 'cyborg') {
        // brass cog on the left breast
        const gx = cx - 12, gy = 57;
        for (let a = 0; a < 8; a++) P(gx + Math.round(3.5 * Math.cos(a * Math.PI / 4)), gy + Math.round(3.5 * Math.sin(a * Math.PI / 4)), brass);
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 4) P(gx + x, gy + y, (x * x + y * y <= 1) ? brassD : brass);
      } else {
        // role badge: 3x3 accent chip on the right breast + rank stripes
        rect(cx + 9, 56, cx + 11, 58, accent); P(cx + 10, 57, shade(accent, 1.4));
        for (let i = 0; i < (role === 'commander' ? 3 : role === 'instructor' ? 2 : 1); i++) rect(cx - 14, 56 + i * 2, cx - 9, 56 + i * 2, collarL);
      }

      // ---- neck ----
      rect(cx - 4, cy + headH - 3, cx + 3, 47, skinD);
      rect(cx - 3, cy + headH - 3, cx + 1, 47, skin);

      // ---- head ----
      for (let y = cy - headH; y <= cy + headH + 1; y++) for (let x = cx - headW - 1; x <= cx + headW + 1; x++) {
        if (!inHead(x, y)) continue;
        const nx = (x + 0.5 - cx) / headW, ny = (y + 0.5 - cy) / headH;
        const edgeR = nx * nx + ny * ny;
        let c = skin;
        if (edgeR > 0.86) c = skinD;
        if (nx > 0.45) c = mix(c, skinD, 0.7);
        if (nx < -0.4 && ny < -0.1) c = skinL;
        if (edgeR > 0.86 && nx > 0.3) c = skinDD;
        P(x, y, c);
      }
      // ears
      const earY = cy;
      for (let y = earY - 2; y <= earY + 2; y++) { P(cx - headW - 1, y, skinD); P(cx - headW - 2, y, skin); P(cx + headW + 1, y, skinDD); P(cx + headW + 2, y, skinD); }
      if (marks.earring) { P(cx + headW + 2, earY + 3, brass); P(cx + headW + 2, earY + 4, hex('#ffe08a')); }

      // ---- cyborg plating (before hair/cowl so the cowl frames it) ----
      const plateRegion = (test) => { for (let y = cy - headH; y <= cy + headH + 1; y++) for (let x = cx - headW - 1; x <= cx + headW + 1; x++) if (inHead(x, y) && test(x, y)) { const nx = (x + 0.5 - cx) / headW, ny = (y + 0.5 - cy) / headH; const rim = nx * nx + ny * ny > 0.82; P(x, y, rim ? steelD : (x % 5 === 0 && y % 5 === 0) ? steelL : steel); } };
      if (cy_.plating === 'half_left') plateRegion((x) => x < cx - 1);
      if (cy_.plating === 'half_right') plateRegion((x) => x > cx + 1);
      if (cy_.plating === 'lower') plateRegion((x, y) => y > cy + 4);
      if (cy_.plating === 'skull') plateRegion(() => true);
      if (cy_.plating === 'brow') plateRegion((x, y) => y < cy - 4);
      if (cy_.plating !== 'none') { // rivets along the seam
        const seamPts = cy_.plating === 'half_left' ? [[cx - 1, cy - 8], [cx - 1, cy - 2], [cx - 1, cy + 5], [cx - 1, cy + 11]]
          : cy_.plating === 'half_right' ? [[cx + 2, cy - 8], [cx + 2, cy - 2], [cx + 2, cy + 5], [cx + 2, cy + 11]]
          : cy_.plating === 'lower' ? [[cx - 8, cy + 5], [cx - 3, cy + 5], [cx + 3, cy + 5], [cx + 8, cy + 5]]
          : cy_.plating === 'brow' ? [[cx - 8, cy - 5], [cx, cy - 5], [cx + 8, cy - 5]] : [[cx - 9, cy - 6], [cx + 9, cy - 6], [cx, cy + 12]];
        for (const [x, y] of seamPts) if (inHead(x, y)) P(x, y, brassD);
      }
      if (cy_.templePort) { rect(cx + headW - 4, cy - 6, cx + headW - 2, cy - 4, steelD); P(cx + headW - 3, cy - 5, cy_.lensColor); }

      // ---- eyes ----
      const drawHumanEye = (ex) => {
        rect(ex - 2, eyeY - 1, ex + 2, eyeY + 1, hex('#f4f4f4'));
        P(ex - 3, eyeY, skinDD); P(ex + 3, eyeY, skinDD);
        rect(ex - 1, eyeY - 1, ex + 1, eyeY + 1, iris); P(ex, eyeY, hex('#111')); P(ex - 1, eyeY - 1, hex('#ffffff'));
        for (let x = ex - 3; x <= ex + 3; x++) P(x, eyeY - 2, skinDD); // lid
      };
      const drawOptic = (ex, big = false) => {
        const r = big ? 4 : 3;
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = x * x + y * y; if (d > r * r + 1) continue; P(ex + x, eyeY + y, d <= 1 ? hex('#ffffff') : d <= (r - 1) * (r - 1) ? cy_.lensColor : d <= r * r - 1 ? brass : steelD); }
        P(ex - 1, eyeY - 1, mix(cy_.lensColor, hex('#ffffff'), 0.6));
      };
      const lx = cx - eyeGap, rx = cx + eyeGap;
      if (race === 'human') {
        drawHumanEye(lx); drawHumanEye(rx);
        if (marks.patch) { rect(rx - 3, eyeY - 2, rx + 3, eyeY + 2, hex('#1a1a1a')); line(rx - 3, eyeY - 2, cx + headW, cy - headH + 4, hex('#1a1a1a')); }
      } else if (cy_.optics === 'mono') {
        drawOptic(cx, true);
      } else {
        if (cy_.optics === 'left' || cy_.optics === 'both') drawOptic(lx); else drawHumanEye(lx);
        if (cy_.optics === 'right' || cy_.optics === 'both') drawOptic(rx); else drawHumanEye(rx);
      }
      // brows
      if (race === 'human' || cy_.plating === 'none' || cy_.plating === 'lower') {
        for (let t = 0; t < browThick; t++) { line(lx - 3, eyeY - 4 - t, lx + 3, eyeY - 5 - t, hairD); line(rx - 3, eyeY - 5 - t, rx + 3, eyeY - 4 - t, hairD); }
      }
      if (marks.glasses) {
        for (let x = lx - 4; x <= rx + 4; x++) { if ((x > lx + 3 && x < rx - 3) || x === lx - 4 || x === rx + 4) P(x, eyeY, hex('#c0c8d0')); }
        for (const ex of [lx, rx]) { for (let y = eyeY - 2; y <= eyeY + 2; y++) { P(ex - 4, y, hex('#c0c8d0')); P(ex + 4, y, hex('#c0c8d0')); } for (let x = ex - 3; x <= ex + 3; x++) { P(x, eyeY - 3, hex('#c0c8d0')); P(x, eyeY + 3, hex('#c0c8d0')); P(x, eyeY - 2, mix(hex('#c8dcff'), skin, 0.5)); } }
      }

      // ---- nose ----
      const ny0 = cy + 3;
      if (noseStyle === 'button') { P(cx, ny0 + 2, skinDD); P(cx - 1, ny0 + 2, skinD); P(cx + 1, ny0 + 2, skinD); P(cx, ny0 + 1, skinD); }
      else if (noseStyle === 'straight') { line(cx, ny0 - 2, cx, ny0 + 2, skinD); P(cx - 1, ny0 + 3, skinDD); P(cx + 1, ny0 + 3, skinDD); P(cx + 1, ny0, skinDD); }
      else { rect(cx - 2, ny0 + 2, cx + 2, ny0 + 3, skinD); P(cx - 2, ny0 + 3, skinDD); P(cx + 2, ny0 + 3, skinDD); }

      // ---- mouth / grille ----
      const my = cy + 8;
      if (race === 'cyborg' && cy_.grille) {
        rect(cx - 6, my - 2, cx + 6, my + 3, steel);
        for (let x = cx - 5; x <= cx + 5; x += 2) line(x, my - 1, x, my + 2, steelD);
        rect(cx - 6, my - 2, cx + 6, my - 2, steelL); P(cx - 7, my, brass); P(cx + 7, my, brass);
      } else {
        const lip = mix(skinDD, hex('#8a3a3a'), race === 'human' ? 0.5 : 0.1);
        if (mouthStyle === 'flat') line(cx - 3, my, cx + 3, my, lip);
        else if (mouthStyle === 'smile') { P(cx - 4, my - 1, lip); line(cx - 3, my, cx + 3, my, lip); P(cx + 4, my - 1, lip); line(cx - 2, my + 1, cx + 2, my + 1, mix(lip, skin, 0.5)); }
        else if (mouthStyle === 'frown') { P(cx - 4, my + 1, lip); line(cx - 3, my, cx + 3, my, lip); P(cx + 4, my + 1, lip); }
        else { line(cx - 3, my, cx + 2, my, lip); P(cx + 3, my - 1, lip); }
      }

      // ---- facial hair / marks ----
      if (marks.beard) {
        for (let y = my - 1; y <= cy + headH + 1; y++) for (let x = cx - headW; x <= cx + headW; x++) {
          if (!inHead(x, y)) continue;
          const nx = (x + 0.5 - cx) / headW;
          const on = marks.beardStyle === 'stubble' ? ((x * 7 + y * 3) % 5 === 0) : marks.beardStyle === 'goatee' ? Math.abs(nx) < 0.3 && y >= my + 1 : (y >= my + 1 || Math.abs(nx) > 0.45);
          if (on && !(y === my && Math.abs(nx) < 0.35)) P(x, y, ((x + y) & 1) ? hairD : hair);
        }
      }
      if (marks.scar) { const sx = scarSide ? cx + 4 : cx - 9; for (let i = 0; i < 6; i++) { P(sx + i, cy - 6 + i, mix(skinDD, hex('#c04a4a'), 0.6)); if (i % 2) P(sx + i - 1, cy - 6 + i, skinD); } }
      if (marks.freckles) for (let i = 0; i < 9; i++) { const fx = cx - 8 + (i * 5) % 17, fy = cy + 2 + (i * 3) % 5; if (inHead(fx, fy) && Math.abs(fx - cx) > 2) P(fx, fy, skinD); }
      if (marks.tattoo) { const tx = scarSide ? cx + headW - 5 : cx - headW + 3; for (let i = 0; i < 5; i++) P(tx + (i % 2), cy - 2 + i * 2, accent); P(tx + 1, cy - 4, accent); }

      // ---- cyborg cables + cowl ----
      if (race === 'cyborg') {
        const cableC = hex('#2a2e34'), cableL = hex('#5a626c');
        const starts = [[cx + headW - 2, cy - 3], [cx + headW - 4, cy + 8], [cx - headW + 3, cy + 9]];
        for (let i = 0; i < cy_.cables; i++) {
          const [sx, sy] = starts[i];
          const dir = sx > cx ? 1 : -1;
          const ex = cx + dir * (12 + i * 3), ey = 50 + i * 2;
          const mid = [sx + dir * 6, sy + 8];
          line(sx, sy, mid[0], mid[1], cableC); line(mid[0], mid[1], ex, ey, cableC);
          line(sx, sy - 1, mid[0], mid[1] - 1, cableL);
          rect(sx - 1, sy - 1, sx + 1, sy + 1, brassD); P(sx, sy, brass);
          rect(ex - 1, ey - 1, ex + 1, ey + 1, steelD);
        }
        if (cy_.cowl) {
          for (let y = cy - headH - 6; y < 50; y++) for (let x = cx - headW - 8; x <= cx + headW + 8; x++) {
            const nx = (x + 0.5 - cx) / (headW + 7), ny = (y + 0.5 - cy + 2) / (headH + 7);
            const inner = inHead(x, y) || (y > cy + headH - 2 && Math.abs(x + 0.5 - cx) < headW - 2);
            if (nx * nx + ny * ny <= 1 && !inner) {
              const shadow = (x + 0.5 - cx) / headW, sy = (y + 0.5 - cy) / headH;
              const nearFace = shadow * shadow + sy * sy < 1.12;
              P(x, y, nearFace ? rustD : (x < cx ? rustL : rust));
            }
          }
          for (let x = cx - 4; x <= cx + 4; x++) P(x, cy - headH - 5, rustL); // cowl ridge
        }
      }

      // ---- human hair / headgear ----
      const top = cy - headH;
      const hairBand = (y0, y1, extra, colour = null) => { for (let y = y0; y <= y1; y++) for (let x = cx - headW - extra; x <= cx + headW + extra; x++) { const nx = (x + 0.5 - cx) / (headW + extra), ny = (y + 0.5 - cy) / (headH + extra); if (nx * nx + ny * ny <= 1) P(x, y, colour || (x < cx - 3 ? hairL : x > cx + 5 ? hairD : hair)); } };
      if (race === 'human') switch (hairStyle) {
        case 'short': hairBand(top - 1, top + 5, 1); for (let y = top + 6; y < cy - 2; y++) { P(cx - headW - 1, y, hair); P(cx - headW, y, hair); P(cx + headW, y, hairD); P(cx + headW + 1, y, hairD); } break;
        case 'buzz': for (let y = top - 1; y <= top + 5; y++) for (let x = cx - headW; x <= cx + headW; x++) { const nx = (x + 0.5 - cx) / headW, ny = (y + 0.5 - cy) / headH; if (nx * nx + ny * ny <= 1 && ((x + y) & 1)) P(x, y, hairD); } break;
        case 'undercut': hairBand(top - 2, top + 4, 0); for (let x = cx - headW + 2; x <= cx + 2; x++) P(x, top - 3, hair); break;
        case 'sidepart': hairBand(top - 1, top + 5, 1); for (let y = top + 6; y < cy - 1; y++) { P(cx - headW - 1, y, hair); P(cx - headW, y, hair); } for (let x = cx - headW + 1; x <= cx - 2; x++) P(x, top + 6, hair); break;
        case 'long': hairBand(top - 1, top + 5, 1); for (let y = top + 6; y < cy + headH + 8; y++) { for (let k = 1; k <= 3; k++) { P(cx - headW - k, y, k === 3 ? hairD : hair); P(cx + headW + k, y, k === 1 ? hair : hairD); } } break;
        case 'curly': for (let y = top - 3; y <= top + 7; y++) for (let x = cx - headW - 3; x <= cx + headW + 3; x++) { const nx = (x + 0.5 - cx) / (headW + 3), ny = (y + 0.5 - cy) / (headH + 3); if (nx * nx + ny * ny <= 1 && !inHead(x, y + 3) && ((x * 3 + y * 5) % 4 !== 0)) P(x, y, ((x + y) & 1) ? hair : hairD); } break;
        case 'bun': hairBand(top - 1, top + 5, 1); for (let y = top - 6; y < top - 1; y++) for (let x = cx - 3; x <= cx + 3; x++) P(x, y, x < cx ? hairL : hair); break;
        case 'ponytail': hairBand(top - 1, top + 5, 1); for (let y = top + 4; y < cy + headH + 6; y++) { P(cx + headW + 2, y, hair); P(cx + headW + 3, y, hairD); } break;
        case 'mohawk': for (let y = top - 7; y < top + 3; y++) for (let x = cx - 2; x <= cx + 2; x++) P(x, y, x < cx ? hairL : x > cx ? hairD : hair); break;
        case 'cap': hairBand(top - 2, top + 5, 2, collar); for (let x = cx - headW - 2; x <= cx + 5; x++) { P(x, top + 6, collarD); P(x, top + 7, collarD); } rect(cx - 2, top + 1, cx + 1, top + 3, accent); break;
        case 'beret': hairBand(top - 3, top + 4, 3, collar); for (let x = cx - headW - 3; x <= cx + headW + 3; x++) P(x, top + 5, collarD); P(cx + 2, top - 3, collarL); break;
        case 'bandana': hairBand(top - 1, top + 4, 1, hex('#c0392b')); for (let x = cx - headW - 1; x <= cx + headW + 1; x++) P(x, top + 5, hex('#8a2a1a')); for (let y = top + 3; y < top + 10; y++) { P(cx + headW + 2, y, hex('#c0392b')); P(cx + headW + 3, y + 1, hex('#8a2a1a')); } break;
        case 'hood': for (let y = top - 6; y < 50; y++) for (let x = cx - headW - 8; x <= cx + headW + 8; x++) { const nx = (x + 0.5 - cx) / (headW + 7), ny = (y + 0.5 - cy + 2) / (headH + 7); if (nx * nx + ny * ny <= 1 && !inHead(x, y) && !(y > cy + headH - 2 && Math.abs(x + 0.5 - cx) < headW - 2)) P(x, y, x < cx ? collar : collarD); } break;
        case 'bald': default: for (let x = cx - 4; x <= cx - 1; x++) P(x, top + 2, skinL); break;
      }

      // ---- outline: darken head/garment pixels that touch the background ----
      const isBg = (x, y) => { if (x < 0 || y < 0 || x >= PX || y >= PX) return false; return !inHead(x, y) && y < 46 && !(y >= cy + headH - 3 && Math.abs(x + 0.5 - cx) <= 4); };
      for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
        if (isBg(x, y)) continue;
        if (isBg(x - 1, y) || isBg(x + 1, y) || isBg(x, y - 1) || isBg(x, y + 1)) {
          if (inHead(x, y) || (y >= cy + headH - 3 && y < 46)) P(x, y, mix(skinDD, bg0, 0.45));
        }
      }
    },
  });
  cache.set(key, sheet);
  return sheet;
}

// ---- names + cast ----
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
