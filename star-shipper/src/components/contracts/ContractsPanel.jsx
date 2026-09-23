// ContractsPanel.jsx -- station Contracts sub-tab (hauling v1, 2026-09-22).
// docs/contracts-spec.md. Board = the docked port's procedural offers;
// My Contracts = what I'm carrying. The server decides everything; this
// panel only shows the numbers it returns and disables what can't happen.

import React, { useEffect, useState } from 'react';
import { contractsAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';
import { useGameStore } from '@/stores/gameStore';
import { tierColor, tierLabel } from '@/utils/tiers';

const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const EDGE = '#1a3050';
const GOLD = { pri: '#f59e0b', light: '#fbbf24' };

const fmt = (n) => Number(n || 0).toLocaleString();
const minutesLeft = (iso) => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
const normName = (s) => String(s || '').trim().toLowerCase();

const Btn = ({ children, onClick, disabled, accent = GOLD.pri, title }) => (
  <button onClick={onClick} disabled={disabled} title={title} style={{
    padding: '5px 10px', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'rgba(4,8,16,0.4)' : `${accent}22`,
    border: `1px solid ${disabled ? EDGE : accent + '88'}`,
    color: disabled ? '#3a5060' : accent, fontFamily: F, fontWeight: 700, fontSize: '0.8rem', letterSpacing: 0.5,
    whiteSpace: 'nowrap',
  }}>{children}</button>
);

const Row = ({ children, accent = EDGE }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', marginBottom: 5,
    background: 'rgba(4,8,16,0.55)', border: `1px solid ${EDGE}`, borderLeft: `3px solid ${accent}`, borderRadius: 3,
  }}>{children}</div>
);

export const ContractsPanel = ({ body }) => {
  const currentSystem = useGameStore(s => s.currentSystem);
  const pushToast = useGameStore(s => s.pushToast);
  const fetchCredits = useGameStore(s => s.fetchCredits);
  const bumpContracts = useGameStore(s => s.bumpContracts);
  const flash = (kind, text) => pushToast && pushToast({ kind, text });

  const [board, setBoard] = useState(null);
  const [boardError, setBoardError] = useState(null);
  const [mine, setMine] = useState({ contracts: [], limits: null });
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = async () => {
    try { setBoard(await contractsAPI.board()); setBoardError(null); }
    catch (e) { setBoard(null); setBoardError(e.message || 'Board unavailable'); }
    try { setMine(await contractsAPI.mine()); } catch (e) {}
  };
  useEffect(() => { load(); }, [body?.id]);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 15000); return () => clearInterval(t); }, []);

  const accept = async (key) => {
    if (busy) return;
    setBusy(true);
    try {
      playSound('button_click');
      const r = await contractsAPI.accept(key);
      flash('success', `Contract accepted — deliver to ${r.contract.dest_station} (${r.contract.dest_system_name}) within ${minutesLeft(r.contract.deadline_at)} min`);
      if (r.contract.contested) flash('warning', 'This cargo is contested — expect raiders on the route');
      if (bumpContracts) bumpContracts();
      await load();
    } catch (e) { flash('error', e.message || 'Could not accept'); }
    finally { setBusy(false); }
  };
  const deliver = async (id) => {
    if (busy) return;
    setBusy(true);
    try {
      playSound('button_click');
      const r = await contractsAPI.deliver(id);
      if (r.failed) flash('error', `Delivery failed — ${r.why}`);
      else flash('success', `Delivered! +${fmt(r.payout)} CR`);
      if (fetchCredits) fetchCredits();
      if (bumpContracts) bumpContracts();
      await load();
    } catch (e) { flash('error', e.message || 'Could not deliver'); }
    finally { setBusy(false); }
  };
  const abandon = async (id) => {
    if (busy) return;
    if (!window.confirm('Abandon this contract? The freight is forfeited.')) return;
    setBusy(true);
    try { await contractsAPI.abandon(id); flash('info', 'Contract abandoned'); if (bumpContracts) bumpContracts(); await load(); }
    catch (e) { flash('error', e.message || 'Could not abandon'); }
    finally { setBusy(false); }
  };

  const limits = board?.limits || mine.limits;
  const active = mine.contracts.filter(c => c.status === 'active');
  const recent = mine.contracts.filter(c => c.status !== 'active');
  const hereName = normName(body?.name);

  return (
    <div style={{ fontFamily: F }}>
      {/* ---- My contracts ---- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ color: GOLD.light, fontWeight: 800, letterSpacing: 1, fontSize: '0.85rem' }}>MY CONTRACTS</div>
        {limits && (
          <div style={{ color: '#5a7080', fontSize: '0.75rem', fontFamily: FM }}>
            {limits.active_count}/{limits.active_cap} active · tier cap {tierLabel(limits.tier_cap)} · train Contracting for more
          </div>
        )}
      </div>
      {active.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.8rem', marginBottom: 10 }}>No active contracts.</div>}
      {active.map(c => {
        const here = c.dest_system_id === currentSystem && normName(c.dest_station) === hereName;
        const left = minutesLeft(c.deadline_at);
        const isFetch = c.contract_type === 'fetch';
        const enough = isFetch ? (c.have_qualifying || 0) >= c.cargo_volume : (c.freight_units == null || c.freight_units >= c.cargo_volume);
        const freightLost = !isFetch && c.freight_units != null && c.freight_units < c.cargo_volume;
        return (
          <Row key={c.id} accent={here && enough ? '#22c55e' : tierColor(c.tier)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>
                {isFetch ? '⛏' : '📦'} {isFetch ? `Bring ${c.cargo_volume} × ${c.cargo_label}` : c.cargo_label}
                {!isFetch && <span style={{ color: '#5a7080', fontFamily: FM, fontSize: '0.75rem' }}> ×{c.cargo_volume}</span>}
                {isFetch && c.fetch_min_quality > 0 && <span style={{ color: '#8fa3b8', fontFamily: FM, fontSize: '0.75rem' }}> Q{c.fetch_min_quality}+</span>}
                {c.rush && <span style={{ color: '#f87171', fontSize: '0.7rem', marginLeft: 6 }}>RUSH</span>}
                {c.contested && <span style={{ color: '#f87171', fontSize: '0.7rem', marginLeft: 6 }}>CONTESTED</span>}
              </div>
              <div style={{ color: '#8fa3b8', fontSize: '0.78rem', fontFamily: FM }}>
                {isFetch
                  ? <>turn in at {c.dest_station}, {c.dest_system_name} · <span style={{ color: enough ? '#4ade80' : '#a0b0c0' }}>have {c.have_qualifying || 0}/{c.cargo_volume}</span> · </>
                  : <>→ {c.dest_station}, {c.dest_system_name} · {c.hops} hop{c.hops === 1 ? '' : 's'} · {freightLost && <span style={{ color: '#f87171' }}>freight lost — reclaim your wreck · </span>}</>}
                <span style={{ color: left < 3 ? '#f87171' : '#a0b0c0' }}>{left} min left</span> · {fmt(c.reward)} CR
              </div>
            </div>
            {here && enough
              ? <Btn accent="#22c55e" onClick={() => deliver(c.id)} disabled={busy}>{isFetch ? 'TURN IN' : 'DELIVER HERE'}</Btn>
              : <Btn onClick={() => abandon(c.id)} disabled={busy} accent="#f87171">ABANDON</Btn>}
          </Row>
        );
      })}
      {recent.length > 0 && (
        <div style={{ color: '#4a6580', fontSize: '0.75rem', fontFamily: FM, marginBottom: 10 }}>
          {recent.map(c => (
            <div key={c.id}>{c.status.toUpperCase()} · {c.cargo_label} → {c.dest_station}{c.payout ? ` · +${fmt(c.payout)} CR` : ''}</div>
          ))}
        </div>
      )}

      {/* ---- Board ---- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '12px 0 6px' }}>
        <div style={{ color: GOLD.light, fontWeight: 800, letterSpacing: 1, fontSize: '0.85rem' }}>
          CONTRACT BOARD{board?.port ? ` · ${board.port.station.toUpperCase()}` : ''}
        </div>
        {board?.board_expires_at && (
          <div style={{ color: '#5a7080', fontSize: '0.75rem', fontFamily: FM }}>
            refreshes in {minutesLeft(board.board_expires_at)} min · {board.limits.cargo_remaining} cargo free
          </div>
        )}
      </div>
      {boardError && <div style={{ color: '#f87171', fontSize: '0.8rem' }}>{boardError}</div>}
      {board && board.offers.length === 0 && <div style={{ color: '#4a6580', fontSize: '0.8rem' }}>No offers right now.</div>}
      {board?.offers.map(o => {
        const tierLocked = o.tier > board.limits.tier_cap;
        const full = board.limits.active_count >= board.limits.active_cap;
        const isFetch = o.contract_type === 'fetch';
        const noRoom = !isFetch && board.limits.cargo_remaining < o.volume;
        const reason = o.held ? 'Already accepted' : tierLocked ? `Needs Contracting ${o.tier - 1}` : full ? 'Contract limit reached' : noRoom ? `Needs ${o.volume} free cargo` : null;
        const left = minutesLeft(new Date(Date.now() + o.deadline_minutes * 60000).toISOString());
        return (
          <Row key={o.contract_key} accent={tierColor(o.tier)}>
            <div style={{ width: 22, textAlign: 'center', color: tierColor(o.tier), fontWeight: 800, fontFamily: FM }}>{tierLabel(o.tier)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem' }}>
                {isFetch ? `⛏ Bring ${o.volume} × ${o.cargo_label}` : o.cargo_label}
                {!isFetch && <span style={{ color: '#5a7080', fontFamily: FM, fontSize: '0.75rem' }}> ×{o.volume}</span>}
                {isFetch && o.fetch_min_quality > 0 && <span style={{ color: '#8fa3b8', fontFamily: FM, fontSize: '0.75rem' }}> Q{o.fetch_min_quality}+</span>}
                {o.rush && <span style={{ color: '#f87171', fontSize: '0.7rem', marginLeft: 6 }}>RUSH</span>}
                {o.contested && <span style={{ color: '#f87171', fontSize: '0.7rem', marginLeft: 6 }} title="Raiders will ambush you on the route. Pay x1.5.">CONTESTED</span>}
              </div>
              <div style={{ color: '#8fa3b8', fontSize: '0.78rem', fontFamily: FM }}>
                {isFetch
                  ? <>turn in here · {o.unit_pay} CR/unit · you have {o.have_qualifying || 0} · {left} min</>
                  : <>→ {o.dest_station}, {o.dest_system_name} · {o.hops} hop{o.hops === 1 ? '' : 's'} · danger {'★'.repeat(o.danger_tier)} · {left} min</>}
              </div>
            </div>
            <div style={{ color: GOLD.light, fontWeight: 800, fontFamily: FM, fontSize: '0.9rem', minWidth: 70, textAlign: 'right' }}>{fmt(o.reward)} CR</div>
            <Btn onClick={() => accept(o.contract_key)} disabled={busy || !!reason} title={reason || ''}>{o.held ? 'HELD' : 'ACCEPT'}</Btn>
          </Row>
        );
      })}
    </div>
  );
};

export default ContractsPanel;
