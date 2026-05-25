import React, { useState, useEffect, useMemo } from 'react';
import { ContextPanel } from '@/components/ui/ContextPanel';
import { fittingAPI } from '@/utils/api';
import { useGameStore } from '@/stores/gameStore';
import { getShipImage, MAX_FLEET_SIZE } from '@/utils/shipRenderer';
import {
  COLORS, FONT, SectionHead, Pill, PanelButton, MessageBar, glow,
} from '@/components/ui/panelStyles';

// ============================================
// SHIP THUMBNAIL (uses shared renderer)
// ============================================
const ShipThumb = ({ hullId, size = 48 }) => {
  const img = useMemo(() => getShipImage(hullId, size / 200), [hullId, size]);
  if (!img) return null;
  return (
    <img src={img.dataUrl} width={size} height={size}
      style={{ imageRendering: 'pixelated', display: 'block' }} />
  );
};

const SLOT_COLORS = {
  engine:  '#ff6622',
  weapon:  '#ff2244',
  shield:  '#8844ff',
  cargo:   '#ddaa22',
  utility: '#22ccaa',
  reactor: '#00ddff',
  mining:  '#aa66ff',
};

// ============================================
// SHIP CARD
// ============================================
// Active ships: shown normally, can Set Active / Fitting.
// Stored ships: dimmed, show storage location, can Activate (if docked HERE
// and fleet has room).
// Storing ships happens from the station-side Ships sub-tab in
// PlanetInteractionWindow -- the FleetWindow store button was removed
// since it depended on dockedBodyDbId which only populated while the
// planet window was open (broken every time the player opened Fleet
// after closing the planet panel).
const ShipCard = ({
  ship, isActive, fleetPos, isStored, storedHere, canActivateForCap,
  onSetActive, onOpenFitting, onActivate,
  renamingId, renameVal, setRenameVal, startRename, finishRename,
}) => {
  const fittedMods = ship.fitted_modules || {};
  const fittedCount = Object.keys(fittedMods).length;
  const totalSlots = (ship.hull_slots || []).length;
  const isRenaming = renamingId === ship.id;

  const accent = isActive ? COLORS.BLUE.pri : (isStored ? COLORS.GOLD.pri : COLORS.EDGE);

  return (
    <div style={{
      background: isActive
        ? `linear-gradient(135deg, ${COLORS.BLUE.pri}10, transparent)`
        : COLORS.ROW_BG,
      border: `1px solid ${COLORS.EDGE}`,
      borderLeft: `2px solid ${accent}`,
      borderRadius: 3,
      padding: 10,
      marginBottom: 8,
      transition: 'all 0.15s',
      boxShadow: isActive ? glow(COLORS.BLUE.pri, 0.15) : 'none',
      opacity: isStored ? 0.65 : 1,
    }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {/* Thumbnail */}
        <div style={{
          flexShrink: 0,
          width: 56,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(2,4,10,0.6)',
          border: `1px solid ${COLORS.EDGE}`,
          borderRadius: 2,
          filter: isStored ? 'grayscale(0.5)' : 'none',
        }}>
          <ShipThumb hullId={ship.hull_type_id} size={48} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + badges row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
            {isRenaming ? (
              <input
                autoFocus
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={() => finishRename(ship.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') finishRename(ship.id);
                  if (e.key === 'Escape') finishRename(null);
                }}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  background: 'rgba(2,4,10,0.8)',
                  border: `1px solid ${COLORS.BLUE.pri}55`,
                  borderRadius: 2,
                  padding: '2px 6px',
                  color: COLORS.TEXT.primary,
                  outline: 'none',
                  width: 160,
                  fontFamily: FONT.ui,
                }}
              />
            ) : (
              <span
                onClick={() => startRename(ship)}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: COLORS.TEXT.primary,
                  cursor: 'pointer',
                  fontFamily: FONT.ui,
                  letterSpacing: 0.3,
                }}
                title="Click to rename"
              >{ship.name}</span>
            )}
            {isActive && <Pill color={COLORS.BLUE.light} filled>ACTIVE</Pill>}
            {!isActive && !isStored && (
              <Pill color={COLORS.GREEN.light}>WING {fleetPos}</Pill>
            )}
            {isStored && (
              <Pill color={COLORS.GOLD.light}>
                STORED · {ship.storage_body_name || 'unknown'}
              </Pill>
            )}
          </div>

          {/* Hull type subtitle */}
          <div style={{
            fontSize: 9,
            color: COLORS.TEXT.dim,
            fontFamily: FONT.mono,
            marginBottom: 6,
            letterSpacing: 0.5,
          }}>
            {ship.hull_name || 'Unknown'} · {ship.hull_class || ''}
            {isStored && ship.storage_body_name && (
              <span style={{ color: COLORS.GOLD.dim }}> · housed at {ship.storage_body_name}</span>
            )}
          </div>

          {/* Stats row */}
          <div style={{
            display: 'flex',
            gap: 12,
            fontSize: 9,
            fontFamily: FONT.mono,
            marginBottom: 6,
          }}>
            <span style={{ color: COLORS.TEXT.muted }}>HULL <span style={{ color: COLORS.TEXT.primary, fontWeight: 700 }}>{ship.base_hull}</span></span>
            <span style={{ color: COLORS.TEXT.muted }}>SPD <span style={{ color: COLORS.TEXT.primary, fontWeight: 700 }}>{ship.base_speed}</span></span>
            <span style={{ color: COLORS.TEXT.muted }}>MNV <span style={{ color: COLORS.TEXT.primary, fontWeight: 700 }}>{ship.base_maneuver}</span></span>
            <span style={{ color: COLORS.TEXT.muted }}>CGO <span style={{ color: COLORS.GOLD.light, fontWeight: 700 }}>{ship.total_cargo || ship.computed_cargo || 0}</span></span>
          </div>

          {/* Slot indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {(ship.hull_slots || []).map(slot => {
              const filled = !!fittedMods[slot.id];
              const color = SLOT_COLORS[slot.type] || '#888';
              return (
                <div
                  key={slot.id}
                  title={`${slot.type}${filled ? ' (fitted)' : ' (empty)'}`}
                  style={{
                    width: 11,
                    height: 11,
                    background: filled ? `${color}44` : 'transparent',
                    border: `1px solid ${filled ? `${color}cc` : `${color}33`}`,
                    boxShadow: filled ? `0 0 4px ${color}55` : 'none',
                  }}
                />
              );
            })}
            <span style={{
              fontSize: 8,
              color: COLORS.TEXT.dim,
              marginLeft: 4,
              fontFamily: FONT.mono,
              letterSpacing: 0.3,
            }}>{fittedCount}/{totalSlots}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          {isStored ? (
            <PanelButton
              size="sm"
              accent={storedHere && canActivateForCap ? COLORS.GREEN.light : COLORS.TEXT.muted}
              disabled={!storedHere || !canActivateForCap}
              onClick={() => storedHere && canActivateForCap && onActivate(ship.id)}
              title={
                !storedHere
                  ? `Dock at ${ship.storage_body_name} to activate`
                  : !canActivateForCap
                  ? 'Fleet full — store another ship first'
                  : 'Bring this ship into the active fleet'
              }
            >
              Activate
            </PanelButton>
          ) : (
            <>
              {!isActive && (
                <PanelButton size="sm" accent={COLORS.BLUE.light} onClick={() => onSetActive(ship.id)}>
                  Set Active
                </PanelButton>
              )}
              <PanelButton size="sm" accent="#ff6622" onClick={onOpenFitting}>
                Fitting
              </PanelButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// FLEET WINDOW
// ============================================
export const FleetWindow = () => {
  const [ships, setShips] = useState([]);
  const [activeShipId, setActiveShipId] = useState(null);
  const [activeFleetCount, setActiveFleetCount] = useState(0);
  const [fleetCap, setFleetCap] = useState(MAX_FLEET_SIZE);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const openWindow = useGameStore(state => state.openWindow);
  const dockedBody = useGameStore(state => state.dockedBody);
  const pushToast = useGameStore(state => state.pushToast);

  useEffect(() => { loadFleet(); }, []);

  const loadFleet = async () => {
    setLoading(true);
    try {
      const data = await fittingAPI.getFleet();
      setShips(data.ships || []);
      setActiveShipId(data.activeShipId);
      setActiveFleetCount(data.activeFleetCount ?? (data.ships || []).filter(s => s.storage_body_id == null).length);
      setFleetCap(data.fleetCap ?? MAX_FLEET_SIZE);
    } catch (err) { console.error('Fleet load error:', err); }
    setLoading(false);
  };

  const flash = (type, text) => {
    if (pushToast) pushToast({ kind: type === 'success' ? 'success' : 'error', text });
    else { setMessage({ type, text }); setTimeout(() => setMessage(null), 3000); }
  };

  const handleSetActive = async (shipId) => {
    try {
      const result = await fittingAPI.setActiveShip(shipId);
      if (result.success) {
        setActiveShipId(shipId);
        flash('success', `${result.ship_name} is now your active ship`);
      }
    } catch (err) { flash('error', err.message || 'Failed to set active ship'); }
  };

  const handleActivate = async (shipId) => {
    try {
      const result = await fittingAPI.activateShip(shipId);
      if (result.success) {
        flash('success', `${result.ship_name} added to active fleet`);
        await loadFleet();
      }
    } catch (err) { flash('error', err.message || 'Failed to activate ship'); }
  };

  const finishRename = async (shipId) => {
    if (shipId === null) { setRenamingId(null); return; }
    if (!renameVal.trim()) { setRenamingId(null); return; }
    try {
      const result = await fittingAPI.renameShip(shipId, renameVal.trim());
      if (result.success) {
        setShips(prev => prev.map(s => s.id === shipId ? { ...s, name: result.name } : s));
        flash('success', `Renamed to "${result.name}"`);
      }
    } catch (err) { flash('error', err.message || 'Failed to rename'); }
    setRenamingId(null);
  };

  const startRename = (ship) => {
    setRenamingId(ship.id);
    setRenameVal(ship.name);
  };

  const totalCargo = ships.reduce((sum, s) => sum + (s.total_cargo || s.computed_cargo || 0), 0);
  const canActivateForCap = activeFleetCount < fleetCap;
  // Storage match by name (works for both Sol aliases + procedural UUIDs --
  // celestial body NAMES are unique within a system, and the player can
  // only be at one body at a time).
  const isStoredHere = (ship) =>
    !!dockedBody?.name && ship.storage_body_name === dockedBody.name;

  // Partition: active first, then stored. Server already orders this way,
  // but compute the split locally for the section break.
  const activeShips = ships.filter(s => s.storage_body_id == null);
  const storedShips = ships.filter(s => s.storage_body_id != null);

  return (
    <ContextPanel windowId="fleet" title="Fleet" icon="🚀" accent={COLORS.BLUE.light} width={420}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {message && <MessageBar type={message.type}>{message.text}</MessageBar>}

        {/* Status section */}
        <SectionHead
          title="Fleet Status"
          accent={COLORS.BLUE.light}
          icon="📊"
          marginTop={0}
          right={`${activeFleetCount}/${fleetCap} active`}
        />
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 6,
          marginBottom: 4,
        }}>
          {[
            { label: 'SHIPS OWNED', value: ships.length, accent: COLORS.BLUE.pri, color: COLORS.TEXT.primary },
            { label: 'ACTIVE', value: `${activeFleetCount}/${fleetCap}`, accent: COLORS.GREEN.pri, color: COLORS.GREEN.light },
            { label: 'CARGO CAP', value: totalCargo, accent: COLORS.GOLD.pri, color: COLORS.GOLD.light },
          ].map((stat, i) => (
            <div key={i} style={{
              background: COLORS.ROW_BG,
              border: `1px solid ${COLORS.EDGE}`,
              borderLeft: `2px solid ${stat.accent}`,
              padding: '6px 8px',
              borderRadius: 3,
            }}>
              <div style={{ fontSize: 8, color: COLORS.TEXT.muted, fontFamily: FONT.mono, letterSpacing: 1 }}>{stat.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: stat.color, fontFamily: FONT.ui }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {activeFleetCount > fleetCap && (
          <div style={{
            background: 'rgba(133,77,14,0.2)',
            border: '1px solid rgba(251,191,36,0.4)',
            borderLeft: `2px solid ${COLORS.GOLD.pri}`,
            borderRadius: 3,
            padding: '6px 10px',
            fontSize: 9,
            color: COLORS.GOLD.light,
            fontFamily: FONT.ui,
            lineHeight: 1.4,
          }}>
            You have {activeFleetCount} active ships, over the {fleetCap}-ship fleet cap.
            Dock at a station and use the Ships tab there to store ships.
          </div>
        )}

        {/* Ship list */}
        <SectionHead
          title="Ships"
          accent={COLORS.BLUE.light}
          icon="🚀"
          right={
            <span
              onClick={() => openWindow('shipBuilder')}
              style={{ cursor: 'pointer', color: '#ff6622' }}
            >FITTING →</span>
          }
        />
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
          {loading ? (
            <div style={{
              fontSize: 11,
              color: COLORS.TEXT.muted,
              padding: '20px 0',
              textAlign: 'center',
              fontFamily: FONT.ui,
            }}>Loading fleet...</div>
          ) : ships.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '24px 0',
              color: COLORS.TEXT.muted,
              fontSize: 11,
              fontFamily: FONT.ui,
            }}>
              No ships — buy a hull at a station vendor
            </div>
          ) : (
            <>
              {activeShips.map((ship, idx) => {
                const isActive = ship.id === activeShipId;
                const fleetPos = isActive ? 0 : activeShips.filter(s => s.id !== activeShipId).indexOf(ship) + 1;
                return (
                  <ShipCard
                    key={ship.id}
                    ship={ship}
                    isActive={isActive}
                    fleetPos={fleetPos}
                    isStored={false}
                    storedHere={false}
                    canActivateForCap={canActivateForCap}
                    onSetActive={handleSetActive}
                    onActivate={handleActivate}
                    onOpenFitting={() => openWindow('shipBuilder')}
                    renamingId={renamingId}
                    renameVal={renameVal}
                    setRenameVal={setRenameVal}
                    startRename={startRename}
                    finishRename={finishRename}
                  />
                );
              })}
              {storedShips.length > 0 && (
                <div style={{
                  marginTop: 12,
                  marginBottom: 6,
                  fontSize: 9,
                  fontFamily: FONT.mono,
                  color: COLORS.GOLD.light,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  padding: '4px 8px',
                  background: `linear-gradient(90deg, ${COLORS.GOLD.pri}18, transparent)`,
                  borderLeft: `2px solid ${COLORS.GOLD.pri}`,
                }}>
                  Stored ({storedShips.length})
                </div>
              )}
              {storedShips.map((ship) => (
                <ShipCard
                  key={ship.id}
                  ship={ship}
                  isActive={false}
                  fleetPos={0}
                  isStored={true}
                  storedHere={isStoredHere(ship)}
                  canActivateForCap={canActivateForCap}
                  onSetActive={handleSetActive}
                  onActivate={handleActivate}
                  onOpenFitting={() => openWindow('shipBuilder')}
                  renamingId={renamingId}
                  renameVal={renameVal}
                  setRenameVal={setRenameVal}
                  startRename={startRename}
                  finishRename={finishRename}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </ContextPanel>
  );
};

export default FleetWindow;
