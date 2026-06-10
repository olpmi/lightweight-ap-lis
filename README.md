# Lightweight AP LIS

A lightweight **Anatomic Pathology Laboratory Information System** prototype implemented as a monorepo.

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js Â· Express Â· TypeScript Â· Prisma |
| Database | PostgreSQL |
| Frontend | React Â· Vite Â· TypeScript Â· MUI v5 |
| API data | TanStack Query (React Query) |
| Validation | Zod (shared schemas) |
| PDF generation | Handlebars + Puppeteer (HTML report layout) Â· pdf-lib (legacy) |
| Session auth | express-session |
| Testing | Vitest Â· React Testing Library Â· Playwright |
| CI/CD | GitHub Actions |
| Local dev | Docker Compose |

## Repository layout

```
/
  apps/
    backend/           Express API
    frontend/          React SPA
                        src/tests/e2e/demo-lifecycle.spec.ts  Multi-language case-lifecycle demo recorder
                        src/tests/e2e/i18n-audit.spec.ts      Translation-coverage probe
                        demo-videos/                          Recorded .webm demos (one per language)
  packages/
    shared/            Shared TypeScript types, Zod schemas, ID helpers
  prisma/
    schema.prisma      Database schema
    seed.ts            Synthetic demo seed (~300 orders)
  docker/              Dockerfiles + nginx config
  .github/workflows/   CI pipeline
  docker-compose.yml
```

## Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9 --activate`). The repo is a pnpm workspace (`pnpm-workspace.yaml`) and CI runs the pnpm-lock.yaml under `pnpm install --frozen-lockfile`.
- Docker (for containerized run) or PostgreSQL 16+ (for local dev)

## Quick start â€” Docker Compose

This repo ships **two Compose stacks**:

| Stack | File(s) | Database | Use for |
|---|---|---|---------|
| **Development** (default) | `docker-compose.yml` (optionally `+ docker-compose.dev.yml` for Vite HMR) | Containerized PostgreSQL | Local development, demos, CI |
| **Production** | `docker-compose.prod.yml` (standalone) | Local PostgreSQL primary + hot-standby replica | Real deployments |

The two stacks share the same backend/frontend images and code. **The only difference is the database wiring** â€” dev runs Postgres in a container; prod connects to a managed Cloud SQL instance through an Auth Proxy sidecar. Bring one stack down before starting another so they do not compete for container names and ports.

### Dev path 1. Base Compose stack (`docker-compose.yml`)

```bash
# Copy and review environment variables
cp .env.development.example .env

# Start all services (PostgreSQL, backend, frontend)
docker compose -f docker-compose.yml up --build
```

The frontend will be available at **http://localhost:5173**  
The backend API at **http://localhost:3001**

This stack will automatically:
1. Start PostgreSQL
2. Run Prisma migrations (`prisma migrate deploy`)
3. Seed the database with ~300 synthetic cases
4. Start the backend and serve the built frontend with nginx

To stop it:

```bash
docker compose -f docker-compose.yml down
```

### Dev path 2. Dev override stack (`docker-compose.yml` + `docker-compose.dev.yml`)

```bash
# Copy and review environment variables
cp .env.development.example .env

# Start PostgreSQL, backend, and the Vite dev server frontend
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

The backend remains available at **http://localhost:3001**.  
The frontend runs from the Vite dev server on **http://localhost:5173** by default, or `http://localhost:${FRONTEND_DEV_PORT}` if you set `FRONTEND_DEV_PORT`.

This path keeps the frontend mounted from the local workspace for hot reload and uses the override file to replace the nginx container with the dev server.

To stop it:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

### Production stack (docker-compose.prod.yml)

The prod stack runs **two local PostgreSQL 16 containers** with streaming (physical) replication:

| Service | Role |
|---|---|
| `postgres_primary` | Writable primary — backend writes here |
| `postgres_standby` | Hot standby (read replica) — accepts read-only queries; optionally used via `DATABASE_URL_REPLICA` |
| `backend` | Node.js API; runs `prisma migrate deploy` on startup |
| `frontend` | nginx serving the built React SPA |
| `backup_cron` *(optional)* | Daily base backup to GCS via wal-g; started with `--profile backup` |

Backend startup runs `prisma migrate deploy` only — **no `db push`, no seeding**.
Reference lookup data (employee roles, specimen types, body sites, ancillary tests and panels) is inserted automatically by the `20260609000000_seed_reference_data` migration, which is idempotent.

Prerequisites on the host:

1. Docker + Docker Compose v2.
2. A `.env.production` file (copy from `.env.production.example`).

Setup:

```bash
# 1. Configure environment
cp .env.production.example .env.production
# Edit .env.production — set POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
# REPLICATION_PASSWORD, SESSION_SECRET, CORS_ORIGIN, COOKIE_SECURE.

# 2. (Optional — GCS backups only) Place the service-account key
mkdir -p secrets
cp /path/to/your-gcp-sa.json secrets/gcp-sa.json
# Also set WALG_GCS_PREFIX in .env.production

# 3. Build and start (without GCS backup)
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# 3b. Build and start (with GCS backup scheduler)
docker compose --env-file .env.production -f docker-compose.prod.yml \
  --profile backup up -d --build
```

To stop it:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

#### Verify replication

```bash
# Check standby is connected and streaming
docker exec lis-postgres-primary psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT client_addr, state, sync_state, replay_lag FROM pg_stat_replication;"

# Confirm standby is in recovery mode
docker exec lis-postgres-standby psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT pg_is_in_recovery();"
```

#### Manual failover (promote standby)

```bash
docker exec lis-postgres-standby psql -U $POSTGRES_USER \
  -c "SELECT pg_promote();"
# Then update DATABASE_URL in .env.production → postgres_standby and restart backend.
```

> **Security:** never commit `.env.production` or anything in `secrets/` — both are listed in `.gitignore`.

