// RefineryPanel.jsx -- base refinery lanes + job queue (v2, 2026-09-25).
// docs/refining-spec.md. Lives inside the Base tab of a planet where the
// pilot owns a base with a Base Refinery fitted. The server owns every
// number; this shows lanes, running jobs with progress, the queue, a
// live quote for a new job, and collect / cancel.

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
const secsLeft = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
const fmtSecs = (s) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

const Btn = ({ children, onClick, disabled, accent = GOLD.pri, small, title }) => (
  <button onClick={onClick} disabled={disabled} title={title} style={{
    padding: small ? '3px 8px' : '6px 10px', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'rgba(4,8,16,0.4)' : `${accent}22`, border: `1px solid ${disabled ? EDGE : accent + '88'}`,
    color: disabled ? '#3a5060' : accent, fontFamily: F, fontWeight: 700, fontSize: small ? '0.72rem' : '0.8rem', letterSpacing: 0.5, whiteSpace: 'nowrap',
  }}>{children}</button>
);

export const RefineryPanel = () => {
  const pushToast = useGameStore(s => s.pushToast);
  const fetchCargoInfo = useGameStore(s => s.fetchCargoInfo);
  const setResearchTargetTech = useGameStore(s => s.setResearchTargetTech);
  const openWindow = useGameStore(s => s.openWindow);
  const flash = (kind, text) => pushToast && pushToast({ kind, text });

  const [status, setStatus] = useState(null);
  const [stacks, setStacks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(0);
  const [lane, setLane] = useState(null);
  const [quote, setQuote] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = async () => {
    let st = null;
    try { st = await refiningAPI.status(); setStatus(st); } catch (e) { setErr(e.message || 'Refinery unavailable'); }
    try {
      const data = await resourcesAPI.getInventory();
      const list = (data.inventory || []).flatMap(r => r.stacks.map(s => ({ id: s.id, quantity: s.quantity, stats: s.stats, resource_name: r.resource_name, source: 'cargo' })));
      // 089: the base depot's resource stacks refine too
      for (const s of (st?.depot_stacks || [])) list.push({ id: s.id, quantity: s.quantity, stats: s.stats, resource_name: s.resource_name, source: 'depot' });
      list.sort((a, b) => a.resource_name.localeCompare(b.resource_name) || avgQ(b.stats) - avgQ(a.stats));
      setStacks(list);
      if (selected && !list.find(s => s.id === selected.id)) { setSelected(null); setQuote(null); }
    } catch (e) {}
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setInterval(() => { tick(n => n + 1); }, 1000); const p = setInterval(load, 8000); return () => { clearInterval(t); clearInterval(p); }; }, []);

  useEffect(() => {
    if (!selected) { setQuote(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try { const r = await refiningAPI.quote(selected.id, qty, lane, selected.source); if (!cancelled) { setQuote(r.quote || null); setErr(null); } }
      catch (e) { if (!cancelled) { setQuote(null); setErr(e.message || 'Quote failed'); } }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [selected?.id, qty, lane]);

  const act = async (fn, ok) => {
    if (busy) return; setBusy(true);
    try { playSound('button_click'); const r = await fn(); if (ok) flash('success', typeof ok === 'function' ? ok(r) : ok); if (fetchCargoInfo) fetchCargoInfo(); await load(); }
    catch (e) { flash('error', e.message || 'Failed'); }
    finally { setBusy(false); }
  };

  if (err && !status) return <div style={{ color: '#f87171', fontFamily: F, fontSize: '0.85rem' }}>{err}</div>;
  if (!status) return <div style={{ color: '#4a6580', fontFamily: F, fontSize: '0.85rem' }}>Loading refinery…</div>;

  if (!status.unlocked) {
    return (
      <div style={{ fontFamily: F, padding: 10, border: `1px solid ${GOLD.pri}55`, borderRadius: 3, background: 'rgba(133,77,14,0.15)' }}>
        <div style={{ color: GOLD.light, fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>🔒 REFINING LOCKED</div>
        <div style={{ color: '#a8b4c5', fontSize: '0.85rem', marginBottom: 8 }}>Research <b>Ore Refining</b> (Industry) to craft a Base Refinery.</div>
        <Btn onClick={() => { if (setResearchTargetTech) setResearchTargetTech('tech_refining'); if (openWindow) openWindow('research'); }}>→ OPEN RESEARCH</Btn>
      </div>
    );
  }
  if (!status.available) return <div style={{ color: '#8fa3b8', fontFamily: F, fontSize: '0.85rem' }}>{status.reason}</div>;

  const doneCount = status.lanes.reduce((a, l) => a + l.jobs.filter(j => j.status === 'done').length, 0);
  return (
    <div style={{ fontFamily: F }}>
      {/* ---- lanes ---- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ color: GOLD.light, fontWeight: 800, letterSpacing: 1, fontSize: '0.85rem' }}>REFINERY LANES · {status.lanes.length}</div>
        <div style={{ color: '#5a7080', fontSize: '0.75rem', fontFamily: FM }}>⛽ {status.fuel_cells} fuel cells in cargo{doneCount ? ` · ${doneCount} job${doneCount === 1 ? '' : 's'} ready` : ''}</div>
      </div>
      {status.lanes.map(l => (
        <div key={l.slot} style={{ background: 'rgba(4,8,16,0.55)', border: `1px solid ${EDGE}`, borderLeft: `3px solid ${GOLD.pri}`, borderRadius: 3, padding: 8, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.82rem' }}>{l.slot.toUpperCase()} · {l.name} <span style={{ color: '#8fa3b8', fontFamily: FM, fontSize: '0.75rem' }}>Q{l.quality}</span></div>
            <div style={{ color: '#5a7080', fontSize: '0.72rem', fontFamily: FM }}>{l.jobs.length}/{status.max_queue_per_lane} queued</div>
          </div>
          {l.jobs.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.78rem' }}>idle</div>}
          {l.jobs.map(j => (
            <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderTop: `1px solid ${EDGE}55` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e2e8f0', fontSize: '0.78rem' }}>
                  {j.units_in} → <b>{j.units_out}</b> {j.resource_name} <span style={{ color: '#8fa3b8', fontFamily: FM }}>Q{j.quality_in}→Q{j.quality_out}</span>
                  <span style={{ color: j.status === 'done' ? '#4ade80' : j.status === 'running' ? '#67e8f9' : '#5a7080', fontFamily: FM, fontSize: '0.72rem', marginLeft: 8 }}>
                    {j.status === 'done' ? 'READY' : j.status === 'running' ? `${fmtSecs(secsLeft(j.completes_at))} left` : `starts in ${fmtSecs(secsLeft(j.starts_at))}`}
                  </span>
                </div>
                {j.status === 'running' && <div style={{ height: 3, background: '#0b1424', borderRadius: 2, marginTop: 3 }}><div style={{ width: `${Math.round(j.progress * 100)}%`, height: '100%', background: '#22d3ee', borderRadius: 2 }} /></div>}
              </div>
              {j.status === 'done' && <><Btn small accent="#4ade80" disabled={busy} onClick={() => act(() => refiningAPI.collect(j.id, 'cargo'), `Collected ${j.units_out} ${j.resource_name}`)}>TO CARGO</Btn><Btn small accent="#4ade80" disabled={busy} onClick={() => act(() => refiningAPI.collect(j.id, 'depot'), 'Stored in depot')}>TO DEPOT</Btn></>}
              {j.status === 'waiting' && <Btn small accent="#f87171" disabled={busy} onClick={() => act(() => refiningAPI.cancel(j.id), 'Job cancelled, input refunded')}>CANCEL</Btn>}
            </div>
          ))}
        </div>
      ))}

      {/* ---- new job ---- */}
      <div style={{ color: GOLD.light, fontWeight: 800, letterSpacing: 1, fontSize: '0.85rem', margin: '10px 0 6px' }}>QUEUE A JOB</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {stacks.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.8rem' }}>No resources in cargo or the depot.</div>}
          {stacks.map(s => {
            const tier = getQualityTier(s.stats?.purity ?? 50, s.stats?.stability ?? 50, s.stats?.potency ?? 50, s.stats?.density ?? 50);
            const active = selected?.id === s.id;
            return (
              <button key={s.id} onClick={() => { playSound('button_click'); setSelected(s); setQty(s.quantity); }} style={{
                width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', padding: '5px 8px', marginBottom: 3, borderRadius: 3, cursor: 'pointer',
                background: active ? `${GOLD.pri}1a` : 'rgba(4,8,16,0.55)', border: `1px solid ${active ? GOLD.pri + '88' : EDGE}`, borderLeft: `3px solid ${tier.color}`, color: '#e2e8f0', fontFamily: F,
              }}>
                <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{s.source === 'depot' ? '🏠 ' : ''}{s.resource_name}</span>
                <span style={{ fontFamily: FM, fontSize: '0.72rem', color: '#8fa3b8' }}>×{fmt(s.quantity)} · <span style={{ color: tier.color }}>Q{avgQ(s.stats)}</span></span>
              </button>
            );
          })}
        </div>
        <div style={{ background: 'rgba(4,8,16,0.55)', border: `1px solid ${EDGE}`, borderRadius: 3, padding: 8 }}>
          {!selected && <div style={{ color: '#4a6580', fontSize: '0.8rem' }}>Pick a stack. Jobs burn 1 Fuel Cell per 100 units and run on a lane; better-crafted refineries yield more, cap higher and run faster.</div>}
          {selected && (
            <>
              <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: 6 }}>{selected.resource_name}</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#8fa3b8', marginBottom: 6 }}>
                Units <input type="range" min={1} max={selected.quantity} value={qty} onChange={e => setQty(Number(e.target.value))} style={{ flex: 1 }} />
                <input type="number" min={1} max={selected.quantity} value={qty} onChange={e => setQty(Math.max(1, Math.min(selected.quantity, Number(e.target.value) || 1)))} style={{ width: 64, background: '#050a14', color: '#e2e8f0', border: `1px solid ${EDGE}`, borderRadius: 2, fontFamily: FM }} />
              </label>
              {status.lanes.length > 1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#8fa3b8', marginBottom: 6 }}>
                  Lane <select value={lane || ''} onChange={e => setLane(e.target.value || null)} style={{ background: '#050a14', color: '#e2e8f0', border: `1px solid ${EDGE}`, borderRadius: 2, fontFamily: FM }}>
                    <option value="">soonest free</option>{status.lanes.map(l => <option key={l.slot} value={l.slot}>{l.slot.toUpperCase()} Q{l.quality}</option>)}
                  </select>
                </label>
              )}
              {quote && (
                <div style={{ fontFamily: FM, fontSize: '0.76rem', color: '#a8b4c5', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px' }}>
                  <span style={{ color: '#5a7080' }}>Out</span><span style={{ color: '#e2e8f0' }}>{fmt(quote.units_out)} <span style={{ color: '#5a7080' }}>({quote.yield_pct}%)</span></span>
                  <span style={{ color: '#5a7080' }}>Quality</span><span>Q{quote.quality_in} → <span style={{ color: '#4ade80' }}>Q{quote.quality_out}</span> <span style={{ color: '#5a7080' }}>(cap Q{quote.cap})</span></span>
                  <span style={{ color: '#5a7080' }}>Time</span><span>{fmtSecs(quote.seconds)}</span>
                  <span style={{ color: '#5a7080' }}>Fuel</span><span style={{ color: quote.fuel_cells > status.fuel_cells ? '#f87171' : GOLD.light }}>{quote.fuel_cells} cell{quote.fuel_cells === 1 ? '' : 's'}</span>
                </div>
              )}
              {quote?.reason && <div style={{ color: '#f87171', fontSize: '0.78rem', marginTop: 4 }}>{quote.reason}</div>}
              {err && <div style={{ color: '#f87171', fontSize: '0.78rem', marginTop: 4 }}>{err}</div>}
              <div style={{ marginTop: 8 }}>
                <Btn disabled={busy || !quote || !!quote.reason || quote.fuel_cells > status.fuel_cells} onClick={() => act(() => refiningAPI.queue(selected.id, qty, lane, selected.source), r => `Queued: ${r.job.units_in} → ${r.job.units_out} in ${fmtSecs(r.quote.seconds)}`)}>⚗ QUEUE JOB</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RefineryPanel;
