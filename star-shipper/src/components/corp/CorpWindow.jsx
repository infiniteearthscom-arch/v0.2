// CorpWindow -- Social Multiplayer Step 7.
// =============================================================
// Three states:
//   - Member view: corp info + roster + invite-others panel + leave btn.
//   - Non-member view (no pending invites): create-corp form.
//   - Non-member view (with invites): pending-invite cards above the
//     create form.
//
// Mutations refetch in place (no real-time push for corp state in v1
// -- corp changes are infrequent compared to chat or trades).

import React, { useEffect, useState } from 'react';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useAuthStore } from '@/stores/authStore';
import { useGameStore } from '@/stores/gameStore';
import { corpAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';
import presence from '@/utils/presence';

const EDGE = '#1a3050';
const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const BLUE  = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD  = { light: '#fbbf24' };
const GREEN = { pri: '#22c55e', light: '#4ade80' };
const RED   = { pri: '#ef4444', light: '#f87171' };
const PURPLE = { light: '#c084fc' };

const ROLE_COLOR = {
  founder: GOLD.light,
  officer: PURPLE.light,
  member:  '#cbd5e1',
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const Label = ({ children }) => (
  <div style={{ fontSize: 9, color: '#475569', fontFamily: FM, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
    {children}
  </div>
);

// ============================================
// CREATE FORM (non-member view)
// ============================================
const CreateForm = ({ onCreated }) => {
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await corpAPI.create({ name, ticker, description: desc || null });
      onCreated();
    } catch (err) {
      setError(err.message || 'Failed to create corporation');
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      background: 'rgba(4,8,16,0.5)',
      border: `1px solid ${EDGE}`,
      borderRadius: 3,
      padding: 12,
    }}>
      <div style={{
        fontSize: 12, color: BLUE.light, fontWeight: 800, letterSpacing: 1.5,
        textTransform: 'uppercase', fontFamily: F, marginBottom: 10,
      }}>Found a Corporation</div>
      <div style={{ marginBottom: 8 }}>
        <Label>Name <span style={{ color: '#3a4a5a' }}>(3-64 chars)</span></Label>
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          maxLength={64} placeholder="Atlas Logistics"
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <Label>Ticker <span style={{ color: '#3a4a5a' }}>(2-5 chars, uppercase)</span></Label>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase().slice(0, 5))}
          placeholder="ATLAS"
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <Label>Description <span style={{ color: '#3a4a5a' }}>(optional)</span></Label>
        <textarea
          value={desc} onChange={(e) => setDesc(e.target.value)}
          rows={3} maxLength={1000}
          placeholder="What's this corp about?"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>
      {error && <div style={errorStyle}>{error}</div>}
      <button
        onClick={() => { playSound('button_click'); submit(); }}
        disabled={busy || !name.trim() || !ticker.trim()}
        style={primaryBtnStyle(BLUE.pri, BLUE.light, busy || !name.trim() || !ticker.trim())}
      >{busy ? 'Founding...' : 'Found Corporation'}</button>
    </div>
  );
};

// ============================================
// PENDING INVITES (non-member view)
// ============================================
const PendingInvites = ({ invites, onChanged }) => {
  if (!invites || invites.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11, color: GOLD.light, fontWeight: 800, letterSpacing: 1,
        textTransform: 'uppercase', fontFamily: F, marginBottom: 6,
      }}>
        {invites.length} Pending Invite{invites.length === 1 ? '' : 's'}
      </div>
      {invites.map(inv => (
        <div key={inv.id} style={{
          background: 'rgba(4,8,16,0.5)',
          border: `1px solid ${GOLD.light}55`,
          borderRadius: 3,
          padding: '10px 12px',
          marginBottom: 6,
        }}>
          <div style={{ fontSize: 12, color: '#e2e8f0', fontFamily: F, fontWeight: 700, marginBottom: 4 }}>
            <span style={{ color: GOLD.light }}>[{inv.corp_ticker}]</span> {inv.corp_name}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: FM, marginBottom: 8 }}>
            Invited by {inv.inviter_name} · {inv.member_count} member{inv.member_count === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={async () => {
                playSound('button_click');
                try { await corpAPI.acceptInvite(inv.id); onChanged(); }
                catch (err) { window.alert(err.message || 'Accept failed'); }
              }}
              style={primaryBtnStyle(GREEN.pri, GREEN.light)}
            >Accept</button>
            <button
              onClick={async () => {
                playSound('button_click');
                try { await corpAPI.rejectInvite(inv.id); onChanged(); }
                catch (err) { window.alert(err.message || 'Reject failed'); }
              }}
              style={{ ...primaryBtnStyle(RED.pri, RED.light), background: 'transparent' }}
            >Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================
// MEMBER VIEW
// ============================================
const MemberView = ({ membership, onChanged }) => {
  const myUserId = useAuthStore(s => s.user?.id) || null;
  const openProfile = useGameStore(s => s.openProfile);

  const [members, setMembers] = useState(null);
  const [inviteId, setInviteId] = useState(''); // user_id input -- v1 takes raw id; v2 picker
  const [inviteError, setInviteError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    corpAPI.members(membership.corp_id)
      .then(({ members }) => setMembers(members || []))
      .catch(() => setMembers([]));
  }, [membership.corp_id]);

  const me = (members || []).find(m => m.user_id === myUserId);
  const canManage = me?.role === 'founder' || me?.role === 'officer';

  const handleInvite = async () => {
    setBusy(true); setInviteError(null);
    try {
      await corpAPI.invite(inviteId.trim());
      setInviteId('');
    } catch (err) {
      setInviteError(err.message || 'Invite failed');
    } finally { setBusy(false); }
  };

  const handleLeave = async () => {
    if (!window.confirm(`Leave [${membership.ticker}] ${membership.name}?`)) return;
    playSound('button_click');
    try {
      const r = await corpAPI.leave();
      if (r.disbanded) window.alert('You were the last member -- corporation disbanded.');
      onChanged();
    } catch (err) { window.alert(err.message || 'Leave failed'); }
  };

  const handleKick = async (target) => {
    if (!window.confirm(`Kick ${target.username} from the corp?`)) return;
    playSound('button_click');
    try {
      await corpAPI.kick(target.user_id);
      const fresh = await corpAPI.members(membership.corp_id);
      setMembers(fresh.members || []);
    } catch (err) { window.alert(err.message || 'Kick failed'); }
  };

  return (
    <div>
      {/* Identity card */}
      <div style={{
        background: `linear-gradient(135deg, ${GOLD.light}1c, transparent)`,
        border: `1px solid ${GOLD.light}55`,
        borderRadius: 3,
        padding: '12px 14px',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <span style={{
            fontSize: 18, color: GOLD.light, fontFamily: FM, fontWeight: 800, letterSpacing: 2,
          }}>[{membership.ticker}]</span>
          <span style={{ fontSize: 16, color: '#e2e8f0', fontFamily: F, fontWeight: 800, flex: 1 }}>
            {membership.name}
          </span>
          <span style={{
            fontSize: 9, color: ROLE_COLOR[membership.role], fontFamily: FM,
            fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            padding: '2px 8px', border: `1px solid ${ROLE_COLOR[membership.role]}88`, borderRadius: 2,
          }}>{membership.role}</span>
        </div>
        {membership.description && (
          <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: F, marginTop: 4, lineHeight: 1.4 }}>
            {membership.description}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#475569', fontFamily: FM, marginTop: 8 }}>
          {membership.member_count} member{membership.member_count === 1 ? '' : 's'} · Joined {fmtDate(membership.joined_at)}
        </div>
      </div>

      {/* Roster */}
      <div style={{
        fontSize: 9, color: '#475569', fontFamily: FM, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 6,
      }}>Roster</div>
      <div style={{
        background: 'rgba(4,8,16,0.5)',
        border: `1px solid ${EDGE}`,
        borderRadius: 3,
        padding: '4px 0',
        marginBottom: 12,
      }}>
        {members == null && <div style={{ padding: 12, color: '#475569', fontSize: 10, fontFamily: F, fontStyle: 'italic' }}>Loading...</div>}
        {members?.map(m => (
          <div key={m.user_id} style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px',
            alignItems: 'center', gap: 6,
            padding: '6px 12px',
            fontSize: 11, fontFamily: FM,
            borderBottom: `1px solid rgba(26,48,80,0.2)`,
          }}>
            <span
              onClick={() => { playSound('button_click'); openProfile(m.user_id); }}
              title={`Open ${m.username}'s profile`}
              style={{ color: '#cbd5e1', fontFamily: F, fontWeight: 700, cursor: 'pointer' }}
            >{m.username}{m.user_id === myUserId && (
              <span style={{ color: BLUE.light, marginLeft: 6, fontSize: 9 }}>(you)</span>
            )}</span>
            <span style={{ color: ROLE_COLOR[m.role], fontWeight: 700, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>
              {m.role}
            </span>
            <span style={{ textAlign: 'right' }}>
              {canManage && m.user_id !== myUserId && m.role !== 'founder' && (
                <button
                  onClick={() => handleKick(m)}
                  style={{
                    background: 'transparent', border: `1px solid ${RED.pri}55`,
                    color: RED.light, fontSize: 9, fontFamily: F, fontWeight: 700, letterSpacing: 1,
                    textTransform: 'uppercase', padding: '3px 8px', cursor: 'pointer', borderRadius: 2,
                  }}
                >Kick</button>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Invite + Leave action panels */}
      {canManage && (
        <div style={{
          background: 'rgba(4,8,16,0.5)',
          border: `1px solid ${EDGE}`,
          borderRadius: 3,
          padding: 10,
          marginBottom: 10,
        }}>
          <Label>Invite Pilot <span style={{ color: '#3a4a5a' }}>(user ID -- v2 will add a picker)</span></Label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={inviteId} onChange={(e) => setInviteId(e.target.value)}
              placeholder="paste user uuid"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={handleInvite}
              disabled={busy || !inviteId.trim()}
              style={primaryBtnStyle(BLUE.pri, BLUE.light, busy || !inviteId.trim())}
            >Invite</button>
          </div>
          {inviteError && <div style={{ ...errorStyle, marginTop: 6 }}>{inviteError}</div>}
        </div>
      )}

      <button
        onClick={handleLeave}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'transparent',
          border: `1px solid ${RED.pri}66`,
          color: RED.light,
          fontSize: 11, fontFamily: F, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
        }}
      >
        {membership.role === 'founder' && membership.member_count === 1
          ? 'Disband Corporation'
          : 'Leave Corporation'}
      </button>
    </div>
  );
};

// ============================================
// MAIN
// ============================================
export const CorpWindow = () => {
  const isOpen = useGameStore(s => s.windows.corp?.open);
  const [membership, setMembership] = useState(undefined); // undefined = loading, null = no corp
  const [invites, setInvites] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setMembership(undefined);
    Promise.all([corpAPI.mine(), corpAPI.invites()])
      .then(([m, i]) => {
        setMembership(m.membership || null);
        setInvites(i.invites || []);
      })
      .catch(() => { setMembership(null); setInvites([]); });
  }, [isOpen, reloadKey]);

  const refetch = () => {
    // Bump the presence ship_visual version so peers refresh our
    // corp ticker on their next snapshot tick. Cheap idempotent
    // counter; the actual descriptor refetch happens server-side.
    if (presence.isEnabled()) presence.bumpShipVisual();
    setReloadKey(k => k + 1);
  };

  return (
    <ModalOverlay windowId="corp" title="Corporation" icon="🛡️" accent={GOLD.light}>
      <div style={{
        width: 540, maxWidth: '92vw',
        padding: 16, minHeight: 280,
      }}>
        {membership === undefined && (
          <div style={{ padding: 30, textAlign: 'center', color: '#475569', fontSize: 11, fontFamily: F, fontStyle: 'italic' }}>
            Loading...
          </div>
        )}
        {membership === null && (
          <>
            <PendingInvites invites={invites} onChanged={refetch} />
            <CreateForm onCreated={refetch} />
          </>
        )}
        {membership && (
          <MemberView membership={membership} onChanged={refetch} />
        )}
      </div>
    </ModalOverlay>
  );
};

// ============================================
// STYLE HELPERS
// ============================================
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
const primaryBtnStyle = (bgColor, fgColor, disabled) => ({
  padding: '6px 14px',
  background: `${bgColor}24`,
  border: `1px solid ${bgColor}88`,
  color: disabled ? '#475569' : fgColor,
  fontSize: 11, fontFamily: F, fontWeight: 800, letterSpacing: 1,
  textTransform: 'uppercase',
  cursor: disabled ? 'not-allowed' : 'pointer',
  borderRadius: 3,
  opacity: disabled ? 0.5 : 1,
});

export default CorpWindow;
