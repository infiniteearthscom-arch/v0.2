// QuestLogWindow.jsx -- the Missions board (2026-09-24 rework).
//
// ONE board for everything the pilot has taken on: story quests
// (quest_definitions) and contracts (hauling / fetch / bounty from the
// station boards). Filter chips by type, a sort menu, a search box, and
// Active / Completed tabs. Contract actions (deliver / turn in / collect,
// abandon, pin) live here; the station Contracts tab only OFFERS.

import React, { useState, useEffect, useMemo } from 'react';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { useGameStore } from '@/stores/gameStore';
import { COLORS, FONT, SectionHead, Pill, glow } from '@/components/ui/panelStyles';
import { contractsAPI } from '@/utils/api';
import { playSound } from '@/utils/audio';
import { tierColor, tierLabel } from '@/utils/tiers';
import { Portrait } from '@/components/pixel/PixelArt';
import { questGiverFor, npcName, npcRace } from '@/utils/pixelArt/portrait';

// Category → accent color mapping (story) + contract types
const CATEGORY_COLORS = {
  tutorial: COLORS.CYAN.light,
  main:     COLORS.GOLD.light,
  side:     COLORS.PURPLE.light,
  faction:  COLORS.GREEN.light,
  haul:     COLORS.GOLD.light,
  fetch:    COLORS.CYAN.light,
  bounty:   '#f87171',
};
const TYPE_FILTERS = [
  { id: 'all',    label: 'All' },
  { id: 'story',  label: 'Story',   icon: '📜' },
  { id: 'haul',   label: 'Hauling', icon: '📦' },
  { id: 'fetch',  label: 'Fetch',   icon: '⛏' },
  { id: 'bounty', label: 'Bounty',  icon: '🎯' },
];
const SORTS = [
  { id: 'priority', label: 'Priority' },   // pinned, then soonest deadline, then story order
  { id: 'deadline', label: 'Time left' },
  { id: 'reward',   label: 'Reward' },
  { id: 'tier',     label: 'Tier' },
  { id: 'system',   label: 'System' },
  { id: 'newest',   label: 'Newest' },
];
const minutesLeft = (iso) => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
const fmt = (n) => Number(n || 0).toLocaleString();
const normName = (s) => String(s || '').trim().toLowerCase();

// ============================================
// REWARD BADGES (story quests)
// ============================================
const Badge = ({ color, children }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px',
    background: `${color}1a`, border: `1px solid ${color}55`, borderRadius: 2,
    color, fontSize: '0.8rem', fontFamily: FONT.mono, fontWeight: 700, letterSpacing: 0.5,
  }}>{children}</span>
);
const RewardBadges = ({ rewards }) => {
  if (!rewards) return null;
  const badges = [];
  if (rewards.credits) badges.push(<Badge key="c" color={COLORS.GOLD.light}>⬡ {rewards.credits.toLocaleString()} CR</Badge>);
  (rewards.items || []).forEach((item, i) => badges.push(<Badge key={`i${i}`} color={COLORS.BLUE.light}>📦 {item.quantity}× {item.item_id.replace(/_/g, ' ')}</Badge>));
  if (!badges.length) return null;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>{badges}</div>;
};

const PinButton = ({ pinned, accent, onClick }) => (
  <button onClick={onClick} title={pinned ? 'Unpin from top overlay' : 'Pin to top overlay'} style={{
    background: pinned ? `${accent}22` : 'transparent', border: `1px solid ${pinned ? accent : COLORS.EDGE}`,
    color: pinned ? accent : COLORS.TEXT.muted, padding: '2px 8px', cursor: 'pointer', borderRadius: 2,
    fontSize: '0.6875rem', lineHeight: 1, flexShrink: 0, fontFamily: FONT.ui,
  }}>{pinned ? '📌 PINNED' : '📌 PIN'}</button>
);
const ActionButton = ({ children, onClick, disabled, accent = COLORS.CYAN.light, title }) => (
  <button onClick={onClick} disabled={disabled} title={title} style={{
    padding: '4px 10px', borderRadius: 2, cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'transparent' : `${accent}22`, border: `1px solid ${disabled ? COLORS.EDGE : accent + '88'}`,
    color: disabled ? COLORS.TEXT.muted : accent, fontFamily: FONT.ui, fontWeight: 800, fontSize: '0.7rem', letterSpacing: 0.8, whiteSpace: 'nowrap',
  }}>{children}</button>
);

const cardStyle = (isActive, accent) => ({
  background: isActive ? `linear-gradient(135deg, ${accent}10, transparent)` : COLORS.ROW_BG,
  border: `1px solid ${COLORS.EDGE}`, borderLeft: `2px solid ${isActive ? accent : COLORS.EDGE}`,
  borderRadius: 3, padding: 10, marginBottom: 8, opacity: isActive ? 1 : 0.6, transition: 'all 0.15s',
  boxShadow: isActive ? glow(accent, 0.12) : 'none',
});
const titleStyle = { fontSize: '0.75rem', fontWeight: 700, color: COLORS.TEXT.primary, fontFamily: FONT.ui, letterSpacing: 0.3 };
const bodyStyle = { fontSize: '0.6875rem', color: COLORS.TEXT.secondary, lineHeight: 1.5, fontFamily: FONT.ui, margin: 0 };

// ============================================
// STORY QUEST CARD
// ============================================
const QuestCard = ({ quest, isActive }) => {
  const category = quest.category || 'main';
  const accent = CATEGORY_COLORS[category] || COLORS.GOLD.light;
  const pinQuest = useGameStore(state => state.pinQuest);
  const giverRole = questGiverFor(category);
  const giverSeed = `quest|${category}`;
  return (
    <div style={cardStyle(isActive, accent)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
        <Portrait seed={giverSeed} role={giverRole} size={48} title={npcName(giverSeed, npcRace(giverSeed, giverRole))} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          <span style={titleStyle}>{quest.title}</span>
          <Pill color={accent}>{category}</Pill>
        </div>
        {isActive
          ? <PinButton pinned={!!quest.pinned} accent={accent} onClick={() => pinQuest(quest.quest_id, !quest.pinned)} />
          : <span style={{ color: COLORS.GREEN.light, fontSize: '0.8rem', fontFamily: FONT.ui, fontWeight: 700, letterSpacing: 0.5, flexShrink: 0 }}>✓ DONE</span>}
      </div>
      <p style={bodyStyle}>{quest.description}</p>
      {isActive && <RewardBadges rewards={quest.rewards} />}
    </div>
  );
};

// ============================================
// CONTRACT CARD
// ============================================
const contractTitle = (c) => {
  if (c.contract_type === 'fetch') return `Bring ${c.cargo_volume} × ${c.cargo_label}`;
  if (c.contract_type === 'bounty') return c.cargo_label;
  return `Haul ${c.cargo_label} ×${c.cargo_volume}`;
};
const contractProgress = (c) => {
  if (c.contract_type === 'fetch') return { text: `have ${c.have_qualifying || 0}/${c.cargo_volume}`, ready: (c.have_qualifying || 0) >= c.cargo_volume };
  if (c.contract_type === 'bounty') return { text: `kills ${c.progress || 0}/${c.cargo_volume}`, ready: (c.progress || 0) >= c.cargo_volume };
  const lost = c.freight_units != null && c.freight_units < c.cargo_volume;
  return { text: lost ? 'freight lost — reclaim your wreck' : `freight aboard ${c.cargo_volume}`, ready: !lost, lost };
};
const STATUS_LABEL = { delivered: '✓ DELIVERED', failed: '✗ FAILED', expired: '✗ EXPIRED', abandoned: '— ABANDONED' };

const ContractCard = ({ contract: c, isActive, here, busy, onDeliver, onAbandon, onPin }) => {
  const accent = CATEGORY_COLORS[c.contract_type] || COLORS.GOLD.light;
  const left = minutesLeft(c.deadline_at);
  const prog = contractProgress(c);
  const verb = c.contract_type === 'fetch' ? 'TURN IN' : c.contract_type === 'bounty' ? 'COLLECT' : 'DELIVER';
  const faceSeed = c.target_template_id ? c.target_template_id : `${c.origin_system_id}|${String(c.origin_station || '').toLowerCase()}|broker`;
  const faceRole = c.target_template_id ? 'pirate' : 'broker';
  return (
    <div style={cardStyle(isActive, accent)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
        <Portrait seed={faceSeed} role={faceRole} size={48} title={c.target_template_id ? c.cargo_label : `${npcName(faceSeed, npcRace(faceSeed, 'broker'))} · Contract Broker`} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
          <span style={titleStyle}>{contractTitle(c)}</span>
          <Pill color={accent}>{c.contract_type}</Pill>
          <Pill color={tierColor(c.tier)}>T{tierLabel(c.tier)}</Pill>
          {c.contested && <Pill color="#f87171">contested</Pill>}
          {c.rush && <Pill color="#f87171">rush</Pill>}
        </div>
        {isActive
          ? <PinButton pinned={c.pinned !== false} accent={accent} onClick={() => onPin(c, c.pinned === false)} />
          : <span style={{ color: c.status === 'delivered' ? COLORS.GREEN.light : '#f87171', fontSize: '0.8rem', fontFamily: FONT.ui, fontWeight: 700, letterSpacing: 0.5, flexShrink: 0 }}>{STATUS_LABEL[c.status] || c.status}</span>}
      </div>
      <p style={bodyStyle}>
        {c.contract_type === 'haul' ? 'Deliver to' : 'Turn in at'} <b>{c.dest_station}</b>, {c.dest_system_name}
        {c.contract_type === 'haul' && c.hops ? ` · ${c.hops} hop${c.hops === 1 ? '' : 's'}` : ''}
        {isActive ? <> · <span style={{ color: prog.lost ? '#f87171' : prog.ready ? COLORS.GREEN.light : COLORS.TEXT.secondary }}>{prog.text}</span></> : null}
        {c.contract_type === 'bounty' && isActive ? ' (salvage the wreck to log a kill)' : ''}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <Badge color={COLORS.GOLD.light}>⬡ {fmt(c.payout || c.reward)} CR</Badge>
          {isActive && <Badge color={left < 5 ? '#f87171' : COLORS.CYAN.light}>⏱ {left} min</Badge>}
        </div>
        {isActive && (
          <div style={{ display: 'flex', gap: 6 }}>
            <ActionButton accent={COLORS.GREEN.light} disabled={busy || !here || !prog.ready} onClick={() => onDeliver(c)}
              title={!here ? `Dock at ${c.dest_station} in ${c.dest_system_name}` : !prog.ready ? prog.text : ''}>{verb}</ActionButton>
            <ActionButton accent="#f87171" disabled={busy} onClick={() => onAbandon(c)}>ABANDON</ActionButton>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// MISSIONS BOARD
// ============================================
export const QuestLogWindow = () => {
  const quests = useGameStore(state => state.quests);
  const fetchQuests = useGameStore(state => state.fetchQuests);
  const contracts = useGameStore(state => state.allContracts) || [];
  const bumpContracts = useGameStore(state => state.bumpContracts);
  const pinContract = useGameStore(state => state.pinContract);
  const currentSystem = useGameStore(state => state.currentSystem);
  const dockedBody = useGameStore(state => state.dockedBody);
  const pushToast = useGameStore(state => state.pushToast);
  const fetchCredits = useGameStore(state => state.fetchCredits);
  const fetchCargoInfo = useGameStore(state => state.fetchCargoInfo);
  const isOpen = useGameStore(state => state.windows.questLog?.open);

  const [tab, setTab] = useState('active');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('priority');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => { fetchQuests(); }, [fetchQuests]);
  useEffect(() => { if (isOpen && bumpContracts) bumpContracts(); }, [isOpen]);
  useEffect(() => { if (!isOpen) return undefined; const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, [isOpen]);

  const flash = (kind, text) => pushToast && pushToast({ kind, text, duration: 5000 });
  const hereFor = (c) => c.dest_system_id === currentSystem && normName(dockedBody?.name) === normName(c.dest_station);
  const deliver = async (c) => {
    if (busy) return; setBusy(true);
    try {
      playSound('button_click');
      const r = await contractsAPI.deliver(c.id);
      if (r.failed) flash('error', `Failed — ${r.why}`); else flash('success', `${contractTitle(c)} complete · +${fmt(r.payout)} CR`);
      if (fetchCredits) fetchCredits(); if (fetchCargoInfo) fetchCargoInfo(); if (bumpContracts) bumpContracts();
    } catch (e) { flash('error', e.message || 'Could not deliver'); }
    finally { setBusy(false); }
  };
  const abandon = async (c) => {
    if (busy) return;
    if (!window.confirm(`Abandon "${contractTitle(c)}"?${c.contract_type === 'haul' ? ' The freight is forfeited.' : ''}`)) return;
    setBusy(true);
    try { await contractsAPI.abandon(c.id); flash('info', 'Contract abandoned'); if (bumpContracts) bumpContracts(); }
    catch (e) { flash('error', e.message || 'Could not abandon'); }
    finally { setBusy(false); }
  };

  // ---- unify + filter + sort ----
  const items = useMemo(() => {
    const rows = [];
    for (const q of quests) rows.push({ kind: 'quest', key: `q-${q.quest_id}`, active: q.status === 'active', type: 'story', title: q.title, system: '', tier: 0, reward: q.rewards?.credits || 0, deadline: Infinity, order: q.sort_order || 0, pinned: !!q.pinned, created: q.activated_at, q });
    for (const c of contracts) rows.push({ kind: 'contract', key: `c-${c.id}`, active: c.status === 'active', type: c.contract_type, title: `${contractTitle(c)} ${c.dest_station} ${c.dest_system_name}`, system: c.dest_system_name || '', tier: c.tier || 1, reward: c.payout || c.reward || 0, deadline: c.status === 'active' ? new Date(c.deadline_at).getTime() : Infinity, order: 1e9, pinned: c.pinned !== false, created: c.accepted_at, c });
    const q = search.trim().toLowerCase();
    let out = rows.filter(r => r.active === (tab === 'active'))
      .filter(r => type === 'all' || r.type === type)
      .filter(r => !q || r.title.toLowerCase().includes(q) || r.system.toLowerCase().includes(q));
    const cmp = {
      priority: (a, b) => (b.pinned - a.pinned) || (a.deadline - b.deadline) || (a.order - b.order),
      deadline: (a, b) => (a.deadline - b.deadline) || (a.order - b.order),
      reward:   (a, b) => (b.reward - a.reward),
      tier:     (a, b) => (b.tier - a.tier) || (a.deadline - b.deadline),
      system:   (a, b) => a.system.localeCompare(b.system) || (a.deadline - b.deadline),
      newest:   (a, b) => new Date(b.created || 0) - new Date(a.created || 0),
    }[sort] || ((a, b) => 0);
    return out.sort(cmp);
  }, [quests, contracts, tab, type, sort, search]);

  const counts = useMemo(() => ({
    active: quests.filter(q => q.status === 'active').length + contracts.filter(c => c.status === 'active').length,
    completed: quests.filter(q => q.status === 'completed').length + contracts.filter(c => c.status !== 'active').length,
  }), [quests, contracts]);

  const TabButton = ({ id, label, icon, count, accent }) => {
    const isActive = tab === id;
    return (
      <button onClick={() => setTab(id)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
        background: isActive ? `linear-gradient(180deg, ${accent}22, ${accent}08)` : 'rgba(4,8,16,0.5)',
        border: `1px solid ${isActive ? `${accent}66` : COLORS.EDGE}`, borderLeft: isActive ? `2px solid ${accent}` : `1px solid ${COLORS.EDGE}`,
        borderRadius: 3, color: isActive ? accent : COLORS.TEXT.muted, fontSize: '0.8rem', fontWeight: 800, fontFamily: FONT.ui,
        cursor: 'pointer', letterSpacing: 1, textTransform: 'uppercase', transition: 'all 0.15s', boxShadow: isActive ? glow(accent, 0.15) : 'none',
      }}>
        <span>{icon}</span><span>{label}</span>
        {count > 0 && <span style={{ background: isActive ? accent : `${accent}33`, color: isActive ? '#0a0e18' : accent, borderRadius: 8, padding: '0 6px', fontSize: '0.8rem', fontWeight: 800, fontFamily: FONT.mono, minWidth: 14, textAlign: 'center' }}>{count}</span>}
      </button>
    );
  };
  const chipStyle = (on, accent = COLORS.CYAN.light) => ({
    padding: '3px 9px', borderRadius: 10, cursor: 'pointer', fontFamily: FONT.ui, fontSize: '0.7rem', fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
    background: on ? `${accent}22` : 'transparent', border: `1px solid ${on ? accent : COLORS.EDGE}`, color: on ? accent : COLORS.TEXT.muted,
  });
  const inputStyle = { background: '#050a14', color: COLORS.TEXT.primary, border: `1px solid ${COLORS.EDGE}`, borderRadius: 2, padding: '3px 7px', fontFamily: FONT.ui, fontSize: '0.75rem' };

  return (
    <ContextPanel windowId="questLog" title="Missions" icon="📋" accent={COLORS.CYAN.light} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <TabButton id="active" label="Active" icon="📋" count={counts.active} accent={COLORS.CYAN.light} />
          <TabButton id="completed" label="Completed" icon="✓" count={counts.completed} accent={COLORS.GREEN.light} />
        </div>

        {/* filter chips + sort + search */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          {TYPE_FILTERS.map(f => (
            <button key={f.id} onClick={() => setType(f.id)} style={chipStyle(type === f.id, CATEGORY_COLORS[f.id] || COLORS.CYAN.light)}>{f.icon ? `${f.icon} ` : ''}{f.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <select value={sort} onChange={e => setSort(e.target.value)} style={inputStyle}>
            {SORTS.map(s => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title / system" style={{ ...inputStyle, flex: 1 }} />
        </div>

        <SectionHead
          title={tab === 'active' ? 'Current Objectives' : 'Mission History'}
          accent={tab === 'active' ? COLORS.CYAN.light : COLORS.GREEN.light}
          icon={tab === 'active' ? '◆' : '✓'} marginTop={0}
          right={`${items.length} SHOWN`}
        />

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: COLORS.TEXT.muted, fontSize: '0.6875rem', fontFamily: FONT.ui }}>
              {tab === 'active' ? 'Nothing here. Story missions arrive as you play; contracts are offered at station boards.' : 'No completed missions yet.'}
            </div>
          ) : items.map(r => r.kind === 'quest'
            ? <QuestCard key={r.key} quest={r.q} isActive={r.active} />
            : <ContractCard key={r.key} contract={r.c} isActive={r.active} here={hereFor(r.c)} busy={busy} onDeliver={deliver} onAbandon={abandon} onPin={(c, pinned) => pinContract && pinContract(c.id, pinned)} />)}
        </div>
      </div>
    </ContextPanel>
  );
};

export default QuestLogWindow;
