import React, { useEffect } from 'react';
import { DraggableWindow } from '@/components/ui/DraggableWindow';
import { useGameStore, useShipDesigns } from '@/stores/gameStore';

export const MyDesignsWindow = () => {
  const shipDesigns = useShipDesigns();
  const shipDesignsLoaded = useGameStore(state => state.shipDesignsLoaded);
  const fetchShipDesigns = useGameStore(state => state.fetchShipDesigns);
  const openShipBuilder = useGameStore(state => state.openShipBuilder);
  const deleteShipDesign = useGameStore(state => state.deleteShipDesign);
  const closeWindow = useGameStore(state => state.closeWindow);

  // Fetch designs if not loaded
  useEffect(() => {
    if (!shipDesignsLoaded) {
      fetchShipDesigns();
    }
  }, [shipDesignsLoaded, fetchShipDesigns]);

  const handleEdit = (designId) => {
    closeWindow('myDesigns');
    openShipBuilder(designId);
  };

  const handleDelete = async (designId, designName) => {
    if (window.confirm(`Delete "${designName}"? This cannot be undone.`)) {
      const result = await deleteShipDesign(designId);
      if (!result.success) {
        alert(result.error);
      }
    }
  };

  const handleNewDesign = () => {
    closeWindow('myDesigns');
    openShipBuilder(null);
  };

  return (
    <DraggableWindow
      windowId="myDesigns"
      title="My Ship Designs"
      initialWidth={400}
      initialHeight={500}
      minWidth={300}
      minHeight={300}
    >
      <div className="h-full flex flex-col gap-4 text-cyan-100">
        {/* New design button */}
        <button
          onClick={handleNewDesign}
          className="w-full py-3 rounded-lg bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 font-medium hover:bg-cyan-500/30 transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-xl">+</span>
          <span>New Design</span>
        </button>

        {/* Designs list */}
        <div className="flex-1 overflow-y-auto">
          {!shipDesignsLoaded ? (
            <div className="flex items-center justify-center h-32 text-slate-400">
              <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading...
            </div>
          ) : shipDesigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400">
              <p>No ship designs yet</p>
              <p className="text-sm text-slate-500 mt-1">Create your first design above!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {shipDesigns.map(design => (
                <div
                  key={design.id}
                  className="p-3 rounded-lg bg-slate-800/50 border border-slate-600/30 hover:border-cyan-500/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-cyan-100 truncate">{design.name}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span>{design.hull_size} cells</span>
                        <span>•</span>
                        <span>{design.total_crew} crew</span>
                        <span>•</span>
                        <span className={design.total_power <= 0 ? 'text-green-400' : 'text-red-400'}>
                          {design.total_power <= 0 ? '+' : ''}{Math.abs(design.total_power)} pwr
                        </span>
                      </div>
                      {!design.is_valid && (
                        <div className="mt-1 text-xs text-yellow-400">⚠ Incomplete design</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(design.id)}
                        className="px-2 py-1 rounded text-xs bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/30 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(design.id, design.name)}
                        className="px-2 py-1 rounded text-xs bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-500 border-t border-slate-700/50 pt-3">
          {shipDesigns.length} design{shipDesigns.length !== 1 ? 's' : ''} saved
        </div>
      </div>
    </DraggableWindow>
  );
};

export default MyDesignsWindow;
