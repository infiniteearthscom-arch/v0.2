import React, { useEffect } from 'react';
import { Starfield } from '@/components/ui/Starfield';
import { GameFrame } from '@/components/ui/GameFrame';
import { ShipBuilderWindow } from '@/components/ship/ShipBuilderWindow';
import { FleetWindow } from '@/components/ship/FleetWindow';
import { InventoryWindow } from '@/components/ui/InventoryWindow';
import { NavigationWindow } from '@/components/ui/NavigationWindow';
import { CraftingWindow } from '@/components/ui/CraftingWindow';
import { GalaxyMapWindow } from '@/components/ui/GalaxyMapWindow';
import { GalaxyFlightView } from '@/components/galaxy/GalaxyFlightView';
import { SystemView } from '@/components/system/SystemView';
import { AuthScreen } from '@/components/ui/AuthScreen';
import { useGameStore } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';
import { QuestLogWindow } from '@/components/ui/QuestLogWindow';
import { CharacterPanel } from '@/components/ui/CharacterPanel';
import { TooltipProvider } from '@/components/ui/TooltipProvider';

// ============================================
// QUEST COMPLETION TOAST
// ============================================
const QuestToast = () => {
  const notification = useGameStore(state => state.questNotification);
  const [visible, setVisible] = React.useState(false);
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    if (notification) {
      setData(notification);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const t = setTimeout(() => setData(null), 500);
      return () => clearTimeout(t);
    }
  }, [notification]);

  if (!data) return null;

  return (
    <div
      className="fixed top-12 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
      style={{
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-20px)',
      }}
    >
      <div className="px-5 py-3 rounded-xl border shadow-2xl backdrop-blur-md"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 40, 28, 0.95), rgba(10, 25, 40, 0.95))',
          borderColor: 'rgba(74, 222, 128, 0.4)',
          boxShadow: '0 0 30px rgba(74, 222, 128, 0.15), 0 8px 32px rgba(0,0,0,0.4)',
          minWidth: 260,
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-green-400 text-sm">✓</span>
          <span className="text-green-400 text-xs font-bold uppercase tracking-wider">Quest Complete</span>
        </div>
        <div className="text-sm font-medium text-slate-100">{data.title}</div>
        {data.rewards && (
          <div className="flex flex-wrap gap-2 mt-2">
            {data.rewards.credits > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-900/40 border border-yellow-600/30 text-yellow-400">
                +{data.rewards.credits.toLocaleString()} cr
              </span>
            )}
            {data.rewards.items?.map((item, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-cyan-900/40 border border-cyan-600/30 text-cyan-400">
                +{item.quantity}x {item.item_id?.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
        {data.triggeredQuests?.length > 0 && (
          <div className="text-[10px] text-cyan-400/60 mt-1.5">New quest unlocked!</div>
        )}
      </div>
    </div>
  );
};

// ============================================
// APP
// ============================================
function App() {
  const windows = useGameStore(state => state.windows);
  const gameStarted = useGameStore(state => state.gameStarted);
  const startGame = useGameStore(state => state.startGame);
  const openWindow = useGameStore(state => state.openWindow);
  const fetchShips = useGameStore(state => state.fetchShips);
  const fetchQuests = useGameStore(state => state.fetchQuests);
  const setResources = useGameStore(state => state.setResources);
  const viewMode = useGameStore(state => state.viewMode);

  const { isLoggedIn, isLoading, user, resources, checkSession, logout } = useAuthStore();

  useEffect(() => { checkSession(); }, [checkSession]);

  useEffect(() => {
    if (isLoggedIn && resources) {
      setResources(resources);
      fetchShips();
      fetchQuests();
    }
  }, [isLoggedIn, resources, setResources, fetchShips, fetchQuests]);

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

  // Auth screen
  if (!isLoggedIn) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-slate-950 font-display">
        <Starfield />
        <AuthScreen />
      </div>
    );
  }

  // Start screen
  if (!gameStarted) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-slate-950 font-display">
        <Starfield />
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          <div className="absolute top-6 right-6 flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/60 border border-cyan-500/20">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm text-cyan-300">{user?.username}</span>
            </div>
            <button onClick={logout} className="px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-600/30 text-slate-400 text-sm hover:text-red-400 hover:border-red-500/30 transition-colors">
              Sign Out
            </button>
          </div>
          <h1 className="text-6xl font-bold tracking-wider mb-4" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #8b5cf6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            STAR SHIPPER
          </h1>
          <p className="text-xl text-blue-400/70 mb-3">Build ships. Explore systems. Build an empire.</p>
          <p className="text-sm text-blue-400/40 mb-12">Welcome back, Commander {user?.displayName || user?.username}</p>
          <button
            onClick={() => { startGame(); openWindow('shipBuilder'); openWindow('questLog'); openWindow('navigation'); }}
            className="px-8 py-4 rounded-lg bg-blue-500/20 border border-blue-400/30 text-blue-100 text-xl font-medium hover:bg-blue-500/30 hover:border-blue-400/50 transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20"
          >
            Launch Game
          </button>
          <p className="mt-8 text-sm text-slate-500">Version 0.2.0</p>
        </div>
      </div>
    );
  }

  // ============================================
  // MAIN GAME
  // ============================================
  return (
    <TooltipProvider>
      <GameFrame>
        {/* Game views — render full-screen between top bar and bottom bar */}
        {viewMode === 'system' && <SystemView />}
        {viewMode === 'galaxy' && <GalaxyFlightView />}

        {/* Floating windows — still using DraggableWindow temporarily */}
        {/* These will be converted to overlay panels in a future session */}
        {windows.shipBuilder?.open && <ShipBuilderWindow />}
        {windows.character?.open && <CharacterPanel />}
        {windows.fleet?.open && <FleetWindow />}
        {windows.inventory?.open && <InventoryWindow />}
        {windows.navigation?.open && viewMode === 'system' && <NavigationWindow />}
        {windows.crafting?.open && <CraftingWindow />}
        {windows.galaxyMap?.open && <GalaxyMapWindow />}
        {windows.questLog?.open && <QuestLogWindow />}

        {/* Quest completion toast */}
        <QuestToast />
      </GameFrame>
    </TooltipProvider>
  );
}

export default App;
