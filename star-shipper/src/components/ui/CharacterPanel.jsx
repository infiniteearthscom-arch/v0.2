// CharacterPanel -- Player identity, fleet overview, skills summary,
// and reputation placeholder. The skills section reads live data from
// the gameStore (populated by fetchSkillsAndResearch); reputation is
// still a placeholder pending the faction-standing system.

import React, { useEffect, useState } from 'react';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { useGameStore, useActiveShip } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';
import { playSound } from '@/utils/audio';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

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

const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
const EDGE = '#1a3050';
const BLUE = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD = { light: '#fbbf24' };

// Reusable section header matching the rest of the game's aesthetic
const SectionHead = ({ title, accent = BLUE.light, icon, right }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
    borderLeft: `2px solid ${accent}`,
    background: `linear-gradient(90deg, ${accent}18, transparent)`,
    padding: '5px 10px',
  }}>
    {icon && <span style={{ marginRight: 6, fontSize: '0.75rem' }}>{icon}</span>}
    <span style={{
      fontSize: '0.6875rem',
      fontWeight: 800,
      color: accent,
      letterSpacing: 1.5,
      fontFamily: F,
      textTransform: 'uppercase',
      flex: 1,
    }}>{title}</span>
    {right && <span style={{ fontSize: '0.9rem', color: '#3a5a6a', fontFamily: FM }}>{right}</span>}
  </div>
);

// A single stat row inside a section
const StatRow = ({ label, value, color = '#c8d6e5' }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 2px',
    fontSize: '0.9rem',
    fontFamily: FM,
    borderBottom: '1px solid rgba(26,48,80,0.3)',
  }}>
    <span style={{ color: '#4a6580' }}>{label}</span>
    <span style={{ color, fontWeight: 700 }}>{value}</span>
  </div>
);

// A teaser row for placeholder content — shows a category that's "coming soon"
const TeaserRow = ({ icon, label, detail }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: 'rgba(4,8,16,0.5)',
    border: `1px solid ${EDGE}`,
    borderRadius: 3,
    marginBottom: 3,
    opacity: 0.75,
  }}>
    <span style={{ fontSize: '0.875rem' }}>{icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '0.6875rem', color: '#a0b0c0', fontWeight: 700, fontFamily: F }}>{label}</div>
      {detail && <div style={{ fontSize: '0.9rem', color: '#3a5a6a', fontFamily: FM }}>{detail}</div>}
    </div>
    <span style={{
      fontSize: '0.5rem',
      color: '#4a6080',
      fontFamily: FM,
      letterSpacing: 1,
      padding: '2px 6px',
      border: `1px solid ${EDGE}`,
      borderRadius: 2,
    }}>SOON</span>
  </div>
);

// Active flying fleet cap. Matches GameFrame's MAX_FLEET; if either
// constant moves, update both. (Kept inline here rather than imported
// because GameFrame doesn't currently export it.)
const MAX_FLEET = 5;

export const CharacterPanel = () => {
  const { user } = useAuthStore();
  const credits = useGameStore(state => state.resources?.credits ?? 0);
  const ships = useGameStore(state => state.ships);
  const activeShip = useActiveShip();
  const discoveredSystems = useGameStore(state => state.discoveredSystems);
  const playerHull = useGameStore(state => state.playerHull);
  const playerMaxHull = useGameStore(state => state.playerMaxHull);

  // Skills (real data, populated by fetchSkillsAndResearch).
  const skills = useGameStore(state => state.skills);
  const skillQueue = useGameStore(state => state.skillQueue);
  const skillsLoaded = useGameStore(state => state.skillsLoaded);
  const fetchSkillsAndResearch = useGameStore(state => state.fetchSkillsAndResearch);
  const openWindow = useGameStore(state => state.openWindow);

  // Re-render every second so the active training countdown stays live.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // First-load fallback: this panel may be the first thing the player
  // opens after login (before SystemView mounts and auto-fetches).
  useEffect(() => {
    if (!skillsLoaded && fetchSkillsAndResearch) fetchSkillsAndResearch();
  }, [skillsLoaded, fetchSkillsAndResearch]);

  // Active (flying) fleet count -- stored ships are excluded.
  const fleetSize = (ships || []).filter(s => s.storage_body_id == null).length;
  const systemsVisited = discoveredSystems instanceof Set
    ? discoveredSystems.size
    : (Array.isArray(discoveredSystems) ? discoveredSystems.length : 0);

  // Skills summary derivations.
  const trainedSkills = (skills || []).filter(s => (s.level || 0) > 0);
  const totalSP = trainedSkills.reduce((sum, s) => sum + (s.sp_at_current_level || 0), 0);

  // Top categories by SP invested. Aggregates every trained skill's
  // sp_at_current_level into its category bucket and surfaces the top 3.
  const categoryTotals = {};
  for (const s of trainedSkills) {
    const cat = s.category || 'Uncategorized';
    if (!categoryTotals[cat]) categoryTotals[cat] = { sp: 0, count: 0 };
    categoryTotals[cat].sp += s.sp_at_current_level || 0;
    categoryTotals[cat].count += 1;
  }
  const topCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1].sp - a[1].sp)
    .slice(0, 3);

  // Active training: queue head + matching skill def.
  const head = skillQueue?.[0];
  const trainingSkill = head ? (skills || []).find(s => s.id === head.skill_id) : null;
  const trainingProgress = (() => {
    if (!head || !trainingSkill) return null;
    const start = new Date(head.started_at).getTime();
    const end = new Date(head.finishes_at).getTime();
    const now = Date.now();
    const pct = end > start ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 0;
    return { pct, remainMs: Math.max(0, end - now), targetLevel: head.target_level };
  })();

  return (
    <ContextPanel
      windowId="character"
      title="Character"
      icon="👤"
      accent={BLUE.light}
      width={380}
    >
      {/* Identity block */}
      <div style={{
        background: `linear-gradient(135deg, ${BLUE.pri}18, transparent)`,
        border: `1px solid ${BLUE.dim}`,
        borderRadius: 3,
        padding: '10px 12px',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            background: `linear-gradient(135deg, ${BLUE.pri}, ${BLUE.dim})`,
            border: `1px solid ${BLUE.light}55`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
          }}>👤</div>
          <div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#e2e8f0', fontFamily: F }}>
              CMDR {user?.displayName || user?.username || 'Unknown'}
            </div>
            <div style={{ fontSize: '0.9rem', color: BLUE.light, fontFamily: FM, letterSpacing: 1 }}>
              INDEPENDENT PILOT
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.9rem',
          fontFamily: FM,
          paddingTop: 8,
          borderTop: `1px solid ${EDGE}`,
        }}>
          <span style={{ color: '#4a6580' }}>CREDITS</span>
          <span style={{ color: GOLD.light, fontWeight: 700 }}>⬡ {credits.toLocaleString()} CR</span>
        </div>
      </div>

      {/* Fleet overview - real data */}
      <SectionHead title="Fleet Overview" accent={BLUE.light} icon="🚀" right={`${fleetSize}/${MAX_FLEET}`} />
      <div style={{
        background: 'rgba(4,8,16,0.5)',
        border: `1px solid ${EDGE}`,
        borderRadius: 3,
        padding: '8px 10px',
        marginBottom: 14,
      }}>
        <StatRow label="Active Ship" value={activeShip?.name || '—'} />
        <StatRow label="Hull Class" value={activeShip?.hull_name || '—'} />
        <StatRow
          label="Hull Integrity"
          value={playerMaxHull > 0 ? `${playerHull}/${playerMaxHull}` : '—'}
          color={playerMaxHull > 0 && playerHull / playerMaxHull > 0.6 ? '#22c55e'
            : playerMaxHull > 0 && playerHull / playerMaxHull > 0.3 ? '#fbbf24'
            : playerMaxHull > 0 ? '#ef4444' : '#c8d6e5'}
        />
        <StatRow label="Ships in Fleet" value={`${fleetSize} / ${MAX_FLEET}`} />
        <StatRow label="Systems Explored" value={`${systemsVisited}`} color={BLUE.light} />
      </div>

      {/* Skills -- real data from gameStore. Shows active training,
          career totals, and the top specializations; full management
          UX lives in the Skills & Research window. */}
      <SectionHead
        title="Skills"
        accent={BLUE.light}
        icon="🧠"
        right={skillsLoaded ? `${trainedSkills.length} trained` : 'loading...'}
      />

      {/* Active training tile -- only when something is in the queue.
          Live progress bar driven by the 1s tick above. */}
      {trainingProgress && trainingSkill && (
        <div style={{
          background: `linear-gradient(135deg, ${BLUE.pri}1c, transparent)`,
          border: `1px solid ${BLUE.pri}55`,
          borderRadius: 3,
          padding: '8px 10px',
          marginBottom: 8,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 6,
          }}>
            <span style={{ fontSize: '0.9rem', color: BLUE.light, fontWeight: 700, letterSpacing: 0.5, fontFamily: F, textTransform: 'uppercase' }}>
              Training
            </span>
            <span style={{ fontSize: '0.9rem', color: '#3a5a6a', fontFamily: FM }}>
              {formatDuration(trainingProgress.remainMs)}
            </span>
          </div>
          <div style={{ fontSize: '0.6875rem', color: '#e2e8f0', fontWeight: 700, marginBottom: 6, fontFamily: F }}>
            {trainingSkill.name} → {ROMAN[trainingProgress.targetLevel] || trainingProgress.targetLevel}
          </div>
          <div style={{
            width: '100%',
            height: 4,
            background: '#0a1528',
            borderRadius: 2,
            border: `1px solid ${EDGE}`,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${trainingProgress.pct * 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${BLUE.pri}, ${BLUE.light})`,
              transition: 'width 1s linear',
            }} />
          </div>
        </div>
      )}

      {/* Career totals + Top specializations */}
      <div style={{
        background: 'rgba(4,8,16,0.5)',
        border: `1px solid ${EDGE}`,
        borderRadius: 3,
        padding: '8px 10px',
        marginBottom: 8,
      }}>
        <StatRow label="Skills Trained" value={`${trainedSkills.length}`} />
        <StatRow label="Total SP" value={totalSP.toLocaleString()} color={BLUE.light} />
        <StatRow label="Queue" value={`${skillQueue?.length || 0} skill${(skillQueue?.length || 0) === 1 ? '' : 's'}`} />
      </div>

      {topCategories.length > 0 && (
        <>
          <div style={{
            fontSize: '0.9rem',
            color: '#3a5a6a',
            fontFamily: FM,
            letterSpacing: 1,
            textTransform: 'uppercase',
            padding: '0 2px 4px',
          }}>
            Top Specializations
          </div>
          <div style={{
            background: 'rgba(4,8,16,0.5)',
            border: `1px solid ${EDGE}`,
            borderRadius: 3,
            padding: '6px 10px',
            marginBottom: 8,
          }}>
            {topCategories.map(([cat, agg]) => (
              <div key={cat} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '3px 0',
                fontSize: '0.9rem',
                fontFamily: FM,
              }}>
                <span style={{ color: '#c8d6e5' }}>
                  {cat}
                  <span style={{ color: '#3a5a6a', marginLeft: 6 }}>
                    ({agg.count} skill{agg.count === 1 ? '' : 's'})
                  </span>
                </span>
                <span style={{ color: BLUE.light, fontWeight: 700 }}>{agg.sp.toLocaleString()} SP</span>
              </div>
            ))}
          </div>
        </>
      )}

      {skillsLoaded && trainedSkills.length === 0 && (
        <div style={{
          fontSize: '0.9rem',
          color: '#4a6580',
          fontFamily: F,
          fontStyle: 'italic',
          padding: '6px 10px',
          marginBottom: 8,
        }}>
          No skills trained yet. Open the Skills & Research window to start your queue.
        </div>
      )}

      <button
        onClick={() => { playSound('button_click'); openWindow('research'); }}
        style={{
          width: '100%',
          padding: '7px 10px',
          background: `${BLUE.pri}18`,
          border: `1px solid ${BLUE.pri}55`,
          color: BLUE.light,
          fontSize: '0.9rem',
          fontFamily: F,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          cursor: 'pointer',
          borderRadius: 3,
          marginBottom: 14,
        }}
      >
        → Open Skills &amp; Research
      </button>

      {/* Reputation placeholder */}
      <SectionHead title="Reputation" accent="#f59e0b" icon="🤝" right="COMING SOON" />
      <div style={{
        fontSize: '0.9rem',
        color: '#4a6580',
        fontFamily: F,
        lineHeight: 1.5,
        padding: '6px 10px',
        marginBottom: 8,
      }}>
        Build standing with the four factions for better prices, access, and quests.
      </div>
      <TeaserRow icon="🟦" label="Terran Accord" detail="Military · core systems" />
      <TeaserRow icon="🟨" label="Free Merchants Guild" detail="Trade · jump gate network" />
      <TeaserRow icon="🟪" label="Astral Collective" detail="Research · outer systems" />
      <TeaserRow icon="🟥" label="Void Reavers" detail="Pirates · hostile" />

      <div style={{ height: 8 }} />
    </ContextPanel>
  );
};

export default CharacterPanel;
