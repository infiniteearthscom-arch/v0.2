// game/anomalies.js -- cosmic signature sites (2026-09-23). Pure /
// deterministic: docs/anomalies-spec.md. Tuning constants up top.

import { generateGalaxy, generateSystemContent } from './galaxyGenerator.js';
import { SRng } from '../util/seed.js';

export const BUCKET_HOURS = 24;              // sites refresh daily
export const SITES_BY_TIER = { 1: [0, 1], 2: [1, 2], 3: [2, 2], 4: [2, 3], 5: [3, 3] };
export const PIN_CYCLES = 3;                 // probe cycles to pin (2 with +20% probe strength)
export const ESTIMATE_RADIUS = 700;          // first-cycle uncertainty, world units
export const INVESTIGATE_RANGE = 90;         // world units from the pinned position
export const GUARD_CHANCE = { 1: 0, 2: 0.2, 3: 0.5, 4: 0.7, 5: 0.9 };
export const SITE_TYPES = {
  gas_pocket:  { name: 'Gas Pocket',    icon: '☁', minTier: 1, weight: 4 },
  derelict:    { name: 'Derelict Hulk', icon: '⚓', minTier: 1, weight: 3 },
  data_vault:  { name: 'Data Vault',    icon: '▣', minTier: 2, weight: 2 },
  relic_cache: { name: 'Relic Cache',   icon: '◈', minTier: 3, weight: 2 },
};
// Rewards (rolled server-side at resolve time from a per-pilot seed)
export const GAS_BY_TIER = { 1: ['Hydrogen', 'Nitrogen'], 2: ['Nitrogen', 'Xenon'], 3: ['Helium-3', 'Plasma'], 4: ['Plasma', 'Helium-3'], 5: ['Plasma', 'Dark Matter'] };
export const RELIC_BY_TIER = { 3: ['Ancient Alloy'], 4: ['Ancient Alloy', 'Quantum Dust'], 5: ['Quantum Dust', 'Void Essence', 'Ancient Alloy'] };
export const CREDITS_BY_TIER = { 1: 600, 2: 1800, 3: 5000, 4: 12000, 5: 28000 };
export const RP_BY_TIER = { 1: 60, 2: 150, 3: 350, 4: 700, 5: 1400 };

const GALAXY_SEED = 12345, GALAXY_SYSTEM_COUNT = 200;
let _galaxy = null;
const galaxy = () => (_galaxy ||= generateGalaxy(GALAXY_SEED, GALAXY_SYSTEM_COUNT));
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const currentBucket = (now = Date.now()) => Math.floor(now / (BUCKET_HOURS * 3600 * 1000));

const weightedPick = (rng, entries) => {
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng.range(0, total);
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
  return entries[entries.length - 1][0];
};

// Sites in a system for a bucket: [{ index, type, name, icon, tier, guarded, x, y }]
export function sitesFor(systemId, bucket = currentBucket()) {
  const sys = galaxy().systemMap[systemId];
  if (!sys) return null;
  const tier = Math.max(1, Math.min(5, sys.regionTier ?? 1));
  const rng = new SRng(hashStr(`sig|${systemId}|${bucket}`));
  const [nMin, nMax] = SITES_BY_TIER[tier];
  const n = rng.int(nMin, nMax);
  const content = systemId === 'sol' ? null : generateSystemContent(sys);
  const maxOrbit = Math.max(900, ...((content?.bodies || []).filter(b => b.orbitRadius).map(b => b.orbitRadius)), 900);
  const types = Object.entries(SITE_TYPES).filter(([, t]) => tier >= t.minTier).map(([k, t]) => [k, t.weight]);
  const sites = [];
  for (let i = 0; i < n; i++) {
    const type = weightedPick(rng, types);
    const ang = rng.range(0, Math.PI * 2), dist = rng.range(500, maxOrbit * 1.15);
    const guarded = rng.chance(GUARD_CHANCE[tier]);
    sites.push({ index: i, type, name: SITE_TYPES[type].name, icon: SITE_TYPES[type].icon, tier, guarded,
      x: Math.round(Math.cos(ang) * dist), y: Math.round(Math.sin(ang) * dist) });
  }
  return sites;
}

// Position estimate after `cyclesDone` of `cyclesNeeded` cycles: circle
// around the true position, radius shrinking per cycle, offset jittered
// deterministically per pilot so two pilots don't share a circle.
export function estimateFor(site, cyclesDone, cyclesNeeded, deviationPct, userSeed) {
  if (cyclesDone <= 0) return null;
  const frac = Math.max(0, 1 - cyclesDone / cyclesNeeded);
  if (frac === 0) return { x: site.x, y: site.y, radius: 0 };
  const radius = Math.round(ESTIMATE_RADIUS * frac * Math.max(0.3, 1 + (deviationPct || 0) / 100));
  const rng = new SRng(hashStr(`est|${userSeed}|${site.index}|${cyclesDone}`));
  const a = rng.range(0, Math.PI * 2), d = rng.range(0, radius * 0.7);
  return { x: Math.round(site.x + Math.cos(a) * d), y: Math.round(site.y + Math.sin(a) * d), radius };
}

export function cyclesNeededFor(bonuses) {
  return (bonuses.probe_scan_strength_pct || 0) >= 20 ? PIN_CYCLES - 1 : PIN_CYCLES;
}
export function probeCycleSeconds(moduleCycle, bonuses) {
  const pct = (bonuses.probe_cycle_time_pct || 0) + (bonuses.probe_scan_time_pct || 0);
  return Math.max(5, Math.round((Number(moduleCycle) || 20) * (1 + pct / 100)));
}

// Reward roll. `moduleCatalog`: [{ id, tier, slot_type }] for drops.
export function rollRewards(site, rng, bonuses, techs, moduleCatalog) {
  const t = site.tier;
  const out = { credits: 0, rp: 0, resources: [], modules: [] };
  const q = () => rng.int(60, 85);
  const dropModule = (chance, maxTier) => {
    if (!rng.chance(Math.min(0.95, chance))) return;
    const pool = moduleCatalog.filter(m => m.tier <= maxTier && m.tier >= Math.max(1, maxTier - 1) && m.slot_type !== 'base');
    if (!pool.length) return;
    const m = pool[rng.int(0, pool.length - 1)];
    const mq = rng.int(55, 80);
    out.modules.push({ module_type_id: m.id, quality: { purity: mq, stability: mq, potency: mq, density: mq } });
  };
  switch (site.type) {
    case 'gas_pocket': {
      const names = GAS_BY_TIER[t];
      out.resources.push({ name: names[rng.int(0, names.length - 1)], quantity: rng.int(40, 90) * t, quality: q() });
      break;
    }
    case 'derelict': {
      out.credits = Math.round(CREDITS_BY_TIER[t] * rng.range(0.7, 1.3));
      dropModule(0.6 + (bonuses.salvage_chance_pct || 0) / 100, t);
      if (rng.chance(0.5)) out.resources.push({ name: t >= 3 ? 'Titanium' : 'Iron', quantity: rng.int(30, 80) * t, quality: rng.int(40, 70) });
      break;
    }
    case 'data_vault': {
      out.rp = Math.round(RP_BY_TIER[t] * (1 + (bonuses.data_virus_coherence_flat || 0) / 100) * rng.range(0.8, 1.2));
      out.credits = Math.round(CREDITS_BY_TIER[t] * 0.5 * rng.range(0.7, 1.3));
      break;
    }
    case 'relic_cache': {
      const names = RELIC_BY_TIER[t] || RELIC_BY_TIER[3];
      out.resources.push({ name: names[rng.int(0, names.length - 1)], quantity: rng.int(3, 6) * Math.max(1, t - 2), quality: q() });
      const xeno = techs.has('tech_xenoarchaeology');
      dropModule((0.35 + (bonuses.relic_virus_coherence_flat || 0) / 100) * (xeno ? 2 : 1), Math.min(5, t + 1));
      out.credits = Math.round(CREDITS_BY_TIER[t] * 0.3);
      break;
    }
  }
  return out;
}
