// SystemMapWindow
// ================
// Right-edge panel listing the bodies in the current system with
// click-to-autopilot. Designed as the home for system-scoped
// information: today it's just the bodies list (lifted from the old
// Outliner's System section), but the panel intentionally has room to
// grow into a real mini-map + scanner overlay (scanned asteroids,
// detected hostiles, deposit pins, etc.) as the scanner systems
// expand.
//
// Toggled from a dedicated bottom-right toolbar button (see GameFrame).
// When the player is not in a system (galaxy flight / interstellar),
// the panel shows an idle "go to a system" message rather than hiding
// entirely, so the button always has somewhere to land.

import React from 'react';
import { useGameStore } from '@/stores/gameStore';

const EDGE = '#1a3050';
const BLUE = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD = { pri: '#f59e0b', light: '#fbbf24' };
const PANEL_BG = 'rgba(8,14,28,0.93)';
const F  = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";

const diagMix = (c = 6) =>
  `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

// Body-type display config -- mirrors the old Outliner. Color-coded
// dots make planet/station/gate easy to scan.
const BODY_TYPE_META = {
  planet:     { label: 'Planet',  color: '#67e8f9' },
  station:    { label: 'Station', color: '#a3e635' },
  warp_point: { label: 'Warp Pt', color: '#a855f7' },
  jump_gate:  { label: 'Gate',    color: '#22c55e' },
};

const SectionHead = ({ title, count, accent, icon }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px 4px',
    fontSize: 9,
    fontFamily: FM,
    color: accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: 700,
  }}>
    {icon && <span>{icon}</span>}
    <span style={{ flex: 1 }}>{title}</span>
    {count != null && <span style={{ color: '#3a5a6a' }}>{count}</span>}
  </div>
);

export const SystemMapWindow = () => {
  const isOpen = useGameStore(state => state.windows.systemMap?.open);
  const closeWindow = useGameStore(state => state.closeWindow);
  const viewMode = useGameStore(state => state.viewMode);
  const systemBodies = useGameStore(state => state.systemBodies);
  const autopilotTarget = useGameStore(state => state.autopilotTarget);
  const setAutopilotTarget = useGameStore(state => state.setAutopilotTarget);

  if (!isOpen) return null;

  const inSystem = viewMode === 'system';
  const filteredBodies = (systemBodies || []).filter(b =>
    b.type === 'planet' || b.type === 'station' ||
    b.type === 'warp_point' || b.type === 'jump_gate'
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
        width: 320,
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
          display: 'flex',
          alignItems: 'center',
          padding: '6px 10px',
          borderBottom: `1px solid ${EDGE}`,
          background: `linear-gradient(90deg, ${BLUE.pri}25, transparent)`,
          flexShrink: 0,
        }}>
          <span style={{ marginRight: 6, fontSize: 12 }}>🗺️</span>
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            color: BLUE.light,
            letterSpacing: 2,
            flex: 1,
            textTransform: 'uppercase',
          }}>System Map</span>
          <button
            onClick={() => closeWindow('systemMap')}
            style={{
              background: 'none',
              border: 'none',
              color: '#3a5a6a',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: F,
            }}
            title="Hide System Map"
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 0 8px' }}>
          {!inSystem ? (
            <div style={{
              padding: '32px 18px',
              textAlign: 'center',
              color: '#3a5a6a',
              fontSize: 11,
              fontFamily: F,
              fontStyle: 'italic',
            }}>
              <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.6 }}>⟡</div>
              <div style={{ color: '#5a7080' }}>You're in interstellar space.</div>
              <div style={{ marginTop: 4, color: '#3a5a6a' }}>
                Enter a system to see its bodies + scanner data here.
              </div>
            </div>
          ) : filteredBodies.length === 0 ? (
            <div style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: '#3a5a6a',
              fontSize: 10,
              fontFamily: FM,
              fontStyle: 'italic',
            }}>
              No charted bodies in this system.
            </div>
          ) : (
            <>
              <SectionHead
                title="Bodies"
                count={filteredBodies.length}
                accent={GOLD.light}
                icon="◎"
              />
              {filteredBodies.map(body => {
                const meta = BODY_TYPE_META[body.type] || { label: body.type, color: '#888' };
                const isTarget = autopilotTarget?.id === body.id;
                const dotColor = body.color || meta.color;
                return (
                  <div
                    key={body.id}
                    onClick={() => handleBodyClick(body)}
                    title={`Set autopilot → ${body.name}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 10px',
                      paddingLeft: 14,
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
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: dotColor,
                      boxShadow: `0 0 4px ${dotColor}88`,
                      flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 11,
                        color: '#cbd5e1',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>{body.name}</div>
                    </div>
                    <span style={{
                      fontSize: 8,
                      color: '#3a5a6a',
                      fontFamily: FM,
                      letterSpacing: 0.5,
                    }}>{meta.label}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer hint -- placeholder for future scanner-controls
            (sweep, bulk-scan, etc). Empty for now. */}
        <div style={{
          padding: '6px 10px',
          borderTop: `1px solid ${EDGE}`,
          fontSize: 9,
          color: '#3a5a6a',
          fontFamily: FM,
          textAlign: 'center',
          letterSpacing: 0.5,
        }}>
          Click a body to set autopilot
        </div>
      </div>
    </div>
  );
};

export default SystemMapWindow;
