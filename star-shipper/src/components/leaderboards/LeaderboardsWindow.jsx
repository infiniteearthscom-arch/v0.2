// LeaderboardsWindow -- Social Multiplayer Step 4 (boards half).
// =============================================================
// Modal showing 5 galaxy-wide leaderboards. Each board is fetched
// on-demand when its tab is selected; results cached per tab in
// React state until the window closes. No live updates -- player
// clicks a tab, sees the current snapshot, can refresh manually.
//
// Future: row click -> open public profile (Step 4 second half).

import React, { useEffect, useMemo, useState } from 'react';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { leaderboardsAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';

const EDGE = '#1a3050';
const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const GOLD = { light: '#fbbf24', dim: '#854d0e' };
const BLUE = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };

// Display order locked here so the tab strip is stable across page
// loads regardless of the server's iteration order on /leaderboards.
// Any board the server adds that isn't in this list still surfaces
// (appended at the end); any board in this list that the server
// doesn't return is silently dropped.
const PREFERRED_ORDER = ['richest', 'explorers', 'trained', 'active_7d', 'crafters'];

// Per-board accent + icon. Falls back to neutral cyan if the server
// adds a board type the client doesn't have metadata for yet.
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

// Sort the server's catalog by PREFERRED_ORDER, appending anything
// new to the end.
const orderBoards = (boards) => {
  const byType = Object.fromEntries(boards.map(b => [b.type, b]));
  const ordered = [];
  for (const t of PREFERRED_ORDER) if (byType[t]) { ordered.push(byType[t]); delete byType[t]; }
  for (const b of boards) if (byType[b.type]) ordered.push(b);
  return ordered;
};

export const LeaderboardsWindow = () => {
  const myUserId = useAuthStore(s => s.user?.id) || null;
  const openProfile = useGameStore(s => s.openProfile);
  const [boards, setBoards] = useState(null); // catalog
  const [active, setActive] = useState(null); // selected board type
  // Per-type cache. Each entry: { entries, your_rank, your_value, generated_at, loading?, error? }
  const [data, setData] = useState({});

  // Fetch catalog on mount. The window is mounted inside GameFrame
  // regardless of open/closed state -- ModalOverlay short-circuits
  // the render when closed -- so the catalog fetch only runs once
  // per session even if the user opens/closes the window repeatedly.
  useEffect(() => {
    let cancelled = false;
    leaderboardsAPI.list()
      .then(({ boards }) => {
        if (cancelled) return;
        const ordered = orderBoards(boards || []);
        setBoards(ordered);
        if (ordered.length > 0 && !active) setActive(ordered[0].type);
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('leaderboards catalog fetch failed', err);
        setBoards([]);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the active board's data when it changes (or on manual
  // refresh). Cached after first fetch so re-clicking a tab is instant.
  const fetchBoard = (type, force = false) => {
    if (!type) return;
    if (!force && data[type]?.entries) return; // already cached
    setData(d => ({ ...d, [type]: { ...(d[type] || {}), loading: true, error: null } }));
    leaderboardsAPI.get(type, 25)
      .then(payload => {
        setData(d => ({ ...d, [type]: { ...payload, loading: false } }));
      })
      .catch(err => {
        console.warn('leaderboard fetch failed', type, err);
        setData(d => ({ ...d, [type]: { ...(d[type] || {}), loading: false, error: err.message || 'Failed to load' } }));
      });
  };

  useEffect(() => { fetchBoard(active); /* eslint-disable-next-line */ }, [active]);

  const handleTab = (type) => {
    if (type === active) return;
    playSound('button_click');
    setActive(type);
  };

  const board = useMemo(() => (boards || []).find(b => b.type === active), [boards, active]);
  const state = active ? data[active] : null;

  return (
    <ModalOverlay windowId="leaderboards" title="Leaderboards" icon="🏆" accent={GOLD.light}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {/* Tab strip */}
        <div style={{
          display: 'flex',
          gap: 2,
          padding: '8px 12px 0',
          borderBottom: `1px solid ${EDGE}`,
          background: 'rgba(8,14,28,0.6)',
          flexShrink: 0,
        }}>
          {(boards || []).map(b => {
            const meta = BOARD_META[b.type] || { icon: '◆', accent: BLUE.light };
            const isActive = b.type === active;
            return (
              <button
                key={b.type}
                onClick={() => handleTab(b.type)}
                style={{
                  padding: '8px 14px',
                  background: isActive ? `${meta.accent}1c` : 'transparent',
                  borderTop: `1px solid ${isActive ? meta.accent : 'transparent'}`,
                  borderLeft: `1px solid ${isActive ? EDGE : 'transparent'}`,
                  borderRight: `1px solid ${isActive ? EDGE : 'transparent'}`,
                  borderBottom: isActive ? '1px solid transparent' : `1px solid ${EDGE}`,
                  marginBottom: -1,
                  color: isActive ? meta.accent : '#7a8a9a',
                  fontSize: 11,
                  fontFamily: F,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 13 }}>{meta.icon}</span>
                <span>{b.title}</span>
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          {state && !state.loading && (
            <button
              onClick={() => { playSound('button_click'); fetchBoard(active, true); }}
              title="Refresh"
              style={{
                background: 'transparent',
                border: `1px solid ${EDGE}`,
                color: '#7a8a9a',
                padding: '4px 10px',
                fontSize: 10,
                fontFamily: FM,
                cursor: 'pointer',
                borderRadius: 3,
                marginBottom: 6,
                alignSelf: 'center',
              }}
            >↻ Refresh</button>
          )}
        </div>

        {/* Body: ranked list */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
        }}>
          {!boards && (
            <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 11, fontFamily: F }}>
              Loading boards...
            </div>
          )}
          {boards && boards.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 11, fontFamily: F }}>
              No leaderboards available.
            </div>
          )}
          {board && state?.loading && (
            <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 11, fontFamily: F }}>
              Loading {board.title}...
            </div>
          )}
          {board && state?.error && (
            <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 11, fontFamily: F }}>
              {state.error}
            </div>
          )}
          {board && state && !state.loading && !state.error && (
            <BoardTable
              board={board}
              entries={state.entries || []}
              yourRank={state.your_rank}
              yourValue={state.your_value}
              myUserId={myUserId}
              onOpenProfile={(userId) => { playSound('button_click'); openProfile(userId); }}
            />
          )}
        </div>

        {/* Footer: your-rank summary */}
        {board && state && !state.loading && !state.error && (
          <div style={{
            padding: '8px 16px',
            borderTop: `1px solid ${EDGE}`,
            background: 'rgba(8,14,28,0.6)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11,
            fontFamily: FM,
            flexShrink: 0,
          }}>
            <span style={{ color: '#7a8a9a' }}>
              Your Rank: {state.your_rank
                ? <span style={{ color: GOLD.light, fontWeight: 700, marginLeft: 6 }}>#{state.your_rank}</span>
                : <span style={{ color: '#475569', marginLeft: 6, fontStyle: 'italic' }}>unranked</span>}
              {state.your_value > 0 && (
                <span style={{ color: '#475569', marginLeft: 10 }}>
                  ({formatValue(state.your_value)} {board.value_suffix})
                </span>
              )}
            </span>
            <span style={{ color: '#3a4a5a', fontSize: 9 }}>
              {state.generated_at ? `as of ${new Date(state.generated_at).toLocaleTimeString()}` : ''}
            </span>
          </div>
        )}
      </div>
    </ModalOverlay>
  );
};

const BoardTable = ({ board, entries, yourRank, myUserId, onOpenProfile }) => {
  if (entries.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#475569', fontSize: 11, fontFamily: F, fontStyle: 'italic' }}>
        No entries yet. Be the first.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr 140px',
        padding: '6px 12px',
        fontSize: 9,
        fontFamily: FM,
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: 1,
      }}>
        <span>Rank</span>
        <span>Pilot</span>
        <span style={{ textAlign: 'right' }}>{board.value_label}</span>
      </div>
      {entries.map(e => {
        const isMe = e.user_id === myUserId;
        const rankColor = e.rank === 1 ? GOLD.light
          : e.rank === 2 ? '#94a3b8'
          : e.rank === 3 ? '#b45309'
          : '#475569';
        return (
          <div
            key={e.user_id}
            onClick={() => onOpenProfile?.(e.user_id)}
            title="Open profile"
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 140px',
              padding: '8px 12px',
              alignItems: 'center',
              background: isMe ? `${BLUE.pri}18` : 'rgba(4,8,16,0.4)',
              borderLeft: isMe ? `2px solid ${BLUE.light}` : '2px solid transparent',
              fontSize: 12,
              fontFamily: FM,
              transition: 'background 80ms ease',
              cursor: 'pointer',
            }}
            onMouseEnter={(ev) => { ev.currentTarget.style.background = isMe ? `${BLUE.pri}30` : 'rgba(20,30,50,0.6)'; }}
            onMouseLeave={(ev) => { ev.currentTarget.style.background = isMe ? `${BLUE.pri}18` : 'rgba(4,8,16,0.4)'; }}
          >
            <span style={{ color: rankColor, fontWeight: 800, fontSize: 13 }}>
              #{e.rank}
            </span>
            <span style={{
              color: isMe ? BLUE.light : '#cbd5e1',
              fontFamily: F,
              fontWeight: isMe ? 800 : 600,
              fontSize: 12,
            }}>
              {e.username}{isMe && <span style={{ color: BLUE.light, marginLeft: 6, fontSize: 9, fontFamily: FM }}>(YOU)</span>}
            </span>
            <span style={{ color: '#e2e8f0', textAlign: 'right', fontWeight: 700 }}>
              {formatValue(e.value)}
              <span style={{ color: '#3a4a5a', marginLeft: 4, fontSize: 9 }}>{board.value_suffix}</span>
            </span>
          </div>
        );
      })}
      {/* Spacer + hint that more exist outside the top 25 */}
      {yourRank && yourRank > entries.length && (
        <div style={{
          marginTop: 12,
          padding: 12,
          textAlign: 'center',
          color: '#475569',
          fontSize: 10,
          fontFamily: FM,
          fontStyle: 'italic',
        }}>
          ... your rank: <span style={{ color: GOLD.light, fontWeight: 700 }}>#{yourRank}</span>
        </div>
      )}
    </div>
  );
};

export default LeaderboardsWindow;
