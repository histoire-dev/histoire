# Starpad requirements for Histoire

Starpad is the product (internal code name "factory": `@factory/*` packages in `nuxt-ai/workspaces/factory`).

Status: written 2026-10-02 for the authors of [embeddable SDK](embeddable-sdk/README.md) and [MCP server](mcp-server/README.md). Factory plans live in `/home/akryum/Projects/nuxt-ai/workspaces/factory/docs/` (links below are relative to this file). Coverage was mapped first, then the Histoire plans were updated; the matrix shows both. Review findings: [REVIEW-2026-10-02.md](REVIEW-2026-10-02.md).

## 1. Context

The factory is a product where people and AI agents build client apps as a tree of **blocks** (App, Feature, Component, Design system, Flow, Data, Integration, AI). Every generated app is a Nuxt 4 + Nuxt UI 4 + Tailwind v4 + rstore project that extends `@factory/app-layer` ([product model](../../nuxt-ai/workspaces/factory/docs/product-model.md), [app-layer architecture](../../nuxt-ai/workspaces/factory/docs/plans/app-layer/architecture.md)).

How the factory uses Histoire:

- **Block playgrounds**: codegen writes one story per visual block (`id="block:<blockId>"`), one variant per saved scenario (`id="scenario:<scenarioId>"`), controls from contract inputs, every contract output logged with `logEvent`, scenario mocks and in-memory rstore fixtures installed in story setup. The factory embeds them with the SDK (preview, grid, controls surfaces; `state.patch`, `events.subscribe`, `settings.update`). Source: [app-layer 14](../../nuxt-ai/workspaces/factory/docs/plans/app-layer/14-histoire-integration.md), [ui 65](../../nuxt-ai/workspaces/factory/docs/plans/ui/65-preview-playgrounds.md).
- **Design-system and component pages**: variant grids, theme switching across consumer design systems, "directions" (three live previews of one screen with different token overrides), contrast and a11y. Source: [ui 55](../../nuxt-ai/workspaces/factory/docs/plans/ui/55-design-screens.md), [ui 56](../../nuxt-ai/workspaces/factory/docs/plans/ui/56-component-pages.md), [ui 57](../../nuxt-ai/workspaces/factory/docs/plans/ui/57-design-system-tokens.md), `U59` in [QUESTIONS](../../nuxt-ai/workspaces/factory/docs/plans/QUESTIONS.md).
- **In-app context preview and compare**: the running preview app at a route with child blocks outlined, element picking and comment pins, two revisions side by side. This uses the factory's own preview bridge ([app-layer 13](../../nuxt-ai/workspaces/factory/docs/plans/app-layer/13-preview-bridge.md), [ui 18](../../nuxt-ai/workspaces/factory/docs/plans/ui/18-preview-frame.md), [ui 66](../../nuxt-ai/workspaces/factory/docs/plans/ui/66-preview-context-compare.md)), not Histoire. Histoire needs only the in-story equivalents (H17, H18).
- **Screenshots**: thumbnails per screen × state × device, visual tests against approved baselines, comment snapshots; stored by the factory as content-hashed `preview-artifact` blobs, max 4 MiB PNG ([foundations 13](../../nuxt-ai/workspaces/factory/docs/plans/foundations/13-blob-storage.md), [domain 14](../../nuxt-ai/workspaces/factory/docs/plans/domain/14-comments.md)).
- **Agent tools**: `list_stories`, `get_preview_url`, `capture_preview`, `run_story_tests` proxied host-side to Histoire MCP of the branch preview environment ([agents 07](../../nuxt-ai/workspaces/factory/docs/plans/agents/07-tool-gateway-and-domain-tools.md)); **deferred out of factory v1** ([factory review](../../nuxt-ai/workspaces/factory/docs/plans/REVIEW-2026-10-02.md), [agents review](../../nuxt-ai/workspaces/factory/docs/plans/reviews/agents.md)).
- **Hosting**: per-branch preview builds run in a factory sandbox on a separate registrable preview domain; the story book ships at `/_stories/` of preview and staging builds, never live; live workspaces run a dev server ([app-layer 16](../../nuxt-ai/workspaces/factory/docs/plans/app-layer/16-hosting-and-upgrades.md), `L2`, `X1`).
- **Security model** (factory review, [app-layer review](../../nuxt-ai/workspaces/factory/docs/plans/reviews/app-layer.md)): previews on a separate registrable domain; `SameSite=None; Secure; Partitioned` cookies only in the preview profile; server-verified bridge tokens, one key per purpose, no token in URLs. Preview code is written by agents and is **untrusted**.

Factory app-layer 14 assumptions `H1`–`H3` keep their numbers here (H1 Nuxt 4, H2 `logEvent` events, H3 preview URL for capture).

## 2. Requirements

Priority follows the factory review's v1 cuts: agent preview tools, compare region mapping, and live in-context preview are deferred.

**H1 — Nuxt 4, Nuxt UI 4, Tailwind v4, rstore stories.** v1. Why: every generated app is this stack ([app-layer README](../../nuxt-ai/workspaces/factory/docs/plans/app-layer/README.md), app-layer 14 assumption H1, G14 gate in factory ROADMAP). Accept: an example story using `UApp`, `UButton`, `useToast`, `useAppConfig`, Tailwind v4 `@theme` tokens, and an rstore query on in-memory fixtures renders in dev, static build under nested base `/_stories/`, and Node build; Nuxt color mode follows the session color scheme; launch from an unrelated cwd works.

**H2 — Story events are `logEvent` events.** v1. Why: contract outputs are logged with `logEvent` and read through `events.subscribe` (app-layer 14 assumption H2, ui 65 outputs log). Accept: `logEvent(name, payload)` inside a story reaches `events.subscribe` with structured target, runtimeId, sequence, timestamp, JSON-safe payload; stale-document events dropped.

**H3 — Headless capture from Node.** v1. Why: thumbnails (ui 55, `U59`), visual tests and baselines (app-layer 14), comment snapshot images (domain 14). The factory planned to open `sandboxUrl` in its own Playwright; the sandbox only signals readiness to a same-origin embedding frame, so that path is not feasible. Accept: `project.captureScreenshot({ storyId, variantId, width, height, deviceScaleFactor, colorScheme, textDirection, globals })` returns PNG bytes, decoded pixel dimensions, and SHA-256 from an active ready dev or built preview handle; same browser host as MCP. CSS viewport bounds, DPR, PNG pixel bounds, independent 4 MiB limit, source precedence, and typed errors follow [Node SDK contract](embeddable-sdk/public-api.md#node-sdk). Built preview owns nonce routes, immutable target lookup, and cleanup per [built preview capture ownership](embeddable-sdk/public-api.md#built-preview-capture-ownership); it does not depend on a live dev catalog or embed enablement.

**H4 — Deterministic capture.** v1. Why: visual tests compare pixels; flaky baselines block merges ([app-layer 14](../../nuxt-ai/workspaces/factory/docs/plans/app-layer/14-histoire-integration.md) "Visual tests"). Accept: animations and transitions off, reduced motion emulated, caret hidden, fixed DPR (default 1), fixed timezone `UTC` and locale `en-US`, fonts ready plus two frames; two captures of a fixture story give identical SHA-256. [MCP slice 16](mcp-server/16-capture-determinism-and-globals.md) proves DPR dimensions through input validation, PNG decoding, result validation, retention, and polling.

**H5 — Batch capture throughput.** Later. Why: stories × variants × 3 devices × 2 schemes per branch. Accept: `captureScreenshots(targets[])` reuses one browser with a fresh context per target; ≥ 1 capture/s per worker on the example book.

**H6 — Element rects in capture.** Later (compare region mapping is cut from factory v1). Why: map visual diff regions to blocks via `data-factory-block` (app-layer 14 `compareRevisions`). Accept: capture option `rects: { attribute: 'data-factory-block' }` returns up to 500 `{ value, x, y, width, height }` in viewport coordinates; attribute name validated, no selectors.

**H7 — Stable identity.** v1. Why: block and scenario ids are the join key everywhere; comment snapshots store `{ storyId, variantId, catalogRevision }` (app-layer 13 `PreviewStateSnapshot`, domain 14). Accept: ids with `:` preserved byte-for-byte across catalog, selection, events, MCP; `epoch`/`revision` exposed.

**H8 — Embeddable surfaces over a cross-origin bridge.** v1. Why: factory UI on its own origin embeds preview, grid, controls surfaces (ui 18, 65, 56). Accept: exact-origin handshake, one MessagePort per mount, finite commands, preview/grid/controls work cross-origin from dev and static books.

**H9 — Runtime-configurable allowed origins.** v1. Why: one preview build is promoted across environments; factory origins differ per environment (build-once-promote in app-layer review). Accept: static and Node books accept an origin allowlist override at deploy time without rebuilding; invalid override fails closed.

**H10 — Framing headers.** v1. Why: factory requires CSP `frame-ancestors` on everything it frames (app-layer 13 "Framing headers"); Histoire currently sets none. Accept: with embed enabled, dev server and Node server send `frame-ancestors 'self' <effective allowed origins>` on book documents; static docs give the header.

**H11 — Untrusted book origin.** v1. Why: agent-written story code runs on the preview origin; the factory must not trust anything it sends (factory review "Security"). Accept: SDK parent validates and size/rate-bounds every inbound message; story code forging wrapper messages cannot reach factory callbacks with unvalidated data; cross-origin `openInEditor` and server-mode tests are off unless configured; no credentials or tokens in URLs or descriptors.

**H12 — Works as a third-party iframe.** v1. Why: previews live on another registrable domain; browsers partition or block storage; gated books use `SameSite=None; Secure; Partitioned` cookies. Accept: surfaces and sandbox work with storage blocked (settings and color scheme come over the bridge, not `localStorage`); all book requests are relative same-origin; nothing requires cookies.

**H13 — Inputs and state.** v1. Why: inputs panel and "Save as test" (ui 65), comment snapshot state (ui 55, domain 14). Accept: `selection.select`, `state.get/patch/reset`, `init-state` baseline, serializable state — as in public API.

**H14 — Per-variant setup for scenario fixtures.** v1. Why: stories must never hit the network; scenarios install mocks, persona, flags, clock and an in-memory rstore fixture plugin ([app-layer review](../../nuxt-ai/workspaces/factory/docs/plans/reviews/app-layer.md), app-layer 14 scenario provider). Client flow screens drive the step machine through story state. `flows/simulate` is factory-owned (app-layer 13), not Histoire. Accept: `setupVue3({ app, story, variant })` sees variant `meta` for every variant mount; plugin state is isolated per variant in single and grid; works with the Nuxt plugin; documented limit if Nuxt shares one app per document.

**H15 — Theme overrides per session (globals).** v1. Why: design directions with token overrides (ui 55), component theme switching across consumer design systems (ui 65), `U59`. Accept: `settings.update({ globals })` delivers a small JSON-safe map to the running story without remount; story code reads it reactively; capture (H3) and MCP screenshots accept the same `globals`.

**H16 — Color scheme for Nuxt UI.** v1. Why: light/dark per preview (ui 65, 57). Accept: `settings.colorScheme` toggles the configured `sandboxDarkClass` (`dark` for Nuxt UI) through the bridge only (see H12).

**H17 — Preview layout geometry.** v1. Why: factory draws comment pins, cursors, proposal chips over embedded previews (ui 18 overlay conversion, ui 55 point comments). Accept: SDK reports each visible ready variant's structured target, content rect, scale, and visible clip rect in mount CSS coordinates. `runtime.viewports`, selected-entry `runtime.viewport`, and `layout.changed` follow [runtime geometry contract](embeddable-sdk/public-api.md#runtime-geometry). Updates include nested grid/source/host scroll, resize, settings, selection, and lazy mount/unmount; geometry from replaced documents is discarded.

**H18 — Host channel inside stories.** Later. Why: element picking, anchors (`block › tab › page › element`), block outlines and scroll sync inside story previews reuse the factory bridge protocol (app-layer 13), which cannot reach a story nested in Histoire's surface frame. Accept: opt-in named channel, JSON only, size and rate bounded, attributed to runtime/target, Histoire never interprets payloads.

**H19 — Several sessions and two books side by side.** v1. Why: compare two revisions, three directions, variant grid next to a playground (ui 66, 55). Accept: independent sessions on one page, each with its own book URL; host mirrors `selection.select`, `state.patch`, `settings.update`; `state.get` on both for state diff.

**H20 — Build and dev hosting.** v1. Why: per-branch preview builds in the factory sandbox (offline), dev server per live workspace (app-layer 14 "Hosting books", app-layer 16). Accept: `createHistoireProject({ root }).build({ outDir })` with embed enabled and base `/_stories/`; `startDev()` or `createMiddleware()`; ready promise and actual URL; no network access needed at build or dev time.

**H21 — Process isolation and multi-tenancy.** v1. Why: untrusted project code must run in its own sandbox process, never in the factory process. Accept: one project per process works from CLI or Node SDK; dev MCP can be disabled or token-protected on shared hosts; MCP handles scoped per principal (already planned).

**H22 — MCP agent tools.** Later (deferred in factory v1). Why: [agents 07](../../nuxt-ai/workspaces/factory/docs/plans/agents/07-tool-gateway-and-domain-tools.md) proxies list, preview URL, screenshot, tests. Props schema is not needed: the factory contract is the source. Accept: as MCP contracts; static books have no MCP, so the factory runs the Node target when it enables these tools.

**H23 — Story tests per variant.** Later. Why: "Run story tests" agent tool and Build › Tests (app-layer 14 contract item 8). Accept: as SDK `tests.run` and MCP `histoire_run_tests`.

**H24 — Version and compatibility contract.** v1. Why: the factory UI pins one `@histoire/sdk`; each generated app pins its own `histoire`, so host and book versions skew across projects. Accept: handshake negotiates a protocol version range; host SDK supports book protocol N and N-1; features gated by capabilities, never version sniffing; mismatch error names both ranges.

**H25 — Performance budgets.** v1 (measured, not hard CI gates at first). Why: Preview tab and design boards load several live previews. Targets on the example book (500 stories): connect + catalog ≤ 1.5 s p95; first preview ready ≤ 2.5 s p95; variant switch ≤ 800 ms p95; `state.patch` round trip ≤ 100 ms p95; descriptor ≤ 512 KiB gzip; single capture ≤ 3 s warm.

**H26 — App-context preview.** Not a Histoire requirement. Route mount, child-block outlines, personas, scenarios and compare of running apps are factory-owned (app-layer 13). Listed so nobody builds it twice.

## 3. Coverage matrix

"Before" is coverage in the Histoire plans as found; "Now" is after the 2026-10-02 update. Paths are relative to `plans/`.

| Id | Prio | Before: plan reference | Before | Change | Now |
| --- | --- | --- | --- | --- | --- |
| H1 | v1 | sdk validation.md "Browser and framework evidence"; sdk 02 (Nuxt sequential start); mcp 14 frameworks (nuxt4, base check skipped) | Partial | Thread root into Nuxt plugin `loadNuxt`; Nuxt UI 4 + Tailwind v4 + rstore example under `/_stories/`; Nuxt nested base proof | Applied: sdk/02 owned files + tests 6; sdk/15 owned files + tests 7; sdk/16 tests 8; mcp/16 tests 4 |
| H2 | v1 | sdk public-api.md "Selection, primary runtime, and state" (1,000 attributable events) | Partial (logEvent link implied) | Explicit `logEvent` test | Applied: sdk/12 tests 7 |
| H3 | v1 | mcp contracts.md `histoire_capture_screenshot`; sdk README non-goal "SDK screenshot API" | Partial (MCP only; `sandboxUrl` unusable by external harness) | Node SDK `captureScreenshot` on shared browser host and lane; built preview catalog and nonce-route ownership | Applied: sdk public-api.md "Node SDK" and "Built preview capture ownership"; sdk/03, 04, 13; mcp contracts.md "Planned additive changes" |
| H4 | v1 | mcp 09 readiness (fonts + one frame) | Partial | Determinism defaults and CSS/DPR/PNG dimension validation | Applied: mcp/16 input/result ownership and retention/poll tests; sdk public-api.md "Node SDK" |
| H5 | later | — | Gap | Batch capture with fresh context per target | Applied (planned): sdk public-api.md "Node SDK"; mcp/16 step 6 |
| H6 | later | — | Gap | `rects` option by data attribute | Applied (planned): mcp/16 step 5 |
| H7 | v1 | sdk public-api.md "Common identities"; mcp contracts.md "Common values" | Covered | — | Covered |
| H8 | v1 | sdk public-api.md "Source documents and cross-origin transport"; sdk 07, 08, 10 | Covered | — | Covered |
| H9 | v1 | sdk public-api.md (allowedOrigins in config only) | Gap | Deploy-time override file / env, fail closed | Applied: sdk public-api.md "Source documents…"; sdk/06 tests 7 |
| H10 | v1 | sdk 16 step 4 (docs only) | Partial | Histoire servers send `frame-ancestors` when embed enabled | Applied: sdk public-api.md; sdk/06 tests 8; sdk/16 |
| H11 | v1 | sdk public-api.md validators, sdk 07 | Partial (trust domain unstated, parent bounds missing, risky commands exposed) | Trust-domain rule, parent bounds, cross-origin opt-in for `openInEditor`/server tests | Applied: sdk public-api.md "Trust boundary"; sdk/07 tests 7–8 |
| H12 | v1 | sdk public-api.md persistence (parent only) | Gap (sandbox `useDark` reads storage) | Bridge-only settings in embedded documents; storage-blocked tests | Applied: sdk public-api.md; sdk/07 tests 9; sdk/08 tests 9; sdk/16 tests 8 |
| H13 | v1 | sdk public-api.md "Browser session methods", "Selection, primary runtime, and state" | Covered | — | Covered |
| H14 | v1 | Existing `setupVue3({ app, story, variant })`; sdk 08 mocks parity | Partial (isolation untested, Nuxt grid unknown) | Per-variant setup isolation test incl. Nuxt | Applied: sdk/08 tests 7 |
| H15 | v1 | — | Gap | `settings.globals` + `useHistoireGlobals()`; capture/MCP accept globals | Applied: sdk public-api.md "Settings…"; sdk/08 tests 8; mcp/16 |
| H16 | v1 | sdk public-api.md settings `colorScheme`; config `sandboxDarkClass` | Partial (storage-driven) | Bridge-driven color scheme | Applied with H12: sdk/08 tests 9 |
| H17 | v1 | — | Gap | Per-variant `runtime.viewports`, selected-entry `runtime.viewport`, and `layout.changed`; scroll/clip updates | Applied: sdk public-api.md "Runtime geometry"; sdk/08 tests 10 and step 9b |
| H18 | later | sdk public-api.md forbids generic `sendEvent` | Gap | Scoped opt-in host channel, new slice | Applied (planned): sdk/17; sdk public-api.md "Host channels" |
| H19 | v1 | sdk public-api.md "Selection…" (multiple sessions); sdk 15 examples | Covered | Perf covered by H25 | Covered |
| H20 | v1 | sdk public-api.md "Node SDK"; sdk 04 | Partial (Nuxt root, Nuxt base) | See H1 | Applied via H1 |
| H21 | v1 | sdk 02 (multi-root); mcp architecture.md decisions 3, 8 | Covered | Docs note for shared hosts | Applied: mcp/16 step 7 |
| H22 | later | mcp contracts.md read/execution tools; mcp 12 | Covered | Factory runs Node target when enabled | Covered (no change) |
| H23 | later | sdk 13; mcp 10, 13 | Covered | — | Covered |
| H24 | v1 | sdk public-api.md intro; sdk 01 non-goal "protocol version negotiation" | Covered | Version range negotiation in hello (`{ min, max }`), host supports N and N-1 for ≥ 6 months, capability gating; tests in sdk/07 and a skew cell in sdk/16 | **Applied**: public-api.md "Common identities" (negotiation contract), sdk/07 test 10, sdk/16 test 10 |
| H25 | v1 | — (mcp 14 non-goal "performance benchmarks") | Gap | Budgets recorded in validation | Applied: sdk validation.md "Performance budgets"; sdk/16 tests 9 |
| H26 | — | — | Not Histoire | — | Not Histoire |

Every v1 item is now planned in a slice; none is implemented. Later items H5, H6, H18 are planned only; H22 and H23 need no change.

## 4. Open questions for the Histoire plan authors

1. **Host channel or native picking?** H18 needs element picking and anchors inside stories. Recommended: a scoped, opt-in named channel (sdk/17); Histoire stays out of factory semantics. Native picking would duplicate the factory bridge.
2. **Globals scope.** Per session or per grid cell? Recommended: per session in v1; grids share the session's globals. Theme × state matrices use captures, not live grids.
3. **Capture source.** Resolved in [Node SDK contract](embeddable-sdk/public-api.md#node-sdk): ready built preview when present, otherwise ready dev; no fallback after admission. Built preview owns its catalog and host registry. Legacy output without capture metadata remains browsable and reports capture unavailable.
4. **Static origin override format.** Recommended: same-base `histoire-embed-origins.json` (`{ "version": 1, "allowedOrigins": [] }`, `Cache-Control: no-store`); Node target reads `HISTOIRE_EMBED_ORIGINS`; invalid override allows only the book origin.
5. **Compatibility window.** Recommended: host SDK supports protocol N and N-1 for at least 6 months after N ships; descriptor capabilities gate features.
6. **Nuxt in multi-root processes.** Recommended: not a supported claim; one Nuxt project per process. The factory runs one project per sandbox anyway (H21).
7. **MCP for static books.** Recommended: no; preview environments that need agent tools run the Node target.
8. **MCP screenshot defaults.** Turning animations off changes pixels of existing MCP screenshots. Recommended: accept; MCP never promised pixel stability.
