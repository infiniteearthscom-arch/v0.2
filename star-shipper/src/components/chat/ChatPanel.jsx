// ChatPanel -- multiplayer Phase 2 step 1.
// =============================================================
// Dockable bottom-right panel with two channels for v1:
//   - System  (everyone in your current procedural system)
//   - Global  (everyone online)
//
// Collapses to a compact header bar; tabs show unread count badges
// when collapsed or when not the active tab. Auto-scrolls to bottom
// on new messages unless the user has scrolled up to read history.
//
// Data flow:
//   utils/chat.js singleton owns the message buffer + socket events.
//   This component reads via getMessages(), subscribes to 'message'
//   for re-render triggers, and dispatches via send(). Hydration on
//   first tab open via loadChannel() (REST history fetch).

import React, { useEffect, useRef, useState, useCallback } from 'react';
import chat from '@/utils/chat';
import { useGameStore } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';

const EDGE = '#1a3050';
const BLUE = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const CYAN = '#4488ff';
const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";

const CHANNELS = [
  { id: 'system', label: 'System', color: CYAN },
  { id: 'global', label: 'Global', color: '#aa66ff' },
];

const formatTime = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const MessageList = ({ messages, ownUserId }) => {
  // Auto-scroll to bottom on new message unless user has scrolled up.
  // We check the scrollTop / scrollHeight delta to detect "user is
  // reading history" (anything more than ~30px from the bottom).
  const ref = useRef(null);
  const stickyRef = useRef(true);

  const onScroll = (e) => {
    const el = e.currentTarget;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickyRef.current = fromBottom < 30;
  };

  useEffect(() => {
    if (!ref.current) return;
    if (stickyRef.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);

  if (!messages.length) {
    return (
      <div
        ref={ref}
        onScroll={onScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 10px',
          fontSize: 10,
          fontFamily: FM,
          color: '#3a5a6a',
          fontStyle: 'italic',
        }}
      >
        No messages yet.
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '6px 10px',
        fontFamily: FM,
        fontSize: 11,
        lineHeight: 1.45,
        color: '#cbd5e1',
      }}
    >
      {messages.map((m) => {
        const isOwn = m.sender_id === ownUserId;
        return (
          <div key={m.id} style={{ marginBottom: 4 }}>
            <span style={{ color: '#3a5a6a', fontSize: 9, marginRight: 6 }}>{formatTime(m.ts)}</span>
            <span style={{
              color: isOwn ? '#fbbf24' : BLUE.light,
              fontWeight: 700,
              marginRight: 6,
            }}>{m.sender_name}</span>
            <span style={{ color: '#e2e8f0' }}>{m.text}</span>
          </div>
        );
      })}
    </div>
  );
};

export const ChatPanel = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeChannel, setActiveChannel] = useState('system');
  // Render-trigger tick. The chat singleton mutates its in-memory
  // buffer in place; we bump this state on each new message so React
  // re-renders the MessageList. Cheaper than copying the buffer.
  const [renderTick, setRenderTick] = useState(0);
  const [unread, setUnread] = useState({ system: 0, global: 0 });
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const currentSystemId = useGameStore(s => s.currentSystem);
  const ownUserId = useAuthStore(s => s.user?.id) || null;

  // Keep chat singleton's idea of "current system" in sync with the
  // store so the 'system' channel resolves to the right channel_id.
  useEffect(() => {
    if (!chat.isEnabled()) return;
    chat.setSystemId(currentSystemId);
    chat.resetSystemChannel();
    chat.loadChannel('system').then(() => setRenderTick(t => t + 1));
  }, [currentSystemId]);

  // Hydrate global once on mount.
  useEffect(() => {
    if (!chat.isEnabled()) return;
    chat.loadChannel('global').then(() => setRenderTick(t => t + 1));
  }, []);

  // Subscribe to live messages.
  useEffect(() => {
    if (!chat.isEnabled()) return;
    return chat.on('message', ({ channel }) => {
      setRenderTick(t => t + 1);
      // Bump unread for tabs that aren't currently visible / focused.
      if (collapsed || channel !== activeChannel) {
        setUnread(u => ({ ...u, [channel]: (u[channel] || 0) + 1 }));
      }
    });
  }, [collapsed, activeChannel]);

  // Clear unread when switching to a channel.
  useEffect(() => {
    if (collapsed) return;
    setUnread(u => ({ ...u, [activeChannel]: 0 }));
  }, [activeChannel, collapsed]);

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    chat.send(activeChannel, text);
    setDraft('');
  }, [draft, activeChannel]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!chat.isEnabled()) return null;

  const totalUnread = (unread.system || 0) + (unread.global || 0);
  const messages = chat.getMessages(activeChannel, activeChannel === 'system' ? currentSystemId : null);

  // Collapsed: just a slim header that expands on click. Shows total
  // unread badge so the player notices new messages while focused on
  // the game view.
  if (collapsed) {
    return (
      <div
        onClick={() => { setCollapsed(false); setUnread(u => ({ ...u, [activeChannel]: 0 })); }}
        style={{
          position: 'fixed',
          left: 12,
          bottom: 40,
          width: 180,
          padding: '6px 10px',
          background: 'rgba(8,14,28,0.92)',
          border: `1px solid ${EDGE}`,
          borderRadius: 3,
          cursor: 'pointer',
          fontFamily: F,
          fontSize: 10,
          fontWeight: 700,
          color: BLUE.light,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 30,
          boxShadow: '0 0 8px rgba(0,0,0,0.4)',
        }}
        title="Open chat"
      >
        <span>💬 Chat</span>
        {totalUnread > 0 && (
          <span style={{
            background: '#ef4444',
            color: '#fff',
            padding: '1px 6px',
            borderRadius: 8,
            fontSize: 9,
            fontFamily: FM,
            minWidth: 16,
            textAlign: 'center',
          }}>
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        bottom: 40,
        width: 340,
        height: 360,
        background: 'rgba(8,14,28,0.95)',
        border: `1px solid ${EDGE}`,
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: F,
        zIndex: 30,
        boxShadow: '0 0 12px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header: tab strip + collapse */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: `1px solid ${EDGE}`,
        background: 'rgba(12,26,51,0.4)',
      }}>
        {CHANNELS.map(c => {
          const isActive = c.id === activeChannel;
          const channelUnread = unread[c.id] || 0;
          return (
            <button
              key={c.id}
              onClick={() => setActiveChannel(c.id)}
              style={{
                flex: 1,
                padding: '6px 8px',
                background: isActive ? `${c.color}22` : 'transparent',
                borderRight: `1px solid ${EDGE}`,
                borderBottom: isActive ? `2px solid ${c.color}` : '2px solid transparent',
                color: isActive ? c.color : '#7a8a9a',
                fontSize: 10,
                fontFamily: F,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <span>{c.label}</span>
              {channelUnread > 0 && !isActive && (
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  padding: '0 5px',
                  borderRadius: 8,
                  fontSize: 8,
                  fontFamily: FM,
                  minWidth: 14,
                  textAlign: 'center',
                }}>
                  {channelUnread > 99 ? '99+' : channelUnread}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setCollapsed(true)}
          style={{
            padding: '0 12px',
            background: 'transparent',
            border: 'none',
            color: '#7a8a9a',
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: FM,
          }}
          title="Collapse chat"
        >
          —
        </button>
      </div>

      {/* Message list */}
      <MessageList messages={messages} ownUserId={ownUserId} key={`${activeChannel}-${renderTick}`} />

      {/* Input */}
      <div style={{
        borderTop: `1px solid ${EDGE}`,
        padding: 6,
        display: 'flex',
        gap: 4,
        background: 'rgba(12,26,51,0.3)',
      }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={500}
          placeholder={
            activeChannel === 'system'
              ? (currentSystemId ? `Message ${currentSystemId}...` : 'Not in a system')
              : 'Message everyone...'
          }
          disabled={activeChannel === 'system' && !currentSystemId}
          style={{
            flex: 1,
            background: '#0b1424',
            border: `1px solid ${EDGE}`,
            color: '#e2e8f0',
            padding: '5px 8px',
            fontSize: 11,
            fontFamily: FM,
            borderRadius: 2,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || (activeChannel === 'system' && !currentSystemId)}
          style={{
            background: draft.trim() ? `${BLUE.pri}33` : 'transparent',
            border: `1px solid ${draft.trim() ? BLUE.pri : EDGE}`,
            color: draft.trim() ? BLUE.light : '#4a5a6a',
            padding: '5px 12px',
            fontSize: 10,
            fontFamily: F,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
            borderRadius: 2,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
