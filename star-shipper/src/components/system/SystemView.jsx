import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
// DraggableWindow removed — SystemView now renders full-screen
import { useGameStore, useShips, useActiveShip } from '@/stores/gameStore';
import { getShipIcon, FORMATION_OFFSETS, MAX_FLEET_SIZE, HULL_SHAPES, PIRATE_HULLS, FACTIONS } from '@/utils/shipRenderer';
import { getShipWeapons, WEAPON_DEFAULTS } from '@/utils/weapons';
import { computeFleetStats } from '@/utils/fleetStats';
import { getFleetScanTimeMs, getFleetScanRange, DEFAULT_SCAN_RANGE } from '@/utils/shipStats';
import { getQualityTier } from '@/data/resources';
import { fittingAPI, wrecksAPI, asteroidsAPI } from '@/utils/api';
import { playSound, startLoop, stopLoop } from '@/utils/audio';
import { generateGalaxy, generateSystemContent, FACTIONS as GALAXY_FACTIONS } from '@/utils/galaxyGenerator';
import { useTooltip } from '@/components/ui/TooltipProvider';
import { PlanetInteractionWindow } from './PlanetInteractionWindow';

// ============================================
// CONSTANTS
// ============================================

const SYSTEM_SIZE = 10000;
const MIN_ZOOM = 1.0;
const MAX_ZOOM = 3;
const ZOOM_SPEED = 0.001;

// Ship physics - tuned for 10-30 second travel between planets
// These are base values; actual values scale from active ship stats
const BASE_SHIP_ACCELERATION = 100;
const SHIP_BRAKE_POWER = 250; // Strong brakes for reliable stopping
const BASE_SHIP_MAX_SPEED = 180;
const SHIP_DRAG = 0.992; // More drag helps with stopping
const BASE_SHIP_ROTATION_SPEED = 150; // Degrees per second

// ============================================
// COMBAT CONSTANTS
// ============================================
const PIRATE_AGGRO_RANGE = 350; // Distance to start chasing player
const PIRATE_ATTACK_RANGE = 150; // Distance to start firing
const PIRATE_ORBIT_RANGE = 100; // Preferred combat distance
const PIRATE_DEAGGRO_RANGE = 600; // Distance to give up chase
const PROJECTILE_SPEED = 400;
const PROJECTILE_LIFETIME = 0.8; // seconds
// (PLAYER_FIRE_RANGE / PLAYER_BASE_DAMAGE / PLAYER_BASE_FIRE_RATE removed —
//  per-ship firing now reads weapon stats from each ship's fitted modules.)
const SHIELD_REGEN_RATE = 2; // shield HP per second
const SHIELD_REGEN_DELAY = 3; // seconds after last hit before regen starts
const LOOT_CREDITS_MIN = 20;
const LOOT_CREDITS_MAX = 80;

// Pirate spawn zones — defined by center point + radius
const PIRATE_SPAWN_ZONES = [
  { name: 'Belt Raiders', cx: 1500, cy: 0, radius: 400, count: 3, types: ['pirate_interceptor', 'pirate_interceptor', 'pirate_marauder'] },
  { name: 'Outer Patrol', cx: -2500, cy: 1500, radius: 500, count: 2, types: ['pirate_marauder', 'pirate_destroyer'] },
  { name: 'Jupiter Ambush', cx: 2200, cy: -800, radius: 350, count: 3, types: ['pirate_interceptor', 'pirate_marauder', 'pirate_interceptor'] },
  { name: 'Saturn Corsairs', cx: -1000, cy: -3000, radius: 400, count: 2, types: ['pirate_marauder', 'pirate_destroyer'] },
];

// Galaxy singleton (same seed as GalaxyMapWindow)
const GALAXY_SEED = 12345;
const GALAXY_SYSTEM_COUNT = 200;
let _galaxyCache = null;
const getGalaxy = () => {
  if (!_galaxyCache) _galaxyCache = generateGalaxy(GALAXY_SEED, GALAXY_SYSTEM_COUNT);
  return _galaxyCache;
};

// Generate pirates for any system from its seed + danger level
const generatePiratesForSystem = (systemSeed, dangerLevel, bodies) => {
  const rng = new SeededRandom(systemSeed + 7777);
  const enemies = [];
  let nextId = 1;
  
  // Number of pirates scales with danger level (0 = none, 5 = lots)
  const pirateCount = Math.floor(dangerLevel * 1.5 + rng.range(0, dangerLevel));
  if (pirateCount <= 0) return enemies;
  
  const hullPool = dangerLevel >= 4
    ? ['pirate_interceptor', 'pirate_marauder', 'pirate_destroyer']
    : dangerLevel >= 2
      ? ['pirate_interceptor', 'pirate_marauder', 'pirate_interceptor']
      : ['pirate_interceptor', 'pirate_interceptor'];
  
  // Find the outermost orbit to place pirates near
  const maxOrbit = Math.max(800, ...bodies.filter(b => b.orbitRadius).map(b => b.orbitRadius));
  
  for (let i = 0; i < pirateCount; i++) {
    const hullId = hullPool[rng.int(0, hullPool.length - 1)];
    const hull = PIRATE_HULLS[hullId];
    if (!hull) continue;
    
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(maxOrbit * 0.3, maxOrbit * 0.9);
    const icon = getShipIcon(hullId);
    
    enemies.push({
      id: `pirate_${nextId++}`,
      hullId,
      icon,
      faction: 'pirate',
      name: `${FACTIONS.pirate.name} ${hull.displaySize > 9 ? 'Destroyer' : hull.displaySize > 7 ? 'Marauder' : 'Interceptor'}`,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      vx: 0, vy: 0,
      rotation: rng.range(-180, 180),
      hull: hull.stats.maxHull,
      maxHull: hull.stats.maxHull,
      shield: hull.stats.maxShield,
      maxShield: hull.stats.maxShield,
      speed: hull.stats.speed,
      damage: hull.stats.damage,
      fireRate: hull.stats.fireRate,
      range: hull.stats.range,
      fireCooldown: 0,
      shieldRegenTimer: 0,
      engineColor: hull.palette.engine,
      displaySize: hull.displaySize,
      state: 'patrol',
      patrolCenter: { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist },
      patrolAngle: rng.range(0, Math.PI * 2),
      patrolRadius: rng.range(50, 150),
      targetId: null,
      lootCredits: Math.round(rng.range(LOOT_CREDITS_MIN, LOOT_CREDITS_MAX) * (hull.displaySize / 6) * (1 + dangerLevel * 0.3)),
    });
  }
  
  return enemies;
};

// ============================================
// SEEDED RANDOM (for procedural generation)
// ============================================

class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  
  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  
  range(min, max) {
    return min + this.next() * (max - min);
  }
  
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  
  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }
  
  chance(probability) {
    return this.next() < probability;
  }
}

// ============================================
// STAR TYPES
// ============================================

const STAR_TYPES = {
  red_dwarf: {
    name: 'Red Dwarf',
    rarity: 0.50,
    colors: { core: '#ff6644', mid: '#ff4422', outer: '#cc2200', glow: '#ff330033' },
    size: 40,
    planetCount: [1, 3],
    planetTypes: ['rocky', 'ice'],
    asteroidBelts: [0, 1],
    stationChance: 0.30,
  },
  orange_star: {
    name: 'Orange Star',
    rarity: 0.15,
    colors: { core: '#ffffff', mid: '#ffcc88', outer: '#ffaa44', glow: '#ff880033' },
    size: 50,
    planetCount: [3, 6],
    planetTypes: ['rocky', 'desert', 'ice', 'terran'],
    asteroidBelts: [0, 2],
    stationChance: 0.30,
  },
  yellow_star: {
    name: 'Yellow Star',
    rarity: 0.25,
    colors: { core: '#ffffff', mid: '#fff7aa', outer: '#ffdd44', glow: '#ffcc0033' },
    size: 60,
    planetCount: [4, 8],
    planetTypes: ['rocky', 'terran', 'desert', 'ice', 'gas_giant', 'ocean'],
    asteroidBelts: [1, 2],
    stationChance: 0.35,
  },
  blue_giant: {
    name: 'Blue Giant',
    rarity: 0.10,
    colors: { core: '#ffffff', mid: '#aaddff', outer: '#4488ff', glow: '#0066ff33' },
    size: 100,
    planetCount: [5, 10],
    planetTypes: ['lava', 'gas_giant', 'ice', 'rocky'],
    asteroidBelts: [1, 3],
    stationChance: 0.20,
  },
  white_dwarf: {
    name: 'White Dwarf',
    rarity: 0.08,
    colors: { core: '#ffffff', mid: '#eeeeff', outer: '#aabbcc', glow: '#ffffff22' },
    size: 25,
    planetCount: [0, 3],
    planetTypes: ['barren', 'ice'],
    asteroidBelts: [0, 1],
    stationChance: 0.15,
  },
  neutron_star: {
    name: 'Neutron Star',
    rarity: 0.05,
    colors: { core: '#ffffff', mid: '#dd88ff', outer: '#8844aa', glow: '#aa44ff44' },
    size: 15,
    planetCount: [0, 2],
    planetTypes: ['exotic', 'barren'],
    asteroidBelts: [0, 1],
    stationChance: 0.10,
    pulsar: true,
  },
  black_hole: {
    name: 'Black Hole',
    rarity: 0.02,
    colors: { core: '#000000', mid: '#110011', outer: '#220022', glow: '#ff440022', accretion: '#ff6600' },
    size: 50,
    planetCount: [0, 1],
    planetTypes: ['exotic'],
    asteroidBelts: [0, 2],
    stationChance: 0.05,
    hasAccretionDisk: true,
  },
};

// ============================================
// PLANET TYPES
// ============================================

const PLANET_TYPES = {
  rocky: { name: 'Rocky', colors: ['#888888', '#777766', '#665544'], sizeRange: [15, 30] },
  terran: { name: 'Terran', colors: ['#4488aa', '#55aa66', '#446633'], sizeRange: [25, 40], hasAtmosphere: true },
  desert: { name: 'Desert', colors: ['#ddaa66', '#cc8844', '#aa6622'], sizeRange: [20, 35] },
  ice: { name: 'Ice', colors: ['#aaddff', '#88bbee', '#99ccff'], sizeRange: [15, 35] },
  gas_giant: { name: 'Gas Giant', colors: ['#ddaa77', '#cc9966', '#ffcc88'], sizeRange: [60, 120], hasRings: 0.4 },
  ocean: { name: 'Ocean', colors: ['#2266aa', '#3377bb', '#4488cc'], sizeRange: [25, 40], hasAtmosphere: true },
  lava: { name: 'Lava', colors: ['#ff4400', '#cc3300', '#aa2200'], sizeRange: [15, 30], hasGlow: true },
  barren: { name: 'Barren', colors: ['#444444', '#555555', '#333333'], sizeRange: [10, 25] },
  exotic: { name: 'Exotic', colors: ['#aa44ff', '#ff44aa', '#44ffaa'], sizeRange: [20, 50], hasGlow: true },
};

// ============================================
// SOL SYSTEM (Handcrafted)
// ============================================

const SOL_SYSTEM = {
  id: 'sol',
  name: 'Sol',
  starType: 'yellow_star',
  bodies: [
    // Orbital speeds follow Kepler's 3rd law: speed ∝ 1/√(radius)
    // Random orbit offsets for starting positions
    { id: 'mercury', name: 'Mercury', type: 'planet', planetType: 'rocky', orbitRadius: 400, orbitSpeed: 0.015, orbitOffset: 2.1, size: 12, color: '#aaaaaa' },
    { id: 'venus', name: 'Venus', type: 'planet', planetType: 'desert', orbitRadius: 600, orbitSpeed: 0.011, orbitOffset: 4.7, size: 22, color: '#ddaa66' },
    { id: 'earth', name: 'Earth', type: 'planet', planetType: 'terran', orbitRadius: 850, orbitSpeed: 0.008, orbitOffset: 1.3, size: 25, color: '#4488aa', hasAtmosphere: true },
    { id: 'luna_station', name: 'Luna Station', type: 'station', parentBody: 'earth', orbitRadius: 50, orbitSpeed: 0.04, orbitOffset: 0.5, size: 8 },
    { id: 'mars', name: 'Mars', type: 'planet', planetType: 'desert', orbitRadius: 1100, orbitSpeed: 0.006, orbitOffset: 5.9, size: 18, color: '#cc6644' },
    { id: 'asteroid_belt_1', name: 'Asteroid Belt', type: 'asteroid_belt', orbitRadius: 1500, width: 250, density: 300 },
    { id: 'jupiter', name: 'Jupiter', type: 'planet', planetType: 'gas_giant', orbitRadius: 2200, orbitSpeed: 0.003, orbitOffset: 3.2, size: 80, color: '#ddaa77', hasRings: false },
    { id: 'saturn', name: 'Saturn', type: 'planet', planetType: 'gas_giant', orbitRadius: 3000, orbitSpeed: 0.002, orbitOffset: 0.8, size: 70, color: '#ddcc88', hasRings: true },
    { id: 'uranus', name: 'Uranus', type: 'planet', planetType: 'ice', orbitRadius: 3800, orbitSpeed: 0.0012, orbitOffset: 4.1, size: 40, color: '#88ccdd' },
    { id: 'neptune', name: 'Neptune', type: 'planet', planetType: 'ice', orbitRadius: 4500, orbitSpeed: 0.0008, orbitOffset: 2.6, size: 38, color: '#4466cc' },
    { id: 'jump_gate', name: 'Jump Gate', type: 'jump_gate', orbitRadius: 5200, orbitSpeed: 0.0005, orbitOffset: 1.0, size: 12 },
    { id: 'warp_point', name: 'Warp Point', type: 'warp_point', orbitRadius: 5600, orbitSpeed: 0.0003, orbitOffset: 4.2, size: 10 },
  ],
};

// ============================================
// STARFIELD GENERATION (more stars!)
// ============================================

const generateStars = (count, layer, seed = 12345) => {
  const rng = new SeededRandom(seed + (layer === 'far' ? 0 : layer === 'mid' ? 1000 : 2000));
  const stars = [];
  const spread = SYSTEM_SIZE * 4;
  
  for (let i = 0; i < count; i++) {
    stars.push({
      id: `${layer}-${i}`,
      x: rng.range(-spread, spread),
      y: rng.range(-spread, spread),
      size: rng.range(
        layer === 'far' ? 0.5 : layer === 'mid' ? 0.8 : 1.2,
        layer === 'far' ? 1.5 : layer === 'mid' ? 2.2 : 3
      ),
      opacity: rng.range(
        layer === 'far' ? 0.3 : layer === 'mid' ? 0.5 : 0.6,
        layer === 'far' ? 0.6 : layer === 'mid' ? 0.8 : 1.0
      ),
      twinkleSpeed: rng.range(0.5, 3),
      twinkleOffset: rng.range(0, Math.PI * 2),
      // More colorful stars
      color: rng.chance(0.15) ? rng.pick(['#ffddaa', '#aaddff', '#ffaaaa', '#aaffaa', '#ffaaff', '#ffffaa']) : '#ffffff',
    });
  }
  return stars;
};

// LOTS more stars for a rich cosmic background
const STAR_LAYERS = {
  far: generateStars(800, 'far'),
  mid: generateStars(500, 'mid'),
  near: generateStars(300, 'near'),
};

// Parallax factors
const PARALLAX = {
  far: 0.05,
  mid: 0.15,
  near: 0.35,
};

// ============================================
// STAR COMPONENT (Multiple Types)
// ============================================

const Star = ({ starType, x, y, time }) => {
  const config = STAR_TYPES[starType];
  if (!config) return null;

  const { colors, size, pulsar, hasAccretionDisk } = config;
  const pulsarPhase = pulsar ? Math.sin(time * 5) * 0.2 + 0.8 : 1;

  if (hasAccretionDisk) {
    // Black hole with accretion disk
    return (
      <g transform={`translate(${x}, ${y})`}>
        <defs>
          <radialGradient id={`accretion-${starType}`} cx="50%" cy="50%" r="50%">
            <stop offset="20%" stopColor="#000000" />
            <stop offset="40%" stopColor={colors.accretion} stopOpacity="0.8" />
            <stop offset="70%" stopColor="#ff4400" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Accretion disk */}
        <ellipse rx={size * 3} ry={size * 0.8} fill="url(#accretion-black_hole)" opacity={0.7} />
        {/* Event horizon */}
        <circle r={size} fill="#000000" />
        {/* Gravitational lensing effect */}
        <circle r={size * 1.2} fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.3" />
      </g>
    );
  }

  return (
    <g transform={`translate(${x}, ${y})`}>
      <defs>
        <radialGradient id={`starGlow-${starType}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={colors.core} stopOpacity="1" />
          <stop offset="40%" stopColor={colors.mid} stopOpacity="0.8" />
          <stop offset="70%" stopColor={colors.outer} stopOpacity="0.4" />
          <stop offset="100%" stopColor={colors.outer} stopOpacity="0" />
        </radialGradient>
        <filter id={`starBlur-${starType}`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation={size * 0.3} />
        </filter>
      </defs>
      
      {/* Outer glow */}
      <circle r={size * 3} fill={colors.glow} filter={`url(#starBlur-${starType})`} opacity={0.5 * pulsarPhase} />
      
      {/* Corona */}
      <circle r={size * 1.8} fill={`url(#starGlow-${starType})`} opacity={0.8 * pulsarPhase} />
      
      {/* Core */}
      <circle r={size} fill={colors.mid} opacity={pulsarPhase} />
      
      {/* Bright center */}
      <circle r={size * 0.4} fill={colors.core} opacity={0.95 * pulsarPhase} />

      {/* Pulsar beams */}
      {pulsar && (
        <g style={{ transform: `rotate(${time * 100}deg)` }}>
          <rect x={-2} y={-size * 5} width={4} height={size * 10} fill="#ffffff" opacity={0.6} />
        </g>
      )}
    </g>
  );
};

// ============================================
// PLANET COMPONENT
// ============================================

const Planet = ({ body, time, onClick, isTarget }) => {
  // Calculate orbital position
  const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
  const x = Math.cos(angle) * body.orbitRadius;
  const y = Math.sin(angle) * body.orbitRadius;

  const planetConfig = PLANET_TYPES[body.planetType] || {};
  const planetColor = body.color || (planetConfig.colors ? planetConfig.colors[0] : '#888888');

  return (
    <g>
      {/* Orbit path */}
      <circle
        cx={0}
        cy={0}
        r={body.orbitRadius}
        fill="none"
        stroke="#4488aa"
        strokeWidth="1"
        opacity="0.25"
      />

      {/* Planet */}
      <g 
        transform={`translate(${x}, ${y})`}
        onClick={onClick}
        style={{ cursor: 'pointer' }}
      >
        {/* Target highlight ring */}
        {isTarget && (
          <>
            <circle 
              r={body.size + 20} 
              fill="none" 
              stroke="#00ffff" 
              strokeWidth="2" 
              opacity="0.6"
              strokeDasharray="8 4"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0"
                to="360"
                dur="4s"
                repeatCount="indefinite"
              />
            </circle>
            <circle r={body.size + 10} fill="#00ffff" opacity="0.1" />
          </>
        )}
        
        {/* Atmosphere glow */}
        {body.hasAtmosphere && (
          <circle r={body.size * 1.15} fill={planetColor} opacity="0.2" />
        )}
        
        {/* Lava/exotic glow */}
        {planetConfig.hasGlow && (
          <circle r={body.size * 1.3} fill={planetColor} opacity="0.3" filter="url(#planetGlow)" />
        )}

        {/* Rings */}
        {body.hasRings && (
          <ellipse
            rx={body.size * 1.8}
            ry={body.size * 0.4}
            fill="none"
            stroke="#ccbb99"
            strokeWidth={body.size * 0.15}
            opacity="0.6"
          />
        )}

        {/* Planet body */}
        <circle r={body.size} fill={planetColor} />
        
        {/* Highlight */}
        <circle
          cx={-body.size * 0.3}
          cy={-body.size * 0.3}
          r={body.size * 0.7}
          fill="url(#planetHighlight)"
          opacity="0.4"
        />

        {/* Label */}
        <text
          y={body.size + 15}
          textAnchor="middle"
          fill={isTarget ? "#00ffff" : "#88ccff"}
          fontSize="10"
          fontFamily="sans-serif"
          fontWeight={isTarget ? "bold" : "normal"}
        >
          {body.name}
        </text>
      </g>
    </g>
  );
};

// ============================================
// STATION COMPONENT
// ============================================

const Station = ({ body, parentPosition, time, onClick, isTarget }) => {
  // If station orbits a planet, calculate position relative to parent
  const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
  const localX = Math.cos(angle) * body.orbitRadius;
  const localY = Math.sin(angle) * body.orbitRadius;
  
  const x = parentPosition.x + localX;
  const y = parentPosition.y + localY;

  return (
    <g 
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {/* Target highlight ring */}
      {isTarget && (
        <>
          <circle 
            r="18" 
            fill="none" 
            stroke="#00ffff" 
            strokeWidth="2" 
            opacity="0.6"
            strokeDasharray="6 3"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0"
              to="360"
              dur="3s"
              repeatCount="indefinite"
            />
          </circle>
          <circle r="14" fill="#00ffff" opacity="0.1" />
        </>
      )}
      
      {/* Station shape - hexagonal */}
      <polygon
        points="-8,-4 -4,-8 4,-8 8,-4 8,4 4,8 -4,8 -8,4"
        fill="#334455"
        stroke={isTarget ? "#00ffff" : "#66aacc"}
        strokeWidth={isTarget ? "2" : "1"}
      />
      {/* Docking lights */}
      <circle cx="-6" cy="0" r="2" fill="#00ff88" opacity={Math.sin(time * 3) * 0.5 + 0.5} />
      <circle cx="6" cy="0" r="2" fill="#00ff88" opacity={Math.sin(time * 3 + Math.PI) * 0.5 + 0.5} />
      
      {/* Label */}
      <text
        y={16}
        textAnchor="middle"
        fill={isTarget ? "#00ffff" : "#00ff88"}
        fontSize="9"
        fontFamily="sans-serif"
        fontWeight={isTarget ? "bold" : "normal"}
      >
        {body.name}
      </text>
    </g>
  );
};

// ============================================
// JUMP GATE COMPONENT
// ============================================
const JumpGate = ({ body, time, onClick, isTarget }) => {
  const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
  const x = Math.cos(angle) * body.orbitRadius;
  const y = Math.sin(angle) * body.orbitRadius;
  const pulse = Math.sin(time * 2) * 0.3 + 0.7;

  return (
    <g transform={`translate(${x}, ${y})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Target highlight */}
      {isTarget && (
        <>
          <circle r="22" fill="none" stroke="#44ff88" strokeWidth="2" opacity="0.6" strokeDasharray="6 3">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle r="16" fill="#44ff8811" />
        </>
      )}
      
      {/* Gate ring */}
      <circle r="10" fill="none" stroke="#44ff88" strokeWidth="2" opacity={pulse} />
      <circle r="6" fill="none" stroke="#44ff88" strokeWidth="1" opacity={pulse * 0.6} />
      
      {/* Energy core */}
      <circle r="3" fill="#44ff88" opacity={pulse * 0.8} />
      <circle r="5" fill="#44ff8844" />
      
      {/* Corner accents */}
      {[0, 90, 180, 270].map(deg => (
        <line key={deg}
          x1={Math.cos(deg * Math.PI / 180) * 8} y1={Math.sin(deg * Math.PI / 180) * 8}
          x2={Math.cos(deg * Math.PI / 180) * 12} y2={Math.sin(deg * Math.PI / 180) * 12}
          stroke="#44ff88" strokeWidth="1.5" opacity={pulse * 0.7}
        />
      ))}
      
      {/* Label */}
      <text y={20} textAnchor="middle" fill={isTarget ? '#44ff88' : '#44ff8899'}
        fontSize="9" fontFamily="sans-serif" fontWeight={isTarget ? 'bold' : 'normal'}>
        {body.name}
      </text>
    </g>
  );
};

// ============================================
// WARP POINT COMPONENT (every system has one — generic system exit)
// ============================================

const WarpPoint = ({ body, time, onClick, isTarget }) => {
  const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
  const x = Math.cos(angle) * body.orbitRadius;
  const y = Math.sin(angle) * body.orbitRadius;
  const pulse = Math.sin(time * 3) * 0.3 + 0.7;
  const swirl = time * 60; // rotation degrees for swirl effect

  return (
    <g transform={`translate(${x}, ${y})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      {/* Target highlight */}
      {isTarget && (
        <>
          <circle r="22" fill="none" stroke="#8844ff" strokeWidth="2" opacity="0.6" strokeDasharray="6 3">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle r="16" fill="#8844ff11" />
        </>
      )}
      
      {/* Outer distortion ring */}
      <circle r="11" fill="none" stroke="#6644cc" strokeWidth="1.5" opacity={pulse * 0.5}
        strokeDasharray="4 3" style={{ transform: `rotate(${swirl}deg)`, transformOrigin: '0 0' }} />
      
      {/* Inner vortex ring */}
      <circle r="7" fill="none" stroke="#aa66ff" strokeWidth="1.5" opacity={pulse * 0.7}
        strokeDasharray="3 2" style={{ transform: `rotate(${-swirl * 1.5}deg)`, transformOrigin: '0 0' }} />
      
      {/* Core — purple/blue energy */}
      <circle r="4" fill="#7744dd" opacity={pulse * 0.9} />
      <circle r="6" fill="#8855ff33" />
      <circle r="2" fill="#ccaaff" opacity={pulse} />
      
      {/* Label */}
      <text y={20} textAnchor="middle" fill={isTarget ? '#aa66ff' : '#8855ff88'}
        fontSize="9" fontFamily="sans-serif" fontWeight={isTarget ? 'bold' : 'normal'}>
        {body.name}
      </text>
    </g>
  );
};

// ============================================
// ASTEROID BELT COMPONENT
// ============================================

const AsteroidBelt = ({ body }) => {
  // Generate asteroids with seeded random
  const rng = useMemo(() => new SeededRandom(body.id?.charCodeAt(0) || 999), [body.id]);
  
  const asteroids = useMemo(() => {
    const arr = [];
    const count = body.density || 300;
    for (let i = 0; i < count; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = body.orbitRadius + rng.range(-body.width / 2, body.width / 2);
      arr.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        size: rng.range(1, 5),
        opacity: rng.range(0.4, 0.9),
        color: rng.pick(['#888888', '#777777', '#999999', '#666666', '#aaaaaa']),
      });
    }
    return arr;
  }, [body, rng]);

  return (
    <g>
      {/* Individual asteroids only - no background */}
      {asteroids.map((ast, i) => (
        <circle
          key={i}
          cx={ast.x}
          cy={ast.y}
          r={ast.size}
          fill={ast.color}
          opacity={ast.opacity}
        />
      ))}
    </g>
  );
};

// ============================================
// STARFIELD COMPONENT
// ============================================

const Starfield = ({ camera, zoom, time }) => {
  return (
    <g>
      {Object.entries(STAR_LAYERS).map(([layer, stars]) => (
        <g key={layer}>
          {stars.map(star => {
            // Parallax based on layer
            const px = star.x - camera.x * PARALLAX[layer];
            const py = star.y - camera.y * PARALLAX[layer];
            
            // Twinkle
            const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.3 + 0.7;
            
            return (
              <circle
                key={star.id}
                cx={px}
                cy={py}
                r={star.size}
                fill={star.color}
                opacity={star.opacity * twinkle}
              />
            );
          })}
        </g>
      ))}
    </g>
  );
};

// ============================================
// MINIMAP COMPONENT
// ============================================

const Minimap = ({ system, camera, zoom, viewportSize, shipPos, time, onClickBody, autopilotTarget }) => {
  const mapSize = 160;
  
  // Find the furthest orbiting object to scale the minimap
  const maxOrbit = Math.max(...system.bodies.map(b => b.orbitRadius || 0));
  const mapScale = (mapSize * 0.45) / maxOrbit; // Furthest orbit at 90% of minimap radius
  
  const starConfig = STAR_TYPES[system.starType];
  
  // Calculate body position at current time
  const getBodyPos = (body) => {
    if (body.parentBody) {
      const parent = system.bodies.find(b => b.id === body.parentBody);
      const parentAngle = time * parent.orbitSpeed + (parent.orbitOffset || 0);
      const parentPos = {
        x: Math.cos(parentAngle) * parent.orbitRadius,
        y: Math.sin(parentAngle) * parent.orbitRadius,
      };
      const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
      return {
        x: parentPos.x + Math.cos(angle) * body.orbitRadius,
        y: parentPos.y + Math.sin(angle) * body.orbitRadius,
      };
    }
    const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
    return {
      x: Math.cos(angle) * body.orbitRadius,
      y: Math.sin(angle) * body.orbitRadius,
    };
  };

  return (
    <div className="absolute top-3 right-3 bg-slate-900/90 border border-cyan-500/30 rounded-lg p-2">
      <svg width={mapSize} height={mapSize} viewBox={`${-mapSize/2} ${-mapSize/2} ${mapSize} ${mapSize}`}>
        {/* Background */}
        <rect x={-mapSize/2} y={-mapSize/2} width={mapSize} height={mapSize} fill="#0a0a15" rx="4" />
        
        {/* Orbit lines */}
        {system.bodies.map(body => {
          if (body.type === 'planet') {
            return (
              <circle
                key={`orbit-${body.id}`}
                cx={0}
                cy={0}
                r={body.orbitRadius * mapScale}
                fill="none"
                stroke="#335566"
                strokeWidth="0.5"
                opacity="0.6"
              />
            );
          }
          if (body.type === 'asteroid_belt') {
            return (
              <circle
                key={body.id}
                cx={0}
                cy={0}
                r={body.orbitRadius * mapScale}
                fill="none"
                stroke="#666666"
                strokeWidth="3"
                opacity="0.4"
              />
            );
          }
          if (body.type === 'jump_gate') {
            return (
              <circle key={`orbit-${body.id}`} cx={0} cy={0}
                r={body.orbitRadius * mapScale}
                fill="none" stroke="#44ff88" strokeWidth="0.5"
                strokeDasharray="2,3" opacity="0.25"
              />
            );
          }
          if (body.type === 'warp_point') {
            return (
              <circle key={`orbit-${body.id}`} cx={0} cy={0}
                r={body.orbitRadius * mapScale}
                fill="none" stroke="#8855ff" strokeWidth="0.5"
                strokeDasharray="2,3" opacity="0.25"
              />
            );
          }
          return null;
        })}
        
        {/* Star */}
        <circle cx={0} cy={0} r={4} fill={starConfig?.colors.mid || '#ffdd44'} />
        
        {/* Planets - live positions, clickable */}
        {system.bodies
          .filter(b => b.type === 'planet')
          .map(body => {
            const pos = getBodyPos(body);
            const isTarget = autopilotTarget?.id === body.id;
            const dotSize = Math.max(2, Math.min(5, body.size * mapScale * 0.15));
            return (
              <g 
                key={`planet-${body.id}`}
                transform={`translate(${pos.x * mapScale}, ${pos.y * mapScale})`}
                onClick={() => onClickBody(body)}
                style={{ cursor: 'pointer' }}
              >
                {isTarget && (
                  <circle r={dotSize + 4} fill="none" stroke="#00ffff" strokeWidth="1" opacity="0.8" />
                )}
                <circle r={dotSize} fill={body.color || (PLANET_TYPES[body.planetType]?.colors?.[0]) || "#888"} />
              </g>
            );
          })}
        
        {/* Stations - live positions, clickable */}
        {system.bodies
          .filter(b => b.type === 'station')
          .map(body => {
            const pos = getBodyPos(body);
            const isTarget = autopilotTarget?.id === body.id;
            return (
              <g 
                key={`station-${body.id}`}
                transform={`translate(${pos.x * mapScale}, ${pos.y * mapScale})`}
                onClick={() => onClickBody(body)}
                style={{ cursor: 'pointer' }}
              >
                {isTarget && (
                  <circle r="6" fill="none" stroke="#00ffff" strokeWidth="1" opacity="0.8" />
                )}
                <rect x="-2" y="-2" width="4" height="4" fill="#00ff88" />
              </g>
            );
          })}
        
        {/* Jump gates - green diamond, clickable */}
        {system.bodies
          .filter(b => b.type === 'jump_gate')
          .map(body => {
            const pos = getBodyPos(body);
            const isTarget = autopilotTarget?.id === body.id;
            return (
              <g 
                key={`gate-${body.id}`}
                transform={`translate(${pos.x * mapScale}, ${pos.y * mapScale})`}
                onClick={() => onClickBody(body)}
                style={{ cursor: 'pointer' }}
              >
                {isTarget && (
                  <circle r="7" fill="none" stroke="#00ffff" strokeWidth="1" opacity="0.8" />
                )}
                <polygon points="0,-4 4,0 0,4 -4,0" fill="#44ff88" opacity="0.8" />
              </g>
            );
          })}
        
        {/* Warp points - purple diamond, clickable */}
        {system.bodies
          .filter(b => b.type === 'warp_point')
          .map(body => {
            const pos = getBodyPos(body);
            const isTarget = autopilotTarget?.id === body.id;
            return (
              <g 
                key={`warp-${body.id}`}
                transform={`translate(${pos.x * mapScale}, ${pos.y * mapScale})`}
                onClick={() => onClickBody(body)}
                style={{ cursor: 'pointer' }}
              >
                {isTarget && (
                  <circle r="7" fill="none" stroke="#00ffff" strokeWidth="1" opacity="0.8" />
                )}
                <polygon points="0,-4 4,0 0,4 -4,0" fill="#8855ff" opacity="0.8" />
              </g>
            );
          })}
        
        {/* Ship position */}
        {shipPos && (
          <g transform={`translate(${shipPos.x * mapScale}, ${shipPos.y * mapScale})`}>
            <circle r="4" fill="#00ff88" opacity="0.3" />
            <circle r="2" fill="#00ff88" />
          </g>
        )}
        
        {/* Camera viewport indicator */}
        <rect
          x={camera.x * mapScale - (viewportSize.width / zoom * mapScale / 2)}
          y={camera.y * mapScale - (viewportSize.height / zoom * mapScale / 2)}
          width={Math.max(4, (viewportSize.width / zoom) * mapScale)}
          height={Math.max(4, (viewportSize.height / zoom) * mapScale)}
          fill="none"
          stroke="#00ffff"
          strokeWidth="1.5"
          opacity="0.9"
        />
      </svg>
      <div className="text-center text-xs text-cyan-400/70 mt-1">{system.name}</div>
    </div>
  );
};

// ============================================
// SYSTEM VIEW COMPONENT
// ============================================

export const SystemView = () => {
  const closeWindow = useGameStore(state => state.closeWindow);
  const openWindow = useGameStore(state => state.openWindow);
  const openContextPanel = useGameStore(state => state.openContextPanel);
  const ships = useShips();
  const playerShip = useActiveShip();
  const fetchShips = useGameStore(state => state.fetchShips);
  const pushToast = useGameStore(state => state.pushToast);
  const completeQuest = useGameStore(state => state.completeQuest);
  // Active skill bonuses (Phase 1: Gunnery -> fleet_damage_pct,
  // Astrometrics -> sensor_range_pct). Mirrored to a ref so the
  // game-loop closure reads the current value rather than the one
  // captured at mount (the loop's useEffect uses []).
  const activeBonuses = useGameStore(state => state.activeBonuses);
  const fetchSkillsAndResearch = useGameStore(state => state.fetchSkillsAndResearch);
  const activeBonusesRef = useRef(activeBonuses);
  activeBonusesRef.current = activeBonuses;
  // First-load fetch + 60s refresh so completed-while-flying skills
  // start applying without needing the player to open the window.
  useEffect(() => {
    if (fetchSkillsAndResearch) fetchSkillsAndResearch();
    if (!fetchSkillsAndResearch) return undefined;
    const t = setInterval(fetchSkillsAndResearch, 60000);
    return () => clearInterval(t);
  }, [fetchSkillsAndResearch]);
  const { showTooltip, hideTooltip } = useTooltip();
  // Pod state: when active ship is the 'pod' hull, pirates ignore us and
  // we can't fight back. See migration 019 + /enter-pod endpoint.
  const isPod = playerShip?.hull_type_id === 'pod';
  const shipHullSize = playerShip?.hull_size || 30;

  // Derive flight physics from the SLOWEST + LEAST MANEUVERABLE
  // ship in the active fleet. Wingmen lag-lerp to their formation
  // slot so visually they always catch up, but capping the primary
  // at the slowest hull means a Leviathan tagging along actually
  // slows the fleet down. Makes the ship-loadout decision real.
  // base 50 = 1.0x multiplier (baseline), 120 = 2.4x, 25 = 0.5x.
  // Read computed_max_speed (server-aggregated from base hull + engine
  // module thrust * quality) when present; fall back to base_speed for
  // ships that haven't been re-fitted since migration 047. Same for
  // maneuver, which today has no engine-module contribution so it
  // always uses the hull base.
  const activeFleet = (ships || []).filter(s => s.storage_body_id == null);
  const shipSpeed = (s) => s.computed_max_speed ?? s.base_speed ?? 50;
  const minBaseSpeed = activeFleet.length > 0
    ? Math.min(...activeFleet.map(shipSpeed))
    : shipSpeed(playerShip || {});
  const minBaseManeuver = activeFleet.length > 0
    ? Math.min(...activeFleet.map(s => s.base_maneuver ?? 50))
    : (playerShip?.base_maneuver ?? 50);
  const speedMult = minBaseSpeed / 50;
  const maneuverMult = minBaseManeuver / 50;
  const SHIP_MAX_SPEED = BASE_SHIP_MAX_SPEED * Math.max(0.3, Math.min(3, speedMult));
  const SHIP_ACCELERATION = BASE_SHIP_ACCELERATION * Math.max(0.3, Math.min(3, speedMult));
  const SHIP_ROTATION_SPEED = BASE_SHIP_ROTATION_SPEED * Math.max(0.3, Math.min(3, maneuverMult));

  // Keep refs so animation loop always reads latest
  const shipPhysicsRef = useRef({ SHIP_MAX_SPEED, SHIP_ACCELERATION, SHIP_ROTATION_SPEED });
  shipPhysicsRef.current = { SHIP_MAX_SPEED, SHIP_ACCELERATION, SHIP_ROTATION_SPEED };
  
  // Current system — Sol is hardcoded, everything else is procedurally generated
  const currentSystemId = useGameStore(state => state.currentSystem) || 'sol';
  const setCurrentSystemId = useGameStore(state => state.setCurrentSystemId);
  const setSystemBodies = useGameStore(state => state.setSystemBodies);
  const arrivalType = useGameStore(state => state.arrivalType) || 'warp';
  const prevSystemIdRef = useRef(currentSystemId);
  
  const currentSystem = useMemo(() => {
    if (currentSystemId === 'sol') return SOL_SYSTEM;
    
    // Look up galaxy data and generate system content
    const galaxy = getGalaxy();
    const galaxySys = galaxy.systemMap[currentSystemId];
    if (!galaxySys) return SOL_SYSTEM; // fallback
    
    const content = generateSystemContent(galaxySys);
    if (!content) return SOL_SYSTEM; // fallback
    
    return content;
  }, [currentSystemId]);

  // Push static body list to the store for the right outliner panel
  useEffect(() => {
    const bodies = (currentSystem?.bodies || []).map(b => ({
      id: b.id,
      name: b.name,
      type: b.type,
      planetType: b.planetType,
      color: b.color,
      parentBody: b.parentBody,
    }));
    setSystemBodies(bodies);
    return () => setSystemBodies([]);
  }, [currentSystem, setSystemBodies]);
  
  const starConfig = STAR_TYPES[currentSystem.starType] || STAR_TYPES.yellow_star;
  
  // Camera state (keep as state for UI binding)
  const [zoom, setZoom] = useState(1.0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [followMode, setFollowMode] = useState(true);
  
  // Autopilot state (shared via gameStore for NavigationWindow)
  const autopilotTarget = useGameStore(state => state.autopilotTarget);
  const setAutopilotTarget = useGameStore(state => state.setAutopilotTarget);
  const updateShipPosition = useGameStore(state => state.updateShipPosition);
  const updateHud = useGameStore(state => state.updateHud);
  const setScannerData = useGameStore(state => state.setScannerData);
  const setMissileAmmoStore = useGameStore(state => state.setMissileAmmo);
  const designatedEnemyId = useGameStore(state => state.designatedEnemyId);
  const setDesignatedEnemy = useGameStore(state => state.setDesignatedEnemy);
  const clearDesignatedEnemy = useGameStore(state => state.clearDesignatedEnemy);
  // Range overlay toggle (driven by the "View Scan Range" button in the
  // System Map header). When true, we draw dashed sensor + scan rings
  // centered on the active ship below the fleet icons.
  const showRangeOverlay = useGameStore(state => state.showRangeOverlay);
  // Ref mirror -- combat loop reads this each frame to pick targets.
  // The store selector above triggers re-renders for the SVG reticle;
  // the ref keeps the game loop's empty-deps closure current.
  const designatedEnemyIdRef = useRef(null);
  designatedEnemyIdRef.current = designatedEnemyId;
  const autopilotTargetRef = useRef(null);

  // Scanner tracking for the System Map pane.
  //   enemyGhostsRef -- enemies that left sensor range: snapshot of
  //     last-known pos, name, color, and the time we lost sight. Fades
  //     over GHOST_TTL_MS then drops off the map.
  //   seenBeforeRef -- set of enemy IDs we've ever spotted. Used to
  //     distinguish "never seen" (no ghost) from "saw + lost" (ghost).
  // Both clear on system change so we don't drag ghosts across jumps.
  const enemyGhostsRef = useRef(new Map());
  const seenBeforeRef = useRef(new Set());
  const GHOST_TTL_MS = 30000;
  
  // Docked state - which body we're currently docked at
  const [dockedBody, setDockedBody] = useState(null);
  const dockedBodyRef = useRef(null);
  
  // Game state as refs (no re-renders, always current values)
  // Compute initial ship position based on how we arrived
  const initialShipPos = useMemo(() => {
    if (currentSystemId === 'sol') return { x: 900, y: 0 };
    // Find the arrival body (warp point or jump gate)
    const bodyType = arrivalType === 'jump_gate' ? 'jump_gate' : 'warp_point';
    const body = currentSystem.bodies.find(b => b.type === bodyType)
              || currentSystem.bodies.find(b => b.type === 'warp_point')
              || currentSystem.bodies.find(b => b.type === 'jump_gate');
    if (body) {
      const angle = body.orbitOffset || 0;
      return {
        x: Math.cos(angle) * body.orbitRadius + 30,
        y: Math.sin(angle) * body.orbitRadius + 30,
      };
    }
    return { x: 300, y: 0 };
  }, [currentSystemId, currentSystem, arrivalType]);
  
  const shipPosRef = useRef(initialShipPos);
  const shipVelRef = useRef({ x: 0, y: 0 });
  const shipRotationRef = useRef(-90);
  const thrustingRef = useRef(false);
  const cameraRef = useRef({ ...initialShipPos });
  const gameTimeRef = useRef(0);
  
  // Contrail history — stores recent world positions for each fleet ship
  const TRAIL_LENGTH = 18;
  const TRAIL_SAMPLE = 2; // Record position every N frames
  const trailsRef = useRef({}); // keyed by ship.id → array of {x, y}
  const fleetShipsRef = useRef([]); // Mirror of fleetShips for game loop access
  
  // Combat state
  const enemiesRef = useRef([]); // Array of enemy objects
  const projectilesRef = useRef([]); // Active projectiles {x, y, vx, vy, age, fromPlayer, damage}
  const combatEffectsRef = useRef([]); // Visual effects: explosions, hit sparks
  const playerFireCooldownRef = useRef(0);
  // Asteroids (mineable spatial entities in belts). Ref-stored so the
  // SVG render reads from it on each frameCount tick. Server-persisted
  // (multiplayer-ready); fetched on system change, not polled (no
  // depletion yet -- A3 will add polling or proximity-driven refresh).
  const asteroidsRef = useRef([]);
  // A2 scan state: at most one scan in flight at a time. Game loop
  // checks range each frame; if player flies out, cancels. On time
  // elapsed, fires the server scan endpoint to record + reveal.
  const activeScanRef = useRef(null); // { asteroidId, startMs, durationMs } | null
  // Scan range -- the click-to-scan reach for asteroids -- is no
  // longer a constant. Effective value comes from the best fitted
  // scanner's computed_scan_range (T1=80, T2=160, T3=320, x quality)
  // plus the ast_survey skill's survey_scanner_range_pct bonus.
  // Helper reads the live refs so re-fits + skill ticks take effect
  // without a re-render dependency. The legacy DEFAULT_SCAN_RANGE
  // (80) acts as a floor for ships not yet re-fitted post-migration-052.
  const fleetScanRange = () =>
    getFleetScanRange(fleetShipsRef.current, activeBonusesRef.current);
  // Scan duration is no longer a constant -- derived per-scan from the
  // best fitted scanner's computed_scan_time and the ast_scanning skill
  // bonus via getFleetScanTimeMs(). The asteroid scan loop reads
  // activeScanRef.durationMs (snapshotted at scan-start) so mid-scan
  // re-fits don't change the in-flight scan's timing.

  // A4 mining state. Per-laser click-to-mine: every fitted mining
  // laser across the active fleet can be independently assigned to
  // its own asteroid. Click a scanned asteroid -> assigns the next
  // idle laser. Click an asteroid already being mined -> releases one
  // laser from it (LIFO). Max simultaneous assignments = total fitted
  // lasers across the fleet.
  //
  // Each assignment owns its own cooldown + in-flight flag so lasers
  // tick fully independently of each other. cargoFullRef stays a
  // global gate (it releases EVERY assignment, because no laser can
  // mine when cargo is full). The audio loop is on whenever the map
  // has at least one entry.
  //
  // Map keys are stable `${shipId}::${slotKey}` so they survive React
  // re-renders + ship-data refreshes; the value lives across frames
  // until released. Cleared on system change.
  const miningAssignmentsRef = useRef(new Map()); // laserKey -> { asteroidId, cooldownMs, inFlight }
  const cargoFullRef = useRef(false);             // pause mining when full; reset on system change
  const miningLoopActiveRef = useRef(false);      // tracks audio-loop on/off so transitions stay idempotent

  // Tier B System Telemetry Array (utility_systemscan): active ability
  // that reveals every enemy in the system for N seconds regardless of
  // sensor range. Pure client-side render override -- enemy AI already
  // runs on out-of-range targets, this just lifts the visibility gate.
  //   sweepActiveUntilMs > now  -> sensor range is treated as Infinity
  //   sweepCooldownUntilMs > now -> button disabled
  // [tick, setTick] forces 1Hz re-render so the HUD button can show its
  // countdown text; useEffect below keeps it spinning while either timer
  // is live, then stops to avoid background work.
  const sweepActiveUntilRef = useRef(0);
  const sweepCooldownUntilRef = useRef(0);
  // Tier C: bulk belt scan also has a cooldown (90s base, shortened by
  // ast_bulk_belt_efficiency at -10%/level). Tracked the same way as
  // sweep so the HUD button reflects the same countdown semantics.
  const bulkBeltCooldownUntilRef = useRef(0);
  // Area scan queue (Wide-Field Sensor Array). Clicking Area Scan no
  // longer instantly flips every asteroid -- it enqueues unscanned
  // asteroids in sensor range and runs them through the normal single-
  // asteroid scan flow one at a time, respecting scan_time + skill
  // bonuses. areaScanRangeRef snapshots the sensor range at queue start
  // so the per-asteroid cancel check uses that radius instead of the
  // tighter scan_range (otherwise scans 200+ units away would auto-
  // cancel and defeat the area-scan purpose).
  const areaScanQueueRef = useRef([]);
  const areaScanRangeRef = useRef(0);
  const [sweepTick, setSweepTick] = useState(0);

  // ============================================
  // MISSILE STATE
  // ============================================
  // missileAmmoRef        -- current ammo per launcher keyed `${shipId}::${slotId}`.
  //   Decremented client-side on fire (no per-shot server roundtrip).
  //   Server's `loaded` value (in fitted_modules) is authoritative on
  //   refill; sync effect below pulls it up only when it INCREASES
  //   (reload) so we don't clobber tracked usage on routine refreshes.
  // missileLockRef        -- per-ship lock state {targetId, startedAt}.
  //   Shared across all missile launchers on the same ship; resets
  //   when the ship's nearest enemy changes. Lock must persist for
  //   weapon.lock_time seconds before fire is permitted.
  // missileLastServerRef  -- last server-reported loaded value, used
  //   above as the "did it just go up?" reference point.
  const missileAmmoRef = useRef({});
  const missileLockRef = useRef({});
  const missileLastServerRef = useRef({});
  const MINE_RANGE = 120;     // matches mining_basic.stats.mine_range
  const MINE_CYCLE_MS = 2000; // matches mining_basic.stats.mine_cycle * 1000

  // Wingman world positions, lagged toward the formation slot so the
  // fleet *follows* the leader instead of pivoting rigidly around it.
  // Map of shipId -> { x, y, rot }. Cleared on system change so wingmen
  // re-spawn at their slot in the new system. WINGMAN_LAG_RATE is the
  // exponential catch-up rate (higher = stiffer/snappier; lower = floatier).
  // Tuned for "noticeable lag on hard turns, fully caught up on a straight."
  const wingmenPosRef = useRef({});
  const WINGMAN_LAG_RATE = 4;

  // Wrecks (lootable spatial entities from pirate kills). Refs not state
  // because the game loop reads them every frame for proximity-claim
  // checks; the existing frameCount setState already drives rerenders so
  // the SVG picks up new wrecks on the next frame.
  const wrecksRef = useRef([]);
  // Wreck IDs we've already fired a claim request for, so we don't
  // double-claim the same wreck across multiple frames while waiting
  // for the server's response.
  const claimingWrecksRef = useRef(new Set());
  const PICKUP_RANGE = 30;
  // Per-ship weapon cooldowns. Map keyed by `${shipId}:${weaponIndex}` → seconds remaining.
  const fleetWeaponCooldownsRef = useRef(new Map());
  const playerHullRef = useRef(100);
  const playerShieldRef = useRef(50);
  const playerMaxHullRef = useRef(100);
  const playerMaxShieldRef = useRef(50);
  const playerShieldRegenTimerRef = useRef(0);
  const combatInitializedRef = useRef(false);
  // Mirror of `isPod` for game-loop closure access (combat AI runs in
  // a refs-only loop and can't read React state directly).
  const isPodRef = useRef(false);
  // Re-entrancy guard: once /enter-pod is called for a death event,
  // ignore further hull<=0 triggers until the pod ship is active.
  const podEntryInFlightRef = useRef(false);
  // Auto-disembark guard: prevents firing exit-pod multiple times for
  // the same hull-acquisition (one ships[] update can trigger multiple
  // re-renders of the effect). Reset on undock and on exit-pod failure.
  const podExitInProgressRef = useRef(false);
  // Separate guard for the "no reserves" toast: ensures we show the
  // nudge once per dock cycle, but does NOT block the exit-pod path
  // when the player buys a hull from the vendor mid-dock.
  const podNoReserveToastRef = useRef(false);
  const [playerHullDisplay, setPlayerHullDisplay] = useState(100);
  const [playerShieldDisplay, setPlayerShieldDisplay] = useState(50);
  const [combatLog, setCombatLog] = useState([]); // Recent combat messages
  const [enemyCount, setEnemyCount] = useState(0);
  
  // Input state
  const keysPressed = useRef(new Set());
  const followModeRef = useRef(true); // Mirror of followMode for game loop
  
  // Frame counter to trigger re-renders (updates every frame)
  const [frameCount, setFrameCount] = useState(0);
  
  // Viewport ref
  const svgRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });

  // Sync missile ammo from server when ships data changes. Only bump
  // local ammo UP when the server's loaded value increased (reload
  // happened) -- a routine refresh with the same/older loaded value
  // must NOT clobber the per-fire decrements the client has tracked.
  // Mirror the post-sync state into the store so the vendor reload
  // can read it (server-side `loaded` doesn't track per-fire usage
  // so it'd see "magazine full" forever otherwise).
  useEffect(() => {
    let changed = false;
    for (const ship of ships) {
      const fitted = ship.fitted_modules || {};
      for (const [slotKey, slot] of Object.entries(fitted)) {
        if (!slot?.module_type_id?.startsWith?.('weapon_missile')) continue;
        const key = `${ship.id}::${slotKey}`;
        const serverLoaded = slot.loaded ?? 0;
        const lastServerLoaded = missileLastServerRef.current[key] ?? -1;
        if (serverLoaded > lastServerLoaded) {
          missileAmmoRef.current[key] = serverLoaded;
          changed = true;
        } else if (!(key in missileAmmoRef.current)) {
          // First sight: initialize from server even if it didn't
          // technically "increase" from the -1 sentinel.
          missileAmmoRef.current[key] = serverLoaded;
          changed = true;
        }
        missileLastServerRef.current[key] = serverLoaded;
      }
    }
    if (changed) setMissileAmmoStore({ ...missileAmmoRef.current });
  }, [ships, setMissileAmmoStore]);

  // Pre-render fleet ship icons for system view (tiny silhouettes).
  // Stored ships (storage_body_id != null) are parked at stations and
  // must NOT fly with the active fleet; filter them out before sort/slice.
  const fleetShips = useMemo(() => {
    const sorted = ships
      .filter(s => s.storage_body_id == null)
      .sort((a, b) => {
        if (a.id === playerShip?.id) return -1;
        if (b.id === playerShip?.id) return 1;
        return 0;
      })
      .slice(0, MAX_FLEET_SIZE);

    return sorted.map((ship, i) => {
      const hullId = ship.hull_type_id;
      const isActive = ship.id === playerShip?.id;
      const icon = getShipIcon(hullId);
      const hullData = HULL_SHAPES[hullId];
      const weapons = getShipWeapons(ship);
      return {
        ...ship,
        isActive,
        icon,
        engineColor: hullData?.palette?.engine || '#4488ff',
        formationOffset: FORMATION_OFFSETS[i] || { x: 0, y: 0 },
        weapons, // [{ type, damage, fire_rate, range, color, ... }]
      };
    });
  }, [ships, playerShip?.id]);
  
  // Keep fleetShips accessible from game loop closure
  fleetShipsRef.current = fleetShips;

  // === Fleet stat aggregation (Tier 2 #2) ===
  // Compute the fleet's collective combat stats from all ships' base
  // hulls + fitted modules. Per the locked design, fleet HP/shield/armor
  // are POOLS shared by the whole fleet rather than per-ship.
  const fleetStats = useMemo(() => computeFleetStats(fleetShips), [fleetShips]);

  // Push fleet stats to the global store so the Outliner can display them.
  const setFleetStats = useGameStore(state => state.setFleetStats);
  useEffect(() => {
    if (setFleetStats) setFleetStats(fleetStats);
  }, [fleetStats, setFleetStats]);

  // Update the playerMaxHull/Shield refs when the fleet composition or
  // module loadout changes. We preserve the player's CURRENT ratio of
  // hull/shield so that swapping to a tougher ship at full health doesn't
  // suddenly make the bar look half-empty (and vice versa).
  useEffect(() => {
    const oldMaxHull   = playerMaxHullRef.current   || 1;
    const oldMaxShield = playerMaxShieldRef.current || 1;
    const hullPct      = playerHullRef.current   / oldMaxHull;
    const shieldPct    = playerShieldRef.current / oldMaxShield;
    playerMaxHullRef.current   = Math.max(1, fleetStats.totalHull);
    playerMaxShieldRef.current = Math.max(0, fleetStats.totalShield);
    playerHullRef.current   = Math.min(playerMaxHullRef.current,   playerHullRef.current   > 0 ? hullPct   * playerMaxHullRef.current   : playerMaxHullRef.current);
    playerShieldRef.current = Math.min(playerMaxShieldRef.current, playerShieldRef.current > 0 ? shieldPct * playerMaxShieldRef.current : playerMaxShieldRef.current);
  }, [fleetStats.totalHull, fleetStats.totalShield]);

  // Override the ship physics ref with fleet-derived speed/maneuver,
  // which already include the fleet-mass penalty.  fleet_speed = 50 is
  // the baseline (1.0×), the same convention used for individual ships.
  useEffect(() => {
    const fleetSpeedMult    = Math.max(0.3, Math.min(3, fleetStats.fleetSpeed    / 50));
    const fleetManeuverMult = Math.max(0.3, Math.min(3, fleetStats.fleetManeuver / 50));
    shipPhysicsRef.current = {
      SHIP_MAX_SPEED:      BASE_SHIP_MAX_SPEED      * fleetSpeedMult,
      SHIP_ACCELERATION:   BASE_SHIP_ACCELERATION   * fleetSpeedMult,
      SHIP_ROTATION_SPEED: BASE_SHIP_ROTATION_SPEED * fleetManeuverMult,
    };
  }, [fleetStats.fleetSpeed, fleetStats.fleetManeuver]);

  // Push local dock state to the global store so GameFrame can show a
  // "Planet" toolbar button while docked.
  const setDockedBodyStore = useGameStore(state => state.setDockedBody);
  useEffect(() => {
    if (setDockedBodyStore) setDockedBodyStore(dockedBody);
    // Clear the cargo-full lockout on every dock-state change. The
    // ref gets set to true when the server returns cargo_full on a
    // mine cycle, but stays sticky until system change -- so selling
    // at a station / collecting from a harvester / jettisoning cargo
    // never unblocked subsequent mining. Either docking or undocking
    // is a strong "cargo state could have shrunk" signal; reset so
    // the next mine click hits the server, which is authoritative.
    cargoFullRef.current = false;
  }, [dockedBody, setDockedBodyStore]);

  // "Baptism by Fire" quest trigger -- watches enemyCount for the
  // exact transition from >0 to 0 (player just killed the last hostile).
  // completeQuest is server-side idempotent / no-op if the quest isn't
  // in the player's active list, so we can fire freely without checking.
  // Fires once per transition; if the player jumps to a new system with
  // new enemies and clears that too, it fires again -- harmless since
  // the server skips already-completed quests.
  const prevEnemyCountRef = useRef(0);
  useEffect(() => {
    if (prevEnemyCountRef.current > 0 && enemyCount === 0) {
      if (completeQuest) completeQuest('tutorial_clear_sector');
    }
    prevEnemyCountRef.current = enemyCount;
  }, [enemyCount, completeQuest]);

  // Background music for the system view. Loops while the player is
  // in this view, stops on unmount (e.g. switch to galaxy view).
  // Re-runs on mute toggle so unmuting mid-view actually starts the
  // music -- without this dep, a player who entered SystemView muted
  // and then unmuted would hear silence until they left + returned.
  const audioMutedForMusic = useGameStore(state => state.audio?.muted ?? false);
  useEffect(() => {
    if (audioMutedForMusic) {
      stopLoop('system_music');
      return undefined;
    }
    startLoop('system_music');
    return () => stopLoop('system_music');
  }, [audioMutedForMusic]);

  // Fleet engine ambient loop. Tied to the W (gas) key — see the
  // keydown/keyup handlers below for the start/stop calls. This effect
  // exists only as a safety net: forces the loop off when the player
  // docks while still holding W, and on unmount (e.g. switching to
  // galaxy view). If the player re-undocks, they must re-press W to
  // hear the engine again, which matches "engine = throttle" intent.
  useEffect(() => {
    if (dockedBody) stopLoop('fleet_engine');
    return () => stopLoop('fleet_engine');
  }, [dockedBody]);

  // Asteroid fetch on system change. Server lazily generates the field
  // on first request for a belt that has zero rows -- so the first
  // visit to a system might add ~100-200ms to this call. After that
  // it's a simple SELECT. No polling for now; A3 will refresh after
  // mining ticks that deplete an asteroid.
  useEffect(() => {
    if (!currentSystemId) return undefined;
    let cancelled = false;
    activeScanRef.current = null; // cancel any pending scan on system change
    miningAssignmentsRef.current.clear(); // drop all per-laser targets on system change
    cargoFullRef.current = false; // re-check capacity in new system
    // Tier B sweep state resets on system change. Cooldown doesn't
    // carry across systems and an active sweep ends with warp-out.
    sweepActiveUntilRef.current = 0;
    sweepCooldownUntilRef.current = 0;
    bulkBeltCooldownUntilRef.current = 0;
    // Area-scan queue is per-system (asteroid ids don't carry across).
    areaScanQueueRef.current = [];
    areaScanRangeRef.current = 0;
    // Scanner ghosts are per-system. Clearing here keeps the System
    // Map clean of "last seen 2 systems ago" markers.
    enemyGhostsRef.current.clear();
    seenBeforeRef.current.clear();
    // Wingmen warp in with the leader: clear lagged positions so they
    // re-init at their slot on the first frame of the new system instead
    // of streaking across the map from the old position.
    wingmenPosRef.current = {};
    // The game-loop transition watcher will stop the mining sound on
    // the next frame, but call it explicitly here too in case the
    // game loop is paused / unmounted during the change.
    stopLoop('mining_laser');
    miningLoopActiveRef.current = false;
    asteroidsAPI.list(currentSystemId)
      .then(({ asteroids }) => { if (!cancelled) asteroidsRef.current = asteroids || []; })
      .catch(err => { console.warn('asteroid list failed:', err); });
    return () => { cancelled = true; };
  }, [currentSystemId]);

  // Asteroid click → scan logic. Validates fitted Sensor Suite + range
  // client-side first (fast feedback); server also validates the
  // scanner module to gate the contents reveal. Click on an
  // already-scanned asteroid surfaces its contents in a toast.
  const hasScannerFitted = (ship) => {
    if (!ship?.fitted_modules) return false;
    for (const slot of Object.values(ship.fitted_modules)) {
      const id = slot?.module_type_id;
      if (id && id.startsWith('utility_scanner')) return true;
    }
    return false;
  };
  const hasMiningLaserFitted = (ship) => {
    if (!ship?.fitted_modules) return false;
    for (const slot of Object.values(ship.fitted_modules)) {
      const id = slot?.module_type_id;
      if (id && (id === 'mining_basic' || id.startsWith('mining_'))) return true;
    }
    return false;
  };
  // Sensor range: max scanner reach across the fitted fleet (NOT a
  // sum -- stacking scanners doesn't add range, you only need one good
  // eye). Server's recalcShipStats writes `computed_sensor_range` per
  // ship: max(scanner_module.sensor_range * quality). Fallback chain:
  //   computed_sensor_range > 0      -> use it (post-Phase-3, quality aware)
  //   has scanner module fitted      -> BASIC_SCANNER_SENSOR_RANGE (legacy)
  //   nothing fitted                 -> INNATE_SENSOR_RANGE
  // The legacy step exists because ships that haven't re-fitted since
  // migration 047 still have computed_sensor_range NULL/0.
  const BASIC_SCANNER_SENSOR_RANGE = 500;
  const INNATE_SENSOR_RANGE = 150;
  const hasUtilityScannerFitted = (ship) => {
    if (!ship?.fitted_modules) return false;
    for (const slot of Object.values(ship.fitted_modules)) {
      const id = slot?.module_type_id;
      if (id && id.startsWith('utility_scanner')) return true;
    }
    return false;
  };
  const fleetSensorRange = () => {
    // Tier B sensor sweep: while the active-ability window is live,
    // treat sensor range as effectively infinite. Returns Number.MAX_SAFE_INTEGER
    // so squared-distance checks elsewhere don't overflow into NaN.
    if (sweepActiveUntilRef.current > Date.now()) {
      return Number.MAX_SAFE_INTEGER;
    }
    // 1. Best computed value across the active fleet (Phase 3 path).
    const fleet = fleetShipsRef.current || [];
    let best = 0;
    for (const s of fleet) {
      if (s?.computed_sensor_range && s.computed_sensor_range > best) {
        best = s.computed_sensor_range;
      }
    }
    // 2. Legacy fallback for ships not yet re-fitted post-migration 047.
    if (best === 0) {
      best = fleetHas(hasUtilityScannerFitted) ? BASIC_SCANNER_SENSOR_RANGE : INNATE_SENSOR_RANGE;
    }
    // Astrometrics skill: sensor_range_pct from store bonuses (Sensor
    // Linking = +5%/level, so L5 = +25%). Innate range is also boosted
    // -- the bonus is "captain's awareness," not just "better gear."
    const bonusPct = activeBonusesRef.current?.sensor_range_pct || 0;
    return Math.round(best * (1 + bonusPct / 100));
  };

  // Tier B module detection helpers. Each walks every active fleet
  // ship's fitted_modules and matches against a server-stamped module
  // type id. Fleet-wide per CLAUDE.md pitfall #15.
  const fleetHasModuleId = (predicateId) => {
    for (const s of (fleetShipsRef.current || [])) {
      const fitted = s?.fitted_modules || {};
      for (const slot of Object.values(fitted)) {
        if (slot?.module_type_id === predicateId) return true;
      }
    }
    return false;
  };
  // Area scan: utility_scanner_area OR utility_scanner_elite both
  // carry `area_scan: true`. Bulk scan: only utility_scanner_elite.
  // Sweep: only utility_systemscan. Module-type checks are by id
  // since fitted slots don't carry the type's stats payload.
  const fleetHasAreaScan = () =>
    fleetHasModuleId('utility_scanner_area') || fleetHasModuleId('utility_scanner_elite');
  const fleetHasBulkScan = () => fleetHasModuleId('utility_scanner_elite');
  const fleetHasSystemSweep = () => fleetHasModuleId('utility_systemscan');

  // Enumerate every fitted mining laser across the active fleet, with
  // a stable laserKey for the multi-target assignment map. Excludes
  // stored ships (they're not present in space). Order is deterministic
  // (fleet order, then slot order) so the "next idle laser" pick is
  // predictable: primary's lasers first, then wingmen in formation
  // order. Re-enumerate each call -- cheap, and avoids stale-fleet bugs.
  const isMiningLaserId = (id) => !!id && (id === 'mining_basic' || id.startsWith('mining_'));
  const enumerateFleetLasers = () => {
    const out = [];
    for (const fs of (fleetShipsRef.current || [])) {
      const fitted = fs.fitted_modules || {};
      for (const slotKey of Object.keys(fitted)) {
        if (isMiningLaserId(fitted[slotKey]?.module_type_id)) {
          out.push({ laserKey: `${fs.id}::${slotKey}`, shipId: fs.id, slotKey, ship: fs });
        }
      }
    }
    return out;
  };
  // Fleet-wide module-fit check. Use this -- NOT hasXFitted(playerShip) --
  // for any "can the player do X?" gate. The fleet shares capabilities:
  // a scanner on a wingman scans for the whole fleet, a laser on a
  // wingman mines for the whole fleet, etc. Active-only checks were
  // the source of "non-primary ship doesn't recognise the module" bugs
  // for mining and scanning; future modules (sensor sweep, salvager,
  // tractor beam, ...) should all go through fleetHas() out of the gate.
  // Reads the live fleetShipsRef so it doesn't get stale across renders.
  const fleetHas = (predicate) => (fleetShipsRef.current || []).some(predicate);
  const formatContents = (contents) => {
    if (!contents) return 'unknown';
    const parts = Object.values(contents)
      .map(v => `${v.remaining || 0}u ${v.name || ''}`.trim())
      .filter(Boolean);
    return parts.length ? parts.join(', ') : 'empty';
  };
  // Asteroid quality tier label from the four stat columns (Phase 4
  // tooltip surface). Returns something like "Superior (Q73)" so the
  // scan toast tells the player whether this rock is worth mining.
  // Returns null if the asteroid hasn't been scanned (stats nulled out
  // server-side until a scan is recorded).
  const formatAsteroidQuality = (ast) => {
    if (!ast || ast.stat_purity == null) return null;
    const tier = getQualityTier(ast.stat_purity, ast.stat_stability, ast.stat_potency, ast.stat_density);
    const avg = Math.round((ast.stat_purity + ast.stat_stability + ast.stat_potency + ast.stat_density) / 4);
    return `${tier.name} (Q${avg})`;
  };
  const handleAsteroidClick = (asteroid) => {
    const dx = asteroid.x - shipPosRef.current.x;
    const dy = asteroid.y - shipPosRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Already scanned → try to ADD a laser to this rock first, only
    // release when no idle lasers are available. Earlier behavior
    // (release on every click of a rock already being mined) made
    // it impossible to stack multiple lasers on the same target -- a
    // multi-laser barge could only ever mine with 1 laser at a time.
    //
    // Updated rule:
    //   1. No lasers fitted anywhere -> contents-reveal fallback.
    //   2. Cargo full / out of range -> error toast.
    //   3. Idle laser exists -> ASSIGN it to this rock (stacks).
    //   4. No idle + rock has assignments -> RELEASE most-recent (LIFO).
    //   5. No idle + no assignments here -> "all assigned elsewhere" toast.
    if (asteroid.scanned) {
      const allLasers = enumerateFleetLasers();
      if (allLasers.length === 0) {
        if (pushToast) pushToast({
          kind: 'info',
          text: `${formatAsteroidQuality(asteroid) ? formatAsteroidQuality(asteroid) + ' — ' : ''}contents: ${formatContents(asteroid.contents)}. Equip a Mining Laser to mine.`,
          duration: 5000,
        });
        return;
      }
      // Cargo + range gates apply BEFORE assignment so the player
      // gets the actionable error instead of a stack/release toast.
      if (cargoFullRef.current) {
        if (pushToast) pushToast({ kind: 'error', text: 'Cargo full — sell or jettison first.', duration: 3000 });
        return;
      }
      if (dist > MINE_RANGE) {
        if (pushToast) pushToast({ kind: 'error', text: 'Too far to mine — get closer.', duration: 3000 });
        return;
      }

      // Pick the first idle laser (one not currently assigned anywhere).
      const idle = allLasers.find(l => !miningAssignmentsRef.current.has(l.laserKey));
      if (idle) {
        miningAssignmentsRef.current.set(idle.laserKey, {
          asteroidId: asteroid.id,
          cooldownMs: 0,
          inFlight: false,
        });
        const onThisRock = [...miningAssignmentsRef.current.values()]
          .filter(a => a.asteroidId === asteroid.id).length;
        if (pushToast) pushToast({
          kind: 'success',
          text: `Mining: ${onThisRock} laser${onThisRock === 1 ? '' : 's'} on this rock (${miningAssignmentsRef.current.size}/${allLasers.length} fleet-wide).`,
          duration: 2000,
        });
        return;
      }

      // No idle laser. If THIS rock has assignments, peel one off (LIFO);
      // gives the player a way to disengage when they run out of headroom.
      const assignedHere = [];
      for (const [laserKey, a] of miningAssignmentsRef.current) {
        if (a.asteroidId === asteroid.id) assignedHere.push(laserKey);
      }
      if (assignedHere.length > 0) {
        const releaseKey = assignedHere[assignedHere.length - 1];
        miningAssignmentsRef.current.delete(releaseKey);
        const remaining = assignedHere.length - 1;
        if (pushToast) pushToast({
          kind: 'info',
          text: remaining > 0
            ? `Released 1 laser (no idle lasers to add). ${remaining} still mining this rock.`
            : 'Mining stopped on this rock — all lasers free again.',
          duration: 2500,
        });
        return;
      }

      // All lasers on OTHER rocks -- can't add, can't release here.
      if (pushToast) pushToast({
        kind: 'error',
        text: `All ${allLasers.length} mining lasers already assigned to other rocks. Click a mining rock to free one.`,
        duration: 3500,
      });
      return;
    }

    // Not yet scanned → start scan (existing flow). Fleet-wide check
    // so a scanner on a wingman counts the same as one on the primary.
    if (!fleetHas(hasScannerFitted)) {
      if (pushToast) pushToast({ kind: 'error', text: 'Sensor Suite required to scan asteroids.', duration: 3000 });
      return;
    }
    if (dist > fleetScanRange()) {
      if (pushToast) pushToast({ kind: 'error', text: 'Too far to scan — get closer to the asteroid.', duration: 3000 });
      return;
    }
    // Snapshot scan duration at start so re-fits / skill ticks mid-scan
    // don't yank the timer out from under the player.
    const durationMs = getFleetScanTimeMs(fleetShipsRef.current, activeBonusesRef.current);
    activeScanRef.current = { asteroidId: asteroid.id, startMs: Date.now(), durationMs };
    if (pushToast) pushToast({ kind: 'info', text: 'Scanning asteroid...', duration: 2000 });
  };

  // ============================================
  // TIER B SCAN ABILITIES -- area / belt / sweep handlers
  // ============================================
  // All three are one-shot triggers (no per-frame state to maintain),
  // so they live as plain async handlers wired to the ScanAbilityTray
  // buttons rendered in the HUD overlay. Each enforces its own module
  // gate client-side; the server re-validates as a backstop.

  const applyScanResultsToLocal = (asteroids) => {
    // Server returns the freshly-scanned asteroids with contents + stats.
    // Mutate asteroidsRef in place so the render picks up the new
    // `scanned` flag without a re-list round trip.
    if (!asteroids?.length) return;
    const byId = new Map(asteroids.map(a => [a.id, a]));
    for (const a of asteroidsRef.current) {
      const fresh = byId.get(a.id);
      if (fresh) {
        a.scanned = true;
        a.contents = fresh.contents;
        a.stat_purity = fresh.stat_purity;
        a.stat_stability = fresh.stat_stability;
        a.stat_potency = fresh.stat_potency;
        a.stat_density = fresh.stat_density;
      }
    }
  };

  // Area scan no longer instant-flips every asteroid. It enqueues
  // unscanned rocks in sensor range and feeds them through the normal
  // single-asteroid scan loop (respects scan_time + ast_scanning
  // skill). Each scan still hits /asteroids/scan one at a time; the
  // server-side /asteroids/scan_area bulk endpoint is no longer called
  // from the client but kept around for future "instant bulk" tiers.
  const handleAreaScan = () => {
    if (!fleetHasAreaScan()) {
      if (pushToast) pushToast({ kind: 'error', text: 'No Wide-Field Sensor Array (or higher) fitted', duration: 3000 });
      return;
    }
    // Cancel toggle: second click while queue is active drains it.
    if (areaScanQueueRef.current.length > 0 || activeScanRef.current?.viaArea) {
      const pending = areaScanQueueRef.current.length + (activeScanRef.current?.viaArea ? 1 : 0);
      areaScanQueueRef.current = [];
      if (activeScanRef.current?.viaArea) activeScanRef.current = null;
      areaScanRangeRef.current = 0;
      if (pushToast) pushToast({ kind: 'info', text: `Area scan cancelled (${pending} remaining)`, duration: 2500 });
      return;
    }
    playSound('button_click');
    // Tier C `ast_area_scanning` widens the effective radius by
    // area_scan_radius_pct (+10%/level), so a high-tier scanner +
    // skilled captain sweeps a much larger zone.
    const radiusBonusPct = activeBonusesRef.current?.area_scan_radius_pct || 0;
    const radius = Math.round(fleetSensorRange() * (1 + radiusBonusPct / 100));
    const px = shipPosRef.current.x, py = shipPosRef.current.y;
    const r2 = radius * radius;
    // Closest unscanned asteroids first so the player gets early
    // feedback on rocks they can already see + reach. Filter out the
    // one currently being scanned (single-click in flight) -- it'll
    // naturally complete on its own.
    const activeId = activeScanRef.current?.asteroidId;
    const candidates = (asteroidsRef.current || [])
      .filter(a => !a.scanned && a.id !== activeId)
      .map(a => ({ id: a.id, d2: (a.x - px) ** 2 + (a.y - py) ** 2 }))
      .filter(x => x.d2 <= r2)
      .sort((a, b) => a.d2 - b.d2)
      .map(x => x.id);
    if (candidates.length === 0) {
      if (pushToast) pushToast({ kind: 'info', text: 'Area scan: no unscanned asteroids in sensor range', duration: 3000 });
      return;
    }
    areaScanQueueRef.current = candidates;
    areaScanRangeRef.current = radius;
    if (pushToast) pushToast({
      kind: 'success',
      text: `Area scan queued -- ${candidates.length} asteroid${candidates.length === 1 ? '' : 's'} (closest first)`,
      duration: 3500,
    });
    // First queued scan starts on the next game-loop tick via
    // advanceAreaScanQueue() below; no need to kick it here.
  };

  // Pop the next viable asteroid off the queue and set activeScanRef
  // so the existing scan loop processes it. Skips entries that are
  // already scanned, missing, or out of the queued sensor range.
  // Called by the scan loop whenever activeScanRef goes null + queue
  // is non-empty.
  const advanceAreaScanQueue = () => {
    while (areaScanQueueRef.current.length > 0) {
      const nextId = areaScanQueueRef.current.shift();
      const ast = (asteroidsRef.current || []).find(a => a.id === nextId);
      if (!ast || ast.scanned) continue;
      const dx = ast.x - shipPosRef.current.x;
      const dy = ast.y - shipPosRef.current.y;
      const r = areaScanRangeRef.current || fleetSensorRange();
      if (dx * dx + dy * dy > r * r) continue; // out of range, skip
      const durationMs = getFleetScanTimeMs(fleetShipsRef.current, activeBonusesRef.current);
      activeScanRef.current = {
        asteroidId: nextId,
        startMs: Date.now(),
        durationMs,
        viaArea: true,
      };
      return;
    }
    // Queue drained -- fire one summary toast when the last queued
    // scan completes (areaScanRangeRef > 0 marks "we were in a queue").
    if (areaScanRangeRef.current) {
      areaScanRangeRef.current = 0;
      if (pushToast) pushToast({ kind: 'success', text: 'Area scan complete', duration: 2500 });
    }
  };

  const handleBeltScan = async () => {
    if (!fleetHasBulkScan()) {
      if (pushToast) pushToast({ kind: 'error', text: 'No Elite Survey Grid fitted', duration: 3000 });
      return;
    }
    // Tier C: bulk-belt is now cooldown-gated (90s base shortened by
    // bulk_belt_cooldown_pct, -10%/level). Mirror of sweep's pattern.
    const nowCd = Date.now();
    if (bulkBeltCooldownUntilRef.current > nowCd) {
      const remain = Math.ceil((bulkBeltCooldownUntilRef.current - nowCd) / 1000);
      if (pushToast) pushToast({ kind: 'error', text: `Bulk-belt scan on cooldown (${remain}s)`, duration: 2500 });
      return;
    }
    // Find the closest belt to the player. Belts are celestial bodies
    // in systemBodies with body_type === 'asteroid_belt'.
    const bodies = useGameStore.getState().systemBodies || [];
    const belts = bodies.filter(b => b.body_type === 'asteroid_belt');
    if (belts.length === 0) {
      if (pushToast) pushToast({ kind: 'error', text: 'No asteroid belt in this system', duration: 3000 });
      return;
    }
    const px = shipPosRef.current.x, py = shipPosRef.current.y;
    let closest = null, closestD2 = Infinity;
    for (const b of belts) {
      const dx = (b.x ?? 0) - px, dy = (b.y ?? 0) - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < closestD2) { closest = b; closestD2 = d2; }
    }
    if (!closest?.id) {
      if (pushToast) pushToast({ kind: 'error', text: 'No belt found to scan', duration: 3000 });
      return;
    }
    playSound('button_click');
    try {
      const { scanned_count, asteroids } = await asteroidsAPI.scanBelt(closest.id);
      applyScanResultsToLocal(asteroids);
      // Start the cooldown only on a successful call (failed network
      // = no penalty). cooldown_pct is negative (-10/level via skill);
      // formula (1 + pct/100) shrinks the base accordingly.
      const cdPct = activeBonusesRef.current?.bulk_belt_cooldown_pct || 0;
      const cdMs = Math.max(5_000, Math.round(90_000 * (1 + cdPct / 100)));
      bulkBeltCooldownUntilRef.current = Date.now() + cdMs;
      setSweepTick(t => t + 1);
      if (pushToast) pushToast({
        kind: scanned_count > 0 ? 'success' : 'info',
        text: scanned_count > 0
          ? `Belt scan complete -- ${scanned_count} asteroid${scanned_count === 1 ? '' : 's'} surveyed`
          : 'Belt scan -- nothing new to scan',
        duration: 3500,
      });
    } catch (err) {
      if (pushToast) pushToast({ kind: 'error', text: `Belt scan failed: ${err.message}`, duration: 4000 });
    }
  };

  const handleSystemSweep = () => {
    if (!fleetHasSystemSweep()) {
      if (pushToast) pushToast({ kind: 'error', text: 'No System Telemetry Array fitted', duration: 3000 });
      return;
    }
    const now = Date.now();
    if (sweepCooldownUntilRef.current > now) {
      const remain = Math.ceil((sweepCooldownUntilRef.current - now) / 1000);
      if (pushToast) pushToast({ kind: 'error', text: `System sweep on cooldown (${remain}s)`, duration: 2500 });
      return;
    }
    playSound('button_click');
    // Tier B baseline + Tier C `ast_telemetry_ops` skill reduction
    // (-5% cooldown per level, max -25% at L5 → 90s).
    const durationMs = 30 * 1000;
    const cdPct = activeBonusesRef.current?.sweep_cooldown_pct || 0;
    const cooldownMs = Math.max(15_000, Math.round(120_000 * (1 + cdPct / 100)));
    sweepActiveUntilRef.current = now + durationMs;
    sweepCooldownUntilRef.current = now + cooldownMs;
    setSweepTick(t => t + 1); // force immediate render
    if (pushToast) pushToast({
      kind: 'success',
      text: 'System sweep active -- all enemies visible for 30s',
      duration: 4000,
    });
  };

  // Tick HUD once a second while ANY ability is active/cooling so the
  // countdown text repaints. Stops automatically when all timers expire.
  useEffect(() => {
    const tick = setInterval(() => {
      const now = Date.now();
      if (sweepActiveUntilRef.current > now
        || sweepCooldownUntilRef.current > now
        || bulkBeltCooldownUntilRef.current > now) {
        setSweepTick(t => t + 1);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Wreck polling DISABLED while wrecks table issue is unresolved.
  // Re-enable by restoring the useEffect body once /wrecks/list stops
  // erroring server-side. With this disabled, wrecksRef stays empty,
  // the SVG render block below renders nothing, and the proximity-claim
  // check in the game loop never triggers.
  // useEffect(() => {
  //   if (!currentSystemId) return undefined;
  //   let cancelled = false;
  //   const fetchWrecks = async () => {
  //     try {
  //       const { wrecks } = await wrecksAPI.list(currentSystemId);
  //       if (!cancelled) wrecksRef.current = wrecks || [];
  //     } catch (err) { /* network blip; next poll retries */ }
  //   };
  //   fetchWrecks();
  //   const interval = setInterval(fetchWrecks, 3000);
  //   return () => { cancelled = true; clearInterval(interval); };
  // }, [currentSystemId]);

  // Mirror isPod into a ref so the combat AI loop can branch on pod
  // state without crossing the React/closure boundary.
  useEffect(() => {
    isPodRef.current = isPod;
    // If we just entered a pod, wipe the in-flight guard so a future
    // ship loss can fire enter-pod again.
    if (isPod) podEntryInFlightRef.current = false;
  }, [isPod]);

  // Pod auto-disembark on dock. When a podded player docks at any
  // station/body and has a non-pod ship in their fleet, automatically
  // board the first one and retire the pod. If the fleet has no real
  // hulls, surface a one-shot toast nudging them to buy from the vendor
  // (free Starter Scout is available as a fallback). The "no reserve"
  // toast guard is separate from the exit-in-progress guard so that a
  // mid-dock hull purchase will trigger the auto-board, not lock it out.
  useEffect(() => {
    if (!dockedBody) {
      podExitInProgressRef.current = false;
      podNoReserveToastRef.current = false;
      return;
    }
    if (!isPod) return;

    const reserve = ships.find(s => s.hull_type_id !== 'pod');

    if (reserve) {
      if (podExitInProgressRef.current) return;
      podExitInProgressRef.current = true;
      fittingAPI.exitPod(reserve.id)
        .then(() => {
          if (pushToast) pushToast({
            kind: 'success',
            text: `Boarded ${reserve.name}. Pod retired.`,
            duration: 4000,
          });
          if (fetchShips) fetchShips();
        })
        .catch(err => {
          console.warn('exit-pod failed:', err);
          podExitInProgressRef.current = false;
          if (pushToast) pushToast({ kind: 'error', text: 'Disembark failed.', duration: 4000 });
        });
    } else if (!podNoReserveToastRef.current) {
      podNoReserveToastRef.current = true;
      if (pushToast) pushToast({
        kind: 'info',
        text: 'No reserve hulls — purchase a Starter Scout (free) or any other hull from the vendor.',
        duration: 6000,
      });
    }
  }, [dockedBody, isPod, ships, fetchShips, pushToast]);

  // Sync followMode state to ref
  useEffect(() => {
    followModeRef.current = followMode;
  }, [followMode]);
  
  // Sync autopilot target to ref
  useEffect(() => {
    autopilotTargetRef.current = autopilotTarget;
  }, [autopilotTarget]);
  
  // Initialize/reset pirates when system changes
  useEffect(() => {
    // Reset combat state
    projectilesRef.current = [];
    combatEffectsRef.current = [];
    playerFireCooldownRef.current = 0;
    playerShieldRegenTimerRef.current = 0;
    setCombatLog([]);
    trailsRef.current = {};
    
    let enemies;
    if (currentSystemId === 'sol') {
      // Sol uses hardcoded spawn zones
      const rng = new SeededRandom(42);
      enemies = [];
      let nextId = 1;
      for (const zone of PIRATE_SPAWN_ZONES) {
        for (let i = 0; i < zone.count; i++) {
          const hullId = zone.types[i % zone.types.length];
          const hull = PIRATE_HULLS[hullId];
          if (!hull) continue;
          const angle = rng.range(0, Math.PI * 2);
          const dist = rng.range(0, zone.radius);
          const icon = getShipIcon(hullId);
          enemies.push({
            id: `pirate_${nextId++}`, hullId, icon, faction: 'pirate',
            name: `${FACTIONS.pirate.name} ${hull.displaySize > 9 ? 'Destroyer' : hull.displaySize > 7 ? 'Marauder' : 'Interceptor'}`,
            x: zone.cx + Math.cos(angle) * dist, y: zone.cy + Math.sin(angle) * dist,
            vx: 0, vy: 0, rotation: rng.range(-180, 180),
            hull: hull.stats.maxHull, maxHull: hull.stats.maxHull,
            shield: hull.stats.maxShield, maxShield: hull.stats.maxShield,
            speed: hull.stats.speed, damage: hull.stats.damage,
            fireRate: hull.stats.fireRate, range: hull.stats.range,
            fireCooldown: 0, shieldRegenTimer: 0,
            engineColor: hull.palette.engine, displaySize: hull.displaySize,
            state: 'patrol',
            patrolCenter: { x: zone.cx + Math.cos(angle) * dist, y: zone.cy + Math.sin(angle) * dist },
            patrolAngle: rng.range(0, Math.PI * 2), patrolRadius: rng.range(50, 150),
            targetId: null,
            lootCredits: Math.round(rng.range(LOOT_CREDITS_MIN, LOOT_CREDITS_MAX) * (hull.displaySize / 6)),
          });
        }
      }
    } else {
      // Procedural systems — generate pirates from seed + danger level
      const galaxy = getGalaxy();
      const galaxySys = galaxy.systemMap[currentSystemId];
      const dangerLevel = galaxySys?.dangerLevel || 0;
      enemies = generatePiratesForSystem(galaxySys?.seed || 1, dangerLevel, currentSystem.bodies);
    }
    
    enemiesRef.current = enemies;
    setEnemyCount(enemies.length);
    
    // Reset ship position when changing systems (not on first load)
    if (prevSystemIdRef.current !== currentSystemId) {
      prevSystemIdRef.current = currentSystemId;
      // Spawn at arrival body based on how we got here
      const bodyType = arrivalType === 'jump_gate' ? 'jump_gate' : 'warp_point';
      const body = currentSystem.bodies.find(b => b.type === bodyType)
                || currentSystem.bodies.find(b => b.type === 'warp_point')
                || currentSystem.bodies.find(b => b.type === 'jump_gate');
      if (body) {
        const angle = body.orbitOffset || 0;
        shipPosRef.current = {
          x: Math.cos(angle) * body.orbitRadius + 30,
          y: Math.sin(angle) * body.orbitRadius + 30,
        };
      } else {
        shipPosRef.current = { x: 300, y: 0 };
      }
      shipVelRef.current = { x: 0, y: 0 };
      
      // Clear docking state
      dockedBodyRef.current = null;
      setDockedBody(null);
      setAutopilotTarget(null);
      
      // Reset hull/shield
      playerHullRef.current = playerMaxHullRef.current;
      playerShieldRef.current = playerMaxShieldRef.current;
    }
  }, [currentSystemId, currentSystem]);
  
  // Calculate body position at current time
  const getBodyPositionAtTime = useCallback((bodyId, time) => {
    const body = currentSystem.bodies.find(b => b.id === bodyId);
    if (!body) return { x: 0, y: 0 };
    
    // Handle stations orbiting planets
    if (body.parentBody) {
      const parentPos = getBodyPositionAtTime(body.parentBody, time);
      const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
      return {
        x: parentPos.x + Math.cos(angle) * body.orbitRadius,
        y: parentPos.y + Math.sin(angle) * body.orbitRadius,
      };
    }
    
    const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
    return {
      x: Math.cos(angle) * body.orbitRadius,
      y: Math.sin(angle) * body.orbitRadius,
    };
  }, [currentSystem.bodies]);
  
  // Set autopilot destination
  const setDestination = useCallback((body) => {
    if (body) {
      // If docked, stop any active harvest before leaving
      if (dockedBodyRef.current && dockedBodyRef.current.id !== body.id) {
        import('@/utils/api').then(({ resourcesAPI }) => {
          resourcesAPI.stopHarvest().catch(() => {});
        });
        dockedBodyRef.current = null;
        setTimeout(() => {
          setDockedBody(null);
          closeWindow('planetInteraction');
        }, 0);
      }
      setAutopilotTarget({ id: body.id, name: body.name, type: body.type });
      setFollowMode(true);
    }
  }, [setAutopilotTarget, closeWindow]);
  
  // Cancel autopilot
  const cancelAutopilot = useCallback(() => {
    setAutopilotTarget(null);
  }, [setAutopilotTarget]);

  // Main game loop - runs independently, updates refs directly
  useEffect(() => {
    let animationId;
    let lastTime = performance.now();
    let frameNum = 0; // Local frame counter that matches frameCount state
    
    const gameLoop = (currentTime) => {
      const delta = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;
      frameNum++;
      
      // Use same time calculation as rendering: frameNum / 60
      const gameTime = frameNum / 60;
      gameTimeRef.current = gameTime; // Sync to ref for rendering
      
      // Read physics from ref (may change when active ship changes)
      const { SHIP_MAX_SPEED, SHIP_ACCELERATION, SHIP_ROTATION_SPEED } = shipPhysicsRef.current;
      
      // Process input
      const keys = keysPressed.current;
      
      // Check if manual input should cancel autopilot
      const hasManualInput = keys.has('w') || keys.has('a') || keys.has('s') || keys.has('d') ||
                             keys.has('arrowup') || keys.has('arrowleft') || keys.has('arrowdown') || keys.has('arrowright');
      
      // Get autopilot target
      const target = autopilotTargetRef.current;
      let isAutopiloting = target && !hasManualInput;
      
      let rotationInput = 0;
      let thrustInput = 0;
      let isBraking = false;
      
      if (isAutopiloting) {
        // AUTOPILOT MODE
        // Get target position (planets move, so recalculate each frame)
        const targetBody = currentSystem.bodies.find(b => b.id === target.id);
        if (targetBody) {
          // First, get current target position for distance check
          let currentTargetPos;
          if (targetBody.parentBody) {
            const parentBody = currentSystem.bodies.find(b => b.id === targetBody.parentBody);
            const parentAngle = gameTime * parentBody.orbitSpeed + (parentBody.orbitOffset || 0);
            const parentPos = {
              x: Math.cos(parentAngle) * parentBody.orbitRadius,
              y: Math.sin(parentAngle) * parentBody.orbitRadius,
            };
            const stationAngle = gameTime * targetBody.orbitSpeed + (targetBody.orbitOffset || 0);
            currentTargetPos = {
              x: parentPos.x + Math.cos(stationAngle) * targetBody.orbitRadius,
              y: parentPos.y + Math.sin(stationAngle) * targetBody.orbitRadius,
            };
          } else {
            const angle = gameTime * targetBody.orbitSpeed + (targetBody.orbitOffset || 0);
            currentTargetPos = {
              x: Math.cos(angle) * targetBody.orbitRadius,
              y: Math.sin(angle) * targetBody.orbitRadius,
            };
          }
          
          // Calculate current distance for arrival check
          const currentDx = currentTargetPos.x - shipPosRef.current.x;
          const currentDy = currentTargetPos.y - shipPosRef.current.y;
          const currentDistance = Math.sqrt(currentDx * currentDx + currentDy * currentDy);
          
          // Current speed
          const vel = shipVelRef.current;
          const currentSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
          
          // INTERCEPT PREDICTION: Calculate where the target will be when we arrive
          // Estimate time to arrival based on distance and average speed
          const avgSpeed = Math.max(currentSpeed, SHIP_MAX_SPEED * 0.5);
          const estimatedSecondsToArrival = currentDistance / avgSpeed;
          const estimatedFramesToArrival = estimatedSecondsToArrival * 60; // Convert to frames
          
          // Predict future position (use frame-based time like rendering does)
          let targetPos;
          const futureTime = (frameNum + estimatedFramesToArrival * 0.7) / 60; // 70% prediction
          if (targetBody.parentBody) {
            const parentBody = currentSystem.bodies.find(b => b.id === targetBody.parentBody);
            const parentAngle = futureTime * parentBody.orbitSpeed + (parentBody.orbitOffset || 0);
            const parentPos = {
              x: Math.cos(parentAngle) * parentBody.orbitRadius,
              y: Math.sin(parentAngle) * parentBody.orbitRadius,
            };
            const stationAngle = futureTime * targetBody.orbitSpeed + (targetBody.orbitOffset || 0);
            targetPos = {
              x: parentPos.x + Math.cos(stationAngle) * targetBody.orbitRadius,
              y: parentPos.y + Math.sin(stationAngle) * targetBody.orbitRadius,
            };
          } else {
            const angle = futureTime * targetBody.orbitSpeed + (targetBody.orbitOffset || 0);
            targetPos = {
              x: Math.cos(angle) * targetBody.orbitRadius,
              y: Math.sin(angle) * targetBody.orbitRadius,
            };
          }
          
          // When close, switch to tracking current position (not predicted)
          if (currentDistance < 200) {
            targetPos = currentTargetPos;
          }
          
          // Calculate direction to (predicted) target
          const dx = targetPos.x - shipPosRef.current.x;
          const dy = targetPos.y - shipPosRef.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Docking range - ship touches the planet/station
          const dockingRange = targetBody.type === 'station' ? 15 : (targetBody.size || 20) + 5;
          
          if (currentDistance < dockingRange + 50 && currentSpeed < 40) {
            // Close and slow - final approach, snap to docked position
            isBraking = true;
            thrustInput = 0;
            
            // Snap ship to docked position (on the surface/at the station)
            if (currentDistance > dockingRange) {
              // Move toward target — fast final approach
              const moveSpeed = 150 * delta;
              const moveDx = currentTargetPos.x - shipPosRef.current.x;
              const moveDy = currentTargetPos.y - shipPosRef.current.y;
              const moveDist = Math.sqrt(moveDx * moveDx + moveDy * moveDy);
              if (moveDist > 1) {
                shipPosRef.current.x += (moveDx / moveDist) * Math.min(moveSpeed, moveDist);
                shipPosRef.current.y += (moveDy / moveDist) * Math.min(moveSpeed, moveDist);
              }
            } else {
              // Docked! Lock position to target (follow the orbiting body)
              shipPosRef.current.x = currentTargetPos.x;
              shipPosRef.current.y = currentTargetPos.y;
              shipVelRef.current = { x: 0, y: 0 };
              
              // Set docked body and open interaction window
              if (!dockedBodyRef.current || dockedBodyRef.current.id !== targetBody.id) {
                console.log('🚀 Docked at:', targetBody);
                playSound('dock_complete');
                dockedBodyRef.current = targetBody;
                // Use setTimeout to avoid state update during render
                setTimeout(() => {
                  setDockedBody(targetBody);
                  if (targetBody.type === 'jump_gate' || targetBody.type === 'warp_point') {
                    // Exit system into galaxy flight!
                    const galaxy = getGalaxy();
                    const currentSys = galaxy.systemMap[currentSystemId];
                    const sysX = currentSys?.x || 0;
                    const sysY = currentSys?.y || 0;
                    
                    // Check for pending jump — set galaxy autopilot target
                    const pending = useGameStore.getState().pendingJump;
                    const enterGalaxyFlight = useGameStore.getState().enterGalaxyFlight;
                    const setGalaxyAutopilot = useGameStore.getState().setGalaxyAutopilotTarget;
                    
                    enterGalaxyFlight(sysX, sysY);
                    
                    if (pending?.targetSystemId) {
                      const targetSys = galaxy.systemMap[pending.targetSystemId];
                      if (targetSys) {
                        setGalaxyAutopilot({ id: targetSys.id, name: targetSys.name });
                      }
                    }
                  } else {
                    openContextPanel('planetInteraction');
                  }
                }, 0);
              }
            }
          } else {
            // Calculate desired angle to target
            // atan2 gives standard math angle (0=right, -90=up)
            // shipRotationRef uses same convention: 0=right, -90=up
            const targetAngle = Math.atan2(dy, dx) * (180 / Math.PI);
            
            // Calculate angle difference (normalized to -180 to 180)
            let angleDiff = targetAngle - shipRotationRef.current;
            while (angleDiff > 180) angleDiff -= 360;
            while (angleDiff < -180) angleDiff += 360;
            
            // SMOOTH ROTATION - proportional control with deadzone
            if (Math.abs(angleDiff) > 3) {
              const rotationStrength = Math.min(1, Math.abs(angleDiff) / 30);
              rotationInput = (angleDiff > 0 ? 1 : -1) * rotationStrength;
            }
            
            // APPROACH SPEED CONTROL — start slowing closer, maintain higher minimum speed
            const slowdownStartDistance = 200;
            
            if (Math.abs(angleDiff) < 25) {
              if (currentDistance < slowdownStartDistance) {
                // Desired speed proportional to distance, but keep a decent minimum
                const desiredSpeed = Math.max(20, (currentDistance / slowdownStartDistance) * SHIP_MAX_SPEED * 0.6);
                
                if (currentSpeed > desiredSpeed * 1.3) {
                  // Going too fast for this distance - brake
                  isBraking = true;
                  thrustInput = 0;
                } else if (currentSpeed < desiredSpeed * 0.5 && currentDistance > dockingRange * 1.5) {
                  // Going too slow - speed up
                  thrustInput = 0.6;
                } else {
                  // Coast or gentle thrust
                  if (currentDistance > dockingRange * 2 && currentSpeed < 30) {
                    thrustInput = 0.4;
                  }
                }
              } else {
                // Far from target - full thrust
                thrustInput = 1;
              }
            } else if (Math.abs(angleDiff) > 45 && currentSpeed > 20) {
              // Facing wrong way - brake first, then turn
              isBraking = true;
            }
          }
        }
      } else {
        // MANUAL MODE
        // Clear docked state when player takes manual control
        if (dockedBodyRef.current) {
          dockedBodyRef.current = null;
          // Stop any active manual harvest — ship is leaving
          import('@/utils/api').then(({ resourcesAPI }) => {
            resourcesAPI.stopHarvest().catch(() => {}); // Silent fail if no active session
          });
          setTimeout(() => {
            setDockedBody(null);
            closeWindow('planetInteraction');
          }, 0);
        }
        
        // Rotation: A = counter-clockwise, D = clockwise
        if (keys.has('a') || keys.has('arrowleft')) rotationInput -= 1;
        if (keys.has('d') || keys.has('arrowright')) rotationInput += 1;
        
        // Thrust: W = forward thrust, S = brake (then reverse when slow)
        if (keys.has('w') || keys.has('arrowup')) thrustInput = 1;
        if (keys.has('s') || keys.has('arrowdown')) {
          const spd = Math.sqrt(shipVelRef.current.x * shipVelRef.current.x + shipVelRef.current.y * shipVelRef.current.y);
          if (spd > 5) {
            // Moving — brake to stop
            isBraking = true;
          } else {
            // Nearly stopped — apply reverse thrust
            thrustInput = -0.5;
          }
        }
      }
      
      // Update rotation directly on ref
      shipRotationRef.current += rotationInput * SHIP_ROTATION_SPEED * delta;
      
      thrustingRef.current = thrustInput > 0;
      
      // Calculate thrust direction from ship rotation
      // rotation uses standard math angle convention: 0=right, -90=up, 90=down
      const thrustAngle = shipRotationRef.current * (Math.PI / 180);
      const thrustX = Math.cos(thrustAngle) * thrustInput * SHIP_ACCELERATION;
      const thrustY = Math.sin(thrustAngle) * thrustInput * SHIP_ACCELERATION;
      
      // Update velocity
      let vel = shipVelRef.current;
      let newVx = vel.x;
      let newVy = vel.y;
      
      if (isBraking) {
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
        if (speed > 1) {
          newVx -= (vel.x / speed) * SHIP_BRAKE_POWER * delta;
          newVy -= (vel.y / speed) * SHIP_BRAKE_POWER * delta;
        } else {
          newVx = 0;
          newVy = 0;
        }
      } else {
        newVx += thrustX * delta;
        newVy += thrustY * delta;
      }
      
      // Apply drag
      newVx *= SHIP_DRAG;
      newVy *= SHIP_DRAG;
      
      // Clamp to max speed
      const speed = Math.sqrt(newVx * newVx + newVy * newVy);
      if (speed > SHIP_MAX_SPEED) {
        newVx = (newVx / speed) * SHIP_MAX_SPEED;
        newVy = (newVy / speed) * SHIP_MAX_SPEED;
      }
      
      shipVelRef.current = { x: newVx, y: newVy };
      
      // Update position
      shipPosRef.current = {
        x: shipPosRef.current.x + newVx * delta,
        y: shipPosRef.current.y + newVy * delta,
      };
      
      // Update camera if following (same frame, no lag)
      if (followModeRef.current) {
        cameraRef.current = { x: shipPosRef.current.x, y: shipPosRef.current.y };
      }

      // ============================================
      // WINGMAN LAG -- "follow" feel for the fleet
      // ============================================
      // Each wingman has its own world position that lerps toward the
      // formation slot (primary pos + rotated offset). When the primary
      // banks hard, wingmen drift wide and curve back into the slot
      // over ~0.4-0.6s instead of teleporting around the leader. The
      // wingman's heading tracks its actual movement direction so the
      // ship icons bank into their turns; when they're settled in the
      // slot they snap to the leader's heading. Stored positions /
      // rotations are then read by trails, combat, render, mining beam.
      {
        const theta = shipRotationRef.current * Math.PI / 180;
        const cosT = Math.cos(theta), sinT = Math.sin(theta);
        const rightX = -sinT, rightY = cosT;
        const behindX = -cosT, behindY = -sinT;
        const f = 1 - Math.exp(-WINGMAN_LAG_RATE * delta);
        const fleetDataLag = fleetShipsRef.current || [];
        for (const fs of fleetDataLag) {
          if (fs.isActive) continue;
          const off = fs.formationOffset || { x: 0, y: 0 };
          const slotX = shipPosRef.current.x + rightX * off.x + behindX * off.y;
          const slotY = shipPosRef.current.y + rightY * off.x + behindY * off.y;
          let cur = wingmenPosRef.current[fs.id];
          if (!cur) {
            // First sight of this wingman -- spawn directly in the slot
            // (no fly-in streak from origin or stale prior position).
            wingmenPosRef.current[fs.id] = { x: slotX, y: slotY, rot: shipRotationRef.current };
            continue;
          }
          const prevX = cur.x, prevY = cur.y;
          cur.x = prevX + (slotX - prevX) * f;
          cur.y = prevY + (slotY - prevY) * f;
          const moveX = cur.x - prevX;
          const moveY = cur.y - prevY;
          const moveDist = Math.sqrt(moveX * moveX + moveY * moveY);
          // Use velocity-direction rotation only while actively chasing
          // the slot; once settled (<0.2 px/frame ~= 12 px/s) snap to
          // the leader's heading so wingmen don't randomly skew when idle.
          if (moveDist > 0.2) {
            cur.rot = Math.atan2(moveY, moveX) * 180 / Math.PI;
          } else {
            cur.rot = shipRotationRef.current;
          }
        }
      }

      // Record contrail positions for all fleet ships. Reads lagged
      // wingman positions so the contrails curve with the actual
      // followed path, not the rigid formation slot.
      if (frameNum % TRAIL_SAMPLE === 0) {
        const currentSpeed = Math.sqrt(newVx * newVx + newVy * newVy);
        if (currentSpeed > 3) { // Only trail when moving
          const fleetData = fleetShipsRef.current || [];
          for (const fs of fleetData) {
            let wx, wy;
            if (fs.isActive) {
              wx = shipPosRef.current.x; wy = shipPosRef.current.y;
            } else {
              const w = wingmenPosRef.current[fs.id];
              if (!w) continue;
              wx = w.x; wy = w.y;
            }
            if (!trailsRef.current[fs.id]) trailsRef.current[fs.id] = [];
            const trail = trailsRef.current[fs.id];
            trail.push({ x: wx, y: wy });
            if (trail.length > TRAIL_LENGTH) trail.shift();
          }
        }
      }
      
      // ============================================
      // COMBAT UPDATE
      // ============================================
      const playerPos = shipPosRef.current;
      const enemies = enemiesRef.current;
      const projectiles = projectilesRef.current;
      const effects = combatEffectsRef.current;
      
      // --- Enemy AI ---
      for (const enemy of enemies) {
        if (enemy.hull <= 0) continue; // dead
        
        const dx = playerPos.x - enemy.x;
        const dy = playerPos.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angleToPlayer = Math.atan2(dy, dx) * 180 / Math.PI;

        // Distance to home (patrol center) — used for 'returning' state
        const hdx = enemy.patrolCenter.x - enemy.x;
        const hdy = enemy.patrolCenter.y - enemy.y;
        const homeDist = Math.sqrt(hdx * hdx + hdy * hdy);

        // If player just docked OR ejected into a pod, disengage any
        // hostile enemies. Pods are untargetable; pirates fly home and
        // resume patrol. Once in patrol, normal aggro rules apply --
        // undocking / disembarking near a patrol zone re-aggros.
        if ((dockedBodyRef.current || isPodRef.current) &&
            (enemy.state === 'chase' || enemy.state === 'attack' || enemy.state === 'flee')) {
          enemy.state = 'returning';
        }

        // State transitions
        if (enemy.state === 'patrol') {
          // Pods are invisible to pirate aggro -- core podding rule.
          if (!dockedBodyRef.current && !isPodRef.current && dist < PIRATE_AGGRO_RANGE) enemy.state = 'chase';
        } else if (enemy.state === 'chase') {
          if (dist < PIRATE_ATTACK_RANGE) enemy.state = 'attack';
          if (dist > PIRATE_DEAGGRO_RANGE) enemy.state = 'patrol';
        } else if (enemy.state === 'attack') {
          if (dist > PIRATE_ATTACK_RANGE * 1.5) enemy.state = 'chase';
          if (dist > PIRATE_DEAGGRO_RANGE) enemy.state = 'patrol';
          if (enemy.hull < enemy.maxHull * 0.2) enemy.state = 'flee';
        } else if (enemy.state === 'flee') {
          if (dist > PIRATE_DEAGGRO_RANGE * 1.5) enemy.state = 'patrol';
        } else if (enemy.state === 'returning') {
          // Switch back to patrol once close enough to home
          if (homeDist < enemy.patrolRadius * 1.2) enemy.state = 'patrol';
        }

        // Movement based on state
        let targetAngle, desiredSpeed;
        if (enemy.state === 'patrol') {
          enemy.patrolAngle += delta * 0.3;
          const px = enemy.patrolCenter.x + Math.cos(enemy.patrolAngle) * enemy.patrolRadius;
          const py = enemy.patrolCenter.y + Math.sin(enemy.patrolAngle) * enemy.patrolRadius;
          targetAngle = Math.atan2(py - enemy.y, px - enemy.x) * 180 / Math.PI;
          desiredSpeed = enemy.speed * 0.3;
        } else if (enemy.state === 'returning') {
          // Fly straight back to patrol center; ease off as we get close
          targetAngle = Math.atan2(hdy, hdx) * 180 / Math.PI;
          const closeFactor = Math.min(1, homeDist / (enemy.patrolRadius * 2));
          desiredSpeed = enemy.speed * (0.4 + 0.5 * closeFactor);
        } else if (enemy.state === 'chase') {
          targetAngle = angleToPlayer;
          desiredSpeed = enemy.speed;
        } else if (enemy.state === 'attack') {
          // Orbit player at combat distance
          const orbitAngle = Math.atan2(enemy.y - playerPos.y, enemy.x - playerPos.x);
          const tangent = orbitAngle + Math.PI / 2;
          if (dist < PIRATE_ORBIT_RANGE * 0.8) {
            targetAngle = (orbitAngle * 180 / Math.PI); // move away
          } else if (dist > PIRATE_ORBIT_RANGE * 1.2) {
            targetAngle = angleToPlayer; // move closer
          } else {
            targetAngle = tangent * 180 / Math.PI; // orbit
          }
          desiredSpeed = enemy.speed * 0.6;
        } else { // flee
          targetAngle = angleToPlayer + 180;
          desiredSpeed = enemy.speed;
        }
        
        // Rotate toward target
        let angleDiff = targetAngle - enemy.rotation;
        while (angleDiff > 180) angleDiff -= 360;
        while (angleDiff < -180) angleDiff += 360;
        const rotSpeed = 120 * delta;
        if (Math.abs(angleDiff) < rotSpeed) enemy.rotation = targetAngle;
        else enemy.rotation += Math.sign(angleDiff) * rotSpeed;
        
        // Apply velocity
        const rad = enemy.rotation * Math.PI / 180;
        enemy.vx += Math.cos(rad) * desiredSpeed * delta * 2;
        enemy.vy += Math.sin(rad) * desiredSpeed * delta * 2;
        const spd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
        if (spd > enemy.speed) {
          enemy.vx = (enemy.vx / spd) * enemy.speed;
          enemy.vy = (enemy.vy / spd) * enemy.speed;
        }
        enemy.vx *= 0.96;
        enemy.vy *= 0.96;
        enemy.x += enemy.vx * delta;
        enemy.y += enemy.vy * delta;
        
        // Fire at player (skip when docked)
        if (!dockedBodyRef.current && enemy.state === 'attack' && dist < enemy.range) {
          enemy.fireCooldown -= delta;
          if (enemy.fireCooldown <= 0) {
            enemy.fireCooldown = enemy.fireRate;
            const pAngle = Math.atan2(dy, dx);
            projectiles.push({
              x: enemy.x, y: enemy.y,
              vx: Math.cos(pAngle) * PROJECTILE_SPEED * 0.7,
              vy: Math.sin(pAngle) * PROJECTILE_SPEED * 0.7,
              age: 0, fromPlayer: false, damage: enemy.damage,
              color: enemy.engineColor,
            });
          }
        }
        
        // Shield regen
        enemy.shieldRegenTimer -= delta;
        if (enemy.shieldRegenTimer <= 0 && enemy.shield < enemy.maxShield) {
          enemy.shield = Math.min(enemy.maxShield, enemy.shield + SHIELD_REGEN_RATE * delta);
        }
      }
      
      // --- Per-ship weapon firing (each ship fires its own weapons) ---
      // Each fleet ship has its own weapons array. Cooldowns are tracked
      // per weapon in fleetWeaponCooldownsRef keyed by `${shipId}:${weaponIdx}`.
      // Skip entirely when docked — combat is paused at port.
      if (!dockedBodyRef.current) {
      const fleetData = fleetShipsRef.current || [];
      const cooldowns = fleetWeaponCooldownsRef.current;
      const theta = shipRotationRef.current * Math.PI / 180;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      // Right & behind vectors in world coords (matches render-side math)
      const rightX = -sinT, rightY = cosT;
      const behindX = -cosT, behindY = -sinT;

      for (const fs of fleetData) {
        if (!fs.weapons || fs.weapons.length === 0) continue;

        // Compute this ship's world position. Wingmen fire from their
        // lagged follow position (not the rigid slot) so combat reads
        // match the rendered icon -- otherwise tracer origins jump
        // ahead of the ship sprite during hard turns.
        let sx, sy;
        if (fs.isActive) {
          sx = playerPos.x;
          sy = playerPos.y;
        } else {
          const w = wingmenPosRef.current[fs.id];
          if (w) { sx = w.x; sy = w.y; }
          else {
            const off = fs.formationOffset;
            sx = playerPos.x + rightX * off.x + behindX * off.y;
            sy = playerPos.y + rightY * off.x + behindY * off.y;
          }
        }

        // Fire each weapon independently
        for (let wi = 0; wi < fs.weapons.length; wi++) {
          const w = fs.weapons[wi];
          const cooldownKey = `${fs.id}:${wi}`;
          let cd = cooldowns.get(cooldownKey) || 0;
          cd -= delta;
          if (cd > 0) {
            cooldowns.set(cooldownKey, cd);
            continue;
          }

          // Target selection: designated enemy wins if it's alive AND
          // within weapon range. Otherwise fall back to nearest-in-
          // range (the legacy behavior). This stops missile-lock
          // thrashing in dense clusters and lets the player pin all
          // weapons on a specific high-priority target.
          let nearest = null, nearestDist = w.range;
          const designId = designatedEnemyIdRef.current;
          if (designId) {
            const d = enemies.find(e => e.id === designId && e.hull > 0);
            if (d) {
              const dist = Math.sqrt((d.x - sx) ** 2 + (d.y - sy) ** 2);
              if (dist < w.range) {
                nearest = d;
                nearestDist = dist;
              }
            }
          }
          if (!nearest) {
            for (const e of enemies) {
              if (e.hull <= 0) continue;
              const dist = Math.sqrt((e.x - sx) ** 2 + (e.y - sy) ** 2);
              if (dist < nearestDist) { nearest = e; nearestDist = dist; }
            }
          }
          if (!nearest) {
            cooldowns.set(cooldownKey, 0); // ready to fire next frame
            // No target = no lock. Drop any stale missile lock so a
            // new target later starts the timer fresh.
            if (w.type === 'missile') missileLockRef.current[fs.id] = null;
            continue;
          }

          // ----- Missile-specific gating (ammo + lock-on) -----
          // Applied BEFORE consuming the fire-cooldown so we don't
          // burn a cycle while still acquiring lock.
          if (w.type === 'missile') {
            const ammoKey = `${fs.id}::${w.slot_id}`;
            const ammo = missileAmmoRef.current[ammoKey] ?? 0;
            if (ammo <= 0) {
              // Empty launcher: poll occasionally so a reload picks
              // up quickly without slamming the loop.
              cooldowns.set(cooldownKey, 0.5);
              continue;
            }
            // Lock state per ship -- shared across launchers on the
            // same ship so they fire together once locked.
            let lock = missileLockRef.current[fs.id];
            if (!lock || lock.targetId !== nearest.id) {
              lock = { targetId: nearest.id, startedAt: Date.now() };
              missileLockRef.current[fs.id] = lock;
            }
            const lockElapsed = (Date.now() - lock.startedAt) / 1000;
            const lockTime = w.lock_time ?? 2;
            if (lockElapsed < lockTime) {
              // Still acquiring -- short re-check interval so the
              // lock ring fills smoothly.
              cooldowns.set(cooldownKey, 0.1);
              continue;
            }
          }

          // Fire!
          cooldowns.set(cooldownKey, w.fire_rate);
          playSound('weapon_fire');
          const aimAngle = Math.atan2(nearest.y - sy, nearest.x - sx);

          if (w.type === 'laser') {
            // Instant beam — apply damage immediately, push a beam visual.
            // Gunnery skill: fleet_damage_pct from store bonuses (Small
            // Hybrid Turret Operation = +5%/level). Applies fleet-wide
            // so wingmen benefit from the captain's training too.
            const dmgBonus = 1 + ((activeBonusesRef.current?.fleet_damage_pct || 0) / 100);
            let dmg = w.damage * dmgBonus;
            if (nearest.shield > 0) {
              const shieldDmg = Math.min(nearest.shield, dmg);
              nearest.shield -= shieldDmg;
              dmg -= shieldDmg;
              nearest.shieldRegenTimer = SHIELD_REGEN_DELAY;
            }
            nearest.hull -= dmg;
            effects.push({
              type: 'laser_beam',
              x1: sx, y1: sy,
              x2: nearest.x, y2: nearest.y,
              age: 0,
              lifetime: 0.15,
              color: w.color,
              fromPlayer: true,
            });
            // Hit spark at impact point
            effects.push({
              x: nearest.x, y: nearest.y,
              type: 'hit', age: 0,
              color: nearest.shield > 0 ? '#4488ff' : w.color,
            });
            // Enemy destroyed by laser? Mirror the projectile-hit
            // destruction path. Spawns a CLIENT-LOCAL wreck (no server
            // persistence -- the server-side wrecks table issue is
            // still unresolved). Credits are awarded on pickup via the
            // existing awardLoot endpoint, which works.
            if (nearest.hull <= 0) {
              nearest.hull = 0;
              effects.push({ x: nearest.x, y: nearest.y, type: 'explosion', age: 0, size: nearest.displaySize });
              playSound('ship_destroyed');
              playSound('ship_destroyed_metal');
              const loot = nearest.lootCredits || 50;
              if (pushToast) pushToast({
                kind: 'success',
                text: `Destroyed ${nearest.name} — ${loot} cr loot dropped, fly to salvage.`,
                duration: 3500,
              });
              wrecksRef.current.push({
                id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                x: nearest.x,
                y: nearest.y,
                contents: { credits: loot },
                expires_at_ms: Date.now() + 5 * 60 * 1000, // 5 min local TTL
              });
              // Clear designation if this was the designated target
              // so the fleet doesn't keep "trying" to lock a corpse.
              if (designatedEnemyIdRef.current === nearest.id) {
                clearDesignatedEnemy();
              }
            }
          } else if (w.type === 'kinetic') {
            // Bullet with slight aim spread. Gunnery skill damage
            // bonus is baked into the projectile at spawn -- when the
            // projectile lands, it just subtracts its own damage value
            // and doesn't have to re-look-up the captain's bonus.
            const dmgBonus = 1 + ((activeBonusesRef.current?.fleet_damage_pct || 0) / 100);
            const spread = (Math.random() - 0.5) * (w.spread || 0.08) * 2;
            const fireAngle = aimAngle + spread;
            const speed = w.projectile_speed || 320;
            projectiles.push({
              x: sx, y: sy,
              vx: Math.cos(fireAngle) * speed,
              vy: Math.sin(fireAngle) * speed,
              age: 0, fromPlayer: true,
              damage: w.damage * dmgBonus,
              color: w.color,
              weapon_type: 'kinetic',
            });
          } else if (w.type === 'missile') {
            // Tracking projectile — re-aims toward target each frame.
            // Lifetime sized to weapon range / speed (plus 50% buffer
            // for curving paths toward moving targets). Without this
            // the global PROJECTILE_LIFETIME=0.8s despawned missiles
            // long before they reached their nominal max range.
            const dmgBonus = 1 + ((activeBonusesRef.current?.fleet_damage_pct || 0) / 100);
            const speed = w.projectile_speed || 180;
            const lifetime = ((w.range || 1120) / speed) * 1.5;
            projectiles.push({
              x: sx, y: sy,
              vx: Math.cos(aimAngle) * speed,
              vy: Math.sin(aimAngle) * speed,
              age: 0, fromPlayer: true,
              damage: w.damage * dmgBonus,
              color: w.color,
              weapon_type: 'missile',
              target_id: nearest.id,
              speed,
              turn_rate: w.turn_rate || 4.0,
              lifetime,
            });
            // Decrement ammo client-side + mirror to store so the
            // vendor's reload sees the true count. Server's `loaded`
            // field only tracks reload events, not per-shot usage.
            const ammoKey = `${fs.id}::${w.slot_id}`;
            if (missileAmmoRef.current[ammoKey] > 0) {
              missileAmmoRef.current[ammoKey] -= 1;
              setMissileAmmoStore({ ...missileAmmoRef.current });
            }
          }
        }
      }

      // Clean up cooldowns for ships that no longer exist (ship sold, etc.)
      // Cheap pass: only do it occasionally.
      if (frameNum % 600 === 0) {
        const liveKeys = new Set();
        for (const fs of fleetData) {
          for (let wi = 0; wi < (fs.weapons?.length || 0); wi++) {
            liveKeys.add(`${fs.id}:${wi}`);
          }
        }
        for (const k of cooldowns.keys()) {
          if (!liveKeys.has(k)) cooldowns.delete(k);
        }
      }
      } // end if (!dockedBodyRef.current)
      
      // --- Update projectiles & collisions ---
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];

        // Missile homing — re-aim toward target each frame
        if (p.weapon_type === 'missile' && p.target_id != null) {
          const target = enemies.find(e => e.id === p.target_id && e.hull > 0);
          if (target) {
            const desiredAngle = Math.atan2(target.y - p.y, target.x - p.x);
            const currentAngle = Math.atan2(p.vy, p.vx);
            // Shortest angular delta
            let delta_a = desiredAngle - currentAngle;
            while (delta_a > Math.PI) delta_a -= 2 * Math.PI;
            while (delta_a < -Math.PI) delta_a += 2 * Math.PI;
            // Cap by turn rate
            const maxTurn = (p.turn_rate || 4.0) * delta;
            const turn = Math.max(-maxTurn, Math.min(maxTurn, delta_a));
            const newAngle = currentAngle + turn;
            p.vx = Math.cos(newAngle) * p.speed;
            p.vy = Math.sin(newAngle) * p.speed;
          }
        }

        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.age += delta;
        
        // Per-projectile lifetime override (used by missiles so they
        // can fly long enough to reach their full nominal range);
        // falls back to the global default for everything else.
        if (p.age > (p.lifetime ?? PROJECTILE_LIFETIME)) {
          projectiles.splice(i, 1);
          continue;
        }
        
        if (p.fromPlayer) {
          // Check hits on enemies
          for (const e of enemies) {
            if (e.hull <= 0) continue;
            const d = Math.sqrt((p.x - e.x) ** 2 + (p.y - e.y) ** 2);
            if (d < e.displaySize + 5) {
              // Hit!
              let dmg = p.damage;
              if (e.shield > 0) {
                const shieldDmg = Math.min(e.shield, dmg);
                e.shield -= shieldDmg;
                dmg -= shieldDmg;
                e.shieldRegenTimer = SHIELD_REGEN_DELAY;
              }
              e.hull -= dmg;
              effects.push({ x: p.x, y: p.y, type: 'hit', age: 0, color: e.shield > 0 ? '#4488ff' : '#ff8844' });
              playSound('weapon_hit');
              projectiles.splice(i, 1);

              // Enemy destroyed by projectile. Spawns a CLIENT-LOCAL
              // wreck the player flies to. See the laser branch above
              // for the same logic + the rationale (server-side wrecks
              // table is still busted; local-only is the workaround).
              if (e.hull <= 0) {
                e.hull = 0;
                if (designatedEnemyIdRef.current === e.id) {
                  clearDesignatedEnemy();
                }
                effects.push({ x: e.x, y: e.y, type: 'explosion', age: 0, size: e.displaySize });
                playSound('ship_destroyed');
                playSound('ship_destroyed_metal');
                const loot = e.lootCredits || 50;
                if (pushToast) pushToast({
                  kind: 'success',
                  text: `Destroyed ${e.name} — ${loot} cr loot dropped, fly to salvage.`,
                  duration: 3500,
                });
                wrecksRef.current.push({
                  id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  x: e.x,
                  y: e.y,
                  contents: { credits: loot },
                  expires_at_ms: Date.now() + 5 * 60 * 1000,
                });
              }
              break;
            }
          }
        } else {
          // Check hits on player
          const d = Math.sqrt((p.x - playerPos.x) ** 2 + (p.y - playerPos.y) ** 2);
          if (d < 12) {
            let dmg = p.damage;
            const shield = playerShieldRef.current;
            if (shield > 0) {
              const shieldDmg = Math.min(shield, dmg);
              playerShieldRef.current -= shieldDmg;
              dmg -= shieldDmg;
              playerShieldRegenTimerRef.current = SHIELD_REGEN_DELAY;
            }
            playerHullRef.current -= dmg;
            effects.push({ x: p.x, y: p.y, type: 'hit', age: 0, color: shield > 0 ? '#4488ff' : '#ff4444' });
            projectiles.splice(i, 1);
            
            if (playerHullRef.current <= 0 && !podEntryInFlightRef.current && !isPodRef.current) {
              // Pod ejection: replace the old "respawn at Luna" with EVE-
              // style podding. Active ship is destroyed server-side and
              // an Escape Pod is created in its place. Player keeps their
              // current position (no teleport) and flies the pod back to
              // a station to disembark via the auto-disembark useEffect.
              //
              // Local hull/shield are restored so the loop doesn't fire
              // this branch again before fetchShips repopulates the refs
              // from the pod's stats. The in-flight guard is the primary
              // dedup -- the hull reset is just defensive.
              podEntryInFlightRef.current = true;
              playerHullRef.current = playerMaxHullRef.current;
              playerShieldRef.current = playerMaxShieldRef.current;

              // Disengage all aggro'd pirates immediately. They'll fly
              // home; pod is untargetable so they won't re-aggro.
              for (const e of enemiesRef.current) {
                if (e.state === 'chase' || e.state === 'attack' || e.state === 'flee') {
                  e.state = 'returning';
                  e.targetId = null;
                }
              }

              setCombatLog(prev => [...prev.slice(-4), 'Capsule ejected — fly to a station to disembark.']);

              fittingAPI.enterPod()
                .then(() => {
                  if (fetchShips) fetchShips();
                })
                .catch(err => {
                  console.warn('enter-pod failed:', err);
                  podEntryInFlightRef.current = false;
                  setCombatLog(prev => [...prev.slice(-4), 'Pod ejection failed — see console.']);
                });
            }
          }
        }
      }
      
      // --- Player shield regen ---
      playerShieldRegenTimerRef.current -= delta;
      if (playerShieldRegenTimerRef.current <= 0 && playerShieldRef.current < playerMaxShieldRef.current) {
        playerShieldRef.current = Math.min(playerMaxShieldRef.current, playerShieldRef.current + SHIELD_REGEN_RATE * delta);
      }
      
      // --- Update effects ---
      for (let i = effects.length - 1; i >= 0; i--) {
        effects[i].age += delta;
        const lifetime = effects[i].lifetime || 0.5;
        if (effects[i].age > lifetime) effects.splice(i, 1);
      }

      // ============================================
      // MINING: per-laser tick (Phase A4)
      // ============================================
      // Every fitted laser in the active fleet runs its own cooldown +
      // server call. miningAssignmentsRef holds the laserKey -> {asteroidId,
      // cooldownMs, inFlight} map. Each frame:
      //   1. Drop any assignment whose laser no longer exists (unfitted,
      //      ship stored/destroyed) so we don't fire ghost lasers.
      //   2. Release per-assignment for the global gates that kill ALL
      //      mining (pod, dock, cargo-full) or for that one laser's
      //      target going stale (asteroid gone, primary out of range).
      //   3. Sparks: once per distinct mined asteroid (de-duped) so
      //      double-laser'd rocks don't get double-bright sparks.
      //   4. Audio loop: on whenever the assignment map has entries.
      //   5. Fire: per-assignment cooldown decrement + per-laser server
      //      call. Yield, depletion, cargo-full all return per-laser
      //      responses; cargo-full releases ALL lasers globally (every
      //      laser is mining into the same shared cargo pool).
      // Helper: release every assignment pointing at one asteroid -- used
      // when the asteroid depletes (every laser on it must drop).
      const releaseAllOnAsteroid = (asteroidId) => {
        const toRelease = [];
        for (const [k, a] of miningAssignmentsRef.current) {
          if (a.asteroidId === asteroidId) toRelease.push(k);
        }
        for (const k of toRelease) miningAssignmentsRef.current.delete(k);
      };

      // 1 + 2. Validity + release pass.
      if (miningAssignmentsRef.current.size > 0) {
        const validKeys = new Set(enumerateFleetLasers().map(l => l.laserKey));
        // Global release reasons (kill EVERY assignment, with a single toast).
        let globalReleaseReason = null;
        if (isPodRef.current)           globalReleaseReason = 'in pod';
        else if (cargoFullRef.current)  globalReleaseReason = 'cargo full';
        else if (dockedBodyRef.current) globalReleaseReason = 'docked';
        if (globalReleaseReason) {
          miningAssignmentsRef.current.clear();
          const pt = useGameStore.getState().pushToast;
          if (pt) pt({ kind: 'info', text: `Mining stopped (${globalReleaseReason}).`, duration: 2500 });
        } else {
          // Per-assignment release: laser gone OR asteroid gone OR primary out of range.
          // (Range stays primary-anchored for now; per-ship range is a Phase A5 polish.)
          const releases = []; // [{ key, reason }]
          for (const [laserKey, assignment] of miningAssignmentsRef.current) {
            if (!validKeys.has(laserKey)) { releases.push({ key: laserKey, reason: 'laser unfitted' }); continue; }
            const t = asteroidsRef.current.find(a => a.id === assignment.asteroidId);
            if (!t) { releases.push({ key: laserKey, reason: 'asteroid gone' }); continue; }
            const dxr = t.x - playerPos.x, dyr = t.y - playerPos.y;
            if (dxr * dxr + dyr * dyr > MINE_RANGE * MINE_RANGE) {
              releases.push({ key: laserKey, reason: 'out of range' });
            }
          }
          for (const r of releases) miningAssignmentsRef.current.delete(r.key);
          // Single summary toast if anything dropped; saves spamming
          // one toast per laser when the fleet flies out of range.
          if (releases.length > 0) {
            const pt = useGameStore.getState().pushToast;
            if (pt) {
              const reasons = [...new Set(releases.map(r => r.reason))].join(', ');
              pt({
                kind: 'info',
                text: releases.length === 1
                  ? `Mining released 1 laser (${reasons}).`
                  : `Mining released ${releases.length} lasers (${reasons}).`,
                duration: 2500,
              });
            }
          }
        }
      }

      // 3. Sparks (de-duped per asteroid).
      if (miningAssignmentsRef.current.size > 0 && frameNum % 2 === 0) {
        const minedAsteroidIds = new Set();
        for (const a of miningAssignmentsRef.current.values()) minedAsteroidIds.add(a.asteroidId);
        for (const aid of minedAsteroidIds) {
          const t = asteroidsRef.current.find(a => a.id === aid);
          if (!t) continue;
          for (let k = 0; k < 2; k++) {
            const ang = Math.random() * Math.PI * 2;
            const off = Math.random() * (t.size || 4);
            effects.push({
              x: t.x + Math.cos(ang) * off,
              y: t.y + Math.sin(ang) * off,
              type: 'mining_spark',
              age: 0,
              lifetime: 0.3,
              color: ['#ffdd44', '#ffaa44', '#ffffff'][Math.floor(Math.random() * 3)],
              size: 0.5 + Math.random() * 1.0,
            });
          }
        }
      }

      // 4. Audio loop transition.
      const wantMiningSound = miningAssignmentsRef.current.size > 0;
      if (wantMiningSound && !miningLoopActiveRef.current) {
        startLoop('mining_laser');
        miningLoopActiveRef.current = true;
      } else if (!wantMiningSound && miningLoopActiveRef.current) {
        stopLoop('mining_laser');
        miningLoopActiveRef.current = false;
      }

      // 5. Fire per-laser.
      for (const [laserKey, assignment] of miningAssignmentsRef.current) {
        assignment.cooldownMs -= delta * 1000;
        if (assignment.cooldownMs > 0 || assignment.inFlight) continue;
        // Need ship + slot for the server call. laserKey = `${shipId}::${slotKey}`.
        const sepIdx = laserKey.indexOf('::');
        const shipId = laserKey.slice(0, sepIdx);
        const slotKey = laserKey.slice(sepIdx + 2);
        const targetId = assignment.asteroidId;
        assignment.cooldownMs = MINE_CYCLE_MS;
        assignment.inFlight = true;
        asteroidsAPI.mine(targetId, shipId, slotKey)
          .then(({ mined, asteroid_remaining, asteroid_depleted, cargo_used, cargo_capacity }) => {
            // The assignment may have been released between fire + response.
            const stillAssigned = miningAssignmentsRef.current.get(laserKey);
            if (stillAssigned) stillAssigned.inFlight = false;
            // Tutorial: first successful mine completes "Strike It Rich"
            // (server is idempotent, so firing on every tick is harmless).
            if (completeQuest) completeQuest('tutorial_mine_resources');
            const a = asteroidsRef.current.find(x => x.id === targetId);
            if (a) {
              if (asteroid_depleted) {
                asteroidsRef.current = asteroidsRef.current.filter(x => x.id !== targetId);
                releaseAllOnAsteroid(targetId);
              } else {
                a.contents = asteroid_remaining;
                a.scanned = true; // mining counts as a reveal
              }
            }
            if (asteroid_depleted) {
              const pt = useGameStore.getState().pushToast;
              if (pt) pt({
                kind: 'info',
                text: `Asteroid depleted (last: +${mined.quantity} ${mined.name}). Respawns in 10 min.`,
                duration: 4000,
              });
            }
            if (cargo_capacity > 0 && cargo_used >= cargo_capacity) {
              cargoFullRef.current = true;
              miningAssignmentsRef.current.clear();
              const pt = useGameStore.getState().pushToast;
              if (pt) pt({
                kind: 'error',
                text: 'Cargo full — mining stopped. Dock to sell or jettison.',
                duration: 4000,
              });
            }
          })
          .catch(err => {
            const stillAssigned = miningAssignmentsRef.current.get(laserKey);
            if (stillAssigned) stillAssigned.inFlight = false;
            const msg = err?.message || '';
            if (msg === 'cargo_full') {
              cargoFullRef.current = true;
              miningAssignmentsRef.current.clear();
              const pt = useGameStore.getState().pushToast;
              if (pt) pt({
                kind: 'error',
                text: 'Cargo full — mining stopped. Dock to sell or jettison.',
                duration: 4000,
              });
            } else if (msg.includes('depleted')) {
              asteroidsRef.current = asteroidsRef.current.filter(x => x.id !== targetId);
              releaseAllOnAsteroid(targetId);
            } else {
              // Module mismatch (ship stored / unfitted between client check
              // and server call) is benign -- just release this laser.
              if (stillAssigned) miningAssignmentsRef.current.delete(laserKey);
              console.warn('mine failed:', err);
            }
          });
      }

      // --- Asteroid scan progress ---
      // Watch the active scan: cancel if player drifts out of range,
      // complete if scan_time elapses. Server records the reveal +
      // returns contents; we patch the local asteroid so the SVG
      // render immediately reflects the new "scanned" state.
      if (activeScanRef.current) {
        const scan = activeScanRef.current;
        const ast = asteroidsRef.current.find(a => a.id === scan.asteroidId);
        if (!ast) {
          activeScanRef.current = null;
        } else {
          const sdx = ast.x - playerPos.x;
          const sdy = ast.y - playerPos.y;
          // Cancel radius is wider for area-scan-queued scans (uses the
          // queue's snapshotted sensor radius) since the player invoked
          // area scan to "scan everything in sight" -- not just rocks
          // within click-scan reach. Single-click scans keep the tight
          // scan_range cancel that's been the existing behavior.
          const cancelR = scan.viaArea
            ? (areaScanRangeRef.current || fleetSensorRange())
            : fleetScanRange() * 1.2;
          if (sdx * sdx + sdy * sdy > cancelR * cancelR) {
            // Out of range -- cancel. Quiet for queued scans (the rest
            // of the queue keeps going) to avoid toast spam; chatty for
            // explicit single-click scans.
            activeScanRef.current = null;
            if (!scan.viaArea) {
              const pt = useGameStore.getState().pushToast;
              if (pt) pt({ kind: 'error', text: 'Scan cancelled — flew out of range.', duration: 2500 });
            }
          } else if (Date.now() - scan.startMs >= scan.durationMs) {
            // Time complete -- record server-side and reveal
            const astId = scan.asteroidId;
            const wasViaArea = scan.viaArea;
            activeScanRef.current = null;
            asteroidsAPI.scan(astId)
              .then(({ contents, stat_purity, stat_stability, stat_potency, stat_density }) => {
                const a = asteroidsRef.current.find(x => x.id === astId);
                if (a) {
                  a.scanned = true;
                  a.contents = contents;
                  // Phase 1 quality pass: server returns the asteroid's
                  // rolled stats on scan. Store them so the click-to-mine
                  // tooltip can show the quality tier going forward.
                  a.stat_purity = stat_purity;
                  a.stat_stability = stat_stability;
                  a.stat_potency = stat_potency;
                  a.stat_density = stat_density;
                }
                // Per-rock toast for explicit single-click scans only.
                // Queued area scans would spam N toasts -- the single
                // "Area scan complete" toast at queue end is enough.
                if (!wasViaArea) {
                  const pt = useGameStore.getState().pushToast;
                  const qLabel = formatAsteroidQuality({ stat_purity, stat_stability, stat_potency, stat_density });
                  if (pt) pt({
                    kind: 'success',
                    text: `Scan complete — ${qLabel || 'unknown quality'}: ${formatContents(contents)}`,
                    duration: 5000,
                  });
                }
                // Tutorial: first successful asteroid scan completes
                // the chain quest from tutorial_fit_modules. Server is
                // idempotent so we can fire freely on every scan.
                if (completeQuest) completeQuest('tutorial_scan_asteroid');
              })
              .catch(err => {
                const pt = useGameStore.getState().pushToast;
                if (pt) pt({ kind: 'error', text: err?.message || 'Scan failed', duration: 3000 });
              });
          }
        }
      }

      // Area-scan queue advance: when no scan is active, either kick
      // off the next queued one or fire the completion toast if the
      // queue just drained (areaScanRangeRef stays > 0 while we're in
      // queue mode; advanceAreaScanQueue zeros it and toasts on empty).
      if (!activeScanRef.current && (areaScanQueueRef.current.length > 0 || areaScanRangeRef.current > 0)) {
        advanceAreaScanQueue();
      }

      // --- Wreck proximity claim ---
      // Local-only wreckage: expire old wrecks (5-min TTL) and on
      // pickup, award credits via fittingAPI.awardLoot (which works
      // today) instead of wrecksAPI.claim (which 500s on missing
      // table). claimingWrecksRef dedupes mid-flight requests so a
      // 60fps loop doesn't fire awardLoot multiple times per wreck.
      if (wrecksRef.current.length > 0) {
        const now = Date.now();
        // Drop expired wrecks first (avoid claiming a stale wreck)
        wrecksRef.current = wrecksRef.current.filter(w => (w.expires_at_ms ?? Infinity) > now);

        const px = playerPos.x, py = playerPos.y;
        for (let i = wrecksRef.current.length - 1; i >= 0; i--) {
          const w = wrecksRef.current[i];
          if (claimingWrecksRef.current.has(w.id)) continue;
          const dx = w.x - px, dy = w.y - py;
          if (dx * dx + dy * dy < PICKUP_RANGE * PICKUP_RANGE) {
            claimingWrecksRef.current.add(w.id);
            const wreckId = w.id;
            const credits = w.contents?.credits || 0;
            fittingAPI.awardLoot(credits)
              .then(() => {
                wrecksRef.current = wrecksRef.current.filter(x => x.id !== wreckId);
                const fc = useGameStore.getState().fetchCredits;
                if (fc) fc();
                const pt = useGameStore.getState().pushToast;
                if (pt && credits > 0) {
                  pt({ kind: 'success', text: `+${credits} cr salvaged`, duration: 2500 });
                }
                claimingWrecksRef.current.delete(wreckId);
              })
              .catch(err => {
                console.warn('salvage award failed:', err);
                claimingWrecksRef.current.delete(wreckId);
              });
          }
        }
      }

      // --- Sync combat state to React (every 5 frames for perf) ---
      if (frameNum % 5 === 0) {
        const hullNow = Math.round(playerHullRef.current);
        const shieldNow = Math.round(playerShieldRef.current);
        // Raw count: how many enemies actually exist in the system,
        // regardless of whether the fleet can detect them. Drives the
        // "clear sector" quest (semantically: are there hostiles in
        // this system, yes or no -- not "are any visible right now").
        const enemiesAlive = enemies.filter(e => e.hull > 0).length;
        // Visible count: gated by fleet sensor range. Drives the HUD
        // and Outliner so the number in the UI matches the number of
        // hostiles you can actually see on screen.
        const sensorR = fleetSensorRange();
        const sensorR2 = sensorR * sensorR;
        const visibleEnemies = enemies.filter(e => {
          if (e.hull <= 0) return false;
          const dx = e.x - shipPosRef.current.x;
          const dy = e.y - shipPosRef.current.y;
          return dx * dx + dy * dy <= sensorR2;
        }).length;
        setPlayerHullDisplay(hullNow);
        setPlayerShieldDisplay(shieldNow);
        setEnemyCount(enemiesAlive);
        // Push to GameFrame top bar via store. HUD shows VISIBLE count
        // so what the player sees in the UI matches what's on screen.
        updateHud({
          playerHull: hullNow,
          playerMaxHull: playerMaxHullRef.current,
          playerShield: shieldNow,
          playerMaxShield: playerMaxShieldRef.current,
          enemyCount: visibleEnemies,
          followMode: followModeRef.current,
        });

        // Scanner snapshot for the System Map pane. Hybrid persistence
        // model per design call:
        //   * Asteroids -- show those the player has scanned (server-
        //     persisted). Static; stays on the map forever.
        //   * Live enemies -- currently inside sensor range. Real-time.
        //   * Ghost enemies -- last-known position from the moment they
        //     left sensor range. Fades over GHOST_TTL_MS then drops.
        //     Mirrors EVE/Stellaris "fog of war" feel.
        const px = shipPosRef.current.x, py = shipPosRef.current.y;
        const liveEnemiesArr = [];
        const ghosts = enemyGhostsRef.current;
        const seenBefore = seenBeforeRef.current;
        for (const e of enemies) {
          if (e.hull <= 0) {
            // Dead enemies clean up their tracking state so a respawn
            // with the same id doesn't auto-promote to "seen before."
            ghosts.delete(e.id);
            seenBefore.delete(e.id);
            continue;
          }
          const dx = e.x - px, dy = e.y - py;
          const inRange = (dx * dx + dy * dy) <= sensorR2;
          if (inRange) {
            seenBefore.add(e.id);
            ghosts.delete(e.id);
            liveEnemiesArr.push({
              id: e.id,
              x: e.x, y: e.y,
              name: e.name || 'Hostile',
              color: e.engineColor || '#ef4444',
            });
          } else if (seenBefore.has(e.id) && !ghosts.has(e.id)) {
            // Transition: was visible -> not visible. Snapshot now.
            ghosts.set(e.id, {
              id: e.id,
              x: e.x, y: e.y,
              name: e.name || 'Hostile',
              color: e.engineColor || '#ef4444',
              lastSeenMs: Date.now(),
            });
          }
        }
        // Age out stale ghosts.
        const nowMs = Date.now();
        for (const [id, g] of ghosts) {
          if (nowMs - g.lastSeenMs > GHOST_TTL_MS) ghosts.delete(id);
        }

        // Scanned asteroids: lifted straight from asteroidsRef -- the
        // server-side gate already filters /asteroids to only return
        // scanned contents, so we further trust the `scanned` flag on
        // each row. Pushing positions only; the map cares about
        // location + size, not contents.
        const scannedAst = (asteroidsRef.current || [])
          .filter(a => a.scanned)
          .map(a => ({ id: a.id, x: a.x, y: a.y, size: a.size || 4 }));

        setScannerData({
          scannedAsteroids: scannedAst,
          liveEnemies: liveEnemiesArr,
          enemyGhosts: [...ghosts.values()],
          sensorRange: sensorR,
        });
      }
      
      // Trigger React re-render by incrementing frame counter
      setFrameCount(f => f + 1);

      // Push ship position to gameStore every 10 frames for nav window
      if (frameNum % 10 === 0) {
        const speed = Math.sqrt(shipVelRef.current.x * shipVelRef.current.x + shipVelRef.current.y * shipVelRef.current.y);
        updateShipPosition(shipPosRef.current.x, shipPosRef.current.y, speed, gameTime);
      }
      
      animationId = requestAnimationFrame(gameLoop);
    };
    
    animationId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationId);
  }, []); // Empty deps - loop runs independently

  // Keyboard input
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      keysPressed.current.add(key);

      // Engine ambient — W is the gas key. startLoop is idempotent,
      // so the OS-level keydown repeat (~30/sec while held) just no-ops
      // after the first call. dockedBody check prevents the engine
      // firing while parked at a station.
      if (key === 'w' && !dockedBodyRef.current) {
        startLoop('fleet_engine');
      }

      // Cancel autopilot on Escape
      if (key === 'escape') {
        cancelAutopilot();
      }

      // Cancel autopilot on manual movement keys
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        if (autopilotTargetRef.current) {
          cancelAutopilot();
        }
      }
      
      // Toggle follow mode
      if (key === 'f') {
        setFollowMode(f => !f);
      }
      
      // Manual camera controls when not following
      if (!followModeRef.current) {
        const panAmount = 100 / zoom;
        switch (key) {
          case 'arrowup': cameraRef.current = { ...cameraRef.current, y: cameraRef.current.y - panAmount }; break;
          case 'arrowdown': cameraRef.current = { ...cameraRef.current, y: cameraRef.current.y + panAmount }; break;
          case 'arrowleft': cameraRef.current = { ...cameraRef.current, x: cameraRef.current.x - panAmount }; break;
          case 'arrowright': cameraRef.current = { ...cameraRef.current, x: cameraRef.current.x + panAmount }; break;
        }
      }
      
      // Zoom controls
      if (key === '=' || key === '+') setZoom(z => Math.min(MAX_ZOOM, z * 1.2));
      if (key === '-' || key === '_') setZoom(z => Math.max(MIN_ZOOM, z / 1.2));
      if (key === 'home') {
        cameraRef.current = { x: 0, y: 0 };
        setZoom(1.0);
      }
    };
    
    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      keysPressed.current.delete(key);
      // Counterpart to the engine startLoop in handleKeyDown. Stops the
      // ambient when the player releases the gas. (Window blur isn't
      // handled here -- if the user alt-tabs while holding W, keyup
      // typically fires anyway; if it sticks, we'll add a blur listener.)
      if (key === 'w') {
        stopLoop('fleet_engine');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [zoom, cancelAutopilot]);

  // Viewport size
  useEffect(() => {
    const updateSize = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (svgRef.current) observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, []);

  // ViewBox - uses refs for smooth updates
  const camera = cameraRef.current;
  const viewBox = {
    x: camera.x - (viewportSize.width / 2) / zoom,
    y: camera.y - (viewportSize.height / 2) / zoom,
    width: viewportSize.width / zoom,
    height: viewportSize.height / zoom,
  };
  
  // Current time for planet animations — use same time source as physics loop
  const time = gameTimeRef.current;

  // Calculate planet positions for station parents
  const getBodyPosition = useCallback((bodyId) => {
    const body = currentSystem.bodies.find(b => b.id === bodyId);
    if (!body) return { x: 0, y: 0 };
    
    if (body.parentBody) {
      const parent = currentSystem.bodies.find(pb => pb.id === body.parentBody);
      if (parent) {
        const parentAngle = time * parent.orbitSpeed + (parent.orbitOffset || 0);
        const parentPos = {
          x: Math.cos(parentAngle) * parent.orbitRadius,
          y: Math.sin(parentAngle) * parent.orbitRadius,
        };
        const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
        return {
          x: parentPos.x + Math.cos(angle) * body.orbitRadius,
          y: parentPos.y + Math.sin(angle) * body.orbitRadius,
        };
      }
    }
    
    const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
    return {
      x: Math.cos(angle) * body.orbitRadius,
      y: Math.sin(angle) * body.orbitRadius,
    };
  }, [currentSystem.bodies, time]);

  // Mouse handlers
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = -e.deltaY * ZOOM_SPEED;
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta * z)));
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (isDragging) {
      const dx = (e.clientX - dragStart.x) / zoom;
      const dy = (e.clientY - dragStart.y) / zoom;
      cameraRef.current = { 
        x: cameraRef.current.x - dx, 
        y: cameraRef.current.y - dy 
      };
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [isDragging, dragStart, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
  }, []);

  return (
    <>
    <div className="absolute inset-0 system-view-canvas" style={{ zIndex: 1 }}>
      {/* Full-screen game canvas */}
      <div className="w-full h-full relative overflow-hidden" style={{ background: '#030308' }}>
          <svg
            ref={svgRef}
            className="w-full h-full"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={handleContextMenu}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            {/* Definitions */}
            <defs>
              <radialGradient id="planetHighlight" cx="30%" cy="30%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
              <filter id="planetGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>

            {/* Background */}
            <rect
              x={viewBox.x - 1000}
              y={viewBox.y - 1000}
              width={viewBox.width + 2000}
              height={viewBox.height + 2000}
              fill="#030308"
            />

            {/* Starfield */}
            <Starfield camera={camera} zoom={zoom} time={time} />

            {/* Asteroid belts (render first, behind planets) */}
            {currentSystem.bodies
              .filter(b => b.type === 'asteroid_belt')
              .map(body => (
                <AsteroidBelt key={body.id} body={body} />
              ))}

            {/* Star */}
            <Star starType={currentSystem.starType} x={0} y={0} time={time} />

            {/* Planets */}
            {currentSystem.bodies
              .filter(b => b.type === 'planet')
              .map(body => (
                <Planet 
                  key={body.id} 
                  body={body} 
                  time={time} 
                  onClick={() => setDestination(body)}
                  isTarget={autopilotTarget?.id === body.id}
                />
              ))}

            {/* Stations */}
            {currentSystem.bodies
              .filter(b => b.type === 'station')
              .map(body => (
                <Station
                  key={body.id}
                  body={body}
                  parentPosition={body.parentBody ? getBodyPosition(body.parentBody) : { x: 0, y: 0 }}
                  time={time}
                  onClick={() => setDestination(body)}
                  isTarget={autopilotTarget?.id === body.id}
                />
              ))}

            {/* Jump Gates */}
            {currentSystem.bodies
              .filter(b => b.type === 'jump_gate')
              .map(body => (
                <JumpGate
                  key={body.id}
                  body={body}
                  time={time}
                  onClick={() => setDestination(body)}
                  isTarget={autopilotTarget?.id === body.id}
                />
              ))}

            {/* Warp Points */}
            {currentSystem.bodies
              .filter(b => b.type === 'warp_point')
              .map(body => (
                <WarpPoint
                  key={body.id}
                  body={body}
                  time={time}
                  onClick={() => setDestination(body)}
                  isTarget={autopilotTarget?.id === body.id}
                />
              ))}

            {/* Autopilot destination line */}
            {autopilotTarget && (() => {
              const targetBody = currentSystem.bodies.find(b => b.id === autopilotTarget.id);
              if (!targetBody) return null;
              const targetPos = getBodyPosition(autopilotTarget.id);
              return (
                <line
                  x1={shipPosRef.current.x}
                  y1={shipPosRef.current.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  stroke="#00ffff"
                  strokeWidth="1"
                  strokeDasharray="10 5"
                  opacity="0.5"
                />
              );
            })()}

            {/* Fleet Contrails — fading trails behind each ship */}
            {fleetShips.map((ship) => {
              const trail = trailsRef.current[ship.id];
              if (!trail || trail.length < 3) return null;
              const len = trail.length;
              // Render as individual segments with rapid opacity falloff
              const segments = [];
              for (let i = 0; i < len - 1; i++) {
                const t = i / len; // 0 = oldest, ~1 = newest
                // Cubic fade — most of the trail is nearly invisible
                const alpha = t * t * t;
                // Width tapers from thin (old) to thicker (new)
                const w = ship.isActive ? 0.5 + alpha * 2 : 0.3 + alpha * 1.2;
                segments.push(
                  <line
                    key={i}
                    x1={trail[i].x} y1={trail[i].y}
                    x2={trail[i+1].x} y2={trail[i+1].y}
                    stroke={ship.engineColor}
                    strokeWidth={w}
                    opacity={alpha * 0.35}
                    strokeLinecap="round"
                  />
                );
              }
              return <g key={`trail-${ship.id}`}>{segments}</g>;
            })}

            {/* Range overlay -- dashed rings centered on the active
                ship showing what the fleet can "see" (sensor range,
                gates enemy + wreck visibility) and what it can scan
                (asteroid contents). Toggled by the System Map header
                button. Drawn before fleet ships so icons sit on top.
                Centers on shipPosRef.current; the rings live in world
                coordinates and pan with the camera naturally. */}
            {showRangeOverlay && (() => {
              const px = shipPosRef.current.x, py = shipPosRef.current.y;
              const sensorR = fleetSensorRange();
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <circle cx={px} cy={py} r={sensorR}
                    fill="none" stroke="#60a5fa" strokeWidth="0.8"
                    strokeDasharray="6,4" opacity="0.45" />
                  <text x={px} y={py - sensorR - 2} textAnchor="middle"
                    fill="#60a5fa" fontSize="4" fontFamily="monospace"
                    letterSpacing="0.5" opacity="0.7">
                    SENSOR {Math.round(sensorR)}
                  </text>
                  {(() => {
                    const scanR = fleetScanRange();
                    return (
                      <>
                        <circle cx={px} cy={py} r={scanR}
                          fill="none" stroke="#22c55e" strokeWidth="0.8"
                          strokeDasharray="6,4" opacity="0.55" />
                        <text x={px} y={py - scanR - 2} textAnchor="middle"
                          fill="#22c55e" fontSize="4" fontFamily="monospace"
                          letterSpacing="0.5" opacity="0.75">
                          SCAN {scanR}
                        </text>
                      </>
                    );
                  })()}
                </g>
              );
            })()}

            {/* Fleet Ships — Flying V formation. Active ship reads
                directly from shipPosRef + shipRotationRef. Wingmen read
                their lagged position + heading from wingmenPosRef so
                they bank into turns and trail naturally behind the
                leader instead of pivoting rigidly around it. */}
            {fleetShips.map((ship) => {
              if (!ship.icon) return null;
              let sx, sy, shipRot;
              if (ship.isActive) {
                sx = shipPosRef.current.x;
                sy = shipPosRef.current.y;
                shipRot = shipRotationRef.current;
              } else {
                const w = wingmenPosRef.current[ship.id];
                if (w) {
                  sx = w.x; sy = w.y; shipRot = w.rot;
                } else {
                  // Pre-lag-init fallback: compute the rigid slot once
                  // so the icon renders during the first frame before
                  // the game loop seeds wingmenPosRef.
                  const offset = ship.formationOffset;
                  const theta = shipRotationRef.current * Math.PI / 180;
                  const cosT = Math.cos(theta), sinT = Math.sin(theta);
                  sx = shipPosRef.current.x + (-sinT) * offset.x + (-cosT) * offset.y;
                  sy = shipPosRef.current.y + (cosT) * offset.x + (-sinT) * offset.y;
                  shipRot = shipRotationRef.current;
                }
              }
              const iw = ship.icon.width;
              const ih = ship.icon.height;

              return (
                <g key={ship.id} transform={`translate(${sx}, ${sy})`}>
                  {/* Ambient glow for visibility */}
                  <circle
                    r={Math.max(6, ih * 0.6)}
                    fill={ship.engineColor}
                    opacity={ship.isActive ? 0.12 : 0.08}
                  />
                  {/* Ship icon rotated to heading. Per CLAUDE.md
                      pitfall #3, the SVG ship icon points UP so we
                      add +90 to the math-degrees rotation. */}
                  <g transform={`rotate(${shipRot + 90})`}>
                    <image
                      href={ship.icon.dataUrl}
                      x={-iw/2}
                      y={-ih/2}
                      width={iw}
                      height={ih}
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </g>
                  {/* Name label — only for active ship */}
                  {ship.isActive && (
                    <text
                      x={0} y={ih/2 + 8}
                      textAnchor="middle"
                      fill="#67e8f9"
                      fontSize="7"
                      fontFamily="monospace"
                      opacity="0.7"
                      style={{ pointerEvents: 'none' }}
                    >
                      {ship.name}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Enemy Ships -- sensor-gated. Only render enemies inside
                the fleet's sensor range (max of fitted scanners, falls
                back to INNATE_SENSOR_RANGE if none). AI keeps running
                on out-of-range enemies (they continue to patrol /
                aggro / attack); they're just hidden from the screen.
                Captured to a const so all three sensor-gated render
                blocks (ships, projectiles-from-them, etc.) read the
                same snapshot per frame. */}
            {(() => {
              const sensorR = fleetSensorRange();
              const sensorR2 = sensorR * sensorR;
              const px = shipPosRef.current.x, py = shipPosRef.current.y;
              return enemiesRef.current.filter(e => {
                if (e.hull <= 0) return false;
                const dx = e.x - px, dy = e.y - py;
                return dx * dx + dy * dy <= sensorR2;
              });
            })().map(enemy => {
              const isDesignated = designatedEnemyId === enemy.id;
              return (
              <g key={enemy.id}
                 onClick={(e) => {
                   e.stopPropagation();
                   playSound('button_click');
                   setDesignatedEnemy(enemy.id);
                   if (pushToast) pushToast({
                     kind: 'info',
                     text: isDesignated
                       ? `Cleared target lock on ${enemy.name}`
                       : `Targeting ${enemy.name} — fleet weapons + missile lock prioritize this enemy`,
                     duration: 2200,
                   });
                 }}
                 style={{ cursor: 'pointer' }}>
                {/* Aggro ring when attacking */}
                {(enemy.state === 'attack' || enemy.state === 'chase') && (
                  <circle cx={enemy.x} cy={enemy.y} r={enemy.displaySize + 8}
                    fill="none" stroke="#ff444444" strokeWidth="0.5" strokeDasharray="3,3" />
                )}
                {/* Designated-target reticle: 4 corner brackets that
                    pulse subtly. Persists at any distance so the
                    player can see "this is my pick" even at sensor
                    range, well before missiles can reach. */}
                {isDesignated && (() => {
                  const r = enemy.displaySize + 6;
                  const tick = 3;
                  return (
                    <g style={{ pointerEvents: 'none' }}>
                      {/* TL bracket */}
                      <polyline points={`${enemy.x-r+tick},${enemy.y-r} ${enemy.x-r},${enemy.y-r} ${enemy.x-r},${enemy.y-r+tick}`}
                        fill="none" stroke="#ef4444" strokeWidth="1.2" />
                      {/* TR */}
                      <polyline points={`${enemy.x+r-tick},${enemy.y-r} ${enemy.x+r},${enemy.y-r} ${enemy.x+r},${enemy.y-r+tick}`}
                        fill="none" stroke="#ef4444" strokeWidth="1.2" />
                      {/* BL */}
                      <polyline points={`${enemy.x-r+tick},${enemy.y+r} ${enemy.x-r},${enemy.y+r} ${enemy.x-r},${enemy.y+r-tick}`}
                        fill="none" stroke="#ef4444" strokeWidth="1.2" />
                      {/* BR */}
                      <polyline points={`${enemy.x+r-tick},${enemy.y+r} ${enemy.x+r},${enemy.y+r} ${enemy.x+r},${enemy.y+r-tick}`}
                        fill="none" stroke="#ef4444" strokeWidth="1.2" />
                      <text x={enemy.x} y={enemy.y - r - 1.5}
                        textAnchor="middle" fill="#ef4444" fontSize="4"
                        fontFamily="monospace" letterSpacing="0.5">
                        TARGET
                      </text>
                    </g>
                  );
                })()}
                {/* Enemy glow */}
                <circle cx={enemy.x} cy={enemy.y} r={enemy.displaySize + 3}
                  fill={enemy.engineColor + '15'} />
                {/* Enemy ship icon */}
                {enemy.icon && (
                  <image
                    href={enemy.icon.dataUrl}
                    x={enemy.x - enemy.icon.width / 2}
                    y={enemy.y - enemy.icon.height / 2}
                    width={enemy.icon.width}
                    height={enemy.icon.height}
                    transform={`rotate(${enemy.rotation + 90}, ${enemy.x}, ${enemy.y})`}
                    style={{ imageRendering: 'pixelated' }}
                  />
                )}
                {/* Health bar (only when damaged or attacking) */}
                {(enemy.hull < enemy.maxHull || enemy.state === 'attack' || enemy.state === 'chase') && (
                  <g transform={`translate(${enemy.x - 10}, ${enemy.y + enemy.displaySize + 4})`}>
                    {/* Shield bar */}
                    {enemy.maxShield > 0 && (
                      <>
                        <rect x="0" y="0" width="20" height="2" fill="#222244" rx="0.5" />
                        <rect x="0" y="0" width={20 * (enemy.shield / enemy.maxShield)} height="2"
                          fill="#4488ff" rx="0.5" />
                      </>
                    )}
                    {/* Hull bar */}
                    <rect x="0" y="3" width="20" height="2" fill="#332222" rx="0.5" />
                    <rect x="0" y="3" width={20 * (enemy.hull / enemy.maxHull)} height="2"
                      fill={enemy.hull > enemy.maxHull * 0.5 ? '#44aa44' : enemy.hull > enemy.maxHull * 0.25 ? '#aaaa44' : '#ff4444'}
                      rx="0.5" />
                  </g>
                )}
                {/* Faction name */}
                {(enemy.state === 'attack' || enemy.state === 'chase') && (
                  <text x={enemy.x} y={enemy.y - enemy.displaySize - 5}
                    textAnchor="middle" fill="#ff4444" fontSize="5" fontFamily="monospace" opacity="0.8">
                    {enemy.name}
                  </text>
                )}
                {/* Missile lock-on ring -- only if the PRIMARY ship is
                    currently locking onto this enemy. Yellow dashed
                    ring with a green progress arc that fills as the
                    lock-time elapses. Once filled, the ring stays
                    bright as a "weapons free" indicator until lock
                    drops. */}
                {(() => {
                  const lock = missileLockRef.current[playerShip?.id];
                  if (!lock || lock.targetId !== enemy.id) return null;
                  // Find any missile weapon on the primary to read lock_time.
                  // Use the first one (all missile launchers on a ship
                  // share the same lock state).
                  const missileWeapon = (playerShip?.fitted_modules
                    ? Object.values(playerShip.fitted_modules).find(
                        m => m?.module_type_id?.startsWith('weapon_missile')
                      )
                    : null);
                  const lockTime = missileWeapon?.stats?.lock_time
                    ?? WEAPON_DEFAULTS.missile.lock_time
                    ?? 2;
                  const elapsedSec = (Date.now() - lock.startedAt) / 1000;
                  const pct = Math.min(1, elapsedSec / lockTime);
                  const r = enemy.displaySize + 10;
                  const circumference = 2 * Math.PI * r;
                  const isLocked = pct >= 1;
                  return (
                    <g style={{ pointerEvents: 'none' }}>
                      {/* Outer guide ring (always present) */}
                      <circle cx={enemy.x} cy={enemy.y} r={r}
                        fill="none" stroke="#fbbf24"
                        strokeWidth={isLocked ? 0.9 : 0.5}
                        strokeDasharray="3,2"
                        opacity={isLocked ? 0.9 : 0.55} />
                      {/* Progress arc that fills clockwise */}
                      <circle cx={enemy.x} cy={enemy.y} r={r}
                        fill="none"
                        stroke={isLocked ? '#22c55e' : '#fbbf24'}
                        strokeWidth={1.5}
                        strokeDasharray={`${pct * circumference} ${circumference}`}
                        transform={`rotate(-90, ${enemy.x}, ${enemy.y})`}
                        opacity={0.95} />
                      {/* Tag */}
                      <text x={enemy.x} y={enemy.y + r + 6}
                        textAnchor="middle"
                        fill={isLocked ? '#22c55e' : '#fbbf24'}
                        fontSize="4.5"
                        fontFamily="monospace"
                        letterSpacing="0.5">
                        {isLocked ? 'LOCK' : `LOCKING ${Math.round(pct * 100)}%`}
                      </text>
                    </g>
                  );
                })()}
              </g>
              );
            })}

            {/* Mining beams (green, constant while assigned). One beam
                per laser, from its ship to its assigned asteroid. Multi-
                target Phase A4: different lasers can be on different
                asteroids, so we draw one beam per entry in the
                assignment map rather than fan-firing every fleet laser
                at a single target. Layered render mirrors the combat
                laser_beam style. */}
            {miningAssignmentsRef.current.size > 0 && (() => {
              const beams = [];
              // Build a quick shipId -> position lookup so we don't
              // re-resolve the same ship's pos twice when it carries
              // two lasers on different rocks.
              const px = shipPosRef.current.x, py = shipPosRef.current.y;
              const posByShipId = {};
              const getShipPos = (fs) => {
                if (posByShipId[fs.id]) return posByShipId[fs.id];
                let sx, sy;
                if (fs.isActive) { sx = px; sy = py; }
                else {
                  const w = wingmenPosRef.current[fs.id];
                  if (w) { sx = w.x; sy = w.y; }
                  else {
                    // Pre-lag-init fallback. Same theta math we use for
                    // the wingman lag block above.
                    const theta = shipRotationRef.current * Math.PI / 180;
                    const cosT = Math.cos(theta), sinT = Math.sin(theta);
                    const off = fs.formationOffset || { x: 0, y: 0 };
                    sx = px + (-sinT) * off.x + (-cosT) * off.y;
                    sy = py + (cosT) * off.x + (-sinT) * off.y;
                  }
                }
                posByShipId[fs.id] = { x: sx, y: sy };
                return posByShipId[fs.id];
              };
              const shipsById = {};
              for (const fs of (fleetShipsRef.current || [])) shipsById[fs.id] = fs;
              for (const [laserKey, assignment] of miningAssignmentsRef.current) {
                const target = asteroidsRef.current.find(a => a.id === assignment.asteroidId);
                if (!target) continue;
                const sepIdx = laserKey.indexOf('::');
                const shipId = laserKey.slice(0, sepIdx);
                const fs = shipsById[shipId];
                if (!fs) continue;
                const { x: sx, y: sy } = getShipPos(fs);
                beams.push(
                  <g key={`mbeam-${laserKey}`} style={{ pointerEvents: 'none' }}>
                    <line x1={sx} y1={sy} x2={target.x} y2={target.y}
                      stroke="#44ff66" strokeWidth={3} opacity={0.25} strokeLinecap="round" />
                    <line x1={sx} y1={sy} x2={target.x} y2={target.y}
                      stroke="#44ff66" strokeWidth={1.4} opacity={0.85} strokeLinecap="round" />
                    <line x1={sx} y1={sy} x2={target.x} y2={target.y}
                      stroke="#ffffff" strokeWidth={0.4} opacity={0.7} strokeLinecap="round" />
                  </g>
                );
              }
              return beams;
            })()}

            {/* Asteroids (Phase A1: presence only -- scan in A2, mine in
                A3). Render before wrecks/projectiles so combat reads on
                top. Each asteroid is a small irregular gray rock shape
                with a slight rotation for variety. No interaction yet. */}
            {asteroidsRef.current.map(a => {
              // Tiny irregular polygon for the rocky silhouette. Same
              // shape rotated per-asteroid by `a.rotation` for variety.
              const s = a.size;
              const pts = [
                [s, 0], [s * 0.6, s * 0.8], [-s * 0.3, s], [-s, s * 0.3],
                [-s * 0.8, -s * 0.5], [-s * 0.2, -s], [s * 0.7, -s * 0.6],
              ].map(([px, py]) => {
                const c = Math.cos(a.rotation), si = Math.sin(a.rotation);
                return `${px * c - py * si},${px * si + py * c}`;
              }).join(' ');
              // A2: scanned asteroids get a green tint + outline so
              // the player can see at a glance which ones they've
              // surveyed. Active scan target gets a yellow arc that
              // fills over scan_time.
              const isScanning = activeScanRef.current?.asteroidId === a.id;
              // Phase A4: any laser pointed at this asteroid counts.
              // assignedLaserCount drives the optional Nx badge so the
              // player can see at a glance how many lasers are stacked.
              let assignedLaserCount = 0;
              for (const asn of miningAssignmentsRef.current.values()) {
                if (asn.asteroidId === a.id) assignedLaserCount++;
              }
              const isMineTarget = assignedLaserCount > 0;
              const scanPct = isScanning
                ? Math.min(1, (Date.now() - activeScanRef.current.startMs) / activeScanRef.current.durationMs)
                : 0;
              const ringR = a.size + 4;
              const circumference = 2 * Math.PI * ringR;
              // Hover tooltip content -- captured as JSX so the
              // existing TooltipProvider renders + positions it near
              // the cursor. Recomputed each render so it always
              // reflects the asteroid's current contents (which
              // decrement live during mining).
              const tooltipNode = (
                <div style={{
                  padding: '8px 12px', fontSize: 11, fontFamily: 'monospace',
                  minWidth: 160,
                }}>
                  {a.scanned ? (
                    <>
                      <div style={{
                        marginBottom: 6, color: '#a0c860', fontWeight: 700,
                        fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase',
                      }}>
                        Asteroid Contents
                      </div>
                      {/* Quality tier (Phase 4 polish). Shown only when
                          the asteroid has scanned stats -- legacy rows
                          from before migration 046 may not. Tier color
                          comes from getQualityTier so it visually
                          matches the inventory tile chrome. */}
                      {a.stat_purity != null && (() => {
                        const tier = getQualityTier(a.stat_purity, a.stat_stability, a.stat_potency, a.stat_density);
                        const avg = Math.round((a.stat_purity + a.stat_stability + a.stat_potency + a.stat_density) / 4);
                        return (
                          <div style={{
                            display: 'flex', justifyContent: 'space-between', gap: 16,
                            marginBottom: 6, paddingBottom: 6,
                            borderBottom: '1px solid #2a3a4a',
                          }}>
                            <span style={{ color: '#8a99aa', fontSize: 10 }}>Quality</span>
                            <span style={{ color: tier.color, fontWeight: 700 }}>
                              {tier.name} <span style={{ color: '#7a8a9a', fontWeight: 400 }}>(Q{avg})</span>
                            </span>
                          </div>
                        );
                      })()}
                      {(() => {
                        const entries = Object.values(a.contents || {}).filter(v => (v?.remaining || 0) > 0);
                        if (entries.length === 0) {
                          return <div style={{ color: '#888' }}>Empty</div>;
                        }
                        return entries.map((e, ei) => (
                          <div key={ei} style={{
                            display: 'flex', justifyContent: 'space-between', gap: 16,
                            color: '#e2e8f0',
                          }}>
                            <span>{e.name || `res_${ei}`}</span>
                            <span style={{ color: '#fbbf24' }}>{e.remaining || 0}u</span>
                          </div>
                        ));
                      })()}
                      {isMineTarget && (
                        <div style={{
                          marginTop: 6, paddingTop: 6, borderTop: '1px solid #2a3a4a',
                          color: '#ffaa44', fontSize: 9, letterSpacing: 0.5,
                        }}>
                          ▸ MINING ACTIVE ({assignedLaserCount} laser{assignedLaserCount === 1 ? '' : 's'})
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: '#888' }}>
                      Unsurveyed asteroid<br />
                      <span style={{ color: '#666', fontSize: 10 }}>Click to scan</span>
                    </div>
                  )}
                </div>
              );
              return (
                <g key={`ast-${a.id}`}
                   transform={`translate(${a.x}, ${a.y})`}
                   onClick={(e) => { e.stopPropagation(); handleAsteroidClick(a); }}
                   onMouseEnter={() => showTooltip(tooltipNode)}
                   onMouseLeave={() => hideTooltip()}
                   style={{ cursor: 'pointer' }}>
                  <polygon points={pts}
                    fill={a.scanned ? '#6b7a5c' : '#6b6258'}
                    stroke={a.scanned ? '#a0c860' : '#3a3530'}
                    strokeWidth={a.scanned ? 0.5 : 0.3} />
                  <polygon points={pts} fill="url(#planetHighlight)" opacity={0.25} />
                  {/* Active mining target lock ring (orange dashed).
                      With multi-laser, an outer concentric ring stacks
                      per additional laser so you can see at a glance
                      that 2+ lasers are dialed in. Capped at 3 rings to
                      avoid visual noise -- the tooltip carries the
                      exact count. */}
                  {isMineTarget && (() => {
                    const ringCount = Math.min(assignedLaserCount, 3);
                    return Array.from({ length: ringCount }).map((_, ri) => (
                      <circle key={`mring-${ri}`}
                        cx={0} cy={0} r={a.size + 6 + ri * 2}
                        fill="none" stroke="#ffaa44" strokeWidth={0.7}
                        opacity={0.85 - ri * 0.15} strokeDasharray="3,2"
                        style={{ pointerEvents: 'none' }} />
                    ));
                  })()}
                  {/* Badge: Nx when 2+ lasers are stacked. Single-laser
                      case skips the badge since the lock ring conveys
                      "mining" plenty. */}
                  {assignedLaserCount > 1 && (
                    <text x={0} y={-a.size - 6}
                      textAnchor="middle" fill="#ffaa44" fontSize="5"
                      fontFamily="monospace" fontWeight="700"
                      style={{ pointerEvents: 'none' }}>
                      {assignedLaserCount}×
                    </text>
                  )}
                  {/* Scan progress arc (yellow, fills clockwise) */}
                  {isScanning && (
                    <circle cx={0} cy={0} r={ringR}
                      fill="none" stroke="#ffdd44" strokeWidth={0.8}
                      strokeDasharray={`${scanPct * circumference} ${circumference}`}
                      transform="rotate(-90)" opacity={0.9}
                      style={{ pointerEvents: 'none' }} />
                  )}
                </g>
              );
            })}

            {/* Wrecks (lootable credit drops). Render between enemies and
                projectiles so projectiles read on top, but wrecks read
                above the planet/orbit layer. The frameCount setState in
                the game loop drives rerenders, so wreckRef updates pick
                up on the next frame. */}
            {wrecksRef.current.map(w => {
              const credits = w.contents?.credits || 0;
              // Phase 1.5: dropped modules surface as a cyan dashed ring
              // around the gold chip + a "+ MOD" suffix on the label so
              // the player can spot module wrecks at a distance.
              const hasModule = Array.isArray(w.contents?.modules) && w.contents.modules.length > 0;
              return (
                <g key={`wreck-${w.id}`}>
                  {/* Outer halo */}
                  <circle cx={w.x} cy={w.y} r={20} fill="#fbbf24" opacity={0.10} />
                  <circle cx={w.x} cy={w.y} r={12} fill="#fbbf24" opacity={0.20} />
                  {/* Module indicator ring */}
                  {hasModule && (
                    <circle cx={w.x} cy={w.y} r={9}
                      fill="none" stroke="#22d3ee" strokeWidth={0.8}
                      opacity={0.75} strokeDasharray="2,1.5" />
                  )}
                  {/* Center chip */}
                  <circle cx={w.x} cy={w.y} r={4}
                    fill="#f59e0b" stroke="#fff" strokeWidth={0.5} opacity={0.95} />
                  {/* Credit count + module hint */}
                  <text x={w.x} y={w.y - 14}
                    textAnchor="middle" fill="#fbbf24" fontSize="6"
                    fontFamily="monospace" opacity={0.9}
                    style={{ pointerEvents: 'none' }}>
                    {credits} cr{hasModule ? ' + MOD' : ''}
                  </text>
                </g>
              );
            })}

            {/* Projectiles */}
            {projectilesRef.current.map((p, i) => {
              const opacity = 1 - p.age / (p.lifetime ?? PROJECTILE_LIFETIME);
              if (p.weapon_type === 'missile') {
                // Triangle oriented to velocity direction
                const angle = Math.atan2(p.vy, p.vx) * 180 / Math.PI;
                return (
                  <g key={`proj-${i}`} transform={`translate(${p.x}, ${p.y}) rotate(${angle})`} opacity={opacity}>
                    {/* Trail */}
                    <line x1={-6} y1={0} x2={-1} y2={0} stroke={p.color} strokeWidth={1.2} opacity={0.4} />
                    {/* Body — small triangle */}
                    <polygon points="3,0 -2,1.5 -2,-1.5" fill={p.color} stroke="#ffffff" strokeWidth={0.2} />
                  </g>
                );
              }
              // Default kinetic / enemy bullet rendering
              return (
                <circle key={`proj-${i}`} cx={p.x} cy={p.y}
                  r={p.fromPlayer ? 1.5 : 1.2}
                  fill={p.color}
                  opacity={opacity}
                />
              );
            })}

            {/* Combat Effects -- ALL fx are decorative. Wrapper is
                pointer-events:none so mining sparkles spawning under
                the cursor don't capture mouseenter (which would fire
                mouseleave on the asteroid + drop its tooltip), and
                don't intercept clicks the player aimed at the rock. */}
            <g style={{ pointerEvents: 'none' }}>
            {combatEffectsRef.current.map((fx, i) => {
              const lifetime = fx.lifetime || 0.5;
              const t = fx.age / lifetime; // 0→1 over lifetime
              if (fx.type === 'laser_beam') {
                // Beam fades over its short lifetime
                return (
                  <g key={`fx-${i}`}>
                    {/* Outer glow */}
                    <line x1={fx.x1} y1={fx.y1} x2={fx.x2} y2={fx.y2}
                      stroke={fx.color} strokeWidth={3} opacity={(1 - t) * 0.35} strokeLinecap="round" />
                    {/* Core beam */}
                    <line x1={fx.x1} y1={fx.y1} x2={fx.x2} y2={fx.y2}
                      stroke={fx.color} strokeWidth={1.4} opacity={1 - t} strokeLinecap="round" />
                    {/* Bright center */}
                    <line x1={fx.x1} y1={fx.y1} x2={fx.x2} y2={fx.y2}
                      stroke="#ffffff" strokeWidth={0.5} opacity={(1 - t) * 0.8} strokeLinecap="round" />
                  </g>
                );
              }
              if (fx.type === 'hit') {
                return (
                  <circle key={`fx-${i}`} cx={fx.x} cy={fx.y}
                    r={3 + t * 6} fill="none" stroke={fx.color} strokeWidth={1 - t}
                    opacity={1 - t} />
                );
              }
              if (fx.type === 'explosion') {
                const s = fx.size || 8;
                return (
                  <g key={`fx-${i}`}>
                    <circle cx={fx.x} cy={fx.y} r={s * (0.5 + t * 2)} fill="none"
                      stroke="#ff8844" strokeWidth={2 * (1 - t)} opacity={1 - t} />
                    <circle cx={fx.x} cy={fx.y} r={s * (0.3 + t)} fill="#ffcc44"
                      opacity={0.6 * (1 - t)} />
                    <circle cx={fx.x} cy={fx.y} r={s * t * 3} fill="none"
                      stroke="#ff444466" strokeWidth={0.5} opacity={0.5 * (1 - t)} />
                  </g>
                );
              }
              if (fx.type === 'mining_spark') {
                // Tiny bright dot at the asteroid end of the mining beam.
                // Shrinks + fades over its 0.3s lifetime. Many spawned
                // per second while mining is active for a continuous-
                // sparkle look.
                const sz = (fx.size || 1) * (1 - t * 0.5);
                return (
                  <circle key={`fx-${i}`} cx={fx.x} cy={fx.y}
                    r={sz} fill={fx.color} opacity={1 - t} />
                );
              }
              return null;
            })}
            </g>
          </svg>

          {/* Navigation moved to NavigationWindow */}

          {/* HUD moved to GameFrame top bar (ship name, hull/shield, hostiles, autopilot) */}

          {/* Combat Log */}
          {combatLog.length > 0 && (
            <div className="absolute bottom-12 left-3 bg-slate-900/80 border border-red-500/20 rounded px-2 py-1.5 max-w-xs">
              {combatLog.slice(-3).map((msg, i) => (
                <div key={i} className="text-[10px] text-red-300/80">{msg}</div>
              ))}
            </div>
          )}

          {/* Controls hint */}
          <div className="absolute bottom-3 left-3 text-xs text-cyan-400/50 bg-slate-900/70 px-2 py-1 rounded">
            {autopilotTarget
              ? 'WASD/Esc: Cancel Autopilot | Click: New Destination'
              : 'W: Thrust | A/D: Turn | S: Brake | Click: Autopilot'
            }
          </div>

          {/* Tier B scan-ability tray. Each button only renders when
              the matching module is fitted. Empty fleet -> nothing
              shows -- no clutter for a Starter Scout. Positioned at
              right: 56 to clear the System Map toggle (right:8 +
              width:38 + 10px gap) which sits at the same vertical
              level. */}
          {(fleetHasAreaScan() || fleetHasBulkScan() || fleetHasSystemSweep()) && (() => {
            const now = Date.now();
            const sweepActive = sweepActiveUntilRef.current > now;
            const sweepCooldownRemain = Math.max(0, Math.ceil((sweepCooldownUntilRef.current - now) / 1000));
            const areaQueueLen = areaScanQueueRef.current.length;
            const areaActive = areaQueueLen > 0 || activeScanRef.current?.viaArea;
            return (
              <div className="absolute flex gap-2" style={{ zIndex: 20, bottom: 40, right: 56 }}>
                {fleetHasAreaScan() && (
                  <button
                    onClick={handleAreaScan}
                    title={areaActive
                      ? `Click to cancel the area scan (${areaQueueLen} pending)`
                      : 'Queue scans for every unscanned asteroid in your sensor range. Each scan takes the normal scan time -- click again to cancel.'}
                    style={{
                      padding: '6px 12px',
                      background: areaActive
                        ? 'linear-gradient(180deg, #fbbf2433, #fbbf240a)'
                        : 'linear-gradient(180deg, #22d3ee22, #22d3ee08)',
                      border: `1px solid ${areaActive ? '#fbbf24aa' : '#22d3ee55'}`,
                      color: areaActive ? '#fbbf24' : '#22d3ee',
                      fontSize: 10, fontWeight: 800, letterSpacing: 1,
                      textTransform: 'uppercase', cursor: 'pointer',
                      borderRadius: 3, fontFamily: "'Rajdhani', sans-serif",
                    }}
                  >{areaActive ? `✕ Cancel (${areaQueueLen})` : '📡 Area Scan'}</button>
                )}
                {fleetHasBulkScan() && (() => {
                  const remain = Math.max(0, Math.ceil((bulkBeltCooldownUntilRef.current - now) / 1000));
                  const disabled = remain > 0;
                  return (
                    <button
                      onClick={handleBeltScan}
                      disabled={disabled}
                      title={disabled
                        ? `Bulk-belt scan cooling down (${remain}s)`
                        : 'Scan every asteroid in the nearest belt (90s cooldown)'}
                      style={{
                        padding: '6px 12px',
                        background: disabled
                          ? 'rgba(30,41,59,0.5)'
                          : 'linear-gradient(180deg, #a855f722, #a855f708)',
                        border: `1px solid ${disabled ? '#1e293b' : '#a855f755'}`,
                        color: disabled ? '#475569' : '#c084fc',
                        fontSize: 10, fontWeight: 800, letterSpacing: 1,
                        textTransform: 'uppercase',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        borderRadius: 3, fontFamily: "'Rajdhani', sans-serif",
                      }}
                    >📡 Bulk Belt{disabled && ` ${remain}s`}</button>
                  );
                })()}
                {fleetHasSystemSweep() && (
                  <button
                    onClick={handleSystemSweep}
                    disabled={sweepCooldownRemain > 0 && !sweepActive}
                    title={sweepActive
                      ? `System sweep active -- all enemies visible (${Math.ceil((sweepActiveUntilRef.current - now) / 1000)}s)`
                      : sweepCooldownRemain > 0
                        ? `System sweep cooling down (${sweepCooldownRemain}s)`
                        : 'Reveal every enemy in the system for 30s (120s cooldown)'}
                    style={{
                      padding: '6px 12px',
                      background: sweepActive
                        ? 'linear-gradient(180deg, #f59e0b44, #f59e0b14)'
                        : (sweepCooldownRemain > 0
                          ? 'rgba(30,41,59,0.5)'
                          : 'linear-gradient(180deg, #f59e0b22, #f59e0b08)'),
                      border: `1px solid ${sweepActive ? '#fbbf24' : (sweepCooldownRemain > 0 ? '#1e293b' : '#f59e0b55')}`,
                      color: sweepActive ? '#fde68a' : (sweepCooldownRemain > 0 ? '#475569' : '#f59e0b'),
                      fontSize: 10, fontWeight: 800, letterSpacing: 1,
                      textTransform: 'uppercase',
                      cursor: sweepCooldownRemain > 0 && !sweepActive ? 'not-allowed' : 'pointer',
                      borderRadius: 3, fontFamily: "'Rajdhani', sans-serif",
                    }}
                  >
                    🛰️ Sweep
                    {sweepActive && ` (${Math.ceil((sweepActiveUntilRef.current - now) / 1000)}s)`}
                    {!sweepActive && sweepCooldownRemain > 0 && ` ${sweepCooldownRemain}s`}
                  </button>
                )}
              </div>
            );
          })()}
      </div>
    </div>
    <PlanetInteractionWindow body={dockedBody} />
    </>
  );
};

export default SystemView;
