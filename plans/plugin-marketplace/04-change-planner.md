# 04 — Change planner

Status: **complete**. Dependencies: [01](01-contracts-and-scaffolding.md). Wave 2. Package-input graph safety and pin downgrade warning integrated in [slice 13](receipts/13.md).

## Goal

Pure, side-effect-free `ChangePlan` for install, remove, update, pin and options edits. A plan holds package manager argv, exact file diffs, warnings, or a manual fallback with steps.

## Owned files

- `NODE/marketplace/changes/**`:
  - `handlers.ts` (replaces the stub; implements `marketplace-plan`)
  - `package-manager.ts` (detection and argv)
  - `config-edit.ts` (insert, remove and options edit on the plugin call)
  - `imports.ts`
  - `options.ts` (form values → call argument, defaults omitted)
  - `diff.ts` (line diff with 3-line context)
  - `manual.ts` (manual steps per package manager)
  - `plan-store.ts` (generation-scoped plan ids and hashes)
- `NODE/config/plugin-toggle-source.ts`: may gain exported helpers (`findPluginsArray`, entry spans) needed for insertion. Don't change existing exports' behavior.
- Specs `NODE/__tests__/marketplace/changes-*.spec.ts` with fixture configs under `NODE/__tests__/fixtures/marketplace/configs/`.

## Implementation steps

1. Write failing tests first, from fixture configs:
   - `defineConfig({})`
   - `plugins: []`
   - plugins with entries
   - disabled-marker entries from plugin toggles
   - `export default {}` without `defineConfig`
   - spread or variable plugin arrays (manual)
   - TS and JS configs
2. Package manager detection order:
   1. Settings override.
   2. `packageManager` field.
   3. Nearest lockfile walking up to the workspace root (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock` / `bun.lockb`).
   4. None, which gives a manual plan with reason `no-package-manager`.
   Report the source. Resolve the binary on `PATH` at job time (06), not here.
3. Argv per kind:
   - **Install:** `pnpm add -D <pkg>@<v>`; `npm install -D`; `yarn add -D`; `bun add -d`. Add pnpm `-w` when the project root is the workspace root and has `pnpm-workspace.yaml`.
   - **Pin:** add `--save-exact` / `-E`.
   - **Remove:** `remove` / `uninstall`.
   - **Update:** same as install with the target version.
   - `display` is the shell-quoted join, used only for copy.
4. Config edit:
   - Work through magicast or the same parser used by `plugin-toggle-source.ts`, preserving formatting.
   - **Insert:** add the named import once and append `Import(options?)` to the plugins array, creating `plugins` if absent.
   - **Remove:** remove the entry (including disabled-marker forms) and its import if unused.
   - **Options:** replace only the keys present in the form schema and keep other properties.
   - Then reparse the result and confirm the plugin array identity order, mirroring `applyPluginChanges`.
5. `package.json` diff: simulate the dependency change (sorted insertion in `devDependencies`, `^` prefix unless pinned) so 5B can show it. The real write is done by the package manager. 06 compares the result and warns on mismatch; it does not fail.
6. `plan-store.ts`:
   - Store the plan with its computed hash (argv, diffs, config hash) for the generation.
   - `verifyPlan(planId, hash)` recomputes and compares.
   - Plans expire after 15 min.
7. Manual plans (`static`, `config-not-literal`, `no-package-manager`, `migration-manual`) include install commands for all four package managers and the exact snippet with options, as in 5C.

## Useful tests

- Each config shape above: diff text equals what writing the result would produce (round-trip through the real loader on a temp copy for one TS fixture).
- Import dedupe.
- Defaults omitted.
- Remove keeps a shared import.
- Each package manager's argv, including the workspace root case.
- Hash changes when the config changes on disk.

## Acceptance criteria

- No file system writes outside a temporary check directory.
- Plans for all kinds.
- Manual fallback for every non-editable case.

## Exclusions

- Running package managers.
- Writing the config (06).
- Migrations (12 builds on `config-edit.ts`).
