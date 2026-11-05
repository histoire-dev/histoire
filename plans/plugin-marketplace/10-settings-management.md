# 10 — Settings management

Status: **complete**. Dependencies: [03](03-installed-inventory.md), [05](05-marketplace-shell.md), [06](06-install-jobs.md). Wave 4.

## Goal

Settings › Plugins (board `Main`) and the manage menu (7B): an installed list with versions, updates, Required, enable switches, a More actions menu, marketplace preferences, and a rail dot when updates exist.

## Owned files

- `APP/components/pages/settings/PluginsSection.vue` and `usePluginToggles.ts`. Keep the toggle flow; refactor only so it can share the restart/receipt polling with job completion if natural.
- `APP/components/pages/settings/plugins/`:
  - `InstalledPluginRow.vue`
  - `PluginActionsMenu.vue`
  - `MarketplacePrefs.vue`
  - `use-plugin-updates.ts`
- Rail badge for Settings: `APP/components/shell/rail-items.ts` and `AppRail.vue`, or the `workbench.badges` source, whichever already owns badge counts. Only this slice edits them in wave 4.
- Specs `packages/histoire-vue/src/__tests__/marketplace-settings.spec.ts`. Update `workbench-installed-plugins.spec.ts` where its assertions change.

## Implementation steps

1. Write failing specs:
   - Header: title "Plugins", footnote "Plugin changes write to package.json and histoire.config.ts", and the "Browse marketplace" button, which calls `openMarketplace('discover', button)`.
   - The "Installed" card header has "Update all" (only when updates exist), which starts sequential update jobs. The second one starts after the first succeeds. Updates flagged `breaking` are skipped and open the update dialog instead.
   - Rows:
     - tile, name, package id, version (or "local")
     - "Update to <v>" chip button, which opens the update dialog (`store.openUpdate(id)`)
     - "Required" chip for required plugins (no switch, no remove)
     - enable switch for toggleable ones (existing flow)
     - "More actions" menu: Options, Changelog, Pin version, Remove
   - Options opens detail at the Options tab with an `options` change request.
   - Changelog opens the detail Changelog tab.
   - Pin version starts a `pin` job at the installed version.
   - Remove asks for confirmation in the menu ("Remove <name>?" / Remove / Cancel), then starts a `remove` job.
   - A row added by the last completed install job shows a "New" chip until it is acknowledged.
   - The Marketplace card:
     - "Community plugins" switch with detail "Show plugins not published by histoire-dev".
     - Package manager segmented control (Auto, pnpm, npm, yarn, bun) with detail "Detected from <source>" (from a plan probe or the updates response).
     - "After install" segmented control: Restart / Ask, with detail "Dev server restarts to load new plugins".
   - Static builds: no switches, no menu actions that write. "Browse marketplace" still opens the catalog.
2. `use-plugin-updates.ts` asks `marketplace-updates` when the section mounts and when the workbench starts (dev, community-independent for official plugins), and caches for the session. It feeds the Settings rail dot (accent tone) and the nav count badge.
3. Pin, update and remove jobs that end with `awaiting` reuse 09's `install/restart.ts` helper. Running jobs from settings show inline progress in the row (`HstPulsatingDisc` with the step label). Failures open the modal on the failure step.
4. Keep the existing docs/repo buttons inside the More actions menu, as "Documentation" and "Repository" items.

## Acceptance criteria

- The settings specs pass.
- Existing plugin settings and toggle specs pass (updated only where row markup changed).
- The rail dot appears only with available updates.

## Exclusions

- The update dialog content (12).
