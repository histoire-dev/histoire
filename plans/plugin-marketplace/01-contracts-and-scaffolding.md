# 01 — Contracts, manifests, and scaffolding

Status: **complete**. Dependencies: none. Wave 1 (runs alone).

## Goal

Freeze every shared contract and create all shared registries and stubs, so wave 2+ slices fill only files they own.

## Owned files

- `packages/histoire-shared/src/types/marketplace.ts` (manifest, catalog, plan and job DTOs) and `ui-marketplace.ts` (UI channel event map merged into `UiClientEvents` / `UiServerEvents`). Export both from `types/index.ts`.
- `NODE/marketplace/manifest/{schema,validate,index}.ts` (validator with diagnostics).
- `NODE/marketplace/channel.ts`, exporting `registerMarketplaceChannels(ctx, channel, isActive)`. It calls `registerCatalogHandlers`, `registerInventoryHandlers`, `registerPlanHandlers`, `registerJobHandlers` and `registerMigrationHandlers`, imported from stub modules `NODE/marketplace/{catalog,inventory,changes,jobs,migrations}/handlers.ts`. Each stub returns `unavailable` for its events.
- Wire `registerMarketplaceChannels` once in `NODE/server/ui-channel/index.ts`, dev only.
- `APP/util/marketplace-client.ts`: typed promise wrappers per request event with timeout and abort, a `subscribeJob(cb)` for `job-state`, and a static-build branch reading `virtual:$histoire-marketplace-official`. Declare that virtual module in `packages/histoire-app/src/virtual.d.ts`; slice 02 implements it.
- `histoire.marketplace` blocks in the `package.json` of every official plugin:
  - a11y
  - designs
  - screenshot
  - percy
  - vue-devtools
  - nuxt
  - quasar
  - vue / react / svelte (`category: "frameworks"`; marked required in 03)

  Write real content from each plugin's README, options type and contributions. Don't invent capabilities. Add `"keywords": ["histoire-plugin"]`.
- `scripts/marketplace/generate-official-index.mjs` writes `NODE/marketplace/catalog/official.json` (sorted, stable). Add a root script `marketplace:index`.
- Spec `NODE/__tests__/marketplace/manifest.spec.ts`.

## Implementation steps

1. Write failing validator tests:
   - a valid full manifest
   - each invalid field dropped with a path-based diagnostic
   - string limits
   - unknown kind, tint and option type
   - a `when` clause referencing an unknown key
   - a migration op on an invalid path
   - drift between `official.json` and a fresh generation from the package manifests
2. Implement the types exactly as in [contracts](contracts.md), with JSDoc on every property.
3. Implement the validator as pure functions with no I/O, returning `{ manifest, diagnostics }`.
4. Annotate the official packages and generate `official.json` with the script. The drift test reads package manifests from the repo.
5. Scaffold the stubs and registry above. The stubs must type-check and register handlers that reply `unavailable`, so the app can be developed against real events.
6. Write the client wrappers. One shared `request<E>()` helper does the correlation and timeouts; no per-event copies.

## Useful tests

- Validator behavior (above).
- Drift test.
- A client wrapper test with a fake channel: correlation by `requestId`, a timeout rejects, abort sends nothing further, and the static branch returns the bundled entries.

## Acceptance criteria

- Types compile in `@histoire/shared`, `histoire` and `histoire-app`.
- Every official manifest validates with zero diagnostics.
- Stub handlers answer `unavailable`.
- No behavior change for existing users.

## Exclusions

- Registry access.
- Writes to project files.
- Any UI.
