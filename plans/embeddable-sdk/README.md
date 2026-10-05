# Histoire embeddability and SDK slice plans

Status: implementation and local acceptance complete, 2026-10-03. Authorized 2026-10-02 with one subagent per slice. Plans created against main, commit 92ed1047eee696e4d0f309dc4fae872d145a422c; implementation starts from committed MCP revision 0be17d23676860f9bb47a2bb4466f906946f6f3d. Pack contains 24 documents: 17 slices (01–16 for v1; 17 additive), five contract/coordination documents, [implementation evidence](evidence.md), and [conformance record](conformance.md). Written plans and dispatched agents do not establish runtime acceptance. Executed evidence establishes local runtime acceptance. Commits/publication still require separate authorization.

Correctness and comparable performance gates pass locally. Scale state acknowledgment p95 is 2.2ms after measured fix, against 100ms budget. [Conformance record](conformance.md) captures exact source identities, complete base suites and affected final checks. Warm-browser capture condition remains unproved; current API measures fresh browser/context. Unrestricted lint retains one untouched concurrent UI-plan parse error. Remote CI unrun; no commit, push, publication or deployment.

## Intended outcome

Any JavaScript host can embed Histoire explorer or independent UI surfaces through a TypeScript SDK. Vue hosts can compose native panels around isolated story previews. Both consume running Histoire dev servers and deployed static books, across same origin or explicitly allowed origins. Node applications can manage project operations or mount Histoire into their own HTTP/WebSocket server.

Standalone Histoire adopts the same session and UI implementation. Existing story syntax, framework plugins, CLI defaults, routes, controls, mocks, and embedded test lifecycle remain compatible.

## Read first

1. [Architecture and repository seams](architecture.md).
2. [Authoritative public API and ownership contracts](public-api.md).
3. [Shared services and MCP coordination](coordination.md).
4. [Validation, baseline, and acceptance matrix](validation.md).
5. [Current conformance matrix and delivery checklist](conformance.md).
6. Slice documents in dependency order. Supporting documents own shared contracts; slices must not redefine them.

## Slices and dependencies

1. [Contracts, packages, and baseline](01-contracts-packages-and-baseline.md). Depends on none.
2. [Project runtime isolation](02-project-runtime-isolation.md). Depends on 01.
3. [Catalog and content services](03-catalog-and-content-services.md). Depends on 02.
4. [Node SDK and middleware hosting](04-node-sdk-and-middleware-hosting.md). Depends on 02, 03.
5. [Browser session controller](05-browser-session-controller.md). Depends on 01.
6. [Dev and static source adapters](06-dev-and-static-source-adapters.md). Depends on 03, 05.
7. [Cross-origin bridge and iframe surfaces](07-cross-origin-bridge-and-iframe-surfaces.md). Depends on 05, 06.
8. [Preview and grid runtime ownership](08-preview-and-grid-runtime-ownership.md). Depends on 07.
9. [Vue provider, controls build, and style isolation](09-vue-provider-controls-build-and-style-isolation.md). Depends on 08.
10. [Controls and overlay integration](10-controls-and-overlay-integration.md). Depends on 08, 09.
11. [Docs and source panels](11-docs-and-source-panels.md). Depends on 03, 08, 09.
12. [Navigation, search, toolbar, and events](12-navigation-search-toolbar-and-events.md). Depends on 09, 11.
13. [Tests and cancellation](13-test-execution-and-cancellation.md). Depends on 04, 08, 09; Node capture also depends on [MCP slice 16](../mcp-server/16-capture-determinism-and-globals.md).
14. [Explorer and standalone adoption](14-explorer-and-standalone-adoption.md). Depends on 10, 11, 12, 13.
15. [Package consumers and integration examples](15-package-consumers-and-integration-examples.md). Depends on 14.
16. [Conformance, documentation, and delivery](16-conformance-documentation-and-delivery.md). Depends on 15.
17. [Host channels](17-host-channels.md). Depends on 08, 12, 16. Additive implementation and local conformance/package acceptance complete; no publication implied.

Factory host requirements (H-ids) are mapped to these slices in [factory requirements](../factory-requirements.md); review notes in [REVIEW-2026-10-02](../REVIEW-2026-10-02.md).

Dependency graph permits independent work after prerequisites, but does not authorize agent delegation. Shared source ownership must be coordinated before simultaneous edits.

## Milestones

- Foundation: 01–05 establish contracts, per-project Node ownership, shared data services, middleware, and framework-neutral sessions.
- Remote rendering: 06–09 establish dev/static data bridges, cross-origin mounting, preview/grid ownership, and native Vue foundation.
- Independent parts: 10–13 expose controls, content, navigation/search/settings/events, and supported test workflows.
- Shared explorer and delivery: 14–16 migrate standalone, prove installed consumers, and validate framework/browser/deployment combinations.

## Confirmed defaults

- Embedding opt-in; source origin allowed automatically when enabled. Additional origins require exact allowlist entries, overridable at deploy time without rebuild. Histoire servers send frame-ancestors for embedded documents.
- Book origin is one trust domain; hosts treat all bridge traffic as untrusted. Cross-origin openInEditor and server-mode tests need explicit opt-in.
- Framework-neutral browser SDK plus Vue adapter. Other frameworks use iframe API.
- One primary preview/grid per session; multiple sessions supported.
- Runtime execution explicit. Data-only access does not mount stories. Caller can explicitly create hidden preview.
- Runtime owns canonical state. Host retains serializable mirror.
- Embedded persistence off by default. Host URL, document title, global theme, and router remain host-owned.
- No automatic execution retry or preview-to-server test fallback.
- Managed Node server and host-owned middleware/WebSocket integration both included.
- No commit, push, publish, or deploy without separate instruction.

## Global implementation rules

- Preserve unrelated dirty, staged, untracked, and concurrent changes, including ../mcp-server.
- Authored source/test modules stay below 300 lines. Documentation exempt. Split by responsibility rather than adding catch-all utilities.
- Add JSDoc to functions, classes, types, and properties; explain ownership, synchronization, and cancellation logic.
- Write valuable behavior tests first. Avoid CSS/class assertions, implementation-mirroring tests, duplicated fixtures, and test count goals.
- Reuse existing runtime, framework generators, Markdown renderer, dependency resolvers, serialization, timeout helpers, and test utilities.
- Move shared definitions once with compatibility exports. Browser packages cannot acquire Node, Vite, MCP, or bundled Vue dependencies.
- Keep planning evidence, focused tests, build success, browser acceptance, installed-package proof, and CI distinct.

## Non-goals

React adapter, Web Components, arbitrary host-supplied story loaders, browser SDK screenshot API (Node captureScreenshot is in scope, slice 13), source editing, SSR story rendering, authentication infrastructure, or a second story/test engine. Node production deployment and MCP protocol/authentication remain owned by [MCP roadmap](../mcp-server/README.md); this roadmap integrates public embed output with those services without replacing their contracts.
