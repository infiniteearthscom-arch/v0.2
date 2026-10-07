// factions.js -- enemy faction territory (docs/enemy-factions-spec.md §3).
//
// Deterministic and pure: given the generated galaxy, decides which hostile
// faction every system fields. The client will carry a VERBATIM copy of the
// rules in star-shipper/src/utils/factions.js (Phase C, galaxy-map Threat
// row) -- change both or the map lies. Same mirror discipline as warp.js.
//
// Rules (owner-locked 2026-10-07):
//   * Core Worlds (Sol's region, always tier 1) -> Reavers only.
//   * Each tier's regions are DEALT one dominant faction each by the tier
//     weights below (stratified, largest remainder, hash order) -- not
//     rolled independently, so no tier ends up single-faction. From T4 up
//     all three are equally likely, so deep space is a patchwork; the Swarm
//     reads as "the deep threat" only because it is absent from T1-T2.
//   * ONE faction per system. A system follows its region's faction with
//     probability FOLLOW_REGION from hash(systemId); otherwise the WHOLE
//     system rolls a contesting faction from the same table. Fleets of
//     different factions never share a system.
//   * Nests: the highest-tier Swarm region is the Hive Nest, the
//     highest-tier Synod region the Forge Choir. Every system there fields
//     the nest faction (no contest roll). If a faction owns no region, the
//     deepest non-Core region not already a nest is promoted to it.

export const FACTIONS = ['reavers', 'synod', 'swarm'];
export const FACTION_LABEL = { reavers: 'Void Reavers', synod: 'The Synod', swarm: 'The Swarm' };
export const NEST_LABEL = { swarm: 'Hive Nest', synod: 'Forge Choir' };

// Region tier -> [reavers, synod, swarm] weights.
export const REGION_WEIGHTS_BY_TIER = {
  1: [1.00, 0.00, 0.00],
  2: [0.70, 0.30, 0.00],
  3: [0.40, 0.30, 0.30],
  4: [0.34, 0.33, 0.33],
  5: [0.34, 0.33, 0.33],
};
export const FOLLOW_REGION = 0.85;

// Normalises the legacy template value ('void_reavers') onto the three ids.
export const normalizeFaction = (f) => (f === 'void_reavers' || !f ? 'reavers' : String(f));

// FNV-1a over a string -> [0, 1). Must stay byte-identical on the client.
export const unitHash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
};

const rollFaction = (u, tier) => {
  const w = REGION_WEIGHTS_BY_TIER[Math.max(1, Math.min(5, tier || 1))];
  let r = u * (w[0] + w[1] + w[2]);
  for (let i = 0; i < FACTIONS.length; i++) { r -= w[i]; if (r <= 0) return FACTIONS[i]; }
  return FACTIONS[0];
};

// galaxy: { systems, regions } from generateGalaxy. Returns
//   { regionFaction: Map<regionId, faction>, nests: { swarm, synod } (regionIds or null),
//     systemFaction: Map<systemId, faction> }
export function computeTerritory(galaxy) {
  const regions = galaxy.regions || [];
  const regionFaction = new Map();
  // Stratified deal per tier (not independent rolls): with ~15 regions an
  // independent roll leaves whole tiers single-faction. Each tier's
  // regions are split by the weights (largest remainder), then dealt in
  // hash order, so every faction with weight > 0 at a tier is present
  // whenever the tier has enough regions.
  const byTier = {};
  for (const reg of regions) {
    if (reg.name === 'Core Worlds' || reg === regions[0]) { regionFaction.set(reg.id, 'reavers'); continue; }
    (byTier[Math.max(1, Math.min(5, reg.tier || 1))] ??= []).push(reg);
  }
  for (const [tierStr, regs] of Object.entries(byTier)) {
    const w = REGION_WEIGHTS_BY_TIER[Number(tierStr)];
    const n = regs.length, total = w[0] + w[1] + w[2];
    const exact = w.map(x => (x / total) * n);
    const counts = exact.map(Math.floor);
    let left = n - counts.reduce((a, c) => a + c, 0);
    const order = exact.map((x, i) => [x - counts[i], i]).sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    for (let k = 0; left > 0; k = (k + 1) % 3) { if (w[order[k][1]] > 0) { counts[order[k][1]]++; left--; } }
    const deal = []; FACTIONS.forEach((f, i) => { for (let c = 0; c < counts[i]; c++) deal.push(f); });
    regs.slice().sort((x, y) => unitHash(`faction|${x.id}`) - unitHash(`faction|${y.id}`)).forEach((reg, i) => regionFaction.set(reg.id, deal[i]));
  }
  // Nests: highest-tier region of each faction; promote if the faction has none.
  const nests = { swarm: null, synod: null };
  const byTierDesc = regions.slice().sort((a, b) => (b.tier - a.tier) || (unitHash(a.id) - unitHash(b.id)));
  for (const fac of ['swarm', 'synod']) {
    const own = byTierDesc.find(r => regionFaction.get(r.id) === fac);
    if (own) { nests[fac] = own.id; continue; }
    const promote = byTierDesc.find(r => r.name !== 'Core Worlds' && r !== regions[0] && !Object.values(nests).includes(r.id) && regionFaction.get(r.id) === 'reavers');
    if (promote) { regionFaction.set(promote.id, fac); nests[fac] = promote.id; }
  }
  const nestRegionIds = new Set(Object.values(nests).filter(Boolean));
  const systemFaction = new Map();
  for (const sys of galaxy.systems || []) {
    const regFac = regionFaction.get(sys.regionId) || 'reavers';
    if (sys.id === 'sol' || regFac === 'reavers' && (sys.regionTier ?? 1) <= 1) { systemFaction.set(sys.id, 'reavers'); continue; }
    if (nestRegionIds.has(sys.regionId)) { systemFaction.set(sys.id, regFac); continue; }
    const u = unitHash(`system|${sys.id}`);
    if (u < FOLLOW_REGION) { systemFaction.set(sys.id, regFac); continue; }
    systemFaction.set(sys.id, rollFaction(unitHash(`contest|${sys.id}`), sys.regionTier ?? 1));
  }
  return { regionFaction, nests, systemFaction };
}

// Convenience for a single system when the territory is already computed.
export const factionOfSystem = (territory, systemId) => territory.systemFaction.get(systemId) || 'reavers';
export const isNestRegion = (territory, regionId) => Object.values(territory.nests).includes(regionId);
