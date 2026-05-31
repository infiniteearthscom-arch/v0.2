// TradeInviteToast -- Social Multiplayer Step 5 Phase 2.
// =============================================================
// Top-right toast that appears when an incoming trade invite arrives.
// 30-second auto-dismiss countdown bar (matches the server-side
// PENDING_TIMEOUT_MS). Self-hides when accepted, rejected, or expired.

import React, { useEffect, useState } from 'react';
import trade from '@/utils/trade';
import { playSound } from '@/utils/audio';

const INVITE_TIMEOUT_MS = 30 * 1000;

const EDGE = '#1a3050';
const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const GREEN = { pri: '#22c55e', light: '#4ade80' };
const RED = { pri: '#ef4444', light: '#f87171' };
const GOLD = { light: '#fbbf24' };

export const TradeInviteToast = () => {
  const [invite, setInvite] = useState(() => trade.getPendingInvite?.() || null);

  // Tick every 250ms while the toast is up so the countdown bar
  // animates smoothly without committing to an animation lib.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    if (!invite) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [invite]);

  useEffect(() => {
    if (!trade.isEnabled()) return;
    trade.ensureReady();
    setInvite(trade.getPendingInvite());
    const unsubs = [
      trade.on('invite',         (p) => { setInvite(p); playSound('button_click'); }),
      trade.on('invite_cleared', () => setInvite(null)),
      trade.on('opened',         () => setInvite(null)),
      trade.on('cancelled',      () => setInvite(null)),
    ];
    return () => unsubs.forEach(u => u && u());
  }, []);

  // Local-side timeout fallback. The server fires its own cancel at
  // 30s and broadcasts trade:cancelled, but if the broadcast is lost
  // we still want the toast to disappear.
  useEffect(() => {
    if (!invite) return;
    const t = setTimeout(() => setInvite(null), INVITE_TIMEOUT_MS + 1000);
    return () => clearTimeout(t);
  }, [invite]);

  if (!trade.isEnabled() || !invite) return null;

  const elapsed = Math.min(INVITE_TIMEOUT_MS, Date.now() - (invite._receivedAt = invite._receivedAt || Date.now()));
  const remainPct = Math.max(0, 1 - elapsed / INVITE_TIMEOUT_MS);
  const remainSec = Math.max(0, Math.ceil((INVITE_TIMEOUT_MS - elapsed) / 1000));

  const handleAccept = async () => {
    playSound('button_click');
    try { await trade.accept(invite.trade_id); }
    catch (err) { console.warn('accept failed', err); setInvite(null); }
  };
  const handleReject = async () => {
    playSound('button_click');
    try { await trade.reject(invite.trade_id); }
    catch (err) { console.warn('reject failed', err); setInvite(null); }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 70,
      right: 12,
      width: 300,
      background: 'rgba(8,14,28,0.97)',
      border: `1px solid ${GOLD.light}55`,
      borderRadius: 4,
      boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
      padding: '10px 12px',
      fontFamily: F,
      zIndex: 55,
    }}>
      {/* Countdown bar across the top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: '#0a1528',
      }}>
        <div style={{
          width: `${remainPct * 100}%`, height: '100%',
          background: `linear-gradient(90deg, ${GOLD.light}, #fb7185)`,
          transition: 'width 250ms linear',
        }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: 2 }}>
        <span style={{ fontSize: 16 }}>🤝</span>
        <span style={{
          fontSize: 10, color: GOLD.light, fontWeight: 800,
          letterSpacing: 1, textTransform: 'uppercase', flex: 1,
        }}>Trade Invite</span>
        <span style={{ fontSize: 9, color: '#475569', fontFamily: FM }}>{remainSec}s</span>
      </div>

      <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 10 }}>
        <span style={{ color: GOLD.light, fontWeight: 700 }}>{invite.from_name}</span>
        <span style={{ color: '#94a3b8' }}> wants to trade.</span>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleAccept}
          style={{
            flex: 1,
            padding: '6px 8px',
            background: `${GREEN.pri}22`,
            border: `1px solid ${GREEN.pri}88`,
            color: GREEN.light,
            fontSize: 10, fontFamily: F, fontWeight: 800, letterSpacing: 1,
            textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
          }}
        >Accept</button>
        <button
          onClick={handleReject}
          style={{
            flex: 1,
            padding: '6px 8px',
            background: `${RED.pri}1c`,
            border: `1px solid ${RED.pri}66`,
            color: RED.light,
            fontSize: 10, fontFamily: F, fontWeight: 800, letterSpacing: 1,
            textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
          }}
        >Reject</button>
      </div>
    </div>
  );
};

export default TradeInviteToast;
