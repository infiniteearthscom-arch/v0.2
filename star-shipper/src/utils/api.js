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

  // Register procedural body in DB (for scanning/mining in procedural systems).
  // bodyData should include system_seed + system_planet_count for Phase A
  // city seeding -- without them the body is treated as not-a-city.
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

// Asteroids — mineable spatial entities in belt bodies. List + scan
// (A2). Mine endpoint comes in A3.
export const asteroidsAPI = {
  list: (systemProceduralId) =>
    request(`/resources/asteroids?system_procedural_id=${encodeURIComponent(systemProceduralId)}`),
  scan: (asteroidId) => request('/resources/asteroids/scan', {
    method: 'POST',
    body: JSON.stringify({ asteroid_id: asteroidId }),
  }),
  // Phase A4: per-laser, per-tick. shipId + slotKey identify the
  // specific fitted laser firing this cycle (yield comes from just
  // that one laser, not the fleet sum). Each fitted mining laser
  // is independently click-assigned to its own asteroid client-side.
  mine: (asteroidId, shipId, slotKey) => request('/resources/asteroids/mine', {
    method: 'POST',
    body: JSON.stringify({ asteroid_id: asteroidId, ship_id: shipId, slot_key: slotKey }),
  }),
  // Tier B area scan: scans every unscanned asteroid in `radius` of the
  // player's current position. Requires a fitted scanner module with
  // `area_scan: true` (Wide-Field Sensor Array or Elite Survey Grid).
  scanArea: (systemProceduralId, playerX, playerY, radius) =>
    request('/resources/asteroids/scan_area', {
      method: 'POST',
      body: JSON.stringify({
        system_procedural_id: systemProceduralId,
        player_x: playerX, player_y: playerY, radius,
      }),
    }),
  // Tier B bulk-belt scan: scans every unscanned asteroid in a specific
  // belt. Requires Elite Survey Grid (`bulk_scan: true`).
  scanBelt: (beltBodyId) =>
    request('/resources/asteroids/scan_belt', {
      method: 'POST',
      body: JSON.stringify({ belt_body_id: beltBodyId }),
    }),
};

// Galaxy -- player-scoped state about the wider map. Today: visited
// systems (drives fog of war in GalaxyMapWindow + GalaxyFlightView).
export const galaxyAPI = {
  visits: () => request('/galaxy/visits'),
  // systemName is optional -- passed when the caller knows it so the
  // server can include it in the activity_events payload (used by the
  // ticker for "<pilot> discovered <name>"). When omitted, the server
  // falls back to the procedural id; the ticker can also resolve names
  // client-side via galaxyGenerator. Both paths work.
  recordVisit: (systemProceduralId, systemName) =>
    request('/galaxy/visit', {
      method: 'POST',
      body: JSON.stringify({
        system_procedural_id: systemProceduralId,
        ...(systemName ? { system_name: systemName } : {}),
      }),
    }),
};

// Leaderboards (Social Multiplayer Step 4). All boards computed live
// server-side from existing tables -- no client caching needed beyond
// React state in the LeaderboardsWindow.
export const leaderboardsAPI = {
  // Catalog: list of available board types + their display metadata.
  // Returned even when the user has no data so the window can render
  // the tab strip before fetching the first board.
  list: () => request('/leaderboards'),
  // Top N for a specific board + the requesting user's own rank/value.
  get: (type, limit = 25) =>
    request(`/leaderboards/${encodeURIComponent(type)}?limit=${limit}`),
};

// Mail (Social Multiplayer Step 9). Async player-to-player messages
// plus an internal "system mail" path (no callers in v1; reserved
// for future market-fill / bounty-payout notifications).
export const mailAPI = {
  inbox:       (limit = 50) => request(`/mail/inbox?limit=${limit}`),
  unreadCount: () => request('/mail/unread-count'),
  send:        (payload) =>
    request('/mail/send', { method: 'POST', body: JSON.stringify(payload) }),
  markRead:    (id) => request(`/mail/${encodeURIComponent(id)}/mark-read`, { method: 'POST' }),
  delete:      (id) => request(`/mail/${encodeURIComponent(id)}/delete`, { method: 'POST' }),
};

// Bounty board (Social Multiplayer Step 8). Single-kill bounty
// contracts: post locks escrow, claim pays out + closes the bounty.
// v1 trusts the claimer's kill report -- same cheat surface as the
// rest of the client-authoritative combat loop.
export const bountyAPI = {
  list:   (systemId) => request(`/bounty${systemId ? `?system_id=${encodeURIComponent(systemId)}` : ''}`),
  mine:   () => request('/bounty/mine'),
  post:   (payload) =>
    request('/bounty/post', { method: 'POST', body: JSON.stringify(payload) }),
  cancel: (id) =>
    request(`/bounty/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  claim:  (id, payload) =>
    request(`/bounty/${encodeURIComponent(id)}/claim`, {
      method: 'POST', body: JSON.stringify(payload),
    }),
};

// Corporations (Social Multiplayer Step 7). Persistent player groups.
// One corp per user (server-enforced via PK on corporation_members).
// The full membership object includes corp_id + ticker + role -- the
// CorpWindow / ProfileWindow / chat panel all read from the same shape.
export const corpAPI = {
  mine:    () => request('/corp/mine'),
  invites: () => request('/corp/invites'),
  get:     (corpId) => request(`/corp/${encodeURIComponent(corpId)}`),
  members: (corpId) => request(`/corp/${encodeURIComponent(corpId)}/members`),
  create:  (payload) =>
    request('/corp/create', { method: 'POST', body: JSON.stringify(payload) }),
  invite:  (inviteeId) =>
    request('/corp/invite', { method: 'POST', body: JSON.stringify({ invitee_id: inviteeId }) }),
  acceptInvite: (id) =>
    request(`/corp/invite/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
  rejectInvite: (id) =>
    request(`/corp/invite/${encodeURIComponent(id)}/reject`, { method: 'POST' }),
  leave: () => request('/corp/leave', { method: 'POST' }),
  kick:  (userId) =>
    request(`/corp/member/${encodeURIComponent(userId)}/kick`, { method: 'POST' }),
};

// Public profile lookup (Social Multiplayer Step 4 -- profile half).
// Same endpoint for self + others -- nothing in the response is
// strategic-secret. Opened from ChatPanel name clicks + LeaderboardsWindow
// row clicks via the profileTargetUserId store state.
export const profileAPI = {
  get: (userId) => request(`/profile/${encodeURIComponent(userId)}`),
};

// Player market (Social Multiplayer Step 6). Per-station async order
// book; manual fulfill in v1 (no auto-cross). All ops are REST; no
// socket events yet -- the panel refetches after each mutation. If
// the order book starts feeling stale we'll add a 'market:updated'
// broadcast for the affected station.
export const marketAPI = {
  postOrder: (payload) =>
    request('/market/order', { method: 'POST', body: JSON.stringify(payload) }),
  cancelOrder: (orderId) =>
    request(`/market/order/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' }),
  fulfillOrder: (orderId, quantity, sourceStackId) =>
    request(`/market/order/${encodeURIComponent(orderId)}/fulfill`, {
      method: 'POST',
      body: JSON.stringify({
        quantity,
        ...(sourceStackId ? { source_stack_id: sourceStackId } : {}),
      }),
    }),
  // Per-station "ticker tape": one row per item at this station with
  // best bid + best ask + total volumes. Drives the overview list
  // before the player drills into a single item's order book.
  stationSummary: (bodyId) =>
    request(`/market/station/${encodeURIComponent(bodyId)}/summary`),
  // Full open order book for one item at one station.
  stationBook: (bodyId, { itemType, resourceTypeId, itemId, side } = {}) => {
    const qs = new URLSearchParams();
    if (itemType) qs.set('item_type', itemType);
    if (resourceTypeId) qs.set('resource_type_id', resourceTypeId);
    if (itemId) qs.set('item_id', itemId);
    if (side) qs.set('side', side);
    return request(`/market/station/${encodeURIComponent(bodyId)}/book?${qs.toString()}`);
  },
  myOrders: () => request('/market/my'),
};

// Direct player-to-player trade (Social Multiplayer Step 5 Phase 2).
// Thin REST surface over lib/trade.js. All state changes also emit
// socket events the trade singleton (utils/trade.js) listens for, so
// most callers will react to live updates rather than poll these.
export const tradeAPI = {
  invite: (partnerId) =>
    request('/trade/invite', { method: 'POST', body: JSON.stringify({ partner_id: partnerId }) }),
  accept: (tradeId) =>
    request(`/trade/${encodeURIComponent(tradeId)}/accept`, { method: 'POST' }),
  cancel: (tradeId, reason) =>
    request(`/trade/${encodeURIComponent(tradeId)}/cancel`, {
      method: 'POST', body: JSON.stringify({ reason: reason || 'user_cancelled' }),
    }),
  setOffer: (tradeId, items, credits) =>
    request(`/trade/${encodeURIComponent(tradeId)}/set-offer`, {
      method: 'POST', body: JSON.stringify({ items, credits }),
    }),
  confirm: (tradeId, confirmed) =>
    request(`/trade/${encodeURIComponent(tradeId)}/confirm`, {
      method: 'POST', body: JSON.stringify({ confirmed: !!confirmed }),
    }),
  // Recover after page reload: returns the user's currently-active
  // session if any, else { trade: null }.
  active: () => request('/trade/active'),
  get: (tradeId) => request(`/trade/${encodeURIComponent(tradeId)}`),
};

// Wrecks — lootable spatial entities. Replaces the old direct-credit
// awardLoot flow: enemy kills now spawn a wreck the player flies to.
export const wrecksAPI = {
  spawn: (data) => request('/resources/wrecks/spawn', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  list: (systemProceduralId) =>
    request(`/resources/wrecks?system_procedural_id=${encodeURIComponent(systemProceduralId)}`),
  claim: (wreckId) => request('/resources/wrecks/claim', {
    method: 'POST',
    body: JSON.stringify({ wreck_id: wreckId }),
  }),
};

// Skills API -- EVE-style passive training + 10-slot queue. The
// /api/skills GET returns the full snapshot (defs + player progress +
// live-computed SP for the currently training skill + the queue with
// pre-computed finishes_at timestamps).
export const skillsAPI = {
  list: () => request('/skills'),
  queueAdd: (skillId, targetLevel) => request('/skills/queue/add', {
    method: 'POST',
    body: JSON.stringify({ skill_id: skillId, target_level: targetLevel }),
  }),
  queueRemove: (position) => request('/skills/queue/remove', {
    method: 'POST',
    body: JSON.stringify({ position }),
  }),
};

// Research API -- Civ-style tech tree. RP trickles passively
// (1/min), unlock spends RP instantly when prereqs are met.
export const researchAPI = {
  list: () => request('/research'),
  unlock: (techId) => request('/research/unlock', {
    method: 'POST',
    body: JSON.stringify({ tech_id: techId }),
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
  // dockBodyId is the celestial body uuid the player is currently
  // docked at -- required only when the fleet would exceed cap and
  // the new ship needs to be stored. Pass null/undefined if unknown.
  buyHull: (hullTypeId, shipName, dockBodyId) => request('/fitting/buy-hull', {
    method: 'POST',
    body: JSON.stringify({ hull_type_id: hullTypeId, ship_name: shipName, dock_body_id: dockBodyId }),
  }),
  fitModule: async (shipId, slotId, cargoItemId) => {
    const r = await request('/fitting/fit-module', {
      method: 'POST',
      body: JSON.stringify({ ship_id: shipId, slot_id: slotId, cargo_item_id: cargoItemId }),
    });
    // Realtime presence: bump so peers refetch our ship_visual + see
    // the new hardpoint silhouette on the next pos broadcast. Lazy
    // import so api.js stays usable in non-presence builds.
    try { (await import('./presence.js')).default.bumpShipVisual(); } catch {}
    return r;
  },
  unfitModule: async (shipId, slotId) => {
    const r = await request('/fitting/unfit-module', {
      method: 'POST',
      body: JSON.stringify({ ship_id: shipId, slot_id: slotId }),
    });
    try { (await import('./presence.js')).default.bumpShipVisual(); } catch {}
    return r;
  },
  buyModule: (moduleTypeId) => request('/fitting/buy-module', {
    method: 'POST',
    body: JSON.stringify({ module_type_id: moduleTypeId }),
  }),
  getFleet: () => request('/fitting/fleet'),
  getCredits: () => request('/fitting/credits'),
  setActiveShip: async (shipId) => {
    const r = await request('/fitting/set-active-ship', {
      method: 'POST',
      body: JSON.stringify({ ship_id: shipId }),
    });
    // Active ship changed -- peer's flagship silhouette is now wrong.
    try { (await import('./presence.js')).default.bumpShipVisual(); } catch {}
    return r;
  },
  // Move an active ship into storage at a celestial body. Player must
  // be docked at the body; server validates ship is owned + active +
  // not the active ship + not a pod.
  storeShip: (shipId, bodyId) => request('/fitting/store-ship', {
    method: 'POST',
    body: JSON.stringify({ ship_id: shipId, body_id: bodyId }),
  }),
  // Activate a stored ship. Server validates ownership + storage state
  // + fleet cap. Client gates the button on "docked at the storage body."
  activateShip: (shipId) => request('/fitting/activate-ship', {
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
  awardLoot: (credits) => request('/fitting/award-loot', {
    method: 'POST',
    body: JSON.stringify({ credits }),
  }),
  // Podding (replaces /repair-cost respawn). Destroys active ship +
  // mints an Escape Pod the player flies back to a station to disembark.
  enterPod: () => request('/fitting/enter-pod', { method: 'POST' }),
  // Exit pod by switching active ship to a non-pod fleet ship; deletes the pod.
  exitPod: (shipId) => request('/fitting/exit-pod', {
    method: 'POST',
    body: JSON.stringify({ ship_id: shipId }),
  }),
  resetAccount: () => request('/fitting/reset-account', { method: 'POST' }),
  // Tops up every missile launcher on EVERY active fleet ship from
  // warheads in cargo. Each launcher is independent -- a 2-ship
  // fleet with one launcher each gets BOTH magazines reloaded in
  // a single transaction. Client passes per-launcher current ammo
  // counts (server's stored `loaded` only tracks reload events, not
  // per-shot decrement -- without the hint the server thinks every
  // magazine is still full).
  // currentLoaded shape: { [shipId]: { [slotKey]: count } }
  reloadMissiles: (currentLoaded) => request('/fitting/reload-missiles', {
    method: 'POST',
    body: JSON.stringify({ current_loaded: currentLoaded || {} }),
  }),
};

// ============================================
// QUESTS API
// ============================================

export const questsAPI = {
  getQuests: () => request('/quests'),
  completeQuest: (questId) => request('/quests/complete', {
    method: 'POST',
    body: JSON.stringify({ quest_id: questId }),
  }),
  pin: (questId, pinned) => request('/quests/pin', {
    method: 'POST',
    body: JSON.stringify({ quest_id: questId, pinned }),
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
