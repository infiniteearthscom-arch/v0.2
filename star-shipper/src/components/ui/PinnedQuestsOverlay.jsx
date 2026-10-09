// PinnedQuestsOverlay
// ====================
// Persistent top-of-screen tiles for the player's pinned active
// quests. Sits below the fleet-status readout + activity ticker stack,
// centered horizontally.
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

import React, { useMemo, useEffect, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { resourcesAPI } from '@/utils/api';

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
  // Active contracts ride in the same stack (2026-09-22) so the pilot
  // always sees where the freight goes and how long is left.
  const allActive = useGameStore(state => state.activeContracts) || [];
  const contracts = useMemo(() => allActive.filter(c => c.pinned !== false), [allActive]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!contracts.length) return undefined;
    const t = setInterval(() => tick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, [contracts.length]);
  // Tracked recipes (2026-10-08): have/need per ingredient from the fleet
  // hold, polled while anything is tracked (10 s; cheap, same endpoint the
  // Cargo window polls at 5 s).
  const recipes = useGameStore(state => state.pinnedRecipes) || [];
  const unpinRecipe = useGameStore(state => state.unpinRecipe);
  const [have, setHave] = useState({});
  useEffect(() => {
    if (!recipes.length) return undefined;
    let cancelled = false;
    const poll = () => resourcesAPI.getInventory().then(d => {
      if (cancelled) return;
      const totals = {};
      for (const r of (d?.inventory || [])) totals[r.resource_name] = (totals[r.resource_name] || 0) + (r.stacks || []).reduce((a, st) => a + (Number(st.quantity) || 0), 0);
      setHave(totals);
    }).catch(() => {});
    poll();
    const t = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [recipes.length]);

  if (pinned.length === 0 && contracts.length === 0 && recipes.length === 0) return null;

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
          // TOP-RIGHT (owner 2026-10-08): the centre stack sat under the
          // menu windows at smaller resolutions, exactly when the pilot
          // needs the quest text while working a window. Under the top
          // bar, clear of the fleet readout (top-centre) and the chat
          // panel (bottom-right). The trade-invite toast shares this
          // corner briefly and sits above.
          top: 70,
          right: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'none', // tiles re-enable individually
          width: 'min(340px, calc(100vw - 24px))',
          maxHeight: 'calc(100vh - 140px)',
          overflowY: 'auto',
        }}
      >
        {pinned.map(q => (
          <PinnedTile key={q.quest_id} quest={q} onUnpin={() => pinQuest(q.quest_id, false)} />
        ))}
        {contracts.map(c => <ContractTile key={c.id} contract={c} />)}
        {recipes.map(r => <RecipeTile key={r.id} recipe={r} have={have} onUnpin={() => unpinRecipe(r.id)} />)}
      </div>
    </>
  );
};

const ContractTile = ({ contract: c }) => {
  const isFetch = c.contract_type === 'fetch';
  const isBounty = c.contract_type === 'bounty';
  const left = Math.max(0, Math.round((new Date(c.deadline_at).getTime() - Date.now()) / 60000));
  const urgent = left < 5;
  const accent = urgent ? { pri: '#ef4444', light: '#f87171' } : isFetch ? { pri: '#22d3ee', light: '#67e8f9' } : isBounty ? { pri: '#ef4444', light: '#fca5a5' } : { pri: GOLD.pri, light: GOLD.light };
  const missingFreight = !isFetch && !isBounty && c.freight_units != null && c.freight_units < c.cargo_volume;
  return (
    <div style={{
      pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 14px',
      width: '100%', background: 'rgba(8,14,28,0.92)', boxSizing: 'border-box',
      border: `1px solid ${accent.pri}55`, borderLeft: `3px solid ${accent.pri}`, borderRadius: 3, backdropFilter: 'blur(4px)',
    }}>
      <div style={{ fontSize: '0.8125rem', color: accent.light, marginTop: 1 }}>{isFetch ? '⛏' : isBounty ? '🎯' : '📦'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.6875rem', fontFamily: F, fontWeight: 800, color: accent.light, letterSpacing: 0.5 }}>
          <span>{isFetch ? `Bring ${c.cargo_volume} × ${c.cargo_label}` : c.cargo_label}</span>
          <span style={{ fontSize: '0.5rem', fontFamily: FM, fontWeight: 700, color: accent.pri, opacity: 0.65, letterSpacing: 1.2 }}>
            {isFetch ? 'FETCH' : isBounty ? 'BOUNTY' : 'HAUL'}{c.contested ? ' · CONTESTED' : ''}{c.rush ? ' · RUSH' : ''}
          </span>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#a8b4c5', fontFamily: F, lineHeight: 1.4, marginTop: 2 }}>
          {isFetch || isBounty ? 'turn in at' : 'deliver to'} {c.dest_station}, {c.dest_system_name} ·{' '}
          <span style={{ color: urgent ? '#f87171' : '#a8b4c5' }}>{left} min</span> · {Number(c.reward).toLocaleString()} CR
          {isFetch && <span> · have {c.have_qualifying || 0}/{c.cargo_volume}</span>}
          {isBounty && <span> · kills {c.progress || 0}/{c.cargo_volume}</span>}
          {missingFreight && <span style={{ color: '#f87171' }}> · freight lost — reclaim your wreck</span>}
        </div>
      </div>
    </div>
  );
};

// Tracked recipe: one row per ingredient, have/need from the fleet hold.
// Green when covered, amber while short; the header turns green when the
// whole recipe is covered. Unpin with ✕ (or Untrack in the Crafting window).
const RecipeTile = ({ recipe, have, onUnpin }) => {
  const rows = (recipe.ingredients || []).map(g => ({ ...g, have: have[g.resource_name] || 0 }));
  const ready = rows.length > 0 && rows.every(r => r.have >= r.quantity);
  const accent = ready ? { pri: '#22c55e', light: '#4ade80' } : { pri: '#a855f7', light: '#c084fc' };
  return (
    <div style={{
      pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 14px',
      width: '100%', boxSizing: 'border-box', background: 'rgba(8,14,28,0.92)',
      border: `1px solid ${accent.pri}55`, borderLeft: `3px solid ${accent.pri}`, borderRadius: 3, backdropFilter: 'blur(4px)',
    }}>
      <div style={{ fontSize: '0.8125rem', color: accent.light, marginTop: 1 }}>⚒</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.6875rem', fontFamily: F, fontWeight: 800, color: accent.light, letterSpacing: 0.5 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipe.name}</span>
          <span style={{ fontSize: '0.5rem', fontFamily: FM, fontWeight: 700, color: accent.pri, opacity: 0.65, letterSpacing: 1.2, flexShrink: 0 }}>{ready ? 'READY TO CRAFT' : 'RECIPE'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', columnGap: 10, rowGap: 1, marginTop: 3, fontFamily: FM, fontSize: '0.75rem' }}>
          {rows.map(r => {
            const ok = r.have >= r.quantity;
            return (
              <React.Fragment key={r.resource_name}>
                <span style={{ color: ok ? '#86efac' : '#c9d4e2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.resource_name}</span>
                <span style={{ color: ok ? '#4ade80' : '#fbbf24', textAlign: 'right' }}>{Math.min(r.have, r.quantity)}/{r.quantity}{ok ? ' ✓' : ` · need ${r.quantity - r.have}`}</span>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <button onClick={onUnpin} title="Stop tracking this recipe"
        style={{ background: 'transparent', border: `1px solid ${EDGE}`, color: '#5a6a7a', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 2, fontSize: '0.8rem', fontFamily: F, lineHeight: 1, flexShrink: 0, marginTop: 1 }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#a04040'; e.currentTarget.style.borderColor = '#5a3030'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#5a6a7a'; e.currentTarget.style.borderColor = EDGE; }}>✕</button>
    </div>
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
        width: '100%',
        boxSizing: 'border-box',
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
