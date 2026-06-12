// tiers.js — the unified 5-tier scale (locked design, 2026-06-11).
// One 1-5 ladder shared by modules, resource rarity, galaxy zones
// (zoning spec B1's five bands), and — as they land — enemy fleets,
// hulls, and systems. Module tiers map to the zone whose materials
// craft them: T1-T2 commons (zones I-II), T3 rares (zone III),
// T4 rares + first exotics (zone IV), T5 exotic-heavy (zone V).
//
// TIER_COLORS follows the familiar rarity ramp (gray → green → blue →
// purple → gold) so a glance at any tier badge reads instantly.

export const TIER_COLORS = {
  1: '#9aa5b1', // gray   — starter
  2: '#4ade80', // green  — advanced
  3: '#4488ff', // blue   — rare-tier
  4: '#aa44ff', // purple — exotic-touched
  5: '#fbbf24', // gold   — exotic endgame
};

export const tierColor = (tier) => TIER_COLORS[Math.round(tier)] || TIER_COLORS[1];

// Roman numeral display, matching the zoning spec's zone names (I-V).
const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
export const tierLabel = (tier) => ROMAN[Math.round(tier)] || String(tier);
