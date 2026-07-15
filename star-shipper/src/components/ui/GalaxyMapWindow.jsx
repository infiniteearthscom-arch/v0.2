// Galaxy Map Window
// Full galaxy overview — same visual style as GalaxyFlightView.
// Can zoom all the way out to see entire galaxy.
// Click a system to set autopilot in galaxy flight mode.

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useGameStore } from '@/stores/gameStore';
import { generateGalaxy, FACTIONS } from '@/utils/galaxyGenerator';
import { tierColor, tierLabel } from '@/utils/tiers';
import presence from '@/utils/presence';
import { galaxyAPI } from '@/utils/api';

// ============================================
// CONSTANTS
// ============================================
const GALAXY_SEED = 12345;
const SYSTEM_COUNT = 200;

const STAR_COLORS = {
  red_dwarf: '#ff6644', yellow_star: '#ffdd44', orange_star: '#ffaa33',
  blue_giant: '#4499ff', white_dwarf: '#eeeeff', neutron_star: '#88ccff', black_hole: '#8844aa',
};
const STAR_SIZES = {
  red_dwarf: 4, yellow_star: 6, orange_star: 5,
  blue_giant: 9, white_dwarf: 4, neutron_star: 3, black_hole: 7,
};
const FACTION_COLORS = {
  terran_accord: '#4488ff', free_merchants: '#ffaa22',
  astral_collective: '#aa44ff', void_reavers: '#ff4444',
};

// ============================================
// GALAXY DATA (cached)
// ============================================
let _cachedGalaxy = null;
const getGalaxy = () => {
  if (!_cachedGalaxy) _cachedGalaxy = generateGalaxy(GALAXY_SEED, SYSTEM_COUNT);
  return _cachedGalaxy;
};

// Seeded random for background stars
class SRng {
  constructor(seed) { this.seed = seed; }
  next() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  range(a, b) { return a + this.next() * (b - a); }
}

// ============================================
// MAIN COMPONENT
// ============================================
export const GalaxyMapWindow = () => {
  const windows = useGameStore(state => state.windows);
  const isOpen = windows.galaxyMap?.open;

  const currentSystemId = useGameStore(state => state.currentSystem) || 'sol';
  const viewMode = useGameStore(state => state.viewMode);
  const galaxyShipPosition = useGameStore(state => state.galaxyShipPosition);
  const galaxyAutopilotTarget = useGameStore(state => state.galaxyAutopilotTarget);
  const setGalaxyAutopilotTarget = useGameStore(state => state.setGalaxyAutopilotTarget);
  const setAutopilotTarget = useGameStore(state => state.setAutopilotTarget);
  const setPendingJump = useGameStore(state => state.setPendingJump);
  const discoveredSystems = useGameStore(state => state.discoveredSystems);
  const closeWindow = useGameStore(state => state.closeWindow);

  const galaxy = useMemo(() => getGalaxy(), []);
  const systems = galaxy.systems;

  // Jump connections (Tier C fog of war: only render if at least one
  // endpoint is discovered, so the player can see "I can jump there
  // from here" but undiscovered far-side systems stay implicit).
  const discoveredSet = useMemo(() => new Set(discoveredSystems), [discoveredSystems]);
  const connections = useMemo(() => {
    const conns = [];
    for (const sys of systems) {
      if (!sys.hasJumpGate) continue;
      for (const tid of sys.jumpConnections) {
        const t = galaxy.systemMap[tid];
        if (t && sys.id < tid && (discoveredSet.has(sys.id) || discoveredSet.has(tid))) {
          conns.push([sys, t]);
        }
      }
    }
    return conns;
  }, [systems, galaxy.systemMap, discoveredSet]);

  // Background stars
  const bgStars = useMemo(() => {
    const rng = new SRng(777);
    const stars = [];
    for (let i = 0; i < 400; i++) {
      stars.push({ x: rng.range(-6000, 6000), y: rng.range(-6000, 6000), r: rng.range(0.3, 1.2), opacity: rng.range(0.1, 0.4) });
    }
    return stars;
  }, []);

  // Camera state — world coordinates
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.58);
  const [hoveredSystem, setHoveredSystem] = useState(null);
  const [selectedSystem, setSelectedSystem] = useState(null);

  // Live presence stats -- map shows "N pilots" per system. Drives info
  // panel + the small badge next to the star dot (when count > 0).
  const [onlineStats, setOnlineStats] = useState(() => presence.getOnlineStats());
  useEffect(() => {
    if (!presence.isEnabled()) return;
    setOnlineStats(presence.getOnlineStats());
    return presence.on('stats_changed', (s) => setOnlineStats(s));
  }, []);
  const bySystem = onlineStats.by_system || {};

  // Discovered-by attribution -- system id -> username of the first
  // pilot to enter it. Refetched on open + whenever our own discovery
  // count grows, so a fresh find shows attribution without a reopen.
  const [discoverers, setDiscoverers] = useState({});
  useEffect(() => {
    if (!isOpen) return;
    galaxyAPI.discoverers()
      .then(r => setDiscoverers(r.discoverers || {}))
      .catch(() => {});
  }, [isOpen, discoveredSet.size]);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const cameraStart = useRef({ x: 0, y: 0 });
  // rAF batching for pan + wheel (one state commit per frame max).
  const inputRafRef = useRef(0);
  const camPendingRef = useRef(null);
  const wheelPendingRef = useRef(null);
  const svgRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });

  // Resize observer
  useEffect(() => {
    const updateSize = () => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setViewportSize({ width: rect.width, height: rect.height });
        }
      }
    };
    updateSize();
    const obs = new ResizeObserver(updateSize);
    if (svgRef.current) obs.observe(svgRef.current);
    return () => obs.disconnect();
  }, [isOpen]);

  // Center on current system / ship on open
  useEffect(() => {
    if (isOpen) {
      if (viewMode === 'galaxy') {
        setCamera({ x: galaxyShipPosition.x, y: galaxyShipPosition.y });
      } else {
        const sys = galaxy.systemMap[currentSystemId];
        if (sys) setCamera({ x: sys.x, y: sys.y });
      }
    }
  }, [isOpen]);

  const uiScale = 1 / zoom;
  const selectedSys = selectedSystem;

  // Stable click handler so the memoized systems layer's closures stay
  // valid across renders (setState setters are identity-stable).
  const handleClickSystem = useCallback((sys) => {
    setSelectedSystem(sys);
  }, []);

  // ============================================
  // MEMOIZED RENDER LAYERS (perf)
  // --------------------------------------------
  // Panning only changes the svg viewBox; these layers don't depend on
  // the camera, so memoizing them means a drag re-render reconciles a
  // handful of stable elements instead of rebuilding ~1500 SVG nodes
  // per mousemove (the old choppiness). Zoom DOES invalidate them
  // (uiScale sizes everything) but is rAF-batched below.
  // ============================================

  const bgStarsLayer = useMemo(() => (
    <g>
      {bgStars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#aabbcc" opacity={s.opacity} />
      ))}
    </g>
  ), [bgStars]);

  const regionLayer = useMemo(() => (
    <g>
      {/* Region borders — the Voronoi cell polygons computed in the
          generator, drawn as faint tier-colored dashed lines so region
          territory reads at a glance. Fog-gated like the labels. */}
      {(galaxy.regions || []).map(reg => {
        const known = reg.systemIds.some(id => discoveredSet.has(id));
        if (!known || !reg.boundary || reg.boundary.length < 3) return null;
        return (
          <polygon key={`rb-${reg.id}`}
            points={reg.boundary.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={tierColor(reg.tier)}
            strokeWidth={1.2 * uiScale}
            strokeDasharray={`${10 * uiScale},${6 * uiScale}`}
            opacity={0.22}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}
      {/* Region name labels (EVE-style) — faint, tier-colored, at each
          region's centroid. Constant screen size via uiScale. */}
      {(galaxy.regions || []).map(reg => {
        const known = reg.systemIds.some(id => discoveredSet.has(id));
        if (!known) return null;
        return (
          <text key={reg.id}
            x={reg.cx} y={reg.cy}
            textAnchor="middle"
            fill={tierColor(reg.tier)}
            opacity={0.18}
            fontSize={26 * uiScale}
            fontFamily="'Rajdhani', sans-serif"
            fontWeight="800"
            letterSpacing={6 * uiScale}
            style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
          >
            {reg.name.toUpperCase()}
            <tspan fontSize={16 * uiScale} opacity={0.8}> · {tierLabel(reg.tier)}</tspan>
          </text>
        );
      })}
    </g>
  ), [galaxy.regions, discoveredSet, uiScale]);

  const connectionsLayer = useMemo(() => (
    <g>
      {connections.map(([a, b], i) => {
        const isHighlighted = selectedSys && (
          (a.id === currentSystemId && b.id === selectedSys.id) ||
          (b.id === currentSystemId && a.id === selectedSys.id)
        );
        // Constant SCREEN width via uiScale + a visible blue — the old
        // #1a3050 @ 0.3 opacity in raw world units was ~0.6px of
        // near-background color (user-reported invisible).
        return (
          <line key={i}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={isHighlighted ? '#00ff88' : '#4477aa'}
            strokeWidth={(isHighlighted ? 2 : 1.1) * uiScale}
            strokeDasharray={isHighlighted ? `${8 * uiScale},${4 * uiScale}` : `${5 * uiScale},${4 * uiScale}`}
            opacity={isHighlighted ? 0.8 : 0.45}
          />
        );
      })}
    </g>
  ), [connections, selectedSys, currentSystemId, uiScale]);

  const systemsLayer = useMemo(() => (
    <g>
      {systems.map(sys => {
        const discovered = discoveredSet.has(sys.id);
        // Tier C fog of war: undiscovered systems render as a
        // generic small gray dot with no faction halo, no star
        // glow, no name. Hovering an undiscovered system reveals
        // "Unknown System" so the player can still target it for
        // exploration (jump planning still works -- the player
        // just doesn't know what's there).
        const color = discovered ? (STAR_COLORS[sys.starType] || '#ffdd44') : '#5a6678';
        const size = (discovered ? (STAR_SIZES[sys.starType] || 5) : 3) * uiScale;
        const factionColor = discovered ? (FACTION_COLORS[sys.faction] || '#666') : null;
        const isCurrent = sys.id === currentSystemId;
        const isSelected = selectedSys?.id === sys.id;
        const isHovered = hoveredSystem?.id === sys.id;
        const isTarget = galaxyAutopilotTarget?.id === sys.id;
        const showLabel = (discovered && zoom > 0.12) || isCurrent || isSelected || isHovered || isTarget;

        return (
          <g key={sys.id}
            onClick={(e) => { e.stopPropagation(); handleClickSystem(sys); }}
            onMouseEnter={() => setHoveredSystem(sys)}
            onMouseLeave={() => setHoveredSystem(null)}
            style={{ cursor: 'pointer' }}
          >
            {/* Faction halo -- only on discovered systems
                (fog of war hides faction allegiance). */}
            {discovered && factionColor && (
              <circle cx={sys.x} cy={sys.y} r={size * 3}
                fill="none" stroke={factionColor} strokeWidth={1 * uiScale} opacity={0.15} />
            )}

            {/* Current system marker */}
            {isCurrent && (
              <circle cx={sys.x} cy={sys.y} r={size * 5}
                fill="none" stroke="#44ff88" strokeWidth={1.5 * uiScale}
                strokeDasharray={`${4 * uiScale},${3 * uiScale}`} opacity={0.6}
              >
                <animateTransform attributeName="transform" type="rotate"
                  from={`0 ${sys.x} ${sys.y}`} to={`360 ${sys.x} ${sys.y}`}
                  dur="6s" repeatCount="indefinite" />
              </circle>
            )}

            {/* Selected ring */}
            {isSelected && !isCurrent && (
              <circle cx={sys.x} cy={sys.y} r={size * 4}
                fill="none" stroke="#ffffff" strokeWidth={1.5 * uiScale} opacity={0.6} />
            )}

            {/* Autopilot target ring */}
            {isTarget && (
              <circle cx={sys.x} cy={sys.y} r={size * 4.5}
                fill="none" stroke="#00ff88" strokeWidth={1.5 * uiScale}
                strokeDasharray={`${3 * uiScale},${2 * uiScale}`} opacity={0.8}
              />
            )}

            {/* Hover highlight */}
            {isHovered && !isSelected && (
              <circle cx={sys.x} cy={sys.y} r={size * 3.5}
                fill="none" stroke={color} strokeWidth={1 * uiScale} opacity={0.5} />
            )}

            {/* Star glow -- discovered systems only. Radial gradient
                per star TYPE (7 shared defs), replacing the old
                per-system feGaussianBlur filter: 200 live blur
                filters re-rasterized on every pan/zoom frame and were
                the single biggest paint cost in the map. */}
            {discovered && (
              <circle cx={sys.x} cy={sys.y} r={size * 3}
                fill={`url(#gm-glow-${sys.starType})`} pointerEvents="none" />
            )}

            {/* Star dot */}
            <circle cx={sys.x} cy={sys.y} r={size}
              fill={color} opacity={discovered ? 1 : 0.4} />

            {/* Station marker -- discovered systems with at
                least one station get a small gold rect tucked
                next to the star dot. Fog-of-war keeps it
                hidden until the player has actually been there
                (sys.hasStation is precomputed but undiscovered
                systems shouldn't leak the fact). */}
            {discovered && sys.hasStation && (
              <g pointerEvents="none">
                <rect
                  x={sys.x + size + 1 * uiScale}
                  y={sys.y - (size + 2.5 * uiScale)}
                  width={3.5 * uiScale}
                  height={3.5 * uiScale}
                  fill="#fbbf24"
                  stroke="#451a03"
                  strokeWidth={0.4 * uiScale}
                  opacity={0.95}
                />
                <line
                  x1={sys.x + size + 1 * uiScale}
                  y1={sys.y - (size + 0.75 * uiScale)}
                  x2={sys.x + size + 4.5 * uiScale}
                  y2={sys.y - (size + 0.75 * uiScale)}
                  stroke="#451a03"
                  strokeWidth={0.4 * uiScale}
                />
              </g>
            )}

            {/* Label -- discovered systems show their real name;
                undiscovered show "Unknown" only when hovered /
                selected / autopilot-targeted (no static label
                noise filling the map). */}
            {showLabel && (
              <text x={sys.x} y={sys.y + size + 10 * uiScale}
                textAnchor="middle"
                fill={isCurrent ? '#44ff88' : isSelected ? '#ffffff' : isTarget ? '#00ff88' : discovered ? '#aabbcc' : '#556677'}
                fontSize={9 * uiScale} fontFamily="monospace"
                opacity={isCurrent || isSelected || isHovered ? 0.9 : 0.5}
              >
                {discovered ? sys.name : 'Unknown'}
              </text>
            )}

            {/* Population badge -- "N here" when at least one
                pilot is in this system room. Sits under the name
                label (or where the name would be, if none). Only
                drawn when count > 0 so empty systems stay clean. */}
            {bySystem[sys.id] > 0 && (
              <text
                x={sys.x}
                y={sys.y + size + (showLabel ? 19 : 10) * uiScale}
                textAnchor="middle"
                fill="#22d3ee"
                fontSize={8 * uiScale}
                fontFamily="monospace"
                opacity={0.85}
              >
                👥 {bySystem[sys.id]}
              </text>
            )}

            {/* Danger indicator -- drops down when the population
                badge is taking the row above. */}
            {showLabel && sys.dangerLevel >= 3 && (
              <text x={sys.x} y={sys.y + size + (bySystem[sys.id] > 0 ? 28 : 20) * uiScale}
                textAnchor="middle" fill="#ff4444"
                fontSize={7 * uiScale} fontFamily="monospace"
              >
                {'⚠'.repeat(Math.min(sys.dangerLevel, 5))}
              </text>
            )}

            {/* Clickable hitbox */}
            <circle cx={sys.x} cy={sys.y} r={Math.max(size * 4, 15 * uiScale)} fill="transparent" />
          </g>
        );
      })}
    </g>
  ), [systems, discoveredSet, uiScale, zoom, selectedSys, hoveredSystem, currentSystemId, galaxyAutopilotTarget, bySystem, handleClickSystem]);

  if (!isOpen) return null;

  // ViewBox — world coordinates
  const viewBox = {
    x: camera.x - (viewportSize.width / 2) / zoom,
    y: camera.y - (viewportSize.height / 2) / zoom,
    width: viewportSize.width / zoom,
    height: viewportSize.height / zoom,
  };

  // Input handlers — rAF-batched. Mouse/wheel events fire far faster
  // than the display refresh; committing state once per frame collapses
  // the bursts (the other half of the old choppiness).
  const handleWheel = (e) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    const factor = e.deltaY > 0 ? 0.85 : 1.18;
    const acc = wheelPendingRef.current;
    wheelPendingRef.current = {
      factor: (acc?.factor || 1) * factor,
      mx: e.clientX - (rect?.left || 0),
      my: e.clientY - (rect?.top || 0),
    };
    if (inputRafRef.current) return;
    inputRafRef.current = requestAnimationFrame(() => {
      inputRafRef.current = 0;
      const w = wheelPendingRef.current;
      wheelPendingRef.current = null;
      if (!w) return;
      // Zoom TO THE CURSOR: keep the world point under the pointer
      // fixed while the scale changes (the old version zoomed around
      // the screen center, which made "zoom into that cluster" a
      // zoom-then-drag-then-zoom dance).
      const newZoom = Math.max(0.01, Math.min(2.0, zoom * w.factor));
      const wx = camera.x + (w.mx - viewportSize.width / 2) / zoom;
      const wy = camera.y + (w.my - viewportSize.height / 2) / zoom;
      setZoom(newZoom);
      setCamera({
        x: wx - (w.mx - viewportSize.width / 2) / newZoom,
        y: wy - (w.my - viewportSize.height / 2) / newZoom,
      });
    });
  };
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    cameraStart.current = { ...camera };
  };
  const handleMouseMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    camPendingRef.current = {
      x: cameraStart.current.x - dx / zoom,
      y: cameraStart.current.y - dy / zoom,
    };
    if (inputRafRef.current) return;
    inputRafRef.current = requestAnimationFrame(() => {
      inputRafRef.current = 0;
      if (camPendingRef.current) setCamera(camPendingRef.current);
    });
  };
  const handleMouseUp = () => setDragging(false);

  const currentSys = galaxy.systemMap[currentSystemId];
  const canJump = viewMode === 'system' && selectedSys && selectedSys.id !== currentSystemId &&
    currentSys?.hasJumpGate && currentSys?.jumpConnections?.includes(selectedSys.id);

  return (
    <ModalOverlay windowId="galaxyMap" title="Galaxy Map" icon="🌌" accent="#8844ff">
      <div className="flex h-full gap-0">
        {/* Map area */}
        <div className="flex-1 relative overflow-hidden">
          <svg
            ref={svgRef}
            className="w-full h-full"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            style={{ cursor: dragging ? 'grabbing' : 'crosshair', background: '#030308' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setDragging(false); setHoveredSystem(null); }}
          >
            <defs>
              <radialGradient id="gm-center" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#112244" stopOpacity="0.4" />
                <stop offset="60%" stopColor="#0a1020" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#030308" stopOpacity="0" />
              </radialGradient>
              {/* Per-star-type glow gradients — 7 shared defs replace
                  the old feGaussianBlur filter that was applied to a
                  circle per discovered system (~200 live blur filters
                  re-rasterizing on every pan/zoom frame). */}
              {Object.entries(STAR_COLORS).map(([type, c]) => (
                <radialGradient key={type} id={`gm-glow-${type}`}>
                  <stop offset="0%" stopColor={c} stopOpacity="0.30" />
                  <stop offset="55%" stopColor={c} stopOpacity="0.10" />
                  <stop offset="100%" stopColor={c} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>

            {/* Galaxy core glow */}
            <circle cx={0} cy={0} r={3000} fill="url(#gm-center)" />

            {/* Memoized layers — see the MEMOIZED RENDER LAYERS block
                above. Panning only changes the svg viewBox attribute;
                these elements are reference-stable so React skips
                them entirely during a drag. */}
            {bgStarsLayer}
            {regionLayer}
            {connectionsLayer}

            {systemsLayer}

            {/* Galaxy autopilot line */}
            {viewMode === 'galaxy' && galaxyAutopilotTarget && (() => {
              const target = galaxy.systemMap[galaxyAutopilotTarget.id];
              if (!target) return null;
              return (
                <line
                  x1={galaxyShipPosition.x} y1={galaxyShipPosition.y}
                  x2={target.x} y2={target.y}
                  stroke="#00ff88" strokeWidth={1.5 * uiScale}
                  strokeDasharray={`${6 * uiScale},${4 * uiScale}`} opacity={0.5}
                />
              );
            })()}

            {/* Ship position (galaxy flight mode) */}
            {viewMode === 'galaxy' && (
              <g>
                <circle cx={galaxyShipPosition.x} cy={galaxyShipPosition.y}
                  r={6 * uiScale} fill="#00ffcc" opacity={0.3}>
                  <animate attributeName="r" values={`${6 * uiScale};${10 * uiScale};${6 * uiScale}`}
                    dur="1.5s" repeatCount="indefinite" />
                </circle>
                <circle cx={galaxyShipPosition.x} cy={galaxyShipPosition.y}
                  r={3 * uiScale} fill="#00ffcc" />
                <text x={galaxyShipPosition.x} y={galaxyShipPosition.y - 10 * uiScale}
                  textAnchor="middle" fill="#00ffcc" fontSize={8 * uiScale} fontFamily="monospace">
                  YOU
                </text>
              </g>
            )}
          </svg>

          {/* Zoom display */}
          <div className="absolute bottom-2 left-2 text-[0.9rem] text-slate-600 font-mono">
            {galaxy.stats?.totalSystems || systems.length} systems · Scroll to zoom · Drag to pan
          </div>
        </div>

        {/* Info panel */}
        <div className="w-[200px] border-l border-slate-700/50 bg-slate-900/50 p-3 overflow-y-auto flex-shrink-0">
          {selectedSys ? (() => {
            const isDiscovered = discoveredSet.has(selectedSys.id);
            const refPos = viewMode === 'galaxy' ? galaxyShipPosition : (currentSys || { x: 0, y: 0 });
            const dist = Math.round(Math.sqrt(
              (selectedSys.x - refPos.x) ** 2 + (selectedSys.y - refPos.y) ** 2
            ));
            return (
            <div className="space-y-2">
              <div className="text-sm font-medium text-cyan-200">
                {isDiscovered ? selectedSys.name : 'Unknown System'}
              </div>

              {!isDiscovered && (
                <div className="text-[0.9rem] text-slate-500 italic">
                  Unsurveyed. Warp in to reveal star type, faction, resources, and jump connections.
                </div>
              )}

              <div className="space-y-1 text-[0.9rem]">
                {isDiscovered && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Star Type</span>
                      <span style={{ color: STAR_COLORS[selectedSys.starType] }}>
                        {selectedSys.starType.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Faction</span>
                      <span style={{ color: FACTION_COLORS[selectedSys.faction] }}>
                        {FACTIONS[selectedSys.faction]?.name || selectedSys.faction}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Region</span>
                      <span style={{ color: tierColor(selectedSys.regionTier) }}>
                        {selectedSys.regionName} · Tier {tierLabel(selectedSys.regionTier)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Danger</span>
                      <span className="text-yellow-400">
                        {'★'.repeat(selectedSys.dangerLevel)}{'☆'.repeat(5 - selectedSys.dangerLevel)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Jump Gate</span>
                      <span className={selectedSys.hasJumpGate ? 'text-green-400' : 'text-slate-600'}>
                        {selectedSys.hasJumpGate ? `Yes (${selectedSys.jumpConnections.length} links)` : 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Station</span>
                      <span className={selectedSys.hasStation ? 'text-amber-400' : 'text-slate-600'}>
                        {selectedSys.hasStation ? 'Yes' : 'None'}
                      </span>
                    </div>
                    {discoverers[selectedSys.id] && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Discovered by</span>
                        <span className="text-cyan-300">{discoverers[selectedSys.id]}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Distance</span>
                  <span className="text-slate-300">{dist} ly</span>
                </div>
                {/* Pilots here -- shows even when 0 so the player can
                    distinguish "verified empty" from "data not loaded
                    yet." Discovered-or-undiscovered doesn't matter:
                    presence rooms are keyed by system id, so the count
                    is authoritative regardless of fog of war. */}
                <div className="flex justify-between">
                  <span className="text-slate-500">Pilots Here</span>
                  <span className={bySystem[selectedSys.id] > 0 ? 'text-cyan-300 font-bold' : 'text-slate-600'}>
                    {bySystem[selectedSys.id] || 0}
                  </span>
                </div>
              </div>

              {/* Resource profile -- discovered only. */}
              {isDiscovered && selectedSys.resourceProfile && (
                <div className="space-y-1 pt-1 border-t border-slate-700/30">
                  <div className="text-[0.9rem] text-slate-600 uppercase tracking-wider">Resources</div>
                  {Object.entries(selectedSys.resourceProfile).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-[0.9rem] text-slate-500 w-12 capitalize">{key}</span>
                      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-500/60"
                          style={{ width: `${Math.min(100, val * 50)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Jump connections -- discovered only. */}
              {isDiscovered && selectedSys.hasJumpGate && selectedSys.jumpConnections.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-slate-700/30">
                  <div className="text-[0.9rem] text-slate-600 uppercase tracking-wider">Jump Connections</div>
                  {selectedSys.jumpConnections.map(connId => {
                    const conn = galaxy.systemMap[connId];
                    if (!conn) return null;
                    const connDiscovered = discoveredSet.has(connId);
                    return (
                      <div key={connId}
                        className="text-[0.9rem] text-slate-400 hover:text-cyan-300 cursor-pointer"
                        onClick={() => setSelectedSystem(conn)}
                      >
                        → {connDiscovered ? conn.name : 'Unknown'}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-1 pt-2">
                {viewMode === 'galaxy' && selectedSys.id !== currentSystemId && (
                  <button
                    onClick={() => {
                      setGalaxyAutopilotTarget({ id: selectedSys.id, name: selectedSys.name });
                    }}
                    className="w-full px-3 py-2 rounded text-xs font-medium bg-cyan-700/30 text-cyan-300 border border-cyan-600/40 hover:bg-cyan-700/50 transition-colors"
                  >
                    🚀 Fly to {selectedSys.name}
                  </button>
                )}
                {viewMode === 'system' && canJump && (
                  <button
                    onClick={() => {
                      setPendingJump(selectedSys.id);
                      setAutopilotTarget({ id: 'jump_gate', name: 'Jump Gate', type: 'jump_gate' });
                    }}
                    className="w-full px-3 py-2 rounded text-xs font-medium bg-green-700/30 text-green-300 border border-green-600/40 hover:bg-green-700/50 transition-colors"
                  >
                    ⚡ Jump to {selectedSys.name}
                  </button>
                )}
                {viewMode === 'system' && selectedSys.id !== currentSystemId && !canJump && (
                  <div className="text-[0.9rem] text-slate-600 text-center py-1">
                    {!currentSys?.hasJumpGate
                      ? 'No jump gate in current system'
                      : !selectedSys.hasJumpGate
                        ? 'No jump gate in target system'
                        : 'Not directly connected'}
                  </div>
                )}
              </div>
            </div>
            );
          })() : (
            <div className="text-center py-8">
              <div className="text-xs text-slate-500 mb-2">Click a system to inspect</div>
              <div className="text-[0.9rem] text-slate-600 space-y-1">
                <div>Scroll to zoom</div>
                <div>Drag to pan</div>
              </div>

              {/* Legend */}
              <div className="mt-6 space-y-1.5 text-left">
                <div className="text-[0.9rem] text-slate-600 uppercase tracking-wider mb-2">Factions</div>
                {Object.entries(FACTIONS).map(([id, f]) => (
                  <div key={id} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                    <span className="text-[0.9rem] text-slate-400">{f.name}</span>
                  </div>
                ))}
                <div className="text-[0.9rem] text-slate-600 uppercase tracking-wider mt-3 mb-2">Star Types</div>
                {Object.entries(STAR_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[0.9rem] text-slate-400">{type.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
};
