// ============================================
// TOOLTIP CONTENT COMPONENTS
// --------------------------------------------
// TooltipProvider (already in codebase) renders arbitrary content inside a
// floating positioned div. THIS file defines the *content* components that
// go inside that floating div.
//
// Design intent:
//  - <TooltipShell>          — a shared visual chrome wrapper (padding,
//                              accent bar, name header). ALL tooltip types
//                              use this so future tooltips look consistent.
//  - <ItemTooltipContent>    — layout for item tooltips (name, quality bars,
//                              stats table, description, price).
//  - (future: SystemTooltipContent, QuestTooltipContent, ModuleSlotTooltip...)
//    — each renders different inner content but wraps in <TooltipShell>.
//
// When we want to visually update "all tooltips" (e.g. new font, padding,
// corner style), we touch TooltipShell only.
// ============================================

import React from 'react';

// ============================================
// SHARED TOOLTIP SHELL
// ============================================
// Every tooltip uses this. Accepts:
//   accent: hex color for the left accent bar and title
//   title: main heading text
//   subtitle: small text under the title (optional)
//   children: body content
export const TooltipShell = ({ accent = '#60a5fa', title, subtitle, children }) => (
  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
    {/* Header with accent bar */}
    {(title || subtitle) && (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: '1px solid rgba(100,180,255,0.1)', paddingBottom: 6 }}>
        <div style={{ width: 3, alignSelf: 'stretch', background: accent, borderRadius: 2, minHeight: 20, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.2 }}>
              {title}
            </div>
          )}
          {subtitle && (
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, textTransform: 'capitalize' }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
    )}
    {children}
  </div>
);

// ============================================
// QUALITY BAR
// ============================================
const QualityBar = ({ label, value, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
    <span style={{ color: '#64748b', width: 36, flexShrink: 0 }}>{label}</span>
    <div style={{ flex: 1, height: 4, background: 'rgba(15,25,45,0.6)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, value))}%`, background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#cbd5e1', width: 22, textAlign: 'right', fontFamily: 'monospace' }}>{value}</span>
  </div>
);

// ============================================
// ITEM TOOLTIP CONTENT
// ============================================
// Rendered inside TooltipProvider's floating div. Expects an already-
// normalized item (see utils/itemShape.js).
export const ItemTooltipContent = ({ item }) => {
  if (!item) return null;

  const {
    name, icon, color, subtitle, description,
    kind, slotType, tier,
    quality, avgQ, qColor,
    stats,
    stackQty,
    price,
    flags,
  } = item;

  // Build quality header bar if quality data exists
  const hasQuality = quality && avgQ != null;

  return (
    <TooltipShell accent={color} title={name} subtitle={subtitle}>
      {/* Icon + quick chips row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 32, height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20,
          background: `linear-gradient(135deg, ${color}22, ${color}08)`,
          border: `1px solid ${color}66`,
          borderRadius: 3,
        }}>
          {icon}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {tier != null && (
            <span style={{ fontSize: 9, color: '#94a3b8' }}>
              <span style={{ color: '#64748b' }}>Tier </span>
              <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{tier}</span>
            </span>
          )}
          {stackQty != null && (
            <span style={{ fontSize: 9, color: '#94a3b8' }}>
              <span style={{ color: '#64748b' }}>Qty </span>
              <span style={{ color: '#e2e8f0', fontWeight: 700 }}>×{stackQty}</span>
            </span>
          )}
          {hasQuality && (
            <span style={{ fontSize: 9, color: qColor, fontWeight: 700 }}>
              Q{avgQ}
            </span>
          )}
        </div>
      </div>

      {/* Quality breakdown (4 bars) */}
      {hasQuality && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
          <QualityBar label="Pur" value={quality.purity}    color={qColor} />
          <QualityBar label="Stb" value={quality.stability} color={qColor} />
          <QualityBar label="Pot" value={quality.potency}   color={qColor} />
          <QualityBar label="Den" value={quality.density}   color={qColor} />
        </div>
      )}

      {/* Stats table */}
      {stats && stats.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 2,
          paddingTop: 4, borderTop: '1px solid rgba(100,180,255,0.08)',
        }}>
          {stats.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span style={{ color: '#64748b', textTransform: 'capitalize' }}>{s.label}</span>
              <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>
                {s.value}
                {s.baseValue != null && (
                  <span style={{ color: '#475569', marginLeft: 4 }}>({s.baseValue})</span>
                )}
                {s.unit && <span style={{ color: '#475569', marginLeft: 2 }}>{s.unit}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Description */}
      {description && (
        <div style={{
          fontSize: 10, color: '#94a3b8', lineHeight: 1.4, fontStyle: 'italic',
          paddingTop: 4, borderTop: '1px solid rgba(100,180,255,0.08)',
        }}>
          {description}
        </div>
      )}

      {/* Price */}
      {price && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 11, paddingTop: 4, borderTop: '1px solid rgba(100,180,255,0.08)',
        }}>
          <span style={{ color: '#64748b' }}>
            {price.mode === 'sell' ? 'Sell price' : 'Price'}
          </span>
          <span style={{
            color: flags?.cannotAfford ? '#ef4444' : '#fbbf24',
            fontFamily: 'monospace', fontWeight: 700,
          }}>
            {price.amount.toLocaleString()} {price.currency || 'cr'}
          </span>
        </div>
      )}

      {/* Flag badges */}
      {(flags?.required || flags?.equipped || flags?.outOfStock) && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
          {flags.required && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 2, background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 700 }}>
              REQUIRED
            </span>
          )}
          {flags.equipped && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 2, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', fontWeight: 700 }}>
              FITTED
            </span>
          )}
          {flags.outOfStock && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 2, background: 'rgba(100,116,139,0.15)', color: '#64748b', border: '1px solid rgba(100,116,139,0.3)', fontWeight: 700 }}>
              OUT OF STOCK
            </span>
          )}
        </div>
      )}
    </TooltipShell>
  );
};
