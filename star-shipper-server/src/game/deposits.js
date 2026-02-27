// Resource Deposit Spawning Service
// Handles generating and managing resource deposits on celestial bodies

import { query, queryOne, queryAll } from '../db/index.js';

// ============================================
// CONSTANTS
// ============================================

const SPAWN_CHANCES = {
  PLANET_COMMON: 70,
  PLANET_RARE: 20,
  ANY_COMMON: 8,
  ANY_RARE_EXOTIC: 2,
};

// Deposit slots by body type/size
const DEPOSIT_SLOTS = {
  moon: 2,
  small_planet: 3,
  planet: 4,
  large_planet: 6,
  gas_giant: 4,
  asteroid_belt: 5,
  station: 0, // Stations don't have deposits
};

// Quantity ranges by rarity
const QUANTITY_RANGES = {
  common: { min: 300, max: 800 },
  rare: { min: 150, max: 400 },
  exotic: { min: 50, max: 150 },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Generate random integer in range
const randomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Generate a single stat (0-100) with optional bonus
const generateStat = (bonus = 0) => {
  const base = randomInt(0, 100);
  return Math.min(100, Math.max(0, base + bonus));
};

// Generate all stats for a deposit
const generateStats = (isExotic = false, dangerBonus = 0) => {
  // Exotic resources tend toward extremes (very high or very low)
  const extremeFactor = isExotic ? (Math.random() > 0.5 ? 20 : -20) : 0;
  
  return {
    purity: generateStat(extremeFactor + dangerBonus),
    stability: generateStat(extremeFactor + dangerBonus),
    potency: generateStat(extremeFactor + dangerBonus),
    density: generateStat(extremeFactor + dangerBonus),
  };
};

// Generate quantity based on rarity
const generateQuantity = (rarity) => {
  const range = QUANTITY_RANGES[rarity] || QUANTITY_RANGES.common;
  return randomInt(range.min, range.max);
};

// ============================================
// RESOURCE SELECTION
// ============================================

// Get resources available for a planet type
const getResourcesForPlanetType = async (planetType) => {
  const result = await queryAll(`
    SELECT 
      rt.id, rt.name, rt.category, rt.rarity, rt.base_price,
      pra.spawn_weight, pra.is_primary
    FROM resource_types rt
    JOIN planet_resource_affinities pra ON rt.id = pra.resource_type_id
    WHERE pra.planet_type = $1
    ORDER BY pra.spawn_weight DESC
  `, [planetType]);
  
  return result;
};

// Get all resources by rarity
const getResourcesByRarity = async (rarity) => {
  const result = await queryAll(`
    SELECT id, name, category, rarity, base_price
    FROM resource_types
    WHERE rarity = $1
  `, [rarity]);
  
  return result;
};

// Weighted random selection from resources
const selectWeightedResource = (resources) => {
  const totalWeight = resources.reduce((sum, r) => sum + (r.spawn_weight || 100), 0);
  let random = Math.random() * totalWeight;
  
  for (const resource of resources) {
    random -= (resource.spawn_weight || 100);
    if (random <= 0) {
      return resource;
    }
  }
  
  return resources[resources.length - 1];
};

// ============================================
// STAR TYPE RESOURCE MULTIPLIERS
// These scale the spawn_weight of resources by category
// based on what star type the system has.
// e.g., blue_giant doubles energy resources, halves biological
// ============================================
const STAR_RESOURCE_MULTIPLIERS = {
  red_dwarf:    { ore: 1.2, gas: 0.8, biological: 1.5, energy: 0.6, exotic: 0.3 },
  orange_star:  { ore: 1.0, gas: 1.0, biological: 1.2, energy: 0.8, exotic: 0.4 },
  yellow_star:  { ore: 1.0, gas: 1.0, biological: 1.0, energy: 1.0, exotic: 0.5 },
  blue_giant:   { ore: 0.8, gas: 1.5, biological: 0.3, energy: 1.8, exotic: 0.8 },
  white_dwarf:  { ore: 1.3, gas: 0.5, biological: 0.2, energy: 1.2, exotic: 1.0 },
  neutron_star: { ore: 0.4, gas: 0.3, biological: 0.1, energy: 2.0, exotic: 2.0 },
  black_hole:   { ore: 0.2, gas: 0.2, biological: 0.0, energy: 1.5, exotic: 3.0 },
};

// Apply star-type multiplier to a list of resources
const applyStarMultiplier = (resources, starType) => {
  const mults = STAR_RESOURCE_MULTIPLIERS[starType];
  if (!mults) return resources;
  
  return resources.map(r => ({
    ...r,
    spawn_weight: Math.round((r.spawn_weight || 100) * (mults[r.category] || 1.0)),
  })).filter(r => r.spawn_weight > 0);
};

// Select a resource for a deposit slot (with optional star-type weighting)
const selectResourceForDeposit = async (planetType, starType = null) => {
  const roll = randomInt(1, 100);
  
  if (roll <= SPAWN_CHANCES.PLANET_COMMON) {
    // 70% - Planet's common resources
    let planetResources = await getResourcesForPlanetType(planetType);
    if (starType) planetResources = applyStarMultiplier(planetResources, starType);
    const commonResources = planetResources.filter(r => r.rarity === 'common');
    
    if (commonResources.length > 0) {
      return selectWeightedResource(commonResources);
    }
  } else if (roll <= SPAWN_CHANCES.PLANET_COMMON + SPAWN_CHANCES.PLANET_RARE) {
    // 20% - Planet's rare resources
    let planetResources = await getResourcesForPlanetType(planetType);
    if (starType) planetResources = applyStarMultiplier(planetResources, starType);
    const rareResources = planetResources.filter(r => r.rarity === 'rare' || r.rarity === 'exotic');
    
    if (rareResources.length > 0) {
      return selectWeightedResource(rareResources);
    }
  } else if (roll <= SPAWN_CHANCES.PLANET_COMMON + SPAWN_CHANCES.PLANET_RARE + SPAWN_CHANCES.ANY_COMMON) {
    // 8% - Any common resource (also weighted by star type)
    let allCommon = await getResourcesByRarity('common');
    if (starType) allCommon = applyStarMultiplier(allCommon, starType);
    if (allCommon.length > 0) {
      return selectWeightedResource(allCommon);
    }
  } else {
    // 2% - Any rare/exotic resource (boosted by star type)
    let allRare = await getResourcesByRarity('rare');
    let allExotic = await getResourcesByRarity('exotic');
    if (starType) {
      allRare = applyStarMultiplier(allRare, starType);
      allExotic = applyStarMultiplier(allExotic, starType);
    }
    const combined = [...allRare, ...allExotic];
    
    if (combined.length > 0) {
      return selectWeightedResource(combined);
    }
  }
  
  // Fallback: get any common resource
  const fallback = await getResourcesByRarity('common');
  return fallback[0];
};

// ============================================
// DEPOSIT MANAGEMENT
// ============================================

// Get number of deposit slots for a body
const getDepositSlots = (bodyType, size) => {
  // Check specific body type first
  if (DEPOSIT_SLOTS[bodyType] !== undefined) {
    return DEPOSIT_SLOTS[bodyType];
  }
  
  // Estimate based on size
  if (size < 15) return 2;  // Small
  if (size < 30) return 4;  // Medium
  return 6;                  // Large
};

// Check if deposits exist for a celestial body
const getDepositsForBody = async (celestialBodyId) => {
  const result = await queryAll(`
    SELECT 
      rd.*,
      rt.name as resource_name,
      rt.category,
      rt.rarity,
      rt.base_price,
      rt.icon
    FROM resource_deposits rd
    JOIN resource_types rt ON rd.resource_type_id = rt.id
    WHERE rd.celestial_body_id = $1
    ORDER BY rd.slot_number
  `, [celestialBodyId]);
  
  return result;
};

// Check if a body needs deposit spawning
const bodyNeedsDeposits = async (celestialBodyId) => {
  const existing = await queryOne(`
    SELECT COUNT(*) as count
    FROM resource_deposits
    WHERE celestial_body_id = $1 AND depleted_at IS NULL
  `, [celestialBodyId]);
  
  return parseInt(existing.count) === 0;
};

// Spawn deposits for a celestial body
const spawnDepositsForBody = async (celestialBody) => {
  const { id, body_type, planet_type, size, danger_level = 0, star_type = null } = celestialBody;
  
  // Determine planet type for resource selection
  const effectivePlanetType = planet_type || body_type;
  
  // Get number of slots
  const numSlots = getDepositSlots(body_type, size);
  
  if (numSlots === 0) {
    return []; // Stations, etc. don't have deposits
  }
  
  // Danger bonus for stats
  const dangerBonus = danger_level * 3; // +3 per danger level
  
  const deposits = [];
  
  for (let slot = 1; slot <= numSlots; slot++) {
    // Select resource (weighted by star type if available)
    const resource = await selectResourceForDeposit(effectivePlanetType, star_type);
    
    if (!resource) continue;
    
    // Generate stats
    const isExotic = resource.rarity === 'exotic';
    const stats = generateStats(isExotic, dangerBonus);
    
    // Generate quantity
    const quantity = generateQuantity(resource.rarity);
    
    // Insert deposit
    const result = await queryOne(`
      INSERT INTO resource_deposits (
        celestial_body_id, resource_type_id, slot_number,
        quantity_remaining, quantity_total,
        stat_purity, stat_stability, stat_potency, stat_density
      ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)
      ON CONFLICT (celestial_body_id, slot_number) 
      DO UPDATE SET
        resource_type_id = EXCLUDED.resource_type_id,
        quantity_remaining = EXCLUDED.quantity_remaining,
        quantity_total = EXCLUDED.quantity_total,
        stat_purity = EXCLUDED.stat_purity,
        stat_stability = EXCLUDED.stat_stability,
        stat_potency = EXCLUDED.stat_potency,
        stat_density = EXCLUDED.stat_density,
        spawned_at = NOW(),
        depleted_at = NULL
      RETURNING *
    `, [
      id, 
      resource.id, 
      slot, 
      quantity,
      stats.purity, 
      stats.stability, 
      stats.potency, 
      stats.density
    ]);
    
    deposits.push({
      ...result,
      resource_name: resource.name,
      category: resource.category,
      rarity: resource.rarity,
    });
  }
  
  console.log(`🪨 Spawned ${deposits.length} deposits on body ${id}`);
  
  return deposits;
};

// Check and respawn depleted deposits (call periodically or on visit)
const respawnDepletedDeposits = async (celestialBodyId) => {
  // Find deposits depleted more than 24 hours ago
  const depleted = await queryAll(`
    SELECT rd.*, cb.body_type, cb.planet_type, cb.size
    FROM resource_deposits rd
    JOIN celestial_bodies cb ON rd.celestial_body_id = cb.id
    WHERE rd.celestial_body_id = $1 
      AND rd.depleted_at IS NOT NULL
      AND rd.depleted_at < NOW() - INTERVAL '24 hours'
  `, [celestialBodyId]);
  
  if (depleted.length === 0) {
    return [];
  }
  
  // Get body info for respawning
  const body = await queryOne(`
    SELECT * FROM celestial_bodies WHERE id = $1
  `, [celestialBodyId]);
  
  const respawned = [];
  
  for (const deposit of depleted) {
    // Select new resource (could be different!)
    const resource = await selectResourceForDeposit(body.planet_type || body.body_type);
    
    if (!resource) continue;
    
    const isExotic = resource.rarity === 'exotic';
    const stats = generateStats(isExotic, 0);
    const quantity = generateQuantity(resource.rarity);
    
    const result = await queryOne(`
      UPDATE resource_deposits
      SET 
        resource_type_id = $1,
        quantity_remaining = $2,
        quantity_total = $2,
        stat_purity = $3,
        stat_stability = $4,
        stat_potency = $5,
        stat_density = $6,
        spawned_at = NOW(),
        depleted_at = NULL
      WHERE id = $7
      RETURNING *
    `, [
      resource.id,
      quantity,
      stats.purity,
      stats.stability,
      stats.potency,
      stats.density,
      deposit.id
    ]);
    
    respawned.push({
      ...result,
      resource_name: resource.name,
      category: resource.category,
      rarity: resource.rarity,
    });
  }
  
  if (respawned.length > 0) {
    console.log(`🔄 Respawned ${respawned.length} deposits on body ${celestialBodyId}`);
  }
  
  return respawned;
};

// Ensure a body has deposits (call when player visits)
const ensureDepositsExist = async (celestialBodyId) => {
  // Get body info
  const body = await queryOne(`
    SELECT * FROM celestial_bodies WHERE id = $1
  `, [celestialBodyId]);
  
  if (!body) {
    throw new Error(`Celestial body ${celestialBodyId} not found`);
  }
  
  // Check for respawns first
  await respawnDepletedDeposits(celestialBodyId);
  
  // Check if body needs initial deposits
  const needsDeposits = await bodyNeedsDeposits(celestialBodyId);
  
  if (needsDeposits) {
    await spawnDepositsForBody(body);
  }
  
  // Return current deposits
  return getDepositsForBody(celestialBodyId);
};

// Get deposit by ID
const getDepositById = async (depositId) => {
  return queryOne(`
    SELECT 
      rd.*,
      rt.name as resource_name,
      rt.category,
      rt.rarity,
      rt.base_price,
      rt.icon,
      cb.name as body_name
    FROM resource_deposits rd
    JOIN resource_types rt ON rd.resource_type_id = rt.id
    JOIN celestial_bodies cb ON rd.celestial_body_id = cb.id
    WHERE rd.id = $1
  `, [depositId]);
};

// Deplete a deposit (reduce quantity, mark as depleted if empty)
const depleteDeposit = async (depositId, amount) => {
  const deposit = await getDepositById(depositId);
  
  if (!deposit) {
    throw new Error(`Deposit ${depositId} not found`);
  }
  
  const newQuantity = Math.max(0, deposit.quantity_remaining - amount);
  const isDepleted = newQuantity === 0;
  
  const result = await queryOne(`
    UPDATE resource_deposits
    SET 
      quantity_remaining = $1,
      depleted_at = $2
    WHERE id = $3
    RETURNING *
  `, [
    newQuantity,
    isDepleted ? new Date() : null,
    depositId
  ]);
  
  if (isDepleted) {
    console.log(`⛏️ Deposit ${depositId} fully depleted`);
  }
  
  return result;
};

export {
  getDepositsForBody,
  ensureDepositsExist,
  spawnDepositsForBody,
  respawnDepletedDeposits,
  getDepositById,
  depleteDeposit,
  getDepositSlots,
  generateStats,
  generateQuantity,
};
