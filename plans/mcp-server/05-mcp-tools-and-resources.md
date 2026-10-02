# Slice 05 — Read tools and resources through SDK

## Outcome and prerequisites

Official SDK exposes read tool/resource contracts against project facade. Depends on 01, 03, and 04. Start with real in-process MCP client; network/process transports follow in 06/07.

## File ownership

- Add `packages/histoire/src/node/mcp/server/{factory,read-tools,resources,resource-templates}.ts`.
- Add `packages/histoire/src/node/mcp/project/{facade,preview-urls}.ts`.
- Add `packages/histoire-shared/src/preview-url.ts` and export pure helper from `packages/histoire-shared/src/index.ts`.
- Modify `packages/histoire-app/src/app/util/sandbox.ts` to use shared pure helper without changing public function signature.
- Add `packages/histoire/src/node/__tests__/mcp/{read-tools,resources,preview-urls}.spec.ts`.
- Extend shared SDK client harness, not duplicate a per-suite fake transport.

## Tests first

1. Actual SDK client discovers exactly six read tools and expected resources/templates; each tool validates inputs and outputs against published schemas.
2. Tools and resources return equivalent story/docs/source data and matching hash/revision. Resource domain failure becomes appropriate SDK error, not successful empty payload.
3. Starting, failed, empty, and restarting project states are distinguishable. get_project is available while initialization runs; other read tools fail explicitly until catalog ready.
4. Exact IDs and preview URLs work with reserved characters, custom base, router hash/history, and same variant ID in two stories. App/server sandbox URL construction agrees.
5. Catalog/content reads require no Playwright/Vitest imports or browser startup. Arbitrary config/hooks/environment/meta never appear in result.

## Implementation steps

1. Define createHistoireMcpServer({ project, principal }) returning fresh McpServer. Register tools/resources within factory; share transport-neutral project facade only. Public facade types must not require Context/Vite: production implements same reads from build snapshot in 12. Server name histoire, version from package metadata, concise instructions describing served book and operation workflow.
2. Register schemas/annotations from 01. Wrap domain service calls through one result adapter. Use SDK's documented error handling for resources and malformed wire requests.
3. Register finite project resource and parameterized story/docs/source templates. list resources must not eagerly inline all source text. Defer operations/artifact templates until 08/09; neither advertise unavailable handlers nor create dead placeholders.
4. Centralize SDK capabilities/registration paths. No sampling, prompts, elicitation, subscriptions, custom protocol tasks, or fabricated notifications.
5. Move pure sandbox relative URL builder into shared module accepting `{ base, storyId, variantId?, grid? }`. App wrapper passes existing values. Encode IDs using URLSearchParams; preserve `__sandbox.html` and explicit selected variant.
6. Build storyUrl with URL API and router-mode-specific placement of query/hash. Use actual runtime UI origin/base after listen, not assumed port 6006. Never accept a caller URL or leak MCP bearer token in preview link.
7. get_preview validates executable non-docsOnly story/variant but returns URLs only. Browser readiness is not claimed until screenshot job succeeds.
8. Verify optional dependency capability detection uses existing project resolvers and caches by runtime generation. Missing browser executable may only be discovered at launch; mark package availability accurately, without claiming successful browser proof.

## Acceptance and validation

Run SDK read/resource/URL suites, shared package build, core build, focused lint, and app sandbox/preview URL regressions. Inspect emitted app bundles/import graph for accidental SDK/Node modules. Record six-tool read milestone; no execution tools until their slices land.

## Non-goals and handoff

No listening sockets, stdio process, screenshots, controls state mutation, or subscriptions. Handoff factory/facade supports per-request HTTP SDK factory and stdio factory unchanged.

## Implementation evidence — 2026-10-02

- Implemented `createHistoireMcpServer({ project, principal, version, register?, readResource? })` in `mcp/server/factory.ts`. Version is required injection from real package metadata or deployed manifest, so server assembly has no runtime filesystem lookup. Both extension seams use the same principal/facade and register only handlers supplied by later slices.
- Public `HistoireMcpProject` in `mcp/project/facade.ts` depends only on protocol DTO types. `createDevMcpProject` in `dev-facade.ts` attaches catalog/content per generation, revalidates epoch/revision after asynchronous reads, and exposes synchronous private `capture(): { handle, catalog, content }` for operation admission. Closing this facade releases observers; caller still owns runtime shutdown.
- Six actual SDK read tools expose strict published schemas, read annotations, lifecycle/errors, exact story targets, and canonical content references. Project/story resources contain JSON; docs/source resources preserve original page text and carry revision/hash/paging in resource content `_meta`. Markdown uses `text/markdown`, source/inline docs use `text/plain`. Discovery lists one project resource and three templates, without eager source reads.
- SDK 2.2.0 high-level resource reading normalizes URI with `new URL` before template matching, which loses encoded dot-only story IDs. Shared public `server.server.setRequestHandler('resources/read', ...)` preserves raw canonical URI before decoding; discovery remains registered through SDK high-level APIs. Actual SDK client tests cover `.`, `..`, `%2E`, slash, Unicode, and reserved delimiters.
- Shared sandbox URL helper replaces app wrapper duplication. History story route now accepts optional path identity while retaining route name `story`; dot-only IDs use safe `storyId` query fallback. Hash/history URL tests use real bundled VueRouter and verify exact selected story/variant after browser URL parsing. Normal path identity takes priority; arbitrary query identity cannot select a story.
- Optional package checks use existing project-first resolvers, cache in generation, and never import or launch Playwright/Vitest. Installed package availability remains distinct from browser executable readiness.
- Focused five-file suite passed 23 tests on Node 22.23.1; combined catalog/content/read regression passed 51 tests in nine files. Shared, core, and app builds passed; focused lint and tracked whitespace checks passed. App emitted JavaScript scan found no MCP SDK, `node:` or server-facade imports. No listener/process/browser execution introduced by this slice.
- Shared fixture collision corrected during integration: original `utils/mcp/project.ts` exports retained; read-specific composition moved to `read-project.ts` and reuses shared project/story/context helpers. Combined regression verifies slices 03/04 consumers remain intact.
