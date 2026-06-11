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
  // Shift the panel right when the left toolbar shows labels. Numbers
  // mirror TOOLBAR_WIDTH_{COLLAPSED,EXPANDED} in GameFrame.jsx -- 56 =
  // toolbar (38) + left gutter (6) + small gap (12); 178 = expanded
  // toolbar (160) + same gutters.
  const toolbarExpanded = useGameStore(state => state.toolbarExpanded ?? true);
  const leftAnchor = toolbarExpanded ? 178 : 56;

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-30"
      style={{
        top: 46,
        left: leftAnchor,
        width,
        // Panel height follows its content; cap = screen minus the top
        // bar (46) and bottom bar (44) so tall panels scroll instead of
        // running under the HUD chrome.
        maxHeight: 'calc(100vh - 90px)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'left 0.18s ease',
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
          minHeight: 0,
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
          {icon && <span style={{ marginRight: 8, fontSize: '0.9375rem' }}>{icon}</span>}
          <span
            style={{
              fontSize: '0.8125rem',
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
              fontSize: '0.75rem',
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: 12 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default ContextPanel;
