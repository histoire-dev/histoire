# Slice 12 — Production Node.js book and MCP server

## Outcome and prerequisites

Generated Node artifact serves book and default-enabled protected MCP without project source, Vite, or Histoire CLI. Depends on 07, 08, 09, and 11. One production listener owns public routing, MCP, health, preview host, and graceful shutdown.

## File ownership

- Add `packages/histoire/src/node/deploy/{entry,options,artifact-reader,project,catalog,content,routes,static-files,http,lifecycle,health}.ts`.
- Modify packages/histoire/src/node/{bin.ts,commands/build.ts,build/index.ts} to wire --target node/static, config target override, and actual production entry into 11 build writers. Public Node workflow becomes usable in this slice.
- Reuse MCP factory/transport guards/job store/artifacts/browser host; make narrow common modules transport-neutral when necessary.
- Extend Node builder bundle/package entry once production entry exists.
- Add `packages/histoire/src/node/__tests__/mcp/{node-server,node-routing,node-auth,node-shutdown}.spec.ts` plus isolated-artifact integration harness.
- Existing preview.ts remains static development preview; do not route generated server through createContext/startPreview.

## Tests first

1. Generated server from copied artifact starts from unrelated cwd with no project source/node_modules; read tools/docs/source work with only Node. No config/plugins/watchers/Vite or project package import occurs.
2. Custom base and hash/history routes serve compiled book/sandbox/assets correctly. Asset/API/missing-file errors never receive HTML history fallback. Private manifest/content, server.mjs/package.json, dotfiles, traversal, encoded/double-encoded traversal, and symlink escape are never public static files.
3. MCP endpoint enabled by default on `<base>__histoire/mcp`; missing credential fails startup before remote traffic. --no-mcp serves book without token and MCP returns 404; --mcp explicitly overrides artifact false policy.
4. Valid bearer + allowed configured Host/Origin succeeds; invalid bearer/Host/Origin fails. Public URLs derive from PUBLIC_ORIGIN, not Host/X-Forwarded-Host/Forwarded payload. Deployment credential never reaches manifest/resources/browser/page URL.
5. Missing/malformed/unsupported manifest version, missing file, bad byte length/hash, invalid base/origin, or unsupported external import fails startup deterministically. Browser package absence does not block read server.
6. Health/readiness status and graceful signal shutdown work. Stop admission, cancel active/queued browser work, reject stale handles, close server/owned browser before exit, and rebind port after close.
7. Screenshot over compiled Vue/mock story works through reused same-origin host, produces decodable PNG, and closes handles. No Vite/mock RPC requirement leaks into production path.

## Implementation steps

1. Load artifact paths relative to import.meta.url, not cwd or original project root. Validate manifest schema/version/inventory/hash with bounded reads. Public content identity is buildId; assign fresh projectId/epoch and one immutable runtime revision on startup. No HMR, file scan, or config evaluation.
   Entry exports artifact validation/server factory without listening when imported; direct node server.mjs invocation starts runtime. Bundle assembled through 11 writer; CLI/config target wiring happens only once real entry exists, without placeholder production handlers.
2. Implement same project facade from frozen build DTOs/private content inventory. Reuse filtering/cursors/content paging/results/URI codecs from prior slices; do not create parallel tool registration. Node capability DTO includes runtimeMode:node, buildId, and engine status.
3. Parse PORT/HOST/PUBLIC_ORIGIN and --no-mcp/--mcp only. PORT default 3000, HOST default 0.0.0.0, fixed-port collision fails, 0 allowed for tests. PUBLIC_ORIGIN is absolute origin, required for remote bind; loopback-only tests may derive bound address. Build base is authoritative path; runtime cannot alter compiled asset base without rebuild.
4. Capture/validate required HISTOIRE_MCP_TOKEN when MCP enabled; strip from environment before optional browser module/setup work. Shared secret is configured machine-client auth, not OAuth provider. Production endpoint uses shared HTTP SDK handler with protected-node policy and no anonymous dev fallback.
5. Compose routes before static fallback: health/ready, MCP exact endpoint, active nonce preview host, public assets, then HTML navigation fallback. Serve only public/ canonical root. Explicitly refuse runtime/private paths and nonpublic inventory even when browser asks text/html; static client histoire.json remains intentionally public.
6. Host/Origin validation uses explicit configured PUBLIC_ORIGIN. No wildcard CORS or implicit forwarded-header trust. Reverse proxy preserves public Host and terminates TLS; Node listener may be plain HTTP behind it. Internal browser job origin derives from actual listener/local address and is distinct from public preview URL.
7. Reuse bounded request/body/concurrency limits from 07, execution quotas/retention from 08, and artifacts from 09. Keep server/get_project data free from paths/credentials/proxy headers. No process-global mutable SDK server per request.
8. Health emits only live/readiness/build status; no sensitive inventory. Initial artifact validation occurs before traffic. Mark readiness false when draining; no browser launch for health/readiness checks. Close listener and handler using bounded Node API shutdown and owned-resource cleanup.
9. Screenshots reuse browser host/appearance/readiness against public compiled sandbox. Host route validates unguessable active nonce/epoch and is removed after job. No copy of Vite middleware or browser message protocol; route adapter calls common host service.
10. While deployed test executor not installed (before 13), tests capability reports unavailable and starter returns CAPABILITY_UNAVAILABLE. Screenshots available only with Playwright/Chromium; metadata remains functional without them.
11. Maintain in-memory operations and artifacts per process. Server restart clears handles; no cross-replica/persistent-job promise. Deployment documentation requires sticky/single replica for job polling, or one process per endpoint, until distributed store exists.
12. SIGINT/SIGTERM handler marks draining, rejects admission, cancels jobs, waits observed cleanup, closes active connections after grace deadline, and exits with clear bounded diagnostic if cleanup unconfirmed. No broad process-name kills. Updating deployment starts new immutable artifact process; no runtime directory reload.

## Acceptance and validation

Real generated artifact process + current/legacy SDK HTTP clients, routing/auth/hash/health/shutdown tests, actual compiled screenshot, core/workspace builds, focused lint. Read-only deployment must pass without optional Playwright/Vitest/Histoire/Vite installed. Browser deployment adds only explicit Playwright/Chromium. Inspect standalone bundle/import trace for dev-only dependencies.

## Non-goals and handoff

No TLS certificate manager, OAuth authorization server, live host provisioning, SSR, watch/recollect, arbitrary paths/commands, distributed jobs, or server-side project test runner. Handoff is production facade/listener/runtime lifecycle, tested standalone artifact, and browser host seam for 13.

## Implemented handoff

- Production source lives in `src/node/deploy/`: `entry`, `server`, `options`, `base`, `artifact-reader`, `artifact-files`, `catalog`, `content`, `project`, `execution`, `http`, `routes`, `static-files`, `health`, `lifecycle`, and pure shared `identity` modules.
- `createNodeServer({ artifactDirectory, environment?, arguments?, launch?, registerExecutors? })` returns owned server/project/operations plus public/internal origins and idempotent awaited close. `NodeExecutionValue` provides artifact/catalog/host and listener origin getter to compiled executors. Imported generated module stays inert; direct symlinked script boots.
- CLI build target now uses real production entry. Canonical Node URL base check runs before build work and again in private schema; accepted encoded Unicode/space paths serve assets/health consistently.
- Catalog page/filter/cursor logic extracted into shared transport-neutral `mcp/project/catalog-pages.ts`; dev catalog regression gates pass. Canonical JSON moved to pure deployment helper with existing build re-export.
- Focused and real source-free artifact evidence recorded in `evidence.md`. Compiled deployed test engine registration is slice 13 dependency; Node runtime does not import project Vitest/Vite/config/story compiler.
