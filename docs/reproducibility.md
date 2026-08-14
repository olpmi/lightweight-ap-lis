# Reproducibility

How every number and figure describing this system is produced. Nothing here is
hand-maintained: each artifact names the run and the machine that generated it, so a
reader can regenerate it and compare.

- [Verification artifacts](#verification-artifacts) — counts, test results, coverage, benchmarks
- [Deployment resource profile](#deployment-resource-profile) — container memory, CPU and storage
- [Manuscript figures](#manuscript-figures) — publication figures captured from the running application

## Verification artifacts

Figures describing this system are generated, not hand-maintained:

```bash
pnpm metrics:system        # template, catalog, and data-model counts
pnpm db:characterize       # synthetic-corpus composition (needs a seeded DB)
pnpm verify:report         # test results + coverage; --e2e adds Playwright
pnpm bench                 # performance benchmark (needs a running backend)
pnpm metrics:deployment    # container memory/CPU + storage (needs Docker)
```

Output lands in [verification/](verification/). See
[manuscript_verification_section.md](verification/manuscript_verification_section.md)
for which manuscript table each artifact feeds, what the paper reports, and which
figures are deliberately not published.

The committed copies are produced by the **Verification Report** workflow
([.github/workflows/verification.yml](../.github/workflows/verification.yml)), run manually:

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
   [docker-compose.profile.yml](../docker-compose.profile.yml). It starts from
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
   ([docker-compose.profile-replicated.yml](../docker-compose.profile-replicated.yml))
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
[figure-case.ts](../apps/frontend/src/tests/e2e/manuscript/helpers/figure-case.ts) —
the seeded corpus has no immunohistochemistry order and no case combining
multiple specimens, an amendment and a patient summary. Each figure is written
twice from one shared layout: PNG for journal upload, and vector PDF for editing
in Illustrator or similar.

Output, per-panel metadata, captions and checksums land in `docs/manuscript/figures/`,
which is **gitignored** — the figures are reproducible output, so only the code that
generates them is tracked. Run the commands above to rebuild the directory, then see
its README for the full reproduction recipe and the synthetic case used.

The same run also writes web-sized copies of Figures 3, 5 and 6 to
[images/](images/), which *is* tracked, because the root README embeds them. They come
from the same layout at lower pixel density rather than from a separate capture, and
[images/README.md](images/README.md) records their checksums.

The capture specs are opt-in (`GENERATE_MANUSCRIPT_FIGURES=1`) so they stay out of
the CI end-to-end run and do not inflate the verification test count;
[.github/workflows/manuscript-figures.yml](../.github/workflows/manuscript-figures.yml)
regenerates everything on demand.
