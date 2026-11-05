# 12 — Updates and migrations

Status: **complete**. Dependencies: [04](04-change-planner.md), [06](06-install-jobs.md), [10](10-settings-management.md). Wave 5. Shared update-detail protocol/client and pin warning integrated in [slice 13](receipts/13.md).

## Goal

Update dialog (7C): plugin tile, "Update <Name>", and "<from> → <to>". Release notes with Breaking / New / Fix chips. An "Apply config migration" checkbox with the config diff. Buttons: "Skip this version", Cancel, Update.

## Owned files

- `NODE/marketplace/migrations/**`:
  - `handlers.ts` (replaces the stub, if any events are needed beyond plan and job)
  - `apply.ts` (declarative ops on the plugin call's options object, built on 04's `config-edit.ts` exports)
  - `select.ts` (migrations whose `from` range matches the installed version, in order)
- Planner hook: 04's `handlers.ts` calls `planMigrations(ctx, request)` when `kind: 'update'` and `migrate: true`. Adding that call is the only edit to 04's files; this slice owns it in wave 5.
- `APP/components/marketplace/update/**`: `MarketplaceUpdateDialog.vue` (replaces the stub) and `ReleaseNotes.vue`. Reuse 09's `ConfigDiff.vue`.
- Specs `NODE/__tests__/marketplace/migrations-*.spec.ts` and `packages/histoire-vue/src/__tests__/marketplace-update.spec.ts`.

## Implementation steps

1. Write failing node tests:
   - `rename-option` with nested paths.
   - `remove-option`.
   - `set-option`.
   - Several migrations across versions apply in order (0.3 → 0.4 → 0.5).
   - A non-literal options argument gives a manual plan (`migration-manual`) with the steps listed.
   - Unknown ops are rejected by the validator (01).
   - An idempotent rerun produces no diff.
2. Release notes come from every version between `from` (exclusive) and `to` (inclusive), concatenated newest first.
3. Dialog:
   - A native dialog over the current page (the settings page in 7C).
   - The migration checkbox is checked by default when migrations exist. Unchecking re-plans without migration and shows a warning that the config may need manual edits.
   - Update starts a job and shows compact progress in the dialog. `awaiting` is handled through 09's `install/restart.ts` helper. On success, close; on failure, open the modal failure step.
   - "Skip this version" stores `prefs.skippedVersions[id] = to` and closes, and the settings chip disappears.

## Acceptance criteria

- The migration and dialog specs pass.
- An update with migration writes exactly the shown diff (job integration test with fixture registry and package manager).

## Exclusions

- Executing package-provided migration code.
- Downgrades with migrations (pinning to a lower version shows a warning and no migration).
