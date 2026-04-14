import React, { useEffect, useState, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';

// ============================================
// TOASTER
// --------------------------------------------
// Global notification surface. Mounted ONCE in App.jsx. Reads the
// `toasts` queue from gameStore and renders each as a small card stacked
// at the bottom-center of the screen.
//
// Components push toasts via:
//   useGameStore.getState().pushToast({ kind: 'success', text: 'Fitted laser' });
// or grab the action via a hook:
//   const pushToast = useGameStore(state => state.pushToast);
//
// Toasts auto-dismiss after `duration` ms (default 3s, set in the store
// action). Dismissing is also fired by clicking the toast.
//
// Layout note: the wrapper is `position: fixed` and `pointer-events: none`
// so toasts don't capture clicks; individual toasts re-enable
// pointer-events so they're clickable to dismiss. Nothing in the page
// layout is affected — no shifting, no reflow.
// ============================================

const KIND_STYLES = {
  success: {
    bg: 'linear-gradient(135deg, rgba(16, 40, 28, 0.96), rgba(10, 25, 40, 0.96))',
    border: 'rgba(74, 222, 128, 0.45)',
    glow: '0 0 24px rgba(74, 222, 128, 0.18), 0 8px 28px rgba(0,0,0,0.45)',
    accent: '#4ade80',
    icon: '✓',
  },
  error: {
    bg: 'linear-gradient(135deg, rgba(50, 16, 18, 0.96), rgba(20, 10, 14, 0.96))',
    border: 'rgba(239, 68, 68, 0.45)',
    glow: '0 0 24px rgba(239, 68, 68, 0.18), 0 8px 28px rgba(0,0,0,0.45)',
    accent: '#ef4444',
    icon: '!',
  },
  info: {
    bg: 'linear-gradient(135deg, rgba(12, 24, 44, 0.96), rgba(10, 18, 32, 0.96))',
    border: 'rgba(96, 165, 250, 0.45)',
    glow: '0 0 24px rgba(96, 165, 250, 0.18), 0 8px 28px rgba(0,0,0,0.45)',
    accent: '#60a5fa',
    icon: 'i',
  },
};

// Single toast — local state only for the in/out fade.
const ToastCard = ({ toast, onDismiss }) => {
  const [visible, setVisible] = useState(false);
  const mountedRef = useRef(false);

  // Fade in on first mount.
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const style = KIND_STYLES[toast.kind] || KIND_STYLES.info;

  return (
    <div
      onClick={() => {
        setVisible(false);
        // Wait for fade-out to finish before removing from store.
        setTimeout(() => onDismiss(toast.id), 220);
      }}
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 10,
        boxShadow: style.glow,
        padding: '10px 14px',
        minWidth: 240,
        maxWidth: 420,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        pointerEvents: 'auto',
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      }}
      title="Click to dismiss"
    >
      {/* Accent icon */}
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: `${style.accent}22`,
          border: `1px solid ${style.accent}66`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: style.accent,
          fontWeight: 900,
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {style.icon}
      </div>
      {/* Message text */}
      <div
        style={{
          color: '#e2e8f0',
          fontSize: 13,
          lineHeight: 1.35,
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 500,
        }}
      >
        {toast.text}
      </div>
    </div>
  );
};

export const Toaster = () => {
  const toasts = useGameStore(state => state.toasts);
  const dismissToast = useGameStore(state => state.dismissToast);

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 56, // sits above the bottom bar (which is ~32px tall + padding)
        transform: 'translateX(-50%)',
        zIndex: 9000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none', // wrapper transparent to clicks; toasts opt back in
      }}
    >
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} onDismiss={dismissToast} />
      ))}
    </div>
  );
};

export default Toaster;
