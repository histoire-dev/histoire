# MCP reference

See [setup](../guide/mcp.md) and [Node deployment](../guide/deploy-node.md) for launch commands.

Histoire uses the official MCP server SDK 2.2.0 and Node adapter 2.1.0. Supported protocol revisions are `2026-07-28` and `2025-11-25`. HTTP is stateless Streamable HTTP with legacy compatibility. Stdio uses a compiled owned worker. Prompts, sampling, elicitation, protocol tasks, resource subscriptions, and list-changed notifications are not exposed.

## Results and identity

Tools return `structuredContent` with `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`, plus a JSON text compatibility block. Input objects reject unknown properties. Invalid protocol arguments may be SDK errors; domain failures have `isError: true` and the structured error envelope.

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
| `histoire_capture_screenshot` | `storyId`, `variantId`, `requestKey`; optional `expectedRevision`, `width`, `height`, `colorScheme`, `textDirection` | Operation handle |
| `histoire_run_tests` | `storyId`, `requestKey`; optional `variantId`, `expectedRevision` | Operation handle; omitted variant runs all variants sequentially |
| `histoire_get_operation` | `operationId` | Exact operation state/result |
| `histoire_cancel_operation` | `operationId` | Current state after queued removal or active abort request |

Operations report `queued`, `running`, `cancelling`, `completed`, `failed`, or `cancelled`, with UTC timestamps, captured epoch/revision, and result/error. A queue slot remains occupied until cleanup finishes. Revision/target checks run again when queued work starts. A config restart invalidates old handles and artifacts. Unconfirmed cleanup disables execution until process restart.

Use a new UUID request key per intended execution. Same principal, epoch, key, and normalized parameters return the same operation within retention. Different parameters return `REQUEST_KEY_CONFLICT`. Retry tombstones remain for ten minutes after terminal state, even when storage evicts the result: retry then reports `OPERATION_NOT_FOUND` rather than executing again. At most 100 tombstones are retained; admission can reject until old entries expire. After expiry a reused key may execute again.

Screenshot results include dimensions, PNG byte count/hash, and `artifactUri`. Capture is the selected iframe viewport, using a fresh browser context. There is no caller-supplied JavaScript, selector, full-page mode, or live state input. Theme defaults to configured light/dark, or light for auto; direction defaults to `ltr`.

Test results contain `engine: "project-vitest" | "built-preview"`, sanitized Histoire summary, and `truncated`. Development uses project Vitest; Node runs compiled embedded tests. A successful job can contain failed test assertions: inspect summary counts/outcomes. No tests is a zero-test summary; uncollected stories remain explicit. Full sanitized details are retained separately from the tool response. Read the operation resource with `offset`/`limit` to page suite errors, uncollected stories, then cases; follow `page.nextOffset` until absent. Aggregate counts remain on every page. Oversized retained results fail `RESULT_TOO_LARGE` after execution and must not trigger automatic retries.

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
| PNG / retained sanitized test result | 4 MiB each |
| Inline PNG in polling response | Up to 1 MiB; otherwise resource link |
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
