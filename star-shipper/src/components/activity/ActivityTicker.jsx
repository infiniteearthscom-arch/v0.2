// ActivityTicker -- Social Multiplayer Step 3.
// =============================================================
// Thin top-center strip showing the most recent galaxy activity event
// with a slide-up animation when a new event arrives. Click to expand
// into a panel showing the last ~10 events. Self-disables when the
// presence feature flag is off.
//
// Data flow:
//   utils/activity.js singleton owns the buffer + socket subscription.
//   This component subscribes to 'event' for re-render triggers and
//   resolves system_id -> human-readable name client-side via the
//   galaxy generator (so the server doesn't need to know names).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import activity from '@/utils/activity';
import { generateGalaxy } from '@/utils/galaxyGenerator';

const GALAXY_SEED = 12345;
const SYSTEM_COUNT = 200;

// Cache the galaxy systemMap once at module load -- the generator is
// deterministic and the same one GalaxyMapWindow uses. We only need the
// id->name lookup for the ticker.
let _systemMap = null;
function getSystemName(systemId) {
  if (!systemId) return null;
  // 'sol' is the hardcoded starter system; not in the generator's
  // procedural set. Hand-resolve.
  if (systemId === 'sol') return 'Sol';
  if (!_systemMap) {
    try {
      _systemMap = generateGalaxy(GALAXY_SEED, SYSTEM_COUNT).systemMap;
    } catch {
      _systemMap = {};
    }
  }
  const sys = _systemMap[systemId];
  return sys?.name || null;
}

const EDGE = '#1a3050';
const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";

// Format event -> { icon, color, text }. Per-type so we can tweak any
// one rendering without affecting the others.
function formatEvent(evt) {
  const name = evt.sender_name || 'Pilot';
  const p = evt.payload || {};
  switch (evt.type) {
    case 'system_discovered': {
      const sysName = getSystemName(evt.system_id) || p.system_name || evt.system_id || 'an uncharted system';
      return {
        icon: '⭐',
        color: '#fbbf24',
        text: `${name} discovered ${sysName}`,
      };
    }
    case 'module_crafted': {
      const mod = p.module_name || 'a module';
      const q = (typeof p.quality === 'number') ? ` (Q${p.quality})` : '';
      return {
        icon: '⚒',
        color: '#a855f7',
        text: `${name} crafted ${mod}${q}`,
      };
    }
    case 'ship_purchased': {
      const hull = p.hull_name || 'a new hull';
      return {
        icon: '🚀',
        color: '#22d3ee',
        text: `${name} acquired ${hull}`,
      };
    }
    case 'corp_founded': {
      return {
        icon: '🛡️',
        color: '#fbbf24',
        text: `${name} founded [${p.corp_ticker || '???'}] ${p.corp_name || 'a corporation'}`,
      };
    }
    case 'trade_completed': {
      return {
        icon: '🤝',
        color: '#4ade80',
        text: `${name} traded with ${p.partner_name || 'another pilot'}`,
      };
    }
    case 'bounty_claimed': {
      const tgt = p.target_hull === 'any' ? 'a pirate' : `a Pirate ${p.target_hull}`;
      const reward = (typeof p.reward === 'number')
        ? ` for ${p.reward.toLocaleString()}cr`
        : '';
      return {
        icon: '🎯',
        color: '#ef4444',
        text: `${name} claimed a bounty on ${tgt}${reward}`,
      };
    }
    default:
      return { icon: '◆', color: '#94a3b8', text: `${name} did something` };
  }
}

function formatAge(ts, now) {
  const sec = Math.max(0, Math.round((now - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

export const ActivityTicker = () => {
  const [latest, setLatest] = useState(() => activity.getLatest());
  const [tick, setTick] = useState(0); // re-render every 30s for age refresh
  const [expanded, setExpanded] = useState(false);
  // Stable per-event animation key. Bumping it remounts the content
  // div, which triggers the CSS slide-up animation.
  const animKeyRef = useRef(0);

  // Hydrate + subscribe to live events.
  useEffect(() => {
    if (!activity.isEnabled()) return;
    activity.loadEvents().then(() => {
      setLatest(activity.getLatest());
      animKeyRef.current += 1;
      setTick(t => t + 1);
    });
    const unsub = activity.on('event', (evt) => {
      setLatest(evt);
      animKeyRef.current += 1;
    });
    return unsub;
  }, []);

  // Age refresh: bump the tick every 30s so "12s ago" -> "42s ago" etc.
  // No animation -- just a text update.
  useEffect(() => {
    const t = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(t);
  }, []);

  if (!activity.isEnabled()) return null;
  if (!latest) return null; // hide entirely until something happens

  const now = Date.now();
  const f = formatEvent(latest);

  return (
    <>
      {/* Inline keyframes -- single-instance component, scoping not
          worth the complexity. The slide-up + fade-in plays whenever
          the key changes (new event arrives). */}
      <style>{`
        @keyframes act-slide-up {
          0%   { transform: translateY(8px); opacity: 0; }
          100% { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      <div
        onClick={() => setExpanded(e => !e)}
        title={expanded ? 'Hide activity log' : 'Click to see recent activity'}
        style={{
          position: 'fixed',
          top: 38,
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '60vw',
          minWidth: 260,
          height: 24,
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(8,14,28,0.85)',
          border: `1px solid ${EDGE}`,
          borderRadius: 3,
          fontFamily: F,
          fontSize: 11,
          color: '#cbd5e1',
          cursor: 'pointer',
          zIndex: 35,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
        }}
      >
        <div
          key={animKeyRef.current}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            animation: 'act-slide-up 320ms ease-out',
          }}
        >
          <span style={{ fontSize: 12 }}>{f.icon}</span>
          <span style={{ color: f.color, fontWeight: 700, letterSpacing: 0.3 }}>{f.text}</span>
        </div>
        <span style={{ color: '#475569', fontFamily: FM, fontSize: 9 }}>
          {formatAge(latest.ts, now)} ago
        </span>
      </div>

      {/* Expanded panel: last ~10 events, oldest at bottom (newest at
          top so the eye lands on the freshest line). */}
      {expanded && <ActivityExpandedPanel now={now} onClose={() => setExpanded(false)} />}
    </>
  );
};

const ActivityExpandedPanel = ({ now, onClose }) => {
  const all = activity.getEvents();
  // Show newest first, cap at 10 lines so the panel stays compact.
  const recent = all.slice(-10).reverse();
  return (
    <div
      style={{
        position: 'fixed',
        top: 68,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 420,
        maxHeight: 280,
        overflowY: 'auto',
        background: 'rgba(8,14,28,0.96)',
        border: `1px solid ${EDGE}`,
        borderRadius: 3,
        padding: '6px 0',
        fontFamily: F,
        zIndex: 36,
        boxShadow: '0 4px 14px rgba(0,0,0,0.55)',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 12px 4px',
        borderBottom: `1px solid ${EDGE}`,
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 9, color: '#7a8a9a', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>
          Galaxy Activity
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', color: '#7a8a9a',
            fontSize: 12, cursor: 'pointer', padding: '0 4px',
          }}
          title="Close"
        >×</button>
      </div>
      {recent.length === 0 ? (
        <div style={{ padding: 12, color: '#475569', fontSize: 10, fontStyle: 'italic', textAlign: 'center' }}>
          No activity yet.
        </div>
      ) : recent.map((evt) => {
        const f = formatEvent(evt);
        return (
          <div key={evt.id} style={{
            padding: '4px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
          }}>
            <span style={{ fontSize: 12 }}>{f.icon}</span>
            <span style={{ color: f.color, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.text}
            </span>
            <span style={{ color: '#475569', fontFamily: FM, fontSize: 9 }}>
              {formatAge(evt.ts, now)} ago
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default ActivityTicker;
