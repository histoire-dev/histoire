# 08 — Search pane

## Outcome and prerequisites

Depends on: 02, 04.

Search is a rail pane: an input with scope tabs (All, Stories, Docs, Props), grouped results (Variants, Props, Docs), and keyboard navigation. Matching frames on the canvas are highlighted and others dimmed; a toolbar stepper moves between matches. ⌘K opens the Search pane and focuses the input (the modal is retired).

## Owned files

- Add `app/components/panes/search/{SearchPanel,SearchScopes,SearchResultGroup,SearchResultItem}.vue`.
- Reuse `search-title-data.ts`, `search-docs-data.ts`, and the Fuse setup from `search/SearchPane.vue` (extract the query logic into `app/util/search-query.ts`; do not create a second index).
- Add a props index: built client-side from `_hPropDefs` of loaded stories, or server-side in `packages/histoire/src/node/search.ts` if prop names are available at collection time.
- Add canvas match highlighting via `stores/canvas.ts` (`highlight: Set<frameKey>`).
- Remove `search/SearchModal.vue` after parity; keep `data-test-id`s `search-btn`, `search-item`; map `search-modal` to the pane root.

## Tests first

1. Query ranking equals the current modal for the same index (golden results from the existing data fixtures).
2. Scopes filter result groups; Props scope lists prop names with the stories using them.
3. Enter opens the result; ⌘↵ opens isolated; Tab moves to next match on canvas.
4. Matches inside the current story highlight frames; clearing the query clears highlights.
5. ⌘K from anywhere opens the pane and focuses input; Escape returns focus.
6. Dev commands (`virtual:$histoire-commands`) remain reachable from the search input with a `>` prefix in dev only.

## Implementation steps

1. Debounce queries; keep docs data lazily imported as today.
2. Result rows show icon (cube/document/settings-adjust), title, path, snippet with match emphasis.
3. When results point to another story, navigate first, then highlight.

## Failure paths

Docs index load failure keeps title results and shows a non-blocking notice.

## Validation commands

~~~bash
pnpm --filter @histoire/app build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter histoire-example-vue3 test:examples
~~~

## Acceptance criteria

- Matches the Search boards in both themes; works in static builds.
- Search Cypress specs pass with updated selectors.

## Non-goals

Server-side search API, fuzzy search over source code.

## Handoff

`search-query.ts` API and highlight contract for comments (17).
