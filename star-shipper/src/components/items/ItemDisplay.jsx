// ============================================
// ITEM DISPLAY COMPONENTS
// --------------------------------------------
// Shared components for rendering items consistently across every screen.
// All screens showing items (Cargo, Ship Designer, Vendor, Harvester,
// Crafting, etc.) should use these — if they don't, they're drifting.
//
// <ItemIcon>  — Single presentational 40×40 square. No interaction.
// <ItemCell>  — ItemIcon + hover tooltip + optional drag/click. The
//               drop-in replacement for any "item slot" UI.
//
// Both accept an already-normalized item (see utils/itemShape.js).
// ============================================

import React from 'react';
import { useTooltip } from '@/components/ui/TooltipProvider';
import { ItemTooltipContent } from '@/components/items/ItemTooltip';

// ============================================
// ITEM ICON — pure presentation
// ============================================
// A single square icon cell. Use directly when you want just the visual
// (e.g. inside a Canvas overlay, a static summary bar). If you want hover
// tooltips + drag behavior, use ItemCell instead.
export const ItemIcon = ({
  item,
  size = 40,
  border = true,
  showStack = true,
  showQualityDot = true,
  showRequiredBadge = true,
  showEquippedMark = false,
  dim = false,          // render at reduced opacity (e.g. out-of-stock / cannot-afford)
  style,                // style overrides
}) => {
  if (!item) return null;
  const {
    icon, color, stackQty, qColor, flags,
  } = item;

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        border: border ? `1.5px solid ${color}bb` : 'none',
        borderRadius: 3,
        background: `linear-gradient(135deg, ${color}22 0%, ${color}0a 100%)`,
        boxShadow: `inset 0 0 6px ${color}11`,
        opacity: dim ? 0.45 : 1,
        ...style,
      }}
    >
      {/* Icon glyph */}
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.55),
          lineHeight: 1,
          userSelect: 'none',
          filter: `drop-shadow(0 0 3px ${color}44)`,
        }}
      >
        {icon}
      </div>

      {/* Quality dot (top-right) */}
      {showQualityDot && qColor && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: qColor,
            boxShadow: `0 0 3px ${qColor}`,
          }}
        />
      )}

      {/* Required badge (top-right red !) */}
      {showRequiredBadge && flags?.required && !flags?.equipped && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#ef4444',
            color: '#fff',
            fontSize: 9,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'monospace',
            boxShadow: '0 0 4px rgba(239,68,68,0.6)',
          }}
          title="Required"
        >
          !
        </div>
      )}

      {/* Equipped checkmark (top-left) */}
      {showEquippedMark && flags?.equipped && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            fontSize: 10,
            color: '#22c55e',
            textShadow: '0 0 4px rgba(34,197,94,0.8)',
            fontWeight: 900,
          }}
        >
          ✓
        </div>
      )}

      {/* Stack count (bottom-right) */}
      {showStack && stackQty != null && stackQty > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: 1,
            right: 3,
            fontSize: Math.max(8, Math.round(size * 0.22)),
            fontWeight: 700,
            color: '#e2e8f0',
            textShadow: '0 1px 2px rgba(0,0,0,0.9)',
            fontFamily: 'monospace',
          }}
        >
          ×{stackQty}
        </div>
      )}
    </div>
  );
};

// ============================================
// ITEM CELL — icon + tooltip + drag/click
// ============================================
// The drop-in replacement for any interactive item slot. Handles:
//   - Hover → show ItemTooltipContent via TooltipProvider
//   - Drag → emits standard drag payload (see dragPayload arg)
//   - Click → invokes onClick
//   - Keyboard-accessible via role/tabIndex if onClick is provided
//
// Props:
//   item           — normalized item
//   size           — pixel size (default 40)
//   onClick        — click handler (if set, cell is clickable)
//   draggable      — enable drag (default false)
//   dragPayload    — object to serialize into dataTransfer 'application/json'.
//                    Defaults to a sensible shape derived from item.raw.
//   dim            — reduced opacity
//   extraOverlay   — ReactNode rendered on top of the cell (e.g. price badge)
//   iconProps      — forwarded to ItemIcon
export const ItemCell = ({
  item,
  size = 40,
  onClick,
  draggable = false,
  dragPayload,
  dim = false,
  extraOverlay,
  iconProps = {},
  className,
  style,
}) => {
  const { showTooltip, hideTooltip } = useTooltip();

  if (!item) return null;

  // Build the default drag payload: prefer an explicit `stack_id` (cargo
  // cells use this), fall back to the raw object id. Downstream consumers
  // (e.g. ShipBuilderWindow's slot drop) read `stack_id` to identify the
  // item to fit.
  const payload = dragPayload ?? {
    stack_id: item.raw?.id ?? item.id,
    item_type: item.raw?.item_type,
    item_id:   item.raw?.item_id,
    item_name: item.raw?.item_name ?? item.name,
    quantity:  item.raw?.quantity ?? item.stackQty,
    item_data: item.raw?.item_data,
    resource_type_id: item.raw?.resource_type_id,
    resource_name:    item.raw?.resource_name,
    stats:     item.raw?.stats,
    category:  item.raw?.category,
  };

  const interactive = !!onClick || draggable;

  return (
    <div
      className={className}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.setData('application/json', JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'move';
      } : undefined}
      onMouseEnter={() => showTooltip(<ItemTooltipContent item={item} />)}
      onMouseLeave={hideTooltip}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
      } : undefined}
      style={{
        cursor: draggable ? 'grab' : (onClick ? 'pointer' : 'default'),
        transition: 'filter 0.12s ease, transform 0.12s ease',
        ...(interactive ? {} : {}),
        ...style,
      }}
      onMouseDown={draggable ? (e) => { e.currentTarget.style.cursor = 'grabbing'; } : undefined}
      onMouseUp={draggable ? (e) => { e.currentTarget.style.cursor = 'grab'; } : undefined}
    >
      <div style={{ position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.2)'} onMouseLeave={(e) => e.currentTarget.style.filter = ''}>
        <ItemIcon item={item} size={size} dim={dim} {...iconProps} />
        {extraOverlay}
      </div>
    </div>
  );
};

// ============================================
// EMPTY SLOT CELL
// --------------------------------------------
// Visual placeholder for empty slots (e.g. empty ship module slots,
// empty inventory cells). Uses a dashed border in the accent color.
// Drop-target-aware via isDragOver and isHovered props. Consumers wire
// drag events externally since drop behavior is slot-specific.
// ============================================
export const EmptySlotCell = ({
  size = 40,
  color = '#64748b',
  label,             // optional short glyph / text in center (otherwise blank)
  isDragOver = false,
  isHovered = false,
  required = false,
  dashed = true,
  style,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
  onMouseEnter,
  onMouseLeave,
  tooltipContent,    // optional tooltip ReactNode
}) => {
  const { showTooltip, hideTooltip } = useTooltip();
  const bg = isDragOver ? `${color}33` : isHovered ? `${color}18` : `${color}08`;
  const borderOpacity = isDragOver ? 'ee' : isHovered ? 'cc' : '88';

  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseEnter={(e) => {
        if (tooltipContent) showTooltip(tooltipContent);
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (tooltipContent) hideTooltip();
        onMouseLeave?.(e);
      }}
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        border: `1.5px ${dashed ? 'dashed' : 'solid'} ${color}${borderOpacity}`,
        borderRadius: 3,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.12s ease, border-color 0.12s ease',
        ...style,
      }}
    >
      {label && (
        <span style={{
          color: `${color}aa`,
          fontSize: Math.round(size * 0.35),
          lineHeight: 1,
          userSelect: 'none',
        }}>
          {label}
        </span>
      )}
      {required && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#ef4444',
            color: '#fff',
            fontSize: 8,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'monospace',
            boxShadow: '0 0 3px rgba(239,68,68,0.6)',
          }}
        >
          !
        </div>
      )}
    </div>
  );
};
