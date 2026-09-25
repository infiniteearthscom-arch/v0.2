// AnomaliesWindow.jsx -- "Signals": cosmic signatures in the current
// system (2026-09-23). docs/anomalies-spec.md. Probe a site over several
// cycles, fly to the pinned position, investigate. The server rolls the
// rewards and (for guarded sites) hands back a raider fleet that
// SystemView spawns via store.pendingAmbush.

import React, { useEffect, useState } from 'react';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { useGameStore } from '@/stores/gameStore';
import { anomaliesAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';
import { tierColor, tierLabel } from '@/utils/tiers';

const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const EDGE = '#1a3050';
const CYAN = { pri: '#22d3ee', light: '#67e8f9' };
const secsLeft = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

const Btn = ({ children, onClick, disabled, accent = CYAN.pri, title }) => (
  <button onClick={onClick} disabled={disabled} title={title} style={{
    padding: '5px 10px', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'rgba(4,8,16,0.4)' : `${accent}22`, border: `1px solid ${disabled ? EDGE : accent + '88'}`,
    color: disabled ? '#3a5060' : accent, fontFamily: F, fontWeight: 700, fontSize: '0.78rem', letterSpacing: 0.5, whiteSpace: 'nowrap',
  }}>{children}</button>
);

export const AnomaliesWindow = () => {
  const isOpen = useGameStore(s => s.windows.anomalies?.open);
  const currentSystem = useGameStore(s => s.currentSystem);
  const shipPosition = useGameStore(s => s.shipPosition);
  const setAutopilotTarget = useGameStore(s => s.setAutopilotTarget);
  const setAnomalySites = useGameStore(s => s.setAnomalySites);
  const setPendingAmbush = useGameStore(s => s.setPendingAmbush);
  const pushToast = useGameStore(s => s.pushToast);
  const fetchCredits = useGameStore(s => s.fetchCredits);
  const fetchCargoInfo = useGameStore(s => s.fetchCargoInfo);
  const flash = (kind, text) => pushToast && pushToast({ kind, text, duration: 6000 });

  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = async () => {
    if (!currentSystem) return;
    try { const r = await anomaliesAPI.system(currentSystem); setData(r); setErr(null); if (setAnomalySites) setAnomalySites(r.sites || []); }
    catch (e) { setErr(e.message || 'Unavailable'); }
  };
  useEffect(() => { if (isOpen) load(); }, [isOpen, currentSystem]);
  useEffect(() => { if (!isOpen) return undefined; const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, [isOpen]);

  const probe = async (site) => {
    if (busy) return; setBusy(true);
    try {
      playSound('probe_ping');
      const r = await anomaliesAPI.probe(currentSystem, site.index);
      flash(r.pinned ? 'success' : 'info', r.pinned ? `${site.name} pinned — fly to it` : `Probe cycle ${r.done}/${r.site?.cycles_needed || 3} — circle tightened`);
      await load();
    } catch (e) { flash('error', e.message || 'Probe failed'); }
    finally { setBusy(false); }
  };
  const flyTo = (site) => {
    if (!site.position || !setAutopilotTarget) return;
    playSound('button_click');
    setAutopilotTarget({ id: `anomaly_${site.index}`, type: 'anomaly', name: site.name, x: site.position.x, y: site.position.y });
  };
  const investigate = async (site) => {
    if (busy) return; setBusy(true);
    try {
      playSound('button_click');
      const r = await anomaliesAPI.resolve(currentSystem, site.index, shipPosition?.x ?? 0, shipPosition?.y ?? 0);
      const a = r.awarded || {};
      const parts = [];
      if (a.credits) parts.push(`+${a.credits.toLocaleString()} CR`);
      if (a.rp) parts.push(`+${a.rp} RP`);
      for (const x of (a.resources || [])) parts.push(`${x.quantity} ${x.name} Q${x.quality}`);
      for (const m of (a.modules || [])) parts.push(`★ ${m.name} Q${m.quality}`);
      flash('success', `${site.name}: ${parts.join(' · ') || 'nothing of value'}`);
      if (r.ambush && setPendingAmbush) setPendingAmbush({ ...r.ambush, label: site.name });
      if (fetchCredits) fetchCredits(); if (fetchCargoInfo) fetchCargoInfo();
      await load();
    } catch (e) { flash('error', e.message || 'Investigation failed'); }
    finally { setBusy(false); }
  };

  const dist = (site) => site.position ? Math.hypot((shipPosition?.x ?? 0) - site.position.x, (shipPosition?.y ?? 0) - site.position.y) : null;

  return (
    <ContextPanel windowId="anomalies" title="Signals" icon="🔭" accent={CYAN.pri} width={520}>
      <div style={{ fontFamily: F, color: '#e2e8f0' }}>
        {err && <div style={{ color: '#f87171', fontSize: '0.85rem' }}>{err}</div>}
        {!data && !err && <div style={{ color: '#4a6580' }}>Listening…</div>}
        {data && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ color: CYAN.light, fontWeight: 800, letterSpacing: 1, fontSize: '0.85rem' }}>
                {data.sites.length} SIGNATURE{data.sites.length === 1 ? '' : 'S'} IN THIS SYSTEM
              </div>
              <div style={{ color: '#5a7080', fontSize: '0.75rem', fontFamily: FM }}>
                refresh in {Math.max(0, Math.round((new Date(data.refreshes_at).getTime() - Date.now()) / 3600000))} h
                {data.has_launcher ? ` · probe cycle ${data.cycle_seconds}s` : ''}
              </div>
            </div>
            {!data.has_launcher && (
              <div style={{ color: '#fbbf24', fontSize: '0.8rem', marginBottom: 8, padding: 8, border: '1px solid #fbbf2455', borderRadius: 3 }}>
                🔒 Fit a <b>Signature Probe Launcher</b> (research Signature Analysis) to probe these signatures.
              </div>
            )}
            {data.sites.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.85rem' }}>Nothing on the band. Deeper regions hide more.</div>}
            {data.sites.map(site => {
              const d = dist(site);
              const near = d != null && d <= (data.investigate_range || 90);
              const wait = site.next_probe_at ? secsLeft(site.next_probe_at) : 0;
              const accent = site.resolved ? '#3a5060' : tierColor(site.tier);
              return (
                <div key={site.index} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', marginBottom: 5, background: 'rgba(4,8,16,0.55)', border: `1px solid ${EDGE}`, borderLeft: `3px solid ${accent}`, borderRadius: 3, opacity: site.resolved ? 0.55 : 1 }}>
                  <div style={{ fontSize: '1.1rem', color: accent, width: 22, textAlign: 'center' }}>{site.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      {site.name} <span style={{ color: tierColor(site.tier), fontFamily: FM, fontSize: '0.75rem' }}>T{tierLabel(site.tier)}</span>
                      {site.guarded && <span style={{ color: '#f87171', fontSize: '0.7rem', marginLeft: 6 }} title="Raiders will respond when you investigate">⚠ GUARDED</span>}
                    </div>
                    <div style={{ color: '#8fa3b8', fontSize: '0.78rem', fontFamily: FM }}>
                      {site.resolved ? 'investigated'
                        : site.pinned ? `pinned at ${site.position.x}, ${site.position.y}${d != null ? ` · ${Math.round(d)} units away` : ''}`
                        : site.estimate ? `probing ${site.cycles_done}/${site.cycles_needed} · circle ±${site.estimate.radius}`
                        : `unprobed · ${site.cycles_needed} cycles to pin`}
                    </div>
                  </div>
                  {!site.resolved && !site.pinned && (
                    <Btn disabled={busy || !data.has_launcher || wait > 0} onClick={() => probe(site)}>{wait > 0 ? `PROBE ${wait}s` : 'PROBE'}</Btn>
                  )}
                  {!site.resolved && site.pinned && !near && <Btn onClick={() => flyTo(site)} disabled={busy}>FLY TO</Btn>}
                  {!site.resolved && site.pinned && near && <Btn accent="#4ade80" onClick={() => investigate(site)} disabled={busy}>INVESTIGATE</Btn>}
                </div>
              );
            })}
          </>
        )}
      </div>
    </ContextPanel>
  );
};

export default AnomaliesWindow;
