// ModalOverlay.jsx — Full-screen modal overlay for complex screens
// Replaces DraggableWindow for Ship Fitting, Galaxy Map, etc.
// Game view is dimmed but visible behind

import React, { useEffect } from 'react';
import { useGameStore } from '@/stores/gameStore';

const EDGE = '#1a3050';
const diagMix = (c = 10) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

// width/height (optional): compact centered modal of that size instead of
// the near-fullscreen default. Omit height to fit the content's height
// (capped to the viewport). Big screens (Ship Builder, Galaxy Map, Planet)
// omit both and keep the fullscreen frame.
export const ModalOverlay = ({ windowId, title, icon, accent = '#ff6622', width, height, children }) => {
  const isOpen = useGameStore(state => state.windows[windowId]?.open && !state.windows[windowId]?.minimized);
  const closeWindow = useGameStore(state => state.closeWindow);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') closeWindow(windowId);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, windowId, closeWindow]);

  if (!isOpen) return null;

  const sized = width != null;

  return (
    <div className="fixed inset-0 z-50" style={{ display: 'flex' }} onClick={() => closeWindow(windowId)}>
      {/* Backdrop. No backdrop-filter blur: SystemView keeps animating
          at 60fps behind the modal, so a full-screen blur(2px) forced
          the browser to re-blur the entire viewport every frame for as
          long as any modal was open — a constant GPU tax on the Galaxy
          Map / Ship Designer themselves. A slightly deeper plain dim
          reads nearly the same and costs nothing. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(2,4,10,0.72)',
        }}
      />

      {/* Modal container */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={sized ? {
          // Compact mode: centered, content-height (unless height given)
          position: 'relative',
          margin: 'auto',
          width,
          maxWidth: 'calc(100vw - 60px)',
          ...(height != null ? { height } : {}),
          maxHeight: 'calc(100vh - 84px)',
          display: 'flex',
          flexDirection: 'column',
        } : {
          position: 'absolute',
          top: 42,
          left: 50,
          right: 50,
          bottom: 42,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Border layer */}
        <div style={{ position: 'absolute', inset: -1, clipPath: diagMix(10), background: EDGE, zIndex: 0 }} />

        {/* Panel */}
        <div
          style={{
            position: 'relative',
            clipPath: diagMix(10),
            background: 'rgba(8,14,28,0.93)',
            zIndex: 1,
            flex: '1 1 auto',
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
              padding: '8px 16px',
              borderBottom: `1px solid ${EDGE}`,
              background: `linear-gradient(90deg, ${accent}20, transparent)`,
              flexShrink: 0,
            }}
          >
            {icon && <span style={{ marginRight: 8, fontSize: '0.9375rem' }}>{icon}</span>}
            <span
              style={{
                fontSize: '0.875rem',
                fontWeight: 800,
                color: accent,
                letterSpacing: 2,
                fontFamily: "'Rajdhani', sans-serif",
                textTransform: 'uppercase',
                flex: 1,
                textShadow: `0 0 10px ${accent}40`,
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
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                borderRadius: 3,
                fontSize: '0.8125rem',
                fontFamily: "'Rajdhani', sans-serif",
              }}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, minHeight: 0, overflow: sized ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column', padding: 12 }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalOverlay;
