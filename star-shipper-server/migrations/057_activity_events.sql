-- Migration 057: Activity events (Social Multiplayer Step 3).
-- ============================================
-- Append-only log of notable player actions. Drives the HUD activity
-- ticker so the world feels populated even when you're solo -- you see
-- evidence of other pilots crafting / exploring / building in distant
-- systems.
--
-- v1 event types (more added as they become interesting):
--   system_discovered   -- first visit to a procedural system
--                          payload: { system_name }
--   module_crafted      -- crafted a module (filtered server-side to
--                          exclude probes/fuel cells)
--                          payload: { module_name, quality?: number }
--   ship_purchased      -- bought a new hull
--                          payload: { hull_name, hull_id }
--
-- system_id is nullable -- craft/purchase events aren't tied to a
-- specific system in v1. Index covers the "newest N events" query the
-- ticker's REST hydration path uses.
-- ============================================

CREATE TABLE activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_name VARCHAR(64) NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  system_id VARCHAR(64),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- The only access pattern today: "newest N events." If per-user or
-- per-system filters land later (mute list, system-only ticker), add
-- those indexes then.
CREATE INDEX idx_activity_recent ON activity_events(created_at DESC);
