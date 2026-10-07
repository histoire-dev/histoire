# 04 — Old shell, search and intermediate command dialog

Depends on: 01, 03. Owner: remaining obsolete shell/search leaves, intermediate standalone header/dialog and their tests.

## Result

One current rail/Search/command presentation remains. Intermediate modal tests cover active workbench behavior instead of a component no entry mounts.

## Files

- Delete remaining slice 04 candidates in inventory. Do not re-edit slice 03's removed tree/folder and search/command detachment subset.
- Migrate `vue-tests/standalone-search.spec.ts` away from `standalone/CommandPalette.ts`.
- Inspect `vue-tests/standalone-shell.spec.ts` and other standalone adapter tests; retain those using real current mount/adapter behavior.
- Extend current `workbench-search-{accessibility,focus,dismissal,ranking}.spec.ts`, `search-activation.spec.ts`, or command adapter tests by responsibility, keeping files under 300 lines.
- Retain `app/components/command/{CommandPrompts,PromptText,PromptSelect}.vue`, `standalone/commands.ts`, `client-actions.ts`, current `SearchPanel.vue` and all pane/page/shell components.

## Test migration

Read every case in `standalone-search.spec.ts` before removal. Map its externally useful behavior:

1. Story/variant activation invokes exact current session target and restores route identity.
2. Docs activation retains target/anchor and uses current docs pane/tab behavior.
3. Command `getParams` receives current route/story/variant context and answers; execute once.
4. Commands with prompts wait for submission. Default values and dependent answers are preserved; Enter submits, Escape cancels, focus enters live prompt.
5. Async rejected command reports only while its captured owner is current; no stale pane/selection feedback.
6. Search keyboard navigation and recycled rows activate current identity, not a former position.
7. Ctrl/Meta+K and Escape follow current rail pane focus restoration, including narrow layout and iframe-originated focus requests.

Retire modal-specific assertions (`HTMLDialogElement.showModal`, backdrop click, closed dialog state) because current pane has a different interaction contract. Do not recreate modal markup to satisfy them. Keep stronger current pane focus tests; avoid duplicate cases already covering same owner.

## Change

1. Complete useful test migration started for slice 03 dependency detachment; run current behavior tests before deleting `CommandPalette.ts`.
2. Delete unused intermediate `standalone/Header.vue` and `CommandPalette.ts`.
3. Delete orphaned old shell/mobile/loading/count components only after ledger confirms no current startup/Home consumer.
4. Delete remaining old `components/search/` data/render helpers. Current search uses SDK indexes and `components/panes/search/`; do not move helpers to recreate a second search engine.
5. Remove old-only test imports/mocks and test fixtures with no retained cases. Keep shared fake sessions, command definitions and navigation helpers.
6. Do not prune CSS or base primitives here; slices 05–06 own those after source usage settles.

## Validation

- Current command adapter, prompt, search activation/ranking/accessibility/focus/dismissal suites.
- Standalone navigation, folders, docs links, client actions, and shell tests where still current.
- App/workbench/embed typechecks.
- Repository source/test search has no imports of removed old search/modal/header components.

## Acceptance

No mounted-workbench test depends on intermediate dialog. Prompted and direct plugin commands preserve context, invocation count, keyboard behavior and errors. Current pane implements all supported search behavior; no extra modal/palette remains.
