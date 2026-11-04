# 09 — Affected-story selection

Status: **complete** (2026-11-04, see evidence; ran before 05). Dependencies: [05](05-story-browser.md), [07](07-test-execution-service.md).

## Goal

Compute safe affected subsets from existing dependency evidence while preserving previous graph through invalidation/deletion.

## Source targets

- `packages/histoire/src/node/test/eligibility/{index,evidence,analysis,transforms}.ts` as reuse seams.
- New `packages/histoire/src/node/runtime/terminal/` affected selector/evidence ownership.
- Existing watcher/collection/canonical catalog observations and exact test-scope types.

## Implementation steps

1. Capture current scope and current eligibility evidence through existing service. Its `evidence` contains per-story files plus shared setup and leaf fingerprints; lack of evidence does not mean unrelated or test-free.
2. Build detached last-complete evidence index for scope. Keep owner/generation, per-story membership, unresolved stories, and current structural context. Do not copy another parser, resolver, dependency tracker, or filesystem watcher.
3. Classify existing file event against retained index before replacing evidence. Direct story edits select owning story; shared member selects every owner; shared setup selects scope. Intersect with explicit story/variant scope without broadening it.
4. Reuse current ignored-event/path normalization rules. Structural/resolution events and unknown/opaque graph portions conservatively affect selected scope. Known independent module edit returns empty set; do not treat incomplete graph as negative proof.
5. Preserve old graph while analysis is pending/failed and through deletion. Only successful current-generation analysis replaces it. Handle removed/renamed IDs through catalog refresh and explicit missing-target state.
6. Unwatched virtual/installed leaves retain existing fingerprint semantics; no promise of arbitrary installed package watching. Recheck them on meaningful invalidation/collection and treat unverifiable evidence conservatively.
7. Reuse existing eligibility listener order/invalidation. Any new observer must capture old graph before retirement rather than depend on undocumented callback order. Do not narrow full recollection or definition-cache invalidation needed by MCP/workbench.
8. Return exact affected IDs plus classification reason for watch scheduler. Selector computes membership only; do not enqueue tests or install debounce/run loop here.

## Useful tests

- Real transformed graph fixture with A/B shared helper, C independent helper, and shared setup. Edit A, shared helper, C-only helper, setup; assert exact selected/excluded sets.
- Delete imported helper before graph rebuild: retained evidence still selects A/B. Failed replacement analysis does not erase old dependency ownership.
- Opaque/dynamic unresolved graph conservatively selects scope; known independent source module does not.
- Structural add/unlink and ignored generated cache events exercise conservative versus empty classification.
- Variant scope retains exact variant when its story is affected; unrelated story is excluded. Two IDs containing delimiters remain distinct.
- Pure selection algorithm tests are useful supplements; real transform/watcher coverage establishes integration with existing evidence.

## Acceptance criteria

Known affected stories are never missed, independent known modules avoid work, uncertainty is conservative, and old graph survives deletion. Existing eligibility/cache safety remains unchanged.

## Exclusions

No second dependency graph infrastructure, automatic test scheduling, polling installed packages, or replacement for existing collection correctness rules.

## Handoff receipt

Record reused evidence fields/API, ownership/order decisions, exact graph membership checks, fallback reasons, existing-cache regressions and limitations in [evidence](evidence.md). 10 consumes selector without reimplementing it.
