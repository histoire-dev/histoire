# MCP reference

See [setup](../guide/mcp.md) and [Node deployment](../guide/deploy-node.md) for launch commands.

Histoire uses the official MCP server SDK 2.2.0 and Node adapter 2.1.0. Supported protocol revisions are `2026-07-28` and `2025-11-25`. HTTP is stateless Streamable HTTP with legacy compatibility. Stdio uses a compiled owned worker. Prompts, sampling, elicitation, protocol tasks, resource subscriptions, and list-changed notifications are not exposed.

## Results and identity

Tools return `structuredContent` with `{ ok: true, data }` or `{ ok: false, error: { code, message, retryable, details? } }`, plus a JSON text compatibility block. Input objects reject unknown properties. Invalid protocol arguments may be SDK errors; domain failures have `isError: true` and the structured error envelope.

`projectId` identifies the controller, `epoch` its runtime lifetime, and `revision` one completed catalog publication. Node also reports immutable `buildId`. Project status is `starting`, `ready`, `restarting`, `failed`, or `closed`. `updating: true` means collection is running against the last completed publication. Diagnostics describe failed/empty/ambiguous collection without inventing story entries.

IDs are exact, case-sensitive strings, at most 2048 UTF-8 bytes. They can contain spaces, Unicode, slashes, percent signs, or dot-only names. Always use returned IDs and resource/preview URLs; do not normalize IDs as paths or construct URIs with string concatenation. Duplicate story IDs are listed with diagnostics but reject direct lookup. Duplicate variant IDs reject that executable target.

## Read tools

| Tool | Input | Output |
| --- | --- | --- |
| `histoire_get_project` | `{}` | Lifecycle, revision, story/variant counts, diagnostics, capabilities |
| `histoire_list_stories` | Optional `query`, `supportPluginId`, `group`, `pageSize`, `cursor` | Revision-pinned story page, `total`, optional `nextCursor` |
| `histoire_get_story` | `storyId`, optional `expectedRevision` | Story metadata and resource URIs |
| `histoire_get_docs` | `storyId`, optional `offset`, `limit`, `expectedRevision` | Text page, docs kind/origin, SHA-256 |
| `histoire_get_source` | `storyId`, optional `startLine`, `lineCount`, `expectedRevision` | Exact selected source lines, total lines, SHA-256, optional `nextLine` |
| `histoire_get_preview` | `storyId`, `variantId`, optional `expectedRevision` | `storyUrl` and `sandboxUrl` |

Search is case-insensitive substring matching over tree path, title, variant titles, and registered relative path. Filter values match exactly. Results sort by relative path then story ID. Cursor filters must remain unchanged. The latest two catalog snapshots can serve cursors for 60 seconds; expiry returns `CURSOR_EXPIRED`.

Docs priority is sibling Markdown, standalone Markdown, then collected `docsText`. Collected docs are plain text, including inline Vue docs. Docs offsets count Unicode code points. Empty existing docs return an empty page; absent docs return `DOCS_NOT_FOUND`. HTML is not returned. Source can be a registered physical file or virtual module. Reads reject files outside the canonical project root, changed file identity/content, invalid UTF-8, binary content, and oversized files. SHA-256 covers full original UTF-8 content; selected source text preserves original line endings. A terminal newline adds no phantom line.

Read tools do not launch browsers. Startup discovery evaluates trusted project/config code. Public metadata excludes absolute project root, config callbacks, arbitrary story metadata, and credentials; project content is not automatically scrubbed for secrets.

## Execution tools

| Tool | Input | Output |
| --- | --- | --- |
| `histoire_capture_screenshot` | `storyId`, `variantId`, `requestKey`; optional `expectedRevision`, `width`, `height`, `deviceScaleFactor`, `globals`, `colorScheme`, `textDirection` | Operation handle |
| `histoire_run_tests` | `storyId`, `requestKey`; optional `variantId`, `expectedRevision` | Operation handle; omitted variant runs all variants sequentially |
| `histoire_inspect_variant` | `storyId`, `variantId`, `requestKey`; optional preview settings below | Operation handle for rendered state and automatic prop metadata |
| `histoire_inspect_dom` | Same target/settings; optional `selector`, `maxNodes`, `maxDepth` | Operation handle for element subtree, attributes, geometry and computed styles |
| `histoire_inspect_accessibility` | Same target/settings; optional `selector`, `maxCharacters` | Operation handle for rendered ARIA snapshot |
| `histoire_get_runtime_diagnostics` | Same target/settings; optional `observationMs` | Operation handle for startup console, page and network failures |
| `histoire_get_operation` | `operationId` | Exact operation state/result |
| `histoire_cancel_operation` | `operationId` | Current state after queued removal or active abort request |

Operations report `queued`, `running`, `cancelling`, `completed`, `failed`, or `cancelled`, with UTC timestamps, captured epoch/revision, and result/error. A queue slot remains occupied until cleanup finishes. Revision/target checks run again when queued work starts. A config restart invalidates old handles and artifacts. Unconfirmed cleanup disables execution until process restart.

Use a new UUID request key per intended execution. Same principal, epoch, key, and normalized parameters return the same operation within retention. Different parameters return `REQUEST_KEY_CONFLICT`. Retry tombstones remain for ten minutes after terminal state, even when storage evicts the result: retry then reports `OPERATION_NOT_FOUND` rather than executing again. At most 100 tombstones are retained; admission can reject until old entries expire. After expiry a reused key may execute again.

Screenshot results include decoded PNG dimensions, byte count/hash, and `artifactUri`. Request width/height are CSS viewport pixels; result width/height are multiplied by integer `deviceScaleFactor` (1–3, default 1). The independent 4 MiB PNG limit still applies. Capture uses a fresh browser context with timezone `UTC`, locale `en-US`, reduced motion, disabled animations/transitions, hidden caret, and fonts plus two animation frames settled within the existing 30-second deadline. These defaults improve repeatability without promising identical pixels across browser/font/platform versions. Test execution preserves its existing timezone, locale, and story styles.

`globals` uses the same primitive map as SDK preview settings: at most 32 keys matching `^[A-Za-z][\w-]{0,63}$`, excluding `__proto__`, `constructor`, and `prototype`; values are finite numbers, booleans, null, or strings bounded by a 1 KiB serialized value. Missing globals use `preview.globals` from config or immutable artifact; supplied map replaces that default map. Stories read reactive values with `useHistoireGlobals()` from `@histoire/shared`; Vue setup hooks also receive `globals`. Retry fingerprints include DPR and sorted globals. Invalid values reject before browser admission.

Capture exposes no caller JavaScript, CSS, selector, full-page mode, or live state input. Theme defaults to configured light/dark, or light for auto; direction retains its `ltr` default. The shared Node SDK capture service uses the same browser host and policy. `sandboxUrl` is a same-origin embedded runtime URL: opening it top-level does not establish preview readiness. External capture hosts should use the screenshot tool or Node SDK capture API.

Test results contain `engine: "project-vitest" | "built-preview"`, sanitized Histoire summary, and `truncated`. Development uses project Vitest; Node runs compiled embedded tests. A successful job can contain failed test assertions: inspect summary counts/outcomes. No tests is a zero-test summary; uncollected stories remain explicit. Full sanitized details are retained separately from the tool response. Read the operation resource with `offset`/`limit` to page suite errors, uncollected stories, then cases; follow `page.nextOffset` until absent. Aggregate counts remain on every page. Oversized retained results fail `RESULT_TOO_LARGE` after execution and must not trigger automatic retries.

## Rendered inspection

The four inspection tools require Playwright/Chromium and report availability under `capabilities.inspection`. They run through the same queue, cancellation, request-key retention, revision checks and operation resources as screenshots. Dev HTTP, owned stdio and Node deployments expose the same tools. Each job mounts a fresh isolated variant with the screenshot determinism settings; results describe that mount, not a user's open preview or unsaved control changes.

All four require `storyId`, `variantId` and `requestKey`. Optional `expectedRevision`, `width`, `height`, `deviceScaleFactor`, `globals`, `colorScheme` and `textDirection` use screenshot input rules. Results include exact target IDs, CSS `viewport` dimensions, an `inspection` discriminator and `truncated`. The serialized result is bounded to 60 KiB; complete rows or state fields can be removed to preserve exact target identities. Polling and operation resources return the same retained snapshot. Inspection accepts no caller script or state mutation.

### Variant state and props

`histoire_inspect_variant` returns `inspection: "variant"`, bounded JSON `state`, `components`, `propsAvailable` and `omittedValues`. Component rows contain `name`, runtime `index` and prop rows with `name`, optional `types`, `required`, `default`, current `value` and enum `values`. Current automatic prop overrides take precedence over collected values. Only metadata provided by the framework plugin is available; `propsAvailable: false` distinguishes missing automatic metadata from an empty list.

Runtime-owned `_h*` fields are excluded from state. Cycles, callbacks, getters, computed refs and unsupported values become null or are omitted without invocation; ordinary refs project their current value without exposing Vue internals. `omittedValues` and `truncated` report lossy projection, including clipped metadata strings and lists. Work is bounded by depth 10, 2000 visited values, 100 array items and 4096 characters per string. Component and prop labels have a separate 20 KiB budget that stops metadata traversal before transfer. At most 100 components with 100 props each survive initial projection; the full result byte limit can reduce these further. Defaults are descriptive JSON, never executed factories.

### DOM

`histoire_inspect_dom` inspects the first match for a CSS `selector` (default `body`, at most 512 characters). `maxNodes` defaults to 200, maximum 500; `maxDepth` defaults to 8, maximum 20, with root depth zero. Invalid CSS returns `INVALID_SELECTOR`; absent roots return `matched: false` and an empty `nodes` list.

Each node contains `index`, `parentIndex`, lowercase `tag`, allowlisted `attributes`, direct `text`, CSS viewport `rect` and selected computed `styles`. Traversal includes open shadow roots, excludes script/style/template content, and reports truncation when depth, nodes, strings or bytes are capped. Input and textarea values, event handlers and arbitrary attributes are excluded. HTTP(S) `href`/`src` values omit credentials, query strings and fragments. Text reflects rendered project content; this is not a general secret scrubber.

### Accessibility structure

`histoire_inspect_accessibility` uses the same CSS selector policy and returns `inspection: "accessibility"`, `matched`, Playwright's ARIA YAML `snapshot` and `totalCharacters`. `maxCharacters` defaults to 16384, maximum 32768. Truncation can end within an entry. Requires a Playwright version providing `locator.ariaSnapshot`; unavailable support returns `CAPABILITY_UNAVAILABLE`.

This reports rendered roles, names and accessibility structure. It does not run axe or establish accessibility compliance.

### Runtime diagnostics

`histoire_get_runtime_diagnostics` attaches observers before navigation, then observes for `observationMs` after readiness (default 250 ms, range 0–2000). Returns `inspection: "diagnostics"`, `previewReady`, optional `readinessError`, `entries` and `droppedCount`. Entry kinds are `console`, `page-error`, `request-failed` and `http-error`; rows contain text plus optional level, resource URL or HTTP status.

Up to 100 rows and 48 KiB of telemetry are retained before the complete result limit. Messages use existing diagnostic sanitization for known project root and MCP credentials. Resource URLs omit credentials, queries and fragments. Headers, request/response bodies, console argument objects and stacks are not collected. Project console text can contain other project secrets.

A mount failure or readiness timeout with captured evidence can complete with `previewReady: false` and `readinessError`, allowing the agent to inspect the failure. Cancellation and missing browser dependencies remain operation failures/cancellation. Each observer is removed during owned browser cleanup.

## Resources

Tools provide canonical URIs. Templates have these shapes:

```text
histoire://<projectId>/project
histoire://<projectId>/stories/<encodedStoryId>
histoire://<projectId>/stories/<encodedStoryId>/docs?offset=0&limit=8192
histoire://<projectId>/stories/<encodedStoryId>/source?startLine=1&lineCount=200
histoire://<projectId>/operations/<operationId>?offset=0&limit=100
histoire://<projectId>/artifacts/<artifactId>
```

Project/story/operation resources contain JSON. Docs/source resources contain raw text with MIME type and revision/hash/page metadata. PNG resources contain base64 `blob` with `image/png`. Operation and artifact URIs are returned by tools rather than enumerated globally. Access remains scoped to the same principal/project/epoch. Story/content URIs accept optional `revision`; unknown or duplicate query keys fail.

## Bounds

| Limit | Value |
| --- | --- |
| Encoded structured tool envelope | 128 KiB; compatibility text duplicates it on the wire |
| HTTP request body | 1 MiB |
| Concurrent HTTP calls | 16; overflow returns 429 with Retry-After |
| Story page | 50 default, 100 maximum; query 256 characters |
| Docs page | 8192 default, 32768 maximum Unicode code points |
| Source page | 200 default, 500 maximum lines; file 2 MiB maximum |
| Diagnostics | 100 entries, 4096 UTF-8 bytes per message |
| Waiting execution jobs | 4 per MCP principal, 8 total; one active job |
| Screenshot viewport | Default 1280×800; width 320–3840, height 240–2160 |
| Screenshot device scale / PNG pixels | Integer DPR 1–3; decoded PNG up to 11520×6480 |
| PNG / retained sanitized test result | 4 MiB each |
| Inline PNG in polling response | Up to 1 MiB; otherwise resource link |
| Serialized rendered inspection result | 60 KiB; schema rejects over 64 KiB |
| Combined retained storage | 32 MiB; at most 20 terminal operations |
| Terminal retention | Ten minutes after finish, subject to storage eviction |
| Preview readiness / browser cleanup | 30 seconds / 10 seconds |

Whole-job test safety budgets come from existing `test.collectTimeout`, `test.storyCollectTimeout`, and `test.runTimeout`. Embedded test/hook deadlines remain unchanged.

## Troubleshooting

| Error/state | Action |
| --- | --- |
| `STALE_REVISION`, `CURSOR_EXPIRED` | Refresh catalog and start a new read sequence |
| `STORY_AMBIGUOUS`, invalid target | Fix duplicate IDs or use exact discovered target |
| `SOURCE_UNAVAILABLE`, `DOCS_NOT_FOUND` | Check registered content, containment, or Node includeSource policy |
| `DEPENDENCY_MISSING`, `BROWSER_UNAVAILABLE` | Install the named optional peer and Chromium in the actual project/artifact |
| `CAPABILITY_UNAVAILABLE` | Inspect project capabilities; rebuild embedded runtime or restart after failed cleanup |
| `cancelling` | Continue polling until owned cleanup reaches a terminal state |
| `OPERATION_NOT_FOUND` | Result expired or belongs to another lifetime/principal; do not blindly rerun |
| Stdio startup/config failure | Inspect stderr; stdout must remain protocol-only |
| HTTP 401/403 | Check bearer credential and exact Host/Origin; preserve PUBLIC_ORIGIN through proxy |

See [browser testing](../guide/testing.md) for story test APIs and migration.
