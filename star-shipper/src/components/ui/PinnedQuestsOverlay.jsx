// PinnedQuestsOverlay
// ====================
// Persistent top-of-screen tiles for the player's pinned active
// quests. Sits just below the GameFrame top bar, centered horizontally.
// Replaces the "Current Quest" section in the Outliner (which was
// hard to spot among the rest of the sidebar density).
//
// Behavior:
//   * Reads gameStore.quests, shows only status='active' + pinned=true.
//   * Each tile has an unpin (✕) so the player can clear focus.
//   * New tiles fade+slide in (entry animation keyed on quest_id).
//   * Tutorial quests are auto-pinned server-side -- non-tutorial
//     quests start unpinned, the player chooses what to focus from
//     the Missions window.
//   * Completion of a pinned quest naturally removes the tile (status
//     flips to 'completed'); the QuestToast (App.jsx) already fires
//     the "Quest Completed: X" notification for the in-the-moment
//     "this just happened" signal.

import React, { useMemo } from 'react';
import { useGameStore } from '@/stores/gameStore';

const EDGE = '#1a3050';
const GOLD = { pri: '#f59e0b', light: '#fbbf24' };
const BLUE = { pri: '#3b82f6', light: '#60a5fa' };
const F  = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";

// Category accents -- tutorial gets gold to signal "guided",
// main/side/faction get distinct hues so the player can scan their
// pinned list and recognize what kind of work each tile represents.
const CATEGORY_ACCENT = {
  tutorial: { pri: '#f59e0b', light: '#fbbf24', label: 'TUTORIAL' },
  main:     { pri: '#22d3ee', light: '#67e8f9', label: 'MAIN'     },
  side:     { pri: '#a855f7', light: '#c084fc', label: 'SIDE'     },
  faction:  { pri: '#ef4444', light: '#f87171', label: 'FACTION'  },
};

const accentFor = (cat) => CATEGORY_ACCENT[cat] || { pri: BLUE.pri, light: BLUE.light, label: (cat || 'QUEST').toUpperCase() };

export const PinnedQuestsOverlay = () => {
  const quests = useGameStore(state => state.quests);
  const pinQuest = useGameStore(state => state.pinQuest);

  const pinned = useMemo(
    () => (quests || [])
      .filter(q => q.status === 'active' && q.pinned)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [quests]
  );

  if (pinned.length === 0) return null;

  return (
    <>
      {/* Keyframes scoped inline so this component is self-contained --
          no global CSS file edit needed for the entry animation. */}
      <style>{`
        @keyframes pinned-quest-in {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.98); }
          60%  { opacity: 1; transform: translateY(0) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pinned-quest-pulse {
          0%, 100% { box-shadow: 0 0 0 0 transparent; }
          50%      { box-shadow: 0 0 12px 2px var(--pulse-color, #fbbf24aa); }
        }
      `}</style>
      <div
        className="fixed z-20"
        style={{
          top: 52,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'none', // tiles re-enable individually
          maxWidth: '90vw',
        }}
      >
        {pinned.map(q => (
          <PinnedTile key={q.quest_id} quest={q} onUnpin={() => pinQuest(q.quest_id, false)} />
        ))}
      </div>
    </>
  );
};

const PinnedTile = ({ quest, onUnpin }) => {
  const accent = accentFor(quest.category);
  return (
    <div
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '8px 14px',
        minWidth: 360,
        maxWidth: 520,
        background: 'rgba(8,14,28,0.92)',
        border: `1px solid ${accent.pri}55`,
        borderLeft: `3px solid ${accent.pri}`,
        borderRadius: 3,
        backdropFilter: 'blur(4px)',
        animation: 'pinned-quest-in 0.45s ease-out, pinned-quest-pulse 1.6s ease-out',
        ['--pulse-color']: `${accent.pri}aa`,
      }}
    >
      {/* Pin icon */}
      <div style={{
        fontSize: '0.8125rem',
        color: accent.light,
        marginTop: 1,
        textShadow: `0 0 6px ${accent.pri}66`,
      }}>📌</div>

      {/* Title + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: '0.6875rem', fontFamily: F, fontWeight: 800,
          color: accent.light, letterSpacing: 0.5,
        }}>
          <span>{quest.title}</span>
          <span style={{
            fontSize: '0.5rem', fontFamily: FM, fontWeight: 700,
            color: accent.pri, opacity: 0.65, letterSpacing: 1.2,
          }}>
            {accent.label}
          </span>
        </div>
        <div style={{
          fontSize: '0.8rem', color: '#a8b4c5', fontFamily: F,
          lineHeight: 1.4, marginTop: 2,
        }}>
          {quest.description}
        </div>
      </div>

      {/* Unpin */}
      <button
        onClick={onUnpin}
        title="Unpin quest"
        style={{
          background: 'transparent', border: `1px solid ${EDGE}`,
          color: '#5a6a7a', width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', borderRadius: 2,
          fontSize: '0.8rem', fontFamily: F, lineHeight: 1,
          flexShrink: 0, marginTop: 1,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#a04040'; e.currentTarget.style.borderColor = '#5a3030'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#5a6a7a'; e.currentTarget.style.borderColor = EDGE; }}
      >
        ✕
      </button>
    </div>
  );
};

export default PinnedQuestsOverlay;
