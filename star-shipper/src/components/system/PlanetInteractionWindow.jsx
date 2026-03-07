// Planet Interaction Window
// Shows when docked at a planet/station - allows scanning, trading, mining, etc.

import React, { useState, useEffect, useCallback } from 'react';
import { DraggableWindow } from '@/components/ui/DraggableWindow';
import { useGameStore } from '@/stores/gameStore';
import { getQualityTier, CATEGORY_INFO, RARITY_INFO } from '@/data/resources';
import { resourcesAPI, harvesterAPI, fittingAPI } from '@/utils/api';

// ============================================
// SUB-COMPONENTS (Scan Tab - unchanged)
// ============================================

const SurveyStatus = ({ status }) => {
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className={`flex items-center gap-1 ${status.orbital_scanned ? 'text-green-400' : 'text-slate-500'}`}>
        <span>{status.orbital_scanned ? '✓' : '○'}</span>
        <span>Orbital</span>
      </div>
      <div className={`flex items-center gap-1 ${status.ground_scanned ? 'text-green-400' : 'text-slate-500'}`}>
        <span>{status.ground_scanned ? '✓' : '○'}</span>
        <span>Ground</span>
      </div>
    </div>
  );
};

const OrbitalScanResults = ({ resources }) => {
  if (!resources || resources.length === 0) {
    return <p className="text-slate-400 text-sm">No resources detected</p>;
  }
  
  return (
    <div className="space-y-2">
      {resources.map((resource, idx) => (
        <div 
          key={idx}
          className="flex items-center justify-between bg-slate-800/50 rounded px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{CATEGORY_INFO[resource.category]?.icon || '📦'}</span>
            <span 
              className="font-medium"
              style={{ color: RARITY_INFO[resource.rarity]?.color || '#fff' }}
            >
              {resource.name}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-400">{resource.deposit_count}x</span>
            <span className={`px-2 py-0.5 rounded text-xs ${
              resource.abundance === 'Abundant' ? 'bg-green-900/50 text-green-400' :
              resource.abundance === 'Moderate' ? 'bg-yellow-900/50 text-yellow-400' :
              'bg-red-900/50 text-red-400'
            }`}>
              {resource.abundance}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

const GroundScanResults = ({ deposits }) => {
  if (!deposits || deposits.length === 0) {
    return <p className="text-slate-400 text-sm">No deposit data available</p>;
  }
  
  return (
    <div className="space-y-3">
      {deposits.map((deposit) => (
        <div 
          key={deposit.id}
          className="bg-slate-800/50 rounded p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-sm">#{deposit.slot_number}</span>
              <span 
                className="font-medium"
                style={{ color: RARITY_INFO[deposit.rarity]?.color || '#fff' }}
              >
                {deposit.resource_name}
              </span>
            </div>
            <span 
              className="text-sm px-2 py-0.5 rounded"
              style={{ 
                backgroundColor: deposit.estimated_tier.color + '22',
                color: deposit.estimated_tier.color 
              }}
            >
              {deposit.estimated_tier.name}
            </span>
          </div>
          
          <div className="text-sm text-slate-400 mb-2">
            Quantity: ~{deposit.quantity_range.min}-{deposit.quantity_range.max} units
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(deposit.stat_ranges).map(([stat, range]) => (
              <div key={stat} className="flex items-center justify-between bg-slate-900/50 rounded px-2 py-1">
                <span className="text-slate-500 capitalize">{stat}</span>
                <span className="text-slate-300">{range.min}-{range.max}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const HazardWarning = ({ hazards }) => {
  if (!hazards || hazards.length === 0) return null;
  
  return (
    <div className="bg-red-900/30 border border-red-500/50 rounded p-3 mt-3">
      <div className="flex items-center gap-2 text-red-400 font-medium mb-1">
        <span>⚠️</span>
        <span>Hazards Detected</span>
      </div>
      <ul className="text-sm text-red-300 space-y-1">
        {hazards.map((hazard, idx) => (
          <li key={idx}>• {hazard}</li>
        ))}
      </ul>
    </div>
  );
};

// ============================================
// SHARED COMPONENTS
// ============================================

const StatBar = ({ label, value, max = 100 }) => {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 80 ? '#aa44ff' : pct >= 60 ? '#4488ff' : pct >= 40 ? '#44ff44' : pct >= 20 ? '#ffffff' : '#888888';
  
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500 capitalize w-16">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-slate-400 w-7 text-right">{value}</span>
    </div>
  );
};

const CargoBar = ({ capacity, used }) => {
  const pct = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#eab308' : '#22d3ee';
  
  return (
    <div className="bg-slate-800/40 rounded p-2 mb-3">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>📦 Cargo</span>
        <span style={{ color }}>{used} / {capacity}</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
};

// ============================================
// MINE TAB - Deposit Card
// ============================================

const DepositCard = ({ deposit, isMyActiveDeposit, hasActiveSession, onStartHarvest, loading }) => {
  const isOccupiedByOther = deposit.is_occupied && !deposit.occupied_by_me;
  const isDepleted = deposit.quantity_remaining != null && deposit.quantity_remaining <= 0;
  const canHarvest = !isDepleted && !isOccupiedByOther && !hasActiveSession && deposit.stats;
  
  const tier = deposit.stats 
    ? getQualityTier(deposit.stats.purity, deposit.stats.stability, deposit.stats.potency, deposit.stats.density)
    : null;
  
  return (
    <div className={`rounded-lg p-3 border transition-colors ${
      isMyActiveDeposit ? 'bg-amber-900/20 border-amber-500/50' :
      isDepleted ? 'bg-slate-800/20 border-slate-700/30 opacity-50' :
      isOccupiedByOther ? 'bg-slate-800/20 border-red-500/30' :
      'bg-slate-800/40 border-slate-700/50'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs font-mono">#{deposit.slot_number}</span>
          <span className="text-lg">{CATEGORY_INFO[deposit.category]?.icon || '📦'}</span>
          <span 
            className="font-medium text-sm"
            style={{ color: RARITY_INFO[deposit.rarity]?.color || '#fff' }}
          >
            {deposit.resource_name}
          </span>
        </div>
        {tier && (
          <span 
            className="text-xs px-2 py-0.5 rounded"
            style={{ backgroundColor: tier.color + '22', color: tier.color }}
          >
            {tier.name}
          </span>
        )}
      </div>
      
      {deposit.quantity_remaining != null && (
        <div className="mb-2">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Remaining</span>
            <span>{deposit.quantity_remaining} / {deposit.quantity_total}</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-cyan-500 rounded-full transition-all"
              style={{ width: `${(deposit.quantity_remaining / deposit.quantity_total) * 100}%` }}
            />
          </div>
        </div>
      )}
      
      {deposit.stats && (
        <div className="space-y-1 mb-3">
          <StatBar label="Purity" value={deposit.stats.purity} />
          <StatBar label="Stability" value={deposit.stats.stability} />
          <StatBar label="Potency" value={deposit.stats.potency} />
          <StatBar label="Density" value={deposit.stats.density} />
        </div>
      )}
      
      {isMyActiveDeposit ? (
        <div className="text-amber-400 text-xs font-medium flex items-center gap-1">
          <span className="animate-pulse">⛏️</span>
          <span>Currently mining this deposit</span>
        </div>
      ) : isDepleted ? (
        <div className="text-slate-500 text-xs">Depleted — respawns in ~24h</div>
      ) : isOccupiedByOther ? (
        <div className="text-red-400 text-xs">Occupied by another player</div>
      ) : !deposit.stats ? (
        <div className="text-slate-500 text-xs">Ground scan required</div>
      ) : hasActiveSession ? (
        <div className="text-slate-500 text-xs">Stop current session to mine here</div>
      ) : (
        <button
          onClick={() => onStartHarvest(deposit.id)}
          disabled={!canHarvest || loading}
          className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
            canHarvest && !loading
              ? 'bg-amber-600 hover:bg-amber-500 text-white cursor-pointer'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {loading ? 'Starting...' : '⛏️ Start Mining (50/hr)'}
        </button>
      )}
    </div>
  );
};

// ============================================
// MINE TAB - Active Session Panel
// ============================================

const ActiveHarvestPanel = ({ session, cargo, onCollect, onStop, collecting, stopping }) => {
  const [elapsed, setElapsed] = useState('');
  const [estimatedPending, setEstimatedPending] = useState(Math.max(0, session.pending_units || 0));
  
  useEffect(() => {
    const update = () => {
      const start = new Date(session.started_at);
      const now = new Date();
      const diff = Math.max(0, now - start);
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsed(`${hours}h ${mins}m ${secs}s`);
      
      const lastCalc = new Date(session.last_calculated_at);
      const sinceLast = Math.max(0, (now - lastCalc)) / 3600000;
      const rawPending = Math.max(0, Math.floor(sinceLast * session.harvest_rate));
      const cappedByDeposit = Math.min(rawPending, Math.max(0, session.deposit_remaining));
      // Convert volume remaining to units that fit (density-based)
      const density = session.stats?.density || 50;
      const volPerUnit = Math.max(density, 1) / 100;
      const unitsThatFit = cargo ? Math.floor(Math.max(0, cargo.remaining) / volPerUnit) : cappedByDeposit;
      const cappedByCargo = Math.min(cappedByDeposit, unitsThatFit);
      setEstimatedPending(Math.max(0, cappedByCargo));
    };
    
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [session, cargo]);
  
  const tier = session.quality_tier;
  
  return (
    <div className="bg-amber-900/15 border border-amber-500/30 rounded-lg p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="animate-pulse text-lg">⛏️</span>
          <span className="font-medium text-amber-400">Mining Active</span>
        </div>
        <span className="text-xs text-slate-400">{session.body_name}</span>
      </div>
      
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{CATEGORY_INFO[session.category]?.icon || '📦'}</span>
        <span 
          className="font-medium"
          style={{ color: RARITY_INFO[session.rarity]?.color || '#fff' }}
        >
          {session.resource_name}
        </span>
        {tier && (
          <span 
            className="text-xs px-2 py-0.5 rounded ml-auto"
            style={{ backgroundColor: tier.color + '22', color: tier.color }}
          >
            {tier.name}
          </span>
        )}
      </div>
      
      {session.stats && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
          <StatBar label="Purity" value={session.stats.purity} />
          <StatBar label="Stability" value={session.stats.stability} />
          <StatBar label="Potency" value={session.stats.potency} />
          <StatBar label="Density" value={session.stats.density} />
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="bg-slate-800/50 rounded px-2 py-1.5">
          <div className="text-slate-500">Elapsed</div>
          <div className="text-slate-200 font-mono">{elapsed}</div>
        </div>
        <div className="bg-slate-800/50 rounded px-2 py-1.5">
          <div className="text-slate-500">Rate</div>
          <div className="text-slate-200">{session.harvest_rate}/hr</div>
        </div>
        <div className="bg-slate-800/50 rounded px-2 py-1.5">
          <div className="text-slate-500">Total Mined</div>
          <div className="text-slate-200">{session.units_harvested}</div>
        </div>
        <div className="bg-amber-900/30 rounded px-2 py-1.5">
          <div className="text-amber-500">Ready</div>
          <div className="text-amber-300 font-medium">~{estimatedPending}</div>
        </div>
      </div>
      
      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Deposit</span>
          <span>{session.deposit_remaining} left</span>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-cyan-500 rounded-full"
            style={{ width: `${(session.deposit_remaining / session.deposit_total) * 100}%` }}
          />
        </div>
      </div>
      
      <div className="flex gap-2">
        <button
          onClick={onCollect}
          disabled={collecting || estimatedPending <= 0}
          className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
            !collecting && estimatedPending > 0
              ? 'bg-green-600 hover:bg-green-500 text-white'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {collecting ? 'Collecting...' : `📦 Collect (~${estimatedPending})`}
        </button>
        <button
          onClick={onStop}
          disabled={stopping}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            !stopping
              ? 'bg-red-700 hover:bg-red-600 text-white'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {stopping ? '...' : '⏹ Stop'}
        </button>
      </div>
    </div>
  );
};

// ============================================
// MINE TAB
// ============================================

// ============================================
// HARVESTERS TAB
// ============================================

const HARVESTER_ICONS = {
  basic_harvester: '⚙️',
  advanced_harvester: '🔧',
  industrial_harvester: '🏭',
};

const HARVESTER_COLORS = {
  basic_harvester: '#888',
  advanced_harvester: '#4488ff',
  industrial_harvester: '#aa44ff',
};

const HarvesterSlotCard = ({ slot, harvester, onDeploy, onRefuel, onCollect, onAssignDeposit, onRemove, availableDeposits }) => {
  const [showDepositPicker, setShowDepositPicker] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fuelDragOver, setFuelDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data?.item_type === 'item' && data?.item_id?.includes('harvester')) {
        onDeploy(slot, data);
      }
    } catch (err) {}
  };

  const handleFuelDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFuelDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data?.item_type === 'item' && data?.item_id === 'fuel_cell') {
        onRefuel(harvester.id, data.stack_id);
      }
    } catch (err) {}
  };

  if (!harvester) {
    // Empty slot
    return (
      <div
        className="rounded-lg p-3 transition-all"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: dragOver ? '2px dashed #ffaa00' : '2px dashed #334155',
          background: dragOver ? '#ffaa0008' : '#0f172a33',
          minHeight: 80,
        }}
      >
        <div className="flex items-center justify-center h-full text-slate-600 text-xs">
          <div className="text-center">
            <div className="text-lg mb-1">📭</div>
            <div>Slot {slot + 1} — Drag harvester here</div>
          </div>
        </div>
      </div>
    );
  }

  // Deployed harvester
  const icon = HARVESTER_ICONS[harvester.harvester_type] || '⚙️';
  const color = HARVESTER_COLORS[harvester.harvester_type] || '#888';
  const fuelPct = harvester.fuel_remaining_hours > 0
    ? Math.min(100, (harvester.fuel_remaining_hours / 6) * 100)
    : 0;
  const hopperPct = harvester.storage_capacity > 0
    ? Math.min(100, (harvester.hopper_quantity / harvester.storage_capacity) * 100)
    : 0;

  const statusColor = harvester.status === 'active' ? '#44ff44'
    : harvester.status === 'full' ? '#eab308'
    : '#666';
  const statusLabel = harvester.status === 'active' ? 'Mining'
    : harvester.status === 'full' ? 'Hopper Full'
    : 'Idle';

  return (
    <div
      className="rounded-lg p-3 border transition-all"
      style={{ borderColor: `${color}44`, background: `${color}08` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <div>
            <div className="text-xs font-medium text-slate-200">
              {harvester.harvester_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </div>
            <div className="text-[10px] text-slate-500">
              Slot {slot + 1} • {harvester.harvest_rate}/hr • {harvester.storage_capacity} cap
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: statusColor }} />
          <span className="text-[10px]" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      {/* Deposit assignment */}
      <div className="mb-2">
        {harvester.deposit_id ? (
          <div className="flex items-center justify-between bg-slate-800/50 rounded px-2 py-1">
            <div className="text-xs">
              <span className="text-slate-400">Mining: </span>
              <span className="text-cyan-300">{harvester.resource_name}</span>
              <span className="text-slate-500"> (Slot {harvester.deposit_slot})</span>
            </div>
            <button
              onClick={() => setShowDepositPicker(true)}
              className="text-[10px] text-slate-500 hover:text-slate-300"
            >
              Change
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDepositPicker(true)}
            className="w-full py-1.5 rounded text-xs bg-cyan-900/30 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/50"
          >
            Assign Deposit
          </button>
        )}
      </div>

      {/* Deposit picker */}
      {showDepositPicker && (
        <div className="mb-2 bg-slate-900/80 border border-slate-600 rounded p-2 space-y-1">
          <div className="text-[10px] text-slate-500 mb-1">Available Deposits:</div>
          {availableDeposits.length === 0 ? (
            <div className="text-[10px] text-slate-600">No available deposits</div>
          ) : (
            availableDeposits.map(d => (
              <button
                key={d.id}
                onClick={() => { onAssignDeposit(harvester.id, d.id); setShowDepositPicker(false); }}
                className="w-full text-left px-2 py-1 rounded text-xs bg-slate-800/50 hover:bg-slate-700/50 flex justify-between"
              >
                <span className="text-slate-300">{d.resource_name} (Slot {d.slot_number})</span>
                <span className="text-slate-500">{d.quantity_remaining} left</span>
              </button>
            ))
          )}
          <button
            onClick={() => setShowDepositPicker(false)}
            className="text-[10px] text-slate-500 hover:text-slate-300 mt-1"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Fuel bar */}
      <div
        className="mb-2 rounded px-2 py-1.5"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setFuelDragOver(true); }}
        onDragLeave={() => setFuelDragOver(false)}
        onDrop={handleFuelDrop}
        style={{
          border: fuelDragOver ? '1px solid #eab308' : '1px solid #1e293b',
          background: fuelDragOver ? '#eab30808' : '#0f172a44',
        }}
      >
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-slate-500">🔋 Fuel</span>
          <span className={harvester.fuel_remaining_hours > 0 ? 'text-yellow-400' : 'text-red-400'}>
            {harvester.fuel_remaining_hours > 0 ? `${harvester.fuel_remaining_hours.toFixed(1)}h` : 'Empty — drag fuel cell'}
          </span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{
            width: `${fuelPct}%`,
            backgroundColor: fuelPct > 30 ? '#eab308' : '#ef4444',
          }} />
        </div>
      </div>

      {/* Hopper bar */}
      <div className="mb-2 rounded px-2 py-1.5 border border-slate-700/50 bg-slate-900/30">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-slate-500">📦 Hopper</span>
          <span className={hopperPct >= 100 ? 'text-red-400' : 'text-cyan-400'}>
            {harvester.hopper_quantity}/{harvester.storage_capacity}
          </span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{
            width: `${hopperPct}%`,
            backgroundColor: hopperPct >= 90 ? '#ef4444' : hopperPct >= 70 ? '#eab308' : '#22d3ee',
          }} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5">
        <button
          onClick={() => onCollect(harvester.id)}
          disabled={harvester.hopper_quantity <= 0}
          className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
            harvester.hopper_quantity > 0
              ? 'bg-green-700 hover:bg-green-600 text-white'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
        >
          Collect ({harvester.hopper_quantity})
        </button>
        <button
          onClick={() => onRemove(harvester.id)}
          disabled={harvester.hopper_quantity > 0}
          className={`px-2 py-1.5 rounded text-xs transition-colors ${
            harvester.hopper_quantity <= 0
              ? 'bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-500/30'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
          title={harvester.hopper_quantity > 0 ? 'Collect hopper first' : 'Remove harvester'}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

const HarvestersTab = ({ body }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await harvesterAPI.getPlanetHarvesters(effectiveBodyId);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [effectiveBodyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 10s
  useEffect(() => {
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDeploy = async (slotIndex, dragData) => {
    setError(null);
    setMessage(null);
    try {
      await harvesterAPI.deploy(effectiveBodyId, slotIndex, dragData.stack_id, null);
      setMessage('Harvester deployed! Assign a deposit to start mining.');
      await fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssignDeposit = async (harvesterId, depositId) => {
    setError(null);
    try {
      await harvesterAPI.assignDeposit(harvesterId, depositId);
      setMessage('Deposit assigned.');
      await fetchData();
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRefuel = async (harvesterId, fuelItemId) => {
    setError(null);
    try {
      const result = await harvesterAPI.refuel(harvesterId, fuelItemId);
      setMessage(`Added ${result.fuel_added_hours.toFixed(1)}h fuel.`);
      await fetchData();
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCollect = async (harvesterId) => {
    setError(null);
    try {
      const result = await harvesterAPI.collect(harvesterId);
      setMessage(result.message);
      await fetchData();
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemove = async (harvesterId) => {
    setError(null);
    try {
      await harvesterAPI.remove(harvesterId);
      setMessage('Harvester returned to cargo.');
      await fetchData();
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading && !data) {
    return <div className="text-center py-8 text-slate-400 text-sm animate-pulse">Loading harvesters...</div>;
  }

  if (!data) return null;

  const totalSlots = data.harvester_slots || 0;
  const harvesters = data.harvesters || [];
  const harvesterMap = {};
  harvesters.forEach(h => { harvesterMap[h.slot_index] = h; });

  return (
    <div>
      {/* Planet surface header */}
      <div className="rounded-lg p-3 mb-3 relative overflow-hidden" style={{
        background: 'linear-gradient(180deg, #1a1a2e 0%, #2d1b0e 60%, #4a3520 100%)',
        border: '1px solid #4a352044',
      }}>
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 30% 80%, #ffaa0022 0%, transparent 50%), radial-gradient(circle at 70% 60%, #44ff4411 0%, transparent 40%)',
        }} />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-amber-300">{data.planet_name} Surface</div>
            <div className="text-[10px] text-slate-400">{totalSlots} harvester slots available</div>
          </div>
          <div className="text-xs text-slate-500">
            {harvesters.length}/{totalSlots} deployed
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/40 rounded p-2 text-red-400 text-xs mb-2">{error}</div>
      )}
      {message && (
        <div className="bg-green-900/30 border border-green-500/40 rounded p-2 text-green-400 text-xs mb-2">{message}</div>
      )}

      {totalSlots === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          This body does not support automated harvesters.
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: totalSlots }).map((_, i) => (
            <HarvesterSlotCard
              key={i}
              slot={i}
              harvester={harvesterMap[i] || null}
              onDeploy={handleDeploy}
              onRefuel={handleRefuel}
              onCollect={handleCollect}
              onAssignDeposit={handleAssignDeposit}
              onRemove={handleRemove}
              availableDeposits={data.available_deposits || []}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// MINE TAB
// ============================================

const MineTab = ({ body, surveyStatus }) => {
  const [deposits, setDeposits] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [cargo, setCargo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  
  const fetchData = useCallback(async () => {
    if (!body?.id) return;
    setLoading(true);
    try {
      const [depositsData, harvestData] = await Promise.all([
        resourcesAPI.getDeposits(effectiveBodyId),
        resourcesAPI.getActiveHarvest(),
      ]);
      setDeposits(depositsData.deposits || []);
      setActiveSession(harvestData.session);
      if (harvestData.cargo) setCargo(harvestData.cargo);
    } catch (err) {
      console.error('Error fetching mine data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [body?.id]);
  
  // Also fetch cargo independently if no active session
  useEffect(() => {
    const fetchCargo = async () => {
      try {
        const data = await resourcesAPI.getCargo();
        setCargo(data.cargo);
      } catch (err) {
        console.error('Error fetching cargo:', err);
      }
    };
    fetchCargo();
    fetchData();
  }, [fetchData]);
  
  // Auto-refresh every 30s while mining
  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(async () => {
      try {
        const data = await resourcesAPI.getActiveHarvest();
        setActiveSession(data.session);
        if (data.cargo) setCargo(data.cargo);
      } catch (err) {
        setActiveSession(null);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [activeSession?.id]);
  
  // Clear messages after 5s
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);
  
  const handleStartHarvest = async (depositId) => {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await resourcesAPI.startHarvest(depositId);
      setActiveSession(data.session);
      if (data.cargo) setCargo(data.cargo);
      setMessage(data.message);
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleCollect = async () => {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await resourcesAPI.collectHarvest();
      setMessage(data.message);
      
      if (data.session_ended) {
        setActiveSession(null);
      } else {
        const harvestData = await resourcesAPI.getActiveHarvest();
        setActiveSession(harvestData.session);
        if (harvestData.cargo) setCargo(harvestData.cargo);
      }
      
      // Refresh deposits to show updated quantities
      const depositsData = await resourcesAPI.getDeposits(effectiveBodyId);
      setDeposits(depositsData.deposits || []);
      
      // Refresh cargo
      const cargoData = await resourcesAPI.getCargo();
      setCargo(cargoData.cargo);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };
  
  const handleStop = async () => {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await resourcesAPI.stopHarvest();
      setMessage(data.message);
      setActiveSession(null);
      await fetchData();
      // Refresh cargo
      const cargoData = await resourcesAPI.getCargo();
      setCargo(cargoData.cargo);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };
  
  if (!surveyStatus.ground_scanned) {
    return (
      <div className="text-center py-8">
        <div className="text-3xl mb-3">🔍</div>
        <p className="text-slate-400 text-sm mb-1">Ground scan required</p>
        <p className="text-slate-500 text-xs">
          Complete both scans in the Scan tab to reveal minable deposits.
        </p>
      </div>
    );
  }
  
  if (loading && deposits.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-slate-400 text-sm animate-pulse">Loading deposits...</div>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded p-2 text-red-400 text-xs">
          {error}
        </div>
      )}
      {message && (
        <div className="bg-green-900/30 border border-green-500/50 rounded p-2 text-green-400 text-xs">
          {message}
        </div>
      )}
      
      {cargo && <CargoBar capacity={cargo.capacity} used={cargo.used} />}
      
      {activeSession && (
        <ActiveHarvestPanel 
          session={activeSession}
          cargo={cargo}
          onCollect={handleCollect}
          onStop={handleStop}
          collecting={actionLoading}
          stopping={actionLoading}
        />
      )}
      
      <div className="space-y-2">
        {deposits.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">No deposits found</p>
        ) : (
          deposits.map(deposit => (
            <DepositCard
              key={deposit.id}
              deposit={deposit}
              isMyActiveDeposit={activeSession?.deposit_id === deposit.id}
              hasActiveSession={!!activeSession}
              onStartHarvest={handleStartHarvest}
              loading={actionLoading}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

// ============================================
// VENDOR TAB — Buy hulls, modules, supplies
// ============================================

const VENDOR_SLOT_COLORS = {
  engine: '#ff6622', weapon: '#ff2244', shield: '#8844ff',
  cargo: '#ddaa22', utility: '#22ccaa', reactor: '#00ddff', mining: '#aa66ff',
};

const VendorTab = ({ body }) => {
  const [hulls, setHulls] = useState([]);
  const [modules, setModules] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [sellInventory, setSellInventory] = useState({ resources: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [section, setSection] = useState('hulls'); // 'hulls', 'modules', 'supplies', 'sell'
  const [credits, setCredits] = useState(0);
  const [sellQuantities, setSellQuantities] = useState({}); // id → quantity to sell
  const fetchCredits = useGameStore(state => state.fetchCredits);
  const openWindow = useGameStore(state => state.openWindow);

  const refreshCredits = async () => {
    try {
      const data = await fittingAPI.getCredits();
      setCredits(data.credits || 0);
      fetchCredits(); // also update global store
    } catch (e) {}
  };

  const loadSellInventory = async () => {
    try {
      const data = await resourcesAPI.getInventory();
      const resources = (data.inventory || []).flatMap(r =>
        r.stacks.map(s => ({
          ...s,
          resource_type_id: r.resource_type_id,
          resource_name: r.resource_name,
          category: r.category,
          rarity: r.rarity,
          base_price: r.base_price,
          icon: r.icon,
          // Sell price: base_price × quality × 0.5
          sell_price: Math.max(1, Math.round(
            r.base_price * (((s.stats?.purity || 50) + (s.stats?.stability || 50) +
              (s.stats?.potency || 50) + (s.stats?.density || 50)) / 4 / 50) * 0.5
          )),
        }))
      );
      const items = (data.items || []).map(item => ({
        ...item,
        sell_price: item.item_data?.module_type_id
          ? Math.max(1, Math.round((item.item_data?.buy_price || 10) * 0.4))
          : { fuel_cell: 40, scanner_probe: 20, advanced_scanner_probe: 60 }[item.item_id] || 5,
      }));
      setSellInventory({ resources, items });
    } catch (e) {
      console.error('Failed to load sell inventory:', e);
    }
  };

  useEffect(() => {
    loadVendorData();
    refreshCredits();
  }, []);

  useEffect(() => {
    if (section === 'sell') loadSellInventory();
  }, [section]);

  const loadVendorData = async () => {
    setLoading(true);
    try {
      const [hullsRes, modsRes] = await Promise.all([
        fittingAPI.getHulls(),
        fittingAPI.getModuleTypes(),
      ]);
      setHulls(hullsRes.hulls || []);

      // Group modules by slot type
      const mods = modsRes.modules || [];
      setModules(mods.filter(m => m.buy_price));

      // Supplies are non-module purchasable items — fuel, probes etc
      // For now these come from a static list since they use the crafting system
      setSupplies([
        { id: 'fuel_cell', name: 'Fuel Cell', icon: '🔋', price: 100, desc: 'Powers a harvester for 6 hours.' },
        { id: 'scanner_probe', name: 'Scanner Probe', icon: '📡', price: 50, desc: 'Basic orbital scanner.' },
        { id: 'advanced_scanner_probe', name: 'Adv. Scanner Probe', icon: '🛰️', price: 150, desc: 'Ground-penetrating scanner.' },
      ]);
    } catch (err) {
      console.error('Vendor load error:', err);
    }
    setLoading(false);
  };

  const flash = (type, text) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 3000); };

  const buyHull = async (hullId) => {
    try {
      const result = await fittingAPI.buyHull(hullId);
      if (result.success) { flash('success', `Purchased ${result.hull.name}!`); refreshCredits(); openWindow('shipBuilder'); }
    } catch (err) {
      flash('error', err.message || 'Failed to buy hull');
    }
  };

  const buyModule = async (moduleId) => {
    try {
      const result = await fittingAPI.buyModule(moduleId);
      if (result.success) { flash('success', `Bought ${result.module} for ${result.price} cr`); refreshCredits(); }
    } catch (err) {
      flash('error', err.message || 'Failed to buy module');
    }
  };

  const buySupply = async (itemId) => {
    try {
      const result = await fittingAPI.buyModule(itemId);
      if (result.success) { flash('success', `Bought ${result.module}`); refreshCredits(); }
    } catch (err) {
      flash('error', err.message || 'Failed to buy supply');
    }
  };

  const sellResource = async (inventoryId, quantity) => {
    try {
      const result = await fittingAPI.sellResource(inventoryId, quantity);
      if (result.success) {
        flash('success', `Sold ${result.sold} ${result.resource_name} for ${result.total_earned} cr`);
        refreshCredits();
        loadSellInventory();
      }
    } catch (err) {
      flash('error', err.message || 'Failed to sell');
    }
  };

  const sellItem = async (inventoryId, quantity) => {
    try {
      const result = await fittingAPI.sellItem(inventoryId, quantity);
      if (result.success) {
        flash('success', `Sold ${result.item_name} for ${result.total_earned} cr`);
        refreshCredits();
        loadSellInventory();
      }
    } catch (err) {
      flash('error', err.message || 'Failed to sell');
    }
  };

  // Group modules by slot_type
  const modsByType = {};
  for (const m of modules) {
    if (!modsByType[m.slot_type]) modsByType[m.slot_type] = [];
    modsByType[m.slot_type].push(m);
  }

  if (loading) return <div className="text-xs text-slate-500 animate-pulse py-4 text-center">Loading vendor...</div>;

  return (
    <div className="space-y-3">
      {message && (
        <div className={`text-xs px-3 py-1.5 rounded ${message.type === 'success' ? 'bg-green-900/30 text-green-400 border border-green-700/30' : 'bg-red-900/30 text-red-400 border border-red-700/30'}`}>
          {message.text}
        </div>
      )}

      {/* Credits balance */}
      <div className="flex items-center justify-between bg-slate-800/40 rounded px-3 py-1.5 border border-slate-700/30">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Balance</span>
        <span className="text-sm font-medium text-yellow-400">{credits.toLocaleString()} cr</span>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1.5">
        {[
          { id: 'hulls', label: '🚀 Hulls', count: hulls.length },
          { id: 'modules', label: '⚙️ Modules', count: modules.length },
          { id: 'supplies', label: '📦 Supplies', count: supplies.length },
          { id: 'sell', label: '💰 Sell', count: sellInventory.resources.length + sellInventory.items.length },
        ].map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              section === s.id
                ? 'bg-yellow-700/30 text-yellow-300 border border-yellow-600/40'
                : 'bg-slate-800/40 text-slate-400 border border-slate-700/30 hover:border-slate-600/50'
            }`}
          >
            {s.label} <span className="text-slate-500 ml-1">{s.count}</span>
          </button>
        ))}
      </div>

      {/* Hulls */}
      {section === 'hulls' && (
        <div className="space-y-2">
          {hulls.map(h => (
            <div key={h.id} className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{h.name}</span>
                  <span className="text-[10px] text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded">{h.class}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{h.description}</div>
                <div className="flex gap-3 mt-1.5 text-[10px]">
                  <span className="text-slate-400">Hull: <span className="text-slate-200">{h.base_hull}</span></span>
                  <span className="text-slate-400">Speed: <span className="text-slate-200">{h.base_speed}</span></span>
                  <span className="text-slate-400">Slots: <span className="text-slate-200">{(h.slots || []).length}</span></span>
                </div>
              </div>
              <button onClick={() => buyHull(h.id)}
                className="px-3 py-1.5 rounded text-xs font-medium bg-yellow-700/30 text-yellow-300 border border-yellow-600/40 hover:bg-yellow-700/50 flex-shrink-0"
              >
                {h.price > 0 ? `${h.price.toLocaleString()} cr` : 'Free'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modules */}
      {section === 'modules' && (
        <div className="space-y-3">
          {Object.entries(modsByType).map(([type, mods]) => {
            const color = VENDOR_SLOT_COLORS[type] || '#888';
            return (
              <div key={type}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="text-xs font-medium capitalize" style={{ color }}>{type}</span>
                </div>
                <div className="space-y-1">
                  {mods.map(m => (
                    <div key={m.id} className="bg-slate-800/30 rounded p-2.5 border border-slate-700/30 flex items-center gap-2">
                      <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: color + '66' }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-200 font-medium">{m.name}</div>
                        <div className="text-[10px] text-slate-500 truncate">T{m.tier} • {m.description}</div>
                      </div>
                      <button onClick={() => buyModule(m.id)}
                        className="px-2 py-1 rounded text-[10px] font-medium bg-yellow-700/20 text-yellow-300 border border-yellow-600/30 hover:bg-yellow-700/40 flex-shrink-0"
                      >
                        {m.buy_price.toLocaleString()} cr
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Supplies */}
      {section === 'supplies' && (
        <div className="space-y-1">
          {supplies.map(s => (
            <div key={s.id} className="bg-slate-800/30 rounded p-2.5 border border-slate-700/30 flex items-center gap-2">
              <span className="text-lg">{s.icon}</span>
              <div className="flex-1">
                <div className="text-xs text-slate-200 font-medium">{s.name}</div>
                <div className="text-[10px] text-slate-500">{s.desc}</div>
              </div>
              <button onClick={() => buySupply(s.id)}
                className="px-2 py-1 rounded text-[10px] font-medium bg-yellow-700/20 text-yellow-300 border border-yellow-600/30 hover:bg-yellow-700/40 flex-shrink-0"
              >
                {s.price} cr
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Sell cargo */}
      {section === 'sell' && (
        <div className="space-y-3">
          {sellInventory.resources.length === 0 && sellInventory.items.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs">Nothing to sell — go mine some resources!</div>
          ) : (
            <>
              {/* Resources */}
              {sellInventory.resources.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Resources</div>
                  <div className="space-y-1">
                    {sellInventory.resources.map(r => {
                      const qty = sellQuantities[r.id] ?? r.quantity;
                      const total = r.sell_price * qty;
                      return (
                        <div key={r.id} className="bg-slate-800/30 rounded p-2.5 border border-slate-700/30">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-200 font-medium">{r.resource_name}</span>
                                <span className="text-[9px] text-slate-500">{r.category}</span>
                                {r.quality_tier && (
                                  <span className={`text-[9px] px-1 rounded ${
                                    r.quality_tier === 'legendary' ? 'bg-yellow-900/30 text-yellow-400' :
                                    r.quality_tier === 'excellent' ? 'bg-purple-900/30 text-purple-400' :
                                    r.quality_tier === 'good' ? 'bg-blue-900/30 text-blue-400' :
                                    r.quality_tier === 'fine' ? 'bg-green-900/30 text-green-400' :
                                    'bg-slate-800/30 text-slate-500'
                                  }`}>{r.quality_tier}</span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {r.sell_price} cr/unit • {r.quantity} available
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            <input
                              type="range"
                              min={1}
                              max={r.quantity}
                              value={qty}
                              onChange={e => setSellQuantities(prev => ({ ...prev, [r.id]: parseInt(e.target.value) }))}
                              className="flex-1 h-1 accent-green-500"
                            />
                            <span className="text-[10px] text-slate-400 w-8 text-right">{qty}</span>
                            <button
                              onClick={() => sellResource(r.id, qty)}
                              className="px-2 py-1 rounded text-[10px] font-medium bg-green-700/25 text-green-400 border border-green-600/30 hover:bg-green-700/40 flex-shrink-0"
                            >
                              Sell {total} cr
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items & Modules */}
              {sellInventory.items.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Items & Modules</div>
                  <div className="space-y-1">
                    {sellInventory.items.map(item => (
                      <div key={item.id} className="bg-slate-800/30 rounded p-2.5 border border-slate-700/30 flex items-center gap-2">
                        <span className="text-lg">{item.item_icon || '📦'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-200 font-medium">{item.item_name}</div>
                          <div className="text-[10px] text-slate-500">×{item.quantity} • {item.sell_price} cr each</div>
                        </div>
                        <button
                          onClick={() => sellItem(item.id, item.quantity)}
                          className="px-2 py-1 rounded text-[10px] font-medium bg-green-700/25 text-green-400 border border-green-600/30 hover:bg-green-700/40 flex-shrink-0"
                        >
                          Sell {item.sell_price * item.quantity} cr
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN PLANET INTERACTION WINDOW
// ============================================

export const PlanetInteractionWindow = ({ body }) => {
  const windows = useGameStore(state => state.windows);
  const isOpen = windows.planetInteraction?.open;
  const currentSystemId = useGameStore(state => state.currentSystem) || 'sol';
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [probes, setProbes] = useState({ scanner_probes: 0, advanced_scanner_probes: 0 });
  const [surveyStatus, setSurveyStatus] = useState({ orbital_scanned: false, ground_scanned: false });
  const [orbitalResults, setOrbitalResults] = useState(null);
  const [groundResults, setGroundResults] = useState(null);
  const [activeTab, setActiveTab] = useState('scan');
  const [resolvedBodyId, setResolvedBodyId] = useState(null);
  
  // For Sol, use the body.id directly (resolved by alias on server).
  // For procedural systems, register the body in DB first and use the returned UUID.
  useEffect(() => {
    if (!body?.id || !isOpen) { setResolvedBodyId(null); return; }
    
    if (currentSystemId === 'sol') {
      setResolvedBodyId(body.id);
      return;
    }
    
    // Procedural system — register body in DB
    const registerBody = async () => {
      try {
        // Import galaxy data to get system info
        const { generateGalaxy } = await import('@/utils/galaxyGenerator');
        const galaxy = generateGalaxy(12345, 200);
        const galaxySys = galaxy.systemMap[currentSystemId];
        
        const result = await resourcesAPI.ensureBody({
          system_procedural_id: currentSystemId,
          system_name: galaxySys?.name || currentSystemId,
          star_type: galaxySys?.starType || 'yellow_star',
          body_client_id: body.id,
          body_name: body.name,
          body_type: body.type || 'planet',
          planet_type: body.planetType || null,
          size: body.size || 20,
          orbit_radius: body.orbitRadius || 1000,
          danger_level: galaxySys?.dangerLevel || 0,
        });
        
        if (result.body_db_id) {
          setResolvedBodyId(result.body_db_id);
        } else {
          setResolvedBodyId(body.id); // fallback
        }
      } catch (err) {
        console.error('Failed to register procedural body:', err);
        setResolvedBodyId(body.id); // fallback to client ID
      }
    };
    
    registerBody();
  }, [body?.id, isOpen, currentSystemId]);
  
  // The effective body ID to use for all API calls
  const effectiveBodyId = resolvedBodyId;
  
  useEffect(() => {
    if (effectiveBodyId && isOpen) {
      fetchProbes();
      fetchSurveyStatus();
    }
  }, [effectiveBodyId, isOpen]);
  
  useEffect(() => {
    setOrbitalResults(null);
    setGroundResults(null);
    setSurveyStatus({ orbital_scanned: false, ground_scanned: false });
    setError(null);
  }, [body?.id]);
  
  const fetchProbes = async () => {
    try {
      const data = await resourcesAPI.getProbes();
      setProbes(data);
    } catch (err) {
      console.error('Error fetching probes:', err);
    }
  };
  
  const fetchSurveyStatus = async () => {
    try {
      const data = await resourcesAPI.getSurveyStatus(effectiveBodyId);
      setSurveyStatus(data.survey_status);
    } catch (err) {
      console.error('Error fetching survey status:', err);
    }
  };
  
  const performOrbitalScan = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await resourcesAPI.orbitalScan(effectiveBodyId);
      setOrbitalResults(data.results);
      setSurveyStatus(prev => ({ ...prev, orbital_scanned: true }));
      setProbes(prev => ({ ...prev, scanner_probes: prev.scanner_probes - 1 }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const performGroundScan = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await resourcesAPI.groundScan(effectiveBodyId);
      setGroundResults(data.results);
      setSurveyStatus(prev => ({ ...prev, ground_scanned: true }));
      setProbes(prev => ({ ...prev, advanced_scanner_probes: prev.advanced_scanner_probes - 1 }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen || !body) return null;
  
  return (
    <DraggableWindow
      windowId="planetInteraction"
      title={body.name}
      initialWidth={420}
      initialHeight={550}
      minWidth={360}
      minHeight={400}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm text-slate-400 capitalize">{body.type || body.body_type}</div>
            <SurveyStatus status={surveyStatus} />
          </div>
          <div className="text-right text-sm">
            <div className="text-slate-400">Scanner Probes: <span className="text-cyan-400">{probes.scanner_probes}</span></div>
            <div className="text-slate-400">Advanced Probes: <span className="text-purple-400">{probes.advanced_scanner_probes}</span></div>
          </div>
        </div>
        
        <div className="flex gap-2 mb-4">
          {['scan', 'mine', 'harvesters', 'vendor'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                activeTab === tab 
                  ? tab === 'mine' ? 'bg-amber-600 text-white' 
                  : tab === 'harvesters' ? 'bg-orange-600 text-white'
                  : tab === 'vendor' ? 'bg-yellow-600 text-white'
                  : 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {tab === 'scan' ? '🔍 Scan' : tab === 'mine' ? '⛏️ Mine' : tab === 'harvesters' ? '⚙️ Harvesters' : '🏪 Vendor'}
            </button>
          ))}
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'scan' && (
            <div className="space-y-4">
              {error && (
                <div className="bg-red-900/30 border border-red-500/50 rounded p-3 text-red-400 text-sm">
                  {error}
                </div>
              )}
              
              <div className="bg-slate-800/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-cyan-400">Orbital Scan</h3>
                  {!surveyStatus.orbital_scanned && (
                    <button
                      onClick={performOrbitalScan}
                      disabled={loading || probes.scanner_probes < 1}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                        loading || probes.scanner_probes < 1
                          ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                      }`}
                    >
                      {loading ? 'Scanning...' : 'Scan (1 Probe)'}
                    </button>
                  )}
                  {surveyStatus.orbital_scanned && (
                    <span className="text-green-400 text-sm">✓ Complete</span>
                  )}
                </div>
                
                {surveyStatus.orbital_scanned && orbitalResults ? (
                  <>
                    <OrbitalScanResults resources={orbitalResults.resources_detected} />
                    <HazardWarning hazards={orbitalResults.hazards} />
                  </>
                ) : surveyStatus.orbital_scanned ? (
                  <p className="text-slate-400 text-sm">Scan data available. View deposits below.</p>
                ) : (
                  <p className="text-slate-500 text-sm">
                    Deploy a scanner probe to detect resource types and abundance levels.
                  </p>
                )}
              </div>
              
              <div className="bg-slate-800/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-purple-400">Ground Scan</h3>
                  {surveyStatus.orbital_scanned && !surveyStatus.ground_scanned && (
                    <button
                      onClick={performGroundScan}
                      disabled={loading || probes.advanced_scanner_probes < 1}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                        loading || probes.advanced_scanner_probes < 1
                          ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                          : 'bg-purple-600 hover:bg-purple-500 text-white'
                      }`}
                    >
                      {loading ? 'Scanning...' : 'Scan (1 Adv. Probe)'}
                    </button>
                  )}
                  {surveyStatus.ground_scanned && (
                    <span className="text-green-400 text-sm">✓ Complete</span>
                  )}
                </div>
                
                {!surveyStatus.orbital_scanned ? (
                  <p className="text-slate-500 text-sm">
                    Requires orbital scan first.
                  </p>
                ) : surveyStatus.ground_scanned && groundResults ? (
                  <GroundScanResults deposits={groundResults.deposits} />
                ) : surveyStatus.ground_scanned ? (
                  <p className="text-slate-400 text-sm">Detailed scan data available.</p>
                ) : (
                  <p className="text-slate-500 text-sm">
                    Deploy an advanced probe to analyze deposit composition and quality.
                  </p>
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'mine' && (
            <MineTab body={body} surveyStatus={surveyStatus} />
          )}
          
          {activeTab === 'harvesters' && (
            <HarvestersTab body={body} />
          )}
          
          {activeTab === 'vendor' && (
            <VendorTab body={body} />
          )}
        </div>
      </div>
    </DraggableWindow>
  );
};

export default PlanetInteractionWindow;
