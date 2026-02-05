import React from 'react';
import { Starfield } from '@/components/ui/Starfield';
import { ResourceBar } from '@/components/ui/ResourceBar';
import { Toolbar } from '@/components/ui/Toolbar';
import { WindowDock } from '@/components/ui/DraggableWindow';
import { ShipBuilderWindow } from '@/components/ship/ShipBuilderWindow';
import { useGameStore } from '@/stores/gameStore';

function App() {
  const windows = useGameStore(state => state.windows);
  const gameStarted = useGameStore(state => state.gameStarted);
  const startGame = useGameStore(state => state.startGame);
  const openWindow = useGameStore(state => state.openWindow);

  // Start screen
  if (!gameStarted) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-slate-950 font-display">
        <Starfield />
        
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          <h1 className="text-6xl font-bold text-cyan-100 tracking-wider mb-4">
            STAR SHIPPER
          </h1>
          <p className="text-xl text-cyan-400/70 mb-12">
            Build ships. Explore systems. Build an empire.
          </p>
          
          <button
            onClick={() => {
              startGame();
              openWindow('shipBuilder');
            }}
            className="px-8 py-4 rounded-lg bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 text-xl font-medium hover:bg-cyan-500/30 hover:border-cyan-400/50 transition-all hover:scale-105"
          >
            Start New Game
          </button>

          <p className="mt-8 text-sm text-slate-500">
            Version 0.1.0 - Ship Builder Preview
          </p>
        </div>

        {/* Corner branding */}
        <div className="absolute bottom-4 right-4 text-cyan-500/30 text-sm font-medium tracking-widest">
          STAR SHIPPER
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950 font-display">
      {/* Background */}
      <Starfield />

      {/* HUD Elements */}
      <ResourceBar />
      <Toolbar />

      {/* Windows */}
      {windows.shipBuilder.open && <ShipBuilderWindow />}

      {/* Minimized windows dock */}
      <WindowDock />

      {/* Corner branding */}
      <div className="absolute bottom-4 left-4 text-cyan-500/30 text-sm font-medium tracking-widest z-10">
        STAR SHIPPER v0.1
      </div>
    </div>
  );
}

export default App;
