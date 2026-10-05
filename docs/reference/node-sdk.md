# Node SDK reference

`histoire/node` manages a Histoire project without CLI process ownership. See [embedding](../guide/embedding.md) and [production Node deployment](../guide/deploy-node.md) for browser/deployment configuration.

## Create a project

```ts
import { createHistoireProject } from 'histoire/node'

const project = await createHistoireProject({
  root: '/absolute/path/to/project',
  configFile: 'histoire.config.ts', // optional; relative to root
})
```

Root is required and resolves to an existing directory. Relative configuration paths resolve against that root. Construction validates paths; first operation evaluates project config/plugins. The library never changes process cwd, installs dependencies, installs process exit handlers, or calls `process.exit()`. Host owns process signals, browser installation, and final shutdown.

Vue/Svelte projects can coexist with independent contexts. Nuxt supports one active project per process. Context isolation prevents accidental cross-talk; it does not sandbox project code. Run untrusted projects in their own host-managed process/container.

## Project methods

| Method | Result |
| --- | --- |
| `startDev({ host?, port?, open? })` | Managed development server handle |
| `createMiddleware({ httpServer, base, publicOrigin })` | Stable Connect-compatible middleware handle |
| `build({ outDir? })` | `{ outDir, target: 'static' | 'node' }` |
| `preview({ host?, port? })` | Owned built-preview handle with `capture` capability |
| `runTests({ storyId?, variantId?, signal? })` | Completed project browser-test summary |
| `captureScreenshot(options)` | Owned PNG bytes, decoded dimensions and SHA-256 |
| `getSnapshot()` | Stable detached public lifecycle/catalog snapshot |
| `subscribe(listener)` | Future coherent snapshots; returns unsubscribe |
| `close()` | Terminal idempotent owned-resource shutdown |

One project may own one active dev source (managed or middleware) and one independent built preview. Building captures a fresh context and does not mutate a running dev catalog. Output directories are claimed while in use; choose different output roots for concurrent builds/previews. `outDir` resolves against project root when relative. Configured `build.target` remains authoritative.

## Managed dev server

```ts
const dev = await project.startDev({ host: '127.0.0.1', port: 0, open: false })
await dev.ready
console.log(dev.url)
await dev.restart()
await dev.close()
await project.close()
```

Port `0` selects an actual ephemeral port. Handles expose `url`, `status`, `ready`, `restart()`, and `close()`. Readiness includes initial completed catalog publication, not listener binding alone. Restart replaces generation and invalidates work owned by the old source; handle identity remains stable. Close is idempotent and joins owned watcher/server/browser cleanup.

## Attach to host HTTP/HTTPS

Pass a caller-owned Node HTTP/1 or HTTPS server, explicit base, and externally visible HTTP(S) origin. Attach middleware with original full request URLs, start host listener, then await `ready`:

```ts
import { once } from 'node:events'
import { createServer } from 'node:http'
import connect from 'connect'
import { createHistoireProject } from 'histoire/node'

const app = connect()
const httpServer = createServer(app)
app.use('/api/health', (_request, response) => {
  response.setHeader('content-type', 'application/json')
  response.end('{"ok":true}')
})

const project = await createHistoireProject({ root: '/absolute/path/to/project' })
const book = await project.createMiddleware({
  httpServer,
  base: '/_stories/',
  publicOrigin: 'http://127.0.0.1:3000',
})
app.use(book.middleware)

httpServer.listen(3000, '127.0.0.1')
await once(httpServer, 'listening')
await book.ready
console.log(book.url)

// Existing middleware reference remains valid across config restart.
await book.restart()

// Host still owns its API, unrelated WebSocket, and listener.
await project.close()
await new Promise<void>((resolve, reject) => {
  httpServer.close(error => error ? reject(error) : resolve())
})
```

Do not strip the base before delegating to `book.middleware`. It is one stable function that switches active generation internally. HMR routes use the project base and supplied host server. Duplicate active bases on one host server are rejected. Closing Histoire removes its own upgrade listeners/connections/watchers; it never listens on or closes caller server. Set `mcp: false` in book config when shared hosting does not need the separate dev MCP listener.

## Build and preview

```ts
const built = await project.build()
console.log(built.outDir, built.target)

const preview = await project.preview({ host: '127.0.0.1', port: 0 })
await preview.ready
console.log(preview.url, preview.capture)
await preview.close()
```

For a custom build output, set the same `outDir` in project configuration before acquiring preview. Preview validates an immutable built snapshot; original source/config is not used for captured target lookup. Legacy static output remains browsable while its capture capability reports unavailable. Copy complete Node output when moving a Node artifact; private metadata is required for validated capture and has no public HTTP route.

`preview()` is a library-owned book listener. Production Node deployment runs built `server.mjs` with its own MCP/auth/process contract; see [deployment guide](../guide/deploy-node.md).

## Project browser tests

```ts
const abort = new AbortController()
const summary = await project.runTests({
  storyId: 'button',
  variantId: 'primary',
  signal: abort.signal,
})
console.log(summary.ok, summary.tests)
```

Omit IDs for a project run or supply exact story-only/variant filters. `variantId` requires `storyId`; invalid or ambiguous IDs reject. A ready dev source supplies captured target metadata. Without dev, runner acquires fresh root-owned context. This method uses project Vitest/browser dependencies; it is distinct from production artifact's compiled-preview execution.

Server tests serialize per project and hold the lane through cleanup. Cancellation rejects publication immediately and observes worker/browser shutdown before admitting next work. Unconfirmed cleanup quarantines the lane. Assertion failures return completed summary; missing dependencies, failed collection, unavailable engines and transport failures reject with typed errors. SDK execution does not retry automatically. Isolated runner workers own Vitest process effects; parent cwd, env, exit code and process handlers remain unchanged.

Install required project test dependencies and browser binaries as explicit setup, using [browser testing guide](../guide/testing.md). Metadata/dev/build do not install them for you.

## Deterministic PNG capture

```ts
const capture = await project.captureScreenshot({
  storyId: 'button',
  variantId: 'primary',
  width: 720,
  height: 560,
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  textDirection: 'ltr',
  globals: { density: 'compact' },
})
console.log(capture.mimeType, capture.width, capture.height, capture.sha256)
// capture.png is an owned Uint8Array; host decides storage/publication.
```

Capture requires one ready built preview or dev source. If preview handle exists, it is selected first; an unavailable/stale preview does not silently fall back to dev. Source/target ownership is captured before queuing. Navigation/restart/close invalidates queued/active work. Capture uses the same canonical browser host and execution lane as MCP, without MCP artifact URIs or retention identities.

| Option | Bound/default |
| --- | --- |
| `storyId`, `variantId` | Required exact non-empty IDs |
| `width` | Integer CSS pixels, 320–3840; default 480 |
| `height` | Integer CSS pixels, 240–2160; default 320 |
| `deviceScaleFactor` | Integer 1–3; default 1 |
| `colorScheme` | `'light'`, `'dark'`, `'auto'`; source default if omitted |
| `textDirection` | `'ltr'`, `'rtl'`; source default if omitted |
| `globals` | Same finite scalar map as session settings; source defaults if omitted |
| `signal` | Optional `AbortSignal` |

Returned dimensions are decoded PNG pixels: CSS width/height multiplied by DPR, up to 11520 by 6480. PNG has an independent 4 MiB limit. Supplied globals replace source defaults. Input validation precedes queue/browser admission.

Screenshot contexts disable animations/transitions/caret, emulate reduced motion, use UTC and en-US, then await fonts and two frames. These screenshot defaults do not change ordinary preview-test locale/timezone. Arbitrary application nondeterminism remains project-owned. Missing browser dependency reports `DEPENDENCY_MISSING`; installed dependency/executable launch failure reports `BROWSER_UNAVAILABLE`.

Batch screenshots, arbitrary selectors/scripts, element rect capture, and a browser screenshot SDK are outside this API.
