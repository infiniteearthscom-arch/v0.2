// QuestText -- quest / mission description renderer with inline links
// (owner 2026-10-09: "links in the quest text for skills and research that
// open the window on the right tab, with a visual cue next to the item").
//
// Markup (authored in quest_definitions.description, migration 105+):
//   [[skill:eng_shield_upgrades|Shield Upgrades]]  -> Research window, Skills tab, that skill selected + pulsing
//   [[tech:tech_refining|Ore Refining]]            -> Research window, Research tab, that node's tree + pulsing
//   [[window:crafting|Craft (🔨)]]                 -> opens that window (any key in gameStore.windows)
//
// Plain text passes through untouched, so descriptions without markup
// render exactly as before. Unknown kinds render as plain label text.
// Links stop propagation so a clickable tile around them does not fire.

import React from 'react';
import { useGameStore } from '@/stores/gameStore';
import { playSound } from '@/utils/audio';

const TOKEN = /\[\[(skill|tech|window):([a-z0-9_]+)\|([^\]]+)\]\]/g;

export const RESEARCH_WINDOW_KEY = 'research';

export function followQuestLink(kind, id) {
  const st = useGameStore.getState();
  if (kind === 'skill') {
    st.setSkillsTargetSkill?.(id);
    st.openWindow?.(RESEARCH_WINDOW_KEY);
  } else if (kind === 'tech') {
    st.setResearchTargetTech?.(id);
    st.openWindow?.(RESEARCH_WINDOW_KEY);
  } else if (kind === 'window') {
    if (st.windows && st.windows[id]) st.openWindow?.(id);
  }
}

const linkStyle = {
  color: '#67e8f9',
  textDecoration: 'underline',
  textDecorationStyle: 'dotted',
  textUnderlineOffset: 2,
  cursor: 'pointer',
  pointerEvents: 'auto',
};

const TITLES = {
  skill: 'Open this skill in the Research window',
  tech: 'Open this node in the Research window',
  window: 'Open this window',
};

/** Returns an array of strings and <span> links for the given description. */
export function renderQuestText(text) {
  if (!text || typeof text !== 'string' || text.indexOf('[[') === -1) return text;
  const out = [];
  let last = 0, m, i = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [, kind, id, label] = m;
    out.push(
      <span
        key={`ql-${i++}`}
        style={linkStyle}
        title={TITLES[kind]}
        onClick={(e) => { e.stopPropagation(); playSound('button_click'); followQuestLink(kind, id); }}
      >
        {label}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const QuestText = ({ text }) => <>{renderQuestText(text)}</>;

/** Strip markup for places that need plain text (tooltips, toasts). */
export function plainQuestText(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(TOKEN, '$3');
}

// Keyframes for the arrival pulse on the targeted skill row / tech node.
// Rendered once by SkillsResearchWindow.
export const QUEST_TARGET_PULSE_CSS = `
@keyframes questTargetPulse {
  0%   { box-shadow: 0 0 0 0 rgba(103,232,249,0.0); }
  40%  { box-shadow: 0 0 0 4px rgba(103,232,249,0.55), 0 0 18px rgba(103,232,249,0.45); }
  100% { box-shadow: 0 0 0 0 rgba(103,232,249,0.0); }
}`;
export const questTargetPulseStyle = { animation: 'questTargetPulse 1.1s ease-in-out 5', borderRadius: 4 };

export default QuestText;
