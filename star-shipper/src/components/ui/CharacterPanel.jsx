// CharacterPanel — Player identity, fleet overview, and progression placeholders.
// The skills and reputation sections are placeholders for upcoming systems
// (see HANDOFFv4.md FOUNDATIONAL DESIGN DECISIONS section).

import React from 'react';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { useGameStore, useActiveShip } from '@/stores/gameStore';
import { useAuthStore } from '@/stores/authStore';

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
    {icon && <span style={{ marginRight: 6, fontSize: 12 }}>{icon}</span>}
    <span style={{
      fontSize: 11,
      fontWeight: 800,
      color: accent,
      letterSpacing: 1.5,
      fontFamily: F,
      textTransform: 'uppercase',
      flex: 1,
    }}>{title}</span>
    {right && <span style={{ fontSize: 9, color: '#3a5a6a', fontFamily: FM }}>{right}</span>}
  </div>
);

// A single stat row inside a section
const StatRow = ({ label, value, color = '#c8d6e5' }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 2px',
    fontSize: 10,
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
    <span style={{ fontSize: 14 }}>{icon}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: '#a0b0c0', fontWeight: 700, fontFamily: F }}>{label}</div>
      {detail && <div style={{ fontSize: 9, color: '#3a5a6a', fontFamily: FM }}>{detail}</div>}
    </div>
    <span style={{
      fontSize: 8,
      color: '#4a6080',
      fontFamily: FM,
      letterSpacing: 1,
      padding: '2px 6px',
      border: `1px solid ${EDGE}`,
      borderRadius: 2,
    }}>SOON</span>
  </div>
);

export const CharacterPanel = () => {
  const { user } = useAuthStore();
  const credits = useGameStore(state => state.resources?.credits ?? 0);
  const ships = useGameStore(state => state.ships);
  const activeShip = useActiveShip();
  const discoveredSystems = useGameStore(state => state.discoveredSystems);
  const playerHull = useGameStore(state => state.playerHull);
  const playerMaxHull = useGameStore(state => state.playerMaxHull);

  const fleetSize = ships?.length || 0;
  const systemsVisited = discoveredSystems instanceof Set
    ? discoveredSystems.size
    : (Array.isArray(discoveredSystems) ? discoveredSystems.length : 0);

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
            fontSize: 20,
          }}>👤</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0', fontFamily: F }}>
              CMDR {user?.displayName || user?.username || 'Unknown'}
            </div>
            <div style={{ fontSize: 9, color: BLUE.light, fontFamily: FM, letterSpacing: 1 }}>
              INDEPENDENT PILOT
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          fontFamily: FM,
          paddingTop: 8,
          borderTop: `1px solid ${EDGE}`,
        }}>
          <span style={{ color: '#4a6580' }}>CREDITS</span>
          <span style={{ color: GOLD.light, fontWeight: 700 }}>⬡ {credits.toLocaleString()} CR</span>
        </div>
      </div>

      {/* Fleet overview - real data */}
      <SectionHead title="Fleet Overview" accent={BLUE.light} icon="🚀" right={`${fleetSize}/3`} />
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
        <StatRow label="Ships in Fleet" value={`${fleetSize} / 3`} />
        <StatRow label="Systems Explored" value={`${systemsVisited}`} color={BLUE.light} />
      </div>

      {/* Skills placeholder — teases the 10 categories from the design doc */}
      <SectionHead title="Skills" accent={BLUE.light} icon="🧠" right="COMING SOON" />
      <div style={{
        fontSize: 10,
        color: '#4a6580',
        fontFamily: F,
        lineHeight: 1.5,
        padding: '6px 10px',
        marginBottom: 8,
      }}>
        EVE-style real-time skill training. Skills train continuously, even while offline. Queue multiple skills in advance.
      </div>
      <TeaserRow icon="⚔️" label="Combat" detail="Gunnery, missiles, drones, fleet tactics" />
      <TeaserRow icon="🚀" label="Piloting" detail="One tree per hull class" />
      <TeaserRow icon="🧭" label="Navigation" detail="Warp, jump drives, fuel efficiency" />
      <TeaserRow icon="⛏️" label="Mining" detail="Ore, gas, ice, planetary harvesting" />
      <TeaserRow icon="🏭" label="Industry" detail="Refining, manufacturing, blueprints" />
      <TeaserRow icon="🔬" label="Science" detail="Research, materials, engineering" />
      <TeaserRow icon="💰" label="Trade" detail="Broker relations, wholesale, markets" />
      <TeaserRow icon="🏗️" label="Infrastructure" detail="Outposts, starbases, modules" />
      <TeaserRow icon="🧑‍🚀" label="Social" detail="Leadership, diplomacy, reputation" />
      <TeaserRow icon="📚" label="Meta" detail="Learning speed, memory, focus" />

      {/* Reputation placeholder */}
      <SectionHead title="Reputation" accent="#f59e0b" icon="🤝" right="COMING SOON" />
      <div style={{
        fontSize: 10,
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
