import React, { useEffect } from 'react';
import { Starfield } from '@/components/ui/Starfield';
import { ResourceBar } from '@/components/ui/ResourceBar';
import { Toolbar } from '@/components/ui/Toolbar';
import { WindowDock } from '@/components/ui/DraggableWindow';
import { ShipBuilderWindow } from '@/components/ship/ShipBuilderWindow';
import { AuthScreen } from '@/components/ui/AuthScreen';
import { useGameStore } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';

function App() {
  const windows = useGameStore(state => state.windows);
  const gameStarted = useGameStore(state => state.gameStarted);
  const startGame = useGameStore(state => state.startGame);
  const openWindow = useGameStore(state => state.openWindow);

  const { isLoggedIn, isLoading, user, checkSession, logout } = useAuthStore();

  // Check for existing session on load
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Loading screen
  if (isLoading) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-slate-950 font-display">
        <Starfield />
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-8 w-8 text-cyan-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-cyan-400 text-xl tracking-wider">INITIALIZING</span>
          </div>
        </div>
      </div>
    );
  }

  // Auth screen (not logged in)
  if (!isLoggedIn) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-slate-950 font-display">
        <Starfield />
        <AuthScreen />
      </div>
    );
  }

  // Start screen (logged in, game not started)
  if (!gameStarted) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-slate-950 font-display">
        <Starfield />
        
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          {/* Welcome message */}
          <div className="absolute top-6 right-6 flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/60 border border-cyan-500/20">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm text-cyan-300">{user?.username}</span>
            </div>
            <button
              onClick={logout}
              className="px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-600/30 text-slate-400 text-sm hover:text-red-400 hover:border-red-500/30 transition-colors"
            >
              Sign Out
            </button>
          </div>

          <h1
            className="text-6xl font-bold tracking-wider mb-4"
            style={{
              background: 'linear-gradient(135deg, #00d4ff 0%, #0080ff 50%, #8040ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            STAR SHIPPER
          </h1>
          <p className="text-xl text-cyan-400/70 mb-3">
            Build ships. Explore systems. Build an empire.
          </p>
          <p className="text-sm text-cyan-400/40 mb-12">
            Welcome back, Commander {user?.displayName || user?.username}
          </p>
          
          <button
            onClick={() => {
              startGame();
              openWindow('shipBuilder');
            }}
            className="px-8 py-4 rounded-lg bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 text-xl font-medium hover:bg-cyan-500/30 hover:border-cyan-400/50 transition-all hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/20"
          >
            Launch Game
          </button>

          <p className="mt-8 text-sm text-slate-500">
            Version 0.2.0 - Multiplayer Preview
          </p>
        </div>

        {/* Corner branding */}
        <div className="absolute bottom-4 right-4 text-cyan-500/30 text-sm font-medium tracking-widest">
          STAR SHIPPER
        </div>
      </div>
    );
  }

  // Main game
  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950 font-display">
      {/* Background */}
      <Starfield />

      {/* User info */}
      <div className="fixed top-4 right-4 flex items-center gap-2 z-40">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-cyan-500/20 backdrop-blur-sm">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-cyan-300">{user?.username}</span>
        </div>
        <button
          onClick={logout}
          className="px-2 py-1.5 rounded-lg bg-slate-900/80 border border-slate-600/30 text-slate-500 text-xs hover:text-red-400 hover:border-red-500/30 transition-colors backdrop-blur-sm"
          title="Sign Out"
        >
          ✕
        </button>
      </div>

      {/* HUD Elements */}
      <ResourceBar />
      <Toolbar />

      {/* Windows */}
      {windows.shipBuilder.open && <ShipBuilderWindow />}

      {/* Minimized windows dock */}
      <WindowDock />

      {/* Corner branding */}
      <div className="absolute bottom-4 left-4 text-cyan-500/30 text-sm font-medium tracking-widest z-10">
        STAR SHIPPER v0.2
      </div>
    </div>
  );
}

export default App;
