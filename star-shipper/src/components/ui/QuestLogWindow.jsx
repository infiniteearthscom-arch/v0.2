import React, { useState, useEffect } from 'react';
import { DraggableWindow } from '@/components/ui/DraggableWindow';
import { useGameStore } from '@/stores/gameStore';

// ============================================
// REWARD DISPLAY
// ============================================

const RewardBadge = ({ rewards }) => {
  if (!rewards) return null;
  const items = [];
  if (rewards.credits) {
    items.push(
      <span key="credits" className="flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-900/30 border border-yellow-600/30 text-yellow-400 text-[10px]">
        💰 {rewards.credits.toLocaleString()} cr
      </span>
    );
  }
  if (rewards.items) {
    rewards.items.forEach((item, i) => {
      items.push(
        <span key={`item-${i}`} className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-900/30 border border-cyan-600/30 text-cyan-400 text-[10px]">
          📦 {item.quantity}x {item.item_id.replace(/_/g, ' ')}
        </span>
      );
    });
  }
  if (items.length === 0) return null;
  return <div className="flex flex-wrap gap-1.5 mt-2">{items}</div>;
};

// ============================================
// QUEST CARD
// ============================================

const QuestCard = ({ quest, isActive, isRecentlyCompleted }) => {
  const category = quest.category || 'main';
  const categoryColors = {
    tutorial: { border: '#22d3ee', glow: '#22d3ee22', badge: 'bg-cyan-900/40 text-cyan-400 border-cyan-600/40' },
    main:     { border: '#f59e0b', glow: '#f59e0b22', badge: 'bg-yellow-900/40 text-yellow-400 border-yellow-600/40' },
    side:     { border: '#8b5cf6', glow: '#8b5cf622', badge: 'bg-purple-900/40 text-purple-400 border-purple-600/40' },
    faction:  { border: '#22c55e', glow: '#22c55e22', badge: 'bg-green-900/40 text-green-400 border-green-600/40' },
  };
  const colors = categoryColors[category] || categoryColors.main;

  return (
    <div
      className="rounded-lg p-3 border transition-all"
      style={{
        borderColor: isRecentlyCompleted ? '#4ade80' : isActive ? colors.border + '88' : '#334155',
        background: isRecentlyCompleted ? 'rgba(74, 222, 128, 0.12)' : isActive ? colors.glow : '#0f172a44',
        opacity: isActive || isRecentlyCompleted ? 1 : 0.55,
        boxShadow: isRecentlyCompleted ? '0 0 16px rgba(74, 222, 128, 0.25), inset 0 0 16px rgba(74, 222, 128, 0.06)' : 'none',
        animation: isRecentlyCompleted ? 'questComplete 2s ease-in-out' : 'none',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-100">{quest.title}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border capitalize ${colors.badge}`}>
            {category}
          </span>
        </div>
        {!isActive && (
          <span className={`text-xs flex-shrink-0 ${isRecentlyCompleted ? 'text-green-300 font-bold' : 'text-green-400'}`}>
            {isRecentlyCompleted ? '★ Complete!' : '✓ Done'}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">{quest.description}</p>

      {isActive && <RewardBadge rewards={quest.rewards} />}
      {isRecentlyCompleted && quest.rewards && <RewardBadge rewards={quest.rewards} />}
    </div>
  );
};

// ============================================
// QUEST LOG WINDOW
// ============================================

export const QuestLogWindow = () => {
  const quests = useGameStore(state => state.quests);
  const recentlyCompletedQuests = useGameStore(state => state.recentlyCompletedQuests);
  const fetchQuests = useGameStore(state => state.fetchQuests);
  const [tab, setTab] = useState('active');

  // Refresh quests when window opens
  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  // Auto-switch to completed tab when a quest just completed
  useEffect(() => {
    if (recentlyCompletedQuests.length > 0) {
      setTab('completed');
    }
  }, [recentlyCompletedQuests]);

  const active = quests.filter(q => q.status === 'active');
  const completed = quests.filter(q => q.status === 'completed');

  const displayed = tab === 'active' ? active : completed;

  return (
    <DraggableWindow
      windowId="questLog"
      title="Quest Log"
      initialWidth={420}
      initialHeight={520}
      minWidth={360}
      minHeight={300}
    >
      {/* Keyframe animation for quest completion glow */}
      <style>{`
        @keyframes questComplete {
          0% { box-shadow: 0 0 0 rgba(74, 222, 128, 0); }
          30% { box-shadow: 0 0 24px rgba(74, 222, 128, 0.4), inset 0 0 20px rgba(74, 222, 128, 0.1); }
          100% { box-shadow: 0 0 16px rgba(74, 222, 128, 0.25), inset 0 0 16px rgba(74, 222, 128, 0.06); }
        }
      `}</style>
      <div className="flex flex-col h-full">

        {/* Tabs */}
        <div className="flex gap-1.5 mb-3">
          <button
            onClick={() => setTab('active')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === 'active'
                ? 'bg-cyan-700/30 text-cyan-300 border border-cyan-600/40'
                : 'bg-slate-800/40 text-slate-400 border border-slate-700/30 hover:border-slate-600/50'
            }`}
          >
            📋 Active
            {active.length > 0 && (
              <span className="bg-cyan-500/30 text-cyan-300 rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                {active.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === 'completed'
                ? 'bg-green-700/30 text-green-300 border border-green-600/40'
                : 'bg-slate-800/40 text-slate-400 border border-slate-700/30 hover:border-slate-600/50'
            }`}
          >
            ✓ Completed
            {completed.length > 0 && (
              <span className="bg-green-500/20 text-green-400 rounded-full px-1.5 py-0.5 text-[9px]">
                {completed.length}
              </span>
            )}
          </button>
        </div>

        {/* Quest list */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {displayed.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm">
              {tab === 'active' ? 'No active quests.' : 'No completed quests yet.'}
            </div>
          ) : (
            displayed.map(quest => (
              <QuestCard
                key={quest.quest_id}
                quest={quest}
                isActive={tab === 'active'}
                isRecentlyCompleted={recentlyCompletedQuests.includes(quest.quest_id)}
              />
            ))
          )}
        </div>

      </div>
    </DraggableWindow>
  );
};

export default QuestLogWindow;
