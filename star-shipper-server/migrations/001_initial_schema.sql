-- Star Shipper Database Schema
-- Run this to set up the initial database structure

-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS & AUTH
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(32) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(64),
    avatar_url TEXT,
    
    -- Game stats
    credits BIGINT DEFAULT 1000,
    total_playtime_seconds INTEGER DEFAULT 0,
    
    -- Status
    is_online BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_online ON users(is_online) WHERE is_online = TRUE;

-- ============================================
-- PLAYER RESOURCES
-- ============================================
CREATE TABLE player_resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    credits BIGINT DEFAULT 1000,
    metals BIGINT DEFAULT 500,
    crystals BIGINT DEFAULT 100,
    gases BIGINT DEFAULT 200,
    rare_earth BIGINT DEFAULT 0,
    fuel BIGINT DEFAULT 300,
    food BIGINT DEFAULT 100,
    electronics BIGINT DEFAULT 50,
    components BIGINT DEFAULT 20,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- ============================================
-- SHIP DESIGNS (blueprints)
-- ============================================
CREATE TABLE ship_designs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    name VARCHAR(64) NOT NULL,
    hull_cells JSONB NOT NULL,  -- Array of [x,y] coordinates
    rooms JSONB NOT NULL,       -- Array of room objects
    
    -- Computed stats (cached)
    hull_size INTEGER NOT NULL,
    total_power INTEGER NOT NULL,
    total_crew INTEGER NOT NULL,
    total_cargo INTEGER NOT NULL,
    
    is_valid BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE,  -- Can others see/copy this design?
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ship_designs_user ON ship_designs(user_id);
CREATE INDEX idx_ship_designs_public ON ship_designs(is_public) WHERE is_public = TRUE;

-- ============================================
-- SHIPS (actual instances)
-- ============================================
CREATE TABLE ships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    design_id UUID NOT NULL REFERENCES ship_designs(id),
    
    name VARCHAR(64) NOT NULL,
    
    -- Status
    status VARCHAR(32) DEFAULT 'docked',  -- docked, flying, in_combat, destroyed
    health INTEGER DEFAULT 100,
    shield INTEGER DEFAULT 100,
    fuel INTEGER DEFAULT 100,
    
    -- Location
    location_type VARCHAR(32) NOT NULL,  -- hub, system, instance
    location_id UUID,                     -- Reference to hub/system/instance
    position_x FLOAT DEFAULT 0,
    position_y FLOAT DEFAULT 0,
    rotation FLOAT DEFAULT 0,
    velocity_x FLOAT DEFAULT 0,
    velocity_y FLOAT DEFAULT 0,
    
    -- Cargo
    cargo JSONB DEFAULT '{}',
    
    -- Room/system damage state
    damage_state JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ships_user ON ships(user_id);
CREATE INDEX idx_ships_location ON ships(location_type, location_id);

-- ============================================
-- CREW MEMBERS
-- ============================================
CREATE TABLE crew_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ship_id UUID REFERENCES ships(id) ON DELETE SET NULL,
    
    name VARCHAR(64) NOT NULL,
    role VARCHAR(32) NOT NULL,  -- pilot, engineer, gunner, medic, etc.
    
    -- Stats
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    health INTEGER DEFAULT 100,
    morale INTEGER DEFAULT 100,
    
    -- Skills (0-100)
    skill_piloting INTEGER DEFAULT 10,
    skill_engineering INTEGER DEFAULT 10,
    skill_combat INTEGER DEFAULT 10,
    skill_science INTEGER DEFAULT 10,
    
    -- Assignment
    assigned_room_id VARCHAR(64),  -- Room ID within ship
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_crew_user ON crew_members(user_id);
CREATE INDEX idx_crew_ship ON crew_members(ship_id);

-- ============================================
-- GALAXY STRUCTURE
-- ============================================

-- Star Systems (persistent, shared)
CREATE TABLE star_systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(64) NOT NULL,
    
    -- Position in galaxy
    galaxy_x FLOAT NOT NULL,
    galaxy_y FLOAT NOT NULL,
    
    -- Star properties
    star_type VARCHAR(32) NOT NULL,  -- yellow, red_dwarf, blue_giant, etc.
    star_size FLOAT DEFAULT 1.0,
    
    -- System properties
    is_hub BOOLEAN DEFAULT FALSE,    -- Hub systems are always populated
    danger_level INTEGER DEFAULT 1,  -- 1-10
    
    -- Connections to other systems
    connections JSONB DEFAULT '[]',  -- Array of system IDs
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_systems_hub ON star_systems(is_hub) WHERE is_hub = TRUE;
CREATE INDEX idx_systems_position ON star_systems(galaxy_x, galaxy_y);

-- Celestial Bodies (planets, stations, asteroid belts)
CREATE TABLE celestial_bodies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_id UUID NOT NULL REFERENCES star_systems(id) ON DELETE CASCADE,
    
    name VARCHAR(64) NOT NULL,
    body_type VARCHAR(32) NOT NULL,  -- planet, moon, station, asteroid_belt, gas_giant
    
    -- Orbit
    orbit_radius FLOAT NOT NULL,
    orbit_speed FLOAT DEFAULT 1.0,
    orbit_offset FLOAT DEFAULT 0,  -- Starting angle
    
    -- Properties
    size FLOAT DEFAULT 1.0,
    planet_type VARCHAR(32),  -- terran, desert, ice, lava, ocean, barren, rocky
    resources JSONB DEFAULT '{}',
    
    -- For stations
    faction_id UUID,
    services JSONB DEFAULT '[]',  -- trade, repair, refuel, missions
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_bodies_system ON celestial_bodies(system_id);

-- ============================================
-- HUB INSTANCES (social areas)
-- ============================================
CREATE TABLE hub_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_id UUID NOT NULL REFERENCES star_systems(id),
    
    -- Capacity
    current_players INTEGER DEFAULT 0,
    max_players INTEGER DEFAULT 100,
    
    -- State
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_hubs_system ON hub_instances(system_id);
CREATE INDEX idx_hubs_active ON hub_instances(is_active, current_players);

-- ============================================
-- MISSION INSTANCES (instanced content)
-- ============================================
CREATE TABLE mission_instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    mission_type VARCHAR(64) NOT NULL,  -- mining, combat, exploration, trade, story
    difficulty INTEGER DEFAULT 1,
    
    -- Players
    leader_id UUID NOT NULL REFERENCES users(id),
    player_ids JSONB DEFAULT '[]',
    max_players INTEGER DEFAULT 4,
    
    -- State
    status VARCHAR(32) DEFAULT 'forming',  -- forming, in_progress, completed, failed
    state_data JSONB DEFAULT '{}',  -- Mission-specific state
    
    -- Rewards
    rewards JSONB DEFAULT '{}',
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_missions_leader ON mission_instances(leader_id);
CREATE INDEX idx_missions_status ON mission_instances(status);

-- ============================================
-- PLAYER PRESENCE (real-time tracking)
-- ============================================
CREATE TABLE player_presence (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    socket_id VARCHAR(64),
    
    -- Current location
    location_type VARCHAR(32),  -- hub, mission, menu
    location_id UUID,
    
    -- Current ship
    active_ship_id UUID REFERENCES ships(id),
    
    connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_presence_location ON player_presence(location_type, location_id);

-- ============================================
-- CHAT & SOCIAL
-- ============================================
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    channel_type VARCHAR(32) NOT NULL,  -- global, system, hub, mission, whisper
    channel_id UUID,  -- hub_id, mission_id, or target_user_id for whispers
    
    sender_id UUID NOT NULL REFERENCES users(id),
    sender_name VARCHAR(64) NOT NULL,
    
    content TEXT NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_channel ON chat_messages(channel_type, channel_id, created_at DESC);

-- Friends list
CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    status VARCHAR(32) DEFAULT 'pending',  -- pending, accepted, blocked
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, friend_id)
);

CREATE INDEX idx_friends_user ON friendships(user_id, status);

-- ============================================
-- RESEARCH & PROGRESSION
-- ============================================
CREATE TABLE player_research (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    tech_id VARCHAR(64) NOT NULL,  -- Matches tech IDs in game data
    
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, tech_id)
);

CREATE INDEX idx_research_user ON player_research(user_id);

-- Current research in progress
CREATE TABLE research_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    tech_id VARCHAR(64) NOT NULL,
    progress INTEGER DEFAULT 0,  -- 0-100
    
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ship_designs_updated_at
    BEFORE UPDATE ON ship_designs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ships_updated_at
    BEFORE UPDATE ON ships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER player_resources_updated_at
    BEFORE UPDATE ON player_resources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
