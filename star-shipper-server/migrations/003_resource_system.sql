-- Star Shipper Resource System Migration
-- Adds resource types, deposits, player inventory with quality stats

-- ============================================
-- RESOURCE TYPES (static definitions)
-- ============================================
CREATE TABLE resource_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(20) NOT NULL,  -- ore, gas, biological, energy, exotic
    rarity VARCHAR(20) NOT NULL,    -- common, rare, exotic
    base_price INTEGER NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_resource_types_category ON resource_types(category);
CREATE INDEX idx_resource_types_rarity ON resource_types(rarity);

-- ============================================
-- PLANET RESOURCE AFFINITIES
-- ============================================
-- Defines which resources spawn on which planet types
CREATE TABLE planet_resource_affinities (
    id SERIAL PRIMARY KEY,
    planet_type VARCHAR(30) NOT NULL,
    resource_type_id INTEGER NOT NULL REFERENCES resource_types(id) ON DELETE CASCADE,
    spawn_weight INTEGER NOT NULL DEFAULT 100,  -- higher = more common
    is_primary BOOLEAN DEFAULT FALSE,           -- primary resources for this planet type
    
    UNIQUE(planet_type, resource_type_id)
);

CREATE INDEX idx_affinities_planet_type ON planet_resource_affinities(planet_type);

-- ============================================
-- RESOURCE DEPOSITS (spawned on celestial bodies)
-- ============================================
CREATE TABLE resource_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    celestial_body_id UUID NOT NULL REFERENCES celestial_bodies(id) ON DELETE CASCADE,
    resource_type_id INTEGER NOT NULL REFERENCES resource_types(id),
    slot_number INTEGER NOT NULL,
    
    -- Quantity
    quantity_remaining INTEGER NOT NULL,
    quantity_total INTEGER NOT NULL,
    
    -- Quality stats (0-100)
    stat_purity INTEGER NOT NULL CHECK (stat_purity BETWEEN 0 AND 100),
    stat_stability INTEGER NOT NULL CHECK (stat_stability BETWEEN 0 AND 100),
    stat_potency INTEGER NOT NULL CHECK (stat_potency BETWEEN 0 AND 100),
    stat_density INTEGER NOT NULL CHECK (stat_density BETWEEN 0 AND 100),
    
    -- Timestamps
    spawned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    depleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Each body can only have one deposit per slot
    UNIQUE(celestial_body_id, slot_number)
);

CREATE INDEX idx_deposits_body ON resource_deposits(celestial_body_id);
CREATE INDEX idx_deposits_resource ON resource_deposits(resource_type_id);
CREATE INDEX idx_deposits_depleted ON resource_deposits(depleted_at) WHERE depleted_at IS NOT NULL;

-- ============================================
-- PLAYER RESOURCE INVENTORY (with quality stats)
-- ============================================
-- Note: This replaces/supplements the old player_resources table
-- Resources with different stats are stored separately, identical stats stack
CREATE TABLE player_resource_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_type_id INTEGER NOT NULL REFERENCES resource_types(id),
    
    quantity INTEGER NOT NULL DEFAULT 0,
    
    -- Quality stats (0-100)
    stat_purity INTEGER NOT NULL CHECK (stat_purity BETWEEN 0 AND 100),
    stat_stability INTEGER NOT NULL CHECK (stat_stability BETWEEN 0 AND 100),
    stat_potency INTEGER NOT NULL CHECK (stat_potency BETWEEN 0 AND 100),
    stat_density INTEGER NOT NULL CHECK (stat_density BETWEEN 0 AND 100),
    
    acquired_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Stack identical stats together
    UNIQUE(user_id, resource_type_id, stat_purity, stat_stability, stat_potency, stat_density)
);

CREATE INDEX idx_inventory_user ON player_resource_inventory(user_id);
CREATE INDEX idx_inventory_resource ON player_resource_inventory(resource_type_id);

-- ============================================
-- PLAYER SURVEYS (what players have scanned)
-- ============================================
CREATE TABLE player_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    celestial_body_id UUID NOT NULL REFERENCES celestial_bodies(id) ON DELETE CASCADE,
    
    orbital_scanned BOOLEAN DEFAULT FALSE,
    ground_scanned BOOLEAN DEFAULT FALSE,
    
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, celestial_body_id)
);

CREATE INDEX idx_surveys_user ON player_surveys(user_id);
CREATE INDEX idx_surveys_body ON player_surveys(celestial_body_id);

-- ============================================
-- HARVEST SESSIONS (manual harvesting)
-- ============================================
CREATE TABLE harvest_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ship_id UUID NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
    deposit_id UUID NOT NULL REFERENCES resource_deposits(id) ON DELETE CASCADE,
    
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    units_harvested INTEGER DEFAULT 0,
    harvest_rate INTEGER DEFAULT 50,  -- units per hour
    
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_harvest_user ON harvest_sessions(user_id);
CREATE INDEX idx_harvest_deposit ON harvest_sessions(deposit_id);
CREATE INDEX idx_harvest_active ON harvest_sessions(is_active) WHERE is_active = TRUE;

-- ============================================
-- HARVESTERS (deployable automated)
-- ============================================
CREATE TABLE deployed_harvesters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deposit_id UUID NOT NULL REFERENCES resource_deposits(id) ON DELETE CASCADE,
    
    -- Harvester type (affects rate and capacity)
    harvester_type VARCHAR(32) NOT NULL DEFAULT 'basic',  -- basic, advanced, industrial
    
    -- Operation
    fuel_remaining INTEGER NOT NULL DEFAULT 0,  -- hours of fuel
    storage_current INTEGER DEFAULT 0,
    storage_capacity INTEGER NOT NULL DEFAULT 200,
    harvest_rate INTEGER NOT NULL DEFAULT 30,  -- units per hour
    
    -- Timestamps
    deployed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Only one harvester per deposit
    UNIQUE(deposit_id)
);

CREATE INDEX idx_harvesters_user ON deployed_harvesters(user_id);
CREATE INDEX idx_harvesters_deposit ON deployed_harvesters(deposit_id);

-- ============================================
-- ADD DEPOSIT SLOTS TO CELESTIAL BODIES
-- ============================================
ALTER TABLE celestial_bodies 
ADD COLUMN IF NOT EXISTS deposit_slots INTEGER DEFAULT 4;

-- ============================================
-- SEED RESOURCE TYPES (19 resources)
-- ============================================

-- ORES (5)
INSERT INTO resource_types (name, category, rarity, base_price, description, icon) VALUES
('Iron', 'ore', 'common', 10, 'Common building material found on rocky worlds', 'iron'),
('Titanium', 'ore', 'common', 25, 'Lightweight and strong hull material', 'titanium'),
('Copper', 'ore', 'common', 15, 'Essential for electronics and wiring', 'copper'),
('Crystite', 'ore', 'rare', 75, 'Crystalline energy conductor', 'crystite'),
('Uranium', 'ore', 'rare', 120, 'Radioactive fuel source for reactors', 'uranium');

-- GASES (5)
INSERT INTO resource_types (name, category, rarity, base_price, description, icon) VALUES
('Hydrogen', 'gas', 'common', 8, 'Basic fuel component', 'hydrogen'),
('Helium-3', 'gas', 'rare', 90, 'Advanced fusion fuel', 'helium3'),
('Plasma', 'gas', 'rare', 150, 'High-energy ionized gas', 'plasma'),
('Nitrogen', 'gas', 'common', 12, 'Life support and chemical synthesis', 'nitrogen'),
('Xenon', 'gas', 'common', 35, 'Ion thruster propellant', 'xenon');

-- BIOLOGICALS (4)
INSERT INTO resource_types (name, category, rarity, base_price, description, icon) VALUES
('Biomass', 'biological', 'common', 18, 'Organic matter for food and compounds', 'biomass'),
('Spores', 'biological', 'rare', 85, 'Alien fungal samples for medicine', 'spores'),
('Coral', 'biological', 'common', 30, 'Structural and decorative material', 'coral'),
('Amber Sap', 'biological', 'rare', 110, 'Preservative luxury material', 'ambersap');

-- ENERGY (2)
INSERT INTO resource_types (name, category, rarity, base_price, description, icon) VALUES
('Solar Crystals', 'energy', 'rare', 95, 'Natural energy storage crystals', 'solarcrystal'),
('Dark Matter', 'energy', 'exotic', 500, 'Mysterious energy source', 'darkmatter');

-- EXOTIC (3)
INSERT INTO resource_types (name, category, rarity, base_price, description, icon) VALUES
('Void Essence', 'exotic', 'exotic', 750, 'Reality-bending substance from black holes', 'voidessence'),
('Ancient Alloy', 'exotic', 'exotic', 400, 'Precursor technology material', 'ancientalloy'),
('Quantum Dust', 'exotic', 'exotic', 600, 'Unstable quantum particles', 'quantumdust');

-- ============================================
-- SEED PLANET RESOURCE AFFINITIES
-- ============================================

-- Rocky/Barren planets
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'rocky', id, 100, TRUE FROM resource_types WHERE name = 'Iron';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'rocky', id, 80, TRUE FROM resource_types WHERE name = 'Copper';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'rocky', id, 60, FALSE FROM resource_types WHERE name = 'Titanium';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'rocky', id, 15, FALSE FROM resource_types WHERE name = 'Uranium';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'rocky', id, 3, FALSE FROM resource_types WHERE name = 'Ancient Alloy';

INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'barren', id, 100, TRUE FROM resource_types WHERE name = 'Iron';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'barren', id, 90, TRUE FROM resource_types WHERE name = 'Titanium';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'barren', id, 25, FALSE FROM resource_types WHERE name = 'Uranium';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'barren', id, 5, FALSE FROM resource_types WHERE name = 'Ancient Alloy';

-- Gas giants
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'gas_giant', id, 100, TRUE FROM resource_types WHERE name = 'Hydrogen';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'gas_giant', id, 60, TRUE FROM resource_types WHERE name = 'Helium-3';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'gas_giant', id, 50, FALSE FROM resource_types WHERE name = 'Xenon';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'gas_giant', id, 20, FALSE FROM resource_types WHERE name = 'Plasma';

-- Ice planets
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'ice', id, 100, TRUE FROM resource_types WHERE name = 'Nitrogen';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'ice', id, 70, TRUE FROM resource_types WHERE name = 'Crystite';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'ice', id, 30, FALSE FROM resource_types WHERE name = 'Helium-3';

-- Volcanic/Lava planets
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'lava', id, 100, TRUE FROM resource_types WHERE name = 'Iron';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'lava', id, 80, TRUE FROM resource_types WHERE name = 'Copper';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'lava', id, 35, FALSE FROM resource_types WHERE name = 'Plasma';

-- Terrestrial planets
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'terran', id, 100, TRUE FROM resource_types WHERE name = 'Biomass';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'terran', id, 60, FALSE FROM resource_types WHERE name = 'Iron';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'terran', id, 25, FALSE FROM resource_types WHERE name = 'Spores';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'terran', id, 20, FALSE FROM resource_types WHERE name = 'Amber Sap';

-- Ocean planets
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'ocean', id, 100, TRUE FROM resource_types WHERE name = 'Coral';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'ocean', id, 80, TRUE FROM resource_types WHERE name = 'Biomass';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'ocean', id, 30, FALSE FROM resource_types WHERE name = 'Spores';

-- Desert planets
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'desert', id, 100, TRUE FROM resource_types WHERE name = 'Iron';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'desert', id, 70, TRUE FROM resource_types WHERE name = 'Copper';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'desert', id, 40, FALSE FROM resource_types WHERE name = 'Solar Crystals';

-- Asteroids (asteroid_belt type)
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'asteroid_belt', id, 100, TRUE FROM resource_types WHERE name = 'Iron';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'asteroid_belt', id, 90, TRUE FROM resource_types WHERE name = 'Titanium';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'asteroid_belt', id, 50, FALSE FROM resource_types WHERE name = 'Crystite';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'asteroid_belt', id, 10, FALSE FROM resource_types WHERE name = 'Ancient Alloy';

-- Special/Anomaly locations (for exotic)
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'anomaly', id, 100, TRUE FROM resource_types WHERE name = 'Quantum Dust';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'anomaly', id, 80, TRUE FROM resource_types WHERE name = 'Void Essence';
INSERT INTO planet_resource_affinities (planet_type, resource_type_id, spawn_weight, is_primary)
SELECT 'anomaly', id, 60, FALSE FROM resource_types WHERE name = 'Dark Matter';

-- ============================================
-- TRIGGERS
-- ============================================

CREATE TRIGGER player_resource_inventory_updated_at
    BEFORE UPDATE ON player_resource_inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Calculate quality tier from stats
CREATE OR REPLACE FUNCTION get_quality_tier(
    p_purity INTEGER,
    p_stability INTEGER,
    p_potency INTEGER,
    p_density INTEGER
) RETURNS VARCHAR(20) AS $$
DECLARE
    avg_stat NUMERIC;
BEGIN
    avg_stat := (p_purity + p_stability + p_potency + p_density) / 4.0;
    
    IF avg_stat <= 20 THEN
        RETURN 'Impure';
    ELSIF avg_stat <= 40 THEN
        RETURN 'Standard';
    ELSIF avg_stat <= 60 THEN
        RETURN 'Refined';
    ELSIF avg_stat <= 80 THEN
        RETURN 'Superior';
    ELSE
        RETURN 'Pristine';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate quality multiplier for pricing
CREATE OR REPLACE FUNCTION get_quality_multiplier(
    p_purity INTEGER,
    p_stability INTEGER,
    p_potency INTEGER,
    p_density INTEGER
) RETURNS NUMERIC AS $$
DECLARE
    avg_stat NUMERIC;
BEGIN
    avg_stat := (p_purity + p_stability + p_potency + p_density) / 4.0;
    RETURN 0.5 + (avg_stat / 100.0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
