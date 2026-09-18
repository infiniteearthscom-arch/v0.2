// enemyManifest.js -- turn the server's spawn manifest into SystemView
// enemy sim objects (combat redesign Phase 2, enemy template system).
//
// The server (star-shipper-server/src/game/enemyManifest.js) is the ONLY
// source of pirates: it assembles each enemy from real hull_types +
// module_types rows via enemy_templates and returns fully-resolved stats
// (HP pools, per-weapon damage/range/fire_rate, speed, loot). The client
// adds what only the renderer knows -- icon, displaySize, engine glow --
// and the sim's mutable runtime fields (state, cooldowns, velocity).
//
// Nothing here rolls dice. If you need different enemies, edit the
// templates in the DB (migration 069) -- not this file.

import { getShipIcon, HULL_SHAPES, PIRATE_HULLS } from './shipRenderer';

// Hull the renderer falls back to if the manifest names a hull it has
// no silhouette for (a DB-only hull added after this build shipped).
const FALLBACK_HULL_ID = 'pirate_marauder';

const lookupHull = (hullId) => PIRATE_HULLS[hullId] || HULL_SHAPES[hullId] || null;

// manifest: the `manifest` object from POST /combat/enter-system.
// systemId: stamped on every enemy (wreck claims read it off the wreck
// because the game loop's closure copy of currentSystemId can be stale
// -- CLAUDE.md pitfall #7).
export const hydrateEnemies = (manifest, systemId) => {
  if (!manifest || !Array.isArray(manifest.enemies)) return [];
  return manifest.enemies.map(e => {
    let hullId = e.hull_type_id;
    let hull = lookupHull(hullId);
    if (!hull) { hullId = FALLBACK_HULL_ID; hull = lookupHull(hullId); }
    const displaySize = hull?.displaySize ?? 8;
    const engineColor = hull?.palette?.engine || '#ffaa44';
    const weapons = (e.weapons || []).map(w => ({
      moduleTypeId: w.module_type_id,
      name: w.name,
      damageType: w.damage_type || 'kinetic',
      damage: w.damage,
      fireRate: w.fire_rate,
      range: w.range,
      quality: w.quality,
      cooldown: 0, // runtime, seconds until this weapon may fire again
    }));
    // Legacy single-weapon fields stay populated (HUD tint, name suffix,
    // anything that still reads enemy.damage) from the primary weapon =
    // highest DPS. The sim fires EVERY entry in `weapons`.
    const primary = weapons.slice().sort((a, b) => (b.damage / b.fireRate) - (a.damage / a.fireRate))[0];

    return {
      id: e.id,
      hullId,
      icon: getShipIcon(hullId),
      faction: 'pirate',
      templateId: e.template_id,
      tier: e.tier || 1,
      name: e.name,
      hullName: e.hull_name,
      isElite: !!e.is_elite,
      behaviorMode: e.behavior_mode || 'aggressive',
      // Inspectable fit (target panel) -- the template's module rows with
      // the rolled quality + resolved per-module numbers.
      modules: e.modules || [],

      x: e.x, y: e.y,
      vx: 0, vy: 0,
      rotation: e.rotation || 0,

      hull: e.max_hull,     maxHull: e.max_hull,
      armor: e.max_armor,   maxArmor: e.max_armor,
      shield: e.max_shield, maxShield: e.max_shield,

      weaponType: primary?.damageType || e.primary_damage_type || 'kinetic',
      speed: e.speed,
      damage: primary?.damage ?? 0,
      fireRate: primary?.fireRate ?? 1,
      range: e.range || (primary?.range ?? 150),
      weapons,

      fireCooldown: 0,
      shieldRegenTimer: 0,
      engineColor,
      displaySize,
      state: 'patrol',
      patrolCenter: { x: e.patrol_center?.x ?? e.x, y: e.patrol_center?.y ?? e.y },
      patrolAngle: e.patrol_angle || 0,
      patrolRadius: e.patrol_radius || 100,
      targetId: null,
      fleetId: e.fleet_id,
      lootCredits: e.loot_credits || 0,
      systemId,
    };
  });
};
