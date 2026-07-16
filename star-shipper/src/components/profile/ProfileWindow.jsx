// ProfileWindow -- Social Multiplayer Step 4 (profile half).
// =============================================================
// Public profile of any pilot. Opened from:
//   - LeaderboardsWindow row click
//   - ChatPanel sender-name click
//
// Reads `profileTargetUserId` from the gameStore, fires
// `/api/profile/:userId` on change, renders identity + totals +
// ship classes flown + per-board ranks. Same data shape for self
// and others -- nothing in the response is strategic-secret.

import React, { useEffect, useState } from 'react';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useGameStore } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';
import { profileAPI } from '@/utils/api';
import presence from '@/utils/presence';
import trade from '@/utils/trade';
import { playSound } from '@/utils/audio';

const EDGE = '#1a3050';
const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const BLUE = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD = { light: '#fbbf24' };

const BOARD_META = {
  richest:   { icon: '💰', accent: '#fbbf24' },
  explorers: { icon: '🧭', accent: '#22d3ee' },
  trained:   { icon: '🧠', accent: '#a855f7' },
  active_7d: { icon: '⚡', accent: '#f97316' },
  crafters:  { icon: '⚒',  accent: '#60a5fa' },
};

const formatValue = (n) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(n >= 100_000 ? 0 : 1) + 'K';
  return n.toLocaleString();
};

const formatMemberSince = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  // Compact "Mar 2026" style; the exact day rarely matters and saves
  // visual weight in the header line.
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
};

const StatTile = ({ label, value, color = '#e2e8f0' }) => (
  <div style={{
    flex: 1,
    minWidth: 0,
    background: 'rgba(4,8,16,0.5)',
    border: `1px solid ${EDGE}`,
    borderRadius: 3,
    padding: '8px 10px',
  }}>
    <div style={{ fontSize: '0.5rem', color: '#475569', fontFamily: FM, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
      {label}
    </div>
    <div style={{ fontSize: '0.875rem', color, fontWeight: 800, fontFamily: F }}>
      {value}
    </div>
  </div>
);

export const ProfileWindow = () => {
  const targetUserId = useGameStore(s => s.profileTargetUserId);
  const clearTarget = useGameStore(s => s.clearProfileTargetUserId);
  const isOpen = useGameStore(s => s.windows.profile?.open);
  const myDockedBodyDbId = useGameStore(s => s.dockedBodyDbId);
  const myUserId = useAuthStore(s => s.user?.id) || null;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Re-render when our docked body's roster changes so the Trade
  // button enable/disable state stays live as the target docks/
  // undocks from the same body we're at.
  const [bodyTick, setBodyTick] = useState(0);
  useEffect(() => {
    if (!presence.isEnabled()) return;
    return presence.on('body_changed', ({ body_id }) => {
      if (body_id === myDockedBodyDbId) setBodyTick(t => t + 1);
    });
  }, [myDockedBodyDbId]);

  // Trade-button gating: enabled iff (a) we're docked, and (b) the
  // target is in the same body's docked roster.
  const targetCoDocked = (() => {
    if (!myDockedBodyDbId || !profile?.id) return false;
    if (profile.id === myUserId) return false; // can't trade with self
    return presence.getDockedPilots(myDockedBodyDbId).some(p => p.user_id === profile.id);
  })();
  // bodyTick is read so the closure above re-evaluates on roster changes.
  void bodyTick;

  const [tradeError, setTradeError] = useState(null);
  const handleTrade = async () => {
    if (!targetCoDocked || !profile?.id) return;
    playSound('button_click');
    setTradeError(null);
    try {
      await trade.invite(profile.id);
      // No window open here -- the server fires trade:opened to both
      // parties when the invitee accepts, and TradeWindow auto-opens
      // on that broadcast. For the inviter the experience is "Click
      // Trade -> wait for accept -> window appears."
    } catch (err) {
      // Surface "they already have a trade open" / similar 409s.
      setTradeError(err.message || 'Trade invite failed');
      setTimeout(() => setTradeError(null), 4000);
    }
  };

  // Fetch on target change. When the window closes, we keep the last
  // profile in memory so reopening the same pilot is instant; switching
  // to a different one swaps it.
  useEffect(() => {
    if (!targetUserId || !isOpen) return;
    if (profile?.id === targetUserId) return; // already loaded
    setLoading(true);
    setError(null);
    setProfile(null);
    profileAPI.get(targetUserId)
      .then(p => setProfile(p))
      .catch(err => setError(err.message || 'Failed to load profile'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId, isOpen]);

  // Clear the deep-link target when the window closes so the next
  // open() call always re-fires the fetch (covers the case of "close
  // window, do something, reopen on the same pilot, see fresh data").
  useEffect(() => {
    if (!isOpen) clearTarget();
  }, [isOpen, clearTarget]);

  const isSelf = profile && profile.id === myUserId;

  return (
    <ModalOverlay windowId="profile" title="Pilot Profile" icon="👤" accent={BLUE.light} width={580}>
      <div style={{
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 320,
      }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: '0.75rem', fontFamily: F }}>
            Loading profile...
          </div>
        )}
        {error && !loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: '0.75rem', fontFamily: F }}>
            {error}
          </div>
        )}
        {profile && !loading && !error && (
          <>
            {/* Identity */}
            <div style={{
              background: `linear-gradient(135deg, ${BLUE.pri}1c, transparent)`,
              border: `1px solid ${BLUE.dim}`,
              borderRadius: 3,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 24,
                background: `linear-gradient(135deg, ${BLUE.pri}, ${BLUE.dim})`,
                border: `1px solid ${BLUE.light}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.375rem', flexShrink: 0,
              }}>👤</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#e2e8f0', fontFamily: F }}>
                  {profile.corp?.ticker && (
                    <span style={{ color: GOLD.light, fontFamily: FM, marginRight: 6 }}>
                      [{profile.corp.ticker}]
                    </span>
                  )}
                  CMDR {profile.username}
                  {isSelf && (
                    <span style={{ color: BLUE.light, marginLeft: 8, fontSize: '0.8rem', fontFamily: FM, fontWeight: 700 }}>
                      (YOU)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: BLUE.light, fontFamily: FM, letterSpacing: 1 }}>
                  Member since {formatMemberSince(profile.member_since)}
                  {profile.corp && (
                    <>
                      <span style={{ color: '#3a4a5a', margin: '0 6px' }}>·</span>
                      <span style={{ color: GOLD.light }}>{profile.corp.role}</span>
                      <span style={{ color: '#7a8a9a' }}> of </span>
                      <span style={{ color: '#cbd5e1', fontFamily: F, fontWeight: 700 }}>{profile.corp.name}</span>
                    </>
                  )}
                </div>
              </div>
              {/* Trade button -- only shown for other pilots. Enabled
                  iff both pilots are docked at the same body. The
                  disabled-state tooltip explains the gate so the
                  player isn't left guessing. */}
              {!isSelf && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={handleTrade}
                    disabled={!targetCoDocked}
                    title={targetCoDocked
                      ? `Trade with ${profile.username}`
                      : (!myDockedBodyDbId
                          ? 'You must be docked at a station/body to trade'
                          : `${profile.username} is not docked here`)}
                    style={{
                      padding: '8px 14px',
                      background: targetCoDocked ? `${GOLD.light}22` : 'rgba(20,30,50,0.4)',
                      border: `1px solid ${targetCoDocked ? GOLD.light + '88' : EDGE}`,
                      color: targetCoDocked ? GOLD.light : '#475569',
                      fontSize: '0.6875rem',
                      fontFamily: F,
                      fontWeight: 800,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      cursor: targetCoDocked ? 'pointer' : 'not-allowed',
                      borderRadius: 3,
                    }}
                  >
                    🤝 Trade
                  </button>
                  {tradeError && (
                    <span style={{ fontSize: '0.8rem', color: '#f87171', fontFamily: FM, maxWidth: 140, textAlign: 'right' }}>
                      {tradeError}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Totals */}
            <div style={{ display: 'flex', gap: 8 }}>
              <StatTile label="Skills Trained" value={profile.totals.skills_trained} color={BLUE.light} />
              <StatTile label="Systems Discovered" value={profile.totals.systems_discovered} color="#22d3ee" />
              <StatTile label="Ships Owned" value={profile.totals.ships_owned} />
              <StatTile label="Credits" value={`⬡ ${formatValue(profile.totals.credits)}`} color={GOLD.light} />
            </div>

            {/* Ship classes flown */}
            <div>
              <div style={{
                fontSize: '0.8rem', color: '#475569', fontFamily: FM, letterSpacing: 1,
                textTransform: 'uppercase', marginBottom: 6,
              }}>
                Ship Classes Flown
              </div>
              {profile.ship_classes.length === 0 ? (
                <div style={{
                  background: 'rgba(4,8,16,0.5)',
                  border: `1px solid ${EDGE}`,
                  borderRadius: 3,
                  padding: '10px 12px',
                  fontSize: '0.6875rem', color: '#475569', fontFamily: F, fontStyle: 'italic',
                }}>
                  No ships owned yet.
                </div>
              ) : (
                <div style={{
                  background: 'rgba(4,8,16,0.5)',
                  border: `1px solid ${EDGE}`,
                  borderRadius: 3,
                  padding: '6px 10px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}>
                  {profile.ship_classes.map(c => (
                    <span key={c.name} style={{
                      padding: '4px 10px',
                      background: `${BLUE.pri}18`,
                      border: `1px solid ${BLUE.dim}`,
                      borderRadius: 2,
                      fontSize: '0.8rem',
                      fontFamily: FM,
                      color: BLUE.light,
                    }}>
                      {c.name}
                      {c.count > 1 && (
                        <span style={{ color: '#475569', marginLeft: 6 }}>×{c.count}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Leaderboard ranks */}
            <div>
              <div style={{
                fontSize: '0.8rem', color: '#475569', fontFamily: FM, letterSpacing: 1,
                textTransform: 'uppercase', marginBottom: 6,
              }}>
                Leaderboard Ranks
              </div>
              <div style={{
                background: 'rgba(4,8,16,0.5)',
                border: `1px solid ${EDGE}`,
                borderRadius: 3,
                padding: '4px 0',
              }}>
                {profile.ranks.map(r => {
                  const meta = BOARD_META[r.type] || { icon: '◆', accent: BLUE.light };
                  return (
                    <div key={r.type} style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 1fr 80px 80px',
                      alignItems: 'center',
                      padding: '6px 12px',
                      fontSize: '0.6875rem',
                      fontFamily: FM,
                      borderBottom: `1px solid rgba(26,48,80,0.2)`,
                    }}>
                      <span style={{ fontSize: '0.8125rem' }}>{meta.icon}</span>
                      <span style={{ color: '#cbd5e1', fontFamily: F, fontWeight: 600 }}>
                        {r.title}
                      </span>
                      <span style={{
                        color: r.rank ? GOLD.light : '#475569',
                        fontWeight: 800,
                        textAlign: 'right',
                        fontStyle: r.rank ? 'normal' : 'italic',
                      }}>
                        {r.rank ? `#${r.rank}` : 'unranked'}
                      </span>
                      <span style={{ color: '#94a3b8', textAlign: 'right' }}>
                        {formatValue(r.value)}
                        {r.value_suffix && (
                          <span style={{ color: '#3a4a5a', marginLeft: 3, fontSize: '0.8rem' }}>
                            {r.value_suffix}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </ModalOverlay>
  );
};

export default ProfileWindow;
