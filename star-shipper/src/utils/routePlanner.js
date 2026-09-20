// routePlanner.js -- multi-hop route search over the galaxy (galaxy map v2).
//
// Edges (same rules as utils/warp.js, so a plotted route is always one
// the drive can actually fly):
//   gate  -- origin↔target gate-connected AND target.tier <= class + 2
//   warp  -- distance <= free-warp range AND target.tier <= class + 1
// BFS by hop count; gate hops are preferred on ties (instant). Routes
// may pass through undiscovered systems -- the map only hides their
// details, not their existence on the gate network.
//
// Returned hops exclude the origin: [{ id, via: 'gate'|'warp' }, ...].

import { isGateConnected, galaxyDistance, maxGateTier } from './warp';

const edgeVia = (from, to, profile) => {
  const tier = to.regionTier ?? 1;
  if (isGateConnected(from, to)) {
    if (tier <= (profile.maxGateTier ?? maxGateTier(profile.driveClass))) return 'gate';
  }
  if (tier <= profile.maxTier && galaxyDistance(from, to) <= profile.range) return 'warp';
  return null;
};

// Neighbours of `sys` under the profile. O(N) per call; fine for 200.
const neighbours = (galaxy, sys, profile) => {
  const out = [];
  for (const other of galaxy.systems) {
    if (other.id === sys.id) continue;
    const via = edgeVia(sys, other, profile);
    if (via) out.push({ sys: other, via });
  }
  // Gates first so BFS ties resolve toward instant hops.
  out.sort((a, b) => (a.via === b.via ? 0 : a.via === 'gate' ? -1 : 1));
  return out;
};

// { reachable, hops, gateHops, warpHops } -- hops empty when origin === target.
export const findRoute = (galaxy, originId, targetId, profile, maxHops = 40) => {
  const origin = galaxy.systemMap[originId];
  const target = galaxy.systemMap[targetId];
  if (!origin || !target) return { reachable: false, hops: [] };
  if (origin.id === target.id) return { reachable: true, hops: [], gateHops: 0, warpHops: 0 };

  const prev = new Map([[origin.id, null]]);
  const queue = [origin];
  let found = false;
  while (queue.length && !found) {
    const cur = queue.shift();
    for (const { sys, via } of neighbours(galaxy, cur, profile)) {
      if (prev.has(sys.id)) continue;
      prev.set(sys.id, { from: cur.id, via });
      if (sys.id === target.id) { found = true; break; }
      queue.push(sys);
    }
    if (prev.size > galaxy.systems.length + 1) break;
  }
  if (!found) return { reachable: false, hops: [] };

  const hops = [];
  let at = target.id;
  while (at !== origin.id) {
    const p = prev.get(at);
    hops.unshift({ id: at, via: p.via });
    at = p.from;
    if (hops.length > maxHops) return { reachable: false, hops: [] };
  }
  return {
    reachable: true,
    hops,
    gateHops: hops.filter(h => h.via === 'gate').length,
    warpHops: hops.filter(h => h.via === 'warp').length,
  };
};

// Human summary: "3 hops · 2 gate, 1 warp".
export const routeSummary = (route) => {
  if (!route?.reachable) return 'No route with your current drive';
  if (route.hops.length === 0) return 'You are here';
  const parts = [];
  if (route.gateHops) parts.push(`${route.gateHops} gate`);
  if (route.warpHops) parts.push(`${route.warpHops} warp`);
  return `${route.hops.length} hop${route.hops.length === 1 ? '' : 's'} · ${parts.join(', ')}`;
};
