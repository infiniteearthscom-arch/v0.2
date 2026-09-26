// Hotbar.jsx -- bottom-centre ability bar, keys 1..5 (2026-09-26).
//
// Presentational. SystemView owns the ability list (what is fitted,
// cooldowns, what activating does) and the slot layout; this draws
// five tiles and reports clicks / drag-reorders. Consumables from the
// base industry tree will drop into the same slots later, so a slot is
// just "something with an icon, a label, a cooldown and an activate".
//
//   slots      [ability | null] x 5
//   ability    { id, icon, label, color, available, disabled, remain, active, title }
//   onActivate (index)
//   onReorder  (fromIndex, toIndex)

import React, { useState } from 'react';

const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";
export const HOTBAR_SIZE = 5;

export const Hotbar = ({ slots, onActivate, onReorder }) => {
  const [dragFrom, setDragFrom] = useState(null);
  const [over, setOver] = useState(null);
  return (
    <div className="fixed flex items-end gap-1" style={{ zIndex: 40, bottom: 40, left: '50%', transform: 'translateX(-50%)' }}
         title="Hotbar — press 1–5 or click. Drag tiles to reorder.">
      {Array.from({ length: HOTBAR_SIZE }, (_, i) => {
        const a = slots[i] || null;
        const dim = a && !a.available;
        const cooling = a && a.available && a.disabled && a.remain > 0;
        const color = a ? a.color : '#33475e';
        const isOver = over === i && dragFrom != null && dragFrom !== i;
        return (
          <div key={i}
               draggable={!!a}
               onDragStart={(e) => { if (!a) return; e.dataTransfer.setData('text/hotbar', String(i)); e.dataTransfer.effectAllowed = 'move'; setDragFrom(i); }}
               onDragEnd={() => { setDragFrom(null); setOver(null); }}
               onDragOver={(e) => { if (dragFrom == null) return; e.preventDefault(); setOver(i); }}
               onDragLeave={() => setOver(null)}
               onDrop={(e) => { e.preventDefault(); if (dragFrom != null && dragFrom !== i) onReorder?.(dragFrom, i); setDragFrom(null); setOver(null); }}
               onClick={() => onActivate?.(i)}
               title={a ? a.title : 'Empty slot'}
               style={{
                 position: 'relative', width: 58, height: 58, borderRadius: 4, cursor: a ? 'pointer' : 'default',
                 background: a
                   ? (a.active ? `linear-gradient(180deg, ${color}44, ${color}12)` : `linear-gradient(180deg, ${color}22, rgba(4,8,16,0.75))`)
                   : 'rgba(4,8,16,0.55)',
                 border: `1px solid ${isOver ? '#67e8f9' : a ? (a.active ? color : color + '88') : '#1e293b'}`,
                 boxShadow: a?.active ? `0 0 10px ${color}66` : 'none',
                 opacity: dim ? 0.45 : dragFrom === i ? 0.4 : 1,
                 display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                 fontFamily: F, userSelect: 'none', transition: 'opacity 0.12s, box-shadow 0.12s',
               }}>
            {/* key badge */}
            <span style={{ position: 'absolute', top: 2, left: 4, fontFamily: FM, fontSize: '0.62rem', color: a ? color : '#33475e', letterSpacing: 0.5 }}>{i + 1}</span>
            {a ? (
              <>
                <span style={{ fontSize: '1.25rem', lineHeight: 1, filter: cooling ? 'grayscale(1)' : 'none' }}>{a.icon}</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: cooling ? '#64748b' : color, lineHeight: 1, textAlign: 'center', maxWidth: 54, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</span>
                {cooling && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,8,16,0.55)', fontFamily: FM, fontSize: '0.85rem', color: '#e2e8f0', borderRadius: 4 }}>{a.remain}s</span>
                )}
                {dim && (
                  <span style={{ position: 'absolute', top: 2, right: 4, fontSize: '0.6rem' }}>🔒</span>
                )}
              </>
            ) : (
              <span style={{ fontFamily: FM, fontSize: '0.7rem', color: '#33475e' }}>—</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Hotbar;
