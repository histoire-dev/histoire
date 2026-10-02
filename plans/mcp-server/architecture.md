# Architecture and repository seams

## Evidence from this checkout

| Existing file | Current behavior | Planned reuse/change |
| --- | --- | --- |
| `packages/histoire/src/node/bin.ts` | Sade commands dynamically import command modules | Add stdio command and dev HTTP flags; retain lazy imports |
| `packages/histoire/src/node/commands/dev.ts` | Creates context/server and restarts on config changes | Extract owned runtime controller shared with MCP worker |
| `packages/histoire/src/node/context.ts` | Resolves project config/Vite root and plugin commands | Remains sole project configuration entry |
| `packages/histoire/src/node/server/index.ts` | Creates two Vite servers, watchers, collector; returns before initial collection settles | Expose readiness and catalog publication hooks; own cleanup on partial startup |
| `packages/histoire/src/node/server/collect.ts` | Debounces collection and invalidates modules before story-change messages | Publish completed batches after invalidation; guard stopped generations |
| `packages/histoire/src/node/collect/index.ts` | Logs collection errors, can leave previous story metadata in place | Return typed outcome while preserving current UI logging |
| `packages/histoire/src/node/stories.ts` | Module-global context and change listener lists | One active project runtime per process; unregister owned listeners |
| `packages/histoire/src/node/markdown.ts` | Scans sibling/standalone Markdown; watches add/unlink, not change | Add correct in-place update path; split watcher responsibilities to stay below 300 lines |
| `packages/histoire/src/node/virtual/story-source.ts` | Reads raw physical source or virtual module code | Extract reusable read helper; keep existing source-panel behavior |
| `packages/histoire-shared/src/types/story.ts` | Server story/variant metadata lacks live state, rendered source, and test definitions | Project explicit DTOs; do not claim those missing capabilities |
| `packages/histoire-app/src/app/util/sandbox.ts` | Builds `<base>__sandbox.html?storyId=…&variantId=…` | Move pure URL construction into shared helper used by app and server |
| `packages/histoire/src/node/virtual/preview-runtime/host-messaging.ts` | Readiness messages require an actual same-origin embedding frame | Screenshots use minimal same-origin host with iframe; no top-level sandbox readiness assumption |
| `packages/histoire-shared/src/types/preview-message.ts` | Story/variant-scoped readiness and state messages | Reuse readiness constants/guards; introduce no duplicate preview protocol |
| `packages/histoire/src/node/test/run.ts` | Browser collection, specs, project Vitest, summary, per-run cleanup | Reuse with captured context, `skipStoryScan: true`, and propagated cancellation |
| `packages/histoire/src/node/server/dev-events.ts` | UI test requests currently serialize in a local promise chain | Replace chain with execution service shared by UI and MCP |
| `packages/histoire/src/node/util/vitest-run.ts` | Retry and cleanup for both browser collection and tests | Add AbortSignal once here, not an MCP-specific parallel runner |
| `packages/histoire-plugin-screenshot/src/index.ts` | Static build hook using capture-website/Puppeteer | Remains unchanged; MCP screenshots are live Playwright operations |
| `packages/histoire/src/node/build/index.ts` | Writes static assets, entry HTML, and histoire.json into outDir | Add static/node target layout and standalone runtime bundling after existing collection/build |
| `packages/histoire/src/node/build-serialize.ts` | Drops most docsText and all raw docs/source from histoire.json | Write separate private MCP snapshot from collected context for Node target |
| `packages/histoire/src/node/preview.ts` | Dev-style static server with port increment and project Context | Preserve preview; production server loads only built artifact, with fixed port and lifecycle |
| `packages/histoire/src/node/virtual/variant-test-session/index.ts` | Embedded test collection/execution reused by preview and CLI harness | Deployed tests use compiled preview protocol; no production Vite or source runner |

Core package requires Node >=22. Browser peers are optional. `packages/histoire/tsconfig.json` currently uses `moduleResolution: node`; SDK v2 subpath exports need an isolated compilation/import proof before changing compiler options. Existing examples have different Vite/framework generations; do not fix unrelated upgrades as part of MCP.

## Product decisions

1. Build inside `histoire`, under `src/node/mcp/`, with dynamic command imports. MCP HTTP is enabled by default in dev; build/test commands start no listener. Keep executable server SDK out of app bundles and separate production imports from dev/Vite modules.
2. `histoire mcp --root <directory> --config <file>` serves stdio. Default root is launch cwd. A child process owns project config, Vite, watchers, browsers, and all runtime logging. Parent owns SDK transport and IPC only. Child stdout/stderr are drained into parent stderr; parent stdout contains MCP messages only.
3. Plain `histoire dev` starts separate `127.0.0.1` MCP HTTP listener at `/mcp`. `--no-mcp` or `mcp: false` disables it; `--mcp` explicitly re-enables a config-disabled endpoint. UI Vite port/host/base remain independent. `--host` never widens MCP binding. Local native clients need no token by default; if HISTOIRE_MCP_TOKEN is supplied, bearer is required. No token in config, URLs, logs, resources, or command arguments.
4. Dev HTTP port defaults to 6007; default collision selects ephemeral port and reports actual URL. Explicit --mcp-port collision fails instead of choosing another port. --mcp-port 0 requests ephemeral port. This keeps ordinary dev usable when multiple projects run. Stdio project worker explicitly disables dev HTTP listener, uses ephemeral loopback UI port, and never opens browser tab.
5. v1 supports current protocol revision 2026-07-28 and SDK-provided stateless legacy compatibility for 2025-11-25. Older versions are not promised. Use SDK negotiation/codecs, not custom wire parsing.
6. SDK v2 `createMcpHandler(factory)` creates request-local servers. Keep catalog, jobs, artifacts, and execution service on project controller, outside factory. v1 requires no `Mcp-Session-Id` and does not advertise subscriptions or protocol tasks.
7. `serveStdio(factory)` handles stdio framing and negotiation. Shared `createHistoireMcpServer` registers the same tools/resources for both SDK factories.
8. Every transport captures explicit principal: stdio lifetime, controller-local native-client principal, or verified HTTP bearer identity. Unauthenticated local dev is one trusted local principal, not per-user isolation. Production uses configured credential identity. Random operation/artifact handles are capabilities, scoped to principal and runtime epoch. Never enumerate other clients' jobs.
9. Catalog publication is atomic after initial scan and a completed collector batch. During recollection, reads use last completed snapshot plus `updating: true`; browser operations require current stable revision. Failed recollection removes executable target availability and reports diagnostics instead of silently using stale metadata.
10. Config restart increments epoch, rejects old handles/cursors, cancels execution, replaces context, and exposes `restarting` until ready. Controller survives restart; unchanged HTTP endpoint policy retains listener, changed enabled/port policy replaces it. Stdio worker stays alive and follows same controller.
11. `histoire build --target node` or config `build.target: 'node'` emits self-contained Node deployment into configured outDir: server.mjs, package.json, public browser assets, private versioned catalog/docs/source. Static remains default and retains existing root layout. CLI --target overrides config; no SSR or production dev server.
12. Generated server runs on Node >=22 using HOST (default 0.0.0.0), PORT (default 3000), and PUBLIC_ORIGIN. Remote deployment requires absolute http(s) PUBLIC_ORIGIN plus HISTOIRE_MCP_TOKEN when MCP enabled. TLS terminates at deployment proxy. Credentials and origin are runtime values, never embedded in artifact.
13. Production book HTTP listener serves public assets and `<base>__histoire/mcp`; private files never enter static root or history fallback. No watchers, collection, project config evaluation, Vite, or onDev/onPreview hook evaluation at production startup. Application catalog is immutable build snapshot; runtime epoch changes per process.
14. Deployed screenshots reuse same browser host/readiness service against compiled public assets. Deployed tests drive existing COLLECT_TESTS/RUN_TESTS iframe protocol and embedded lifecycle, not runHistoireTests/Vitest project runner. Report `engine: built-preview`; dev reports `engine: project-vitest`. Optional Playwright/Chromium remains runtime prerequisite for browser operations. If build lacks embedded test runtime, tests report CAPABILITY_UNAVAILABLE.

## Module boundaries

```text
src/node/runtime/        Project lifecycle, captured generation, shared execution service
src/node/deploy/         Versioned artifact reader, production HTTP server, lifecycle
src/node/build/node/     Private snapshot writer and standalone server bundle
src/node/mcp/
  protocol/             Zod schemas, DTOs, limits, result/error adapters, URI codec
  project/              Catalog snapshots, read services, runtime facade
  server/               SDK factory, tool registration, resource registration
  transport/            stdio parent, worker IPC, HTTP listener/guards
  operations/           Job records, queue admission, principal/epoch checks, artifacts
  browser/              Playwright loader, same-origin host, readiness, screenshots
src/node/__tests__/mcp/  Focused behavior, real transport, and fixture integration suites
```

Keep module names specific. Avoid a catch-all `utils.ts`. Existing generic resolvers and runtime helpers remain in their established folders. MCP DTO/schema modules are server-only. Pure preview URL construction and generic test-summary helpers may live in `@histoire/shared`; executable MCP modules stay server-only.

## Runtime ownership and sequencing

Project controller owns at most one active runtime. Start sequence: validate options, resolve config in project process, create Vite servers sequentially, settle story/Markdown scan, complete initial collection, invalidate modules, publish snapshot, mark ready. Startup failure unwinds each acquired resource in reverse order.

Production controller implements same project facade from validated private artifact, with no Context/dev controller import. Load and validate schema/version/content inventory, build immutable lookup maps, bind listener, then mark ready. Public/static routing and MCP transport share HTTP listener but not filesystem root. Readiness endpoint is 503 until artifact valid and listener operational; deployed artifact updates require new process, not config watcher/hot reload.

Capture `{ epoch, revision, isActive(), context }` before any operation. Revalidate when dequeued and before publishing result. Runtime closure rejects pending work and aborts active operations; late completions cannot become results for replacement context. Close is idempotent and waits for bounded teardown. Process signals, stdin EOF, worker IPC disconnect, and config restarts all use controller close/restart paths.

One shared FIFO execution lane covers server-triggered UI fallback test runs, MCP test runs, and screenshots. Existing tab-local embedded UI tests keep their own iframe session; they do not own server browser handles. Catalog reads remain concurrent. Lane stays occupied until cancelled runner/browser cleanup finishes; raced timeout must not release it while previous server browser work continues.

## Trust and data limits

Starting Histoire executes trusted project config/plugins/stories, as ordinary dev does. Reading MCP content does not grant arbitrary filesystem or shell access. Source/docs targets come exclusively from catalog allowlist. Reject registered physical files whose canonical path escapes canonical project root; list metadata may still expose `sourceAvailable: false` for that file. Preserve normal non-MCP source panel behavior.

HTTP validates Host, Origin, configured authentication, path, method, and body limits before SDK dispatch. Local dev permits no-Origin native clients without bearer only when no token configured; production always requires bearer when MCP enabled. No wildcard CORS. MCP token is removed from stdio project worker/browser-run environments. Screenshots cannot accept arbitrary URLs or paths; browser uses controller-resolved internal book origin and fresh context with no saved cookies. Public preview URLs derive from configured PUBLIC_ORIGIN/base, never untrusted forwarded headers. Project stories may perform their own network requests; this is not an execution sandbox.

Generated Node package bundles server dependencies and requires no histoire/Vite/project packages for read tools. Playwright is optional external runtime dependency; browser-only compiled Vitest facade travels in public bundle where included by build. Private raw source follows catalog allowlist and Node-build includeSource setting; it is never exposed by production static file server. Default book assets remain public; MCP requires credentials. Static bearer mode is a preregistered machine-client deployment contract, not an OAuth discovery/authorization-server implementation.

## Primary references checked 2026-10-02

- [Official SDK v2 documentation](https://ts.sdk.modelcontextprotocol.io/v2/) identifies v2 as stable release line for revision 2026-07-28.
- [SDK package layout](https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages.html) separates server/client packages and optional Node adapter. Plan server runtime dependencies: `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `zod`; test-only client dependency: `@modelcontextprotocol/client`.
- [SDK HTTP serving guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/http.html) specifies per-request factory, Node adapter, and explicit Host/Origin/authentication guards.
- [Protocol migration matrix](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28.html) distinguishes discovery, cancellation, sessions, and notifications across revisions. Do not copy v1 transport examples into v2 code.
- [Current specification](https://modelcontextprotocol.io/specification/2026-07-28), [tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools), and [resources](https://modelcontextprotocol.io/specification/2026-07-28/server/resources) define wire behavior. Histoire application contracts below intentionally avoid revision-specific extensions.

These are design inputs, not installed dependency proof. Slice 01 must verify published stable versions, SDK signatures, Node 22, and TypeScript 5.6 compatibility, then record exact resolved versions.
