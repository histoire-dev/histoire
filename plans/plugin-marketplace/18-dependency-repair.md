# 18 — Dependency repair after failed jobs

Status: **complete**. Dependencies: 01–13. Wave 7.

## Goal

When a job fails or is cancelled after the package manager ran, restore `node_modules` to match the restored `package.json` and lockfile instead of only reporting `node_modules` as a leftover.

## Behavior

- After `restoreProject` succeeds for a job whose package step started, run a frozen install with the detected manager, as argv without a shell:
  - pnpm: `pnpm install --frozen-lockfile` (plus `-w` when the plan needed it)
  - npm: `npm ci` when a `package-lock.json` exists, else `npm install --no-save`
  - yarn: `yarn install --immutable` for Berry, `yarn install --frozen-lockfile` for Classic (detect from `yarn --version` already probed, or `.yarnrc.yml`)
  - bun: `bun install --frozen-lockfile`
- The output streams into the job log under a "Restoring dependencies" line; no new step id.
- Then verify: for install, `node_modules/<id>` is absent; for update, remove and pin, the installed version equals the version read before the job started. Only on success drop `node_modules` and `node_modules/<id>` from `leftovers` and keep `restored: true`.
- Re-run `restoreProject` after the frozen install (managers may touch lockfiles) and keep the exact-bytes promise.
- Cancellation: run the repair with a fresh signal; a second cancel kills it and reports `node_modules` as a leftover.
- The existing config-failure resync uses the same frozen command instead of a plain `install`.

## Owned files

- `NODE/marketplace/jobs/execute.ts`, a new `NODE/marketplace/jobs/repair.ts` (keep `execute.ts` under 300 lines; move the failure path there if needed)
- `NODE/marketplace/changes/package-manager.ts` (`frozenInstallArgv`)
- `NODE/marketplace/jobs/runner.ts` only if the receipt needs the pre-job installed version (record it in the receipt written before the package step)
- Specs: extend the existing jobs specs and fixture package-manager executables in `packages/histoire/src/node/__tests__/marketplace/` (no new fixture family)

## Implementation steps

1. Write failing specs with fixture executables that write `node_modules/<id>` on add and remove it on frozen install:
   - Failure after the package step: frozen argv per manager, leftovers empty, `restored: true`.
   - Repair command fails: `restored: false`, leftovers include `node_modules`.
   - Update failure: version check against the pre-job installed version.
   - Cancel during install, then repair succeeds.
   - Config-write failure path uses the frozen argv.
2. Implement; keep output sanitization.

## Acceptance criteria

- Specs pass; existing job specs pass; no shell strings.

## Exclusions

- Restoring files outside `node_modules`, `package.json`, the lockfile and the config.
