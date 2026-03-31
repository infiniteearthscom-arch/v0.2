// ContextPanel.jsx — Left-side overlay panel for focused interactions
// Replaces DraggableWindow for panels like Fleet, Cargo, Crafting, Quests
// Only one context panel is visible at a time

import React from 'react';
import { useGameStore } from '@/stores/gameStore';

const EDGE = '#1a3050';
const diagMix = (c = 8) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

export const ContextPanel = ({ windowId, title, icon, accent = '#60a5fa', width = 400, children }) => {
  const isOpen = useGameStore(state => state.windows[windowId]?.open && !state.windows[windowId]?.minimized);
  const closeWindow = useGameStore(state => state.closeWindow);

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-30"
      style={{
        top: 46,
        left: 56,
        bottom: 44,
        width,
      }}
    >
      {/* Border layer */}
      <div style={{ position: 'absolute', inset: -1, clipPath: diagMix(8), background: EDGE, zIndex: 0 }} />

      {/* Panel */}
      <div
        style={{
          position: 'relative',
          clipPath: diagMix(8),
          background: 'rgba(8,14,28,0.93)',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 14px',
            borderBottom: `1px solid ${EDGE}`,
            background: `linear-gradient(90deg, ${accent}20, transparent)`,
            flexShrink: 0,
          }}
        >
          {icon && <span style={{ marginRight: 8, fontSize: 15 }}>{icon}</span>}
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: accent,
              letterSpacing: 2,
              fontFamily: "'Rajdhani', sans-serif",
              textTransform: 'uppercase',
              flex: 1,
            }}
          >
            {title}
          </span>
          <button
            onClick={() => closeWindow(windowId)}
            style={{
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
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default ContextPanel;
