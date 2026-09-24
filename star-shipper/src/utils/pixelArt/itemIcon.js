// pixelArt/itemIcon.js -- procedural 16x16 item icons (2026-09-24).
//
// Composed, not drawn: a glyph for WHAT it is (resource category / module
// slot / weapon damage type / special item), tinted by rarity or slot
// colour, framed by the tier colour, with a quality gem in the corner.
// Every module and resource gets a distinct icon with no art assets.

import { bakeSheet } from '../spriteBake.js';
import { tierColor } from '../tiers.js';

const PX = 16;
const cache = new Map();
const hex = (h) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const shade = (c, k) => c.map(v => Math.max(0, Math.min(255, Math.round(v * k))));

export const SLOT_COLORS = {
  engine: '#ff6622', weapon: '#ff2244', shield: '#8844ff', cargo: '#ddaa22', utility: '#22ccaa',
  reactor: '#00ddff', mining: '#aa66ff', base: '#4ade80', item: '#ffaa00',
};
export const RARITY_COLORS = { common: '#d8dee6', rare: '#4488ff', exotic: '#aa44ff' };
const QUALITY_COLORS = [[20, '#666e78'], [40, '#b0bcc8'], [60, '#44ff44'], [80, '#4488ff'], [101, '#aa44ff']];
const qualityColor = (q) => { for (const [max, c] of QUALITY_COLORS) if (q <= max) return c; return '#aa44ff'; };

// What glyph to draw for a module / item id.
export function classify({ kind, slotType, damageType, itemId = '', category, rarity }) {
  const id = String(itemId);
  if (kind === 'resource') return { glyph: category || 'ore', tint: RARITY_COLORS[rarity] || RARITY_COLORS.common };
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

function drawGlyph(put, glyph, tint) {
  const c = hex(tint), d = shade(c, 0.55), l = shade(c, 1.35);
  const P = (x, y, col = c) => put(0, x, y, col);
  const rect = (x0, y0, x1, y1, col = c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) P(x, y, col); };
  const line = (x0, y0, x1, y1, col = c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) P(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), col); };
  const disc = (cx, cy, r, col = c) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) P(cx + x, cy + y, col); };
  switch (glyph) {
    // ---- resources ----
    case 'ore': disc(8, 8, 4, d); disc(7, 7, 3, c); P(6, 6, l); P(7, 6, l); rect(9, 9, 10, 10, d); break;
    case 'gas': disc(6, 9, 3, d); disc(10, 8, 3, c); disc(8, 6, 2, l); break;
    case 'biological': line(8, 13, 8, 5, d); disc(6, 7, 2, c); disc(10, 6, 2, c); P(5, 6, l); P(10, 5, l); break;
    case 'energy': line(9, 3, 6, 8, c); line(6, 8, 10, 8, l); line(10, 8, 7, 13, c); break;
    case 'exotic': line(8, 3, 8, 13, c); line(3, 8, 13, 8, c); line(5, 5, 11, 11, d); line(11, 5, 5, 11, d); P(8, 8, l); break;
    // ---- weapons ----
    case 'weapon_laser': rect(3, 7, 9, 9, d); rect(4, 8, 8, 8, c); disc(11, 8, 2, l); line(12, 8, 14, 8, l); break;
    case 'weapon_kinetic': rect(3, 6, 12, 8, c); rect(3, 9, 6, 11, d); rect(12, 7, 14, 7, l); P(4, 7, l); break;
    case 'weapon_missile': rect(4, 7, 11, 9, c); line(12, 7, 14, 8, l); line(12, 9, 14, 8, l); rect(3, 5, 4, 6, d); rect(3, 10, 4, 11, d); P(4, 8, d); break;
    // ---- defense / power ----
    case 'shield': for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; line(8 + Math.round(5 * Math.cos(a)), 8 + Math.round(5 * Math.sin(a)), 8 + Math.round(5 * Math.cos(a + Math.PI / 3)), 8 + Math.round(5 * Math.sin(a + Math.PI / 3)), c); } disc(8, 8, 2, l); break;
    case 'plate': rect(3, 4, 12, 11, c); rect(3, 4, 12, 4, l); rect(3, 11, 12, 11, d); P(5, 6, d); P(10, 6, d); P(5, 9, d); P(10, 9, d); break;
    case 'reactor': disc(8, 8, 5, d); disc(8, 8, 3, c); disc(8, 8, 1, l); P(8, 3, l); P(13, 8, l); P(8, 13, l); P(3, 8, l); break;
    case 'engine': rect(4, 6, 8, 10, c); line(9, 5, 11, 4, d); line(9, 11, 11, 12, d); rect(9, 6, 10, 10, d); rect(11, 7, 14, 9, l); break;
    // ---- industry / utility ----
    case 'cargo': rect(3, 5, 12, 12, c); rect(3, 5, 12, 5, l); line(8, 5, 8, 12, d); line(3, 8, 12, 8, d); break;
    case 'crate_locked': rect(3, 6, 12, 12, c); rect(3, 6, 12, 6, l); rect(6, 3, 9, 5, d); P(7, 9, d); P(8, 9, d); break;
    case 'mining': line(8, 3, 8, 12, c); rect(5, 12, 11, 13, d); line(5, 5, 8, 8, l); line(11, 5, 8, 8, l); break;
    case 'utility': rect(4, 5, 11, 11, c); rect(6, 3, 9, 4, d); P(6, 7, l); P(9, 7, l); P(6, 9, d); P(9, 9, d); break;
    case 'dish': for (let i = 0; i < 5; i++) line(4 + i, 4 + i * 2, 4 + i, 4 + i * 2, c); line(4, 4, 10, 10, c); line(5, 3, 11, 9, l); line(10, 10, 12, 12, d); rect(9, 12, 13, 13, d); break;
    case 'antenna': line(8, 3, 8, 12, c); line(4, 6, 8, 3, d); line(12, 6, 8, 3, d); rect(6, 12, 10, 13, d); P(8, 3, l); break;
    case 'tube': rect(3, 6, 12, 9, c); rect(12, 5, 13, 10, l); rect(3, 6, 4, 9, d); break;
    case 'compass': disc(8, 8, 5, d); disc(8, 8, 4, c); line(8, 4, 8, 8, l); line(8, 8, 11, 11, d); break;
    case 'cross': rect(7, 3, 9, 13, c); rect(3, 7, 13, 9, c); P(8, 8, l); break;
    case 'depot': rect(3, 7, 12, 13, c); line(3, 7, 8, 3, l); line(8, 3, 12, 7, l); rect(6, 10, 9, 13, d); break;
    case 'flask': rect(7, 3, 9, 6, d); line(5, 12, 7, 6, c); line(11, 12, 9, 6, c); rect(5, 12, 11, 13, c); rect(6, 10, 10, 11, l); break;
    case 'beaker': rect(5, 4, 11, 4, d); rect(6, 5, 10, 12, c); rect(5, 12, 11, 13, d); rect(7, 9, 9, 11, l); break;
    case 'base': rect(4, 8, 12, 13, c); rect(6, 4, 10, 8, d); rect(7, 5, 9, 6, l); P(5, 10, d); P(11, 10, d); break;
    case 'rig': rect(3, 11, 12, 13, d); line(5, 11, 5, 5, c); line(10, 11, 10, 5, c); rect(4, 4, 11, 5, c); rect(7, 6, 8, 10, l); break;
    case 'battery': rect(4, 5, 11, 12, c); rect(6, 3, 9, 4, d); rect(5, 9, 10, 11, l); rect(5, 6, 10, 8, d); break;
    case 'capsule': disc(8, 5, 3, c); rect(5, 5, 11, 11, c); disc(8, 11, 3, d); rect(6, 6, 7, 8, l); break;
    case 'cone': line(8, 2, 4, 12, c); line(8, 2, 12, 12, c); rect(4, 12, 12, 13, d); line(8, 4, 8, 11, l); break;
    default: rect(4, 4, 11, 11, c); rect(4, 4, 11, 4, l); break;
  }
}

// { kind: 'module'|'item'|'resource', slotType, damageType, itemId, category, rarity, tier, quality }
export function getItemIcon(spec) {
  const { tier = null, quality = null } = spec;
  const { glyph, tint } = classify(spec);
  const key = `${glyph}|${tint}|${tier}|${quality == null ? '' : Math.round(quality / 5) * 5}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const frame = tier ? hex(tierColor(tier)) : null;
  const sheet = bakeSheet({
    fw: PX, fh: PX, frames: 1, extra: { px: PX },
    paintFrame: (f, put) => {
      if (frame) {
        const dim = shade(frame, 0.55);
        for (let i = 0; i < PX; i++) { put(0, i, 0, ((i & 1) ? frame : dim)); put(0, i, PX - 1, ((i & 1) ? dim : frame)); put(0, 0, i, ((i & 1) ? dim : frame)); put(0, PX - 1, i, ((i & 1) ? frame : dim)); }
      }
      drawGlyph(put, glyph, tint);
      if (quality != null) { const q = hex(qualityColor(quality)); put(0, 13, 13, q); put(0, 14, 13, q); put(0, 13, 14, q); put(0, 14, 14, shade(q, 0.7)); put(0, 12, 12, [10, 14, 20]); }
    },
  });
  cache.set(key, sheet);
  return sheet;
}
