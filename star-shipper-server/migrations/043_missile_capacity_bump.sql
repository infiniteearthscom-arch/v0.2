-- Migration 043: bump Missile Launcher magazine 6 -> 40
-- ============================================
-- The initial 6-round magazine made the launcher feel like a
-- pop-gun -- the player burned through a load in two engagements
-- and had to dock to reload. 40 rounds is closer to "carries a real
-- combat loadout"; balance can shift again later as missile tiers land.

UPDATE module_types
SET stats = jsonb_set(stats, '{ammo_capacity}', '40'),
    description = 'Slow-firing guided ordnance. Requires 2s target lock + loaded warheads. 40-round magazine; reload at any station vendor.'
WHERE id = 'weapon_missile_basic';
