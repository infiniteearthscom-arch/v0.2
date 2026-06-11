// InboxWindow -- Social Multiplayer Step 9.
// =============================================================
// Two tabs:
//   - Inbox:   list of received messages. Click to expand inline.
//              Read state auto-syncs on expansion. Delete button per
//              message. Refresh button.
//   - Compose: recipient (raw user UUID for v1 -- same pattern as the
//              corp invite picker), subject, body. Send -> back to inbox.
//
// Unread count is polled every 60s by the toolbar badge (separate
// component); the window also refreshes it on open + send.

import React, { useEffect, useMemo, useState } from 'react';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useGameStore } from '@/stores/gameStore';
import { mailAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';

const EDGE = '#1a3050';
const F  = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const BLUE  = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD  = { light: '#fbbf24' };
const RED   = { pri: '#ef4444', light: '#f87171' };
const GREEN = { pri: '#22c55e', light: '#4ade80' };

const fmtTs = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// ============================================
// INBOX TAB
// ============================================
const InboxList = ({ messages, expandedId, onExpand, onDelete, busy }) => {
  if (messages == null) return <Loading />;
  if (messages.length === 0) return <Empty>Your inbox is empty.</Empty>;
  return (
    <div>
      {messages.map(m => {
        const expanded = m.id === expandedId;
        const unread = !m.read_at;
        return (
          <div
            key={m.id}
            style={{
              background: unread ? `${BLUE.pri}14` : 'rgba(4,8,16,0.5)',
              border: `1px solid ${unread ? BLUE.pri + '55' : EDGE}`,
              borderRadius: 3,
              marginBottom: 6,
              overflow: 'hidden',
            }}
          >
            <div
              onClick={() => { playSound('button_click'); onExpand(expanded ? null : m.id); }}
              style={{
                padding: '8px 12px',
                display: 'grid',
                gridTemplateColumns: '140px 1fr 80px 24px',
                gap: 8,
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'background 80ms ease',
              }}
            >
              <span style={{
                fontSize: 10, fontFamily: FM,
                color: m.system_sent ? GOLD.light : '#cbd5e1',
                fontWeight: 700,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {m.system_sent ? 'SYSTEM' : (m.sender_name || 'Unknown')}
              </span>
              <span style={{
                fontSize: 12, fontFamily: F,
                color: unread ? '#e2e8f0' : '#94a3b8',
                fontWeight: unread ? 800 : 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{m.subject}</span>
              <span style={{
                fontSize: 9, color: '#475569', fontFamily: FM,
                textAlign: 'right',
              }}>{fmtTs(m.sent_at)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!window.confirm('Delete this message?')) return;
                  playSound('button_click');
                  onDelete(m.id);
                }}
                disabled={busy}
                title="Delete"
                style={{
                  background: 'transparent', border: 'none',
                  color: '#475569', fontSize: 13, cursor: 'pointer',
                  padding: 0,
                }}
              >×</button>
            </div>
            {expanded && (
              <div style={{
                padding: '10px 14px',
                borderTop: `1px solid ${EDGE}`,
                background: 'rgba(0,0,0,0.25)',
              }}>
                <div style={{
                  fontSize: 11, color: '#cbd5e1', fontFamily: F,
                  lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>{m.body}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================
// COMPOSE TAB
// ============================================
const ComposeView = ({ onSent, onCancel }) => {
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await mailAPI.send({
        recipient_id: recipientId.trim(),
        subject, body,
      });
      playSound('button_click');
      onSent();
    } catch (err) {
      setError(err.message || 'Send failed');
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
        fontSize: 12, color: BLUE.light, fontWeight: 800, letterSpacing: 1.5,
        textTransform: 'uppercase', fontFamily: F, marginBottom: 10,
      }}>Compose Message</div>

      <div style={{ marginBottom: 8 }}>
        <Label>Recipient <span style={{ color: '#3a4a5a' }}>(user UUID -- v2 will add a picker)</span></Label>
        <input
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
          placeholder="paste user uuid"
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <Label>Subject</Label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value.slice(0, 128))}
          maxLength={128}
          placeholder="Re: our last conversation"
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: 10 }}>
        <Label>Body <span style={{ color: '#3a4a5a' }}>({body.length}/4000)</span></Label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 4000))}
          rows={8} maxLength={4000}
          placeholder="Write your message..."
          style={{ ...inputStyle, resize: 'vertical', fontFamily: F, fontSize: 12, lineHeight: 1.5 }}
        />
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => { playSound('button_click'); onCancel(); }}
          style={{
            padding: '8px 12px',
            background: 'transparent', border: `1px solid ${EDGE}`,
            color: '#7a8a9a', fontSize: 10, fontFamily: F, fontWeight: 700, letterSpacing: 1,
            textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
          }}
        >Cancel</button>
        <button
          onClick={submit}
          disabled={busy || !recipientId.trim() || !subject.trim() || !body.trim()}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: `${BLUE.pri}24`,
            border: `1px solid ${BLUE.pri}88`,
            color: BLUE.light,
            fontSize: 11, fontFamily: F, fontWeight: 800, letterSpacing: 1,
            textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
            opacity: (busy || !recipientId.trim() || !subject.trim() || !body.trim()) ? 0.5 : 1,
          }}
        >{busy ? 'Sending...' : 'Send'}</button>
      </div>
    </div>
  );
};

// ============================================
// MAIN
// ============================================
export const InboxWindow = () => {
  const isOpen = useGameStore(s => s.windows.mail?.open);
  const setUnreadCount = useGameStore(s => s.setMailUnread);

  const [tab, setTab] = useState('inbox');           // 'inbox' | 'compose'
  const [messages, setMessages] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch inbox on open + on refresh bumps.
  useEffect(() => {
    if (!isOpen) return;
    if (tab !== 'inbox') return;
    setMessages(null);
    mailAPI.inbox(100)
      .then(({ messages }) => setMessages(messages || []))
      .catch(() => setMessages([]));
  }, [isOpen, tab, reloadKey]);

  // Refresh unread badge whenever the inbox refetches.
  useEffect(() => {
    if (!isOpen) return;
    mailAPI.unreadCount()
      .then(({ count }) => setUnreadCount?.(count))
      .catch(() => {});
  }, [isOpen, messages, setUnreadCount]);

  // On expanding an unread message, mark it read server-side and
  // optimistically update local state so the badge ticks down without
  // a refetch round trip.
  const handleExpand = async (id) => {
    setExpandedId(id);
    if (!id) return;
    const msg = (messages || []).find(m => m.id === id);
    if (!msg || msg.read_at) return;
    try {
      await mailAPI.markRead(id);
      setMessages(ms => (ms || []).map(m => m.id === id ? { ...m, read_at: new Date().toISOString() } : m));
      mailAPI.unreadCount().then(({ count }) => setUnreadCount?.(count)).catch(() => {});
    } catch { /* swallow; user can retry */ }
  };

  const handleDelete = async (id) => {
    setBusy(true);
    try {
      await mailAPI.delete(id);
      setMessages(ms => (ms || []).filter(m => m.id !== id));
      if (expandedId === id) setExpandedId(null);
      mailAPI.unreadCount().then(({ count }) => setUnreadCount?.(count)).catch(() => {});
    } catch (err) {
      window.alert(err.message || 'Delete failed');
    } finally { setBusy(false); }
  };

  const handleSent = () => {
    setTab('inbox');
    setReloadKey(k => k + 1);
  };

  return (
    <ModalOverlay windowId="mail" title="Inbox" icon="📬" accent={BLUE.light} width={680}>
      <div style={{
        padding: 16, minHeight: 360,
      }}>
        {/* Tab strip */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[
            { id: 'inbox',   label: 'Inbox' },
            { id: 'compose', label: '+ Compose' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { playSound('button_click'); setTab(t.id); }}
              style={{
                padding: '6px 14px',
                background: tab === t.id ? `${BLUE.pri}24` : 'transparent',
                border: `1px solid ${tab === t.id ? BLUE.pri + '88' : EDGE}`,
                color: tab === t.id ? BLUE.light : '#7a8a9a',
                fontSize: 11, fontFamily: F, fontWeight: 700, letterSpacing: 1,
                textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
              }}
            >{t.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          {tab === 'inbox' && (
            <button
              onClick={() => { playSound('button_click'); setReloadKey(k => k + 1); }}
              title="Refresh"
              style={{
                padding: '6px 10px',
                background: 'transparent', border: `1px solid ${EDGE}`,
                color: '#7a8a9a', fontSize: 12, cursor: 'pointer', borderRadius: 3,
              }}
            >↻</button>
          )}
        </div>

        {tab === 'inbox' && (
          <InboxList
            messages={messages}
            expandedId={expandedId}
            onExpand={handleExpand}
            onDelete={handleDelete}
            busy={busy}
          />
        )}
        {tab === 'compose' && (
          <ComposeView
            onSent={handleSent}
            onCancel={() => setTab('inbox')}
          />
        )}
      </div>
    </ModalOverlay>
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
    padding: 40, textAlign: 'center', color: '#475569',
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

export default InboxWindow;
