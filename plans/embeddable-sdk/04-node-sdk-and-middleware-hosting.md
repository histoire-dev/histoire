# 04 — Node SDK and middleware hosting

## Outcome and prerequisites

Depends on: 02, 03.

Expose stable histoire/node project API over canonical controller. Managed and host-owned HTTP/HTTPS servers use same services. Follow [Node public contract](public-api.md) and [shared ownership](coordination.md).

## Owned files

- Add packages/histoire/src/node/api/{index,project,types,build,preview,tests}.ts and export built entry through histoire package manifest.
- Add/extend runtime/hosting/{managed,middleware,routes,hmr,mounts}.ts.
- Extend node/preview.ts and add runtime/hosting/preview.ts for built-target snapshot and same-origin capture-host registry. Reuse mcp/browser/preview-host.ts; do not copy browser host/script.
- Adapt server/index.ts, Vite server creation/options, existing build/preview/test wrappers, and CLI command wiring.
- Add src/node/__tests__/embed/node-sdk.spec.ts, middleware-hosting.spec.ts, and host-ownership.spec.ts.
- Shared execution implementation belongs runtime/execution-service.ts when available; this slice wraps existing runner until slice 13 completes lane/cancellation integration.

## Tests first

1. Import/construct from unrelated cwd using explicit root and relative configFile. No browser/listener/exit handler/process mutation on construction.
2. Start managed dev on port 0; await actual bound URL and completed initial catalog readiness. Start/close twice without leaked handles.
3. Mount two projects at /one/ and /two/ on same caller HTTP server; reject duplicate active base.
4. Keep host API and unrelated WebSocket working during startup/restart/close. Check equivalent HTTPS wiring using shared test certificate fixture.
5. Cache middleware function identity across config restart. Correctly pass next outside base and preserve original URL/query for matching requests.
6. Inject startup/restart failure and close while ready pending. Caller server remains listening; only captured Histoire upgrade listeners/connections removed.
7. Static preview under nested base serves active nonce capture documents before sirv fallback; expired/unknown nonce returns 404. ready includes built-target validation. Close/restart removes leases and drains lane ownership. Legacy output remains browsable with capture unavailable. Dev and preview may coexist; a second active preview rejects before resource acquisition.
8. Reject owned build replacing active preview output before any file deletion/write. Distinct output builds remain isolated; preview lookup uses immutable built catalog, not live source scan.

## Implementation steps

1. Implement async project factory and exact methods from public-api.md. Resolve all paths from root; relative outDir likewise. Project construction creates idle controller only.
2. Managed handle owns Vite/listener resources; return acquisition handle with ready promise, keeping readiness distinct from listening.
3. Implement stable Connect-compatible delegator. It captures active generation internally and checks normalized base without rewriting caller's original URL unexpectedly.
4. Middleware acquisition must return before caller starts server. Caller attaches middleware, starts HTTP server, then awaits ready. Avoid readiness deadlock and prevent requests against incomplete catalog from pretending ready.
5. Inspect installed Vite 7.3.1 middleware/HMR types and [official example](https://vite.dev/guide/ssr.html#setting-up-the-dev-server). Use middlewareMode and caller HTTP server for HMR. Validate actual joining of base and HMR path instead of duplicating assumed URL logic.
6. Register active bases in WeakMap keyed by caller server. Route HMR under each project base and remove only exact owned upgrade handlers/connections. Never invoke caller server.listen/close.
7. Restart swaps active generation behind delegator after old generation is inactive. Owned path returns explicit unavailable while restarting; unrelated host traffic passes through.
8. Wrap current build/preview/test implementations with explicit context/root. Preserve existing build target, including MCP-owned Node target when landed; static preview is not production Node deploy replacement.
8a. Acquire built snapshot from slice-03 reader; static root uses histoire.json capture metadata, Node target uses validated private manifest and public/ root. Install shared capture registry route before static/history middleware, retain actual listener origin/base and preview epoch, and reject expired route with 404. Ready does not launch browser.
8b. Preview restart invalidates captured work/leases, drains owned execution, and loads new snapshot before readiness. Close disables routing immediately, cancels/drains capture work, then closes registry/listener. Project close owns both dev and preview handles; library does not start production MCP/auth endpoint for static preview.
9. Enforce one active dev handle and one active preview handle per project; reject second same-kind acquisition before allocating resources. Isolate concurrent output directories. Same-output builds serialize/reject before destructive writes, and active preview output cannot be overwritten by an owned build.
10. Move CLI-only cwd defaults, signal/exit behavior, and presentation out of generic library. CLI still preserves effective dev configuration/default MCP assembly.

## API changes

Export histoire/node at dist/node/api/index.js with declarations and documented methods/handles from public-api.md. Browser SDK has no reverse dependency on histoire. Public HTTP/1 HTTPS supported; do not imply HTTP/2 integration.

## Failure paths

Invalid root/config/base/origin and duplicate ownership reject before acquisition. Partial startup rejects ready and cleans resources. Restart failure leaves explicit unavailable generation until caller retries. Close marks inactive immediately and awaits teardown without closing host. runTests keeps dependency failures explicit.

## Validation commands

~~~bash
pnpm --filter @histoire/shared build
pnpm --filter histoire build
pnpm --filter histoire test src/node/__tests__/embed/node-sdk.spec.ts src/node/__tests__/embed/middleware-hosting.spec.ts src/node/__tests__/embed/host-ownership.spec.ts
pnpm --filter histoire test
pnpm run lint
~~~

Use real Vite/HMR and HTTP/WebSocket clients for ownership gate. Packed Node import tested again in slice 15.

## Acceptance criteria

- One controller supports managed listening and stable host middleware.
- Two bases, restart, partial failure, initial readiness, port 0, unrelated API/WebSocket survival proven.
- Library never chdir, mutate process environment, install, register process exits, or process.exit.
- CLI/framework behavior and MCP lifecycle compatibility retained.
- Built preview owns capture routing/catalog/lifecycle without live dev catalog, expired-route fallback, or private asset exposure.

## Non-goals

Production auth/MCP transport, deployment artifact creation, HTTP/2, automatic dependency installation, and server-mode test lane redesign.

## Handoff

Provide export map, middleware attach/listen/ready example, built-preview capture-source acquisition/epoch/cleanup, host resource ownership, actual Vite HMR configuration, and regression results. Slice 13 consumes ready capture source and project execution adapter; slice 15 packages Node HTTP example.
