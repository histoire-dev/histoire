# 31 — Cleanup: node jobs, migrations and channel

Status: **complete**. Cleanup wave A (parallel with 29, 30, 32). Follow the shared rules in [29](29-cleanup-shared-logic.md#shared-rules-for-cleanup-slices-2934).

## Owned files

- `NODE/marketplace/jobs/**` (except `failure.ts`: slice 30)
- `NODE/marketplace/migrations/{plan,apply,select,handlers}.ts`, `NODE/marketplace/changes/{handlers,plan-store}.ts`
- `NODE/marketplace/{channel,channel-stub}.ts`, `NODE/marketplace/catalog/handlers.ts`, `NODE/marketplace/inventory/handlers.ts`, `NODE/marketplace/catalog/errors.ts`
- `NODE/util/**` (only for the extracted process-tree helper), `NODE/acp/agent-process.ts` (switch to that helper)
- Specs covering these.

## Fixes

1. **Remove `channel-stub.ts`:** move `MarketplaceRegistrar` into `channel.ts`; drop the unreachable "unavailable" branches guarded on `!ctx.root`/`!ctx.config` (required context fields); give tests a real context fixture. Add one internal `registerCorrelated(channel, event, resultEvent, schema, run, fallbackMessage)` helper that owns envelope parsing, budget check, error mapping and the `isActive() && readyState === 1` guard; use it in the catalog/changes/migrations/inventory/jobs handlers.
2. **Migration plans:** `plan()` must not immediately `verifyPlan` (second full `computePlan`); `verifyPlan` must not call `base.verifyPlan` twice — use expiry + record checks.
3. **Jobs:** O(1) output budget (running byte total instead of `JSON.stringify(lines)` per line); `current()` returns early when an in-memory job is valid and sweeps receipts at most once per generation (or by mtime) instead of parsing every receipt each call; `releaseLane()` helper replacing the 6–7 inline lane deletions; named TTL constants (job receipt, registry cache) instead of `10 * 60_000`/`3600000` literals; one receipt-id regex; drop the redundant `'node_modules'` set merge; inline the one-use `config-step.ts` and `copyJob` (`structuredClone`).
4. **Reuse:** `isAlive` from `NODE/util/persistent-dir.ts` instead of `processAlive`; `projectDirectory(root, ['.histoire','marketplace'], true)` from `NODE/util/project-directory.ts` for receipts; extract `stopProcessTree(child, timeouts)` from `acp/agent-process.ts` into `NODE/util/` and use it in `jobs/spawn.ts` and `agent-process.ts`.
5. Unexport module-private exports listed by the review (`factoryImport` inline, `CacheResult`, `RegistryRelease`, `ConfigChange`, `DetectedPackageManager`, `InstalledPackage`, `ParsedFailure`, `UnmetPeer`, `DependencyRepair`, `SnapshotFile`, `MigrationRelease`) **only in files you own**; record the rest for the owner slices.
