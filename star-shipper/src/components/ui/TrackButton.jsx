// TrackButton -- the ONE control for "track this thing's requirements in
// the top-right stack". Pass any item in the utils/tracking.js shape:
//
//   <TrackButton item={{ kind: 'base', id: 'tier1', name: 'Framework base',
//                        ingredients: [{ resource_name, quantity }], credits: 5000 }} />
//
// Reads/writes gameStore.trackItem / untrackItem; shows TRACK / TRACKING.

import React from 'react';
import { useGameStore } from '@/stores/gameStore';
import { playSound } from '@/utils/audio';
import { trackKey } from '@/utils/tracking';

export const TrackButton = ({ item, small = false, style }) => {
  const key = item ? trackKey(item.kind, item.id) : null;
  const on = useGameStore(s => !!key && (s.pinnedRecipes || []).some(r => (r.key || trackKey(r.kind || 'recipe', r.id)) === key));
  const trackItem = useGameStore(s => s.trackItem);
  if (!item || item.id == null) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); playSound('button_click'); trackItem(item); }}
      title={on ? 'Stop tracking these requirements' : 'Track these requirements in the top-right stack'}
      style={{
        flexShrink: 0, padding: small ? '2px 8px' : '4px 10px', borderRadius: 3, cursor: 'pointer',
        fontFamily: "'Rajdhani', sans-serif", fontSize: small ? '0.7rem' : '0.75rem', fontWeight: 700, letterSpacing: 0.5,
        background: on ? '#22c55e22' : 'transparent', color: on ? '#4ade80' : '#8a9aaa',
        border: `1px solid ${on ? '#22c55e66' : '#1a3050'}`,
        ...style,
      }}
    >
      {on ? '📌 TRACKING' : '📌 TRACK'}
    </button>
  );
};

export default TrackButton;
