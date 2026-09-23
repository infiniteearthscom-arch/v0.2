// RefineryPanel.jsx -- station / city Refinery sub-tab (2026-09-22).
// docs/refining-spec.md. Pick one resource stack, choose how many units
// to feed in, read the server's quote (units out, quality in -> out,
// fee), refine. The server owns every number; this only displays.

import React, { useEffect, useState } from 'react';
import { refiningAPI, resourcesAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';
import { useGameStore } from '@/stores/gameStore';
import { getQualityTier } from '@/data/resources';

const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const EDGE = '#1a3050';
const GOLD = { pri: '#f59e0b', light: '#fbbf24' };
const fmt = (n) => Number(n || 0).toLocaleString();
const avgQ = (s) => Math.round(((s?.purity ?? 50) + (s?.stability ?? 50) + (s?.potency ?? 50) + (s?.density ?? 50)) / 4);

export const RefineryPanel = () => {
  const pushToast = useGameStore(s => s.pushToast);
  const fetchCredits = useGameStore(s => s.fetchCredits);
  const fetchCargoInfo = useGameStore(s => s.fetchCargoInfo);
  const setResearchTargetTech = useGameStore(s => s.setResearchTargetTech);
  const openWindow = useGameStore(s => s.openWindow);
  const flash = (kind, text) => pushToast && pushToast({ kind, text });

  const [stacks, setStacks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(0);
  const [quote, setQuote] = useState(null);
  const [locked, setLocked] = useState(null); // { tech_name, requires_tech }
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStacks = async () => {
    try {
      const data = await resourcesAPI.getInventory();
      const list = (data.inventory || []).flatMap(r => r.stacks.map(s => ({
        id: s.id, quantity: s.quantity, stats: s.stats, resource_name: r.resource_name, category: r.category, rarity: r.rarity, base_price: r.base_price,
      })));
      list.sort((a, b) => a.resource_name.localeCompare(b.resource_name) || avgQ(b.stats) - avgQ(a.stats));
      setStacks(list);
      if (selected && !list.find(s => s.id === selected.id)) { setSelected(null); setQuote(null); }
    } catch (e) { setError(e.message || 'Could not load cargo'); }
  };
  useEffect(() => { loadStacks(); }, []);

  // quote whenever the selection / quantity changes
  useEffect(() => {
    if (!selected) { setQuote(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await refiningAPI.quote(selected.id, qty);
        if (cancelled) return;
        if (!r.unlocked) { setLocked({ tech_name: r.tech_name, requires_tech: r.requires_tech }); setQuote(null); return; }
        setLocked(null); setQuote(r.quote); setError(null);
      } catch (e) { if (!cancelled) { setQuote(null); setError(e.message || 'Quote failed'); } }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [selected?.id, qty]);

  const pick = (s) => { playSound('button_click'); setSelected(s); setQty(s.quantity); setError(null); };

  const run = async () => {
    if (!selected || !quote || quote.reason || busy) return;
    setBusy(true);
    try {
      playSound('button_click');
      const r = await refiningAPI.run(selected.id, qty);
      flash('success', `Refined ${r.quote.units_in} → ${r.quote.units_out} ${r.resource_name} · Q${r.quote.quality_in} → Q${r.quote.quality_out} · fee ${fmt(r.quote.fee)} CR`);
      if (fetchCredits) fetchCredits();
      if (fetchCargoInfo) fetchCargoInfo();
      await loadStacks();
    } catch (e) { flash('error', e.message || 'Refining failed'); }
    finally { setBusy(false); }
  };

  if (locked) {
    return (
      <div style={{ fontFamily: F, padding: 12, border: `1px solid ${GOLD.pri}55`, borderRadius: 3, background: 'rgba(133,77,14,0.15)' }}>
        <div style={{ color: GOLD.light, fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>🔒 REFINERY LOCKED</div>
        <div style={{ color: '#a8b4c5', fontSize: '0.85rem', marginBottom: 10 }}>Research <b>{locked.tech_name}</b> (Industry tree) to refine resources here.</div>
        <button onClick={() => { if (setResearchTargetTech) setResearchTargetTech(locked.requires_tech); if (openWindow) openWindow('research'); }}
          style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', fontFamily: F, color: '#fbbf24', background: 'rgba(133,77,14,0.35)', border: '1px solid #fbbf24', borderRadius: 2, cursor: 'pointer' }}>
          → Open Research
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: F, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {/* ---- stack picker ---- */}
      <div>
        <div style={{ color: GOLD.light, fontWeight: 800, letterSpacing: 1, fontSize: '0.85rem', marginBottom: 6 }}>CARGO</div>
        {stacks.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.8rem' }}>No resources in cargo.</div>}
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {stacks.map(s => {
            const tier = getQualityTier(s.stats?.purity ?? 50, s.stats?.stability ?? 50, s.stats?.potency ?? 50, s.stats?.density ?? 50);
            const active = selected?.id === s.id;
            return (
              <button key={s.id} onClick={() => pick(s)} style={{
                width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 9px', marginBottom: 4, borderRadius: 3, cursor: 'pointer',
                background: active ? `${GOLD.pri}1a` : 'rgba(4,8,16,0.55)', border: `1px solid ${active ? GOLD.pri + '88' : EDGE}`, borderLeft: `3px solid ${tier.color}`,
                color: '#e2e8f0', fontFamily: F,
              }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{s.resource_name}</span>
                <span style={{ fontFamily: FM, fontSize: '0.75rem', color: '#8fa3b8' }}>×{fmt(s.quantity)} · <span style={{ color: tier.color }}>{tier.name} Q{avgQ(s.stats)}</span></span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- quote + run ---- */}
      <div>
        <div style={{ color: GOLD.light, fontWeight: 800, letterSpacing: 1, fontSize: '0.85rem', marginBottom: 6 }}>REFINE</div>
        {!selected && <div style={{ color: '#4a6580', fontSize: '0.8rem' }}>Pick a stack. Each pass returns fewer units at a higher quality, for a fee. Yield and the quality cap grow with the Processing skills and Deep Refining research.</div>}
        {selected && (
          <div style={{ background: 'rgba(4,8,16,0.55)', border: `1px solid ${EDGE}`, borderRadius: 3, padding: 10 }}>
            <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: 6 }}>{selected.resource_name}</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#8fa3b8', marginBottom: 8 }}>
              Units in
              <input type="range" min={1} max={selected.quantity} value={qty} onChange={e => setQty(Number(e.target.value))} style={{ flex: 1 }} />
              <input type="number" min={1} max={selected.quantity} value={qty} onChange={e => setQty(Math.max(1, Math.min(selected.quantity, Number(e.target.value) || 1)))}
                style={{ width: 70, background: '#050a14', color: '#e2e8f0', border: `1px solid ${EDGE}`, borderRadius: 2, padding: '2px 4px', fontFamily: FM }} />
            </label>
            {quote && (
              <div style={{ fontFamily: FM, fontSize: '0.8rem', color: '#a8b4c5', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px' }}>
                <span style={{ color: '#5a7080' }}>Units out</span><span style={{ color: '#e2e8f0' }}>{fmt(quote.units_out)} <span style={{ color: '#5a7080' }}>({quote.yield_pct}% yield)</span></span>
                <span style={{ color: '#5a7080' }}>Quality</span><span style={{ color: '#e2e8f0' }}>Q{quote.quality_in} → <span style={{ color: '#4ade80' }}>Q{quote.quality_out}</span> <span style={{ color: '#5a7080' }}>(+{quote.gain}/pass, cap Q{quote.cap})</span></span>
                <span style={{ color: '#5a7080' }}>Fee</span><span style={{ color: GOLD.light }}>{fmt(quote.fee)} CR</span>
              </div>
            )}
            {quote?.reason && <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: 6 }}>{quote.reason}</div>}
            {error && <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: 6 }}>{error}</div>}
            <button onClick={run} disabled={busy || !quote || !!quote.reason} style={{
              marginTop: 10, width: '100%', padding: '7px 10px', borderRadius: 3, cursor: (busy || !quote || quote?.reason) ? 'not-allowed' : 'pointer',
              background: (busy || !quote || quote?.reason) ? 'rgba(4,8,16,0.4)' : `${GOLD.pri}22`, border: `1px solid ${(busy || !quote || quote?.reason) ? EDGE : GOLD.pri + '88'}`,
              color: (busy || !quote || quote?.reason) ? '#3a5060' : GOLD.light, fontFamily: F, fontWeight: 800, letterSpacing: 1,
            }}>⚗ REFINE</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RefineryPanel;
