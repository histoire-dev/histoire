# Slice 09 — Isolated live preview screenshots

## Outcome and prerequisites

Screenshot tool captures rendered variant through existing preview runtime, with correct readiness, appearance, byte limits, and cleanup. Depends on 03, 07, and 08. Reuse preview URL helper introduced in 05. This slice adds no interactive UI or arbitrary browser-control tools.

## File ownership

- Add `packages/histoire/src/node/mcp/browser/{dependencies,preview-host,readiness,screenshot,cleanup}.ts`.
- Add `packages/histoire/src/node/vite/mcp-preview-html.ts` as thin dev middleware calling transport-neutral browser/preview-host service. Install by default when dev MCP enabled; stdio explicitly enables operation host while disabling dev HTTP listener. Production routing reuses same service in 12, without Vite imports.
- Add `packages/histoire/src/node/mcp/operations/artifacts.ts`.
- Add screenshot tool registration and artifact resource to existing server modules.
- Extend worker registry for screenshot job admission/result metadata.
- Add `packages/histoire/src/node/__tests__/mcp/{screenshot,preview-readiness,artifacts}.spec.ts` and real browser integration fixture.

## Tests first

1. Real Vue variant completes iframe readiness and produces decodable nonempty PNG at requested viewport. Wrong story/variant readiness, foreign origin/source frame, or stale nonce cannot settle job.
2. Cold-start mock-enabled story renders under same setup/mocker path as app. No top-level sandbox readiness assumption; host messaging currently refuses unembedded sandbox.
3. docsOnly/missing/ambiguous target fails before browser launch. Missing Playwright or Chromium produces actionable error without installation.
4. Custom Vite base, hostile IDs, light/dark, and ltr/rtl reach correct preview. Test rendered semantic text/direction and decoded image dimensions, not CSS class strings or pixel baselines.
5. Page error/timeout/cancel/restart closes owned context/browser and removes nonce route/artifact. Fresh second job has no cookies/localStorage/variant-state from first.
6. PNG byte bound/inline threshold/resource retrieval/hash/expiry work; foreign handle cannot read artifact. Oversized image fails without unbounded storage.

## Implementation steps

1. Resolve Playwright project-first through existing resolver and dynamic import. Reuse dependency/preflight messages where applicable; Chromium launch only, no browser auto-install/download or Puppeteer fallback.
2. Register minimal same-origin host document when MCP runtime feature enabled (default in dev). Request path uses per-job unguessable nonce; host handler resolves active job target internally, never accepts arbitrary story/URL/state query. Dev middleware installs before app fallback; routes expire on cleanup. Host rendering/message logic must be transport-neutral so 12 can serve same host over compiled assets. This route also exists in stdio worker without enabling dev HTTP MCP listener.
3. Host embeds existing `<base>__sandbox.html` URL for selected variant. Register readiness listener before iframe insertion. Validate origin, exact iframe contentWindow, marker, message type, storyId, variantId, and active host nonce/epoch.
4. Reuse shared preview constants/message guards and current PREVIEW_SETTINGS_SYNC protocol. Supply existing PreviewSettings fields: viewport sizes, rotate false, configured background, checkerboard false, textDirection. Color scheme uses existing preview dark-mode mechanism, not a new message schema or persisted UI preference.
5. Wait SANDBOX_READY and matching VARIANT_READY, then fonts readiness and one stable animation frame within same 30-second total deadline. No arbitrary sleep/networkidle-only heuristic. Do not claim all animations/external data have settled; stories can own that behavior.
6. Fresh browser/context/page per job initially favors isolation over pooling. Same-origin host contains no source/token/absolute paths. Internal automation code may evaluate fixed readiness state; no caller-supplied script/evaluate tool.
7. Capture iframe viewport using Playwright locator screenshot; dimensions follow requested viewport, no fullPage expansion. Close all handles in finally. Reuse existing timeout helpers and forceKillPlaywrightBrowser fallback, with teardown outcome reported to execution service.
8. Add immutable in-memory artifact store with byte/hash/MIME/epoch/principal. Poll completed screenshot returns metadata plus inline image only under 1 MiB, otherwise resource_link. Repeated polling never rerenders.
9. Resource reads return retained PNG blob under 4 MiB cap. Clear artifacts on expiration, close, and epoch change; no arbitrary file path save option.
10. Mark execution unavailable if owned browser cannot be confirmed closed/killed. Never run next job while unknown active work remains.

## Acceptance and validation

Run pure readiness/artifact suites, then real Chromium screenshot suite and current app preview/message guards. Shared/core/app build and focused lint. Prove Vue + at least one mock-enabled story now; Svelte/Nuxt and transport matrix follow in 14. Record image dimensions/hash and cleanup evidence, no visual-baseline tests. Production screenshot transport reuse is accepted in 12/14.

## Non-goals and handoff

No click/type/evaluate API, controls-state mutation, runtime prop reflection, console-log streaming, arbitrary URL capture, Percy integration, or build screenshot rewrite. Handoff includes artifact protocol, actual browser dependency evidence, and cancellation-safe executor for common lane.

## Implementation evidence

- Implemented transport-neutral `createPreviewHostRegistry`, guarded fixed host script, `createPreviewSession`, and lane-owned `createScreenshotTask`. Inactive Vite middleware installs ahead of sandbox/history fallback; registry keys Connect stack to preserve identity across Vite's returned proxy. Dev HTTP and stdio register same screenshot executor. Generic host/session graph imports no Vite.
- Host uses cryptographic nonce, active generation lease, exact source window/origin/marker/story/variant matching; script data escapes closing tags and Unicode line separators. Appearance uses existing color-scheme storage and PREVIEW_SETTINGS_SYNC payload. Shared `normalizePreviewBase` rejects off-origin and dot-segment bases. Browser startup/readiness/fonts/frame/capture share one 30-second deadline. Page errors and cancellation close browser promptly; exposed session close observes pending acquisition and cannot permit later context creation.
- Reused slice08 artifact store and resource registration; added no duplicate artifact store. PNG dimensions/completeness, 4 MiB capture bound, SHA-256, independent artifact capability, inline 1 MiB threshold and resource-link behavior are covered. Optional Playwright resolves project-first, supports CommonJS default export, and provides actionable missing peer/Chromium errors without installation.
- Confirmed teardown shared with project Vitest through `util/playwright-cleanup.ts`: graceful browser close or force signal plus observed owned PID exit; unknown teardown throws CLEANUP_UNCONFIRMED. Captured process survives graceful close internals removal; ChildProcess.killed no longer falsely means process exited.
- Real Node22 Chromium probe copied controlled Vue fixture outside repository, used `/book/`, story `..` and variant `a:/雪`, and proved cold mocked text, dark/light, RTL/LTR, fresh-context localStorage isolation, decoded 480x320 PNGs, retained resource hashes, foreign principal denial and all four owned browser PIDs gone. Two screenshot operations produced 3372-byte PNG with SHA-256 `5ae38d8e0b275cbd3cc8b2ac9536ec1ca21a5395e5e0f2e5b15098348504facb`; browser Image.decode confirmed dimensions. Natural probe exit code 0. Controlled fixture and real PNG are retained under `__tests__/fixtures/mcp-preview` for later conformance reuse.
- Probe exposed existing mock resolver bug under custom Vite base: browser stack importer `/book/Preview.story.vue` resolved inside project `/book` folder, silently registering raw `./greeting`. Shared RPC now maps origin/base browser URL to loaded Vite module id before resolveId/resolveMock. Focused mock importer tests plus existing RPC/message guard suites pass.
- Cold optimizer reload also exposed iframe WindowProxy lifetime mismatch. Preview messages now carry fresh documentId; host checks current document and resets readiness per document. Session checks live authority after fonts/frame and after capture, discards replaced-document pixels, and waits replacement within original deadline. First screenshot operation now passes with empty owned optimizer cache before any manual browser session. Uncaught page errors remain PREVIEW_NOT_READY; caller cancellation and whole-session timeout retain distinct categories.
- Final focused Node22 run: 10 files / 56 tests passed after all final guards, including emitted preview runtime regression checks. Focused ESLint clean; shared/core builds and final core noEmit pass. Final aggregate workspace/deployed transport checks belong root integration and slices12–15. No staging/commit/push/publication.
