// BaseWindow.jsx -- the base console (Foundry, 2026-09-26). docs/foundry-spec.md
//
// Full-screen modal opened from the planet window's Base tab while docked
// at a base you own. Three columns:
//   left   : pixel-art portrait of the base, name / tier, upgrade card,
//            depot meter, materials on hand
//   centre : the PLOT GRID -- one 2x2 area per base tier; locked areas
//            show the tier that unlocks them. Click a plot to select it.
//   right  : the selected plot -- empty: what can be built here (cargo
//            first, then the catalogue); station: recipes + queue + jobs;
//            depot: store / take; refinery: the refinery panel; research
//            lab / repair shop: their panels. Unfit at the bottom.
// The server owns every number; this window shows and asks.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useGameStore } from '@/stores/gameStore';
import { basesAPI, foundryAPI, fittingAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';
import { PixelItemIcon, moduleIconSpec, resourceIconSpecByName } from '@/components/pixel/PixelArt';
import { RefineryPanel } from '@/components/refinery/RefineryPanel';
import { paintBaseArt, BASE_ART_W, BASE_ART_H, familyColor } from '@/utils/pixelArt/baseArt';

const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const EDGE = '#1a3050';
const GOLD = { pri: '#f59e0b', light: '#fbbf24' };
const fmt = (n) => Number(n || 0).toLocaleString();
const minutesLeft = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
const secsLeft = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
const fmtSecs = (s) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
const kindOf = (m) => !m ? null : m.stats?.foundry ? 'station' : m.stats?.depot_capacity ? 'depot' : m.stats?.refinery ? 'refinery' : m.stats?.rp_per_min ? 'lab' : m.stats?.repair_shop ? 'repair' : 'other';
const KIND_ICON = { station: '🏭', depot: '📦', refinery: '⚗️', lab: '🔬', repair: '🔧', other: '🏗️' };

const Btn = ({ children, onClick, disabled, accent = GOLD.pri, title, small, style }) => (
  <button onClick={onClick} disabled={disabled} title={title} style={{
    padding: small ? '3px 8px' : '6px 10px', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'rgba(4,8,16,0.4)' : `${accent}22`, border: `1px solid ${disabled ? EDGE : accent + '88'}`,
    color: disabled ? '#3a5060' : accent, fontFamily: F, fontWeight: 700, fontSize: small ? '0.72rem' : '0.8rem', letterSpacing: 0.5, whiteSpace: 'nowrap', ...style,
  }}>{children}</button>
);
const Card = ({ children, accent = EDGE, style, title }) => (
  <div style={{ background: 'rgba(4,8,16,0.55)', border: `1px solid ${EDGE}`, borderLeft: `3px solid ${accent}`, borderRadius: 3, padding: 10, marginBottom: 8, ...style }}>
    {title && <div style={{ color: '#e2e8f0', fontWeight: 800, letterSpacing: 1, fontSize: '0.8rem', marginBottom: 6, fontFamily: F }}>{title}</div>}
    {children}
  </div>
);
const Label = ({ children, right }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
    <span style={{ color: '#5a7080', fontSize: '0.68rem', fontFamily: FM, letterSpacing: 1.5, textTransform: 'uppercase' }}>{children}</span>
    {right && <span style={{ color: '#5a7080', fontSize: '0.72rem', fontFamily: FM }}>{right}</span>}
  </div>
);
const Meter = ({ value, max, color }) => (
  <div style={{ height: 6, background: '#0a1020', borderRadius: 2, overflow: 'hidden', border: `1px solid ${EDGE}` }}>
    <div style={{ width: `${max > 0 ? Math.min(100, value / max * 100) : 0}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
  </div>
);

// ---------------- base portrait ----------------
const BaseArt = ({ base }) => {
  const ref = useRef(null);
  const [frame, setFrame] = useState(0);
  useEffect(() => { const t = setInterval(() => setFrame(f => f + 1), 700); return () => clearInterval(t); }, []);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    const buildings = Object.entries(base.modules || {}).map(([slot, m]) => ({ slot, family: m.stats?.foundry?.family || (kindOf(m) === 'station' ? 'none' : 'service'), tier: m.stats?.foundry?.tier || m.tier || 1, kind: kindOf(m) }));
    paintBaseArt(ctx, { id: base.id, kind: base.kind, tier: base.tier, buildings, frame });
  }, [base, frame]);
  return <canvas ref={ref} width={BASE_ART_W} height={BASE_ART_H} style={{ width: '100%', imageRendering: 'pixelated', display: 'block', border: `1px solid ${EDGE}`, borderRadius: 3, background: '#05070f' }} />;
};

// ---------------- station panel ----------------
const StationPanel = ({ base, slot, module, foundry, reload, busy, act }) => {
  const st = foundry?.stations?.find(s => s.slot === slot);
  const [recipeId, setRecipeId] = useState(null);
  const [runs, setRuns] = useState(1);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { setRecipeId(st?.recipes?.[0]?.id || null); setRuns(1); }, [slot]);
  if (!foundry?.available) return <div style={{ color: '#f87171', fontSize: '0.8rem' }}>{foundry?.reason || 'Foundry unavailable'}</div>;
  if (!st) return <div style={{ color: '#4a6580', fontSize: '0.8rem' }}>Loading station…</div>;
  const recipe = st.recipes.find(r => r.id === recipeId) || st.recipes[0];
  const mats = foundry.materials || {};
  const maxRuns = recipe ? Math.max(0, Math.min(foundry.max_runs || 20, recipe.can_run)) : 0;
  const runsNow = Math.max(1, Math.min(Math.max(1, maxRuns), runs));
  const color = familyColor(st.family);
  return (
    <div>
      <Card accent={color}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PixelItemIcon size={40} spec={moduleIconSpec({ itemId: module.module_type_id, slotType: 'base', tier: module.tier, avgQuality: st.quality })} />
          <div style={{ flex: 1 }}>
            <div style={{ color: color, fontWeight: 800, fontSize: '1rem', letterSpacing: 0.5 }}>{st.name} <span style={{ color: '#5a7080', fontFamily: FM, fontSize: '0.72rem' }}>T{st.tier} · Q{st.quality}</span></div>
            <div style={{ color: '#8fa3b8', fontSize: '0.75rem' }}>{module.stats?.foundry?.bench ? `Assembly bench: tier ${st.tier} ship modules are crafted here (Craft window while docked).` : `${st.family} station`}</div>
          </div>
        </div>
      </Card>

      <Card title="RECIPES">
        {st.recipes.map(r => {
          const on = r.id === recipe?.id;
          const outName = r.output.resource_name || r.output.item_id;
          return (
            <div key={r.id} onClick={() => { setRecipeId(r.id); setRuns(1); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', marginBottom: 3, cursor: 'pointer', borderRadius: 3, background: on ? `${color}18` : 'transparent', border: `1px solid ${on ? color + '77' : 'transparent'}` }}>
              <PixelItemIcon size={22} spec={r.output.resource_name ? resourceIconSpecByName(r.output.resource_name, null) : moduleIconSpec({ itemId: r.output.item_id })} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.8rem' }}>{r.name} <span style={{ color: '#5a7080', fontFamily: FM, fontSize: '0.7rem' }}>×{r.output.quantity} · {fmtSecs(r.seconds_here)}</span></div>
                <div style={{ color: '#8fa3b8', fontSize: '0.72rem', fontFamily: FM }}>
                  {r.inputs.map(i => { const have = mats[i.resource_name]?.quantity || 0; const ok = have >= i.quantity; return <span key={i.resource_name} style={{ color: ok ? '#a8b4c5' : '#f87171', marginRight: 8 }}>{i.quantity} {i.resource_name} <span style={{ opacity: 0.7 }}>({fmt(have)})</span></span>; })}
                </div>
              </div>
              <span style={{ color: r.can_run > 0 ? '#4ade80' : '#3a5060', fontFamily: FM, fontSize: '0.72rem' }}>{r.can_run > 0 ? `×${r.can_run}` : '—'}</span>
            </div>
          );
        })}
        {recipe && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${EDGE}` }}>
            <span style={{ color: '#8fa3b8', fontSize: '0.78rem' }}>Runs</span>
            <input type="range" min={1} max={Math.max(1, maxRuns)} value={runsNow} onChange={e => setRuns(Number(e.target.value))} disabled={maxRuns === 0} style={{ flex: 1 }} />
            <span style={{ color: '#e2e8f0', fontFamily: FM, fontSize: '0.8rem', width: 26, textAlign: 'right' }}>{maxRuns === 0 ? 0 : runsNow}</span>
            <Btn accent={color} disabled={busy || maxRuns === 0 || (st.jobs.length >= (foundry.max_queue || 8))}
                 title={maxRuns === 0 ? 'Missing materials (depot + cargo)' : st.jobs.length >= (foundry.max_queue || 8) ? 'Queue full' : ''}
                 onClick={() => act(() => foundryAPI.queue(slot, recipe.id, runsNow), (r) => `Queued ${recipe.name} ×${runsNow} · ${fmtSecs(r.seconds)}`)}>
              QUEUE {maxRuns > 0 ? `· ${fmtSecs(Math.round(recipe.seconds_here * runsNow))}` : ''}
            </Btn>
          </div>
        )}
        <div style={{ color: '#5a7080', fontSize: '0.7rem', marginTop: 6 }}>Inputs come from the depot first, then cargo. Outputs land in the depot when one is fitted.</div>
      </Card>

      <Card title={`QUEUE · ${st.jobs.length}`}>
        {st.jobs.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.78rem' }}>idle</div>}
        {st.jobs.map(j => {
          const running = j.status === 'running', done = j.status === 'done';
          const pct = running ? Math.round(Math.max(0, Math.min(1, (Date.now() - new Date(j.starts_at).getTime()) / Math.max(1, new Date(j.completes_at).getTime() - new Date(j.starts_at).getTime()))) * 100) : done ? 100 : 0;
          return (
            <div key={j.id} style={{ padding: '5px 0', borderTop: `1px solid ${EDGE}55` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 700 }}>{j.name} ×{j.runs} <span style={{ color: '#5a7080', fontFamily: FM, fontSize: '0.7rem' }}>→ {j.output_quantity} {j.output_name}{j.quality_out != null ? ` Q${j.quality_out}` : ''}</span></span>
                <span style={{ color: done ? '#4ade80' : running ? GOLD.light : '#5a7080', fontFamily: FM, fontSize: '0.72rem' }}>{done ? 'READY' : running ? `${fmtSecs(secsLeft(j.completes_at))}` : `waits ${fmtSecs(secsLeft(j.starts_at))}`}</span>
                {done && <Btn small accent="#4ade80" disabled={busy} onClick={() => act(() => foundryAPI.collect(j.id, base.depot?.capacity > 0 && !j.output_is_item ? 'depot' : 'cargo'), (r) => `Collected ${r.collected} to ${r.to}`)}>COLLECT</Btn>}
                {done && base.depot?.capacity > 0 && !j.output_is_item && <Btn small accent="#67e8f9" disabled={busy} onClick={() => act(() => foundryAPI.collect(j.id, 'cargo'), (r) => `Collected ${r.collected} to cargo`)}>TO CARGO</Btn>}
                {!running && !done && <Btn small accent="#f87171" disabled={busy} onClick={() => act(() => foundryAPI.cancel(j.id), 'Cancelled — inputs returned to cargo')}>CANCEL</Btn>}
              </div>
              {(running || done) && <div style={{ marginTop: 4 }}><Meter value={pct} max={100} color={done ? '#4ade80' : color} /></div>}
            </div>
          );
        })}
      </Card>
    </div>
  );
};

// ---------------- empty plot: build picker ----------------
const EmptyPlotPanel = ({ base, slot, data, busy, act, openWindow, setResearchTargetTech, setCraftingTargetRecipe }) => {
  const areaTier = Math.floor((Number(slot.replace('b', '')) - 1) / (base.plots_per_area || 4)) + 1;
  const inCargo = (data.cargo_modules || []);
  const cat = (data.buildables || []);
  const groups = [['Foundry stations', cat.filter(b => b.foundry)], ['Services', cat.filter(b => !b.foundry)]];
  return (
    <div>
      <Card accent={GOLD.pri} title={`PLOT ${slot.toUpperCase()} · ${(base.areas || []).find(a => a.tier === areaTier)?.name || ''} AREA`}>
        <div style={{ color: '#8fa3b8', fontSize: '0.78rem' }}>Empty. Fit a building from cargo, or see what could stand here.</div>
      </Card>
      <Card title={`IN CARGO · ${inCargo.length}`}>
        {inCargo.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.78rem' }}>no base buildings in cargo</div>}
        {inCargo.map(cm => {
          const ft = cm.stats?.foundry?.tier || 0;
          const blocked = ft > base.tier;
          return (
            <div key={cm.inventory_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: `1px solid ${EDGE}55` }}>
              <PixelItemIcon size={24} spec={moduleIconSpec({ itemId: cm.module_type_id, slotType: 'base', tier: cm.tier, avgQuality: cm.quality ? ((cm.quality.purity + cm.quality.stability + cm.quality.potency + cm.quality.density) / 4) : null })} />
              <span style={{ flex: 1, color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 700 }}>{cm.name} <span style={{ color: '#5a7080', fontFamily: FM, fontSize: '0.7rem' }}>T{cm.tier}</span></span>
              <Btn small disabled={busy || blocked} title={blocked ? `Needs a tier ${ft} base` : ''} onClick={() => act(() => basesAPI.fit(base.id, slot, cm.inventory_id), `${cm.name} built on ${slot.toUpperCase()}`)}>BUILD HERE</Btn>
            </div>
          );
        })}
      </Card>
      {groups.map(([title, list]) => list.length > 0 && (
        <Card key={title} title={title.toUpperCase()}>
          {list.map(b => {
            const ft = b.foundry?.tier || 0;
            const tierOk = ft <= base.tier;
            const color = b.foundry ? familyColor(b.foundry.family) : '#94a3b8';
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', borderTop: `1px solid ${EDGE}55`, opacity: b.unlocked ? 1 : 0.6 }}>
                <PixelItemIcon size={24} spec={moduleIconSpec({ itemId: b.id, slotType: 'base', tier: b.tier })} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: color, fontSize: '0.8rem', fontWeight: 700 }}>{b.name} <span style={{ color: '#5a7080', fontFamily: FM, fontSize: '0.7rem' }}>T{b.tier}{b.in_cargo ? ` · ${b.in_cargo} in cargo` : ''}</span></div>
                  <div style={{ color: '#8fa3b8', fontSize: '0.72rem', lineHeight: 1.3 }}>{b.description}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                    {!b.unlocked && <Btn small accent="#fbbf24" onClick={() => { setResearchTargetTech(b.requires_tech); openWindow('research'); }}>🔒 RESEARCH</Btn>}
                    {b.unlocked && !tierOk && <span style={{ color: '#f87171', fontSize: '0.7rem', fontFamily: FM }}>needs a tier {ft} base</span>}
                    {b.unlocked && <Btn small accent="#c084fc" onClick={() => { setCraftingTargetRecipe(`craft_${b.id}`); openWindow('crafting'); }}>⚒ CRAFT</Btn>}
                    {b.buy_price && <span style={{ color: '#5a7080', fontSize: '0.7rem', fontFamily: FM }}>vendor {fmt(b.buy_price)} cr</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
};

// ---------------- depot panel ----------------
const DepotPanel = ({ base, data, busy, act }) => {
  const [depQty, setDepQty] = useState({});
  const [wdQty, setWdQty] = useState({});
  const num = (v, max) => Math.max(1, Math.min(max, Number(v) || 1));
  return (
    <div>
      <Card accent="#4ade80" title="CARGO DEPOT">
        <Label right={`${fmt(Math.round(base.depot.used))} / ${fmt(base.depot.capacity)} units`}>storage</Label>
        <Meter value={base.depot.used} max={base.depot.capacity} color="#4ade80" />
        <div style={{ color: '#5a7080', fontSize: '0.7rem', marginTop: 6 }}>Stations pull inputs from here first and drop outputs here. Fit another depot for more room.</div>
      </Card>
      <Card title="IN DEPOT">
        {base.depot.stacks.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.78rem' }}>empty</div>}
        {base.depot.stacks.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#e2e8f0', marginBottom: 3 }}>
            <PixelItemIcon size={20} spec={resourceIconSpecByName(s.resource_name, s.avg_quality)} />
            <span style={{ flex: 1 }}>{s.resource_name} <span style={{ color: '#5a7080', fontFamily: FM }}>×{fmt(s.quantity)} Q{s.avg_quality}</span></span>
            <input type="number" min={1} max={s.quantity} value={wdQty[s.id] ?? s.quantity} onChange={e => setWdQty({ ...wdQty, [s.id]: num(e.target.value, s.quantity) })} style={{ width: 60, background: '#050a14', color: '#e2e8f0', border: `1px solid ${EDGE}`, borderRadius: 2, fontFamily: FM, fontSize: '0.75rem' }} />
            <Btn small disabled={busy} onClick={() => act(() => basesAPI.withdraw(base.id, s.id, wdQty[s.id] ?? s.quantity), 'Withdrawn')}>TAKE</Btn>
          </div>
        ))}
      </Card>
      <Card title="IN CARGO">
        {(data.cargo_resources || []).length === 0 && <div style={{ color: '#4a6580', fontSize: '0.78rem' }}>no resources</div>}
        {(data.cargo_resources || []).map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#e2e8f0', marginBottom: 3 }}>
            <PixelItemIcon size={20} spec={resourceIconSpecByName(s.resource_name, s.avg_quality)} />
            <span style={{ flex: 1 }}>{s.resource_name} <span style={{ color: '#5a7080', fontFamily: FM }}>×{fmt(s.quantity)} Q{s.avg_quality}</span></span>
            <input type="number" min={1} max={s.quantity} value={depQty[s.id] ?? s.quantity} onChange={e => setDepQty({ ...depQty, [s.id]: num(e.target.value, s.quantity) })} style={{ width: 60, background: '#050a14', color: '#e2e8f0', border: `1px solid ${EDGE}`, borderRadius: 2, fontFamily: FM, fontSize: '0.75rem' }} />
            <Btn small accent="#4ade80" disabled={busy || base.depot.capacity <= 0} onClick={() => act(() => basesAPI.deposit(base.id, s.id, depQty[s.id] ?? s.quantity), 'Deposited')}>STORE</Btn>
          </div>
        ))}
      </Card>
    </div>
  );
};

// ---------------- repair shop ----------------
const RepairPanel = ({ base, module }) => {
  const fleetHullPct = useGameStore(s => s.fleetHullPct);
  const fleetArmorPct = useGameStore(s => s.fleetArmorPct);
  const fleetStats = useGameStore(s => s.fleetStats);
  const repairRates = useGameStore(s => s.repairRates);
  const credits = useGameStore(s => s.resources?.credits ?? 0);
  const applyFleetHeal = useGameStore(s => s.applyFleetHeal);
  const fetchShips = useGameStore(s => s.fetchShips);
  const pushToast = useGameStore(s => s.pushToast);
  const [busy, setBusy] = useState(false);
  const disc = Number(module.stats?.repair_discount_pct) || 0;
  const maxHull = Math.round(fleetStats?.totalHull || 0), maxArmor = Math.round(fleetStats?.totalArmor || 0);
  const missingHull = Math.max(0, maxHull - Math.round(maxHull * fleetHullPct)), missingArmor = Math.max(0, maxArmor - Math.round(maxArmor * fleetArmorPct));
  const cost = Math.round((missingHull * (repairRates?.hull ?? 2) + missingArmor * (repairRates?.armor ?? 3)) * (1 - disc / 100));
  const nothing = missingHull === 0 && missingArmor === 0;
  const go = async () => {
    if (busy || nothing) return; setBusy(true);
    try { const r = await fittingAPI.repairFleet(base.celestial_body_id, fleetHullPct, fleetArmorPct); applyFleetHeal(); fetchShips?.(); pushToast?.({ kind: 'success', text: `Fleet repaired at ${r.station} for ${fmt(r.cost)} cr`, duration: 3500 }); }
    catch (e) { pushToast?.({ kind: 'error', text: e.message || 'Repair failed' }); }
    finally { setBusy(false); }
  };
  return (
    <Card accent="#94a3b8" title="REPAIR SHOP">
      <div style={{ color: '#8fa3b8', fontSize: '0.78rem', marginBottom: 8 }}>Your own yard crews. {disc}% off station rates. Shields recharge on their own.</div>
      <Label right={`${maxHull - missingHull} / ${maxHull}`}>hull</Label><Meter value={maxHull - missingHull} max={maxHull} color="#22c55e" />
      <div style={{ height: 6 }} />
      <Label right={`${maxArmor - missingArmor} / ${maxArmor}`}>armor</Label><Meter value={maxArmor - missingArmor} max={maxArmor} color="#d8a24a" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <span style={{ color: nothing ? '#5a7080' : credits >= cost ? '#e2e8f0' : '#f87171', fontSize: '0.8rem', fontFamily: FM }}>{nothing ? 'nothing to repair' : `${fmt(cost)} cr`}</span>
        <Btn disabled={busy || nothing || credits < cost} onClick={go}>REPAIR FLEET</Btn>
      </div>
    </Card>
  );
};

// ---------------- the window ----------------
export const BaseWindow = () => {
  const isOpen = useGameStore(s => s.windows.base?.open);
  const closeWindow = useGameStore(s => s.closeWindow);
  const openWindow = useGameStore(s => s.openWindow);
  const setResearchTargetTech = useGameStore(s => s.setResearchTargetTech);
  const setCraftingTargetRecipe = useGameStore(s => s.setCraftingTargetRecipe);
  const pushToast = useGameStore(s => s.pushToast);
  const fetchCredits = useGameStore(s => s.fetchCredits);
  const fetchCargoInfo = useGameStore(s => s.fetchCargoInfo);
  const dockedBody = useGameStore(s => s.dockedBody);
  const flash = (kind, text) => pushToast && pushToast({ kind, text });

  const [data, setData] = useState(null);
  const [foundry, setFoundry] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [, tick] = useState(0);

  const load = async () => {
    try {
      const d = await basesAPI.here(); setData(d); setErr(null);
      try { setFoundry(await foundryAPI.status()); } catch { setFoundry(null); }
    } catch (e) { setErr(e.message || 'Base unavailable'); }
  };
  useEffect(() => { if (isOpen) load(); }, [isOpen, dockedBody?.id]);
  useEffect(() => { if (!isOpen) return undefined; const t = setInterval(() => { tick(n => n + 1); }, 1000); const p = setInterval(load, 8000); return () => { clearInterval(t); clearInterval(p); }; }, [isOpen]);

  const act = async (fn, okText) => {
    if (busy) return; setBusy(true);
    try { playSound('button_click'); const r = await fn(); if (okText) flash('success', typeof okText === 'function' ? okText(r) : okText); fetchCredits?.(); fetchCargoInfo?.(); await load(); }
    catch (e) { flash('error', e.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const base = data?.base;
  const plots = useMemo(() => {
    if (!base) return [];
    const per = base.plots_per_area || 4;
    return (base.areas || []).map(a => ({ ...a, slots: Array.from({ length: per }, (_, i) => `b${a.first_slot + i}`) }));
  }, [base]);
  const totalMats = useMemo(() => Object.entries(foundry?.materials || {}).sort((a, b) => a[0].localeCompare(b[0])), [foundry]);
  const selModule = base && selected ? base.modules[selected] : null;
  const selKind = kindOf(selModule);

  return (
    <ModalOverlay windowId="base" title={base ? `${base.name} · ${base.tier_name}` : 'Base'} icon={base?.kind === 'orbital' ? '🛰️' : '🏠'} accent={GOLD.pri}>
      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0, fontFamily: F, color: '#e2e8f0' }}>
        {err && <div style={{ color: '#f87171' }}>{err}</div>}
        {!err && !data && <div style={{ color: '#4a6580' }}>Loading base…</div>}
        {!err && data && !base && <div style={{ color: '#8fa3b8' }}>No base of yours here. Build one from the planet's Base tab.</div>}
        {base && (
          <>
            {/* LEFT */}
            <div style={{ width: 250, flexShrink: 0, overflowY: 'auto', minHeight: 0 }}>
              <BaseArt base={base} />
              <div style={{ margin: '8px 0 10px' }}>
                <div style={{ color: GOLD.light, fontWeight: 800, fontSize: '1.05rem', letterSpacing: 0.5 }}>{base.name.toUpperCase()}</div>
                <div style={{ color: '#5a7080', fontFamily: FM, fontSize: '0.72rem' }}>{base.kind} · {base.system_name} / {base.body_name} · tier {base.tier} {base.tier_name}</div>
              </div>
              {base.building && <Card accent="#22d3ee"><div style={{ color: '#67e8f9', fontWeight: 700, fontSize: '0.8rem' }}>🏗️ Under construction · {minutesLeft(base.build_completes_at)} min</div></Card>}
              {base.next_tier && (
                <Card accent={GOLD.pri} title={`UPGRADE → ${base.next_tier.name.toUpperCase()}`}>
                  <div style={{ color: '#8fa3b8', fontSize: '0.74rem', fontFamily: FM, lineHeight: 1.5 }}>
                    +{(base.next_tier.slots - base.slots)} plots · {base.next_tier.build_minutes} min<br />
                    {fmt(base.next_tier.credits)} cr<br />
                    {Object.entries(base.next_tier.resources).map(([n, q]) => { const have = foundry?.materials?.[n]?.quantity || 0; return <span key={n} style={{ color: have >= q ? '#a8b4c5' : '#f87171', display: 'block' }}>{q} {n} <span style={{ opacity: 0.6 }}>({fmt(have)})</span></span>; })}
                  </div>
                  {!(data.can_expand || base.next_tier.tech === 'tech_base_citadel') && base.next_tier.tech === 'tech_base_expansion' && <div style={{ color: '#f87171', fontSize: '0.74rem', marginTop: 4 }}>🔒 Research Base Expansion</div>}
                  <div style={{ marginTop: 8 }}><Btn disabled={busy || base.building} onClick={() => act(() => basesAPI.upgrade(base.id), `Upgrading to ${base.next_tier.name}`)}>UPGRADE</Btn></div>
                </Card>
              )}
              <Card accent="#4ade80">
                <Label right={base.depot.capacity > 0 ? `${fmt(Math.round(base.depot.used))} / ${fmt(base.depot.capacity)}` : 'no depot'}>depot</Label>
                <Meter value={base.depot.used} max={base.depot.capacity} color="#4ade80" />
              </Card>
              <Card title="MATERIALS ON HAND">
                {totalMats.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.75rem' }}>nothing in depot or cargo</div>}
                {totalMats.map(([name, m]) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', padding: '2px 0' }}>
                    <PixelItemIcon size={16} spec={resourceIconSpecByName(name, m.avg_quality)} />
                    <span style={{ flex: 1, color: '#c9d4e0' }}>{name}</span>
                    <span style={{ color: '#8fa3b8', fontFamily: FM }}>{fmt(m.quantity)} <span style={{ color: '#5a7080' }}>Q{m.avg_quality}</span></span>
                  </div>
                ))}
              </Card>
            </div>

            {/* CENTRE: plot grid */}
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', minHeight: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                {plots.map(area => (
                  <div key={area.tier} style={{ border: `1px solid ${area.unlocked ? EDGE : '#101a2c'}`, borderRadius: 4, padding: 8, background: area.unlocked ? 'rgba(4,8,16,0.5)' : 'rgba(4,8,16,0.25)', opacity: area.unlocked ? 1 : 0.55 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ color: area.unlocked ? GOLD.light : '#5a7080', fontWeight: 800, fontSize: '0.78rem', letterSpacing: 1 }}>{area.name.toUpperCase()} AREA</span>
                      <span style={{ color: '#5a7080', fontFamily: FM, fontSize: '0.68rem' }}>{area.unlocked ? `tier ${area.tier}` : `🔒 tier ${area.tier}`}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {area.slots.map(slot => {
                        const m = base.modules[slot];
                        const k = kindOf(m);
                        const st = foundry?.stations?.find(s => s.slot === slot);
                        const running = st?.jobs?.some(j => j.status === 'running'), ready = st?.jobs?.some(j => j.status === 'done');
                        const color = m ? (m.stats?.foundry ? familyColor(m.stats.foundry.family) : '#94a3b8') : '#1e293b';
                        const on = selected === slot;
                        return (
                          <div key={slot} onClick={() => area.unlocked && setSelected(slot)} title={m ? `${m.name} (${slot.toUpperCase()})` : area.unlocked ? `Empty plot ${slot.toUpperCase()}` : `Unlocks at ${area.name}`}
                               style={{ height: 78, borderRadius: 3, cursor: area.unlocked ? 'pointer' : 'not-allowed', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                                        background: m ? `linear-gradient(180deg, ${color}22, rgba(4,8,16,0.6))` : 'rgba(4,8,16,0.35)',
                                        border: `1px solid ${on ? '#67e8f9' : m ? color + '88' : '#1e293b'}`, boxShadow: on ? '0 0 8px #67e8f955' : ready ? `0 0 8px #4ade8066` : 'none' }}>
                            <span style={{ position: 'absolute', top: 2, left: 4, fontFamily: FM, fontSize: '0.6rem', color: '#5a7080' }}>{slot.toUpperCase()}</span>
                            {m ? (
                              <>
                                <PixelItemIcon size={30} spec={moduleIconSpec({ itemId: m.module_type_id, slotType: 'base', tier: m.tier, avgQuality: m.quality ? ((m.quality.purity + m.quality.stability + m.quality.potency + m.quality.density) / 4) : null })} />
                                <span style={{ fontSize: '0.66rem', fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color, textAlign: 'center', lineHeight: 1.05, maxWidth: 84, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                                <span style={{ position: 'absolute', top: 2, right: 4, fontSize: '0.58rem', fontFamily: FM, color: ready ? '#4ade80' : running ? GOLD.light : '#5a7080' }}>{ready ? 'READY' : running ? 'RUNNING' : k === 'station' ? 'idle' : KIND_ICON[k]}</span>
                              </>
                            ) : (
                              <span style={{ color: area.unlocked ? '#33475e' : '#22303f', fontFamily: FM, fontSize: '0.7rem' }}>{area.unlocked ? '+ build' : '—'}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {(data.others || []).length > 0 && (
                <Card accent="#5a7080" style={{ marginTop: 10 }} title={`OTHER BASES ON THIS PLANET · ${data.others.length}`}>
                  {data.others.map(o => <div key={o.id} style={{ fontSize: '0.76rem', color: '#a8b4c5' }}><b style={{ color: '#e2e8f0' }}>{o.name}</b> · {o.tier_name} · {o.owner_name}</div>)}
                </Card>
              )}
            </div>

            {/* RIGHT: selection */}
            <div style={{ width: 360, flexShrink: 0, overflowY: 'auto', minHeight: 0 }}>
              {!selected && (
                <Card accent={GOLD.pri} title="SELECT A PLOT">
                  <div style={{ color: '#8fa3b8', fontSize: '0.78rem', lineHeight: 1.45 }}>
                    Click a plot in the grid. Empty plots show what you can build; stations show their recipes and queue.
                    Every station makes something you fly with and the materials the next tier needs — you cannot climb one column alone.
                  </div>
                </Card>
              )}
              {selected && !selModule && (
                <EmptyPlotPanel base={base} slot={selected} data={data} busy={busy} act={act} openWindow={openWindow} setResearchTargetTech={setResearchTargetTech} setCraftingTargetRecipe={setCraftingTargetRecipe} />
              )}
              {selected && selModule && selKind === 'station' && <StationPanel base={base} slot={selected} module={selModule} foundry={foundry} reload={load} busy={busy} act={act} />}
              {selected && selModule && selKind === 'depot' && <DepotPanel base={base} data={data} busy={busy} act={act} />}
              {selected && selModule && selKind === 'refinery' && <Card accent={GOLD.pri} title="GRADE REFINERY"><div style={{ color: '#8fa3b8', fontSize: '0.74rem', marginBottom: 6 }}>Raises quality, never changes what a thing is.</div><RefineryPanel /></Card>}
              {selected && selModule && selKind === 'lab' && <Card accent="#22d3ee" title="RESEARCH LAB"><div style={{ color: '#8fa3b8', fontSize: '0.78rem' }}>+{selModule.stats?.rp_per_min} research points per minute while fitted. Stacks with more labs.</div></Card>}
              {selected && selModule && selKind === 'repair' && <RepairPanel base={base} module={selModule} />}
              {selected && selModule && selKind === 'other' && <Card title={selModule.name}><div style={{ color: '#8fa3b8', fontSize: '0.78rem' }}>{selModule.description || 'Fitted.'}</div></Card>}
              {selected && selModule && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <Btn small accent="#f87171" disabled={busy || base.building} title="Return this building to cargo" onClick={() => act(() => basesAPI.unfit(base.id, selected), `${selModule.name} returned to cargo`)}>UNFIT {selected.toUpperCase()}</Btn>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ModalOverlay>
  );
};

export default BaseWindow;
