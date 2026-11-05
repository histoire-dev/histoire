# 07 — Browse and discover

Status: **complete** (Wave 3 contract integration verified). Dependencies: [01](01-contracts-and-scaffolding.md), [02](02-catalog-service.md), [05](05-marketplace-shell.md). Wave 3.

## Goal

The All plugins (2A, 3A), Discover (2B) and No results (3C) views inside the modal.

## Owned files

- `APP/components/marketplace/browse/**`:
  - `MarketplaceAll.vue` and `MarketplaceDiscover.vue` (replace the stubs)
  - `PluginCard.vue`
  - `CategoryNav.vue`
  - `FacetPanel.vue`
  - `ResultsBar.vue`
  - `MatchText.vue`
  - `NoResults.vue`
  - `DiscoverHero.vue`
  - `CollectionRow.vue`
  - `use-catalog-query.ts` (debounced 150 ms, aborts superseded requests, keeps the last page while loading)
- Reuses 05's `shell/PluginTile.vue`.
- Specs `packages/histoire-vue/src/__tests__/marketplace-browse.spec.ts`, using the 05 transport.

## Implementation steps

1. Write failing behavior specs against the fake transport:
   - Category nav counts come from `facets`.
   - Clicking a category filters.
   - Search highlights matches with `<mark>` from `match` ranges.
   - Facet toggles update the request.
   - "Reset" clears facets.
   - The results count reads "N plugins".
   - The "Works with Vue 3" chip reflects `project.frameworks`.
   - The sort menu offers Relevance / Name / Recently updated.
   - Install on a card calls `store.startInstall({ kind: 'install', id })`.
   - An installed card shows "Installed".
   - A card click opens detail.
2. **All plugins:**
   - Left category nav: All plus five categories, with counts.
   - Toolbar: results count, framework chip, sort.
   - Responsive card grid.
   - Cards: tile, name, "Official" chip, publisher, summary, category and adds meta, Install / Installed.
   - When filters or a query are active, show the facet panel (3A): Category, Framework (detected marked "detected"), Publisher "Official only", Adds.
3. **Discover:**
   - "For this project" stack chips (`project.signals`, outline chips).
   - Hero card with reason and Install / Details.
   - Side picks with reasons.
   - Collection rows with "See all", which switches to All with the collection's filter.
   - Hero art: show the entry's `logoUrl` or monogram large. Don't fabricate a workbench sketch.
4. **No results (3C):**
   - `WorkbenchEmptyState` icon `search`, title "No matches", detail "Nothing for <q>query</q>" plus the active-filter context.
   - Actions: "Include community plugins" (only when community is off; sets the pref), "Clear filters".
   - "Try" chips come from collection titles.
   - Footer link "Plugin guide" to `docs/guide/plugins/development`.
5. Loading uses `WorkbenchLoadingState` "Loading plugins" on first load only. Errors use `WorkbenchErrorState` "Couldn't load plugins" with "Retry". When `sources.community` is `error` or `stale`, show an inline note, e.g. "Community plugins unavailable". Official results stay visible.

## Acceptance criteria

- The browse specs pass.
- There are no request storms while typing (assert at most one in-flight request after rapid typing).

## Exclusions

- The detail page.
- The install wizard.
