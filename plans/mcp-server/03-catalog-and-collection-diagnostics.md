# Slice 03 — Atomic catalog, diagnostics, and freshness

## Outcome and prerequisites

Expose completed story/variant snapshots with reliable failure status and revisions. Depends on 02. Collection errors cannot leave stale story executable through MCP. Story and Markdown edits update catalog using existing watchers.

## File ownership

- Modify `packages/histoire/src/node/{collect/index.ts,server/collect.ts,server/index.ts,markdown.ts}`.
- Extract Markdown watcher/update helpers into `packages/histoire/src/node/markdown/{watcher,files}.ts`; preserve public functions exported from existing `markdown.ts`.
- Add `packages/histoire/src/node/mcp/project/{catalog,snapshot,diagnostics,content-index,cursors}.ts`.
- Add `packages/histoire/src/node/__tests__/mcp/{catalog,catalog-freshness}.spec.ts`.
- Extend existing `server-collect.spec.ts` and `markdown.spec.ts`; reuse existing Markdown fixtures.

## Tests first

1. Snapshot only becomes visible after complete batch and virtual module invalidation. Concurrent reads never see one file updated and another half-collected.
2. Initial empty catalog is valid; initial all-failed collection exposes failed status; partial failure lists successful stories plus diagnostics.
3. Valid story becomes broken on edit: old target cannot be rendered/tested; subsequent successful edit restores it under new revision. Empty collection result is handled as no-story outcome, not previous success.
4. Duplicate story IDs and duplicate scoped variant IDs produce diagnostics and deterministic lookup errors. Same variant ID across different stories remains valid.
5. Story add/unlink, same-ID source edit, sibling Markdown change, standalone Markdown title/id change, and Markdown removal all publish coherent revisions.
6. Pagination stays on one retained snapshot; changed filters, foreign cursor, expired/evicted revision fail explicitly. Hostile IDs retain original bytes.

## Implementation steps

1. Return `{ status: 'collected'|'empty'|'failed', error? }` from `executeStoryFile`. Keep existing logging and throwing option. Clear/mark old story availability on empty/failed execution; do not let old `story` prove current success. Existing callers can ignore successful outcome; collector records all outcomes.
2. Collector captures input file set/outcomes, completes invalidation, then emits narrow completed-batch event. Remove/mark unlinked records atomically. Snapshot builder consumes completed batch, not global `onStoryChange` as success notification.
3. Project explicit allowlisted metadata from server story fields. Preserve treePath and collected IDs. Omit runtime functions, arbitrary `meta`, module IDs, state, absolute paths, and config hooks.
4. Build content index with registered physical/virtual source identity, canonical containment availability, content hash, and docs origin/hash. Cache hashes by unchanged stable file identity; compute changed content before publication. Hash bytes with bounded reads/streaming, never retain every source file in memory.
5. Detect file changes while hashing with pre/post identity/stat checks; retry once, otherwise defer snapshot/publication and record diagnostic. Failed/unavailable source does not prevent valid metadata being listed.
6. Increment revision for metadata, docs, raw source, diagnostics, or membership changes. Source-only changes still invalidate jobs/content reads even when collected title/variants remain identical.
7. Maintain current immutable snapshot and at most one previous snapshot, with 60-second cursor retention. Search/sort/paging are deterministic; cap response 128 KiB by returning fewer items with nextCursor, never silently truncating an item. Oversized single metadata item produces bounded diagnostic.
8. Add Markdown `.on('change')` handling that updates existing record in place. Re-read frontmatter/content, re-render HTML, update virtual module code and virtual story metadata, and notify recollection. Do not append duplicate records or rely on `addStory` updating existing virtual code; it currently returns existing object unchanged.
9. Preserve docs sibling precedence and association. If association changes after add/unlink, recompute affected records. Markdown-only publication waits for resulting collector work when virtual story metadata changes.
10. Split current 294-line Markdown module before adding watcher logic. Keep renderer behavior/public imports stable; do not duplicate parser/renderer.
11. Record `updating: true` during in-flight batch. Metadata reads can use last completed snapshot; new execution admission requires stable catalog. Restart discards snapshot/cursors and changes epoch.

## Acceptance and validation

Run catalog/freshness, server collector, and Markdown suites; core build; focused lint. Real Vue fixture edit must show same ID/new content hash/revision, failed recollection, then recovery. Real standalone Markdown edit must update title/content without extra entries. Existing UI links and Markdown output stay compatible.

## Non-goals and handoff

No new browser collection policy, story AST extraction, filesystem crawl beyond existing Histoire discovery, or MCP subscriptions. Handoff includes lookup/search/cursor API, immutable snapshot schema, diagnostics, and content index for 04/05/08.
