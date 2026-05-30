// GameFrame.jsx — The main UI chrome that wraps the game view
// Provides: top resource bar, left toolbar, bottom status bar
// The game views (SystemView/GalaxyFlightView) render as children in the full-screen area

import React, { useEffect, useState } from 'react';
import { useGameStore, useActiveShip } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';
import { fittingAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';
import { SystemMapWindow } from '@/components/system/SystemMapWindow';
import { ActiveTrainingIndicator } from '@/components/ui/ActiveTrainingIndicator';
import { ChatPanel } from '@/components/chat/ChatPanel';

// ============================================
// CONSTANTS
// ============================================

const TOOLBAR_BUTTONS = [
  { id: 'character', icon: '👤', label: 'Character', color: '#60a5fa' },
  { id: 'shipBuilder', icon: '🔧', label: 'Fitting', color: '#ff6622' },
  { id: 'fleet', icon: '🚀', label: 'Fleet', color: '#60a5fa' },
  { id: 'inventory', icon: '📦', label: 'Cargo', color: '#f59e0b' },
  { id: 'crafting', icon: '🔨', label: 'Craft', color: '#aa66ff' },
  { id: 'questLog', icon: '📋', label: 'Missions', color: '#22d3ee' },
  { id: 'galaxyMap', icon: '🌌', label: 'Galaxy', color: '#8844ff' },
  { id: 'research', icon: '🔬', label: 'Research', color: '#22c55e' },
];

// Planet button is appended dynamically when the player is docked.
const PLANET_BUTTON = { id: 'planetInteraction', icon: '🪐', label: 'Planet', color: '#22c55e' };

const EDGE = '#1a3050';
const BLUE = { pri: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8', dim: '#1e3a5f' };
const GOLD = { pri: '#f59e0b', light: '#fbbf24' };

// ============================================
// TOP RESOURCE BAR
// ============================================

const TopBar = () => {
  const credits = useGameStore(state => state.resources?.credits ?? 0);
  const fetchCredits = useGameStore(state => state.fetchCredits);
  const activeShip = useActiveShip();
  const ships = useGameStore(state => state.ships);
  const { user, logout } = useAuthStore();
  const [resetting, setResetting] = useState(false);
  const resetGame = useGameStore(state => state.resetGame);

  // HUD data (updated by SystemView game loop every 5 frames)
  const playerHull = useGameStore(state => state.playerHull);
  const playerMaxHull = useGameStore(state => state.playerMaxHull);
  const playerShield = useGameStore(state => state.playerShield);
  const playerMaxShield = useGameStore(state => state.playerMaxShield);
  const enemyCount = useGameStore(state => state.enemyCount);
  const autopilotTarget = useGameStore(state => state.autopilotTarget);

  // Settings window opens from the gear button in the top bar. The
  // legacy 🔊/🔇 mute button moved into the settings panel itself so
  // the top bar stays uncluttered and volume sliders + UI scale live
  // alongside the mute toggle.
  const settingsOpen = useGameStore(state => state.windows.settings?.open);
  const toggleWindow = useGameStore(state => state.toggleWindow);

  // Matches MAX_FLEET_SIZE in shipRenderer.js (the in-system formation
  // cap). Was stuck at 3 here while SystemView already rendered 5 -- so
  // the top-bar indicator under-counted the visible flying fleet.
  const MAX_FLEET = 5;
  // Top-bar HUD shows the *active* (flying) fleet, not stored ships.
  const fleetSize = (ships || []).filter(s => s.storage_body_id == null).length;

  useEffect(() => {
    fetchCredits();
    // Poll every 3s as a safety net so the top-bar credits stay in sync
    // even if a downstream refresh chain (vendor, combat) fails to fire.
    const interval = setInterval(fetchCredits, 3000);
    return () => clearInterval(interval);
  }, [fetchCredits]);

  const handleReset = async () => {
    if (!window.confirm('DEV: Wipe all ships, cargo, credits, and scan data? This cannot be undone.')) return;
    setResetting(true);
    try {
      await fittingAPI.resetAccount();
      resetGame();
    } catch (err) {
      alert('Reset failed: ' + err.message);
    } finally {
      setResetting(false);
    }
  };

  // Hull bar color by percentage
  const hullPct = playerMaxHull > 0 ? playerHull / playerMaxHull : 0;
  const hullColor = hullPct > 0.6 ? '#22c55e' : hullPct > 0.3 ? '#fbbf24' : '#ef4444';
  const hullGradient = hullPct > 0.6
    ? 'linear-gradient(90deg, #166534, #22c55e)'
    : hullPct > 0.3
    ? 'linear-gradient(90deg, #854d0e, #fbbf24)'
    : 'linear-gradient(90deg, #7f1d1d, #ef4444)';

  const shieldPct = playerMaxShield > 0 ? playerShield / playerMaxShield : 0;
  const hasShield = playerMaxShield > 0;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center"
      style={{
        height: 34,
        background: 'linear-gradient(180deg, rgba(8,16,32,0.97), rgba(6,12,24,0.92))',
        borderBottom: `1px solid ${EDGE}`,
        fontFamily: "'Rajdhani', sans-serif",
        padding: '0 10px',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-1.5 mr-3 h-full pr-3" style={{ borderRight: `1px solid ${EDGE}`, background: `linear-gradient(135deg, ${BLUE.pri}20, transparent)` }}>
        <div className="w-5 h-5 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${BLUE.pri}, ${BLUE.dark})`, clipPath: 'polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px)' }}>
          <span className="text-white text-[9px] font-black">★</span>
        </div>
        <span className="text-xs font-extrabold tracking-widest" style={{ color: BLUE.light }}>STAR SHIPPER</span>
      </div>

      {/* Credits + Fleet count */}
      <div className="flex items-center gap-0.5" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10 }}>
        <div className="flex items-center gap-1 px-2 h-5" style={{ borderRight: `1px solid ${EDGE}` }} title="Credits">
          <span style={{ fontSize: 11 }}>⬡</span>
          <span className="font-bold" style={{ color: GOLD.light }}>{credits.toLocaleString()}</span>
          <span style={{ color: '#3a4a5a', fontSize: 8 }}>CR</span>
        </div>
        <div className="flex items-center gap-1 px-2 h-5" style={{ borderRight: `1px solid ${EDGE}` }} title="Fleet size">
          <span style={{ fontSize: 11 }}>🚀</span>
          <span className="font-bold" style={{ color: BLUE.light }}>{fleetSize}</span>
          <span style={{ color: '#3a4a5a' }}>/{MAX_FLEET}</span>
        </div>
      </div>

      {/* Hull + Shield bars (from live combat data) */}
      <div className="flex items-center gap-3 ml-3" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9 }}>
        {/* Hull bar */}
        <div className="flex items-center gap-1.5" title={`Hull: ${playerHull}/${playerMaxHull}`}>
          <span style={{ color: hullColor, fontSize: 8 }}>■</span>
          <span style={{ color: '#3a4a5a', fontSize: 8 }}>HULL</span>
          <div className="overflow-hidden" style={{ width: 60, height: 5, background: '#0a1528', borderRadius: 2, border: `1px solid ${EDGE}` }}>
            <div className="h-full transition-all duration-200" style={{
              width: `${Math.max(0, Math.min(100, hullPct * 100))}%`,
              background: hullGradient,
            }} />
          </div>
          <span className="font-bold" style={{ color: hullColor, minWidth: 24, textAlign: 'right' }}>
            {playerHull}
          </span>
        </div>

        {/* Shield bar */}
        <div className="flex items-center gap-1.5" title={hasShield ? `Shield: ${playerShield}/${playerMaxShield}` : 'No shield fitted'}>
          <span style={{ color: hasShield ? '#818cf8' : '#3a4a5a', fontSize: 8 }}>◆</span>
          <span style={{ color: '#3a4a5a', fontSize: 8 }}>SHLD</span>
          <div className="overflow-hidden" style={{ width: 45, height: 5, background: '#0a1528', borderRadius: 2, border: `1px solid ${EDGE}` }}>
            {hasShield && (
              <div className="h-full transition-all duration-200" style={{
                width: `${Math.max(0, Math.min(100, shieldPct * 100))}%`,
                background: 'linear-gradient(90deg, #3730a3, #818cf8)',
              }} />
            )}
          </div>
          <span className="font-bold" style={{ color: hasShield ? '#818cf8' : '#3a4a5a', minWidth: 20, textAlign: 'right' }}>
            {hasShield ? playerShield : '—'}
          </span>
        </div>
      </div>

      {/* Status indicators (conditional) — fills any remaining space.
          Active training indicator sits first so it has a consistent
          spot regardless of whether the conditional indicators (enemies,
          autopilot) are visible. Clickable -> opens Skills & Research. */}
      <div className="flex items-center gap-3 flex-1 ml-3" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9 }}>
        <ActiveTrainingIndicator
          variant="compact"
          onOpenSkills={() => {
            playSound('button_click');
            useGameStore.getState().openWindow('research');
          }}
        />
        {enemyCount > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5" style={{
            background: 'rgba(127,29,29,0.35)',
            border: '1px solid rgba(239,68,68,0.5)',
            borderRadius: 2,
            color: '#fca5a5',
            animation: 'pulse 2s ease-in-out infinite',
          }}>
            <span>☠</span>
            <span className="font-bold">{enemyCount} HOSTILE{enemyCount !== 1 ? 'S' : ''}</span>
          </div>
        )}
        {autopilotTarget && (
          <div className="flex items-center gap-1 px-2 py-0.5" style={{
            background: `${BLUE.pri}15`,
            border: `1px solid ${BLUE.pri}44`,
            borderRadius: 2,
            color: BLUE.light,
          }}>
            <span style={{ color: BLUE.light }}>◈</span>
            <span className="font-bold">AP → {autopilotTarget.name}</span>
          </div>
        )}
      </div>

      {/* Right cluster: ship name, user, reset */}
      <div className="flex items-center gap-2" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9 }}>
        <div className="mx-1" style={{ width: 1, height: 18, background: EDGE }} />

        {/* Ship name */}
        <div className="px-2 py-0.5" style={{ borderLeft: `2px solid ${BLUE.dim}`, background: `rgba(12,26,51,0.4)` }}>
          <div className="text-[10px] font-bold" style={{ color: '#c8d6e5' }}>{activeShip?.name || 'No Ship'}</div>
          <div className="text-[7px]" style={{ color: '#3a5a6a' }}>{activeShip?.hull_name || ''}</div>
        </div>

        <div className="mx-1" style={{ width: 1, height: 18, background: EDGE }} />

        {/* User */}
        <span className="text-[9px] mr-1" style={{ color: '#5a6a7a' }}>{user?.username}</span>
        <button
          onClick={() => { playSound('button_click'); logout(); }}
          className="text-[9px] px-1.5 py-0.5 rounded hover:text-red-400 transition-colors"
          style={{ color: '#3a4a5a', border: `1px solid ${EDGE}` }}
          title="Sign Out"
        >✕</button>

        <div className="mx-1" style={{ width: 1, height: 18, background: EDGE }} />

        {/* Settings */}
        <button
          onClick={() => { playSound('button_click'); toggleWindow('settings'); }}
          className="text-[10px] px-1.5 py-0.5 rounded transition-colors ml-1"
          style={{
            color: settingsOpen ? BLUE.light : '#7a8a9a',
            border: `1px solid ${settingsOpen ? `${BLUE.pri}55` : EDGE}`,
            background: settingsOpen ? `${BLUE.pri}10` : 'transparent',
          }}
          title="Settings (audio, interface, ...)"
        >⚙️</button>

        <div className="mx-1" style={{ width: 1, height: 18, background: EDGE }} />

        {/* DEV Reset */}
        <button
          onClick={() => { playSound('button_click'); handleReset(); }}
          disabled={resetting}
          className="text-[8px] font-bold px-1.5 py-0.5 rounded hover:bg-red-900/50 transition-colors disabled:opacity-40"
          style={{ color: '#ef4444', border: '1px solid #ef444433' }}
          title="DEV: Reset account"
        >
          {resetting ? '...' : '⚠ RESET'}
        </button>
      </div>
    </div>
  );
};

// ============================================
// LEFT TOOLBAR
// ============================================

const CONTEXT_PANELS = ['character', 'fleet', 'inventory', 'crafting', 'questLog', 'planetInteraction'];
const MODALS = ['shipBuilder', 'galaxyMap'];

// Width of the toolbar in each state. Kept in sync with the ContextPanel
// left-anchor math (see ContextPanel.jsx -- imports nothing, just reads
// `toolbarExpanded` from the store and applies the same numbers).
const TOOLBAR_ICON_SIZE = 38;
const TOOLBAR_WIDTH_COLLAPSED = TOOLBAR_ICON_SIZE;       // icon-only
const TOOLBAR_WIDTH_EXPANDED  = 160;                     // icon + label

const LeftToolbar = () => {
  const windows = useGameStore(state => state.windows);
  const closeWindow = useGameStore(state => state.closeWindow);
  const openWindow = useGameStore(state => state.openWindow);
  const openContextPanel = useGameStore(state => state.openContextPanel);
  const dockedBody = useGameStore(state => state.dockedBody);
  const expanded = useGameStore(state => state.toolbarExpanded ?? true);
  const toggleToolbar = useGameStore(state => state.toggleToolbar);

  const handleClick = (id) => {
    playSound('button_click');
    const isCurrentlyOpen = windows[id]?.open && !windows[id]?.minimized;

    if (isCurrentlyOpen) {
      // Just close it
      closeWindow(id);
    } else if (CONTEXT_PANELS.includes(id)) {
      // Use the store action — it closes other context panels atomically
      openContextPanel(id);
    } else {
      // Modals (shipBuilder, galaxyMap) don't participate in the one-at-a-time rule
      openWindow(id);
    }
  };

  // Build the button list — append the Planet button only while docked
  const buttons = dockedBody ? [...TOOLBAR_BUTTONS, PLANET_BUTTON] : TOOLBAR_BUTTONS;
  const width = expanded ? TOOLBAR_WIDTH_EXPANDED : TOOLBAR_WIDTH_COLLAPSED;

  return (
    // Outer wrapper holds the button stack + the floating chevron so
    // the chevron can be vertically centered against the button column
    // without measuring its height.
    <div
      className="fixed left-1.5 z-40"
      style={{ top: 46, width, transition: 'width 0.18s ease' }}
    >
      <div className="flex flex-col gap-0.5">
        {buttons.map(btn => {
          const isOpen = windows[btn.id]?.open && !windows[btn.id]?.minimized;
          return (
            <button
              key={btn.id}
              onClick={() => handleClick(btn.id)}
              title={btn.label}
              className="transition-all"
              style={{
                width: '100%',
                height: TOOLBAR_ICON_SIZE,
                display: 'flex',
                alignItems: 'center',
                // Label-left / icon-right when expanded; just icon centered when collapsed.
                justifyContent: expanded ? 'space-between' : 'center',
                paddingLeft: expanded ? 10 : 0,
                paddingRight: expanded ? 8 : 0,
                background: isOpen
                  ? `linear-gradient(135deg, ${btn.color}25, ${btn.color}0a)`
                  : 'rgba(8,14,28,0.9)',
                border: `1px solid ${isOpen ? btn.color + '55' : EDGE}`,
                clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
                cursor: 'pointer',
                filter: isOpen ? `drop-shadow(0 0 6px ${btn.color}44)` : 'none',
              }}
            >
              {expanded && (
                <span style={{
                  fontSize: 11,
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  color: isOpen ? btn.color : '#a0b0c0',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  // ellipsis if a future button label ever overflows
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginRight: 8,
                }}>{btn.label}</span>
              )}
              <span style={{ fontSize: 16, lineHeight: 1 }}>{btn.icon}</span>
            </button>
          );
        })}
      </div>

      {/* Right-edge chevron -- vertically centered against the button
          column. Half-overlaps the toolbar so it reads as "the side
          handle." Clicking flips toolbarExpanded; the toolbar width
          animates and ContextPanel shifts to clear the new chrome. */}
      <button
        onClick={() => { playSound('button_click'); toggleToolbar(); }}
        title={expanded ? 'Collapse menu to icons' : 'Show menu labels'}
        style={{
          position: 'absolute',
          top: '50%',
          right: -10,
          transform: 'translateY(-50%)',
          width: 18,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(8,14,28,0.95)',
          border: `1px solid ${EDGE}`,
          borderRadius: 3,
          color: BLUE.light,
          fontSize: 10,
          fontFamily: "'Share Tech Mono', monospace",
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
        }}
      >{expanded ? '◀' : '▶'}</button>
    </div>
  );
};

// ============================================
// BOTTOM BAR
// ============================================

const BottomBar = () => {
  const viewMode = useGameStore(state => state.viewMode);
  const currentSystem = useGameStore(state => state.currentSystem);
  const gamePaused = useGameStore(state => state.gamePaused);
  const gameSpeed = useGameStore(state => state.gameSpeed);
  const togglePause = useGameStore(state => state.togglePause);
  const setGameSpeed = useGameStore(state => state.setGameSpeed);
  const shipSpeed = useGameStore(state => state.shipSpeed);
  const galaxyShipSpeed = useGameStore(state => state.galaxyShipSpeed);

  const speed = viewMode === 'galaxy' ? galaxyShipSpeed : shipSpeed;
  const systemName = currentSystem === 'sol' ? 'Sol System' : currentSystem;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2.5"
      style={{
        height: 32,
        background: 'linear-gradient(0deg, rgba(8,16,32,0.95), rgba(6,12,24,0.85))',
        borderTop: `1px solid ${EDGE}`,
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10,
      }}
    >
      {/* Speed readout */}
      <span style={{ color: '#3a4a5a' }}>
        SPD <span style={{ color: speed > 0 ? BLUE.light : '#3a4a5a' }}>{Math.round(speed)}</span>
      </span>

      <span style={{ color: '#0e1a2a' }}>│</span>

      {/* Pause / speed controls */}
      <button
        onClick={togglePause}
        className="transition-colors"
        style={{
          background: gamePaused ? `${GOLD.pri}20` : 'transparent',
          border: `1px solid ${gamePaused ? GOLD.pri + '44' : EDGE}`,
          color: gamePaused ? GOLD.light : '#3a4a5a',
          padding: '2px 7px',
          cursor: 'pointer',
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 10,
          borderRadius: 2,
        }}
      >
        {gamePaused ? '▶' : '⏸'}
      </button>
      {[1, 2, 3].map(s => (
        <button
          key={s}
          onClick={() => setGameSpeed(s)}
          className="transition-colors"
          style={{
            background: gameSpeed === s && !gamePaused ? `${BLUE.pri}18` : 'transparent',
            border: `1px solid ${gameSpeed === s && !gamePaused ? BLUE.dim : EDGE}`,
            color: gameSpeed === s && !gamePaused ? BLUE.light : '#3a4a5a',
            padding: '2px 7px',
            cursor: 'pointer',
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 10,
            borderRadius: 2,
          }}
        >
          {s}×
        </button>
      ))}

      <span style={{ color: '#0e1a2a' }}>│</span>

      {/* System name */}
      <div style={{ borderLeft: `2px solid ${GOLD.pri}33`, padding: '2px 12px', background: `${GOLD.pri}08` }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#d0dce8', letterSpacing: 1, fontFamily: "'Rajdhani', sans-serif" }}>
          {viewMode === 'galaxy' ? '⟡ Interstellar Space' : systemName}
        </span>
      </div>
    </div>
  );
};

// ============================================
// GAME FRAME (main export)
// ============================================

// SystemMapToggle -- standalone bottom-right button. Lives outside the
// LeftToolbar because the user wants it visually separated; it's the
// only persistent surface for the system map.
const SystemMapToggle = () => {
  const isOpen = useGameStore(state => state.windows.systemMap?.open);
  const toggleWindow = useGameStore(state => state.toggleWindow);
  return (
    <button
      onClick={() => { playSound('button_click'); toggleWindow('systemMap'); }}
      title={isOpen ? 'Hide System Map' : 'Show System Map'}
      className="fixed z-40 transition-all"
      style={{
        right: 8,
        bottom: 40,                       // clears the BottomBar (height ~32)
        width: 38,
        height: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isOpen ? `${BLUE.pri}25` : 'rgba(8,14,28,0.92)',
        border: `1px solid ${isOpen ? BLUE.pri : EDGE}`,
        borderRadius: 4,
        color: isOpen ? BLUE.light : '#7a8a9a',
        fontSize: 18,
        cursor: 'pointer',
      }}
    >
      🗺️
    </button>
  );
};

export const GameFrame = ({ children }) => {
  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: '#030610' }}>
      <TopBar />
      <LeftToolbar />
      <SystemMapWindow />
      <SystemMapToggle />
      <BottomBar />

      {/* Game content area — fills space between top and bottom bars */}
      <div className="absolute left-0 right-0" style={{ top: 34, bottom: 32 }}>
        {children}
      </div>

      {/* Chat panel — fixed bottom-right; collapsible. Always mounted
          when GameFrame is up (i.e. user is logged in), works in both
          SystemView and GalaxyFlightView. Self-disables when the
          presence/chat feature flag is off. */}
      <ChatPanel />
    </div>
  );
};

export default GameFrame;
