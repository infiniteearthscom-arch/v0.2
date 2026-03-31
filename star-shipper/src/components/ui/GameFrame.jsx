// GameFrame.jsx — The main UI chrome that wraps the game view
// Provides: top resource bar, left toolbar, bottom status bar
// The game views (SystemView/GalaxyFlightView) render as children in the full-screen area

import React, { useEffect, useState } from 'react';
import { useGameStore, useActiveShip } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';
import { fittingAPI } from '@/utils/api';

// ============================================
// CONSTANTS
// ============================================

const TOOLBAR_BUTTONS = [
  { id: 'shipBuilder', icon: '🔧', label: 'Fitting', color: '#ff6622' },
  { id: 'fleet', icon: '🚀', label: 'Fleet', color: '#60a5fa' },
  { id: 'navigation', icon: '🧭', label: 'Nav', color: '#60a5fa' },
  { id: 'inventory', icon: '📦', label: 'Cargo', color: '#f59e0b' },
  { id: 'crafting', icon: '🔨', label: 'Craft', color: '#aa66ff' },
  { id: 'questLog', icon: '📋', label: 'Missions', color: '#22d3ee' },
  { id: 'galaxyMap', icon: '🌌', label: 'Galaxy', color: '#8844ff' },
  { id: 'research', icon: '🔬', label: 'Research', color: '#22c55e' },
];

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
  const { user, logout } = useAuthStore();
  const [resetting, setResetting] = useState(false);
  const resetGame = useGameStore(state => state.resetGame);

  useEffect(() => {
    fetchCredits();
    const interval = setInterval(fetchCredits, 15000);
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

      {/* Resources */}
      <div className="flex items-center gap-0.5 flex-1" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10 }}>
        <div className="flex items-center gap-1 px-2 h-5" style={{ borderRight: `1px solid ${EDGE}` }} title="Credits">
          <span style={{ fontSize: 11 }}>⬡</span>
          <span className="font-bold" style={{ color: GOLD.light }}>{credits.toLocaleString()}</span>
          <span style={{ color: '#3a4a5a', fontSize: 8 }}>CR</span>
        </div>
        <div className="flex items-center gap-1 px-2 h-5" style={{ borderRight: `1px solid ${EDGE}` }} title="Fleet">
          <span style={{ fontSize: 11 }}>🚀</span>
          <span className="font-bold" style={{ color: BLUE.light }}>1</span>
          <span style={{ color: '#3a4a5a' }}>/8</span>
        </div>
      </div>

      {/* Ship + hull/shield */}
      <div className="flex items-center gap-2" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9 }}>
        {/* Hull bar */}
        <div className="flex items-center gap-1">
          <span style={{ color: '#22c55e', fontSize: 7 }}>■</span>
          <div className="overflow-hidden" style={{ width: 50, height: 4, background: '#0a1528', borderRadius: 2, border: `1px solid ${EDGE}` }}>
            <div className="h-full" style={{ width: '100%', background: 'linear-gradient(90deg, #166534, #22c55e)', borderRadius: 1 }} />
          </div>
          <span className="font-bold" style={{ color: '#22c55e' }}>
            {activeShip?.base_hull || '—'}
          </span>
        </div>
        {/* Shield bar */}
        <div className="flex items-center gap-1">
          <span style={{ color: '#818cf8', fontSize: 7 }}>◆</span>
          <div style={{ width: 35, height: 4, background: '#0a1528', borderRadius: 2, border: `1px solid ${EDGE}` }} />
          <span style={{ color: '#3a4a5a' }}>—</span>
        </div>

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
          onClick={logout}
          className="text-[9px] px-1.5 py-0.5 rounded hover:text-red-400 transition-colors"
          style={{ color: '#3a4a5a', border: `1px solid ${EDGE}` }}
          title="Sign Out"
        >✕</button>

        <div className="mx-1" style={{ width: 1, height: 18, background: EDGE }} />

        {/* DEV Reset */}
        <button
          onClick={handleReset}
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

const CONTEXT_PANELS = ['fleet', 'inventory', 'crafting', 'questLog', 'navigation'];
const MODALS = ['shipBuilder', 'galaxyMap'];

const LeftToolbar = () => {
  const windows = useGameStore(state => state.windows);
  const toggleWindow = useGameStore(state => state.toggleWindow);
  const closeWindow = useGameStore(state => state.closeWindow);
  const openWindow = useGameStore(state => state.openWindow);

  const handleClick = (id) => {
    const isCurrentlyOpen = windows[id]?.open && !windows[id]?.minimized;

    if (isCurrentlyOpen) {
      // Just close it
      closeWindow(id);
    } else {
      // If it's a context panel, close any other open context panels first
      if (CONTEXT_PANELS.includes(id)) {
        CONTEXT_PANELS.forEach(panelId => {
          if (panelId !== id && windows[panelId]?.open) {
            closeWindow(panelId);
          }
        });
      }
      openWindow(id);
    }
  };

  return (
    <div className="fixed left-1.5 z-40 flex flex-col gap-0.5" style={{ top: 46 }}>
      {TOOLBAR_BUTTONS.map(btn => {
        const isOpen = windows[btn.id]?.open && !windows[btn.id]?.minimized;
        return (
          <button
            key={btn.id}
            onClick={() => handleClick(btn.id)}
            title={btn.label}
            className="flex items-center justify-center transition-all"
            style={{
              width: 38,
              height: 38,
              background: isOpen
                ? `linear-gradient(135deg, ${btn.color}25, ${btn.color}0a)`
                : 'rgba(8,14,28,0.9)',
              border: `1px solid ${isOpen ? btn.color + '55' : EDGE}`,
              clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
              cursor: 'pointer',
              fontSize: 16,
              filter: isOpen ? `drop-shadow(0 0 6px ${btn.color}44)` : 'none',
            }}
          >
            {btn.icon}
          </button>
        );
      })}
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

export const GameFrame = ({ children }) => {
  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: '#030610' }}>
      <TopBar />
      <LeftToolbar />
      <BottomBar />

      {/* Game content area — fills space between top and bottom bars */}
      <div className="absolute left-0 right-0" style={{ top: 34, bottom: 32 }}>
        {children}
      </div>
    </div>
  );
};

export default GameFrame;
