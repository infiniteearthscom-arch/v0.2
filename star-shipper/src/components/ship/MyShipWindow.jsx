import React, { useEffect, useState } from 'react';
import { DraggableWindow } from '@/components/ui/DraggableWindow';
import { useGameStore, useShips, useShipDesigns } from '@/stores/gameStore';

export const MyShipWindow = () => {
  const ships = useShips();
  const shipDesigns = useShipDesigns();
  const shipsLoaded = useGameStore(state => state.shipsLoaded);
  const shipDesignsLoaded = useGameStore(state => state.shipDesignsLoaded);
  const fetchShips = useGameStore(state => state.fetchShips);
  const fetchShipDesigns = useGameStore(state => state.fetchShipDesigns);
  const buildShipFromDesign = useGameStore(state => state.buildShipFromDesign);
  const scrapShip = useGameStore(state => state.scrapShip);
  const openWindow = useGameStore(state => state.openWindow);
  const closeWindow = useGameStore(state => state.closeWindow);

  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState(null);

  // Fetch data if not loaded
  useEffect(() => {
    if (!shipsLoaded) fetchShips();
    if (!shipDesignsLoaded) fetchShipDesigns();
  }, [shipsLoaded, shipDesignsLoaded, fetchShips, fetchShipDesigns]);

  // Get the player's ship (limit to one for now)
  const myShip = ships.length > 0 ? ships[0] : null;

  // Get valid designs that can be built
  const validDesigns = shipDesigns.filter(d => d.is_valid);

  const handleBuild = async (designId) => {
    setBuilding(true);
    setMessage(null);
    const design = shipDesigns.find(d => d.id === designId);
    const result = await buildShipFromDesign(designId, design?.name);
    setBuilding(false);
    
    if (result.success) {
      setMessage({ type: 'success', text: `${result.ship.name} built!` });
    } else {
      setMessage({ type: 'error', text: result.error });
    }
  };

  const handleScrap = async () => {
    if (!myShip) return;
    if (window.confirm(`Scrap "${myShip.name}"? You'll recover some resources.`)) {
      const result = await scrapShip(myShip.id);
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: `Scrapped! Recovered ${result.scrapValue.credits} credits, ${result.scrapValue.metals} metals` 
        });
      } else {
        setMessage({ type: 'error', text: result.error });
      }
    }
  };

  const handleOpenDesigns = () => {
    openWindow('myDesigns');
  };

  return (
    <DraggableWindow
      windowId="myShip"
      title="My Ship"
      initialWidth={400}
      initialHeight={450}
      minWidth={300}
      minHeight={300}
    >
      <div className="h-full flex flex-col gap-4 text-cyan-100">
        {/* Message display */}
        {message && (
          <div className={`px-3 py-2 rounded-lg text-sm ${
            message.type === 'success' 
              ? 'bg-green-500/20 border border-green-500/30 text-green-400' 
              : 'bg-red-500/20 border border-red-500/30 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {!shipsLoaded || !shipDesignsLoaded ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading...
          </div>
        ) : myShip ? (
          /* Show current ship */
          <div className="flex-1 flex flex-col">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-cyan-500/30">
              {/* Ship name and status */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xl font-bold text-cyan-100">{myShip.name}</h3>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  myShip.status === 'docked' ? 'bg-green-500/20 text-green-400' :
                  myShip.status === 'flying' ? 'bg-cyan-500/20 text-cyan-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {myShip.status?.toUpperCase() || 'DOCKED'}
                </span>
              </div>

              {/* Ship stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-2 rounded bg-slate-900/50">
                  <div className="text-xs text-slate-400">Health</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-all" 
                        style={{ width: `${myShip.health || 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-green-400">{myShip.health || 100}%</span>
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-900/50">
                  <div className="text-xs text-slate-400">Fuel</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 transition-all" 
                        style={{ width: `${myShip.fuel || 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-orange-400">{myShip.fuel || 100}%</span>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="p-2 rounded bg-slate-900/50 mb-4">
                <div className="text-xs text-slate-400">Location</div>
                <div className="text-sm text-cyan-300">
                  {myShip.location_type === 'hub' ? '🌍 Sol System Hub' : myShip.location_type}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  className="flex-1 py-2 rounded bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 text-sm font-medium hover:bg-cyan-500/30 transition-colors"
                  onClick={() => {
                    closeWindow('myShip');
                    openWindow('systemView');
                  }}
                >
                  🚀 Launch
                </button>
                <button
                  onClick={handleScrap}
                  className="px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm hover:bg-red-500/20 transition-colors"
                  title="Scrap ship for resources"
                >
                  🗑️
                </button>
              </div>
            </div>

            <div className="mt-auto pt-4 text-center text-xs text-slate-500">
              Ship docked and ready for launch
            </div>
          </div>
        ) : (
          /* No ship - show build options */
          <div className="flex-1 flex flex-col">
            <div className="text-center mb-4">
              <p className="text-slate-400">You don't have a ship yet!</p>
              <p className="text-sm text-slate-500">Build one from your designs.</p>
            </div>

            {validDesigns.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <p className="text-slate-400 mb-4">No valid designs to build from.</p>
                <button
                  onClick={handleOpenDesigns}
                  className="px-4 py-2 rounded bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/30 transition-colors"
                >
                  Create a Design
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="text-xs text-cyan-400/70 uppercase tracking-wider mb-2">
                  Available Designs
                </div>
                <div className="flex flex-col gap-2">
                  {validDesigns.map(design => (
                    <div
                      key={design.id}
                      className="p-3 rounded-lg bg-slate-800/50 border border-slate-600/30"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-cyan-100">{design.name}</h4>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {design.hull_size} cells • {design.total_crew} crew
                          </div>
                        </div>
                        <button
                          onClick={() => handleBuild(design.id)}
                          disabled={building}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                            building
                              ? 'bg-slate-700/30 text-slate-500 cursor-not-allowed'
                              : 'bg-green-500/20 border border-green-400/30 text-green-300 hover:bg-green-500/30'
                          }`}
                        >
                          {building ? '...' : 'Build'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DraggableWindow>
  );
};

export default MyShipWindow;
