# 02 — Catalog service

Status: **complete**. Dependencies: [01](01-contracts-and-scaffolding.md). Wave 2. Source acceptance recorded in [receipt](receipts/02.md).

## Goal

Answer `marketplace-catalog` and `marketplace-detail` from the bundled official index and, when enabled, the npm registry. Results come with search, facets, project signals and Discover picks.

## Owned files

- `NODE/marketplace/catalog/**` except `official.json`, which 01 generates. This includes:
  - `handlers.ts` (replaces the stub)
  - `official.ts`
  - `registry.ts` (search and packument client)
  - `cache.ts`
  - `search.ts` (ranking and match ranges)
  - `facets.ts`
  - `signals.ts` (project stack and recommendations)
  - `discover.ts`
  - `compat.ts`
- New virtual module `NODE/virtual/resolved-marketplace-official.ts`, plus its registration line in `NODE/virtual/vite-plugin.ts`. Only this slice edits `vite-plugin.ts` in wave 2.
- Specs under `NODE/__tests__/marketplace/catalog-*.spec.ts`. Fixture registry server under `NODE/__tests__/utils/marketplace/registry-server.ts` (shared with 06/12).

## Implementation steps

1. Write failing tests against a local fixture registry server (packuments plus `/-/v1/search`).
2. Registry client:
   - Base URL from `npm_config_registry` or `https://registry.npmjs.org`.
   - 5 s timeout and an `AbortSignal` per request.
   - Validate responses before use and size-bound bodies (search ≤ 2 MB, packument ≤ 8 MB).
   - Read `histoire.marketplace` from the `latest` version's manifest in the packument.
   - Extract `dist.attestations` presence as `provenance`.
3. Cache:
   - In memory, plus JSON on disk at `node_modules/.cache/histoire/marketplace/registry/`.
   - TTL 1 h. After TTL, a fetch error serves the cached copy and marks the source `stale`.
   - Concurrent identical requests share one fetch.
4. Merge sources:
   - Official entries win on id collision.
   - `official` is true only for an index entry under the `@histoire/` scope.
   - Community entries without a valid manifest are omitted.
5. Search:
   - Use `fuse.js`-equivalent behavior with a small in-house scorer, or `fuse.js` if it is already resolvable from `histoire`. Don't add it otherwise.
   - Return `match` ranges for highlighting (3A).
   - Search spans all entries before pagination.
6. Facets are computed on the filtered set, excluding the facet's own filter, so counts show what selecting it would yield.
7. Signals and Discover:
   - Signals: detect frameworks and notable dependencies (vitest, tailwindcss, vite major) from the project `package.json` and the installed versions.
   - Hero and picks: evaluate each entry's `recommend` rules. The `missing: true` reason applies when no installed plugin shares the category.
   - Collections come from `collections` ids with fixed titles: "Visual testing", "Design handoff", "Inspection", "Data & mocks".
8. Compatibility:
   - Check `requires.histoire` against the running Histoire version, frameworks against detected frameworks, and peer dependencies against installed versions.
   - Return the first failing reason as short copy, e.g. "Needs vite 7".
9. Inventory join: call 03's `getInstalledIndex(ctx)` if present. Until 03 lands, use a local adapter returning an empty map, behind one import, so integration is a one-line swap recorded in the receipt.
10. The static virtual module exports the official entries as `CatalogEntry[]`, with `compatible.ok` true and no `installed` data.

## Useful tests

- Offline official results.
- Community off: zero fixture requests.
- A query match only on page 2 of the registry search.
- Timeout returns `community: 'error'` and official results.
- Stale cache.
- Collision and official spoofing.
- Facet counts.
- Recommendation reasons from fixture project signals.
- Incompatible peer reason.

## Acceptance criteria

- Catalog and detail answer within the bounds above.
- The registry is never contacted with community off.
- The static module builds a valid list.

## Exclusions

- Installing anything.
- UI.
- Writing project files.
