// ActiveTrainingIndicator
// ========================
// Renders the player's currently-training skill (live progress bar +
// ETA) and Research Points balance. Used in two places:
//   1. GameFrame TopBar -- compact variant pinned in the global header.
//   2. SkillsResearchWindow header -- larger variant inside the window
//      so the player can see what's happening while they manage their
//      queue.
//
// Skill progress is computed locally each second from the queue head's
// pre-computed started_at / finishes_at, so no server polling is
// needed for the visual to advance. When the head's finishes_at slips
// into the past, the component triggers a fetchSkillsAndResearch to
// refresh the queue from the server (which commits the level bump and
// advances the queue position).

import React, { useEffect, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

const formatDuration = (ms) => {
  if (ms <= 0) return 'done';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
};

// Hook: re-renders the host component every second. Cheap; only used
// where it's truly needed (progress bars + countdowns).
const useSecondTick = () => {
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
};

// `variant`:
//   'compact'  -- thin pill suitable for GameFrame's TopBar.
//   'expanded' -- wider, taller, used inside SkillsResearchWindow.
// `onOpenSkills` -- optional click handler; the compact variant uses
//   it to toggle the Skills & Research window when the user clicks.
export const ActiveTrainingIndicator = ({ variant = 'compact', onOpenSkills }) => {
  useSecondTick();
  const skills = useGameStore(s => s.skills);
  const queue = useGameStore(s => s.skillQueue);
  const researchPoints = useGameStore(s => s.researchPoints);
  const skillsLoaded = useGameStore(s => s.skillsLoaded);
  const fetchSkillsAndResearch = useGameStore(s => s.fetchSkillsAndResearch);

  // First-load fallback: the indicator is mounted in the global top
  // bar, so it shows up even when the player isn't in SystemView (the
  // other place that auto-fetches). Without this, opening the game
  // directly into Galaxy Flight would leave the indicator blank until
  // they entered a system. Cheap one-off fetch keyed on skillsLoaded.
  useEffect(() => {
    if (!skillsLoaded && fetchSkillsAndResearch) fetchSkillsAndResearch();
  }, [skillsLoaded, fetchSkillsAndResearch]);

  const head = queue[0];
  const skill = head ? skills.find(s => s.id === head.skill_id) : null;
  const now = Date.now();

  // When the head's training has elapsed past finishes_at, refresh
  // from the server so the queue advances. Dedup'd via a ref so we
  // don't re-fire every second while waiting for the round-trip.
  const [refreshFiredFor, setRefreshFiredFor] = useState(null);
  useEffect(() => {
    if (!head) return;
    const finishesAtMs = new Date(head.finishes_at).getTime();
    const key = `${head.skill_id}@${finishesAtMs}`;
    if (now >= finishesAtMs && refreshFiredFor !== key) {
      setRefreshFiredFor(key);
      if (fetchSkillsAndResearch) fetchSkillsAndResearch();
    }
  }, [head, now, refreshFiredFor, fetchSkillsAndResearch]);

  if (!skillsLoaded) return null;

  // Build the skill progress display. If nothing's training, the
  // pill becomes a quiet "idle" prompt.
  let skillNode;
  if (!head || !skill) {
    // Red + bold so it visibly nags the player instead of blending
    // into the rest of the muted HUD chrome. This bar shows up
    // wherever the indicator mounts (top bar + window header).
    skillNode = (
      <span style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '1px 8px',
        fontSize: variant === 'expanded' ? '0.8rem' : '0.625rem',
        color: '#fca5a5',
        background: 'rgba(127,29,29,0.35)',
        border: '1px solid rgba(239,68,68,0.5)',
        borderRadius: 2,
        fontFamily: "'Share Tech Mono', monospace",
        fontWeight: 700,
        letterSpacing: 0.5,
      }}>
        <span style={{ color: '#ef4444' }}>⚠</span>
        IDLE — QUEUE A SKILL
      </span>
    );
  } else {
    const startedMs = new Date(head.started_at).getTime();
    const finishesMs = new Date(head.finishes_at).getTime();
    const totalMs = Math.max(1, finishesMs - startedMs);
    const elapsedMs = Math.max(0, now - startedMs);
    const pct = Math.min(100, (elapsedMs / totalMs) * 100);
    const remainingMs = Math.max(0, finishesMs - now);

    const barHeight = variant === 'expanded' ? 6 : 4;
    const barWidth = variant === 'expanded' ? 140 : 90;

    skillNode = (
      <>
        <span style={{ fontSize: variant === 'expanded' ? '0.8rem' : '0.625rem' }}>🎓</span>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            fontSize: variant === 'expanded' ? '0.8rem' : '0.5625rem',
            color: '#c8d6e5',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: barWidth + 30,
            lineHeight: 1.1,
          }}>
            {skill.name} <span style={{ color: '#60a5fa' }}>{ROMAN[head.target_level]}</span>
          </div>
          <div style={{
            width: barWidth, height: barHeight,
            background: '#0a1528',
            border: '1px solid #1a3050',
            borderRadius: 2,
            overflow: 'hidden',
            marginTop: 2,
          }}>
            <div style={{
              height: '100%',
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #1d4ed8, #60a5fa)',
              transition: 'width 0.3s linear',
            }} />
          </div>
        </div>
        <span style={{
          fontSize: variant === 'expanded' ? '0.8rem' : '0.5625rem',
          color: '#7a8a9a',
          fontFamily: "'Share Tech Mono', monospace",
          minWidth: 36,
          textAlign: 'right',
        }}>
          {formatDuration(remainingMs)}
        </span>
      </>
    );
  }

  // RP display -- simple counter. No progress bar since unlocks are
  // instant on spend; the "live" feel comes from the counter ticking
  // up via the periodic fetchSkillsAndResearch refresh elsewhere.
  const rpNode = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      paddingLeft: variant === 'expanded' ? 12 : 8,
      borderLeft: '1px solid #1a3050',
    }}>
      <span style={{ fontSize: variant === 'expanded' ? '0.8rem' : '0.625rem' }}>🔬</span>
      <span style={{
        fontSize: variant === 'expanded' ? '0.8rem' : '0.625rem',
        color: '#4ade80',
        fontWeight: 700,
        fontFamily: "'Share Tech Mono', monospace",
      }}>
        {researchPoints.toLocaleString()}
      </span>
      <span style={{
        fontSize: variant === 'expanded' ? '0.8rem' : '0.5rem',
        color: '#3a5a6a',
        fontFamily: "'Share Tech Mono', monospace",
        letterSpacing: 0.5,
      }}>
        RP
      </span>
    </div>
  );

  return (
    <div
      onClick={onOpenSkills}
      title={onOpenSkills ? 'Open Skills & Research' : undefined}
      style={{
        display: 'flex', alignItems: 'center',
        gap: variant === 'expanded' ? 10 : 6,
        padding: variant === 'expanded' ? '6px 12px' : '2px 8px',
        background: 'rgba(4,8,20,0.5)',
        border: '1px solid #1a3050',
        borderLeft: '2px solid #22c55e',
        borderRadius: 3,
        cursor: onOpenSkills ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={onOpenSkills ? (e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.08)'; } : undefined}
      onMouseLeave={onOpenSkills ? (e) => { e.currentTarget.style.background = 'rgba(4,8,20,0.5)'; } : undefined}
    >
      {skillNode}
      {rpNode}
    </div>
  );
};

export default ActiveTrainingIndicator;
