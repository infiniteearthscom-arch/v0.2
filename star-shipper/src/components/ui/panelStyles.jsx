// Shared design tokens and reusable UI primitives.
// Used by all ContextPanel content (Fleet, Inventory, Crafting, QuestLog, etc.)
// to maintain a consistent Stellaris-inspired aesthetic.

import React from 'react';

// ============================================
// COLOR TOKENS
// ============================================

export const COLORS = {
  EDGE: '#1a3050',
  PANEL_BG: 'rgba(8,14,28,0.93)',
  ROW_BG: 'rgba(4,8,16,0.5)',
  BLUE: { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f', dark: '#1d4ed8' },
  GOLD: { pri: '#f59e0b', light: '#fbbf24', dim: '#5c3d0e' },
  RED: { pri: '#ef4444', light: '#f87171', dim: '#7f1d1d' },
  GREEN: { pri: '#22c55e', light: '#4ade80', dim: '#166534' },
  PURPLE: { pri: '#a855f7', light: '#c084fc', dim: '#581c87' },
  CYAN: { pri: '#22d3ee', light: '#67e8f9', dim: '#155e75' },
  TEXT: { primary: '#e2e8f0', secondary: '#a0b0c0', muted: '#4a6580', dim: '#3a5a6a' },
};

// ============================================
// FONT TOKENS
// ============================================

export const FONT = {
  ui: "'Rajdhani', sans-serif",
  mono: "'Share Tech Mono', monospace",
};

// ============================================
// HELPERS
// ============================================

export const glow = (c, a = 0.25) =>
  `0 0 8px ${c}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

export const diagMix = (c = 6) =>
  `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

// ============================================
// SECTION HEADER
// Gradient left-bar header used to label panel sections
// ============================================

export const SectionHead = ({ title, accent = COLORS.BLUE.light, icon, right, marginTop = 4 }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    marginBottom: 8,
    marginTop,
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
      fontFamily: FONT.ui,
      textTransform: 'uppercase',
      flex: 1,
    }}>{title}</span>
    {right && (
      <span style={{
        fontSize: 9,
        color: COLORS.TEXT.dim,
        fontFamily: FONT.mono,
        letterSpacing: 0.5,
      }}>{right}</span>
    )}
  </div>
);

// ============================================
// PANEL CARD
// Standard inset card used inside section content
// ============================================

export const Card = ({ children, accent, style, ...props }) => (
  <div
    style={{
      background: COLORS.ROW_BG,
      border: `1px solid ${COLORS.EDGE}`,
      borderLeft: accent ? `2px solid ${accent}` : `1px solid ${COLORS.EDGE}`,
      borderRadius: 3,
      padding: 10,
      fontFamily: FONT.ui,
      ...style,
    }}
    {...props}
  >
    {children}
  </div>
);

// ============================================
// STAT ROW
// Label + value row used in stat lists
// ============================================

export const StatRow = ({ label, value, color = COLORS.TEXT.primary, mono = true }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 2px',
    fontSize: 10,
    fontFamily: FONT.mono,
    borderBottom: '1px solid rgba(26,48,80,0.3)',
  }}>
    <span style={{ color: COLORS.TEXT.muted, letterSpacing: 0.5 }}>{label}</span>
    <span style={{
      color,
      fontWeight: 700,
      fontFamily: mono ? FONT.mono : FONT.ui,
    }}>{value}</span>
  </div>
);

// ============================================
// PILL
// Small badge for status, type, count indicators
// ============================================

export const Pill = ({ children, color = COLORS.BLUE.light, filled = false, style }) => (
  <span style={{
    display: 'inline-block',
    fontSize: 8,
    fontWeight: 800,
    color: filled ? '#0a0e18' : color,
    background: filled ? color : `${color}18`,
    border: `1px solid ${color}55`,
    padding: '2px 6px',
    borderRadius: 2,
    letterSpacing: 1,
    fontFamily: FONT.ui,
    textTransform: 'uppercase',
    lineHeight: 1.2,
    ...style,
  }}>{children}</span>
);

// ============================================
// BUTTON
// Standard panel action button with accent color
// ============================================

export const PanelButton = ({ children, onClick, disabled, accent = COLORS.BLUE.light, size = 'md', style, ...props }) => {
  const sizes = {
    sm: { padding: '4px 10px', fontSize: 9 },
    md: { padding: '6px 14px', fontSize: 10 },
    lg: { padding: '8px 20px', fontSize: 11 },
  };
  const s = sizes[size] || sizes.md;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...s,
        background: disabled
          ? 'rgba(30,41,59,0.5)'
          : `linear-gradient(180deg, ${accent}22, ${accent}08)`,
        border: `1px solid ${disabled ? '#1e293b' : `${accent}55`}`,
        color: disabled ? '#475569' : accent,
        fontFamily: FONT.ui,
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 3,
        letterSpacing: 1,
        textTransform: 'uppercase',
        boxShadow: disabled ? 'none' : glow(accent, 0.12),
        transition: 'all 0.15s',
        ...style,
      }}
      {...props}
    >{children}</button>
  );
};

// ============================================
// MESSAGE BAR
// Inline status/error/success messages
// ============================================

export const MessageBar = ({ type = 'info', children }) => {
  const colors = {
    success: { bg: 'rgba(22,101,52,0.25)', border: 'rgba(34,197,94,0.5)', text: '#4ade80' },
    error:   { bg: 'rgba(127,29,29,0.3)',  border: 'rgba(239,68,68,0.5)', text: '#fca5a5' },
    warn:    { bg: 'rgba(133,77,14,0.25)', border: 'rgba(251,191,36,0.5)', text: '#fbbf24' },
    info:    { bg: 'rgba(30,58,138,0.3)',  border: 'rgba(59,130,246,0.5)', text: COLORS.BLUE.light },
  };
  const c = colors[type] || colors.info;
  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 3,
      padding: '6px 10px',
      fontSize: 11,
      color: c.text,
      fontFamily: FONT.ui,
      fontWeight: 600,
    }}>{children}</div>
  );
};
