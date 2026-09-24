// Skills & Research Window
// =========================
// Two-tab modal overlay. Skills (EVE-style passive training + queue)
// and Research (Civ-style prereq tech tree with SVG visualizer).
//
// Layout:
//  * Outer: ~90vw / 88vh centered, clip-path diagonal corners to match
//    the rest of the UI chrome. Backdrop closes on click.
//  * Header: title + tab strip + close.
//  * Body:
//     - Skills tab: 3-pane -- categories sidebar | skill list | detail.
//                   Queue strip pinned to the bottom.
//     - Research tab: tree tabs (Propulsion / Weapons / Defense /
//                     Industry / Society) + SVG tree visualizer
//                     showing all nodes of the selected tree with
//                     prereq lines + status-colored nodes. Click an
//                     available node -> unlock prompt.

import React, { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { ActiveTrainingIndicator } from '@/components/ui/ActiveTrainingIndicator';

const EDGE  = '#1a3050';
const BLUE  = { pri: '#3b82f6', light: '#60a5fa', dim: '#1e3a5f' };
const GOLD  = { pri: '#f59e0b', light: '#fbbf24' };
const GREEN = { pri: '#22c55e', light: '#4ade80', dim: '#14532d' };
const F  = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";

const diagMix = (c = 10) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

const formatDuration = (ms) => {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// Bonus contracts that game code actually reads today. Anything not
// listed here is a "catalog only" skill -- the skill row exists in
// the DB + UI but training it has no in-game effect yet. Visual cue
// in the skill list dims those rows so the player can see at a
// glance which skills are wired vs aspirational. Update this set as
// new bonus types get plugged into combat / mining / etc.
const WIRED_BONUS_TYPES = new Set([
  // Combat
  'fleet_damage_pct',           // Gunnery -> weapons.js fleet damage scalar
  // Mining + industry
  'mining_yield_pct',           // /asteroids/mine endpoint
  'crafted_quality_flat',       // /craft endpoint output stat bonus
  // Anomalies (api/anomalies.js, 2026-09-23)
  'probe_cycle_time_pct', 'probe_scan_time_pct', 'probe_scan_deviation_pct', 'probe_scan_strength_pct',
  'salvage_chance_pct', 'data_virus_coherence_flat', 'relic_virus_coherence_flat',
  'reprocessing_yield_pct',     // Processing -> refinery yield (api/refining.js, 2026-09-22)
  'metal_refining_pct',         // Processing / Metallurgy -> refinery yield + cap on ores
  'common_ore_refining_pct',    // Processing / Ore Specialty -> refinery yield on commons
  // Cargo (applied server-side in getPlayerCargoInfo)
  'cargo_capacity_pct',         // Industry / Cargo Handling
  'cargo_volume_pct',           // Logistics / Cargo Compression
  'remote_rep_pct',             // Logistics / Fleet Support -> Repair Nanite Hive rate (2026-09-20)
  'max_planets_flat',           // Planetary / Command Center Upgrades -> +1 harvester slot per planet (2026-09-20)
  // Sensors + scanning
  'sensor_range_pct',           // SystemView fleetSensorRange()
  'scan_time_pct',              // shipStats.js getFleetScanTimeMs()
  'survey_scanner_range_pct',   // shipStats.js getFleetScanRange()
  'area_scan_radius_pct',       // SystemView handleAreaScan
  'bulk_belt_cooldown_pct',     // SystemView handleBeltScan
  'sweep_cooldown_pct',         // SystemView handleSystemSweep
  // Research
  'rp_rate_pct',                // api/research.js RP trickle scalar
]);

// Skills wired by id rather than by bonus contract (e.g. queue cap
// reads the level directly off lead_training_discipline without
// going through bonus_per_level.type). Listed here so they don't
// get the dim "catalog only" treatment despite having a stub-ish
// bonus type.
const WIRED_BY_ID = new Set([
  'lead_training_discipline',   // skills.js BASE_QUEUE + level
]);

const isSkillWired = (skill) =>
  WIRED_BY_ID.has(skill.id) || WIRED_BONUS_TYPES.has(skill.bonus_per_level?.type);

// Tick once a second so the live SP / countdown displays advance.
// Cheap -- nothing re-fetches, just a state bump for derived displays.
const useSecondTick = () => {
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
};

// =================================================================
// SKILLS TAB
// =================================================================

const SkillsTab = () => {
  useSecondTick();
  const skills = useGameStore(s => s.skills);
  const queue = useGameStore(s => s.skillQueue);
  const spPerMin = useGameStore(s => s.skillSpPerMin);
  const maxLevel = useGameStore(s => s.skillMaxLevel);
  const maxQueue = useGameStore(s => s.skillMaxQueue);
  const addSkill = useGameStore(s => s.addSkillToQueue);
  const removeSkill = useGameStore(s => s.removeSkillFromQueue);
  const reorderQueue = useGameStore(s => s.reorderSkillQueue);

  const categories = useMemo(() => {
    const seen = new Map();
    for (const s of skills) {
      if (!seen.has(s.category)) seen.set(s.category, { name: s.category, count: 0 });
      seen.get(s.category).count++;
    }
    return [...seen.values()];
  }, [skills]);

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSkillId, setSelectedSkillId] = useState(null);

  // Default selection: first category, first skill.
  useEffect(() => {
    if (!selectedCategory && categories.length > 0) setSelectedCategory(categories[0].name);
  }, [categories, selectedCategory]);

  const listed = useMemo(
    () => skills.filter(s => s.category === selectedCategory).sort((a, b) => a.sort_order - b.sort_order),
    [skills, selectedCategory]
  );

  useEffect(() => {
    if (!selectedSkillId && listed.length > 0) setSelectedSkillId(listed[0].id);
    if (selectedSkillId && !listed.some(s => s.id === selectedSkillId) && listed.length > 0) {
      setSelectedSkillId(listed[0].id);
    }
  }, [listed, selectedSkillId]);

  const selected = skills.find(s => s.id === selectedSkillId) || null;

  // "Effective level after queue runs" for a given skill -- so the
  // detail panel can show "Train to N" buttons that reflect what the
  // player will end up at when the queue finishes.
  const effectiveLevelFor = (skillId) => {
    const base = skills.find(s => s.id === skillId)?.level || 0;
    const queuedMax = queue.filter(q => q.skill_id === skillId).reduce((m, q) => Math.max(m, q.target_level), 0);
    return Math.max(base, queuedMax);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top: 3-pane */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Categories sidebar */}
        <div style={{ width: 180, borderRight: `1px solid ${EDGE}`, overflowY: 'auto', flexShrink: 0 }}>
          <div style={{ padding: '8px 12px', fontSize: '0.8rem', fontFamily: FM, color: '#3a5a6a', letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Categories
          </div>
          {categories.map(c => {
            const active = c.name === selectedCategory;
            return (
              <div
                key={c.name}
                onClick={() => setSelectedCategory(c.name)}
                style={{
                  padding: '7px 14px',
                  cursor: 'pointer',
                  background: active ? `${BLUE.pri}18` : 'transparent',
                  borderLeft: active ? `2px solid ${BLUE.pri}` : '2px solid transparent',
                  fontSize: '0.8rem',
                  color: active ? '#e2e8f0' : '#7a8a9a',
                  fontFamily: F,
                  fontWeight: active ? 700 : 500,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{c.name}</span>
                <span style={{ fontSize: '0.8rem', color: '#3a5a6a', fontFamily: FM }}>{c.count}</span>
              </div>
            );
          })}
        </div>

        {/* Skill list */}
        <div style={{ flex: '0 0 320px', borderRight: `1px solid ${EDGE}`, overflowY: 'auto' }}>
          <div style={{ padding: '8px 12px', fontSize: '0.8rem', fontFamily: FM, color: '#3a5a6a', letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {selectedCategory || 'Skills'}
          </div>
          {(() => {
            // Find the most recently leveled-up skill in this category
            // so the list can mark it with a "↩ LAST TRAINED" badge --
            // helps the player remember where they left off after a
            // break. Sort gives us the freshest timestamp.
            let lastTrainedId = null;
            let lastTrainedTs = 0;
            for (const s of listed) {
              const t = s.last_leveled_at ? new Date(s.last_leveled_at).getTime() : 0;
              if (t > lastTrainedTs) { lastTrainedTs = t; lastTrainedId = s.id; }
            }
            return listed.map(s => {
            const active = s.id === selectedSkillId;
            const isTraining = queue[0]?.skill_id === s.id;
            const isCompleted = s.level > 0;
            const isLastTrained = s.id === lastTrainedId;
            // Per-skill max level (Training Discipline = 7, others = 5).
            // Falls back to the global maxLevel for old payloads.
            const skMax = s.max_level || maxLevel;
            const isMaxed = s.level >= skMax;
            // Wired = bonus contract that code actually reads (or
            // skill id is referenced directly). Stub skills dim so
            // the player can scan the list and see what's actually
            // worth training right now.
            const wired = isSkillWired(s);
            // Subtitle text -- describes current progress instead of
            // the (confusing) rank multiplier. Rank still shows in the
            // detail panel where it's labeled correctly.
            let subtitleText;
            if (isMaxed) subtitleText = '★ MAX LEVEL';
            else if (s.level > 0) subtitleText = `Lv ${ROMAN[s.level]} · ${skMax - s.level} more level${skMax - s.level === 1 ? '' : 's'}`;
            else subtitleText = `Untrained · ${skMax} levels available`;
            return (
              <div
                key={s.id}
                onClick={() => setSelectedSkillId(s.id)}
                style={{
                  padding: '8px 14px',
                  cursor: 'pointer',
                  background: active
                    ? `${BLUE.pri}18`
                    : isCompleted
                      ? `${GREEN.pri}10`     // green tint for trained skills
                      : 'transparent',
                  borderLeft: active
                    ? `2px solid ${BLUE.light}`
                    : isCompleted
                      ? `2px solid ${GREEN.pri}55`
                      : '2px solid transparent',
                  borderBottom: `1px solid ${EDGE}40`,
                  // Stub skills dim to ~55% so wired ones read first.
                  // Active (selected) skill stays full opacity so the
                  // detail-pane focus is still obvious; same for any
                  // wired skill the player has already trained.
                  opacity: !wired && !active ? 0.55 : 1,
                }}
              >
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: '0.8rem', fontFamily: F, color: isCompleted ? '#e2e8f0' : '#cbd5e1', fontWeight: 600,
                }}>
                  <span>
                    {isCompleted && <span style={{ color: GREEN.light, marginRight: 4 }}>✓</span>}
                    {s.name}
                  </span>
                  <span style={{
                    fontSize: '0.8rem',
                    color: isTraining
                      ? GREEN.light
                      : isMaxed
                        ? GOLD.light
                        : isCompleted
                          ? GREEN.light
                          : '#3a5a6a',
                    fontFamily: FM, fontWeight: 700,
                  }}>
                    {ROMAN[s.level] || '—'}
                  </span>
                </div>
                <div style={{
                  fontSize: '0.8rem',
                  color: isMaxed ? GOLD.light : (isCompleted ? '#86efac' : '#4a6580'),
                  fontFamily: FM, marginTop: 2, letterSpacing: 0.3,
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                }}>
                  <span>{subtitleText}</span>
                  {isTraining && <span style={{ color: GREEN.light }}>· training</span>}
                  {isLastTrained && !isTraining && (
                    <span style={{
                      color: GOLD.light,
                      background: `${GOLD.pri}20`,
                      border: `1px solid ${GOLD.pri}55`,
                      padding: '1px 5px',
                      borderRadius: 2,
                      fontSize: '0.8rem',
                      letterSpacing: 0.5,
                    }}>
                      ↩ LAST TRAINED
                    </span>
                  )}
                  {!wired && (
                    <span
                      title="No in-game effect yet -- this skill's bonus contract is defined but no gameplay system reads it"
                      style={{
                        color: '#64748b',
                        background: 'rgba(100,116,139,0.15)',
                        border: '1px solid rgba(100,116,139,0.35)',
                        padding: '1px 5px',
                        borderRadius: 2,
                        fontSize: '0.8rem',
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      ○ catalog
                    </span>
                  )}
                  {s.requires_tech && !s.tech_unlocked && (
                    <span
                      title={`Requires research: ${s.requires_tech_name || s.requires_tech}`}
                      style={{
                        color: GOLD.light,
                        background: `${GOLD.pri}20`,
                        border: `1px solid ${GOLD.pri}55`,
                        padding: '1px 5px',
                        borderRadius: 2,
                        fontSize: '0.8rem',
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      🔒 {s.requires_tech_name || 'Research'}
                    </span>
                  )}
                </div>
              </div>
            );
            });
          })()}
        </div>

        {/* Detail */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {selected ? (() => {
            const effLevel = effectiveLevelFor(selected.id);
            const isMaxed = effLevel >= (selected.max_level || maxLevel);
            const nextLevel = effLevel + 1;
            const queueFull = queue.length >= maxQueue;
            const bonusText = (() => {
              const b = selected.bonus_per_level;
              if (!b?.type) return null;
              const total = (b.value || 0) * selected.level;
              return `${b.value > 0 ? '+' : ''}${b.value}% per level · ${b.type.replace(/_/g, ' ')} (currently ${total > 0 ? '+' : ''}${total}%)`;
            })();
            return (
              <>
                <div style={{ fontSize: '1.125rem', fontFamily: F, fontWeight: 800, color: '#e2e8f0', letterSpacing: 0.5 }}>
                  {selected.name} <span style={{ color: BLUE.light, fontSize: '0.875rem' }}>{ROMAN[selected.level] || '—'}</span>
                </div>
                <div style={{ fontSize: '0.8rem', fontFamily: FM, color: '#5a7080', marginTop: 4, letterSpacing: 0.5 }}>
                  RANK {selected.rank_multiplier} · {selected.category}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: 12, lineHeight: 1.5, fontFamily: F }}>
                  {selected.description}
                </div>
                {bonusText && (
                  <div style={{
                    marginTop: 12, padding: '8px 10px', background: `${BLUE.pri}10`,
                    borderLeft: `2px solid ${BLUE.pri}`, fontSize: '0.8rem', fontFamily: FM, color: BLUE.light,
                  }}>
                    {bonusText}
                  </div>
                )}

                {/* SP progress */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontFamily: FM, color: '#5a7080', marginBottom: 4 }}>
                    <span>SP: {selected.sp.toLocaleString()}</span>
                    <span>Next: {selected.sp_for_next_level ? selected.sp_for_next_level.toLocaleString() : '— maxed —'}</span>
                  </div>
                  <div style={{ height: 6, background: '#0b1424', border: `1px solid ${EDGE}`, borderRadius: 2, overflow: 'hidden' }}>
                    {selected.sp_for_next_level && (
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, ((selected.sp - selected.sp_at_current_level) / (selected.sp_for_next_level - selected.sp_at_current_level)) * 100)}%`,
                        background: BLUE.light,
                      }} />
                    )}
                  </div>
                </div>

                {/* Tech gate -- locked skills can't be queued. Shows the
                    research prereq with a click-through to open the
                    Research tab on that node (deep-link via gameStore). */}
                {selected.requires_tech && !selected.tech_unlocked && (
                  <div style={{
                    marginTop: 12, padding: '10px 12px',
                    background: `${GOLD.pri}10`,
                    border: `1px solid ${GOLD.pri}55`,
                    borderRadius: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}>
                    <div style={{ fontSize: '0.8rem', fontFamily: FM, color: GOLD.light, letterSpacing: 0.5 }}>
                      🔒 Requires research: <span style={{ color: '#fde68a', fontWeight: 700 }}>{selected.requires_tech_name || selected.requires_tech}</span>
                    </div>
                    <button
                      onClick={() => {
                        // Setting the store target triggers the parent's
                        // useEffect to switch to the Research tab + jump
                        // to the right tree. Single source of truth.
                        useGameStore.getState().setResearchTargetTech?.(selected.requires_tech);
                      }}
                      style={{
                        background: `${GOLD.pri}25`,
                        border: `1px solid ${GOLD.pri}`,
                        color: GOLD.light,
                        padding: '4px 10px',
                        cursor: 'pointer',
                        fontSize: '0.8rem', fontFamily: F, fontWeight: 700, letterSpacing: 0.5,
                        textTransform: 'uppercase', borderRadius: 2, whiteSpace: 'nowrap',
                      }}
                    >
                      → Open Research
                    </button>
                  </div>
                )}

                {/* Train buttons */}
                <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {isMaxed ? (
                    <div style={{ fontSize: '0.8rem', fontFamily: FM, color: GOLD.light }}>★ MAX LEVEL</div>
                  ) : (() => {
                    const techLocked = selected.requires_tech && !selected.tech_unlocked;
                    const disabled = queueFull || techLocked;
                    return (
                      <>
                        <button
                          onClick={() => addSkill(selected.id, nextLevel)}
                          disabled={disabled}
                          style={{
                            background: disabled ? '#1a2030' : `${BLUE.pri}25`,
                            border: `1px solid ${disabled ? EDGE : BLUE.pri}`,
                            color: disabled ? '#4a5a6a' : BLUE.light,
                            padding: '6px 12px',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            fontSize: '0.8rem', fontFamily: F, fontWeight: 700, letterSpacing: 0.5,
                            textTransform: 'uppercase', borderRadius: 2,
                          }}
                        >
                          Queue Train → {ROMAN[nextLevel]}
                        </button>
                        {queueFull && !techLocked && (
                          <div style={{ fontSize: '0.8rem', color: '#7a4040', fontFamily: FM, alignSelf: 'center' }}>
                            Queue full ({maxQueue})
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </>
            );
          })() : (
            <div style={{ fontSize: '0.8rem', color: '#3a5a6a', fontFamily: FM, fontStyle: 'italic' }}>
              Select a skill to view details.
            </div>
          )}
        </div>
      </div>

      {/* Queue strip */}
      <SkillQueueStrip queue={queue} skills={skills} spPerMin={spPerMin} onRemove={removeSkill} onReorder={reorderQueue} />
    </div>
  );
};

const SkillQueueStrip = ({ queue, skills, spPerMin, onRemove, onReorder }) => {
  // Drag-and-drop reorder (2026-09-20). Native HTML5 DnD: drag a row,
  // drop it on another row to take that row's place. Position 0 always
  // trains, so dropping something above the head makes it the new head
  // (the server banks the displaced head's progress).
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const commitDrop = (fromIdx, toIdx) => {
    setDragIdx(null); setOverIdx(null);
    if (fromIdx == null || toIdx == null || fromIdx === toIdx || !onReorder) return;
    const order = queue.map(q => q.position);
    const [moved] = order.splice(fromIdx, 1);
    order.splice(toIdx, 0, moved);
    onReorder(order);
  };
  useSecondTick();
  const skillById = Object.fromEntries(skills.map(s => [s.id, s]));
  const now = Date.now();

  return (
    <div style={{
      borderTop: `1px solid ${EDGE}`,
      background: 'rgba(4,8,16,0.6)',
      padding: '8px 12px',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6,
      }}>
        <div style={{
          fontSize: '0.8rem', fontFamily: FM, color: '#5a7080',
          letterSpacing: 1.5, textTransform: 'uppercase',
        }}>
          Training Queue ({queue.length}/10)
        </div>
        <div style={{ fontSize: '0.8rem', fontFamily: FM, color: '#5a7080' }}>
          {spPerMin} SP/min
        </div>
      </div>
      {queue.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: '#3a5a6a', fontFamily: FM, fontStyle: 'italic' }}>
          No skills queued. Pick a skill above and queue a level.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {queue.map((q, i) => {
            const skill = skillById[q.skill_id];
            const remaining = new Date(q.finishes_at).getTime() - now;
            const isHead = i === 0;
            const isDragging = dragIdx === i;
            const isOver = overIdx === i && dragIdx !== null && dragIdx !== i;
            // Progress fill (2026-09-20): fraction of THIS level's total
            // SP already earned. started_at is the "virtual start" (it
            // sits earlier by any banked progress), so for the head the
            // fraction is (now - start) / (finish - start); for a queued
            // entry the clock hasn't begun -- its chain start is the
            // previous entry's finish, so anything before that is banked.
            const startMs = new Date(q.started_at).getTime();
            const finishMs = new Date(q.finishes_at).getTime();
            const chainStartMs = isHead ? now : new Date(queue[i - 1].finishes_at).getTime();
            const total = Math.max(1, finishMs - startMs);
            const progress = Math.max(0, Math.min(1, (chainStartMs - startMs) / total));
            const fillColor = isHead ? `${GREEN.pri}33` : `${BLUE.pri}22`;
            const baseColor = isOver ? `${BLUE.pri}22` : isHead ? `${GREEN.pri}10` : 'rgba(10,16,28,0.4)';
            return (
              <div
                key={`${q.position}-${q.skill_id}`}
                draggable={!!onReorder}
                onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch {} }}
                onDragOver={(e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); }}
                onDragLeave={() => { if (overIdx === i) setOverIdx(null); }}
                onDrop={(e) => { e.preventDefault(); commitDrop(dragIdx, i); }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                title={onReorder ? 'Drag to reorder — the top entry is the one training' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 8px',
                  background: `linear-gradient(90deg, ${fillColor} 0%, ${fillColor} ${progress * 100}%, ${baseColor} ${progress * 100}%, ${baseColor} 100%)`,
                  border: `1px solid ${isOver ? BLUE.pri : isHead ? `${GREEN.pri}40` : EDGE}`,
                  borderLeft: `3px solid ${isHead ? GREEN.pri : EDGE}`,
                  borderRadius: 2,
                  opacity: isDragging ? 0.4 : 1,
                  cursor: onReorder ? 'grab' : 'default',
                }}
              >
                {onReorder && <span style={{ color: '#3a4a5a', fontSize: '0.8rem', userSelect: 'none' }}>⋮⋮</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontFamily: F, color: '#e2e8f0', fontWeight: 600 }}>
                    {skill?.name || q.skill_id} <span style={{ color: BLUE.light, marginLeft: 4 }}>{ROMAN[q.target_level]}</span>
                    {isHead && <span style={{ color: GREEN.light, marginLeft: 8, fontSize: '0.8rem', fontFamily: FM, letterSpacing: 0.5 }}>TRAINING</span>}
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', fontFamily: FM, color: '#7a8a9a' }} title={`${Math.round(progress * 100)}% of this level trained`}>
                  {progress > 0 && <span style={{ color: isHead ? GREEN.light : BLUE.light, marginRight: 8 }}>{Math.round(progress * 100)}%</span>}
                  {formatDuration(remaining)}
                </div>
                <button
                  onClick={() => onRemove(q.position)}
                  style={{
                    background: 'transparent', border: '1px solid #5a3030',
                    color: '#a04040', padding: '2px 6px', cursor: 'pointer',
                    fontSize: '0.8rem', borderRadius: 2, fontFamily: F,
                  }}
                  title="Cancel"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// =================================================================
// RESEARCH TAB
// =================================================================

const TREES = [
  { id: 'propulsion', label: 'Propulsion', accent: '#22d3ee' },
  { id: 'weapons',    label: 'Weapons',    accent: '#ef4444' },
  { id: 'defense',    label: 'Defense',    accent: '#a855f7' },
  { id: 'industry',   label: 'Industry',   accent: '#f59e0b' },
  { id: 'society',    label: 'Society',    accent: '#22c55e' },
];

const ResearchTab = ({ initialTree }) => {
  useSecondTick();
  const techs = useGameStore(s => s.techs);
  const rpStored = useGameStore(s => s.researchPoints);
  // Cargo resource totals by name, so T3+ node cards can show their
  // material toll as "10× Crystite (have 4)". Fetched when the tab
  // mounts and again whenever a node is unlocked (materials get spent).
  const [resourceCounts, setResourceCounts] = useState({});
  const refreshResourceCounts = React.useCallback(async () => {
    try {
      const { resourcesAPI } = await import('@/utils/api');
      const data = await resourcesAPI.getInventory();
      const counts = {};
      for (const s of (data?.inventory || [])) {
        if (!s?.resource_name) continue;
        counts[s.resource_name] = (counts[s.resource_name] || 0) + (Number(s.quantity) || 0);
      }
      setResourceCounts(counts);
    } catch { /* leave counts as-is */ }
  }, []);
  useEffect(() => { refreshResourceCounts(); }, [refreshResourceCounts, techs]);
  // Effective RP/min from the server (base 1 × rp_rate_pct skill bonus).
  const rpPerMin = useGameStore(s => s.rpPerMin) || 1;
  const unlockTech = useGameStore(s => s.unlockTech);
  const [activeTree, setActiveTree] = useState(initialTree || TREES[0].id);
  const [confirmTechId, setConfirmTechId] = useState(null);

  // Deep-link parent (SkillsResearchWindow) flips initialTree when the
  // vendor "Research X" button is clicked. Adopt it on prop change so
  // the player lands on the right tree page.
  useEffect(() => {
    if (initialTree) setActiveTree(initialTree);
  }, [initialTree]);

  // Live RP -- the server's snapshot is from the last fetch; advance
  // it locally so the bar doesn't look frozen between refreshes.
  const liveRp = rpStored; // Placeholder -- server already returns live value at fetch time.

  const treeAccent = TREES.find(t => t.id === activeTree)?.accent || '#60a5fa';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* RP bar + tree tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '8px 14px', borderBottom: `1px solid ${EDGE}`,
        background: 'rgba(4,8,16,0.5)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 10px', border: `1px solid ${GREEN.pri}55`,
          background: `${GREEN.pri}10`, borderRadius: 2,
        }}>
          <span style={{ fontSize: '0.8rem' }}>🔬</span>
          <span style={{ fontSize: '0.8rem', fontFamily: FM, color: GREEN.light, fontWeight: 700 }}>
            {liveRp.toLocaleString()} RP
          </span>
          <span style={{ fontSize: '0.8rem', fontFamily: FM, color: '#5a7080' }}>· {rpPerMin}/min</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {TREES.map(t => {
            const active = t.id === activeTree;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTree(t.id)}
                style={{
                  padding: '5px 12px',
                  background: active ? `${t.accent}20` : 'rgba(10,16,28,0.4)',
                  border: `1px solid ${active ? t.accent : EDGE}`,
                  color: active ? t.accent : '#7a8a9a',
                  fontSize: '0.8rem', fontFamily: F, fontWeight: 700, letterSpacing: 0.5,
                  textTransform: 'uppercase', cursor: 'pointer', borderRadius: 2,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tree visualizer */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20, background: 'rgba(2,5,12,0.5)' }}>
        <TreeVisualizer
          tree={activeTree}
          accent={treeAccent}
          techs={techs.filter(t => t.tree === activeTree)}
          rp={liveRp}
          resourceCounts={resourceCounts}
          onClickTech={(t) => setConfirmTechId(t.id)}
        />
      </div>

      {/* Confirm unlock modal */}
      {confirmTechId && (() => {
        const tech = techs.find(t => t.id === confirmTechId);
        if (!tech) return null;
        const canAfford = liveRp >= tech.rp_cost;
        return (
          <UnlockConfirm
            tech={tech}
            canAfford={canAfford}
            onCancel={() => setConfirmTechId(null)}
            onConfirm={async () => {
              setConfirmTechId(null);
              await unlockTech(tech.id);
            }}
          />
        );
      })()}
    </div>
  );
};

const NODE_W = 230;
const NODE_H = 174; // +16 for the materials line (2026-09-20)
const TIER_GAP_Y = 226;
const NODE_GAP_X = 36;

// Lays out a single tree top-down: tier 1 row, tier 2 row, tier 3
// row. Nodes within a tier are spaced horizontally by sort_order.
// Draws SVG <line>s for prereq edges before the node cards (which are
// HTML overlaid on the SVG via absolute positioning).
const TreeVisualizer = ({ tree, accent, techs, rp, resourceCounts, onClickTech }) => {
  const byTier = useMemo(() => {
    const m = new Map();
    for (const t of techs) {
      if (!m.has(t.tier)) m.set(t.tier, []);
      m.get(t.tier).push(t);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.sort_order - b.sort_order);
    return m;
  }, [techs]);

  const maxNodesInTier = Math.max(1, ...[...byTier.values()].map(arr => arr.length));
  const width = maxNodesInTier * (NODE_W + NODE_GAP_X) + NODE_GAP_X;
  const tiers = [...byTier.keys()].sort();
  const height = tiers.length * TIER_GAP_Y + 30;

  // Compute node positions keyed by tech id.
  const positions = useMemo(() => {
    const pos = {};
    tiers.forEach((tier, tIdx) => {
      const arr = byTier.get(tier);
      const totalW = arr.length * (NODE_W + NODE_GAP_X) - NODE_GAP_X;
      const startX = (width - totalW) / 2;
      arr.forEach((t, i) => {
        pos[t.id] = {
          x: startX + i * (NODE_W + NODE_GAP_X),
          y: 20 + tIdx * TIER_GAP_Y,
        };
      });
    });
    return pos;
  }, [tiers, byTier, width]);

  if (techs.length === 0) {
    return (
      <div style={{ fontSize: '0.8rem', color: '#3a5a6a', fontFamily: FM, fontStyle: 'italic' }}>
        No tech nodes in this tree.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width, height, margin: '0 auto' }}>
      {/* SVG layer: prereq lines */}
      <svg
        width={width} height={height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {techs.map(t => {
          const childPos = positions[t.id];
          if (!childPos) return null;
          return (t.prerequisites || []).map(prereqId => {
            const parentPos = positions[prereqId];
            if (!parentPos) return null;
            const x1 = parentPos.x + NODE_W / 2;
            const y1 = parentPos.y + NODE_H;
            const x2 = childPos.x + NODE_W / 2;
            const y2 = childPos.y;
            // Curve via cubic bezier so multi-prereq edges don't overlap.
            const midY = (y1 + y2) / 2;
            const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
            const isParentUnlocked = techs.find(tt => tt.id === prereqId)?.status === 'unlocked';
            return (
              <path
                key={`${prereqId}->${t.id}`}
                d={d}
                fill="none"
                stroke={isParentUnlocked ? accent : '#1a3050'}
                strokeWidth={isParentUnlocked ? 1.6 : 1}
                strokeDasharray={isParentUnlocked ? 'none' : '4,3'}
                opacity={isParentUnlocked ? 0.7 : 0.5}
              />
            );
          });
        })}
      </svg>

      {/* HTML node cards on top of SVG */}
      {techs.map(t => {
        const p = positions[t.id];
        if (!p) return null;
        return (
          <TechNode
            key={t.id}
            tech={t}
            x={p.x}
            y={p.y}
            accent={accent}
            canAfford={rp >= t.rp_cost}
            resourceCounts={resourceCounts}
            onClick={() => {
              if (t.status === 'available') onClickTech(t);
            }}
          />
        );
      })}
    </div>
  );
};

const TechNode = ({ tech, x, y, accent, canAfford, resourceCounts, onClick }) => {
  const { status } = tech;
  // Material toll (T3+ nodes, migration 068): listed on the card with
  // have/need so the player knows before clicking.
  const materials = Array.isArray(tech.material_cost) ? tech.material_cost.filter(m => m?.resource_name && m.quantity > 0) : [];
  let bg, border, color, badge;
  if (status === 'unlocked') {
    bg = `${accent}22`;
    border = accent;
    color = accent;
    badge = '✓ RESEARCHED';
  } else if (status === 'available') {
    bg = canAfford ? `${accent}10` : 'rgba(20,28,40,0.85)';
    border = canAfford ? accent : `${accent}55`;
    color = canAfford ? accent : '#7a8a9a';
    badge = canAfford ? `${tech.rp_cost} RP · CLICK TO RESEARCH` : `${tech.rp_cost} RP (insufficient)`;
  } else {
    bg = 'rgba(15,20,30,0.7)';
    border = EDGE;
    color = '#4a5a6a';
    badge = '🔒 LOCKED';
  }
  // Description text dims for locked nodes so they don't compete
  // visually with researched/available rows. Locked rows still read
  // (player can scan ahead in the tree) but the available row pops.
  const descColor = status === 'locked' ? '#4a5a6a' : (status === 'unlocked' ? '#a0b5c8' : '#cbd5e1');
  return (
    <div
      onClick={status === 'available' ? onClick : undefined}
      style={{
        position: 'absolute', left: x, top: y,
        width: NODE_W, height: NODE_H,
        padding: '8px 10px',
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: 4,
        cursor: status === 'available' ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        transition: 'background 0.15s, border-color 0.15s',
        overflow: 'hidden',
      }}
      title={tech.description}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
        <div style={{ fontSize: '0.8rem', fontFamily: FM, color: '#5a7080', letterSpacing: 1, textTransform: 'uppercase' }}>
          Tier {tech.tier}
        </div>
        <div style={{ fontSize: '0.8rem', fontFamily: F, fontWeight: 700, color, lineHeight: 1.15 }}>
          {tech.name}
        </div>
        <div
          style={{
            fontSize: '0.8rem',
            fontFamily: F,
            color: descColor,
            lineHeight: 1.35,
            marginTop: 2,
            // Clamp to 6 lines so an unusually long description can't
            // burst the card height. Plenty of room for the ~2-3
            // sentence descriptions today; the title attr is the
            // overflow fallback.
            display: '-webkit-box',
            WebkitLineClamp: 6,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {tech.description}
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        {materials.length > 0 && (
          <div style={{ fontSize: '0.8rem', fontFamily: FM, lineHeight: 1.3, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: '#5a7080' }}>Materials: </span>
            {materials.map((m, i) => {
              const have = resourceCounts?.[m.resource_name] ?? 0;
              const ok = have >= m.quantity;
              const c = status === 'unlocked' ? '#5a7080' : status === 'locked' ? '#4a5a6a' : ok ? '#86efac' : '#fca5a5';
              return (
                <span key={m.resource_name} style={{ color: c }}>
                  {i > 0 ? ' · ' : ''}{m.quantity}× {m.resource_name}
                  {status === 'available' && <span style={{ color: ok ? '#4ade80' : '#f87171' }}> ({have})</span>}
                </span>
              );
            })}
          </div>
        )}
        <div style={{ fontSize: '0.8rem', fontFamily: FM, color, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {badge}
        </div>
      </div>
    </div>
  );
};

const UnlockConfirm = ({ tech, canAfford, onCancel, onConfirm }) => {
  const u = tech.unlocks || {};
  const unlockLines = [];
  if (u.modules?.length) unlockLines.push(`Modules: ${u.modules.join(', ')}`);
  if (u.hulls?.length) unlockLines.push(`Hulls: ${u.hulls.join(', ')}`);
  if (u.fleet_cap) unlockLines.push(`Fleet cap +${u.fleet_cap}`);
  if (u.placeholder) unlockLines.push('(Some effects pending future systems.)');

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(8,14,28,0.97)', border: `1px solid ${EDGE}`,
          clipPath: diagMix(8), padding: '20px 24px', minWidth: 360, maxWidth: 480,
        }}
      >
        <div style={{ fontSize: '0.875rem', fontFamily: F, fontWeight: 800, color: '#e2e8f0', letterSpacing: 0.5 }}>
          Research: {tech.name}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: 8, lineHeight: 1.5, fontFamily: F }}>
          {tech.description}
        </div>
        {unlockLines.length > 0 && (
          <div style={{ marginTop: 12, padding: '8px 10px', background: `${GREEN.pri}10`, borderLeft: `2px solid ${GREEN.pri}`, fontSize: '0.8rem', fontFamily: FM, color: GREEN.light }}>
            {unlockLines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: '0.8rem', fontFamily: FM, color: canAfford ? GOLD.light : '#a04040' }}>
          Cost: {tech.rp_cost} RP {canAfford ? '' : '(insufficient)'}
        </div>
        {/* Phase 1 (plan B6): T3+ nodes also consume materials from
            cargo. Server validates + burns worst-quality stacks first;
            an "insufficient materials" unlock error surfaces via the
            standard toast path. */}
        {(tech.material_cost || []).length > 0 && (
          <div style={{ marginTop: 6, fontSize: '0.8rem', fontFamily: FM, color: '#8a99aa' }}>
            Materials: {(tech.material_cost || []).map(m => `${m.quantity}× ${m.resource_name}`).join(' · ')}
          </div>
        )}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent', border: `1px solid ${EDGE}`,
              color: '#7a8a9a', padding: '6px 14px', cursor: 'pointer',
              fontSize: '0.8rem', fontFamily: F, letterSpacing: 0.5, textTransform: 'uppercase',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canAfford}
            style={{
              background: canAfford ? `${GREEN.pri}30` : '#1a2030',
              border: `1px solid ${canAfford ? GREEN.pri : EDGE}`,
              color: canAfford ? GREEN.light : '#4a5a6a',
              padding: '6px 14px', cursor: canAfford ? 'pointer' : 'not-allowed',
              fontSize: '0.8rem', fontFamily: F, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            }}
          >
            Research
          </button>
        </div>
      </div>
    </div>
  );
};

// =================================================================
// MAIN WINDOW
// =================================================================

export const SkillsResearchWindow = () => {
  const closeWindow = useGameStore(s => s.closeWindow);
  const fetchSkillsAndResearch = useGameStore(s => s.fetchSkillsAndResearch);
  // Cross-window deep link: when researchTargetTechId is set we switch
  // to the Research tab + jump to the target's tree, then clear so a
  // re-open doesn't replay the navigation.
  const researchTarget = useGameStore(s => s.researchTargetTechId);
  const clearResearchTarget = useGameStore(s => s.clearResearchTargetTech);
  const techs = useGameStore(s => s.techs);
  const [tab, setTab] = useState('skills');
  const [initialResearchTree, setInitialResearchTree] = useState(null);

  // Fetch on open; also poll once every 30s so the queue progress bars
  // and RP bar reflect server truth without manual refresh.
  useEffect(() => {
    fetchSkillsAndResearch();
    const t = setInterval(fetchSkillsAndResearch, 30000);
    return () => clearInterval(t);
  }, [fetchSkillsAndResearch]);

  // Resolve the deep-link target once techs have loaded. Switch tab +
  // tell ResearchTab which tree to open via initialResearchTree.
  useEffect(() => {
    if (!researchTarget || techs.length === 0) return;
    const tech = techs.find(t => t.id === researchTarget);
    if (tech) {
      setTab('research');
      setInitialResearchTree(tech.tree);
    }
    clearResearchTarget();
  }, [researchTarget, techs, clearResearchTarget]);

  return (
    <div
      className="fixed inset-0 z-40"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
      }}
      onClick={() => closeWindow('research')}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90vw', maxWidth: 1400, height: '88vh',
          background: 'rgba(8,14,28,0.97)',
          border: `1px solid ${EDGE}`,
          clipPath: diagMix(10),
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center',
            padding: '10px 16px',
            borderBottom: `1px solid ${EDGE}`,
            background: `linear-gradient(90deg, ${GREEN.pri}20, transparent)`,
            flexShrink: 0,
          }}
        >
          <span style={{ marginRight: 10, fontSize: '1rem' }}>🔬</span>
          <span style={{
            fontSize: '0.875rem', fontWeight: 800, color: GREEN.light,
            letterSpacing: 2.5, fontFamily: F, textTransform: 'uppercase',
            marginRight: 24,
          }}>
            Skills & Research
          </span>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {['skills', 'research'].map(id => {
              const active = id === tab;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  style={{
                    padding: '6px 14px',
                    background: active ? `${BLUE.pri}20` : 'transparent',
                    border: `1px solid ${active ? BLUE.pri : EDGE}`,
                    color: active ? BLUE.light : '#7a8a9a',
                    fontSize: '0.8rem', fontFamily: F, fontWeight: 700,
                    letterSpacing: 1, textTransform: 'uppercase',
                    cursor: 'pointer', borderRadius: 2,
                  }}
                >
                  {id}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
          {/* Same indicator as the GameFrame top bar -- the player
              sees what's training without scrolling down to the
              queue strip. Expanded variant for the bigger header. */}
          <ActiveTrainingIndicator variant="expanded" />
          <button
            onClick={() => closeWindow('research')}
            style={{
              background: 'rgba(15,25,45,0.8)', border: `1px solid ${EDGE}`,
              color: '#4a5a6a', width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', borderRadius: 3, fontSize: '0.8125rem', fontFamily: F,
              marginLeft: 12,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {tab === 'skills' ? <SkillsTab /> : <ResearchTab initialTree={initialResearchTree} />}
        </div>
      </div>
    </div>
  );
};

export default SkillsResearchWindow;
