# 30 — Cleanup: node catalog, registry and inventory

Status: **complete**. Cleanup wave A (parallel with 29, 31, 32). Receipt: [30](receipts/30.md). Follow the shared rules in [29](29-cleanup-shared-logic.md#shared-rules-for-cleanup-slices-2934).

## Owned files

- `NODE/marketplace/catalog/{service,signals,compat,cache,registry,registry-entry,official,npm-config}.ts` (not facets/search/validation: slice 29)
- `NODE/marketplace/inventory/**` (except `handlers.ts`: slice 31)
- `NODE/marketplace/changes/resolve-plugin.ts`, `NODE/marketplace/migrations/{releases,details}.ts`, `NODE/marketplace/jobs/failure.ts`
- `NODE/config/{plugin-toggle-inventory,plugin-metadata}.ts`
- Specs covering these.

## Fixes

1. **Project signals once:** memoize `detectProjectSignals` per context generation (WeakMap on ctx, like `getInstalledIndex`); resolve installed versions only for names consulted (requires keys + vite), derive `frameworks` from dependency names; drop the redundant `|| versions[name]`.
2. **One registry client per context:** expose `packument(id)` and a read-only `cachedPackument(id)` (same identity/latest checks as `fetchPackument`) from the catalog service's client; use it in `resolve-plugin.ts`, `releases.ts`, `details.ts` (no fresh `createRegistryUpdateReader`/`createRegistryClient` per call), `failure.ts`, `registry-versions.ts`. Resolve the npm config once per client.
3. **Registry cost:** skip schema re-parse for memory-cache hits (validated on insert); memoize `registryDetail`/release lists per packument object (WeakMap); stringify each cache entry once (byte count + disk write share it); shrink packuments to the used fields before caching.
4. **Copies:** drop `structuredClone(official)` in `service.ts`; precompute `officialReleases` once at module load with shallow overrides.
5. **Compatibility helper:** one `compatibility(detail, project, optionalPeers)` in `compat.ts` reading the Histoire version via `readHistoireVersion()` (`NODE/mcp/package-version.ts`) — remove the `createRequire` and JSON-import copies.
6. **Reuse:** `readInstalledPackage` instead of the hand-rolled reads in `signals.ts`, `resolve-plugin.ts`, `releases.ts` (`installedVersion`); `webUrl`/`repositoryUrl` from `config/plugin-metadata.ts` in `registry-entry.ts`; semver `major`/`prerelease` wrappers in `catalog/version.ts` for `inventory/updates.ts`, and `exactVersion` for the pinned check in `package-resolve.ts`; cache dir via `getProjectCacheDir` (`NODE/util/temp-paths.ts`) or one exported constant.
7. **Inventory startup I/O** (`plugin-toggle-inventory.ts`): compute project dependencies once per inventory, reuse `ctx.pluginMetadata`, enrich each row once, resolve the config file once, read callee identifiers from the parsed config AST instead of re-parsing.
8. Update checks: compute signals once per call; share the client from (2).
