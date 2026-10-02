# Deploy to Node.js

Node deployment bundles a standalone production server with the compiled book and MCP. Runtime needs Node.js 22 or later. The original project, config, Vite, framework compiler, and project `node_modules` are not required.

## Build

```sh
pnpm exec histoire build --target node
```

`histoire build` remains a static build. Config can select Node output:

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

`build.node.includeSource: false` omits raw source from the private MCP content store and marks it unavailable. It does **not** hide source displayed by the existing book Source panel or included in browser assets. Review public build contents according to your project's requirements.

## Run

Supply a strong token through deployment secrets when MCP is enabled:

```sh
cd .histoire/dist
HOST=0.0.0.0 PORT=3000 PUBLIC_ORIGIN=https://stories.example.com npm start
```

Set `HISTOIRE_MCP_TOKEN` in that environment before starting. Use canonical hexadecimal or base64url encoding of at least 32 random bytes. See [token setup](./mcp.md#development-http). Tokens are captured privately before optional browser dependencies load.

`node server.mjs` and `npm start` start the same server. Default HOST is `0.0.0.0`; default PORT is `3000`. `PUBLIC_ORIGIN` is required for a remote bind and must be an exact HTTP(S) origin without trailing slash, path, query, or credentials. Loopback binds can derive their actual origin:

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

Metadata, docs, source, and preview URLs work with Node alone. To enable screenshots or compiled preview tests, install the artifact's optional Playwright dependency and Chromium in the deployment environment:

```sh
cd .histoire/dist
npm install --omit=dev
npx playwright install chromium
```

The generated package records the Playwright version available during the build. When no version was available, install a compatible Playwright release explicitly before installing Chromium. Missing Playwright reports an actionable unavailable capability rather than loading dependencies from the original project.

Tests use engine `built-preview`. They run the compiled embedded test session in isolated Chromium contexts and preserve aggregate outcomes, skips, hooks, and explicit test/hook deadlines. They need neither project Vitest nor `@vitest/browser-playwright` on the server. Build with the embedded browser test runtime to enable them; artifacts lacking it report `CAPABILITY_UNAVAILABLE`. They do not provide project-wide Vitest execution or runtime source discovery.

See [validated framework combinations](./mcp.md#validated-framework-combinations) for local live-preview and copied-artifact checks. Vue fixture tests additionally verify matching aggregate outcomes across the two engines. Project CLI reporters, workspace filtering, coverage, snapshot updates, and CLI `allowOnly` policy are outside compiled-preview execution.

`histoire preview` remains the static preview command. Run `server.mjs` for Node deployment and MCP.
