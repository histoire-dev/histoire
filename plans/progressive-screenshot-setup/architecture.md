# Architecture

## Current path

`ScreenshotPopover.vue` snapshots targets, CSS viewport, scale, format, and background. Vite custom events deliver requests to `registerScreenshotChannel`. `createUiScreenshotService` creates one shared runtime task per target and retains successful files after partial failure.

`createScreenshotTask` creates a deterministic `createPreviewSession`. The session resolves optional `playwright`, launches a fresh browser, creates a fresh context/page, and loads the nonce-scoped story host. Capture waits for variant readiness, applied matrix props, fonts, and two animation frames. Screenshot uses device pixels and transparent background when requested. Cleanup closes the whole owned browser before the FIFO lane permits the next operation.

The MCP wrapper projects the same runtime task to an artifact resource. Node SDK capture and standalone Node deployment also use that task. Rendered inspection and compiled deployment tests use the same session seam. Development tests instead use project-owned Vitest browser configuration.

Current capability checks generally detect a package, not whether a browser binary can launch. This distinction must remain explicit; metadata reads must not acquire a browser.

## Runtime layers

Slice 02 implements trusted browser config normalization, public config exclusion, driver identity/API resolution, finite candidate discovery, and the owner interface. Browser launch, setup ownership, and adapter adoption remain in later slices.

### 1. Trusted configuration

Add `HistoireConfig.browser` through `packages/histoire-shared/src/types/config-browser.ts` and normalize it in `packages/histoire/src/node/config/browser.ts`. Omitted config becomes `{ source: 'auto' }`; relative executable paths resolve against the real project root. `runtime/browser/setup/policy.ts#createBrowserSetupPolicy` returns the frozen runtime policy. This is trusted server configuration, never screenshot-request input.

Exclude the entire `browser` property from `virtual/resolved-config.ts` in both development and static builds as soon as config is added. Its current broad serialization would otherwise expose custom executable paths. Existing client config-codemod allowlists must not gain browser execution settings.

Scope: Histoire-owned isolated screenshots, rendered inspection, and compiled Node tests. Development Vitest continues owning its browser configuration and prerequisites. The legacy screenshot/Percy plugins remain separate in this pack.

### 2. Driver and candidate discovery

`runtime/browser/setup/{types,policy,driver,candidates,locations}.ts` resolve project dependencies and enumerate a finite ordered candidate set. `resolveBrowserSetupDriverIdentity(root)` reads SemVer package identity from the selected real entry's matching package boundary without importing code, for Node artifact selection. `resolveBrowserSetupDriver(root)` imports the selected driver and validates only `chromium.launch` and public `chromium.executablePath`; it never launches. `discoverBrowserCandidates(policy, driver, options?)` checks the selected driver's public executable path and exact stable branded channel locations, then returns ordered structured launch options. Playwright 1.49.0+ gets unknown-presence shell followed by full Chromium channel; older drivers use their default bundled Chromium path as the first automatic candidate because separate shell does not exist there. No filesystem-wide scan, process execution, HTTP call, installer, or story import.

Reuse `tryResolveDependency` and `importResolvedModule`. Preserve project-first resolution: try project `playwright`, project `playwright-core`, then the same pair in Histoire's existing dependency fallback. Do not select an unrelated global npm installation. A broken preferred package produces an actionable failure; do not hide it by silently choosing a different driver package.

Branded paths match Playwright's stable channel targets on Windows, macOS, and Linux; channel launch remains delegated to Playwright. Account for `PLAYWRIGHT_BROWSERS_PATH` through the selected driver's public executable resolution. Public `chromium.executablePath()` does not expose shell location: mark shell presence unknown until normal headless launch, rather than reverse-engineering cache paths. Never scan browser cache folders and launch an arbitrary stale revision. Auto discovery omits candidates proven absent; an explicit missing source retains its absent candidate for targeted reporting.

### 3. Owned acquisition

The shared session requests a browser lease from a setup owner. Without slice 08, each lease owns a new browser and release closes it. The existing injected `launch` seam remains supported and bypasses automatic discovery for tests/host injection.

The first acquisition for a candidate validates startup using a neutral page and a tiny PNG. No story navigation occurs until the candidate is selected. Close the neutral page/context before handing the same browser to the session. Successful choice can be cached within the generation; cache no browser process before slice 08.

Every rejected candidate must have confirmed cleanup before trying the next. A cancellation, deadline, closed generation, unknown launch failure, or unconfirmed cleanup terminates the chain. Once story navigation starts, no browser fallback is allowed.

### 4. Setup reporting and repairs

New setup snapshot reports one of `checking`, `ready`, `unverified`, or `needs-action`. `ready` requires a successful neutral browser probe or actual browser acquisition in the current owner. Metadata-only discovery reports `unverified`, even when an executable exists.

Internal attempt records retain bounded private details. Public projections expose only source labels, classified reason codes, and fixed repair instructions. Never publish absolute executable paths, launch stderr, environment values, or driver resolution locations over UI/MCP channels.

The new read-only `histoire screenshot-setup` command shares discovery/probe code. Default performs discovery; `--check` explicitly probes browsers, without collecting stories or starting Vite. UI “Check setup” admits equivalent work onto the existing execution lane. “Copy command” is the only install action in the UI.

### 5. Adapters

UI, Node SDK, MCP HTTP/stdio worker, rendered inspection, and Node deployment pass the same normalized policy into session creation. Store the setup owner with the source/runtime generation, not a module-global singleton. A restarted configuration invalidates choices and pending observations before closing resources.

MCP tool schemas/results remain unchanged. Keep capability fields backward compatible; use their existing `reason` for setup summaries. Do not add a second MCP operation system or a remote installer tool.

## Repository seams

Paths below are relative to repository root. Existing paths were inspected; additions are proposed destinations.

- Shared config: `packages/histoire-shared/src/types/config.ts`; `types/config-browser.ts`.
- Config normalization/defaults: `packages/histoire/src/node/config/{browser,process,defaults}.ts`.
- Public config exclusion: `packages/histoire/src/node/virtual/resolved-config.ts`, `__tests__/config-browser.spec.ts`, `__tests__/ui-public-config.spec.ts`.
- Driver/session: `packages/histoire/src/node/runtime/browser/dependencies.ts`, `session.ts`, `errors.ts`, `limits.ts`; `runtime/browser/setup/{types,policy,driver,candidates,locations}.ts` for slice 02 and `probe.ts`, `acquire.ts`, `report.ts`, `owner.ts` for slice 03.
- Scheduling/cleanup: `runtime/execution-service.ts`, `runtime/execution-owner.ts`, `runtime/cleanup.ts`, `util/playwright-cleanup.ts`. Preserve authority; reuse helpers rather than duplicating a scheduler.
- Development ownership: `runtime/dev-session.ts`, `runtime/controller.ts`, `server/index.ts`, `server/dev-events.ts`, `server/ui-channel/index.ts`.
- UI delivery: `server/ui-channel/screenshot.ts`, `screenshot-service.ts`, `validation.ts`, `files.ts`; **new** `server/ui-channel/screenshot-setup.ts`.
- Shared UI DTOs: `packages/histoire-shared/src/types/ui-channel.ts`, `types/screenshot-setup.ts`.
- Workbench: `packages/histoire-app/src/app/components/canvas/toolbar/ScreenshotPopover.vue`; **new** `ScreenshotSetup.vue` and `use-screenshot-setup.ts` alongside it.
- SDK: `packages/histoire/src/node/api/{capture,project,internal,types}.ts`; inspect `api/preview.ts` and source creation before threading ownership.
- MCP: `mcp/browser/dev.ts`, `mcp/project/{capabilities,dev-facade}.ts`, `mcp/browser/inspection/task.ts`, `mcp/transport/{worker-runtime,worker-protocol,worker-project}.ts`.
- Deployment: `deploy/{execution,server,artifact-schema,entry,options}.ts`, `build/node/{runtime-settings,package,snapshot}.ts`.
- CLI: `packages/histoire/src/node/bin.ts`; **new** `commands/screenshot-setup.ts`.

## Compatibility and failure ownership

- Keep viewport, DPR, image limits, PNG/WebP encoding, transparent checkerboard, props snapshots, and readiness checks unchanged.
- Keep cancellation scoped to originating UI client or MCP principal. Setup UI has its own correlated request and cannot cancel unrelated capture work.
- A stale generation cannot publish `ready`, append recent captures, or return a successor's pixels.
- Preserve cleanup quarantine. Never convert `CLEANUP_UNCONFIRMED` into “install Chromium” or proceed to another candidate after it.
- Do not change normal capture into authenticated user-browser attachment. Branded Chrome still runs headless in a fresh context, without user profile, extensions, or remote debugging of their active browser.
- Full browser and branded builds can render differently from shell; expose selected source and support explicit pinned choice for reproducibility.

## Non-goals

DOM-to-image fallback, screen-sharing capture, remote browser/CDP endpoints, browser extension installation, arbitrary launch arguments, active user-profile reuse, auto-installation, Vitest runner migration, legacy plugin migration, and general browser management are excluded. Slice 08 does not change this setup chain.
