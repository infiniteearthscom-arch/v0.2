# Resource System - Chunk 3: Surveying UI

## What's Included

### Server Files
- `src/api/resources.js` - Updated with surveying endpoints
- `migrations/004_scanner_probes.sql` - Adds probe columns

### Client Files
- `src/components/system/PlanetInteractionWindow.jsx` - NEW - Planet docking UI
- `src/components/system/SystemView.jsx` - Updated to show interaction window

## Installation

### 1. Run the migration

```bash
"C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -d star_shipper -f migrations/004_scanner_probes.sql
```

### 2. Copy server files

```bash
cp server/src/api/resources.js C:\Dropbox\Star-shipper\v0.2\star-shipper-server\src\api\
```

### 3. Copy client files

```bash
cp client/src/components/system/PlanetInteractionWindow.jsx C:\Dropbox\Star-shipper\v0.2\star-shipper\src\components\system\
cp client/src/components/system/SystemView.jsx C:\Dropbox\Star-shipper\v0.2\star-shipper\src\components\system\
```

### 4. Restart both server and client

## How It Works

1. **Autopilot to a planet** - Click on any planet/station
2. **Ship docks** - When ship arrives, it locks to the planet
3. **Interaction window opens** - Shows scan/trade/mine tabs
4. **Perform scans:**
   - Orbital Scan (1 probe) → See resource types & abundance
   - Ground Scan (1 advanced probe) → See stat ranges & quantities
5. **Press WASD to undock** - Window closes, ship can fly away

## Starting Probes

After running the migration, players get:
- 5 Scanner Probes
- 2 Advanced Scanner Probes

## UI Features

- **Scan Tab:** Orbital and ground scanning
- **Trade Tab:** Coming soon (placeholder)
- **Mine Tab:** Coming soon (placeholder)
- Survey status indicators (✓ Complete)
- Hazard warnings for dangerous planets
- Quality tier previews with color coding
