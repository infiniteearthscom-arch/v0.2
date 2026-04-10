// Outliner — Stellaris-style persistent right-side panel.
// Shows fleet composition, system bodies, and hostile contacts.
// Lives inside GameFrame and is toggleable from the top bar.

import React from 'react';
import { useGameStore, useActiveShip } from '@/stores/gameStore';

const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const EDGE = '#1a3050';
const PANEL_BG = 'rgba(8,14,28,0.93)';
const BLUE = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD = { pri: '#f59e0b', light: '#fbbf24' };

const diagMix = (c = 6) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;
const glow = (c, a = 0.25) => `0 0 8px ${c}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

// Section header with gradient bar
const Section = ({ title, count, accent, icon }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    padding: '5px 10px',
    background: `linear-gradient(90deg, ${accent}20, transparent)`,
    borderLeft: `2px solid ${accent}`,
    marginTop: 8,
    marginBottom: 4,
  }}>
    {icon && <span style={{ marginRight: 6, fontSize: 11 }}>{icon}</span>}
    <span style={{
      fontSize: 10,
      fontWeight: 800,
      color: accent,
      letterSpacing: 1.5,
      fontFamily: F,
      textTransform: 'uppercase',
      flex: 1,
    }}>{title}</span>
    {count !== undefined && (
      <span style={{ fontSize: 9, color: '#3a5a6a', fontFamily: FM }}>{count}</span>
    )}
  </div>
);

// Body type → display label and color
const TYPE_LABEL = {
  planet: 'Planet',
  station: 'Station',
  asteroid_belt: 'Belt',
  warp_point: 'Warp Pt',
  jump_gate: 'Gate',
};

export const Outliner = () => {
  const visible = useGameStore(state => state.outlinerVisible);
  const ships = useGameStore(state => state.ships);
  const activeShip = useActiveShip();
  const systemBodies = useGameStore(state => state.systemBodies);
  const enemyCount = useGameStore(state => state.enemyCount);
  const autopilotTarget = useGameStore(state => state.autopilotTarget);
  const setAutopilotTarget = useGameStore(state => state.setAutopilotTarget);
  const toggleOutliner = useGameStore(state => state.toggleOutliner);
  const viewMode = useGameStore(state => state.viewMode);

  if (!visible) return null;

  // Filter bodies — hide minor types from the outliner clutter
  const filteredBodies = (systemBodies || []).filter(b =>
    b.type === 'planet' || b.type === 'station' || b.type === 'warp_point' || b.type === 'jump_gate'
  );

  const handleBodyClick = (body) => {
    setAutopilotTarget({ id: body.id, name: body.name, type: body.type });
  };

  return (
    <div
      className="fixed z-30"
      style={{
        top: 46,
        right: 8,
        bottom: 44,
        width: 220,
      }}
    >
      {/* Border layer */}
      <div style={{
        position: 'absolute',
        inset: -1,
        clipPath: diagMix(6),
        background: EDGE,
        zIndex: 0,
      }} />

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
          display: 'flex',
          alignItems: 'center',
          padding: '6px 10px',
          borderBottom: `1px solid ${EDGE}`,
          background: `linear-gradient(90deg, ${BLUE.pri}25, transparent)`,
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            color: BLUE.light,
            letterSpacing: 2,
            flex: 1,
          }}>OUTLINER</span>
          <button
            onClick={toggleOutliner}
            style={{
              background: 'none',
              border: 'none',
              color: '#3a5a6a',
              cursor: 'pointer',
              fontSize: 12,
              padding: '0 4px',
              fontFamily: F,
            }}
            title="Hide outliner"
          >✕</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 0 8px' }}>
          {/* Hostiles section (only when in combat) */}
          {enemyCount > 0 && (
            <>
              <Section title="Hostiles" count={enemyCount} accent="#ef4444" icon="☠" />
              <div style={{
                margin: '0 8px',
                padding: '6px 10px',
                background: 'rgba(127,29,29,0.25)',
                border: '1px solid rgba(239,68,68,0.4)',
                borderRadius: 3,
              }}>
                <div style={{ fontSize: 10, color: '#fca5a5', fontFamily: F, fontWeight: 700 }}>
                  ⚠ {enemyCount} HOSTILE{enemyCount !== 1 ? 'S' : ''} DETECTED
                </div>
                <div style={{ fontSize: 9, color: '#7f1d1d', fontFamily: FM, marginTop: 2 }}>
                  Engage or evade
                </div>
              </div>
            </>
          )}

          {/* Fleet section */}
          <Section
            title="Fleet"
            count={`${ships?.length || 0}/3`}
            accent={BLUE.light}
            icon="🚀"
          />
          {(!ships || ships.length === 0) ? (
            <div style={{
              fontSize: 9,
              color: '#3a5a6a',
              fontFamily: FM,
              padding: '4px 14px',
            }}>
              No ships built
            </div>
          ) : (
            ships.map(ship => {
              const isActive = ship.id === activeShip?.id;
              return (
                <div key={ship.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  paddingLeft: 14,
                  marginLeft: 4,
                  background: isActive ? `${BLUE.pri}0c` : 'transparent',
                  borderLeft: isActive ? `2px solid ${BLUE.pri}66` : '2px solid transparent',
                  cursor: 'default',
                }}>
                  {/* Triangle ship icon */}
                  <div style={{
                    width: 0,
                    height: 0,
                    borderLeft: `5px solid ${isActive ? BLUE.light : '#3a5a6a'}`,
                    borderTop: '3px solid transparent',
                    borderBottom: '3px solid transparent',
                    filter: isActive ? `drop-shadow(0 0 3px ${BLUE.light}66)` : 'none',
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 10,
                      color: isActive ? '#e2e8f0' : '#8a9aaa',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>{ship.name}</div>
                    <div style={{ fontSize: 8, color: '#3a5a6a', fontFamily: FM }}>
                      {ship.hull_name || '—'}
                    </div>
                  </div>
                  {isActive && (
                    <div style={{
                      fontSize: 7,
                      color: BLUE.light,
                      fontFamily: FM,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                    }}>ACTIVE</div>
                  )}
                </div>
              );
            })
          )}

          {/* System bodies section (only in system view, not galaxy flight) */}
          {viewMode === 'system' && filteredBodies.length > 0 && (
            <>
              <Section
                title="System"
                count={filteredBodies.length}
                accent={GOLD.pri}
                icon="◎"
              />
              {filteredBodies.map(body => {
                const isTarget = autopilotTarget?.id === body.id;
                const dotColor = body.color || (
                  body.type === 'warp_point' ? '#a855f7' :
                  body.type === 'jump_gate' ? '#22c55e' :
                  '#888'
                );
                return (
                  <div
                    key={body.id}
                    onClick={() => handleBodyClick(body)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 10px',
                      paddingLeft: 14,
                      marginLeft: 4,
                      cursor: 'pointer',
                      background: isTarget ? `${BLUE.pri}0a` : 'transparent',
                      borderLeft: isTarget ? `2px solid ${BLUE.pri}55` : '2px solid transparent',
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
                      width: 6,
                      height: 6,
                      borderRadius: body.type === 'station' ? 1 : 3,
                      background: dotColor,
                      boxShadow: glow(dotColor, 0.3),
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 10,
                      color: isTarget ? '#e2e8f0' : '#8a9aaa',
                      flex: 1,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>{body.name}</span>
                    <span style={{
                      fontSize: 7,
                      color: '#2a3a4a',
                      fontFamily: FM,
                      letterSpacing: 0.3,
                    }}>{TYPE_LABEL[body.type] || body.type}</span>
                  </div>
                );
              })}
            </>
          )}

          {/* Galaxy mode message */}
          {viewMode === 'galaxy' && (
            <div style={{
              fontSize: 9,
              color: '#3a5a6a',
              fontFamily: F,
              padding: '8px 14px',
              fontStyle: 'italic',
            }}>
              Interstellar space — no system bodies in range
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Outliner;
