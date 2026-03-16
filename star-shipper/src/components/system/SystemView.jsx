import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { DraggableWindow } from '@/components/ui/DraggableWindow';
import { useGameStore, useShips, useActiveShip } from '@/stores/gameStore';
import { getShipIcon, FORMATION_OFFSETS, MAX_FLEET_SIZE, HULL_SHAPES, PIRATE_HULLS, FACTIONS } from '@/utils/shipRenderer';
import { generateGalaxy, generateSystemContent, FACTIONS as GALAXY_FACTIONS } from '@/utils/galaxyGenerator';
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
const PLAYER_FIRE_RANGE = 160;
const PLAYER_BASE_DAMAGE = 10;
const PLAYER_BASE_FIRE_RATE = 0.6; // seconds between shots
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
  const ships = useShips();
  const playerShip = useActiveShip();
  const shipHullSize = playerShip?.hull_size || 30;

  // Derive flight physics from active ship stats
  // base_speed 50 = 1.0x multiplier (baseline), 120 = 2.4x, 25 = 0.5x
  const speedMult = (playerShip?.base_speed || 50) / 50;
  const maneuverMult = (playerShip?.base_maneuver || 50) / 50;
  const SHIP_MAX_SPEED = BASE_SHIP_MAX_SPEED * Math.max(0.3, Math.min(3, speedMult));
  const SHIP_ACCELERATION = BASE_SHIP_ACCELERATION * Math.max(0.3, Math.min(3, speedMult));
  const SHIP_ROTATION_SPEED = BASE_SHIP_ROTATION_SPEED * Math.max(0.3, Math.min(3, maneuverMult));

  // Keep refs so animation loop always reads latest
  const shipPhysicsRef = useRef({ SHIP_MAX_SPEED, SHIP_ACCELERATION, SHIP_ROTATION_SPEED });
  shipPhysicsRef.current = { SHIP_MAX_SPEED, SHIP_ACCELERATION, SHIP_ROTATION_SPEED };
  
  // Derive weapon stats from fitted modules
  // No weapon module = no shooting
  const weaponStats = useMemo(() => {
    const fitted = playerShip?.fitted_modules || {};
    const weapons = Object.values(fitted).filter(m => m.module_type_id?.startsWith('weapon_'));
    if (weapons.length === 0) return null; // No weapons equipped
    
    // Each weapon adds damage; best quality determines fire rate bonus
    let totalDamage = 0;
    let bestQualityMult = 1.0;
    for (const w of weapons) {
      let qMult = 1.0;
      if (w.quality) {
        const avg = ((w.quality.purity || 50) + (w.quality.stability || 50) +
                     (w.quality.potency || 50) + (w.quality.density || 50)) / 4;
        qMult = avg / 50;
      }
      totalDamage += PLAYER_BASE_DAMAGE * qMult;
      if (qMult > bestQualityMult) bestQualityMult = qMult;
    }
    return {
      damage: Math.round(totalDamage),
      fireRate: PLAYER_BASE_FIRE_RATE / Math.min(bestQualityMult, 2), // Better quality = faster fire
      count: weapons.length,
    };
  }, [playerShip?.fitted_modules]);
  
  const weaponStatsRef = useRef(weaponStats);
  weaponStatsRef.current = weaponStats;
  
  // Current system — Sol is hardcoded, everything else is procedurally generated
  const currentSystemId = useGameStore(state => state.currentSystem) || 'sol';
  const setCurrentSystemId = useGameStore(state => state.setCurrentSystemId);
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
  const autopilotTargetRef = useRef(null);
  
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
  const playerHullRef = useRef(100);
  const playerShieldRef = useRef(50);
  const playerMaxHullRef = useRef(100);
  const playerMaxShieldRef = useRef(50);
  const playerShieldRegenTimerRef = useRef(0);
  const combatInitializedRef = useRef(false);
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

  // Pre-render fleet ship icons for system view (tiny silhouettes)
  const fleetShips = useMemo(() => {
    const sorted = [...ships]
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
      return {
        ...ship,
        isActive,
        icon,
        engineColor: hullData?.palette?.engine || '#4488ff',
        formationOffset: FORMATION_OFFSETS[i] || { x: 0, y: 0 },
      };
    });
  }, [ships, playerShip?.id]);
  
  // Keep fleetShips accessible from game loop closure
  fleetShipsRef.current = fleetShips;
  
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
          
          // Wider capture zone — scales with ship speed so fast ships don't overshoot
          const captureRange = dockingRange + 80;
          const captureSpeed = Math.max(50, SHIP_MAX_SPEED * 0.3);
          
          if (currentDistance < captureRange && currentSpeed < captureSpeed) {
            // Close and slow - final approach, snap to docked position
            isBraking = true;
            thrustInput = 0;
            // Kill remaining velocity quickly
            shipVelRef.current.x *= 0.85;
            shipVelRef.current.y *= 0.85;
            
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
                    openWindow('planetInteraction');
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
            
            // APPROACH SPEED CONTROL — scale slowdown distance with max speed
            // Faster ships need to start braking much earlier
            const slowdownStartDistance = Math.max(250, SHIP_MAX_SPEED * 1.5);
            
            if (Math.abs(angleDiff) < 25) {
              if (currentDistance < slowdownStartDistance) {
                // Desired speed: drops steeply near target using squared falloff
                const t = currentDistance / slowdownStartDistance;
                const desiredSpeed = Math.max(10, t * t * SHIP_MAX_SPEED * 0.7);
                
                if (currentSpeed > desiredSpeed * 1.1) {
                  // Going too fast for this distance - brake hard
                  isBraking = true;
                  thrustInput = 0;
                } else if (currentSpeed < desiredSpeed * 0.5 && currentDistance > dockingRange * 2) {
                  // Going too slow - speed up
                  thrustInput = 0.5;
                } else {
                  // Coast or gentle thrust — only if far enough and very slow
                  if (currentDistance > dockingRange * 3 && currentSpeed < 20) {
                    thrustInput = 0.3;
                  }
                }
              } else {
                // Far from target - full thrust
                thrustInput = 1;
              }
            } else if (Math.abs(angleDiff) > 45 && currentSpeed > 15) {
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
      
      // Record contrail positions for all fleet ships
      if (frameNum % TRAIL_SAMPLE === 0) {
        const currentSpeed = Math.sqrt(newVx * newVx + newVy * newVy);
        if (currentSpeed > 3) { // Only trail when moving
          const theta = shipRotationRef.current * Math.PI / 180;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const rightX = -sinT, rightY = cosT;
          const behindX = -cosT, behindY = -sinT;
          
          const fleetData = fleetShipsRef.current || [];
          for (const fs of fleetData) {
            const off = fs.formationOffset;
            const wx = shipPosRef.current.x + rightX * off.x + behindX * off.y;
            const wy = shipPosRef.current.y + rightY * off.x + behindY * off.y;
            
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
        
        // State transitions
        if (enemy.state === 'patrol') {
          if (dist < PIRATE_AGGRO_RANGE) enemy.state = 'chase';
        } else if (enemy.state === 'chase') {
          if (dist < PIRATE_ATTACK_RANGE) enemy.state = 'attack';
          if (dist > PIRATE_DEAGGRO_RANGE) enemy.state = 'patrol';
        } else if (enemy.state === 'attack') {
          if (dist > PIRATE_ATTACK_RANGE * 1.5) enemy.state = 'chase';
          if (dist > PIRATE_DEAGGRO_RANGE) enemy.state = 'patrol';
          if (enemy.hull < enemy.maxHull * 0.2) enemy.state = 'flee';
        } else if (enemy.state === 'flee') {
          if (dist > PIRATE_DEAGGRO_RANGE * 1.5) enemy.state = 'patrol';
        }
        
        // Movement based on state
        let targetAngle, desiredSpeed;
        if (enemy.state === 'patrol') {
          enemy.patrolAngle += delta * 0.3;
          const px = enemy.patrolCenter.x + Math.cos(enemy.patrolAngle) * enemy.patrolRadius;
          const py = enemy.patrolCenter.y + Math.sin(enemy.patrolAngle) * enemy.patrolRadius;
          targetAngle = Math.atan2(py - enemy.y, px - enemy.x) * 180 / Math.PI;
          desiredSpeed = enemy.speed * 0.3;
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
        
        // Fire at player
        if (enemy.state === 'attack' && dist < enemy.range) {
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
      
      // --- Player auto-fire (only if weapons are equipped) ---
      const wStats = weaponStatsRef.current;
      if (wStats) {
        playerFireCooldownRef.current -= delta;
        if (playerFireCooldownRef.current <= 0) {
          // Find nearest alive enemy in range
          let nearest = null, nearestDist = PLAYER_FIRE_RANGE;
          for (const e of enemies) {
            if (e.hull <= 0) continue;
            const d = Math.sqrt((e.x - playerPos.x) ** 2 + (e.y - playerPos.y) ** 2);
            if (d < nearestDist) { nearest = e; nearestDist = d; }
          }
          if (nearest) {
            playerFireCooldownRef.current = wStats.fireRate;
            const pAngle = Math.atan2(nearest.y - playerPos.y, nearest.x - playerPos.x);
            projectiles.push({
              x: playerPos.x, y: playerPos.y,
              vx: Math.cos(pAngle) * PROJECTILE_SPEED,
              vy: Math.sin(pAngle) * PROJECTILE_SPEED,
              age: 0, fromPlayer: true, damage: wStats.damage,
              color: '#22ddee',
            });
          }
        }
      }
      
      // --- Update projectiles & collisions ---
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.age += delta;
        
        if (p.age > PROJECTILE_LIFETIME) {
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
              projectiles.splice(i, 1);
              
              // Enemy destroyed
              if (e.hull <= 0) {
                e.hull = 0;
                effects.push({ x: e.x, y: e.y, type: 'explosion', age: 0, size: e.displaySize });
                // Award credits via store
                const loot = e.lootCredits || 50;
                // We'll update credits display via combat log
                setCombatLog(prev => [...prev.slice(-4), `Destroyed ${e.name}! +${loot} cr`]);
                // Award credits — call server endpoint
                fetch('http://localhost:3001/api/fitting/award-loot', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ credits: loot }),
                }).then(() => {
                  const fc = useGameStore.getState().fetchCredits;
                  if (fc) fc();
                }).catch(() => {});
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
            
            if (playerHullRef.current <= 0) {
              playerHullRef.current = playerMaxHullRef.current;
              playerShieldRef.current = playerMaxShieldRef.current;
              // Respawn at center (near sun) with a penalty message
              shipPosRef.current = { x: 900, y: 0 };
              shipVelRef.current = { x: 0, y: 0 };
              setCombatLog(prev => [...prev.slice(-4), 'Ship destroyed! Respawned at Luna Station. -50 cr repair cost.']);
              fetch('http://localhost:3001/api/fitting/repair-cost', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cost: 50 }),
              }).then(() => {
                const fc = useGameStore.getState().fetchCredits;
                if (fc) fc();
              }).catch(() => {});
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
        if (effects[i].age > 0.5) effects.splice(i, 1);
      }
      
      // --- Sync combat state to React (every 5 frames for perf) ---
      if (frameNum % 5 === 0) {
        setPlayerHullDisplay(Math.round(playerHullRef.current));
        setPlayerShieldDisplay(Math.round(playerShieldRef.current));
        setEnemyCount(enemies.filter(e => e.hull > 0).length);
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
      keysPressed.current.delete(e.key.toLowerCase());
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
    <DraggableWindow
      windowId="systemView"
      title={`${currentSystem.name} System`}
      initialWidth={1000}
      initialHeight={700}
      minWidth={600}
      minHeight={400}
    >
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/20 bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: starConfig?.colors.mid }}
              />
              <span className="text-sm text-cyan-300">{starConfig?.name}</span>
            </div>
            <div className="text-xs text-slate-400">
              Zoom: {(zoom * 100).toFixed(0)}%
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.5))}
              className="w-6 h-6 rounded bg-slate-700/50 text-cyan-400 hover:bg-cyan-500/20 transition-colors text-sm"
            >
              +
            </button>
            <button
              onClick={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.5))}
              className="w-6 h-6 rounded bg-slate-700/50 text-cyan-400 hover:bg-cyan-500/20 transition-colors text-sm"
            >
              −
            </button>
            <button
              onClick={() => { setCamera({ x: 0, y: 0 }); setZoom(1.0); }}
              className="px-2 h-6 rounded bg-slate-700/50 text-cyan-400 hover:bg-cyan-500/20 transition-colors text-xs"
            >
              Reset
            </button>
          </div>
        </div>

        {/* SVG Viewport */}
        <div className="flex-1 relative overflow-hidden bg-slate-950">
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

            {/* Fleet Ships — Flying V formation */}
            {fleetShips.map((ship) => {
              if (!ship.icon) return null;
              const offset = ship.formationOffset;
              // Convert ship-local offset to world coordinates
              // offset.x = lateral (positive = right of heading)
              // offset.y = longitudinal (positive = behind heading)
              // Ship heading vector: (cos θ, sin θ)
              // Ship right vector (perpendicular): (sin θ, -cos θ) ... but in Y-down screen: (-sin θ, cos θ) is left, so (sin θ, -cos θ) would be... 
              // Simplest: "behind" = opposite of heading = (-cos θ, -sin θ)
              //           "right" = 90° CW in screen Y-down = (sin θ, -cos θ) ... 
              // Actually just use: world = right * offset.x + behind * offset.y
              const theta = shipRotationRef.current * Math.PI / 180;
              const cosT = Math.cos(theta);
              const sinT = Math.sin(theta);
              // "right of heading" in screen coords (perpendicular CW in Y-down)
              const rightX = -sinT; // perpendicular 
              const rightY = cosT;
              // "behind heading" = opposite of forward
              const behindX = -cosT;
              const behindY = -sinT;
              const rx = rightX * offset.x + behindX * offset.y;
              const ry = rightY * offset.x + behindY * offset.y;
              const sx = shipPosRef.current.x + rx;
              const sy = shipPosRef.current.y + ry;
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
                  {/* Ship icon rotated to heading */}
                  <g transform={`rotate(${shipRotationRef.current + 90})`}>
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
            {/* Enemy Ships */}
            {enemiesRef.current.filter(e => e.hull > 0).map(enemy => (
              <g key={enemy.id}>
                {/* Aggro ring when attacking */}
                {(enemy.state === 'attack' || enemy.state === 'chase') && (
                  <circle cx={enemy.x} cy={enemy.y} r={enemy.displaySize + 8}
                    fill="none" stroke="#ff444444" strokeWidth="0.5" strokeDasharray="3,3" />
                )}
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
              </g>
            ))}
            
            {/* Projectiles */}
            {projectilesRef.current.map((p, i) => (
              <circle key={`proj-${i}`} cx={p.x} cy={p.y}
                r={p.fromPlayer ? 1.5 : 1.2}
                fill={p.color}
                opacity={1 - p.age / PROJECTILE_LIFETIME}
              />
            ))}
            
            {/* Combat Effects */}
            {combatEffectsRef.current.map((fx, i) => {
              const t = fx.age / 0.5; // 0→1 over lifetime
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
              return null;
            })}
          </svg>

          {/* Navigation moved to NavigationWindow */}

          {/* Ship info + Autopilot HUD */}
          <div className="absolute top-3 left-3 bg-slate-900/80 border border-cyan-500/30 rounded-lg px-3 py-2">
            <div className="text-xs text-slate-400 mb-1">
              {playerShip?.name || 'No Ship'}
              {playerShip?.hull_name && <span className="text-slate-600 ml-1.5">({playerShip.hull_name})</span>}
              {fleetShips.length > 1 && <span className="text-slate-600 ml-1.5">• Fleet: {fleetShips.length}/{MAX_FLEET_SIZE}</span>}
              {enemyCount > 0 && <span className="text-red-400 ml-1.5">• ☠ {enemyCount} hostiles</span>}
            </div>
            
            {/* Hull & Shield bars */}
            <div className="flex gap-2 mb-1">
              <div className="flex-1">
                <div className="flex items-center justify-between text-[9px] mb-0.5">
                  <span className="text-slate-500">HULL</span>
                  <span className="text-slate-400">{playerHullDisplay}/{playerMaxHullRef.current}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-200"
                    style={{
                      width: `${(playerHullDisplay / playerMaxHullRef.current) * 100}%`,
                      backgroundColor: playerHullDisplay > 60 ? '#44aa44' : playerHullDisplay > 30 ? '#aaaa44' : '#ff4444',
                    }} />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between text-[9px] mb-0.5">
                  <span className="text-slate-500">SHIELD</span>
                  <span className="text-slate-400">{playerShieldDisplay}/{playerMaxShieldRef.current}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-200 bg-blue-500"
                    style={{ width: `${(playerShieldDisplay / playerMaxShieldRef.current) * 100}%` }} />
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 text-xs">
              <span className="text-cyan-400">
                Speed: {Math.round(Math.sqrt(shipVelRef.current.x * shipVelRef.current.x + shipVelRef.current.y * shipVelRef.current.y))}
              </span>
              <span className={`${followMode ? 'text-green-400' : 'text-slate-500'}`}>
                {followMode ? '● Follow' : '○ Free Cam'}
              </span>
            </div>
            {/* Autopilot info */}
            {autopilotTarget && (() => {
              const targetBody = currentSystem.bodies.find(b => b.id === autopilotTarget.id);
              if (!targetBody) return null;
              const targetPos = getBodyPosition(autopilotTarget.id);
              const dx = targetPos.x - shipPosRef.current.x;
              const dy = targetPos.y - shipPosRef.current.y;
              const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
              return (
                <div className="mt-2 pt-2 border-t border-cyan-500/20">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 animate-pulse">◈ AUTOPILOT</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-1">
                    → {autopilotTarget.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    Distance: {distance}
                  </div>
                </div>
              );
            })()}
          </div>

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
        </div>
      </div>
      
    </DraggableWindow>
    
    {/* Planet Interaction Window - rendered as sibling, not child */}
    <PlanetInteractionWindow body={dockedBody} />
    </>
  );
};

export default SystemView;
