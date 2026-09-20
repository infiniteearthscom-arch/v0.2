-- Migration 074: persisted fleet damage + station repair (2026-09-19)
-- "Healing hulls": until now hull/armor damage lived only in client
-- memory and snapped back to full on every system change (a free heal),
-- so there was nothing to repair. The pooled fleet hull/armor FRACTION
-- now persists per user (the combat model is one pooled fleet entity,
-- so a per-ship split would be invented data). Written by the client
-- (combat is client-local) via POST /fitting/fleet-status; read back on
-- login via GET /fitting/fleet; restored to 1.0 by POST /fitting/repair
-- at any station/city for credits, and by /reset-account.

ALTER TABLE users ADD COLUMN IF NOT EXISTS fleet_hull_pct  NUMERIC(6,4) NOT NULL DEFAULT 1.0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fleet_armor_pct NUMERIC(6,4) NOT NULL DEFAULT 1.0;
