# 09 — Install wizard

Status: **complete**. Dependencies: [04](04-change-planner.md), [05](05-marketplace-shell.md), [06](06-install-jobs.md), [08](08-plugin-detail.md). Wave 4.

## Goal

Options (5A), Review (5B), Progress (6A), Failure (6C) and Manual (5C) steps, shown as centered cards inside the modal body with the breadcrumb "All plugins / <Plugin> / Install".

## Owned files

- `APP/components/marketplace/install/**`:
  - `MarketplaceInstall.vue` (replaces the stub; step switch)
  - `WizardSteps.vue`
  - `OptionsStep.vue`
  - `OptionField.vue` (boolean switch, segmented, select, string, string list)
  - `ConfigDiff.vue` (shared with 12)
  - `ReviewStep.vue`
  - `ProgressStep.vue`
  - `FailureStep.vue`
  - `ManualStep.vue`
  - `CommandBlock.vue` (copy)
  - `use-install-plan.ts` (re-plans on option change, debounced 200 ms, aborts superseded requests)
- Specs `packages/histoire-vue/src/__tests__/marketplace-install.spec.ts`.

## Implementation steps

1. Write failing specs with the fake transport:
   - Option changes request a new plan, and the diff updates ("+N lines").
   - A `when` condition hides dependent fields.
   - Continue leads to Review, which shows the command, the `package.json` and `histoire.config.ts` diffs, and the official/provenance row.
   - Review checkboxes: "Restart dev server when done" (default from `prefs.afterInstall`) and "Open <pane> after install" (only when `adds` has a rail pane).
   - "Copy commands instead" switches to Manual.
   - Install sends `job-start` with the plan id and hash.
   - Progress renders the step rows with `HstPulsatingDisc` on the running step, times, and output.
   - "Run in background" closes to All plugins while the job continues.
   - "Open pane" is enabled after `load`.
   - A failure renders the title, cause, log, suggestion button "Install <v> instead", "Copy log", "Install manually" and "Retry".
   - A `stale` error re-plans and returns to Review with a notice.
   - A `busy` error shows the running job.
   - A manual plan renders package manager tabs (the detected one first), the snippet and "Copy all".
2. Steps component: 1 Options, 2 Review, 3 Install. Completed steps are checkmarks, and clicking one goes back. No colored side stripes.
3. All cards share one width (920px, the polish fix) in a centered column with 24px/32px padding.
4. The output log is a bounded, scrollable mono block that auto-scrolls unless the user scrolled up. The progress region is `aria-live=polite`. The failure step uses `WorkbenchErrorState` for the header block (title "Install failed", detail with the "No project files were changed." suffix when restored), with recovery buttons in its `actions` slot.
5. Static builds: Install goes straight to Manual with reason "Static build. Run these steps in your project." The final step text is "Rebuild with `histoire build`" and "Done" closes.
6. Handle `awaiting` (see [contract amendments](contracts.md#wave-3-contract-amendments-orchestrator)):
   - `awaiting: 'continue'` (ask mode): show "Restart now", which sends `job-continue`.
   - `awaiting: 'restart'` (package-only change): in restart mode, call `POST /__histoire/dev/restart` automatically. In ask mode, show "Restart now", which calls it.
   - Put the restart call in one small helper, `install/restart.ts`, reused by 10 and 12.

## Acceptance criteria

- The wizard specs pass.
- The Review content equals the plan.
- Job state survives a page reload (via `job-current`).

## Exclusions

- The spotlight (11).
- The update dialog (12).
