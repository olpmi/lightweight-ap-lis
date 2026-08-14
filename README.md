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
    seed.ts            Synthetic demo seed (300 orders, deterministic)
  scripts/
    system-characteristics.ts   Repository counts (templates, catalog, data model)
    dataset-characteristics.ts  Synthetic-corpus composition, measured from the DB
    verification-report.ts      Aggregated test results and coverage
    benchmark.ts                Performance benchmark against a running stack
    deployment-profile.ts       Container memory/CPU at idle and under load
  docs/verification/   Generated verification and benchmark artifacts
  docker/              Dockerfiles + nginx config
  .github/workflows/   CI pipeline
  docker-compose.yml
```

## Verification artifacts

Figures describing this system are generated, not hand-maintained:

```bash
pnpm metrics:system        # template, catalog, and data-model counts
pnpm db:characterize       # synthetic-corpus composition (needs a seeded DB)
pnpm verify:report         # test results + coverage; --e2e adds Playwright
pnpm bench                 # performance benchmark (needs a running backend)
pnpm metrics:deployment    # container memory/CPU + storage (needs Docker)
```

Output lands in [docs/verification/](docs/verification/). See
[manuscript_verification_section.md](docs/verification/manuscript_verification_section.md)
for which manuscript table each artifact feeds, what the paper reports, and which
figures are deliberately not published.

The committed copies are produced by the **Verification Report** workflow
([.github/workflows/verification.yml](.github/workflows/verification.yml)), run manually:

```bash
gh workflow run "Verification Report" --ref <branch>
```

It seeds its own database, brings up the stack, runs all three suites once via
`pnpm verify:report --e2e`, and uploads `docs/verification/` as an artifact — so the
numbers name the run that produced them. Per-push CI does not regenerate them: it
ran the suites a second time against a database the E2E suite had already mutated,
which reported contention as test failures and published a table describing a
different execution than the one that gated the change.

## Deployment resource profile

Container memory and CPU — at idle and under load — plus storage per case. Needs
Docker Desktop (or a local engine); everything else it brings up itself.

```bash
pnpm metrics:deployment
```

```powershell
pnpm metrics:deployment
```

Flags: `--keep-up` leaves the stacks running, `--skip-load` gives an idle-only
profile, `--skip-replicated` skips the second topology, and `--samples=N`,
`--interval=MS`, `--settle=SECONDS` tune the idle windows.

Idle windows are polled; the load window is streamed from a single long-lived
`docker stats` process at roughly a reading per second. That asymmetry is
deliberate — each `docker stats --no-stream` call costs several seconds because
Docker needs two reads for a CPU delta, and polling at that cadence stepped over
the phase where headless Chromium is resident, reporting peak stack memory of
574 MB on one run and 391 MB on the next.

`--settle` is not a formality: on one host the same stack measured 157.7 MB after
5 s and 126.3 MB after 25 s, because PostgreSQL is still working through the seed.
The settle period is recorded in the artifact for that reason, a `CHECKPOINT` is
issued before each idle window so the flush is forced rather than waited for, and
the default is 90 s — 30 s proved too short on slower storage, where the same stack
read 98.7 MB against 42.7 MB elsewhere.

Because no settle period can be right for every machine, every window reports how
much stack memory moved between its first and last third — and the two kinds of
window are read differently.

An **idle** window should be stationary, so movement is a defect: past 2% the
artifact carries a **Not settled** callout, the console prints `[NOT SETTLED]`, and
the figure should be re-measured with a longer `--settle`.

A **load** window is non-stationary by design and is not flagged. Memory climbs
while the benchmark runs because headless Chromium retains memory across its render
iterations, so the peak reflects this workload at its configured iteration count
rather than a fixed property of the host — two runs on one machine differed by
roughly half. Treat it as the order of magnitude a render-heavy burst demands.

Both topologies are seeded to the same 300-case corpus before sampling. Without
that the replicated stack would hold reference data and no cases, since
`docker-compose.prod.yml` runs `prisma migrate deploy` only — and the comparison
would then attribute a data-volume difference to the hot standby.

Output is `docs/verification/deployment-profile-<stamp>.{md,json}`, paired with the
`benchmark-<stamp>` files from the same run. Files are timestamped rather than
fixed-name so profiles from different machines accumulate side by side.

**This one is not produced by any workflow, deliberately.** It measures a host, so a
shared CI runner would yield a footprint with no deployment meaning. Run it on a
machine you can name in a paper.

What it does, and why in that order:

1. Brings up an isolated stack — its own Compose project, own volumes, remapped
   ports (`55432`/`3101`/`5273`) — via
   [docker-compose.profile.yml](docker-compose.profile.yml). It starts from
   `down -v` so the corpus is always the deterministic 300-case seed, which is why
   it must not share a project with your dev stack. Yours is left untouched and can
   stay running.
2. Captures its own environment: Docker version and backend, kernel, cgroup
   version, the CPU/memory ceiling the engine sees, and `.wslconfig` — or the fact
   that it is absent, in which case WSL2 defaults to about 50% of host RAM.
3. Samples an **idle** window after a settling period.
4. Runs `pnpm bench` while sampling a **load** window, so peak memory is measured
   against a known workload rather than guessed.
5. Brings up the replicated topology
   ([docker-compose.profile-replicated.yml](docker-compose.profile-replicated.yml))
   for a second idle window. Only idle: replication is asynchronous
   (`wal_level = replica`, no `synchronous_standby_names`), so the standby changes
   resident memory and disk but not latency.

Memory totals are per-container cgroup working sets and **exclude** the overhead of
the VM the engine runs in, so treat them as a lower bound on what a host provides.

## Manuscript figures

Publication figures are captured from the running application against the
deterministic seed, then composed by script:

```bash
# with a seeded database, the backend running and the built frontend served:
GENERATE_MANUSCRIPT_FIGURES=1 pnpm figures:manuscript   # source panels
pnpm figures:compose                                    # composites, captions, README
```

PowerShell:

```powershell
$env:GENERATE_MANUSCRIPT_FIGURES = "1"; pnpm figures:manuscript
pnpm figures:compose
```

Figures 3 and 4 follow one synthetic case created through the API by
[figure-case.ts](apps/frontend/src/tests/e2e/manuscript/helpers/figure-case.ts) —
the seeded corpus has no immunohistochemistry order and no case combining
multiple specimens, an amendment and a patient summary. Each figure is written
twice from one shared layout: PNG for journal upload, and vector PDF for editing
in Illustrator or similar.

Output, per-panel metadata, captions and checksums land in
[docs/manuscript/figures/](docs/manuscript/figures/); see its README for the full
reproduction recipe and the synthetic case used.

The capture specs are opt-in (`GENERATE_MANUSCRIPT_FIGURES=1`) so they stay out of
the CI end-to-end run and do not inflate the verification test count;
`.github/workflows/manuscript-figures.yml` regenerates everything on demand.

## Prerequisites

- Node.js 22+
- pnpm 11+ (`corepack enable && corepack prepare pnpm@11 --activate`). The repo is a pnpm workspace (`pnpm-workspace.yaml`) and CI runs the pnpm-lock.yaml under `pnpm install --frozen-lockfile`.
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
3. Seed the database with 300 synthetic cases (deterministic; see `pnpm db:characterize`)
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

A fresh production database therefore contains **reference lookup data only — no patients, no referring clinicians, no staff accounts, and no cases**. Two independent guards keep it that way: `prisma/seed.ts` refuses to run when `NODE_ENV=production` (override with `ALLOW_PROD_SEED=1` for a deliberate staging reset), and the prod Compose command never invokes it.

Loading a real roster:

1. Create the first account through the login page's **New employee** flow. This is the one unauthenticated write endpoint, and it is open only while the employee table is empty — the account it creates is always an **Administrator**, whatever the request asks for. Once any account exists the flow disappears from the login page and the endpoint refuses.
2. Log in, then go to **Config → Data Import** to bulk-load patients, referring clinicians and staff from CSV. Example files are downloadable from that page and committed at [`apps/frontend/public/csv-templates/`](apps/frontend/public/csv-templates/).

Import behaviour worth knowing before you upload:

- Files are validated whole before anything is written. A single bad row rejects the entire file — nothing is partially imported.
- Dates must be `YYYY-MM-DD`. Ambiguous formats like `03/04/1990` are rejected rather than guessed at.
- Re-uploading the same file is a no-op: patients match on `patient_id`, referring clinicians on name, staff on `user_name`. Existing records are **skipped, never updated**, and an existing staff account's password is never reset. Patient rows with a blank `patient_id` always create a new record, so supply the column if you may re-run the import.
- Staff passwords are required in production, since an account with no password hash cannot log in. Delete the CSV once imported.

To confirm an import landed, open **Order Entry** — the patient and referring-clinician typeaheads list the first 20 records (alphabetical) as soon as the field is focused, before anything is typed.

> **Data Import is Administrator-only**, because importing the `staff` entity provisions login accounts. See [Roles and authorization](#roles-and-authorization).

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

## Roles and authorization

Three roles, seeded by the reference-data migrations and defined once in
[`packages/shared/src/constants/index.ts`](packages/shared/src/constants/index.ts):

| Capability | Pathologist | Technologist | Administrator |
|---|:--:|:--:|:--:|
| Accessioning, patients, referring clinicians, specimens, blocks, slides, H&E status, discards | ✓ | ✓ | — |
| Ancillary ordering and status transitions | ✓ | ✓ | — |
| Draft authorship, preliminary sign-out, final sign-out, amendment | ✓ | — | — |
| Setting a case `COMPLETED` / `CANCELLED` / `REACTIVATED` | ✓ | — | — |
| `/api/config/*` — templates, report layouts, ancillary catalog | — | — | ✓ |
| CSV roster import, account creation, role assignment | — | — | ✓ |
| All queues, case detail, worksheets, report PDFs | ✓ | ✓ | ✓ |

Reads stay open to every authenticated user — report rendering itself loads
templates — so only writes are role-gated.

Enforcement lives in `requireRole` and `requireCurrentRole`
([`auth.middleware.ts`](apps/backend/src/middleware/auth.middleware.ts)), applied
per route beside `requireAuth`. `requireCurrentRole` re-reads the role from the
database instead of trusting the copy captured at login, so revoking or changing
a role takes effect immediately rather than whenever the user's 8-hour session
expires; it guards the privileged acts — sign-out, amendment, roster import,
account and role changes. The interface hides controls a role cannot use, but
that is convenience: the API refuses regardless.

Two related rules close the escalation paths that would otherwise make the guards
decorative:

- **Account creation is first-run only** (above), and the first account is forced
  to Administrator. The same rule covers `POST /api/auth/login` with a
  `newEmployee` body, which creates and logs in atomically.
- **A report is signed out under the signing pathologist's own account.** The
  signatory arrives in the request body, so sign-out additionally requires it to
  match the session.

> **Upgrading an existing deployment:** production applies migrations but never
> the seed, so the Administrator role arrives with nobody holding it — and
> `PATCH /api/employees/:id/role` is itself Administrator-only. Promote one
> account by hand before deploying, or the configuration surface is unreachable:
>
> ```sql
> UPDATE employee SET employee_role_id =
>   (SELECT employee_role_id FROM employee_role WHERE role_name = 'Administrator')
> WHERE user_name = '<your-admin-username>';
> ```

`GET /api/employees/search` remains unauthenticated because the login page needs
it before a session exists; it returns only the name and username needed to
identify an account, not the role. It still discloses that a staff member exists,
which is an accepted trade-off of the account-picker login.

## Branch structure

| Branch | Purpose |
|---|---|
| `dev` | Integration branch — all development work lands here. CI runs on every push and pull request. |
| `main` | Release branch — always reflects a production-ready state. Updated only by merging `dev → main` after CI is green. |

**Never commit directly to `main`.** All changes go through `dev` first. This prevents `main`'s package.json and lockfile drifting out of sync, which breaks `pnpm install --frozen-lockfile` in CI for both branches.

**This is enforced server-side.** A repository ruleset protects both `dev` and `main`: changes must arrive by pull request, the CI checks below must pass, and force-pushes and branch deletion are blocked. Rulesets became available when the repository was made public — on a free personal account the API previously returned `403 Upgrade to GitHub Pro or make this repository public`.

| Rule | `dev` and `main` |
|---|---|
| Pull request required | Yes — direct pushes are rejected |
| Required approvals | 0 — the author may merge their own PR once CI is green |
| Required status checks | `Detect changes`, `Typecheck`, `Lint`, `Backend Tests`, `Frontend Tests`, `Prisma schema drift`, `Playwright E2E`, `Gitleaks scan`, `OSV scan` |
| Force-push | Blocked |
| Branch deletion | Blocked |

Jobs that the `Detect changes` path filter skips report a `skipped` conclusion, which GitHub counts as a pass — so a docs-only PR is not held up waiting for the backend suite. `CodeQL` is deliberately **not** a required check: it does not run on `pull_request`, so requiring it would leave every PR permanently unmergeable.

### Environment-driven behaviour

The backend and frontend **images are identical** in both stacks. Runtime and build-time environment variables switch behaviour between dev and prod:

| Variable | Dev value | Prod value | Effect |
|---|---|---|---|
| `NODE_ENV` | `development` | `production` | Enables bcrypt password verification in the backend |
| `VITE_PASSWORD_AUTH` | *(unset)* | `true` (build arg) | Shows the password field in the login UI |
| `DEMO_MODE` | `true` | *(unset → off)* | Marks the UI and every generated PDF as synthetic demo output |

In dev, login is passwordless (any registered employee username works). In prod, `NODE_ENV=production` enforces bcrypt checks and the login UI exposes the password field via `VITE_PASSWORD_AUTH=true`.

### Demo-data marking

The dev stack seeds a corpus of fabricated patients, referring clinicians and staff. Nothing about a record on screen or in an exported PDF otherwise says it is not real, which matters as soon as a screenshot or a report leaves the machine that produced it. Two layers address that:

- **The data says so.** Seeded records use unmistakably synthetic names (`ZZZTEST-PATIENT`, `ZZZTEST-REFERRER`, `ZZZTEST-STAFF`) and patient identifiers in a separate `DEMO#######` namespace, outside the `P#######` range the runtime allocator uses. The `ZZZTEST-` prefix also sorts them to the end of any alphabetical list. Only display names changed — `userName` values (`asmith`, `rjones`, …) are unchanged, because the E2E suites and manuscript figure capture log in with them.
- **The app says so.** When `DEMO_MODE` is on, a red *DEMO DATA* chip sits in the app bar, the login page carries a notice, and every generated PDF gets a diagonal watermark. The watermark is applied to rendered output rather than to the report template, so a customized report layout cannot drop it.

`DEMO_MODE` defaults to on whenever `NODE_ENV != production`, so a stack is never mistaken for a real one by omission. Set `DEMO_MODE=false` to force it off, or `DEMO_MODE=true` to mark a production-mode training instance.

### Promotion workflow

```
feature branch → dev (CI: lint, unit tests, e2e, Prisma drift check)
                      ↓  all green
                    main  (production deploy)
```

1. Work on a feature branch — `dev` no longer accepts direct pushes.
2. Open a PR targeting `dev`; CI must pass.
3. When ready to release, open a PR `dev → main`; merge once CI is green. **Use a merge commit** (`gh pr merge <n> --merge`) — squashing rewrites the promoted commits into a new SHA and diverges `main` from `dev`, forcing a reverse merge back into `dev`.
4. Deploy from `main` using `docker-compose.prod.yml`.

## License

Released under the [MIT License](LICENSE).

This is a research prototype, not a cleared or certified medical device. The seeded corpus is entirely synthetic — no real patient data is present in this repository or its history. Anyone adapting it for clinical use is responsible for the applicable regulatory, privacy and validation requirements in their jurisdiction.

