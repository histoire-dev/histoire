# Canvas screenshots and MCP activity

Development mode exposes screenshots from the canvas toolbar. Choose selected frames or all story frames, PNG or WebP, and 1×, 2×, or 3× output. Files remain under `.histoire/screenshots/`; recent captures offer **Copy path**. A per-image JSON sidecar records its story and variant for the recent list after restart.

Capture uses the same preview host, deterministic browser session, viewport limits, and server execution queue as MCP. Each request captures up to 64 frames so its result fits the dev channel. Checkerboard becomes transparent pixels. Concurrent UI and MCP work shares one lane; cancelling a canvas capture affects only that browser's request. Failed targets preserve successful captures and report partial failure.

Matrix captures include each cell's displayed props, copied when capture is requested. Later edits cannot change a queued cell's capture. Results retain the cell identity even when several cells share one story and variant.

Playwright is an optional project dependency. When unavailable, install it in the project:

```sh
pnpm add -D playwright
pnpm exec playwright install chromium
```

The MCP pane shows the actual bound HTTP endpoint, connected exchanges, current operation, and recent tool activity. Copy client configuration from that endpoint or use Histoire's existing stdio CLI. **Cancel** appears only for queued or running work with an owned cancellable execution handle. Cancellation rejection clears the pending state and shows the server's feedback; accepted cancellation waits for the operation's terminal status.

**Follow** navigates to a running operation's story and variant. Its cursor appears only on that exact ready, visible preview document. It stays hidden for a stale or unrelated frame and for ambiguous Matrix cells. Turning Follow off keeps activity history without navigating.

Activity retains at most 50 completed calls, subject to the byte limit, while keeping admitted active work. Reconnect snapshots trim completed history and optional metadata to fit the complete channel message; omission counts report missing rows. Operation IDs stay exact. Large read traffic may continue without activity rows rather than blocking the read.

Development features communicate through Vite custom events named `histoire:ui:*`. JSON payloads are bounded to 64 KB; MCP notifications project tool names, scoped targets, lifecycle, and opaque client identities. Credentials, source text, arguments, and artifact bytes stay server-owned. Listener cleanup follows the captured runtime generation, preventing stale completions after restart.

Static builds hide screenshots and MCP activity and provide no UI channel HTTP fallback.
