// Inline-link markup for player-facing text (owner 2026-10-09; CLAUDE.md
// pitfall #22). The client renders these tokens as clickable links that
// open the Research window on the right tab with the target pulsing, or
// open a window; plain-text surfaces strip them with plainQuestText().
//
//   skillLink('eng_shield_upgrades', 'Shield Upgrades') -> [[skill:eng_shield_upgrades|Shield Upgrades]]
//   techLink('tech_refining', 'Ore Refining')           -> [[tech:tech_refining|Ore Refining]]
//   windowLink('shipBuilder', 'Fitting (🔧)')           -> [[window:shipBuilder|Fitting (🔧)]]
//
// Use these in EVERY error / toast / hint string that names a skill, a
// research node or a window. Mirrored by client utils in QuestText.jsx.

const safeId = (id) => String(id || '').replace(/[^a-z0-9_]/gi, '');
const safeLabel = (label, id) => String(label || id || '').replace(/[\[\]|]/g, '');

export const skillLink  = (id, name)   => `[[skill:${safeId(id)}|${safeLabel(name, id)}]]`;
export const techLink   = (id, name)   => `[[tech:${safeId(id)}|${safeLabel(name, id)}]]`;
export const windowLink = (key, label) => `[[window:${safeId(key)}|${safeLabel(label, key)}]]`;

// Strip markup for logs / plain channels.
export const plainText = (s) => String(s || '').replace(/\[\[(?:skill|tech|window):[a-z0-9_]+\|([^\]]+)\]\]/g, '$1');
