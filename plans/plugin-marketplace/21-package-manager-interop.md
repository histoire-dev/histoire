# 21 — Package manager interoperability harness

Status: **complete** (orchestrator integration: `jobs/peers.ts` checks installed peers after a zero manager exit; interop npm 6/6, pnpm 6/6, yarn/bun unavailable). Dependencies: 18, 19. Wave 9. Harness and verification recorded in [receipt 21](receipts/21.md).

## Goal

Prove install, remove, update, failure rollback and dependency repair with real package manager binaries against a local registry, instead of fixture executables only.

## Harness

- `packages/histoire/src/node/__tests__/marketplace/interop/` (new):
  - `registry-server.ts`: local HTTP npm registry serving packuments and `.tgz` tarballs built in-process from fixture package directories (gzip + tar via Node APIs or an existing dev dependency; no network). Supports a peer-conflicting version and an auth-required mode.
  - `projects.ts`: temporary projects with `histoire.config.ts`, `package.json`, project `.npmrc` pointing at the local registry, isolated cache/store dirs (`npm_config_cache`, `PNPM_HOME`/`store-dir`, `YARN_CACHE_FOLDER`, `BUN_INSTALL_CACHE_DIR`).
  - `interop.spec.ts`: runs the real job runner (no fake transport beyond the UI channel boundary) per manager available on `PATH`; unavailable managers are skipped with a visible `it.skip` reason, never silently passed.
- New command: `pnpm --filter histoire exec vitest run src/node/__tests__/marketplace/interop` (longer timeout). Not part of the default marketplace command; add it to [validation](validation.md#commands).

## Cases per manager

- Install writes `package.json`, the lockfile and `node_modules/<id>`; load check passes on the restarted generation (use the existing generation test helper).
- Remove restores a project without the plugin.
- Update to a newer fixture version applies a declared migration.
- Peer conflict fails, restores `package.json`/lockfile bytes, repairs `node_modules` (slice 18) and offers the suggested version.
- Auth-required registry succeeds with a project `.npmrc` token (slice 19).

## Owned files

- `packages/histoire/src/node/__tests__/marketplace/interop/**`, fixture packages under it.
- `plans/plugin-marketplace/validation.md` (commands list only).

## Acceptance criteria

- At least npm and pnpm cases run and pass locally; skipped managers are listed in the receipt.
- No request leaves 127.0.0.1 (assert registry env and `.npmrc` only point locally; run with `npm_config_offline=false` and no other registry configured).

## Exclusions

- Cypress dev install (would mutate the example project); the harness covers the server path end to end.
