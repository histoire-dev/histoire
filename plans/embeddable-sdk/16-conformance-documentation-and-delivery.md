# 16 — Conformance, documentation, and delivery

Implementation and local acceptance complete, 2026-10-03. [Conformance record](conformance.md) owns final source identities, complete bases plus affected checks, measurements and remaining remote-CI/warm-browser boundaries. No publication implied.

## Outcome and prerequisites

Depends on: 15.

Prove complete supported matrix and document practical ownership/deployment requirements. No implementation complete claim until real gates pass for final source state. [validation.md](validation.md) owns evidence format; [coordination.md](coordination.md) owns MCP integration limits.

## Owned files

- Complete core embed integration suites/config and shared browser/process/package fixtures.
- Add docs/guide/embedding.md, docs/reference/sdk.md, docs/reference/node-sdk.md; extend reference/config.md and docs/.vitepress/config.js navigation.
- Add .github/workflows/test-embed.yml and reuse existing Node/pnpm/cache/build conventions without unrelated workflow overhaul.
- Add integration acceptance matrix/release checklist under SDK documentation or this pack's validation record; record evidence separately from planning requirements.
- Extend core test:embed:integration/test:embed:consumers and new package test scripts as needed for CI filtering.

## Tests first

1. Audit existing slice coverage; add only missing behavioral matrix cells, not duplicate test implementations or snapshots.
2. Dev/static sources with same/allowed cross origin, iframe/native Vue, single/grid, multiple sessions, and nested base.
3. Vue/Svelte/Nuxt plus current vanilla/token support where applicable; preserve mocked stories and source-dev configuration.
4. Host-owned HTTP/HTTPS plus unrelated WebSocket, config restart, failed collection/recovery, unmount/dispose, and late old-document requests.
5. Controls focus/overlays, docs/assets/sanitization, raw/dynamic source, events/search/settings, preview/server tests/cancellation.
6. Chromium complete matrix; Firefox/WebKit bridge/lifecycle/focus/host-isolation smoke.
7. Local packed consumers and copied deployed static output; Node public artifact integration when MCP target available, without leaking private files.
8. Factory host cells ([factory requirements](../factory-requirements.md)): Nuxt 4 + Nuxt UI story under nested base `/_stories/` in dev/static/Node; third-party iframe with storage blocked in Chromium and WebKit; frame-ancestors present on embedded documents; deploy-time origin override without rebuild.
9. Performance budgets from [validation.md](validation.md#performance-budgets) measured on the example book and recorded per release; regressions over 20% flagged in the acceptance record (not a hard CI failure until baselines stabilize).
10. Version-skew cell (H24): initial protocol 1 has no predecessor. Prove range negotiation against a real protocol-1 book, unsupported-range rejection, and missing-capability errors; record predecessor-book coverage as not applicable. Once a predecessor exists, current host SDK must mount books built with previous and current protocol versions, and features the older book lacks report `CAPABILITY_UNAVAILABLE`.
11. Gap-repair cells: static preview capture from copied output without dev catalog, expired nonce 404 and close/restart cancellation, maximum viewport/DPR 3 with decoded dimensions and independent 4 MiB limit; two grid cells after scrolling/lazy removal; valid catalog response above generic 1 MiB cap and cyclic state through real parent gate.

## Implementation steps

1. Maintain explicit matrix with source/origin/surface/framework/browser/base/runtime dimensions and proof link per supported cell. Use targeted coverage rather than exhaustive redundant cross-product.
2. Reuse shared harness and meaningful fixture stories. Unit tests prove deterministic controller/ownership logic; browsers prove real origins/focus/assets/runtime behavior; installed consumers prove package shape.
3. Verify source config, capabilities, runtime requirements, state/reset semantics, primary ownership, hidden-preview sizing, persistence, and caller session/provider cleanup in docs.
4. Document exact origin allowlist, deploy-time override, and deployment behavior. Histoire dev/Node servers send frame-ancestors when embed is enabled; document the header for static hosts and that frame-src on the embedding host must allow the book. Document the trust boundary (book origin is one trust domain) and cross-origin opt-ins. Do not introduce auth infrastructure or weaken sandbox guards.
5. Document static embed capability limits, source base/assets, dev HMR middleware, HTTP attach/listen/ready order, restart/close, and Node test dependencies.
6. Include plain TypeScript/Vue/Node examples and explicit import/CSS entries. Mark internal adapters unsupported external API.
7. Add CI focused package tests, embed browser suite, and packed-consumer smoke. Build shared dependencies first and install browser binaries only as explicit CI/environment setup.
8. Keep current unit/framework workflows separate enough to identify baseline/environment failures. Do not add new source-side automatic install/exit behavior.
9. Recheck MCP source state before public Node artifact integration. If deploy target not landed, preserve precise pending integration gate; do not substitute mock output as acceptance proof or duplicate deploy implementation.
10. Review authored source/tests: modules below 300 lines, JSDoc present, ownership/cancellation comments useful, no duplicate utils/fixtures/queues/serializers or unnecessary tests.
11. Record final source revision and exact results for unit, focused build, framework browser, cross-origin browser, installed packages, and CI. Unrun/failed cells remain explicit.
12. Deliver local changes without staging/commit/push/publish/deploy unless separately instructed.

## API changes

No new API family. Reconcile implementation/docs/export names with public-api.md and add compatibility coverage for any necessary additive adjustment. Unsupported combinations remain capability errors rather than silent fallback.

## Failure paths

Baseline suite noise, missing browser binaries, unavailable deploy target, or CI environment failure must identify affected gate and decisive error. Never equate local focused success with complete matrix or exact-revision CI. Flaky ownership tests require root-cause repair, not arbitrary retries.

## Validation commands

~~~bash
pnpm run build
pnpm run lint
pnpm run test
pnpm --filter @histoire/protocol test
pnpm --filter @histoire/sdk test
pnpm --filter @histoire/vue test
pnpm --filter histoire test:embed:integration
pnpm --filter histoire test:embed:consumers
pnpm --filter histoire-example-vue3 test:examples
pnpm --filter histoire-example-svelte4 test:examples
pnpm --filter histoire-example-nuxt4 test:examples
git diff --check
~~~

Run configured Chromium/Firefox/WebKit projects in integration script. Build docs through actual docs package script after checking manifest. CI observation requires separate authorization to publish source; record local evidence meanwhile.

## Acceptance criteria

- All declared supported matrix cells pass at final source revision; remaining failures/unrun gates identified precisely.
- APIs/imports/config/runtime ownership/deployment headers/examples documented coherently.
- Browser and packed-consumer gates reproducible in CI; framework/source-dev compatibility preserved.
- No private deploy/MCP data exposed and no duplicated shared engine.
- Local work reviewed, concurrent changes preserved, no unauthorized Git/publication action.

## Non-goals

Automatic release/deployment, solving unrelated framework upgrades, expanding support matrix beyond roadmap, and auth/React/Web Components/screenshots SDK.

## Handoff

Provide final acceptance matrix, reproducible commands/artifacts, source revision, baseline/environment limitations, shared MCP integration status, and release checklist. Mark implementation complete only when required work passes; current documentation pack itself makes no runtime completion claim.
