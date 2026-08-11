# Methods, Implementation, and Technical Details

This document summarizes the implementation details of the lightweight AP LIS prototype that are likely to be needed when drafting the methods, system architecture, implementation, validation, and technical-details sections of an academic manuscript. It is based on the current repository state as of 2026-06-09.

## 1. System Summary

The system is a lightweight anatomic pathology laboratory information system (AP LIS) prototype implemented as a TypeScript monorepo. It supports case accessioning, specimen registration, material tracking, histology and ancillary workflows, report drafting and sign-out, PDF generation, query/search, and multilingual user interfaces.

The implementation is intended as a functional pathology informatics prototype rather than as a certified production LIS or regulated medical device. Its design favors traceability of case materials, explicit workflow states, reproducible local deployment, and testable service-layer logic.

## 2. Architecture Overview

### 2.1 High-level architecture

| Layer | Implementation |
| --- | --- |
| Frontend | React 18 single-page application built with Vite and TypeScript |
| UI framework | MUI v5 |
| Client state/data fetching | TanStack Query with Axios |
| Backend | Node.js + Express + TypeScript |
| Validation | Shared Zod schemas in a workspace package |
| ORM and migrations | Prisma |
| Database | PostgreSQL 16 |
| Reporting/PDF | HTML-template-to-PDF rendering for configurable report layouts, plus `pdf-lib` for worksheet/reference-strip/fallback PDF generation |
| Authentication | Password-based session authentication using `express-session` and `bcryptjs` |
| Logging | `pino` + `pino-http` |
| Testing | Vitest, React Testing Library, Supertest, Playwright |
| Local orchestration | Docker Compose |
| CI | GitHub Actions |

### 2.2 Monorepo layout

| Path | Role |
| --- | --- |
| `apps/backend` | Express API, services, PDF generation, middleware, tests |
| `apps/frontend` | React SPA, pages, components, E2E tests |
| `packages/shared` | Shared types, validation schemas, helper utilities, workflow state helpers |
| `prisma` | Database schema, migrations, seed script |
| `docker` | Dockerfiles and nginx configuration |
| `.github/workflows` | Continuous integration pipeline |

### 2.3 Runtime and toolchain versions

Representative versions from the current repository include the following:

- Node.js: `>=20.0.0`
- Prisma / Prisma Client: `5.13.0`
- Express: `4.19.2`
- PostgreSQL container image: `postgres:16` (Debian-based)
- wal-g: `v3.0.8` (glibc build, optional GCS backup)
- bcryptjs: `2.4.3`
- React: `18.2.0`
- Vite: `5.2.6`
- MUI: `5.15.15`
- TanStack Query: `5.28.0`
- Axios: `1.6.8`
- Vitest: `1.6.0` in backend, `1.4.0` in frontend
- Playwright: `1.43.1`
- `pdf-lib`: `1.17.1`
- `puppeteer-core`: `25.0.4`
- `express-session`: `1.18.0`
- `express-rate-limit`: `7.5.1`
- `helmet`: `7.1.0`

## 3. Backend Design

### 3.1 API style

The backend is an Express application organized around route modules and service classes. Routes are intentionally thin and delegate business logic to services such as:

- `AuthService`
- `EmployeeService`
- `PatientService`
- `DoctorService`
- `OrderService`
- `SpecimenService`
- `BlockService`
- `SlideService`
- `ReportService`
- `PdfService`
- `QueueService`

The API is JSON-based and mounted under `/api`. BigInt values are serialized to strings before JSON responses are emitted so that browser clients can consume them safely.

### 3.2 Middleware and request handling

The backend applies the following middleware behavior:

- `helmet` for baseline HTTP hardening
- CORS with credential support and an environment-configurable allowed origin
- gzip compression via `compression`
- JSON and URL-encoded body parsing, both capped at 2 MB
- structured HTTP request logging via `pino-http`
- session handling via `express-session`
- `requireAuth` protection on authenticated routes
- request-body validation via shared Zod schemas

The application also sets `trust proxy = 1` so client IP addresses can be resolved correctly behind nginx or containerized reverse-proxy layers.

### 3.3 Health and operations endpoints

The backend exposes an unauthenticated `GET /health` endpoint returning `{ "status": "ok" }`. This is used by Docker health checks and by the Playwright global setup in automated tests.

## 4. Frontend Design

### 4.1 Client application structure

The frontend is a protected single-page application using React Router and an authenticated shell layout. Primary pages currently include:

- Login
- Dashboard
- Order Entry
- Processing Queue
- Processing Case
- Result Queue
- Result Case
- Histology Queue
- Histology Case
- Ancillary Queue
- Query
- Configuration pages for templates, report layouts, and ancillary configuration

### 4.2 Client-side state and networking

Frontend API calls use an Axios client configured with:

- relative base URL `/api`
- `withCredentials: true` so browser session cookies are sent on each request
- automatic redirect to `/login` on HTTP 401
- global conflict broadcasting on HTTP 409, allowing the UI to surface stale-edit and concurrent-modification errors consistently

TanStack Query is used for cached server-state management. The root query client currently uses a default query retry count of 1 and a default stale time of 30 seconds.

### 4.3 UI framework

The UI is implemented with MUI v5 and follows a desktop-oriented internal-application pattern using forms, tables, dialogs, chips, and queue pages rather than consumer-style workflows.

## 5. Data Model and Persistence

### 5.1 Core relational entities

The Prisma schema defines the following central entities:

- `Doctor`
- `Patient`
- `EmployeeRole`
- `Employee`
- `BodySite`
- `SpecimenType`
- `ReportTemplate`
- `OrderSequenceYear`
- `Order`
- `Specimen`
- `Block`
- `Slide`
- `Report`
- `ReportFile`
- `CustomTemplate`
- `CustomTemplateTranslation`
- `ReportLayout`
- `AncillaryOrderable`
- `AncillaryPanel`
- `AncillaryPanelItem`
- `AncillaryOrder`

### 5.2 Core pathology relationships

The data model is designed around the hierarchy:

`Patient -> Order -> Specimen -> Block -> Slide`

with reports and ancillary orders attached to an order, and report files attached to individual report versions.

Important relationships include:

- one patient to many orders
- one doctor to many orders
- one order to many specimens
- one specimen to many blocks
- one block to many slides
- one order to many reports
- one report to many report files
- one order to many ancillary orders

### 5.3 Workflow and configuration entities

In addition to core specimen-tracking tables, the schema includes:

- `ReportLayout` for HTML report layouts by report type
- `CustomTemplate` and `CustomTemplateTranslation` for structured/synoptic template assets and translations
- ancillary catalog tables (`AncillaryOrderable`, `AncillaryPanel`, `AncillaryPanelItem`) that define orderable tests and grouped panels

### 5.4 Key uniqueness and indexing rules

Several database constraints directly support traceability and concurrency:

- `OrderSequenceYear` primary key on `(yearTwoDigit, prefix)` for accession numbering
- `Specimen` unique key on `(orderId, specimenCode)`
- `Block` unique key on `(specimenId, blockNumber)`
- `Slide` unique key on `(blockId, slideNumber)`
- `Report` unique key on `(orderId, versionNumber)`
- composite `Report` index on `(orderId, isFinal, signedOutDatetime)` to support queue filtering for signed-out cases

## 6. Identifier Generation and Material Traceability

### 6.1 Accession/case identifiers

Case identifiers are generated on the backend only. The current implementation uses:

- prefix `SU` for non-cytology cases
- prefix `CN` for cytology cases
- 2-digit year component
- 7-digit zero-padded sequence number

Examples:

- `SU260000001`
- `CN260000001`

The sequence is generated transactionally using the `OrderSequenceYear` table rather than by a naive `max + 1` query. This is the repository's primary concurrency-control mechanism for accession numbering.

### 6.2 Specimen identifiers

Specimen codes are generated using Excel-style alphabetic progression:

- `A` through `Z`
- then `AA`, `AB`, and so on

Specimen identifiers follow the format:

- `{orderId}-{specimenCode}`

Example:

- `SU260000001-A`

### 6.3 Block identifiers

Block identifiers follow the format:

- `{orderId}-{specimenCode}{blockNumber}`

Example:

- `SU260000001-A1`

### 6.4 Slide identifiers

Slide identifiers follow the format:

- `{blockId}-S{slideNumber}`

Example:

- `SU260000001-A1-S1`

### 6.5 Patient and user identifiers

The current prototype permits reuse of existing patient and employee records. When a new patient is created during order entry, the patient identifier is currently generated in the application layer as `P` plus the last 7 digits of `Date.now()`. This is acceptable for a prototype description but should be disclosed as a prototype-specific implementation choice rather than a production-grade master-patient-index strategy.

## 7. Authentication, Session Management, and Security

### 7.1 Authentication model

The system uses password-based session authentication. A user may either:

- search for an existing employee by username, first name, or last name, select the account, and enter their password, or
- create a new employee record (providing first name, last name, username, role, password, and default language) and immediately log in

Passwords are hashed with bcrypt at a cost factor of 12 using the `bcryptjs` library. The `password_hash` column on the `employee` table is nullable to allow existing accounts to be migrated gracefully; a login attempt for an account with no hash set returns a 401 with a message directing the user to an administrator.

The session stores the authenticated employee's ID, username, role name, and default language.

### 7.2 Employee roles and authorization

Employees are linked to an `EmployeeRole`. Three roles are inserted by the
reference-data migrations and declared once in `packages/shared/src/constants/index.ts`:

- `Pathologist`
- `Technologist`
- `Administrator`

Role names are the authorization subject: guards compare against these exact
strings, so the seeded rows and the shared constants must agree.

Authorization is enforced server-side, per route, by two middlewares in
`apps/backend/src/middleware/auth.middleware.ts` placed immediately after
`requireAuth`:

- `requireRole(...allowed)` compares the role captured in the session at login.
- `requireCurrentRole(...allowed)` re-reads the role from the database, so a role
  that is changed or revoked applies to the live session rather than at next
  login. It guards the privileged operations: diagnostic drafting, preliminary and
  final sign-out, amendment, CSV roster import, account creation and role
  assignment.

Clinically privileged acts — draft authorship, preliminary and final sign-out,
amendment, and setting a case to a terminal status — require `Pathologist`. The
configuration surface (`/api/config/*`), which includes report templates, report
layouts, the ancillary catalog and CSV roster import, requires `Administrator`;
roster import is placed there rather than with clinical work because importing the
`staff` entity provisions login accounts. Routine technical work — accessioning,
specimen, block and slide handling, H&E status transitions and ancillary ordering
— is available to `Pathologist` and `Technologist` alike. Reads remain open to any
authenticated user, since report rendering itself loads templates.

Two supporting rules close escalation paths that would otherwise leave the guards
without effect. First, unauthenticated account creation is permitted only while
the employee table is empty, and that first account is forced to `Administrator`
regardless of the role requested; the same restriction applies to the
`newEmployee` variant of `POST /api/auth/login`, which creates an account and
establishes a session atomically. Second, because the signing pathologist is named
in the sign-out request body rather than taken from the session, sign-out
additionally requires the two to match, so a report cannot be signed out under
another pathologist's name.

Authorization is covered by unit tests over both middlewares and by an
integration suite (`apps/backend/src/tests/integration/authorization.test.ts`)
that exercises the matrix over HTTP with one authenticated actor per role,
including refusal of a wrong-role sign-out, of configuration writes by clinical
staff, and of anonymous account creation, and including that a role revoked
mid-session takes effect on the next request.

The interface hides controls a role cannot use — the configuration entry is absent
from the navigation for non-administrators, and sign-out, preliminary sign-out and
amendment are disabled for non-pathologists — but this is convenience rather than
a control: the API refuses regardless of what the client renders.

### 7.3 Session cookie behavior

Session cookies are configured as follows:

- `httpOnly: true`
- `secure`: controlled by the `COOKIE_SECURE` environment variable (set to `true` only when the application is served over HTTPS; default `false` to prevent browsers from silently dropping cookies on plain-HTTP deployments)
- `sameSite: strict` in production and `lax` in development
- maximum age: 8 hours

### 7.4 Login throttling and basic hardening

The login endpoint is rate-limited in production to 20 attempts per IP address per 15-minute window. Additional hardening includes CORS restrictions, body-size limits, security headers, and proxy-aware request handling.

## 8. Core Workflow Implementation

### 8.1 Login workflow

The login page supports two modes:

- search for an existing employee, then enter a password
- create a new employee with first name, last name, username, role, password (minimum 8 characters with confirmation), and default language

Successful login establishes a session and redirects the user into the authenticated application shell.

### 8.2 Order-entry workflow

Order entry supports both existing and newly created patients and clinicians. The order-creation payload includes:

- case type
- patient identifiers or new-patient demographics
- doctor identifier or new-doctor name
- registered date
- clinical history
- one or more specimens, each carrying body-site, specimen-type, and optional cold-ischemic-time data

Order creation is performed transactionally. The backend creates the order record, generates the accession identifier, derives sequential specimen codes, and inserts the specimen rows.

After successful order creation, the user interface shows the generated case identifier prominently and exposes a downloadable worksheet PDF.

### 8.3 Cytology-specific material creation

The current frontend contains additional cytology-specific inputs for smear count, ThinPrep count, and cell-block count. After a cytology order is created, the frontend immediately creates corresponding blocks and/or slides by calling the backend material APIs. This is an implementation detail worth documenting if the manuscript discusses cytology support.

### 8.4 Processing and histology workflows

The implementation currently contains both a general processing queue and a dedicated histology queue.

The general processing queue excludes cases that already have a final signed-out report and, in the current backend implementation, also excludes cases that already have a non-empty gross description.

The dedicated histology queue filters cases by block H&E status. Supported H&E statuses are:

- `MICROTOMY`
- `SLIDE_STAIN`
- `DISTRIBUTED`
- `CANCELLED`

For terminal statuses (`DISTRIBUTED` and `CANCELLED`), the API accepts an optional recency filter so old completed items do not accumulate indefinitely in the default worklist view.

The case-level histology workflow allows users to:

- view specimens and existing materials
- create additional blocks for a specimen
- create additional slides for a block
- update H&E status
- discard blocks or slides
- generate a reference-strips PDF for the case

### 8.5 Block creation behavior

Block creation is implemented in a serializable Prisma transaction. For each new block, the service:

- determines the next block number for the specimen
- generates the block ID from the order ID, specimen code, and next block number
- inserts the block row
- automatically creates an H&E ancillary order if an active H&E orderable is present in the ancillary catalog

### 8.6 Slide creation behavior

Slide creation is also implemented in a serializable transaction. For each new slide, the service:

- determines the next slide number on the block
- generates the slide ID from block ID and next slide number
- inserts the slide row
- defaults the slide type to `H&E` unless another slide type is specified

If the last non-discarded slide on a block is discarded while the block is still at `SLIDE_STAIN`, the block status is reverted to `MICROTOMY`.

### 8.7 Ancillary workflow

Ancillary tests are modeled as explicit state machines shared between backend and frontend logic. The current state model includes two pipelines:

- slide pipeline: `PULL_BLOCK -> MICROTOMY -> SLIDE_STAIN -> DISTRIBUTED`
- material pipeline: `PULL_MATERIAL -> MATERIAL_SENT -> MATERIAL_RETURNED`

`CANCELLED` is reachable from any non-terminal state. Terminal states are:

- `DISTRIBUTED`
- `MATERIAL_RETURNED`
- `CANCELLED`

Ancillary tests can be placed as individual orderables or grouped panels.

### 8.8 Result-queue workflow

The result queue includes cases meeting both of the following conditions:

- at least one non-discarded block has H&E status `DISTRIBUTED`, or at least one ancillary order has status `DISTRIBUTED`
- no final signed-out report exists for the case

This queue design ties diagnostic work eligibility to actual material availability rather than merely to case registration.

### 8.9 Report drafting and sign-out

Reports are versioned per order. The service layer supports:

- draft creation or update
- preliminary sign-out
- final sign-out
- reactivation/amendment workflows
- version history retrieval

Draft creation uses the following logic:

- if an editable draft already exists, update it
- otherwise create a new draft with `versionNumber = latest + 1`

Final sign-out requires all of the following:

- the report exists
- the report is not already final
- the case has at least one block
- every non-discarded block has at least one non-discarded slide
- every non-discarded block has H&E status `DISTRIBUTED`

Successful final sign-out:

- updates the report content
- stores the signing pathologist employee ID
- sets `signedOutDatetime`
- marks the report as final
- updates the order `completedDate`
- generates or attempts to generate a report PDF
- stores report-file metadata in `ReportFile`

### 8.10 Preliminary sign-out behavior

Preliminary sign-out freezes the current draft as a preliminary report and, within the same serializable transaction, creates the next editable draft version. This allows the case to remain active while preserving a timestamped preliminary interpretation.

### 8.11 Reactivation/amendment workflow

Reactivation does not overwrite prior finalized reports. Instead, the service:

- finds the latest final report
- marks the order as reactivated
- stores `reactivatedFromReportId`
- clears the order `completedDate`
- creates a new draft report version that supersedes the prior final report

The reactivated draft can carry a reactivation type and reason, supporting amendment/addendum-style workflows.

### 8.12 Query workflow

The query API supports searching by order ID and patient ID. Query responses derive an `isSignedOut` flag from the presence of a final signed-out report.

## 9. Report Rendering, PDF Generation, and File Storage

### 9.1 PDF types currently generated

The current implementation supports generation of:

- worksheet PDFs at case creation
- reference-strips PDFs for case materials
- final report PDFs
- preliminary report PDFs
- patient-summary PDFs for supported structured reports
- draft preview PDFs that are rendered inline and not persisted as report records

### 9.2 Dual rendering approach

Two PDF-generation approaches are used in the codebase:

- `pdf-lib` for worksheet PDFs, reference-strip PDFs, and fallback report generation
- configurable HTML-template-based rendering for report layouts, rendered to PDF via a Puppeteer-based backend service

`ReportLayout` rows are stored in the database and keyed by report type. When an active layout exists, final and preliminary reports use that layout. If no active layout exists, the backend falls back to the programmatic `pdf-lib` implementation.

### 9.3 Draft-preview behavior

Draft preview does not write a report version to the database. Instead, it renders an inline PDF using the active preliminary layout and current unsaved form content so the preview matches the configured report-layout system.

### 9.4 File persistence model

Generated report metadata are stored in the `ReportFile` table, including:

- report ID
- file type
- file name
- MIME type
- filesystem storage path
- creation timestamp

The actual PDF bytes are stored on the backend filesystem. In Docker deployments, this location is backed by a named volume mounted at the backend storage directory. This is an important manuscript detail because the current prototype uses filesystem-backed document persistence rather than object storage or PACS/VNA integration.

## 10. Concurrency Control, Validation, and Error Handling

### 10.1 Serializable database transactions

Several write-critical workflows use Prisma transactions with serializable isolation, including:

- block creation
- slide creation
- draft creation/versioning
- final sign-out
- preliminary sign-out
- case reactivation

This design reduces race conditions around sequence generation, version numbering, and concurrent edits.

### 10.2 Optimistic locking for report edits

Report draft update and sign-out APIs support an `expectedUpdatedAt` value. When provided, the backend includes the current report timestamp in the update condition. If another user modifies the draft first, the operation fails with a 409 conflict and a `DRAFT_STALE` error code rather than silently overwriting the other user's work.

### 10.2a Pessimistic edit lock

Separately from the optimistic guards, a case carries a lease-based edit lock (`OrderLockService`, 5-minute lease with a 60-second client heartbeat). The result and processing pages acquire it on mount and release it on unmount; other users opening the same case see a read-only banner naming the holder.

The lock is enforced server-side, not only in the UI: `assertHolder` runs inside the transactions of draft creation, sign-out, preliminary sign-out, and amendment, rejecting a write from anyone other than the current holder with 409 `LOCKED`. It deliberately permits the write when no lock is held or the lease has expired, so a client that never acquires a lock still works and falls back to the optimistic protection alone.

### 10.3 Conflict signaling to the frontend

The frontend Axios layer emits a global browser event on HTTP 409 responses. A global conflict-toast component listens for these events and can refresh query data so the UI converges quickly after optimistic-lock or concurrent-update failures.

### 10.4 Input validation

The application uses shared Zod schemas for request validation across login, draft creation, sign-out, reactivation, and related workflows. This keeps API-level validation logic aligned between frontend and backend TypeScript code.

### 10.5 Workflow guards

Important server-side guards include:

- rejecting final sign-out when blocks or slides are missing
- rejecting final sign-out when H&E distribution is incomplete
- rejecting invalid ancillary status transitions
- rejecting duplicate usernames during employee creation
- rejecting duplicate version/block/slide sequences via database uniqueness constraints

## 11. Internationalization and Multilingual Support

### 11.1 Supported UI languages

The current UI supports the following language codes:

- `en` — English (left-to-right)
- `fr` — French (left-to-right)
- `sw` — Swahili (left-to-right)
- `pt` — Portuguese (left-to-right)
- `ar` — Arabic (**right-to-left**)
- `ur` — Urdu (**right-to-left**)

Six languages in total. The canonical list is `APP_LANGUAGE_CODES` in `packages/shared/src/templates/index.ts`; the `AppLanguage` enum in `prisma/schema.prisma` mirrors it. Portuguese was added in migration `20260619000000_add_pt_app_language`.

Language coverage and text direction are verified by `apps/frontend/src/tests/components/LanguageProvider.test.tsx`, which iterates `APP_LANGUAGE_CODES` rather than a hand-maintained list, and by the `Interface languages` block in `apps/frontend/src/tests/e2e/workflows.spec.ts`, which switches all six in a real browser and asserts `document.documentElement.dir`.

Note that `apps/frontend/src/tests/e2e/demo-lifecycle.spec.ts` covers five languages, not six: it carries its own narration and PDF-label tables, for which no Portuguese translations have been authored. It is a demo recorder, not a verification test.

### 11.2 Implementation model

Internationalization is implemented through a custom React `LanguageProvider` rather than a third-party i18n framework. The provider:

- stores the selected language in `localStorage` under `ap_lis_lang`
- exposes translation helpers for UI strings and controlled vocabularies
- updates `document.documentElement.lang`
- updates `document.documentElement.dir` for left-to-right or right-to-left layout behavior

### 11.3 Translation helpers

The language context exposes translation helpers not only for generic UI labels but also for data-model values that remain stored in English in the database, including:

- body-site names
- organ/site labels
- specimen types
- slide types
- case types
- sex labels
- employee role names

This allows storage-level stability while keeping the UI multilingual.

### 11.4 Typography and script support

The frontend loads script-appropriate fonts:

- Roboto for default Latin-script presentation
- Noto Naskh Arabic for Arabic
- Noto Nastaliq Urdu for Urdu

The active language updates the CSS custom property used for the application's font family.

### 11.5 Structured-report and patient-summary language handling

The backend can render patient-summary PDFs from supported structured reporting payloads in the requesting language or, when no explicit query parameter is supplied, in the authenticated employee's default language.

## 12. Testing, Quality Assurance, and CI

### 12.1 Test layers

The repository uses multiple automated test layers:

- backend unit tests with Vitest
- backend integration tests with Vitest + Supertest + PostgreSQL
- frontend component tests with Vitest + React Testing Library
- end-to-end browser tests with Playwright

### 12.2 Continuous integration

The GitHub Actions pipeline performs:

- path-based change detection
- backend and frontend type checking
- backend and frontend linting
- backend tests against a PostgreSQL service container
- frontend tests with coverage
- Prisma schema-drift detection using migration diffs
- Playwright end-to-end tests against built backend and frontend services

The E2E workflow applies migrations, seeds the test database, builds both applications, serves the backend and the built frontend, waits for `/health` and the web UI to become reachable, installs Chromium, and then executes Playwright.

### 12.3 Coverage and failure artifacts

The CI pipeline uploads backend and frontend coverage artifacts. For E2E failures, trace/video artifacts are also retained for debugging.

### 12.4 Measured results

Do not quote test counts from prose. Regenerate them:

```bash
pnpm verify:report          # Vitest suites
pnpm verify:report --e2e    # additionally run Playwright against a running stack
```

The published copies come from the manual **Verification Report** workflow
(`.github/workflows/verification.yml`), which seeds its own database, starts the stack
and runs the `--e2e` form once, so the report records the CI run that produced it.
Per-push CI gates only; it no longer regenerates these files.

This writes `docs/verification/verification-report.{md,json}` with per-suite files, cases, passed, failed, skipped, setup errors, and coverage. At commit `d83f39b` the suite comprised 154 cases across 26 files: 147 passed, 0 failed, 7 skipped. Backend statement coverage was 61.8%, frontend 40.8%.

The skipped count matters and is reported deliberately. Six skips are opt-in Playwright specs (`RUN_DEMO`, `RUN_I18N_AUDIT`) that record demos and audit translations rather than verify behaviour. One is a report render gated on a launchable Chromium, which is present only in the backend container image.

Two caveats worth knowing before citing numbers:

- Backend integration suites are wrapped in `describe.skipIf(!hasDb)`. The guard reads `process.env.DATABASE_URL`, which Prisma populates from the repo-root `.env` on import, so on a developer machine with an `.env` the suites attempt to run rather than skip and fail against whatever database that URL points at. Set `DATABASE_URL`/`SESSION_SECRET` explicitly to the intended database.
- Vitest's JSON reporter counts tests inside a file whose `beforeAll` threw as *passed* while reporting `numFailedTests: 0`. `scripts/verification-report.ts` therefore derives counts from the per-assertion records and reports such files separately as setup errors. Reading the reporter's top-level aggregates would publish a clean sheet for a run in which whole suites never executed.

### 12.5 Test-file parallelism

`apps/backend/vitest.config.ts` sets `fileParallelism: false`. The integration suites share one PostgreSQL instance and contend on shared fixtures (the `pathologist` role, the `Test Site` body site) and on the per-prefix accession-number sequence row. With files running in parallel, roughly one run in two failed in `beforeAll`. Serialising makes the suite deterministic at a cost of a few seconds.

## 12A. Performance Benchmarking

`scripts/benchmark.ts` (`pnpm bench`) drives a running backend over HTTP and measures concurrent authenticated sessions, case creation, query latency, the full accessioning-to-sign-out lifecycle, PDF generation, and database growth. It records host CPU, core count, memory, PostgreSQL version, Node version, and commit hash alongside the timings, and writes `docs/verification/benchmark-<timestamp>.{md,json}`.

Run it on a documented fixed host rather than in CI — shared runners are too noisy for publishable timings — and against the containerised backend, which is the configuration the deployment section describes.

These are loaded measurements and are distinct from the idle memory footprint reported elsewhere, which describes a stack at rest.

## 13. Reproducibility and Seed Data

### 13.1 Seed strategy

The repository includes a Prisma seed script that creates deterministic synthetic data using a seeded pseudo-random generator. The seed script is explicitly guarded against accidental production execution unless `ALLOW_PROD_SEED=1` is set.

### 13.2 Synthetic dataset characteristics

The seed script populates:

- body-site lookup values
- specimen-type lookup values
- report-template examples
- structured cytology examples
- synthetic case/order data

The seed creates **300** synthetic cases (`ORDER_COUNT` in `prisma/seed.ts`), stratified across the workflow so every queue is populated, then deterministically shuffled so accession order does not encode workflow stage.

Do not quote corpus figures from prose. Regenerate them against a seeded database:

```bash
pnpm db:reset && pnpm db:seed && pnpm db:characterize
```

This writes `docs/verification/dataset-characteristics.{md,json}`, measuring the realized composition rather than restating the seed's constants. At commit `d83f39b`:

| Measure | n |
| --- | ---: |
| Cases | 300 |
| Surgical pathology / cytology | 190 / 110 |
| Accessioned, specimens only | 20 |
| Blocks created, no slides | 60 |
| Blocks and slides, awaiting sign-out | 60 |
| Signed out | 150 |
| Amended after sign-out | 10 |
| Patients / specimens / blocks / slides | 50 / 595 / 1078 / 1809 |
| Reports (all versions) | 260 |

Because the generator is seeded, the corpus is byte-reproducible: two independent reseeds were confirmed to produce identical characterization JSON.

Three properties of the corpus should be disclosed rather than glossed:

- Body sites are drawn from the full anatomic lookup independently of case type, so some cytology cases carry anatomically implausible sites.
- Every ancillary order in the corpus is a routine H&E order; no IHC, special-stain, molecular, or send-out orders are seeded. Those pathways are covered by automated tests, not by seeded data.
- The corpus contains no preliminary reports and no addenda.

### 13.3 Manuscript implication

If the manuscript reports experiments performed on seeded/demo data rather than clinical data, that distinction should be stated explicitly. If clinical or retrospective data were used outside the seed script, those study-specific data-governance details need to be added separately by the authors.

## 14. Deployment Model

### 14.1 Local development deployment

The default Docker Compose stack uses:

- PostgreSQL 16 in a container
- the backend service on port `3001`
- the frontend served on port `5173`
- automatic execution of `prisma migrate deploy`
- automatic execution of the seed script in development

An additional `docker-compose.dev.yml` overlay replaces the built frontend container with a Vite development server and bind-mounts the workspace for live reload.

### 14.2 Production deployment

The production compose stack (`docker-compose.prod.yml`) runs two local PostgreSQL 16 containers with streaming physical (WAL-based) replication:

- `postgres_primary` — writable primary; backend writes here via `DATABASE_URL`
- `postgres_standby` — hot standby; accepts read-only queries and can optionally be targeted via `DATABASE_URL_REPLICA`

The standby is cloned from the primary on first start using `pg_basebackup -R -Xs`, which writes `standby.signal` and `primary_conninfo` so that PostgreSQL enters streaming-replication recovery mode automatically.

WAL archiving is supported via `archive_command` calling a wrapper script that routes to either:
- Google Cloud Storage (GCS) using wal-g v3.0.8, when `WALG_GCS_PREFIX` is set
- a local `/wal-archive` Docker volume as a fallback, when GCS is not configured

An optional `backup_cron` service (started with `--profile backup`) runs a scheduled base backup using `wal-g backup-push`, retaining the last 7 full backups.

Backend startup runs `prisma migrate deploy` only — no seeding. All static reference/lookup data (employee roles, specimen types, body sites, ancillary orderables, ancillary panels and panel items) is inserted by a dedicated idempotent data migration (`20260609000000_seed_reference_data`) that uses `ON CONFLICT DO NOTHING`, so it is safe to apply repeatedly.

The `COOKIE_SECURE` environment variable controls the session-cookie `Secure` flag and must be set to `true` only when the application is served over HTTPS.

### 14.3 Environment configuration

Key environment variables include at least:

- `DATABASE_URL`
- `DATABASE_URL_REPLICA` (optional read-replica URL)
- `SESSION_SECRET`
- `COOKIE_SECURE`
- `PORT`
- `NODE_ENV`
- `CORS_ORIGIN`
- `STORAGE_PATH`

Production-only variables:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `REPLICATION_PASSWORD`
- `WALG_GCS_PREFIX`, `WALG_COMPRESSION_METHOD`, `GOOGLE_APPLICATION_CREDENTIALS`

## 15. Observability and Operational Behavior

The backend uses `pino` and `pino-http` for structured logging. Requests returning HTTP 500 or higher are logged at error level, while lower-severity requests are logged at debug level.

The application includes an explicit health endpoint and logs PDF-generation failures after sign-out as warnings rather than rolling back the already-committed sign-out transaction. This design prioritizes clinical workflow continuity while still preserving a trail for audit and recovery.

## 16. Important Prototype Limitations to Disclose in a Manuscript

The following points should be disclosed or at least considered when converting this material into a paper:

- The system is a lightweight prototype and not a validated commercial LIS.
- Authentication uses password-based session login (bcrypt-hashed passwords) rather than enterprise identity management (e.g. SSO, LDAP, OAuth2).
- Files are stored on a local/container filesystem rather than in object storage, PACS, or enterprise document management.
- Patient identifiers are allocated from the `patient_sequence` counter. Deployments that migrated from the earlier timestamp-derived scheme retain identifiers generated under it; the migration starts the counter above them so the two never collide.
- A reproducible performance benchmark now exists (`pnpm bench`, §12A), covering concurrent sessions, case creation, query latency, PDF generation, and database growth. It is not a load test: it characterises latency at modest concurrency on a single host, and says nothing about sustained multi-user throughput or long-run stability.
- Report PDF generation dominates sign-out latency (~425 ms of a ~500 ms sign-out). Errors during PDF generation are caught so they cannot block sign-out, which means a rendering fault is silent: the case signs out, reports success, and no PDF is produced. The failure mode is worth monitoring in deployment even though the defect that exposed it is fixed (§16A).
- Queue semantics in older prose documents may differ from current code, so manuscript text should follow the implemented behavior described here.

## 16A. Defects Found During Verification and Since Fixed

Building the verification artifacts surfaced four defects that the test suite as it stood could not see. All are fixed; each is recorded here because the fix changes what the manuscript can claim, and because the failure modes are worth carrying into deployment monitoring.

**Report PDFs were never generated.** `PdfLayoutService.getBrowser()` launched Chromium with `--single-process` and `--no-zygote`. Modern Chromium exits immediately under that combination ("Protocol error (Target.createTarget): Target closed"). Since `ReportService.signOut` catches PDF errors so they cannot block a clinical action, the failure was silent: cases signed out successfully and produced no PDF and no `ReportFile` row. Verified directly in the production container image — with the flags a render fails, without them the same call returns a valid PDF. Removing them was the fix.

**Patient identifiers repeated every 2.8 hours.** `order.service.ts` generated `'P' + Date.now().toString().slice(-7)`; seven digits of milliseconds wrap every 10,000,000 ms. `patientService.findOrCreate` then returned any existing record with that identifier **without comparing name, date of birth, or sex**, so a new patient could be silently merged into an unrelated record and their case filed under the wrong person. Allocation now comes from `patient_sequence` via a single atomic increment (`PatientService.generatePatientId`), registration uses `createWithGeneratedId` with no lookup step, and a caller-supplied identifier whose demographics disagree is rejected with 409 `PATIENT_MISMATCH`. The same change removed the concurrent-registration conflicts the benchmark had measured: 25 simultaneous registrations previously produced six HTTP 409s and now produce none.

**Amended cases never returned to the result queue.** `getResultQueue` excluded any order matching `reports: { none: { isFinal: true, signedOutDatetime: { not: null } } }`. After an amendment the superseded version still satisfied it, so a case awaiting a revised sign-out vanished from the worklist. The predicate now also admits a reactivated order that still holds an open draft, and drops it again once re-signed. The seeded result-queue count consequently moves from 60 to 70.

**The pessimistic edit-lock was advisory.** `OrderLockService.assertHolder()` was implemented but had no call sites, so a client bypassing the UI lock could write to a case another user was editing. It is now called inside the transactions of `createDraft`, `signOut`, `signPrelim`, and `reactivate`. It no-ops when no lock is held or the lease has lapsed, so clients that never acquire a lock are unaffected and only an actively contested case is rejected with 409 `LOCKED`.

## 17. Study-specific Metadata the Authors Still Need to Add

The repository can describe the software system, but a publishable manuscript will still need human-supplied study metadata such as:

- institution(s), country, and practice setting
- study design and evaluation period
- whether data were synthetic, retrospective clinical, prospective clinical, or mixed
- sample size and case mix
- pathology subspecialties included
- user roles participating in the evaluation
- hosting infrastructure details used for the reported study instance
- browser/client environment used during evaluation
- exact software release tag or commit hash analyzed
- ethics/IRB and privacy/de-identification statements, if applicable
- outcome measures, error definitions, and statistical analysis methods
- availability statement for source code, demo environment, or supplemental materials

## 18. Suggested Condensed Manuscript Description

One concise description that could be adapted for a journal methods section is:

"We implemented a lightweight anatomic pathology laboratory information system as a TypeScript monorepo with a React/Vite/MUI frontend, an Express/Node.js backend, PostgreSQL persistence via Prisma, and shared Zod-validated data contracts. The system models the pathology workflow from case accessioning through specimen, block, and slide tracking; ancillary testing; draft, preliminary, and final report generation; and case query. Accession, specimen, block, slide, and report identifiers were generated server-side, with serializable database transactions and optimistic locking used to prevent versioning and concurrent-edit conflicts. Report layouts were configurable through database-stored HTML templates rendered to PDF, with `pdf-lib` used for worksheet and fallback report generation. Employee authentication used password-based session login with bcrypt-hashed credentials (cost factor 12). In production, the system ran on two locally containerized PostgreSQL 16 instances with streaming physical replication (primary and hot standby), with optional WAL archiving and scheduled base backups to Google Cloud Storage via wal-g. The prototype was containerized with Docker Compose for local deployment and validated with automated unit, integration, component, and end-to-end tests executed in GitHub Actions." 
