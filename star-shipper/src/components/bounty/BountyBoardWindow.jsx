// BountyBoardWindow -- Social Multiplayer Step 8.
// =============================================================
// Modal with three views:
//   - Browse:  open bounties galaxy-wide (or filtered to current
//              system). Claim button per row.
//   - Post:    new-bounty form (target hull / system / reward).
//   - My Bounties: bounties I posted, with status + cancel button.
//
// v1 trusts the claimer's reported kill (same cheat surface as the
// rest of combat). A future server-validated combat layer can promote
// claim to a verified action.

import React, { useEffect, useMemo, useState } from 'react';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { bountyAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';

const EDGE = '#1a3050';
const F  = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const BLUE  = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD  = { pri: '#f59e0b', light: '#fbbf24' };
const RED   = { pri: '#ef4444', light: '#f87171' };
const GREEN = { pri: '#22c55e', light: '#4ade80' };

const HULL_OPTIONS = [
  { value: 'any',         label: 'Any pirate' },
  { value: 'fighter',     label: 'Fighter' },
  { value: 'scout',       label: 'Scout' },
  { value: 'interceptor', label: 'Interceptor' },
  { value: 'corvette',    label: 'Corvette' },
  { value: 'gunship',     label: 'Gunship' },
  { value: 'frigate',     label: 'Frigate' },
  { value: 'destroyer',   label: 'Destroyer' },
  { value: 'capital',     label: 'Capital' },
];

const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString());
const fmtAge = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ============================================
// BROWSE
// ============================================
const BrowseView = ({ rows, onClaim, onlyCurrentSystem, setOnlyCurrentSystem, currentSystem }) => {
  if (rows == null) return <Loading />;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button
          onClick={() => { playSound('button_click'); setOnlyCurrentSystem(v => !v); }}
          style={{
            padding: '4px 10px',
            background: onlyCurrentSystem ? `${BLUE.pri}22` : 'transparent',
            border: `1px solid ${onlyCurrentSystem ? BLUE.pri + '88' : EDGE}`,
            color: onlyCurrentSystem ? BLUE.light : '#7a8a9a',
            fontSize: 10, fontFamily: F, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
          }}
        >
          {onlyCurrentSystem
            ? `Showing ${currentSystem || '<current>'} only`
            : 'Filter to current system'}
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: '#475569', fontFamily: FM }}>
          {rows.length} open
        </span>
      </div>
      {rows.length === 0 && (
        <Empty>No open bounties{onlyCurrentSystem ? ' in this system' : ''}.</Empty>
      )}
      {rows.map(b => (
        <BountyRow key={b.id} bounty={b} onClaim={onClaim} />
      ))}
    </div>
  );
};

const BountyRow = ({ bounty, onClaim }) => {
  const myUserId = useAuthStore(s => s.user?.id) || null;
  const currentSystem = useGameStore(s => s.currentSystem);
  const isMine = bounty.poster_id === myUserId;
  const systemMatches = !bounty.target_system_id || bounty.target_system_id === currentSystem;

  return (
    <div style={{
      background: 'rgba(4,8,16,0.5)',
      border: `1px solid ${EDGE}`,
      borderRadius: 3,
      padding: '8px 10px',
      marginBottom: 6,
      display: 'grid',
      gridTemplateColumns: '1fr 120px 90px',
      gap: 8,
      alignItems: 'center',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#e2e8f0', fontFamily: F, fontWeight: 700 }}>
          <span style={{ color: RED.light }}>Kill</span>
          <span style={{ color: '#cbd5e1', marginLeft: 4 }}>
            {bounty.target_hull_class === 'any' ? 'any pirate' : `Pirate ${bounty.target_hull_class}`}
          </span>
          {bounty.target_system_id && (
            <span style={{ color: '#475569', marginLeft: 6, fontSize: 10, fontFamily: FM }}>
              in {bounty.target_system_id}
            </span>
          )}
        </div>
        {bounty.description && (
          <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: F, marginTop: 2, lineHeight: 1.3 }}>
            "{bounty.description}"
          </div>
        )}
        <div style={{ fontSize: 9, color: '#475569', fontFamily: FM, marginTop: 4 }}>
          Posted by {bounty.poster_name} · {fmtAge(bounty.created_at)}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 14, color: GOLD.light, fontWeight: 800, fontFamily: FM }}>
          {fmtNum(bounty.reward_credits)}
        </div>
        <div style={{ fontSize: 8, color: '#475569', fontFamily: FM, letterSpacing: 1, textTransform: 'uppercase' }}>
          credits
        </div>
      </div>
      <div>
        <button
          onClick={() => onClaim(bounty)}
          disabled={isMine || !systemMatches}
          title={isMine
            ? 'You posted this bounty'
            : (!systemMatches ? 'Must be in the bounty\'s target system to claim' : 'Claim this bounty')}
          style={{
            width: '100%',
            padding: '6px 10px',
            background: isMine ? 'transparent' : (systemMatches ? `${GREEN.pri}22` : 'rgba(20,30,50,0.4)'),
            border: `1px solid ${isMine ? EDGE : (systemMatches ? GREEN.pri + '88' : EDGE)}`,
            color: isMine ? '#475569' : (systemMatches ? GREEN.light : '#475569'),
            fontSize: 10, fontFamily: F, fontWeight: 800, letterSpacing: 1,
            textTransform: 'uppercase',
            cursor: (isMine || !systemMatches) ? 'not-allowed' : 'pointer',
            borderRadius: 3,
          }}
        >
          {isMine ? 'Yours' : 'Claim'}
        </button>
      </div>
    </div>
  );
};

// ============================================
// POST
// ============================================
const PostView = ({ onBack, onPosted, currentSystem }) => {
  const [hull, setHull] = useState('any');
  const [systemId, setSystemId] = useState('');
  const [reward, setReward] = useState(1000);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await bountyAPI.post({
        target_hull_class: hull,
        target_system_id: systemId.trim() || null,
        reward_credits: reward,
        description: desc.trim() || null,
      });
      onPosted();
      onBack();
    } catch (err) {
      setError(err.message || 'Post failed');
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      background: 'rgba(4,8,16,0.5)',
      border: `1px solid ${EDGE}`,
      borderRadius: 3,
      padding: 14,
    }}>
      <div style={{
        fontSize: 12, color: GOLD.light, fontWeight: 800, letterSpacing: 1.5,
        textTransform: 'uppercase', fontFamily: F, marginBottom: 10,
      }}>Post New Bounty</div>
      <div style={{ marginBottom: 8 }}>
        <Label>Target</Label>
        <select value={hull} onChange={(e) => setHull(e.target.value)} style={inputStyle}>
          {HULL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 8 }}>
        <Label>System <span style={{ color: '#3a4a5a' }}>(empty = any system)</span></Label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={systemId} onChange={(e) => setSystemId(e.target.value)}
            placeholder="e.g. sol"
            style={{ ...inputStyle, flex: 1 }}
          />
          {currentSystem && (
            <button
              onClick={() => setSystemId(currentSystem)}
              style={{
                background: 'transparent', border: `1px solid ${EDGE}`,
                color: '#7a8a9a', fontSize: 9, fontFamily: F, fontWeight: 700, letterSpacing: 1,
                textTransform: 'uppercase', padding: '4px 8px', cursor: 'pointer', borderRadius: 2,
              }}
            >use current ({currentSystem})</button>
          )}
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <Label>Reward (credits)</Label>
        <input
          type="number" min={1}
          value={reward}
          onChange={(e) => setReward(Math.max(1, parseInt(e.target.value) || 0))}
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <Label>Description <span style={{ color: '#3a4a5a' }}>(optional)</span></Label>
        <textarea
          value={desc} onChange={(e) => setDesc(e.target.value)}
          rows={2} maxLength={500}
          placeholder="Optional context for hunters."
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: FM, marginBottom: 10, padding: '6px 8px', background: 'rgba(4,8,16,0.5)', border: `1px solid ${EDGE}`, borderRadius: 2 }}>
        Escrow: <span style={{ color: GOLD.light, fontWeight: 700 }}>{fmtNum(reward)} cr</span>
        <span style={{ color: '#475569', marginLeft: 8 }}>locked when posted; refunded on cancel</span>
      </div>
      {error && <div style={errorStyle}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => { playSound('button_click'); onBack(); }}
          style={{
            padding: '8px 12px',
            background: 'transparent', border: `1px solid ${EDGE}`,
            color: '#7a8a9a', fontSize: 10, fontFamily: F, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
          }}
        >Cancel</button>
        <button
          onClick={() => { playSound('button_click'); submit(); }}
          disabled={busy || reward <= 0}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: `${GOLD.pri}24`,
            border: `1px solid ${GOLD.pri}88`,
            color: GOLD.light,
            fontSize: 11, fontFamily: F, fontWeight: 800, letterSpacing: 1,
            textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
            opacity: (busy || reward <= 0) ? 0.5 : 1,
          }}
        >{busy ? 'Posting...' : 'Post Bounty'}</button>
      </div>
    </div>
  );
};

// ============================================
// MY BOUNTIES
// ============================================
const MyBountiesView = ({ rows, onCancel }) => {
  if (rows == null) return <Loading />;
  if (rows.length === 0) return <Empty>You haven't posted any bounties.</Empty>;
  return (
    <div>
      {rows.map(b => (
        <div key={b.id} style={{
          background: 'rgba(4,8,16,0.5)',
          border: `1px solid ${b.status === 'claimed' ? GREEN.pri + '55' : EDGE}`,
          borderRadius: 3,
          padding: '8px 10px',
          marginBottom: 6,
          display: 'grid',
          gridTemplateColumns: '1fr 110px 80px',
          gap: 8,
          alignItems: 'center',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#e2e8f0', fontFamily: F, fontWeight: 700 }}>
              {b.target_hull_class === 'any' ? 'Any pirate' : `Pirate ${b.target_hull_class}`}
              {b.target_system_id && (
                <span style={{ color: '#475569', marginLeft: 6, fontSize: 10, fontFamily: FM }}>in {b.target_system_id}</span>
              )}
            </div>
            <div style={{ fontSize: 9, color: '#475569', fontFamily: FM, marginTop: 4 }}>
              {b.status === 'claimed' && b.claimer_name
                ? `Claimed by ${b.claimer_name} ${fmtAge(b.claimed_at)}`
                : `Posted ${fmtAge(b.created_at)}`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: GOLD.light, fontWeight: 800, fontFamily: FM }}>
              {fmtNum(b.reward_credits)} cr
            </div>
            <div style={{
              fontSize: 9, fontFamily: FM, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
              color: b.status === 'open' ? BLUE.light : b.status === 'claimed' ? GREEN.light : '#475569',
            }}>{b.status}</div>
          </div>
          <div>
            {b.status === 'open' && (
              <button
                onClick={() => onCancel(b)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: 'transparent',
                  border: `1px solid ${RED.pri}55`,
                  color: RED.light,
                  fontSize: 9, fontFamily: F, fontWeight: 700, letterSpacing: 1,
                  textTransform: 'uppercase', cursor: 'pointer', borderRadius: 2,
                }}
              >Cancel</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================
// MAIN
// ============================================
export const BountyBoardWindow = () => {
  const isOpen = useGameStore(s => s.windows.bounties?.open);
  const currentSystem = useGameStore(s => s.currentSystem);

  const [tab, setTab] = useState('browse');         // 'browse' | 'post' | 'mine'
  const [open, setOpen] = useState(null);           // open bounties list
  const [mine, setMine] = useState(null);           // my bounties list
  const [onlyCurrentSystem, setOnlyCurrentSystem] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Refetch the active view's data on open / refresh.
  useEffect(() => {
    if (!isOpen) return;
    if (tab === 'browse') {
      setOpen(null);
      bountyAPI.list(onlyCurrentSystem ? currentSystem : null)
        .then(({ bounties }) => setOpen(bounties || []))
        .catch(() => setOpen([]));
    } else if (tab === 'mine') {
      setMine(null);
      bountyAPI.mine()
        .then(({ bounties }) => setMine(bounties || []))
        .catch(() => setMine([]));
    }
  }, [isOpen, tab, onlyCurrentSystem, currentSystem, reloadKey]);

  const bumpRefresh = () => setReloadKey(k => k + 1);

  const handleClaim = async (bounty) => {
    // Trust the click for v1. The kill_system_id is the player's
    // current system; killed_hull_class matches the bounty's target
    // (or any if 'any'). A future kill-validation hook will replace
    // this with a server-side check against actual combat events.
    if (!window.confirm(`Claim ${fmtNum(bounty.reward_credits)} cr by reporting a kill on a ${bounty.target_hull_class === 'any' ? 'pirate' : bounty.target_hull_class}?`)) return;
    playSound('button_click');
    try {
      await bountyAPI.claim(bounty.id, {
        killed_hull_class: bounty.target_hull_class === 'any' ? 'fighter' : bounty.target_hull_class,
        kill_system_id: currentSystem,
      });
      bumpRefresh();
    } catch (err) {
      window.alert(err.message || 'Claim failed');
    }
  };

  const handleCancel = async (bounty) => {
    if (!window.confirm(`Cancel this bounty? ${fmtNum(bounty.reward_credits)} cr will be refunded.`)) return;
    playSound('button_click');
    try { await bountyAPI.cancel(bounty.id); bumpRefresh(); }
    catch (err) { window.alert(err.message || 'Cancel failed'); }
  };

  return (
    <ContextPanel windowId="bounties" title="Bounty Board" icon="🎯" accent={GOLD.light} width={600}>
      <div style={{
        padding: 4, minHeight: 320,
      }}>
        {/* Tab strip */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[
            { id: 'browse', label: 'Browse' },
            { id: 'post',   label: '+ Post' },
            { id: 'mine',   label: 'My Bounties' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { playSound('button_click'); setTab(t.id); }}
              style={{
                padding: '6px 14px',
                background: tab === t.id ? `${GOLD.pri}24` : 'transparent',
                border: `1px solid ${tab === t.id ? GOLD.pri + '88' : EDGE}`,
                color: tab === t.id ? GOLD.light : '#7a8a9a',
                fontSize: 11, fontFamily: F, fontWeight: 700, letterSpacing: 1,
                textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
              }}
            >{t.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          {(tab === 'browse' || tab === 'mine') && (
            <button
              onClick={() => { playSound('button_click'); bumpRefresh(); }}
              title="Refresh"
              style={{
                padding: '6px 10px',
                background: 'transparent', border: `1px solid ${EDGE}`,
                color: '#7a8a9a', fontSize: 12, cursor: 'pointer', borderRadius: 3,
              }}
            >↻</button>
          )}
        </div>

        {tab === 'browse' && (
          <BrowseView
            rows={open}
            onClaim={handleClaim}
            onlyCurrentSystem={onlyCurrentSystem}
            setOnlyCurrentSystem={setOnlyCurrentSystem}
            currentSystem={currentSystem}
          />
        )}
        {tab === 'post' && (
          <PostView
            onBack={() => setTab('browse')}
            onPosted={bumpRefresh}
            currentSystem={currentSystem}
          />
        )}
        {tab === 'mine' && (
          <MyBountiesView rows={mine} onCancel={handleCancel} />
        )}
      </div>
    </ContextPanel>
  );
};

// ============================================
// STYLE HELPERS
// ============================================
const Loading = () => (
  <div style={{ padding: 30, textAlign: 'center', color: '#475569', fontSize: 11, fontFamily: F, fontStyle: 'italic' }}>
    Loading...
  </div>
);
const Empty = ({ children }) => (
  <div style={{
    padding: 30, textAlign: 'center', color: '#475569',
    fontSize: 11, fontFamily: F, fontStyle: 'italic',
    background: 'rgba(4,8,16,0.4)', border: `1px solid ${EDGE}`, borderRadius: 3,
  }}>
    {children}
  </div>
);
const Label = ({ children }) => (
  <div style={{ fontSize: 9, color: '#475569', fontFamily: FM, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
    {children}
  </div>
);
const inputStyle = {
  width: '100%',
  fontSize: 12, fontFamily: FM,
  background: '#0b1424', border: `1px solid ${EDGE}`,
  color: '#cbd5e1', padding: '5px 8px', borderRadius: 2, outline: 'none',
  boxSizing: 'border-box',
};
const errorStyle = {
  padding: '6px 8px', marginBottom: 8,
  background: 'rgba(127,29,29,0.3)', border: `1px solid ${RED.pri}66`,
  color: RED.light, fontSize: 11, fontFamily: F, borderRadius: 2,
};

export default BountyBoardWindow;
