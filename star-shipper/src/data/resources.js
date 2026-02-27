// Resource System Definitions (Client)
// Matches server definitions

export const RESOURCE_CATEGORIES = {
  ORE: 'ore',
  GAS: 'gas',
  BIOLOGICAL: 'biological',
  ENERGY: 'energy',
  EXOTIC: 'exotic',
};

export const RESOURCE_RARITY = {
  COMMON: 'common',
  RARE: 'rare',
  EXOTIC: 'exotic',
};

export const QUALITY_TIERS = {
  IMPURE: { name: 'Impure', minAvg: 0, maxAvg: 20, color: '#888888' },
  STANDARD: { name: 'Standard', minAvg: 21, maxAvg: 40, color: '#ffffff' },
  REFINED: { name: 'Refined', minAvg: 41, maxAvg: 60, color: '#44ff44' },
  SUPERIOR: { name: 'Superior', minAvg: 61, maxAvg: 80, color: '#4488ff' },
  PRISTINE: { name: 'Pristine', minAvg: 81, maxAvg: 100, color: '#aa44ff' },
};

// Resource type definitions
export const RESOURCE_TYPES = {
  // Ores
  IRON: {
    id: 1,
    name: 'Iron',
    category: RESOURCE_CATEGORIES.ORE,
    rarity: RESOURCE_RARITY.COMMON,
    basePrice: 10,
    description: 'Common building material found on rocky worlds',
    icon: 'iron',
    color: '#8B4513',
  },
  TITANIUM: {
    id: 2,
    name: 'Titanium',
    category: RESOURCE_CATEGORIES.ORE,
    rarity: RESOURCE_RARITY.COMMON,
    basePrice: 25,
    description: 'Lightweight and strong hull material',
    icon: 'titanium',
    color: '#C0C0C0',
  },
  COPPER: {
    id: 3,
    name: 'Copper',
    category: RESOURCE_CATEGORIES.ORE,
    rarity: RESOURCE_RARITY.COMMON,
    basePrice: 15,
    description: 'Essential for electronics and wiring',
    icon: 'copper',
    color: '#B87333',
  },
  CRYSTITE: {
    id: 4,
    name: 'Crystite',
    category: RESOURCE_CATEGORIES.ORE,
    rarity: RESOURCE_RARITY.RARE,
    basePrice: 75,
    description: 'Crystalline energy conductor',
    icon: 'crystite',
    color: '#00FFFF',
  },
  URANIUM: {
    id: 5,
    name: 'Uranium',
    category: RESOURCE_CATEGORIES.ORE,
    rarity: RESOURCE_RARITY.RARE,
    basePrice: 120,
    description: 'Radioactive fuel source for reactors',
    icon: 'uranium',
    color: '#39FF14',
  },

  // Gases
  HYDROGEN: {
    id: 6,
    name: 'Hydrogen',
    category: RESOURCE_CATEGORIES.GAS,
    rarity: RESOURCE_RARITY.COMMON,
    basePrice: 8,
    description: 'Basic fuel component',
    icon: 'hydrogen',
    color: '#87CEEB',
  },
  HELIUM3: {
    id: 7,
    name: 'Helium-3',
    category: RESOURCE_CATEGORIES.GAS,
    rarity: RESOURCE_RARITY.RARE,
    basePrice: 90,
    description: 'Advanced fusion fuel',
    icon: 'helium3',
    color: '#FFD700',
  },
  PLASMA: {
    id: 8,
    name: 'Plasma',
    category: RESOURCE_CATEGORIES.GAS,
    rarity: RESOURCE_RARITY.RARE,
    basePrice: 150,
    description: 'High-energy ionized gas',
    icon: 'plasma',
    color: '#FF4500',
  },
  NITROGEN: {
    id: 9,
    name: 'Nitrogen',
    category: RESOURCE_CATEGORIES.GAS,
    rarity: RESOURCE_RARITY.COMMON,
    basePrice: 12,
    description: 'Life support and chemical synthesis',
    icon: 'nitrogen',
    color: '#ADD8E6',
  },
  XENON: {
    id: 10,
    name: 'Xenon',
    category: RESOURCE_CATEGORIES.GAS,
    rarity: RESOURCE_RARITY.COMMON,
    basePrice: 35,
    description: 'Ion thruster propellant',
    icon: 'xenon',
    color: '#E6E6FA',
  },

  // Biologicals
  BIOMASS: {
    id: 11,
    name: 'Biomass',
    category: RESOURCE_CATEGORIES.BIOLOGICAL,
    rarity: RESOURCE_RARITY.COMMON,
    basePrice: 18,
    description: 'Organic matter for food and compounds',
    icon: 'biomass',
    color: '#228B22',
  },
  SPORES: {
    id: 12,
    name: 'Spores',
    category: RESOURCE_CATEGORIES.BIOLOGICAL,
    rarity: RESOURCE_RARITY.RARE,
    basePrice: 85,
    description: 'Alien fungal samples for medicine',
    icon: 'spores',
    color: '#9932CC',
  },
  CORAL: {
    id: 13,
    name: 'Coral',
    category: RESOURCE_CATEGORIES.BIOLOGICAL,
    rarity: RESOURCE_RARITY.COMMON,
    basePrice: 30,
    description: 'Structural and decorative material',
    icon: 'coral',
    color: '#FF7F50',
  },
  AMBER_SAP: {
    id: 14,
    name: 'Amber Sap',
    category: RESOURCE_CATEGORIES.BIOLOGICAL,
    rarity: RESOURCE_RARITY.RARE,
    basePrice: 110,
    description: 'Preservative luxury material',
    icon: 'ambersap',
    color: '#FFBF00',
  },

  // Energy
  SOLAR_CRYSTALS: {
    id: 15,
    name: 'Solar Crystals',
    category: RESOURCE_CATEGORIES.ENERGY,
    rarity: RESOURCE_RARITY.RARE,
    basePrice: 95,
    description: 'Natural energy storage crystals',
    icon: 'solarcrystal',
    color: '#FFD700',
  },
  DARK_MATTER: {
    id: 16,
    name: 'Dark Matter',
    category: RESOURCE_CATEGORIES.ENERGY,
    rarity: RESOURCE_RARITY.EXOTIC,
    basePrice: 500,
    description: 'Mysterious energy source',
    icon: 'darkmatter',
    color: '#4B0082',
  },

  // Exotic
  VOID_ESSENCE: {
    id: 17,
    name: 'Void Essence',
    category: RESOURCE_CATEGORIES.EXOTIC,
    rarity: RESOURCE_RARITY.EXOTIC,
    basePrice: 750,
    description: 'Reality-bending substance from black holes',
    icon: 'voidessence',
    color: '#1a0033',
  },
  ANCIENT_ALLOY: {
    id: 18,
    name: 'Ancient Alloy',
    category: RESOURCE_CATEGORIES.EXOTIC,
    rarity: RESOURCE_RARITY.EXOTIC,
    basePrice: 400,
    description: 'Precursor technology material',
    icon: 'ancientalloy',
    color: '#DAA520',
  },
  QUANTUM_DUST: {
    id: 19,
    name: 'Quantum Dust',
    category: RESOURCE_CATEGORIES.EXOTIC,
    rarity: RESOURCE_RARITY.EXOTIC,
    basePrice: 600,
    description: 'Unstable quantum particles',
    icon: 'quantumdust',
    color: '#FF00FF',
  },
};

// Helper to get resource by ID
export const getResourceById = (id) => {
  return Object.values(RESOURCE_TYPES).find(r => r.id === id);
};

// Helper to get resource by name
export const getResourceByName = (name) => {
  return Object.values(RESOURCE_TYPES).find(r => r.name.toLowerCase() === name.toLowerCase());
};

// Calculate quality tier from stats
export const getQualityTier = (purity, stability, potency, density) => {
  const avg = (purity + stability + potency + density) / 4;
  
  if (avg <= 20) return QUALITY_TIERS.IMPURE;
  if (avg <= 40) return QUALITY_TIERS.STANDARD;
  if (avg <= 60) return QUALITY_TIERS.REFINED;
  if (avg <= 80) return QUALITY_TIERS.SUPERIOR;
  return QUALITY_TIERS.PRISTINE;
};

// Calculate quality multiplier for pricing
export const getQualityMultiplier = (purity, stability, potency, density) => {
  const avg = (purity + stability + potency + density) / 4;
  return 0.5 + (avg / 100);
};

// Calculate sell price
export const calculatePrice = (resourceId, quantity, purity, stability, potency, density) => {
  const resource = getResourceById(resourceId);
  if (!resource) return 0;
  
  const qualityMultiplier = getQualityMultiplier(purity, stability, potency, density);
  return Math.floor(resource.basePrice * qualityMultiplier * quantity);
};

// Get display name with quality prefix
export const getDisplayName = (resourceId, purity, stability, potency, density) => {
  const resource = getResourceById(resourceId);
  if (!resource) return 'Unknown';
  
  const tier = getQualityTier(purity, stability, potency, density);
  return `${tier.name} ${resource.name}`;
};

// Get all resources as array
export const getAllResources = () => Object.values(RESOURCE_TYPES);

// Get resources by category
export const getResourcesByCategory = (category) => {
  return Object.values(RESOURCE_TYPES).filter(r => r.category === category);
};

// Get resources by rarity
export const getResourcesByRarity = (rarity) => {
  return Object.values(RESOURCE_TYPES).filter(r => r.rarity === rarity);
};

// Category display info
export const CATEGORY_INFO = {
  [RESOURCE_CATEGORIES.ORE]: {
    name: 'Ores',
    description: 'Solid minerals from rocky planets and asteroids',
    icon: '⛏️',
    color: '#8B4513',
  },
  [RESOURCE_CATEGORIES.GAS]: {
    name: 'Gases',
    description: 'Atmospheric and nebula resources',
    icon: '💨',
    color: '#87CEEB',
  },
  [RESOURCE_CATEGORIES.BIOLOGICAL]: {
    name: 'Biologicals',
    description: 'Organic materials from life-bearing worlds',
    icon: '🌿',
    color: '#228B22',
  },
  [RESOURCE_CATEGORIES.ENERGY]: {
    name: 'Energy',
    description: 'Power sources and fuel materials',
    icon: '⚡',
    color: '#FFD700',
  },
  [RESOURCE_CATEGORIES.EXOTIC]: {
    name: 'Exotic',
    description: 'Rare materials with unusual properties',
    icon: '✨',
    color: '#9932CC',
  },
};

// Rarity display info
export const RARITY_INFO = {
  [RESOURCE_RARITY.COMMON]: {
    name: 'Common',
    color: '#ffffff',
    priceMultiplier: 1,
  },
  [RESOURCE_RARITY.RARE]: {
    name: 'Rare',
    color: '#4488ff',
    priceMultiplier: 5,
  },
  [RESOURCE_RARITY.EXOTIC]: {
    name: 'Exotic',
    color: '#aa44ff',
    priceMultiplier: 25,
  },
};
