// contracts.js -- procedural contract board (hauling v1, 2026-09-22).
// Spec: docs/contracts-spec.md. Every number a designer might tune is a
// constant at the top of this file.
//
// A "port" is a station body. Each port rolls BOARD_SIZE offers from
// hash(system, station, time bucket); the same board for every pilot,
// refreshed every BOARD_BUCKET_HOURS. Offers are never stored -- an
// accepted offer is regenerated from its key and validated, then a
// player_contracts row is written.

import { generateGalaxy, generateSystemContent } from './galaxyGenerator.js';
import { SRng } from '../util/seed.js';
import { resourceSellPrice } from '../lib/pricing.js';

// Resource catalog for fetch offers: [{ id, name, base_price }] sorted by
// id. Loaded once by the API layer (setResourceCatalog) -- the generator
// itself stays pure so boards are reproducible.
let _resources = [];
export function setResourceCatalog(rows) {
  _resources = [...rows].map(r => ({ id: Number(r.id), name: r.name, base_price: Number(r.base_price) })).sort((a, b) => a.id - b.id);
}
export const hasResourceCatalog = () => _resources.length > 0;

export const BOARD_BUCKET_HOURS = 4;
export const BOARD_SIZE = 7;               // hauling offers per port
export const FETCH_SIZE = 3;               // find-resource offers per port (079)
export const BOUNTY_SIZE = 2;              // bounty offers per port (080)
// Bounties: destroy N pirates of the offer's tier or higher (verified via
// the loot-claim record -- salvage the wreck to log the kill), turn in
// here. Pay per kill sits above a fleet's own loot so hunting beats
// farming; flagship-only bounties pay more per kill, named elites most.
export const BOUNTY_PER_KILL = { 1: 700, 2: 1600, 3: 4200, 4: 9500, 5: 19000 };
export const BOUNTY_KILLS = { 1: [3, 6], 2: [3, 5], 3: [2, 4], 4: [2, 3], 5: [1, 2] };
export const BOUNTY_FLAGSHIP_CHANCE = 0.3, BOUNTY_FLAGSHIP_PAY = 1.8;
export const BOUNTY_ELITE_CHANCE = 0.25;   // at T4/T5 ports: a named-elite bounty
export const BOUNTY_ELITES = { 4: { template_id: 'reaver_dread_captain', name: 'Dread Captain Orsk', pay: 45000 },
                               5: { template_id: 'reaver_admiral_vask',  name: 'Admiral Vask',       pay: 110000 } };
export const BOUNTY_DEADLINE_MIN = { 1: 120, 2: 150, 3: 180, 4: 240, 5: 300 };
// Fetch contracts: bring N units of a resource at avg quality >= floor to
// the posting station. Pay per unit = the vendor's sell price for that
// resource AT the floor quality x FETCH_PREMIUM[tier] -- always better
// than mining-and-vendoring the same ore, because you have to find it.
export const FETCH_PREMIUM = { 1: 1.6, 2: 1.8, 3: 2.0, 4: 2.2, 5: 2.5 };
export const FETCH_QTY = { 1: [60, 150], 2: [100, 250], 3: [120, 300], 4: [20, 60], 5: [15, 40] };
export const FETCH_MIN_Q = { 1: [0, 0], 2: [40, 55], 3: [50, 65], 4: [55, 70], 5: [65, 80] };   // rolled floor range
export const FETCH_DEADLINE_MIN = { 1: 90, 2: 120, 3: 150, 4: 180, 5: 240 };
// Resource pools by tier, by vendor base_price band.
export const FETCH_PRICE_BAND = { 1: [0, 30], 2: [30, 100], 3: [100, 200], 4: [200, 650], 5: [400, 9999] };
export const RATE = { 1: 22, 2: 25, 3: 28, 4: 30, 5: 32 };            // credits per cargo unit (volume + distance carry the scaling)
export const DANGER = { 1: 1.0, 2: 1.2, 3: 1.45, 4: 1.75, 5: 2.1 };  // × by the worst region tier crossed
export const VOLUME = { 1: [40, 80], 2: [100, 200], 3: [250, 450], 4: [500, 900], 5: [900, 1500] };
export const HOP_BAND = { 1: [1, 2], 2: [2, 3], 3: [3, 4], 4: [4, 6], 5: [5, 8] };
export const HOP_PAY = 0.25;              // reward × (1 + HOP_PAY × hops)
export const RUSH_CHANCE = 0.3, RUSH_TIME = 0.6, RUSH_PAY = 1.4;
// Contested hauls (tier >= 2): pirates know about the cargo. Pay x1.5;
// one ambush fleet (same tier) spawns on the route, once per contract.
export const CONTESTED_CHANCE = 0.25, CONTESTED_PAY = 1.5, CONTESTED_MIN_TIER = 2;
export const DEADLINE_BASE_MIN = 8, DEADLINE_PER_HOP_MIN = 5;
export const BASE_TIER_CAP = 1, BASE_ACTIVE_CAP = 2;                // + Contracting level each
export const SEALED_ITEM_ID = 'sealed_cargo';

const CARGO_LABELS = {
  1: ['Medical supplies', 'Machine parts', 'Colony rations', 'Water tanks', 'Textile bales', 'Hydroponics kits'],
  2: ['Reactor coolant', 'Sensor assemblies', 'Refined alloys', 'Navigation beacons', 'Pharmaceuticals'],
  3: ['Shield emitter cores', 'Uranium rods (shielded)', 'Encrypted data cores', 'Fusion injectors'],
  4: ['Exotic matter containment', 'Prototype drive coils', 'Precursor artifacts (crated)', 'Antimatter cells'],
  5: ['Void-stabilised singularity core', 'Ancient Alloy ingots', 'Sealed diplomatic pouch', 'Quantum lattice array'],
};

const GALAXY_SEED = 12345, GALAXY_SYSTEM_COUNT = 200;
let _galaxy = null, _ports = null, _portsBySystem = null;
function galaxy() {
  if (!_galaxy) _galaxy = generateGalaxy(GALAXY_SEED, GALAXY_SYSTEM_COUNT);
  return _galaxy;
}
// Every port in the galaxy: [{ systemId, systemName, station }]
export function allPorts() {
  if (_ports) return _ports;
  const g = galaxy();
  _ports = []; _portsBySystem = new Map();
  for (const sys of g.systems) {
    let names = [];
    if (sys.id === 'sol') names = ['Luna Station'];
    else {
      const content = generateSystemContent(sys);
      names = (content?.bodies || []).filter(b => b.type === 'station').map(b => b.name);
    }
    if (names.length) _portsBySystem.set(sys.id, names);
    for (const station of names) _ports.push({ systemId: sys.id, systemName: sys.name, station });
  }
  return _ports;
}
export function portsInSystem(systemId) { allPorts(); return _portsBySystem.get(systemId) || []; }
export const normName = (s) => String(s || '').trim().toLowerCase();
export function isPort(systemId, stationName) {
  return portsInSystem(systemId).some(n => normName(n) === normName(stationName));
}
export function systemName(systemId) { return galaxy().systemMap[systemId]?.name || systemId; }

// BFS over the gate network from `originId` -> { dist: Map, parent: Map }
const _bfsCache = new Map();
function bfs(originId) {
  if (_bfsCache.has(originId)) return _bfsCache.get(originId);
  const g = galaxy();
  const dist = new Map([[originId, 0]]), parent = new Map();
  const queue = [originId];
  while (queue.length) {
    const cur = queue.shift();
    const sys = g.systemMap[cur];
    for (const next of (sys?.jumpConnections || [])) {
      if (dist.has(next)) continue;
      dist.set(next, dist.get(cur) + 1); parent.set(next, cur); queue.push(next);
    }
  }
  const out = { dist, parent };
  _bfsCache.set(originId, out);
  return out;
}
export function hopsBetween(a, b) { const d = bfs(a).dist.get(b); return d == null ? null : d; }
function maxTierOnPath(originId, destId) {
  const { parent } = bfs(originId);
  const g = galaxy();
  let worst = g.systemMap[originId]?.regionTier ?? 1, cur = destId, guard = 0;
  while (cur && guard++ < 64) {
    worst = Math.max(worst, g.systemMap[cur]?.regionTier ?? 1);
    if (cur === originId) break;
    cur = parent.get(cur);
  }
  return Math.max(1, Math.min(5, worst));
}

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const currentBucket = (now = Date.now()) => Math.floor(now / (BOARD_BUCKET_HOURS * 3600 * 1000));
export const bucketEndsAt = (bucket) => (bucket + 1) * BOARD_BUCKET_HOURS * 3600 * 1000;

export function rewardFor({ volume, tier, hops, dangerTier, rush, contested }) {
  return Math.round(volume * RATE[tier] * (1 + HOP_PAY * hops) * DANGER[dangerTier] * (rush ? RUSH_PAY : 1) * (contested ? CONTESTED_PAY : 1));
}
// Systems on the gate path origin -> dest, inclusive, origin first.
export function pathBetween(originId, destId) {
  const { parent, dist } = bfs(originId);
  if (!dist.has(destId)) return null;
  const path = [];
  let cur = destId, guard = 0;
  while (cur && guard++ < 64) { path.push(cur); if (cur === originId) break; cur = parent.get(cur); }
  return path.reverse();
}
export function deadlineMinutes(hops, rush) {
  return Math.round((DEADLINE_BASE_MIN + DEADLINE_PER_HOP_MIN * hops) * (rush ? RUSH_TIME : 1));
}

// The board for one port in one time bucket. Deterministic.
export function generateBoard(systemId, stationName, bucket = currentBucket()) {
  const g = galaxy();
  const origin = g.systemMap[systemId];
  if (!origin || !isPort(systemId, stationName)) return null;
  const station = portsInSystem(systemId).find(n => normName(n) === normName(stationName));
  const rng = new SRng(hashStr(`${systemId}|${normName(station)}|${bucket}`));
  const { dist } = bfs(systemId);
  const ports = allPorts().filter(p => p.systemId !== systemId && dist.has(p.systemId));
  const originTier = Math.max(1, Math.min(5, origin.regionTier ?? 1));
  const offers = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    // tier: around the origin's region tier; tier-1 systems keep two T1 offers
    let tier = Math.max(1, Math.min(5, originTier + [-1, 0, 0, 1][rng.int(0, 3)]));
    if (originTier === 1 && i < 2) tier = 1;
    const [minH, maxH] = HOP_BAND[tier];
    let pool = ports.filter(p => { const d = dist.get(p.systemId); return d >= minH && d <= maxH; });
    if (!pool.length) {
      // nearest band available: sort by |hops - minH|
      pool = [...ports].sort((a, b) => Math.abs(dist.get(a.systemId) - minH) - Math.abs(dist.get(b.systemId) - minH)).slice(0, 6);
    }
    if (!pool.length) continue;
    const dest = pool[rng.int(0, pool.length - 1)];
    const hops = dist.get(dest.systemId);
    const [vMin, vMax] = VOLUME[tier];
    const volume = Math.round(rng.range(vMin, vMax) / 5) * 5;
    const rush = rng.chance(RUSH_CHANCE);
    const contested = tier >= CONTESTED_MIN_TIER && rng.chance(CONTESTED_CHANCE);
    const labels = CARGO_LABELS[tier];
    const label = labels[rng.int(0, labels.length - 1)];
    const dangerTier = maxTierOnPath(systemId, dest.systemId);
    offers.push({
      contract_key: `${systemId}|${station}|${bucket}|${i}`,
      contract_type: 'haul',
      tier, rush, contested, hops, volume, cargo_label: label,
      origin_system_id: systemId, origin_system_name: origin.name, origin_station: station,
      dest_system_id: dest.systemId, dest_system_name: dest.systemName, dest_station: dest.station,
      danger_tier: dangerTier,
      reward: rewardFor({ volume, tier, hops, dangerTier, rush, contested }),
      deadline_minutes: deadlineMinutes(hops, rush),
      board_expires_at: bucketEndsAt(bucket),
    });
  }
  // ---- fetch offers (079): indices BOARD_SIZE .. BOARD_SIZE+FETCH_SIZE-1 ----
  const frng = new SRng(hashStr(`fetch|${systemId}|${normName(station)}|${bucket}`));
  for (let j = 0; j < FETCH_SIZE; j++) {
    const i = BOARD_SIZE + j;
    let tier = Math.max(1, Math.min(5, originTier + [-1, 0, 0, 1][frng.int(0, 3)]));
    if (originTier === 1 && j === 0) tier = 1;
    const [pMin, pMax] = FETCH_PRICE_BAND[tier];
    let pool = _resources.filter(r => r.base_price >= pMin && r.base_price < pMax);
    if (!pool.length) pool = _resources;
    if (!pool.length) continue;
    const res = pool[frng.int(0, pool.length - 1)];
    const [qMin, qMax] = FETCH_QTY[tier];
    const quantity = Math.round(frng.range(qMin, qMax) / 5) * 5;
    const [fMin, fMax] = FETCH_MIN_Q[tier];
    const minQ = Math.round(frng.range(fMin, fMax) / 5) * 5;
    const unitPay = Math.round(resourceSellPrice(res.base_price, Math.max(50, minQ)) * FETCH_PREMIUM[tier]);
    offers.push({
      contract_key: `${systemId}|${station}|${bucket}|${i}`,
      contract_type: 'fetch',
      tier, rush: false, hops: 0, volume: quantity, cargo_label: res.name,
      fetch_resource_type_id: res.id, fetch_min_quality: minQ, unit_pay: unitPay,
      origin_system_id: systemId, origin_system_name: origin.name, origin_station: station,
      dest_system_id: systemId, dest_system_name: origin.name, dest_station: station,
      danger_tier: originTier,
      reward: unitPay * quantity,
      deadline_minutes: FETCH_DEADLINE_MIN[tier],
      board_expires_at: bucketEndsAt(bucket),
    });
  }
  // ---- bounty offers (080): indices BOARD_SIZE+FETCH_SIZE .. ----
  const brng = new SRng(hashStr(`bounty|${systemId}|${normName(station)}|${bucket}`));
  const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
  for (let j = 0; j < BOUNTY_SIZE; j++) {
    const i = BOARD_SIZE + FETCH_SIZE + j;
    let tier = Math.max(1, Math.min(5, originTier + [-1, 0, 0, 1][brng.int(0, 3)]));
    if (originTier === 1 && j === 0) tier = 1;
    const elite = BOUNTY_ELITES[tier];
    const namedElite = !!elite && brng.chance(BOUNTY_ELITE_CHANCE);
    const flagship = !namedElite && brng.chance(BOUNTY_FLAGSHIP_CHANCE);
    const [kMin, kMax] = BOUNTY_KILLS[tier];
    const kills = namedElite ? 1 : flagship ? Math.max(1, Math.round(brng.range(kMin, kMax) / 2)) : brng.int(kMin, kMax);
    const reward = namedElite ? elite.pay : Math.round(kills * BOUNTY_PER_KILL[tier] * (flagship ? BOUNTY_FLAGSHIP_PAY : 1));
    const label = namedElite ? `Destroy ${elite.name}`
      : flagship ? `Destroy ${kills} Tier ${ROMAN[tier]}+ pirate flagship${kills === 1 ? '' : 's'}`
      : `Destroy ${kills} Tier ${ROMAN[tier]}+ pirate ship${kills === 1 ? '' : 's'}`;
    offers.push({
      contract_key: `${systemId}|${station}|${bucket}|${i}`,
      contract_type: 'bounty',
      tier, rush: false, hops: 0, volume: kills, cargo_label: label,
      target_tier: namedElite ? null : tier, target_template_id: namedElite ? elite.template_id : null, target_flagship: flagship,
      origin_system_id: systemId, origin_system_name: origin.name, origin_station: station,
      dest_system_id: systemId, dest_system_name: origin.name, dest_station: station,
      danger_tier: tier,
      reward,
      deadline_minutes: BOUNTY_DEADLINE_MIN[tier],
      board_expires_at: bucketEndsAt(bucket),
    });
  }
  return offers;
}

// Regenerate one offer from its key. Accepting requires the CURRENT
// bucket; { anyBucket: true } regenerates an older (already accepted)
// contract's offer -- boards are deterministic for every bucket.
export function offerByKey(key, { anyBucket = false } = {}) {
  const parts = String(key || '').split('|');
  if (parts.length !== 4) return null;
  const [systemId, station, bucketStr, idxStr] = parts;
  const bucket = Number(bucketStr), idx = Number(idxStr);
  if (!Number.isInteger(bucket) || !Number.isInteger(idx)) return null;
  if (!anyBucket && bucket !== currentBucket()) return null; // board refreshed
  const board = generateBoard(systemId, station, bucket);
  return board?.[idx] && board[idx].contract_key === key ? board[idx] : null;
}

export function capsForLevel(contractingLevel) {
  const lvl = Math.max(0, Math.round(contractingLevel || 0));
  return { tier_cap: Math.min(5, BASE_TIER_CAP + lvl), active_cap: BASE_ACTIVE_CAP + lvl };
}
