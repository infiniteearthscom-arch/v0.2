// MarketPanel -- Social Multiplayer Step 6.
// =============================================================
// Per-station market browser. Three view modes inside one panel:
//   - 'summary': item-list ticker tape (best bid/ask, volumes)
//   - 'book':    full order book for one item (drilled in from summary)
//   - 'post':    new-order form
// Plus a "My Orders" footer panel that surfaces the user's own open
// orders + cancel buttons.
//
// v1 has no realtime broadcast for market changes -- the panel
// refetches after every mutation. A 'market:updated' socket event
// is the natural v2 upgrade if the panel starts feeling stale.

import React, { useEffect, useMemo, useState } from 'react';
import { marketAPI, resourcesAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';

const EDGE = '#1a3050';
const F  = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const BLUE  = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD  = { pri: '#f59e0b', light: '#fbbf24' };
const GREEN = { pri: '#22c55e', light: '#4ade80' };
const RED   = { pri: '#ef4444', light: '#f87171' };

const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString());

// Identity helper -- two orders / summary rows match if they refer to
// the same item. resource_type_id wins for resources, item_id for items.
const itemKey = (row) => row.item_type === 'resource'
  ? `resource:${row.resource_type_id}`
  : `item:${row.item_id}`;

const displayName = (row) => {
  if (row.item_type === 'resource') return row.resource_type_id || 'resource';
  return row.item_name || row.item_id || 'item';
};

const SectionHeader = ({ title, right, accent = BLUE.light }) => (
  <div style={{
    display: 'flex', alignItems: 'baseline',
    padding: '6px 10px 6px 8px',
    background: `linear-gradient(90deg, ${accent}10, transparent)`,
    borderLeft: `2px solid ${accent}`,
    marginBottom: 6, marginTop: 4,
  }}>
    <span style={{
      fontSize: '0.8rem', color: accent, fontWeight: 800,
      fontFamily: F, letterSpacing: 1.5, textTransform: 'uppercase',
      flex: 1,
    }}>{title}</span>
    {right && <span style={{ fontSize: '0.8rem', color: '#475569', fontFamily: FM }}>{right}</span>}
  </div>
);

// ============================================
// SUMMARY VIEW (default)
// ============================================
const SummaryView = ({ rows, onDrill, onSwitchView }) => {
  if (rows == null) return <Loading />;
  if (rows.length === 0) {
    return (
      <Empty>
        Nothing on the market here yet.
        <button onClick={() => { playSound('button_click'); onSwitchView('post'); }} style={postLinkStyle}>
          Post the first order →
        </button>
      </Empty>
    );
  }
  return (
    <div>
      <div style={tableHeaderStyle}>
        <span>Item</span>
        <span style={{ textAlign: 'right' }}>Best Bid</span>
        <span style={{ textAlign: 'right' }}>Best Ask</span>
        <span style={{ textAlign: 'right' }}>Bid Vol</span>
        <span style={{ textAlign: 'right' }}>Ask Vol</span>
      </div>
      {rows.map(r => (
        <div
          key={itemKey(r)}
          onClick={() => { playSound('button_click'); onDrill(r); }}
          style={tableRowStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(20,30,50,0.6)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(4,8,16,0.4)'; }}
        >
          <span style={{ color: '#cbd5e1', fontFamily: F, fontWeight: 700, fontSize: '0.6875rem' }}>
            {displayName(r)}
            <span style={{ color: '#475569', marginLeft: 6, fontSize: '0.8rem', fontFamily: FM }}>
              {r.item_type === 'resource' ? 'RES' : 'ITEM'}
            </span>
          </span>
          <span style={{ ...numCellStyle, color: r.best_bid ? GREEN.light : '#475569' }}>
            {fmtNum(r.best_bid)}
          </span>
          <span style={{ ...numCellStyle, color: r.best_ask ? GOLD.light : '#475569' }}>
            {fmtNum(r.best_ask)}
          </span>
          <span style={{ ...numCellStyle, color: '#94a3b8' }}>{fmtNum(r.bid_volume)}</span>
          <span style={{ ...numCellStyle, color: '#94a3b8' }}>{fmtNum(r.ask_volume)}</span>
        </div>
      ))}
    </div>
  );
};

// ============================================
// BOOK VIEW (single item drill-in)
// ============================================
const BookView = ({ stationBodyId, target, onBack, onAfter }) => {
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refetch = () => {
    setOrders(null);
    marketAPI.stationBook(stationBodyId, {
      itemType: target.item_type,
      resourceTypeId: target.item_type === 'resource' ? target.resource_type_id : null,
      itemId: target.item_type === 'item' ? target.item_id : null,
    })
      .then(({ orders }) => setOrders(orders || []))
      .catch(() => setOrders([]));
  };
  useEffect(refetch, [stationBodyId, target.item_type, target.resource_type_id, target.item_id]);

  const buys = useMemo(() => (orders || []).filter(o => o.side === 'buy'),  [orders]);
  const sells = useMemo(() => (orders || []).filter(o => o.side === 'sell'), [orders]);

  const handleFulfill = async (order, quantity, sourceStackId) => {
    setBusy(true); setError(null);
    try {
      await marketAPI.fulfillOrder(order.id, quantity, sourceStackId);
      refetch();
      onAfter?.();
    } catch (err) {
      setError(err.message || 'Fulfill failed');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
        <button onClick={() => { playSound('button_click'); onBack(); }} style={backBtnStyle}>← Back</button>
        <span style={{ fontSize: '0.8125rem', color: '#e2e8f0', fontFamily: F, fontWeight: 800, letterSpacing: 1, marginLeft: 8 }}>
          {displayName(target)}
        </span>
        <span style={{ fontSize: '0.8rem', color: '#475569', marginLeft: 8, fontFamily: FM }}>
          {target.item_type === 'resource' ? 'RES' : 'ITEM'}
        </span>
      </div>
      {error && (
        <div style={errorStyle}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Buy side (these are bids -- you can fulfill by selling). */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionHeader title="Buy Orders (Bids)" right={`${buys.length}`} accent={GREEN.light} />
          {(orders == null) ? <Loading /> :
            buys.length === 0 ? <Empty>No bids.</Empty> :
            buys.map(o => (
              <OrderRow
                key={o.id}
                order={o}
                actionLabel="Sell"
                busy={busy}
                target={target}
                onAct={(qty, src) => handleFulfill(o, qty, src)}
              />
            ))}
        </div>
        {/* Sell side (asks -- you can fulfill by buying). */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionHeader title="Sell Orders (Asks)" right={`${sells.length}`} accent={GOLD.light} />
          {(orders == null) ? <Loading /> :
            sells.length === 0 ? <Empty>No asks.</Empty> :
            sells.map(o => (
              <OrderRow
                key={o.id}
                order={o}
                actionLabel="Buy"
                busy={busy}
                target={target}
                onAct={(qty) => handleFulfill(o, qty, null)}
              />
            ))}
        </div>
      </div>
    </div>
  );
};

// Single order row inside the book. Click "Fulfill" -> small inline
// quantity-picker. For BUY-orders, the user must also pick which of
// their stacks to sell from (a tiny stack picker beneath the qty).
const OrderRow = ({ order, actionLabel, busy, target, onAct }) => {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [stacks, setStacks] = useState(null);
  const [pickedStackId, setPickedStackId] = useState(null);

  const isBuyOrder = order.side === 'buy';

  // For fulfilling a BUY order (= you're selling), load the user's
  // matching stacks so they can pick which to sell from.
  useEffect(() => {
    if (!open || !isBuyOrder) return;
    if (stacks != null) return;
    resourcesAPI.getInventory()
      .then(({ inventory, items }) => {
        const matching = [];
        if (target.item_type === 'resource') {
          for (const grp of inventory || []) {
            if (grp.resource_type_id !== target.resource_type_id) continue;
            for (const s of grp.stacks || []) {
              matching.push({ id: s.id, label: `${grp.resource_name} ×${s.quantity}`, qty: s.quantity });
            }
          }
        } else {
          for (const it of items || []) {
            if (it.item_id !== target.item_id) continue;
            matching.push({ id: it.id, label: `${it.item_name} ×${it.quantity}`, qty: it.quantity });
          }
        }
        setStacks(matching);
        if (matching[0]) setPickedStackId(matching[0].id);
      })
      .catch(() => setStacks([]));
  }, [open, isBuyOrder, stacks, target]);

  const maxQty = (() => {
    if (!isBuyOrder) return order.quantity_remaining;
    const picked = (stacks || []).find(s => s.id === pickedStackId);
    return Math.min(order.quantity_remaining, picked?.qty || 0);
  })();

  return (
    <div style={orderRowStyle}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px', alignItems: 'center', gap: 6, padding: '6px 8px' }}>
        <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontFamily: FM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {order.poster_name}
          {target.item_type === 'resource' && order.side === 'sell' && order.stat_purity != null && (
            <span style={{ color: '#475569', marginLeft: 4 }}>
              Q{Math.round(((order.stat_purity||0) + (order.stat_stability||0) + (order.stat_potency||0) + (order.stat_density||0)) / 4)}
            </span>
          )}
        </span>
        <span style={{ fontSize: '0.6875rem', color: order.side === 'buy' ? GREEN.light : GOLD.light, fontFamily: FM, fontWeight: 700, textAlign: 'right' }}>
          {fmtNum(order.price_per_unit)} cr
        </span>
        <span style={{ fontSize: '0.6875rem', color: '#cbd5e1', fontFamily: FM, fontWeight: 700, textAlign: 'right' }}>
          ×{fmtNum(order.quantity_remaining)}
        </span>
      </div>
      <div style={{ padding: '0 8px 6px' }}>
        {!open ? (
          <button
            onClick={() => { playSound('button_click'); setOpen(true); setQty(Math.min(1, order.quantity_remaining)); }}
            disabled={busy}
            style={fulfillBtnStyle(order.side)}
          >{actionLabel} →</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {isBuyOrder && stacks != null && stacks.length === 0 && (
              <span style={{ fontSize: '0.8rem', color: RED.light, fontFamily: FM }}>You have no matching stacks to sell.</span>
            )}
            {isBuyOrder && stacks && stacks.length > 0 && (
              <select
                value={pickedStackId || ''}
                onChange={(e) => setPickedStackId(e.target.value)}
                style={selectStyle}
              >
                {stacks.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number" min={1} max={maxQty || 1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(maxQty || 1, parseInt(e.target.value) || 1)))}
                style={qtyInputStyle}
              />
              <button
                onClick={() => onAct(qty, pickedStackId)}
                disabled={busy || maxQty <= 0}
                style={fulfillBtnStyle(order.side, true)}
              >
                {actionLabel} {qty} @ {fmtNum(order.price_per_unit)} ({fmtNum(qty * order.price_per_unit)} cr)
              </button>
              <button onClick={() => setOpen(false)} style={cancelBtnStyle}>×</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// POST VIEW (new order form)
// ============================================
const PostView = ({ stationBodyId, onBack, onAfter }) => {
  const [side, setSide] = useState('sell');
  const [inv, setInv] = useState(null);
  const [pickedStackId, setPickedStackId] = useState(null);
  const [pickedResourceTypeId, setPickedResourceTypeId] = useState('');
  const [pickedItemId, setPickedItemId] = useState('');
  const [itemTypeForBuy, setItemTypeForBuy] = useState('resource');
  const [price, setPrice] = useState(0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    resourcesAPI.getInventory()
      .then(({ inventory, items }) => setInv({ inventory: inventory || [], items: items || [] }))
      .catch(() => setInv({ inventory: [], items: [] }));
  }, []);

  // SELL: flatten stacks for the picker.
  const sellableStacks = useMemo(() => {
    if (!inv) return [];
    const out = [];
    for (const grp of inv.inventory) for (const s of grp.stacks || []) {
      out.push({
        id: s.id, kind: 'resource', resource_type_id: grp.resource_type_id,
        label: `${grp.resource_name} ×${s.quantity}${s.quality_tier ? ` (${s.quality_tier})` : ''}`,
        qty: s.quantity,
      });
    }
    for (const it of inv.items) {
      out.push({
        id: it.id, kind: 'item', item_id: it.item_id,
        label: `${it.item_name} ×${it.quantity}`,
        qty: it.quantity,
      });
    }
    return out;
  }, [inv]);

  const pickedStack = useMemo(() => sellableStacks.find(s => s.id === pickedStackId) || null, [sellableStacks, pickedStackId]);
  useEffect(() => {
    if (side === 'sell' && !pickedStackId && sellableStacks[0]) setPickedStackId(sellableStacks[0].id);
  }, [side, pickedStackId, sellableStacks]);

  // BUY: the user picks an identity manually. For v1 we just take a
  // free-text resource_type_id or item_id -- a future polish step is
  // a proper picker keyed off the game's resource/item catalogs.
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (side === 'sell') {
        if (!pickedStack) throw new Error('Pick a stack first');
        await marketAPI.postOrder({
          side: 'sell',
          item_type: pickedStack.kind,
          resource_type_id: pickedStack.kind === 'resource' ? pickedStack.resource_type_id : null,
          item_id: pickedStack.kind === 'item' ? pickedStack.item_id : null,
          source_stack_id: pickedStack.id,
          price_per_unit: price,
          quantity: qty,
        });
      } else {
        await marketAPI.postOrder({
          side: 'buy',
          item_type: itemTypeForBuy,
          resource_type_id: itemTypeForBuy === 'resource' ? (pickedResourceTypeId || null) : null,
          item_id: itemTypeForBuy === 'item' ? (pickedItemId || null) : null,
          price_per_unit: price,
          quantity: qty,
        });
      }
      onAfter?.();
      onBack();
    } catch (err) {
      setError(err.message || 'Post failed');
    } finally {
      setBusy(false);
    }
  };

  const maxQty = side === 'sell' ? (pickedStack?.qty || 1) : 999999;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 10 }}>
        <button onClick={() => { playSound('button_click'); onBack(); }} style={backBtnStyle}>← Back</button>
        <span style={{ fontSize: '0.8125rem', color: '#e2e8f0', fontFamily: F, fontWeight: 800, letterSpacing: 1, marginLeft: 8 }}>
          Post New Order
        </span>
      </div>

      {/* Side toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['sell', 'buy'].map(s => (
          <button
            key={s}
            onClick={() => { playSound('button_click'); setSide(s); setError(null); }}
            style={{
              flex: 1, padding: '8px 10px',
              background: side === s
                ? (s === 'sell' ? `${GOLD.pri}22` : `${GREEN.pri}22`)
                : 'rgba(4,8,16,0.4)',
              border: side === s
                ? `1px solid ${s === 'sell' ? GOLD.pri : GREEN.pri}88`
                : `1px solid ${EDGE}`,
              color: side === s
                ? (s === 'sell' ? GOLD.light : GREEN.light)
                : '#475569',
              fontSize: '0.6875rem', fontFamily: F, fontWeight: 800, letterSpacing: 1,
              textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
            }}
          >{s === 'sell' ? 'Sell (offer items)' : 'Buy (request items)'}</button>
        ))}
      </div>

      {side === 'sell' ? (
        <div style={{ marginBottom: 8 }}>
          <Label>From your cargo</Label>
          <select
            value={pickedStackId || ''}
            onChange={(e) => setPickedStackId(e.target.value)}
            style={selectStyle}
          >
            {sellableStacks.length === 0 && <option value="">(your cargo is empty)</option>}
            {sellableStacks.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            <Label>Item Type</Label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['resource', 'item'].map(t => (
                <button
                  key={t}
                  onClick={() => { setItemTypeForBuy(t); }}
                  style={{
                    flex: 1, padding: '6px 8px',
                    background: itemTypeForBuy === t ? `${BLUE.pri}24` : 'transparent',
                    border: `1px solid ${itemTypeForBuy === t ? BLUE.pri + '88' : EDGE}`,
                    color: itemTypeForBuy === t ? BLUE.light : '#7a8a9a',
                    fontSize: '0.8rem', fontFamily: F, fontWeight: 700, letterSpacing: 1,
                    textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
                  }}
                >{t}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <Label>{itemTypeForBuy === 'resource' ? 'Resource ID' : 'Item ID'}</Label>
            <input
              type="text"
              value={itemTypeForBuy === 'resource' ? pickedResourceTypeId : pickedItemId}
              onChange={(e) => itemTypeForBuy === 'resource'
                ? setPickedResourceTypeId(e.target.value)
                : setPickedItemId(e.target.value)}
              placeholder={itemTypeForBuy === 'resource' ? 'e.g. iron' : 'e.g. mining_basic'}
              style={textInputStyle}
            />
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <Label>Quantity</Label>
          <input
            type="number" min={1} max={maxQty}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)))}
            style={textInputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <Label>Price per unit (cr)</Label>
          <input
            type="number" min={1}
            value={price}
            onChange={(e) => setPrice(Math.max(0, parseInt(e.target.value) || 0))}
            style={textInputStyle}
          />
        </div>
      </div>

      <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontFamily: FM, marginBottom: 10, padding: '6px 8px', background: 'rgba(4,8,16,0.5)', border: `1px solid ${EDGE}`, borderRadius: 2 }}>
        Total escrow: <span style={{ color: GOLD.light, fontWeight: 700 }}>{fmtNum(price * qty)} cr</span>
        {side === 'sell' && (
          <span style={{ color: '#475569', marginLeft: 8 }}>(items locked from your cargo until cancelled/filled)</span>
        )}
        {side === 'buy' && (
          <span style={{ color: '#475569', marginLeft: 8 }}>(credits deducted now; refunded if cancelled)</span>
        )}
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <button
        onClick={submit}
        disabled={busy || price <= 0 || qty <= 0}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: side === 'sell' ? `${GOLD.pri}33` : `${GREEN.pri}33`,
          border: `1px solid ${side === 'sell' ? GOLD.pri : GREEN.pri}88`,
          color: side === 'sell' ? GOLD.light : GREEN.light,
          fontSize: '0.6875rem', fontFamily: F, fontWeight: 800, letterSpacing: 1,
          textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
        }}
      >
        {busy ? 'Posting...' : `Post ${side.toUpperCase()} order`}
      </button>
    </div>
  );
};

// ============================================
// MY ORDERS (footer panel)
// ============================================
const MyOrdersPanel = ({ refreshKey, onChanged }) => {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    setRows(null);
    marketAPI.myOrders()
      .then(({ orders }) => setRows(orders || []))
      .catch(() => setRows([]));
  }, [refreshKey]);

  if (rows == null || rows.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <SectionHeader title="My Open Orders" right={`${rows.length}`} accent={BLUE.light} />
      {rows.map(o => (
        <div key={o.id} style={{
          display: 'grid',
          gridTemplateColumns: '50px 1fr 80px 70px 70px',
          alignItems: 'center', gap: 6,
          padding: '6px 8px',
          background: 'rgba(4,8,16,0.4)',
          borderBottom: `1px solid rgba(26,48,80,0.2)`,
          fontSize: '0.6875rem', fontFamily: FM,
        }}>
          <span style={{ color: o.side === 'sell' ? GOLD.light : GREEN.light, fontWeight: 800, letterSpacing: 1, fontSize: '0.8rem' }}>
            {o.side.toUpperCase()}
          </span>
          <span style={{ color: '#cbd5e1', fontFamily: F, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {o.item_type === 'resource' ? o.resource_type_id : o.item_id}
            <span style={{ color: '#475569', marginLeft: 6, fontSize: '0.8rem' }}>@ {o.station_name || 'this station'}</span>
          </span>
          <span style={{ color: GOLD.light, textAlign: 'right' }}>{fmtNum(o.price_per_unit)} cr</span>
          <span style={{ color: '#cbd5e1', textAlign: 'right' }}>×{fmtNum(o.quantity_remaining)}</span>
          <button
            onClick={async () => {
              if (!window.confirm(`Cancel this ${o.side} order?`)) return;
              playSound('button_click');
              try { await marketAPI.cancelOrder(o.id); onChanged?.(); }
              catch (err) { window.alert(err.message || 'Cancel failed'); }
            }}
            style={cancelOrderBtnStyle}
          >Cancel</button>
        </div>
      ))}
    </div>
  );
};

// ============================================
// MAIN
// ============================================
export const MarketPanel = ({ stationBodyId }) => {
  const [view, setView] = useState('summary');         // 'summary' | 'book' | 'post'
  const [target, setTarget] = useState(null);          // current drill target
  const [summary, setSummary] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch summary whenever station changes or we bump refresh.
  useEffect(() => {
    if (!stationBodyId) return;
    setSummary(null);
    marketAPI.stationSummary(stationBodyId)
      .then(({ items }) => setSummary(items || []))
      .catch(() => setSummary([]));
  }, [stationBodyId, refreshKey]);

  const bumpRefresh = () => setRefreshKey(k => k + 1);

  if (!stationBodyId) {
    return (
      <Empty>Dock at a station to access its market.</Empty>
    );
  }

  return (
    <div>
      {/* Top action bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => { playSound('button_click'); setView('summary'); setTarget(null); }}
          style={navBtnStyle(view === 'summary')}
        >Browse</button>
        <button
          onClick={() => { playSound('button_click'); setView('post'); }}
          style={navBtnStyle(view === 'post')}
        >+ Post Order</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { playSound('button_click'); bumpRefresh(); }}
          title="Refresh"
          style={refreshBtnStyle}
        >↻</button>
      </div>

      {view === 'summary' && (
        <SummaryView
          rows={summary}
          onDrill={(row) => { setTarget(row); setView('book'); }}
          onSwitchView={(v) => setView(v)}
        />
      )}
      {view === 'book' && target && (
        <BookView
          stationBodyId={stationBodyId}
          target={target}
          onBack={() => setView('summary')}
          onAfter={bumpRefresh}
        />
      )}
      {view === 'post' && (
        <PostView
          stationBodyId={stationBodyId}
          onBack={() => setView('summary')}
          onAfter={bumpRefresh}
        />
      )}

      <MyOrdersPanel refreshKey={refreshKey} onChanged={bumpRefresh} />
    </div>
  );
};

// ============================================
// STYLE HELPERS
// ============================================
const Loading = () => (
  <div style={{ padding: 30, textAlign: 'center', color: '#475569', fontSize: '0.6875rem', fontFamily: F, fontStyle: 'italic' }}>
    Loading...
  </div>
);
const Empty = ({ children }) => (
  <div style={{
    padding: 30, textAlign: 'center', color: '#475569',
    fontSize: '0.6875rem', fontFamily: F, fontStyle: 'italic',
    background: 'rgba(4,8,16,0.4)', border: `1px solid ${EDGE}`, borderRadius: 3,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  }}>
    {children}
  </div>
);
const Label = ({ children }) => (
  <div style={{ fontSize: '0.8rem', color: '#475569', fontFamily: FM, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
    {children}
  </div>
);
const postLinkStyle = {
  background: 'transparent', border: `1px solid ${BLUE.pri}55`,
  color: BLUE.light, padding: '4px 10px', borderRadius: 3,
  fontSize: '0.8rem', fontFamily: F, fontWeight: 700, letterSpacing: 1,
  textTransform: 'uppercase', cursor: 'pointer',
};
const tableHeaderStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 90px 90px 80px 80px',
  padding: '4px 10px',
  fontSize: '0.8rem', color: '#475569', fontFamily: FM,
  textTransform: 'uppercase', letterSpacing: 1,
};
const tableRowStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 90px 90px 80px 80px',
  padding: '8px 10px',
  alignItems: 'center',
  background: 'rgba(4,8,16,0.4)',
  borderBottom: '1px solid rgba(26,48,80,0.2)',
  cursor: 'pointer',
  transition: 'background 80ms ease',
};
const numCellStyle = { textAlign: 'right', fontSize: '0.6875rem', fontFamily: FM, fontWeight: 700 };
const backBtnStyle = {
  background: 'transparent', border: `1px solid ${EDGE}`,
  color: '#7a8a9a', fontSize: '0.8rem', fontFamily: F, fontWeight: 700,
  padding: '4px 8px', cursor: 'pointer', borderRadius: 3,
  letterSpacing: 1, textTransform: 'uppercase',
};
const orderRowStyle = {
  background: 'rgba(4,8,16,0.4)',
  border: `1px solid ${EDGE}`,
  borderRadius: 2, marginBottom: 6,
};
const fulfillBtnStyle = (side, primary) => ({
  width: primary ? 'auto' : '100%',
  flex: primary ? 1 : undefined,
  padding: primary ? '4px 8px' : '4px',
  background: side === 'buy' ? `${GREEN.pri}24` : `${GOLD.pri}24`,
  border: `1px solid ${side === 'buy' ? GREEN.pri + '88' : GOLD.pri + '88'}`,
  color: side === 'buy' ? GREEN.light : GOLD.light,
  fontSize: '0.8rem', fontFamily: F, fontWeight: 800, letterSpacing: 1,
  textTransform: 'uppercase', cursor: 'pointer', borderRadius: 2,
});
const cancelBtnStyle = {
  background: 'transparent', border: `1px solid ${RED.pri}55`,
  color: RED.light, fontSize: '0.6875rem', fontFamily: FM, cursor: 'pointer',
  padding: '0 8px', borderRadius: 2,
};
const cancelOrderBtnStyle = {
  background: 'transparent', border: `1px solid ${RED.pri}55`,
  color: RED.light, fontSize: '0.8rem', fontFamily: F, fontWeight: 700, letterSpacing: 1,
  textTransform: 'uppercase', padding: '4px 8px', cursor: 'pointer', borderRadius: 2,
};
const qtyInputStyle = {
  width: 60, fontSize: '0.6875rem', fontFamily: FM,
  background: '#0b1424', border: `1px solid ${EDGE}`,
  color: '#cbd5e1', textAlign: 'center', padding: 2, borderRadius: 2,
};
const selectStyle = {
  width: '100%', fontSize: '0.6875rem', fontFamily: FM,
  background: '#0b1424', border: `1px solid ${EDGE}`,
  color: '#cbd5e1', padding: 4, borderRadius: 2,
};
const textInputStyle = {
  width: '100%', fontSize: '0.75rem', fontFamily: FM,
  background: '#0b1424', border: `1px solid ${EDGE}`,
  color: '#cbd5e1', padding: '4px 6px', borderRadius: 2,
};
const errorStyle = {
  padding: '6px 8px', marginBottom: 8,
  background: 'rgba(127,29,29,0.3)', border: `1px solid ${RED.pri}66`,
  color: RED.light, fontSize: '0.6875rem', fontFamily: F, borderRadius: 2,
};
const navBtnStyle = (active) => ({
  padding: '6px 12px',
  background: active ? `${BLUE.pri}22` : 'transparent',
  border: `1px solid ${active ? BLUE.pri + '88' : EDGE}`,
  color: active ? BLUE.light : '#7a8a9a',
  fontSize: '0.6875rem', fontFamily: F, fontWeight: 700, letterSpacing: 1,
  textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
});
const refreshBtnStyle = {
  padding: '6px 10px',
  background: 'transparent', border: `1px solid ${EDGE}`,
  color: '#7a8a9a', fontSize: '0.75rem', cursor: 'pointer', borderRadius: 3,
};

export default MarketPanel;
