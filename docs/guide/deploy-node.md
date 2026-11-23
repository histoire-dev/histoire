# Deploy to Node.js <Badge type="tip" text="1.0-beta.2+" />

Build a Node.js artifact to serve your compiled book and MCP from one production server. The artifact runs with Node.js 22 or later and includes everything needed to serve the book.

## Build

```sh
pnpm exec histoire build --target node
```

`histoire build` defaults to a static book. To make Node.js the project default, set `build.target`.

```ts
import { defineConfig } from 'histoire'

export default defineConfig({
  outDir: '.histoire/dist',
  build: {
    target: 'node',
    node: { includeSource: true },
  },
})
```

CLI `--target static|node` overrides config. Node output contains:

```text
.histoire/dist/
  server.mjs
  package.json
  public/                 compiled book and browser assets
  private/
    manifest.json         immutable catalog, settings, and content hashes
    content/              docs and optional raw source
```

Copy the entire output directory. Serve it through `server.mjs`, which validates the manifest and asset/content hashes before accepting requests. The private directory has no public HTTP route. Failed builds preserve the previous successfully published output.

`build.node.includeSource: false` omits raw source from the private MCP content store. The book's **Source** panel and public browser assets still contain whatever source the book normally builds. Review those public files before deploying.

## Run

With MCP enabled, set `HISTOIRE_MCP_TOKEN` through deployment secrets before starting. Use canonical hexadecimal or base64url encoding of at least 32 random bytes. See [token setup](./mcp.md#development-http).

```sh
cd .histoire/dist
HOST=0.0.0.0 PORT=3000 PUBLIC_ORIGIN=https://stories.example.com npm start
```

The server captures the token privately before loading optional browser dependencies.

`node server.mjs` and `npm start` start the same server. `HOST` defaults to `0.0.0.0` and `PORT` to `3000`. For a remote bind, set `PUBLIC_ORIGIN` to the exact HTTP(S) origin, including any non-default port. Omit paths, queries, credentials, and the trailing slash. Loopback binds derive the origin from the listener.

```sh
HOST=127.0.0.1 PORT=3000 node server.mjs
```

MCP defaults to the build's `mcp` enabled setting. Runtime `--mcp` enables it; `--no-mcp` disables it. Both together fail. Book-only hosting needs no token:

```sh
HOST=0.0.0.0 PORT=3000 PUBLIC_ORIGIN=https://stories.example.com node server.mjs --no-mcp
```

Dev `mcp.port` has no effect here. The book, MCP, and health routes use the same listener and built base. For base `/book/`:

```ts
export default defineConfig({
  vite: { base: '/book/' },
  build: { target: 'node' },
})
```

| Route | Purpose |
| --- | --- |
| `/book/` | Compiled book |
| `/book/__histoire/mcp` | Bearer-authenticated MCP |
| `/book/__histoire/health` | Bounded liveness status |
| `/book/__histoire/ready` | 200 once validated and ready; otherwise 503 |

Health/readiness expose no catalog, paths, credentials, or operation results. Base paths containing Unicode or spaces use their canonical URL encoding. Use URLs printed by the server or returned by MCP.

## Reverse proxy

Terminate TLS at your proxy and set `PUBLIC_ORIGIN` to the public origin, for example `https://stories.example.com`. Preserve that exact public Host when forwarding MCP requests, including its port if non-default. Forward `Authorization` and MCP protocol headers. Keep the built base unchanged. Histoire validates Host and any supplied Origin against `PUBLIC_ORIGIN`; it does not infer authority from forwarded headers.

Use one server process per operation lifetime or route a client's operation polling/cancellation/resources to the same process. Jobs, request-key retention, and PNG/test results live in memory; they are not shared across replicas or process restarts.

SIGINT/SIGTERM stop admission, mark readiness unavailable, cancel owned jobs, and close browser/listener resources. If cleanup cannot be confirmed, restart the process before admitting further execution.

## Optional browser execution

Node alone can serve metadata, docs, source, and variant URLs. To use screenshots, rendered inspection, or compiled tests through the SDK or MCP, set up a browser on the deployment machine. The development screenshot setup panel is available only on the dev server.

The default source is `auto`. With Playwright 1.49 or newer it tries matching Chromium headless shell, matching cached full Chromium, stable Google Chrome, then stable Microsoft Edge. Older supported drivers try their default Chromium headless executable before Chrome and Edge; they do not provide separate shell/full-channel choices. A copied artifact never treats the build machine's browser path or probe result as target setup. The generated `package.json` records at most one optional driver (`playwright` or `playwright-core`) selected during the build. Install that dependency in the deployment directory:

```sh
cd .histoire/dist
npm install --omit=dev
```

An installed stable Chrome or Edge can be used without downloading another browser once a compatible driver is present. If the target has no supported browser and the selected driver is Playwright 1.49 or newer, install the matching driver's headless shell. Use its CLI name, `playwright` or `playwright-core`:

```sh
npx playwright-core install chromium --only-shell
```

This installs only Chromium's headless shell and leaves already installed browser binaries in place. When the generated package has no optional driver, install a compatible `playwright` or `playwright-core` release explicitly before using that driver's install command. Missing drivers leave read tools available and report screenshots as unavailable; the artifact never loads dependencies from the original project.

Older supported drivers do not offer a separate headless shell. Install their default Chromium with `npx playwright install chromium` or `npx playwright-core install chromium`, or upgrade the selected driver before choosing `headless-shell` or full-channel `chromium` explicitly.

Set target policy in the deployment environment. For example, choose stable Chrome explicitly or select full Chromium after a confirmed shell-specific issue:

```sh
HISTOIRE_BROWSER_SOURCE=chrome node server.mjs
```

`HISTOIRE_BROWSER_SOURCE` accepts `auto`, `headless-shell`, `chromium`, `chrome`, `msedge`, or `executable`. For `executable`, also set `HISTOIRE_BROWSER_EXECUTABLE_PATH` to an absolute path or a path relative to the artifact directory. Incompatible source/path combinations fail instead of falling back. Project `browser` config and build-machine executable paths are not copied into deployment policy.

On supported Linux systems with a classified missing-library failure, install OS dependencies with `npx playwright install-deps chromium` or `npx playwright-core install-deps chromium`, matching the installed driver. Full Chromium is a targeted option for a pinned full renderer: set `HISTOIRE_BROWSER_SOURCE=chromium` and, with Playwright 1.49 or newer, run `npx playwright install chromium --no-shell` or `npx playwright-core install chromium --no-shell`, matching the installed driver. Older drivers install their default Chromium with the same command without `--no-shell`. Installing full Chromium alone does not make the default headless-shell source use it.

Tests use engine `built-preview`. They run the compiled embedded test session in isolated Chromium contexts and preserve aggregate outcomes, skips, hooks, and explicit test/hook deadlines. They need neither project Vitest nor `@vitest/browser-playwright` on the server. Build with the embedded browser test runtime to enable them; artifacts lacking it report `CAPABILITY_UNAVAILABLE`. They do not provide project-wide Vitest execution or runtime source discovery.

See [validated framework combinations](./mcp.md#validated-framework-combinations) for local live-preview and copied-artifact checks. Vue fixture tests additionally verify matching aggregate outcomes across the two engines. Project CLI reporters, workspace filtering, coverage, snapshot updates, and CLI `allowOnly` policy are outside compiled-preview execution.

`histoire preview` remains the static preview command. Run `server.mjs` for Node deployment and MCP.
