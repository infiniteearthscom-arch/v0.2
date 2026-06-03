// PowerPanel.jsx — combat power-pip allocator (P2a).
//
// Fleet-wide reactor power distributed across LAS/BAL/MIS/SHD/ENG. Even
// split is neutral; concentrate pips to boost a subsystem at the others'
// expense. Reads/writes gameStore.pipAllocation; pool comes from
// fleetStats.pipPool. Only visible in System View while playing.
//
// Layout: a bottom-center HOTBAR of 40px icons (matching cargo-slot size),
// each with a vertical power bar above it and its hotkey number on it.
//   click / key 1-5 = divert a pip in   ·   right-click / scroll = remove

import React, { useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';
import {
  PIP_SUBSYSTEMS, PIP_SUBSYSTEM_META,
  weaponFireMult, shieldRegenMult, shieldResist, engineSpeedMult,
  allocTotal, pipShare,
} from '@/utils/powerPips';

const SLOT = 40;          // matches cargo ItemCell size
const BAR_H = 54;         // vertical power bar height

// 1..5 -> subsystem (and shown on each icon).
const HOTKEY_OF = { LAS: '1', BAL: '2', MIS: '3', SHD: '4', ENG: '5' };
const SUB_OF_KEY = { '1': 'LAS', '2': 'BAL', '3': 'MIS', '4': 'SHD', '5': 'ENG' };

// Per-subsystem effect summary string (shown under the icon).
const effectLabel = (key, pips, pool) => {
  const meta = PIP_SUBSYSTEM_META[key];
  if (meta.kind === 'weapon') return `×${weaponFireMult(pips, pool).toFixed(2)}`;
  if (key === 'SHD') {
    const res = Math.round(shieldResist(pips, pool) * 100);
    return res > 0 ? `×${shieldRegenMult(pips, pool).toFixed(2)} · ${res}%` : `×${shieldRegenMult(pips, pool).toFixed(2)}`;
  }
  if (key === 'ENG') return `×${engineSpeedMult(pips, pool).toFixed(2)}`;
  return '';
};

export default function PowerPanel() {
  const viewMode = useGameStore(s => s.viewMode);
  const gameStarted = useGameStore(s => s.gameStarted);
  const alloc = useGameStore(s => s.pipAllocation);
  const pool = useGameStore(s => s.fleetStats?.pipPool) || 10;
  const adjustPip = useGameStore(s => s.adjustPip);

  // Hotkeys 1-5 add a pip to the matching subsystem.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      const sub = SUB_OF_KEY[e.key];
      if (sub) adjustPip(sub, +1);
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
        left: '50%', bottom: 8, transform: 'translateX(-50%)',
        fontFamily: "'Share Tech Mono', monospace",
      }}
    >
      {/* header */}
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="text-[10px] font-bold tracking-widest" style={{ color: '#7dd3fc' }}>⚡ POWER</span>
        <span className="text-[9px]" style={{ color: used < pool ? '#fbbf24' : '#3a4a5a' }}>
          {used}/{pool}{used < pool ? ' free' : ''}
        </span>
      </div>

      {/* hotbar row */}
      <div
        className="flex items-end gap-1.5 px-2 py-1.5 rounded"
        style={{
          background: 'linear-gradient(180deg, rgba(8,16,32,0.92), rgba(6,12,24,0.88))',
          border: '1px solid #1e3a5f',
          boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
        }}
      >
        {PIP_SUBSYSTEMS.map(key => {
          const meta = PIP_SUBSYSTEM_META[key];
          const pips = alloc?.[key] || 0;
          const share = pipShare(pips, pool);
          const fillPct = Math.max(0, Math.min(1, share / 2.5)) * 100;
          const tone = share > 1.05 ? '#86efac' : share < 0.95 ? '#fca5a5' : '#94a3b8';
          return (
            <div
              key={key}
              className="flex flex-col items-center"
              style={{ width: SLOT, cursor: 'pointer' }}
              onClick={() => adjustPip(key, +1)}
              onContextMenu={(e) => { e.preventDefault(); adjustPip(key, -1); }}
              onWheel={(e) => { adjustPip(key, e.deltaY < 0 ? +1 : -1); }}
              title={`${meta.label} — click / key ${HOTKEY_OF[key]} to add · right-click / scroll to remove`}
            >
              {/* pip count */}
              <span style={{ fontSize: 9, color: tone, lineHeight: 1, marginBottom: 2, fontWeight: 700 }}>{pips}</span>

              {/* vertical power bar */}
              <div
                style={{
                  width: 12, height: BAR_H, background: '#0a1528',
                  border: '1px solid #1e3a5f', borderRadius: 2,
                  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                  overflow: 'hidden', marginBottom: 3,
                }}
              >
                <div style={{ width: '100%', height: `${fillPct}%`, background: meta.color, transition: 'height 120ms' }} />
              </div>

              {/* icon — cargo-slot-sized, hotkey number on it */}
              <div
                className="relative flex items-center justify-center"
                style={{
                  width: SLOT, height: SLOT, borderRadius: 5,
                  background: `${meta.color}1a`,
                  border: `1px solid ${meta.color}66`,
                }}
              >
                <span style={{ color: meta.color, fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>{key}</span>
                {/* hotkey badge */}
                <span
                  className="absolute flex items-center justify-center"
                  style={{
                    top: -4, left: -4, width: 13, height: 13, borderRadius: 3,
                    background: '#0a1528', border: `1px solid ${meta.color}88`,
                    color: meta.color, fontSize: 8, fontWeight: 700,
                  }}
                >{HOTKEY_OF[key]}</span>
              </div>

              {/* effect multiplier */}
              <span style={{ fontSize: 8, color: tone, lineHeight: 1, marginTop: 2 }}>{effectLabel(key, pips, pool)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
