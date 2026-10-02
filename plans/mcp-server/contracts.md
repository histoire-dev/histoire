# MCP application contracts

This file is authoritative for v1 tool names, DTO fields, limits, URI shapes, and errors. All slices consume the same schemas; do not redefine them in transports or tests. Public behavior changes require updating this file and conformance tests together.

## Common values

- `projectId`: opaque ID derived from canonical dev root or Node buildId plus controller-instance salt; no absolute path. One controller serves one project/artifact.
- `epoch`: random UUID per runtime generation.
- `revision`: opaque `<epoch>:<positive-counter>` assigned only on completed catalog publication.
- `storyId`/`variantId`: existing Histoire IDs preserved byte-for-byte. Validate non-empty strings, maximum 2048 UTF-8 bytes; never lowercase, slugify, concatenate with separators, or infer variants from titles.
- Target identity is `{ storyId, variantId }`. Variant IDs are scoped to story. Explicit missing IDs fail; never select first variant silently.
- `requestKey`: caller-generated opaque string, 1–128 ASCII characters, used only by execution tools for retry deduplication.
- `operationId`/`artifactId`: independent random capabilities with >=128 bits entropy, stored with principal, projectId, and epoch; never derived from story IDs or paths.
- Unknown object keys are rejected. All numeric values must be finite integers where specified. No regex, raw Vitest args, URL, pathname, output folder, executable, or JavaScript input is accepted.
- Registered relative paths are output metadata, never read authority. Parent segments may describe externally registered stories with unavailable MCP source; absolute paths, drive roots, backslashes, and NUL are rejected. Artifact storage paths use a separate strict schema that rejects parent segments.

## Success/error envelope

Every tool success has `structuredContent: { ok: true, data: <DTO> }` and one text content item containing identical JSON. Screenshot polling may additionally return image/resource-link content as specified below. Output schema accepts success or error envelope.

The 128 KiB metadata budget applies to the encoded structured JSON envelope. SDK compatibility text repeats that envelope on the wire; it is not an additional independent metadata allocation budget. PNG image content and binary resource frames have their separate bounds below.

Expected domain failures return `isError: true`, `structuredContent: { ok: false, error: { code, message, retryable, details? } }`, and matching JSON text. Details contain bounded IDs, relative paths, and diagnostics only. A failed test assertion is a completed successful tool operation with `summary.ok: false`, not a transport failure. Unknown tool/malformed wire requests remain SDK protocol errors. Resource read failures use SDK-supported resource/protocol errors, not a fictitious resource `isError` field.

Codes: `PROJECT_STARTING`, `PROJECT_RESTARTING`, `PROJECT_CLOSED`, `COLLECTION_FAILED`, `STORY_NOT_FOUND`, `STORY_AMBIGUOUS`, `VARIANT_NOT_FOUND`, `DOCS_NOT_FOUND`, `SOURCE_UNAVAILABLE`, `PATH_OUTSIDE_ROOT`, `STALE_REVISION`, `INVALID_CURSOR`, `CURSOR_EXPIRED`, `DEPENDENCY_MISSING`, `CAPABILITY_UNAVAILABLE`, `BROWSER_UNAVAILABLE`, `PREVIEW_NOT_READY`, `QUEUE_FULL`, `REQUEST_KEY_CONFLICT`, `OPERATION_NOT_FOUND`, `ARTIFACT_NOT_FOUND`, `RESULT_TOO_LARGE`, `CANCELLED`, `TIMEOUT`, `INTERNAL_ERROR`.

Retryable means retry may help after external state changes; it does not recommend automatically executing another job. Operation retries use same `requestKey`.

## DTOs

```ts
/** Stable catalog entry; source/docs text is fetched separately. */
interface McpStory {
  /** Existing collected ID. */
  id: string
  /** Existing display title after tree normalization. */
  title: string
  /** Existing navigation hierarchy, distinct from display title. */
  treePath: string[]
  /** Project-relative registered path, with slash separators. */
  filePath: string
  /** Support plugin ID from Histoire. */
  supportPluginId: string
  /** Optional collected group. */
  group?: string
  /** Documentation-only stories cannot render a variant. */
  docsOnly: boolean
  /** Metadata only; no runtime state or handlers. */
  variants: { id: string, title: string }[]
  /** Catalog-derived content availability. */
  docsAvailable: boolean
  /** False for unavailable/unsafe physical source. */
  sourceAvailable: boolean
  /** Raw source is physical text or generated virtual module text. */
  sourceKind: 'file' | 'virtual' | 'unavailable'
}
```

Project DTO: `{ projectId, epoch, runtimeMode: 'dev'|'node', buildId?: string, status: 'starting'|'ready'|'restarting'|'failed'|'closed', revision?: string, updating: boolean, title, base, routerMode, storyCount, variantCount, capabilities: { catalog, content, previews, screenshots, tests }, diagnostics: Diagnostic[] }`. Browser capability values are `{ available: boolean, reason?: string }`; tests additionally reports `engine: 'project-vitest'|'built-preview'|'unavailable'`. Check package availability without launching browser or silently installing it. Node mode assigns one immutable runtime revision associated with buildId, with no updates/HMR; new process receives new epoch/revision. Never serialize whole config, plugin hooks, environment, Vite internals, absolute paths, or arbitrary story `meta`.

Diagnostic: `{ filePath?: string, storyId?: string, code: string, message: string }`. At most 100 diagnostics, each message at most 4096 UTF-8 bytes, with `diagnosticsTruncated` when capped. Scrub token and canonical root prefix from server-generated errors. Story/source/docs contents themselves are project data and are not promised secret detection.

## Read tools

| Tool | Strict input | `data` on success |
| --- | --- | --- |
| `histoire_get_project` | `{}` | Project DTO, including starting/failed states |
| `histoire_list_stories` | `{ query?: string, supportPluginId?: string, group?: string, pageSize?: number, cursor?: string }` | `{ projectId, revision, updating, items: McpStory[], nextCursor?: string, total, diagnostics, diagnosticsTruncated }` |
| `histoire_get_story` | `{ storyId: string, expectedRevision?: string }` | `{ projectId, revision, story: McpStory, resources: { story, docs?, source? } }` |
| `histoire_get_docs` | `{ storyId: string, offset?: number, limit?: number, expectedRevision?: string }` | Text page plus `{ kind: 'markdown'|'text', filePath?: string, origin: 'sibling'|'standalone'|'collected' }` |
| `histoire_get_source` | `{ storyId: string, startLine?: number, lineCount?: number, expectedRevision?: string }` | `{ projectId, revision, storyId, kind: 'file'|'virtual', filePath, text, startLine, endLine, totalLines, nextLine?: number, sha256 }` |
| `histoire_get_preview` | `{ storyId: string, variantId: string, expectedRevision?: string }` | `{ projectId, revision, storyId, variantId, storyUrl, sandboxUrl }` |

Read tools annotate `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`. They do not launch browsers. Discovery may execute project code during runtime startup; tools do not trigger extra collection.

Search is case-insensitive substring over full tree path, display title, variant titles, and registered relative path. Query maximum 256 characters. Default pageSize 50, maximum 100. Sort by relative path then exact story ID. Filter values compare exact values. Cursor is opaque, server-validated, includes projectId/revision/filter fingerprint/offset; changed filters reject. Retain latest two snapshots for cursor reads for 60 seconds; evicted/expired cursor fails with `CURSOR_EXPIRED`. No cross-revision merging of pages.

Duplicate story IDs appear in list with diagnostic and are excluded from executable lookup; direct access fails `STORY_AMBIGUOUS`. Duplicate variant IDs within one story produce diagnostic and reject that target. Failed/uncollected files are diagnostics, not fabricated story entries. An empty ready catalog is valid and differs from failed collection.

Docs priority: sibling Markdown > standalone Markdown story > collected `docsText`. Inline Vue docs are exposed as collected plain text; no new SFC parser and no promise of raw Markdown for custom blocks. Missing docs returns `DOCS_NOT_FOUND`; empty existing docs returns empty page. HTML is not returned or executed.

Text page DTO: `{ projectId, revision, storyId, text, offset, nextOffset?: number, totalCharacters, sha256 }`. Offsets/limits count Unicode code points, not bytes or UTF-16 units. Default 8192 characters, maximum 32768 and 128 KiB UTF-8 per response. Read physical source with max 2 MiB file bound; reject invalid UTF-8/non-text content as SOURCE_UNAVAILABLE. Source line defaults: startLine 1, lineCount 200, maximum 500. LF/CRLF delimit lines; terminal newline does not add phantom empty final line. Selected text preserves original line endings, including selected line's terminating newline. Oversized selected line returns `RESULT_TOO_LARGE`, no silent truncation. SHA-256 covers full UTF-8 content, not selected range. Content change since captured revision returns `STALE_REVISION`; caller refreshes catalog. Empty source has zero lines, empty text, startLine 1/endLine 0.

## Execution tools

| Tool | Strict input | Behavior |
| --- | --- | --- |
| `histoire_capture_screenshot` | `{ storyId, variantId, requestKey, expectedRevision?, width?: number, height?: number, colorScheme?: 'light'|'dark', textDirection?: 'ltr'|'rtl' }` | Admit queued job; return Operation DTO immediately |
| `histoire_run_tests` | `{ storyId, variantId?: string, requestKey, expectedRevision?: string }` | Require story; optional variant means all its variants; return Operation DTO |
| `histoire_get_operation` | `{ operationId: string }` | Return exact job status/result, never most recent unrelated result |
| `histoire_cancel_operation` | `{ operationId: string }` | Remove queued job or request active abort; return current exact job |

Execution starters annotate `readOnlyHint: false`, `idempotentHint: false`, `openWorldHint: true`. RequestKey deduplicates starts only during bounded retention window; metadata must not promise indefinite idempotence. Screenshot starter uses `destructiveHint: false`; test starter uses conservative `destructiveHint: true` because trusted tests can perform external/file side effects. Polling is read-only/idempotent. Cancellation is not read-only and is idempotent; it stops owned execution without undoing project-code side effects.

Operation DTO: `{ operationId, projectId, epoch, revision, kind: 'screenshot'|'tests', state: 'queued'|'running'|'cancelling'|'completed'|'failed'|'cancelled', createdAt, startedAt?, finishedAt?, result?: ScreenshotResult|TestResult, error?: McpError }`. Times are UTC ISO strings. One terminal transition. `cancelling` is not terminal; queue slot remains occupied until cleanup finishes.

Same principal+epoch+requestKey with identical normalized tool/parameters returns same operation within retained retry window, including completed result. Prefer caller-generated UUID requestKey. Different parameters fail `REQUEST_KEY_CONFLICT`. Retry tombstones last until 10 minutes after job terminal state even if its result was evicted; same key then returns expired-result OPERATION_NOT_FOUND rather than rerunning. After tombstone expiry, key may start new execution; callers must not blindly replay old keys. Keep at most 100 tombstones; reject new admission until expiry if necessary to preserve guarantee. Capture revision at admission; revalidate target/revision when dequeued. Changed catalog fails queued job `STALE_REVISION`; active work cannot publish if its generation or selected content changes. Unrelated catalog changes may also invalidate v1 job; prefer conservative correctness.

Default screenshot viewport 1280×800; width 320–3840, height 240–2160. Capture iframe viewport, no fullPage or arbitrary selector. Color scheme defaults configured explicit theme or light for auto; textDirection defaults ltr. No live variant state input. Fresh browser context per job. Readiness deadline 30 seconds, cleanup deadline 10 seconds. ScreenshotResult: `{ storyId, variantId, width, height, mimeType: 'image/png', bytes, sha256, artifactUri }`. Max PNG 4 MiB; inline image returned by polling only when <=1 MiB, otherwise resource link. Artifact resource serves binary PNG.

TestResult: `{ storyId, variantId?: string, engine: 'project-vitest'|'built-preview', summary: HistoireTestRunSummary, truncated: boolean }`. Reuse shared summary shape; sanitize errors, never expose `raw`, cap response 128 KiB. Preserve aggregate counts and `uncollectedStories`; page full retained sanitized test cases via operation resource query rather than silently dropping failures. Retained sanitized test result max 4 MiB. Exceeding this limit fails operation RESULT_TOO_LARGE with bounded aggregate counts in error details; execution already happened and must not be retried automatically. Node mode runs compiled embedded preview tests, without CLI reporter/module-collection claims; build with no embedded test runtime returns CAPABILITY_UNAVAILABLE. No project-wide test run in v1. No arbitrary filters/args, update-snapshot, watch, coverage, shell, or project switching.

Queue maximum 4 pending MCP jobs per principal and 8 total; one active server browser job per project. Server-triggered UI fallback test requests use same lane without per-principal MCP quota, but count against total pending bound; UI gets busy error when full. Existing tab-local embedded tests are outside server queue. Terminal results expire 10 minutes after finish; max 20 terminal records and 32 MiB combined test-result/artifact storage per controller. Retention never evicts queued/running jobs or deletes another controller's files. Request-key tombstones have separate bounded retention above. Jobs/artifacts live in memory; temporary spec files use existing run-owned directories.

## Resources

URIs use exact percent encoding for each path segment; `new URL` alone is not enough for hostile story IDs such as `..`. Encoder must encode dot-only segments and reserved delimiters. Decoder decodes once, checks canonical re-encoding, and performs ID lookup, not path resolution.

- `histoire://<projectId>/project`
- `histoire://<projectId>/stories/<encodedStoryId>`
- `histoire://<projectId>/stories/<encodedStoryId>/docs?offset=0&limit=8192`
- `histoire://<projectId>/stories/<encodedStoryId>/source?startLine=1&lineCount=200`
- `histoire://<projectId>/operations/<operationId>?offset=0&limit=100`
- `histoire://<projectId>/artifacts/<artifactId>`

Project/story/operation metadata resources contain JSON. Docs/source contain text matching equivalent tool page. PNG resource has `mimeType: image/png` and base64 `blob`. Resource metadata carries revision/hash when supported through application `_meta`; do not change source text to inject an envelope. Register finite project resource and parameterized story/content/operation/artifact templates. Operation/artifact resources are returned by tools; not listed as a global inventory. No subscription capability or list-changed notifications in v1.

Resources apply same principal, root, epoch, containment, size, and expected-revision checks as tools. Story/content URIs may accept optional `revision` query; reject unknown query keys. Reject foreign project IDs, duplicate query keys, malformed encoding, unsupported URI schemes, and absolute filesystem URIs.

Operation resource test pages use one detail stream ordered by suite errors, uncollected stories, then test cases. `offset` selects that stream; each page retains aggregate counts and includes `page: { offset, nextOffset?, totalEntries }`. Selected details remain in their original summary arrays. `truncated: true` means more details exist outside current page, including earlier pages. Follow `nextOffset` until absent to recover every retained failure. One detail exceeding response bound fails `RESULT_TOO_LARGE`; no silent text truncation.

## Dev defaults and configuration

`HistoireConfig.mcp?: boolean | { enabled?: boolean, port?: number }`, default true; missing object enabled means true. CLI --no-mcp disables; --mcp overrides config false; --mcp-port selects port and implies enabled unless --no-mcp also present (invalid combination). Simultaneous --mcp/--no-mcp is invalid. Config-only port does not override enabled:false. Dev default binding 127.0.0.1:6007/mcp, with ephemeral fallback only when default port is occupied. Explicit CLI/config port collision fails. No configured token means local native-client access; HISTOIRE_MCP_TOKEN enables required bearer locally. Host/Origin/body guards apply in both cases. Stdio worker explicitly disables dev HTTP, independently of stdio feature itself.

## Node build and runtime contract

`HistoireConfig.build.target?: 'static'|'node'`, default static. CLI histoire build --target <target> wins over config. Node-specific options build.node?:{ includeSource?:boolean }, default includeSource true; private catalog/docs are always packaged for Node target, even when default MCP endpoint disabled, so runtime --mcp can enable it. mcp.enabled value is embedded as default endpoint policy, but port/token/origin are runtime values. Node server ignores dev-only mcp.port and uses one book/server port.

Node output layout: `<outDir>/server.mjs`, `package.json`, `public/`, `private/manifest.json`, `private/content/<sha256>.txt`. Artifact schema version 1 includes buildId, catalog DTOs, content/public asset inventory with hashes/byte lengths, base/router/theme preview settings, MCP enabled default, testRuntimeIncluded, and validated numeric collection/run timeouts. No absolute root, config hooks, environment, credential, or project node_modules. Raw source omission marks sourceAvailable false with reason; existing UI Source panel unaffected. histoire.json remains client artifact; private MCP manifest independent because current serializer omits most docs/source.

Runtime environment: Node >=22; HOST default 0.0.0.0; PORT default 3000 (0 for tests); PUBLIC_ORIGIN required for remote host and must be absolute http(s) origin with no path/query/credentials; HISTOIRE_MCP_TOKEN required when deployed MCP enabled. `node server.mjs --no-mcp` permits book-only service without token; --mcp explicitly enables otherwise disabled endpoint. Public book URL is origin plus built base; MCP URL is origin plus `<base>__histoire/mcp`. Runtime never trusts forwarded headers to infer public URLs or credentials.

Liveness GET `<base>__histoire/health` returns bounded JSON status; readiness GET `<base>__histoire/ready` returns 200 only after artifact validation/listener ready, otherwise 503. Neither exposes catalog, credentials, paths, or job results. Shutdown marks not ready, stops admission, cancels jobs, closes browser/server within existing bounds. Invalid manifest/version/path/hash fails before accepting traffic. Existing `histoire preview` remains static preview, not production Node runtime.
