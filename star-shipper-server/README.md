# Resource System - Chunk 3: Surveying

## What's Included

### Server Files
- `src/api/resources.js` - Updated with surveying endpoints
- `migrations/004_scanner_probes.sql` - Adds probe columns to player_resources

## Installation

### 1. Run the migration

```bash
"C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -d star_shipper -f migrations/004_scanner_probes.sql
```

### 2. Copy the updated API file

```bash
cp server/src/api/resources.js /path/to/star-shipper-server/src/api/
```

### 3. Restart your server

## New API Endpoints

### Scanner Probes
- `GET /api/resources/probes` - Get player's probe counts

### Survey Status
- `GET /api/resources/survey/:bodyId` - Check survey status for a body

### Perform Scans
- `POST /api/resources/survey/orbital/:bodyId` - Orbital scan (consumes 1 scanner probe)
- `POST /api/resources/survey/ground/:bodyId` - Ground scan (consumes 1 advanced probe)

## How Surveying Works

### Orbital Scan
- **Requires:** 1 Scanner Probe
- **Reveals:**
  - Resource TYPES present (Iron, Titanium, etc.)
  - Abundance level (Scarce / Moderate / Abundant)
  - Number of deposits
  - Hazard warnings

### Ground Scan
- **Requires:** 1 Advanced Scanner Probe + prior orbital scan
- **Reveals:**
  - Individual deposit locations
  - Quantity RANGES (±10%)
  - Stat RANGES (±10 points)
  - Estimated quality tier

### Full Details
- Only revealed when actually harvesting
- Exact stats shown after ground scan in deposits endpoint

## Starting Resources

New players get:
- 5 Scanner Probes
- 2 Advanced Scanner Probes

## Testing

```bash
# Get probe counts
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/resources/probes

# Check survey status
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/resources/survey/BODY_ID

# Perform orbital scan
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:3001/api/resources/survey/orbital/BODY_ID

# Perform ground scan (after orbital)
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:3001/api/resources/survey/ground/BODY_ID
```
