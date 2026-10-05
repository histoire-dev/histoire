# 03 — Catalog and content services

## Outcome and prerequisites

Depends on: 02.

One project-owned Node provider supplies completed catalog, docs, raw source, and revisions to browser and MCP projections without launching browser. Shared service ownership follows [coordination](coordination.md); DTO contract follows [public-api.md](public-api.md).

## Owned files

- Add/extend packages/histoire/src/node/runtime/catalog/{types,snapshot,publication,diagnostics,lookup}.ts.
- Add/extend runtime/content/{types,index,docs,source}.ts.
- Add runtime/catalog/built.ts for immutable capture-target projection from static histoire.json and validated Node artifact metadata. Extend node/build-serialize.ts and build/index.ts for additive static capture metadata defined in [built preview capture ownership](public-api.md#built-preview-capture-ownership).
- Landed MCP providers are the starting point: mcp/project/{runtime-catalog,snapshot,diagnostics,content,content-index,containment}.ts and the already extracted node/story-source.ts. Move generic parts into runtime/catalog and runtime/content with re-exports (coordination step 3); MCP paging/cursors/containment stay in mcp/project.
- Update collection/publication hooks, story/Markdown associations, virtual invalidation, and existing docs transform.
- Add src/node/__tests__/embed/catalog-publication.spec.ts, content-services.spec.ts, and source-parity.spec.ts.
- Reuse existing Markdown and physical/virtual source fixtures. MCP-specific paging/containment modules are consumers, not this slice's ownership.

## Tests first

1. Observe catalog during slow/broken collection. No half-published story/variant/tree batch; successful empty project differs from failed collection.
2. Recover broken story without restarting unrelated context. Distinguish diagnostics/partial success and previous stale snapshot.
3. Collect duplicate IDs; retain diagnostics and reject ambiguous lookup rather than silently choosing one file.
4. Add/change/remove sibling and standalone Markdown. Preserve sibling precedence and coherent reassociation when story/Markdown names change.
5. Edit source without metadata changes. Revision advances and raw content refreshes.
6. Compare old virtual source output with shared reader for physical and plugin-generated virtual stories.
7. Read inline Vue docs captured by transform, sibling docs, raw source, and tree with no extra browser launch/story module execution.
8. Copy static output with embed disabled and no dev catalog; built-target reader preserves exact IDs/defaults/base/build identity without scanning source. Node output reader uses validated private manifest but exposes no private HTTP path. Older static output lacking capture metadata marks capture unavailable; malformed metadata rejects capture readiness.

## Implementation steps

1. Use context-owned collection result with explicit success/partial/failure outcome and diagnostics. Do not infer collection failure from zero results.
2. Assemble immutable snapshot only after completed collection and virtual-module invalidation. Snapshot contains source epoch/revision and metadata/content availability; maps/arrays are immutable to subscribers.
3. Replace index-based tree references with exact story identity in portable projection. Preserve internal paths for Node lookup; browser DTO exposes relative labels only.
4. Publish catalog/content change event once per completed batch. Source-only and Markdown-only changes also advance revision; subscribers never see new revision with old content.
5. Build content index from existing Markdown association/renderer. Capture rendered inline docs during current Vue docs transform, including source-base asset information; do not import story to fetch docs later.
6. Extract single raw-source reader for physical files and supported generated virtual files. Existing virtual module and SDK/MCP adapters share it.
7. Separate internal full metadata from browser-safe catalog. Project config hooks, Vite loaders, absolute paths, component constructors, and MCP credentials cannot enter browser DTO.
8. Keep content bodies lazy. Content request captures generation/revision; overtaken response is rejected or retried only as explicit new read, never silently attached to new snapshot.
9. Keep MCP text projection, access containment, paging, and quotas in MCP adapter. Browser HTML source policy remains existing Source/docs behavior, independently projected.
10. Emit additive static capture metadata with completed build settings/catalog and asset-derived buildId even when embedding disabled. Read built data through one validated projection; never recollect live files to validate screenshot target. Reuse Node artifact reader for Node target, and preserve legacy histoire.json fields.

## API changes

Canonical runtime catalog/content providers expose completed snapshot, scoped subscribe, exact lookup, docs/raw-source reads, and diagnostics. Return values implement portable DTOs where needed; no new browser execution API. Existing virtual source behavior retains compatibility.

## Failure paths

Ambiguous ID rejects typed lookup. Collection failure exposes diagnostics/stale status, not successful empty replacement. Missing docs/source differs from empty content. Read failure retains bounded error; deleted file cannot serve cached content under new revision. Old generation cannot publish after close/restart.

## Validation commands

~~~bash
pnpm --filter @histoire/protocol build
pnpm --filter @histoire/shared build
pnpm --filter histoire build
pnpm --filter histoire test src/node/__tests__/embed/catalog-publication.spec.ts src/node/__tests__/embed/content-services.spec.ts src/node/__tests__/embed/source-parity.spec.ts
pnpm --filter histoire test
pnpm run lint
~~~

Run original story/Markdown/virtual-source tests and landed MCP provider regressions alongside focused suites.

## Acceptance criteria

- Atomic catalog and content revision publication demonstrated under failures and HMR.
- Docs/raw source available without browser launch; physical/virtual parity retained.
- Duplicate IDs, deleted/reassociated Markdown, inline docs, and source freshness covered.
- SDK and MCP can project same provider without duplicated readers or leaked browser paths/hooks.
- Immutable built-target projection works independently of live dev collection, including copied static output and legacy capability rejection.

## Non-goals

Browser dynamic source, native sanitizer/highlighter, surface UI, MCP policy changes, and introducing new story collector.

## Handoff

Give snapshot/subscription/read API, built-target reader, capture metadata writer, failure semantics, revision ownership, source reader entry, and projection tests to slices 04/06/11/13. Record whether existing MCP service was reused or extracted, with compatibility imports and regression evidence.
