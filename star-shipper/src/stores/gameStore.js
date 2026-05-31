import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { shipsAPI, questsAPI, galaxyAPI } from '@/utils/api';

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

  // Research + Skills (Phase 1: framework + 20 skills + 15 techs).
  // researchPoints / techs / skills / skillQueue all populated by
  // fetchSkillsAndResearch() (a single round-trip into both APIs).
  // activeBonuses is a flat dict like { fleet_damage_pct: 15, ... }
  // derived from skill levels -- combat + sensor-range gating reads
  // it directly so the UI updates the moment a level finishes.
  researchPoints: 0,
  techs: [],                   // [{ id, tree, tier, name, description, rp_cost, prerequisites, unlocks, status }]

  // Sensor sweep activation timestamp (ms epoch). SystemView writes
  // it when the player triggers a sweep so SystemMapWindow can read
  // it and render the same 3-wave ping animation. Zero = no sweep
  // in progress. Cleared by the SystemView ticker once the active
  // window ends (12s ping + 30s reveal = 42s after start).
  sweepStartedAt: 0,

  // Cross-window deep-link targets. Vendor "Craft this" button sets
  // craftingTargetRecipeId before opening the crafting window, which
  // reads + auto-selects the matching recipe on mount. CraftingWindow's
  // "research X to unlock" link sets researchTargetTechId before
  // opening the SkillsResearchWindow, which switches to the Research
  // tab and scrolls/highlights the node. Both clear after consumption
  // so they don't re-fire on subsequent opens.
  craftingTargetRecipeId: null,
  researchTargetTechId: null,
  // Public profile deep-link target. Set by callers (ChatPanel name
  // click, LeaderboardsWindow row click) right before opening the
  // 'profile' window; ProfileWindow reads it on mount and fires the
  // /api/profile/:userId fetch. Cleared after consumption.
  profileTargetUserId: null,

  // Step 9: cached unread mail count. Polled by a small bootstrap
  // component in GameFrame (every 60s) + refreshed in-place by the
  // InboxWindow after read/delete/send actions. Drives the badge on
  // the 📬 Mail toolbar button.
  mailUnreadCount: 0,
  skills: [],                  // [{ id, category, name, description, rank_multiplier, bonus_per_level, level, sp, sp_at_current_level, sp_for_next_level }]
  skillQueue: [],              // [{ position, skill_id, target_level, started_at, finishes_at, live_sp }]
  skillSpPerMin: 30,
  skillMaxLevel: 5,
  skillMaxQueue: 3,  // base queue cap; expands +1 per Training Discipline level (max 10)
  skillsLoaded: false,
  researchLoaded: false,
  activeBonuses: {},
  // Legacy fields kept so older code that referenced them doesn't crash.
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
    crafting: { open: false, x: 300, y: 100, minimized: false },
    research: { open: false, x: 200, y: 150, minimized: false },
    planetInteraction: { open: false, x: 300, y: 100, minimized: false },
    galaxyMap: { open: false, x: 80, y: 60, minimized: false },
    questLog: { open: false, x: 250, y: 80, minimized: false },
    systemMap: { open: true, x: 0, y: 0, minimized: false },
    settings: { open: false, x: 280, y: 80, minimized: false },
    leaderboards: { open: false, x: 200, y: 100, minimized: false },
    profile: { open: false, x: 220, y: 110, minimized: false },
    corp: { open: false, x: 240, y: 120, minimized: false },
    bounties: { open: false, x: 260, y: 130, minimized: false },
    mail: { open: false, x: 280, y: 140, minimized: false },
  },
  windowZIndex: {},
  topZIndex: 10,

  // Navigation / autopilot (shared between SystemView and SystemMapWindow)
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

  // Range overlay toggle: when true, SystemView draws sensor + scan
  // range rings around the fleet's primary ship on the gameplay
  // canvas. Toggled by the "View Scan Range" button in the System Map
  // header. Useful for judging "is that asteroid close enough to scan?"
  // and "will that pirate become visible if I move 100 px closer?"
  showRangeOverlay: false,

  // Designated enemy: set by clicking an enemy in SystemView's
  // gameplay canvas. The whole fleet's combat targeting prefers this
  // enemy (instead of just "nearest in range") -- solves the missile
  // lock thrashing problem in dense clusters and lets the player pick
  // priority targets at sensor-range distance, well before missiles
  // can reach. Cleared automatically when the target dies.
  designatedEnemyId: null,

  // Missile ammo mirror: keyed by `${shipId}::${slotKey}`, written
  // by SystemView whenever the local missileAmmoRef changes. Vendor
  // reload reads this so it can pass the CLIENT'S actual current
  // ammo to the server (the server's fitted_modules.loaded only
  // tracks reload events, not per-fire decrements; without this the
  // server thinks magazines are full forever and refuses to refill).
  missileAmmo: {},

  // Scanner snapshot pushed by SystemView every few frames, consumed
  // by SystemMapWindow to draw pins on the map. Hybrid persistence:
  //   * scannedAsteroids -- static, persisted server-side; client
  //     pushes the subset for the current system.
  //   * liveEnemies      -- currently in sensor range (real-time).
  //   * enemyGhosts      -- last-known positions of enemies that left
  //     sensor range, fade over GHOST_TTL_MS (~30s) then disappear.
  // All coords are world-space, scaled to the map via SystemMapWindow's
  // mapScale at render time.
  scannerData: {
    scannedAsteroids: [], // [{ id, x, y, size }]
    liveEnemies: [],      // [{ id, x, y, name, color }]
    enemyGhosts: [],      // [{ id, x, y, name, color, lastSeenMs }]
    sensorRange: 0,       // current fleet sensor range in world units
  },

  // Fleet aggregated stats (computed by SystemView, consumed by Outliner)
  fleetStats: null,

  // Docked body (set by SystemView when player docks, cleared on undock)
  // Shape: { id, name, type, ... } — or null when undocked
  dockedBody: null,
  // The same body's DB identifier (UUID for procedural bodies, Sol
  // alias string for hand-seeded ones). Set by PlanetInteractionWindow
  // when it resolves the docked body for API calls. Consumers that
  // need to make server calls referencing the docked body (store-ship,
  // activate-ship, etc.) read this rather than re-resolving.
  dockedBodyDbId: null,

  // System bodies (planets / stations / warp / gate) for the current
  // system. Pushed by SystemView. Consumed by SystemMapWindow.
  systemBodies: [], // [{ id, name, type, planetType, color, parentBody }]

  // Toast notifications — global, ephemeral, stack at the bottom of screen.
  // Any component can call pushToast({ kind, text }) and the bottom-center
  // <Toaster/> renders + auto-dismisses them. Avoids per-window message
  // bars that cause layout shift.
  // Shape: [{ id, kind: 'success'|'error'|'info', text, createdAt }]
  toasts: [],

  // Audio settings — read by utils/audio.js's playSound() on every call.
  // Persisted via partialize below so the player's mute / volume choice
  // survives reloads. Volumes are 0..1; gain = master * sfx.
  // Left toolbar: expanded shows label-left / icon-right rows so new
  // players can read what each icon does. Collapses to icon-only via
  // the chevron on the toolbar's right edge once they're familiar.
  // Persisted -- new accounts default to expanded so first-time players
  // see labels without having to discover the toggle.
  toolbarExpanded: true,

  // UI scale -- multiplier applied to text sizes across the interface.
  // 1.0 = default. Drives root font-size (which scales Tailwind rem-based
  // text utilities) and is read directly by Toaster + future text-heavy
  // surfaces. Accessibility setting -- exposed via the Settings window.
  uiScale: 1.0,

  audio: {
    muted: false,
    masterVolume: 0.8,
    sfxVolume: 1.0,
  },

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
          // Fire-and-forget server-side record so fog of war survives
          // login on a different device. Failures are harmless -- next
          // visit retries; local state is the working copy.
          galaxyAPI.recordVisit(systemId).catch(() => {});
        }
      }),

      // Seed discoveredSystems from the server's visit table. Called on
      // app-load (App.jsx) so the galaxy map renders with correct fog
      // of war on first paint, not just after the next system change.
      hydrateDiscoveredSystems: async () => {
        try {
          const { visits } = await galaxyAPI.visits();
          set(state => {
            const merged = new Set(state.discoveredSystems || ['sol']);
            for (const v of visits) merged.add(v);
            state.discoveredSystems = Array.from(merged);
          });
        } catch (e) {
          // Network blip on cold start -- local state retains 'sol' so
          // the player can still play; next system change syncs.
        }
      },

      setSweepStartedAt: (t) => set(state => { state.sweepStartedAt = t || 0; }),

      // Cross-window deep-link helpers (Tier B vendor / craft / research
      // integration). Callers should setTarget then openWindow; the
      // destination component picks up the target on its next render
      // and clears it so a re-open doesn't re-fire the navigation.
      setCraftingTargetRecipe: (recipeId) => set(state => { state.craftingTargetRecipeId = recipeId; }),
      clearCraftingTargetRecipe: () => set(state => { state.craftingTargetRecipeId = null; }),
      setResearchTargetTech:    (techId)   => set(state => { state.researchTargetTechId = techId; }),
      clearResearchTargetTech:  () => set(state => { state.researchTargetTechId = null; }),
      setProfileTargetUserId:   (userId)   => set(state => { state.profileTargetUserId = userId; }),
      clearProfileTargetUserId: () => set(state => { state.profileTargetUserId = null; }),
      // One-call helper for the common pattern: set target + open
      // window. Saves callers from importing two actions.
      openProfile: (userId) => set(state => {
        state.profileTargetUserId = userId;
        if (state.windows.profile) state.windows.profile.open = true;
      }),
      // Mail unread count -- pushed by the InboxWindow + the poller.
      setMailUnread: (n) => set(state => { state.mailUnreadCount = Math.max(0, parseInt(n, 10) || 0); }),

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

      // Skills + Research. Two endpoints, parallel fetch. The
      // activeBonuses dict is recomputed each fetch from skill levels
      // so any consumer (combat, sensor-range gating, mining) reads a
      // canonical aggregate without having to traverse skills itself.
      fetchSkillsAndResearch: async () => {
        try {
          const { skillsAPI, researchAPI } = await import('@/utils/api');
          const [skillsData, researchData] = await Promise.all([
            skillsAPI.list().catch(() => null),
            researchAPI.list().catch(() => null),
          ]);
          set(state => {
            if (skillsData) {
              state.skills = skillsData.skills || [];
              state.skillQueue = skillsData.queue || [];
              state.skillSpPerMin = skillsData.sp_per_min || 30;
              state.skillMaxLevel = skillsData.max_level || 5;
              state.skillMaxQueue = skillsData.max_queue || 10;
              state.skillsLoaded = true;
              // Aggregate active bonuses from skill levels.
              const bonuses = {};
              for (const s of (skillsData.skills || [])) {
                if (!s.level || !s.bonus_per_level?.type || typeof s.bonus_per_level.value !== 'number') continue;
                bonuses[s.bonus_per_level.type] = (bonuses[s.bonus_per_level.type] || 0) + s.bonus_per_level.value * s.level;
              }
              state.activeBonuses = bonuses;
            }
            if (researchData) {
              state.techs = researchData.techs || [];
              state.researchPoints = researchData.research_points || 0;
              state.researchLoaded = true;
            }
          });
        } catch (error) {
          console.error('Failed to fetch skills/research:', error);
        }
      },

      addSkillToQueue: async (skillId, targetLevel) => {
        try {
          const { skillsAPI } = await import('@/utils/api');
          await skillsAPI.queueAdd(skillId, targetLevel);
          await get().fetchSkillsAndResearch();
        } catch (error) {
          const msg = error?.message || 'Failed to queue skill';
          get().pushToast({ kind: 'error', text: msg, duration: 4000 });
        }
      },

      removeSkillFromQueue: async (position) => {
        try {
          const { skillsAPI } = await import('@/utils/api');
          await skillsAPI.queueRemove(position);
          await get().fetchSkillsAndResearch();
        } catch (error) {
          const msg = error?.message || 'Failed to remove from queue';
          get().pushToast({ kind: 'error', text: msg, duration: 4000 });
        }
      },

      unlockTech: async (techId) => {
        try {
          const { researchAPI } = await import('@/utils/api');
          const result = await researchAPI.unlock(techId);
          await get().fetchSkillsAndResearch();
          get().pushToast({
            kind: 'success',
            text: `Researched: ${result.name}`,
            duration: 4500,
          });
        } catch (error) {
          const msg = error?.message || 'Failed to unlock tech';
          get().pushToast({ kind: 'error', text: msg, duration: 4000 });
        }
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

      pinQuest: async (questId, pinned) => {
        // Optimistic flip so the pinned overlay reacts immediately;
        // server roundtrip + refetch confirms.
        set(state => {
          const q = state.quests.find(q => q.quest_id === questId);
          if (q) q.pinned = pinned;
        });
        try {
          await questsAPI.pin(questId, pinned);
        } catch (error) {
          console.error('Failed to pin quest:', error);
          // Revert on failure.
          set(state => {
            const q = state.quests.find(q => q.quest_id === questId);
            if (q) q.pinned = !pinned;
          });
          get().pushToast({ kind: 'error', text: error?.message || 'Failed to update pin', duration: 3000 });
        }
      },

      completeQuest: async (questId) => {
        // Snapshot the quest title before the API call so we can name it in
        // the completion toast (the local quests list gets refetched after).
        const questTitle = get().quests.find(q => q.quest_id === questId)?.title;
        try {
          const data = await questsAPI.completeQuest(questId);
          if (data.success && !data.already_complete) {
            get().fetchQuests();
            if (data.credits !== undefined) {
              set(state => { state.resources.credits = data.credits; });
            }
            get().pushToast({
              kind: 'success',
              text: `Quest Completed: ${questTitle || 'Unknown Quest'}`,
              duration: 5000,
            });
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
        const CONTEXT_PANELS = ['character', 'fleet', 'inventory', 'crafting', 'questLog', 'planetInteraction'];
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
          galaxyAPI.recordVisit(systemId).catch(() => {});
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

      // Scanner snapshot push from SystemView's game loop. Whole-object
      // replacement (cheap; data is small + the consumer just diffs by
      // re-render anyway).
      setScannerData: (data) => set(state => {
        state.scannerData = data;
      }),

      // Mirror of SystemView's missileAmmoRef. Whole-object replacement
      // on each push.
      setMissileAmmo: (data) => set(state => {
        state.missileAmmo = data;
      }),

      // Set / clear the fleet-wide designated enemy. Passing the same
      // id twice toggles it off.
      setDesignatedEnemy: (enemyId) => set(state => {
        state.designatedEnemyId = (state.designatedEnemyId === enemyId) ? null : enemyId;
      }),
      clearDesignatedEnemy: () => set(state => {
        state.designatedEnemyId = null;
      }),

      toggleRangeOverlay: () => set(state => {
        state.showRangeOverlay = !state.showRangeOverlay;
      }),

      // Fleet stats: SystemView pushes aggregated stats when fleet changes
      setFleetStats: (stats) => set(state => {
        state.fleetStats = stats || null;
      }),

      // Dock status: SystemView pushes on dock / undock
      setDockedBodyDbId: (id) => set(state => {
        state.dockedBodyDbId = id || null;
      }),

      setDockedBody: (body) => set(state => {
        state.dockedBody = body || null;
      }),

      // ==========================================
      // AUDIO CONTROLS
      // ==========================================
      // Mute toggle is bound to the speaker icon in the top bar. Volume
      // setters are exposed for a future settings UI; today nothing
      // calls them, but they're here so the audio service has the API
      // it expects.
      toggleAudioMuted: () => set(state => {
        state.audio.muted = !state.audio.muted;
      }),
      setMasterVolume: (v) => set(state => {
        state.audio.masterVolume = Math.max(0, Math.min(1, v));
      }),
      setSfxVolume: (v) => set(state => {
        state.audio.sfxVolume = Math.max(0, Math.min(1, v));
      }),

      // UI scale -- clamped 0.8..2.0. Anything outside that range either
      // shrinks fonts past readable or pushes them so large the chrome
      // breaks. App.jsx watches this value and writes the matching root
      // font-size on every change.
      setUiScale: (v) => set(state => {
        state.uiScale = Math.max(0.8, Math.min(2.0, v));
      }),

      // Toolbar expand/collapse -- driven by the right-edge chevron in
      // the LeftToolbar. ContextPanel reads the same value so it shifts
      // its left anchor to clear the expanded labels.
      toggleToolbar: () => set(state => {
        state.toolbarExpanded = !state.toolbarExpanded;
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
        audio: state.audio,
        uiScale: state.uiScale,
        toolbarExpanded: state.toolbarExpanded,
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
