import React, { useState, useCallback } from 'react';
import { useGameStore, useShipBuilder, useShipBuilderStats } from '@/stores/gameStore';
import { ROOM_TYPES, HULL_TEMPLATES, GRID_SIZE, CELL_SIZE } from '@/systems/gameData';

// ============================================
// SHIP GRID
// ============================================

export const ShipGrid = ({ selectedTool, selectedRoomType }) => {
  const shipBuilder = useShipBuilder();
  const { hullCells, rooms } = shipBuilder;
  
  const toggleHullCell = useGameStore(state => state.toggleHullCell);
  const addHullCell = useGameStore(state => state.addHullCell);
  const addRoom = useGameStore(state => state.addRoom);
  const removeRoom = useGameStore(state => state.removeRoom);

  const [hoveredCell, setHoveredCell] = useState(null);
  const [isDrawingHull, setIsDrawingHull] = useState(false);
  const [isDrawingRoom, setIsDrawingRoom] = useState(false);
  const [roomStart, setRoomStart] = useState(null);

  const getCellKey = (x, y) => `${x},${y}`;
  
  const isHullCell = useCallback((x, y) => {
    if (!(hullCells instanceof Set)) return false;
    return hullCells.has(getCellKey(x, y));
  }, [hullCells]);

  const getRoomAt = useCallback((x, y) => {
    return rooms.find(room =>
      x >= room.x && x < room.x + room.width &&
      y >= room.y && y < room.y + room.height
    );
  }, [rooms]);

  const canPlaceRoom = useCallback((startX, startY, endX, endY) => {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        if (!isHullCell(x, y)) return false;
        if (getRoomAt(x, y)) return false;
      }
    }
    return true;
  }, [isHullCell, getRoomAt]);

  const handleMouseDown = (x, y) => {
    if (selectedTool === 'hull') {
      setIsDrawingHull(true);
      toggleHullCell(x, y);
    } else if (selectedTool === 'room' && selectedRoomType && isHullCell(x, y) && !getRoomAt(x, y)) {
      setIsDrawingRoom(true);
      setRoomStart({ x, y });
    } else if (selectedTool === 'delete') {
      const room = getRoomAt(x, y);
      if (room) {
        removeRoom(room.id);
      }
    }
  };

  const handleMouseUp = (x, y) => {
    if (isDrawingRoom && roomStart && selectedRoomType) {
      const minX = Math.min(roomStart.x, x);
      const maxX = Math.max(roomStart.x, x);
      const minY = Math.min(roomStart.y, y);
      const maxY = Math.max(roomStart.y, y);
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const size = width * height;

      const roomType = ROOM_TYPES[selectedRoomType];

      if (
        canPlaceRoom(roomStart.x, roomStart.y, x, y) &&
        size >= roomType.minCells &&
        size <= roomType.maxCells
      ) {
        addRoom({
          type: selectedRoomType,
          x: minX,
          y: minY,
          width,
          height,
        });
      }
    }
    setIsDrawingHull(false);
    setIsDrawingRoom(false);
    setRoomStart(null);
  };

  const handleMouseEnter = (x, y) => {
    setHoveredCell({ x, y });
    if (isDrawingHull && selectedTool === 'hull') {
      addHullCell(x, y);
    }
  };

  // Calculate preview rectangle
  const getPreviewRect = () => {
    if (!isDrawingRoom || !roomStart || !hoveredCell) return null;
    return {
      minX: Math.min(roomStart.x, hoveredCell.x),
      maxX: Math.max(roomStart.x, hoveredCell.x),
      minY: Math.min(roomStart.y, hoveredCell.y),
      maxY: Math.max(roomStart.y, hoveredCell.y),
    };
  };

  const previewRect = getPreviewRect();
  const previewValid = previewRect && canPlaceRoom(previewRect.minX, previewRect.minY, previewRect.maxX, previewRect.maxY);

  // Convert hullCells Set to array for rendering
  const hullCellsArray = hullCells instanceof Set ? Array.from(hullCells) : [];

  return (
    <div className="relative inline-block select-none">
      <div
        className="relative"
        style={{
          width: GRID_SIZE * CELL_SIZE,
          height: GRID_SIZE * CELL_SIZE,
          background: 'radial-gradient(circle at center, rgba(30,40,60,0.5) 0%, rgba(10,15,25,0.8) 100%)',
        }}
      >
        {/* Grid lines */}
        <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
          <defs>
            <pattern id="grid" width={CELL_SIZE} height={CELL_SIZE} patternUnits="userSpaceOnUse">
              <path
                d={`M ${CELL_SIZE} 0 L 0 0 0 ${CELL_SIZE}`}
                fill="none"
                stroke="rgba(100,150,200,0.1)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Hull cells */}
        {hullCellsArray.map(key => {
          const [x, y] = key.split(',').map(Number);
          const room = getRoomAt(x, y);
          return (
            <div
              key={key}
              className="absolute transition-colors duration-100"
              style={{
                left: x * CELL_SIZE,
                top: y * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
                background: room ? `${room.color}33` : 'rgba(60,80,100,0.4)',
                borderTop: !isHullCell(x, y - 1) ? '2px solid rgba(100,180,255,0.6)' : 'none',
                borderBottom: !isHullCell(x, y + 1) ? '2px solid rgba(100,180,255,0.6)' : 'none',
                borderLeft: !isHullCell(x - 1, y) ? '2px solid rgba(100,180,255,0.6)' : 'none',
                borderRight: !isHullCell(x + 1, y) ? '2px solid rgba(100,180,255,0.6)' : 'none',
              }}
            />
          );
        })}

        {/* Rooms */}
        {rooms.map(room => (
          <div
            key={room.id}
            className="absolute pointer-events-none"
            style={{
              left: room.x * CELL_SIZE + 2,
              top: room.y * CELL_SIZE + 2,
              width: room.width * CELL_SIZE - 4,
              height: room.height * CELL_SIZE - 4,
              border: `2px solid ${room.color}`,
              borderRadius: 4,
              background: `linear-gradient(135deg, ${room.color}22 0%, ${room.color}44 100%)`,
              boxShadow: `inset 0 0 20px ${room.color}33, 0 0 10px ${room.color}22`,
            }}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl mb-1" style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))' }}>
                {room.icon}
              </span>
              <span className="text-xs font-medium text-white/80 text-center px-1" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                {room.name}
              </span>
            </div>

            {/* Power indicator */}
            <div
              className="absolute top-1 left-1 text-xs font-bold"
              style={{ color: room.basePower > 0 ? '#4ade80' : '#fbbf24' }}
            >
              {room.basePower > 0 ? '+' : ''}{room.basePower}⚡
            </div>

            {/* Crew indicator */}
            <div className="absolute top-1 right-1 flex gap-0.5">
              {Array.from({ length: Math.min(room.baseCrewSlots, 4) }).map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-green-400/60" />
              ))}
            </div>
          </div>
        ))}

        {/* Room preview */}
        {previewRect && selectedRoomType && (
          <div
            className="absolute pointer-events-none transition-all duration-75"
            style={{
              left: previewRect.minX * CELL_SIZE,
              top: previewRect.minY * CELL_SIZE,
              width: (previewRect.maxX - previewRect.minX + 1) * CELL_SIZE,
              height: (previewRect.maxY - previewRect.minY + 1) * CELL_SIZE,
              background: previewValid ? `${ROOM_TYPES[selectedRoomType].color}33` : 'rgba(255,50,50,0.2)',
              border: `2px dashed ${previewValid ? ROOM_TYPES[selectedRoomType].color : '#ff5555'}`,
              borderRadius: 4,
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl opacity-50">{ROOM_TYPES[selectedRoomType].icon}</span>
            </div>
          </div>
        )}

        {/* Interactive overlay */}
        {Array.from({ length: GRID_SIZE }).map((_, y) =>
          Array.from({ length: GRID_SIZE }).map((_, x) => (
            <div
              key={`${x},${y}`}
              className="absolute cursor-pointer"
              style={{
                left: x * CELL_SIZE,
                top: y * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
              }}
              onMouseDown={() => handleMouseDown(x, y)}
              onMouseUp={() => handleMouseUp(x, y)}
              onMouseEnter={() => handleMouseEnter(x, y)}
              onMouseLeave={() => setHoveredCell(null)}
            >
              {hoveredCell?.x === x && hoveredCell?.y === y && selectedTool === 'hull' && (
                <div className="absolute inset-1 rounded bg-cyan-400/30 border border-cyan-400/50" />
              )}
            </div>
          ))
        )}

        {/* Direction indicator */}
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-cyan-400/60 text-xs">
          <span>◀ PORT</span>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2 L15 18 L10 14 L5 18 Z" />
          </svg>
          <span>FORE ▲</span>
          <span className="ml-4">STARBOARD ▶</span>
        </div>
      </div>
    </div>
  );
};

// ============================================
// TOOL PALETTE
// ============================================

export const ToolPalette = ({ selectedTool, setSelectedTool, selectedRoomType, setSelectedRoomType }) => {
  const loadHullTemplate = useGameStore(state => state.loadHullTemplate);
  const clearHull = useGameStore(state => state.clearHull);

  return (
    <div className="flex flex-col gap-4">
      {/* Tools */}
      <div>
        <div className="text-xs text-cyan-400/70 uppercase tracking-wider mb-2">Tools</div>
        <div className="flex gap-2">
          {[
            { id: 'hull', name: 'Hull', icon: '⬜' },
            { id: 'room', name: 'Room', icon: '🏠' },
            { id: 'delete', name: 'Delete', icon: '🗑️' },
          ].map(tool => (
            <button
              key={tool.id}
              onClick={() => setSelectedTool(tool.id)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded transition-all ${
                selectedTool === tool.id
                  ? 'bg-cyan-500/30 border border-cyan-400/50 text-cyan-100'
                  : 'bg-slate-800/50 border border-slate-600/30 text-slate-400 hover:border-cyan-500/30'
              }`}
            >
              <span className="text-lg">{tool.icon}</span>
              <span className="text-xs">{tool.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Room types */}
      {selectedTool === 'room' && (
        <div>
          <div className="text-xs text-cyan-400/70 uppercase tracking-wider mb-2">Room Type</div>
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-2">
            {Object.values(ROOM_TYPES).map(room => (
              <button
                key={room.id}
                onClick={() => setSelectedRoomType(room.id)}
                className={`flex items-start gap-2 p-2 rounded text-left transition-all ${
                  selectedRoomType === room.id
                    ? 'bg-opacity-30 border-opacity-50'
                    : 'bg-slate-800/50 border-slate-600/30 hover:border-opacity-50'
                }`}
                style={{
                  background: selectedRoomType === room.id ? `${room.color}22` : undefined,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: selectedRoomType === room.id ? room.color : 'rgba(71,85,105,0.3)',
                }}
              >
                <span className="text-xl">{room.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-cyan-100 truncate">{room.name}</div>
                  <div className="text-xs text-slate-400">{room.minCells}-{room.maxCells} cells</div>
                  <div
                    className="text-xs mt-1"
                    style={{ color: room.basePower > 0 ? '#4ade80' : '#fbbf24' }}
                  >
                    {room.basePower > 0 ? '+' : ''}{room.basePower} power
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hull templates */}
      {selectedTool === 'hull' && (
        <div>
          <div className="text-xs text-cyan-400/70 uppercase tracking-wider mb-2">Hull Templates</div>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-2">
            {Object.values(HULL_TEMPLATES).map(template => (
              <button
                key={template.id}
                onClick={() => loadHullTemplate(template.cells)}
                className="flex items-center gap-3 p-2 rounded bg-slate-800/50 border border-slate-600/30 hover:border-cyan-500/30 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded bg-slate-700/50 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="rgba(100,180,255,0.5)">
                    {template.id === 'scout' && <path d="M16 4 L24 20 L20 28 L12 28 L8 20 Z" />}
                    {template.id === 'shuttle' && <path d="M12 4 L20 4 L22 28 L10 28 Z" />}
                    {template.id === 'freighter' && <path d="M8 6 L24 6 L26 26 L6 26 Z" />}
                    {template.id === 'frigate' && <path d="M16 2 L26 12 L26 24 L22 30 L10 30 L6 24 L6 12 Z" />}
                    {template.id === 'cruiser' && <path d="M16 2 L28 10 L28 22 L24 30 L8 30 L4 22 L4 10 Z" />}
                    {template.id === 'carrier' && <path d="M16 2 L30 8 L30 24 L26 30 L6 30 L2 24 L2 8 Z" />}
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-cyan-100">{template.name}</div>
                  <div className="text-xs text-slate-400">{template.description}</div>
                </div>
              </button>
            ))}
            <button
              onClick={clearHull}
              className="flex items-center gap-3 p-2 rounded bg-red-900/20 border border-red-500/30 hover:border-red-400/50 transition-colors text-left text-red-400"
            >
              <div className="w-10 h-10 rounded bg-red-900/30 flex items-center justify-center text-xl">
                🗑️
              </div>
              <div>
                <div className="text-sm font-medium">Clear Hull</div>
                <div className="text-xs text-red-400/70">Remove all cells and rooms</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// SHIP STATS PANEL
// ============================================

export const ShipStatsPanel = () => {
  const stats = useShipBuilderStats();

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-cyan-400/70 uppercase tracking-wider">Ship Statistics</div>

      {/* Main stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-2 rounded bg-slate-800/50 border border-slate-600/20">
          <div className="text-xs text-slate-400">Hull Size</div>
          <div className="text-xl font-bold text-cyan-300">{stats.hullSize}</div>
          <div className="text-xs text-slate-500">cells</div>
        </div>
        <div className="p-2 rounded bg-slate-800/50 border border-slate-600/20">
          <div className="text-xs text-slate-400">Rooms</div>
          <div className="text-xl font-bold text-cyan-300">{stats.roomCount}</div>
          <div className="text-xs text-slate-500">installed</div>
        </div>
        <div className="p-2 rounded bg-slate-800/50 border border-slate-600/20">
          <div className="text-xs text-slate-400">Power</div>
          <div className={`text-xl font-bold ${stats.totalPower <= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.totalPower <= 0 ? '+' : ''}{Math.abs(stats.totalPower)}
          </div>
          <div className="text-xs text-slate-500">{stats.totalPower <= 0 ? 'surplus' : 'deficit'}</div>
        </div>
        <div className="p-2 rounded bg-slate-800/50 border border-slate-600/20">
          <div className="text-xs text-slate-400">Crew Cap</div>
          <div className="text-xl font-bold text-cyan-300">{stats.totalCrew}</div>
          <div className="text-xs text-slate-500">max crew</div>
        </div>
      </div>

      {/* Cargo */}
      {stats.totalCargo > 0 && (
        <div className="p-2 rounded bg-slate-800/50 border border-slate-600/20">
          <div className="text-xs text-slate-400">Cargo Capacity</div>
          <div className="text-lg font-bold text-yellow-400">{stats.totalCargo}</div>
        </div>
      )}

      {/* Warnings */}
      {stats.warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {stats.warnings.map((warning, i) => (
            <div
              key={i}
              className="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs"
            >
              ⚠️ {warning}
            </div>
          ))}
        </div>
      )}

      {/* Valid indicator */}
      {stats.isValid && (
        <div className="p-2 rounded bg-green-500/10 border border-green-500/30 text-green-400 text-xs">
          ✓ Ship design is valid and can be built
        </div>
      )}
    </div>
  );
};

export default ShipGrid;
