# Star Shipper

Browser-based 4X space game. Mine resources on planets, craft modules, fit them to ships, build a fleet, trade with vendors, fight pirates, and explore a procedurally generated galaxy of 200 star systems connected by jump gates and warp points.

**Live:** https://star-shipper-fjrrq.ondigitalocean.app

## Tech stack

- **Client:** React 18 + Vite, Zustand, Tailwind CSS — `star-shipper/`
- **Server:** Node 22 + Express, raw SQL (`pg`), JWT auth — `star-shipper-server/`
- **Database:** PostgreSQL 18
- **Hosting:** DigitalOcean App Platform (auto-deploy from `main`)

## Local development

Prerequisites: Node 22+, PostgreSQL 18, a local `star_shipper` database.

```bash
# Server
cd star-shipper-server
npm install
npm run db:migrate          # applies migrations/001..016
npm run dev                 # → http://localhost:3001

# Client (separate terminal)
cd star-shipper
npm install
npm run dev                 # → http://localhost:5173
```

The client falls back to `http://localhost:3001` for the API when `VITE_API_URL` is unset, so no `.env` is needed for local dev.

## Repository layout

```
star-shipper/                  Vite React client
star-shipper-server/           Express API + migrations/
docs/design-vision.md          Aspirational 4X design doc
HANDOFF.md                     Deep operational + architectural reference
CLAUDE.md                      Working notes for Claude Code sessions
```

## Documentation

- **HANDOFF.md** — current operational truth: deployment, architecture, feature state, gotchas, session log.
- **CLAUDE.md** — concise session-load doc with critical pitfalls and code patterns.
- **docs/design-vision.md** — original 4X game design. Many sections describe features not yet implemented; treat as direction, not as current state.

## Deployment

Push to `main` → DigitalOcean rebuilds and deploys both the server (Web Service) and client (Static Site) in ~3–5 minutes. Database migrations run via the DO Console (`npm run db:migrate` on the server component), not from local.

See HANDOFF.md for environment variables, routing rules, cost breakdown, and operational details.
