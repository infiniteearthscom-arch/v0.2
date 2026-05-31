-- Migration 058: Market orders (Social Multiplayer Step 6).
-- ============================================
-- EVE-style async order book per station. Players post BUY orders
-- ("I'll pay 50cr each for up to 1000 Iron at Luna") and SELL orders
-- ("Offering 500 Mining Lasers at 800cr each at Mars"). Other players
-- browse + manually fulfill at the same station.
--
-- v1 is manual-fulfill-only (no auto-matching engine). Auto-cross
-- when bids meet asks is a v2 thing -- needs careful design around
-- partial-fill ordering, fee economics, and broadcast spam.
--
-- ESCROW MODEL
-- ------------
-- Sell orders: items are REMOVED from the seller's inventory at post
-- time. The market_orders row IS the escrow -- quantity_remaining is
-- the canonical count + stat_* columns snapshot quality at post time
-- (so the order shows accurate info if the seller's other stacks change).
--
-- Buy orders: credits are deducted from the buyer at post time
-- (price_per_unit * initial_quantity). The order row holds the escrow.
-- Cancel returns the remaining escrow (price * quantity_remaining).
--
-- The stat_* snapshot is for SELL orders only -- a buy order doesn't
-- care about specific quality (v1 accepts any quality matching the
-- resource_type_id / item_id). Quality floors are a future feature.
-- ============================================

CREATE TABLE market_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_body_id UUID NOT NULL REFERENCES celestial_bodies(id) ON DELETE CASCADE,

  side VARCHAR(8) NOT NULL CHECK (side IN ('buy', 'sell')),

  -- Item identification. For resource orders, resource_type_id is set
  -- and item_id is null. For item orders (modules, consumables), it's
  -- the reverse. Exactly one must be set; enforced by the CHECK below.
  item_type VARCHAR(16) NOT NULL CHECK (item_type IN ('resource', 'item')),
  resource_type_id VARCHAR(64),
  item_id VARCHAR(64),
  CHECK (
    (item_type = 'resource' AND resource_type_id IS NOT NULL AND item_id IS NULL)
    OR (item_type = 'item' AND item_id IS NOT NULL AND resource_type_id IS NULL)
  ),

  -- Stat / item_data snapshot. SELL orders capture the source stack's
  -- quality at post time so buyers see the actual goods. BUY orders
  -- leave these NULL -- the seller's quality on fulfill is what
  -- transfers, and buy-side quality floors aren't supported in v1.
  stat_purity    SMALLINT,
  stat_stability SMALLINT,
  stat_potency   SMALLINT,
  stat_density   SMALLINT,
  stat_weight    SMALLINT,
  item_data      JSONB,

  price_per_unit       BIGINT  NOT NULL CHECK (price_per_unit > 0),
  quantity_remaining   INTEGER NOT NULL CHECK (quantity_remaining >= 0),
  quantity_initial     INTEGER NOT NULL CHECK (quantity_initial > 0),

  status     VARCHAR(16) NOT NULL DEFAULT 'open'
             CHECK (status IN ('open', 'filled', 'cancelled', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

-- Browse the open order book at a station for a specific item.
-- Partial index keeps it tight -- most orders are 'open' at any moment
-- but the historical 'filled'/'cancelled' rows linger for a while.
CREATE INDEX idx_market_open_by_station
  ON market_orders(station_body_id, item_type, side, created_at DESC)
  WHERE status = 'open';

-- "My orders" listing for the per-player market panel.
CREATE INDEX idx_market_user ON market_orders(user_id, status, created_at DESC);
