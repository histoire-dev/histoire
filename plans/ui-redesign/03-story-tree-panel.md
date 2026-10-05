# 03 — Story tree panel

## Outcome and prerequisites

Depends on: 02.

The Stories pane shows project title and story count, a filter field, groups, folders, stories, and the open story's variants as child rows. The selected variant is highlighted; failing variants show a status mark. Folder state keeps the `_histoire-tree-state` key.

## Owned files

- Rework `app/components/tree/{StoryList,StoryGroup,StoryListFolder,StoryListItem}.vue`.
- Add `app/components/tree/StoryListVariant.vue` and `app/components/tree/TreeFilter.vue`.
- Add `app/composables/tree-filter.ts` (filtering over titles and paths, no Fuse dependency).
- Read test status from `app/stores/tests.ts` getters; do not add new test state.

## Tests first

1. Opening a story lists its variants under it; selecting a variant updates `variantId` without reloading the story.
2. Filter matches story titles and folder paths, expands matching folders temporarily, and restores the persisted folder state when cleared.
3. Folder open state reads/writes `_histoire-tree-state` unchanged.
4. Docs-only stories show the document icon and no variant children.
5. Keyboard: Up/Down move, Right/Left expand/collapse, Enter selects; focus stays in the tree.
6. Failing variant rows expose an accessible "tests failing" label.

## Implementation steps

1. Keep the existing tree data (`storyStore`, `tree` config groups/order); render variants from `story.variants` for the current story only.
2. Use one `role="tree"` with `treeitem`s; manage roving tabindex.
3. Icons: `folder` for all folders (chevron conveys open state), `cube` story (story `iconColor` respected), `document` docs, `dot-mark` variant.
4. Keep `data-test-id="story-list-item"` on story rows.

## Failure paths

Collect-errored stories show a warning mark and stay selectable (canvas shows the error state from slice 04).

## Validation commands

~~~bash
pnpm --filter @histoire/app build
pnpm --filter histoire test
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Tree matches the canvas "Story tree" component in both themes.
- Existing tree config (groups, order, file title/path) behaves as before.
- Cypress tree specs pass.

## Non-goals

Search scopes (08), drag-and-drop reordering, multi-select.

## Handoff

Selection composable used by the tree (`useSelection`) for slices 04 and 08.
