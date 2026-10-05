# Coordination with concurrent MCP roadmap

Read [MCP roadmap](../mcp-server/README.md) and its current [architecture](../mcp-server/architecture.md), [contracts](../mcp-server/contracts.md), and [validation](../mcp-server/validation.md). This pack does not edit them.

## Current neighboring requirements

MCP roadmap now has 15 slices, default-on local dev MCP, explicit disable, Node build target, production public/private artifact layout, and deployed compiled-preview test execution. Earlier notes describing opt-in-only MCP or 12 slices are stale. Embedding remains separately opt-in; neither feature's enabled flag controls the other.

Update 2026-10-02: MCP slices 01–15 are committed at 0be17d23676860f9bb47a2bb4466f906946f6f3d; MCP slice 16 (capture determinism, globals) remains a required implementation dependency. Landed modules the SDK slices must extend instead of creating:

- runtime/{types,controller,start,config-watchers,cleanup,execution-service,execution-types,port,wait}.ts.
- mcp/project/{runtime-catalog,snapshot,diagnostics,content,content-index,containment}.ts (generic parts move to runtime/catalog and runtime/content per step 3) and node/story-source.ts.
- @histoire/shared preview-url.ts (`getSandboxRelativeUrl`, `normalizePreviewBase`); protocol takes ownership with shared re-export.
- mcp/browser/{session,screenshot,preview-host,readiness,cleanup}.ts and util/playwright-cleanup.ts: the one browser host for MCP screenshots and the Node SDK captureScreenshot (slice 13).
- Built-preview capture: embed slice 03 owns shared immutable target reader/static metadata writer; slice 04 owns preview route/registry/lifecycle; slice 13 consumes that source. Static capture reuses mcp/browser host on preview origin without production MCP/auth server or live dev catalog.
- DPR input lives mcp/protocol/tool-schema.ts; PNG result bounds live operation-schema.ts; fingerprints in operations/admission.ts. MCP slice 16 owns scaled pixel/byte checks through retention/polling; Node capture consumes same rules.
- `mergeHistoireTestSummaries` in @histoire/shared test-results.

Error codes shared by name keep one meaning: SOURCE_UNAVAILABLE means story source unavailable in both packs; the SDK uses BOOK_UNAVAILABLE for an unreachable book.

## Canonical service ownership

- Lifecycle: Node runtime/{types,controller,start,config-watchers,cleanup}.ts. Both roadmaps consume one controller implementation. Embed slice 02 extends isolation from single-root process to per-context registries; MCP worker can still serve one project.
- Catalog: runtime/catalog/{types,snapshot,publication,diagnostics,lookup}.ts. Shared provider owns completed batches/epoch/revision. MCP project/catalog adapters retain wire projection, cursors, paging, and access restrictions.
- Content: runtime/content/{types,index,docs,source}.ts plus extracted node/story-source.ts. Reuse renderer, associations, physical/virtual source read, and revision identity. MCP containment/paging is separate policy, not browser default.
- Execution: runtime/{execution-service,execution-types}.ts. One lane per project serves Node SDK, server-mode embed/UI tests, MCP tests, and server screenshots. Browser tab's local preview tests retain own frame session.
- Preview URL: one portable constructor in protocol; shared package compatibility re-export satisfies MCP/app consumers. No second URL query implementation.
- Test lifecycle and summaries: existing runners/shared types. Portable serialized types move once into protocol with shared re-exports; callback/DOM-bearing types stay runtime-side.
- Wire limits/accounting: protocol owns finite command/stream limit precedence, JSON byte counting, and cycle-safe state graph budget; every transport reuses it. MCP-specific response/paging limits remain separate.
- Node deployment: build/node and deploy remain MCP-owned. Embed source output contributes public browser entries/content assets only.

## Implementation order and handoffs

1. Inspect actual source state before each slice. Plan filenames are not proof service exists.
2. If service already landed, extend it and its behavioral tests. If absent, create canonical module listed above; later MCP adapter consumes it.
3. If generic provider landed under mcp/project first, extract provider into runtime with temporary import/re-export compatibility. Preserve existing MCP schemas/limits and endpoints.
4. Do not keep parallel controllers, catalog readers, test queues, preview protocols, source readers, serializers, or project fixture harnesses.
5. State generation readiness/cleanup contracts explicitly when handing source ownership to another implementer.
6. Snapshot DTOs may project differently for browser and MCP; projections are allowed, duplicated collection/content/execution engines are not.

Shared edit hotspots: node/context.ts, stories.ts, markdown.ts, server/index.ts, server/collect.ts, server/dev-events.ts, config/*, build/*, shared/types/*, preview URL/state helpers, and existing run-tests harness.

Before concurrent edits, agree module ownership and dependencies. Preserve already edited files; reconcile updates without revert/reset. This document does not authorize spawning agents or messaging other chats.

## Boundary decisions

- Browser SDK is not MCP client. Embed commands do not tunnel arbitrary MCP tools or plugin events.
- Origin allowlist protects external browser bridge. MCP Host/Origin/authentication policy stays MCP-specific.
- Node SDK library imports never start MCP/listeners by side effect. Explicit dev startup preserves current effective config/default-on MCP assembly when that feature lands; lifecycle must close every attached service.
- Generic project factory supports multiple roots without chdir. MCP parent/worker process boundary and principal/job ownership remain unchanged.
- Shared execution lane owns scheduling/cancellation. MCP quotas, deduplication tombstones, job IDs, artifacts, and polling remain MCP adapter policy.
- Browser server tests target selected variant through existing dev runtime. Deployed MCP built-preview engine remains separate executor; static embed does not advertise remote server tests.
- Static-preview Node capture is library operation through shared browser/lane, not static browser server-tests or MCP endpoint. Capture chooses active preview when present, otherwise dev; no fallback after admission.
- Shared content provider can expose rendered HTML to browser and plain text to MCP. MCP never starts returning arbitrary HTML merely because browser panel needs it.
- Node build public/ contains embed documents only when enabled. Never put deploy/private content inventory, server.mjs, package.json, credentials, or HTTP auth settings in public descriptor.
- Native docs sanitization policy does not narrow legacy trusted-local renderer or MCP's text-only API.
- SDK first-variant default does not change standalone's chooser or MCP's explicit target rules.

## Cross-roadmap validation

After each shared change, run original consumer regression tests as well as owned tests. Verify imports remain separated: browser protocol/SDK contain no MCP/Zod/Node/Vite, production Node bundle contains no dev Vite/watchers/config evaluation, and source readers retain original UI behavior.

Record actual shared module APIs and owned tests in slice handoff. Re-check neighboring roadmap at integration milestone; if another agent changes it, record relevant compatibility updates here rather than overwriting their files.
