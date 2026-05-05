# Lightweight AP LIS

A lightweight **Anatomic Pathology Laboratory Information System** prototype implemented as a monorepo.

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js · Express · TypeScript · Prisma |
| Database | PostgreSQL |
| Frontend | React · Vite · TypeScript · MUI v5 |
| API data | TanStack Query (React Query) |
| Validation | Zod (shared schemas) |
| PDF generation | pdf-lib |
| Session auth | express-session |
| Testing | Vitest · React Testing Library · Playwright |
| CI/CD | GitHub Actions |
| Local dev | Docker Compose |

## Repository layout

```
/
  apps/
    backend/           Express API
    frontend/          React SPA
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
- pnpm 10+ (`npm install -g pnpm`)
- Docker (for containerized run) or PostgreSQL 16+ (for local dev)

## Quick start — Docker Compose

This repo ships **two Compose stacks**:

| Stack | File(s) | Database | Use for |
|---|---|---|---------|
| **Development** (default) | `docker-compose.yml` (optionally `+ docker-compose.dev.yml` for Vite HMR) | Containerized PostgreSQL | Local development, demos, CI |
| **Production** | `docker-compose.prod.yml` (standalone) | Google Cloud SQL via Cloud SQL Auth Proxy sidecar | Real deployments |

The two stacks share the same backend/frontend images and code. **The only difference is the database wiring** — dev runs Postgres in a container; prod connects to a managed Cloud SQL instance through an Auth Proxy sidecar. Bring one stack down before starting another so they do not compete for container names and ports.

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

### Production stack (`docker-compose.prod.yml`)

The prod stack replaces the local `postgres` service with a `cloudsql-proxy` sidecar that fronts your Cloud SQL instance using IAM authentication. Backend startup runs `prisma migrate deploy` only — **no `db push`, no seeding**.

Prerequisites on the host:

1. A Cloud SQL for PostgreSQL instance you can reach (note its `<project>:<region>:<instance>` connection name).
2. A GCP service account with the `roles/cloudsql.client` role and a JSON key downloaded.
3. Docker + Docker Compose v2.

Setup:

```bash
# 1. Configure environment
cp .env.production.example .env.production
# Edit .env.production — set DATABASE_URL, INSTANCE_CONNECTION_NAME,
# SESSION_SECRET, CORS_ORIGIN.

# 2. Place the service-account key (the path is gitignored)
mkdir -p secrets
cp /path/to/your-gcp-sa.json secrets/gcp-sa.json

# 3. Build and start
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

To stop it:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

> **Security:** never commit `.env.production` or anything in `secrets/` — both are listed in `.gitignore`.

## Quick start — Local development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment variables

```bash
cp .env.development.example .env
# Edit .env — set DATABASE_URL and SESSION_SECRET
```

### 3. Set up the database

```bash
# Run migrations
pnpm run db:migrate

# Generate the Prisma client
pnpm run db:generate

# Seed with demo data
pnpm run db:seed
```

### 4. Start development servers

In separate terminals:

```bash
# Terminal 1 — backend (hot reload)
pnpm run dev:backend

# Terminal 2 — frontend (Vite HMR)
pnpm run dev:frontend
```

Frontend: **http://localhost:5173**  
Backend: **http://localhost:3001**

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection URL | — |
| `SESSION_SECRET` | Express session secret (keep long and random) | — |
| `PORT` | Backend port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `STORAGE_PATH` | Path for generated PDFs | `./storage` |

## Application workflows

### Login
- Passwordless: search an existing employee or create a new one
- Roles: `Pathologist`, `Technologist`

### Order Entry (`/order-entry`)
- Create a new case with patient, clinician, and specimens
- Auto-generates a case ID (`SU{YY}{NNNNNNN}`)
- Download a printable worksheet PDF immediately after creation

### Processing (`/processing`)
- Queue of registered cases without materials (default) or all non-signed-out
- Open a case to create blocks and slides
- All IDs generated by the backend
- Download a reference strips PDF for labelling

### Result (`/result`)
- Queue of cases that have materials but no signed-out report
- Open a case to enter a result (diagnosis, gross, comment)
- Sign out the report — generates a report PDF
- Reactivate a signed-out case to create an amendment/revision

### Query (`/query`)
- Search by Case ID or Patient ID
- Click any result to open the result page for that case

## Case ID format

```
SU{YY}{NNNNNNN}
  SU     — fixed prefix
  YY     — 2-digit year (e.g. 25 for 2025)
  NNNNNNN — 7-digit zero-padded sequence, resets each year

Example: SU250000001
```

Sequence generation is concurrency-safe via a dedicated `order_sequence_year` table updated inside a database transaction.

## Specimen, block, and slide ID formats

| Entity | Format | Example |
|---|---|---|
| Specimen | `{orderId}-{code}` | `SU250000001-A` |
| Block | `{orderId}-{specimenCode}{blockNumber}` | `SU250000001-A1` |
| Slide | `{blockId}-S{slideNumber}` | `SU250000001-A1-S1` |

Specimen codes use Excel-style progression: A → Z → AA → AZ → BA → ...

## Running tests

```bash
# All tests
pnpm test

# Backend unit + integration tests only
pnpm run test:backend

# Frontend component tests only
pnpm run test:frontend

# Playwright E2E (requires running app)
pnpm --filter @lis/frontend run test:e2e

# Typecheck all packages
pnpm run typecheck
```

## Database commands

```bash
pnpm run db:migrate        # Apply pending migrations (dev)
pnpm run db:generate       # Re-generate Prisma client after schema changes
pnpm run db:seed           # Seed the database
pnpm run db:studio         # Open Prisma Studio
pnpm run db:reset          # Reset and re-seed (destructive)
```

## PDF files

Generated PDFs are stored in `apps/backend/storage/`:

| Directory | Contents |
|---|---|
| `generated-pdfs/` | Worksheet PDFs, reference strip PDFs, report PDFs |
| `report-files/` | Reserved for future use |

PDF files are gitignored. In Docker, they are persisted via a named volume.

## Notes

- Authentication is **passwordless** and intended for prototype/demo use only
- Storage is filesystem-based; the `report_file` schema is forward-compatible with S3/blob storage
- Report sign-out is **immutable**: once signed, reports cannot be edited. Use Reactivate to amend
