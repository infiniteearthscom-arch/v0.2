// BaseTab.jsx -- player base management on a planet (Phase 1, 2026-09-22).
// docs/bases-spec.md. Build (surface / orbital), see construction status,
// upgrade tier, fit / unfit base modules from cargo, use the Cargo Depot.
// The server is the authority; this panel only shows and asks.

import React, { useEffect, useState } from 'react';
import { basesAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';
import { useGameStore } from '@/stores/gameStore';
import { RefineryPanel } from '@/components/refinery/RefineryPanel';

const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const EDGE = '#1a3050';
const GOLD = { pri: '#f59e0b', light: '#fbbf24' };
const fmt = (n) => Number(n || 0).toLocaleString();
const minutesLeft = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));

const Btn = ({ children, onClick, disabled, accent = GOLD.pri, title, small }) => (
  <button onClick={onClick} disabled={disabled} title={title} style={{
    padding: small ? '3px 8px' : '6px 10px', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'rgba(4,8,16,0.4)' : `${accent}22`, border: `1px solid ${disabled ? EDGE : accent + '88'}`,
    color: disabled ? '#3a5060' : accent, fontFamily: F, fontWeight: 700, fontSize: small ? '0.72rem' : '0.8rem', letterSpacing: 0.5, whiteSpace: 'nowrap',
  }}>{children}</button>
);
const Card = ({ children, accent = EDGE, style }) => (
  <div style={{ background: 'rgba(4,8,16,0.55)', border: `1px solid ${EDGE}`, borderLeft: `3px solid ${accent}`, borderRadius: 3, padding: 10, marginBottom: 8, ...style }}>{children}</div>
);
const H = ({ children, right }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
    <div style={{ color: GOLD.light, fontWeight: 800, letterSpacing: 1, fontSize: '0.85rem' }}>{children}</div>
    {right && <div style={{ color: '#5a7080', fontSize: '0.75rem', fontFamily: FM }}>{right}</div>}
  </div>
);
const CostLine = ({ tier }) => (
  <div style={{ color: '#8fa3b8', fontSize: '0.78rem', fontFamily: FM }}>
    {fmt(tier.credits)} CR · {Object.entries(tier.resources).map(([n, q]) => `${q} ${n}`).join(' · ')} · {tier.build_minutes} min build
  </div>
);

export const BaseTab = ({ body }) => {
  const pushToast = useGameStore(s => s.pushToast);
  const fetchCredits = useGameStore(s => s.fetchCredits);
  const fetchCargoInfo = useGameStore(s => s.fetchCargoInfo);
  const flash = (kind, text) => pushToast && pushToast({ kind, text });

  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('surface');
  const [name, setName] = useState('');
  const [fitPick, setFitPick] = useState(null);      // slot key awaiting a module pick
  const [depQty, setDepQty] = useState({});          // cargo stack id -> qty
  const [wdQty, setWdQty] = useState({});            // depot stack id -> qty
  const [, tick] = useState(0);

  const load = async () => {
    try { setData(await basesAPI.here()); setErr(null); }
    catch (e) { setErr(e.message || 'Base data unavailable'); }
  };
  useEffect(() => { load(); }, [body?.id]);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);

  const act = async (fn, okText) => {
    if (busy) return;
    setBusy(true);
    try { playSound('button_click'); const r = await fn(); if (okText) flash('success', typeof okText === 'function' ? okText(r) : okText); if (fetchCredits) fetchCredits(); if (fetchCargoInfo) fetchCargoInfo(); await load(); }
    catch (e) { flash('error', e.message || 'Failed'); }
    finally { setBusy(false); }
  };

  if (err) return <div style={{ color: '#f87171', fontFamily: F, fontSize: '0.85rem' }}>{err}</div>;
  if (!data) return <div style={{ color: '#4a6580', fontFamily: F, fontSize: '0.85rem' }}>Loading…</div>;

  const { base, can_build, tiers, cargo_modules, cargo_resources, can_expand } = data;

  // ---------- no base here: build ----------
  if (!base) {
    const t1 = tiers[1];
    return (
      <div style={{ fontFamily: F }}>
        <H>FOUND A BASE ON {String(body?.name || '').toUpperCase()}</H>
        <Card accent={GOLD.pri}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {['surface', 'orbital'].map(k => (
              <Btn key={k} accent={kind === k ? GOLD.light : '#5a7080'} onClick={() => setKind(k)}>{k === 'surface' ? '🏠 SURFACE BASE' : '🛰️ ORBITAL BASE'}</Btn>
            ))}
          </div>
          <div style={{ color: '#8fa3b8', fontSize: '0.8rem', marginBottom: 8 }}>
            {kind === 'surface' ? 'A planetary base on the surface. Same modules as an orbital base in this phase.' : 'A star base in orbit. Same modules as a surface base in this phase.'}
          </div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={`${kind === 'orbital' ? 'Orbital' : 'Surface'} Base name`}
            style={{ width: '100%', boxSizing: 'border-box', background: '#050a14', color: '#e2e8f0', border: `1px solid ${EDGE}`, borderRadius: 2, padding: '5px 8px', fontFamily: F, marginBottom: 8 }} />
          <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>Framework · 1 module slot</div>
          <CostLine tier={t1} />
          {can_build && !can_build.ok && (
            <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: 6 }}>{can_build.reasons.map(r => <div key={r}>🔒 {r}</div>)}</div>
          )}
          <div style={{ marginTop: 10 }}>
            <Btn disabled={busy || !can_build?.ok} onClick={() => act(() => basesAPI.build(kind, name), 'Construction started')}>BUILD FRAMEWORK</Btn>
            {can_build && <span style={{ color: '#5a7080', fontSize: '0.75rem', fontFamily: FM, marginLeft: 10 }}>bases {can_build.base_count}/{can_build.base_cap}</span>}
          </div>
        </Card>
      </div>
    );
  }

  // ---------- base here ----------
  const slots = Array.from({ length: base.slots }, (_, i) => `b${i + 1}`);
  const depotFitted = base.depot.capacity > 0;
  return (
    <div style={{ fontFamily: F }}>
      <H right={`${base.kind === 'orbital' ? 'orbital' : 'surface'} · ${base.system_name} / ${base.body_name}`}>
        {base.kind === 'orbital' ? '🛰️' : '🏠'} {base.name.toUpperCase()} · {base.tier_name.toUpperCase()}
      </H>
      {base.building && (
        <Card accent="#22d3ee"><div style={{ color: '#67e8f9', fontWeight: 700 }}>🏗️ Under construction · {minutesLeft(base.build_completes_at)} min remaining</div></Card>
      )}

      {/* modules */}
      <Card>
        <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>MODULE SLOTS ({slots.length})</div>
        {slots.map(k => {
          const m = base.modules[k];
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: `1px solid ${EDGE}` }}>
              <span style={{ fontFamily: FM, color: '#5a7080', width: 26 }}>{k.toUpperCase()}</span>
              {m ? (
                <>
                  <span style={{ flex: 1, color: '#e2e8f0', fontWeight: 700 }}>{m.name} <span style={{ color: '#5a7080', fontFamily: FM, fontSize: '0.75rem' }}>T{m.tier}</span></span>
                  <Btn small accent="#f87171" disabled={busy || base.building} onClick={() => act(() => basesAPI.unfit(base.id, k), `${m.name} returned to cargo`)}>UNFIT</Btn>
                </>
              ) : fitPick === k ? (
                <span style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {cargo_modules.length === 0 && <span style={{ color: '#5a7080', fontSize: '0.78rem' }}>no base modules in cargo (buy or craft: Cargo Depot, Base Refinery, Research Lab)</span>}
                  {cargo_modules.map(cm => (
                    <Btn key={cm.inventory_id} small disabled={busy} onClick={() => { setFitPick(null); act(() => basesAPI.fit(base.id, k, cm.inventory_id), `${cm.name} fitted`); }}>{cm.name}</Btn>
                  ))}
                  <Btn small accent="#5a7080" onClick={() => setFitPick(null)}>CANCEL</Btn>
                </span>
              ) : (
                <>
                  <span style={{ flex: 1, color: '#4a6580', fontSize: '0.8rem' }}>empty</span>
                  <Btn small disabled={busy || base.building} onClick={() => setFitPick(k)}>FIT…</Btn>
                </>
              )}
            </div>
          );
        })}
      </Card>

      {/* upgrade */}
      {base.next_tier && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>Upgrade to {base.next_tier.name} · {base.next_tier.slots} slots</div>
              <CostLine tier={base.next_tier} />
              {!can_expand && <div style={{ color: '#f87171', fontSize: '0.78rem', marginTop: 4 }}>🔒 Research Base Expansion (Industry)</div>}
            </div>
            <Btn disabled={busy || base.building || !can_expand} onClick={() => act(() => basesAPI.upgrade(base.id), `Upgrading to ${base.next_tier.name}`)}>UPGRADE</Btn>
          </div>
        </Card>
      )}

      {/* base refinery: the refinery panel right here, fee-free */}
      {!base.building && Object.values(base.modules).some(m => m.stats?.refinery) && (
        <Card accent={GOLD.pri}>
          <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem', marginBottom: 8 }}>REFINERY</div>
          <RefineryPanel />
        </Card>
      )}

      {/* depot */}
      <Card accent={depotFitted ? '#4ade80' : EDGE}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>CARGO DEPOT</div>
          <div style={{ color: '#5a7080', fontFamily: FM, fontSize: '0.75rem' }}>{depotFitted ? `${fmt(Math.round(base.depot.used))} / ${fmt(base.depot.capacity)} used` : 'no depot fitted'}</div>
        </div>
        {depotFitted && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ color: '#5a7080', fontSize: '0.75rem', fontFamily: FM, marginBottom: 4 }}>IN DEPOT</div>
              {base.depot.stacks.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.78rem' }}>empty</div>}
              {base.depot.stacks.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#e2e8f0', marginBottom: 3 }}>
                  <span style={{ flex: 1 }}>{s.resource_name} <span style={{ color: '#5a7080', fontFamily: FM }}>×{fmt(s.quantity)} Q{s.avg_quality}</span></span>
                  <input type="number" min={1} max={s.quantity} value={wdQty[s.id] ?? s.quantity} onChange={e => setWdQty({ ...wdQty, [s.id]: Math.max(1, Math.min(s.quantity, Number(e.target.value) || 1)) })}
                    style={{ width: 60, background: '#050a14', color: '#e2e8f0', border: `1px solid ${EDGE}`, borderRadius: 2, fontFamily: FM, fontSize: '0.75rem' }} />
                  <Btn small disabled={busy} onClick={() => act(() => basesAPI.withdraw(base.id, s.id, wdQty[s.id] ?? s.quantity), 'Withdrawn')}>TAKE</Btn>
                </div>
              ))}
            </div>
            <div>
              <div style={{ color: '#5a7080', fontSize: '0.75rem', fontFamily: FM, marginBottom: 4 }}>IN CARGO</div>
              {cargo_resources.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.78rem' }}>no resources</div>}
              {cargo_resources.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#e2e8f0', marginBottom: 3 }}>
                  <span style={{ flex: 1 }}>{s.resource_name} <span style={{ color: '#5a7080', fontFamily: FM }}>×{fmt(s.quantity)} Q{s.avg_quality}</span></span>
                  <input type="number" min={1} max={s.quantity} value={depQty[s.id] ?? s.quantity} onChange={e => setDepQty({ ...depQty, [s.id]: Math.max(1, Math.min(s.quantity, Number(e.target.value) || 1)) })}
                    style={{ width: 60, background: '#050a14', color: '#e2e8f0', border: `1px solid ${EDGE}`, borderRadius: 2, fontFamily: FM, fontSize: '0.75rem' }} />
                  <Btn small accent="#4ade80" disabled={busy} onClick={() => act(() => basesAPI.deposit(base.id, s.id, depQty[s.id] ?? s.quantity), 'Deposited')}>STORE</Btn>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default BaseTab;
