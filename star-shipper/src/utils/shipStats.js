// shipStats.js -- fleet-aggregated derived stats for client-side reads.
// Shared between SystemView (asteroid scan), PlanetInteractionWindow
// (planet scans), and any future surface that needs a quick read of
// "what does my fleet do?" without duplicating the math.
//
// All helpers take the array of ACTIVE fleet ships (stored ships should
// be filtered out before passing in) and return a single effective
// value. Skill bonuses (from useGameStore().activeBonuses or the
// equivalent ref) get applied last via the second argument.

// ============================================
// SCAN TIME (asteroid + planet, in milliseconds)
// ============================================
// Returns the best (lowest) computed_scan_time across the fleet, with
// the Astrometrics `ast_scanning` skill bonus applied. Falls back to
// the legacy DEFAULT_SCAN_TIME_MS (8000) when:
//   - no ships have computed_scan_time set yet (post-migration-049
//     before a re-fit triggers recalcShipStats), OR
//   - no scanner is fitted anywhere (in which case the caller's
//     "needs scanner module fitted" gate should reject the action
//     before this even returns -- but we keep the fallback so any
//     orphan read still yields a sane number).
//
// Skill bonus shape: `scan_time_pct` from `ast_scanning` (-5/level, so
// L5 sends -25). Formula matches the sensor_range_pct pattern:
//   final = base * (1 + bonusPct/100)
// Negative bonus = shorter time. Clamped to >= 500ms so even ridiculous
// stacks can't make scans instant.

export const DEFAULT_SCAN_TIME_MS = 8000;

export const getFleetScanTimeMs = (ships, bonuses) => {
  let best = null;
  for (const s of (ships || [])) {
    if (s?.computed_scan_time && (best === null || s.computed_scan_time < best)) {
      best = s.computed_scan_time;
    }
  }
  const base = best ?? DEFAULT_SCAN_TIME_MS;
  const bonusPct = bonuses?.scan_time_pct || 0;
  return Math.max(500, Math.round(base * (1 + bonusPct / 100)));
};

// ============================================
// SCANNER MODULE GATE
// ============================================
// Does the active fleet have ANY scanner fitted? Matches the fleet-wide
// module check pattern from CLAUDE.md pitfall #15 -- a scanner on a
// wingman gates the action just like one on the primary.

export const fleetHasScanner = (ships) => {
  for (const s of (ships || [])) {
    const fitted = s?.fitted_modules || {};
    for (const slot of Object.values(fitted)) {
      const id = slot?.module_type_id;
      if (id && id.startsWith('utility_scanner')) return true;
    }
  }
  return false;
};
