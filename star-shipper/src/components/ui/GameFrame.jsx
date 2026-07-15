// GameFrame.jsx — The main UI chrome that wraps the game view
// Provides: top resource bar, left toolbar, bottom status bar
// The game views (SystemView/GalaxyFlightView) render as children in the full-screen area

import React, { useEffect, useState } from 'react';
import { useGameStore, useActiveShip } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';
import { fittingAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';
import { SystemMapWindow } from '@/components/system/SystemMapWindow';
import { ActiveTrainingIndicator } from '@/components/ui/ActiveTrainingIndicator';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ActivityTicker } from '@/components/activity/ActivityTicker';
import { LeaderboardsWindow } from '@/components/leaderboards/LeaderboardsWindow';
import { ProfileWindow } from '@/components/profile/ProfileWindow';
import { TradeWindow } from '@/components/trade/TradeWindow';
import { TradeInviteToast } from '@/components/trade/TradeInviteToast';
import { CorpWindow } from '@/components/corp/CorpWindow';
import { BountyBoardWindow } from '@/components/bounty/BountyBoardWindow';
import { InboxWindow } from '@/components/mail/InboxWindow';
import { CargoTooltipLayer } from '@/components/items/CargoTooltipLayer';
import { mailAPI } from '@/utils/api';
import presence from '@/utils/presence';
import trade from '@/utils/trade';

// ============================================
// CONSTANTS
// ============================================

const TOOLBAR_BUTTONS = [
  { id: 'character', icon: '👤', label: 'Character', color: '#60a5fa' },
  { id: 'shipBuilder', icon: '🔧', label: 'Fitting', color: '#ff6622' },
  { id: 'fleet', icon: '🚀', label: 'Fleet', color: '#60a5fa' },
  { id: 'inventory', icon: '📦', label: 'Cargo', color: '#f59e0b' },
  { id: 'crafting', icon: '🔨', label: 'Craft', color: '#aa66ff' },
  { id: 'questLog', icon: '📋', label: 'Missions', color: '#22d3ee' },
  { id: 'galaxyMap', icon: '🌌', label: 'Galaxy', color: '#8844ff' },
  { id: 'research', icon: '🔬', label: 'Research', color: '#22c55e' },
  { id: 'leaderboards', icon: '🏆', label: 'Leaders', color: '#fbbf24' },
  { id: 'corp', icon: '🛡️', label: 'Corp', color: '#fbbf24' },
  { id: 'bounties', icon: '🎯', label: 'Bounties', color: '#ef4444' },
  // badgeStoreKey: when set, the toolbar reads gameStore[badgeStoreKey]
  // and renders a small red unread counter on the button. Used for
  // the mail unread count -- extendable to any other future button.
  { id: 'mail', icon: '📬', label: 'Mail', color: '#60a5fa', badgeStoreKey: 'mailUnreadCount' },
];

// Planet button is appended dynamically when the player is docked.
const PLANET_BUTTON = { id: 'planetInteraction', icon: '🪐', label: 'Planet', color: '#22c55e' };

const EDGE = '#1a3050';
const BLUE = { pri: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8', dim: '#1e3a5f' };
const GOLD = { pri: '#f59e0b', light: '#fbbf24' };

// ============================================
// ONLINE ROSTER INDICATOR (Step 2)
// ============================================
// Subscribes to presence.stats_changed and shows "N ONLINE" (+ "M HERE"
// when the player is in a system with peers). Self-disables when the
// presence feature flag is off. Tooltip shows the top systems by
// population so the player can see at a glance where the action is.

const OnlineRosterIndicator = () => {
  const currentSystemId = useGameStore(s => s.currentSystem);
  const viewMode = useGameStore(s => s.viewMode);
  const [stats, setStats] = useState(() => presence.getOnlineStats());

  useEffect(() => {
    if (!presence.isEnabled()) return;
    // Sync once on mount in case stats arrived before this component
    // existed (singleton outlives mount/unmount).
    setStats(presence.getOnlineStats());
    return presence.on('stats_changed', (s) => setStats(s));
  }, []);

  if (!presence.isEnabled()) return null;

  const total = stats.total_online || 0;
  // HERE only makes sense when the player is actually in a system room.
  // In galaxy-flight mode the store's currentSystem may still hold the
  // last system, but the player has called presence.leaveSystem and
  // isn't in any system's by_system bucket -- showing "HERE: 1" because
  // someone else is in their old system would mislead.
  const here = (viewMode === 'system' && currentSystemId)
    ? (stats.by_system?.[currentSystemId] || 0)
    : 0;

  // Top systems by population for the tooltip. Cap at 5 entries so the
  // tooltip doesn't grow unbounded on a busy day.
  const topSystems = Object.entries(stats.by_system || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => `${id}: ${n}`)
    .join('\n');
  const tooltip = topSystems
    ? `${total} pilot${total === 1 ? '' : 's'} online\nTop systems:\n${topSystems}`
    : `${total} pilot${total === 1 ? '' : 's'} online`;

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5"
      style={{
        background: 'rgba(12,26,51,0.4)',
        border: `1px solid ${BLUE.dim}`,
        borderRadius: 2,
        color: BLUE.light,
      }}
      title={tooltip}
    >
      <span style={{ fontSize: '0.9rem' }}>👥</span>
      <span className="font-bold">{total}</span>
      <span style={{ color: '#3a4a5a', fontSize: '0.5rem' }}>ONLINE</span>
      {here > 0 && (
        <>
          <span style={{ color: '#0e1a2a', margin: '0 2px' }}>·</span>
          <span className="font-bold" style={{ color: '#22d3ee' }}>{here}</span>
          <span style={{ color: '#3a4a5a', fontSize: '0.5rem' }}>HERE</span>
        </>
      )}
    </div>
  );
};

// ============================================
// TOP RESOURCE BAR
// ============================================

const TopBar = () => {
  const credits = useGameStore(state => state.resources?.credits ?? 0);
  const fetchCredits = useGameStore(state => state.fetchCredits);
  const activeShip = useActiveShip();
  const ships = useGameStore(state => state.ships);
  const { user, logout } = useAuthStore();
  const [resetting, setResetting] = useState(false);
  const resetGame = useGameStore(state => state.resetGame);

  // HUD data (updated by SystemView game loop every 5 frames). The
  // shield/armor/hull bars moved to SystemView's bottom-center fleet
  // status readout — the store values are still pushed (CharacterPanel
  // reads them); the top bar just no longer displays them.
  const enemyCount = useGameStore(state => state.enemyCount);
  const autopilotTarget = useGameStore(state => state.autopilotTarget);

  // Settings window opens from the gear button in the top bar. The
  // legacy 🔊/🔇 mute button moved into the settings panel itself so
  // the top bar stays uncluttered and volume sliders + UI scale live
  // alongside the mute toggle.
  const settingsOpen = useGameStore(state => state.windows.settings?.open);
  const toggleWindow = useGameStore(state => state.toggleWindow);

  // Matches MAX_FLEET_SIZE in shipRenderer.js (the in-system formation
  // cap). Was stuck at 3 here while SystemView already rendered 5 -- so
  // the top-bar indicator under-counted the visible flying fleet.
  const MAX_FLEET = 5;
  // Top-bar HUD shows the *active* (flying) fleet, not stored ships.
  const fleetSize = (ships || []).filter(s => s.storage_body_id == null).length;

  useEffect(() => {
    fetchCredits();
    // Poll every 3s as a safety net so the top-bar credits stay in sync
    // even if a downstream refresh chain (vendor, combat) fails to fire.
    const interval = setInterval(fetchCredits, 3000);
    return () => clearInterval(interval);
  }, [fetchCredits]);

  const handleReset = async () => {
    if (!window.confirm('DEV: Wipe all ships, cargo, credits, and scan data? This cannot be undone.')) return;
    setResetting(true);
    try {
      await fittingAPI.resetAccount();
      resetGame();
    } catch (err) {
      alert('Reset failed: ' + err.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center"
      style={{
        height: 34,
        background: 'linear-gradient(180deg, rgba(8,16,32,0.97), rgba(6,12,24,0.92))',
        borderBottom: `1px solid ${EDGE}`,
        fontFamily: "'Rajdhani', sans-serif",
        padding: '0 10px',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-1.5 mr-3 h-full pr-3" style={{ borderRight: `1px solid ${EDGE}`, background: `linear-gradient(135deg, ${BLUE.pri}20, transparent)` }}>
        <div className="w-5 h-5 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${BLUE.pri}, ${BLUE.dark})`, clipPath: 'polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px)' }}>
          <span className="text-white text-[0.9rem] font-black">★</span>
        </div>
        <span className="text-xs font-extrabold tracking-widest" style={{ color: BLUE.light }}>STAR SHIPPER</span>
      </div>

      {/* Credits + Fleet count */}
      <div className="flex items-center gap-0.5" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.9rem' }}>
        <div className="flex items-center gap-1 px-2 h-5" style={{ borderRight: `1px solid ${EDGE}` }} title="Credits">
          <span style={{ fontSize: '0.6875rem' }}>⬡</span>
          <span className="font-bold" style={{ color: GOLD.light }}>{credits.toLocaleString()}</span>
          <span style={{ color: '#3a4a5a', fontSize: '0.5rem' }}>CR</span>
        </div>
        <div className="flex items-center gap-1 px-2 h-5" style={{ borderRight: `1px solid ${EDGE}` }} title="Fleet size">
          <span style={{ fontSize: '0.6875rem' }}>🚀</span>
          <span className="font-bold" style={{ color: BLUE.light }}>{fleetSize}</span>
          <span style={{ color: '#3a4a5a' }}>/{MAX_FLEET}</span>
        </div>
      </div>

      {/* Shield/armor/hull bars used to live here — they're now the
          bottom-center fleet status readout in SystemView, where the
          combat actually happens. */}

      {/* Status indicators (conditional) — fills any remaining space.
          Active training indicator sits first so it has a consistent
          spot regardless of whether the conditional indicators (enemies,
          autopilot) are visible. Clickable -> opens Skills & Research. */}
      <div className="flex items-center gap-3 flex-1 ml-3" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.9rem' }}>
        <ActiveTrainingIndicator
          variant="compact"
          onOpenSkills={() => {
            playSound('button_click');
            useGameStore.getState().openWindow('research');
          }}
        />
        <OnlineRosterIndicator />
        {enemyCount > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5" style={{
            background: 'rgba(127,29,29,0.35)',
            border: '1px solid rgba(239,68,68,0.5)',
            borderRadius: 2,
            color: '#fca5a5',
            animation: 'pulse 2s ease-in-out infinite',
          }}>
            <span>☠</span>
            <span className="font-bold">{enemyCount} HOSTILE{enemyCount !== 1 ? 'S' : ''}</span>
          </div>
        )}
        {autopilotTarget && (
          <div className="flex items-center gap-1 px-2 py-0.5" style={{
            background: `${BLUE.pri}15`,
            border: `1px solid ${BLUE.pri}44`,
            borderRadius: 2,
            color: BLUE.light,
          }}>
            <span style={{ color: BLUE.light }}>◈</span>
            <span className="font-bold">AP → {autopilotTarget.name}</span>
          </div>
        )}
      </div>

      {/* Right cluster: ship name, user, reset */}
      <div className="flex items-center gap-2" style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '0.9rem' }}>
        <div className="mx-1" style={{ width: 1, height: 18, background: EDGE }} />

        {/* Ship name */}
        <div className="px-2 py-0.5" style={{ borderLeft: `2px solid ${BLUE.dim}`, background: `rgba(12,26,51,0.4)` }}>
          <div className="text-[0.9rem] font-bold" style={{ color: '#c8d6e5' }}>{activeShip?.name || 'No Ship'}</div>
          <div className="text-[0.4375rem]" style={{ color: '#3a5a6a' }}>{activeShip?.hull_name || ''}</div>
        </div>

        <div className="mx-1" style={{ width: 1, height: 18, background: EDGE }} />

        {/* User */}
        <span className="text-[0.9rem] mr-1" style={{ color: '#5a6a7a' }}>{user?.username}</span>
        <button
          onClick={() => { playSound('button_click'); logout(); }}
          className="text-[0.9rem] px-1.5 py-0.5 rounded hover:text-red-400 transition-colors"
          style={{ color: '#3a4a5a', border: `1px solid ${EDGE}` }}
          title="Sign Out"
        >✕</button>

        <div className="mx-1" style={{ width: 1, height: 18, background: EDGE }} />

        {/* Settings */}
        <button
          onClick={() => { playSound('button_click'); toggleWindow('settings'); }}
          className="text-[0.9rem] px-1.5 py-0.5 rounded transition-colors ml-1"
          style={{
            color: settingsOpen ? BLUE.light : '#7a8a9a',
            border: `1px solid ${settingsOpen ? `${BLUE.pri}55` : EDGE}`,
            background: settingsOpen ? `${BLUE.pri}10` : 'transparent',
          }}
          title="Settings (audio, interface, ...)"
        >⚙️</button>

        <div className="mx-1" style={{ width: 1, height: 18, background: EDGE }} />

        {/* DEV Reset */}
        <button
          onClick={() => { playSound('button_click'); handleReset(); }}
          disabled={resetting}
          className="text-[0.5rem] font-bold px-1.5 py-0.5 rounded hover:bg-red-900/50 transition-colors disabled:opacity-40"
          style={{ color: '#ef4444', border: '1px solid #ef444433' }}
          title="DEV: Reset account"
        >
          {resetting ? '...' : '⚠ RESET'}
        </button>
      </div>
    </div>
  );
};

// ============================================
// LEFT TOOLBAR
// ============================================

// Keep in sync with CONTEXT_PANELS in gameStore.js (openContextPanel).
const CONTEXT_PANELS = ['character', 'fleet', 'inventory', 'crafting', 'questLog', 'planetInteraction', 'leaderboards', 'corp', 'bounties', 'mail'];
const MODALS = ['shipBuilder', 'galaxyMap'];

// Width of the toolbar in each state. Kept in sync with the ContextPanel
// left-anchor math (see ContextPanel.jsx -- imports nothing, just reads
// `toolbarExpanded` from the store and applies the same numbers).
const TOOLBAR_ICON_SIZE = 38;
const TOOLBAR_WIDTH_COLLAPSED = TOOLBAR_ICON_SIZE;       // icon-only
const TOOLBAR_WIDTH_EXPANDED  = 160;                     // icon + label

const LeftToolbar = () => {
  const windows = useGameStore(state => state.windows);
  const closeWindow = useGameStore(state => state.closeWindow);
  const openWindow = useGameStore(state => state.openWindow);
  const openContextPanel = useGameStore(state => state.openContextPanel);
  const dockedBody = useGameStore(state => state.dockedBody);
  const expanded = useGameStore(state => state.toolbarExpanded ?? true);
  const toggleToolbar = useGameStore(state => state.toggleToolbar);
  // Step 9: pulled out of the button render so a single hook
  // subscribes once. Add more keys here if other buttons start
  // wanting badges -- pass the resolved value into the map below.
  const mailUnreadCount = useGameStore(state => state.mailUnreadCount);

  const handleClick = (id) => {
    playSound('button_click');
    const isCurrentlyOpen = windows[id]?.open && !windows[id]?.minimized;

    if (isCurrentlyOpen) {
      // Just close it
      closeWindow(id);
    } else if (CONTEXT_PANELS.includes(id)) {
      // Use the store action — it closes other context panels atomically
      openContextPanel(id);
    } else {
      // Modals (shipBuilder, galaxyMap) don't participate in the one-at-a-time rule
      openWindow(id);
    }
  };

  // Build the button list — append the Planet button only while docked
  const buttons = dockedBody ? [...TOOLBAR_BUTTONS, PLANET_BUTTON] : TOOLBAR_BUTTONS;
  const width = expanded ? TOOLBAR_WIDTH_EXPANDED : TOOLBAR_WIDTH_COLLAPSED;

  return (
    // Outer wrapper holds the button stack + the floating chevron so
    // the chevron can be vertically centered against the button column
    // without measuring its height.
    <div
      className="fixed left-1.5 z-40"
      style={{ top: 46, width, transition: 'width 0.18s ease' }}
    >
      <div className="flex flex-col gap-0.5">
        {buttons.map(btn => {
          const isOpen = windows[btn.id]?.open && !windows[btn.id]?.minimized;
          return (
            <button
              key={btn.id}
              onClick={() => handleClick(btn.id)}
              title={btn.label}
              className="transition-all"
              style={{
                width: '100%',
                height: TOOLBAR_ICON_SIZE,
                display: 'flex',
                alignItems: 'center',
                // Label-left / icon-right when expanded; just icon centered when collapsed.
                justifyContent: expanded ? 'space-between' : 'center',
                paddingLeft: expanded ? 10 : 0,
                paddingRight: expanded ? 8 : 0,
                background: isOpen
                  ? `linear-gradient(135deg, ${btn.color}25, ${btn.color}0a)`
                  : 'rgba(8,14,28,0.9)',
                border: `1px solid ${isOpen ? btn.color + '55' : EDGE}`,
                clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
                cursor: 'pointer',
                filter: isOpen ? `drop-shadow(0 0 6px ${btn.color}44)` : 'none',
              }}
            >
              {expanded && (
                <span style={{
                  fontSize: '0.6875rem',
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  color: isOpen ? btn.color : '#a0b0c0',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  // ellipsis if a future button label ever overflows
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginRight: 8,
                }}>{btn.label}</span>
              )}
              <span style={{ fontSize: '1rem', lineHeight: 1, position: 'relative' }}>
                {btn.icon}
                {/* Unread / activity badge -- only renders when the
                    button has a badgeStoreKey and the resolved value
                    is > 0. v1 covers mail; trivial to extend later. */}
                {(() => {
                  if (!btn.badgeStoreKey) return null;
                  const n = btn.badgeStoreKey === 'mailUnreadCount' ? mailUnreadCount : 0;
                  if (!n || n <= 0) return null;
                  return (
                    <span style={{
                      position: 'absolute',
                      top: -6, right: -8,
                      minWidth: 14, height: 14,
                      padding: '0 4px',
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: '0.9rem', fontWeight: 800,
                      fontFamily: "'Share Tech Mono', monospace",
                      borderRadius: 7,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      lineHeight: 1,
                      boxShadow: '0 0 4px rgba(239,68,68,0.5)',
                    }}>{n > 99 ? '99+' : n}</span>
                  );
                })()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right-edge chevron -- vertically centered against the button
          column. Half-overlaps the toolbar so it reads as "the side
          handle." Clicking flips toolbarExpanded; the toolbar width
          animates and ContextPanel shifts to clear the new chrome. */}
      <button
        onClick={() => { playSound('button_click'); toggleToolbar(); }}
        title={expanded ? 'Collapse menu to icons' : 'Show menu labels'}
        style={{
          position: 'absolute',
          top: '50%',
          right: -10,
          transform: 'translateY(-50%)',
          width: 18,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(8,14,28,0.95)',
          border: `1px solid ${EDGE}`,
          borderRadius: 3,
          color: BLUE.light,
          fontSize: '0.9rem',
          fontFamily: "'Share Tech Mono', monospace",
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
        }}
      >{expanded ? '◀' : '▶'}</button>
    </div>
  );
};

// BottomBar removed 2026-06-02 — its pause / game-speed controls were
// vestigial (nothing reads gamePaused/gameSpeed) and the system-name label
// is shown on the galaxy map. The bottom-center is now the power hotbar.

// ============================================
// GAME FRAME (main export)
// ============================================

// SystemMapToggle -- standalone bottom-right button. Lives outside the
// LeftToolbar because the user wants it visually separated; it's the
// only persistent surface for the system map.
const SystemMapToggle = () => {
  const isOpen = useGameStore(state => state.windows.systemMap?.open);
  const toggleWindow = useGameStore(state => state.toggleWindow);
  return (
    <button
      onClick={() => { playSound('button_click'); toggleWindow('systemMap'); }}
      title={isOpen ? 'Hide System Map' : 'Show System Map'}
      className="fixed z-40 transition-all"
      style={{
        right: 8,
        bottom: 40,                       // clears the BottomBar (height ~32)
        width: 38,
        height: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isOpen ? `${BLUE.pri}25` : 'rgba(8,14,28,0.92)',
        border: `1px solid ${isOpen ? BLUE.pri : EDGE}`,
        borderRadius: 4,
        color: isOpen ? BLUE.light : '#7a8a9a',
        fontSize: '1.125rem',
        cursor: 'pointer',
      }}
    >
      🗺️
    </button>
  );
};

// Wires the global dockedBodyDbId into the presence singleton so the
// server knows which body we're docked at (drives the "Pilots Docked
// Here" panel + the Trade-button gating on profile windows). Runs once
// per mount/dock-change; idempotent on the presence side.
const DockedBodyPresenceBridge = () => {
  const dockedBodyDbId = useGameStore(s => s.dockedBodyDbId);
  useEffect(() => {
    if (!presence.isEnabled()) return;
    if (dockedBodyDbId) presence.dockAtBody(dockedBodyDbId);
    else presence.undockFromBody();
  }, [dockedBodyDbId]);
  return null;
};

// Trade singleton bootstrap: ensures the socket bus + listeners are
// up as soon as the user is in-game, and recovers any active trade
// session after a page reload (singleton state was lost; server still
// has it, so we re-hydrate from /api/trade/active).
const TradeBootstrap = () => {
  useEffect(() => {
    if (!trade.isEnabled()) return;
    trade.ensureReady();
    trade.recoverActive().catch(() => {});
  }, []);
  return null;
};

// Mail unread-count poller (Step 9). Polls every 60s + on mount so
// the toolbar badge stays roughly fresh. The InboxWindow refreshes
// the same store key immediately after read/delete/send actions, so
// the badge updates instantly for user actions; the poll is just a
// fallback for "new mail arrived while idle".
const MailUnreadPoller = () => {
  const setMailUnread = useGameStore(s => s.setMailUnread);
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = () => {
      mailAPI.unreadCount()
        .then(({ count }) => { if (!cancelled) setMailUnread?.(count); })
        .catch(() => {});
    };
    fetchOnce();
    const t = setInterval(fetchOnce, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [setMailUnread]);
  return null;
};

export const GameFrame = ({ children }) => {
  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: '#030610' }}>
      <DockedBodyPresenceBridge />
      <TradeBootstrap />
      <MailUnreadPoller />
      <TopBar />
      <LeftToolbar />
      <SystemMapWindow />
      <SystemMapToggle />

      {/* Game content area — fills space below the top bar */}
      <div className="absolute left-0 right-0" style={{ top: 34, bottom: 0 }}>
        {children}
      </div>

      {/* Chat panel — fixed bottom-left; collapsible. Always mounted
          when GameFrame is up (i.e. user is logged in), works in both
          SystemView and GalaxyFlightView. Self-disables when the
          presence/chat feature flag is off. */}
      <ChatPanel />

      {/* Activity ticker — fixed top-center strip showing the latest
          galaxy-wide event. Self-hides until the first event arrives,
          self-disables when the presence feature flag is off. */}
      <ActivityTicker />

      {/* Leaderboards modal — mounted globally so the toolbar button
          can open/close it from anywhere. ModalOverlay short-circuits
          the render when closed, so this is essentially free. */}
      <LeaderboardsWindow />

      {/* Public profile modal — opened via store.openProfile(userId)
          from chat name clicks and leaderboard row clicks. No toolbar
          button (there's no "my profile" use case yet -- CharacterPanel
          covers that). */}
      <ProfileWindow />

      {/* Trade UI surfaces — both self-hidden until something is
          happening. The toast appears top-right when an invite
          arrives; the window covers the screen when a trade is
          active. Both self-disable when the presence flag is off. */}
      <TradeInviteToast />
      <TradeWindow />

      {/* Corporation window — opened via toolbar button. Self-hides
          when not open via ModalOverlay short-circuit. */}
      <CorpWindow />

      {/* Bounty board — same pattern: toolbar button, modal, self-
          hides when not open. */}
      <BountyBoardWindow />

      {/* Inbox / Mail — same pattern. */}
      <InboxWindow />

      {/* Singleton cargo hover tooltip — tiles anywhere call
          cargoTooltip.show()/hide() and only this tiny layer
          re-renders (not the hosting cargo grid). */}
      <CargoTooltipLayer />
    </div>
  );
};

export default GameFrame;
