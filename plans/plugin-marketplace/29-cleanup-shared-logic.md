# 29 — Cleanup: shared catalog and command logic

Status: **complete**. Cleanup wave A (parallel with 30, 31, 32). Source: four-angle review of commits `f5798ef7..bae8feb0` (reuse, simplification, efficiency, altitude).

## Shared rules for cleanup slices 29–34

- Behavior stays the same unless an item says otherwise (the static client fixes below intentionally align with the server). No new features.
- Delete code made redundant; don't leave shims or re-export files only for compatibility unless another slice still imports the old path (then keep a one-line re-export and say so in the receipt).
- Keep every touched module under 300 lines, JSDoc on everything, `htw:` utilities only. Update the specs that cover what you change; don't weaken assertions.
- Commands: node specs `pnpm --filter histoire exec vitest run src/node/__tests__/marketplace`; Vue specs `NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @histoire/vue exec vitest run src/__tests__/marketplace`; styling guard; ESLint on touched files.
- The user's watchers and dev server are running: never build. No git staging/commits.

## Owned files

- New `packages/histoire-shared/src/marketplace/**` (pure, browser-safe; export from the shared entry next to the marketplace types).
- `packages/histoire-shared/src/types/marketplace.ts`
- `NODE/marketplace/catalog/{facets,search,validation}.ts`, `NODE/marketplace/manifest/schema.ts`
- `NODE/marketplace/changes/{package-manager,options,manual,planner}.ts`
- `APP/util/marketplace-client.ts`, `APP/components/marketplace/install/manual-instructions.ts`, `APP/components/marketplace/browse/labels.ts`, `APP/components/pages/settings/usePluginToggles.ts`
- Specs covering these.

## Fixes

1. **One set of enums.** Export `as const` arrays from shared (`categories`, `addKinds`, `tints`, `accessKinds`, `packageManagers` incl. `auto`), derive `Category`/`AddKind`/`Tint`/`Access` types from them, import them in `manifest/schema.ts`, `catalog/validation.ts`, `changes/package-manager.ts`, `changes/manual.ts`, and the client facet seeds.
2. **One catalog query implementation.** Move `filterCatalog`, `catalogFacets`, `searchCatalog` (with match ranges) and the catalog sort (incl. id tiebreak) into shared pure functions. Server modules use them (keep `facets.ts`/`search.ts` exports working for `catalog/service.ts`, owned by 30: re-export or keep the same names). `staticPage` in the client calls them — static books gain ranked search and highlight ranges; use the server's default page size; drop the `structuredClone` of the official index in `catalog()` and shallow-copy only what `offlineDetail` changes.
3. **One command/options implementation.** Move pure `packageCommand`, `displayCommand` and option nesting (`pluginOptions`, incl. the `__proto__` guard) into shared; use from `changes/*` and from `staticPlan`. Static pins now match the server flags (`-E` for yarn/bun). Rewrite `manual-instructions.ts` to map over managers with the shared functions instead of building a fake client and detecting `step.title.startsWith('Run with ')`.
4. **Planner I/O:** compute the workspace root once per plan and pass it to `detectPackageManager` (no second walk, no third package.json read loop); hash lockfiles by streaming each file's bytes into one incremental hash instead of `JSON.stringify` of full contents.
5. `crypto.randomUUID()` in `marketplace-client.ts` and `usePluginToggles.ts` → `createClientUuid()` from `APP/util/dev-event-api.ts` (works outside secure contexts).
