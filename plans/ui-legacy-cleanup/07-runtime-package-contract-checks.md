# 07 — Runtime and packaged consumer contracts

Depends on: 02–06. Owner: fresh-output/module-resolution and supported consumer proof.

## Result

Fresh app/core builds resolve retained generated imports, exclude removed UI modules, and retain client/runtime/embed contracts. This gate verifies real output, not source grep alone.

## Files

- Extend existing core build/package/runtime suites found by ledger, including `preview-runtime.spec.ts`, `embed/runtime-frame-generated-load.spec.ts`, package consumer/import tests, and MCP package/build tests where they already cover app runtime resolution.
- Inspect `packages/histoire/src/node/virtual/{preview-runtime/preamble.ts,variant-test-mount.ts,histoire-app-bundled.d.ts}`.
- Inspect app Vite entries/aliases/output; change only missing retained entry/export exposed by fresh build.
- Retain app `api.ts`, `reusable.ts`, `index.ts`, bundle entries, preset embed entry, and required runtime paths from contracts.
- Write output evidence in this folder's `implementation-validation.md`.

## Tests first

1. Generate runtime source with existing fixture and resolve every app module import against fresh `packages/histoire-app/dist`, including interpolated absolute paths and relative embed adapter/preset paths.
2. Exercise built generated runtime loading/readiness and a representative story mount; existing browser/Vite harness owns virtual modules. A filename-exists check alone is insufficient.
3. Exercise public client `logEvent` import through package entry without old route view dependencies; keep retained API exports available.
4. Exercise standalone and reusable/embed consumer imports, using existing package fixtures and mock/runtime isolation helpers. Reusable source/SSR import guarantees remain those of each existing public entry; do not impose SSR safety on browser-only runtime files.
5. Verify preset adapter loads saved states and selected IDs using exact old keys, including special IDs, invalid data and denied storage.
6. Inspect final build module graph/output for removed router/UI. Extend existing build consumer regression only if needed: prohibit old route/view dependencies reachable from retained app inputs, including dynamic imports. This is a package boundary contract, not a source deletion-list unit test.

Reuse current build/import fixtures. Keep security/retirement checks at their owning adapters; do not create another generated-runtime evaluator.

## Build procedure

1. Confirm no other running operation owns emitted output before a clean package build. Coordinate if concurrent agents use dist; do not delete their files.
2. Run dependency-aware workspace build once, or documented package order from validation guide. Package scripts own their scoped `dist` cleanup.
3. Ensure app main prebundle, embed build, CSS build and copy step all complete, then core build consumes that output.
4. Run fresh-output tests after builds; do not run builds and emitted-worker tests in parallel.
5. Inspect `dist/bundled` and output references for old `router`, route views, old panel, modal and obsolete stores. If present, trace retained importer and repair its owning slice. Do not manually remove dist files to make evidence pass.
6. Confirm source-development entries and packaged entries preserve identical contracts; no runtime input lost merely because source import scan labels it unused.

## Acceptance

- All required runtime/module paths resolve and representative built runtime loads.
- Removed UI/state modules absent from freshly emitted app dependency graph/output.
- Presets, client APIs, generic mount/render components, custom controls and native embed surfaces work.
- No new public exports, aliases, protocol changes or dependency removals required unless explicitly recorded and justified within cleanup.
- Byte/size improvements reported only if measured against same build conditions; no promised percentage target.

## Handoff

Pass exact final source/build identity and successful fresh-output evidence to browser gate. Any source repair invalidates affected built tests; rebuild before claiming final acceptance.
