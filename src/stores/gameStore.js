import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { ROOM_TYPES, SYSTEMS, RESOURCES } from '@/systems/gameData';

// ============================================
// HELPER FUNCTIONS
// ============================================

const generateId = () => Math.random().toString(36).substr(2, 9);

const getCellKey = (x, y) => `${x},${y}`;

// ============================================
// INITIAL STATE
// ============================================

const initialState = {
  // Game meta
  gameStarted: false,
  gamePaused: false,
  gameSpeed: 1,
  currentTime: 0,

  // Player resources
  resources: {
    credits: 1000,
    metals: 500,
    crystals: 100,
    gases: 200,
    rareEarth: 0,
    fuel: 300,
    food: 100,
    electronics: 50,
    components: 20,
  },

  // Ships
  ships: {},
  activeShipId: null,

  // Ship Builder state
  shipBuilder: {
    isOpen: false,
    editingShipId: null, // null = new ship
    hullCells: new Set(),
    rooms: [],
    shipName: 'New Ship',
  },

  // Fleet
  fleet: [],

  // Colonies
  colonies: {},

  // Current location
  currentSystem: 'sol',
  currentLocation: null, // planet, station, or space coordinates

  // Exploration
  discoveredSystems: ['sol'],
  exploredLocations: {},

  // Research
  researchPoints: 0,
  unlockedTech: [],
  currentResearch: null,

  // UI state
  windows: {
    shipBuilder: { open: false, x: 60, y: 100, minimized: false },
    fleetManager: { open: false, x: 600, y: 150, minimized: false },
    planetView: { open: false, x: 100, y: 100, minimized: false },
    inventory: { open: false, x: 400, y: 200, minimized: false },
    research: { open: false, x: 200, y: 150, minimized: false },
  },
  windowZIndex: {},
  topZIndex: 10,
};

// ============================================
// GAME STORE
// ============================================

export const useGameStore = create(
  persist(
    immer((set, get) => ({
      ...initialState,

      // ==========================================
      // GAME ACTIONS
      // ==========================================

      startGame: () => set(state => {
        state.gameStarted = true;
      }),

      togglePause: () => set(state => {
        state.gamePaused = !state.gamePaused;
      }),

      setGameSpeed: (speed) => set(state => {
        state.gameSpeed = Math.max(0, Math.min(3, speed));
      }),

      tick: (deltaTime) => set(state => {
        if (state.gamePaused) return;
        state.currentTime += deltaTime * state.gameSpeed;
      }),

      // ==========================================
      // RESOURCE ACTIONS
      // ==========================================

      addResource: (resourceId, amount) => set(state => {
        if (state.resources[resourceId] !== undefined) {
          state.resources[resourceId] += amount;
        }
      }),

      spendResource: (resourceId, amount) => set(state => {
        if (state.resources[resourceId] >= amount) {
          state.resources[resourceId] -= amount;
          return true;
        }
        return false;
      }),

      canAfford: (costs) => {
        const { resources } = get();
        return Object.entries(costs).every(([id, amount]) => resources[id] >= amount);
      },

      // ==========================================
      // SHIP BUILDER ACTIONS
      // ==========================================

      openShipBuilder: (shipId = null) => set(state => {
        state.shipBuilder.isOpen = true;
        state.shipBuilder.editingShipId = shipId;
        
        if (shipId && state.ships[shipId]) {
          // Load existing ship
          const ship = state.ships[shipId];
          state.shipBuilder.hullCells = new Set(ship.hullCells);
          state.shipBuilder.rooms = [...ship.rooms];
          state.shipBuilder.shipName = ship.name;
        } else {
          // New ship
          state.shipBuilder.hullCells = new Set();
          state.shipBuilder.rooms = [];
          state.shipBuilder.shipName = 'New Ship';
        }

        state.windows.shipBuilder.open = true;
      }),

      closeShipBuilder: () => set(state => {
        state.shipBuilder.isOpen = false;
        state.windows.shipBuilder.open = false;
      }),

      setShipName: (name) => set(state => {
        state.shipBuilder.shipName = name;
      }),

      // Hull cell management
      addHullCell: (x, y) => set(state => {
        state.shipBuilder.hullCells.add(getCellKey(x, y));
      }),

      removeHullCell: (x, y) => set(state => {
        const key = getCellKey(x, y);
        state.shipBuilder.hullCells.delete(key);
        // Remove any rooms that overlap this cell
        state.shipBuilder.rooms = state.shipBuilder.rooms.filter(room => {
          for (let rx = room.x; rx < room.x + room.width; rx++) {
            for (let ry = room.y; ry < room.y + room.height; ry++) {
              if (getCellKey(rx, ry) === key) return false;
            }
          }
          return true;
        });
      }),

      toggleHullCell: (x, y) => set(state => {
        const key = getCellKey(x, y);
        if (state.shipBuilder.hullCells.has(key)) {
          state.shipBuilder.hullCells.delete(key);
          // Remove overlapping rooms
          state.shipBuilder.rooms = state.shipBuilder.rooms.filter(room => {
            for (let rx = room.x; rx < room.x + room.width; rx++) {
              for (let ry = room.y; ry < room.y + room.height; ry++) {
                if (getCellKey(rx, ry) === key) return false;
              }
            }
            return true;
          });
        } else {
          state.shipBuilder.hullCells.add(key);
        }
      }),

      loadHullTemplate: (cells) => set(state => {
        state.shipBuilder.hullCells = new Set(cells.map(([x, y]) => getCellKey(x + 4, y + 4)));
        state.shipBuilder.rooms = [];
      }),

      clearHull: () => set(state => {
        state.shipBuilder.hullCells = new Set();
        state.shipBuilder.rooms = [];
      }),

      // Room management
      addRoom: (room) => set(state => {
        const roomType = ROOM_TYPES[room.type];
        const newRoom = {
          id: generateId(),
          type: room.type,
          x: room.x,
          y: room.y,
          width: room.width,
          height: room.height,
          systems: [],
          ...roomType,
        };
        state.shipBuilder.rooms.push(newRoom);
      }),

      removeRoom: (roomId) => set(state => {
        state.shipBuilder.rooms = state.shipBuilder.rooms.filter(r => r.id !== roomId);
      }),

      // System management within rooms
      addSystemToRoom: (roomId, systemId) => set(state => {
        const room = state.shipBuilder.rooms.find(r => r.id === roomId);
        if (room && SYSTEMS[systemId]) {
          room.systems.push({
            id: generateId(),
            systemId,
            ...SYSTEMS[systemId],
          });
        }
      }),

      removeSystemFromRoom: (roomId, systemInstanceId) => set(state => {
        const room = state.shipBuilder.rooms.find(r => r.id === roomId);
        if (room) {
          room.systems = room.systems.filter(s => s.id !== systemInstanceId);
        }
      }),

      // Save ship design
      saveShip: () => set(state => {
        const { shipBuilder, ships } = state;
        const shipId = shipBuilder.editingShipId || generateId();

        const ship = {
          id: shipId,
          name: shipBuilder.shipName,
          hullCells: Array.from(shipBuilder.hullCells),
          rooms: shipBuilder.rooms.map(room => ({
            ...room,
            systems: room.systems.map(s => ({ ...s })),
          })),
          createdAt: shipBuilder.editingShipId ? ships[shipId]?.createdAt : Date.now(),
          updatedAt: Date.now(),
        };

        state.ships[shipId] = ship;
        state.shipBuilder.editingShipId = shipId;

        return shipId;
      }),

      // Build ship (create instance from design)
      buildShip: (designId) => set(state => {
        const design = state.ships[designId];
        if (!design) return null;

        // Calculate build cost based on hull size and rooms
        const hullCost = design.hullCells.length * 10;
        const roomCost = design.rooms.reduce((sum, room) => {
          const size = room.width * room.height;
          return sum + size * 20;
        }, 0);
        const systemCost = design.rooms.reduce((sum, room) => {
          return sum + room.systems.length * 50;
        }, 0);

        const totalCost = {
          credits: hullCost + roomCost + systemCost,
          metals: Math.floor((hullCost + roomCost) / 2),
          components: design.rooms.length * 5,
        };

        // Check if can afford
        if (!get().canAfford(totalCost)) {
          return { error: 'insufficient_resources', required: totalCost };
        }

        // Deduct resources
        Object.entries(totalCost).forEach(([resource, amount]) => {
          state.resources[resource] -= amount;
        });

        // Create ship instance
        const instanceId = generateId();
        const shipInstance = {
          id: instanceId,
          designId,
          name: `${design.name} #${Object.keys(state.ships).length}`,
          status: 'docked',
          health: 100,
          fuel: 100,
          crew: [],
          cargo: {},
          position: { system: state.currentSystem, x: 0, y: 0 },
          createdAt: Date.now(),
        };

        state.fleet.push(shipInstance);

        return { success: true, shipId: instanceId };
      }),

      // ==========================================
      // WINDOW MANAGEMENT
      // ==========================================

      openWindow: (windowId) => set(state => {
        if (state.windows[windowId]) {
          state.windows[windowId].open = true;
          state.windows[windowId].minimized = false;
          state.topZIndex += 1;
          state.windowZIndex[windowId] = state.topZIndex;
        }
      }),

      closeWindow: (windowId) => set(state => {
        if (state.windows[windowId]) {
          state.windows[windowId].open = false;
        }
      }),

      minimizeWindow: (windowId) => set(state => {
        if (state.windows[windowId]) {
          state.windows[windowId].minimized = true;
        }
      }),

      restoreWindow: (windowId) => set(state => {
        if (state.windows[windowId]) {
          state.windows[windowId].minimized = false;
          state.topZIndex += 1;
          state.windowZIndex[windowId] = state.topZIndex;
        }
      }),

      bringToFront: (windowId) => set(state => {
        state.topZIndex += 1;
        state.windowZIndex[windowId] = state.topZIndex;
      }),

      updateWindowPosition: (windowId, x, y) => set(state => {
        if (state.windows[windowId]) {
          state.windows[windowId].x = x;
          state.windows[windowId].y = y;
        }
      }),

      // ==========================================
      // RESET
      // ==========================================

      resetGame: () => set(initialState),
    })),
    {
      name: 'star-shipper-save',
      partialize: (state) => ({
        // Only persist these fields
        resources: state.resources,
        ships: state.ships,
        fleet: state.fleet,
        colonies: state.colonies,
        currentSystem: state.currentSystem,
        discoveredSystems: state.discoveredSystems,
        exploredLocations: state.exploredLocations,
        researchPoints: state.researchPoints,
        unlockedTech: state.unlockedTech,
        gameStarted: state.gameStarted,
        currentTime: state.currentTime,
      }),
      // Handle Set serialization
      serialize: (state) => JSON.stringify(state, (key, value) => {
        if (value instanceof Set) {
          return { __type: 'Set', values: Array.from(value) };
        }
        return value;
      }),
      deserialize: (str) => JSON.parse(str, (key, value) => {
        if (value && value.__type === 'Set') {
          return new Set(value.values);
        }
        return value;
      }),
    }
  )
);

// ============================================
// SELECTORS
// ============================================

export const useResources = () => useGameStore(state => state.resources);
export const useShips = () => useGameStore(state => state.ships);
export const useFleet = () => useGameStore(state => state.fleet);
export const useShipBuilder = () => useGameStore(state => state.shipBuilder);
export const useWindows = () => useGameStore(state => state.windows);
export const useWindowZIndex = () => useGameStore(state => state.windowZIndex);

// Ship builder computed values
export const useShipBuilderStats = () => {
  const { hullCells, rooms } = useGameStore(state => state.shipBuilder);
  
  const hullSize = hullCells instanceof Set ? hullCells.size : 0;
  
  const totalPower = rooms.reduce((sum, room) => {
    const roomPower = room.basePower || 0;
    const systemPower = room.systems?.reduce((s, sys) => s + (sys.power || 0), 0) || 0;
    return sum + roomPower + systemPower;
  }, 0);

  const totalCrew = rooms.reduce((sum, room) => sum + (room.baseCrewSlots || 0), 0);
  
  const totalCargo = rooms
    .filter(r => r.type === 'cargo')
    .reduce((sum, room) => sum + (room.width * room.height * 50), 0);

  const hasEssentials = {
    cockpit: rooms.some(r => r.type === 'cockpit'),
    engine: rooms.some(r => r.type === 'engine'),
    reactor: rooms.some(r => r.type === 'reactor'),
    crew: rooms.some(r => r.type === 'crew'),
  };

  const warnings = [];
  if (!hasEssentials.cockpit) warnings.push('No cockpit - ship cannot be piloted');
  if (!hasEssentials.engine) warnings.push('No engine - ship cannot move');
  if (!hasEssentials.reactor) warnings.push('No reactor - ship has no power');
  if (!hasEssentials.crew) warnings.push('No crew quarters - ship cannot have crew');
  if (totalPower > 0) warnings.push(`Power deficit: ${totalPower} - add reactors or remove systems`);

  return {
    hullSize,
    roomCount: rooms.length,
    totalPower,
    totalCrew,
    totalCargo,
    hasEssentials,
    warnings,
    isValid: warnings.length === 0 && hullSize >= 15,
  };
};
