# Canvas screenshots and MCP activity <Badge type="tip" text="1.0-beta.2+" />

Development mode exposes screenshots from the canvas toolbar. Choose selected frames or all story frames, PNG or WebP, and 1×, 2×, or 3× output. Files remain under `.histoire/screenshots/`; recent captures offer **Copy path**. A per-image JSON sidecar records its story and variant for the recent list after restart.

Each request captures up to 64 frames. PNGs show transparent pixels where the canvas uses a checkerboard. Canvas captures and MCP jobs share the server queue, but cancelling a canvas capture cancels only your request. If some frames fail, Histoire keeps the successful captures and reports the failures.

Matrix captures include each cell's displayed props, copied when capture is requested. Later edits cannot change a queued cell's capture. Results retain the cell identity even when several cells share one story and variant.

## Check existing setup

Open **Screenshot** in the canvas toolbar to check your browser setup. Capture controls appear when the check passes. If setup needs attention, follow the setup message. When **Copy command** appears, use it to copy the repair command and run it in your terminal. After making changes, choose **Check again**. Reopening the menu while a check is running reuses that check.

The CLI can inspect setup independently of Vite:

```sh
pnpm exec histoire screenshot-setup
pnpm exec histoire screenshot-setup --check
pnpm exec histoire screenshot-setup --json
```

Use `--root <directory>` or `--config <file>` (`-c`) to inspect another setup. By default, the command reads package and installation metadata. Add `--check` to launch and close a browser without loading a story. Both forms leave the installation alone. Add `--json` to write one setup snapshot or bounded `{ error }` object to stdout.

Metadata reads exit `0` for unverified or ready setups and `1` when action is needed. Explicit checks exit `0` only when ready and `1` otherwise, including incomplete checks. Invalid arguments, roots, or config exit `2`.

With Playwright 1.49 or newer, automatic setup tries compatible local choices in this order: matching Chromium headless shell, matching cached full Chromium, stable Google Chrome, then stable Microsoft Edge. Older supported drivers use their default matching Chromium headless executable before checking Chrome and Edge; they do not have separate shell/full-channel choices. Bundled Chromium stays aligned with the selected driver version. Chrome and Edge may render differently from that pinned version; set an explicit supported browser source when repeatable renderer choice matters. See the [`browser` config](../reference/config.md#browser).

Histoire moves to the next candidate only when neutral browser startup fails for a classified setup reason and cleanup completes. Once a renderer starts loading a story, navigation, readiness, or story failures stay capture failures; Histoire does not retry them in another browser.

If a browser driver is missing but Chrome or Edge is already installed, install only a driver first and check again. `playwright-core` is a smaller opt-in driver for Histoire screenshots and rendered inspection; it does not include browser binaries or enable development Vitest tests:

```sh
pnpm add -D playwright-core
pnpm exec histoire screenshot-setup --check
```

If no supported browser is available and the selected driver is Playwright 1.49 or newer, install the driver's Chromium headless shell:

```sh
pnpm add -D playwright
pnpm exec playwright install chromium --only-shell
```

If the project uses only `playwright-core`, run `pnpm exec playwright-core install chromium --only-shell`. The headless shell installation leaves existing browsers in place.

For a confirmed shell issue or an explicit full Chromium choice on Playwright 1.49 or newer, set `browser: { source: 'chromium' }` and install with `pnpm exec playwright install chromium --no-shell` or `pnpm exec playwright-core install chromium --no-shell`. The automatic source still prefers a matching headless shell when available. Explicit sources have no fallback.

For older supported Playwright drivers, install default Chromium with `pnpm exec playwright install chromium` or `pnpm exec playwright-core install chromium`. Upgrade the driver for explicit `headless-shell` or full-channel `chromium` selection.

If the browser reports missing system libraries on supported Linux systems, run `pnpm exec playwright install-deps chromium` or `pnpm exec playwright-core install-deps chromium`, matching your driver. Run the check again after each change.

Project Vitest tests still need `vitest`, `@vitest/browser-playwright`, and their browser setup as described in the [browser testing guide](./testing.md). Screenshot setup does not replace those development test dependencies. The setup panel exists in development; static books do not expose screenshot controls. Node artifacts discover browsers on the deployment machine and use the existing [SDK and MCP capture routes](./deploy-node.md#optional-browser-execution).

## MCP activity

In the development workbench, open **MCP** in the **AI** tab to see the HTTP endpoint, connections, current operation, and recent calls. Copy the client configuration or use [stdio](./mcp.md#stdio).

Use **Cancel** for a queued or running operation that supports cancellation. Histoire shows the server's response if it rejects cancellation. After acceptance, the operation stays pending until cleanup finishes.

Turn on **Follow** to open the running operation's story and variant. The cursor appears on the matching frame once it is ready and visible. In Matrix, it appears only when Histoire can identify the cell. Turn Follow off to keep activity history without navigating.

Activity shows active work and up to 50 completed calls. If the history exceeds its size limit, the workbench reports how many rows it omitted. Large reads can complete without an activity row.

Activity identifies the tool, its target or client, and its status. Credentials, source text, arguments, and image bytes are excluded from activity. Restarting Histoire clears the activity history.

See [Visual testing](./visual-testing.md) for tracked baselines, Matrix cases, image review, and CI comparisons.
