# Validation and acceptance

Status: **executed with outstanding checks** (2026-11-05). Final counts and boundaries: [receipt 13](receipts/13.md). Browser, Cypress, docs build and refreshed-dist checks remain unrun.

## Test boundaries

- **Real code under test.** Use the real manifest validator, search/ranking, codemod, diff builder, package manager detection, and job state machine.
- **Allowed substitutes.** Substitute only external boundaries:
  - The npm registry: a local HTTP fixture server serving packuments and search JSON.
  - Package manager binaries: fixture executables on `PATH`, or passed as an override, that write `package.json`/lockfile and print scripted output, including the pnpm peer-conflict output from mockup 6C.
- **Real config path.** Real config load (`loadConfigFile`) runs on temporary fixture projects with real `histoire.config.ts` files.
- **App behavior specs.** These live in `packages/histoire-vue/src/__tests__/marketplace-*.spec.ts` and mount real components with a fake UI channel transport implementing the [contracts](contracts.md#ui-channel-events). Assert roles, names, text and emitted requests, never classes or styles.
- **Node specs.** These live in `packages/histoire/src/node/__tests__/marketplace/`.

## Commands

- `pnpm --filter histoire exec vitest run src/node/__tests__/marketplace`
- `HISTOIRE_MARKETPLACE_INTEROP=1 pnpm --filter histoire exec vitest run src/node/__tests__/marketplace/interop --reporter verbose` (real available managers; 60 s per scenario; opt-in keeps installs out of the default command, unavailable managers are explicitly skipped)
- `pnpm --filter @histoire/vue exec vitest run src/__tests__/marketplace-`
- `pnpm --filter <pkg> exec tsc --noEmit` for each touched package (`histoire`, `@histoire/shared`, `@histoire/app`, `@histoire/vue`)
- `pnpm exec eslint <touched paths>`
- `git diff --check`
- `pnpm --filter histoire exec vitest run src/node/__tests__/app-styling-guard.spec.ts` (Tailwind-only guard)

Never run `pnpm build` or any package `build` script. Process or Cypress checks that need a rebuilt `dist` are recorded as **unrun**, with the command to run.

## Acceptance matrix

- **Manifest**
  - Every official package validates.
  - Invalid fields are dropped with a diagnostic.
  - The generated `official.json` equals a fresh generation (drift test).
  - Unknown kinds and tints are rejected.
  - Oversized strings are rejected.
- **Catalog**
  - Official entries are available offline.
  - With community off, the registry is never contacted (assert the fixture server receives zero requests).
  - With community on:
    - A search hit beyond the first page is found.
    - A timeout returns official results plus `community: 'error'`.
    - Cache hits avoid refetching.
    - A stale cache serves `community: 'stale'`.
  - A non-`@histoire` package claiming official is not official.
  - Facet counts match filtered results.
  - Match ranges point to real substrings.
- **Inventory**
  - Installed version is read from the installed package, not the range in `package.json`.
  - `required` is true for framework support plugins and builtins.
  - An update is offered only for a semver-greater compatible version.
  - Local or workspace plugins show `local` and get no updates.
- **Planner**
  - Insert into an empty array, an array with entries, and `defineConfig` with or without a `plugins` key.
  - Imports are added once and deduplicated.
  - Options are emitted only when they differ from defaults.
  - Removal removes the import only when it is no longer used.
  - Options edits keep unrelated properties.
  - Non-literal arrays produce manual plans.
  - Each package manager gets the right argv (pnpm/npm/yarn/bun; workspace root `-w` for pnpm when needed).
  - The diff matches the bytes `writeConfig` would produce.
- **Jobs**
  - Happy path reaches `load` with contributions.
  - Package manager failure:
    - It restores `package.json` and the lockfile byte-for-byte and reports `restored: true`.
    - A peer conflict is parsed, and a suggested version satisfying the peer is offered.
  - Config write failure restores the backup and reports leftovers.
  - A second job is rejected with `busy`.
  - A stale plan hash is rejected.
  - Cancel during install kills the child process tree and restores files.
  - Restart mid-job: the receipt survives, and the next generation completes or fails `load`.
- **App**
  - Modal open, close and focus return work, and Esc closes.
  - "/" focuses search.
  - Discover and All plugins tabs work, and the search query persists between them.
  - Facets, sort and no-results recovery actions work.
  - The detail tabs work.
  - Wizard: Options produce a live diff, Review shows the command and files, Install shows progress, and failure, retry and manual flows work.
  - The static build always lands on the manual flow.
  - Settings rows: version, update, Required, the More actions menu (Options, Changelog, Pin version, Remove), and preferences persist.
  - The update dialog shows release notes and migration diff, and "Skip this version" persists.
  - The spotlight steps through the plugin's actual contributions and dismisses.
- **Accessibility**
  - The modal has `role=dialog` and `aria-modal` and traps focus.
  - The menu and tabs follow ARIA patterns.
  - Progress steps are announced with `aria-live=polite`, and failures with `role=alert` (via `WorkbenchErrorState` where it is a panel state).

## Receipt

Each slice receipt in [evidence.md](evidence.md) lists:

- Source state: HEAD and dirty files touched.
- Files added or changed, with line counts for new modules.
- Deviations, including contract changes needed in files the slice doesn't own.
- Exact commands with pass/fail counts.
- Proof boundary: unit, process, app behavior, manual.
- Unrun checks.
- Limitations.
- Readiness for dependents.
