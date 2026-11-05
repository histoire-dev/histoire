# 08 — Plugin detail

Status: **complete** (Wave 3 contract integration verified). Dependencies: [01](01-contracts-and-scaffolding.md), [02](02-catalog-service.md), [05](05-marketplace-shell.md). Wave 3.

## Goal

Plugin page (4A) with install entry point, tabs, and metadata column.

## Owned files

- `APP/components/marketplace/detail/**`:
  - `MarketplaceDetail.vue` (replaces the stub)
  - `DetailHeader.vue`
  - `InstallSplitButton.vue` (version menu)
  - `OverviewTab.vue`
  - `OptionsTab.vue` (read-only option reference from the manifest)
  - `ChangelogTab.vue`
  - `VersionsTab.vue`
  - `MetaList.vue`
  - `use-plugin-detail.ts`
- Specs `packages/histoire-vue/src/__tests__/marketplace-detail.spec.ts`.

## Implementation steps

1. Write failing specs:
   - The breadcrumb reads "All plugins / <Category>".
   - The header shows tile, name, Official chip, package id and publisher.
   - The Install split button's main action starts an install at `latest`.
   - The menu lists compatible versions, and incompatible ones are disabled with their reason.
   - Tabs are keyboard navigable (`role=tablist`).
   - The "Adds to your workbench" list renders `adds`.
   - The meta list renders Version, Updated, License, Requires, Frameworks, Access, Repository.
   - An incompatible plugin disables Install and shows the reason.
   - An installed plugin shows "Installed <version>" and "Update to <v>" when an update is available (this calls `startInstall({ kind: 'update' })`).
2. Overview: the summary and the adds list. If `logoUrl` exists, show it; no fabricated screenshots.
3. Options tab: a table of option label, type, default and description from the manifest.
4. Changelog tab: `releaseNotes` for the latest version (Breaking / New / Fix chips) and a link to the repository releases.
5. Versions tab: versions with date, a deprecated marker, and compatibility.
6. Meta column:
   - Requires: `requires.histoire`, nowrap.
   - Access: label "Declared by publisher" over the access items.
   - Mono values at 12px nowrap (the fix from the 4A check).
7. Loading, error and not-found states use the shared Workbench state components.

## Acceptance criteria

- The detail specs pass.
- Version choice flows into the install request.

## Exclusions

- The options form with diff (09).
