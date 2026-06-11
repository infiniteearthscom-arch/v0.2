// TradeWindow -- Social Multiplayer Step 5 Phase 2.
// =============================================================
// Two-party trade UI. Opens whenever the trade singleton has an
// active session; closes when the session reaches a terminal state
// (with a brief overlay surface for completed/cancelled).
//
// Each side independently sets their offer (items + credits) and
// confirms. Any offer change voids both confirms (server-enforced --
// the client just reflects the state it gets back).

import React, { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { resourcesAPI } from '@/utils/api';
import trade from '@/utils/trade';
import { playSound } from '@/utils/audio';

const EDGE = '#1a3050';
const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const BLUE = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD = { pri: '#f59e0b', light: '#fbbf24' };
const GREEN = { pri: '#22c55e', light: '#4ade80' };
const RED = { pri: '#ef4444', light: '#f87171' };

const fmt = (n) => (n == null ? '0' : n.toLocaleString());

const RESOURCE_ICON = (name) => (name || '??').slice(0, 2).toUpperCase();

// Single-stack tile (used in cargo picker + offer chips). The compact
// rendering matches InventoryWindow's tile style well enough without
// pulling in the full ItemCell dependency.
const StackTile = ({ stack, count, onClick, dim, removable, onRemove, label }) => {
  const isResource = stack.item_type === 'resource';
  const name = isResource ? stack.resource_name : stack.item_name;
  const tooltip = label || (name + (count ? ` ×${count}` : ''));
  return (
    <div
      onClick={onClick}
      title={tooltip}
      style={{
        width: 44, height: 44,
        background: 'rgba(8,14,28,0.7)',
        border: `1px solid ${EDGE}`,
        borderRadius: 3,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
        opacity: dim ? 0.4 : 1,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: '0.625rem', fontFamily: FM, color: '#cbd5e1', fontWeight: 700 }}>
        {RESOURCE_ICON(name)}
      </span>
      <span style={{
        position: 'absolute',
        bottom: 1, right: 2,
        fontSize: '0.5625rem', fontFamily: FM, color: GOLD.light, fontWeight: 700,
        textShadow: '0 0 3px rgba(0,0,0,0.8)',
      }}>{count || stack.quantity}</span>
      {removable && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
          title="Remove from offer"
          style={{
            position: 'absolute', top: -6, right: -6,
            width: 14, height: 14, borderRadius: 7,
            background: RED.pri, border: 'none', color: '#fff',
            fontSize: '0.5625rem', fontWeight: 800, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, lineHeight: 1,
          }}
        >×</button>
      )}
    </div>
  );
};

// Side pane (yours OR theirs). Read-only when isOther=true.
const OfferPane = ({
  title,
  participant,
  inventoryByStackId,
  isOther,
  onAdjustItem, onRemoveItem, onSetCredits, onAddItem,
  onToggleConfirm,
  cargoStacks,
  accent,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Map the offer's stack_ids back to actual stacks via the inventory
  // lookup. For 'their' side we don't have access to their inventory,
  // so we render a placeholder tile -- still shows the qty.
  const offerRows = (participant.offer || []).map(it => {
    const stack = inventoryByStackId?.get(it.stack_id) || null;
    return { ...it, stack };
  });

  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: 'rgba(4,8,16,0.5)',
      border: `1px solid ${participant.confirmed ? GREEN.pri + '88' : EDGE}`,
      borderRadius: 3,
      padding: 10,
      display: 'flex', flexDirection: 'column',
      transition: 'border-color 120ms',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline',
        marginBottom: 8, paddingBottom: 6,
        borderBottom: `1px solid ${EDGE}`,
      }}>
        <span style={{
          fontSize: '0.6875rem', color: accent, fontWeight: 800,
          fontFamily: F, letterSpacing: 1, textTransform: 'uppercase',
          flex: 1,
        }}>{title}</span>
        <span style={{
          fontSize: '0.5625rem', fontFamily: FM,
          color: participant.confirmed ? GREEN.light : '#475569',
          fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
        }}>
          {participant.confirmed ? '✓ Confirmed' : (isOther ? 'Considering' : 'Editing')}
        </span>
      </div>

      {/* Items */}
      <div style={{
        minHeight: 100,
        display: 'flex', flexWrap: 'wrap', gap: 8,
        marginBottom: 10,
      }}>
        {offerRows.length === 0 && (
          <div style={{
            fontSize: '0.625rem', color: '#475569', fontFamily: F, fontStyle: 'italic',
            padding: '20px 4px',
          }}>
            {isOther ? 'No items offered yet.' : 'No items in your offer.'}
          </div>
        )}
        {offerRows.map((row) => {
          const stack = row.stack;
          const display = stack
            ? (stack.item_type === 'resource' ? stack.resource_name : stack.item_name)
            : '???';
          return (
            <div key={row.stack_id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <StackTile
                stack={stack || { item_type: 'item', item_name: display }}
                count={row.quantity}
                removable={!isOther}
                onRemove={() => onRemoveItem?.(row.stack_id)}
                label={`${display} ×${row.quantity}`}
              />
              {!isOther && stack && stack.quantity > 1 && (
                <input
                  type="number"
                  value={row.quantity}
                  min={1}
                  max={stack.quantity}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(stack.quantity, parseInt(e.target.value) || 1));
                    onAdjustItem?.(row.stack_id, n);
                  }}
                  style={{
                    width: 44, fontSize: '0.5625rem', fontFamily: FM,
                    background: '#0b1424', border: `1px solid ${EDGE}`,
                    color: '#cbd5e1', textAlign: 'center', padding: 1, borderRadius: 2,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Credits */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 10,
        padding: '6px 8px',
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${EDGE}`,
        borderRadius: 2,
      }}>
        <span style={{ fontSize: '0.6875rem' }}>⬡</span>
        <span style={{ fontSize: '0.625rem', color: '#475569', fontFamily: FM, marginRight: 4 }}>CR</span>
        {isOther ? (
          <span style={{ fontSize: '0.75rem', color: GOLD.light, fontWeight: 700, fontFamily: FM }}>
            {fmt(participant.credits)}
          </span>
        ) : (
          <input
            type="number"
            min={0}
            value={participant.credits}
            onChange={(e) => onSetCredits?.(Math.max(0, parseInt(e.target.value) || 0))}
            style={{
              flex: 1, fontSize: '0.75rem', fontFamily: FM,
              background: '#0b1424', border: `1px solid ${EDGE}`,
              color: GOLD.light, padding: '2px 6px', borderRadius: 2,
            }}
          />
        )}
      </div>

      {/* Add-from-cargo (own side only) */}
      {!isOther && (
        <>
          <button
            onClick={() => { playSound('button_click'); setPickerOpen(o => !o); }}
            style={{
              padding: '6px 10px',
              background: pickerOpen ? `${BLUE.pri}1c` : 'transparent',
              border: `1px solid ${BLUE.pri}55`,
              color: BLUE.light,
              fontSize: '0.625rem', fontFamily: F, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
              marginBottom: 8,
            }}
          >
            {pickerOpen ? '× Hide Cargo' : '+ Add From Cargo'}
          </button>
          {pickerOpen && (
            <div style={{
              maxHeight: 140, overflowY: 'auto',
              background: 'rgba(0,0,0,0.3)',
              border: `1px solid ${EDGE}`,
              borderRadius: 2,
              padding: 6,
              display: 'flex', flexWrap: 'wrap', gap: 6,
              marginBottom: 10,
            }}>
              {cargoStacks.length === 0 && (
                <div style={{ fontSize: '0.625rem', color: '#475569', fontFamily: F, fontStyle: 'italic', padding: 8 }}>
                  Your cargo is empty.
                </div>
              )}
              {cargoStacks.map(s => {
                const alreadyOffered = (participant.offer || []).find(o => o.stack_id === s.id);
                const remaining = s.quantity - (alreadyOffered?.quantity || 0);
                return (
                  <StackTile
                    key={s.id}
                    stack={s}
                    count={remaining}
                    dim={remaining <= 0}
                    onClick={remaining > 0 ? () => onAddItem?.(s.id) : undefined}
                    label={`${(s.item_type === 'resource' ? s.resource_name : s.item_name)} (avail: ${remaining}) -- click to offer 1`}
                  />
                );
              })}
            </div>
          )}

          <div style={{ flex: 1 }} />
          <button
            onClick={() => { playSound('button_click'); onToggleConfirm?.(); }}
            style={{
              padding: '8px 12px',
              background: participant.confirmed ? `${GREEN.pri}24` : `${GOLD.pri}24`,
              border: `1px solid ${participant.confirmed ? GREEN.pri : GOLD.pri}88`,
              color: participant.confirmed ? GREEN.light : GOLD.light,
              fontSize: '0.6875rem', fontFamily: F, fontWeight: 800, letterSpacing: 1,
              textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
            }}
          >
            {participant.confirmed ? '✓ Unconfirm' : 'Confirm Trade'}
          </button>
        </>
      )}
    </div>
  );
};

const TerminalOverlay = ({ result, partnerName, onClose }) => {
  if (!result) return null;
  const isOk = result.status === 'completed';
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(4,8,16,0.85)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 12, zIndex: 5,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: '2.5rem' }}>{isOk ? '🤝' : '✕'}</div>
      <div style={{
        fontSize: '1.125rem', color: isOk ? GREEN.light : RED.light,
        fontFamily: F, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
      }}>
        {isOk ? 'Trade Complete' : 'Trade Cancelled'}
      </div>
      {!isOk && (
        <div style={{ fontSize: '0.6875rem', color: '#94a3b8', fontFamily: FM }}>
          {result.reason || 'unknown reason'}
        </div>
      )}
      <button
        onClick={onClose}
        style={{
          padding: '8px 18px',
          background: 'transparent',
          border: `1px solid ${EDGE}`,
          color: '#cbd5e1',
          fontSize: '0.6875rem', fontFamily: F, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
          marginTop: 6,
        }}
      >Close</button>
    </div>
  );
};

export const TradeWindow = () => {
  const myUserId = useAuthStore(s => s.user?.id) || null;
  const fetchCredits = useGameStore(s => s.fetchCredits);

  const [active, setActive] = useState(() => trade.getActiveTrade());
  const [lastResult, setLastResult] = useState(() => trade.getLastResult());
  const [cargo, setCargo] = useState([]); // [{id, item_type, ...}]
  const [cargoLoadedFor, setCargoLoadedFor] = useState(null);

  // Sync from singleton.
  useEffect(() => {
    if (!trade.isEnabled()) return;
    trade.ensureReady();
    setActive(trade.getActiveTrade());
    const unsubs = [
      trade.on('opened',    (s) => { setActive(s); setLastResult(null); }),
      trade.on('updated',   (s) => { setActive(s); }),
      trade.on('completed', (r) => { setActive(null); setLastResult(r); fetchCredits?.(); }),
      trade.on('cancelled', (r) => { setActive(null); setLastResult(r); }),
    ];
    return () => unsubs.forEach(u => u && u());
  }, [fetchCredits]);

  // Fetch / refresh own cargo whenever the active trade arrives or
  // offers change (so the picker shows accurate remaining quantities
  // when the server commits a change). De-dup by active.id.
  //
  // /inventory returns nested-by-resource-type for resources plus a
  // flat items list -- the trade picker wants a flat per-stack list
  // (since each stack is a distinct tradable object), so we flatten
  // here.
  useEffect(() => {
    if (!active) return;
    if (cargoLoadedFor === active.id) return;
    setCargoLoadedFor(active.id);
    resourcesAPI.getInventory()
      .then(({ inventory, items }) => {
        const flat = [];
        for (const grp of inventory || []) {
          for (const st of grp.stacks || []) {
            flat.push({
              id: st.id,
              item_type: 'resource',
              resource_name: grp.resource_name,
              resource_type_id: grp.resource_type_id,
              quantity: st.quantity,
            });
          }
        }
        for (const it of items || []) {
          flat.push({
            id: it.id,
            item_type: 'item',
            item_name: it.item_name,
            item_id: it.item_id,
            quantity: it.quantity,
          });
        }
        setCargo(flat);
      })
      .catch(() => setCargo([]));
  }, [active, cargoLoadedFor]);

  if (!trade.isEnabled()) return null;
  if (!active && !lastResult) return null;

  // Resolve participant slots.
  const me     = active?.participants?.find(p => p.user_id === myUserId) || null;
  const other  = active?.participants?.find(p => p.user_id !== myUserId) || null;
  const partnerName = other?.name || lastResult?.partner_name || 'Pilot';

  // Inventory lookup for the offer pane to render names + max qty
  // hints. Includes both my cargo (for me-pane) and... well, we don't
  // have the other's cargo, so their pane gets nulls and falls back
  // to a placeholder tile.
  const inventoryByStackId = useMemo(() => {
    const m = new Map();
    for (const s of cargo) m.set(s.id, s);
    return m;
  }, [cargo]);

  // Mutation helpers -- all flow back through the server which then
  // broadcasts trade:updated back to us; the local state is purely
  // a reflection of server state, so we don't optimistically update.
  const adjustOffer = (mutator) => {
    if (!me) return;
    const next = mutator([...me.offer]);
    trade.setOffer(next, me.credits).catch(err => console.warn('setOffer failed', err));
  };
  const handleAddItem = (stackId) => {
    adjustOffer(offer => {
      const existing = offer.find(o => o.stack_id === stackId);
      const stack = inventoryByStackId.get(stackId);
      if (!stack) return offer;
      if (existing) {
        if (existing.quantity < stack.quantity) existing.quantity += 1;
        return offer;
      }
      return [...offer, { stack_id: stackId, quantity: 1 }];
    });
  };
  const handleAdjustItem = (stackId, qty) => {
    adjustOffer(offer => offer.map(o => o.stack_id === stackId ? { ...o, quantity: qty } : o));
  };
  const handleRemoveItem = (stackId) => {
    adjustOffer(offer => offer.filter(o => o.stack_id !== stackId));
  };
  const handleSetCredits = (n) => {
    if (!me) return;
    trade.setOffer(me.offer, n).catch(err => console.warn('setOffer failed', err));
  };
  const handleToggleConfirm = () => {
    if (!me) return;
    trade.setConfirmed(!me.confirmed).catch(err => console.warn('confirm failed', err));
  };
  const handleCancel = () => {
    if (!active) return;
    playSound('button_click');
    trade.cancelActive('user_cancelled').catch(err => console.warn('cancel failed', err));
  };
  const handleCloseTerminal = () => {
    setLastResult(null);
    trade.clearLastResult();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 60,
        fontFamily: F,
      }}
    >
      <div style={{
        position: 'relative',
        width: 720, maxWidth: '94vw',
        maxHeight: '90vh',
        background: 'rgba(8,14,28,0.98)',
        border: `1px solid ${EDGE}`,
        borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 16px',
          background: `linear-gradient(90deg, ${GOLD.pri}1c, transparent)`,
          borderBottom: `1px solid ${EDGE}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: '1rem' }}>🤝</span>
          <span style={{
            fontSize: '0.875rem', color: GOLD.light, fontWeight: 800,
            letterSpacing: 2, textTransform: 'uppercase', flex: 1,
          }}>
            Trade with {partnerName}
          </span>
          <button
            onClick={handleCancel}
            disabled={!active}
            style={{
              padding: '4px 10px',
              background: 'transparent',
              border: `1px solid ${EDGE}`,
              color: '#7a8a9a',
              fontSize: '0.625rem', fontFamily: F, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase', cursor: active ? 'pointer' : 'default',
              borderRadius: 3,
            }}
          >Cancel Trade</button>
        </div>

        {/* Two-pane body */}
        {active && me && other && (
          <div style={{ display: 'flex', gap: 12, padding: 16, minHeight: 360 }}>
            <OfferPane
              title="Your Offer"
              participant={me}
              inventoryByStackId={inventoryByStackId}
              isOther={false}
              accent={GOLD.light}
              cargoStacks={cargo}
              onAdjustItem={handleAdjustItem}
              onRemoveItem={handleRemoveItem}
              onAddItem={handleAddItem}
              onSetCredits={handleSetCredits}
              onToggleConfirm={handleToggleConfirm}
            />
            <OfferPane
              title={`${partnerName}'s Offer`}
              participant={other}
              inventoryByStackId={inventoryByStackId}
              isOther={true}
              accent={BLUE.light}
              cargoStacks={[]}
            />
          </div>
        )}

        {/* Footer hint */}
        {active && (
          <div style={{
            padding: '8px 16px',
            borderTop: `1px solid ${EDGE}`,
            background: 'rgba(0,0,0,0.3)',
            fontSize: '0.5625rem', color: '#475569', fontFamily: FM, letterSpacing: 1,
            textAlign: 'center',
          }}>
            When both sides confirm, the swap is atomic. Editing any offer voids both confirms.
          </div>
        )}

        <TerminalOverlay
          result={!active ? lastResult : null}
          partnerName={partnerName}
          onClose={handleCloseTerminal}
        />
      </div>
    </div>
  );
};

export default TradeWindow;
