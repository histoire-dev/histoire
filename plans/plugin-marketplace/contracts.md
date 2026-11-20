# Locked contracts

Slice 01 turns these into TypeScript in `histoire-shared/src/types/{marketplace,ui-marketplace}.ts`. Later slices consume them unchanged. A slice that needs a contract change records it as a deviation (see [README](README.md#file-ownership)).

## Package manifest: `package.json#histoire.marketplace`

Plain JSON. It is validated by `NODE/marketplace/manifest/`; anything invalid is dropped with a diagnostic and never thrown to the UI. String limits: name ≤ 40 characters, summary ≤ 160, text fields ≤ 500.

```jsonc
{
  "histoire": {
    "marketplace": {
      "displayName": "Accessibility",
      "summary": "axe-core audits per variant, a project pane and optional story tests.",
      "category": "testing", // testing | design | inspection | frameworks | data
      "frameworks": ["vue", "react", "svelte"], // empty or absent = any
      "requires": { "histoire": ">=1.0.0" },
      "monogram": "Ax",
      "tint": "blue", // tile fallback when no logoUrl; tints: green violet blue amber rose sky slate
      "logoUrl": "https://…", // optional HTTPS
      "adds": [{ "kind": "rail-pane", "text": "Project-wide audit results" }],
      // kinds: rail-pane inspector-tab toolbar-tool story-tests cli-command settings-section canvas-view
      "access": ["story-frames", "story-dom"], // story-frames story-dom network filesystem child-process
      "config": {
        "import": "HstA11y", // named export of the package root
        "options": [ // form fields, in order
          { "key": "test", "label": "Run as story tests", "description": "One check per variant in the Tests pane", "type": "boolean", "default": false },
          { "key": "rules", "label": "Rule set", "type": "enum", "choices": [{ "value": "wcag22aa", "label": "WCAG 2.2 AA" }], "default": "wcag22aa" },
          { "key": "failOn", "label": "Fail tests on", "type": "enum", "display": "segmented", "choices": [{ "value": "serious", "label": "Serious" }], "default": "serious", "when": { "test": true } },
          { "key": "skip", "label": "Skip selectors", "type": "string-list", "default": [] }
        ]
      },
      "recommend": [{ "dependency": "vitest", "reason": "Vitest detected" }, { "missing": true, "reason": "No a11y checks in this project yet" }],
      "collections": ["visual-testing"],
      "releaseNotes": [{ "kind": "breaking", "text": "…", "code": ["figma.token", "figma.accessToken"] }], // for this version
      "migrations": [{ "from": "<0.4.0", "ops": [{ "op": "rename-option", "from": "figma.token", "to": "figma.accessToken" }] }]
    }
  }
}
```

**Option types**
- `boolean`
- `enum` (`display: "select" | "segmented"`)
- `string`
- `string-list`

Option `key` is a dot path. The generated call includes only values that differ from `default`.

**Migration ops**
- `rename-option`
- `remove-option`
- `set-option`

They apply to the plugin call's first object argument only. An op that can't be applied, because the argument isn't an object literal or the value isn't literal, makes the migration manual.

## Catalog DTOs

```ts
type PluginId = string // npm package name

interface CatalogEntry {
  id: PluginId
  displayName: string
  summary: string
  publisher: string
  official: boolean
  category: Category
  frameworks: string[]
  adds: Add[]
  monogram: string
  tint: Tint
  logoUrl?: string
  latest: string
  updatedAt?: string
  license?: string
  repoUrl?: string
  docsUrl?: string
  installed?: { version: string, enabled: boolean, required: boolean, update?: string }
  compatible: { ok: boolean, reason?: string } // vs project histoire/framework/peers
  score?: number // relevance for current query
  match?: Array<{ field: 'displayName' | 'summary' | 'id', ranges: Array<[number, number]> }>
}

interface CatalogQuery {
  view: 'all' | 'discover'
  query?: string
  filters?: { category?: Category, frameworks?: string[], officialOnly?: boolean, adds?: AddKind[] }
  sort?: 'relevance' | 'name' | 'updated'
  prefs: MarketplacePrefs
  cursor?: string
  limit?: number // ≤ 60
}

interface CatalogPage {
  entries: CatalogEntry[]
  total: number
  cursor?: string
  facets: { category: Record<Category, number>, frameworks: Record<string, number>, official: number, adds: Record<AddKind, number> }
  project: { frameworks: string[], signals: string[] } // e.g. detected stack chips
  sources: { official: 'ok', community: 'off' | 'ok' | 'stale' | 'error' }
  discover?: { hero?: CatalogEntry & { reason: string }, picks: Array<CatalogEntry & { reason: string }>, collections: Array<{ id: string, title: string, entries: CatalogEntry[] }> }
}

interface PluginDetail extends CatalogEntry {
  manifest: MarketplaceManifest
  versions: Array<{ version: string, date?: string, deprecated?: boolean, compatible: boolean }>
  provenance: boolean
  requires: Record<string, string>
  access: Access[]
  releaseNotes?: ReleaseNote[]
}

interface MarketplacePrefs {
  community: boolean
  packageManager: 'auto' | 'pnpm' | 'npm' | 'yarn' | 'bun'
  afterInstall: 'restart' | 'ask'
  skippedVersions: Record<PluginId, string>
}
```

## Change plans

```ts
interface ChangeRequest {
  kind: 'install' | 'remove' | 'update' | 'pin' | 'options'
  id: PluginId
  version?: string
  options?: Record<string, HistoireJsonValue>
  migrate?: boolean
  prefs: MarketplacePrefs
}

interface ChangePlan {
  planId: string
  hash: string // sha256 of argv + diffs + config hash
  packageManager: { name: 'pnpm' | 'npm' | 'yarn' | 'bun', source: 'lockfile' | 'packageManager' | 'override' }
  command?: { argv: string[], display: string } // no shell; display is for copy
  files: Array<{ path: string, added: number, removed: number, lines: DiffLine[] }>
  warnings: string[]
  manual?: { reason: 'static' | 'config-not-literal' | 'no-package-manager' | 'migration-manual' | 'workspace-unsupported', steps: ManualStep[] }
}
```

- `DiffLine` is `{ kind: 'context' | 'add' | 'del', text: string }`, with at most 3 lines of context around each hunk.
- Plans expire with the generation. `job-start` rejects a plan whose `hash` no longer matches a freshly computed plan.

## Jobs

```ts
type JobStepId = 'resolve' | 'install' | 'config' | 'restart' | 'load'
interface JobState {
  jobId: string
  kind: ChangeRequest['kind']
  id: PluginId
  version: string
  steps: Array<{ id: JobStepId, state: 'pending' | 'running' | 'done' | 'failed' | 'skipped', ms?: number }>
  status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  output: string[] // sanitized, ≤ 400 lines kept, ≤ 64 KiB per event
  failure?: { code: 'peer-conflict' | 'not-found' | 'network' | 'config-write' | 'load' | 'unknown', message: string, restored: boolean, leftovers: string[], suggestion?: { version: string, reason: string } }
  contributions?: Array<{ kind: AddKind, id: string, label: string }> // filled by `load`
}
```

## UI channel events

All events are request/response correlated by `requestId`, following `screenshot-setup.ts`.

| Client → server | Server → client |
|---|---|
| `histoire:ui:marketplace-catalog` `{ requestId, query: CatalogQuery }` | `…-catalog-result` `{ requestId, page } \| { requestId, error }` |
| `histoire:ui:marketplace-detail` `{ requestId, id, prefs }` | `…-detail-result` |
| `histoire:ui:marketplace-update-detail` `{ requestId, id, prefs }` | `…-update-detail-result` `{ requestId, detail: PluginDetail } \| { requestId, error }`; compatible target, intervening notes newest first, selected migrations |
| `histoire:ui:marketplace-plan` `{ requestId, request: ChangeRequest }` | `…-plan-result` `{ requestId, plan } \| { requestId, error }` |
| `histoire:ui:marketplace-job-start` `{ requestId, planId, hash }` | `…-job-state` `{ job: JobState }` (broadcast; throttled 100 ms) |
| `histoire:ui:marketplace-job-cancel` `{ jobId }` | `…-job-state` |
| `histoire:ui:marketplace-job-continue` `{ jobId }` | `…-job-state` |
| `histoire:ui:marketplace-job-current` `{ requestId }` | `…-job-state` or `{ requestId, job: null }` |
| `histoire:ui:marketplace-updates` `{ requestId, prefs }` | `…-updates-result` `{ requestId, updates: Array<{ id, from, to, breaking: boolean }> }` |

**Errors**
- Shape: `{ code: 'unavailable' | 'invalid' | 'busy' | 'stale' | 'failed', message }`. `busy` means another job is running; `stale` means the plan hash changed.

**Static builds**
- `APP/util/marketplace-client.ts` answers `catalog` and `detail` from `virtual:$histoire-marketplace-official`.
- `plan` always returns a manual plan with reason `static`.
- Job events are unavailable.

## UX copy rules (from mockups)

- **Modal and header**
  - Modal title: "Plugin marketplace". Header tabs: "Discover", "All plugins". Search placeholder: "Search plugins".
  - Close shows the hint "Esc". "/" focuses search.
- **Install wizard steps**
  - "Options", "Review", "Install".
  - The 6A step labels follow `JobStepId`: "Resolved <pkg>@<v>", "Installed package", "Updated histoire.config.ts", "Restarting dev server", "Loading plugin".
- **Failures**
  - Title: "Install failed". When `restored` is true, append "No project files were changed."
- **Manual flow**
  - "This workbench can't edit project files". Reason detail: "Static build. Run these steps in your project." (or a reason-specific line).
- **Settings**
  - "Browse marketplace". Footnote: "Plugin changes write to package.json and histoire.config.ts".
- **Empty, loading and error states**
  - Use the shared Workbench state components with short titles: "No matches", "Loading plugins", "Couldn't load plugins".
- **Wording**
  - No "preview" anywhere.

## Wave 3 contract amendments (orchestrator)

- **Errors:** `MarketplaceError.code` adds `not-found`.
- **Query and detail fields:**
  - `CatalogQuery.filters.collection?` filters by the manifest's `collections` before pagination and facets.
  - `PluginDetail.versions[].reason?` gives a short reason when a version is incompatible.
- **Restart model** (superseded by [slice 23](23-host-process-restart.md)):
  - The job asks the dev proxy for a new runtime process over IPC (`{ type: 'restart', generation, source, fresh }`, cause `runtime`) after the config write or package-only change. A new process is the only way to drop plugin modules the old one loaded.
  - The config watcher may also fire on the write; the proxy coalesces both into one transition.
  - `package.json` and lockfiles are not normally watched. A config that imports `package.json` is planned as manual.
  - With `afterInstall: 'ask'`, the job pauses before the first restart trigger with `awaiting: 'continue'`. `job-continue` resumes it.
  - Without a dev proxy (in-process SDK runtime) or when the request can't be delivered, package-only changes end with `awaiting: 'restart'` and the user restarts the dev server. The browser sends no restart request.
- **Contributions:** the `load` step proves the plugin loaded server-side. The spotlight (11) reads actual contributions from the browser extension host by plugin id. `JobState.contributions` may stay empty.
