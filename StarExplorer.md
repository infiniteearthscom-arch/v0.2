# Star Shipper - Game Design & Development Roadmap

**Version:** 2.1  
**Date:** January 2026  
**Document Type:** Game Design Document & Development Plan

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Core Game Vision](#core-game-vision)
3. [Technical Stack & Architecture](#technical-stack--architecture)
4. [Current State Analysis](#current-state-analysis)
5. [Feature Roadmap Overview](#feature-roadmap-overview)
6. [Phase 0.0: Tech Setup & Authentication](#phase-00-tech-setup--authentication)
7. [Phase 0.1: Galaxy Generation & Navigation](#phase-01-galaxy-generation--navigation)
8. [Phase 0.2: Solar System View & UI Framework](#phase-02-solar-system-view--ui-framework)
9. [Phase 1: Fleet Management System](#phase-1-fleet-management-system)
10. [Phase 2: Ship Loadout & Customization](#phase-2-ship-loadout--customization)
11. [Phase 3: Crafting & Upgrade System](#phase-3-crafting--upgrade-system)
12. [Phase 4: Economy & Trading System](#phase-4-economy--trading-system)
13. [Phase 5: Combat System](#phase-5-combat-system)
14. [Phase 6: Quest & Story System](#phase-6-quest--story-system)
15. [Phase 7: Multiplayer & PvP](#phase-7-multiplayer--pvp)
16. [Technical Architecture Deep Dive](#technical-architecture-deep-dive)
17. [Data Structures & Game State](#data-structures--game-state)
18. [UI/UX Design Philosophy](#uiux-design-philosophy)
19. [Development Timeline](#development-timeline)

---

## Executive Summary

**Star Shipper** is a browser-based space exploration and trading game combining pixel-art aesthetics with deep economic and combat systems. Players command a fleet of customizable ships, exploring a procedurally generated galaxy of 2000+ star systems while engaging in mining, trading, crafting, combat, and story-driven quests.

### Core Pillars
- **Exploration:** Vast procedurally generated galaxy with diverse star systems
- **Economics:** Complex trading and resource management gameplay with NPC traders
- **Customization:** Deep ship building and loadout systems
- **Combat:** Strategic turn-based fleet encounters with tactical depth
- **Progression:** Story quests and upgradeable fleet capabilities
- **Multiplayer:** Instanced cooperative trading and competitive PvP with friends

---

## Core Game Vision

### Genre & Style
- **Type:** Space exploration, trading, and combat simulator
- **Platform:** Browser-based (web application accessible via desktop/mobile browsers)
- **Art Style:** Cyberpunk pixel art with neon aesthetics (similar to FTL or Dave the Diver)
- **Perspective:** Top-down 2D
- **Gameplay Pace:** Turn-based strategic gameplay with real-time navigation

### Target Audience
- Fans of space trading games (Elite, EVE Online, FTL)
- Resource management enthusiasts
- Players who enjoy gradual progression and optimization
- Sci-fi and cyberpunk aesthetic lovers
- Small groups of friends looking for cooperative multiplayer experiences

### Core Gameplay Loop
1. **Explore** star systems and discover resources
2. **Mine** valuable materials from planets
3. **Trade** resources across systems for profit (with NPC and player traders)
4. **Craft** ship upgrades and new vessels
5. **Upgrade** fleet capabilities
6. **Combat** pirates and rival factions (turn-based strategic)
7. **Progress** through story quests
8. **Repeat** with enhanced capabilities

---

## Technical Stack & Architecture

### Recommended Technology Stack

#### **Frontend**
- **React** - Component-based UI framework for complex state management
- **PixiJS** - 2D WebGL rendering engine for galaxy map, solar systems, and combat visuals
- **Tailwind CSS** - Utility-first CSS framework for rapid UI development
- **Zustand** - Lightweight state management (alternative: Redux for larger scale)

#### **Backend**
- **Node.js + Express** - JavaScript consistency across full stack
- **Socket.io** - Real-time WebSocket communication for multiplayer features
- **PostgreSQL** - Relational database for user accounts, game instances, and persistent state
- **Redis** (Phase 7) - Session management and caching for performance optimization

#### **Authentication & Storage**
- **JWT (JSON Web Tokens)** - Stateless authentication mechanism
- **bcrypt** - Secure password hashing
- **Alternative: Supabase** - All-in-one solution providing auth + PostgreSQL + real-time subscriptions

#### **Hosting & Deployment**
- **Frontend:** Vercel or Netlify (generous free tiers)
- **Backend:** Railway, Render, or Fly.io (cost-effective hosting)
- **Database:** Supabase (managed PostgreSQL with free tier) or Railway

### Why This Stack?

1. **JavaScript Everywhere** - Single language across frontend and backend reduces context switching
2. **Multiplayer-Ready** - Socket.io enables real-time features when needed in Phase 7
3. **Cloud-Native** - PostgreSQL ensures save data integrity and prevents client-side hacking
4. **Turn-Based Friendly** - HTTP requests work perfectly; WebSockets available for real-time needs
5. **Free to Start** - Can develop and host initial versions without infrastructure costs
6. **Scalable** - Architecture supports growth from solo development to multiplayer instances

### Game Instance Architecture

The game uses an **instance-based multiplayer model** where:
- Each game instance is a separate universe with its own procedurally generated galaxy
- Players create or join instances (default max: 6 players per instance)
- Galaxy state persists across sessions using seed-based generation + delta storage
- Only modified systems (mined resources, market changes) are stored in database
- Server-authoritative design prevents cheating and ensures fair multiplayer

---

## Current State Analysis

### What's Built (Foundation)
Nothing - starting from scratch

### What's Needed (Critical Path)
✅ Technology stack selection (COMPLETED - see above)  
⚠️ Project setup and scaffolding  
⚠️ User authentication system  
⚠️ Galaxy generation algorithm  
⚠️ Solar system view and navigation  
⚠️ Basic UI framework  
⚠️ All game systems (fleet, trading, combat, etc.)

### Development Approach
- **Solo development** with hobby project timeline (quality over speed)
- **Single-player first** with multiplayer architecture built in from the start
- **Iterative development** - each phase builds on previous foundations
- **Generated assets initially** - AI-generated pixel art with plan for manual refinement later

---

## Feature Roadmap Overview

### Development Phases

| Phase | Feature | Complexity | Est. Time | Dependencies |
|-------|---------|------------|-----------|--------------|
| 0.0 | Tech Setup & Auth | Low | 3-5 days | None |
| 0.1 | Galaxy Generation & Navigation | Medium | 1-2 weeks | Phase 0.0 |
| 0.2 | Solar System View & UI | Medium | 1-2 weeks | Phase 0.1 |
| 1 | Fleet Management | Medium | 2 weeks | Phase 0.2 |
| 2 | Ship Loadouts | Medium | 2-3 weeks | Phase 1 |
| 3 | Crafting System | High | 3-4 weeks | Phase 1, 2 |
| 4 | Economy System | High | 4-5 weeks | Phase 1, 2, 3 |
| 5 | Combat System | Very High | 4-5 weeks | Phase 1, 2 |
| 6 | Quest System | High | 3-4 weeks | All previous |
| 7 | Multiplayer | Very High | 4-6 weeks | All previous |

**Total Estimated Timeline:** 6-8 months at comfortable hobby pace

---

## Phase 0.0: Tech Setup & Authentication

### Overview
Establish development environment, project structure, and user authentication system. This foundation enables all future features and ensures cloud-based save persistence.

### Estimated Time
3-5 days

### Core Features

#### 0.0.1 Project Scaffolding
**Description:** Set up development environment and project structure

**Tasks:**
1. Initialize React application (Create React App or Vite)
2. Set up Express server with basic routing
3. Configure development environment (ESLint, Prettier, etc.)
4. Set up Git repository and version control
5. Install core dependencies (React, PixiJS, Tailwind, Socket.io, etc.)

**Project Structure:**
```
star-shipper/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── systems/        # PixiJS rendering systems
│   │   ├── stores/         # Zustand state stores
│   │   ├── hooks/          # Custom React hooks
│   │   ├── utils/          # Utility functions
│   │   └── App.jsx
│   ├── public/
│   └── package.json
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── routes/         # Express routes
│   │   ├── controllers/    # Business logic
│   │   ├── models/         # Database models
│   │   ├── middleware/     # Auth, validation, etc.
│   │   ├── services/       # Game logic services
│   │   └── server.js
│   └── package.json
└── README.md
```

#### 0.0.2 Database Setup
**Description:** Configure PostgreSQL database and create initial schema

**Database Schema (Initial):**
```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Game instances table
CREATE TABLE game_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    seed BIGINT NOT NULL,  -- For procedural generation
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    max_players INTEGER DEFAULT 6,
    created_by UUID REFERENCES users(id)
);

-- Player saves table
CREATE TABLE player_saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    instance_id UUID REFERENCES game_instances(id),
    player_state JSONB NOT NULL,  -- Fleet, inventory, position, etc.
    last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, instance_id)
);

-- Solar systems table (stores only modified systems)
CREATE TABLE solar_systems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES game_instances(id),
    system_index INTEGER NOT NULL,  -- Index in procedural generation
    system_data JSONB NOT NULL,  -- Planets, resources, market state
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(instance_id, system_index)
);

-- Indexes for performance
CREATE INDEX idx_player_saves_user ON player_saves(user_id);
CREATE INDEX idx_player_saves_instance ON player_saves(instance_id);
CREATE INDEX idx_systems_instance ON solar_systems(instance_id);
```

#### 0.0.3 Authentication System
**Description:** Implement secure user registration and login

**API Endpoints:**
```javascript
POST /api/auth/register
// Body: { username, email, password }
// Returns: { token, user: { id, username, email } }

POST /api/auth/login
// Body: { email, password }
// Returns: { token, user: { id, username, email } }

GET /api/auth/verify
// Headers: { Authorization: "Bearer <token>" }
// Returns: { valid: boolean, user: { id, username, email } }

POST /api/auth/logout
// Invalidate token (if using refresh tokens)
```

**Implementation Example:**
```javascript
// server/src/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        
        // Create user
        const user = await User.create({
            username,
            email,
            password_hash: passwordHash
        });
        
        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            token,
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            token,
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
```

**Frontend Integration:**
```javascript
// client/src/stores/authStore.js
import { create } from 'zustand';

const useAuthStore = create((set) => ({
    user: null,
    token: localStorage.getItem('token'),
    isAuthenticated: false,
    
    login: async (email, password) => {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            set({ user: data.user, token: data.token, isAuthenticated: true });
        }
        return data;
    },
    
    register: async (username, email, password) => {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('token', data.token);
            set({ user: data.user, token: data.token, isAuthenticated: true });
        }
        return data;
    },
    
    logout: () => {
        localStorage.removeItem('token');
        set({ user: null, token: null, isAuthenticated: false });
    }
}));
```

#### 0.0.4 Basic UI Shell
**Description:** Create minimal landing page with login/register forms

**Components:**
- Landing page
- Login form
- Registration form
- Protected route wrapper

### Testing Checklist
- [ ] User can register new account
- [ ] User can login with credentials
- [ ] JWT token persists across page refreshes
- [ ] Invalid credentials are rejected
- [ ] Protected routes redirect to login
- [ ] Database connections work reliably

---

## Phase 0.1: Galaxy Generation & Navigation

### Overview
Implement procedural galaxy generation and basic navigation system. This establishes the core exploration mechanic and provides the foundation for all location-based features.

### Estimated Time
1-2 weeks

### Design Philosophy
- **Click-to-travel** navigation with instant travel (turn-based, not real-time movement)
- **Fuel-based limitations** restrict travel distance (creates strategic choices)
- **Local cluster view** shows nearby systems (50-100 visible at a time)
- **Minimap overview** displays player position in broader galaxy
- **Persistent galaxy state** using seed-based generation + delta storage

### Core Features

#### 0.1.1 Procedural Galaxy Generation
**Description:** Generate 2000+ star systems with consistent, reproducible results using a seed value

**Implementation Strategy:**
```javascript
// server/src/services/galaxyGenerator.js
const seedrandom = require('seedrandom');

class GalaxyGenerator {
    constructor(seed) {
        this.rng = seedrandom(seed);
        this.seed = seed;
    }
    
    generateGalaxy() {
        const systems = [];
        const GALAXY_WIDTH = 10000;  // Virtual units
        const GALAXY_HEIGHT = 10000;
        const NUM_SYSTEMS = 2000;
        
        for (let i = 0; i < NUM_SYSTEMS; i++) {
            systems.push(this.generateSystem(i));
        }
        
        return systems;
    }
    
    generateSystem(index) {
        // Ensure reproducibility - same index always generates same system
        const systemRng = seedrandom(`${this.seed}-${index}`);
        
        return {
            id: `system_${index}`,
            index: index,
            name: this.generateStarName(systemRng),
            position: {
                x: systemRng() * GALAXY_WIDTH,
                y: systemRng() * GALAXY_HEIGHT
            },
            type: this.pickStarType(systemRng),
            planets: this.generatePlanets(systemRng),
            factionPresence: this.assignFaction(systemRng),
            discovered: false  // Will be updated in player save
        };
    }
    
    generateStarName(rng) {
        const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
        const suffixes = ['Centauri', 'Draconis', 'Cygni', 'Lyrae', 'Orionis'];
        const numbers = Math.floor(rng() * 9999);
        
        if (rng() > 0.5) {
            return `${prefixes[Math.floor(rng() * prefixes.length)]}-${numbers}`;
        } else {
            return `${prefixes[Math.floor(rng() * prefixes.length)]} ${suffixes[Math.floor(rng() * suffixes.length)]}`;
        }
    }
    
    pickStarType(rng) {
        const types = [
            { type: 'MAIN_SEQUENCE', weight: 0.70, color: 0xFFFF88 },  // Yellow
            { type: 'RED_GIANT', weight: 0.15, color: 0xFF4444 },      // Red
            { type: 'WHITE_DWARF', weight: 0.10, color: 0xEEEEFF },    // White
            { type: 'BLUE_GIANT', weight: 0.04, color: 0x4444FF },     // Blue
            { type: 'BINARY', weight: 0.01, color: 0xFF88FF }          // Purple
        ];
        
        const roll = rng();
        let cumulative = 0;
        
        for (const starType of types) {
            cumulative += starType.weight;
            if (roll <= cumulative) {
                return starType;
            }
        }
        
        return types[0]; // Fallback
    }
    
    generatePlanets(rng) {
        const numPlanets = Math.floor(rng() * 7) + 1; // 1-8 planets
        const planets = [];
        
        for (let i = 0; i < numPlanets; i++) {
            planets.push({
                id: `planet_${i}`,
                name: this.generatePlanetName(rng),
                type: this.pickPlanetType(rng),
                resources: this.generateResources(rng),
                orbitDistance: 100 + (i * 80), // Pixels from star in solar view
                size: 10 + Math.floor(rng() * 20) // Radius in pixels
            });
        }
        
        return planets;
    }
    
    generatePlanetName(rng) {
        const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
        const names = ['Prime', 'Secundus', 'Tertius', 'Quartus'];
        
        return rng() > 0.6 
            ? romans[Math.floor(rng() * romans.length)]
            : names[Math.floor(rng() * names.length)];
    }
    
    pickPlanetType(rng) {
        const types = ['TERRESTRIAL', 'GAS_GIANT', 'ICE', 'LAVA', 'BARREN'];
        return types[Math.floor(rng() * types.length)];
    }
    
    generateResources(rng) {
        const allResources = [
            'IRON', 'COPPER', 'TITANIUM', 'PLATINUM', 
            'URANIUM', 'CRYSTALS', 'GASES', 'WATER'
        ];
        
        const numResources = Math.floor(rng() * 3) + 1; // 1-3 resource types
        const resources = {};
        
        for (let i = 0; i < numResources; i++) {
            const resource = allResources[Math.floor(rng() * allResources.length)];
            resources[resource] = {
                abundance: Math.floor(rng() * 100), // 0-100% abundance
                remaining: 10000 // Units available (decreases with mining)
            };
        }
        
        return resources;
    }
    
    assignFaction(rng) {
        const factions = [
            'INDEPENDENT',
            'FEDERATION',
            'EMPIRE',
            'PIRATES',
            'TRADERS_GUILD'
        ];
        
        const roll = rng();
        if (roll < 0.4) return null; // 40% uncontrolled space
        
        return factions[Math.floor(rng() * factions.length)];
    }
}

module.exports = GalaxyGenerator;
```

**API Endpoint:**
```javascript
// GET /api/galaxy/:instanceId
// Returns: Array of star systems for the instance
// Only generates once per instance, then caches

exports.getGalaxy = async (req, res) => {
    const { instanceId } = req.params;
    
    // Get instance to retrieve seed
    const instance = await GameInstance.findById(instanceId);
    if (!instance) {
        return res.status(404).json({ error: 'Instance not found' });
    }
    
    // Generate galaxy (this is fast, ~10ms for 2000 systems)
    const generator = new GalaxyGenerator(instance.seed);
    const systems = generator.generateGalaxy();
    
    // Merge with any saved system modifications
    const savedSystems = await SolarSystem.find({ instance_id: instanceId });
    const systemMap = new Map(savedSystems.map(s => [s.system_index, s.system_data]));
    
    const mergedSystems = systems.map(system => {
        const saved = systemMap.get(system.index);
        return saved ? { ...system, ...saved } : system;
    });
    
    res.json({ systems: mergedSystems });
};
```

#### 0.1.2 Galaxy Map Visualization
**Description:** Render interactive galaxy map using PixiJS

**Technical Implementation:**
```javascript
// client/src/systems/GalaxyMap.js
import * as PIXI from 'pixi.js';

class GalaxyMap {
    constructor(container, systems) {
        this.app = new PIXI.Application({
            width: window.innerWidth - 400, // Leave room for UI panels
            height: window.innerHeight,
            backgroundColor: 0x0a0a0f,
            antialias: true
        });
        
        container.appendChild(this.app.view);
        
        this.systems = systems;
        this.camera = { x: 0, y: 0, zoom: 1.0 };
        this.selectedSystem = null;
        
        this.initializeStars();
        this.initializeCamera();
        this.initializeMinimap();
    }
    
    initializeStars() {
        this.starContainer = new PIXI.Container();
        this.app.stage.addChild(this.starContainer);
        
        // Only render visible systems for performance
        this.visibleSystems = [];
        
        this.systems.forEach(system => {
            const star = this.createStar(system);
            this.starContainer.addChild(star);
            
            // Make interactive
            star.interactive = true;
            star.buttonMode = true;
            star.on('click', () => this.selectSystem(system));
        });
    }
    
    createStar(system) {
        const graphics = new PIXI.Graphics();
        
        // Draw star
        graphics.beginFill(system.type.color);
        graphics.drawCircle(system.position.x, system.position.y, 3);
        graphics.endFill();
        
        // Add glow effect for discovered systems
        if (system.discovered) {
            graphics.lineStyle(1, system.type.color, 0.3);
            graphics.drawCircle(system.position.x, system.position.y, 8);
        }
        
        return graphics;
    }
    
    initializeCamera() {
        // Pan camera with mouse drag
        let dragging = false;
        let dragStart = { x: 0, y: 0 };
        
        this.app.view.addEventListener('mousedown', (e) => {
            dragging = true;
            dragStart = { x: e.clientX, y: e.clientY };
        });
        
        this.app.view.addEventListener('mousemove', (e) => {
            if (dragging) {
                this.camera.x += (e.clientX - dragStart.x) / this.camera.zoom;
                this.camera.y += (e.clientY - dragStart.y) / this.camera.zoom;
                dragStart = { x: e.clientX, y: e.clientY };
                this.updateCamera();
            }
        });
        
        this.app.view.addEventListener('mouseup', () => {
            dragging = false;
        });
        
        // Zoom with mouse wheel (limited range)
        this.app.view.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = this.camera.zoom * zoomDelta;
            
            // Limit zoom range (0.5x to 2.0x)
            this.camera.zoom = Math.max(0.5, Math.min(2.0, newZoom));
            this.updateCamera();
        });
    }
    
    updateCamera() {
        this.starContainer.position.set(this.camera.x, this.camera.y);
        this.starContainer.scale.set(this.camera.zoom);
        
        // Update visible systems for performance
        this.cullSystems();
    }
    
    cullSystems() {
        // Only show systems within viewport
        const viewport = {
            x: -this.camera.x / this.camera.zoom,
            y: -this.camera.y / this.camera.zoom,
            width: this.app.view.width / this.camera.zoom,
            height: this.app.view.height / this.camera.zoom
        };
        
        // TODO: Implement spatial culling for better performance
    }
    
    initializeMinimap() {
        // Small overview in corner showing entire galaxy
        const minimap = new PIXI.Graphics();
        minimap.beginFill(0x1a1a1f, 0.7);
        minimap.drawRect(this.app.view.width - 210, 10, 200, 200);
        minimap.endFill();
        
        // Draw all systems as tiny dots
        this.systems.forEach(system => {
            const x = (system.position.x / 10000) * 200;
            const y = (system.position.y / 10000) * 200;
            
            minimap.beginFill(0x444444);
            minimap.drawCircle(this.app.view.width - 210 + x, 10 + y, 1);
            minimap.endFill();
        });
        
        this.app.stage.addChild(minimap);
    }
    
    selectSystem(system) {
        this.selectedSystem = system;
        // Trigger UI update (handled by React component)
        this.onSystemSelected?.(system);
    }
}

export default GalaxyMap;
```

#### 0.1.3 Travel System
**Description:** Click-to-travel navigation with fuel validation

**Fuel Calculation:**
```javascript
// Fuel cost based on Euclidean distance
function calculateFuelCost(fromSystem, toSystem) {
    const dx = toSystem.position.x - fromSystem.position.x;
    const dy = toSystem.position.y - fromSystem.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Base fuel cost: 1 fuel per 100 distance units
    const baseCost = distance / 100;
    
    // Apply fleet efficiency modifiers (from Phase 1)
    // For now, just return base cost
    return Math.ceil(baseCost);
}
```

**API Endpoint:**
```javascript
// POST /api/travel
// Body: { instanceId, destinationSystemIndex }

exports.travel = async (req, res) => {
    const { instanceId, destinationSystemIndex } = req.body;
    const userId = req.user.id; // From JWT middleware
    
    // Load player save
    const save = await PlayerSave.findOne({ user_id: userId, instance_id: instanceId });
    if (!save) {
        return res.status(404).json({ error: 'Save not found' });
    }
    
    // Get galaxy data
    const instance = await GameInstance.findById(instanceId);
    const generator = new GalaxyGenerator(instance.seed);
    const systems = generator.generateGalaxy();
    
    const currentSystem = systems.find(s => s.index === save.player_state.currentSystemIndex);
    const destinationSystem = systems.find(s => s.index === destinationSystemIndex);
    
    if (!destinationSystem) {
        return res.status(400).json({ error: 'Invalid destination' });
    }
    
    // Calculate fuel cost
    const fuelCost = calculateFuelCost(currentSystem, destinationSystem);
    
    if (save.player_state.fuel < fuelCost) {
        return res.status(400).json({ 
            error: 'Insufficient fuel',
            required: fuelCost,
            available: save.player_state.fuel
        });
    }
    
    // Execute travel
    save.player_state.currentSystemIndex = destinationSystemIndex;
    save.player_state.fuel -= fuelCost;
    save.player_state.discoveredSystems.push(destinationSystemIndex);
    save.last_played = new Date();
    
    await save.save();
    
    res.json({ 
        success: true,
        newState: save.player_state,
        fuelUsed: fuelCost
    });
};
```

**Frontend Integration:**
```javascript
// client/src/components/TravelButton.jsx
import { useGameStore } from '../stores/gameStore';

function TravelButton({ selectedSystem }) {
    const { currentSystem, fuel, travelToSystem } = useGameStore();
    
    const fuelCost = calculateFuelCost(currentSystem, selectedSystem);
    const canTravel = fuel >= fuelCost;
    
    const handleTravel = async () => {
        if (!canTravel) {
            alert(`Insufficient fuel. Need ${fuelCost}, have ${fuel}`);
            return;
        }
        
        await travelToSystem(selectedSystem.index);
    };
    
    return (
        <button 
            onClick={handleTravel}
            disabled={!canTravel}
            className="travel-button"
        >
            Travel (Fuel: {fuelCost})
        </button>
    );
}
```

#### 0.1.4 UI Layout
**Description:** Establish core UI layout with panels and navigation

**Layout Structure:**
```
┌─────────────────────────────────────────────────────┐
│  Credits: 10,000 | Fuel: 85/100 | Cargo: 20/50     │ Top Bar
├────────────┬─────────────────────────────┬──────────┤
│            │                             │          │
│  Ship List │     GALAXY MAP VIEW         │ System   │
│            │     (PixiJS Canvas)         │ Info     │
│  • Ship 1  │                             │ Panel    │
│  • Ship 2  │     [Minimap]               │          │
│  • Ship 3  │                             │ Selected:│
│            │                             │ Alpha-17 │
│  [Manage]  │                             │          │
│            │                             │ Type:    │
│            │                             │ Yellow   │
│            │                             │          │
│            │                             │ [Travel] │
│            │                             │ [Scan]   │
└────────────┴─────────────────────────────┴──────────┘
  Left Panel        Center View            Right Panel
  (200px)           (flex-grow)            (300px)
```

### Testing Checklist
- [ ] Galaxy generates consistently from same seed
- [ ] 2000 systems are created with varied types
- [ ] Galaxy map renders and is interactive
- [ ] Camera pan and zoom work smoothly
- [ ] Minimap displays player position
- [ ] Travel system calculates fuel correctly
- [ ] Cannot travel with insufficient fuel
- [ ] Player position updates after travel
- [ ] Discovered systems are tracked

---

## Phase 0.2: Solar System View & UI Framework

### Overview
Implement solar system visualization when player enters a system. Build reusable UI component framework for all game panels and dialogs.

### Estimated Time
1-2 weeks

### Core Features

#### 0.2.1 Solar System View
**Description:** Detailed view of star system with planets in orbit

**Implementation:**
```javascript
// client/src/systems/SolarSystemView.js
import * as PIXI from 'pixi.js';

class SolarSystemView {
    constructor(container, systemData) {
        this.app = new PIXI.Application({
            width: window.innerWidth - 400,
            height: window.innerHeight,
            backgroundColor: 0x0a0a0f,
            antialias: true
        });
        
        container.appendChild(this.app.view);
        
        this.systemData = systemData;
        this.selectedPlanet = null;
        
        this.initializeSystem();
    }
    
    initializeSystem() {
        // Center of view
        const centerX = this.app.view.width / 2;
        const centerY = this.app.view.height / 2;
        
        // Draw star at center
        this.drawStar(centerX, centerY);
        
        // Draw planets in orbit
        this.systemData.planets.forEach((planet, index) => {
            this.drawPlanet(planet, centerX, centerY, index);
        });
    }
    
    drawStar(x, y) {
        const star = new PIXI.Graphics();
        
        // Star body
        star.beginFill(this.systemData.type.color);
        star.drawCircle(x, y, 40);
        star.endFill();
        
        // Glow effect
        star.lineStyle(3, this.systemData.type.color, 0.3);
        star.drawCircle(x, y, 55);
        star.lineStyle(2, this.systemData.type.color, 0.2);
        star.drawCircle(x, y, 70);
        
        this.app.stage.addChild(star);
    }
    
    drawPlanet(planet, centerX, centerY, index) {
        // Orbit ring
        const orbit = new PIXI.Graphics();
        orbit.lineStyle(1, 0x444444, 0.3);
        orbit.drawCircle(centerX, centerY, planet.orbitDistance);
        this.app.stage.addChild(orbit);
        
        // Planet position (distribute evenly around orbit)
        const angle = (index / this.systemData.planets.length) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * planet.orbitDistance;
        const y = centerY + Math.sin(angle) * planet.orbitDistance;
        
        // Planet body
        const planetSprite = new PIXI.Graphics();
        const color = this.getPlanetColor(planet.type);
        planetSprite.beginFill(color);
        planetSprite.drawCircle(x, y, planet.size);
        planetSprite.endFill();
        
        // Make interactive
        planetSprite.interactive = true;
        planetSprite.buttonMode = true;
        planetSprite.on('click', () => this.selectPlanet(planet));
        
        this.app.stage.addChild(planetSprite);
        
        // Planet label
        const label = new PIXI.Text(planet.name, {
            fontSize: 12,
            fill: 0xFFFFFF
        });
        label.position.set(x + planet.size + 5, y - 6);
        this.app.stage.addChild(label);
    }
    
    getPlanetColor(type) {
        const colors = {
            TERRESTRIAL: 0x4488FF,  // Blue
            GAS_GIANT: 0xFFAA44,    // Orange
            ICE: 0x88EEFF,          // Cyan
            LAVA: 0xFF4444,         // Red
            BARREN: 0x888888        // Gray
        };
        return colors[type] || 0xCCCCCC;
    }
    
    selectPlanet(planet) {
        this.selectedPlanet = planet;
        this.onPlanetSelected?.(planet);
    }
}

export default SolarSystemView;
```

#### 0.2.2 Planet Detail Panel
**Description:** Show planet information and interaction options

**Component:**
```javascript
// client/src/components/PlanetDetailPanel.jsx
function PlanetDetailPanel({ planet, onLand, onMine }) {
    if (!planet) {
        return (
            <div className="panel planet-detail empty">
                <p>Select a planet to view details</p>
            </div>
        );
    }
    
    return (
        <div className="panel planet-detail">
            <h2>{planet.name}</h2>
            
            <div className="planet-stats">
                <div className="stat">
                    <label>Type:</label>
                    <span>{planet.type}</span>
                </div>
                <div className="stat">
                    <label>Size:</label>
                    <span>{planet.size} km</span>
                </div>
            </div>
            
            <div className="resources">
                <h3>Resources</h3>
                {Object.entries(planet.resources).map(([resource, data]) => (
                    <div key={resource} className="resource-item">
                        <span className="resource-name">{resource}</span>
                        <div className="resource-bar">
                            <div 
                                className="resource-fill"
                                style={{ width: `${data.abundance}%` }}
                            />
                        </div>
                        <span className="resource-remaining">{data.remaining} units</span>
                    </div>
                ))}
            </div>
            
            <div className="actions">
                <button onClick={onLand}>Land on Planet</button>
                <button onClick={onMine} disabled>Mine Resources (Coming Soon)</button>
            </div>
        </div>
    );
}
```

#### 0.2.3 UI Component Library
**Description:** Build reusable components for consistent UI

**Core Components:**
- `Panel` - Container with cyberpunk styling
- `Button` - Neon-styled interactive button
- `ProgressBar` - For health, fuel, cargo
- `Modal` - Overlay dialogs
- `Notification` - Toast messages
- `StatDisplay` - Key-value stat rows

**Example Panel Component:**
```javascript
// client/src/components/ui/Panel.jsx
function Panel({ title, children, className, actions }) {
    return (
        <div className={`panel ${className || ''}`}>
            {title && (
                <div className="panel-header">
                    <h2 className="panel-title">{title}</h2>
                    {actions && <div className="panel-actions">{actions}</div>}
                </div>
            )}
            <div className="panel-content">
                {children}
            </div>
        </div>
    );
}

// CSS (Tailwind + custom)
.panel {
    @apply bg-gray-900 border-2 border-cyan-400 rounded-lg p-4;
    box-shadow: 0 0 10px rgba(0, 255, 136, 0.3);
}

.panel-header {
    @apply border-b border-cyan-700 pb-2 mb-4 flex justify-between items-center;
}

.panel-title {
    @apply text-cyan-400 text-lg font-bold uppercase tracking-wider;
    text-shadow: 0 0 5px rgba(0, 255, 136, 0.5);
}
```

#### 0.2.4 View State Management
**Description:** Handle switching between galaxy and system views

```javascript
// client/src/stores/gameStore.js
import { create } from 'zustand';

const useGameStore = create((set, get) => ({
    // View state
    currentView: 'galaxy', // 'galaxy' | 'system' | 'planet'
    selectedSystem: null,
    selectedPlanet: null,
    
    // Player state (will be loaded from API)
    credits: 10000,
    fuel: 100,
    maxFuel: 100,
    cargo: {},
    cargoCapacity: 50,
    currentSystemIndex: 0,
    discoveredSystems: [0],
    fleet: [],
    
    // Actions
    enterSystem: (system) => {
        set({ 
            currentView: 'system', 
            selectedSystem: system,
            selectedPlanet: null 
        });
    },
    
    selectPlanet: (planet) => {
        set({ selectedPlanet: planet });
    },
    
    landOnPlanet: (planet) => {
        set({ currentView: 'planet', selectedPlanet: planet });
    },
    
    returnToGalaxy: () => {
        set({ currentView: 'galaxy', selectedPlanet: null });
    },
    
    travelToSystem: async (systemIndex) => {
        // API call to travel
        const response = await fetch('/api/travel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${get().token}`
            },
            body: JSON.stringify({ 
                instanceId: get().instanceId,
                destinationSystemIndex: systemIndex 
            })
        });
        
        const data = await response.json();
        if (data.success) {
            set({ 
                fuel: data.newState.fuel,
                currentSystemIndex: systemIndex,
                discoveredSystems: data.newState.discoveredSystems
            });
        }
    }
}));
```

### Testing Checklist
- [ ] Can switch between galaxy and system views
- [ ] Solar system renders star and planets
- [ ] Planets are clickable and show details
- [ ] Planet detail panel displays resources
- [ ] UI components render consistently
- [ ] View state persists correctly

---

## Phase 1: Fleet Management System

### Overview
Comprehensive system for recruiting, organizing, and managing multiple ships within the player's fleet.

### Estimated Time
2 weeks

### Core Features

#### 1.1 Fleet Roster Management
**Description:** Interface for viewing all owned ships with detailed statistics

**Implementation Steps:**
1. Create fleet management UI panel
2. Display ship cards with key stats (health, fuel capacity, cargo, speed)
3. Add ship selection/deselection functionality
4. Implement fleet composition overview

**Data Structures:**
```javascript
fleet: [
  {
    id: "ship_001",
    name: "Pathfinder",
    type: "FRIGATE",
    health: 100,
    maxHealth: 100,
    level: 1,
    experience: 0,
    loadout: {
      weapons: [],
      shields: null,
      armor: null,
      engines: null,
      cargo: null,
      fuel: null
    },
    status: "active" // active, damaged, repairing, destroyed
  }
]
```

**UI Elements:**
- Ship card component showing name, type, health bar, status indicators
- Sort/filter options (by type, health, alphabetical)
- Quick stats summary at top (total ships, fleet capacity, avg health)

#### 1.2 Ship Acquisition
**Description:** Multiple methods for adding ships to the fleet

**Methods:**
- **Purchase:** Buy ships from trading posts/shipyards
- **Craft:** Build ships using resources (links to Phase 3)
- **Salvage:** Recover damaged ships from combat encounters
- **Quest Rewards:** Receive ships from completing missions

**Implementation:**
```javascript
function acquireShip(source, shipType, cost = null) {
  // Validate fleet capacity
  if (gameState.fleet.length >= gameState.maxFleetSize) {
    return { success: false, reason: "Fleet at maximum capacity" };
  }
  
  // Process acquisition based on source
  if (source === 'purchase' && gameState.credits >= cost) {
    gameState.credits -= cost;
    const newShip = createShip(shipType, generateShipName());
    gameState.fleet.push(newShip);
    return { success: true, ship: newShip };
  }
  // ... other source handlers
}
```

#### 1.3 Ship Renaming & Organization
**Description:** Allow players to personalize and organize their fleet

**Features:**
- Rename any ship
- Assign ships to groups/squadrons
- Mark ships as "flagship" for bonuses
- Set ship priorities for automated systems

#### 1.4 Fleet Capacity Management
**Description:** Dynamic fleet size limits based on progression

**Mechanics:**
- Base capacity: 12 ships
- Upgradeable through: Station upgrades, story progression, achievements
- Maximum capacity: 30 ships
- Over-capacity penalties: Increased fuel consumption, slower fleet speed

**Implementation:**
```javascript
function calculateFleetCapacity() {
  let capacity = BASE_FLEET_SIZE; // 12
  capacity += gameState.upgrades.hangarBays * 2;
  capacity += gameState.achievements.filter(a => a.bonusType === 'fleet').length;
  return Math.min(capacity, MAX_FLEET_SIZE); // Cap at 30
}
```

#### 1.5 Fleet Statistics Dashboard
**Description:** Aggregate view of entire fleet capabilities

**Displayed Stats:**
- Total fuel capacity and consumption rate
- Total cargo capacity and current load
- Average fleet speed
- Total firepower (once combat is implemented)
- Total defensive rating (once combat is implemented)
- Maintenance costs

### Testing Checklist
- [ ] Can add ships to fleet up to capacity limit
- [ ] Can remove/scrap ships from fleet
- [ ] Can rename ships with validation
- [ ] Fleet stats update correctly when composition changes
- [ ] UI responds properly to fleet modifications
- [ ] Handles edge cases (empty fleet, full fleet)

---

## Phase 2: Ship Loadout & Customization

### Overview
System for equipping and customizing individual ships with various equipment and upgrades.

### Estimated Time
2-3 weeks

### Core Features

#### 2.1 Equipment Slot System
**Description:** Standardized equipment slots that vary by ship class

**Slot Types:**

| Slot Type | Fighter | Corvette | Frigate | Description |
|-----------|---------|----------|---------|-------------|
| Weapons | 2 | 4 | 6 | Offensive systems |
| Shield | 1 | 1 | 2 | Energy shields |
| Armor | 1 | 2 | 3 | Physical plating |
| Engines | 1 | 1 | 2 | Propulsion systems |
| Cargo Modules | 1 | 2 | 4 | Storage expansion |
| Fuel Tanks | 1 | 2 | 3 | Fuel capacity |
| Utility | 1 | 2 | 3 | Mining lasers, scanners |

**Implementation:**
```javascript
const shipSlotConfigs = {
  FIGHTER: {
    weapons: 2,
    shields: 1,
    armor: 1,
    engines: 1,
    cargo: 1,
    fuel: 1,
    utility: 1
  },
  CORVETTE: {
    weapons: 4,
    shields: 1,
    armor: 2,
    engines: 1,
    cargo: 2,
    fuel: 2,
    utility: 2
  },
  FRIGATE: {
    weapons: 6,
    shields: 2,
    armor: 3,
    engines: 2,
    cargo: 4,
    fuel: 3,
    utility: 3
  }
};
```

#### 2.2 Equipment Database
**Description:** Comprehensive library of equippable items

**Example Equipment Items:**
```javascript
const equipment = {
  weapons: [
    {
      id: "laser_mk1",
      name: "Laser Cannon Mk1",
      type: "WEAPON",
      subtype: "ENERGY",
      damage: 15,
      fireRate: 1.0,
      energyCost: 10,
      range: 500,
      requiredPower: 5
    },
    {
      id: "missile_mk1",
      name: "Missile Launcher Mk1",
      type: "WEAPON",
      subtype: "PROJECTILE",
      damage: 40,
      fireRate: 0.5,
      ammoCapacity: 20,
      range: 800,
      requiredPower: 8
    }
  ],
  shields: [
    {
      id: "shield_basic",
      name: "Basic Energy Shield",
      type: "SHIELD",
      shieldStrength: 100,
      rechargeRate: 5,
      requiredPower: 15
    }
  ],
  // ... more equipment types
};
```

#### 2.3 Loadout Interface
**Description:** Drag-and-drop interface for equipping ships

**Features:**
- Visual representation of ship with slot positions
- Drag equipment from inventory to slots
- Swap equipment between slots
- View stat changes in real-time
- Save/load loadout presets

#### 2.4 Stat Calculation Engine
**Description:** Calculate final ship stats from base stats + equipment

```javascript
function calculateShipStats(ship) {
  const base = ship.baseStats;
  const loadout = ship.loadout;
  
  let stats = {
    hull: base.hull,
    shield: 0,
    armor: 0,
    speed: base.speed,
    cargoCapacity: base.cargo,
    fuelCapacity: base.fuel,
    firepower: 0,
    defense: 0,
    powerGeneration: base.power,
    powerConsumption: 0
  };
  
  // Add shield bonuses
  loadout.shields.forEach(shield => {
    if (shield) {
      stats.shield += shield.shieldStrength;
      stats.powerConsumption += shield.requiredPower;
    }
  });
  
  // Add armor bonuses
  loadout.armor.forEach(armor => {
    if (armor) {
      stats.armor += armor.armorRating;
    }
  });
  
  // Add engine bonuses
  loadout.engines.forEach(engine => {
    if (engine) {
      stats.speed += engine.speedBonus;
      stats.powerConsumption += engine.requiredPower;
    }
  });
  
  // Add cargo modules
  loadout.cargoModules.forEach(cargo => {
    if (cargo) {
      stats.cargoCapacity += cargo.capacityBonus;
    }
  });
  
  // Add fuel tanks
  loadout.fuelTanks.forEach(fuel => {
    if (fuel) {
      stats.fuelCapacity += fuel.capacityBonus;
    }
  });
  
  // Calculate firepower
  loadout.weapons.forEach(weapon => {
    if (weapon) {
      stats.firepower += weapon.damage * weapon.fireRate;
      stats.powerConsumption += weapon.requiredPower;
    }
  });
  
  // Calculate defense rating
  stats.defense = stats.armor + (stats.shield * 0.5);
  
  return stats;
}
```

### Testing Checklist
- [ ] Can equip items to ship slots
- [ ] Can unequip items
- [ ] Stat calculations update correctly
- [ ] Cannot equip incompatible items
- [ ] Power consumption is validated
- [ ] Loadout saves and loads properly

---

## Phase 3: Crafting & Upgrade System

### Overview
Complex crafting system for creating ships, equipment, and upgrades using collected resources.

### Estimated Time
3-4 weeks

### Core Features

#### 3.1 Resource System
**Description:** Define all collectible resources and their properties

**Resource Categories:**
- **Raw Materials:** Iron, Copper, Titanium, Platinum, Uranium
- **Rare Elements:** Crystals, Exotic Matter, Dark Energy
- **Refined Materials:** Steel, Alloys, Composites
- **Components:** Circuit Boards, Power Cells, Shield Generators

#### 3.2 Crafting Recipes
**Description:** Blueprint system for crafting items

**Example Recipe:**
```javascript
{
  id: "frigate_basic",
  name: "Basic Frigate",
  category: "SHIP",
  requirements: {
    steel: 500,
    titanium: 200,
    circuits: 50,
    powerCells: 20
  },
  craftingTime: 3600, // seconds
  craftingStation: "SHIPYARD",
  output: {
    type: "SHIP",
    shipType: "FRIGATE"
  }
}
```

#### 3.3 Crafting Queue
**Description:** Manage multiple crafting operations

**Features:**
- Queue multiple items
- Cancel crafting (partial refund)
- Rush crafting (premium currency or special items)
- View estimated completion times

#### 3.4 Quality System
**Description:** Crafted items have quality levels affecting stats

**Quality Tiers:**
- Standard (100% base stats)
- Enhanced (+10% stats)
- Superior (+25% stats)
- Masterwork (+50% stats)

**Quality Determination:**
- Based on player crafting skill
- Random chance with skill influence
- Rare materials can guarantee higher quality

### Testing Checklist
- [ ] Can craft items with sufficient resources
- [ ] Crafting consumes correct resources
- [ ] Queue system works correctly
- [ ] Quality system applies stat bonuses
- [ ] Cannot craft without requirements

---

## Phase 4: Economy & Trading System

### Overview
Dynamic market simulation with NPC traders, supply/demand mechanics, and trade routes.

### Estimated Time
4-5 weeks

### Core Features

#### 4.1 Market Simulation
**Description:** Dynamic pricing based on supply and demand

**Price Calculation:**
```javascript
function calculatePrice(resource, system) {
  const basePrice = RESOURCE_BASE_PRICES[resource];
  const supply = system.market.supply[resource] || 0;
  const demand = system.market.demand[resource] || 0;
  
  // Price increases when demand > supply
  const ratio = demand / Math.max(supply, 1);
  const multiplier = 0.5 + (ratio * 1.5); // 0.5x to 2.0x
  
  return Math.floor(basePrice * multiplier);
}
```

#### 4.2 NPC Traders
**Description:** AI-controlled traders that buy/sell and affect markets

**NPC Behavior:**
- Follow trade routes between systems
- Buy low, sell high
- Create market fluctuations
- Can be intercepted (piracy opportunity)

#### 4.3 Trading Interface
**Description:** Buy/sell resources at trading posts

**Features:**
- View current market prices
- Buy/sell in bulk
- Price history charts
- Deal notifications (unusual prices)

#### 4.4 Trade Routes
**Description:** Profitable routes between systems

**Route Discovery:**
- Analyze price differences
- Calculate profit potential
- Account for travel fuel costs
- Mark routes on galaxy map

### Testing Checklist
- [ ] Prices fluctuate based on supply/demand
- [ ] NPC traders affect markets
- [ ] Can buy/sell resources
- [ ] Trade routes are profitable
- [ ] Market history tracks correctly

---

## Phase 5: Combat System

### Overview
**Strategic turn-based fleet combat** with tactical positioning and ship abilities.

### Estimated Time
4-5 weeks

### Design Decision: Turn-Based Strategic Combat

**Why Turn-Based?**
- Less technically complex than real-time
- Easier to balance and test
- Works perfectly with server-authoritative model
- Engaging strategic depth
- Better for solo development
- Easier to implement AI opponents
- No latency issues in multiplayer

**Inspiration:** Games like Into the Breach, XCOM, FTL (pause mode)

### Core Features

#### 5.1 Combat Initiation
**Description:** Trigger combat encounters

**Encounter Types:**
- Random pirate encounters while traveling
- Faction conflicts in controlled systems
- PvP challenges (Phase 7)
- Quest-related battles

#### 5.2 Turn-Based Combat Grid
**Description:** Hex or grid-based tactical positioning

**Combat View:**
```
    [Enemy Fleet]
    
    E1  E2  E3
    
    [Combat Space]
    
    P1  P2  P3
    
    [Player Fleet]
```

**Turn Structure:**
1. **Planning Phase:** Both players issue commands simultaneously
2. **Resolution Phase:** All actions resolve in order of initiative
3. **Repeat:** Until one fleet is destroyed or retreats

#### 5.3 Ship Actions
**Description:** Available actions per turn

**Actions Per Ship:**
- **Move:** Change position on grid (costs movement points)
- **Fire Weapons:** Attack enemy ship in range
- **Use Ability:** Special ship abilities (shields, repairs, etc.)
- **Defend:** Increase armor/evasion for this turn
- **Retreat:** Attempt to flee combat (may fail)

#### 5.4 Damage Calculation
**Description:** Server-authoritative combat resolution

```javascript
function calculateDamage(attacker, target, weapon) {
  // Base damage
  let damage = weapon.damage;
  
  // Apply attacker bonuses
  damage *= (1 + attacker.stats.accuracy / 100);
  
  // Apply target defenses
  // Shield absorbs energy damage first
  let remainingDamage = damage;
  
  if (weapon.damageType === 'ENERGY' && target.currentShield > 0) {
    const shieldDamage = Math.min(remainingDamage, target.currentShield);
    target.currentShield -= shieldDamage;
    remainingDamage -= shieldDamage;
  }
  
  // Armor reduces physical damage
  if (weapon.damageType === 'PHYSICAL') {
    const reduction = target.stats.armor / (target.stats.armor + 100);
    remainingDamage *= (1 - reduction);
  }
  
  // Apply to hull
  target.currentHull -= remainingDamage;
  
  return {
    totalDamage: damage,
    shieldDamage: damage - remainingDamage,
    hullDamage: remainingDamage,
    destroyed: target.currentHull <= 0
  };
}
```

#### 5.5 Combat AI
**Description:** AI behavior for NPC ships

**AI Priorities:**
1. Target weakest enemy ship
2. Maintain optimal weapon range
3. Use abilities when beneficial
4. Retreat when heavily damaged
5. Protect high-value ships

#### 5.6 Combat Rewards
**Description:** Loot and experience from victories

**Rewards:**
- Credits based on enemy ship values
- Salvaged equipment (random from enemy loadouts)
- Resources from cargo holds
- Experience for surviving ships
- Reputation changes with factions

### Combat Flow Example

**Turn 1 - Planning Phase:**
- Player: Ship 1 moves forward, Ship 2 fires at Enemy 1
- AI: Enemy 1 defends, Enemy 2 moves forward

**Turn 1 - Resolution Phase:**
1. Ships move (by initiative order)
2. Ship 2 fires at Enemy 1 (deals 45 damage to shields)
3. Enemy 1 raises shields (defense bonus)

**Turn 2 - Planning Phase:**
- Player: Ship 1 fires, Ship 2 fires
- AI: Enemy 1 retreats, Enemy 2 fires at Ship 1

**Resolution continues until:**
- All enemy ships destroyed (Victory)
- All player ships destroyed (Defeat)
- Player retreats successfully (Escape)

### Server-Authoritative Architecture

**Why Server-Authoritative?**
- Prevents cheating (damage calculation, hit detection)
- Enables fair multiplayer combat
- Validates all actions before resolution
- Maintains single source of truth

**Combat API Flow:**
```javascript
// POST /api/combat/action
// Player submits action for their ships
{
  combatId: "combat_123",
  turn: 5,
  actions: [
    { shipId: "ship_001", action: "MOVE", target: {x: 2, y: 3} },
    { shipId: "ship_002", action: "FIRE", target: "enemy_ship_001" }
  ]
}

// Server validates and queues actions
// When both sides have submitted (or timeout):
// POST /api/combat/resolve
// Server calculates results and broadcasts to both players

// Returns:
{
  turn: 5,
  events: [
    { type: "MOVE", shipId: "ship_001", from: {x:1,y:2}, to: {x:2,y:3} },
    { type: "ATTACK", attacker: "ship_002", target: "enemy_ship_001", damage: 45 },
    { type: "DESTROYED", shipId: "enemy_ship_001" }
  ],
  nextTurn: 6,
  combatStatus: "ONGOING" // or "VICTORY", "DEFEAT"
}
```

### Testing Checklist
- [ ] Combat encounters trigger correctly
- [ ] Turn-based system works smoothly
- [ ] Actions validate on server
- [ ] Damage calculations are accurate
- [ ] Combat AI behaves intelligently
- [ ] Rewards distribute correctly
- [ ] Can retreat from combat
- [ ] Fleet state updates after battle

---

## Phase 6: Quest & Story System

### Overview
Narrative-driven quest system with main storyline and procedural side quests.

### Estimated Time
3-4 weeks

### Core Features

#### 6.1 Quest Data Structure
**Description:** Flexible quest system supporting various objective types

```javascript
{
  id: "quest_main_001",
  title: "First Contact",
  description: "Travel to the Alpha Centauri system and investigate strange signals.",
  type: "MAIN", // MAIN, SIDE, RANDOM
  objectives: [
    {
      id: "obj_1",
      type: "TRAVEL",
      target: "system_42",
      description: "Travel to Alpha Centauri",
      completed: false
    },
    {
      id: "obj_2",
      type: "SCAN",
      target: "planet_signal",
      description: "Scan the mysterious signal",
      completed: false,
      requires: ["obj_1"]
    }
  ],
  rewards: {
    credits: 5000,
    experience: 1000,
    items: ["scanner_advanced"],
    unlocks: ["faction_federation"]
  },
  status: "ACTIVE" // AVAILABLE, ACTIVE, COMPLETED, FAILED
}
```

#### 6.2 Quest Tracking
**Description:** UI for tracking active quests and objectives

**Features:**
- Quest log with filters (main/side/completed)
- Objective progress indicators
- Map markers for quest locations
- Notification when objectives complete

#### 6.3 Dynamic Quest Generation
**Description:** Procedurally generated side quests

**Quest Templates:**
- "Deliver cargo from System A to System B"
- "Mine X units of resource Y"
- "Defeat Z pirate ships"
- "Escort NPC trader through dangerous sector"

#### 6.4 Main Story Arc
**Description:** Narrative campaign with branching choices

**Story Outline (High Level):**
1. **Discovery:** Player finds ancient artifact in remote system
2. **Investigation:** Uncover conspiracy involving multiple factions
3. **Conflict:** Choose sides in escalating faction war
4. **Resolution:** Player choices determine galaxy's fate

### Testing Checklist
- [ ] Quests can be accepted and tracked
- [ ] Objectives complete when conditions met
- [ ] Quest rewards distribute correctly
- [ ] Story progression works linearly
- [ ] Dynamic quests generate properly

---

## Phase 7: Multiplayer & PvP

### Overview
**Instance-based cooperative multiplayer** with optional PvP features.

### Estimated Time
4-6 weeks

### Multiplayer Architecture

**Instance Model:**
- Each game instance = separate universe with own galaxy
- Default max 6 players per instance
- Instance creator is "host" (admin privileges)
- All players share same procedurally generated galaxy
- Server maintains authoritative game state

**Instance Types:**
- **Private:** Invite-only, password protected
- **Friends:** Visible only to friends list
- **Public:** Anyone can join (optional)

### Core Features

#### 7.1 Instance Management
**Description:** Create and join game instances

**API Endpoints:**
```javascript
// POST /api/instances/create
{
  name: "My Galaxy",
  maxPlayers: 6,
  isPrivate: true,
  password: "optional"
}

// GET /api/instances/list
// Returns: Available instances user can join

// POST /api/instances/join
{
  instanceId: "instance_123",
  password: "if_required"
}
```

#### 7.2 Real-Time Synchronization
**Description:** Use Socket.io for real-time player updates

**Events to Sync:**
- Player position changes (system travel)
- Market transactions (affect supply/demand)
- Combat encounters
- Chat messages

**Socket.io Implementation:**
```javascript
// Server
io.on('connection', (socket) => {
  socket.on('join-instance', (instanceId) => {
    socket.join(`instance_${instanceId}`);
  });
  
  socket.on('player-travel', (data) => {
    // Validate and broadcast to instance
    io.to(`instance_${data.instanceId}`).emit('player-moved', {
      playerId: socket.userId,
      systemIndex: data.systemIndex
    });
  });
});

// Client
socket.on('player-moved', (data) => {
  // Update other player's position on map
  updatePlayerMarker(data.playerId, data.systemIndex);
});
```

#### 7.3 Trading Between Players
**Description:** Direct player-to-player resource trading

**Trading Flow:**
1. Player initiates trade request
2. Both players add items/credits to trade window
3. Both players confirm
4. Server validates and executes trade

#### 7.4 PvP Combat
**Description:** Consensual or location-based PvP

**PvP Modes:**
- **Duel:** Mutual challenge between players
- **Contested Zones:** Specific systems allow PvP
- **Faction Wars:** PvP enabled between opposing factions

**Same turn-based combat system** as PvE, but both players submit actions

#### 7.5 Shared Economy
**Description:** Players affect same markets in instance

**Market Synchronization:**
- NPC traders operate across entire instance
- Player transactions affect supply/demand for everyone
- Enables cooperative trade route optimization
- Competition for limited rare resources

### Multiplayer Conflict Resolution

**Simultaneous Mining:**
If two players mine same planet simultaneously, server processes requests in order received (first-come-first-serve)

**Market Transactions:**
Server uses database transactions to prevent race conditions

**Combat Coordination:**
Turn timer ensures combat resolves fairly even with latency

### Testing Checklist
- [ ] Can create game instance
- [ ] Can join existing instance
- [ ] Real-time updates work reliably
- [ ] Player-to-player trading functions
- [ ] PvP combat works correctly
- [ ] Shared economy syncs across players
- [ ] Disconnect/reconnect handled gracefully

---

## Technical Architecture Deep Dive

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                     │
│                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │   React     │  │    PixiJS    │  │   Socket.io    │  │
│  │     UI      │  │   Renderer   │  │     Client     │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬───────┘  │
│         │                │                    │          │
│         └────────────────┴────────────────────┘          │
│                          │                               │
└──────────────────────────┼───────────────────────────────┘
                           │
                 HTTPS/WSS │
                           │
┌──────────────────────────┼───────────────────────────────┐
│                      SERVER                               │
│                          │                               │
│  ┌────────────┬──────────┴──────────┬────────────────┐  │
│  │  Express   │     Socket.io       │  Game Logic    │  │
│  │   Routes   │      Server         │   Services     │  │
│  └─────┬──────┴──────────┬──────────┴────────┬───────┘  │
│        │                 │                    │          │
│        └─────────────────┴────────────────────┘          │
│                          │                               │
│                 ┌────────┴────────┐                      │
│                 │   Middleware    │                      │
│                 │  (Auth, Valid.) │                      │
│                 └────────┬────────┘                      │
└──────────────────────────┼───────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────┐
│                   DATABASE LAYER                          │
│                          │                               │
│         ┌────────────────┴────────────────┐              │
│         │        PostgreSQL               │              │
│         │  ┌──────────────────────────┐   │              │
│         │  │  users                   │   │              │
│         │  │  game_instances          │   │              │
│         │  │  player_saves            │   │              │
│         │  │  solar_systems           │   │              │
│         │  └──────────────────────────┘   │              │
│         └─────────────────────────────────┘              │
└───────────────────────────────────────────────────────────┘
```

### Data Flow Examples

**Example 1: Player Travel**
1. User clicks destination star on galaxy map
2. React component calculates fuel cost
3. Frontend sends POST to `/api/travel` with JWT token
4. Express middleware validates JWT
5. Travel controller:
   - Loads player save from PostgreSQL
   - Generates galaxy from instance seed
   - Validates fuel availability
   - Updates player position in database
   - Returns new game state
6. Frontend updates Zustand store
7. PixiJS re-renders player position
8. Socket.io broadcasts position to other players in instance

**Example 2: Combat Resolution**
1. Combat encounter triggered (random or initiated)
2. Server creates combat session
3. Both players connected via Socket.io
4. Each turn:
   - Players submit actions via WebSocket
   - Server queues actions
   - When both submitted (or timeout), server resolves
   - Damage calculations on server
   - Results broadcast to both players
   - UI updates with animations
5. Combat ends, rewards calculated server-side
6. Player saves updated in database

### Performance Optimization

**Client-Side:**
- PixiJS sprite pooling for frequent objects (projectiles, particles)
- Spatial culling (only render visible systems)
- Lazy loading galaxy data (load systems on-demand)
- Debounce UI updates (max 60fps)

**Server-Side:**
- Cache frequently accessed data (galaxy generation results)
- Database connection pooling
- Indexed queries on common lookups
- Rate limiting on expensive operations

**Database:**
- JSONB for flexible game state storage
- Indexes on foreign keys and common queries
- Periodic cleanup of old combat sessions

### Security Considerations

**Authentication:**
- JWT tokens with expiration
- Refresh token rotation
- Password hashing with bcrypt (10+ rounds)

**Game State Integrity:**
- All calculations server-authoritative
- Validate all client requests
- Detect impossible actions (teleporting, unlimited resources)
- Rate limiting to prevent spam

**Database Security:**
- Parameterized queries (prevent SQL injection)
- Least-privilege database user
- Regular backups
- Encrypted connections

---

## Data Structures & Game State

### Core Game State
```javascript
const gameState = {
  // Player identity
  playerId: String,
  playerName: String,
  level: Number,
  experience: Number,
  
  // Resources
  credits: Number,
  inventory: Object, // { resourceId: quantity }
  
  // Fleet
  fleet: Array, // Ship objects
  maxFleetSize: Number,
  
  // Location
  currentSystemIndex: Number,
  currentLocation: String, // 'system', 'planet', 'station', etc.
  
  // Progression
  discoveredSystems: Array, // System indices
  completedQuests: Array,
  activeQuests: Array,
  reputation: Object, // { factionId: value }
  unlocks: Array, // Feature unlocks
  
  // UI State (client-only, not persisted)
  camera: { x: Number, y: Number, zoom: Number },
  selectedSystem: Object,
  selectedShip: Object,
  activePanel: String,
  
  // Gameplay State
  isTraveling: Boolean,
  isRefueling: Boolean,
  isMining: Boolean,
  isInCombat: Boolean,
  
  // Crafting
  craftingQueue: Array,
  
  // Multiplayer (Phase 7)
  instanceId: String,
  onlinePlayers: Map,
  activeTradeOffers: Array
};
```

### Ship Data Structure
```javascript
const ship = {
  id: String,
  name: String,
  type: String, // FIGHTER, CORVETTE, FRIGATE
  
  // Base stats (inherent to ship type)
  baseStats: {
    hull: Number,
    speed: Number,
    agility: Number,
    cargo: Number,
    fuel: Number,
    power: Number
  },
  
  // Current state
  currentHull: Number,
  currentShield: Number,
  currentFuel: Number,
  
  // Progression
  level: Number,
  experience: Number,
  
  // Equipment
  loadout: {
    weapons: Array,      // Up to slot limit
    shields: Array,      // Up to slot limit
    armor: Array,        // Up to slot limit
    engines: Array,      // Up to slot limit
    cargoModules: Array, // Up to slot limit
    fuelTanks: Array,    // Up to slot limit
    utility: Array       // Up to slot limit
  },
  
  // Calculated stats (derived from base + loadout)
  calculatedStats: {
    totalHull: Number,
    totalShield: Number,
    totalArmor: Number,
    speed: Number,
    cargoCapacity: Number,
    fuelCapacity: Number,
    firepower: Number,
    defense: Number,
    powerGeneration: Number,
    powerConsumption: Number
  },
  
  // Status
  status: String, // 'active', 'damaged', 'destroyed', 'repairing'
  
  // Abilities (unlocked through upgrades)
  abilities: Array,
  
  // Metadata
  craftedBy: String,
  acquiredAt: Date,
  totalDistance: Number,
  combatKills: Number
};
```

### Solar System Data Structure
```javascript
const solarSystem = {
  id: String,
  index: Number, // For procedural generation
  name: String,
  position: { x: Number, y: Number },
  
  // Star properties
  type: {
    type: String, // MAIN_SEQUENCE, RED_GIANT, etc.
    color: Number, // Hex color
    weight: Number
  },
  
  // Planets
  planets: [
    {
      id: String,
      name: String,
      type: String, // TERRESTRIAL, GAS_GIANT, etc.
      size: Number,
      orbitDistance: Number,
      
      // Resources
      resources: {
        IRON: { abundance: Number, remaining: Number },
        COPPER: { abundance: Number, remaining: Number }
        // ... more resources
      },
      
      // Facilities
      tradingPost: Boolean,
      shipyard: Boolean,
      refuelingStation: Boolean
    }
  ],
  
  // Faction control
  factionPresence: String, // null or faction ID
  
  // Market data (dynamic, stored in database when modified)
  market: {
    supply: Object, // { resourceId: quantity }
    demand: Object, // { resourceId: quantity }
    prices: Object  // { resourceId: credits }
  },
  
  // Discovery
  discovered: Boolean,
  discoveredBy: String, // Player ID
  discoveredAt: Date
};
```

---

## UI/UX Design Philosophy

### Visual Design

**Cyberpunk Aesthetic:**
- Neon colors with dark backgrounds
- Scan lines and glitch effects
- Retro-futuristic typography
- Pixel art with smooth animations

**Color Scheme:**
```css
:root {
  --primary: #00ff88;      /* Cyan/Green - primary actions, highlights */
  --secondary: #00aaff;    /* Blue - secondary elements */
  --warning: #ffaa00;      /* Orange - warnings, attention */
  --danger: #ff4444;       /* Red - errors, damage, critical */
  --background: #0a0a0f;   /* Dark - main background */
  --panel-bg: #1a1a1f;     /* Slightly lighter - panels */
  --text: #e0e0e0;         /* Light gray - readable text */
  --text-dim: #888888;     /* Dimmed text - labels */
}
```

**Typography:**
- Headers: Bold, uppercase, wide tracking
- Body: Clean sans-serif (Arial, Helvetica)
- Monospace for numbers, stats, codes

### UX Principles

**Clarity:**
- All stats and information easily visible
- No hidden information critical to gameplay
- Clear visual hierarchy

**Feedback:**
- Visual feedback for all actions (button press, hover states)
- Audio cues for important events
- Animation for state changes
- Toast notifications for background events

**Efficiency:**
- Minimize clicks to common actions
- Keyboard shortcuts for power users
- Quick access toolbar for frequent actions
- Contextual menus (right-click)

**Responsiveness:**
- Instant UI updates (optimistic updates)
- Smooth 60fps animations
- Loading states for async operations
- Progressive loading (show partial data while loading full dataset)

**Accessibility:**
- Colorblind modes (alternative color schemes)
- Keyboard navigation for all features
- Screen reader compatibility (ARIA labels)
- Adjustable text size
- High contrast mode

### Interface Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [LOGO]  Credits: 10,000 | Fuel: 85/100 | Cargo: 20/50     │ Top Bar
│  [Quick Actions: Trade | Craft | Combat | Quests]           │ (60px)
├──────────┬──────────────────────────────────────┬───────────┤
│          │                                      │           │
│  Fleet   │     MAIN VIEW AREA                   │  Context  │
│  Panel   │     (Galaxy Map / Solar System /     │  Panel    │
│          │      Combat / Crafting / etc.)       │           │
│  Ship 1  │                                      │ Selected  │
│  Ship 2  │                                      │ System:   │
│  Ship 3  │        [Rendered with PixiJS]        │ Alpha-17  │
│          │                                      │           │
│  Stats:  │                                      │ Planets:  │
│  Fuel    │                                      │ • Terra   │
│  Cargo   │                                      │ • Gas 1   │
│  Health  │                                      │           │
│          │                                      │ [Actions] │
│  [Fleet] │              [Minimap]               │ Travel    │
│  [Manage]│                                      │ Scan      │
│          │                                      │ Land      │
└──────────┴──────────────────────────────────────┴───────────┘
│  Quest: "First Contact" - Travel to Alpha Centauri (1/3)   │ Bottom Bar
│  [Notifications: "Ship repaired" | "Market update"]        │ (40px)
└─────────────────────────────────────────────────────────────┘

Left Panel: 200-250px (collapsible)
Center View: flex-grow (minimum 800px)
Right Panel: 300-350px (collapsible)
```

### Component Examples

**Button Styles:**
```css
.btn-primary {
  background: linear-gradient(135deg, #00ff88 0%, #00cc66 100%);
  border: 2px solid #00ff88;
  color: #000;
  text-transform: uppercase;
  font-weight: bold;
  padding: 10px 20px;
  box-shadow: 0 0 20px rgba(0, 255, 136, 0.5);
  transition: all 0.2s;
}

.btn-primary:hover {
  box-shadow: 0 0 30px rgba(0, 255, 136, 0.8);
  transform: translateY(-2px);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
```

**Progress Bar:**
```jsx
function ProgressBar({ current, max, color, label }) {
  const percentage = (current / max) * 100;
  
  return (
    <div className="progress-bar">
      <div className="progress-label">
        <span>{label}</span>
        <span>{current} / {max}</span>
      </div>
      <div className="progress-track">
        <div 
          className="progress-fill"
          style={{ 
            width: `${percentage}%`,
            backgroundColor: color || 'var(--primary)'
          }}
        />
      </div>
    </div>
  );
}
```

---

## Development Timeline

### Milestone Roadmap

**Phase 0: Foundation (3-4 weeks)**
- Week 1: Tech setup, authentication, database schema
- Week 2-3: Galaxy generation, navigation, map rendering
- Week 4: Solar system view, UI framework

**Phase 1-2: Fleet & Loadouts (4-5 weeks)**
- Week 5-6: Fleet management system
- Week 7-8: Ship loadout and equipment system
- Week 9: Testing and polish

**Phase 3: Crafting (3-4 weeks)**
- Week 10-11: Resource system and recipes
- Week 12-13: Crafting queue and quality system

**Phase 4: Economy (4-5 weeks)**
- Week 14-15: Market simulation and NPC traders
- Week 16-17: Trading interface and trade routes
- Week 18: Economic balancing

**Phase 5: Combat (4-5 weeks)**
- Week 19-20: Turn-based combat mechanics
- Week 21-22: Combat UI and AI
- Week 23: Combat balancing and polish

**Phase 6: Quests (3-4 weeks)**
- Week 24-25: Quest system and tracking
- Week 26-27: Main story and side quests

**Phase 7: Multiplayer (4-6 weeks)**
- Week 28-29: Instance system and synchronization
- Week 30-31: Player trading and shared economy
- Week 32-33: PvP and testing

**Total Timeline: ~33 weeks (8 months)** at comfortable hobby pace

### Development Priorities

**Must Have (MVP - Playable Single-Player):**
1. ✅ Tech stack and authentication
2. ✅ Galaxy generation and navigation
3. ✅ Fleet management basics
4. ✅ Ship loadouts
5. ✅ Simple trading system
6. ✅ Basic crafting
7. ✅ Turn-based combat
8. ✅ Core quest line

**Should Have (v1.0 - Full Experience):**
9. Advanced crafting with quality tiers
10. Complex economy with NPC traders
11. Tactical combat abilities
12. Full story arc with choices
13. Dynamic event system
14. Achievement system

**Nice to Have (v1.1+ - Enhanced Features):**
15. Multiplayer instances (Phase 7)
16. PvP combat
17. Cooperative trading
18. Guilds/corporations
19. Advanced endgame content
20. Seasonal events

### Quality Gates

**Each Phase Completion Requires:**
- [ ] All features implemented
- [ ] Unit tests pass (where applicable)
- [ ] Manual testing completed
- [ ] No critical bugs
- [ ] Performance acceptable (60fps, <2s load times)
- [ ] Documentation updated

---

## Conclusion

This comprehensive roadmap provides a structured path to developing **Star Shipper** from initial concept to full-featured browser-based multiplayer space trading game.

### Key Success Factors

**Technical:**
- JavaScript-everywhere stack minimizes context switching
- Server-authoritative design prevents cheating
- Instance-based multiplayer scales well
- Turn-based combat is feasible for solo development

**Design:**
- Clear progression path keeps players engaged
- Multiple gameplay loops (trading, combat, crafting, exploration)
- Cyberpunk aesthetic differentiates from competitors
- Accessibility features broaden audience

**Development:**
- Phased approach allows iterative testing
- Single-player first, multiplayer later reduces complexity
- Generated assets enable faster prototyping
- Hobby timeline removes pressure

### Next Immediate Steps

1. **Set up development environment** (Day 1)
   - Install Node.js, PostgreSQL, create project structure
   - Initialize React app and Express server
   - Configure ESLint, Prettier, Git

2. **Implement authentication** (Days 2-3)
   - Database schema for users
   - Registration and login endpoints
   - JWT token system
   - Basic login UI

3. **Begin galaxy generation** (Days 4-10)
   - Implement seedrandom galaxy generation
   - Create PixiJS galaxy map renderer
   - Build navigation system
   - Test with different seeds

4. **Continue following roadmap phases**
   - Each phase builds on previous
   - Test thoroughly before moving forward
   - Maintain flexibility to adjust based on learnings

### Long-Term Vision

**v1.0 (8 months):** Complete single-player experience with all core systems

**v1.5 (12 months):** Multiplayer instances with cooperative trading

**v2.0 (18 months):** Full PvP, guilds, advanced endgame content

**Beyond:** Potential expansions, new ship types, story arcs, etc.

---

**Document Version History**
- v1.0: Initial game design document
- v2.0: Complete technical architecture, clarified multiplayer model, added Phase 0 details, refined all systems
- v2.1: Renamed project from "Star Sector" to "Star Shipper" to avoid conflict with existing game

**Living Document**
This roadmap will evolve as development progresses. Update regularly with lessons learned, design changes, and new ideas.

---

*Ready to build something awesome? Let's make Star Shipper a reality!* 🚀
