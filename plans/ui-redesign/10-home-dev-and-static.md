# 10 — Home: static build and dev

## Outcome and prerequisites

Depends on: 02.

The static home (deployable on static hosting) shows title, description, version/build line, Get started, a large search box, Browse section cards, Guides, and "Updated in this release". The dev home uses the same layout and adds dev-only sections marked DEV: a dev-server line, Run all tests, Needs attention (collect errors, failing tests, warnings), per-section test status on Browse cards, Agent activity, and "Changed since last commit".

## Owned files

- Add `app/components/pages/home/{HomePage,HomeHeader,HomeSearch,BrowseSections,GuidesList,UpdatesList,NeedsAttention,AgentActivityCard}.vue`; replace `components/HomeView.vue` and `components/app/HomeCounter.vue`.
- Add virtual module `$histoire-build-info` in `packages/histoire/src/node/virtual/` and its producer `packages/histoire/src/node/build-info.ts` (version, git commit/branch, builtAt, changed stories) per [contracts](contracts.md).
- Write build info into `histoire.json` in `packages/histoire/src/node/build-serialize.ts`.
- Add `build.changedSince` and theme description field if needed (`theme.description`, optional) to `packages/histoire-shared/src/types/config.ts`.

## Tests first

1. Build info: version from project `package.json`; git fields absent when not a git repo; `changed` computed from `build.changedSince` maps changed files to story IDs (new vs changed).
2. Dev build info: `builtAt` = server start; `changed` from working tree, refreshed on `histoire:story-changed`.
3. Browse sections derive from top-level tree groups/folders with story and variant counts; empty groups hidden.
4. Guides list docs-only stories in a configurable order (tree order by default).
5. Static mode renders no dev sections and imports no dev-only modules (bundle check).
6. Dev Needs attention lists collect errors from `server/collect.ts` results and failing tests from the tests store; each item navigates to its target.

## Implementation steps

1. One `HomePage` with sections registered by mode; dev sections lazy-imported under `__HISTOIRE_DEV__`.
2. Search box focuses the Search pane (slice 08) rather than duplicating search.
3. Agent activity card reads the MCP snapshot from slice 15 when available; hidden otherwise.
4. Title/description from `theme.title` and new optional `theme.description`.

## Failure paths

Git command failures are swallowed into "no git info". Large change sets cap at 20 entries with a "+N more" link.

## Validation commands

~~~bash
pnpm --filter @histoire/shared build
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Matches Home and Home — static build boards in both themes.
- `story:build && story:preview` serves the static home with no dev requests.

## Non-goals

Custom home page slots/plugins, analytics.

## Handoff

`$histoire-build-info` shape and producer for documentation (slice docs) and for the About settings section (12).
