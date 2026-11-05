# 06 — Install jobs

Status: **complete**. Dependencies: [01](01-contracts-and-scaffolding.md), [03](03-installed-inventory.md), [04](04-change-planner.md). Wave 3.

## Goal

Execute a verified `ChangePlan` safely. Run the package manager, write the config, restart and confirm the plugin loaded, reporting progress, rollback and failure analysis. The state must survive the restart the job itself causes.

## Owned files

- `NODE/marketplace/jobs/**`:
  - `handlers.ts` (replaces the stub: `job-start`, `job-cancel`, `job-current`)
  - `runner.ts` (step machine)
  - `spawn.ts` (`cross-spawn` argv, process tree kill, bounded output)
  - `snapshot.ts` (`package.json` and lockfile bytes)
  - `config-step.ts` (reuses the safe-write flow)
  - `receipt.ts` (disk receipts)
  - `failure.ts` (pnpm/npm/yarn/bun error parsing and suggestion)
  - `load-check.ts`
- If restarts must be held during a job: a lease API in `packages/histoire-dev-proxy/src/lifecycle/` (new file `lease.ts`), plus the minimal hook in `coordinator.ts`. Only this slice edits dev-proxy in wave 3.
- Specs `NODE/__tests__/marketplace/jobs-*.spec.ts`. Fixture package-manager executables under `NODE/__tests__/fixtures/marketplace/bin/` (node scripts named `pnpm`, `npm`, `yarn`, `bun`) that apply scripted edits and output.

## Implementation steps

1. First, decide whether package-manager writes restart mid-job. Read `histoire-dev-proxy/src/config/inputs.ts` and record the answer in the receipt.
   - If `package.json` or the lockfile are watched inputs, add a restart lease: while it is held, the coordinator coalesces config causes and runs one restart on release.
   - The lease is released after the config step, or on failure.
2. Write failing tests with fixture binaries and temporary projects for every row in [validation › Jobs](validation.md#acceptance-matrix).
3. Runner steps, in order:
   1. **`resolve`:** verify the plan hash (04 `verifyPlan`) and resolve the package-manager binary on `PATH`. A missing binary fails with a manual suggestion.
   2. **`install`:** snapshot `package.json` and the lockfile, spawn argv with `cwd` at the project or workspace root and `CI=1`, and stream sanitized output (strip ANSI and credentials in URLs). Bounds: at most 400 kept lines and ≤ 64 KiB per event, throttled 100 ms.
   3. **`config`:** write through the same steps as `applyPluginChanges`: hash check, temporary load next to the config, `writeConfig`, reload identity check, `restoreConfigBackup` on failure. Factor shared helpers out of `plugin-toggle-service.ts` into `NODE/config/safe-config-write.ts` instead of duplicating them. This slice owns that extraction; the existing toggle specs must stay green.
   4. **`restart`:** write the receipt (job state, expected plugin id and version, expiry 10 min), then let the watcher restart. If `afterInstall` is `ask`, stop at `restart: 'pending'` with status `succeeded` and let the UI offer a "Restart" button that calls the existing `POST /__histoire/dev/restart`.
   5. **`load`:** the next generation reads the receipt and checks that `installedPlugins` contains the plugin at the expected version and that its workbench entry registered. It records `contributions` from the plugin's workbench descriptor (rail pane, inspector tab and so on, as the host reports them), broadcasts the final state, and deletes the receipt after a client acknowledges it or the receipt expires.
4. Failure handling:
   - Failure in `resolve` or `install`: restore the snapshot bytes and set `restored: true`. List `node_modules` leftovers only if the package directory now exists.
   - Failure in `config`: restore the backup and the package snapshot, then run `pm install` once to resync `node_modules`. If the resync fails, set `restored: false` and list leftovers.
   - `failure.ts` parses the pnpm `ERR_PNPM_PEER_DEP_ISSUES` output (unmet peer, version found), the npm `ERESOLVE` output and `E404`. A peer conflict asks 02's registry client for the newest version whose peer range accepts the found version, giving `suggestion: { version, reason: 'Last version that supports vite 6' }`.
5. Concurrency and cancellation:
   - One job per project root; a second request gets `busy`.
   - Cancel kills the process tree (SIGTERM, then SIGKILL after 3 s), restores the snapshot, and reports `cancelled` only after restore finishes.
   - Client disconnect does not cancel; jobs run in the background (the 6A "Run in background" action).
6. Remove, pin, update and options kinds reuse the same runner. Options-only edits skip `install`.

## Useful tests

- The happy path writes the expected config bytes and dependency.
- A peer conflict restores the exact snapshot bytes and suggests a version.
- A config load failure restores the backup.
- `busy`, stale hash, and cancel mid-install (fixture sleeps).
- The receipt is completed by a fresh context after a simulated restart.
- With `afterInstall: 'ask'`, there is no restart.

## Acceptance criteria

- Every job either succeeds with `load` done, or ends `failed`/`cancelled` with truthful `restored` and `leftovers`.
- Toggle specs still pass after the helper extraction.

## Exclusions

- UI (09).
- Migrations (12, which reuses this runner).
