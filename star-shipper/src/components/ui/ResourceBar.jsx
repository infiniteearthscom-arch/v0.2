import React, { useEffect } from 'react';
import { useGameStore, useActiveShip } from '@/stores/gameStore';

export const ResourceBar = () => {
  const credits = useGameStore(state => state.resources.credits);
  const fetchCredits = useGameStore(state => state.fetchCredits);
  const activeShip = useActiveShip();

  // Fetch credits on mount and periodically
  useEffect(() => {
    fetchCredits();
    const interval = setInterval(fetchCredits, 15000);
    return () => clearInterval(interval);
  }, [fetchCredits]);

  return (
    <div className="fixed top-3 left-3 flex items-center gap-3 z-40">
      {/* Credits */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-yellow-500/20 backdrop-blur-sm">
        <span className="text-yellow-500 text-sm">💰</span>
        <span className="text-sm font-medium text-yellow-400">{credits.toLocaleString()}</span>
        <span className="text-[10px] text-yellow-600">cr</span>
      </div>

      {/* Active ship indicator */}
      {activeShip && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-cyan-500/20 backdrop-blur-sm">
          <span className="text-cyan-500 text-sm">🚀</span>
          <span className="text-xs text-slate-300">{activeShip.name}</span>
          {activeShip.hull_name && (
            <span className="text-[10px] text-slate-500">({activeShip.hull_name})</span>
          )}
        </div>
      )}
    </div>
  );
};

export default ResourceBar;
