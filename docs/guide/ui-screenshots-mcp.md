# Canvas screenshots and MCP activity

Development mode exposes screenshots from the canvas toolbar. Choose selected frames or all story frames, PNG or WebP, and 1×, 2×, or 3× output. Files remain under `.histoire/screenshots/`; recent captures offer **Copy path**. A per-image JSON sidecar records its story and variant for the recent list after restart.

Capture uses the same preview host, deterministic browser session, viewport limits, and server execution queue as MCP. Each request captures up to 64 frames so its result fits the dev channel. Checkerboard becomes transparent pixels. Concurrent UI and MCP work shares one lane; cancelling a canvas capture affects only that browser's request. Failed targets preserve successful captures and report partial failure.

Matrix captures include each cell's displayed props, copied when capture is requested. Later edits cannot change a queued cell's capture. Results retain the cell identity even when several cells share one story and variant.

## Check existing setup

Open **Screenshot setup** in the canvas screenshot toolbar before installing a browser. **Check setup** starts a bounded neutral browser probe; it does not load a story or install anything. After installing a driver or browser, **Check again** refreshes discovery and probes the new setup. **Copy command** copies the one repair selected by the server.

The CLI can inspect setup independently of Vite:

```sh
pnpm exec histoire screenshot-setup
pnpm exec histoire screenshot-setup --check
pnpm exec histoire screenshot-setup --json
```

The command accepts `--root <directory>` and `-c, --config <file>` to select another project. Its default reads package and installation metadata without launching a browser. `--check` explicitly starts and closes a neutral browser. Neither action installs packages or browsers. `--json` writes one setup snapshot, or one bounded `{ error }` object, to stdout. Metadata reads exit `0` when unverified or ready and `1` when setup needs action; explicit checks exit `0` only when ready and otherwise `1`. Invalid arguments, project roots, or config exit `2`; a check that cannot finish cleanly exits `1`. After installing a driver or browser, run the command again to refresh discovery.

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

If the project uses only `playwright-core`, run `pnpm exec playwright-core install chromium --only-shell` instead. With an older driver, install its default Chromium using `pnpm exec playwright install chromium` or `pnpm exec playwright-core install chromium`.

This installs only Chromium's headless shell and leaves already installed browser binaries in place. For Playwright 1.49 or newer, a confirmed shell-specific issue or pinned full renderer uses `browser: { source: 'chromium' }` with `pnpm exec playwright install chromium --no-shell` or `pnpm exec playwright-core install chromium --no-shell`. Older drivers install their default Chromium with the same command without `--no-shell`. A full browser install alone does not change the default shell choice. On supported Linux systems where the browser reports missing libraries, install OS dependencies with `pnpm exec playwright install-deps chromium` or `pnpm exec playwright-core install-deps chromium`.

Older supported drivers do not offer separate shell/full-channel choices. Use their default Chromium install (`pnpm exec playwright install chromium` or `pnpm exec playwright-core install chromium`) or upgrade the selected driver before requesting `headless-shell` or full-channel `chromium` explicitly.

Project Vitest tests still need `vitest`, `@vitest/browser-playwright`, and their browser setup as described in the [browser testing guide](./testing.md). Screenshot setup does not replace those development test dependencies. The setup panel exists in development; static books do not expose screenshot controls. Node artifacts discover browsers on the deployment machine and use the existing [SDK and MCP capture routes](./deploy-node.md#optional-browser-execution).

The MCP pane shows the actual bound HTTP endpoint, connected exchanges, current operation, and recent tool activity. Copy client configuration from that endpoint or use Histoire's existing stdio CLI. **Cancel** appears only for queued or running work with an owned cancellable execution handle. Cancellation rejection clears the pending state and shows the server's feedback; accepted cancellation waits for the operation's terminal status.

**Follow** navigates to a running operation's story and variant. Its cursor appears only on that exact ready, visible preview document. It stays hidden for a stale or unrelated frame and for ambiguous Matrix cells. Turning Follow off keeps activity history without navigating.

Activity retains at most 50 completed calls, subject to the byte limit, while keeping admitted active work. Reconnect snapshots trim completed history and optional metadata to fit the complete channel message; omission counts report missing rows. Operation IDs stay exact. Large read traffic may continue without activity rows rather than blocking the read.

Development features communicate through Vite custom events named `histoire:ui:*`. JSON payloads are bounded to 64 KB; MCP notifications project tool names, scoped targets, lifecycle, and opaque client identities. Credentials, source text, arguments, and artifact bytes stay server-owned. Listener cleanup follows the captured runtime generation, preventing stale completions after restart.

Static builds hide screenshots and MCP activity and provide no UI channel HTTP fallback.

See [Visual testing](./visual-testing.md) for tracked baselines, Matrix cases, image review, and CI comparisons.
