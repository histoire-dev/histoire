# 14 — npm semver

Status: **complete**. Dependencies: 01–13. Wave 7. See [receipt](receipts/14.md); concurrent-suite/source-type blockers superseded by [slice 22 conformance](receipts/22.md). Default declaration-based checks still await watcher refresh.

## Goal

Replace the hand-written version evaluator in `NODE/marketplace/catalog/version.ts` with the `semver` package, so ranges, prereleases and comparisons match npm exactly. Callers keep the same exported API.

## Orchestrator pre-step

Before this wave, the orchestrator adds `semver` and `@types/semver` to `packages/histoire/package.json` and updates the lockfile (`pnpm add semver@^7.7.3 -F histoire`, `pnpm add -D @types/semver -F histoire`). The slice never runs a package manager.

## Owned files

- `NODE/marketplace/catalog/version.ts`
- `packages/histoire/src/node/__tests__/marketplace/catalog-version.spec.ts` (new; move version cases out of `catalog-search.spec.ts` only if they are duplicated there)

## Implementation steps

1. Write failing specs for cases the current evaluator gets wrong or doesn't cover:
   - Caret and tilde on `0.x` (`^0.2.3` excludes `0.3.0`), hyphen ranges, `||` unions, `x`/`*` wildcards, `>=1 <2` sets.
   - Prereleases: `1.0.0-beta.2 > 1.0.0-beta.1`, `^1.0.0` excludes `1.1.0-beta.1`, `^1.1.0-beta.1` includes `1.1.0-beta.2`.
   - Build metadata ignored in comparisons.
   - Invalid versions and ranges return `false`/throw exactly as the current API contract documents (keep the contract; don't widen callers' error handling).
2. Reimplement every export on top of `semver` (`compare`, `satisfies` with `includePrerelease: false`, `valid`, `validRange`). Keep names, signatures and JSDoc.
3. Delete the internal parser code. Keep the module under 100 lines.

## Acceptance criteria

- New version spec passes; every existing marketplace node spec still passes unchanged.
- `version.ts` has no hand-written range parsing.

## Exclusions

- Changing caller behavior or exported names.
