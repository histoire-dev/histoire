# MCP server

Histoire exposes stories, docs, source, preview URLs, screenshots, and story tests through Model Context Protocol (MCP).

## Development HTTP

Start your existing project:

```sh
pnpm exec histoire dev
```

MCP starts automatically at `http://127.0.0.1:6007/mcp`. Use the endpoint printed by Histoire: an occupied default port selects an available port. The book and MCP use separate listeners. Changing the book's `--host` does not expose MCP outside loopback.

Configure your MCP client with that HTTP URL. Local access needs no token. To require bearer authentication, supply `HISTOIRE_MCP_TOKEN` through your process environment and set the client's `Authorization: Bearer <token>` header. Tokens must be canonical hexadecimal or base64url strings encoding at least 32 random bytes. Generate one with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep credentials in your environment or secret manager. Histoire captures and removes this variable before loading project config.

```sh
pnpm exec histoire dev --no-mcp
pnpm exec histoire dev --mcp-port 6010
pnpm exec histoire dev --mcp-port 0
```

An explicitly selected occupied port fails. `--mcp` overrides `mcp: false`; `--mcp-port` also enables MCP. Combining either with `--no-mcp` fails. Config can disable MCP or select its port:

```ts
import { defineConfig } from 'histoire'

export default defineConfig({
  mcp: { enabled: true, port: 6010 },
})
```

## Stdio

Use the installed executable and an absolute project root. Stdio owns a separate Histoire runtime with an ephemeral loopback book listener and no dev HTTP MCP listener.

```sh
pnpm exec histoire mcp --root /absolute/path/to/project
```

Generic client configuration, replacing paths with your installed locations:

```json
{
  "mcpServers": {
    "histoire": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/project/node_modules/histoire/bin.mjs",
        "mcp",
        "--root",
        "/absolute/path/to/project",
        "--config",
        "histoire.config.ts"
      ]
    }
  }
}
```

Omit `--config` to use normal config discovery. Relative config paths resolve against `--root`. Stdout carries only MCP messages; project/config/plugin output goes to stderr. Closing stdin or sending SIGINT/SIGTERM closes the owned runtime. Discovery loads trusted project code, as normal `histoire dev` does.

## Read stories and content

Call `histoire_get_project` first. Wait for `status: "ready"`, then call `histoire_list_stories`. Use returned story and variant IDs exactly; IDs are not filesystem paths. `revision` identifies a completed catalog publication. Pass `expectedRevision` when subsequent reads must match that publication.

The six read tools require no browser. Docs prefer sibling Markdown, then standalone Markdown, then collected plain text. Source reads return registered file or virtual module text; files outside the project root are unavailable. Tools return bounded pages and hashes. Follow `nextCursor`, `nextOffset`, or `nextLine`; refresh the catalog after `STALE_REVISION` or `CURSOR_EXPIRED`.

`histoire_get_preview` returns book and sandbox URLs for one exact variant. Let Histoire encode IDs and handle the configured base/router mode. Resource URIs returned by tools expose the same content without changing source or docs text.

## Screenshots and tests

Install browser execution dependencies in the project:

```sh
pnpm add -D playwright vitest @vitest/browser-playwright
pnpm exec playwright install chromium
```

Screenshots need Playwright/Chromium. Development tests additionally need Vitest 4 and `@vitest/browser-playwright`. Missing peers leave read tools available; project capabilities explain unavailable execution. Browser installation happens explicitly, never during an MCP call.

Start a job with a fresh caller-generated UUID `requestKey`:

```json
{
  "storyId": "button",
  "variantId": "default",
  "requestKey": "00000000-0000-4000-8000-000000000001"
}
```

Use this input with `histoire_capture_screenshot` or `histoire_run_tests`. Poll `histoire_get_operation` with the returned `operationId`. Terminal states are `completed`, `failed`, and `cancelled`. `histoire_cancel_operation` requests cancellation; `cancelling` means cleanup still owns the queue slot. Cancellation cannot undo side effects performed by trusted story tests.

Identical retries with the same key and parameters return the same operation during retention. A changed target returns `REQUEST_KEY_CONFLICT`. Results expire after ten minutes or earlier storage eviction; an expired result never implies a safe automatic rerun. Read large PNGs through `artifactUri`; page retained test details through the operation resource.

Development uses the project's Vitest browser runner (`project-vitest`). [Node deployments](./deploy-node.md) run the compiled embedded preview tests (`built-preview`) with Playwright, without project Vitest or runtime source collection. This covers selected story/variant tests, not project-wide tests, coverage, snapshot updates, watch mode, or CLI reporter behavior. Existing explicit test/hook deadlines still apply. A story with no tests succeeds with zero tests; failed assertions, uncollected stories, and infrastructure failures remain distinct.

Each job gets a fresh browser context. Jobs share one owned execution lane; a config restart invalidates old operations and artifacts. If browser/Vitest teardown cannot be confirmed, execution stays unavailable until the process restarts. Read tools remain usable. See [MCP reference](../reference/mcp.md) for limits and error codes.

## Validated framework combinations

Local Node.js 22 checks cover story/source discovery, preview URLs, live screenshots, Node builds, and screenshots from copied artifacts with original projects removed:

| Framework | Tested versions and setup |
| --- | --- |
| Vue 3 | Vue 3.5.26, Vite 7.3.1, `@vitejs/plugin-vue` 5.2.4 |
| Svelte 4 | Svelte 4.2.19, Vite 5.4.21, `@sveltejs/vite-plugin-svelte` 3.1.2; existing example combination, outside Histoire's current Vite 7/8 peer range |
| Svelte 5 | Svelte 5.55.0, Vite 8.0.3, `@sveltejs/vite-plugin-svelte` 7.0.0 |
| SvelteKit | SvelteKit 2.55.0 with that Svelte 5/Vite 8 combination; run `svelte-kit sync` before Histoire |
| Nuxt 4 | Nuxt 4.2.2, Vue 3.5.26 |

Browser tests have additional Vue fixture evidence for both `project-vitest` and `built-preview`: passing tests, skipped tests, failed assertions, explicit timeouts, no-test variants, and cancellation followed by another job. The framework screenshot checks do not establish browser-test parity for every framework. These are tested combinations, not guarantees for every plugin/version pairing.

## Hosting and scope

[Build a standalone Node server](./deploy-node.md) to expose MCP alongside a deployed book. Static hosting serves the book without MCP. MCP offers no file writes, shell commands, arbitrary browser scripts, DOM automation, control-state mutation, or SSR rendering. HTTP accepts native MCP clients with exact Host/Origin validation; it does not advertise browser CORS or an OAuth authorization server.
