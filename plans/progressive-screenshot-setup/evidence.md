# Evidence and assumptions

## Checked repository baseline

Inspection date: 2026-10-08. HEAD: `0bae61e3e1d500773b26f6ed9c0e3f30f5e33234`.

Unrelated dirty paths at inspection:

- `packages/histoire-app/src/app/components/canvas/CanvasFrame.vue`
- `packages/histoire-app/src/app/components/inspector/InspectorTabs.vue`
- `packages/histoire-app/src/app/components/panes/tests/TestsTree.vue`
- `packages/histoire-app/src/app/components/panes/tests/TestsTreeRow.vue`
- `packages/histoire-vue/src/__tests__/workbench-tests-tree.spec.ts`
- `packages/histoire-vue/src/styles/tests.css`

Preserve these changes. Snapshot status again before each implementation slice; concurrent work may move HEAD or add files.

### Existing mechanisms

- [Toolbar](../../packages/histoire-app/src/app/components/canvas/toolbar/ScreenshotPopover.vue): scope, scale, format, displayed matrix props snapshots, dimensions/background, recent files, and cancellation.
- [UI service](../../packages/histoire/src/node/server/ui-channel/screenshot-service.ts): sequential targets on shared lane; partial success retained; cancelled/stale work cannot write successful output.
- [UI resolver](../../packages/histoire/src/node/server/ui-channel/screenshot.ts): appearance defaults and dev host; generic Playwright installation error today.
- [Browser session](../../packages/histoire/src/node/runtime/browser/session.ts): fresh launch/context/page; deterministic locale/timezone/reduced motion; nonce/document readiness; fonts and two frames; owned browser cleanup.
- [Dependency resolver](../../packages/histoire/src/node/runtime/browser/dependencies.ts): only `playwright`; no explicit channel; launch exceptions collapse into generic browser-unavailable guidance.
- [Dependency utility](../../packages/histoire/src/node/util/resolve-package.ts): project-first with Histoire-local fallback unless disabled.
- [Public virtual config](../../packages/histoire/src/node/virtual/resolved-config.ts): broadly serializes config except existing private agent/comment exclusions; new browser policy must be explicitly excluded immediately.
- [Lane](../../packages/histoire/src/node/runtime/execution-service.ts): one FIFO runner and quarantine after unconfirmed cleanup.
- [Capability detection](../../packages/histoire/src/node/mcp/project/capabilities.ts): browser package availability, not binary launch verification.
- [Node build package](../../packages/histoire/src/node/build/node/package.ts): optional pinned `playwright` dependency; no target machine browser configuration today.
- [Screenshot docs](../../docs/guide/ui-screenshots-mcp.md): currently recommends full `playwright install chromium`.
- [Legacy plugin](../../packages/histoire-plugin-screenshot/src/index.ts): separate `capture-website`/Puppeteer build capture; outside this pack.

## Local installation evidence

Workspace has `playwright@1.59.1` and `playwright-core@1.59.1`. CLI dry runs compared `install chromium` and `install --only-shell chromium`. The latter lists only headless shell and FFmpeg; normal Chromium install lists full Chrome and shell. No packages/browsers were installed or removed during research.

Matching revision 1217 installed directories measured with `du -sh`:

- Full Chrome: 369 MiB.
- Headless shell: 257 MiB.
- FFmpeg: 4.9 MiB.

Headless-only new installation avoids about 369 MiB, approximately 59% of those installed browser directories. These are local uncompressed disk measurements, not download sizes, cross-platform guarantees, or npm dependency sizes. Existing binaries remain after changing install instructions.

Local Playwright Chromium launcher selects `chromium-headless-shell` for headless launch without channel. Histoire uses exactly that launch policy today. This supports slice 01 without a runtime change; a fresh consumer proof still belongs to slice 07.

Public `chromium.executablePath()` has no channel argument in inspected types and documentation. Shell presence must stay unknown during launch-free metadata discovery; normal headless launch resolves it. Do not base implementation on inspected internal launcher/registry paths.

## Primary sources checked during research

- [Playwright browsers](https://playwright.dev/docs/browsers): `--only-shell`, `--no-shell`, stable Chrome/Edge channels, revision-specific browsers, shared cache, and OS dependencies.
- [Playwright BrowserType](https://playwright.dev/docs/api/class-browsertype): channel/executable selection and limits of arbitrary executable compatibility.
- [Playwright Browser](https://playwright.dev/docs/api/class-browser): fresh contexts isolate cookies/cache; context and browser have separate cleanup lifetimes.
- [html-to-image](https://github.com/bubkoo/html-to-image#how-it-works): DOM/style cloning, font/image embedding, SVG foreignObject, and tainted-canvas limits.
- [html2canvas](https://html2canvas.hertzen.com/documentation): DOM reconstruction is not an actual browser screenshot and unsupported CSS/image limitations exist.
- [getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia#security): user source selection, transient activation, and fresh permission per session.

## Assumptions fixed for implementation

1. “Lighter setup” means use available installations and minimize new downloads while preserving exact story rendering behavior.
2. An installed browser alone still needs a Node automation driver. Keep driver optional and offer project install rather than bundling it for every Histoire consumer.
3. Automatic fallback among existing setups is acceptable in `auto`; explicit choice is authoritative and never falls back.
4. Browser-side DOM export needs a distinct feature contract and fidelity evaluation, so it is not an invisible first tier here.
5. No user browser profile attachment is needed. A stable browser executable is reused with a new headless context, not their active browsing session.
6. Full browser is not a universal repair. Implementation must show evidence that the shell is insufficient before recommending that escalation automatically.
7. Probe results are owner/generation-specific and revocable; package detection alone is not a successful setup receipt.
8. Runtime speed improvements are a separate optional slice. No benchmark or strength-of-performance claim was made in this planning task.

## Open verification points, not blockers to this plan

- Confirm supported minimum Playwright/core version for full Chromium channel, neutral capture APIs, and existing deterministic capture options. No channel-aware `executablePath` is assumed.
- Verify branded known-location inventory on Linux/macOS/Windows through real smoke jobs; unit fixtures cannot establish OS launch support.
- Validate `playwright-core` package-only consumer under pnpm strict dependency boundaries and generated Node artifact packaging.
- Confirm full Chrome-specific incompatibility classifier with a real reproducible case. Until then expose full choice as manual alternative only, not automatic generic repair.
