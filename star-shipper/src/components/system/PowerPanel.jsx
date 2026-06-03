// PowerPanel.jsx — combat power-pip allocator (P2a).
//
// Fleet-wide reactor power distributed across LAS/BAL/MIS/SHD/ENG. Even
// split is neutral; concentrate pips to boost a subsystem at the others'
// expense. Reads/writes gameStore.pipAllocation; pool comes from
// fleetStats.pipPool. Only visible in System View while playing.

import React, { useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import {
  PIP_SUBSYSTEMS, PIP_SUBSYSTEM_META,
  weaponFireMult, shieldRegenMult, shieldResist, engineSpeedMult,
  allocTotal, pipShare,
} from '@/utils/powerPips';

// Per-subsystem effect summary string.
const effectLabel = (key, pips, pool) => {
  const meta = PIP_SUBSYSTEM_META[key];
  if (meta.kind === 'weapon') return `×${weaponFireMult(pips, pool).toFixed(2)} rate`;
  if (key === 'SHD') {
    const res = Math.round(shieldResist(pips, pool) * 100);
    return `×${shieldRegenMult(pips, pool).toFixed(2)} regen${res > 0 ? ` · ${res}% resist` : ''}`;
  }
  if (key === 'ENG') return `×${engineSpeedMult(pips, pool).toFixed(2)} speed`;
  return '';
};

// Hotkey map: 1..5 -> subsystem.
const HOTKEYS = { '1': 'LAS', '2': 'BAL', '3': 'MIS', '4': 'SHD', '5': 'ENG' };

export default function PowerPanel() {
  const viewMode = useGameStore(s => s.viewMode);
  const gameStarted = useGameStore(s => s.gameStarted);
  const alloc = useGameStore(s => s.pipAllocation);
  const pool = useGameStore(s => s.fleetStats?.pipPool) || 10;
  const adjustPip = useGameStore(s => s.adjustPip);

  // Hotkeys 1-5 add a pip to the matching subsystem (pulls from the
  // largest other to keep the total pinned to the pool).
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      const sub = HOTKEYS[e.key];
      if (sub) { adjustPip(sub, +1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adjustPip]);

  if (!gameStarted || viewMode !== 'system') return null;

  const used = allocTotal(alloc);

  return (
    <div
      className="fixed z-40 select-none"
      style={{
        left: 10, bottom: 10, width: 232,
        background: 'linear-gradient(180deg, rgba(8,16,32,0.95), rgba(6,12,24,0.92))',
        border: '1px solid #1e3a5f', borderRadius: 6,
        padding: '7px 8px', fontFamily: "'Share Tech Mono', monospace",
        boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold tracking-widest" style={{ color: '#7dd3fc' }}>⚡ POWER</span>
        <span className="text-[9px]" style={{ color: used < pool ? '#fbbf24' : '#3a4a5a' }}>
          {used}/{pool}{used < pool ? ' · free' : ''}
        </span>
      </div>

      {PIP_SUBSYSTEMS.map(key => {
        const meta = PIP_SUBSYSTEM_META[key];
        const pips = alloc?.[key] || 0;
        const share = pipShare(pips, pool);
        return (
          <div key={key} className="flex items-center gap-1 mb-0.5" style={{ fontSize: 9 }}>
            <span style={{ color: meta.color, width: 30, fontWeight: 700 }}>{key}</span>
            {/* pip dots */}
            <div className="flex items-center gap-0.5" style={{ width: 56 }}>
              {Array.from({ length: Math.max(pips, 0) }).map((_, i) => (
                <span key={i} style={{ width: 5, height: 9, background: meta.color, borderRadius: 1, display: 'inline-block' }} />
              ))}
            </div>
            {/* effect readout, tinted by boosted/neutral/starved */}
            <span
              className="flex-1 text-right"
              style={{ color: share > 1.05 ? '#86efac' : share < 0.95 ? '#fca5a5' : '#94a3b8', fontSize: 8.5 }}
            >
              {effectLabel(key, pips, pool)}
            </span>
            {/* − / + */}
            <button
              onClick={() => adjustPip(key, -1)}
              className="leading-none"
              style={{ width: 14, height: 14, color: '#94a3b8', background: '#0a1528', border: '1px solid #1e3a5f', borderRadius: 3, fontSize: 11 }}
              title={`Remove power from ${meta.label}`}
            >−</button>
            <button
              onClick={() => adjustPip(key, +1)}
              className="leading-none"
              style={{ width: 14, height: 14, color: meta.color, background: '#0a1528', border: '1px solid #1e3a5f', borderRadius: 3, fontSize: 11 }}
              title={`Divert power to ${meta.label}`}
            >+</button>
          </div>
        );
      })}
      <div className="text-[7.5px] mt-1 text-center" style={{ color: '#3a4a5a' }}>keys 1–5 divert · even split = neutral</div>
    </div>
  );
}
