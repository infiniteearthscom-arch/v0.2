// Galaxy Flight View
// Interstellar flight between star systems. Same ship, same controls as SystemView
// but at galaxy scale. Star systems are the objects you fly between.
// Docking at a system enters the system view.

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { DraggableWindow } from '@/components/ui/DraggableWindow';
import { useGameStore, useActiveShip } from '@/stores/gameStore';
import { getShipIcon, FORMATION_OFFSETS, MAX_FLEET_SIZE, HULL_SHAPES } from '@/utils/shipRenderer';
import { generateGalaxy, FACTIONS as GALAXY_FACTIONS, STAR_DISPLAY } from '@/utils/galaxyGenerator';

// ============================================
// CONSTANTS
// ============================================
const GALAXY_SEED = 12345;
const SYSTEM_COUNT = 200;

// Ship physics — very slow, galaxy is vast
const BASE_SHIP_ACCELERATION = 12;
const SHIP_BRAKE_POWER = 40;
const BASE_SHIP_MAX_SPEED = 20;
const SHIP_DRAG = 0.985;
const BASE_SHIP_ROTATION_SPEED = 90;

// Galaxy view
const MIN_ZOOM = 2.0;
const MAX_ZOOM = 8.0;
const SYSTEM_DOCK_RANGE = 40;
// Ship scale is now dynamic: uiScale * 0.4 (proportional to zoom like stars)

// Faction colors
const FACTION_COLORS = {
  terran_accord: '#4488ff',
  free_merchants: '#ffaa22',
  astral_collective: '#aa44ff',
  void_reavers: '#ff4444',
};

// Star type display
const STAR_COLORS = {
  red_dwarf: '#ff6644',
  yellow_star: '#ffdd44',
  orange_star: '#ffaa33',
  blue_giant: '#4499ff',
  white_dwarf: '#eeeeff',
  neutron_star: '#88ccff',
  black_hole: '#8844aa',
};

const STAR_SIZES = {
  red_dwarf: 16, yellow_star: 24, orange_star: 20,
  blue_giant: 36, white_dwarf: 16, neutron_star: 12, black_hole: 28,
};

// ============================================
// GALAXY DATA (cached)
// ============================================
let _cachedGalaxy = null;
const getGalaxy = () => {
  if (!_cachedGalaxy) _cachedGalaxy = generateGalaxy(GALAXY_SEED, SYSTEM_COUNT);
  return _cachedGalaxy;
};

// ============================================
// SEEDED RANDOM (for consistent star rendering)
// ============================================
class SeededRandom {
  constructor(seed) { this.seed = seed; }
  next() { this.seed = (this.seed * 16807 + 0) % 2147483647; return this.seed / 2147483647; }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
}

// ============================================
// MAIN COMPONENT
// ============================================
export const GalaxyFlightView = () => {
  const viewMode = useGameStore(state => state.viewMode);
  const currentSystemId = useGameStore(state => state.currentSystem) || 'sol';
  const galaxyShipPosition = useGameStore(state => state.galaxyShipPosition);
  const galaxyAutopilotTarget = useGameStore(state => state.galaxyAutopilotTarget);
  const setGalaxyAutopilotTarget = useGameStore(state => state.setGalaxyAutopilotTarget);
  const updateGalaxyShipPosition = useGameStore(state => state.updateGalaxyShipPosition);
  const enterSystem = useGameStore(state => state.enterSystem);
  const discoveredSystems = useGameStore(state => state.discoveredSystems);
  
  const activeShip = useActiveShip();
  
  // Only render in galaxy mode
  if (viewMode !== 'galaxy') return null;
  
  // Galaxy data
  const galaxy = useMemo(() => getGalaxy(), []);
  const systems = galaxy.systems;
  
  // Jump connections for rendering
  const connections = useMemo(() => {
    const conns = [];
    for (const sys of systems) {
      if (!sys.hasJumpGate) continue;
      for (const targetId of sys.jumpConnections) {
        const target = galaxy.systemMap[targetId];
        if (target && sys.id < targetId) { // avoid duplicates
          conns.push([sys, target]);
        }
      }
    }
    return conns;
  }, [systems, galaxy.systemMap]);
  
  // Determine arrival type: jump_gate if connected, warp otherwise
  const getArrivalType = useCallback((targetSystemId) => {
    const origin = galaxy.systemMap[currentSystemId];
    const target = galaxy.systemMap[targetSystemId];
    if (origin?.hasJumpGate && target?.hasJumpGate && origin.jumpConnections?.includes(targetSystemId)) {
      return 'jump_gate';
    }
    return 'warp';
  }, [currentSystemId, galaxy.systemMap]);
  
  // Camera & zoom
  const [zoom, setZoom] = useState(2.0);
  const [isDragging, setIsDragging] = useState(false);
  const [followMode, setFollowMode] = useState(true);
  
  // Refs for game loop (no re-renders)
  const shipPosRef = useRef({ ...galaxyShipPosition });
  const shipVelRef = useRef({ x: 0, y: 0 });
  const shipRotationRef = useRef(-90);
  const thrustingRef = useRef(false);
  const cameraRef = useRef({ ...galaxyShipPosition });
  const keysPressed = useRef(new Set());
  const autopilotRef = useRef(null);
  const svgRef = useRef(null);
  const [frameCount, setFrameCount] = useState(0);
  const [hoveredSystem, setHoveredSystem] = useState(null);
  
  // Ship physics from active ship
  const shipPhysicsRef = useRef({
    SHIP_MAX_SPEED: BASE_SHIP_MAX_SPEED,
    SHIP_ACCELERATION: BASE_SHIP_ACCELERATION,
    SHIP_ROTATION_SPEED: BASE_SHIP_ROTATION_SPEED,
  });
  
  useEffect(() => {
    if (activeShip) {
      const speedMult = (activeShip.max_speed || 100) / 100;
      const agilityMult = (activeShip.agility || 100) / 100;
      shipPhysicsRef.current = {
        SHIP_MAX_SPEED: BASE_SHIP_MAX_SPEED * speedMult,
        SHIP_ACCELERATION: BASE_SHIP_ACCELERATION * speedMult,
        SHIP_ROTATION_SPEED: BASE_SHIP_ROTATION_SPEED * agilityMult,
      };
    }
  }, [activeShip]);
  
  // Sync autopilot ref
  useEffect(() => {
    autopilotRef.current = galaxyAutopilotTarget;
  }, [galaxyAutopilotTarget]);
  
  // Fleet ship icons — match SystemView pattern
  const ships = useGameStore(state => state.ships);
  const activeShipId = useGameStore(state => state.activeShipId);
  const fleetShips = useMemo(() => {
    if (!ships?.length) return [];
    const sorted = [...ships].sort((a, b) => (a.id === activeShipId ? -1 : b.id === activeShipId ? 1 : 0));
    return sorted.slice(0, MAX_FLEET_SIZE).map((ship, i) => {
      const hullId = ship.hull_type_id;
      const icon = getShipIcon(hullId);
      const hullData = HULL_SHAPES[hullId];
      return {
        id: ship.id,
        icon,
        isActive: ship.id === activeShipId,
        hullId,
        formationOffset: FORMATION_OFFSETS[i] || { x: 0, y: 0 },
        engineColor: hullData?.palette?.engine || '#00ccff',
      };
    });
  }, [ships, activeShipId]);
  
  // ============================================
  // GAME LOOP
  // ============================================
  useEffect(() => {
    let animationId;
    let lastTime = performance.now();
    
    const gameLoop = (currentTime) => {
      const delta = Math.min((currentTime - lastTime) / 1000, 0.05);
      lastTime = currentTime;
      
      const { SHIP_MAX_SPEED, SHIP_ACCELERATION, SHIP_ROTATION_SPEED } = shipPhysicsRef.current;
      
      const keys = keysPressed.current;
      const hasManualInput = keys.has('w') || keys.has('a') || keys.has('s') || keys.has('d') ||
                             keys.has('arrowup') || keys.has('arrowleft') || keys.has('arrowdown') || keys.has('arrowright');
      
      const target = autopilotRef.current;
      let isAutopiloting = target && !hasManualInput;
      
      let rotationInput = 0;
      let thrustInput = 0;
      let isBraking = false;
      
      if (isAutopiloting) {
        // Find target system
        const targetSys = galaxy.systemMap[target.id];
        if (targetSys) {
          const dx = targetSys.x - shipPosRef.current.x;
          const dy = targetSys.y - shipPosRef.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          const vel = shipVelRef.current;
          const currentSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
          
          if (distance < SYSTEM_DOCK_RANGE && currentSpeed < 30) {
            // Arrived! Enter the system
            shipVelRef.current = { x: 0, y: 0 };
            const arrival = getArrivalType(targetSys.id);
            setTimeout(() => {
              enterSystem(targetSys.id, arrival);
            }, 0);
            animationId = requestAnimationFrame(gameLoop);
            return;
          }
          
          // Navigate toward target
          const targetAngle = Math.atan2(dy, dx) * (180 / Math.PI);
          let angleDiff = targetAngle - shipRotationRef.current;
          while (angleDiff > 180) angleDiff -= 360;
          while (angleDiff < -180) angleDiff += 360;
          
          if (Math.abs(angleDiff) > 3) {
            const rotationStrength = Math.min(1, Math.abs(angleDiff) / 30);
            rotationInput = (angleDiff > 0 ? 1 : -1) * rotationStrength;
          }
          
          // Braking distance
          const brakingDistance = (currentSpeed * currentSpeed) / (2 * SHIP_BRAKE_POWER) + 60;
          
          if (distance < brakingDistance && currentSpeed > 30) {
            isBraking = true;
            thrustInput = 0;
          } else if (Math.abs(angleDiff) < 30) {
            thrustInput = 1;
          }
        }
      } else {
        // Manual controls
        if (keys.has('a') || keys.has('arrowleft')) rotationInput = -1;
        if (keys.has('d') || keys.has('arrowright')) rotationInput = 1;
        if (keys.has('w') || keys.has('arrowup')) thrustInput = 1;
        if (keys.has('s') || keys.has('arrowdown')) isBraking = true;
        
        if (hasManualInput && autopilotRef.current) {
          setTimeout(() => setGalaxyAutopilotTarget(null), 0);
        }
      }
      
      // Apply rotation
      shipRotationRef.current += rotationInput * SHIP_ROTATION_SPEED * delta;
      
      // Apply thrust
      if (thrustInput > 0) {
        const rad = shipRotationRef.current * (Math.PI / 180);
        shipVelRef.current.x += Math.cos(rad) * SHIP_ACCELERATION * delta;
        shipVelRef.current.y += Math.sin(rad) * SHIP_ACCELERATION * delta;
        thrustingRef.current = true;
      } else {
        thrustingRef.current = false;
      }
      
      // Braking
      if (isBraking) {
        const speed = Math.sqrt(shipVelRef.current.x ** 2 + shipVelRef.current.y ** 2);
        if (speed > 1) {
          const brakeFactor = Math.max(0, 1 - (SHIP_BRAKE_POWER * delta) / speed);
          shipVelRef.current.x *= brakeFactor;
          shipVelRef.current.y *= brakeFactor;
        } else {
          shipVelRef.current = { x: 0, y: 0 };
        }
      }
      
      // Speed cap
      const speed = Math.sqrt(shipVelRef.current.x ** 2 + shipVelRef.current.y ** 2);
      if (speed > SHIP_MAX_SPEED) {
        const scale = SHIP_MAX_SPEED / speed;
        shipVelRef.current.x *= scale;
        shipVelRef.current.y *= scale;
      }
      
      // Drag
      shipVelRef.current.x *= SHIP_DRAG;
      shipVelRef.current.y *= SHIP_DRAG;
      
      // Move ship
      shipPosRef.current.x += shipVelRef.current.x * delta;
      shipPosRef.current.y += shipVelRef.current.y * delta;
      
      // Camera follow
      if (followMode) {
        const lerpSpeed = 3 * delta;
        cameraRef.current.x += (shipPosRef.current.x - cameraRef.current.x) * lerpSpeed;
        cameraRef.current.y += (shipPosRef.current.y - cameraRef.current.y) * lerpSpeed;
      }
      
      // Update store periodically
      const currentSpd = Math.sqrt(shipVelRef.current.x ** 2 + shipVelRef.current.y ** 2);
      updateGalaxyShipPosition(shipPosRef.current.x, shipPosRef.current.y, currentSpd);
      
      // Trigger re-render
      setFrameCount(f => f + 1);
      
      animationId = requestAnimationFrame(gameLoop);
    };
    
    animationId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationId);
  }, [galaxy, followMode, enterSystem, setGalaxyAutopilotTarget, updateGalaxyShipPosition]);
  
  // ============================================
  // INPUT HANDLERS
  // ============================================
  useEffect(() => {
    const handleKeyDown = (e) => {
      keysPressed.current.add(e.key.toLowerCase());
      
      if (e.key === 'Escape' && autopilotRef.current) {
        setGalaxyAutopilotTarget(null);
      }
      
      // Enter key to dock at nearby system
      if (e.key === 'Enter') {
        // Find nearest system
        let closest = null;
        let closestDist = Infinity;
        for (const sys of galaxy.systems) {
          const dx = sys.x - shipPosRef.current.x;
          const dy = sys.y - shipPosRef.current.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < closestDist) { closestDist = d; closest = sys; }
        }
        if (closest && closestDist < SYSTEM_DOCK_RANGE * 2) {
          enterSystem(closest.id, getArrivalType(closest.id));
        }
      }
      
      // Cancel autopilot on movement keys
      if (['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].includes(e.key.toLowerCase())) {
        if (autopilotRef.current) {
          setGalaxyAutopilotTarget(null);
        }
      }
    };
    const handleKeyUp = (e) => keysPressed.current.delete(e.key.toLowerCase());
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [setGalaxyAutopilotTarget]);
  
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.85 : 1.18;
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor)));
  }, []);
  
  // Click on a system to autopilot
  const handleClickSystem = useCallback((sys) => {
    setGalaxyAutopilotTarget({ id: sys.id, name: sys.name });
    setFollowMode(true);
  }, [setGalaxyAutopilotTarget]);
  
  // Right-click to enter system if close enough
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
  }, []);
  
  // ============================================
  // VIEWPORT
  // ============================================
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const viewBox = {
    x: cameraRef.current.x - (viewportWidth / 2) / zoom,
    y: cameraRef.current.y - (viewportHeight / 2) / zoom,
    width: viewportWidth / zoom,
    height: viewportHeight / zoom,
  };
  
  // Ship rendering
  const shipX = shipPosRef.current.x;
  const shipY = shipPosRef.current.y;
  const shipRot = shipRotationRef.current;
  const isThrusting = thrustingRef.current;
  const uiScale = 1 / zoom; // Scale for stars, labels, UI elements
  
  // Speed for HUD
  const currentSpeed = Math.sqrt(shipVelRef.current.x ** 2 + shipVelRef.current.y ** 2);
  
  // Nearby system detection
  const nearbySystem = useMemo(() => {
    let closest = null;
    let closestDist = Infinity;
    for (const sys of systems) {
      const dx = sys.x - shipPosRef.current.x;
      const dy = sys.y - shipPosRef.current.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) {
        closestDist = d;
        closest = sys;
      }
    }
    return closestDist < SYSTEM_DOCK_RANGE * 2 ? closest : null;
  }, [systems, frameCount]);

  // Background stars (static, parallax-ish)
  const bgStars = useMemo(() => {
    const rng = new SeededRandom(777);
    const stars = [];
    for (let i = 0; i < 400; i++) {
      stars.push({
        x: rng.range(-6000, 6000),
        y: rng.range(-6000, 6000),
        r: rng.range(0.3, 1.2),
        opacity: rng.range(0.1, 0.4),
      });
    }
    return stars;
  }, []);
  
  return (
    <DraggableWindow
      windowId="systemView"
      title="⟡ Interstellar Space"
      initialWidth={Math.max(600, Math.round(window.innerWidth * 0.325))}
      initialHeight={Math.max(400, Math.round(window.innerHeight * 0.35))}
      minWidth={600}
      minHeight={400}
    >
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/20 bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="text-sm text-purple-300">⟡ Interstellar Space</div>
            <div className="text-xs text-slate-400">
              Speed: {Math.round(currentSpeed)} u/s
            </div>
            {galaxyAutopilotTarget && (() => {
              const target = galaxy.systemMap[galaxyAutopilotTarget.id];
              if (!target) return null;
              const dx = target.x - shipPosRef.current.x;
              const dy = target.y - shipPosRef.current.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              return (
                <div className="text-xs text-green-400">
                  → {galaxyAutopilotTarget.name} ({Math.round(dist)} ly)
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.5))}
              className="w-6 h-6 rounded bg-slate-700/50 text-cyan-400 hover:bg-cyan-500/20 transition-colors text-sm"
            >
              +
            </button>
            <button
              onClick={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.5))}
              className="w-6 h-6 rounded bg-slate-700/50 text-cyan-400 hover:bg-cyan-500/20 transition-colors text-sm"
            >
              −
            </button>
          </div>
        </div>

        {/* SVG Viewport */}
        <div className="flex-1 relative overflow-hidden" style={{ background: '#030308' }}>
          <svg
            ref={svgRef}
            className="w-full h-full"
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
            style={{ cursor: 'crosshair' }}
          >
            <defs>
              <filter id="galaxyGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
              <filter id="systemGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="2" />
              </filter>
              <radialGradient id="galaxyCenter" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#112244" stopOpacity="0.4" />
                <stop offset="60%" stopColor="#0a1020" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#030308" stopOpacity="0" />
              </radialGradient>
            </defs>
            
            {/* Galaxy core glow */}
            <circle cx={0} cy={0} r={3000} fill="url(#galaxyCenter)" />
            
            {/* Background stars */}
            {bgStars.map((star, i) => (
              <circle key={i} cx={star.x} cy={star.y} r={star.r} fill="#aabbcc" opacity={star.opacity} />
            ))}
            
            {/* Jump gate connections */}
            {connections.map(([a, b], i) => {
              const isOnRoute = galaxyAutopilotTarget && (
                (a.id === currentSystemId && b.id === galaxyAutopilotTarget.id) ||
                (b.id === currentSystemId && a.id === galaxyAutopilotTarget.id)
              );
              return (
                <line key={i}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={isOnRoute ? '#00ff88' : '#1a3050'}
                  strokeWidth={isOnRoute ? 2 : 1}
                  strokeDasharray={isOnRoute ? '8,4' : '4,8'}
                  opacity={isOnRoute ? 0.7 : 0.3}
                />
              );
            })}
            
            {/* Star systems */}
            {systems.map(sys => {
              const color = STAR_COLORS[sys.starType] || '#ffdd44';
              const size = (STAR_SIZES[sys.starType] || 5) * uiScale;
              const factionColor = FACTION_COLORS[sys.faction] || '#666';
              const isTarget = galaxyAutopilotTarget?.id === sys.id;
              const isHovered = hoveredSystem?.id === sys.id;
              const isCurrent = sys.id === currentSystemId;
              const discovered = discoveredSystems.includes(sys.id);
              const showLabel = true; // Always show — we're always zoomed in enough
              
              return (
                <g key={sys.id}
                  onClick={() => handleClickSystem(sys)}
                  onMouseEnter={() => setHoveredSystem(sys)}
                  onMouseLeave={() => setHoveredSystem(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Faction halo */}
                  <circle cx={sys.x} cy={sys.y} r={size * 3}
                    fill="none" stroke={factionColor} strokeWidth={1.5 * uiScale} opacity={0.2} />
                  
                  {/* Current system marker */}
                  {isCurrent && (
                    <circle cx={sys.x} cy={sys.y} r={size * 5}
                      fill="none" stroke="#44ff88" strokeWidth={2 * uiScale}
                      strokeDasharray={`${4 * uiScale},${3 * uiScale}`} opacity={0.6}
                    >
                      <animateTransform attributeName="transform" type="rotate"
                        from={`0 ${sys.x} ${sys.y}`} to={`360 ${sys.x} ${sys.y}`}
                        dur="6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  
                  {/* Target ring */}
                  {isTarget && (
                    <circle cx={sys.x} cy={sys.y} r={size * 4.5}
                      fill="none" stroke="#00ff88" strokeWidth={2 * uiScale}
                      strokeDasharray={`${3 * uiScale},${2 * uiScale}`} opacity={0.8}
                    />
                  )}
                  
                  {/* Hover ring */}
                  {isHovered && !isTarget && (
                    <circle cx={sys.x} cy={sys.y} r={size * 3.5}
                      fill="none" stroke={color} strokeWidth={1.5 * uiScale} opacity={0.5} />
                  )}
                  
                  {/* Star glow */}
                  <circle cx={sys.x} cy={sys.y} r={size * 2}
                    fill={color} opacity={0.2} filter="url(#systemGlow)" />
                  
                  {/* Star dot */}
                  <circle cx={sys.x} cy={sys.y} r={size}
                    fill={color} opacity={discovered ? 1 : 0.4} />
                  
                  {/* Label */}
                  {showLabel && (
                    <text x={sys.x} y={sys.y + size + 12 * uiScale}
                      textAnchor="middle"
                      fill={isCurrent ? '#44ff88' : isTarget ? '#00ff88' : discovered ? '#aabbcc' : '#556677'}
                      fontSize={14 * uiScale} fontFamily="monospace"
                      opacity={isCurrent || isHovered ? 0.9 : 0.6}
                    >
                      {sys.name}
                    </text>
                  )}
                  
                  {/* Danger indicator */}
                  {showLabel && sys.dangerLevel >= 3 && (
                    <text x={sys.x} y={sys.y + size + 24 * uiScale}
                      textAnchor="middle" fill="#ff4444"
                      fontSize={10 * uiScale} fontFamily="monospace"
                    >
                      {'⚠'.repeat(Math.min(sys.dangerLevel, 5))}
                    </text>
                  )}
                  
                  {/* Clickable hitbox */}
                  <circle cx={sys.x} cy={sys.y} r={Math.max(size * 4, 15 * uiScale)} fill="transparent" />
                </g>
              );
            })}
            
            {/* Autopilot line */}
            {galaxyAutopilotTarget && (() => {
              const target = galaxy.systemMap[galaxyAutopilotTarget.id];
              if (!target) return null;
              return (
                <line
                  x1={shipX} y1={shipY}
                  x2={target.x} y2={target.y}
                  stroke="#00ff88" strokeWidth={1.5 * uiScale}
                  strokeDasharray={`${6 * uiScale},${4 * uiScale}`}
                  opacity={0.5}
                />
              );
            })()}
            
            {/* SHIP — fleet V-formation (using image elements like SystemView) */}
            {fleetShips.map((ship) => {
              if (!ship.icon) return null;
              const offset = ship.formationOffset;
              // Formation math — same as SystemView
              const theta = shipRot * Math.PI / 180;
              const cosT = Math.cos(theta);
              const sinT = Math.sin(theta);
              const rightX = -sinT;
              const rightY = cosT;
              const behindX = -cosT;
              const behindY = -sinT;
              // Scale formation offsets for galaxy view — scale with zoom like stars
              const shipScale = uiScale * 1.2;
              const fScale = shipScale * 1.5;
              const rx = rightX * offset.x * fScale + behindX * offset.y * fScale;
              const ry = rightY * offset.x * fScale + behindY * offset.y * fScale;
              const sx = shipX + rx;
              const sy = shipY + ry;
              const iw = ship.icon.width * shipScale;
              const ih = ship.icon.height * shipScale;

              return (
                <g key={ship.id} transform={`translate(${sx}, ${sy})`}>
                  {/* Ambient glow */}
                  <circle
                    r={Math.max(ih * 0.5, 4 * uiScale)}
                    fill={ship.engineColor}
                    opacity={ship.isActive ? 0.2 : 0.1}
                  />
                  {/* Ship icon */}
                  <g transform={`rotate(${shipRot + 90})`}>
                    <image
                      href={ship.icon.dataUrl}
                      x={-iw/2}
                      y={-ih/2}
                      width={iw}
                      height={ih}
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </g>
                  {/* Engine contrail — only for active ship when thrusting */}
                  {ship.isActive && isThrusting && (
                    <g transform={`rotate(${shipRot})`}>
                      <line x1={-iw * 0.4} y1={0} x2={-iw * 0.4 - 4 * uiScale - Math.random() * 3 * uiScale} y2={0}
                        stroke="#00ccff" strokeWidth={1.5 * uiScale} opacity={0.8} />
                      <line x1={-iw * 0.4} y1={0} x2={-iw * 0.4 - 2 * uiScale - Math.random() * 2 * uiScale} y2={0}
                        stroke="#ffffff" strokeWidth={0.8 * uiScale} opacity={0.6} />
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
          
          {/* Hovered system info */}
          {hoveredSystem && (
            <div className="absolute top-3 right-3 pointer-events-none">
              <div className="px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-700/40 backdrop-blur-sm min-w-[160px]">
                <div className="text-xs text-cyan-300 font-medium">{hoveredSystem.name}</div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {hoveredSystem.starType.replace('_', ' ')} · {GALAXY_FACTIONS[hoveredSystem.faction]?.name || hoveredSystem.faction}
                </div>
                <div className="text-[10px] text-slate-500">
                  Danger: {'★'.repeat(hoveredSystem.dangerLevel)}{'☆'.repeat(5 - hoveredSystem.dangerLevel)}
                </div>
                {hoveredSystem.hasJumpGate && (
                  <div className="text-[10px] text-green-500 mt-0.5">Has Jump Gate</div>
                )}
                <div className="text-[10px] text-slate-600 mt-0.5">
                  {Math.round(Math.sqrt(
                    (hoveredSystem.x - shipPosRef.current.x) ** 2 +
                    (hoveredSystem.y - shipPosRef.current.y) ** 2
                  ))} ly away
                </div>
              </div>
            </div>
          )}
          
          {/* Controls hint */}
          <div className="absolute bottom-3 left-3 text-xs text-cyan-400/50 bg-slate-900/70 px-2 py-1 rounded">
            {galaxyAutopilotTarget
              ? 'WASD/Esc: Cancel Autopilot | Click: New Destination'
              : 'W: Thrust | A/D: Turn | S: Brake | Click System: Autopilot | Enter: Dock'
            }
          </div>
        </div>
      </div>
    </DraggableWindow>
  );
};
