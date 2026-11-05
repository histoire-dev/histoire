# 11 — Post-install spotlight

Status: **complete**. Dependencies: [06](06-install-jobs.md), [09](09-install-wizard.md). Wave 5. Actual action/popover/custom toolbar anchors verified in [slice 13](receipts/13.md).

## Goal

After a successful install and restart, point at what the plugin actually added (7A). Example: "A11y tab added: Audits the selected variant with axe-core. Project results live in the new rail pane", with "Run audit" (when the contribution exposes a primary command), "Got it", and "1 / 2" paging.

## Owned files

- `APP/components/marketplace/spotlight/**`:
  - `MarketplaceSpotlightHost.vue` (replaces the stub)
  - `SpotlightCard.vue`
  - `use-spotlight-targets.ts` (maps contributions to DOM anchors via existing registries: rail item ids, inspector tab ids, toolbar items)
- Specs `packages/histoire-vue/src/__tests__/marketplace-spotlight.spec.ts`.

## Implementation steps

1. Write failing specs:
   - A completed job with contributions [inspector tab, rail pane] shows step 1 anchored to the tab, then "1 / 2" goes to the next step on the rail button.
   - "Got it" acknowledges and never shows again for that job.
   - A contribution whose anchor is absent (pane hidden, no story selected) is skipped.
   - With no anchors, a toast-like card offers "Open settings" instead.
   - Esc dismisses.
   - Focus moves to the card and back.
2. Read contributions from the live browser extension host registry, keyed by the installed plugin's workbench id (from the completed job's plugin id via `installedPlugins`). `JobState.contributions` may be empty. Never trust manifest `adds` for anchoring.
3. Copy comes from the contribution label and the manifest `adds[].text`. Titles read "<Label> tab added" or "<Label> pane added". No filler.
4. Use the popover positioning from `APP/components/base/popover/position.ts`. Highlight the anchor with a full outline ring (no side stripe).
5. If the "Open <pane> after install" option was checked in Review, open that pane first, then spotlight it.

## Acceptance criteria

- The spotlight specs pass.
- The acknowledgement persists per job.

## Exclusions

- Tours for already-installed plugins.
