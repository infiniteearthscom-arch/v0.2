// pixelArt/portrait.js -- procedural NPC portraits (2026-09-24).
//
// 32x32 pixel-art bust from a seed string + a role. Layered slots:
// background (role palette) -> shoulders/collar -> head (species skin,
// shape) -> hair/headgear -> eyes/brow/mouth -> marks (scar, cyber eye,
// tattoo, beard). Same seed = same face forever, so a station's vendor
// or a named pirate captain is recognisable. Baked once, cached.
//
// Also: seeded names and the per-station cast (stationCast) so the
// NPC tab, vendor header and contract broker all agree on who's who.

import { bakeSheet } from '../spriteBake.js';

const PX = 32;
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

// Role palettes: [bg dark, bg light, collar, accent]
export const ROLE_STYLE = {
  vendor:     { bg: ['#1a1408', '#3a2c10'], collar: '#c9962a', accent: '#fbbf24', title: 'Quartermaster' },
  broker:     { bg: ['#06202a', '#0c3a48'], collar: '#1c8ea6', accent: '#22d3ee', title: 'Contract Broker' },
  refiner:    { bg: ['#1a1208', '#3a2810'], collar: '#8a5a2a', accent: '#f59e0b', title: 'Refinery Chief' },
  dockmaster: { bg: ['#101418', '#242c34'], collar: '#5a6a7a', accent: '#a0b0c0', title: 'Dockmaster' },
  scientist:  { bg: ['#081a12', '#10382a'], collar: '#2a8a5a', accent: '#4ade80', title: 'Research Liaison' },
  pirate:     { bg: ['#1a0808', '#3a1010'], collar: '#8a2a2a', accent: '#ef4444', title: 'Pirate Captain' },
  commander:  { bg: ['#0a1020', '#182a4a'], collar: '#2a4a8a', accent: '#60a5fa', title: 'Fleet Commander' },
  instructor: { bg: ['#06202a', '#0c3a48'], collar: '#1c6ea6', accent: '#22d3ee', title: 'Flight Instructor' },
  guide:      { bg: ['#14082a', '#28104a'], collar: '#6a2aaa', accent: '#aa66ff', title: 'Guild Contact' },
  envoy:      { bg: ['#081a12', '#10382a'], collar: '#2a8a5a', accent: '#4ade80', title: 'Faction Envoy' },
};
const SKIN = {
  human: ['#f1c9a5', '#e0ac7e', '#c68642', '#8d5524', '#5c3a1e', '#f5d7c0'],
  synth: ['#9aa5b1', '#7c8a99', '#b0c4d8'],
  exo:   ['#7fbf7f', '#8a7fd8', '#d87fa8', '#6fc9c9'],
};
const HAIR = ['#1a1a1a', '#3a2a1a', '#6a4a2a', '#a07a3a', '#d8c090', '#c0c0c0', '#e04040', '#4060e0', '#e0e0e0'];
const EYE = ['#2a2a2a', '#3a6a3a', '#3a4a8a', '#6a3a1a', '#22d3ee', '#aa66ff'];

export function getPortrait(seedStr, role = 'vendor') {
  const key = `${role}|${seedStr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = new Rng(hashStr(`${role}|${seedStr}`));
  const st = ROLE_STYLE[role] || ROLE_STYLE.vendor;
  const species = role === 'pirate' ? rng.pick(['human', 'human', 'human', 'exo']) : rng.pick(['human', 'human', 'human', 'synth', 'exo']);
  const skin = hex(rng.pick(SKIN[species]));
  const skinD = shade(skin, 0.72), skinL = shade(skin, 1.15);
  const hair = hex(rng.pick(HAIR));
  const hairD = shade(hair, 0.7);
  const eye = hex(rng.pick(EYE));
  const collar = hex(st.collar), collarD = shade(collar, 0.65);
  const bg0 = hex(st.bg[0]), bg1 = hex(st.bg[1]);
  const headW = rng.int(5, 7);            // half-width
  const headH = rng.int(7, 8);            // half-height
  const cx = 16, cy = 14;
  const hairStyle = species === 'synth' ? rng.pick(['bald', 'cap', 'visor']) :
    role === 'pirate' ? rng.pick(['short', 'mohawk', 'bandana', 'long', 'helmet']) :
    role === 'scientist' || role === 'guide' ? rng.pick(['short', 'long', 'hood', 'bun']) :
    role === 'dockmaster' ? rng.pick(['cap', 'helmet', 'short', 'bald']) :
    rng.pick(['short', 'long', 'bald', 'bun', 'cap']);
  const marks = {
    scar: (role === 'pirate' ? rng.chance(0.6) : rng.chance(0.12)),
    cyber: (species === 'synth' ? true : role === 'pirate' ? rng.chance(0.35) : rng.chance(0.08)),
    beard: species === 'human' && rng.chance(role === 'pirate' ? 0.6 : 0.3),
    tattoo: role === 'pirate' ? rng.chance(0.4) : rng.chance(0.1),
    glasses: role === 'scientist' || role === 'broker' ? rng.chance(0.5) : rng.chance(0.1),
  };
  const mouth = rng.pick(['flat', 'smile', 'frown', 'flat']);
  const cyberSide = rng.int(0, 1);

  const sheet = bakeSheet({
    fw: PX, fh: PX, frames: 1, extra: { px: PX },
    paintFrame: (f, put) => {
      // background: vertical gradient + checker dither
      for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
        const t = y / PX; const d = ((x + y) & 1) ? 0.04 : -0.04;
        const c = bg0.map((v, i) => Math.round(v + (bg1[i] - v) * (1 - t + d)));
        put(0, x, y, c);
      }
      // shoulders + collar (rows 23..31)
      for (let y = 23; y < PX; y++) {
        const half = 6 + (y - 23) * 1.4;
        for (let x = 0; x < PX; x++) {
          if (Math.abs(x + 0.5 - cx) <= half) put(0, x, y, (y === 23 || Math.abs(x + 0.5 - cx) > half - 1.5) ? collarD : collar);
        }
      }
      // neck
      for (let y = 20; y < 24; y++) for (let x = cx - 2; x < cx + 2; x++) put(0, x, y, skinD);
      // head ellipse with left highlight / right shade
      for (let y = cy - headH; y <= cy + headH; y++) for (let x = cx - headW; x <= cx + headW; x++) {
        const nx = (x + 0.5 - cx) / headW, ny = (y + 0.5 - cy) / headH;
        const r = nx * nx + ny * ny;
        if (r > 1) continue;
        const edge = r > 0.78;
        put(0, x, y, edge ? skinD : nx < -0.35 && ny < 0 ? skinL : nx > 0.45 ? skinD : skin);
      }
      // hair / headgear
      const top = cy - headH;
      const hairRow = (y, extra = 0) => { for (let x = cx - headW - extra; x <= cx + headW + extra; x++) { const nx = (x + 0.5 - cx) / (headW + extra); if (nx * nx <= 1) put(0, x, y, x < cx ? hair : hairD); } };
      if (hairStyle === 'short' || hairStyle === 'long' || hairStyle === 'bun') {
        for (let y = top; y < top + 3; y++) hairRow(y, 1);
        for (let y = top + 3; y < top + 5; y++) { put(0, cx - headW - 1, y, hair); put(0, cx - headW, y, hair); put(0, cx + headW, y, hairD); put(0, cx + headW + 1, y, hairD); }
        if (hairStyle === 'long') for (let y = top + 5; y < cy + headH + 4; y++) { put(0, cx - headW - 1, y, hair); put(0, cx - headW - 2, y, hair); put(0, cx + headW + 1, y, hairD); put(0, cx + headW + 2, y, hairD); }
        if (hairStyle === 'bun') for (let y = top - 3; y < top; y++) for (let x = cx - 2; x <= cx + 2; x++) put(0, x, y, hair);
      } else if (hairStyle === 'mohawk') {
        for (let y = top - 4; y < top + 2; y++) for (let x = cx - 1; x <= cx + 1; x++) put(0, x, y, x < cx ? hair : hairD);
      } else if (hairStyle === 'cap') {
        for (let y = top - 1; y < top + 3; y++) hairRow(y, 1);
        for (let x = cx - headW - 1; x <= cx + 2; x++) put(0, x, top + 3, collarD);
      } else if (hairStyle === 'helmet') {
        const hc = hex('#6a7a8a'), hcD = hex('#465260');
        for (let y = top - 2; y < cy + 1; y++) for (let x = cx - headW - 1; x <= cx + headW + 1; x++) { const nx = (x + 0.5 - cx) / (headW + 1); if (nx * nx <= 1) put(0, x, y, x < cx ? hc : hcD); }
        for (let x = cx - headW; x <= cx + headW; x++) put(0, x, cy - 1, hex(st.accent));
      } else if (hairStyle === 'visor') {
        for (let x = cx - headW; x <= cx + headW; x++) { put(0, x, cy - 1, hex(st.accent)); put(0, x, cy, shade(hex(st.accent), 0.6)); }
      } else if (hairStyle === 'hood') {
        const hc = hex(st.collar), hcD = shade(hc, 0.6);
        for (let y = top - 2; y < cy + headH; y++) for (let x = cx - headW - 2; x <= cx + headW + 2; x++) {
          const nx = (x + 0.5 - cx) / (headW + 2), ny = (y + 0.5 - cy) / (headH + 2);
          const inside = (x + 0.5 - cx) / headW, insideY = (y + 0.5 - cy) / headH;
          if (nx * nx + ny * ny <= 1 && inside * inside + insideY * insideY > 0.9) put(0, x, y, x < cx ? hc : hcD);
        }
      } else if (hairStyle === 'bandana') {
        for (let y = top; y < top + 3; y++) hairRow(y, 1);
        for (let x = cx - headW - 1; x <= cx + headW + 1; x++) put(0, x, top + 2, hex('#e04040'));
      }
      // eyes, brows
      const ey = cy + 1, lx = cx - 3, rx = cx + 2;
      const drawEye = (x, cyber) => {
        if (cyber) { put(0, x, ey, hex(species === 'synth' ? '#22d3ee' : '#ef4444')); put(0, x + 1, ey, hex('#111')); put(0, x, ey - 1, hex('#333')); put(0, x + 1, ey - 1, hex('#333')); }
        else { put(0, x, ey, hex('#f4f4f4')); put(0, x + 1, ey, eye); }
        put(0, x, ey - 2, hairD); put(0, x + 1, ey - 2, hairD);
      };
      drawEye(lx, marks.cyber && cyberSide === 0); drawEye(rx, marks.cyber && cyberSide === 1);
      if (marks.glasses) {
        for (let x = lx - 1; x <= rx + 2; x++) {
          const bridge = x === cx || x === cx - 1, rim = x === lx - 1 || x === rx + 2;
          put(0, x, ey, bridge ? hex('#888888') : rim ? hex('#aaaaaa') : hex(x % 2 ? '#c8dcff' : '#a0c0ff'));
        }
      }
      // nose
      put(0, cx, cy + 3, skinD);
      // mouth
      const my = cy + 5;
      if (mouth === 'flat') for (let x = cx - 1; x <= cx + 1; x++) put(0, x, my, skinD);
      else if (mouth === 'smile') { put(0, cx - 2, my - 1, skinD); put(0, cx - 1, my, skinD); put(0, cx, my, skinD); put(0, cx + 1, my, skinD); put(0, cx + 2, my - 1, skinD); }
      else { put(0, cx - 2, my + 1, skinD); put(0, cx - 1, my, skinD); put(0, cx, my, skinD); put(0, cx + 1, my, skinD); put(0, cx + 2, my + 1, skinD); }
      // beard
      if (marks.beard) for (let y = my + 1; y <= cy + headH; y++) for (let x = cx - headW + 1; x <= cx + headW - 1; x++) { const nx = (x + 0.5 - cx) / headW, ny = (y + 0.5 - cy) / headH; if (nx * nx + ny * ny <= 0.95 && ((x + y) & 1)) put(0, x, y, hairD); }
      // scar
      if (marks.scar) { const sx = cx + (cyberSide ? -5 : 2); for (let i = 0; i < 4; i++) put(0, sx + i, cy - 3 + i, hex('#b04a4a')); }
      // tattoo
      if (marks.tattoo) { put(0, cx - headW + 2, cy + 2, hex(st.accent)); put(0, cx - headW + 3, cy + 3, hex(st.accent)); put(0, cx - headW + 2, cy + 4, hex(st.accent)); }
      // outline: darken pixels bordering the background (head + shoulders)
    },
  });
  cache.set(key, sheet);
  return sheet;
}

// ---- names + cast ----
const SYL_A = ['Ka', 'Vor', 'Tal', 'Mi', 'Ren', 'Sa', 'Ori', 'Dex', 'Lu', 'Hal', 'Zen', 'Bri', 'Ashe', 'Nik', 'Tam', 'Jov', 'Ely', 'Rho', 'Cass', 'Ibo'];
const SYL_B = ['ra', 'en', 'ik', 'os', 'ael', 'um', 'ith', 'ar', 'ey', 'ok', 'ia', 'ul', 'an', 'es', 'ov', 'ix'];
const SURN = ['Vance', 'Okoro', 'Reyes', 'Halvorsen', 'Tanaka', 'Mbeki', 'Ashby', 'Kowal', 'Ferreira', 'Dagny', 'Sato', 'Quill', 'Marchetti', 'Ndlovu', 'Brandt', 'Oyelaran', 'Ives', 'Tarrant', 'Zhou', 'Kessler'];
export function npcName(seedStr) {
  const rng = new Rng(hashStr(`name|${seedStr}`));
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
export function npcLine(role, seedStr) {
  const rng = new Rng(hashStr(`line|${role}|${seedStr}`));
  return rng.pick(LINES[role] || LINES.vendor);
}
// The people at a port: stable per (system, station/city).
export function stationCast(systemId, bodyName, { isStation = true } = {}) {
  const base = `${systemId}|${String(bodyName).toLowerCase()}`;
  const roles = isStation ? ['vendor', 'broker', 'dockmaster', 'refiner'] : ['vendor', 'refiner', 'scientist', 'dockmaster'];
  return roles.map(role => {
    const seed = `${base}|${role}`;
    return { role, seed, name: npcName(seed), title: (ROLE_STYLE[role] || ROLE_STYLE.vendor).title, line: npcLine(role, seed) };
  });
}
export const questGiverFor = (category) => ({ tutorial: 'instructor', main: 'commander', side: 'guide', faction: 'envoy' }[category] || 'commander');
