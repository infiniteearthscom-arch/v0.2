import React, { useState } from 'react';
import { DraggableWindow } from '@/components/ui/DraggableWindow';
import { ShipGrid, ToolPalette, ShipStatsPanel } from '@/components/ship/ShipGrid';
import { useGameStore, useShipBuilder, useShipBuilderStats } from '@/stores/gameStore';

export const ShipBuilderWindow = () => {
  const [selectedTool, setSelectedTool] = useState('hull');
  const [selectedRoomType, setSelectedRoomType] = useState('cockpit');

  const shipBuilder = useShipBuilder();
  const stats = useShipBuilderStats();
  const setShipName = useGameStore(state => state.setShipName);
  const saveShip = useGameStore(state => state.saveShip);
  const closeWindow = useGameStore(state => state.closeWindow);

  const handleSave = () => {
    saveShip();
  };

  return (
    <DraggableWindow
      windowId="shipBuilder"
      title="Ship Builder"
      initialWidth={900}
      initialHeight={700}
      minWidth={700}
      minHeight={500}
    >
      <div className="h-full flex flex-col gap-4 text-cyan-100">
        {/* Header with ship name */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={shipBuilder.shipName}
              onChange={(e) => setShipName(e.target.value)}
              className="bg-slate-800/50 border border-slate-600/30 rounded px-3 py-1.5 text-cyan-100 text-lg font-medium focus:border-cyan-500/50 focus:outline-none"
              placeholder="Ship Name"
            />
            {shipBuilder.editingShipId && (
              <span className="text-xs text-slate-500">Editing existing design</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!stats.isValid}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                stats.isValid
                  ? 'bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 hover:bg-cyan-500/30'
                  : 'bg-slate-700/30 border border-slate-600/20 text-slate-500 cursor-not-allowed'
              }`}
            >
              Save Design
            </button>
            <button
              onClick={handleSave}
              disabled={!stats.isValid}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                stats.isValid
                  ? 'bg-green-500/20 border border-green-400/30 text-green-300 hover:bg-green-500/30'
                  : 'bg-slate-700/30 border border-slate-600/20 text-slate-500 cursor-not-allowed'
              }`}
            >
              Build Ship →
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left panel - Tools */}
          <div className="w-56 flex-shrink-0 overflow-y-auto">
            <ToolPalette
              selectedTool={selectedTool}
              setSelectedTool={setSelectedTool}
              selectedRoomType={selectedRoomType}
              setSelectedRoomType={setSelectedRoomType}
            />
          </div>

          {/* Center - Grid */}
          <div className="flex-1 overflow-auto flex items-start justify-center pt-8">
            <ShipGrid selectedTool={selectedTool} selectedRoomType={selectedRoomType} />
          </div>

          {/* Right panel - Stats */}
          <div className="w-48 flex-shrink-0 overflow-y-auto">
            <ShipStatsPanel />
          </div>
        </div>

        {/* Footer instructions */}
        <div className="text-center text-sm text-slate-400 border-t border-slate-700/50 pt-3">
          {selectedTool === 'hull' && 'Click and drag to draw hull cells. Use templates for quick start.'}
          {selectedTool === 'room' && 'Click and drag inside hull to place rooms. Must fit within hull.'}
          {selectedTool === 'delete' && 'Click on rooms to remove them.'}
        </div>
      </div>
    </DraggableWindow>
  );
};

export default ShipBuilderWindow;
