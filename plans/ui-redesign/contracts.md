# Contracts

Slices implement these shapes; they do not redefine them. Changing a contract means editing this document first.

## Routes and query

Existing: `/` (home), `/story/:storyId?` with `variantId` and `tab`.

| Addition | Values | Owner | Notes |
| --- | --- | --- | --- |
| `tab` | adds nothing new | 06 | Inspector tabs keep `''` (props) / `docs` / `events` / `tests` |
| `arrange` | `grid` \| `list` \| `matrix` | 05, 07 | Omitted = story's `layout.type` default |
| `rows`, `cols` | prop names | 07 | Only with `arrange=matrix`; unknown props ignored |
| `/settings/:section?` | `general`, `appearance`, `viewports`, `tests`, `mcp`, `agents`, `shortcuts`, `about` | 12 | New route name `settings` |

Rail pane selection and panel collapse are local UI state, not URL state. Unknown query values fall back to defaults without errors.

## Local settings

All new keys use the `_histoire-ui-` prefix and JSON values. Each store owns its keys.

| Key | Shape | Owner |
| --- | --- | --- |
| `_histoire-ui-shell` | `{ pane: 'home'\|'stories'\|'search'\|'tests'\|'comments'\|'mcp', panelOpen: boolean, inspectorOpen: boolean }` | 02 |
| `_histoire-ui-canvas` | `{ zoom: number\|'fit', tool: 'select'\|'pan', measure: boolean, frameBackground: string }` | 04, 05 |
| `_histoire-ui-matrix/<storyId>` | `{ rows: string, cols: string, rowValues?: unknown[], colValues?: unknown[], base: Record<string, unknown> }` | 07 |
| `_histoire-ui-settings` | `{ density: 'comfortable'\|'compact', syncZoom: boolean, watchTests: boolean }` | 12 |
| `_histoire-ui-viewports` | `{ label: string, value: ResponsivePreset\|null, localId?: number }[]` | 12 |
| `_histoire-ui-backgrounds` | `{ label: string, value: BackgroundPreset\|null, localId?: number }[]` | 12 |

Preset overrides retain project labels as source identities; independent local additions use persisted `localId`. Older additions migrate on read. Display-label reuse after rename cannot replace another preset. Reset clears only the owning collection.

Density belongs to nearest workbench settings provider. Fixed list offsets and rendered row heights change together, retaining a one-pixel row gap. Dynamic lists continue measuring content. Preview documents and nested providers retain their own spacing.

Existing keys stay authoritative: `_histoire-sandbox-settings-v3` (viewport size, rotate, background, checkerboard, text direction), `histoire-color-scheme`, `_histoire-tree-state`, `_histoire-presets/<saveId>/…`. `__histoire-split-pane-*` keys are no longer read once split panes are gone.

## Config (`packages/histoire-shared/src/types/config.ts`)

Additive only; all optional.

```ts
interface HistoireConfig {
  theme?: {
    // existing fields unchanged
    fonts?: { sans?: string, mono?: string } // CSS font-family overrides; bundled defaults otherwise
    description?: string // shown under the title on the home page
  }
  ui?: {
    defaultArrange?: 'grid' | 'list'
    frameBudget?: number // max live preview iframes on the canvas, default 24
  }
  agents?: {
    enabled?: boolean // default false; ACP client off until enabled
    presets?: AgentPreset[] // see ACP below
    permissions?: { fileEdits?: 'ask' | 'allow-src' | 'never', terminal?: 'ask' | 'allow' | 'never' }
  }
  comments?: {
    enabled?: boolean // default true in dev
    file?: string // default '.histoire/comments.json'
  }
  build?: {
    // existing fields unchanged
    changedSince?: string // git ref for "Updated in this release" on the static home
  }
}
```

## Preview protocol additions

Portable catalog stories optionally expose `runtimeRevision`, a SHA-256 digest of canonical source bytes plus captured executable metadata (variants, layout, matrix hints, support plugin and module identity). Within one source epoch, identical explicit digests let existing frames retain their document across unrelated source publications while rebinding to the new source revision. Changed digests or epochs remount the actor; descriptors without a digest conservatively remount on source revision changes. Digests expose no source text. MCP and Node artifact story metadata retain their existing allowlist and omit this UI field.

Standalone single previews retain their same-story runtime document when selecting another variant, preserving runtime-owned variant state. `PREVIEW_SYNC` advances `selectionVersion`; a newly keyed renderer must report fresh readiness. Every sandbox reply carries that version so queued predecessor state/readiness cannot publish after returning to the same variant. Story/source replacement still remints the document. Host mirrors never initialize source state.

Additive message types in `packages/histoire-shared/src/types/preview-message.ts`; existing messages and payloads unchanged. Older runtimes ignore unknown types; the host treats a missing reply as "feature unavailable".

| Type | Direction | Payload | Owner |
| --- | --- | --- | --- |
| `MEASURE_REQUEST` | host → frame | `{ x, y, requestId? }` in frame CSS pixels | 05 |
| `MEASURE_RESULT` | frame → host | `{ requestId?, result: { selector, rect, parentRect, padding, margin } \| null }` | 05 |
| `ELEMENT_PICK_REQUEST` | host → frame | `{ x, y, requestId? }` | 17 |
| `ELEMENT_PICK_RESULT` | frame → host | `{ requestId?, result: { selector, rect, text? } \| null }` | 17 |
| `PROPS_OVERRIDE` | host → frame | `{ variantId, props: Record<string, unknown>, requestId? }` for matrix cells | 07 |

Messages keep the existing `__histoire` marker, same-origin source guard, and optional `documentId` check. Inspection requests may include `storyId`/`variantId`; provided IDs must match the active tuple. Replies include the actual tuple and document ID. Request IDs are limited to 200 characters; element text to 1000 characters. Rectangles contain numeric `x`, `y`, `width`, `height`, `top`, `right`, `bottom`, and `left`; padding/margin contain numeric `top`, `right`, `bottom`, and `left` in CSS pixels.

`PROPS_OVERRIDE` is a complete override set bounded to 64 KB of JSON. Props map to the first `_hPropDefs` component defining the prop via `_hPropState[component.index]`, matching inspector control edits. Explicit hints without auto definitions use flat state fields. Removed overrides restore the prior field value. A supplied `requestId` receives an existing `RUNTIME_RESULT` reply with `{ supported: true }`; hosts can time out when an older runtime ignores the request. Matrix frame URLs include `matrix=true`: they consume canonical `STATE_SYNC`, reapply cell overrides, and suppress outbound `STATE_SYNC` so cell props cannot replace canonical variant state.

## UI channel (dev only)

Vite HMR custom events, prefix `histoire:ui:`. Server side in `packages/histoire/src/node/server/ui-channel/`; client side in `app/util/ui-channel.ts`. Payloads are JSON, bounded (≤ 64 KB), and never carry secrets.

| Event | Direction | Payload | Owner |
| --- | --- | --- | --- |
| `histoire:ui:mcp-snapshot` | server → client | `{ status, endpoint?, stdio?: {command, args: string[]}, clients: McpClientInfo[], operations: McpOperationInfo[] }` | 15 |
| `histoire:ui:mcp-operation` | server → client | `McpOperationInfo` (upsert) | 15 |
| `histoire:ui:mcp-cancel` | client → server | `{ operationId }` | 15 |
| `histoire:ui:screenshot` | client → server | `{ requestId, targets: {storyId, variantId}[], viewport, scale, format, background }` | 14 |
| `histoire:ui:screenshot-result` | server → client | `{ requestId, files: {path, storyId, variantId}[], errors?: {storyId, variantId, error}[] } \| { requestId, error }` | 14 |
| `histoire:ui:screenshot-cancel` | client → server | `{ requestId }` (originating browser only) | 14 |
| `histoire:ui:screenshot-list` | client → server | `{ requestId }` | 14 |
| `histoire:ui:screenshot-list-result` | server → client | `{ requestId, files: {path, storyId, variantId}[] }` | 14 |
| `histoire:ui:ready` | client → server | `{}` (initial/reconnected feature snapshots) | 14 |
| `histoire:ui:agents-snapshot` | server → client | `{ agents: AgentStatus[] }` | 16 |
| `histoire:ui:agent-permission` | server → client | `{ requestId, agentId, kind, detail }` | 16 |
| `histoire:ui:agent-permission-reply` | client → server | `{ requestId, allow: boolean, remember?: boolean }` | 16 |
| `histoire:ui:comments-snapshot` | server → client | `{ comments: Comment[] }` | 17 |
| `histoire:ui:comment-upsert` / `comment-delete` | client → server | `Comment` / `{ id }` | 17 |
| `histoire:ui:comment-send` | client → server | `{ ids: string[], agentId?: string }` | 17 |
| `histoire:ui:config-read` | client → server | `{ paths: string[] }` (allowlisted) | 19 |
| `histoire:ui:config-save` | client → server | `{ patches: { path, value }[], expectedHash }` (allowlisted) | 19 |
| `histoire:ui:config-state` | server → client | `{ file?: string, hash?: string, paths: Record<string, { status: 'absent'\|'editable'\|'computed'\|'function-only', location?, reason? }>, saved?: string[], error? }` | 19 |

`McpClientInfo = { id, name, transport: 'stdio'|'http', connectedAt, lastSeenAt }`. `McpOperationInfo = { id, clientId, tool, target?: { storyId, variantId? }, state: 'queued'|'running'|'done'|'failed'|'cancelled', progress?: { done, total }, startedAt, endedAt? }`. Sourced from the MCP runtime's existing operation queue; no new MCP state.

`error = { code: 'invalid'|'unavailable'|'cancelled'|'timeout'|'failed', message }`. Capture file paths are project-relative and stay beneath `.histoire/screenshots/`. Partial failures preserve successes. Generated JSON sidecars store exact target identity for directory-backed recent inventory; no source contents or credentials. MCP status is `enabled`, `disabled`, or `unavailable`; missing HTTP endpoint is allowed for stdio-only runtime.

Dev-only `stdio` launch metadata uses the current Node executable, installed Histoire CLI wrapper, and explicit current project root/config flags. It contains no environment values or credentials and never enters static build metadata.

## ACP

`AgentPreset = { id, name, command, args?: string[], env?: Record<string, string>, cwd?: string, default?: boolean }`. Env values are stored only in user-level settings, never in the project config file or static build. `AgentStatus = { id, name, state: 'disabled'|'starting'|'connected'|'idle'|'error'|'not-installed', error?: string }`.

## Comments

```ts
interface Comment {
  id: string
  storyId: string
  variantId: string
  anchor: { selector?: string, x: number, y: number } // frame CSS pixels
  props?: Record<string, unknown> // props at creation time
  screenshot?: string // relative path under .histoire/screenshots
  body: string
  status: 'draft' | 'sent' | 'working' | 'replied' | 'resolved'
  agentId?: string
  thread: { author: 'user' | 'agent', agentId?: string, body: string, at: string, changes?: { file: string, added: number, removed: number }[] }[]
  createdAt: string
  updatedAt: string
}
```

File format: `{ version: 1, comments: Comment[] }`. Writes are atomic (temp file + rename) and serialized per project.

## Build metadata (static)

`histoire.json` and a new virtual module `$histoire-build-info` expose `{ version?: string, commit?: string, branch?: string, builtAt: string, changed?: { storyId, kind: 'new'|'changed' }[] }`. `version` comes from the project `package.json`; git fields only when git is available; `changed` only when `build.changedSince` (new optional config: git ref) is set. Dev uses the same module with `builtAt` = server start and `changed` from the working tree (`git status` + last commit).
