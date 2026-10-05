# Validation and acceptance matrix

## Documentation delivery (initial phase)

Original documentation pack contained 22 Markdown documents (17 slices after the 2026-10-02 factory update). Implementation adds [evidence.md](evidence.md) and [conformance.md](conformance.md), bringing count to 24. Gap repair updated coordinated MCP slice-16 contracts and factory/review cross-references. Confirm file count, local links, existing source edit references, combined dependency graph, API naming, and whitespace. git diff --check does not inspect untracked file bodies; also check trailing whitespace/final newlines directly.

Initial planning delivery did not authorize runtime changes or dependency installs. User subsequently authorized slice implementation with subagents; [evidence.md](evidence.md) records current work and gates. Staging, commit, push, and publication still require separate instruction.

## Recorded baseline

Planning investigation against main 92ed1047eee696e4d0f309dc4fae872d145a422c ran current Histoire core Vitest suite: 71 files, 391 tests; 68 files/371 tests passed, 3 files/20 tests failed.

Failing suites: test-lifecycle.spec.ts, test-specs.spec.ts, test-targeting.spec.ts. Shared run-tests harness creates empty temporary project roots and mocks Vitest/module loading, but does not mock browser dependency preflight. Failure includes: `histoire test` runs stories in a browser and requires @vitest/browser-playwright and playwright in the project.

These are pre-implementation observations, not newly introduced failures or proof SDK works. Refresh baseline when implementation starts. Slice 01 repairs test harness only; direct real dependency checks remain intact.

Superseded context (2026-10-02 implementation): MCP slices 01–15 landed in committed base `0be17d23676860f9bb47a2bb4466f906946f6f3d`. Its [evidence](../mcp-server/evidence.md#baseline) records the same 71 files / 391 tests passing with a configured environment, and that work already repaired run-tests-harness.ts. Refreshed implementation baseline passed 121 files / 671 tests with loopback permission; sandbox-only failures were `listen EPERM: operation not permitted 127.0.0.1`. See [current evidence](evidence.md#initial-state-and-baseline). No additional speculative harness repair was needed.

Initial pnpm shim invocation failed with "mise ERROR Read-only file system (os error 30)". Investigation then ran installed Node directly against Vitest. Normal implementation commands below presume configured local Node/pnpm. Do not interpret shim failure as source test result or install globally to bypass it.

## Acceptance scenarios by subsystem

- Contracts/packages, 01: portable runtime/type import without Vue/Vite/Node/browser globals; compatibility re-exports; no package cycle; bounded JSON/graph accounting with cycles, aliases, Unicode, and traversal limits.
- Node ownership, 02: two roots, overlapping IDs, separate temp output, startup failure cleanup, stopped collector, restart ownership.
- Catalog/content, 03: atomic batches, empty/partial/failed collection, changed/removed Markdown, source-only revision, no browser launched for reads, immutable built-target reader with additive static capture metadata.
- Node hosting, 04: unrelated cwd, ephemeral port, HTTP/HTTPS middleware, two bases, unrelated host APIs/WebSockets, stable restart delegate, close ownership, nonce routes before static fallback, expired-route 404, built-preview readiness/cleanup.
- Session, 05: independent sessions, remembered/first/null selection, runtime requirement, canonical state, memory-only preferences, observer/event bounds.
- Sources, 06: enabled/disabled documents, dev/static parity, nested base, lazy assets, HMR/restart, zero extra story mounting.
- Bridge, 07: separate actual origins, allowlist denial, wrong frame/version/port, malformed data, stale ownership, no wildcard/referrer trust, hostile same-origin story traffic bounded, cross-origin editor/server-test opt-ins, storage-blocked third-party iframe, large catalog/cyclic state limit precedence and prompt oversize rejection.
- Preview/grid, 08: mocks, runtime-first boot, late same-story reload, grid non-current state, explicit hidden viewport, primary collision, per-variant setup isolation, globals, bridge-driven appearance, per-target visible geometry with scroll/lazy-cell updates.
- Vue/build/styles, 09: one host Vue runtime, standalone vendor runtime, no host router/Pinia requirement, SSR-safe import, two provider roots.
- Controls, 10: custom/generic edits, overlays beyond frame boundary, focus traversal/Escape/outside click, height shrink, theme/reflow, stale close.
- Docs/source, 11: inline/sibling/standalone, mocked stories, unsafe remote HTML, relative assets, local anchors, raw/dynamic distinction, stale loads.
- Tree/search/settings/events, 12: existing ranking, changing catalog, activation targets, focus-scoped shortcuts, independent panels/events.
- Tests/capture, 13: preview/server engines, precise target, fail versus collection error, cancellation cleanup, no fallback/retry, stale runs, optional dependencies, copied static preview without dev catalog, DPR 1/2/3 PNG dimensions, independent 4 MiB cap and preview close/restart.
- Explorer/standalone, 14: routes/history/hash, chooser preservation, docsOnly, slots, configurable mount target, plugin bridge, source-dev CSS.
- Installed consumers, 15: packed packages in fresh unrelated workspace, ESM/types/CSS/assets, peers, JS/Vue/HTTP examples.
- End-to-end, 16: combined origin/source/layout/framework/browser matrix, copied static/Node public assets, grid scroll/geometry, large/cyclic payloads, built-preview/DPR capture, CI and package evidence.

Use browser interaction/visual inspection for layout and host style isolation. Do not add class/style snapshot assertions. Tests should prove state, selection, messages, event routing, trust, focus, cancellation, and ownership.

## Performance budgets

Measured on the Vue example scaled to 500 stories / 2,500 variants and on the Nuxt UI example, Chromium, warm HTTP cache, static book on a different origin. Recorded per release in the slice 16 acceptance record; regressions over 20% are flagged, not CI failures, until baselines stabilize. Source: factory H25 ([factory requirements](../factory-requirements.md)).

| Metric | Budget (p95) |
| --- | --- |
| connect() including descriptor and catalog | ≤ 1.5 s |
| Descriptor size (gzip) | ≤ 512 KiB |
| preview mount to runtime ready | ≤ 2.5 s |
| selection.select variant switch, same story | ≤ 800 ms |
| state.patch acknowledgment | ≤ 100 ms |
| Three concurrent sessions ready on one page | ≤ 4 s |
| Node captureScreenshot, warm browser | ≤ 3 s |

## Implementation commands

Existing root has build/lint/test but no generic root typecheck script. Use real package compile commands. Build dependencies before tests reading compiled output.

~~~bash
pnpm --filter @histoire/shared build
pnpm --filter histoire build
pnpm --filter histoire test
pnpm --filter @histoire/controls test
pnpm run build
pnpm run lint
pnpm --filter histoire-example-vue3 test:examples
pnpm --filter histoire-example-svelte4 test:examples
pnpm --filter histoire-example-nuxt4 test:examples
~~~

New slices create these scripts before relying on them:

~~~bash
pnpm --filter @histoire/protocol build
pnpm --filter @histoire/protocol test
pnpm --filter @histoire/sdk build
pnpm --filter @histoire/sdk test
pnpm --filter @histoire/vue build
pnpm --filter @histoire/vue test
pnpm --filter histoire test:embed:integration
pnpm --filter histoire test:embed:consumers
~~~

Core focused suites run as pnpm --filter histoire test src/node/__tests__/embed/<name>.spec.ts; new package tests accept their own explicit suite paths. Browser/process/package suites get separate include/config so core unit invocation does not launch them accidentally.

Source-development probe: HISTOIRE_DEV=true histoire dev or existing dev:hst. Plain story:dev uses bundled app; it cannot prove source-dev aliases.

## Browser and framework evidence

Use shared Playwright integration harness in core embed tests, reusing current runtime/browser utilities. Chromium covers complete scenario matrix; Firefox/WebKit cover connection, preview lifecycle, overlay focus, and host isolation smoke. Browser installation explicit environment setup, never API side effect.

Two host origins must differ by actual scheme/host/port; simulating origin fields alone is insufficient. Test source under nested base and host with its own router, form controls, title/theme, HTTP API, and unrelated WebSocket.

Use existing Vue3, Svelte4, Nuxt4, and SvelteKit examples where practical. Current manifests use different Vite/framework generations; record baseline incompatibility and do not fold unrelated upgrades into SDK slices. Vanilla support uses existing generated token stories or shared fixture rather than duplicated runtime.

## Installed-package evidence

Pack locally and install complete required workspace dependency closure into temporary consumer outside repository. Use one helper for workspace version replacement/package staging without modifying source manifests.

Consumer uses exported built entries, not src paths, Vite virtual aliases, workspace symlinks, or current repo node_modules. Verify browser SDK graph excludes platform/framework/runtime packages; native UI graph contains one Vue; Node entry works from unrelated cwd without browser peers for read/dev workflows.

## Slice handoff record

~~~text
Slice:
Source revision and owned files:
Dependencies consumed / shared services reused:
Public/API changes:
Focused tests and builds:
Browser/framework/installed-package proof:
Baseline failures / environment limits:
Remaining acceptance work:
Concurrent changes preserved:
Commit/publication status:
~~~

Focused success is not full acceptance. Failures preserve exact short decisive error and affected gate. Do not silently mark unsupported feature available or substitute mocks for real cross-origin/package/browser proof.
