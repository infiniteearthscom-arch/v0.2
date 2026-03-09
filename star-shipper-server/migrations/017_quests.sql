-- Migration 017: Quest System + Starter Scout Hull + Starter Kit
-- Adds quest infrastructure and seeds the onboarding tutorial quest chain

-- ============================================
-- STARTER SCOUT HULL
-- A free copy of the Scout, only available to new captains.
-- Pre-fitted with engine and reactor server-side on purchase.
-- ============================================

INSERT INTO hull_types (id, name, class, description, price, base_hull, base_speed, base_maneuver, base_sensors, grid_w, grid_h, slots)
SELECT
  'starter_scout',
  'Starter Scout',
  'Light',
  'Your first ship, provided to all new captains. Pre-fitted with a basic engine and reactor. Upgrade when you can.',
  0,
  base_hull, base_speed, base_maneuver, base_sensors, grid_w, grid_h, slots
FROM hull_types
WHERE id = 'scout'
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STARTER KIT ITEM
-- Purchasable at any station. Gives one of each basic Scout module.
-- ============================================

INSERT INTO item_definitions (id, name, description, category, icon, max_stack, item_data_defaults)
VALUES (
  'starter_kit',
  'Starter Kit',
  'A basic loadout for a Scout-class ship. Contains: Basic Thruster, Fusion Core, Cargo Pod, Pulse Laser, Sensor Suite, Nav Computer.',
  'supply',
  '🎒',
  1,
  '{}'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- QUEST DEFINITIONS
-- ============================================

CREATE TABLE IF NOT EXISTS quest_definitions (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(32) DEFAULT 'tutorial',   -- 'tutorial', 'main', 'side', 'faction'
  completion_condition VARCHAR(32) DEFAULT 'flag',  -- 'flag', 'counter', 'possession'
  completion_target INTEGER DEFAULT 1,        -- for counter quests: how many needed
  rewards JSONB DEFAULT '{}',                 -- { credits, items: [{item_id, quantity}] }
  triggers_quests JSONB DEFAULT '[]',         -- quest IDs to activate on completion
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PLAYER QUEST PROGRESS
-- ============================================

CREATE TABLE IF NOT EXISTS player_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id VARCHAR(64) NOT NULL REFERENCES quest_definitions(id),
  status VARCHAR(20) DEFAULT 'active',        -- 'active', 'completed'
  progress JSONB DEFAULT '{}',                -- for future counter quests
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, quest_id)
);

CREATE INDEX IF NOT EXISTS idx_player_quests_user ON player_quests(user_id);
CREATE INDEX IF NOT EXISTS idx_player_quests_status ON player_quests(user_id, status);

-- ============================================
-- SEED: ONBOARDING QUEST CHAIN
-- ============================================

INSERT INTO quest_definitions (id, title, description, category, completion_condition, rewards, triggers_quests, sort_order)
VALUES
  (
    'tutorial_buy_starter_scout',
    'First Steps',
    'Every captain needs a ship. Head to the Ship Fitting screen (🔧) and purchase your free Starter Scout from the Hulls tab.',
    'tutorial', 'flag',
    '{"credits": 200}',
    '["tutorial_fly_to_luna"]',
    1
  ),
  (
    'tutorial_fly_to_luna',
    'Into the Black',
    'Fly to Luna Station and dock. Open the Navigation window (🧭) to set your autopilot, then press Enter when you arrive.',
    'tutorial', 'flag',
    '{"credits": 200, "items": [{"item_id": "scanner_probe", "quantity": 3}]}',
    '["tutorial_buy_starter_kit"]',
    2
  ),
  (
    'tutorial_buy_starter_kit',
    'Gear Up',
    'Purchase the Starter Kit from the Luna Station vendor (🏪 tab) for 500 cr. It contains a full basic loadout for your Scout.',
    'tutorial', 'flag',
    '{"credits": 200}',
    '["tutorial_fit_modules"]',
    3
  ),
  (
    'tutorial_fit_modules',
    'Ready for Launch',
    'Open Ship Fitting (🔧), select your Scout, and drag modules from your cargo into every available slot.',
    'tutorial', 'flag',
    '{"credits": 500}',
    '[]',
    4
  )
ON CONFLICT (id) DO NOTHING;
