# 20 — Generation catalog metadata

Status: **complete**. Dependencies: 19. Wave 9.

## Goal

Planning and migration review must work after a detail fetch even when the project can't persist the disk cache (read-only `node_modules`, full disk). Today each `createRegistryCache(root)` has its own memory map, and the planner's read-only lookup only sees disk.

## Behavior

- `catalog/cache.ts` keeps one bounded in-memory store per project root, shared by every cache instance in the process (200 entries, 32 MiB total, least-recently-used eviction). Entries keep their fetch time; the TTL rules don't change.
- Read-only lookups (planner, migration review) consult memory, then disk, and still never fetch or write.
- The store is cleared when the dev server generation for that root is disposed (export `clearRegistryMemory(root)`; the orchestrator wires the call where the marketplace channel is disposed if it isn't in an owned file).

## Owned files

- `NODE/marketplace/catalog/cache.ts`
- `NODE/marketplace/changes/resolve-plugin.ts`, `NODE/marketplace/migrations/releases.ts` (read-only path only)
- `NODE/marketplace/channel.ts` (dispose hook only)
- Specs: extend `catalog-cache` and planner specs.

## Implementation steps

1. Write failing specs:
   - Unwritable cache dir (chmod 0500 temp dir): detail fetch succeeds, then planning the same community plugin succeeds without a second fetch (fixture request count unchanged).
   - Same for migration review with community on.
   - Eviction bound holds; stale/TTL behavior unchanged.
   - Clearing the store makes planning return `unavailable` again.
2. Implement.

## Acceptance criteria

- Specs pass; planning still makes zero network requests and writes zero files.
