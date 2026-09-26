// BaseTab.jsx -- player base management on a planet (Phase 1, 2026-09-22).
// docs/bases-spec.md. Build (surface / orbital), see construction status,
// upgrade tier, fit / unfit base modules from cargo, use the Cargo Depot.
// The server is the authority; this panel only shows and asks.

import React, { useEffect, useState } from 'react';
import { basesAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';
import { useGameStore } from '@/stores/gameStore';

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
  const openWindow = useGameStore(s => s.openWindow);
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

  const { base, can_build, tiers, cargo_modules, cargo_resources, can_expand, others = [] } = data;
  const OthersHere = () => others.length === 0 ? null : (
    <Card accent="#5a7080">
      <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>OTHER BASES ON THIS PLANET · {others.length}</div>
      {others.map(o => (
        <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.8rem', color: '#a8b4c5', padding: '3px 0', borderTop: `1px solid ${EDGE}55` }}>
          <span><b style={{ color: '#e2e8f0' }}>{o.name}</b> · {o.kind === 'orbital' ? '🛰️ starbase' : '🏠 surface'} · {o.tier_name}{o.building ? ' (building)' : ''}</span>
          <span style={{ color: '#5a7080', fontFamily: FM }}>{o.owner_name}{o.modules?.length ? ` · ${o.modules.join(', ')}` : ''}</span>
        </div>
      ))}
    </Card>
  );

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
          <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>Framework · {t1.slots} plots</div>
          <CostLine tier={t1} />
          {can_build && !can_build.ok && (
            <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: 6 }}>{can_build.reasons.map(r => <div key={r}>🔒 {r}</div>)}</div>
          )}
          {kind === 'orbital' && can_build?.orbital_blocked && (
            <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: 6 }}>🔒 {can_build.orbital_blocked}</div>
          )}
          <div style={{ marginTop: 10 }}>
            <Btn disabled={busy || !can_build?.ok || (kind === 'orbital' && !!can_build?.orbital_blocked)} onClick={() => act(() => basesAPI.build(kind, name), 'Construction started')}>BUILD FRAMEWORK</Btn>
            {can_build && <span style={{ color: '#5a7080', fontSize: '0.75rem', fontFamily: FM, marginLeft: 10 }}>bases {can_build.base_count}/{can_build.base_cap}</span>}
          </div>
        </Card>
        <OthersHere />
      </div>
    );
  }

  // ---------- base here: summary + the console (BaseWindow) ----------
  const fitted = Object.values(base.modules || {});
  const stations = fitted.filter(m => m.stats?.foundry).length;
  return (
    <div style={{ fontFamily: F }}>
      <H right={`${base.kind === 'orbital' ? 'orbital' : 'surface'} · ${base.system_name} / ${base.body_name}`}>
        {base.kind === 'orbital' ? '🛰️' : '🏠'} {base.name.toUpperCase()} · {base.tier_name.toUpperCase()}
      </H>
      {base.building && (
        <Card accent="#22d3ee"><div style={{ color: '#67e8f9', fontWeight: 700 }}>🏗️ Under construction · {minutesLeft(base.build_completes_at)} min remaining</div></Card>
      )}
      <Card accent={GOLD.pri}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>{fitted.length} / {base.slots} plots built · {stations} station{stations === 1 ? '' : 's'}</div>
            <div style={{ color: '#8fa3b8', fontSize: '0.78rem', fontFamily: FM }}>
              depot {base.depot.capacity > 0 ? `${fmt(Math.round(base.depot.used))} / ${fmt(base.depot.capacity)}` : 'none'}{base.next_tier ? ` · next: ${base.next_tier.name}` : ' · top tier'}
            </div>
          </div>
          <Btn disabled={base.building} onClick={() => { playSound('button_click'); openWindow('base'); }}>OPEN BASE CONSOLE</Btn>
        </div>
        <div style={{ color: '#5a7080', fontSize: '0.74rem', marginTop: 6 }}>Plots, stations, the foundry queue, the depot and upgrades all live in the console.</div>
      </Card>
      <OthersHere />
    </div>
  );
};

export default BaseTab;
