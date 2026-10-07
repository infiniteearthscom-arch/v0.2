// GateWindow.jsx -- the jump-gate lane picker (docs/jump-gates-spec.md §2).
//
// Opens when the fleet docks at a Jump Gate without a plotted hop. Left: one
// row per connected system (tier, danger, threat faction when the region is
// discovered, lock state from the gate tier rule). Right: a small lane map
// centred on the current system with the lanes drawn, second-ring
// neighbours faint, and the bearing to Sol marked. Pick from either side,
// then ALIGN & JUMP hands the target to SystemView (store.requestGateJump),
// which runs the fleet alignment timer and the jump.

import React, { useEffect, useMemo, useState } from 'react';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useGameStore } from '@/stores/gameStore';
import { generateGalaxy } from '@/utils/galaxyGenerator';
import { fleetWarpProfile, warpCheck, warpBlockText, alignTimeSeconds } from '@/utils/warp';
import { tierColor, tierLabel } from '@/utils/tiers';
import { computeTerritory, FACTION_LABEL, NEST_LABEL } from '@/utils/factions';
import { FACTIONS as SHIP_FACTIONS, factionKey } from '@/utils/shipRenderer';
import { playSound } from '@/utils/audio';

const GALAXY_SEED = 12345, SYSTEM_COUNT = 200;
let _galaxy = null;
const getGalaxy = () => { if (!_galaxy) _galaxy = generateGalaxy(GALAXY_SEED, SYSTEM_COUNT); return _galaxy; };

export const AUTO_JUMP_KEY = 'gate.autoJump';
export const autoJumpEnabled = () => { try { return localStorage.getItem(AUTO_JUMP_KEY) !== '0'; } catch { return true; } };

const F = "'Rajdhani', 'Exo 2', sans-serif", FM = "'Share Tech Mono', monospace";

export const GateWindow = () => {
  const isOpen = useGameStore(s => s.windows.gate?.open);
  const closeWindow = useGameStore(s => s.closeWindow);
  const openWindow = useGameStore(s => s.openWindow);
  const currentSystemId = useGameStore(s => s.currentSystem);
  const ships = useGameStore(s => s.ships);
  const activeBonuses = useGameStore(s => s.activeBonuses);
  const discoveredSystems = useGameStore(s => s.discoveredSystems);
  const pendingJump = useGameStore(s => s.pendingJump);
  const plannedRoute = useGameStore(s => s.plannedRoute);
  const requestGateJump = useGameStore(s => s.requestGateJump);

  const galaxy = useMemo(() => getGalaxy(), []);
  const territory = useMemo(() => computeTerritory(galaxy), [galaxy]);
  const discovered = useMemo(() => new Set(discoveredSystems || []), [discoveredSystems]);
  const sys = galaxy.systemMap[currentSystemId];
  const profile = useMemo(() => fleetWarpProfile(ships, activeBonuses), [ships, activeBonuses]);
  const alignSec = useMemo(() => alignTimeSeconds(ships, activeBonuses), [ships, activeBonuses]);

  const lanes = useMemo(() => {
    if (!sys) return [];
    return (sys.jumpConnections || []).map(id => {
      const t = galaxy.systemMap[id];
      if (!t) return null;
      const check = warpCheck(sys, t, profile);
      const known = discovered.has(id);
      const fac = territory.systemFaction.get(id) || 'reavers';
      const nest = Object.entries(territory.nests).find(([, rid]) => rid === t.regionId)?.[0] || null;
      const regionKnown = (galaxy.regions || []).find(r => r.id === t.regionId)?.systemIds.some(s => discovered.has(s));
      return { sys: t, check, known, fac, nest, regionKnown, dist: Math.hypot(t.x - sys.x, t.y - sys.y) };
    }).filter(Boolean).sort((a, b) => a.dist - b.dist);
  }, [sys, galaxy, profile, discovered, territory]);

  const [selectedId, setSelectedId] = useState(null);
  const [autoJump, setAutoJump] = useState(autoJumpEnabled());
  useEffect(() => {
    if (!isOpen) return;
    const hop = plannedRoute?.hops?.[plannedRoute.index];
    const pre = pendingJump?.targetSystemId || hop?.id;
    if (pre && lanes.some(l => l.sys.id === pre)) { setSelectedId(pre); return; }
    const first = lanes.find(l => l.check.ok) || lanes[0];
    setSelectedId(first ? first.sys.id : null);
  }, [isOpen, lanes, pendingJump, plannedRoute]);

  if (!isOpen || !sys) return null;
  const selected = lanes.find(l => l.sys.id === selectedId) || null;

  // ---- lane map geometry ----
  const W = 400, H = 360, cx = W / 2, cy = H / 2, R = 150;
  const second = [];
  for (const l of lanes) for (const id of (l.sys.jumpConnections || [])) {
    if (id === sys.id || lanes.some(x => x.sys.id === id)) continue;
    const t = galaxy.systemMap[id]; if (t) second.push({ from: l.sys, sys: t });
  }
  const maxD = Math.max(1, ...lanes.map(l => l.dist), ...second.map(s => Math.hypot(s.sys.x - sys.x, s.sys.y - sys.y)) * 0.85);
  const px = (t) => ({ x: cx + ((t.x - sys.x) / maxD) * R, y: cy + ((t.y - sys.y) / maxD) * R });
  const sol = galaxy.systemMap['sol'];
  const solAng = sol && sol.id !== sys.id ? Math.atan2(sol.y - sys.y, sol.x - sys.x) : null;

  const toggleAuto = () => { const n = !autoJump; setAutoJump(n); try { localStorage.setItem(AUTO_JUMP_KEY, n ? '1' : '0'); } catch {} };
  const jump = () => {
    if (!selected || !selected.check.ok) return;
    playSound('button_click');
    requestGateJump(selected.sys.id);
    closeWindow('gate');
  };

  return (
    <ModalOverlay windowId="gate" title={`Jump Gate — ${sys.name}`} icon="⛩" accent="#44ff88" width={820} height={520}>
      <div className="flex gap-3 h-full" style={{ fontFamily: F }}>
        {/* ---- lanes list ---- */}
        <div className="flex flex-col" style={{ width: 340 }}>
          <div className="text-[0.8rem] text-slate-500 uppercase tracking-wider mb-1">Lanes · {lanes.length}</div>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {lanes.map(l => {
              const sel = l.sys.id === selectedId;
              const sf = SHIP_FACTIONS[factionKey(l.fac)] || SHIP_FACTIONS.pirate;
              return (
                <div key={l.sys.id} onClick={() => setSelectedId(l.sys.id)}
                  className={`p-2 rounded cursor-pointer text-xs border ${sel ? 'bg-emerald-900/25 border-emerald-500/50' : 'bg-slate-800/30 border-slate-700/30 hover:border-slate-500/50'} ${l.check.ok ? '' : 'opacity-70'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-100 flex-1 truncate">{l.known ? l.sys.name : 'Unknown System'}</span>
                    <span style={{ color: tierColor(l.sys.regionTier), fontFamily: FM }}>T{tierLabel(l.sys.regionTier)}</span>
                    <span className="text-yellow-400" style={{ fontSize: '0.65rem' }}>{'★'.repeat(l.sys.dangerLevel || 0)}{'☆'.repeat(5 - (l.sys.dangerLevel || 0))}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[0.75rem]" style={{ fontFamily: FM }}>
                    <span className="text-slate-500">{l.known ? l.sys.regionName : '—'} · {Math.round(l.dist)} u</span>
                    {l.regionKnown && <span style={{ color: sf.color }}>{FACTION_LABEL[l.fac]}{l.nest ? ` · ${NEST_LABEL[l.nest]}` : ''}</span>}
                  </div>
                  {!l.check.ok && <div className="text-[0.75rem] text-amber-400 mt-0.5">🔒 {warpBlockText(l.check, l.sys, profile)}</div>}
                </div>
              );
            })}
            {lanes.length === 0 && <div className="text-xs text-slate-600 italic p-2">This gate has no lanes. Leave by the warp point.</div>}
          </div>
        </div>

        {/* ---- lane map ---- */}
        <div className="flex-1 flex flex-col">
          <div className="text-[0.8rem] text-slate-500 uppercase tracking-wider mb-1">Lane map</div>
          <svg width={W} height={H} style={{ background: 'radial-gradient(circle at 50% 50%, #0b1626 0%, #060a12 70%)', border: '1px solid #1a3050', borderRadius: 3 }}>
            {/* rings */}
            {[0.33, 0.66, 1].map(k => <circle key={k} cx={cx} cy={cy} r={R * k} fill="none" stroke="#1a3050" strokeDasharray="2,4" />)}
            {/* second ring: faint */}
            {second.map((s, i) => { const a = px(s.from), b = px(s.sys); return (
              <g key={`s${i}`} opacity={0.35}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#4477aa" strokeWidth="1" strokeDasharray="3,3" />
                <circle cx={b.x} cy={b.y} r={2.5} fill={discovered.has(s.sys.id) ? tierColor(s.sys.regionTier) : '#445'} />
              </g>
            ); })}
            {/* lanes */}
            {lanes.map(l => { const p = px(l.sys); const sel = l.sys.id === selectedId; return (
              <g key={l.sys.id} onClick={() => setSelectedId(l.sys.id)} style={{ cursor: 'pointer' }}>
                <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={sel ? '#44ff88' : l.check.ok ? '#4477aa' : '#553333'} strokeWidth={sel ? 2.5 : 1.5} strokeDasharray={l.check.ok ? '' : '4,3'} />
                <circle cx={p.x} cy={p.y} r={sel ? 7 : 5} fill={l.known ? tierColor(l.sys.regionTier) : '#556'} stroke={sel ? '#44ff88' : '#0a0f1a'} strokeWidth={sel ? 2 : 1} />
                <text x={p.x} y={p.y - 10} textAnchor="middle" fill={sel ? '#b9ffd3' : '#9fb3c8'} fontSize="10" fontFamily={FM}>{l.known ? l.sys.name : '?'}</text>
                {!l.check.ok && <text x={p.x} y={p.y + 16} textAnchor="middle" fill="#f59e0b" fontSize="9">🔒</text>}
              </g>
            ); })}
            {/* current system */}
            <circle cx={cx} cy={cy} r={8} fill="#22d3ee" stroke="#0a0f1a" strokeWidth="1.5" />
            <text x={cx} y={cy + 22} textAnchor="middle" fill="#67e8f9" fontSize="11" fontFamily={FM}>{sys.name}</text>
            {/* bearing to Sol */}
            {solAng != null && (() => { const ex = cx + Math.cos(solAng) * (R + 18), ey = cy + Math.sin(solAng) * (R + 18); return (
              <g opacity={0.8}>
                <line x1={cx + Math.cos(solAng) * (R + 6)} y1={cy + Math.sin(solAng) * (R + 6)} x2={ex} y2={ey} stroke="#fbbf24" strokeWidth="1.5" />
                <text x={cx + Math.cos(solAng) * (R + 30)} y={cy + Math.sin(solAng) * (R + 30) + 4} textAnchor="middle" fill="#fbbf24" fontSize="9" fontFamily={FM}>SOL</text>
              </g>
            ); })()}
          </svg>

          {/* ---- footer ---- */}
          <div className="mt-2 flex items-center gap-3 text-xs">
            <div className="flex-1" style={{ fontFamily: FM }}>
              {selected ? (
                <>
                  <span className="text-slate-300">{selected.known ? selected.sys.name : 'Unknown System'}</span>
                  <span className="text-slate-500"> · alignment ≈ </span><span className="text-emerald-300">{alignSec.toFixed(1)} s</span>
                  {profile.limitingShip && <span className="text-slate-600"> · drive class {profile.driveClass}</span>}
                </>
              ) : <span className="text-slate-500">Select a lane</span>}
            </div>
            <label className="flex items-center gap-1 text-slate-400 cursor-pointer" title="On a plotted course, start alignment automatically at each gate">
              <input type="checkbox" checked={autoJump} onChange={toggleAuto} /> auto-jump on routes
            </label>
            <button onClick={() => { playSound('button_click'); openWindow('galaxyMap'); }}
              className="px-2 py-1 rounded border border-slate-600/50 text-slate-300 hover:border-cyan-500/50">Plot a course…</button>
            <button onClick={jump} disabled={!selected || !selected.check.ok}
              className={`px-3 py-1.5 rounded font-semibold border ${selected?.check.ok ? 'bg-emerald-700/40 border-emerald-500/60 text-emerald-200 hover:bg-emerald-700/60' : 'bg-slate-800/40 border-slate-700/40 text-slate-500 cursor-not-allowed'}`}>
              ⛩ ALIGN &amp; JUMP
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
};

export default GateWindow;
