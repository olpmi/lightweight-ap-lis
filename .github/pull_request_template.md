## What and why

<!-- What changes, and what problem it solves. Link any issue. -->

## Checklist

- [ ] Base branch is correct — feature work targets `dev`, never `main`
- [ ] CI is green (Typecheck, Lint, Backend Tests, Frontend Tests, Prisma schema drift, Playwright E2E)
- [ ] Any Prisma schema change ships with a migration, and `Prisma schema drift` passes
- [ ] `pnpm-lock.yaml` is committed if dependencies changed — CI runs `--frozen-lockfile` and will fail otherwise

## Promotion PRs only (`dev` → `main`)

Delete this section for ordinary feature PRs.

- [ ] Head is `dev` and base is `main`
- [ ] `dev` is 0 commits **behind** `main` — check with
      `gh api repos/olpmi/lightweight-ap-lis/compare/main...dev --jq '{ahead_by, behind_by}'`
- [ ] **Merging with a merge commit, not squash or rebase.** Squashing rewrites the
      promoted commits into a new SHA, diverging `main` from `dev` and forcing a
      reverse `main` → `dev` merge — which is what caused past lockfile drift.
- [ ] Aware that merging fires `Release images`: it pushes signed images to GHCR
      and hard-fails on any CRITICAL Trivy finding
- [ ] Deployment from `main` uses `docker-compose.prod.yml` (manual — nothing in CI deploys)

<!--
Note: branch protection is not available on this repo (private repo, free
personal account — the API returns 403). The rules above are convention, not
enforced by GitHub. Please actually read the checklist.
-->
