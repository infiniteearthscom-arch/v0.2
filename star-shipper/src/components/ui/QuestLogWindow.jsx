import React, { useState, useEffect } from 'react';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { useGameStore } from '@/stores/gameStore';
import { COLORS, FONT, SectionHead, Pill, glow } from '@/components/ui/panelStyles';

// Category → accent color mapping
const CATEGORY_COLORS = {
  tutorial: COLORS.CYAN.light,
  main:     COLORS.GOLD.light,
  side:     COLORS.PURPLE.light,
  faction:  COLORS.GREEN.light,
};

// ============================================
// REWARD BADGES
// ============================================

const RewardBadges = ({ rewards }) => {
  if (!rewards) return null;
  const badges = [];

  if (rewards.credits) {
    badges.push(
      <span key="credits" style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        background: `${COLORS.GOLD.pri}1a`,
        border: `1px solid ${COLORS.GOLD.pri}55`,
        borderRadius: 2,
        color: COLORS.GOLD.light,
        fontSize: 9,
        fontFamily: FONT.mono,
        fontWeight: 700,
        letterSpacing: 0.5,
      }}>
        ⬡ {rewards.credits.toLocaleString()} CR
      </span>
    );
  }

  if (rewards.items) {
    rewards.items.forEach((item, i) => {
      badges.push(
        <span key={`item-${i}`} style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 7px',
          background: `${COLORS.BLUE.pri}1a`,
          border: `1px solid ${COLORS.BLUE.pri}55`,
          borderRadius: 2,
          color: COLORS.BLUE.light,
          fontSize: 9,
          fontFamily: FONT.mono,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}>
          📦 {item.quantity}× {item.item_id.replace(/_/g, ' ')}
        </span>
      );
    });
  }

  if (badges.length === 0) return null;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>{badges}</div>;
};

// ============================================
// QUEST CARD
// ============================================

const QuestCard = ({ quest, isActive }) => {
  const category = quest.category || 'main';
  const accent = CATEGORY_COLORS[category] || COLORS.GOLD.light;

  return (
    <div style={{
      background: isActive
        ? `linear-gradient(135deg, ${accent}10, transparent)`
        : COLORS.ROW_BG,
      border: `1px solid ${COLORS.EDGE}`,
      borderLeft: `2px solid ${isActive ? accent : COLORS.EDGE}`,
      borderRadius: 3,
      padding: 10,
      marginBottom: 8,
      opacity: isActive ? 1 : 0.6,
      transition: 'all 0.15s',
      boxShadow: isActive ? glow(accent, 0.12) : 'none',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            color: COLORS.TEXT.primary,
            fontFamily: FONT.ui,
            letterSpacing: 0.3,
          }}>{quest.title}</span>
          <Pill color={accent}>{category}</Pill>
        </div>
        {!isActive && (
          <span style={{
            color: COLORS.GREEN.light,
            fontSize: 10,
            fontFamily: FONT.ui,
            fontWeight: 700,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}>✓ DONE</span>
        )}
      </div>

      <p style={{
        fontSize: 11,
        color: COLORS.TEXT.secondary,
        lineHeight: 1.5,
        fontFamily: FONT.ui,
        margin: 0,
      }}>{quest.description}</p>

      {isActive && <RewardBadges rewards={quest.rewards} />}
    </div>
  );
};

// ============================================
// QUEST LOG WINDOW
// ============================================

export const QuestLogWindow = () => {
  const quests = useGameStore(state => state.quests);
  const fetchQuests = useGameStore(state => state.fetchQuests);
  const [tab, setTab] = useState('active');

  useEffect(() => { fetchQuests(); }, [fetchQuests]);

  const active = quests.filter(q => q.status === 'active');
  const completed = quests.filter(q => q.status === 'completed');
  const displayed = tab === 'active' ? active : completed;

  // Tab button factory
  const TabButton = ({ id, label, icon, count, accent }) => {
    const isActive = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          background: isActive
            ? `linear-gradient(180deg, ${accent}22, ${accent}08)`
            : 'rgba(4,8,16,0.5)',
          border: `1px solid ${isActive ? `${accent}66` : COLORS.EDGE}`,
          borderLeft: isActive ? `2px solid ${accent}` : `1px solid ${COLORS.EDGE}`,
          borderRadius: 3,
          color: isActive ? accent : COLORS.TEXT.muted,
          fontSize: 10,
          fontWeight: 800,
          fontFamily: FONT.ui,
          cursor: 'pointer',
          letterSpacing: 1,
          textTransform: 'uppercase',
          transition: 'all 0.15s',
          boxShadow: isActive ? glow(accent, 0.15) : 'none',
        }}
      >
        <span>{icon}</span>
        <span>{label}</span>
        {count > 0 && (
          <span style={{
            background: isActive ? accent : `${accent}33`,
            color: isActive ? '#0a0e18' : accent,
            borderRadius: 8,
            padding: '0 6px',
            fontSize: 9,
            fontWeight: 800,
            fontFamily: FONT.mono,
            minWidth: 14,
            textAlign: 'center',
          }}>{count}</span>
        )}
      </button>
    );
  };

  return (
    <ContextPanel
      windowId="questLog"
      title="Missions"
      icon="📋"
      accent={COLORS.CYAN.light}
      width={380}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <TabButton id="active" label="Active" icon="📋" count={active.length} accent={COLORS.CYAN.light} />
          <TabButton id="completed" label="Completed" icon="✓" count={completed.length} accent={COLORS.GREEN.light} />
        </div>

        <SectionHead
          title={tab === 'active' ? 'Current Objectives' : 'Mission History'}
          accent={tab === 'active' ? COLORS.CYAN.light : COLORS.GREEN.light}
          icon={tab === 'active' ? '◆' : '✓'}
          marginTop={0}
          right={`${displayed.length} TOTAL`}
        />

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
          {displayed.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '32px 0',
              color: COLORS.TEXT.muted,
              fontSize: 11,
              fontFamily: FONT.ui,
            }}>
              {tab === 'active' ? 'No active missions.' : 'No completed missions yet.'}
            </div>
          ) : (
            displayed.map(quest => (
              <QuestCard key={quest.quest_id} quest={quest} isActive={tab === 'active'} />
            ))
          )}
        </div>
      </div>
    </ContextPanel>
  );
};

export default QuestLogWindow;
