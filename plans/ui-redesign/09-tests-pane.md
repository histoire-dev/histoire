# 09 — Tests pane

## Outcome and prerequisites

Depends on: 02, 06. Dev only.

A project-wide test explorer: Run all, a pass/fail/skip bar with counts and duration, Failing / All / Changed filters, a tree of stories and variants with status, collection errors ("not collected"), and a Watch mode switch. Selecting a row navigates to the variant and opens the inspector's Tests tab. Frames show per-variant status chips.

## Owned files

- Add `app/components/panes/tests/{TestsPanel,TestsSummary,TestsFilter,TestsTree,TestsTreeRow}.vue`.
- Extend `app/stores/tests.ts` with project-wide getters (summary, failing list, changed list) without changing stored state shape; split helpers into `tests-utils.ts` if needed to stay under 300 lines.
- Add "run all" and "watch" plumbing: dev event through `packages/histoire/src/node/server/dev-events.ts` to the shared execution lane in `packages/histoire/src/node/runtime/execution-service.ts` (also used by MCP `run_tests`), reusing the existing `runStoryTests` handler for single stories.
- Rail badge from failing count.

## Tests first

1. Summary counts match store definitions/results; skipped and stale counted separately.
2. Failing filter shows only failing variants and collect errors; Changed uses `histoire:story-changed` stale marks.
3. Run all queues every collected story through one execution lane; a second Run all while running is ignored or cancels per decision recorded in the slice.
4. Watch mode reruns affected stories after `histoire:story-changed`; turning it off stops reruns.
5. Selecting a failing row sets `storyId`/`variantId` and `tab=tests`.
6. Static builds do not show the pane (slice 02 gating) and do not bundle the run-all client code path.

## Implementation steps

1. Keep per-variant execution through the existing preview runtime (`COLLECT_TESTS`/`RUN_TESTS`) for the open story; use the server lane for stories not mounted.
2. Persist the watch setting in `_histoire-ui-settings.watchTests`.
3. Show progress in the summary bar during runs.

## Failure paths

Missing `@vitest/browser-playwright`/`playwright` shows the existing dependency message with install hint. Cancelled runs mark results stale, not failed.

## Validation commands

~~~bash
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Matches the Tests pane boards; existing inspector Tests tab behavior unchanged.
- Run all and watch work against the vue3 example; failures navigate correctly.

## Non-goals

Coverage, snapshot review, CI result import.

## Handoff

Run-all/watch dev events and their concurrency rules for slice 15 (MCP test operations share the lane).
