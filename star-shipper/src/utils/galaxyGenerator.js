// Galaxy Generator
// Deterministic seed-based galaxy generation.
// Same seed always produces the same galaxy.
// Each system has its own seed for generating internal content (planets, stations, etc.)

// ============================================
// SEEDED RNG (same as SystemView)
// ============================================
class SRng {
  constructor(seed) { this.s = Math.abs(seed % 2147483647) || 1; }
  next() { this.s = (this.s * 16807) % 2147483647; return (this.s - 1) / 2147483646; }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

// ============================================
// FACTIONS
// ============================================
export const FACTIONS = {
  terran_accord: {
    id: 'terran_accord',
    name: 'Terran Accord',
    shortName: 'Accord',
    color: '#4488ff',
    bgColor: '#4488ff18',
    borderColor: '#4488ff44',
    description: 'Humanity\'s core government. Military order and colonial expansion.',
    hostile: false,
    traitBias: 'military', // more stations with weapons/hull vendors
  },
  free_merchants: {
    id: 'free_merchants',
    name: 'Free Merchants Guild',
    shortName: 'Merchants',
    color: '#ffaa22',
    bgColor: '#ffaa2218',
    borderColor: '#ffaa2244',
    description: 'Trade-focused guild that operates the jump gate network.',
    hostile: false,
    traitBias: 'trade', // better prices, more variety
  },
  astral_collective: {
    id: 'astral_collective',
    name: 'Astral Collective',
    shortName: 'Collective',
    color: '#aa44ff',
    bgColor: '#aa44ff18',
    borderColor: '#aa44ff44',
    description: 'Researchers and mystics. Control exotic resource regions.',
    hostile: false,
    traitBias: 'research', // rare resources, tech modules
  },
  void_reavers: {
    id: 'void_reavers',
    name: 'Void Reavers',
    shortName: 'Reavers',
    color: '#ff4444',
    bgColor: '#ff444418',
    borderColor: '#ff444444',
    description: 'Pirates and raiders. No law, only profit through violence.',
    hostile: true,
    traitBias: 'pirate', // dangerous, good loot
  },
};

export const FACTION_IDS = Object.keys(FACTIONS);

// ============================================
// STAR TYPES (matches SystemView star rendering)
// ============================================
const STAR_TYPE_WEIGHTS = [
  { id: 'red_dwarf',    weight: 0.35 },
  { id: 'yellow_star',  weight: 0.25 },
  { id: 'orange_star',  weight: 0.15 },
  { id: 'blue_giant',   weight: 0.10 },
  { id: 'white_dwarf',  weight: 0.08 },
  { id: 'neutron_star', weight: 0.05 },
  { id: 'black_hole',   weight: 0.02 },
];

const STAR_DISPLAY = {
  red_dwarf:    { name: 'Red Dwarf',    color: '#ff6644', size: 3 },
  orange_star:  { name: 'Orange Star',  color: '#ffaa44', size: 3.5 },
  yellow_star:  { name: 'Yellow Star',  color: '#ffdd44', size: 4 },
  blue_giant:   { name: 'Blue Giant',   color: '#4488ff', size: 5.5 },
  white_dwarf:  { name: 'White Dwarf',  color: '#aabbcc', size: 2.5 },
  neutron_star: { name: 'Neutron Star', color: '#dd88ff', size: 2 },
  black_hole:   { name: 'Black Hole',   color: '#664466', size: 4 },
};

// ============================================
// SYSTEM NAME GENERATOR
// ============================================
const NAME_PREFIXES = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
  'Nova', 'Vega', 'Rigel', 'Altair', 'Sirius', 'Deneb', 'Antares', 'Polaris',
  'Kepler', 'Tycho', 'Hubble', 'Sagan', 'Drake', 'Fermi', 'Hawking', 'Curie',
  'Proxima', 'Tau', 'Omicron', 'Sigma', 'Kappa', 'Lambda', 'Rho', 'Psi',
  'Cygnus', 'Lyra', 'Orion', 'Draco', 'Aquila', 'Hydra', 'Corvus', 'Pyxis',
  'Arcturus', 'Betelgeuse', 'Canopus', 'Capella', 'Aldebaran', 'Regulus',
];

const NAME_SUFFIXES = [
  '', '', '', '', // most have no suffix
  ' Prime', ' Major', ' Minor', ' Reach', ' Gate', ' Crossing',
  ' Station', ' Point', ' Haven', ' Drift', ' Deep', ' Hold',
  '-I', '-II', '-III', '-IV', '-V', '-VII', '-IX', '-XII',
];

const generateSystemName = (rng, index) => {
  // Some systems get catalog-style names
  if (rng.chance(0.3)) {
    const letters = 'ABCDEFGHJKLMNPQRSTVWXYZ';
    const l1 = letters[rng.int(0, letters.length - 1)];
    const l2 = letters[rng.int(0, letters.length - 1)];
    const num = rng.int(100, 9999);
    return `${l1}${l2}-${num}`;
  }
  return rng.pick(NAME_PREFIXES) + rng.pick(NAME_SUFFIXES);
};

// ============================================
// RESOURCE PROFILES by star type
// What resources are more/less common in each star type
// ============================================
export const RESOURCE_PROFILES = {
  red_dwarf:    { ore: 1.2, gas: 0.8, biological: 1.5, energy: 0.6, exotic: 0.3 },
  orange_star:  { ore: 1.0, gas: 1.0, biological: 1.2, energy: 0.8, exotic: 0.4 },
  yellow_star:  { ore: 1.0, gas: 1.0, biological: 1.0, energy: 1.0, exotic: 0.5 },
  blue_giant:   { ore: 0.8, gas: 1.5, biological: 0.3, energy: 1.8, exotic: 0.8 },
  white_dwarf:  { ore: 1.3, gas: 0.5, biological: 0.2, energy: 1.2, exotic: 1.0 },
  neutron_star: { ore: 0.4, gas: 0.3, biological: 0.1, energy: 2.0, exotic: 2.0 },
  black_hole:   { ore: 0.2, gas: 0.2, biological: 0.0, energy: 1.5, exotic: 3.0 },
};

// ============================================
// GALAXY GENERATOR
// ============================================

const GALAXY_RADIUS = 5000; // World units for the galaxy map
const MIN_SYSTEM_DISTANCE = 200; // Minimum distance between systems
const JUMP_GATE_MAX_DISTANCE = 800; // Max distance for jump gate connections
const JUMP_GATE_COVERAGE = 0.60; // ~60% of systems get jump gates

export const generateGalaxy = (galaxySeed = 12345, systemCount = 200) => {
  const rng = new SRng(galaxySeed);
  
  // ---- Step 1: Place systems with Poisson-like distribution ----
  const systems = [];
  const usedNames = new Set(['Sol']); // Reserve Sol
  
  // Sol is always at center
  systems.push({
    id: 'sol',
    name: 'Sol',
    x: 0,
    y: 0,
    starType: 'yellow_star',
    faction: 'terran_accord',
    dangerLevel: 0, // 0-5
    hasJumpGate: true,
    jumpConnections: [],
    seed: 1, // Sol uses hardcoded data, seed just for consistency
    discovered: true, // Always discovered
    resourceProfile: RESOURCE_PROFILES.yellow_star,
  });
  
  let attempts = 0;
  while (systems.length < systemCount && attempts < systemCount * 20) {
    attempts++;
    
    // Generate position — slight clustering toward center
    const angle = rng.range(0, Math.PI * 2);
    const dist = Math.pow(rng.next(), 0.6) * GALAXY_RADIUS; // Power curve clusters toward center
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    
    // Check minimum distance from all existing systems
    let tooClose = false;
    for (const s of systems) {
      const d = Math.sqrt((x - s.x) ** 2 + (y - s.y) ** 2);
      if (d < MIN_SYSTEM_DISTANCE) { tooClose = true; break; }
    }
    if (tooClose) continue;
    
    // Pick star type by weight
    const roll = rng.next();
    let cumWeight = 0;
    let starType = 'red_dwarf';
    for (const st of STAR_TYPE_WEIGHTS) {
      cumWeight += st.weight;
      if (roll < cumWeight) { starType = st.id; break; }
    }
    
    // Generate unique name
    let name;
    let nameAttempts = 0;
    do {
      name = generateSystemName(rng, systems.length);
      nameAttempts++;
    } while (usedNames.has(name) && nameAttempts < 20);
    if (usedNames.has(name)) name = `SYS-${systems.length}`;
    usedNames.add(name);
    
    // Assign faction — based on region + some randomness
    const distFromCenter = Math.sqrt(x * x + y * y);
    const regionAngle = Math.atan2(y, x);
    let faction;
    if (distFromCenter < GALAXY_RADIUS * 0.25) {
      // Core — mostly Terran Accord
      faction = rng.chance(0.7) ? 'terran_accord' : rng.pick(['free_merchants', 'astral_collective']);
    } else if (distFromCenter < GALAXY_RADIUS * 0.55) {
      // Mid ring — mixed
      if (regionAngle > 0 && regionAngle < Math.PI * 0.7) {
        faction = rng.chance(0.6) ? 'free_merchants' : rng.pick(FACTION_IDS);
      } else if (regionAngle < -Math.PI * 0.3) {
        faction = rng.chance(0.5) ? 'astral_collective' : rng.pick(FACTION_IDS);
      } else {
        faction = rng.pick(FACTION_IDS);
      }
    } else {
      // Outer ring — more Reavers and unclaimed
      faction = rng.chance(0.35) ? 'void_reavers' : rng.pick(FACTION_IDS);
    }
    
    // Danger level — higher near Reavers, further from center
    let dangerLevel = 0;
    if (faction === 'void_reavers') dangerLevel += 2;
    dangerLevel += Math.floor(distFromCenter / GALAXY_RADIUS * 3);
    dangerLevel = Math.min(5, Math.max(0, dangerLevel + rng.int(-1, 1)));
    
    systems.push({
      id: `sys_${systems.length}`,
      name,
      x, y,
      starType,
      faction,
      dangerLevel,
      hasJumpGate: false, // Set in step 2
      jumpConnections: [],
      seed: rng.int(1000, 999999),
      discovered: false,
      resourceProfile: RESOURCE_PROFILES[starType] || RESOURCE_PROFILES.yellow_star,
    });
  }
  
  // ---- Step 2: Build jump gate network ----
  // Connect nearby systems, targeting ~60% coverage
  const targetGateSystems = Math.floor(systems.length * JUMP_GATE_COVERAGE);
  
  // Find all potential connections (edges) sorted by distance
  const edges = [];
  for (let i = 0; i < systems.length; i++) {
    for (let j = i + 1; j < systems.length; j++) {
      const d = Math.sqrt((systems[i].x - systems[j].x) ** 2 + (systems[i].y - systems[j].y) ** 2);
      if (d < JUMP_GATE_MAX_DISTANCE) {
        edges.push({ i, j, dist: d });
      }
    }
  }
  edges.sort((a, b) => a.dist - b.dist);
  
  // Build a spanning tree first (ensures connectivity for gated systems)
  // Then add extra connections for redundancy
  const gateSystemIndices = new Set([0]); // Sol always has a gate
  const connected = new Set([0]);
  const connectionSet = new Set();
  
  // Kruskal-ish: add shortest edges that connect new systems
  for (const edge of edges) {
    if (gateSystemIndices.size >= targetGateSystems) break;
    
    const aIn = connected.has(edge.i);
    const bIn = connected.has(edge.j);
    
    if (aIn && bIn) {
      // Both connected — add redundant link with some probability
      if (rng.chance(0.15)) {
        const key = `${edge.i}-${edge.j}`;
        if (!connectionSet.has(key)) {
          connectionSet.add(key);
          systems[edge.i].jumpConnections.push(systems[edge.j].id);
          systems[edge.j].jumpConnections.push(systems[edge.i].id);
        }
      }
      continue;
    }
    
    if (!aIn && !bIn) {
      // Neither connected — skip unless we're still building
      if (gateSystemIndices.size < targetGateSystems * 0.5) {
        connected.add(edge.i);
        connected.add(edge.j);
        gateSystemIndices.add(edge.i);
        gateSystemIndices.add(edge.j);
        const key = `${edge.i}-${edge.j}`;
        connectionSet.add(key);
        systems[edge.i].jumpConnections.push(systems[edge.j].id);
        systems[edge.j].jumpConnections.push(systems[edge.i].id);
      }
      continue;
    }
    
    // One connected, one not — extend the network
    const newIdx = aIn ? edge.j : edge.i;
    connected.add(newIdx);
    gateSystemIndices.add(newIdx);
    const key = `${edge.i}-${edge.j}`;
    connectionSet.add(key);
    systems[edge.i].jumpConnections.push(systems[edge.j].id);
    systems[edge.j].jumpConnections.push(systems[edge.i].id);
  }
  
  // Mark systems with gates
  for (const idx of gateSystemIndices) {
    systems[idx].hasJumpGate = true;
  }
  
  // ---- Step 3: Build lookup ----
  const systemMap = {};
  for (const sys of systems) {
    systemMap[sys.id] = sys;
  }
  
  return {
    seed: galaxySeed,
    systems,
    systemMap,
    stats: {
      totalSystems: systems.length,
      gatedSystems: gateSystemIndices.size,
      gatePercent: Math.round((gateSystemIndices.size / systems.length) * 100),
      connections: connectionSet.size,
    },
  };
};

// ============================================
// SYSTEM CONTENT GENERATOR
// Generates planets, stations, asteroid belts for a system from its seed
// ============================================

const PLANET_POOLS = {
  red_dwarf:    ['rocky', 'barren', 'ice'],
  orange_star:  ['rocky', 'desert', 'ice', 'terran'],
  yellow_star:  ['rocky', 'terran', 'desert', 'ice', 'gas_giant', 'ocean'],
  blue_giant:   ['lava', 'gas_giant', 'ice', 'rocky'],
  white_dwarf:  ['barren', 'ice', 'rocky'],
  neutron_star: ['exotic', 'barren'],
  black_hole:   ['exotic', 'barren'],
};

const PLANET_COUNTS = {
  red_dwarf:    [2, 5],
  orange_star:  [3, 6],
  yellow_star:  [4, 8],
  blue_giant:   [3, 7],
  white_dwarf:  [0, 3],
  neutron_star: [0, 2],
  black_hole:   [0, 1],
};

export const generateSystemContent = (system) => {
  if (system.id === 'sol') return null; // Sol uses hardcoded data
  
  const rng = new SRng(system.seed);
  const bodies = [];
  
  const starColors = STAR_DISPLAY[system.starType] || STAR_DISPLAY.yellow_star;
  const planetPool = PLANET_POOLS[system.starType] || PLANET_POOLS.yellow_star;
  const [minPlanets, maxPlanets] = PLANET_COUNTS[system.starType] || [2, 6];
  const planetCount = rng.int(minPlanets, maxPlanets);
  
  let orbitRadius = 300 + rng.range(0, 200);
  
  for (let i = 0; i < planetCount; i++) {
    const planetType = rng.pick(planetPool);
    const size = rng.int(10, planetType === 'gas_giant' ? 100 : 40);
    const id = `planet_${i}`;
    
    bodies.push({
      id,
      name: `${system.name} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i] || (i + 1)}`,
      type: 'planet',
      planetType,
      orbitRadius,
      orbitSpeed: 0.002 + (0.02 / Math.sqrt(orbitRadius / 300)),
      orbitOffset: rng.range(0, Math.PI * 2),
      size,
      color: null, // Will use planetType defaults
      hasAtmosphere: planetType === 'terran' || planetType === 'ocean',
      hasRings: planetType === 'gas_giant' && rng.chance(0.4),
    });
    
    // Station orbiting planet? Higher chance for habitable/large planets
    const stationChance = planetType === 'terran' ? 0.5 : planetType === 'gas_giant' ? 0.3 : 0.1;
    if (rng.chance(stationChance)) {
      bodies.push({
        id: `station_${id}`,
        name: `${system.name} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][i]} Station`,
        type: 'station',
        parentBody: id,
        orbitRadius: size + 20 + rng.range(0, 30),
        orbitSpeed: 0.03 + rng.range(0, 0.02),
        orbitOffset: rng.range(0, Math.PI * 2),
        size: 6 + rng.int(0, 4),
      });
    }
    
    orbitRadius += 200 + rng.range(50, 300);
  }
  
  // Asteroid belt(s)
  const beltCount = rng.int(0, system.starType === 'blue_giant' ? 2 : 1);
  for (let i = 0; i < beltCount; i++) {
    const beltRadius = 400 + rng.range(200, orbitRadius * 0.6);
    bodies.push({
      id: `belt_${i}`,
      name: `Asteroid Belt ${i + 1}`,
      type: 'asteroid_belt',
      orbitRadius: beltRadius,
      width: 100 + rng.range(50, 200),
      density: 100 + rng.int(50, 300),
    });
  }
  
  // Jump gate (if system has one)
  if (system.hasJumpGate) {
    bodies.push({
      id: 'jump_gate',
      name: 'Jump Gate',
      type: 'jump_gate',
      orbitRadius: orbitRadius + 200,
      orbitSpeed: 0.001,
      orbitOffset: rng.range(0, Math.PI * 2),
      size: 12,
    });
  }
  
  // Warp point — every system has one (generic system exit)
  bodies.push({
    id: 'warp_point',
    name: 'Warp Point',
    type: 'warp_point',
    orbitRadius: orbitRadius + (system.hasJumpGate ? 400 : 200),
    orbitSpeed: 0.0008,
    orbitOffset: rng.range(0, Math.PI * 2),
    size: 10,
  });
  
  return {
    id: system.id,
    name: system.name,
    starType: system.starType,
    bodies,
    faction: system.faction,
    dangerLevel: system.dangerLevel,
  };
};

// ============================================
// STAR DISPLAY DATA (for rendering)
// ============================================
export { STAR_DISPLAY };
