import React from 'react';

// ============================================
// SHIP GRAPHICS
// Top-down detailed SVG ships for each hull size
// ============================================

// Scout - Small, sleek, fast
export const ScoutShip = ({ rotation = 0, thrusting = false, scale = 1 }) => (
  <g transform={`rotate(${rotation}) scale(${scale})`}>
    <defs>
      <linearGradient id="scoutHull" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4a5568" />
        <stop offset="50%" stopColor="#2d3748" />
        <stop offset="100%" stopColor="#1a202c" />
      </linearGradient>
      <linearGradient id="scoutAccent" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#63b3ed" />
        <stop offset="100%" stopColor="#3182ce" />
      </linearGradient>
    </defs>
    
    {/* Engine glow */}
    {thrusting && (
      <g>
        <ellipse cx="0" cy="18" rx="4" ry="12" fill="#ff6600" opacity="0.6" />
        <ellipse cx="0" cy="16" rx="2" ry="8" fill="#ffaa00" opacity="0.8" />
        <ellipse cx="0" cy="14" rx="1" ry="4" fill="#ffffff" />
      </g>
    )}
    
    {/* Main hull */}
    <path
      d="M 0,-20 L 8,-8 L 10,5 L 6,15 L -6,15 L -10,5 L -8,-8 Z"
      fill="url(#scoutHull)"
      stroke="#4a5568"
      strokeWidth="0.5"
    />
    
    {/* Wings */}
    <path d="M 8,-5 L 18,-2 L 16,8 L 8,10 Z" fill="url(#scoutHull)" stroke="#4a5568" strokeWidth="0.5" />
    <path d="M -8,-5 L -18,-2 L -16,8 L -8,10 Z" fill="url(#scoutHull)" stroke="#4a5568" strokeWidth="0.5" />
    
    {/* Cockpit */}
    <ellipse cx="0" cy="-10" rx="4" ry="6" fill="#1a365d" stroke="#63b3ed" strokeWidth="0.5" />
    <ellipse cx="0" cy="-12" rx="2" ry="3" fill="#2b6cb0" opacity="0.6" />
    
    {/* Accent lines */}
    <line x1="0" y1="-18" x2="0" y2="-4" stroke="url(#scoutAccent)" strokeWidth="1" />
    <line x1="-6" y1="2" x2="-6" y2="12" stroke="url(#scoutAccent)" strokeWidth="0.5" />
    <line x1="6" y1="2" x2="6" y2="12" stroke="url(#scoutAccent)" strokeWidth="0.5" />
    
    {/* Engine ports */}
    <rect x="-4" y="13" width="3" height="3" fill="#2d3748" stroke="#1a202c" strokeWidth="0.5" rx="0.5" />
    <rect x="1" y="13" width="3" height="3" fill="#2d3748" stroke="#1a202c" strokeWidth="0.5" rx="0.5" />
  </g>
);

// Shuttle - Compact, boxy utility ship
export const ShuttleShip = ({ rotation = 0, thrusting = false, scale = 1 }) => (
  <g transform={`rotate(${rotation}) scale(${scale})`}>
    <defs>
      <linearGradient id="shuttleHull" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#5a6570" />
        <stop offset="50%" stopColor="#3d454d" />
        <stop offset="100%" stopColor="#252a30" />
      </linearGradient>
    </defs>
    
    {/* Engine glow */}
    {thrusting && (
      <g>
        <ellipse cx="-6" cy="18" rx="3" ry="8" fill="#ff6600" opacity="0.5" />
        <ellipse cx="6" cy="18" rx="3" ry="8" fill="#ff6600" opacity="0.5" />
        <ellipse cx="-6" cy="16" rx="1.5" ry="5" fill="#ffcc00" opacity="0.7" />
        <ellipse cx="6" cy="16" rx="1.5" ry="5" fill="#ffcc00" opacity="0.7" />
      </g>
    )}
    
    {/* Main hull */}
    <rect x="-10" y="-15" width="20" height="28" rx="3" fill="url(#shuttleHull)" stroke="#4a5568" strokeWidth="0.5" />
    
    {/* Cockpit section */}
    <path d="M -8,-15 L 0,-22 L 8,-15 Z" fill="url(#shuttleHull)" stroke="#4a5568" strokeWidth="0.5" />
    <ellipse cx="0" cy="-14" rx="5" ry="4" fill="#1a365d" stroke="#4299e1" strokeWidth="0.5" />
    
    {/* Side panels */}
    <rect x="-9" y="-8" width="4" height="16" fill="#2d3748" stroke="#4a5568" strokeWidth="0.3" rx="1" />
    <rect x="5" y="-8" width="4" height="16" fill="#2d3748" stroke="#4a5568" strokeWidth="0.3" rx="1" />
    
    {/* Cargo door lines */}
    <line x1="-4" y1="0" x2="4" y2="0" stroke="#1a202c" strokeWidth="0.5" />
    <line x1="-4" y1="5" x2="4" y2="5" stroke="#1a202c" strokeWidth="0.5" />
    
    {/* Engine nacelles */}
    <rect x="-12" y="5" width="4" height="10" rx="1" fill="#3d454d" stroke="#4a5568" strokeWidth="0.5" />
    <rect x="8" y="5" width="4" height="10" rx="1" fill="#3d454d" stroke="#4a5568" strokeWidth="0.5" />
  </g>
);

// Freighter - Large, bulky cargo ship
export const FreighterShip = ({ rotation = 0, thrusting = false, scale = 1 }) => (
  <g transform={`rotate(${rotation}) scale(${scale})`}>
    <defs>
      <linearGradient id="freighterHull" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#5c5040" />
        <stop offset="50%" stopColor="#3d352a" />
        <stop offset="100%" stopColor="#252015" />
      </linearGradient>
    </defs>
    
    {/* Engine glow */}
    {thrusting && (
      <g>
        <ellipse cx="-12" cy="32" rx="4" ry="14" fill="#ff5500" opacity="0.5" />
        <ellipse cx="0" cy="32" rx="4" ry="14" fill="#ff5500" opacity="0.5" />
        <ellipse cx="12" cy="32" rx="4" ry="14" fill="#ff5500" opacity="0.5" />
        <ellipse cx="-12" cy="28" rx="2" ry="8" fill="#ffaa00" opacity="0.7" />
        <ellipse cx="0" cy="28" rx="2" ry="8" fill="#ffaa00" opacity="0.7" />
        <ellipse cx="12" cy="28" rx="2" ry="8" fill="#ffaa00" opacity="0.7" />
      </g>
    )}
    
    {/* Main cargo hull */}
    <rect x="-18" y="-15" width="36" height="40" rx="4" fill="url(#freighterHull)" stroke="#5c5040" strokeWidth="0.5" />
    
    {/* Forward section */}
    <path d="M -14,-15 L 0,-28 L 14,-15 Z" fill="url(#freighterHull)" stroke="#5c5040" strokeWidth="0.5" />
    
    {/* Bridge */}
    <rect x="-8" y="-22" width="16" height="10" rx="2" fill="#3d352a" stroke="#5c5040" strokeWidth="0.5" />
    <ellipse cx="0" cy="-18" rx="5" ry="3" fill="#1a365d" stroke="#4299e1" strokeWidth="0.5" />
    
    {/* Cargo containers */}
    <rect x="-14" y="-8" width="10" height="14" fill="#4a4030" stroke="#3d352a" strokeWidth="0.5" rx="1" />
    <rect x="4" y="-8" width="10" height="14" fill="#4a4030" stroke="#3d352a" strokeWidth="0.5" rx="1" />
    <rect x="-14" y="8" width="10" height="10" fill="#4a4030" stroke="#3d352a" strokeWidth="0.5" rx="1" />
    <rect x="4" y="8" width="10" height="10" fill="#4a4030" stroke="#3d352a" strokeWidth="0.5" rx="1" />
    
    {/* Engine block */}
    <rect x="-16" y="20" width="32" height="8" fill="#3d352a" stroke="#5c5040" strokeWidth="0.5" rx="1" />
  </g>
);

// Frigate - Sleek combat vessel
export const FrigateShip = ({ rotation = 0, thrusting = false, scale = 1 }) => (
  <g transform={`rotate(${rotation}) scale(${scale})`}>
    <defs>
      <linearGradient id="frigateHull" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4a5568" />
        <stop offset="50%" stopColor="#2d3748" />
        <stop offset="100%" stopColor="#1a202c" />
      </linearGradient>
      <linearGradient id="frigateAccent" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#e53e3e" />
        <stop offset="100%" stopColor="#9b2c2c" />
      </linearGradient>
    </defs>
    
    {/* Engine glow */}
    {thrusting && (
      <g>
        <ellipse cx="-8" cy="30" rx="4" ry="12" fill="#ff4400" opacity="0.6" />
        <ellipse cx="8" cy="30" rx="4" ry="12" fill="#ff4400" opacity="0.6" />
        <ellipse cx="-8" cy="26" rx="2" ry="7" fill="#ff8800" opacity="0.8" />
        <ellipse cx="8" cy="26" rx="2" ry="7" fill="#ff8800" opacity="0.8" />
      </g>
    )}
    
    {/* Main hull */}
    <path
      d="M 0,-30 L 12,-18 L 14,-5 L 16,15 L 12,25 L -12,25 L -16,15 L -14,-5 L -12,-18 Z"
      fill="url(#frigateHull)"
      stroke="#4a5568"
      strokeWidth="0.5"
    />
    
    {/* Weapon pods */}
    <rect x="-22" y="-10" width="8" height="20" rx="2" fill="url(#frigateHull)" stroke="#4a5568" strokeWidth="0.5" />
    <rect x="14" y="-10" width="8" height="20" rx="2" fill="url(#frigateHull)" stroke="#4a5568" strokeWidth="0.5" />
    <circle cx="-18" cy="-8" r="2" fill="#e53e3e" />
    <circle cx="18" cy="-8" r="2" fill="#e53e3e" />
    
    {/* Bridge */}
    <ellipse cx="0" cy="-20" rx="6" ry="8" fill="#1a365d" stroke="#63b3ed" strokeWidth="0.5" />
    <ellipse cx="0" cy="-22" rx="3" ry="4" fill="#2b6cb0" opacity="0.5" />
    
    {/* Accent stripes */}
    <line x1="0" y1="-28" x2="0" y2="-12" stroke="url(#frigateAccent)" strokeWidth="2" />
    <line x1="-10" y1="5" x2="-10" y2="20" stroke="url(#frigateAccent)" strokeWidth="1" />
    <line x1="10" y1="5" x2="10" y2="20" stroke="url(#frigateAccent)" strokeWidth="1" />
    
    {/* Engine nacelles */}
    <rect x="-12" y="18" width="6" height="8" rx="1" fill="#2d3748" stroke="#1a202c" strokeWidth="0.5" />
    <rect x="6" y="18" width="6" height="8" rx="1" fill="#2d3748" stroke="#1a202c" strokeWidth="0.5" />
  </g>
);

// Cruiser - Large multi-role warship
export const CruiserShip = ({ rotation = 0, thrusting = false, scale = 1 }) => (
  <g transform={`rotate(${rotation}) scale(${scale})`}>
    <defs>
      <linearGradient id="cruiserHull" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4a5568" />
        <stop offset="50%" stopColor="#2d3748" />
        <stop offset="100%" stopColor="#1a202c" />
      </linearGradient>
    </defs>
    
    {/* Engine glow */}
    {thrusting && (
      <g>
        <ellipse cx="-15" cy="42" rx="5" ry="16" fill="#ff3300" opacity="0.5" />
        <ellipse cx="0" cy="42" rx="5" ry="16" fill="#ff3300" opacity="0.5" />
        <ellipse cx="15" cy="42" rx="5" ry="16" fill="#ff3300" opacity="0.5" />
        <ellipse cx="-15" cy="38" rx="2.5" ry="10" fill="#ff7700" opacity="0.7" />
        <ellipse cx="0" cy="38" rx="2.5" ry="10" fill="#ff7700" opacity="0.7" />
        <ellipse cx="15" cy="38" rx="2.5" ry="10" fill="#ff7700" opacity="0.7" />
      </g>
    )}
    
    {/* Main hull */}
    <path
      d="M 0,-40 L 16,-28 L 20,-10 L 22,20 L 18,35 L -18,35 L -22,20 L -20,-10 L -16,-28 Z"
      fill="url(#cruiserHull)"
      stroke="#4a5568"
      strokeWidth="0.5"
    />
    
    {/* Side wings */}
    <path d="M 20,-5 L 32,0 L 30,25 L 20,28 Z" fill="url(#cruiserHull)" stroke="#4a5568" strokeWidth="0.5" />
    <path d="M -20,-5 L -32,0 L -30,25 L -20,28 Z" fill="url(#cruiserHull)" stroke="#4a5568" strokeWidth="0.5" />
    
    {/* Weapon turrets */}
    <circle cx="-26" cy="10" r="4" fill="#2d3748" stroke="#4a5568" strokeWidth="0.5" />
    <circle cx="26" cy="10" r="4" fill="#2d3748" stroke="#4a5568" strokeWidth="0.5" />
    <rect x="-28" y="6" width="4" height="8" fill="#4a5568" />
    <rect x="24" y="6" width="4" height="8" fill="#4a5568" />
    
    {/* Bridge superstructure */}
    <rect x="-10" y="-32" width="20" height="16" rx="2" fill="#2d3748" stroke="#4a5568" strokeWidth="0.5" />
    <ellipse cx="0" cy="-28" rx="6" ry="4" fill="#1a365d" stroke="#63b3ed" strokeWidth="0.5" />
    
    {/* Forward weapons */}
    <circle cx="-8" cy="-10" r="3" fill="#e53e3e" opacity="0.8" />
    <circle cx="8" cy="-10" r="3" fill="#e53e3e" opacity="0.8" />
    
    {/* Engine array */}
    <rect x="-20" y="28" width="40" height="10" rx="2" fill="#2d3748" stroke="#1a202c" strokeWidth="0.5" />
  </g>
);

// Carrier - Massive capital ship
export const CarrierShip = ({ rotation = 0, thrusting = false, scale = 1 }) => (
  <g transform={`rotate(${rotation}) scale(${scale})`}>
    <defs>
      <linearGradient id="carrierHull" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4a5568" />
        <stop offset="50%" stopColor="#2d3748" />
        <stop offset="100%" stopColor="#1a202c" />
      </linearGradient>
    </defs>
    
    {/* Engine glow */}
    {thrusting && (
      <g>
        {[-24, -12, 0, 12, 24].map((x, i) => (
          <g key={i}>
            <ellipse cx={x} cy="58" rx="5" ry="18" fill="#ff2200" opacity="0.4" />
            <ellipse cx={x} cy="52" rx="2.5" ry="10" fill="#ff6600" opacity="0.6" />
          </g>
        ))}
      </g>
    )}
    
    {/* Main hull */}
    <rect x="-30" y="-40" width="60" height="90" rx="5" fill="url(#carrierHull)" stroke="#4a5568" strokeWidth="0.5" />
    
    {/* Forward section */}
    <path d="M -25,-40 L 0,-55 L 25,-40 Z" fill="url(#carrierHull)" stroke="#4a5568" strokeWidth="0.5" />
    
    {/* Flight deck (center) */}
    <rect x="-20" y="-30" width="40" height="50" fill="#1a202c" stroke="#2d3748" strokeWidth="0.5" />
    <line x1="0" y1="-28" x2="0" y2="18" stroke="#4299e1" strokeWidth="1" opacity="0.5" />
    <line x1="-15" y1="-10" x2="15" y2="-10" stroke="#48bb78" strokeWidth="1" opacity="0.5" />
    <line x1="-15" y1="5" x2="15" y2="5" stroke="#48bb78" strokeWidth="1" opacity="0.5" />
    
    {/* Bridge tower */}
    <rect x="22" y="-35" width="12" height="25" rx="2" fill="#2d3748" stroke="#4a5568" strokeWidth="0.5" />
    <rect x="24" y="-32" width="8" height="8" fill="#1a365d" stroke="#63b3ed" strokeWidth="0.5" />
    
    {/* Side hangars */}
    <rect x="-35" y="-20" width="8" height="30" rx="1" fill="#2d3748" stroke="#4a5568" strokeWidth="0.5" />
    <rect x="27" y="-20" width="8" height="30" rx="1" fill="#2d3748" stroke="#4a5568" strokeWidth="0.5" />
    
    {/* Defense turrets */}
    <circle cx="-28" cy="-30" r="4" fill="#2d3748" stroke="#e53e3e" strokeWidth="1" />
    <circle cx="28" cy="15" r="4" fill="#2d3748" stroke="#e53e3e" strokeWidth="1" />
    <circle cx="-28" cy="15" r="4" fill="#2d3748" stroke="#e53e3e" strokeWidth="1" />
    
    {/* Engine block */}
    <rect x="-28" y="40" width="56" height="12" rx="2" fill="#2d3748" stroke="#1a202c" strokeWidth="0.5" />
  </g>
);

// ============================================
// SHIP SELECTOR - Returns correct ship based on hull size
// ============================================

const HULL_SIZE_RANGES = {
  scout: { min: 0, max: 30 },
  shuttle: { min: 0, max: 25 },
  frigate: { min: 31, max: 55 },
  freighter: { min: 40, max: 60 },
  cruiser: { min: 56, max: 90 },
  carrier: { min: 91, max: 999 },
};

export const getShipComponent = (hullSize) => {
  if (hullSize <= 25) return ShuttleShip;
  if (hullSize <= 35) return ScoutShip;
  if (hullSize <= 50) return FrigateShip;
  if (hullSize <= 65) return FreighterShip;
  if (hullSize <= 90) return CruiserShip;
  return CarrierShip;
};

export const getShipScale = (hullSize) => {
  // Scale ship based on hull size for visual consistency
  if (hullSize <= 25) return 0.8;
  if (hullSize <= 35) return 1.0;
  if (hullSize <= 50) return 1.2;
  if (hullSize <= 65) return 1.4;
  if (hullSize <= 90) return 1.6;
  return 2.0;
};

// Export all ships for direct use
export const ShipGraphics = {
  Scout: ScoutShip,
  Shuttle: ShuttleShip,
  Freighter: FreighterShip,
  Frigate: FrigateShip,
  Cruiser: CruiserShip,
  Carrier: CarrierShip,
};

export default ShipGraphics;
