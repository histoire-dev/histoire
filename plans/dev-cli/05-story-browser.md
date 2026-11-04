# 05 — Story and variant browser

Status: **complete** (2026-11-04, see evidence). Dependencies: [01](01-runtime-bridge-and-output.md), [03](03-terminal-surface-and-modes.md), [04](04-logs-errors-and-session.md).

## Goal

Browse canonical current catalog and open exact story variant using public workbench URL.

## Source targets

- `packages/histoire/src/node/runtime/terminal/` catalog adapter and `node/terminal/` stories view/selection.
- Reuse `runtime/catalog/{attachment,publication,lookup}.ts` and `mcp/project/preview-urls.ts` or its extracted shared transport-neutral URL helper.
- Existing real Vue CLI/catalog fixtures, new terminal catalog/PTY scenarios.

## Implementation steps

1. Obtain canonical attached catalog from current generation. Do not instantiate second publisher or MCP facade only to read terminal metadata.
2. Emit revision notification on catalog change, plus explicit updating/lifecycle state. Read pages on demand using frozen expected revision; variants page separately. Project only display metadata and diagnostics, no source/config objects.
3. Story search covers title/ID/file label and variant text. Perform search over canonical child-side data so paged results do not silently omit matches outside loaded page.
4. Reuse common list navigation. Enter story opens its variants; Enter variant opens workbench; `o` opens current target. Story without variants opens story route rather than manufacturing variant ID.
5. Build URLs with actual public origin, resolved base/router mode, exact IDs, and existing encoding. Keep technical helper names unchanged, but visible UI uses story/canvas terminology. If reuse imports heavyweight facade code, extract only URL helper rather than loading runtime graph into parent.
6. Retain selection by IDs through revision refresh. Do not merge pages from different revisions. Retired read retries only metadata read against current generation after readiness.
7. Removed target clears actionability; restart preserves unresolved ID only until current catalog confirms it. Ambiguous or unavailable target is not executable.
8. Define `t` target handoff to Tests view; manual test implementation waits for 08. Keep target selection separate from active watch scope.

## Useful tests

- Two stories with distinct variants prove opening exact requested target and exclude accidental first-item default.
- History/hash router, non-root base, special characters/dot-only IDs, no-variant/doc-only story, and large paged inventory with match beyond first page.
- Hold page response, edit catalog, then release old page: no mixed revision/removed variant action.
- Removing selected variant clears open/test action; same ID in new generation requires new authority.
- Actual `--no-mcp` CLI still browses catalog and opens target. Stub only OS browser launch boundary when asserting URL; include real browser navigation in final qualification.

## Acceptance criteria

Current selection opens exact workbench route; search spans full catalog; stale pages/removed targets never become actionable. No MCP listener is required.

## Exclusions

No source/docs viewer, story editing, second catalog provider, new router, or automatic watch retargeting from browsing.

## Handoff receipt

Record metadata DTOs/pages, reused URL helper, routing variants, real CLI/catalog checks and browser-launch proof boundary in [evidence](evidence.md). 07/08 can use exact target handoff.
