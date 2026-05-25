// SettingsWindow.jsx -- Player-facing preferences panel.
//
// Currently houses two sections (audio + interface). A third section
// (menu change, TBD by user) will be added in a follow-up. All values
// are persisted via gameStore's `partialize` so reload preserves them.

import React from 'react';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { useGameStore } from '@/stores/gameStore';
import { COLORS, FONT, SectionHead, Card, PanelButton } from '@/components/ui/panelStyles';
import { playSound } from '@/utils/audio';

// ============================================
// SLIDER -- shared horizontal range input styled to match panel chrome.
// ============================================

const Slider = ({ value, min, max, step, onChange, accent = COLORS.BLUE.light }) => (
  <input
    type="range"
    min={min}
    max={max}
    step={step}
    value={value}
    onChange={(e) => onChange(parseFloat(e.target.value))}
    style={{
      flex: 1,
      accentColor: accent,
      cursor: 'pointer',
    }}
  />
);

// Compact display chip showing the current slider value.
const ValueChip = ({ text, accent = COLORS.BLUE.light, width = 56 }) => (
  <span style={{
    minWidth: width,
    textAlign: 'right',
    fontSize: 10,
    fontFamily: FONT.mono,
    color: accent,
    fontWeight: 700,
    letterSpacing: 0.5,
  }}>{text}</span>
);

// ============================================
// AUDIO SECTION
// ============================================

const AudioSection = () => {
  const muted = useGameStore(s => s.audio?.muted ?? false);
  const master = useGameStore(s => s.audio?.masterVolume ?? 0.8);
  const sfx = useGameStore(s => s.audio?.sfxVolume ?? 1.0);
  const toggleAudioMuted = useGameStore(s => s.toggleAudioMuted);
  const setMasterVolume = useGameStore(s => s.setMasterVolume);
  const setSfxVolume = useGameStore(s => s.setSfxVolume);

  return (
    <Card style={{ marginBottom: 12 }}>
      {/* Mute row -- big primary toggle. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{
          flex: 1,
          fontSize: 11,
          color: COLORS.TEXT.primary,
          fontFamily: FONT.ui,
          fontWeight: 600,
        }}>Mute all audio</span>
        <button
          onClick={() => { playSound('button_click'); toggleAudioMuted(); }}
          style={{
            padding: '5px 14px',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 1,
            textTransform: 'uppercase',
            fontFamily: FONT.ui,
            color: muted ? COLORS.RED.light : COLORS.GREEN.light,
            background: muted ? `${COLORS.RED.pri}22` : `${COLORS.GREEN.pri}22`,
            border: `1px solid ${muted ? `${COLORS.RED.pri}66` : `${COLORS.GREEN.pri}66`}`,
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >{muted ? '🔇 Muted' : '🔊 On'}</button>
      </div>

      {/* Master volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, opacity: muted ? 0.4 : 1 }}>
        <span style={{ width: 78, fontSize: 10, color: COLORS.TEXT.muted, fontFamily: FONT.ui }}>Master</span>
        <Slider value={master} min={0} max={1} step={0.05} onChange={setMasterVolume} />
        <ValueChip text={`${Math.round(master * 100)}%`} />
      </div>

      {/* SFX volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: muted ? 0.4 : 1 }}>
        <span style={{ width: 78, fontSize: 10, color: COLORS.TEXT.muted, fontFamily: FONT.ui }}>Effects</span>
        <Slider value={sfx} min={0} max={1} step={0.05} onChange={setSfxVolume} />
        <ValueChip text={`${Math.round(sfx * 100)}%`} />
      </div>
    </Card>
  );
};

// ============================================
// INTERFACE SECTION
// ============================================

const SCALE_PRESETS = [
  { label: '100%', value: 1.0 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
  { label: '175%', value: 1.75 },
  { label: '200%', value: 2.0 },
];

const InterfaceSection = () => {
  const uiScale = useGameStore(s => s.uiScale ?? 1.0);
  const setUiScale = useGameStore(s => s.setUiScale);

  return (
    <Card>
      <div style={{
        fontSize: 11,
        color: COLORS.TEXT.primary,
        fontFamily: FONT.ui,
        fontWeight: 600,
        marginBottom: 8,
      }}>UI font scale</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Slider value={uiScale} min={0.8} max={2.0} step={0.05}
          onChange={setUiScale} accent={COLORS.PURPLE.light} />
        <ValueChip text={`${Math.round(uiScale * 100)}%`} accent={COLORS.PURPLE.light} />
      </div>

      {/* Preset chips -- one-click jump to common values. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {SCALE_PRESETS.map(p => {
          const active = Math.abs(uiScale - p.value) < 0.01;
          return (
            <button
              key={p.label}
              onClick={() => { playSound('button_click'); setUiScale(p.value); }}
              style={{
                padding: '4px 10px',
                fontSize: 9,
                fontWeight: 800,
                fontFamily: FONT.ui,
                letterSpacing: 1,
                color: active ? '#0a0e18' : COLORS.PURPLE.light,
                background: active ? COLORS.PURPLE.light : `${COLORS.PURPLE.pri}18`,
                border: `1px solid ${COLORS.PURPLE.pri}66`,
                borderRadius: 2,
                cursor: 'pointer',
              }}
            >{p.label}</button>
          );
        })}
      </div>

      {/* Live preview row so the player can see the change without
          closing the panel. The text inside scales with uiScale via
          the root font-size hook in App.jsx. */}
      <div style={{
        marginTop: 8,
        padding: '8px 10px',
        background: 'rgba(0,0,0,0.35)',
        border: `1px dashed ${COLORS.EDGE}`,
        borderRadius: 3,
      }}>
        <div style={{
          fontSize: '0.75rem',
          color: COLORS.TEXT.secondary,
          fontFamily: FONT.ui,
          marginBottom: 3,
        }}>Preview · small label</div>
        <div style={{
          fontSize: '0.95rem',
          color: COLORS.TEXT.primary,
          fontFamily: FONT.ui,
          fontWeight: 600,
        }}>Sample interface text at the current scale.</div>
      </div>

      <div style={{
        marginTop: 10,
        fontSize: 9,
        color: COLORS.TEXT.dim,
        fontFamily: FONT.ui,
        letterSpacing: 0.4,
        lineHeight: 1.5,
      }}>
        Scales prose UI + toast notifications. Some legacy HUD readouts
        use fixed pixel sizes and won't change.
      </div>
    </Card>
  );
};

// ============================================
// ROOT
// ============================================

export const SettingsWindow = () => (
  <ContextPanel
    windowId="settings"
    title="Settings"
    icon="⚙️"
    accent={COLORS.BLUE.light}
    width={420}
  >
    <SectionHead title="Audio" icon="🔊" accent={COLORS.GREEN.light} marginTop={0} />
    <AudioSection />

    <SectionHead title="Interface" icon="🅰" accent={COLORS.PURPLE.light} />
    <InterfaceSection />
  </ContextPanel>
);

export default SettingsWindow;
