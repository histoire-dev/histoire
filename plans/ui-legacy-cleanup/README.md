# UI legacy cleanup slice plans

Status: **implemented; integrated acceptance has documented limits**, authorized 2026-10-07 with scoped subagents. Plan created 2026-10-07 from source and build-consumer inspection. Staging, commits, pushes, and publication remain outside authorization.

Inspected checkout: `main`, HEAD `c0c41ffc8e27d00c21eebd0aa0bfeb4adea3ddba`, with concurrent uncommitted UI/loading-state work. Initial inventory included working-tree content. Plan-only phase checked links, candidate paths and remaining import edges. User later authorized implementation with subagents; executed results and remaining baseline/browser limits live in [implementation validation](implementation-validation.md).

## Outcome

Keep one active standalone workbench and one existing SDK/runtime execution path. Remove the old shell, route views, split panels, search modal, host iframe adapter, selection/test stores, and their orphaned helpers. Retain runtime modules, documented client APIs, storage compatibility, and primitives that still serve current consumers.

The main dependency problem is more than unused files:

```text
api.ts -> util/events.ts -> stores/events.ts -> stores/story.ts -> router.ts
index.ts -> StoryVariantGridSandbox -> ToolbarNewTab -> util/sandbox.ts -> router.ts
router.ts -> HomeView / StoryView -> old viewer / split panels / test runtime
```

`vite.config.ts` uses `preserveModules: true` and `treeshake: false`. Break these dependencies before deleting route views. Do not change those build switches to conceal the retained imports.

## Read first

1. [Contracts and target architecture](contracts.md).
2. [File inventory and ownership](inventory.md).
3. [Validation and acceptance](validation.md).
4. Slice documents in dependency order.

All source paths are repository-relative. `app/` means `packages/histoire-app/src/app/`; `core-tests/` means `packages/histoire/src/node/__tests__/`; `vue-tests/` means `packages/histoire-vue/src/__tests__/`.

## Slices

| Slice | Result | Depends on | Ownership |
| --- | --- | --- | --- |
| [01](01-consumer-inventory-and-baseline.md) | Reviewed consumer ledger, contract baselines, build inputs | None | Inventory and baseline evidence |
| [02](02-router-free-sandbox-urls.md) | Sandbox URL helper no longer initializes global router | 01 | Sandbox URLs and URL regressions |
| [03](03-client-events-and-old-view-state.md) | Client event fallback decoupled; old route/view/panel/state chain removed | 01, 02 | Events, router, story views, panel tree, old state/runtime tests |
| [04](04-old-shell-search-and-command-paths.md) | Old shell/tree/search and intermediate command dialog removed | 01, 03 | Shell/search/command deletion and test migration |
| [05](05-toolbar-primitives-and-orphan-helpers.md) | Obsolete toolbar/base components/helpers removed; live shared pieces retained | 03, 04 | Primitive/helper cleanup and icon test migration |
| [06](06-style-and-build-source-cleanup.md) | Only live CSS and correct build/watch assets remain | 05 | CSS, copy/watch audit, architecture docs |
| [07](07-runtime-package-contract-checks.md) | Built runtime modules and packaged consumer contracts verified | 02–06 | Build-output/consumer regressions and package evidence |
| [08](08-browser-acceptance-and-closure.md) | Dev/static/cross-framework acceptance, final deletion review and closure | 07 | Integration evidence and status updates |

Implement serially by default. This ownership map prevents overlap if parallel work is authorized later; it is not a request to launch agents. Slice 03 deliberately owns event decoupling and old view deletion together, avoiding a temporary selection-reset adapter for code immediately removed.

## Execution status

Slices 01–06 implemented: 84 source files and two stylesheets removed, retired consumers absent, runtime compatibility retained. Slice 07 build/generated graph/packed consumers passed; app/workbench typechecks and root lint retain documented baseline failures. Slice 08 executed cross-framework, native/package, dev/static and visual checks; full acceptance is limited by remaining baseline and browser failures. See [validation record](implementation-validation.md) for counts, source identities, logs and exact limits.

## Milestones

1. **01–02:** known consumers and URL boundary established.
2. **03–04:** old UI/state chain removed; current commands/search preserve behavior.
3. **05–06:** remaining leaf components, helpers, and styles pruned.
4. **07–08:** built consumers and browser behavior accepted against final source.

Each slice leaves an internally coherent checkout. Deletion slices must migrate any valuable tests in the same slice; later acceptance cannot compensate for temporarily broken imports.

## Working rules

- Preserve unrelated dirty, staged, untracked, and concurrent changes. Refresh candidate file content before edits; a dirty candidate is not permission to revert another author's work. Include current functionality and tests in the ledger before deleting it.
- Apply current `AGENTS.md`, including `WorkbenchEmptyState` and `WorkbenchLoadingState`. Keep specialized canvas/controls/startup/inline loaders where required.
- Keep authored source/test files under 300 lines, use JSDoc and comments for non-obvious ownership, and reuse existing fixtures and utilities.
- Write behavior tests first for changed boundaries. Do not add tests of CSS classes, presentation markup, or deletion lists. Use build output/consumer tests for dependency and packaging contracts.
- Preserve existing route/query identities, protocol fields, story syntax, theme options, offline icons, public client exports, and saved preferences.
- Update current architecture references after removal; historical validation records remain historical.
- Rebuild consumed packages before compiled-output tests. Do not build and test shared emitted workers concurrently.
- Record planned, executed, passed, failed, blocked, and skipped checks separately. Prior redesign results are not cleanup acceptance.

## Non-goals

No visual redesign, new story engine, SDK API redesign, event protocol change, storage wipe, runtime Pinia removal, dependency upgrade, new icon system, build optimization campaign, config codemod change, ACP/MCP feature change, or package publication. Unrelated current loading-state/UI refinements stay outside cleanup ownership.

## Full acceptance target

All slices accepted; obsolete modules absent from source and fresh output; required runtime paths resolve; current tests cover migrated behavior; dev/static workbench and supported framework/embedded consumers pass specified gates. Remaining compatibility modules have named live consumers and documented ownership.
