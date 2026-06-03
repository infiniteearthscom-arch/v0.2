// fleetEntities.js — groups combat ships into fleet ENTITIES with pooled
// Shield/Armor/Hull (combat F1). One pool per fleetId; damage targets the
// pool, not individual members. The heaviest member is the flagship (dies
// last once attrition lands in F2). F1: the whole fleet dies at hull 0.
//
// Member objects keep their position / AI / firing / render fields. Their
// own `.hull` becomes a liveness flag (zeroed only when the fleet dies).
// The fleet pool below is the authoritative combat health.

import { applyDamage } from './combat';
import { FORMATION_OFFSETS } from './shipRenderer';

// Build the fleetId -> fleet-pool Map from a flat member array. Also stamps
// `isFlagship` on each member (heaviest hull in its fleet). Returns the Map.
export function buildFleets(members) {
  const fleets = new Map();

  for (const m of members || []) {
    const fid = m.fleetId;
    if (!fid) continue;
    let f = fleets.get(fid);
    if (!f) {
      f = {
        id: fid,
        faction: m.faction,
        shield: 0, maxShield: 0,
        armor: 0,  maxArmor: 0,
        hull: 0,   maxHull: 0,
        shieldRegenTimer: 0,
        lootCredits: 0,
        memberIds: [],
        members: [],          // member refs (for attrition checks)
        deathOrder: [],        // member refs, escort-first → flagship last
        flagshipId: null,
        _flagHp: -1,
      };
      fleets.set(fid, f);
    }
    f.maxShield   += (m.maxShield || 0);
    f.maxArmor    += (m.maxArmor  || 0);
    f.maxHull     += (m.maxHull   ?? m.hull ?? 0);
    f.lootCredits += (m.lootCredits || 0);
    f.memberIds.push(m.id);
    f.members.push(m);
    // Flagship = heaviest member (by hull), tie-break first-seen.
    const hp = (m.maxHull ?? m.hull ?? 0);
    if (hp > f._flagHp) { f._flagHp = hp; f.flagshipId = m.id; }
  }

  // Current pools start full; drop the scratch field.
  for (const f of fleets.values()) {
    f.shield = f.maxShield;
    f.armor  = f.maxArmor;
    f.hull   = f.maxHull;
    delete f._flagHp;
  }

  // Stamp flagship flag + formation slot on each member. The flagship is
  // the formation leader (slot 0); followers get slots 1.. and a V-formation
  // offset (reused from the player fleet for a consistent feel). Followers
  // lagged-follow the leader; a fleet of 1 is just a free-flying leader.
  const followerCount = new Map();
  for (const m of members || []) {
    const f = fleets.get(m.fleetId);
    if (!f) { m.isFlagship = false; m.formationSlot = 0; m.formationOffset = FORMATION_OFFSETS[0]; continue; }
    if (f.flagshipId === m.id) {
      m.isFlagship = true;
      m.formationSlot = 0;
      m.formationOffset = FORMATION_OFFSETS[0];
    } else {
      m.isFlagship = false;
      const next = (followerCount.get(m.fleetId) || 0) + 1;
      followerCount.set(m.fleetId, next);
      const idx = Math.min(next, FORMATION_OFFSETS.length - 1);
      m.formationSlot = idx;
      m.formationOffset = FORMATION_OFFSETS[idx];
    }
  }

  // Death order + per-member hull thresholds for attrition (combat F2).
  // Escorts (lightest hull) die first; the flagship (leader) dies last at
  // threshold 0. A member dies once the pooled hull drops to/below its
  // threshold: T_k = maxHull − (sum of member hulls up to & incl. k).
  for (const f of fleets.values()) {
    const order = f.members.slice().sort((a, b) => {
      if (a.id === f.flagshipId) return 1;   // flagship always last
      if (b.id === f.flagshipId) return -1;
      return (a.maxHull ?? a.hull ?? 0) - (b.maxHull ?? b.hull ?? 0); // lightest first
    });
    let cum = 0;
    for (const m of order) {
      cum += (m.maxHull ?? m.hull ?? 0);
      m.deathThreshold = f.maxHull - cum;
    }
    f.deathOrder = order;
  }

  return fleets;
}

// Apply damage to a fleet's pooled defense via the shared triangle helper.
// Thin wrapper so callers don't import combat.js directly + intent reads clear.
export function damageFleet(fleet, rawDmg, weaponType) {
  if (!fleet) return { killed: false, shieldDamaged: false, layerHit: 'hull' };
  return applyDamage(fleet, rawDmg, weaponType);
}

// The fleet's current front defense layer (for readout tint / future cues).
export function fleetFrontLayer(fleet) {
  if (!fleet) return 'hull';
  if (fleet.shield > 0) return 'shield';
  if (fleet.armor > 0) return 'armor';
  return 'hull';
}
