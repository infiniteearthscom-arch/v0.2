// ============================================
// API CLIENT
// Handles all HTTP communication with the backend
// ============================================

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001') + '/api';
const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Get stored auth token
const getToken = () => localStorage.getItem('star-shipper-token');

// Store auth token
export const setToken = (token) => localStorage.setItem('star-shipper-token', token);

// Make an authenticated API request
const request = async (endpoint, options = {}) => {
  const token = getToken();
  
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  };

  const response = await fetch(`${API_URL}${endpoint}`, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
};

// ============================================
// AUTH API
// ============================================

export const authAPI = {
  register: async (username, email, password) => {
    const data = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
    setToken(data.token);
    return data;
  },

  login: async (email, password) => {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    return data;
  },

  getMe: async () => {
    return request('/auth/me');
  },

  logout: () => {
    localStorage.removeItem('star-shipper-token');
  },

  isLoggedIn: () => {
    return !!getToken();
  },

  // Google OAuth — redirect to server which redirects to Google
  getGoogleAuthUrl: () => {
    return `${SERVER_URL}/api/auth/google`;
  },
};

// ============================================
// OAuth URL token handler
// Call this on app load to check if we're returning from OAuth
// ============================================

export const handleOAuthCallback = () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const authError = params.get('auth_error');
  const provider = params.get('provider');
  const isNew = params.get('isNew') === 'true';

  // Clean up URL
  if (token || authError) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (authError) {
    return { error: `Login failed: ${authError}` };
  }

  if (token) {
    setToken(token);
    return { success: true, provider, isNew };
  }

  return null;
};

// ============================================
// SHIPS API
// ============================================

export const shipsAPI = {
  // Designs
  getDesigns: () => request('/ships/designs'),
  
  getDesign: (id) => request(`/ships/designs/${id}`),
  
  saveDesign: (design) => request('/ships/designs', {
    method: 'POST',
    body: JSON.stringify(design),
  }),
  
  deleteDesign: (id) => request(`/ships/designs/${id}`, {
    method: 'DELETE',
  }),

  // Ships
  getShips: () => request('/ships'),
  
  getShip: (id) => request(`/ships/${id}`),
  
  buildShip: (designId, name) => request('/ships/build', {
    method: 'POST',
    body: JSON.stringify({ designId, name }),
  }),
  
  renameShip: (id, name) => request(`/ships/${id}/name`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  }),
  
  scrapShip: (id) => request(`/ships/${id}`, {
    method: 'DELETE',
  }),
};

// ============================================
// RESOURCES API
// ============================================

export const resourcesAPI = {
  // Resource types
  getTypes: () => request('/resources/types'),

  // Deposits
  getDeposits: (bodyId) => request(`/resources/deposits/${bodyId}`),
  getDeposit: (depositId) => request(`/resources/deposit/${depositId}`),

  // Inventory & cargo
  getInventory: () => request('/resources/inventory'),
  getCargo: () => request('/resources/cargo'),

  // Probes
  getProbes: () => request('/resources/probes'),

  // Surveying
  getSurveyStatus: (bodyId) => request(`/resources/survey/${bodyId}`),
  orbitalScan: (bodyId) => request(`/resources/survey/orbital/${bodyId}`, { method: 'POST' }),
  groundScan: (bodyId) => request(`/resources/survey/ground/${bodyId}`, { method: 'POST' }),

  // Harvesting (manual mining)
  getActiveHarvest: () => request('/resources/harvest/active'),
  startHarvest: (depositId) => request('/resources/harvest/start', {
    method: 'POST',
    body: JSON.stringify({ deposit_id: depositId }),
  }),
  collectHarvest: () => request('/resources/harvest/collect', { method: 'POST' }),
  stopHarvest: () => request('/resources/harvest/stop', { method: 'POST' }),

  // Register procedural body in DB (for scanning/mining in procedural systems)
  ensureBody: (bodyData) => request('/resources/ensure-body', {
    method: 'POST',
    body: JSON.stringify(bodyData),
  }),

  // Cargo management
  moveItem: (itemId, toSlot) => request('/resources/inventory/move', {
    method: 'POST',
    body: JSON.stringify({ item_id: itemId, to_slot: toSlot }),
  }),
  mergeStacks: (sourceId, targetId) => request('/resources/inventory/merge', {
    method: 'POST',
    body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
  }),

  // Crafting
  getRecipes: () => request('/resources/recipes'),
  craft: (recipeId, ingredients) => request('/resources/craft', {
    method: 'POST',
    body: JSON.stringify({ recipe_id: recipeId, ingredients }),
  }),
  cheatCraft: (recipeId) => request('/resources/craft/cheat', {
    method: 'POST',
    body: JSON.stringify({ recipe_id: recipeId }),
  }),

  // Trash
  trashItem: (itemId, quantity) => request('/resources/inventory/trash', {
    method: 'POST',
    body: JSON.stringify({ item_id: itemId, quantity }),
  }),
};

// Harvester API
export const harvesterAPI = {
  getPlanetHarvesters: (bodyId) => request(`/harvesters/planet/${bodyId}`),
  deploy: (bodyId, slotIndex, cargoItemId, depositId) => request('/harvesters/deploy', {
    method: 'POST',
    body: JSON.stringify({ body_id: bodyId, slot_index: slotIndex, cargo_item_id: cargoItemId, deposit_id: depositId }),
  }),
  assignDeposit: (harvesterId, depositId) => request('/harvesters/assign-deposit', {
    method: 'POST',
    body: JSON.stringify({ harvester_id: harvesterId, deposit_id: depositId }),
  }),
  refuel: (harvesterId, fuelItemId) => request('/harvesters/refuel', {
    method: 'POST',
    body: JSON.stringify({ harvester_id: harvesterId, fuel_item_id: fuelItemId }),
  }),
  collect: (harvesterId) => request('/harvesters/collect', {
    method: 'POST',
    body: JSON.stringify({ harvester_id: harvesterId }),
  }),
  remove: (harvesterId) => request('/harvesters/remove', {
    method: 'POST',
    body: JSON.stringify({ harvester_id: harvesterId }),
  }),
};

// Ship Fitting API
export const fittingAPI = {
  getHulls: () => request('/fitting/hulls'),
  getModuleTypes: () => request('/fitting/modules'),
  getMyShips: () => request('/fitting/my-ships'),
  getShipDetail: (shipId) => request(`/fitting/ship/${shipId}`),
  buyHull: (hullTypeId, shipName) => request('/fitting/buy-hull', {
    method: 'POST',
    body: JSON.stringify({ hull_type_id: hullTypeId, ship_name: shipName }),
  }),
  fitModule: (shipId, slotId, cargoItemId) => request('/fitting/fit-module', {
    method: 'POST',
    body: JSON.stringify({ ship_id: shipId, slot_id: slotId, cargo_item_id: cargoItemId }),
  }),
  unfitModule: (shipId, slotId) => request('/fitting/unfit-module', {
    method: 'POST',
    body: JSON.stringify({ ship_id: shipId, slot_id: slotId }),
  }),
  buyModule: (moduleTypeId) => request('/fitting/buy-module', {
    method: 'POST',
    body: JSON.stringify({ module_type_id: moduleTypeId }),
  }),
  getFleet: () => request('/fitting/fleet'),
  getCredits: () => request('/fitting/credits'),
  setActiveShip: (shipId) => request('/fitting/set-active-ship', {
    method: 'POST',
    body: JSON.stringify({ ship_id: shipId }),
  }),
  renameShip: (shipId, name) => request('/fitting/rename-ship', {
    method: 'POST',
    body: JSON.stringify({ ship_id: shipId, name }),
  }),
  sellResource: (inventoryId, quantity) => request('/fitting/sell-resource', {
    method: 'POST',
    body: JSON.stringify({ inventory_id: inventoryId, quantity }),
  }),
  sellItem: (inventoryId, quantity) => request('/fitting/sell-item', {
    method: 'POST',
    body: JSON.stringify({ inventory_id: inventoryId, quantity: quantity || 1 }),
  }),
};

// ============================================
// HEALTH CHECK
// ============================================

export const checkServerHealth = async () => {
  try {
    const response = await fetch(`${SERVER_URL}/api/health`);
    const data = await response.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
};
