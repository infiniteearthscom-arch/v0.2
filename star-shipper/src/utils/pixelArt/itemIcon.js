// pixelArt/itemIcon.js -- procedural 32x32 item icons (v2, 2026-09-24).
//
// Composed, not drawn: a glyph for WHAT it is, tinted by rarity / slot,
// shaded (light upper-left, dark lower-right, dither), outlined, framed
// in the tier colour, with a quality gem. A per-item VARIANT (hash of
// the item id) and the tier change the glyph's details, so two lasers
// or two shields never look the same.

import { bakeSheet } from '../spriteBake.js';
import { tierColor } from '../tiers.js';

export const ICON_PX = 32;
const PX = ICON_PX;
const cache = new Map();
const hex = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const shade = (c, k) => c.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export const SLOT_COLORS = {
  engine: '#ff6622', weapon: '#ff2244', shield: '#8844ff', cargo: '#ddaa22', utility: '#22ccaa',
  reactor: '#00ddff', mining: '#aa66ff', base: '#4ade80', item: '#ffaa00',
};
export const RARITY_COLORS = { common: '#d8dee6', rare: '#4488ff', exotic: '#aa44ff' };
const QUALITY_COLORS = [[20, '#666e78'], [40, '#b0bcc8'], [60, '#44ff44'], [80, '#4488ff'], [101, '#aa44ff']];
const qualityColor = (q) => { for (const [max, c] of QUALITY_COLORS) if (q <= max) return c; return '#aa44ff'; };

const FAMILY_TINT = { smelting: '#f0883e', gas: '#38bdf8', bio: '#4ade80', electronics: '#a78bfa', assembly: '#f5c542', service: '#94a3b8' };
const BASE_BUILDING_GLYPH = [
  [/smelter|forge|foundry/, 'furnace', 'smelting'], [/condenser|separator|isotope|containment|condenser/, 'tank', 'gas'],
  [/bioreactor|kiln|incubator|resin/, 'vat', 'bio'], [/printer|etcher|lathe|capacitor/, 'chip', 'electronics'],
  [/workbench|machine_shop|fabricator|assembler|quantum_forge/, 'bench', 'assembly'], [/repair_shop/, 'wrench', 'service'],
];
export function classify({ kind, slotType, damageType, itemId = '', category, rarity, family, isPart }) {
  const id = String(itemId);
  if (kind === 'resource' && category === 'processed') return { glyph: isPart ? 'part' : 'ingot', tint: FAMILY_TINT[family] || '#94a3b8' };
  if (kind === 'resource') return { glyph: category || 'ore', tint: RARITY_COLORS[rarity] || RARITY_COLORS.common };
  if (/^base_/.test(id)) { for (const [re, glyph, fam] of BASE_BUILDING_GLYPH) if (re.test(id)) return { glyph, tint: FAMILY_TINT[fam] }; }
  if (/sealed_cargo/.test(id)) return { glyph: 'crate_locked', tint: '#4ade80' };
  if (/fuel_cell/.test(id)) return { glyph: 'battery', tint: '#ffaa00' };
  if (/probe/.test(id) && !/launcher/.test(id)) return { glyph: 'capsule', tint: /advanced/.test(id) ? '#8b5cf6' : '#60a5fa' };
  if (/harvester/.test(id)) return { glyph: 'rig', tint: '#ff6622' };
  if (/warhead/.test(id)) return { glyph: 'cone', tint: '#ff2244' };
  if (/armor/.test(id)) return { glyph: 'plate', tint: '#8844ff' };
  if (/repair_nanites/.test(id)) return { glyph: 'cross', tint: '#22ccaa' };
  if (/telemetry/.test(id)) return { glyph: 'antenna', tint: '#22ccaa' };
  if (/probe_launcher/.test(id)) return { glyph: 'tube', tint: '#22d3ee' };
  if (/scanner|systemscan|sensor/.test(id)) return { glyph: 'dish', tint: '#22ccaa' };
  if (/autopilot/.test(id)) return { glyph: 'compass', tint: '#22ccaa' };
  if (/base_cargo_depot/.test(id)) return { glyph: 'depot', tint: '#4ade80' };
  if (/base_refinery/.test(id)) return { glyph: 'flask', tint: '#4ade80' };
  if (/base_research_lab/.test(id)) return { glyph: 'beaker', tint: '#4ade80' };
  const st = slotType || 'item';
  if (st === 'weapon') return { glyph: `weapon_${damageType || (/missile|torpedo/.test(id) ? 'missile' : /cannon|railgun|driver|kinetic|auto/.test(id) ? 'kinetic' : 'laser')}`, tint: SLOT_COLORS.weapon };
  return { glyph: st, tint: SLOT_COLORS[st] || SLOT_COLORS.item };
}

// ---- tiny raster with shading + outline ----
function makeRaster() {
  const grid = Array.from({ length: PX }, () => new Array(PX).fill(null));
  const P = (x, y, c) => { if (x >= 0 && y >= 0 && x < PX && y < PX) grid[y][x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) P(x, y, c); };
  const line = (x0, y0, x1, y1, c, w = 1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); for (let k = 0; k < w; k++) P(x, y + k, c); } };
  const disc = (cx, cy, r, c) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) P(cx + x, cy + y, c); };
  const ring = (cx, cy, r, c, w = 1) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.sqrt(x * x + y * y); if (d <= r + 0.4 && d >= r - w + 0.4) P(cx + x, cy + y, c); } };
  const poly = (pts, c) => { const ys = pts.map(p => p[1]); for (let y = Math.min(...ys); y <= Math.max(...ys); y++) { const xs = []; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0)); } xs.sort((a, b) => a - b); for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) P(x, y, c); } };
  return { grid, P, rect, line, disc, ring, poly };
}

// Palette from a tint: base, light, dark, darker, highlight
const pal = (tint) => { const c = hex(tint); return { c, l: shade(c, 1.35), d: shade(c, 0.6), dd: shade(c, 0.35), h: mix(c, [255, 255, 255], 0.55), m: hex('#4a5560'), mL: hex('#7a8590'), mD: hex('#2a3038') }; };

function drawGlyph(R, glyph, tint, variant, tier) {
  const { P, rect, line, disc, ring, poly } = R;
  const k = pal(tint);
  const v = variant % 3;
  switch (glyph) {
    // ---------------- resources ----------------
    case 'ore': {
      poly([[8, 22], [11, 12], [18, 9], [25, 14], [24, 24], [14, 26]], k.c);
      poly([[11, 12], [18, 9], [19, 16], [12, 18]], k.l); poly([[19, 16], [25, 14], [24, 24], [17, 24]], k.d);
      poly([[8, 22], [12, 18], [17, 24], [14, 26]], k.dd);
      if (v !== 1) { disc(21, 12, 2, k.h); } if (v === 2) { poly([[5, 26], [8, 21], [12, 24], [9, 28]], k.d); }
      break;
    }
    case 'gas': { disc(12, 19, 6, k.d); disc(20, 17, 7, k.c); disc(15, 12, 5, k.l); disc(23, 21, 4, k.d); if (v) disc(9, 13, 3, k.h); for (let i = 0; i < 6; i++) P(10 + i * 3, 25 + (i % 2), k.dd); break; }
    case 'biological': { line(16, 27, 16, 8, k.d, 1); line(15, 27, 15, 9, k.dd); for (let i = 0; i < 4; i++) { const y = 10 + i * 4; poly([[16, y], [9 - i, y + 2], [15, y + 5]], i % 2 ? k.c : k.l); poly([[16, y + 2], [23 + i, y + 4], [17, y + 7]], i % 2 ? k.l : k.c); } if (v) disc(16, 7, 2, k.h); break; }
    case 'energy': { poly([[18, 4], [10, 17], [15, 17], [12, 28], [22, 14], [17, 14]], k.c); poly([[18, 4], [10, 17], [14, 17]], k.l); poly([[15, 17], [12, 28], [16, 20]], k.d); if (v) { ring(16, 16, 12, k.h); } break; }
    case 'exotic': { poly([[16, 3], [19, 13], [29, 16], [19, 19], [16, 29], [13, 19], [3, 16], [13, 13]], k.c); poly([[16, 3], [19, 13], [16, 16], [13, 13]], k.l); poly([[16, 16], [19, 19], [16, 29], [13, 19]], k.d); disc(16, 16, 2, k.h); if (v) { P(6, 6, k.h); P(26, 7, k.h); P(25, 26, k.h); } break; }
    // ---------------- processed materials + base buildings (088) ----------------
    case 'ingot': { // a stacked pair of bars, family-tinted
      poly([[4, 20], [10, 13], [26, 13], [22, 20]], k.c); poly([[4, 20], [10, 13], [12, 13], [6, 20]], k.l); rect(4, 20, 22, 23, k.d); rect(22, 13, 26, 23, k.dd);
      poly([[7, 27], [13, 21], [29, 21], [25, 27]], k.c); poly([[7, 27], [13, 21], [15, 21], [9, 27]], k.l); rect(7, 27, 25, 29, k.d); rect(25, 21, 29, 29, k.dd);
      if (v) { rect(13, 15, 19, 16, k.h); } if (tier >= 4) { P(9, 11, k.h); P(24, 9, k.h); }
      break;
    }
    case 'part': { // a cog with a bright hub -- the craft-only station parts
      ring(16, 16, 9, k.c, 3); for (let a = 0; a < 8; a++) { const x = 16 + Math.round(Math.cos(a * Math.PI / 4) * 11), y = 16 + Math.round(Math.sin(a * Math.PI / 4) * 11); rect(x - 1, y - 1, x + 1, y + 1, k.c); }
      ring(16, 16, 9, k.l, 1); disc(16, 16, 4, k.d); disc(16, 16, 2, k.h); if (v === 2) { ring(16, 16, 6, k.dd, 1); }
      break;
    }
    case 'furnace': { rect(5, 12, 26, 27, k.m); rect(5, 12, 26, 13, k.mL); rect(8, 16, 23, 24, k.dd); rect(10, 18, 21, 23, k.c); rect(12, 19, 19, 21, k.h); rect(10, 4, 13, 12, k.mD); rect(18, 6, 21, 12, k.mD); if (v) { P(11, 2, k.mL); P(19, 4, k.mL); } rect(5, 27, 26, 29, k.mD); break; }
    case 'tank': { rect(9, 6, 22, 26, k.m); rect(9, 6, 22, 7, k.mL); rect(11, 9, 20, 23, k.dd); rect(12, 10, 19, 22, k.c); rect(13, 11, 14, 21, k.l); rect(7, 26, 24, 28, k.mD); rect(13, 3, 18, 6, k.mL); if (v) { rect(4, 14, 9, 16, k.mD); } for (let y = 12; y <= 20; y += 4) rect(11, y, 20, y, k.d); break; }
    case 'vat': { rect(7, 10, 24, 26, k.m); rect(7, 10, 24, 11, k.mL); rect(9, 13, 22, 24, k.dd); rect(10, 15, 21, 23, k.c); for (let i = 0; i < 5; i++) P(11 + i * 2, 14 - (i % 2), k.h); rect(5, 26, 26, 28, k.mD); rect(14, 5, 17, 10, k.mL); if (v) { disc(15, 19, 2, k.l); } break; }
    case 'chip': { rect(8, 8, 23, 23, k.m); rect(8, 8, 23, 9, k.mL); rect(11, 11, 20, 20, k.c); rect(12, 12, 19, 13, k.l); rect(13, 14, 18, 18, k.d); for (let i = 0; i < 6; i++) { P(4 + (i < 3 ? 0 : 0), 10 + i * 2, k.mL); P(27, 10 + i * 2, k.mL); P(10 + i * 2, 4, k.mL); P(10 + i * 2, 27, k.mL); } if (v) { P(15, 16, k.h); } break; }
    case 'bench': { rect(4, 14, 27, 17, k.m); rect(4, 14, 27, 14, k.mL); rect(6, 17, 8, 27, k.mD); rect(23, 17, 25, 27, k.mD); rect(10, 8, 15, 14, k.c); rect(10, 8, 15, 9, k.l); rect(18, 10, 22, 14, k.d); rect(19, 5, 21, 10, k.mL); if (v) { P(12, 6, k.h); } break; }
    case 'wrench': { line(8, 24, 20, 12, k.m, 3); rect(18, 6, 26, 14, k.m); rect(21, 9, 26, 12, k.dd); rect(18, 6, 26, 7, k.mL); disc(8, 24, 3, k.mL); if (v) { rect(4, 26, 7, 29, k.c); } break; }
    // ---------------- weapons ----------------
    case 'weapon_laser': {
      const bl = 11 + v * 3; // barrel length varies per item
      rect(4, 12, 4 + bl, 19, k.m); rect(4, 12, 4 + bl, 13, k.mL); rect(4, 18, 4 + bl, 19, k.mD);
      rect(6, 14, 9, 17, k.d);
      if (v === 0) { rect(5 + bl, 13, 9 + bl, 18, k.c); rect(5 + bl, 13, 9 + bl, 14, k.l); disc(12 + bl, 15, 2, k.h); }
      else if (v === 1) { poly([[5 + bl, 12], [10 + bl, 15], [5 + bl, 19]], k.c); poly([[5 + bl, 12], [10 + bl, 15], [5 + bl, 15]], k.l); disc(11 + bl, 15, 1, k.h); }
      else { ring(7 + bl, 15, 3, k.c); disc(7 + bl, 15, 1, k.h); rect(4 + bl, 14, 5 + bl, 17, k.l); }
      line(Math.min(30, 12 + bl), 15, 31, 15, k.h); line(Math.min(30, 12 + bl), 14, 30, 14, k.l);
      if (tier >= 3) { rect(8, 9, 13, 11, k.mL); rect(9, 10, 12, 10, k.c); } if (tier >= 5) { ring(23 + v, 15, 4, k.l); }
      rect(6, 20, 10, 24, k.mD); rect(7, 20, 8, 23, k.m); break;
    }
    case 'weapon_kinetic': {
      rect(3, 12, 24, 17, k.m); rect(3, 12, 24, 12, k.mL); rect(3, 17, 24, 17, k.mD);
      rect(24, 11, 28, 18, k.c); rect(29, 13, 30, 16, k.dd); rect(24, 11, 28, 12, k.l);
      rect(6, 18, 12, 24 + v, k.mD); rect(7, 19, 9, 22 + v, k.m); // magazine
      rect(10, 8, 15 + v, 11, k.d); rect(11, 9, 14 + v, 9, k.c); // sight
      if (tier >= 3) { for (let x = 14; x <= 22; x += 2) P(x, 14, k.mD); } if (tier >= 5) { rect(3, 9, 8, 11, k.c); }
      break;
    }
    case 'weapon_missile': {
      rect(6, 13, 21, 18, k.mL); rect(6, 13, 21, 13, [255, 255, 255].map((x, i) => Math.round((k.mL[i] + 255) / 2))); rect(6, 18, 21, 18, k.m);
      poly([[22, 12], [30, 15], [22, 19]], k.c); poly([[22, 12], [30, 15], [22, 15]], k.l);
      poly([[6, 13], [2, 9 - v], [6, 15]], k.d); poly([[6, 18], [2, 22 + v], [6, 16]], k.d);
      rect(3, 15, 5, 16, k.dd); for (let i = 0; i < 4; i++) P(0 + i, 15 + (i % 2), i < 2 ? k.h : k.l);
      if (tier >= 4) { rect(10, 11, 16, 12, k.c); } if (tier >= 5) { rect(9, 14, 18, 14, k.d); }
      break;
    }
    // ---------------- defense / power ----------------
    case 'shield': {
      const pts = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 6; pts.push([16 + Math.round(11 * Math.cos(a)), 16 + Math.round(11 * Math.sin(a))]); }
      poly(pts, k.d); const inner = pts.map(([x, y]) => [16 + Math.round((x - 16) * 0.75), 16 + Math.round((y - 16) * 0.75)]); poly(inner, k.c);
      poly([[inner[3][0], inner[3][1]], [inner[4][0], inner[4][1]], [16, 16]], k.l);
      disc(16, 16, v === 2 ? 4 : 3, k.h); if (tier >= 3) ring(16, 16, 7, k.l); if (tier >= 5) for (let i = 0; i < 6; i++) P(pts[i][0], pts[i][1], k.h);
      break;
    }
    case 'plate': {
      rect(5, 6, 26, 25, k.c); rect(5, 6, 26, 7, k.l); rect(5, 24, 26, 25, k.dd); rect(25, 6, 26, 25, k.d);
      for (const [x, y] of [[8, 9], [23, 9], [8, 22], [23, 22]]) { P(x, y, k.dd); P(x + 1, y, k.h); }
      if (v === 0) { rect(14, 6, 17, 25, k.d); } else if (v === 1) { line(5, 16, 26, 16, k.d); } else { rect(11, 12, 20, 19, k.d); rect(12, 13, 19, 18, k.c); }
      if (tier >= 3) rect(5, 6, 26, 6, k.h); if (tier >= 5) { rect(9, 10, 22, 21, k.d); rect(10, 11, 21, 20, k.l); }
      break;
    }
    case 'reactor': {
      ring(16, 16, 11, k.m, 3); ring(16, 16, 11, k.mL, 1); disc(16, 16, 6, k.d); disc(16, 16, 4, k.c); disc(16, 16, 2, k.h);
      for (let i = 0; i < 4 + v; i++) { const a = Math.PI * 2 * i / (4 + v); line(16 + Math.round(6 * Math.cos(a)), 16 + Math.round(6 * Math.sin(a)), 16 + Math.round(11 * Math.cos(a)), 16 + Math.round(11 * Math.sin(a)), k.mD); }
      if (tier >= 3) ring(16, 16, 14, k.l); if (tier >= 5) { for (let i = 0; i < 8; i++) { const a = Math.PI / 4 * i; P(16 + Math.round(14 * Math.cos(a)), 16 + Math.round(14 * Math.sin(a)), k.h); } }
      break;
    }
    case 'engine': {
      rect(4, 11, 15, 20, k.m); rect(4, 11, 15, 12, k.mL); rect(4, 19, 15, 20, k.mD);
      poly([[16, 10], [22, 7 - v], [22, 24 + v], [16, 21]], k.mL); poly([[16, 10], [22, 7 - v], [22, 9]], k.m);
      for (let i = 0; i < 3; i++) rect(6 + i * 3, 13, 6 + i * 3, 18, k.mD);
      poly([[22, 9], [31, 13], [31, 18], [22, 22]], k.c); poly([[22, 10], [29, 14], [29, 17], [22, 21]], k.l); poly([[22, 12], [27, 15], [22, 19]], k.h);
      if (tier >= 4) rect(4, 8, 15, 10, k.d); break;
    }
    // ---------------- industry / utility ----------------
    case 'cargo': { rect(4, 9, 27, 27, k.c); rect(4, 9, 27, 10, k.l); rect(4, 26, 27, 27, k.dd); rect(26, 9, 27, 27, k.d); rect(4, 16, 27, 17, k.d); rect(15, 9, 16, 27, k.d); if (v) { rect(8, 12, 12, 14, k.dd); } if (tier >= 3) { rect(4, 9, 27, 9, k.h); } break; }
    case 'crate_locked': { rect(4, 11, 27, 27, k.c); rect(4, 11, 27, 12, k.l); rect(4, 26, 27, 27, k.dd); rect(4, 18, 27, 19, k.d); ring(16, 8, 4, k.m, 2); rect(12, 8, 20, 12, k.d); rect(13, 14, 19, 22, k.mD); rect(14, 15, 18, 21, k.m); P(16, 17, k.h); P(16, 18, k.h); break; }
    case 'mining': { line(16, 3, 16, 24, k.m, 1); line(15, 3, 15, 24, k.mL); rect(10, 24, 22, 27, k.mD); rect(11, 25, 21, 25, k.m); for (let i = 0; i < 3 + v; i++) { line(16, 5 + i * 5, 9, 9 + i * 5, k.c); line(16, 5 + i * 5, 23, 9 + i * 5, k.d); } disc(16, 4, 2, k.h); break; }
    case 'utility': { rect(6, 8, 25, 24, k.m); rect(6, 8, 25, 9, k.mL); rect(6, 23, 25, 24, k.mD); rect(9, 11, 22, 21, k.dd); for (let i = 0; i < 3; i++) { rect(10, 12 + i * 3, 21, 12 + i * 3, i === v ? k.h : k.c); } rect(12, 5, 19, 7, k.m); break; }
    case 'dish': { for (let i = 0; i < 12; i++) line(8 + i, 6 + i, 8 + i, 6 + i + Math.min(i, 4), k.c); line(8, 6, 20, 18, k.l); line(9, 5, 21, 17, k.h); poly([[8, 6], [20, 18], [20, 22], [8, 10]], k.d); line(20, 18, 24, 22, k.m); rect(19, 22, 27, 25, k.mD); rect(20, 23, 26, 23, k.m); disc(14, 12, 1, k.h); if (v) ring(14, 12, 3, k.l); break; }
    case 'antenna': { line(16, 3, 16, 24, k.m); line(15, 3, 15, 24, k.mL); rect(11, 24, 21, 27, k.mD); for (let i = 1; i <= 2 + v; i++) { line(16 - i * 4, 8 + i * 3, 16, 3 + i * 2, k.c); line(16 + i * 4, 8 + i * 3, 16, 3 + i * 2, k.d); } disc(16, 3, 2, k.h); break; }
    case 'tube': { rect(4, 12, 24, 19, k.m); rect(4, 12, 24, 13, k.mL); rect(4, 18, 24, 19, k.mD); rect(24, 10, 27, 21, k.c); rect(24, 10, 27, 11, k.l); rect(5, 14, 8, 17, k.dd); rect(10, 9, 18, 11, k.d); for (let i = 0; i < 3; i++) P(28 + i, 15 + (i % 2), k.h); break; }
    case 'compass': { ring(16, 16, 11, k.m, 2); disc(16, 16, 9, k.dd); ring(16, 16, 9, k.mL); poly([[16, 6], [19, 16], [16, 15], [13, 16]], k.h); poly([[16, 26], [19, 16], [16, 17], [13, 16]], k.c); disc(16, 16, 1, k.l); break; }
    case 'cross': { rect(13, 4, 18, 27, k.c); rect(4, 13, 27, 18, k.c); rect(13, 4, 18, 5, k.l); rect(4, 13, 12, 14, k.l); rect(14, 26, 18, 27, k.dd); rect(19, 17, 27, 18, k.dd); disc(16, 16, 2, k.h); break; }
    case 'depot': { poly([[4, 12], [16, 4], [28, 12]], k.l); rect(4, 12, 27, 27, k.c); rect(4, 26, 27, 27, k.dd); rect(26, 12, 27, 27, k.d); rect(12, 18, 19, 27, k.dd); rect(13, 19, 18, 26, k.m); rect(6, 14, 10, 17, k.d); rect(21, 14, 25, 17, k.d); break; }
    case 'flask': { rect(13, 4, 18, 10, k.m); rect(13, 4, 18, 5, k.mL); poly([[13, 10], [18, 10], [26, 26], [5, 26]], k.mL); poly([[9, 19], [22, 19], [26, 26], [5, 26]], k.c); poly([[9, 19], [22, 19], [24, 23], [7, 23]], k.l); for (let i = 0; i < 4; i++) P(12 + i * 3, 16 - (i % 2) * 2, k.h); break; }
    case 'beaker': { rect(9, 5, 22, 6, k.m); rect(11, 7, 20, 25, k.mL); rect(9, 24, 22, 27, k.m); rect(12, 15, 19, 24, k.c); rect(12, 15, 19, 16, k.l); for (let i = 0; i < 3; i++) P(13 + i * 3, 11 + (i % 2) * 2, k.h); break; }
    case 'base': { rect(5, 16, 26, 27, k.c); rect(5, 26, 26, 27, k.dd); rect(25, 16, 26, 27, k.d); rect(11, 6, 20, 16, k.d); rect(11, 6, 20, 7, k.l); rect(13, 9, 18, 12, k.h); rect(7, 19, 10, 22, k.dd); rect(21, 19, 24, 22, k.dd); rect(14, 20, 17, 27, k.dd); break; }
    case 'rig': { rect(4, 24, 27, 27, k.mD); rect(5, 25, 26, 25, k.m); line(9, 24, 9, 8, k.m, 1); line(22, 24, 22, 8, k.m); rect(7, 6, 24, 9, k.c); rect(7, 6, 24, 6, k.l); rect(14, 10, 17, 22, k.d); rect(15, 10, 16, 22, k.l); poly([[12, 22], [19, 22], [16, 26]], k.h); break; }
    case 'battery': { rect(8, 8, 23, 27, k.m); rect(8, 8, 23, 9, k.mL); rect(12, 4, 19, 7, k.mD); rect(10, 11, 21, 25, k.dd); for (let i = 0; i < 3; i++) rect(11, 12 + i * 5, 20, 15 + i * 5, i < 2 + (v > 0 ? 1 : 0) ? k.c : k.d); rect(11, 12, 20, 12, k.l); break; }
    case 'capsule': { disc(16, 10, 6, k.c); rect(10, 10, 22, 22, k.c); disc(16, 22, 6, k.d); rect(12, 8, 14, 18, k.l); rect(10, 16, 22, 17, k.dd); if (v) { rect(13, 26, 19, 29, k.m); } P(19, 9, k.h); break; }
    case 'cone': { poly([[16, 3], [7, 26], [25, 26]], k.c); poly([[16, 3], [7, 26], [14, 26]], k.l); rect(7, 26, 25, 28, k.m); rect(8, 27, 24, 27, k.mL); line(16, 7, 16, 24, k.d); break; }
    default: { rect(6, 6, 25, 25, k.c); rect(6, 6, 25, 7, k.l); rect(6, 24, 25, 25, k.dd); rect(10, 10, 21, 21, k.d); break; }
  }
}

// { kind: 'module'|'item'|'resource', slotType, damageType, itemId, category, rarity, tier, quality }
export function getItemIcon(spec) {
  const { tier = null, quality = null, itemId = '' } = spec;
  const { glyph, tint } = classify(spec);
  const variant = (hashStr(String(itemId || glyph)) + (Number(tier) || 0)) % 3; // tier folded in so a family's tiers differ too
  const key = `v2|${glyph}|${tint}|${variant}|${tier}|${quality == null ? '' : Math.round(quality / 5) * 5}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const R = makeRaster();
  drawGlyph(R, glyph, tint, variant, Number(tier) || 1);
  // outline: any empty pixel touching a filled one
  const g = R.grid, out = Array.from({ length: PX }, () => new Array(PX).fill(null));
  const outline = [8, 10, 14];
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    if (g[y][x]) { out[y][x] = g[y][x]; continue; }
    if ((g[y - 1]?.[x]) || (g[y + 1]?.[x]) || g[y][x - 1] || g[y][x + 1]) out[y][x] = outline;
  }
  const frame = tier ? hex(tierColor(tier)) : null;
  const sheet = bakeSheet({
    fw: PX, fh: PX, frames: 1, extra: { px: PX },
    paintFrame: (f, put) => {
      if (frame) { // corner brackets + faint dashed edge in the tier colour
        const dim = shade(frame, 0.5);
        for (let i = 0; i < PX; i++) { if (i % 3 === 0) { put(0, i, 0, dim); put(0, i, PX - 1, dim); put(0, 0, i, dim); put(0, PX - 1, i, dim); } }
        for (const [x, y] of [[0, 0], [PX - 1, 0], [0, PX - 1], [PX - 1, PX - 1]]) { const dx = x === 0 ? 1 : -1, dy = y === 0 ? 1 : -1; for (let i = 0; i < 4; i++) { put(0, x + dx * i, y, frame); put(0, x, y + dy * i, frame); } }
      }
      for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) if (out[y][x]) put(0, x, y, out[y][x]);
      if (quality != null) { const q = hex(qualityColor(quality)); for (let y = 26; y <= 29; y++) for (let x = 26; x <= 29; x++) put(0, x, y, (x === 26 || y === 26) ? shade(q, 1.3) : (x === 29 || y === 29) ? shade(q, 0.6) : q); for (let i = 25; i <= 30; i++) { put(0, i, 25, [8, 12, 18]); put(0, 25, i, [8, 12, 18]); } }
    },
  });
  cache.set(key, sheet);
  return sheet;
}
