// Planet Interaction Window — Stellaris-inspired restyle
// Full custom frame with landscape banner header + vertical icon tabs
// Opens when docked at a planet/station (not through the toolbar)

import React, { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { getQualityTier, CATEGORY_INFO, RARITY_INFO } from '@/data/resources';
import { resourcesAPI, harvesterAPI, fittingAPI, questsAPI } from '@/utils/api';
import { COLORS, PanelButton, MessageBar, Pill } from '@/components/ui/panelStyles';

// ============================================
// DESIGN TOKENS (shared with GameFrame aesthetic)
// ============================================

const EDGE = '#1a3050';
const PANEL_BG = 'rgba(8,14,28,0.93)';
const BLUE = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD = { pri: '#f59e0b', light: '#fbbf24', dim: '#5c3d0e' };
const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";

// Diagonal clipPath: angled top-left and bottom-right, straight top-right and bottom-left
const diagMix = (c = 8) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

const glow = (c, a = 0.25) => `0 0 10px ${c}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

// Simple hash for deterministic terrain from body ID
const hashSeed = (str) => {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
};

// ============================================
// SECTION HEADER (reusable)
// ============================================

const SectionHead = ({ title, accent = BLUE.light, right, icon }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    marginBottom: 8,
    borderLeft: `2px solid ${accent}`,
    background: `linear-gradient(90deg, ${accent}18, transparent)`,
    padding: '5px 10px',
  }}>
    {icon && <span style={{ marginRight: 6, fontSize: 12 }}>{icon}</span>}
    <span style={{
      fontSize: 11,
      fontWeight: 800,
      color: accent,
      letterSpacing: 1.5,
      fontFamily: F,
      textTransform: 'uppercase',
      flex: 1,
    }}>{title}</span>
    {right && <span style={{ fontSize: 10, color: '#3a5a6a', fontFamily: FM }}>{right}</span>}
  </div>
);

// ============================================
// LANDSCAPE BANNER (procedural terrain header)
// ============================================

const PlanetBanner = ({ body, onClose }) => {
  const color = body?.color || '#4488aa';
  const bodyType = body?.planetType || body?.type || 'planet';
  const seed = hashSeed(body?.id || body?.name || 'unknown');
  const offset = (seed % 628) / 100; // 0 to 6.28

  // Generate terrain points (front mountain range)
  const terrainPoints = Array.from({ length: 42 }, (_, i) => {
    const x = i * 10;
    const y = 18 + Math.sin(i * 0.7 + offset) * 8 + Math.sin(i * 1.3) * 4;
    return `L${x},${y}`;
  }).join(' ');

  // Back mountain range (slightly different)
  const backPoints = Array.from({ length: 42 }, (_, i) => {
    const x = i * 10;
    const y = 25 + Math.sin(i * 0.5 + offset + 1) * 6 + Math.sin(i * 1.7) * 3;
    return `L${x},${y}`;
  }).join(' ');

  // Scattered stars in sky
  const stars = Array.from({ length: 25 }, (_, i) => {
    const sx = 10 + ((i * 73 + seed) % 400);
    const sy = 5 + ((i * 37 + seed) % 45);
    const op = 0.15 + ((i * 17) % 30) / 100;
    return { x: sx, y: sy, op };
  });

  const isStation = body?.type === 'station';

  return (
    <div style={{ position: 'relative', height: 120, flexShrink: 0, overflow: 'hidden' }}>
      {/* Sky gradient with planet color tint */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(180deg, rgba(3,6,16,0.95) 0%, ${color}15 45%, ${color}25 70%, ${color}08 100%)`,
      }} />

      {/* Horizon glow line */}
      <div style={{
        position: 'absolute',
        bottom: 32,
        left: 0,
        right: 0,
        height: 1,
        background: `linear-gradient(90deg, transparent, ${color}44, transparent)`,
      }} />

      {/* Background stars */}
      {stars.map((s, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: s.y,
          left: s.x,
          width: 1,
          height: 1,
          borderRadius: 1,
          background: '#ffffff',
          opacity: s.op,
        }} />
      ))}

      {/* Planet orb in the sky (right side) */}
      <div style={{
        position: 'absolute',
        top: 14,
        right: 30,
        width: 38,
        height: 38,
        borderRadius: isStation ? 4 : 19,
        background: `radial-gradient(circle at 32% 32%, ${color}ee, ${color}66)`,
        boxShadow: `${glow(color, 0.35)}, inset -4px -4px 8px rgba(0,0,0,0.3)`,
        border: `1px solid ${color}55`,
      }} />

      {/* Terrain silhouettes (back first, then front) */}
      <svg
        viewBox="0 0 420 40"
        preserveAspectRatio="none"
        style={{ position: 'absolute', bottom: 30, left: 0, width: '100%', height: 40 }}
      >
        <path d={`M0,40 L0,28 ${backPoints} L420,40 Z`} fill={`${color}10`} />
        <path d={`M0,40 L0,22 ${terrainPoints} L420,40 Z`} fill={`${color}18`} />
      </svg>

      {/* Header content (name + undock button over the landscape) */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '8px 14px',
        background: 'linear-gradient(0deg, rgba(8,14,28,0.95), rgba(8,14,28,0.5), transparent)',
      }}>
        <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              fontSize: 18,
              fontWeight: 800,
              color: '#e2e8f0',
              textShadow: '0 1px 4px rgba(0,0,0,0.5)',
              fontFamily: F,
              letterSpacing: 0.5,
            }}>{body?.name || 'Unknown'}</div>
            <div style={{
              fontSize: 10,
              color: '#6a8a9a',
              fontFamily: FM,
              textTransform: 'capitalize',
            }}>{bodyType} · Sol System</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'linear-gradient(180deg, #ef444418, #ef444806)',
              border: '1px solid #ef444433',
              color: '#ef4444',
              padding: '4px 12px',
              fontSize: 9,
              cursor: 'pointer',
              fontFamily: F,
              fontWeight: 800,
              borderRadius: 2,
              letterSpacing: 1,
            }}
          >CLOSE</button>
        </div>
      </div>
    </div>
  );
};

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
    return <p style={{ color: '#4a6580', fontSize: 11, fontFamily: F }}>No resources detected</p>;
  }

  return (
    <div>
      {resources.map((resource, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(4,8,16,0.5)',
            border: `1px solid ${EDGE}`,
            borderRadius: 2,
            padding: '6px 10px',
            marginBottom: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>{CATEGORY_INFO[resource.category]?.icon || '📦'}</span>
            <span style={{
              fontWeight: 700,
              fontSize: 11,
              fontFamily: F,
              color: RARITY_INFO[resource.rarity]?.color || '#e2e8f0',
            }}>
              {resource.name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontFamily: FM }}>
            <span style={{ color: '#4a6580' }}>{resource.deposit_count}×</span>
            <span style={{
              padding: '1px 6px',
              borderRadius: 2,
              fontSize: 8,
              fontWeight: 800,
              fontFamily: F,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              ...(resource.abundance === 'Abundant' ? {
                background: 'rgba(22,101,52,0.4)',
                color: '#4ade80',
                border: '1px solid rgba(34,197,94,0.5)',
              } : resource.abundance === 'Moderate' ? {
                background: 'rgba(133,77,14,0.4)',
                color: '#fbbf24',
                border: '1px solid rgba(251,191,36,0.5)',
              } : {
                background: 'rgba(127,29,29,0.4)',
                color: '#fca5a5',
                border: '1px solid rgba(239,68,68,0.5)',
              }),
            }}>
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
    return <p style={{ color: '#4a6580', fontSize: 11, fontFamily: F }}>No deposit data available</p>;
  }

  return (
    <div>
      {deposits.map((deposit) => (
        <div
          key={deposit.id}
          style={{
            background: 'rgba(4,8,16,0.5)',
            border: `1px solid ${EDGE}`,
            borderLeft: `2px solid ${EDGE}`,
            borderRadius: 3,
            padding: 10,
            marginBottom: 6,
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, color: '#3a5a6a', fontFamily: FM, letterSpacing: 0.5 }}>#{deposit.slot_number}</span>
              <span style={{
                fontWeight: 700,
                fontSize: 11,
                fontFamily: F,
                color: RARITY_INFO[deposit.rarity]?.color || '#e2e8f0',
              }}>
                {deposit.resource_name}
              </span>
            </div>
            <span style={{
              fontSize: 9,
              padding: '2px 7px',
              borderRadius: 2,
              fontWeight: 800,
              fontFamily: F,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              background: `${deposit.estimated_tier.color}22`,
              color: deposit.estimated_tier.color,
              border: `1px solid ${deposit.estimated_tier.color}55`,
            }}>
              {deposit.estimated_tier.name}
            </span>
          </div>

          <div style={{
            fontSize: 10,
            color: '#4a6580',
            fontFamily: FM,
            marginBottom: 6,
            letterSpacing: 0.3,
          }}>
            QTY ~{deposit.quantity_range.min}-{deposit.quantity_range.max} UNITS
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
          }}>
            {Object.entries(deposit.stat_ranges).map(([stat, range]) => (
              <div key={stat} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(2,4,10,0.6)',
                border: `1px solid ${EDGE}`,
                borderRadius: 2,
                padding: '3px 7px',
                fontSize: 9,
                fontFamily: FM,
                letterSpacing: 0.3,
              }}>
                <span style={{ color: '#4a6580', textTransform: 'uppercase' }}>{stat}</span>
                <span style={{ color: '#a0b0c0', fontWeight: 700 }}>{range.min}-{range.max}</span>
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
    <div style={{
      background: 'rgba(127,29,29,0.25)',
      border: '1px solid rgba(239,68,68,0.5)',
      borderLeft: '2px solid #ef4444',
      borderRadius: 3,
      padding: 10,
      marginTop: 10,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: '#fca5a5',
        fontWeight: 800,
        marginBottom: 5,
        fontSize: 10,
        fontFamily: F,
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        <span>⚠️</span>
        <span>Hazards Detected</span>
      </div>
      <ul style={{
        fontSize: 10,
        color: '#fca5a5',
        listStyle: 'none',
        padding: 0,
        margin: 0,
        fontFamily: F,
      }}>
        {hazards.map((hazard, idx) => (
          <li key={idx} style={{ marginBottom: 2 }}>• {hazard}</li>
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
  const color = pct >= 80 ? '#a855f7' : pct >= 60 ? '#60a5fa' : pct >= 40 ? '#22c55e' : pct >= 20 ? '#e2e8f0' : '#4a6580';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 10,
      fontFamily: FM,
      padding: '2px 0',
    }}>
      <span style={{
        color: '#4a6580',
        textTransform: 'uppercase',
        width: 56,
        letterSpacing: 0.5,
      }}>{label}</span>
      <div style={{
        flex: 1,
        height: 5,
        background: '#0a1528',
        border: `1px solid ${EDGE}`,
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          transition: 'width 0.2s',
        }} />
      </div>
      <span style={{
        color: '#a0b0c0',
        width: 24,
        textAlign: 'right',
        fontWeight: 700,
      }}>{value}</span>
    </div>
  );
};

const CargoBar = ({ capacity, used }) => {
  const pct = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#fbbf24' : '#f59e0b';

  return (
    <div style={{
      background: 'rgba(4,8,16,0.5)',
      border: `1px solid ${EDGE}`,
      borderLeft: `2px solid ${color}`,
      borderRadius: 3,
      padding: '7px 10px',
      marginBottom: 10,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 9,
        fontFamily: FM,
        marginBottom: 4,
        letterSpacing: 0.5,
      }}>
        <span style={{ color: '#4a6580' }}>📦 CARGO</span>
        <span style={{ color, fontWeight: 700 }}>{used} / {capacity}</span>
      </div>
      <div style={{
        height: 4,
        background: '#0a1528',
        border: `1px solid ${EDGE}`,
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          transition: 'width 0.3s',
        }} />
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

  // Card accent color
  const accent = isMyActiveDeposit ? GOLD.pri
    : isDepleted ? '#3a4a5a'
    : isOccupiedByOther ? '#ef4444'
    : EDGE;

  return (
    <div style={{
      background: isMyActiveDeposit
        ? `linear-gradient(135deg, ${GOLD.pri}10, transparent)`
        : 'rgba(4,8,16,0.5)',
      border: `1px solid ${EDGE}`,
      borderLeft: `2px solid ${accent}`,
      borderRadius: 3,
      padding: 10,
      marginBottom: 8,
      opacity: isDepleted ? 0.5 : 1,
      transition: 'all 0.15s',
      boxShadow: isMyActiveDeposit ? `0 0 8px ${GOLD.pri}33` : 'none',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            color: '#3a5a6a',
            fontSize: 9,
            fontFamily: FM,
            letterSpacing: 0.5,
          }}>#{deposit.slot_number}</span>
          <span style={{ fontSize: 14 }}>{CATEGORY_INFO[deposit.category]?.icon || '📦'}</span>
          <span style={{
            fontWeight: 700,
            fontSize: 12,
            fontFamily: F,
            color: RARITY_INFO[deposit.rarity]?.color || '#e2e8f0',
            letterSpacing: 0.3,
          }}>
            {deposit.resource_name}
          </span>
        </div>
        {tier && (
          <span style={{
            fontSize: 9,
            padding: '2px 7px',
            borderRadius: 2,
            background: `${tier.color}22`,
            border: `1px solid ${tier.color}55`,
            color: tier.color,
            fontFamily: F,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            {tier.name}
          </span>
        )}
      </div>

      {/* Quantity progress */}
      {deposit.quantity_remaining != null && (
        <div style={{ marginBottom: 8 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 9,
            fontFamily: FM,
            color: '#4a6580',
            marginBottom: 3,
            letterSpacing: 0.5,
          }}>
            <span>REMAINING</span>
            <span style={{ color: '#a0b0c0' }}>{deposit.quantity_remaining} / {deposit.quantity_total}</span>
          </div>
          <div style={{
            height: 4,
            background: '#0a1528',
            border: `1px solid ${EDGE}`,
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${(deposit.quantity_remaining / deposit.quantity_total) * 100}%`,
              background: 'linear-gradient(90deg, #155e75, #22d3ee)',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* Stat bars */}
      {deposit.stats && (
        <div style={{ marginBottom: 10 }}>
          <StatBar label="Purity" value={deposit.stats.purity} />
          <StatBar label="Stability" value={deposit.stats.stability} />
          <StatBar label="Potency" value={deposit.stats.potency} />
          <StatBar label="Density" value={deposit.stats.density} />
        </div>
      )}

      {/* Status / action */}
      {isMyActiveDeposit ? (
        <div style={{
          color: GOLD.light,
          fontSize: 10,
          fontWeight: 700,
          fontFamily: F,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          background: `${GOLD.pri}10`,
          border: `1px solid ${GOLD.pri}44`,
          borderRadius: 2,
          letterSpacing: 0.5,
        }}>
          <span style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>⛏️</span>
          <span>CURRENTLY MINING</span>
        </div>
      ) : isDepleted ? (
        <div style={{
          color: '#3a5a6a',
          fontSize: 10,
          fontFamily: FM,
          letterSpacing: 0.5,
        }}>DEPLETED — RESPAWNS IN ~24H</div>
      ) : isOccupiedByOther ? (
        <div style={{
          color: '#ef4444',
          fontSize: 10,
          fontFamily: FM,
          letterSpacing: 0.5,
        }}>OCCUPIED BY ANOTHER PLAYER</div>
      ) : !deposit.stats ? (
        <div style={{
          color: '#3a5a6a',
          fontSize: 10,
          fontFamily: FM,
          letterSpacing: 0.5,
        }}>GROUND SCAN REQUIRED</div>
      ) : hasActiveSession ? (
        <div style={{
          color: '#3a5a6a',
          fontSize: 10,
          fontFamily: FM,
          letterSpacing: 0.5,
        }}>STOP CURRENT SESSION TO MINE HERE</div>
      ) : (
        <PanelButton
          accent={GOLD.pri}
          disabled={!canHarvest || loading}
          onClick={() => onStartHarvest(deposit.id)}
          style={{ width: '100%' }}
        >
          {loading ? 'Starting...' : '⛏️ Start Mining (50/hr)'}
        </PanelButton>
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
    <div style={{
      background: `linear-gradient(135deg, ${GOLD.pri}10, transparent)`,
      border: `1px solid ${EDGE}`,
      borderLeft: `2px solid ${GOLD.pri}`,
      borderRadius: 3,
      padding: 12,
      marginBottom: 10,
      boxShadow: `0 0 12px ${GOLD.pri}22`,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, animation: 'pulse 1.5s ease-in-out infinite' }}>⛏️</span>
          <span style={{
            fontWeight: 800,
            color: GOLD.light,
            fontSize: 11,
            fontFamily: F,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}>Mining Active</span>
        </div>
        <span style={{
          fontSize: 9,
          color: '#4a6580',
          fontFamily: FM,
          letterSpacing: 0.5,
        }}>{session.body_name}</span>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 14 }}>{CATEGORY_INFO[session.category]?.icon || '📦'}</span>
        <span style={{
          fontWeight: 700,
          fontSize: 12,
          fontFamily: F,
          color: RARITY_INFO[session.rarity]?.color || '#e2e8f0',
          letterSpacing: 0.3,
        }}>
          {session.resource_name}
        </span>
        {tier && (
          <span style={{
            fontSize: 9,
            padding: '2px 7px',
            borderRadius: 2,
            background: `${tier.color}22`,
            border: `1px solid ${tier.color}55`,
            color: tier.color,
            marginLeft: 'auto',
            fontFamily: F,
            fontWeight: 800,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}>
            {tier.name}
          </span>
        )}
      </div>

      {session.stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          columnGap: 14,
          rowGap: 2,
          marginBottom: 10,
        }}>
          <StatBar label="Purity" value={session.stats.purity} />
          <StatBar label="Stability" value={session.stats.stability} />
          <StatBar label="Potency" value={session.stats.potency} />
          <StatBar label="Density" value={session.stats.density} />
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 5,
        marginBottom: 10,
      }}>
        {[
          { label: 'ELAPSED', value: elapsed, color: '#a0b0c0' },
          { label: 'RATE', value: `${session.harvest_rate}/HR`, color: '#a0b0c0' },
          { label: 'TOTAL MINED', value: session.units_harvested, color: '#a0b0c0' },
          { label: 'READY', value: `~${estimatedPending}`, color: GOLD.light, accent: true },
        ].map((stat, i) => (
          <div key={i} style={{
            background: stat.accent ? `${GOLD.pri}15` : 'rgba(4,8,16,0.6)',
            border: `1px solid ${stat.accent ? `${GOLD.pri}44` : EDGE}`,
            borderRadius: 2,
            padding: '4px 7px',
          }}>
            <div style={{
              fontSize: 8,
              color: stat.accent ? GOLD.light : '#3a5a6a',
              fontFamily: FM,
              letterSpacing: 1,
            }}>{stat.label}</div>
            <div style={{
              fontSize: 11,
              color: stat.color,
              fontFamily: FM,
              fontWeight: 700,
              marginTop: 1,
            }}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          fontFamily: FM,
          color: '#4a6580',
          marginBottom: 3,
          letterSpacing: 0.5,
        }}>
          <span>DEPOSIT</span>
          <span style={{ color: '#a0b0c0' }}>{session.deposit_remaining} LEFT</span>
        </div>
        <div style={{
          height: 4,
          background: '#0a1528',
          border: `1px solid ${EDGE}`,
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${(session.deposit_remaining / session.deposit_total) * 100}%`,
            background: 'linear-gradient(90deg, #155e75, #22d3ee)',
          }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <PanelButton
          accent="#22c55e"
          disabled={collecting || estimatedPending <= 0}
          onClick={onCollect}
          style={{ flex: 1 }}
        >
          {collecting ? 'Collecting...' : `📦 Collect (~${estimatedPending})`}
        </PanelButton>
        <PanelButton
          accent="#ef4444"
          disabled={stopping}
          onClick={onStop}
        >
          {stopping ? '...' : '⏹ Stop'}
        </PanelButton>
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
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          padding: 12,
          marginBottom: 6,
          borderRadius: 3,
          border: dragOver ? `1px dashed ${GOLD.pri}` : `1px dashed ${EDGE}`,
          borderLeft: dragOver ? `2px dashed ${GOLD.pri}` : `2px dashed ${EDGE}`,
          background: dragOver ? `${GOLD.pri}10` : 'rgba(4,8,16,0.4)',
          minHeight: 70,
          transition: 'all 0.15s',
          boxShadow: dragOver ? glow(GOLD.pri, 0.15) : 'none',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#3a5a6a',
          fontSize: 10,
          fontFamily: F,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>📭</div>
            <div style={{
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}>Slot {slot + 1} — Drag harvester here</div>
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
    <div style={{
      background: `linear-gradient(135deg, ${color}10, transparent)`,
      border: `1px solid ${EDGE}`,
      borderLeft: `2px solid ${color}`,
      borderRadius: 3,
      padding: 10,
      marginBottom: 6,
      transition: 'all 0.15s',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <div>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#e2e8f0',
              fontFamily: F,
              letterSpacing: 0.3,
            }}>
              {harvester.harvester_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </div>
            <div style={{
              fontSize: 9,
              color: '#3a5a6a',
              fontFamily: FM,
              letterSpacing: 0.3,
            }}>
              SLOT {slot + 1} • {harvester.harvest_rate}/HR • {harvester.storage_capacity} CAP
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: statusColor,
            boxShadow: `0 0 4px ${statusColor}`,
            animation: harvester.status === 'active' ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }} />
          <span style={{
            fontSize: 9,
            color: statusColor,
            fontFamily: F,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}>{statusLabel}</span>
        </div>
      </div>

      {/* Deposit assignment */}
      <div style={{ marginBottom: 6 }}>
        {harvester.deposit_id ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(4,8,16,0.6)',
            border: `1px solid ${EDGE}`,
            borderRadius: 2,
            padding: '5px 8px',
          }}>
            <div style={{ fontSize: 10, fontFamily: F }}>
              <span style={{ color: '#4a6580' }}>Mining: </span>
              <span style={{ color: '#22d3ee', fontWeight: 700 }}>{harvester.resource_name}</span>
              <span style={{ color: '#3a5a6a', fontFamily: FM, fontSize: 9 }}> (slot {harvester.deposit_slot})</span>
            </div>
            <button
              onClick={() => setShowDepositPicker(true)}
              style={{
                fontSize: 9,
                color: '#4a6580',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: F,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <PanelButton
            size="sm"
            accent="#22d3ee"
            onClick={() => setShowDepositPicker(true)}
            style={{ width: '100%' }}
          >
            Assign Deposit
          </PanelButton>
        )}
      </div>

      {/* Deposit picker */}
      {showDepositPicker && (
        <div style={{
          marginBottom: 6,
          background: 'rgba(2,4,10,0.85)',
          border: `1px solid ${EDGE}`,
          borderLeft: `2px solid #22d3ee`,
          borderRadius: 3,
          padding: 8,
        }}>
          <div style={{
            fontSize: 9,
            color: '#4a6580',
            fontFamily: FM,
            letterSpacing: 1,
            marginBottom: 5,
            textTransform: 'uppercase',
          }}>Available Deposits:</div>
          {availableDeposits.length === 0 ? (
            <div style={{
              fontSize: 9,
              color: '#3a5a6a',
              fontFamily: F,
            }}>No available deposits</div>
          ) : (
            availableDeposits.map(d => (
              <button
                key={d.id}
                onClick={() => { onAssignDeposit(harvester.id, d.id); setShowDepositPicker(false); }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '4px 7px',
                  marginBottom: 2,
                  borderRadius: 2,
                  background: 'rgba(4,8,16,0.6)',
                  border: `1px solid ${EDGE}`,
                  fontSize: 10,
                  fontFamily: F,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ color: '#a0b0c0' }}>{d.resource_name} (slot {d.slot_number})</span>
                <span style={{ color: '#3a5a6a', fontFamily: FM }}>{d.quantity_remaining}</span>
              </button>
            ))
          )}
          <button
            onClick={() => setShowDepositPicker(false)}
            style={{
              fontSize: 9,
              color: '#4a6580',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              marginTop: 4,
              fontFamily: F,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Fuel bar */}
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setFuelDragOver(true); }}
        onDragLeave={() => setFuelDragOver(false)}
        onDrop={handleFuelDrop}
        style={{
          marginBottom: 5,
          padding: '5px 8px',
          borderRadius: 2,
          border: `1px solid ${fuelDragOver ? '#fbbf24' : EDGE}`,
          borderLeft: `2px solid ${fuelDragOver ? '#fbbf24' : (fuelPct > 30 ? '#fbbf24' : '#ef4444')}`,
          background: fuelDragOver ? 'rgba(251,191,36,0.08)' : 'rgba(4,8,16,0.6)',
          transition: 'all 0.15s',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          fontFamily: FM,
          marginBottom: 3,
          letterSpacing: 0.5,
        }}>
          <span style={{ color: '#4a6580' }}>🔋 FUEL</span>
          <span style={{
            color: harvester.fuel_remaining_hours > 0 ? '#fbbf24' : '#ef4444',
            fontWeight: 700,
          }}>
            {harvester.fuel_remaining_hours > 0 ? `${harvester.fuel_remaining_hours.toFixed(1)}H` : 'EMPTY — DRAG FUEL CELL'}
          </span>
        </div>
        <div style={{
          height: 4,
          background: '#0a1528',
          border: `1px solid ${EDGE}`,
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${fuelPct}%`,
            background: fuelPct > 30
              ? 'linear-gradient(90deg, #854d0e, #fbbf24)'
              : 'linear-gradient(90deg, #7f1d1d, #ef4444)',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Hopper bar */}
      <div style={{
        marginBottom: 8,
        padding: '5px 8px',
        borderRadius: 2,
        border: `1px solid ${EDGE}`,
        borderLeft: `2px solid ${hopperPct >= 90 ? '#ef4444' : hopperPct >= 70 ? '#fbbf24' : '#22d3ee'}`,
        background: 'rgba(4,8,16,0.6)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          fontFamily: FM,
          marginBottom: 3,
          letterSpacing: 0.5,
        }}>
          <span style={{ color: '#4a6580' }}>📦 HOPPER</span>
          <span style={{
            color: hopperPct >= 100 ? '#ef4444' : '#22d3ee',
            fontWeight: 700,
          }}>
            {harvester.hopper_quantity}/{harvester.storage_capacity}
          </span>
        </div>
        <div style={{
          height: 4,
          background: '#0a1528',
          border: `1px solid ${EDGE}`,
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${hopperPct}%`,
            background: hopperPct >= 90
              ? 'linear-gradient(90deg, #7f1d1d, #ef4444)'
              : hopperPct >= 70
                ? 'linear-gradient(90deg, #854d0e, #fbbf24)'
                : 'linear-gradient(90deg, #155e75, #22d3ee)',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5 }}>
        <PanelButton
          size="sm"
          accent="#22c55e"
          disabled={harvester.hopper_quantity <= 0}
          onClick={() => onCollect(harvester.id)}
          style={{ flex: 1 }}
        >
          Collect ({harvester.hopper_quantity})
        </PanelButton>
        <PanelButton
          size="sm"
          accent="#ef4444"
          disabled={harvester.hopper_quantity > 0}
          onClick={() => onRemove(harvester.id)}
          title={harvester.hopper_quantity > 0 ? 'Collect hopper first' : 'Remove harvester'}
        >
          ✕
        </PanelButton>
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
    return (
      <div style={{
        textAlign: 'center',
        padding: '32px 0',
        color: '#4a6580',
        fontSize: 11,
        fontFamily: F,
      }}>Loading harvesters...</div>
    );
  }

  if (!data) return null;

  const totalSlots = data.harvester_slots || 0;
  const harvesters = data.harvesters || [];
  const harvesterMap = {};
  harvesters.forEach(h => { harvesterMap[h.slot_index] = h; });

  return (
    <div>
      {/* Planet surface header */}
      <div style={{
        background: `linear-gradient(135deg, #ff662215, transparent)`,
        border: `1px solid ${EDGE}`,
        borderLeft: '2px solid #ff6622',
        borderRadius: 3,
        padding: '8px 12px',
        marginBottom: 10,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontSize: 12,
              fontWeight: 800,
              color: '#ff8a44',
              fontFamily: F,
              letterSpacing: 0.5,
            }}>{data.planet_name} Surface</div>
            <div style={{
              fontSize: 9,
              color: '#4a6580',
              fontFamily: FM,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}>{totalSlots} harvester slots available</div>
          </div>
          <div style={{
            fontSize: 10,
            color: '#a0b0c0',
            fontFamily: FM,
            fontWeight: 700,
            background: 'rgba(4,8,16,0.6)',
            border: `1px solid ${EDGE}`,
            borderRadius: 2,
            padding: '3px 7px',
          }}>
            {harvesters.length}/{totalSlots}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 8 }}>
          <MessageBar type="error">{error}</MessageBar>
        </div>
      )}
      {message && (
        <div style={{ marginBottom: 8 }}>
          <MessageBar type="success">{message}</MessageBar>
        </div>
      )}

      {totalSlots === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '32px 16px',
          color: '#3a5a6a',
          fontSize: 11,
          fontFamily: F,
        }}>
          This body does not support automated harvesters.
        </div>
      ) : (
        <div>
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
      <div style={{
        textAlign: 'center',
        padding: '32px 16px',
      }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
        <p style={{
          color: '#a0b0c0',
          fontSize: 12,
          marginBottom: 4,
          fontFamily: F,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}>Ground scan required</p>
        <p style={{
          color: '#4a6580',
          fontSize: 10,
          fontFamily: F,
          lineHeight: 1.5,
        }}>
          Complete both scans in the Scan tab to reveal minable deposits.
        </p>
      </div>
    );
  }

  if (loading && deposits.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{
          color: '#4a6580',
          fontSize: 11,
          fontFamily: F,
        }}>Loading deposits...</div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 8 }}>
          <MessageBar type="error">{error}</MessageBar>
        </div>
      )}
      {message && (
        <div style={{ marginBottom: 8 }}>
          <MessageBar type="success">{message}</MessageBar>
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

      <div>
        {deposits.length === 0 ? (
          <p style={{
            color: '#3a5a6a',
            fontSize: 11,
            textAlign: 'center',
            padding: '16px 0',
            fontFamily: F,
          }}>No deposits found</p>
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
        { id: 'starter_kit', name: 'Starter Kit', icon: '🎒', price: 500, desc: 'Full basic loadout for a Scout: engine, reactor, cargo pod, laser, sensor suite, nav computer.' },
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
      if (result.success) {
        flash('success', `Purchased ${result.hull.name}!`);
        refreshCredits();
        openWindow('shipBuilder');
      }
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
      if (result.success) {
        flash('success', `Bought ${result.module}`);
        refreshCredits();
        if (itemId === 'starter_kit') {
          questsAPI.completeQuest('tutorial_buy_starter_kit').catch(() => {});
        }
      }
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

  if (loading) return (
    <div style={{
      textAlign: 'center',
      padding: '32px 0',
      color: '#4a6580',
      fontSize: 11,
      fontFamily: F,
    }}>Loading vendor...</div>
  );

  return (
    <div>
      {message && (
        <div style={{ marginBottom: 8 }}>
          <MessageBar type={message.type === 'success' ? 'success' : 'error'}>{message.text}</MessageBar>
        </div>
      )}

      {/* Credits balance */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(4,8,16,0.6)',
        border: `1px solid ${EDGE}`,
        borderLeft: `2px solid ${GOLD.pri}`,
        borderRadius: 3,
        padding: '6px 10px',
        marginBottom: 10,
      }}>
        <span style={{
          fontSize: 9,
          color: '#4a6580',
          fontFamily: FM,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}>BALANCE</span>
        <span style={{
          fontSize: 13,
          fontWeight: 800,
          color: GOLD.light,
          fontFamily: FM,
        }}>⬡ {credits.toLocaleString()} CR</span>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {[
          { id: 'hulls',    label: 'Hulls',    icon: '🚀', count: hulls.length },
          { id: 'modules',  label: 'Modules',  icon: '⚙️', count: modules.length },
          { id: 'supplies', label: 'Supplies', icon: '📦', count: supplies.length },
          { id: 'sell',     label: 'Sell',     icon: '💰', count: sellInventory.resources.length + sellInventory.items.length },
        ].map(s => {
          const isActive = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                flex: 1,
                padding: '5px 6px',
                background: isActive
                  ? `linear-gradient(180deg, ${GOLD.pri}22, ${GOLD.pri}08)`
                  : 'rgba(4,8,16,0.5)',
                border: `1px solid ${isActive ? `${GOLD.pri}66` : EDGE}`,
                borderLeft: isActive ? `2px solid ${GOLD.pri}` : `1px solid ${EDGE}`,
                borderRadius: 2,
                color: isActive ? GOLD.light : '#4a6580',
                fontSize: 9,
                fontWeight: 800,
                fontFamily: F,
                cursor: 'pointer',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                transition: 'all 0.15s',
                boxShadow: isActive ? `0 0 6px ${GOLD.pri}33` : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
              <span style={{
                fontSize: 8,
                color: isActive ? GOLD.light : '#3a5a6a',
                opacity: 0.8,
              }}>{s.count}</span>
            </button>
          );
        })}
      </div>

      {/* Hulls */}
      {section === 'hulls' && (
        <div>
          {hulls.map(h => (
            <div key={h.id} style={{
              background: 'rgba(4,8,16,0.5)',
              border: `1px solid ${EDGE}`,
              borderLeft: `2px solid ${EDGE}`,
              borderRadius: 3,
              padding: 10,
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#e2e8f0',
                    fontFamily: F,
                  }}>{h.name}</span>
                  <Pill color="#a0b0c0">{h.class}</Pill>
                </div>
                <div style={{
                  fontSize: 9,
                  color: '#4a6580',
                  marginTop: 2,
                  fontFamily: F,
                }}>{h.description}</div>
                <div style={{
                  display: 'flex',
                  gap: 12,
                  marginTop: 5,
                  fontSize: 9,
                  fontFamily: FM,
                }}>
                  <span style={{ color: '#4a6580' }}>HULL <span style={{ color: '#a0b0c0', fontWeight: 700 }}>{h.base_hull}</span></span>
                  <span style={{ color: '#4a6580' }}>SPD <span style={{ color: '#a0b0c0', fontWeight: 700 }}>{h.base_speed}</span></span>
                  <span style={{ color: '#4a6580' }}>SLOTS <span style={{ color: '#a0b0c0', fontWeight: 700 }}>{(h.slots || []).length}</span></span>
                </div>
              </div>
              <PanelButton accent={GOLD.pri} onClick={() => buyHull(h.id)}>
                {h.price > 0 ? `${h.price.toLocaleString()} CR` : 'FREE'}
              </PanelButton>
            </div>
          ))}
        </div>
      )}

      {/* Modules */}
      {section === 'modules' && (
        <div>
          {Object.entries(modsByType).map(([type, mods]) => {
            const color = VENDOR_SLOT_COLORS[type] || '#888';
            return (
              <div key={type} style={{ marginBottom: 10 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 5,
                  padding: '4px 8px',
                  background: `linear-gradient(90deg, ${color}18, transparent)`,
                  borderLeft: `2px solid ${color}`,
                }}>
                  <div style={{
                    width: 7,
                    height: 7,
                    background: color,
                    boxShadow: `0 0 4px ${color}88`,
                  }} />
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    fontFamily: F,
                  }}>{type}</span>
                </div>
                <div>
                  {mods.map(m => (
                    <div key={m.id} style={{
                      background: 'rgba(4,8,16,0.5)',
                      border: `1px solid ${EDGE}`,
                      borderRadius: 3,
                      padding: 8,
                      marginBottom: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <div style={{
                        width: 3,
                        height: 32,
                        background: color,
                        boxShadow: `0 0 4px ${color}66`,
                        flexShrink: 0,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11,
                          color: '#e2e8f0',
                          fontWeight: 700,
                          fontFamily: F,
                        }}>{m.name}</div>
                        <div style={{
                          fontSize: 9,
                          color: '#4a6580',
                          fontFamily: FM,
                          letterSpacing: 0.3,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>T{m.tier} • {m.description}</div>
                      </div>
                      <PanelButton size="sm" accent={GOLD.pri} onClick={() => buyModule(m.id)}>
                        {m.buy_price.toLocaleString()} CR
                      </PanelButton>
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
        <div>
          {supplies.map(s => (
            <div key={s.id} style={{
              background: 'rgba(4,8,16,0.5)',
              border: `1px solid ${EDGE}`,
              borderRadius: 3,
              padding: 8,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 11,
                  color: '#e2e8f0',
                  fontWeight: 700,
                  fontFamily: F,
                }}>{s.name}</div>
                <div style={{
                  fontSize: 9,
                  color: '#4a6580',
                  fontFamily: FM,
                  letterSpacing: 0.3,
                }}>{s.desc}</div>
              </div>
              <PanelButton size="sm" accent={GOLD.pri} onClick={() => buySupply(s.id)}>
                {s.price} CR
              </PanelButton>
            </div>
          ))}
        </div>
      )}

      {/* Sell cargo */}
      {section === 'sell' && (
        <div>
          {sellInventory.resources.length === 0 && sellInventory.items.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '24px 0',
              color: '#3a5a6a',
              fontSize: 11,
              fontFamily: F,
            }}>Nothing to sell — go mine some resources!</div>
          ) : (
            <>
              {/* Resources */}
              {sellInventory.resources.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{
                    fontSize: 9,
                    color: '#4a6580',
                    fontFamily: FM,
                    letterSpacing: 1,
                    marginBottom: 5,
                    padding: '4px 8px',
                    background: `linear-gradient(90deg, #22c55e18, transparent)`,
                    borderLeft: `2px solid #22c55e`,
                    textTransform: 'uppercase',
                    fontWeight: 800,
                    color: '#4ade80',
                  }}>RESOURCES</div>
                  {sellInventory.resources.map(r => {
                    const qty = sellQuantities[r.id] ?? r.quantity;
                    const total = r.sell_price * qty;
                    return (
                      <div key={r.id} style={{
                        background: 'rgba(4,8,16,0.5)',
                        border: `1px solid ${EDGE}`,
                        borderRadius: 3,
                        padding: 8,
                        marginBottom: 4,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                fontSize: 11,
                                color: '#e2e8f0',
                                fontWeight: 700,
                                fontFamily: F,
                              }}>{r.resource_name}</span>
                              <span style={{
                                fontSize: 8,
                                color: '#4a6580',
                                fontFamily: FM,
                                textTransform: 'uppercase',
                              }}>{r.category}</span>
                              {r.quality_tier && (
                                <Pill color={
                                  r.quality_tier === 'legendary' ? '#fbbf24' :
                                  r.quality_tier === 'excellent' ? '#a855f7' :
                                  r.quality_tier === 'good' ? '#60a5fa' :
                                  r.quality_tier === 'fine' ? '#22c55e' :
                                  '#4a6580'
                                }>{r.quality_tier}</Pill>
                              )}
                            </div>
                            <div style={{
                              fontSize: 9,
                              color: '#4a6580',
                              fontFamily: FM,
                              letterSpacing: 0.3,
                              marginTop: 1,
                            }}>
                              {r.sell_price} CR/UNIT • {r.quantity} AVAILABLE
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="range"
                            min={1}
                            max={r.quantity}
                            value={qty}
                            onChange={e => setSellQuantities(prev => ({ ...prev, [r.id]: parseInt(e.target.value) }))}
                            style={{ flex: 1, height: 4, accentColor: '#22c55e' }}
                          />
                          <span style={{
                            fontSize: 9,
                            color: '#a0b0c0',
                            fontFamily: FM,
                            fontWeight: 700,
                            width: 32,
                            textAlign: 'right',
                          }}>{qty}</span>
                          <PanelButton size="sm" accent="#22c55e" onClick={() => sellResource(r.id, qty)}>
                            Sell {total} CR
                          </PanelButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Items & Modules */}
              {sellInventory.items.length > 0 && (
                <div>
                  <div style={{
                    fontSize: 9,
                    fontFamily: FM,
                    letterSpacing: 1,
                    marginBottom: 5,
                    padding: '4px 8px',
                    background: `linear-gradient(90deg, #22c55e18, transparent)`,
                    borderLeft: `2px solid #22c55e`,
                    textTransform: 'uppercase',
                    fontWeight: 800,
                    color: '#4ade80',
                  }}>ITEMS & MODULES</div>
                  {sellInventory.items.map(item => (
                    <div key={item.id} style={{
                      background: 'rgba(4,8,16,0.5)',
                      border: `1px solid ${EDGE}`,
                      borderRadius: 3,
                      padding: 8,
                      marginBottom: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <span style={{ fontSize: 16 }}>{item.item_icon || '📦'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11,
                          color: '#e2e8f0',
                          fontWeight: 700,
                          fontFamily: F,
                        }}>{item.item_name}</div>
                        <div style={{
                          fontSize: 9,
                          color: '#4a6580',
                          fontFamily: FM,
                          letterSpacing: 0.3,
                        }}>×{item.quantity} • {item.sell_price} CR EACH</div>
                      </div>
                      <PanelButton size="sm" accent="#22c55e" onClick={() => sellItem(item.id, item.quantity)}>
                        Sell {item.sell_price * item.quantity} CR
                      </PanelButton>
                    </div>
                  ))}
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
  const closeWindow = useGameStore(state => state.closeWindow);
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

  // Quest trigger: fly to Luna Station
  useEffect(() => {
    if (isOpen && body?.id === 'luna_station') {
      questsAPI.completeQuest('tutorial_fly_to_luna').catch(() => {});
    }
  }, [isOpen, body?.id]);
  
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

  const handleClose = () => closeWindow('planetInteraction');

  // Body stats for the info bar under the banner
  const sizeClass = body.size > 25 ? 'IV' : body.size > 15 ? 'III' : body.size > 8 ? 'II' : 'I';
  const gravity = body.size > 25 ? '1.8g' : body.size > 15 ? '1.0g' : body.size > 8 ? '0.6g' : '0.3g';

  return (
    <div
      className="fixed z-30"
      style={{
        top: 46,
        left: 56,
        bottom: 44,
        width: 440,
      }}
    >
      {/* Border layer */}
      <div style={{
        position: 'absolute',
        inset: -1,
        clipPath: diagMix(8),
        background: EDGE,
        zIndex: 0,
      }} />

      {/* Panel */}
      <div style={{
        position: 'relative',
        clipPath: diagMix(8),
        background: PANEL_BG,
        zIndex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: F,
      }}>
        {/* Landscape banner header */}
        <PlanetBanner body={body} onClose={handleClose} />

        {/* Stats bar under banner */}
        <div style={{
          display: 'flex',
          padding: '6px 14px',
          borderBottom: `1px solid ${EDGE}`,
          gap: 14,
          fontSize: 9,
          fontFamily: FM,
          color: '#3a5a6a',
          background: 'rgba(6,10,20,0.5)',
          flexShrink: 0,
          letterSpacing: 0.5,
        }}>
          <span>TYPE <span style={{ color: '#a0b0c0', textTransform: 'capitalize' }}>{body.planetType || body.type || '—'}</span></span>
          <span>SIZE <span style={{ color: '#a0b0c0' }}>Class {sizeClass}</span></span>
          <span>GRAV <span style={{ color: '#a0b0c0' }}>{gravity}</span></span>
          <span style={{ marginLeft: 'auto' }}>PROBES <span style={{ color: BLUE.light }}>{probes.scanner_probes}</span>/<span style={{ color: '#8b5cf6' }}>{probes.advanced_scanner_probes}</span></span>
        </div>

        {/* Content: vertical icon tabs + tab panel */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Vertical icon tabs */}
          <div style={{
            width: 46,
            borderRight: `1px solid ${EDGE}`,
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            background: 'rgba(4,8,16,0.4)',
          }}>
            {[
              { id: 'scan',       icon: '📡', label: 'Scan',       color: '#22d3ee' },
              { id: 'mine',       icon: '⛏️', label: 'Mine',       color: GOLD.pri },
              { id: 'harvesters', icon: '⚙️', label: 'Auto',       color: '#ff6622' },
              { id: 'vendor',     icon: '🏪', label: 'Vendor',     color: GOLD.light },
            ].map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                  style={{
                    width: 46,
                    height: 48,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    background: isActive ? `linear-gradient(90deg, ${tab.color}15, transparent)` : 'transparent',
                    borderLeft: isActive ? `3px solid ${tab.color}` : '3px solid transparent',
                    borderRight: 'none',
                    borderTop: 'none',
                    borderBottom: `1px solid ${EDGE}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    filter: isActive ? `drop-shadow(0 0 4px ${tab.color}33)` : 'none',
                  }}
                >
                  <span style={{ fontSize: 15 }}>{tab.icon}</span>
                  <span style={{
                    fontSize: 7,
                    color: isActive ? tab.color : '#2a3a4a',
                    fontWeight: 700,
                    fontFamily: F,
                    letterSpacing: 0.5,
                  }}>{tab.label.toUpperCase()}</span>
                </button>
              );
            })}
          </div>

          {/* Tab content area */}
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            {activeTab === 'scan' && (
              <div>
                {error && (
                  <div style={{
                    background: 'rgba(127,29,29,0.3)',
                    border: '1px solid rgba(239,68,68,0.5)',
                    borderRadius: 3,
                    padding: 10,
                    color: '#f87171',
                    fontSize: 11,
                    marginBottom: 10,
                  }}>{error}</div>
                )}

                <SectionHead
                  title="Orbital Scan"
                  accent="#22d3ee"
                  icon="📡"
                  right={surveyStatus.orbital_scanned ? '✓ COMPLETE' : '○ PENDING'}
                />
                <div style={{
                  background: 'rgba(4,8,16,0.5)',
                  border: `1px solid ${EDGE}`,
                  borderRadius: 3,
                  padding: 10,
                  marginBottom: 14,
                }}>
                  {surveyStatus.orbital_scanned && orbitalResults ? (
                    <>
                      <OrbitalScanResults resources={orbitalResults.resources_detected} />
                      <HazardWarning hazards={orbitalResults.hazards} />
                    </>
                  ) : surveyStatus.orbital_scanned ? (
                    <p style={{ color: '#64748b', fontSize: 11, margin: 0 }}>Scan data available. View deposits in the Mine tab.</p>
                  ) : (
                    <>
                      <p style={{ color: '#4a5a6a', fontSize: 11, margin: '0 0 10px', lineHeight: 1.5 }}>
                        Deploy a scanner probe to detect resource types and abundance levels on the surface.
                      </p>
                      <button
                        onClick={performOrbitalScan}
                        disabled={loading || probes.scanner_probes < 1}
                        style={{
                          padding: '8px 20px',
                          background: (loading || probes.scanner_probes < 1)
                            ? 'rgba(30,41,59,0.5)'
                            : 'linear-gradient(180deg, #22d3ee22, #22d3ee08)',
                          border: `1px solid ${(loading || probes.scanner_probes < 1) ? '#1e293b' : '#22d3ee55'}`,
                          color: (loading || probes.scanner_probes < 1) ? '#475569' : '#22d3ee',
                          fontSize: 11,
                          fontFamily: F,
                          fontWeight: 800,
                          cursor: (loading || probes.scanner_probes < 1) ? 'not-allowed' : 'pointer',
                          borderRadius: 3,
                          letterSpacing: 1,
                          boxShadow: (loading || probes.scanner_probes < 1) ? 'none' : glow('#22d3ee', 0.12),
                        }}
                      >
                        {loading ? 'SCANNING...' : 'DEPLOY PROBE'}
                      </button>
                      <div style={{ fontSize: 9, color: '#3a4a5a', marginTop: 6, fontFamily: FM }}>Requires 1 Scanner Probe</div>
                    </>
                  )}
                </div>

                <SectionHead
                  title="Ground Scan"
                  accent="#8b5cf6"
                  icon="🛰️"
                  right={surveyStatus.ground_scanned ? '✓ COMPLETE' : '○ PENDING'}
                />
                <div style={{
                  background: 'rgba(4,8,16,0.5)',
                  border: `1px solid ${EDGE}`,
                  borderRadius: 3,
                  padding: 10,
                }}>
                  {!surveyStatus.orbital_scanned ? (
                    <p style={{ color: '#4a5a6a', fontSize: 11, margin: 0 }}>Requires orbital scan first.</p>
                  ) : surveyStatus.ground_scanned && groundResults ? (
                    <GroundScanResults deposits={groundResults.deposits} />
                  ) : surveyStatus.ground_scanned ? (
                    <p style={{ color: '#64748b', fontSize: 11, margin: 0 }}>Detailed scan data available.</p>
                  ) : (
                    <>
                      <p style={{ color: '#4a5a6a', fontSize: 11, margin: '0 0 10px', lineHeight: 1.5 }}>
                        Deploy an advanced probe to analyze deposit composition and quality.
                      </p>
                      <button
                        onClick={performGroundScan}
                        disabled={loading || probes.advanced_scanner_probes < 1}
                        style={{
                          padding: '8px 20px',
                          background: (loading || probes.advanced_scanner_probes < 1)
                            ? 'rgba(30,41,59,0.5)'
                            : 'linear-gradient(180deg, #8b5cf622, #8b5cf608)',
                          border: `1px solid ${(loading || probes.advanced_scanner_probes < 1) ? '#1e293b' : '#8b5cf655'}`,
                          color: (loading || probes.advanced_scanner_probes < 1) ? '#475569' : '#8b5cf6',
                          fontSize: 11,
                          fontFamily: F,
                          fontWeight: 800,
                          cursor: (loading || probes.advanced_scanner_probes < 1) ? 'not-allowed' : 'pointer',
                          borderRadius: 3,
                          letterSpacing: 1,
                          boxShadow: (loading || probes.advanced_scanner_probes < 1) ? 'none' : glow('#8b5cf6', 0.12),
                        }}
                      >
                        {loading ? 'SCANNING...' : 'DEPLOY PROBE'}
                      </button>
                      <div style={{ fontSize: 9, color: '#3a4a5a', marginTop: 6, fontFamily: FM }}>Requires 1 Advanced Scanner Probe</div>
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'mine' && <MineTab body={body} surveyStatus={surveyStatus} />}
            {activeTab === 'harvesters' && <HarvestersTab body={body} />}
            {activeTab === 'vendor' && <VendorTab body={body} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanetInteractionWindow;
