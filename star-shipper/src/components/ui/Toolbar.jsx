import React from 'react';
import { useGameStore } from '@/stores/gameStore';

export const Toolbar = () => {
  const toggleWindow = useGameStore(state => state.toggleWindow);
  const windows = useGameStore(state => state.windows);
  const gamePaused = useGameStore(state => state.gamePaused);
  const togglePause = useGameStore(state => state.togglePause);
  const gameSpeed = useGameStore(state => state.gameSpeed);
  const setGameSpeed = useGameStore(state => state.setGameSpeed);

  const buttons = [
    { id: 'fleet', label: 'Fleet', icon: '🚀' },
    { id: 'shipBuilder', label: 'Ship Fitting', icon: '🔧' },
    { id: 'navigation', label: 'Navigation', icon: '🧭' },
    { id: 'galaxyMap', label: 'Galaxy Map', icon: '🌌' },
    { id: 'crafting', label: 'Crafting', icon: '🔨' },
    { id: 'inventory', label: 'Cargo', icon: '📦' },
    { id: 'research', label: 'Research', icon: '🔬' },
    { id: 'questLog', label: 'Quest Log', icon: '📜' },
  ];

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-40">
      {/* Speed controls */}
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900/80 border border-cyan-500/20 backdrop-blur-sm">
        <button
          onClick={togglePause}
          className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
            gamePaused
              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-400/30'
              : 'bg-slate-700/50 text-slate-400 hover:text-cyan-300'
          }`}
          title={gamePaused ? 'Resume' : 'Pause'}
        >
          {gamePaused ? '▶' : '⏸'}
        </button>
        {[1, 2, 3].map(speed => (
          <button
            key={speed}
            onClick={() => setGameSpeed(speed)}
            className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold transition-colors ${
              gameSpeed === speed && !gamePaused
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/30'
                : 'bg-slate-700/50 text-slate-400 hover:text-cyan-300'
            }`}
            title={`Speed ${speed}x`}
          >
            {speed}×
          </button>
        ))}
      </div>

      {/* Main buttons */}
      <div className="flex flex-col gap-1 px-2 py-2 rounded-lg bg-slate-900/80 border border-cyan-500/20 backdrop-blur-sm">
        {buttons.map(btn => {
          const isOpen = windows[btn.id]?.open && !windows[btn.id]?.minimized;
          return (
            <button
              key={btn.id}
              onClick={() => toggleWindow(btn.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded border transition-all text-sm ${
                isOpen
                  ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-100'
                  : 'bg-slate-700/30 border-transparent hover:bg-cyan-500/20 hover:border-cyan-400/30 text-slate-300 hover:text-cyan-100'
              }`}
              title={btn.label}
            >
              <span className="text-lg">{btn.icon}</span>
              <span className="hidden lg:inline">{btn.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Toolbar;
