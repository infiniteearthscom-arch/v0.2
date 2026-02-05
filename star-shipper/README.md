# Star Shipper

A serious sci-fi space exploration and empire-building game combining deep ship customization with planetary development and galactic expansion.

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Zustand** - State management (with persistence)
- **Immer** - Immutable state updates
- **Tailwind CSS** - Styling
- **Canvas API** - Starfield rendering

## Project Structure

```
star-shipper/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── ship/
│   │   │   ├── ShipBuilderWindow.jsx  # Ship builder window container
│   │   │   └── ShipGrid.jsx           # Hull/room grid + tool palette + stats
│   │   └── ui/
│   │       ├── DraggableWindow.jsx    # Reusable draggable window system
│   │       ├── ResourceBar.jsx        # Top resource display
│   │       ├── Starfield.jsx          # Animated space background
│   │       └── Toolbar.jsx            # Bottom-right action buttons
│   ├── stores/
│   │   └── gameStore.js               # Zustand store with all game state
│   ├── systems/
│   │   └── gameData.js                # Game constants, room types, systems, templates
│   ├── App.jsx                        # Main app component
│   ├── main.jsx                       # Entry point
│   └── index.css                      # Global styles + Tailwind
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Architecture Decisions

### State Management (Zustand)
- Single store for all game state
- Immer middleware for immutable updates
- Persist middleware for save games (localStorage by default, prepared for cloud)
- Separate selectors for optimized re-renders

### Ship Building System
1. **Hull Layer** - Set of cell coordinates defining ship shape
2. **Room Layer** - Rectangular rooms placed within hull
3. **System Layer** - Equipment installed within rooms (future)
4. **Crew Layer** - Crew assigned to stations (future)

### Window System
- Draggable, resizable windows for all management screens
- Z-index stacking with click-to-front
- Minimize to dock, restore, close
- Position persistence in state

### Data Architecture
- `gameData.js` contains all static game data (room types, systems, templates)
- Ship designs are stored separately from ship instances
- Designs can be built into multiple ship instances

## Current Features (v0.1)

- [x] Animated starfield background
- [x] Draggable window system
- [x] Hull construction (paint cells, templates)
- [x] Room placement (12 room types)
- [x] Ship statistics calculation
- [x] Power budget tracking
- [x] Ship design validation
- [x] Save/load designs
- [x] Resource display

## Planned Features

### Phase 2
- [ ] Systems within rooms
- [ ] Crew management
- [ ] Basic system view (planets, stations)
- [ ] Mining and trading

### Phase 3
- [ ] Combat system
- [ ] Multiple star systems
- [ ] Jump drives
- [ ] Colony management

### Phase 4
- [ ] Fleet management
- [ ] Research tree
- [ ] Factions
- [ ] Endgame content

## Save Data

Game saves automatically to localStorage. Save data structure is designed to support future cloud save integration.

Current save includes:
- Resources
- Ship designs
- Fleet (ship instances)
- Colonies
- Research progress
- Exploration data

## Contributing

This is a personal project but the architecture is designed to be extensible. Key extension points:

- Add room types in `gameData.js`
- Add systems in `gameData.js`
- Add new windows by creating component + registering in store
- Add new game systems by extending the store
