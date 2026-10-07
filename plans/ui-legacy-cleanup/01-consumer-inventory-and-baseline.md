# 01 — Consumer inventory and baseline

Depends on: none. Owner: consumer ledger and baseline evidence. No deletion in this slice.

## Result

Every removal candidate has known current/runtime/test/build consumers and one owner. Retained runtime inputs are explicit. Baselines distinguish existing checkout failures from cleanup regressions.

## Scope

- Read `contracts.md`, `inventory.md`, current `AGENTS.md`, current Git status and candidate diffs.
- Inspect `packages/histoire-app/{vite.config.ts,vite.embed.config.ts,tsconfig*.json,package.json}` and `scripts/{copy,watchAndCopy,asset-path}.mjs`.
- Inspect app bundles, `app/index.ts`, `api.ts`, `reusable.ts`, `standalone/mount.ts`, `standalone/navigation.ts`, and `components/shell/WorkbenchApp.vue`.
- Inspect all generated app imports in `packages/histoire/src/node/virtual/preview-runtime/`, runtime preset imports, `variant-test-mount.ts`, alias/resolve utilities and bundled declarations.
- Search source, declarations, examples, docs, fixtures, package manifests, tests and generated-code template strings. Exclude emitted output only during source discovery; examine freshly built output separately in slice 07.
- Write `consumer-ledger.md` and `implementation-validation.md` in this folder when implementing.

## Procedure

1. Capture branch/HEAD, candidate status, date, package versions, and existing uncommitted edits. Record concurrent files without copying unrelated raw diffs into documentation.
2. Start from explicit standalone, client API, reusable, runtime, and embed build entries. Traverse static/dynamic imports and re-exports, including `.js` specifiers resolving to `.ts` source.
3. Add non-import consumers: generated absolute imports, explicit Vite entry strings, alias targets, copy/watch assets, framework/test mounts, dynamic source loaders and package-export paths.
4. For each candidate classify `remove`, `retain`, `modify`, or `inspect`; identify exact incoming imports. Test-only consumers need a behavior migration decision, not automatic retention or deletion.
5. Record the two old-router dependency paths from README. Confirm slice 02 removes sandbox edge and slice 03 removes story/event/command edges.
6. Verify every documented filename exists. Refresh paths changed by concurrent work. Do not recreate missing obsolete files.
7. Establish focused tests/typechecks from validation guide before implementation. Build consumed packages first when required. Record blocked/failed baselines with shortest decisive error and whether unrelated source explains them.

## Tests first

This slice inventories existing proof. Add new tests only where slices 02–03 expose missing behavioral contracts; do not add a test asserting that each ledger filename exists. Plan built-consumer checks for slice 07 at the existing package/build harness.

Inspect existing helpers before any new fixture:

- `core-tests/utils/fake-window.ts` and runtime-source/runtime-message helpers.
- `core-tests/utils/embed/` and `core-tests/embed/` generated frame fixtures.
- Existing native Vue provider/session/test harnesses in `vue-tests/`.
- Existing Cypress story fixtures, nested-base tests and package-consumer tests.

## Acceptance

- Every candidate and required output is accounted for, including explicit `standalone/presets.ts` embed input.
- Deletion sequence leaves no source imports referencing removed modules.
- Useful legacy test cases have named current replacement suites or justified retirement.
- Known unrelated edits/failures recorded; no source, dependency, or production config changes.

## Handoff

Ledger supplies exact paths and test ownership to later slices. Unknown consumers are resolved before their owning deletion slice, not deferred to final browser acceptance.
