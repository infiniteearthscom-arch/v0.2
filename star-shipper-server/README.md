# Star Shipper Server

Backend server for Star Shipper - real-time multiplayer space game.

## Tech Stack

- **Node.js** + **Express** - HTTP API
- **Socket.IO** - Real-time communication
- **PostgreSQL** - Database
- **JWT** - Authentication

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENTS (Browsers)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌───────────────┐           ┌───────────────┐
│   HTTP API    │           │   Socket.IO   │
│   (Express)   │           │   (Real-time) │
└───────┬───────┘           └───────┬───────┘
        │                           │
        └─────────────┬─────────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │      Game Logic         │
        │  - Hub Management       │
        │  - Mission Instances    │
        │  - Player Presence      │
        └─────────────┬───────────┘
                      │
                      ▼
        ┌─────────────────────────┐
        │      PostgreSQL         │
        │  - Users & Auth         │
        │  - Ships & Designs      │
        │  - Galaxy Data          │
        │  - Game State           │
        └─────────────────────────┘
```

## Setup

### 1. Install PostgreSQL

**Mac (Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download from https://www.postgresql.org/download/windows/

### 2. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE star_shipper;

# Exit
\q
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:
```
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/star_shipper
JWT_SECRET=generate-a-random-secret-here
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run Migrations

```bash
npm run db:migrate
```

### 6. Seed Initial Data

```bash
npm run db:seed
```

### 7. Start Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/refresh` | Refresh token |

### Ships
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ships/designs` | List ship designs |
| GET | `/api/ships/designs/:id` | Get design details |
| POST | `/api/ships/designs` | Save design |
| DELETE | `/api/ships/designs/:id` | Delete design |
| GET | `/api/ships` | List built ships |
| POST | `/api/ships/build` | Build ship from design |
| DELETE | `/api/ships/:id` | Scrap ship |

## Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `hub:join` | `{ hubId, shipId }` | Join a hub |
| `hub:update` | `{ x, y, rotation, ... }` | Update position |
| `hub:leave` | - | Leave current hub |
| `chat:send` | `{ channel, message }` | Send chat message |
| `mission:create` | `{ type, difficulty }` | Create mission |
| `mission:join` | `{ missionId }` | Join mission |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ userId, username }` | Connection confirmed |
| `hub:joined` | `{ hubId, players, yourState }` | Joined hub |
| `hub:playerJoined` | `{ userId, ... }` | Player joined |
| `hub:playerLeft` | `{ userId }` | Player left |
| `hub:playerUpdate` | `{ userId, x, y, ... }` | Player moved |
| `hub:tick` | `{ timestamp, players }` | Game tick |
| `chat:message` | `{ sender, content, ... }` | Chat message |
| `error` | `{ message }` | Error occurred |

## Database Schema

See `migrations/001_initial_schema.sql` for full schema.

Key tables:
- `users` - Player accounts
- `player_resources` - Credits, metals, etc.
- `ship_designs` - Ship blueprints
- `ships` - Built ship instances
- `star_systems` - Galaxy map
- `celestial_bodies` - Planets, stations
- `hub_instances` - Social hub instances
- `mission_instances` - Instanced gameplay

## Deployment (DigitalOcean)

### 1. Create Droplet

- Ubuntu 22.04 LTS
- Basic plan ($6-12/mo)
- Add your SSH key

### 2. Initial Server Setup

```bash
# SSH into droplet
ssh root@your-droplet-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Install PM2 (process manager)
npm install -g pm2

# Create app user
adduser starshipper
usermod -aG sudo starshipper
```

### 3. Setup PostgreSQL

```bash
sudo -u postgres psql
CREATE USER starshipper WITH PASSWORD 'your-secure-password';
CREATE DATABASE star_shipper OWNER starshipper;
\q
```

### 4. Deploy Code

```bash
# As starshipper user
su - starshipper
git clone your-repo-url star-shipper-server
cd star-shipper-server
npm install --production
cp .env.example .env
# Edit .env with production values
npm run db:migrate
npm run db:seed
```

### 5. Start with PM2

```bash
pm2 start src/index.js --name star-shipper
pm2 save
pm2 startup
```

### 6. Setup Nginx (reverse proxy)

```bash
apt install nginx
```

Create `/etc/nginx/sites-available/star-shipper`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/star-shipper /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### 7. SSL (Let's Encrypt)

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## Monitoring

```bash
# View logs
pm2 logs star-shipper

# Monitor
pm2 monit

# Status
pm2 status
```
