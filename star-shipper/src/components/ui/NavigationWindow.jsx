// Navigation Window
// System map for navigating between planets/stations
// Click a body to set autopilot destination

import React, { useState, useCallback, useMemo } from 'react';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { useGameStore } from '@/stores/gameStore';
import { generateGalaxy, generateSystemContent } from '@/utils/galaxyGenerator';

// ============================================
// SYSTEM DATA
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

// Galaxy singleton
const GALAXY_SEED = 12345;
let _navGalaxyCache = null;
const getGalaxy = () => {
  if (!_navGalaxyCache) _navGalaxyCache = generateGalaxy(GALAXY_SEED, 200);
  return _navGalaxyCache;
};

const STAR_COLORS = {
  red_dwarf: '#ff6644', orange_star: '#ffaa44', yellow_star: '#ffdd44',
  blue_giant: '#4488ff', white_dwarf: '#aabbcc', neutron_star: '#dd88ff', black_hole: '#664466',
};

const PLANET_TYPE_NAMES = {
  rocky: 'Rocky',
  terran: 'Terran',
  desert: 'Desert',
  ice: 'Ice',
  gas_giant: 'Gas Giant',
  ocean: 'Ocean',
  lava: 'Volcanic',
  barren: 'Barren',
  exotic: 'Exotic',
};

const PLANET_TYPE_COLORS = {
  rocky: '#888888', terran: '#4488aa', desert: '#ddaa66', ice: '#aaddff',
  gas_giant: '#ddaa77', ocean: '#2266aa', lava: '#ff4400', barren: '#555555', exotic: '#aa44ff',
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
  if (dist < 100) return `${Math.round(dist)}`;
  if (dist < 1000) return `${Math.round(dist)}`;
  return `${(dist / 1000).toFixed(1)}k`;
};

const formatTravelTime = (dist, speed) => {
  if (speed <= 0) return '—';
  const seconds = dist / Math.max(speed, 50); // Assume min 50 speed for estimate
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)}m`;
  return `~${(seconds / 3600).toFixed(1)}h`;
};

// ============================================
// TOOLTIP COMPONENT
// ============================================

const BodyTooltip = ({ body, distance, shipSpeed, x, y, mapSize }) => {
  // Position tooltip to avoid clipping edges
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
// MAIN COMPONENT
// ============================================

export const NavigationWindow = () => {
  const windows = useGameStore(state => state.windows);
  const isOpen = windows.navigation?.open;
  const autopilotTarget = useGameStore(state => state.autopilotTarget);
  const setAutopilotTarget = useGameStore(state => state.setAutopilotTarget);
  const shipPosition = useGameStore(state => state.shipPosition);
  const shipSpeed = useGameStore(state => state.shipSpeed);
  const time = useGameStore(state => state.gameTime);
  const currentSystemId = useGameStore(state => state.currentSystem) || 'sol';

  const [hoveredBody, setHoveredBody] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const handleClickBody = useCallback((body) => {
    if (body.type === 'asteroid_belt') return; // Can't fly to asteroid belt
    setAutopilotTarget({ id: body.id, name: body.name, type: body.type });
  }, [setAutopilotTarget]);

  const handleCancelAutopilot = useCallback(() => {
    setAutopilotTarget(null);
  }, [setAutopilotTarget]);

  // Dynamic system — Sol or procedurally generated
  const system = useMemo(() => {
    if (currentSystemId === 'sol') return SOL_SYSTEM;
    const galaxy = getGalaxy();
    const galaxySys = galaxy.systemMap[currentSystemId];
    if (!galaxySys) return SOL_SYSTEM;
    const content = generateSystemContent(galaxySys);
    return content || SOL_SYSTEM;
  }, [currentSystemId]);

  if (!isOpen) return null;

  const starColor = STAR_COLORS[system.starType] || '#ffdd44';
  const mapSize = 340;
  const maxOrbit = Math.max(...system.bodies.map(b => b.orbitRadius || 0));
  const mapScale = (mapSize * 0.45) / maxOrbit;

  // Calculate body positions and distances
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
    <ContextPanel windowId="navigation" title="Navigation" icon="🧭" accent="#60a5fa" width={400}>
      <div className="flex flex-col h-full">
        {/* Map */}
        <div className="relative flex-1 flex items-center justify-center">
          <div className="relative" style={{ width: mapSize, height: mapSize }}>
            <svg
              width={mapSize}
              height={mapSize}
              viewBox={`${-mapSize / 2} ${-mapSize / 2} ${mapSize} ${mapSize}`}
              className="cursor-crosshair"
              onMouseLeave={() => setHoveredBody(null)}
            >
              {/* Background */}
              <rect
                x={-mapSize / 2} y={-mapSize / 2}
                width={mapSize} height={mapSize}
                fill="#080812" rx="6"
              />

              {/* Orbit lines */}
              {system.bodies.map(body => {
                if (body.type === 'asteroid_belt') {
                  return (
                    <circle
                      key={`orbit-${body.id}`}
                      cx={0} cy={0}
                      r={body.orbitRadius * mapScale}
                      fill="none"
                      stroke="#444466"
                      strokeWidth="8"
                      opacity="0.2"
                    />
                  );
                }
                if (body.parentBody) return null; // Don't draw station orbits
                if (body.type === 'planet' || body.type === 'jump_gate' || body.type === 'warp_point') {
                  return (
                    <circle
                      key={`orbit-${body.id}`}
                      cx={0} cy={0}
                      r={body.orbitRadius * mapScale}
                      fill="none"
                      stroke={body.type === 'jump_gate' ? '#44ff8820' : body.type === 'warp_point' ? '#8855ff20' : '#223344'}
                      strokeWidth="0.5"
                      strokeDasharray={body.type === 'jump_gate' || body.type === 'warp_point' ? '2,4' : '3,3'}
                    />
                  );
                }
                return null;
              })}

              {/* Star */}
              <circle cx={0} cy={0} r={6} fill={starColor} />
              <circle cx={0} cy={0} r={10} fill={starColor + '15'} />

              {/* Bodies */}
              {bodyData.map(({ body, screenX, screenY }) => {
                if (body.type === 'asteroid_belt') return null;

                const isTarget = autopilotTarget?.id === body.id;
                const isHovered = hoveredBody?.id === body.id;
                const isStation = body.type === 'station';
                const isGate = body.type === 'jump_gate';
                const isWarp = body.type === 'warp_point';
                const dotSize = isStation || isGate || isWarp
                  ? 3
                  : Math.max(2.5, Math.min(6, body.size * mapScale * 0.12));

                return (
                  <g
                    key={body.id}
                    transform={`translate(${screenX}, ${screenY})`}
                    onClick={() => handleClickBody(body)}
                    onMouseEnter={(e) => {
                      setHoveredBody(body);
                      const rect = e.currentTarget.closest('svg').getBoundingClientRect();
                      setMousePos({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                      });
                    }}
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.closest('svg').getBoundingClientRect();
                      setMousePos({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                      });
                    }}
                    onMouseLeave={() => setHoveredBody(null)}
                    style={{ cursor: body.type === 'asteroid_belt' ? 'default' : 'pointer' }}
                  >
                    {/* Target ring */}
                    {isTarget && (
                      <>
                        <circle r={dotSize + 6} fill="none" stroke="#00ffff" strokeWidth="1.5" opacity="0.8">
                          <animate attributeName="r" values={`${dotSize + 5};${dotSize + 8};${dotSize + 5}`} dur="2s" repeatCount="indefinite" />
                        </circle>
                        <circle r={dotSize + 4} fill="none" stroke="#00ffff" strokeWidth="0.5" opacity="0.4" />
                      </>
                    )}

                    {/* Hover highlight */}
                    {isHovered && !isTarget && (
                      <circle r={dotSize + 4} fill="none" stroke="#ffffff33" strokeWidth="1" />
                    )}

                    {/* Body */}
                    {isGate ? (
                      <polygon
                        points={`0,${-dotSize - 1} ${dotSize + 1},0 0,${dotSize + 1} ${-dotSize - 1},0`}
                        fill="#44ff88"
                        stroke="#44ff8888"
                        strokeWidth="0.5"
                      />
                    ) : isWarp ? (
                      <polygon
                        points={`0,${-dotSize - 1} ${dotSize + 1},0 0,${dotSize + 1} ${-dotSize - 1},0`}
                        fill="#8855ff"
                        stroke="#8855ff88"
                        strokeWidth="0.5"
                      />
                    ) : isStation ? (
                      <rect
                        x={-dotSize} y={-dotSize}
                        width={dotSize * 2} height={dotSize * 2}
                        fill="#00ff88"
                        rx="1"
                      />
                    ) : (
                      <circle r={dotSize} fill={body.color || PLANET_TYPE_COLORS[body.planetType] || '#888'} />
                    )}

                    {/* Label */}
                    <text
                      x={dotSize + 4}
                      y={1}
                      fill={isTarget ? '#00ffff' : isHovered ? '#ffffff' : '#667788'}
                      fontSize="8"
                      dominantBaseline="middle"
                      style={{ pointerEvents: 'none' }}
                    >
                      {body.name}
                    </text>
                  </g>
                );
              })}

              {/* Ship position */}
              <g transform={`translate(${shipScreenX}, ${shipScreenY})`}>
                <circle r="5" fill="#00ff8822" />
                <circle r="2.5" fill="#00ff88" />
              </g>

              {/* Autopilot line */}
              {autopilotTarget && (() => {
                const target = bodyData.find(d => d.body.id === autopilotTarget.id);
                if (!target) return null;
                return (
                  <line
                    x1={shipScreenX} y1={shipScreenY}
                    x2={target.screenX} y2={target.screenY}
                    stroke="#00ffff"
                    strokeWidth="0.8"
                    strokeDasharray="4,4"
                    opacity="0.5"
                  />
                );
              })()}
            </svg>

            {/* Tooltip */}
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
                  mapSize={mapSize}
                />
              );
            })()}
          </div>
        </div>

        {/* Autopilot status bar */}
        <div className="border-t border-slate-700/50 pt-3 mt-2">
          {autopilotTarget ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 animate-pulse text-sm">◈</span>
                <div>
                  <div className="text-sm text-cyan-300">
                    Autopilot → {autopilotTarget.name}
                  </div>
                  {(() => {
                    const target = bodyData.find(d => d.body.id === autopilotTarget.id);
                    if (!target) return null;
                    return (
                      <div className="text-xs text-slate-500">
                        {formatDistance(target.distance)} away · {formatTravelTime(target.distance, shipSpeed)}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <button
                onClick={handleCancelAutopilot}
                className="px-3 py-1 rounded text-xs bg-red-900/30 border border-red-500/30 text-red-400 hover:bg-red-900/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="text-center text-xs text-slate-500">
              Click a planet to set autopilot destination
            </div>
          )}
        </div>
      </div>
    </ContextPanel>
  );
};

export default NavigationWindow;
