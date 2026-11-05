# 34 — Cleanup: marketplace test infrastructure

Status: **complete**. Cleanup wave C (after 33). Follow the shared rules in [29](29-cleanup-shared-logic.md#shared-rules-for-cleanup-slices-2934). Tests and test configs only; no production edits.

## Owned files

`packages/histoire/src/node/__tests__/{marketplace,utils/marketplace,fixtures/marketplace}/**`, `packages/histoire-vue/src/__tests__/{marketplace-*,utils/marketplace-*}`, `packages/histoire-vue/vite.config.ts` (test alias only).

## Fixes

1. Delete the 18 per-slice tsconfigs nobody runs; if a spec-graph typecheck is wanted keep one `tsconfig.node.json` and one `tsconfig.app.json` with globbed includes. Delete the orphaned `marketplace-shell/browser.{mjs,html}` harness.
2. One Vue mount harness: `mountMarketplace(...)`, `lastRequest()`, `buttonByName()`, `stubDialog()` in `utils/marketplace-transport.ts`; the six marketplace fixtures use it; one shared `plugin()` entry builder.
3. Node: reuse `inventoryPackage` (add a `source` option), `jobManifest`, one `packument(id, manifest, peers)` builder in `utils/marketplace/registry-server.ts`, default prefs from `marketplaceDefaults()`, production `lockfiles` map; the interop tarball server becomes a route option on `registryServer`; `client.spec.ts` uses the shared transport and drops tests duplicated by `marketplace-detail/static.spec.ts`.
4. Drop fetch stubs that only assert the removed browser restart is never called; rename "without HTTP restart" tests.
5. Remove duplicated tests (e.g. detail "returns from detail to All plugins" vs "returns to category with existing search…"); keep the stronger one.
6. The `virtual:$histoire-marketplace-official` test alias must serve production-shaped data (no `history`, computed `official`/`compatible`) — resolve it through the real `resolvedMarketplaceOfficial` or an equivalent transform.
