// SystemMapWindow
// ================
// Bottom-right pane with the orbital system map (left) + bodies list
// (right). Replaces the old NavigationWindow -- everything that used
// to live there now lives here, sized up ~30% so the map reads at a
// glance and has room for future scanner overlays (scanned asteroids,
// detected hostiles, deposit pins, etc.).
//
// Toggled via a dedicated bottom-right button in GameFrame.
// When the player is in interstellar space (viewMode != 'system'),
// the pane shows an idle "go to a system" message rather than hiding.

import React, { useState, useCallback, useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { generateGalaxy, generateSystemContent } from '@/utils/galaxyGenerator';

const EDGE = '#1a3050';
const BLUE = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD = { pri: '#f59e0b', light: '#fbbf24' };
const PANEL_BG = 'rgba(8,14,28,0.93)';
const F  = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";

const diagMix = (c = 6) =>
  `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

// ============================================
// SYSTEM DATA (lifted from NavigationWindow)
// ============================================
const SOL_SYSTEM = {
  id: 'sol',
  name: 'Sol',
  starType: 'yellow_star',
  starColor: '#ffdd44',
  bodies: [
    { id: 'mercury', name: 'Mercury', type: 'planet', planetType: 'rocky', orbitRadius: 400, orbitSpeed: 0.015, orbitOffset: 2.1, size: 12, color: '#aaaaaa' },
    { id: 'venus', name: 'Venus', type: 'planet', planetType: 'desert', orbitRadius: 600, orbitSpeed: 0.011, orbitOffset: 4.7, size: 22, color: '#ddaa66' },
    { id: 'earth', name: 'Earth', type: 'planet', planetType: 'terran', orbitRadius: 850, orbitSpeed: 0.008, orbitOffset: 1.3, size: 25, color: '#4488aa' },
    { id: 'luna_station', name: 'Luna Station', type: 'station', parentBody: 'earth', orbitRadius: 50, orbitSpeed: 0.04, orbitOffset: 0.5, size: 8 },
    { id: 'mars', name: 'Mars', type: 'planet', planetType: 'desert', orbitRadius: 1100, orbitSpeed: 0.006, orbitOffset: 5.9, size: 18, color: '#cc6644' },
    { id: 'asteroid_belt_1', name: 'Asteroid Belt', type: 'asteroid_belt', orbitRadius: 1500, width: 250 },
    { id: 'jupiter', name: 'Jupiter', type: 'planet', planetType: 'gas_giant', orbitRadius: 2200, orbitSpeed: 0.003, orbitOffset: 3.2, size: 80, color: '#ddaa77' },
    { id: 'saturn', name: 'Saturn', type: 'planet', planetType: 'gas_giant', orbitRadius: 3000, orbitSpeed: 0.002, orbitOffset: 0.8, size: 70, color: '#ddcc88' },
    { id: 'uranus', name: 'Uranus', type: 'planet', planetType: 'ice', orbitRadius: 3800, orbitSpeed: 0.0012, orbitOffset: 4.1, size: 40, color: '#88ccdd' },
    { id: 'neptune', name: 'Neptune', type: 'planet', planetType: 'ice', orbitRadius: 4500, orbitSpeed: 0.0008, orbitOffset: 2.6, size: 38, color: '#4466cc' },
    { id: 'jump_gate', name: 'Jump Gate', type: 'jump_gate', orbitRadius: 5200, orbitSpeed: 0.0005, orbitOffset: 1.0, size: 12 },
    { id: 'warp_point', name: 'Warp Point', type: 'warp_point', orbitRadius: 5600, orbitSpeed: 0.0003, orbitOffset: 4.2, size: 10 },
  ],
};

const GALAXY_SEED = 12345;
let _galaxyCache = null;
const getGalaxy = () => {
  if (!_galaxyCache) _galaxyCache = generateGalaxy(GALAXY_SEED, 200);
  return _galaxyCache;
};

const STAR_COLORS = {
  red_dwarf: '#ff6644', orange_star: '#ffaa44', yellow_star: '#ffdd44',
  blue_giant: '#4488ff', white_dwarf: '#aabbcc', neutron_star: '#dd88ff', black_hole: '#664466',
};

const PLANET_TYPE_NAMES = {
  rocky: 'Rocky', terran: 'Terran', desert: 'Desert', ice: 'Ice',
  gas_giant: 'Gas Giant', ocean: 'Ocean', lava: 'Volcanic', barren: 'Barren', exotic: 'Exotic',
};

const PLANET_TYPE_COLORS = {
  rocky: '#888888', terran: '#4488aa', desert: '#ddaa66', ice: '#aaddff',
  gas_giant: '#ddaa77', ocean: '#2266aa', lava: '#ff4400', barren: '#555555', exotic: '#aa44ff',
};

const BODY_TYPE_LABEL = {
  planet:     'Planet',
  station:    'Station',
  warp_point: 'Warp Pt',
  jump_gate:  'Gate',
};

// ============================================
// HELPERS
// ============================================

const getBodyPos = (body, time, bodies) => {
  if (body.parentBody) {
    const parent = bodies.find(b => b.id === body.parentBody);
    if (!parent) return { x: 0, y: 0 };
    const parentPos = getBodyPos(parent, time, bodies);
    const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
    return {
      x: parentPos.x + Math.cos(angle) * body.orbitRadius,
      y: parentPos.y + Math.sin(angle) * body.orbitRadius,
    };
  }
  const angle = time * body.orbitSpeed + (body.orbitOffset || 0);
  return {
    x: Math.cos(angle) * body.orbitRadius,
    y: Math.sin(angle) * body.orbitRadius,
  };
};

const formatDistance = (dist) => {
  if (dist < 1000) return `${Math.round(dist)}`;
  return `${(dist / 1000).toFixed(1)}k`;
};

const formatTravelTime = (dist, speed) => {
  if (speed <= 0) return '—';
  const seconds = dist / Math.max(speed, 50);
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)}m`;
  return `~${(seconds / 3600).toFixed(1)}h`;
};

// ============================================
// TOOLTIP
// ============================================

const BodyTooltip = ({ body, distance, shipSpeed, x, y, mapSize }) => {
  const tooltipX = x > mapSize / 2 ? x - 130 : x + 15;
  const tooltipY = Math.max(10, Math.min(y - 10, mapSize - 90));
  return (
    <div
      className="absolute pointer-events-none z-10"
      style={{ left: tooltipX, top: tooltipY }}
    >
      <div className="bg-slate-900/95 border border-cyan-500/40 rounded-lg px-3 py-2 min-w-[120px] shadow-lg">
        <div className="text-sm font-medium text-cyan-200">{body.name}</div>
        <div className="text-xs text-slate-400 mt-0.5">
          {body.type === 'station' ? 'Station' :
           body.type === 'asteroid_belt' ? 'Asteroid Belt' :
           body.type === 'jump_gate' ? 'Jump Gate' :
           body.type === 'warp_point' ? 'Warp Point' :
           PLANET_TYPE_NAMES[body.planetType] || body.type}
        </div>
        {distance != null && (
          <div className="text-xs text-slate-500 mt-1 border-t border-slate-700/50 pt-1">
            <div>Distance: {formatDistance(distance)}</div>
            <div>Travel: {formatTravelTime(distance, shipSpeed)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// SVG MAP (lifted from NavigationWindow at 30% larger)
// ============================================

const MAP_SIZE = 442; // was 340 in NavigationWindow; +30%
const GHOST_TTL_MS = 30000; // mirror of SystemView -- drives ghost fade opacity

const SystemMapSvg = ({
  system, time, shipPosition, shipSpeed, autopilotTarget, onClickBody,
  scannerData, sweepStartedAt,
}) => {
  useSweepTick(sweepStartedAt); // smooth wave animation while pinging
  const [hoveredBody, setHoveredBody] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const starColor = STAR_COLORS[system.starType] || '#ffdd44';
  const maxOrbit = Math.max(...system.bodies.map(b => b.orbitRadius || 0));
  const mapScale = (MAP_SIZE * 0.45) / Math.max(maxOrbit, 1);

  const bodyData = system.bodies.map(body => {
    const pos = getBodyPos(body, time, system.bodies);
    const screenX = pos.x * mapScale;
    const screenY = pos.y * mapScale;
    const dx = pos.x - shipPosition.x;
    const dy = pos.y - shipPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return { body, pos, screenX, screenY, distance };
  });

  const shipScreenX = shipPosition.x * mapScale;
  const shipScreenY = shipPosition.y * mapScale;

  return (
    <div className="relative" style={{ width: MAP_SIZE, height: MAP_SIZE }}>
      <svg
        width={MAP_SIZE}
        height={MAP_SIZE}
        viewBox={`${-MAP_SIZE / 2} ${-MAP_SIZE / 2} ${MAP_SIZE} ${MAP_SIZE}`}
        className="cursor-crosshair"
        onMouseLeave={() => setHoveredBody(null)}
      >
        <rect x={-MAP_SIZE / 2} y={-MAP_SIZE / 2} width={MAP_SIZE} height={MAP_SIZE} fill="#080812" rx="6" />

        {/* Orbit rings */}
        {system.bodies.map(body => {
          if (body.type === 'asteroid_belt') {
            return (
              <circle key={`orbit-${body.id}`} cx={0} cy={0}
                r={body.orbitRadius * mapScale} fill="none"
                stroke="#444466" strokeWidth="8" opacity="0.2" />
            );
          }
          if (body.parentBody) return null;
          if (body.type === 'planet' || body.type === 'jump_gate' || body.type === 'warp_point') {
            return (
              <circle key={`orbit-${body.id}`} cx={0} cy={0}
                r={body.orbitRadius * mapScale} fill="none"
                stroke={body.type === 'jump_gate' ? '#44ff8820' : body.type === 'warp_point' ? '#8855ff20' : '#223344'}
                strokeWidth="0.5"
                strokeDasharray={body.type === 'jump_gate' || body.type === 'warp_point' ? '2,4' : '3,3'} />
            );
          }
          return null;
        })}

        {/* Star */}
        <circle cx={0} cy={0} r={8} fill={starColor} />
        <circle cx={0} cy={0} r={13} fill={starColor + '15'} />

        {/* Bodies */}
        {bodyData.map(({ body, screenX, screenY }) => {
          if (body.type === 'asteroid_belt') return null;
          const isTarget = autopilotTarget?.id === body.id;
          const isHovered = hoveredBody?.id === body.id;
          const isStation = body.type === 'station';
          const isGate = body.type === 'jump_gate';
          const isWarp = body.type === 'warp_point';
          const dotSize = isStation || isGate || isWarp
            ? 4
            : Math.max(3, Math.min(8, body.size * mapScale * 0.12));

          return (
            <g
              key={body.id}
              transform={`translate(${screenX}, ${screenY})`}
              onClick={() => onClickBody(body)}
              onMouseEnter={(e) => {
                setHoveredBody(body);
                const rect = e.currentTarget.closest('svg').getBoundingClientRect();
                setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.closest('svg').getBoundingClientRect();
                setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseLeave={() => setHoveredBody(null)}
              style={{ cursor: 'pointer' }}
            >
              {isTarget && (
                <>
                  <circle r={dotSize + 7} fill="none" stroke="#00ffff" strokeWidth="1.5" opacity="0.8">
                    <animate attributeName="r" values={`${dotSize + 6};${dotSize + 10};${dotSize + 6}`} dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle r={dotSize + 5} fill="none" stroke="#00ffff" strokeWidth="0.5" opacity="0.4" />
                </>
              )}
              {isHovered && !isTarget && (
                <circle r={dotSize + 5} fill="none" stroke="#ffffff33" strokeWidth="1" />
              )}
              {isGate ? (
                <polygon points={`0,${-dotSize - 1} ${dotSize + 1},0 0,${dotSize + 1} ${-dotSize - 1},0`}
                  fill="#44ff88" stroke="#44ff8888" strokeWidth="0.5" />
              ) : isWarp ? (
                <polygon points={`0,${-dotSize - 1} ${dotSize + 1},0 0,${dotSize + 1} ${-dotSize - 1},0`}
                  fill="#8855ff" stroke="#8855ff88" strokeWidth="0.5" />
              ) : isStation ? (
                <rect x={-dotSize} y={-dotSize} width={dotSize * 2} height={dotSize * 2}
                  fill="#00ff88" rx="1" />
              ) : (
                <circle r={dotSize} fill={body.color || PLANET_TYPE_COLORS[body.planetType] || '#888'} />
              )}
              <text
                x={dotSize + 5} y={1}
                fill={isTarget ? '#00ffff' : isHovered ? '#ffffff' : '#778899'}
                fontSize="9"
                dominantBaseline="middle"
                style={{ pointerEvents: 'none' }}
              >
                {body.name}
              </text>
            </g>
          );
        })}

        {/* Scanner pins (asteroids + enemies + ghosts). Rendered after
            orbits/bodies but before the ship + autopilot line so the
            ship's own glow reads on top. */}
        {scannerData?.scannedAsteroids?.map(a => (
          <circle
            key={`ast-${a.id}`}
            cx={a.x * mapScale}
            cy={a.y * mapScale}
            r={1.5}
            fill="#a0c860"
            opacity={0.7}
          />
        ))}
        {scannerData?.liveEnemies?.map(e => (
          <g key={`live-${e.id}`} transform={`translate(${e.x * mapScale}, ${e.y * mapScale})`}>
            <circle r={5} fill="#ef444433" />
            <circle r={2.5} fill="#ef4444" stroke="#fff" strokeWidth="0.4" />
            {/* Crosshair tick so live enemies read distinct from bodies */}
            <line x1="-3.5" y1="0" x2="-1.5" y2="0" stroke="#ef4444" strokeWidth="0.5" />
            <line x1="1.5"  y1="0" x2="3.5"  y2="0" stroke="#ef4444" strokeWidth="0.5" />
            <line x1="0" y1="-3.5" x2="0" y2="-1.5" stroke="#ef4444" strokeWidth="0.5" />
            <line x1="0" y1="1.5"  x2="0" y2="3.5"  stroke="#ef4444" strokeWidth="0.5" />
          </g>
        ))}
        {scannerData?.enemyGhosts?.map(g => {
          // Fade linearly with age: full opacity at lastSeen, 0 at TTL.
          const age = Date.now() - g.lastSeenMs;
          const fade = Math.max(0, 1 - age / GHOST_TTL_MS);
          return (
            <g key={`ghost-${g.id}`} transform={`translate(${g.x * mapScale}, ${g.y * mapScale})`} opacity={fade}>
              <circle r={3} fill="none" stroke="#ef4444" strokeWidth="0.5" strokeDasharray="2,2" />
              <text x={4} y={3} fill="#ef444499" fontSize="6" style={{ pointerEvents: 'none' }}>
                ? {g.name}
              </text>
            </g>
          );
        })}

        {/* Sensor range ring -- faint, just enough to show the player
            "what I can see right now." Doesn't move with the ship in
            the map's coord space because the ship is plotted at its
            absolute system position. */}
        {scannerData?.sensorRange > 0 && (
          <circle
            cx={shipScreenX} cy={shipScreenY}
            r={scannerData.sensorRange * mapScale}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="0.4"
            strokeDasharray="3,3"
            opacity="0.25"
          />
        )}

        {/* Sensor sweep ping waves -- mirror of SystemView's overlay,
            same 3-wave / 4s cadence. Renders waves at the fleet
            position in map coords (shipScreenX/Y already projected).
            Max radius = covers the visible map (half the map size). */}
        {sweepStartedAt > 0 && (() => {
          const elapsed = Date.now() - sweepStartedAt;
          const WAVE_DURATION = SWEEP_PING_INTERVAL_MS;
          const MAX_R = MAP_SIZE * 0.6;
          const waves = [];
          for (let i = 0; i < SWEEP_PING_COUNT; i++) {
            const age = elapsed - i * SWEEP_PING_INTERVAL_MS;
            if (age < 0 || age > WAVE_DURATION) continue;
            const t = age / WAVE_DURATION;
            const r = t * MAX_R;
            waves.push(
              <g key={`sweep-${i}`} style={{ pointerEvents: 'none' }}>
                <circle cx={shipScreenX} cy={shipScreenY} r={r} fill="none"
                  stroke="#fbbf24" strokeWidth={1.5 * (1 - t)} opacity={0.6 * (1 - t)} />
                <circle cx={shipScreenX} cy={shipScreenY} r={r} fill="none"
                  stroke="#fde68a" strokeWidth={0.6 * (1 - t)} opacity={0.9 * (1 - t)} />
              </g>
            );
          }
          return waves;
        })()}

        {/* Ship */}
        <g transform={`translate(${shipScreenX}, ${shipScreenY})`}>
          <circle r="6" fill="#00ff8822" />
          <circle r="3" fill="#00ff88" />
        </g>

        {/* Autopilot line */}
        {autopilotTarget && (() => {
          const target = bodyData.find(d => d.body.id === autopilotTarget.id);
          if (!target) return null;
          return (
            <line
              x1={shipScreenX} y1={shipScreenY}
              x2={target.screenX} y2={target.screenY}
              stroke="#00ffff" strokeWidth="0.8"
              strokeDasharray="4,4" opacity="0.5"
            />
          );
        })()}
      </svg>

      {hoveredBody && (() => {
        const data = bodyData.find(d => d.body.id === hoveredBody.id);
        if (!data) return null;
        return (
          <BodyTooltip
            body={hoveredBody}
            distance={data.distance}
            shipSpeed={shipSpeed}
            x={mousePos.x}
            y={mousePos.y}
            mapSize={MAP_SIZE}
          />
        );
      })()}
    </div>
  );
};

// ============================================
// MAIN PANE
// ============================================

const PANE_WIDTH  = 700;   // ~MAP_SIZE 442 + ~220 bodies list + gaps
const PANE_HEIGHT = 540;   // ~MAP_SIZE 442 + header + autopilot status

// Re-renders host once a second; cheap, used here so ghost fade
// opacities recompute smoothly without waiting on the parent's data
// push cadence (~6Hz from SystemView).
const useSecondTick = () => {
  const [, setNow] = useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
};

// Sweep wave timing -- mirror of the constants in SystemView so the
// map's 3-wave ping animation aligns frame-for-frame with the main
// view's. Held here so SystemMapWindow doesn't import SystemView.
const SWEEP_PING_INTERVAL_MS = 4000;
const SWEEP_PING_COUNT = 3;
const SWEEP_PING_TOTAL_MS = SWEEP_PING_INTERVAL_MS * SWEEP_PING_COUNT;

// Drives smooth (~30fps) re-renders WHILE a sweep ping is propagating.
// Idle the rest of the time so we don't burn frames on a static map.
// `sweepStartedAt` from the store flips on at activation; this hook
// kicks off the interval whenever that value changes to a future-ish
// timestamp.
const useSweepTick = (sweepStartedAt) => {
  const [, setNow] = useState(Date.now());
  React.useEffect(() => {
    if (!sweepStartedAt) return;
    const endAt = sweepStartedAt + SWEEP_PING_TOTAL_MS;
    if (Date.now() >= endAt) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= endAt) clearInterval(t);
    }, 33);
    return () => clearInterval(t);
  }, [sweepStartedAt]);
};

export const SystemMapWindow = () => {
  useSecondTick();
  const isOpen = useGameStore(state => state.windows.systemMap?.open);
  const closeWindow = useGameStore(state => state.closeWindow);
  const viewMode = useGameStore(state => state.viewMode);
  const currentSystemId = useGameStore(state => state.currentSystem) || 'sol';
  const autopilotTarget = useGameStore(state => state.autopilotTarget);
  const setAutopilotTarget = useGameStore(state => state.setAutopilotTarget);
  const shipPosition = useGameStore(state => state.shipPosition);
  const shipSpeed = useGameStore(state => state.shipSpeed);
  const time = useGameStore(state => state.gameTime);
  const scannerData = useGameStore(state => state.scannerData);
  // Sensor sweep activation time mirrored from SystemView (gameStore
  // bridge). When non-zero, SystemMapSvg renders the 3-wave ping
  // animation at the fleet position on the top-down map in sync with
  // SystemView's main-view animation + sonar audio.
  const sweepStartedAt = useGameStore(state => state.sweepStartedAt);
  const showRangeOverlay = useGameStore(state => state.showRangeOverlay);
  const toggleRangeOverlay = useGameStore(state => state.toggleRangeOverlay);

  const inSystem = viewMode === 'system';

  const system = useMemo(() => {
    if (!inSystem) return null;
    if (currentSystemId === 'sol') return SOL_SYSTEM;
    const galaxy = getGalaxy();
    const galaxySys = galaxy.systemMap[currentSystemId];
    if (!galaxySys) return SOL_SYSTEM;
    return generateSystemContent(galaxySys) || SOL_SYSTEM;
  }, [inSystem, currentSystemId]);

  const handleClickBody = useCallback((body) => {
    if (body.type === 'asteroid_belt') return;
    setAutopilotTarget({ id: body.id, name: body.name, type: body.type });
  }, [setAutopilotTarget]);

  const handleCancelAutopilot = useCallback(() => {
    setAutopilotTarget(null);
  }, [setAutopilotTarget]);

  if (!isOpen) return null;

  // Pre-compute distances for the bodies list + autopilot status row.
  // Cheap; one pass per render. Sorted by distance so the closest
  // body is at the top -- matches what a navigator wants.
  const bodyData = system
    ? system.bodies
        .filter(b => b.type !== 'asteroid_belt')
        .map(body => {
          const pos = getBodyPos(body, time, system.bodies);
          const dx = pos.x - shipPosition.x;
          const dy = pos.y - shipPosition.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          return { body, distance };
        })
        .sort((a, b) => a.distance - b.distance)
    : [];

  const targetData = autopilotTarget
    ? bodyData.find(d => d.body.id === autopilotTarget.id)
    : null;

  return (
    <div
      className="fixed z-30"
      style={{
        right: 8,
        bottom: 88,            // clears the toggle button (bottom: 40 + height: 38 + 10 gap)
        width: PANE_WIDTH,
        height: PANE_HEIGHT,
      }}
    >
      {/* Border layer */}
      <div style={{ position: 'absolute', inset: -1, clipPath: diagMix(6), background: EDGE, zIndex: 0 }} />

      {/* Panel */}
      <div style={{
        position: 'relative',
        clipPath: diagMix(6),
        background: PANEL_BG,
        zIndex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: F,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '6px 10px',
          borderBottom: `1px solid ${EDGE}`,
          background: `linear-gradient(90deg, ${BLUE.pri}25, transparent)`,
          flexShrink: 0,
          gap: 8,
        }}>
          <span style={{ fontSize: '0.75rem' }}>🗺️</span>
          <span style={{
            fontSize: '0.6875rem', fontWeight: 800, color: BLUE.light,
            letterSpacing: 2, flex: 1, textTransform: 'uppercase',
          }}>
            System Map{system ? ` · ${system.name}` : ''}
          </span>
          {/* Scan / sensor range overlay toggle. Draws dashed rings
              around the primary ship on the main gameplay canvas --
              blue = sensor range, green = asteroid scan range. Useful
              for judging "can I scan that asteroid from here?" + "will
              that pirate become visible if I close another 100 px?" */}
          <button
            onClick={toggleRangeOverlay}
            title={showRangeOverlay ? 'Hide range overlay on gameplay canvas' : 'Show sensor + scan range rings on gameplay canvas'}
            style={{
              background: showRangeOverlay ? `${BLUE.pri}25` : 'transparent',
              border: `1px solid ${showRangeOverlay ? BLUE.pri : EDGE}`,
              color: showRangeOverlay ? BLUE.light : '#7a8a9a',
              padding: '3px 9px',
              cursor: 'pointer',
              borderRadius: 2,
              fontSize: '0.9rem',
              fontFamily: F,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            {showRangeOverlay ? '◉ Range Visible' : '◎ View Scan Range'}
          </button>
          <button
            onClick={() => closeWindow('systemMap')}
            style={{
              background: 'none', border: 'none', color: '#3a5a6a',
              cursor: 'pointer', fontSize: '0.75rem', fontFamily: F,
            }}
            title="Hide System Map"
          >✕</button>
        </div>

        {/* Body: map (left) + bodies list (right) */}
        {!inSystem ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#3a5a6a', fontSize: '0.6875rem', fontFamily: F, fontStyle: 'italic',
            textAlign: 'center', padding: '0 32px',
          }}>
            <div>
              <div style={{ fontSize: '1.75rem', marginBottom: 10, opacity: 0.6 }}>⟡</div>
              <div style={{ color: '#5a7080' }}>You're in interstellar space.</div>
              <div style={{ marginTop: 4, color: '#3a5a6a' }}>
                Enter a system to see its map + bodies here.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            {/* Map */}
            <div style={{
              flexShrink: 0,
              padding: 10,
              borderRight: `1px solid ${EDGE}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <SystemMapSvg
                system={system}
                time={time}
                shipPosition={shipPosition}
                shipSpeed={shipSpeed}
                autopilotTarget={autopilotTarget}
                onClickBody={handleClickBody}
                scannerData={scannerData}
                sweepStartedAt={sweepStartedAt}
              />
            </div>

            {/* Bodies list */}
            <div style={{
              flex: 1, minWidth: 0,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '8px 12px 4px',
                fontSize: '0.9rem', fontFamily: FM,
                color: GOLD.light,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                fontWeight: 700,
              }}>
                Bodies · {bodyData.length}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '2px 0 6px' }}>
                {bodyData.map(({ body, distance }) => {
                  const isTarget = autopilotTarget?.id === body.id;
                  const dotColor = body.color
                    || PLANET_TYPE_COLORS[body.planetType]
                    || (body.type === 'station' ? '#00ff88'
                        : body.type === 'jump_gate' ? '#44ff88'
                        : body.type === 'warp_point' ? '#8855ff'
                        : '#888');
                  return (
                    <div
                      key={body.id}
                      onClick={() => handleClickBody(body)}
                      title={`Set autopilot → ${body.name}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '5px 12px',
                        marginLeft: 4,
                        cursor: 'pointer',
                        background: isTarget ? `${BLUE.pri}10` : 'transparent',
                        borderLeft: isTarget ? `2px solid ${BLUE.pri}66` : '2px solid transparent',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isTarget) e.currentTarget.style.background = 'rgba(45,212,191,0.04)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isTarget) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{
                        width: 8, height: 8,
                        borderRadius: '50%',
                        background: dotColor,
                        boxShadow: `0 0 4px ${dotColor}88`,
                        flexShrink: 0,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '0.6875rem',
                          color: '#cbd5e1',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>{body.name}</div>
                        <div style={{
                          fontSize: '0.9rem', color: '#5a7080', fontFamily: FM,
                          letterSpacing: 0.3,
                        }}>
                          {BODY_TYPE_LABEL[body.type] || body.type} · {formatDistance(distance)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Autopilot status footer (mirrors NavigationWindow's row) */}
        <div style={{
          padding: '6px 12px',
          borderTop: `1px solid ${EDGE}`,
          fontSize: '0.9rem',
          color: '#5a7080',
          fontFamily: FM,
          flexShrink: 0,
          display: 'flex', alignItems: 'center',
        }}>
          {autopilotTarget && targetData ? (
            <>
              <span style={{ color: '#22d3ee', marginRight: 6 }}>◈</span>
              <span style={{ color: '#67e8f9', flex: 1 }}>
                Autopilot → {autopilotTarget.name} · {formatDistance(targetData.distance)} · {formatTravelTime(targetData.distance, shipSpeed)}
              </span>
              <button
                onClick={handleCancelAutopilot}
                style={{
                  background: 'rgba(127,29,29,0.3)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#fca5a5',
                  padding: '2px 10px',
                  cursor: 'pointer',
                  borderRadius: 2,
                  fontSize: '0.9rem',
                  fontFamily: F,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <span style={{ flex: 1, textAlign: 'center', color: '#3a5a6a' }}>
              {inSystem ? 'Click a body to set autopilot' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemMapWindow;
