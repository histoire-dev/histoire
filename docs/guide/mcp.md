# MCP server <Badge type="tip" text="1.0-beta.2+" />

Connect a Model Context Protocol (MCP) client to read stories, docs, source, and variant URLs. With a browser available, the client can also capture screenshots, inspect rendered variants, and run story tests.

Rendered inspection uses a fresh isolated runtime. To read unsaved state and events in a mounted browser session, configure the authenticated adapter in the [Devframe live-inspection guide](./devframe.md).

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

Loopback without a token trusts one local principal. When several projects or untrusted code share a network namespace, set `HISTOIRE_MCP_TOKEN` or disable MCP with `--no-mcp`.

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

Check the existing browser setup before installing anything:

```sh
pnpm exec histoire screenshot-setup
pnpm exec histoire screenshot-setup --check
pnpm exec histoire screenshot-setup --json
```

The command accepts `--root <directory>` or `-c, --config <file>` to inspect another project. The first command reads setup metadata without launching a browser. `--check` performs a bounded neutral launch and closes it; neither action installs dependencies. `--json` writes one setup snapshot, or one bounded `{ error }` object, to stdout. Metadata reads exit `0` when unverified or ready and `1` when setup needs action. Explicit checks exit `0` only when ready and otherwise `1`; invalid arguments, project roots, or config exit `2`. After installing a driver or browser, rerun the command to refresh discovery. Setup can also be checked from the canvas screenshot toolbar during development.

For browser discovery and installation, follow [screenshot browser setup](./ui-screenshots-mcp.md#check-existing-setup). Screenshots and rendered inspection can use `playwright-core` and an existing browser. For a deployed artifact, follow [Node browser setup](./deploy-node.md#optional-browser-execution) on the deployment machine.

Development tests use the project's Vitest and matching `@vitest/browser-playwright` provider:

```sh
pnpm add -D vitest@^5.1.1 @vitest/browser-playwright@^5.1.1 playwright
```

The `playwright-core` opt-in does not satisfy those test-runner dependencies. Headed Vitest work may also need full Chromium. Missing peers leave read tools available; project capabilities explain unavailable execution. Browser installation happens explicitly, never during an MCP call.

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

Screenshot input also accepts integer `deviceScaleFactor` from 1 to 3 and primitive `globals`, for example `{ "theme": "contrast" }`. Width and height are CSS pixels; PNG dimensions include device scale. Captures disable animations/transitions/caret, use reduced motion, UTC and `en-US`, and settle fonts plus two animation frames. PNG bytes remain capped at 4 MiB, including at maximum dimensions. Stories read globals through `useHistoireGlobals()` from `@histoire/shared`; config `preview.globals` supplies defaults. New DPR or globals under an existing request key returns `REQUEST_KEY_CONFLICT`; key order alone does not.

`sandboxUrl` needs Histoire's trusted same-origin wrapper to become ready. Use `histoire_capture_screenshot` or the shared Node SDK capture API for external screenshot automation.

Development uses the project's Vitest browser runner (`project-vitest`). [Node deployments](./deploy-node.md) run compiled story tests (`built-preview`) with Playwright, without project Vitest or runtime source collection. This covers selected story or variant tests, not project-wide tests, coverage, snapshot updates, watch mode, or CLI reporters. Explicit test and hook deadlines still apply. A story with no tests succeeds with zero tests. Failed assertions, uncollected stories, and infrastructure failures are reported separately.

Each job gets a fresh browser context. Jobs share one owned execution lane; a config restart invalidates old operations and artifacts. If browser/Vitest teardown cannot be confirmed, execution stays unavailable until the process restarts. Read tools remain usable. See [MCP reference](../reference/mcp.md) for limits and error codes.

## Inspect a rendered variant

Four tools start a fresh isolated variant for inspection:

- `histoire_inspect_variant`: current JSON state and framework-provided automatic prop metadata, including defaults and current values.
- `histoire_inspect_dom`: bounded element subtree, selected attributes, text, CSS geometry and computed styles.
- `histoire_inspect_accessibility`: Playwright ARIA snapshot with rendered roles and accessible names; no accessibility audit.
- `histoire_get_runtime_diagnostics`: startup console, page errors, failed requests and HTTP errors, with optional observation after readiness.

For example, call `histoire_inspect_dom` with:

```json
{
  "storyId": "button",
  "variantId": "default",
  "requestKey": "00000000-0000-4000-8000-000000000002",
  "selector": "button",
  "maxNodes": 20
}
```

Poll `histoire_get_operation` with the returned `operationId`, as for screenshots. All four accept screenshot viewport, globals, color scheme and direction settings. Inspection reports the fresh mount; it does not read unsaved control changes in an open book. Results remain bounded and report `truncated`; prop metadata depends on framework support. Diagnostics can complete with `previewReady: false` and captured mount failures. See [rendered inspection reference](../reference/mcp.md#rendered-inspection) for inputs, output fields and limits.

## Framework compatibility {#validated-framework-combinations}

Use the [supported framework and Vite versions](./getting-started.md#supported-frameworks) for your project. Follow the framework’s getting-started guide before connecting an MCP client. Browser operations also need the [browser setup](#screenshots-and-tests) for the environment where Histoire runs.

## Hosting and scope

[Build a standalone Node server](./deploy-node.md) to expose MCP alongside a deployed book. Static hosting serves the book without MCP. MCP offers no file writes, shell commands, arbitrary browser scripts, browser interactions, control-state mutation, or SSR rendering. HTTP accepts native MCP clients with exact Host/Origin validation; it does not advertise browser CORS or an OAuth authorization server.

In CLI dev, config changes replace entire runtime process after cleanup. This also closes its MCP HTTP sessions. Reconnect MCP client to the announced endpoint after restart (`--mcp-port 0` can produce a new endpoint); project identity remains stable for the CLI session, while generation/revision changes invalidate old results. SDK hosting and stdio MCP retain their existing lifecycle adapters.
