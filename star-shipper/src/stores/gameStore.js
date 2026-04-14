import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { shipsAPI, questsAPI } from '@/utils/api';

// ============================================
// INITIAL STATE
// ============================================

const initialState = {
  // Game meta
  gameStarted: false,
  gamePaused: false,
  gameSpeed: 1,
  currentTime: 0,

  // Player resources (synced from server)
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

  // Ship designs (legacy — kept for FK compatibility)
  shipDesigns: [],
  shipDesignsLoaded: false,

  // Built ships (from database)
  ships: [],
  shipsLoaded: false,

  activeShipId: null,

  // Fleet
  fleet: [],

  // Colonies
  colonies: {},

  // Current location
  currentSystem: 'sol',
  currentLocation: null,
  pendingJump: null, // { targetSystemId } — set when player clicks Jump, autopilots to gate first

  // Exploration
  discoveredSystems: ['sol'],
  exploredLocations: {},

  // Research
  researchPoints: 0,
  unlockedTech: [],
  currentResearch: null,

  // Quests
  quests: [],
  questsLoaded: false,

  // UI state
  windows: {
    character: { open: false, x: 50, y: 50, minimized: false },
    shipBuilder: { open: false, x: 60, y: 100, minimized: false },
    fleet: { open: false, x: 100, y: 100, minimized: false },
    systemView: { open: false, x: 50, y: 50, minimized: false },
    planetView: { open: false, x: 100, y: 100, minimized: false },
    inventory: { open: false, x: 400, y: 200, minimized: false },
    navigation: { open: false, x: 50, y: 50, minimized: false },
    crafting: { open: false, x: 300, y: 100, minimized: false },
    research: { open: false, x: 200, y: 150, minimized: false },
    planetInteraction: { open: false, x: 300, y: 100, minimized: false },
    galaxyMap: { open: false, x: 80, y: 60, minimized: false },
    questLog: { open: false, x: 250, y: 80, minimized: false },
  },
  windowZIndex: {},
  topZIndex: 10,

  // Navigation / autopilot (shared between SystemView and NavigationWindow)
  autopilotTarget: null, // { id, name, type } or null
  shipPosition: { x: 900, y: 0 }, // updated by SystemView game loop
  shipSpeed: 0,
  gameTime: 0, // shared time for planet position sync

  // HUD state (updated by SystemView combat loop, displayed in GameFrame top bar)
  playerHull: 0,
  playerMaxHull: 100,
  playerShield: 0,
  playerMaxShield: 0,
  enemyCount: 0,
  followMode: true,

  // Fleet aggregated stats (computed by SystemView, consumed by Outliner)
  fleetStats: null,

  // Docked body (set by SystemView when player docks, cleared on undock)
  // Shape: { id, name, type, ... } — or null when undocked
  dockedBody: null,

  // Outliner state
  systemBodies: [], // [{ id, name, type, planetType, color, parentBody }] — pushed by SystemView
  outlinerVisible: true, // toggleable from top bar

  // Toast notifications — global, ephemeral, stack at the bottom of screen.
  // Any component can call pushToast({ kind, text }) and the bottom-center
  // <Toaster/> renders + auto-dismisses them. Avoids per-window message
  // bars that cause layout shift.
  // Shape: [{ id, kind: 'success'|'error'|'info', text, createdAt }]
  toasts: [],

  // View mode — 'system' (in-system flight) or 'galaxy' (interstellar flight)
  viewMode: 'system',
  arrivalType: 'warp', // 'warp' or 'jump_gate' — where to spawn in system
  
  // Galaxy flight state
  galaxyShipPosition: { x: 0, y: 0 }, // position in galaxy coordinates
  galaxyShipSpeed: 0,
  galaxyAutopilotTarget: null, // { id, name } — target system for galaxy autopilot
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

      // Galaxy / system navigation
      setCurrentSystemId: (systemId) => set(state => {
        state.currentSystem = systemId;
        state.autopilotTarget = null; // Clear autopilot when switching systems
        state.pendingJump = null; // Clear any pending jump
        if (!state.discoveredSystems.includes(systemId)) {
          state.discoveredSystems.push(systemId);
        }
      }),

      tick: (deltaTime) => set(state => {
        if (state.gamePaused) return;
        state.currentTime += deltaTime * state.gameSpeed;
      }),

      // ==========================================
      // RESOURCE ACTIONS
      // ==========================================

      setResources: (resources) => set(state => {
        state.resources = resources;
      }),

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
      // BUILT SHIPS (Database)
      // ==========================================

      fetchShips: async () => {
        try {
          // Use fittingAPI.getFleet() — it returns ships with hull_slots joined
          // from hull_types and fitted_modules from the ships row, PLUS the
          // activeShipId in a single response. That's everything combat needs
          // (so ship.hull_slots and ship.fitted_modules are populated when the
          // combat loop calls getShipWeapons / computeFleetStats), and it
          // collapses the old two-call sequence (getShips + getFleet) into one.
          const { fittingAPI } = await import('@/utils/api');
          const [fleetData, creditsData] = await Promise.all([
            fittingAPI.getFleet(),
            fittingAPI.getCredits().catch(() => null),
          ]);
          set(state => {
            state.ships = fleetData.ships || [];
            state.shipsLoaded = true;
            state.activeShipId = fleetData.activeShipId || (fleetData.ships?.[0]?.id) || null;
            if (creditsData?.credits != null) {
              state.resources.credits = creditsData.credits;
            }
          });
        } catch (error) {
          console.error('Failed to fetch ships:', error);
        }
      },

      fetchCredits: async () => {
        try {
          const { fittingAPI } = await import('@/utils/api');
          const data = await fittingAPI.getCredits();
          set(state => {
            state.resources.credits = data.credits ?? state.resources.credits;
          });
        } catch (e) { /* ignore */ }
      },

      fetchQuests: async () => {
        try {
          const data = await questsAPI.getQuests();
          set(state => {
            state.quests = data.quests || [];
            state.questsLoaded = true;
          });
        } catch (error) {
          console.error('Failed to fetch quests:', error);
        }
      },

      completeQuest: async (questId) => {
        try {
          const data = await questsAPI.completeQuest(questId);
          if (data.success && !data.already_complete) {
            // Refresh quests and credits after completion
            get().fetchQuests();
            if (data.credits !== undefined) {
              set(state => { state.resources.credits = data.credits; });
            }
          }
        } catch (error) {
          console.error('Failed to complete quest:', error);
        }
      },

      scrapShip: async (shipId) => {
        try {
          const result = await shipsAPI.scrapShip(shipId);
          await get().fetchShips();
          return { success: true, scrapValue: result.scrapValue };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },

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

      toggleWindow: (windowId) => set(state => {
        if (state.windows[windowId]) {
          if (state.windows[windowId].open && !state.windows[windowId].minimized) {
            state.windows[windowId].open = false;
          } else {
            state.windows[windowId].open = true;
            state.windows[windowId].minimized = false;
            state.topZIndex += 1;
            state.windowZIndex[windowId] = state.topZIndex;
          }
        }
      }),

      closeWindow: (windowId) => set(state => {
        if (state.windows[windowId]) {
          state.windows[windowId].open = false;
        }
      }),

      // Open a context panel, automatically closing any other open context
      // panels. Mirrors the behavior of the left toolbar's handleClick, but
      // callable from anywhere (e.g. SystemView's auto-open on dock).
      openContextPanel: (windowId) => set(state => {
        const CONTEXT_PANELS = ['character', 'fleet', 'inventory', 'crafting', 'questLog', 'navigation', 'planetInteraction'];
        for (const pid of CONTEXT_PANELS) {
          if (pid !== windowId && state.windows[pid]?.open) {
            state.windows[pid].open = false;
          }
        }
        if (state.windows[windowId]) {
          state.windows[windowId].open = true;
          state.windows[windowId].minimized = false;
          state.topZIndex += 1;
          state.windowZIndex[windowId] = state.topZIndex;
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
      // NAVIGATION / AUTOPILOT
      // ==========================================

      setAutopilotTarget: (target) => set(state => {
        state.autopilotTarget = target; // { id, name, type } or null
      }),

      setPendingJump: (targetSystemId) => set(state => {
        state.pendingJump = targetSystemId ? { targetSystemId } : null;
      }),

      // Galaxy flight actions
      setViewMode: (mode) => set(state => {
        state.viewMode = mode;
      }),
      
      updateGalaxyShipPosition: (x, y, speed) => set(state => {
        state.galaxyShipPosition = { x, y };
        state.galaxyShipSpeed = speed;
      }),
      
      setGalaxyAutopilotTarget: (target) => set(state => {
        state.galaxyAutopilotTarget = target; // { id, name } or null
      }),
      
      enterGalaxyFlight: (systemX, systemY) => set(state => {
        state.viewMode = 'galaxy';
        state.galaxyShipPosition = { x: systemX, y: systemY };
        state.galaxyAutopilotTarget = null;
        state.autopilotTarget = null;
        // Auto-open galaxy map for navigation
        if (state.windows.galaxyMap) {
          state.windows.galaxyMap.open = true;
          state.windows.galaxyMap.minimized = false;
        }
      }),
      
      enterSystem: (systemId, arrivalType = 'warp') => set(state => {
        state.viewMode = 'system';
        state.currentSystem = systemId;
        state.arrivalType = arrivalType; // 'warp' or 'jump_gate'
        state.galaxyAutopilotTarget = null;
        state.autopilotTarget = null;
        state.pendingJump = null;
        if (!state.discoveredSystems.includes(systemId)) {
          state.discoveredSystems.push(systemId);
        }
      }),

      clearAutopilot: () => set(state => {
        state.autopilotTarget = null;
      }),

      updateShipPosition: (x, y, speed, time) => set(state => {
        state.shipPosition = { x, y };
        state.shipSpeed = speed;
        state.gameTime = time;
      }),

      // Called by SystemView combat loop to push HUD data to the top bar
      updateHud: (data) => set(state => {
        if (data.playerHull !== undefined) state.playerHull = data.playerHull;
        if (data.playerMaxHull !== undefined) state.playerMaxHull = data.playerMaxHull;
        if (data.playerShield !== undefined) state.playerShield = data.playerShield;
        if (data.playerMaxShield !== undefined) state.playerMaxShield = data.playerMaxShield;
        if (data.enemyCount !== undefined) state.enemyCount = data.enemyCount;
        if (data.followMode !== undefined) state.followMode = data.followMode;
      }),

      // Outliner: SystemView pushes the static body list when a system loads
      setSystemBodies: (bodies) => set(state => {
        state.systemBodies = bodies || [];
      }),

      // Fleet stats: SystemView pushes aggregated stats when fleet changes
      setFleetStats: (stats) => set(state => {
        state.fleetStats = stats || null;
      }),

      // Dock status: SystemView pushes on dock / undock
      setDockedBody: (body) => set(state => {
        state.dockedBody = body || null;
      }),

      toggleOutliner: () => set(state => {
        state.outlinerVisible = !state.outlinerVisible;
      }),

      // ==========================================
      // TOAST NOTIFICATIONS
      // ==========================================
      // pushToast({ kind, text, duration? }) — adds a toast to the global
      // queue. Any component can call this without prop-drilling. The
      // <Toaster /> mounted in App.jsx renders + auto-dismisses them.
      //
      //   kind: 'success' | 'error' | 'info'   (defaults 'info')
      //   text: string                          (the message body)
      //   duration: ms before auto-dismiss      (default 3000)
      pushToast: (toast) => {
        const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const t = {
          id,
          kind: toast.kind || 'info',
          text: toast.text || '',
          duration: toast.duration ?? 3000,
          createdAt: Date.now(),
        };
        set(state => {
          state.toasts.push(t);
          // Keep the queue bounded — drop oldest if more than 6 stack up.
          if (state.toasts.length > 6) state.toasts.shift();
        });
        // Schedule auto-dismiss outside of the immer producer.
        if (t.duration > 0) {
          setTimeout(() => {
            const cur = useGameStore.getState().toasts;
            if (cur.find(x => x.id === id)) {
              useGameStore.getState().dismissToast(id);
            }
          }, t.duration);
        }
        return id;
      },

      dismissToast: (id) => set(state => {
        state.toasts = state.toasts.filter(t => t.id !== id);
      }),

      // ==========================================
      // RESET
      // ==========================================

      // Full reset — wipes client state AND localStorage so nothing
      // leaks between sessions. Called by the DEV reset button after
      // the server side account wipe succeeds.
      resetGame: () => {
        // Purge the persisted slice BEFORE resetting in-memory state,
        // so persist middleware doesn't immediately re-save the old
        // windows object during the set() call.
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('star-shipper-local');
          }
        } catch (e) { /* ignore */ }
        set(state => {
          Object.assign(state, initialState);
          // Deep-replace windows explicitly — belt & suspenders in case
          // immer/persist keeps a reference to the previous windows object.
          state.windows = { ...initialState.windows };
        });
      },
    })),
    {
      name: 'star-shipper-local',
      partialize: (state) => ({
        // Only persist UI state locally
        gameStarted: state.gameStarted,
        outlinerVisible: state.outlinerVisible,
      }),
      // Merge persisted state with initial state. Window open/minimized
      // state is NOT persisted — we always start with all panels closed
      // so a stale "open" flag from a prior session can't cause panels
      // to appear behind other panels on page load.
      merge: (persistedState, currentState) => {
        return {
          ...currentState,
          ...persistedState,
          // Always use the initial (all-closed) windows state.
          windows: currentState.windows,
        };
      },
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
// HELPER: Compute ship stats from builder state
// ============================================
// SELECTORS
// ============================================

export const useResources = () => useGameStore(state => state.resources);
export const useShips = () => useGameStore(state => state.ships);
export const useActiveShipId = () => useGameStore(state => state.activeShipId);
export const useActiveShip = () => useGameStore(state => {
  const id = state.activeShipId;
  return id ? state.ships.find(s => s.id === id) || state.ships[0] || null : state.ships[0] || null;
});
export const useWindows = () => useGameStore(state => state.windows);
export const useWindowZIndex = () => useGameStore(state => state.windowZIndex);

// Debug: expose store on window for console inspection
if (typeof window !== 'undefined') {
  window.__STORE__ = useGameStore;
}
