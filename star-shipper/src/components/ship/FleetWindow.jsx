import React, { useState, useEffect, useMemo } from 'react';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { fittingAPI } from '@/utils/api';
import { useGameStore } from '@/stores/gameStore';
import { getShipImage, MAX_FLEET_SIZE } from '@/utils/shipRenderer';

// ============================================
// SHIP THUMBNAIL (uses shared renderer)
// ============================================
const ShipThumb = ({ hullId, size = 48 }) => {
  const img = useMemo(() => getShipImage(hullId, size / 200), [hullId, size]);
  if (!img) return <div style={{width:size,height:size}} className="bg-slate-800 rounded" />;
  return <img src={img.dataUrl} style={{ imageRendering: 'pixelated', maxWidth: size, maxHeight: size }} />;
};

// ============================================
// SLOT TYPE COLORS
// ============================================
const SLOT_COLORS = {
  engine:'#ff6622', weapon:'#ff2244', shield:'#8844ff',
  cargo:'#ddaa22', utility:'#22ccaa', reactor:'#00ddff', mining:'#aa66ff',
};

// ============================================
// FLEET WINDOW
// ============================================
export const FleetWindow = () => {
  const [ships, setShips] = useState([]);
  const [activeShipId, setActiveShipId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const openWindow = useGameStore(state => state.openWindow);

  useEffect(() => { loadFleet(); }, []);

  const loadFleet = async () => {
    setLoading(true);
    try {
      const data = await fittingAPI.getFleet();
      setShips(data.ships || []);
      setActiveShipId(data.activeShipId);
    } catch (err) { console.error('Fleet load error:', err); }
    setLoading(false);
  };

  const flash = (type, text) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 3000); };

  const handleSetActive = async (shipId) => {
    try {
      const result = await fittingAPI.setActiveShip(shipId);
      if (result.success) {
        setActiveShipId(shipId);
        flash('success', `${result.ship_name} is now your active ship`);
      }
    } catch (err) { flash('error', err.message || 'Failed to set active ship'); }
  };

  const handleRename = async (shipId) => {
    if (!renameVal.trim()) { setRenamingId(null); return; }
    try {
      const result = await fittingAPI.renameShip(shipId, renameVal.trim());
      if (result.success) {
        setShips(prev => prev.map(s => s.id === shipId ? { ...s, name: result.name } : s));
        flash('success', `Renamed to "${result.name}"`);
      }
    } catch (err) { flash('error', err.message || 'Failed to rename'); }
    setRenamingId(null);
  };

  const startRename = (ship) => {
    setRenamingId(ship.id);
    setRenameVal(ship.name);
  };

  return (
    <ContextPanel windowId="fleet" title="Fleet" icon="🚀" accent="#60a5fa" width={420}>
      <div className="h-full flex flex-col gap-2 text-cyan-100">
        {message && (
          <div className={`text-xs px-3 py-1 rounded ${message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {message.text}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">
            {ships.length} ship{ships.length !== 1 ? 's' : ''} owned
            <span className="ml-2 text-cyan-600">Fleet: {Math.min(ships.length, MAX_FLEET_SIZE)}/{MAX_FLEET_SIZE}</span>
            <span className="ml-2 text-yellow-500">📦 {ships.reduce((sum, s) => sum + (s.total_cargo || s.computed_cargo || 0), 0)} cargo</span>
          </div>
          <button onClick={() => openWindow('shipBuilder')}
            className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Open Ship Fitting →
          </button>
        </div>

        {ships.length > MAX_FLEET_SIZE && (
          <div className="text-[9px] text-amber-600 bg-amber-900/10 rounded px-2 py-1 border border-amber-800/20">
            Only your first {MAX_FLEET_SIZE} ships fly in formation. Increase fleet capacity via the skill tree.
          </div>
        )}

        {/* Ship list */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="text-xs text-slate-500 animate-pulse py-4 text-center">Loading fleet...</div>
          ) : ships.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">No ships — buy a hull at a station vendor</div>
          ) : ships.map((ship, shipIdx) => {
            const isActive = ship.id === activeShipId;
            const fittedMods = ship.fitted_modules || {};
            const fittedCount = Object.keys(fittedMods).length;
            const totalSlots = (ship.hull_slots || []).length;
            // Active ship is always position 0, others fill 1,2,...
            const fleetPos = isActive ? 0 : (() => {
              const nonActiveIdx = ships.filter(s => s.id !== activeShipId).indexOf(ship);
              return nonActiveIdx + 1;
            })();
            const inFleet = fleetPos < MAX_FLEET_SIZE;

            return (
              <div key={ship.id}
                className={`rounded-lg p-3 border transition-all ${
                  isActive
                    ? 'bg-cyan-900/15 border-cyan-500/40'
                    : 'bg-slate-800/20 border-slate-700/30 hover:border-slate-600/50'
                }`}
              >
                <div className="flex gap-3">
                  {/* Ship thumbnail */}
                  <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 bg-slate-900/50 rounded border border-slate-700/30">
                    <ShipThumb hullId={ship.hull_type_id} size={48} />
                  </div>

                  {/* Ship info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {renamingId === ship.id ? (
                        <input
                          autoFocus
                          value={renameVal}
                          onChange={e => setRenameVal(e.target.value)}
                          onBlur={() => handleRename(ship.id)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRename(ship.id); if (e.key === 'Escape') setRenamingId(null); }}
                          className="text-sm font-medium bg-slate-800 border border-cyan-500/40 rounded px-1.5 py-0.5 text-slate-200 outline-none w-40"
                        />
                      ) : (
                        <span className="text-sm font-medium text-slate-200 cursor-pointer hover:text-cyan-300"
                          onClick={() => startRename(ship)}
                          title="Click to rename"
                        >
                          {ship.name}
                        </span>
                      )}
                      {isActive && (
                        <span className="text-[9px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-medium">ACTIVE</span>
                      )}
                      {inFleet && (
                        <span className="text-[9px] bg-green-500/15 text-green-500 px-1.5 py-0.5 rounded font-medium">
                          {isActive ? 'LEAD' : `WING ${fleetPos}`}
                        </span>
                      )}
                      {!inFleet && (
                        <span className="text-[9px] bg-slate-700/20 text-slate-600 px-1.5 py-0.5 rounded">DOCKED</span>
                      )}
                    </div>

                    <div className="text-[10px] text-slate-500 mb-1.5">
                      {ship.hull_name || 'Unknown'} • {ship.hull_class || ''} • {ship.status || 'docked'}
                    </div>

                    {/* Stats row */}
                    <div className="flex gap-3 text-[10px]">
                      <span className="text-slate-400">Hull <span className="text-slate-300">{ship.base_hull}</span></span>
                      <span className="text-slate-400">Spd <span className="text-slate-300">{ship.base_speed}</span></span>
                      <span className="text-slate-400">Mnv <span className="text-slate-300">{ship.base_maneuver}</span></span>
                      <span className="text-slate-400">Cargo <span className="text-yellow-400">{ship.total_cargo || ship.computed_cargo || 0}</span></span>
                    </div>

                    {/* Module slots summary */}
                    <div className="flex items-center gap-1 mt-1.5">
                      {(ship.hull_slots || []).map(slot => {
                        const filled = !!fittedMods[slot.id];
                        const color = SLOT_COLORS[slot.type] || '#888';
                        return (
                          <div key={slot.id} title={`${slot.type}${filled ? ' (fitted)' : ' (empty)'}`}
                            className="w-3 h-3 rounded-sm border"
                            style={{
                              backgroundColor: filled ? color + '44' : 'transparent',
                              borderColor: filled ? color + '88' : color + '33',
                            }}
                          />
                        );
                      })}
                      <span className="text-[9px] text-slate-500 ml-1">{fittedCount}/{totalSlots}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {!isActive && (
                      <button onClick={() => handleSetActive(ship.id)}
                        className="text-[10px] px-2 py-1 rounded bg-cyan-800/20 text-cyan-400 border border-cyan-600/30 hover:bg-cyan-800/40"
                      >
                        Set Active
                      </button>
                    )}
                    <button onClick={() => { openWindow('shipBuilder'); }}
                      className="text-[10px] px-2 py-1 rounded bg-slate-800/30 text-slate-400 border border-slate-700/30 hover:border-slate-600/50"
                    >
                      Fitting
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ContextPanel>
  );
};

export default FleetWindow;
