// Planet Interaction Window — Stellaris-inspired restyle
// Full custom frame with landscape banner header + vertical icon tabs
// Opens when docked at a planet/station (not through the toolbar)

import React, { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';
import { getQualityTier, CATEGORY_INFO, RARITY_INFO } from '@/data/resources';
import { resourcesAPI, harvesterAPI, fittingAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';
import { getFleetScanTimeMs, fleetHasScanner } from '@/utils/shipStats';
import { COLORS, PanelButton, MessageBar, Pill } from '@/components/ui/panelStyles';
import { STAT_META, fmtStatValue } from '@/utils/quality';
import presence from '@/utils/presence';
import trade from '@/utils/trade';

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

      {/* Close button — top-right, matches ContextPanel / ModalOverlay style */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'rgba(15,25,45,0.8)',
          border: `1px solid ${EDGE}`,
          color: '#4a5a6a',
          width: 26,
          height: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          borderRadius: 3,
          fontSize: 12,
          fontFamily: F,
          zIndex: 5,
        }}
        title="Close"
      >
        ✕
      </button>

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

const OrbitalScanResults = ({ resources, probeQuality }) => {
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
            {/* Numeric estimate when probe quality > 50 (Phase 2). The
                server omits this field on baseline probes so the player
                sees the bucket label only -- buying/crafting a better
                probe is what reveals the number. */}
            {resource.quantity_estimate != null && (
              <span style={{ color: '#a0c860' }}>~{resource.quantity_estimate.toLocaleString()}u</span>
            )}
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
      {probeQuality != null && <ProbeQualityFooter q={probeQuality} />}
    </div>
  );
};

// Probe-quality footer rendered under both scan result panels.
// At Q50 it tells the player a baseline probe was used and hints that
// crafting a better probe would tighten the data.
const ProbeQualityFooter = ({ q }) => {
  const tier = getQualityTier(q, q, q, q);
  const hint = q <= 50
    ? 'Baseline probe. Craft a higher-quality probe for tighter readings.'
    : q >= 90
      ? 'Pristine probe — exact readings.'
      : 'Higher-quality probes tighten the numbers further.';
  return (
    <div style={{
      marginTop: 8, paddingTop: 8, borderTop: `1px solid ${EDGE}`,
      display: 'flex', alignItems: 'baseline', gap: 8,
      fontSize: 9, fontFamily: FM, color: '#5a6a7a',
    }}>
      <span>Scanned with</span>
      <span style={{ color: tier.color, fontWeight: 700 }}>
        {tier.name} (Q{q})
      </span>
      <span>probe</span>
      <span style={{ flex: 1 }} />
      <span style={{ color: '#3a4a5a', fontStyle: 'italic' }}>{hint}</span>
    </div>
  );
};

const GroundScanResults = ({ deposits, probeQuality }) => {
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
                <span style={{ color: '#a0b0c0', fontWeight: 700 }}>
                  {range.min === range.max ? range.min : `${range.min}-${range.max}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {probeQuality != null && <ProbeQualityFooter q={probeQuality} />}
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
        {harvester.deposit_id ? (() => {
          // Server attaches deposit_stats {purity, stability, potency,
          // density} when the harvester is assigned to a deposit; bucket
          // to a tier for the same colored badge the assignment picker
          // and inventory grid use.
          const ds = harvester.deposit_stats;
          const tier = ds
            ? getQualityTier(ds.purity, ds.stability, ds.potency, ds.density)
            : null;
          return (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(4,8,16,0.6)',
              border: `1px solid ${EDGE}`,
              borderRadius: 2,
              padding: '5px 8px',
            }}>
              <div style={{ fontSize: 10, fontFamily: F, flex: 1 }}>
                <span style={{ color: '#4a6580' }}>Mining: </span>
                <span style={{ color: '#22d3ee', fontWeight: 700 }}>{harvester.resource_name}</span>
                <span style={{ color: '#3a5a6a', fontFamily: FM, fontSize: 9 }}> (slot {harvester.deposit_slot})</span>
              </div>
              {tier && (
                <span style={{
                  fontSize: 8,
                  padding: '1px 5px',
                  borderRadius: 2,
                  fontWeight: 800,
                  fontFamily: F,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: tier.color,
                  background: `${tier.color}1a`,
                  border: `1px solid ${tier.color}55`,
                }}>{tier.name}</span>
              )}
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
          );
        })() : (
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
            availableDeposits.map(d => {
              // Deposit quality tier -- server already SELECTs all
              // stat_* columns on the deposit row, so we just read +
              // bucket. Players picking which deposit to attach a
              // harvester to should see the quality so they don't
              // sink an Auto into a Q15 dud.
              const tier = (d.stat_purity != null)
                ? getQualityTier(d.stat_purity, d.stat_stability, d.stat_potency, d.stat_density)
                : null;
              return (
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
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ color: '#a0b0c0', flex: 1 }}>
                    {d.resource_name} (slot {d.slot_number})
                  </span>
                  {tier && (
                    <span style={{
                      fontSize: 8,
                      padding: '1px 5px',
                      borderRadius: 2,
                      fontWeight: 800,
                      fontFamily: F,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      color: tier.color,
                      background: `${tier.color}1a`,
                      border: `1px solid ${tier.color}55`,
                    }}>{tier.name}</span>
                  )}
                  <span style={{ color: '#3a5a6a', fontFamily: FM }}>{d.quantity_remaining}</span>
                </button>
              );
            })
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

// HarvesterCargoPanel
// -------------------
// Right-side cargo pane mirroring CraftingCargoPanel's chrome.
// Shows item-type stacks from cargo (harvesters + fuel cells +
// anything else that's an item). Harvesters in cargo glow + accept
// click-to-deploy to the first empty harvester slot on the planet.
// Drag-drop still works for all items (the existing HarvesterSlotCard
// drop handlers stay unchanged).
const HARVESTER_SLOT_COLORS = {
  engine: '#ff6622', weapon: '#ff2244', shield: '#8844ff',
  cargo: '#ddaa22', utility: '#22ccaa', reactor: '#00ddff', mining: '#aa66ff',
};

const HarvesterItemTile = ({ stack, deployable, onClick }) => {
  // Same render code as InventoryWindow's item branch. Slot-typed
  // module items get a slot-type color; everything else falls back
  // to gold. Harvesters tend to lack slot_type so they end up gold.
  const slotType = stack.item_data?.slot_type;
  let borderColor = '#ffaa00';
  let iconBg = '#ffaa0022';
  let iconColor = '#ffaa00';
  if (slotType && HARVESTER_SLOT_COLORS[slotType]) {
    borderColor = HARVESTER_SLOT_COLORS[slotType];
    iconBg = HARVESTER_SLOT_COLORS[slotType] + '22';
    iconColor = HARVESTER_SLOT_COLORS[slotType];
  }
  let qualityDot = null;
  if (stack.item_data?.quality) {
    const q = stack.item_data.quality;
    const avg = (q.purity + q.stability + q.potency + q.density) / 4;
    if (avg >= 80) qualityDot = '#aa44ff';
    else if (avg >= 60) qualityDot = '#4488ff';
    else if (avg >= 40) qualityDot = '#44ff44';
  }
  const iconContent = stack.item_icon || '📦';

  return (
    <div
      className="relative cursor-pointer transition-all hover:brightness-125"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({
          stack_id: stack.id,
          item_type: 'item',
          item_id: stack.item_id,
          item_name: stack.item_name,
          item_icon: stack.item_icon,
          item_data: stack.item_data,
          quantity: stack.quantity,
        }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onClick}
      title={onClick
        ? `Click to deploy ${stack.item_name}`
        : stack.item_name}
      style={{
        width: 40,
        height: 40,
        border: `2px solid ${borderColor}`,
        borderRadius: 4,
        background: `linear-gradient(135deg, ${borderColor}15 0%, ${borderColor}08 100%)`,
        boxShadow: deployable
          ? `0 0 8px ${borderColor}aa, inset 0 0 8px ${borderColor}33`
          : `inset 0 0 8px ${borderColor}11`,
        opacity: deployable || !onClick ? 1 : 0.55,
      }}
    >
      <div
        className="absolute inset-1 rounded flex items-center justify-center font-bold"
        style={{ fontSize: '16px' }}
      >
        {iconContent}
      </div>
      {stack.quantity > 1 && (
        <div
          className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold px-1 rounded-sm leading-tight"
          style={{ backgroundColor: '#000000cc', color: '#ffffff', minWidth: 14, textAlign: 'center' }}
        >
          {stack.quantity}
        </div>
      )}
      {qualityDot && (
        <div
          className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: qualityDot }}
        />
      )}
    </div>
  );
};

const HarvesterCargoPanel = ({ firstEmptySlot, onDeployFromCargo }) => {
  const [stacks, setStacks] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await resourcesAPI.getInventory();
      // Only items (modules / harvesters / fuel cells). Resources can't
      // be deployed to a harvester slot or refueled, so they're filtered.
      const out = (data.items || []).filter(it => it.item_type === 'item');
      setStacks(out);
    } catch (err) {
      console.error('Harvester cargo panel load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);
  useEffect(() => {
    const t = setInterval(fetchInventory, 5000);
    return () => clearInterval(t);
  }, [fetchInventory]);

  const hasAny = stacks.length > 0;
  const canDeploy = firstEmptySlot != null;

  return (
    <div
      className="flex flex-col h-full min-h-0"
      style={{
        width: 220,
        flexShrink: 0,
        background: '#0c1018',
        borderRadius: 6,
        border: '1px solid #1e293b',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-700/40">
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 12 }}>📦</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Cargo</span>
        </div>
        <button
          onClick={fetchInventory}
          title="Refresh from cargo"
          className="text-[10px] text-slate-500 hover:text-cyan-300 transition-colors px-1"
        >
          ↻
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-1.5" style={{ scrollbarWidth: 'thin' }}>
        {loading && !hasAny && (
          <div className="text-[10px] text-slate-600 text-center mt-3">Loading…</div>
        )}
        {!loading && !hasAny && (
          <div className="text-[10px] text-slate-500 text-center mt-3 px-2 leading-snug">
            No items in cargo.
            <div className="text-slate-600 mt-1">Craft a harvester (or buy fuel cells) and they'll show up here.</div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 px-0.5">
          {stacks.map(stack => {
            const isHarvester = stack.item_id?.includes('harvester');
            const deployable = isHarvester && canDeploy;
            return (
              <HarvesterItemTile
                key={stack.id}
                stack={stack}
                deployable={deployable}
                onClick={deployable
                  ? () => onDeployFromCargo(firstEmptySlot, {
                      stack_id: stack.id,
                      item_type: 'item',
                      item_id: stack.item_id,
                      item_name: stack.item_name,
                    })
                  : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-2 py-1 border-t border-slate-700/40 text-[9px] text-slate-500 text-center leading-tight">
        {canDeploy
          ? 'Click a glowing harvester to deploy'
          : 'All slots full — collect or remove one'}
      </div>
    </div>
  );
};

const HarvestersTab = ({ body, effectiveBodyId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  // Status/error feedback goes to the global toast queue instead of an
  // inline MessageBar -- the inline version caused layout shift on every
  // deploy/refuel/collect, pushing the harvester slots around.
  const pushToast = useGameStore(state => state.pushToast);
  const completeQuest = useGameStore(state => state.completeQuest);
  const flash = (kind, text) => { if (pushToast) pushToast({ kind, text }); };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await harvesterAPI.getPlanetHarvesters(effectiveBodyId);
      setData(result);
    } catch (err) {
      flash('error', err.message);
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
    try {
      await harvesterAPI.deploy(effectiveBodyId, slotIndex, dragData.stack_id, null);
      flash('success', 'Harvester deployed! Assign a deposit to start mining.');
      await fetchData();
      // Tutorial: first harvester deploy completes "Set & Forget".
      if (completeQuest) completeQuest('tutorial_deploy_harvester');
    } catch (err) {
      flash('error', err.message);
    }
  };

  const handleAssignDeposit = async (harvesterId, depositId) => {
    try {
      await harvesterAPI.assignDeposit(harvesterId, depositId);
      flash('success', 'Deposit assigned.');
      await fetchData();
    } catch (err) {
      flash('error', err.message);
    }
  };

  const handleRefuel = async (harvesterId, fuelItemId) => {
    try {
      const result = await harvesterAPI.refuel(harvesterId, fuelItemId);
      flash('success', `Added ${result.fuel_added_hours.toFixed(1)}h fuel.`);
      await fetchData();
    } catch (err) {
      flash('error', err.message);
    }
  };

  const handleCollect = async (harvesterId) => {
    try {
      const result = await harvesterAPI.collect(harvesterId);
      flash('success', result.message);
      await fetchData();
      // Tutorial: first harvester collect completes "Coming Home".
      if (completeQuest) completeQuest('tutorial_collect_harvester');
    } catch (err) {
      flash('error', err.message);
    }
  };

  const handleRemove = async (harvesterId) => {
    try {
      await harvesterAPI.remove(harvesterId);
      flash('success', 'Harvester returned to cargo.');
      await fetchData();
    } catch (err) {
      flash('error', err.message);
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

  // First empty slot index (for click-to-deploy from the cargo pane).
  // Null when all slots are occupied -- panel still renders tiles but
  // disables click + glow.
  let firstEmptySlot = null;
  for (let i = 0; i < totalSlots; i++) {
    if (!harvesterMap[i]) { firstEmptySlot = i; break; }
  }

  return (
    <div style={{ display: 'flex', gap: 10, minHeight: 0 }}>
      {/* Left: existing slot list */}
      <div style={{ flex: 1, minWidth: 0 }}>
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

      {/* Right: cargo pane -- click a harvester to deploy it to the
          first empty slot. Drag-drop still works for users who prefer
          it, but click is the primary path (matches the crafting
          window cargo pane). */}
      <HarvesterCargoPanel
        firstEmptySlot={firstEmptySlot}
        onDeployFromCargo={handleDeploy}
      />
    </div>
  );
};

// ============================================
// MINE TAB
// ============================================

const MineTab = ({ body, surveyStatus, effectiveBodyId }) => {
  const [deposits, setDeposits] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [cargo, setCargo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  // Status/error feedback goes to the global toast queue. Inline
  // MessageBar caused layout shift each time a mining action started/
  // collected, displacing the deposit list and active-session panel.
  const pushToast = useGameStore(state => state.pushToast);
  const completeQuest = useGameStore(state => state.completeQuest);
  const flash = (kind, text) => { if (pushToast) pushToast({ kind, text }); };

  const fetchData = useCallback(async () => {
    // effectiveBodyId is resolved asynchronously by the parent
    // (Sol bodies set it immediately, procedural systems await an
    // ensureBody round-trip). Bail until both body.id AND
    // effectiveBodyId are ready -- without the second guard the
    // first mount fires with effectiveBodyId=null, the API call
    // returns nothing useful, and the deps array doesn't pick up
    // effectiveBodyId so the refetch never happens. Including it
    // in the deps re-fires fetch when null -> UUID.
    if (!body?.id || !effectiveBodyId) return;
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
      flash('error', err.message);
    } finally {
      setLoading(false);
    }
  }, [body?.id, effectiveBodyId]);

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

  const handleStartHarvest = async (depositId) => {
    setActionLoading(true);
    try {
      const data = await resourcesAPI.startHarvest(depositId);
      setActiveSession(data.session);
      if (data.cargo) setCargo(data.cargo);
      flash('success', data.message);
      await fetchData();
      // Tutorial: starting a manual planetary mine completes "Pickaxe Time".
      if (completeQuest) completeQuest('tutorial_mine_deposit');
    } catch (err) {
      flash('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCollect = async () => {
    setActionLoading(true);
    try {
      const data = await resourcesAPI.collectHarvest();
      flash('success', data.message);
      // Tutorial: collecting the planetary harvest completes "Cargo
      // In Hand" (the bridge between mining and crafting).
      if (completeQuest) completeQuest('tutorial_collect_minerals');

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
      flash('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      const data = await resourcesAPI.stopHarvest();
      flash('success', data.message);
      setActiveSession(null);
      await fetchData();
      // Refresh cargo
      const cargoData = await resourcesAPI.getCargo();
      setCargo(cargoData.cargo);
    } catch (err) {
      flash('error', err.message);
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
  const [recipes, setRecipes] = useState([]); // Migration 053: needed so "Craft this" button can route to the right recipe
  const [sellInventory, setSellInventory] = useState({ resources: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('hulls'); // 'hulls', 'modules', 'supplies', 'sell'
  const [sellQuantities, setSellQuantities] = useState({}); // id → quantity to sell
  // Credits are read directly from the global store so that ANY server-side
  // change (vendor tx, combat loot, quest reward, future sources) reflects
  // here the same way it does in the top bar. Never maintain a separate copy.
  const credits = useGameStore(state => state.resources?.credits ?? 0);
  const fetchCredits = useGameStore(state => state.fetchCredits);
  const fetchShips = useGameStore(state => state.fetchShips);
  const openWindow = useGameStore(state => state.openWindow);
  const completeQuest = useGameStore(state => state.completeQuest);
  const pushToast = useGameStore(state => state.pushToast);
  // Tech-gate awareness: subscribe to techs so locked modules render
  // with a "Research X to unlock" badge instead of a buy button.
  const techs = useGameStore(state => state.techs);
  const setCraftingTargetRecipe = useGameStore(state => state.setCraftingTargetRecipe);
  const setResearchTargetTech = useGameStore(state => state.setResearchTargetTech);
  const closeWindow = useGameStore(state => state.closeWindow);

  // Call after any vendor tx to immediately pull the authoritative balance
  // from the server (the 3s poll would catch it eventually, but we want it
  // to feel instant).
  const refreshCredits = async () => {
    try {
      await fetchCredits();
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
      const [hullsRes, modsRes, recipesRes] = await Promise.all([
        fittingAPI.getHulls(),
        fittingAPI.getModuleTypes(),
        resourcesAPI.getRecipes(),
      ]);
      setHulls(hullsRes.hulls || []);
      setRecipes(recipesRes.recipes || []);

      // Group modules by slot type. Filter by buy_price > 0 so
      // craft-only modules don't appear in the vendor (their recipe
      // is still discoverable via the Crafting window).
      const mods = modsRes.modules || [];
      setModules(mods.filter(m => m.buy_price));

      // Supplies are non-module purchasable items — fuel, probes etc
      // For now these come from a static list since they use the crafting system
      setSupplies([
        { id: 'starter_kit', name: 'Starter Kit', icon: '🎒', price: 500, desc: 'Full basic loadout for a Scout: engine, reactor, cargo pod, laser, sensor suite, nav computer.' },
        { id: 'fuel_cell', name: 'Fuel Cell', icon: '🔋', price: 100, desc: 'Powers a harvester for 6 hours.' },
        { id: 'scanner_probe', name: 'Scanner Probe', icon: '📡', price: 50, desc: 'Basic orbital scanner.' },
        { id: 'advanced_scanner_probe', name: 'Adv. Scanner Probe', icon: '🛰️', price: 150, desc: 'Ground-penetrating scanner.' },
        { id: 'missile_warhead', name: 'Missile Warhead', icon: '🚀', price: 30, desc: 'Ammo for missile launchers. Buy in bulk.' },
      ]);
    } catch (err) {
      console.error('Vendor load error:', err);
    }
    setLoading(false);
  };

  // Vendor notifications go to the global toast queue instead of an
  // inline MessageBar -- the inline version caused a layout shift on
  // every transaction as it appeared/disappeared, pushing the rest of
  // the vendor UI down. Toast is fixed-position bottom-of-screen so
  // it doesn't reflow vendor content.
  const flash = (type, text) => {
    if (pushToast) pushToast({ kind: type === 'success' ? 'success' : 'error', text });
  };

  const buyHull = async (hullId) => {
    try {
      const result = await fittingAPI.buyHull(hullId);
      if (result.success) {
        flash('success', `Purchased ${result.hull.name}!`);
        openWindow('shipBuilder');
      }
    } catch (err) {
      flash('error', err.message || 'Failed to buy hull');
    } finally {
      refreshCredits();
      // Sync the global ships array. SystemView's auto-disembark
      // useEffect watches `ships`; without this refresh, a podded
      // player who buys a hull at the vendor stays stuck in the pod
      // because the new hull never appears in the store.
      if (fetchShips) fetchShips();
    }
  };

  const buyModule = async (moduleId) => {
    try {
      const result = await fittingAPI.buyModule(moduleId);
      if (result.success) { flash('success', `Bought ${result.module} for ${result.price} cr`); }
    } catch (err) {
      flash('error', err.message || 'Failed to buy module');
    } finally {
      refreshCredits();
    }
  };

  const buySupply = async (itemId) => {
    try {
      const result = await fittingAPI.buyModule(itemId);
      if (result.success) {
        flash('success', `Bought ${result.module}`);
        if (itemId === 'starter_kit') {
          completeQuest('tutorial_buy_starter_kit');
        }
      }
    } catch (err) {
      flash('error', err.message || 'Failed to buy supply');
    } finally {
      refreshCredits();
    }
  };

  // Reload all missile launchers on the active ship from warheads in
  // cargo. Server tops up every fitted launcher to its ammo_capacity
  // in a single call, then we refresh ships so the client mirror picks
  // up the new `loaded` value. Shown only when the active ship has a
  // missile launcher fitted -- no point showing a no-op button.
  const reloadMissiles = async () => {
    try {
      const store = useGameStore.getState();
      // Build { [shipId]: { [slotKey]: currentAmmo } } across the
      // whole fleet from the missileAmmo mirror SystemView keeps in
      // the store. Server uses these counts (instead of its own
      // stale `loaded` field) to compute warheads needed per launcher.
      const ammoState = store.missileAmmo || {};
      const currentLoaded = {};
      for (const [key, ammo] of Object.entries(ammoState)) {
        const sepIdx = key.indexOf('::');
        if (sepIdx < 0) continue;
        const sid = key.slice(0, sepIdx);
        const slotKey = key.slice(sepIdx + 2);
        if (!currentLoaded[sid]) currentLoaded[sid] = {};
        currentLoaded[sid][slotKey] = ammo;
      }
      const result = await fittingAPI.reloadMissiles(currentLoaded);
      if (result.already_full) {
        flash('info', `All ${result.launcher_count} launcher${result.launcher_count === 1 ? '' : 's'} already loaded.`);
      } else {
        const shipsTxt = result.ship_count > 1 ? ` across ${result.ship_count} ships` : '';
        flash('success', `Reloaded ${result.reloaded_slots.length} launcher${result.reloaded_slots.length === 1 ? '' : 's'}${shipsTxt} — ${result.warheads_consumed} warhead${result.warheads_consumed === 1 ? '' : 's'} used.`);
      }
      if (fetchShips) await fetchShips();
    } catch (err) {
      flash('error', err.message || 'Reload failed');
    }
  };

  const sellResource = async (inventoryId, quantity) => {
    try {
      const result = await fittingAPI.sellResource(inventoryId, quantity);
      if (result.success) {
        flash('success', `Sold ${result.sold} ${result.resource_name} for ${result.total_earned} cr`);
        loadSellInventory();
        // Tutorial: first successful resource sale completes "Cash Out".
        // Hooked only on the resource sell path (not sellItem) because
        // the quest is specifically about selling mined ore. Server is
        // idempotent so firing on every sale is harmless.
        if (completeQuest) completeQuest('tutorial_sell_at_luna');
      }
    } catch (err) {
      flash('error', err.message || 'Failed to sell');
    } finally {
      refreshCredits();
    }
  };

  const sellItem = async (inventoryId, quantity) => {
    try {
      const result = await fittingAPI.sellItem(inventoryId, quantity);
      if (result.success) {
        flash('success', `Sold ${result.item_name} for ${result.total_earned} cr`);
        loadSellInventory();
      }
    } catch (err) {
      flash('error', err.message || 'Failed to sell');
    } finally {
      refreshCredits();
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
              onClick={() => { playSound('button_click'); setSection(s.id); }}
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
              <PanelButton accent={GOLD.pri} onClick={() => { playSound('button_click'); buyHull(h.id); }}>
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
                  {mods.map(m => {
                    // Look up recipe (so "Craft this" button can route)
                    // and tech-lock status (research not yet unlocked).
                    const recipe = recipes.find(r => r.output_item_id === m.id);
                    const techId = m.requires_tech;
                    const tech = techId ? techs.find(t => t.id === techId) : null;
                    // Server returns status: 'unlocked' for completed
                    // research (see research.js:76). Anything else
                    // ('locked' / 'available') means the player can't
                    // use this module yet.
                    const locked = !!techId && tech?.status !== 'unlocked';
                    return (
                      <div key={m.id} style={{
                        background: 'rgba(4,8,16,0.5)',
                        border: `1px solid ${EDGE}`,
                        borderRadius: 3,
                        padding: 8,
                        marginBottom: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        opacity: locked ? 0.75 : 1,
                        // Reserve a fixed row height so 1-line and 2-line
                        // descriptions land at the same row height. The
                        // description below clamps to 2 lines, plus a
                        // compact stats line beneath -- bumped to 66 to
                        // fit name (~14) + desc (~24) + stats (~12) +
                        // padding without clipping.
                        minHeight: 66,
                      }}>
                        <div style={{
                          width: 3,
                          // Span the new taller content (name + desc +
                          // stats) so the accent bar reads as the row's
                          // left edge instead of a stranded stripe.
                          height: 54,
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
                            lineHeight: 1.35,
                            // Always reserve 2 lines of height (line-height
                            // 1.35 * font 9 * 2 ≈ 24px) so a short
                            // description doesn't shrink the row -- keeps
                            // all module rows aligned vertically.
                            height: '2.7em',
                            // Clamp to 2 lines with ellipsis on overflow.
                            // -webkit-line-clamp is supported in every
                            // browser we ship to.
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>T{m.tier} • {m.description}</div>
                          {/* Compact stats line. Uses the shared
                              STAT_META labels + fmtStatValue so the
                              numbers (units, decimals) match what
                              the player will see in the cargo
                              tooltip + the ship-designer slot info
                              once they buy. Vendor modules are
                              quality-50 baseline, so no quality
                              scaling needed -- just raw base stats. */}
                          {m.stats && (() => {
                            const entries = Object.entries(m.stats)
                              .filter(([, v]) => typeof v === 'number');
                            if (entries.length === 0) return null;
                            return (
                              <div style={{
                                marginTop: 3,
                                fontSize: 9,
                                color: '#7a8a9a',
                                fontFamily: FM,
                                letterSpacing: 0.3,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}>
                                {entries.map(([key, val], i) => {
                                  const meta = STAT_META[key];
                                  const label = meta?.label || key.replace(/_/g, ' ');
                                  return (
                                    <span key={key}>
                                      {i > 0 && <span style={{ color: '#3a4a5a' }}> · </span>}
                                      <span style={{ color: '#4a6580' }}>{label} </span>
                                      <span style={{ color: '#c5d0db' }}>{fmtStatValue(val, meta)}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Action cluster: locked → link to research +
                            "Craft this" if a recipe exists (craft window
                            shows the lock too, but the button is still
                            useful for ingredient review). Unlocked → buy
                            button + craft button. */}
                        {locked ? (
                          <button
                            onClick={() => {
                              playSound('button_click');
                              setResearchTargetTech(techId);
                              openWindow('research');
                            }}
                            title={`Click to jump to ${tech?.name || techId} in the research tree`}
                            style={{
                              padding: '4px 10px',
                              fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
                              textTransform: 'uppercase',
                              fontFamily: F,
                              color: '#fbbf24',
                              background: 'rgba(133,77,14,0.25)',
                              border: '1px solid rgba(251,191,36,0.5)',
                              borderRadius: 2,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >🔒 {tech?.name || 'Research Required'}</button>
                        ) : (
                          <PanelButton size="sm" accent={GOLD.pri} onClick={() => { playSound('button_click'); buyModule(m.id); }}>
                            {m.buy_price.toLocaleString()} CR
                          </PanelButton>
                        )}
                        {recipe && (
                          <button
                            onClick={() => {
                              playSound('button_click');
                              setCraftingTargetRecipe(recipe.id);
                              openWindow('crafting');
                              closeWindow('planetInteraction');
                            }}
                            title={`Open Crafting with ${recipe.name} preselected`}
                            style={{
                              padding: '4px 8px',
                              fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
                              textTransform: 'uppercase',
                              fontFamily: F,
                              color: '#a855f7',
                              background: 'rgba(88,28,135,0.25)',
                              border: '1px solid rgba(168,85,247,0.4)',
                              borderRadius: 2,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >⚒ Craft</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Supplies */}
      {section === 'supplies' && (
        <div>
          {/* Reload All Missiles -- shown when ANY active fleet ship
              has a missile launcher. Server endpoint refills every
              launcher across the whole fleet in one transaction,
              consuming warheads from cargo. Each launcher has its
              own independent magazine (40 rounds at T1). */}
          {(() => {
            const ships = useGameStore.getState().ships || [];
            const fleetLaunchers = ships
              .filter(s => s.storage_body_id == null)
              .flatMap(s => Object.values(s.fitted_modules || {})
                .filter(m => m?.module_type_id?.startsWith?.('weapon_missile')));
            if (fleetLaunchers.length === 0) return null;
            return (
              <div style={{
                background: `linear-gradient(135deg, #22c55e15, transparent)`,
                border: `1px solid #22c55e44`,
                borderLeft: `2px solid #22c55e`,
                borderRadius: 3,
                padding: 10,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>🚀</span>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 11, color: '#86efac', fontWeight: 800,
                    fontFamily: F, letterSpacing: 0.5,
                  }}>
                    RELOAD ALL FLEET MISSILES
                  </div>
                  <div style={{ fontSize: 9, color: '#4a6580', fontFamily: FM }}>
                    Tops up every launcher across your active fleet ({fleetLaunchers.length} launcher{fleetLaunchers.length === 1 ? '' : 's'}) from warheads in cargo.
                  </div>
                </div>
                <PanelButton size="sm" accent="#22c55e" onClick={() => { playSound('button_click'); reloadMissiles(); }}>
                  Reload
                </PanelButton>
              </div>
            );
          })()}
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
              <PanelButton size="sm" accent={GOLD.pri} onClick={() => { playSound('button_click'); buySupply(s.id); }}>
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
                                // quality_tier is an object {name, color}
                                // from getQualityTier -- render the .name
                                // string + read .color directly. The old
                                // string-equality switch never matched
                                // (compared object to 'legendary' etc.)
                                // and would crash on object-as-child once
                                // a stack had stats populated, e.g. from
                                // asteroid mining.
                                <Pill color={r.quality_tier.color || '#4a6580'}>
                                  {r.quality_tier.name}
                                </Pill>
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
                          <PanelButton size="sm" accent="#22c55e" onClick={() => { playSound('button_click'); sellResource(r.id, qty); }}>
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
                      <PanelButton size="sm" accent="#22c55e" onClick={() => { playSound('button_click'); sellItem(item.id, item.quantity); }}>
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
// POPULATED BODY TAB (City / Station)
// ============================================
// Shown only on bodies with has_city = TRUE or body_type = 'station'.
// Wraps the existing VendorTab and surfaces stub panes for NPCs and
// Buildings. Same component is used for both cities and stations -- the
// outer "Populated" label/icon swap is handled by the parent's iconTabs.

const NPCsStub = () => (
  <div style={{
    textAlign: 'center',
    padding: '40px 16px',
    color: '#3a5a6a',
    fontSize: 11,
    fontFamily: F,
  }}>
    <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>👥</div>
    <div style={{ marginBottom: 4 }}>No NPCs available yet.</div>
    <div style={{ fontSize: 9, color: '#2a3a4a', fontFamily: FM, letterSpacing: 0.5 }}>
      QUEST GIVERS COMING SOON
    </div>
  </div>
);

const BuildingsStub = () => (
  <div style={{
    textAlign: 'center',
    padding: '40px 16px',
    color: '#3a5a6a',
    fontSize: 11,
    fontFamily: F,
  }}>
    <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>🏗️</div>
    <div style={{ marginBottom: 4 }}>No constructions available.</div>
    <div style={{ fontSize: 9, color: '#2a3a4a', fontFamily: FM, letterSpacing: 0.5 }}>
      SETTLEMENTS &amp; FORTRESSES COMING SOON
    </div>
  </div>
);

// Single ship row in the Ship Manager. Module-scope so it's a stable
// component type across ShipsTab re-renders -- defining it inside
// ShipsTab was creating a fresh component type each render, which can
// cause React to tear down + recreate the buttons on every parent
// state update and swallow click events.
const ShipManagerRow = ({ ship, isActiveShip, action, onClick, disabled, hint, extraHint }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    padding: 8, background: 'rgba(4,8,16,0.5)',
    border: `1px solid ${EDGE}`,
    borderLeft: `2px solid ${isActiveShip ? '#60a5fa' : EDGE}`,
    borderRadius: 3, marginBottom: 4,
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', fontFamily: F }}>
        {ship.name}{isActiveShip && <span style={{ color: '#60a5fa', marginLeft: 6, fontSize: 9 }}>· ACTIVE</span>}
      </div>
      <div style={{ fontSize: 9, color: '#4a6580', fontFamily: FM, letterSpacing: 0.3 }}>
        {ship.hull_name || ship.hull_type_id}
        {action === 'activate' && ship.storage_body_name && <span> · housed here</span>}
      </div>
      {extraHint && (
        <div style={{ fontSize: 9, color: '#fbbf24aa', fontFamily: FM, marginTop: 2, letterSpacing: 0.2 }}>
          {extraHint}
        </div>
      )}
    </div>
    <PanelButton
      size="sm"
      accent={disabled ? '#5a6a7a' : (action === 'activate' ? '#22c55e' : GOLD.light)}
      onClick={disabled ? undefined : onClick}
      title={hint || ''}
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {action === 'activate' ? 'Activate' : 'Store Here'}
    </PanelButton>
  </div>
);

// Ship Manager — sub-tab inside the City/Station UI. Lists ships
// stored at THIS body (with Activate buttons gated on fleet cap) and
// active fleet ships (with Store Here buttons). Same actions as the
// global Fleet window, scoped to the current dock.
const ShipsTab = ({ body, effectiveBodyId }) => {
  const [ships, setShips] = useState([]);
  const [activeShipId, setActiveShipId] = useState(null);
  const [fleetCap, setFleetCap] = useState(5);
  const [loading, setLoading] = useState(false);
  const pushToast = useGameStore(state => state.pushToast);
  // fetchShips refreshes the global ships array. Required after store /
  // activate so SystemView's flying-fleet memo, the top-bar HUD, the
  // Outliner, etc. pick up the new storage_body_id and stop rendering
  // stored ships in the active fleet.
  const fetchShips = useGameStore(state => state.fetchShips);
  const flash = (kind, text) => { if (pushToast) pushToast({ kind, text }); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fittingAPI.getFleet();
      setShips(data.ships || []);
      setActiveShipId(data.activeShipId);
      if (data.fleetCap) setFleetCap(data.fleetCap);
    } catch (err) {
      console.error('Fleet load (ShipsTab) error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleActivate = async (shipId) => {
    try {
      const result = await fittingAPI.activateShip(shipId);
      flash('success', `${result.ship_name} added to active fleet.`);
      await load();
      if (fetchShips) await fetchShips();
    } catch (err) { flash('error', err.message || 'Failed to activate ship'); }
  };
  const handleStore = async (shipId) => {
    if (!effectiveBodyId) {
      flash('error', 'Station not yet resolved — try again in a moment.');
      return;
    }
    try {
      const result = await fittingAPI.storeShip(shipId, effectiveBodyId);
      flash('success', `${result.ship_name} stored at ${result.storage_body_name}.`);
      await load();
      if (fetchShips) await fetchShips();
    } catch (err) {
      console.warn('store-ship failed:', err);
      flash('error', err?.message || 'Failed to store ship');
    }
  };

  const housedHere    = ships.filter(s => s.storage_body_name === body.name);
  const activeShips   = ships.filter(s => s.storage_body_id == null);
  const activeCount   = activeShips.length;
  const canActivate   = activeCount < fleetCap;

  const sectionHeader = (label, accent) => (
    <div style={{
      fontSize: 9, fontFamily: FM, letterSpacing: 1, marginTop: 10, marginBottom: 5,
      padding: '4px 8px', background: `linear-gradient(90deg, ${accent}18, transparent)`,
      borderLeft: `2px solid ${accent}`, textTransform: 'uppercase',
      fontWeight: 800, color: accent,
    }}>{label}</div>
  );

  // ShipRow uses the module-scope ShipManagerRow + injects activeShipId
  // comparison since the row needs to know about the active ship for
  // its visual styling.
  const rowFor = (ship, props) => (
    <ShipManagerRow
      key={ship.id}
      ship={ship}
      isActiveShip={ship.id === activeShipId}
      {...props}
    />
  );

  if (loading && ships.length === 0) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#3a5a6a', fontSize: 11, fontFamily: F }}>Loading fleet…</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: '#5a7080', fontFamily: FM, letterSpacing: 0.5, marginBottom: 6 }}>
        Fleet: {activeCount}/{fleetCap} active. Ships only move between active + storage while you're docked here.
      </div>

      {sectionHeader(`Stored at ${body.name} (${housedHere.length})`, GOLD.pri)}
      {housedHere.length === 0 ? (
        <div style={{ padding: '14px 8px', color: '#3a5a6a', fontSize: 10, fontFamily: F, fontStyle: 'italic' }}>
          No ships stored here yet. Store from your active fleet below to park ships at this station.
        </div>
      ) : housedHere.map(ship => rowFor(ship, {
        action: 'activate',
        onClick: () => handleActivate(ship.id),
        disabled: !canActivate,
        hint: !canActivate ? `Fleet full (${activeCount}/${fleetCap}) — store another ship first` : 'Bring this ship into the active fleet',
      }))}

      {sectionHeader(`Active fleet (${activeCount}/${fleetCap})`, '#60a5fa')}
      {activeShips.length === 0 ? (
        <div style={{ padding: '14px 8px', color: '#3a5a6a', fontSize: 10, fontFamily: F, fontStyle: 'italic' }}>
          No active ships.
        </div>
      ) : activeShips.map(ship => {
        const isActiveShip = ship.id === activeShipId;
        return rowFor(ship, {
          action: 'store',
          onClick: () => handleStore(ship.id),
          disabled: isActiveShip,
          hint: isActiveShip ? 'Set a different ship as active first, then store this one' : `Park this ship at ${body.name}`,
          extraHint: isActiveShip ? 'Active — set a different ship as active first to store this' : null,
        });
      })}
    </div>
  );
};

const PopulatedBodyTab = ({ body, kind /* 'city' | 'station' */, effectiveBodyId }) => {
  const [section, setSection] = useState('vendor');
  const sections = [
    { id: 'vendor',    label: 'Vendor',    icon: '🏪' },
    { id: 'ships',     label: 'Ships',     icon: '🚀' },
    { id: 'pilots',    label: 'Pilots',    icon: '👤' },
    { id: 'npcs',      label: 'NPCs',      icon: '🛸' },
    { id: 'buildings', label: 'Buildings', icon: '🏗️' },
  ];
  return (
    <div>
      {/* Sub-tab strip */}
      <div style={{
        display: 'flex',
        gap: 6,
        marginBottom: 12,
        borderBottom: `1px solid ${EDGE}`,
        paddingBottom: 8,
      }}>
        {sections.map(s => {
          const active = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => { playSound('button_click'); setSection(s.id); }}
              style={{
                flex: 1,
                padding: '7px 8px',
                background: active ? `linear-gradient(180deg, ${GOLD.pri}1a, transparent)` : 'rgba(4,8,16,0.4)',
                border: active ? `1px solid ${GOLD.pri}66` : `1px solid ${EDGE}`,
                borderRadius: 3,
                color: active ? GOLD.light : '#5a7080',
                fontFamily: F,
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: 0.6,
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              <span style={{ fontSize: 12 }}>{s.icon}</span>
              {s.label.toUpperCase()}
            </button>
          );
        })}
      </div>
      {/* Sub-tab content */}
      {section === 'vendor'    && <VendorTab body={body} />}
      {section === 'ships'     && <ShipsTab body={body} effectiveBodyId={effectiveBodyId} />}
      {section === 'pilots'    && <PilotsTab effectiveBodyId={effectiveBodyId} />}
      {section === 'npcs'      && <NPCsStub />}
      {section === 'buildings' && <BuildingsStub />}
    </div>
  );
};

// ============================================
// PILOTS TAB (Step 5 prep)
// Lists every other pilot currently docked at this body. Click a row
// to open their profile (which surfaces the Trade button once Phase 2
// is wired up). Reads from the presence singleton's bodyOccupants
// cache, which is kept fresh by `presence:body` broadcasts.
// ============================================
const PilotsTab = ({ effectiveBodyId }) => {
  const openProfile = useGameStore(s => s.openProfile);
  const myUserId = useAuthStore(s => s.user?.id) || null;

  // Re-render on every roster change for this body. Subscribing in a
  // useEffect rather than reading directly so we re-pull after dock /
  // undock / peer-join / peer-leave events without a parent re-mount.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!presence.isEnabled()) return;
    return presence.on('body_changed', ({ body_id }) => {
      if (body_id === effectiveBodyId) setTick(t => t + 1);
    });
  }, [effectiveBodyId]);

  const allDocked = effectiveBodyId ? presence.getDockedPilots(effectiveBodyId) : [];
  const others = allDocked.filter(p => p.user_id !== myUserId);
  void tick;

  if (!presence.isEnabled()) {
    return (
      <div style={{ padding: 20, color: '#475569', fontSize: 11, fontFamily: F, fontStyle: 'italic', textAlign: 'center' }}>
        Realtime presence is disabled.
      </div>
    );
  }

  return (
    <div>
      <div style={{
        fontSize: 9, color: '#475569', fontFamily: FM, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 6, padding: '0 2px',
      }}>
        Pilots Docked Here
        <span style={{ color: BLUE.light, marginLeft: 8, fontWeight: 700 }}>
          {others.length}
        </span>
      </div>
      {others.length === 0 ? (
        <div style={{
          padding: 20, color: '#475569', fontSize: 11, fontFamily: F,
          fontStyle: 'italic', textAlign: 'center',
          background: 'rgba(4,8,16,0.5)',
          border: `1px solid ${EDGE}`,
          borderRadius: 3,
        }}>
          No other pilots are docked here.
        </div>
      ) : (
        <div style={{
          background: 'rgba(4,8,16,0.5)',
          border: `1px solid ${EDGE}`,
          borderRadius: 3,
          padding: '4px 0',
        }}>
          {others.map(p => (
            <div
              key={p.user_id}
              style={{
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                borderBottom: `1px solid rgba(26,48,80,0.2)`,
                transition: 'background 80ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(20,30,50,0.6)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div
                onClick={() => { playSound('button_click'); openProfile(p.user_id); }}
                title={`Open ${p.name}'s profile`}
                style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 14,
                  background: `linear-gradient(135deg, ${BLUE.pri}, ${BLUE.dim})`,
                  border: `1px solid ${BLUE.light}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, flexShrink: 0,
                }}>👤</div>
                <span style={{
                  flex: 1,
                  fontSize: 12, fontFamily: F, fontWeight: 700,
                  color: '#e2e8f0',
                }}>{p.name}</span>
              </div>
              {/* Quick-trade button -- since they're already in our
                  docked roster the gating is automatically satisfied
                  (presence guarantees co-docking). Errors (e.g. they
                  already have a pending trade) surface as a brief
                  console warn for v1; can promote to a toast later. */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  playSound('button_click');
                  trade.invite(p.user_id).catch(err => console.warn('trade invite failed', err));
                }}
                title={`Send ${p.name} a trade invite`}
                style={{
                  padding: '4px 10px',
                  background: `${GOLD.light}1c`,
                  border: `1px solid ${GOLD.light}66`,
                  color: GOLD.light,
                  fontSize: 10, fontFamily: F, fontWeight: 800, letterSpacing: 1,
                  textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
                  flexShrink: 0,
                }}
              >🤝 Trade</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// SCAN PROGRESS PANEL
// Used by the Scan tab for both orbital + ground in-flight scans.
// Reads scanTick from props (mom-and-pop -- the parent's timer effect
// bumps state every 100ms which re-renders us with a fresh Date.now()).
// ============================================
const ScanProgressPanel = ({ label, accent, startMs, durationMs, onCancel }) => {
  const elapsed = Math.min(durationMs, Date.now() - startMs);
  const pct = elapsed / durationMs;
  const remainSec = Math.max(0, (durationMs - elapsed) / 1000);
  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8,
      }}>
        <span style={{
          fontSize: 11, color: accent, fontFamily: F, fontWeight: 700,
          letterSpacing: 1, textTransform: 'uppercase', flex: 1,
        }}>{label}</span>
        <span style={{ fontSize: 10, color: '#7a8a9a', fontFamily: FM }}>
          {remainSec.toFixed(1)}s
        </span>
      </div>
      <div style={{
        height: 8, background: '#0a1528',
        border: `1px solid ${EDGE}`, borderRadius: 2, overflow: 'hidden',
        marginBottom: 10,
      }}>
        <div style={{
          height: '100%', width: `${pct * 100}%`,
          background: `linear-gradient(90deg, ${accent}66, ${accent})`,
          transition: 'width 0.1s linear',
        }} />
      </div>
      <button
        onClick={onCancel}
        style={{
          padding: '5px 14px',
          background: 'transparent',
          border: `1px solid ${EDGE}`,
          color: '#7a8a9a',
          fontSize: 10, fontFamily: F, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
        }}
      >Cancel</button>
      <div style={{ fontSize: 9, color: '#3a4a5a', marginTop: 6, fontFamily: FM }}>
        Probe consumed on completion · cancel to preserve.
      </div>
    </>
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
  const completeQuest = useGameStore(state => state.completeQuest);
  // Active fleet + skill bonuses feed the timed-scan duration calculation.
  // ships subscription drives re-render when the player re-fits between
  // scans (so the "DEPLOY PROBE" button enables/disables live as scanner
  // status changes).
  const ships = useGameStore(state => state.ships);
  const activeBonuses = useGameStore(state => state.activeBonuses);
  const hasScanner = fleetHasScanner(ships);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [probes, setProbes] = useState({ scanner_probes: 0, advanced_scanner_probes: 0 });
  const [surveyStatus, setSurveyStatus] = useState({ orbital_scanned: false, ground_scanned: false });
  const [orbitalResults, setOrbitalResults] = useState(null);
  const [groundResults, setGroundResults] = useState(null);
  const [activeTab, setActiveTab] = useState('scan');
  const [resolvedBodyId, setResolvedBodyId] = useState(null);
  // Timed-scan state. `kind` is 'orbital' or 'ground'. startMs +
  // durationMs are snapshotted at scan-start so re-fits mid-scan don't
  // yank the timer. scanTick is a render-trigger -- the interval bumps
  // it every 100ms so the progress bar repaints.
  const [scanning, setScanning] = useState(null);
  const [scanTick, setScanTick] = useState(0);
  // Phase A city seeding -- comes from /ensure-body for procedural bodies,
  // hardcoded for Sol. Drives the City tab visibility below. Stations are
  // populated regardless and use body.type, not this flag.
  const [hasCity, setHasCity] = useState(false);

  // For Sol, use the body.id directly (resolved by alias on server).
  // For procedural systems, register the body in DB first and use the returned UUID.
  useEffect(() => {
    if (!body?.id || !isOpen) { setResolvedBodyId(null); setHasCity(false); return; }

    if (currentSystemId === 'sol') {
      setResolvedBodyId(body.id);
      // Sol cities are hand-seeded in migration 020. Earth is the only
      // city today; this matches the DB has_city = TRUE row.
      setHasCity(body.id === 'earth');
      return;
    }

    // Procedural system — register body in DB
    const registerBody = async () => {
      try {
        // Import galaxy data to get system info + the planet count we need
        // for deterministic city placement.
        const { generateGalaxy, generateSystemContent } = await import('@/utils/galaxyGenerator');
        const galaxy = generateGalaxy(12345, 200);
        const galaxySys = galaxy.systemMap[currentSystemId];
        // Count planets (not stations / belts / gates) for city-index range.
        const sysContent = galaxySys ? generateSystemContent(galaxySys) : null;
        const planetCount = (sysContent?.bodies || []).filter(b => b.type === 'planet').length;

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
          system_seed: galaxySys?.seed,
          system_planet_count: planetCount,
        });

        if (result.body_db_id) {
          setResolvedBodyId(result.body_db_id);
        } else {
          setResolvedBodyId(body.id); // fallback
        }
        setHasCity(result.has_city === true);
      } catch (err) {
        console.error('Failed to register procedural body:', err);
        setResolvedBodyId(body.id); // fallback to client ID
        setHasCity(false);
      }
    };

    registerBody();
  }, [body?.id, isOpen, currentSystemId]);
  
  // The effective body ID to use for all API calls
  const effectiveBodyId = resolvedBodyId;

  // Mirror to the global store so the Fleet window (and any future
  // out-of-this-component caller) can reference "the body the player
  // is currently docked at" by DB identifier (UUID for procedural, Sol
  // alias for hand-seeded). Cleared on unmount / when not open.
  const setDockedBodyDbId = useGameStore(state => state.setDockedBodyDbId);
  useEffect(() => {
    if (setDockedBodyDbId) setDockedBodyDbId(isOpen ? resolvedBodyId : null);
    return () => { if (setDockedBodyDbId) setDockedBodyDbId(null); };
  }, [resolvedBodyId, isOpen, setDockedBodyDbId]);
  
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
    // Body change cancels any in-flight scan -- the probe stays
    // unconsumed since we only call the server endpoint on completion.
    setScanning(null);
    // Reset to the always-available Scan tab on body change. Otherwise a
    // user with the City tab selected at Earth would land on Mars (no
    // city) with activeTab='populated', which renders nothing.
    setActiveTab('scan');
  }, [body?.id]);

  // Scan timer: ticks every 100ms to advance the progress bar; on
  // completion calls the server scan endpoint (which is what actually
  // consumes the probe + records the scan). Cancellation paths:
  //   - body change          -> setScanning(null) above
  //   - explicit Cancel btn  -> handler below
  //   - window close/unmount -> useEffect cleanup
  // In all cancel cases the probe is preserved.
  useEffect(() => {
    if (!scanning) return;
    const tickInterval = setInterval(() => {
      const elapsed = Date.now() - scanning.startMs;
      if (elapsed >= scanning.durationMs) {
        clearInterval(tickInterval);
        // Closure-capture kind before we null out scanning.
        const kind = scanning.kind;
        setScanning(null);
        (async () => {
          setLoading(true);
          setError(null);
          try {
            if (kind === 'orbital') {
              const data = await resourcesAPI.orbitalScan(effectiveBodyId);
              setOrbitalResults(data.results);
              setSurveyStatus(prev => ({ ...prev, orbital_scanned: true }));
              setProbes(prev => ({ ...prev, scanner_probes: prev.scanner_probes - 1 }));
            } else if (kind === 'ground') {
              const data = await resourcesAPI.groundScan(effectiveBodyId);
              setGroundResults(data.results);
              setSurveyStatus(prev => ({ ...prev, ground_scanned: true }));
              setProbes(prev => ({ ...prev, advanced_scanner_probes: prev.advanced_scanner_probes - 1 }));
              // Tutorial: completing a ground scan completes "Look Down"
              if (completeQuest) completeQuest('tutorial_survey_planet');
            }
          } catch (err) {
            setError(err.message);
          } finally {
            setLoading(false);
          }
        })();
      } else {
        setScanTick(t => t + 1);
      }
    }, 100);
    return () => clearInterval(tickInterval);
  }, [scanning, effectiveBodyId, completeQuest]);

  // Quest trigger: fly to Luna Station
  useEffect(() => {
    if (isOpen && body?.id === 'luna_station') {
      completeQuest('tutorial_fly_to_luna');
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
  
  // Scan starters now KICK OFF the timer instead of calling the API
  // directly. The useEffect timer above handles completion + probe
  // consumption. Duration is derived per-scan from the fleet's
  // computed_scan_time + ast_scanning skill bonus, snapshotted so
  // mid-scan re-fits don't disrupt the in-flight scan.
  const startScan = (kind) => {
    if (!hasScanner) {
      setError('No Sensor Suite fitted. Equip a scanner module in the Fitting window first.');
      return;
    }
    const durationMs = getFleetScanTimeMs(ships, activeBonuses);
    setError(null);
    setScanning({ kind, startMs: Date.now(), durationMs });
  };
  const performOrbitalScan = () => startScan('orbital');
  const performGroundScan  = () => startScan('ground');
  const cancelScan = () => setScanning(null);
  
  if (!isOpen || !body) return null;

  const handleClose = () => closeWindow('planetInteraction');

  // Body stats for the info bar under the banner
  const sizeClass = body.size > 25 ? 'IV' : body.size > 15 ? 'III' : body.size > 8 ? 'II' : 'I';
  const gravity = body.size > 25 ? '1.8g' : body.size > 15 ? '1.0g' : body.size > 8 ? '0.6g' : '0.3g';

  // Populated-body tab: stations always show one (labeled "Station"),
  // planets only if the server flagged has_city (labeled "City"). Same
  // tab id either way so content rendering stays uniform.
  const isStation = body.type === 'station';
  const isPopulated = isStation || hasCity;
  const populatedKind = isStation ? 'station' : 'city';
  const iconTabs = [
    { id: 'scan',       icon: '📡', label: 'Scan', color: '#22d3ee'  },
    { id: 'mine',       icon: '⛏️', label: 'Mine', color: GOLD.pri   },
    { id: 'harvesters', icon: '⚙️', label: 'Auto', color: '#ff6622'  },
    ...(isPopulated ? [{
      id: 'populated',
      icon: isStation ? '🛰️' : '🏙️',
      label: isStation ? 'Station' : 'City',
      color: GOLD.light,
    }] : []),
  ];

  return (
    <div
      className="fixed z-30"
      style={{
        top: 46,
        left: 56,
        bottom: 44,
        // 720 chosen so the Harvesters tab can split into a ~470px
        // slot column on the left + the 220px cargo pane on the right
        // (matches CraftingWindow's panel width). The other tabs
        // (Scan, Mine, City/Station) get the extra breathing room
        // for free -- they were comfortable at 440 and just get more
        // horizontal space to work with now.
        width: 720,
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
            {iconTabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { playSound('button_click'); setActiveTab(tab.id); }}
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
                      <OrbitalScanResults
                        resources={orbitalResults.resources_detected}
                        probeQuality={orbitalResults.probe_quality}
                      />
                      <HazardWarning hazards={orbitalResults.hazards} />
                    </>
                  ) : surveyStatus.orbital_scanned ? (
                    <p style={{ color: '#64748b', fontSize: 11, margin: 0 }}>Scan data available. View deposits in the Mine tab.</p>
                  ) : scanning?.kind === 'orbital' ? (
                    <ScanProgressPanel
                      label="Orbital scan in progress"
                      accent="#22d3ee"
                      startMs={scanning.startMs}
                      durationMs={scanning.durationMs}
                      onCancel={cancelScan}
                    />
                  ) : (
                    <>
                      <p style={{ color: '#4a5a6a', fontSize: 11, margin: '0 0 10px', lineHeight: 1.5 }}>
                        Deploy a scanner probe to detect resource types and abundance levels on the surface.
                      </p>
                      <button
                        onClick={performOrbitalScan}
                        disabled={loading || !hasScanner || probes.scanner_probes < 1 || scanning != null}
                        style={{
                          padding: '8px 20px',
                          background: (loading || !hasScanner || probes.scanner_probes < 1 || scanning != null)
                            ? 'rgba(30,41,59,0.5)'
                            : 'linear-gradient(180deg, #22d3ee22, #22d3ee08)',
                          border: `1px solid ${(loading || !hasScanner || probes.scanner_probes < 1 || scanning != null) ? '#1e293b' : '#22d3ee55'}`,
                          color: (loading || !hasScanner || probes.scanner_probes < 1 || scanning != null) ? '#475569' : '#22d3ee',
                          fontSize: 11,
                          fontFamily: F,
                          fontWeight: 800,
                          cursor: (loading || !hasScanner || probes.scanner_probes < 1 || scanning != null) ? 'not-allowed' : 'pointer',
                          borderRadius: 3,
                          letterSpacing: 1,
                          boxShadow: (loading || !hasScanner || probes.scanner_probes < 1 || scanning != null) ? 'none' : glow('#22d3ee', 0.12),
                        }}
                      >
                        {loading ? 'SCANNING...' : 'DEPLOY PROBE'}
                      </button>
                      <div style={{ fontSize: 9, color: '#3a4a5a', marginTop: 6, fontFamily: FM }}>
                        {!hasScanner
                          ? 'Requires a Sensor Suite fitted to any active ship'
                          : `Requires 1 Scanner Probe · ${Math.round(getFleetScanTimeMs(ships, activeBonuses) / 100) / 10}s scan`}
                      </div>
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
                    <GroundScanResults
                      deposits={groundResults.deposits}
                      probeQuality={groundResults.probe_quality}
                    />
                  ) : surveyStatus.ground_scanned ? (
                    <p style={{ color: '#64748b', fontSize: 11, margin: 0 }}>Detailed scan data available.</p>
                  ) : scanning?.kind === 'ground' ? (
                    <ScanProgressPanel
                      label="Ground scan in progress"
                      accent="#8b5cf6"
                      startMs={scanning.startMs}
                      durationMs={scanning.durationMs}
                      onCancel={cancelScan}
                    />
                  ) : (
                    <>
                      <p style={{ color: '#4a5a6a', fontSize: 11, margin: '0 0 10px', lineHeight: 1.5 }}>
                        Deploy an advanced probe to analyze deposit composition and quality.
                      </p>
                      <button
                        onClick={performGroundScan}
                        disabled={loading || !hasScanner || probes.advanced_scanner_probes < 1 || scanning != null}
                        style={{
                          padding: '8px 20px',
                          background: (loading || !hasScanner || probes.advanced_scanner_probes < 1 || scanning != null)
                            ? 'rgba(30,41,59,0.5)'
                            : 'linear-gradient(180deg, #8b5cf622, #8b5cf608)',
                          border: `1px solid ${(loading || !hasScanner || probes.advanced_scanner_probes < 1 || scanning != null) ? '#1e293b' : '#8b5cf655'}`,
                          color: (loading || !hasScanner || probes.advanced_scanner_probes < 1 || scanning != null) ? '#475569' : '#8b5cf6',
                          fontSize: 11,
                          fontFamily: F,
                          fontWeight: 800,
                          cursor: (loading || !hasScanner || probes.advanced_scanner_probes < 1 || scanning != null) ? 'not-allowed' : 'pointer',
                          borderRadius: 3,
                          letterSpacing: 1,
                          boxShadow: (loading || !hasScanner || probes.advanced_scanner_probes < 1 || scanning != null) ? 'none' : glow('#8b5cf6', 0.12),
                        }}
                      >
                        {loading ? 'SCANNING...' : 'DEPLOY PROBE'}
                      </button>
                      <div style={{ fontSize: 9, color: '#3a4a5a', marginTop: 6, fontFamily: FM }}>
                        {!hasScanner
                          ? 'Requires a Sensor Suite fitted to any active ship'
                          : `Requires 1 Advanced Scanner Probe · ${Math.round(getFleetScanTimeMs(ships, activeBonuses) / 100) / 10}s scan`}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'mine' && <MineTab body={body} surveyStatus={surveyStatus} effectiveBodyId={effectiveBodyId} />}
            {activeTab === 'harvesters' && <HarvestersTab body={body} effectiveBodyId={effectiveBodyId} />}
            {activeTab === 'populated' && isPopulated && <PopulatedBodyTab body={body} kind={populatedKind} effectiveBodyId={effectiveBodyId} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanetInteractionWindow;
