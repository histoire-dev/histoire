# Plugin API

A Histoire plugin is an object in the `plugins` array of your config. Node hooks run in the Histoire process; the optional `workbench` descriptor adds browser modules. Guides: [plugin development](../guide/plugins/development.md) and [workbench plugins](../guide/plugins/workbench.md).

```ts
import type { Plugin } from 'histoire'
```

## Marketplace manifest

`package.json#histoire.marketplace` supplies public JSON metadata for browsing, options and migrations. It is independent of the runtime `Plugin.metadata` object. Include `histoire-plugin` in npm `keywords` for community discovery. See [publishing example](../guide/plugins/development.md#publish-to-the-marketplace) and [user guide](../guide/plugins/marketplace.md).

### Fields

Required fields:

- `displayName: string`: nonempty, at most 40 characters.
- `summary: string`: nonempty, at most 160 characters.
- `category`: `testing | design | inspection | frameworks | data`.
- `monogram: string`: nonempty fallback tile text.
- `tint`: `green | violet | blue | amber | rose | sky | slate`.
- `config.import: string`: JavaScript identifier naming a factory exported from the package root.

Optional fields:

- `frameworks: string[]`: supported framework identifiers; omitted/empty means any.
- `requires: Record<string, string>`: package version requirements, intersected with registry peer dependencies for compatibility. Optional peers are checked only when installed.
- `logoUrl: string`: HTTPS logo URL.
- `adds: Array<{ kind, text: string, contribution?: string }>`: advertised contributions. `kind` is `rail-pane | inspector-tab | toolbar-tool | story-tests | cli-command | settings-section | canvas-view`. `contribution` names the live registration's local id, with no namespace, colon or whitespace. Invalid relations are dropped with a diagnostic while keeping the description. The tour matches exact local ids within the declared kind; legacy first-of-kind fallback requires a single registration of that kind owned by the plugin.
- `access: string[]`: `story-frames | story-dom | network | filesystem | child-process`. Descriptive metadata, not enforced permissions.
- `config.options: MarketplaceOption[]`: fields in display order; described below.
- `recommend: Array<{ dependency: string, reason: string } | { missing: true, reason: string }>`: dependency-presence or missing-category signals for Discover. `missing` matches when no installed plugin has this entry's category; installed entries are excluded from recommendations.
- `collections: string[]`: collection identifiers. Discover exposes `visual-testing` (Visual testing), `design-handoff` (Design handoff), `inspection` (Inspection) and `data-mocks` (Data & mocks). Other ids can be filtered but do not create a Discover row.
- `releaseNotes: Array<{ kind: 'breaking' | 'feature' | 'fix', text: string, code?: string[] }>`: notes for this package version, displayed without executing code.
- `migrations: Array<{ from: string, ops: MigrationOp[] }>`: installed-version range and nonempty list of ordered option edits.

All descriptive strings are bounded to 500 characters unless a smaller limit is stated. Optional JSON default/value strings may be empty. Unknown fields are dropped with diagnostics. Invalid required fields reject the whole manifest; invalid optional array members are independently dropped. A malformed migration is dropped atomically. No registry field can grant Official status.

### Bundled official releases

Histoire's bundled official release history supplies version-specific requirements, frameworks, release notes, and migrations for offline use. To see which releases the Marketplace offers for your project, see [official release history](../guide/plugins/marketplace.md#official-release-history).

### Option fields

Each option has `key`, `label`, optional `description` and optional `when: Record<string, HistoireJsonValue>`. Every condition must reference another declared option with a valid literal value; all conditions must match for the field to show.

`key` is a dot path made of JavaScript identifiers. `__proto__`, `prototype` and `constructor` segments are forbidden. Duplicate and overlapping paths are dropped. Generated config nests dot paths and emits only values different from declared defaults.

Supported variants:

```ts
type MarketplaceOption = {
  key: string
  label: string
  description?: string
  when?: Record<string, HistoireJsonValue>
} & (
  | { type: 'boolean', default?: boolean }
  | { type: 'string', default?: string }
  | { type: 'string-list', default?: string[] }
  | {
    type: 'enum'
    display?: 'select' | 'segmented'
    choices: Array<{ value: string, label: string }>
    default?: string
  }
)
```

Enum choices must be nonempty and have distinct string values. A supplied enum default must match a choice. Defaults must have the control's declared type.

### Declarative migrations

```ts
type MigrationOp =
  | { op: 'rename-option', from: string, to: string }
  | { op: 'remove-option', path: string }
  | { op: 'set-option', path: string, value: HistoireJsonValue }
```

Paths follow the same safe dot-path rules as options. `value` must be finite JSON with safe object keys. Migrations affect only the first object argument of one enabled, imported factory call. Unrelated properties and source remain intact. Missing rename sources are ignored; a destination with a different value, overlapping rename paths, computed affected values or unsupported calls makes the migration manual. `set-option` can add an absent property. No migration executes plugin code.

For updates, Histoire selects releases in `(installed, target]`, sorts ascending, and selects each migration whose `from` matches the original installed version. Operations keep release/declaration order. Equal-version changes and downgrades select no operations. The update dialog can disable migrations; pins do not run them.

With community disabled, official metadata contains only the bundled current release, so intervening historical notes/operations are unavailable. The current version evaluator handles comparator, union, caret, tilde, wildcard, hyphen and prerelease ranges; full `node-semver` syntax parity is not claimed.

## Node hooks

| Field | Signature | Description |
| --- | --- | --- |
| `name` | `string` | Plugin name, used in error messages. |
| `defaultConfig` | `(defaultConfig, mode, context?) => Partial<HistoireConfig> \| void` | Changes Histoire's default config; user config wins. Mutate or return a partial config (deep merged). |
| `config` | `(config, mode, context?) => Partial<HistoireConfig> \| void` | Changes the user config. Plugins added here are not resolved. |
| `configResolved` | `(config, context?) => void` | Reads the final config. |
| `onDev` | `(api: PluginApiDev, onCleanup) => void` | Runs with the dev server; register cleanup with `onCleanup`. `api.watcher` is chokidar. |
| `onBuild` | `(api: PluginApiBuild) => void` | Runs during `histoire build`: `changeViteConfig`, `onBuildEnd`, `onPreviewStory`, `outputDir` (static book directory). |
| `onPreview` | `() => void` | Runs when the static server starts. |
| `onDevEvent` | `(api: PluginApiDevEvent) => any` | Handles `event`/`payload` sent from the browser in dev (`context.devEvents.send` in workbench plugins); the return value is sent back. |
| `vitePlugins` | `(plugins) => void` | Mutates the Vite plugin list. |
| `supportPlugin` | `SupportPlugin` | Declares a story framework (Vue, Svelte, React, ...). |
| `commands` | `PluginCommand[]` | Commands in the dev search (`>`); `clientSetupFile` adds browser behavior. |
| `workbench` | `WorkbenchPluginDescriptor` | Workbench and frame modules, see below. |

`mode` is `'dev'` or `'build'`. `context` gives the project `root`, a `tempDir` and `onCleanup`.

Hook API objects share `root`, `getConfig()`, `getStories()`, `addStoryFile(file)`, `removeStoryFile(file)`, `moduleLoader`, `pluginTempDir`, `log`/`warn`/`error`, `colors`, `path` and `fs`.

`histoire dev` restarts when the Histoire or Vite config changes, or a local module they import (outside `node_modules`). Modules Node loads natively (`.mjs`, `.cjs`, `.js` in a `type: module` package) and installed packages are not tracked: restart by hand after editing them. Workbench `client` and `frame` entries use Vite HMR instead.

## `workbench` descriptor

```ts
interface WorkbenchPluginDescriptor {
  id: string // [a-z][a-z0-9-]*, at most 64 characters, not "builtin"
  apiVersion: 1
  client?: string // module default-exporting defineWorkbenchPlugin(...)
  frame?: string // module default-exporting defineFramePlugin(...)
  options?: HistoireJsonValue // the only data reaching the browser
  devOnly?: boolean // leave both entries out of static builds
}
```

Entries are bare specifiers or absolute paths resolved from the project root. Validation and resolution happen at startup.

## `@histoire/plugin-kit` entries

| Entry | Exports |
| --- | --- |
| `@histoire/plugin-kit` | `defineWorkbenchPlugin`, `PLUGIN_API_VERSION`, `PluginDefinitionError`, all types; host helpers for embedders (`createExtensionHost`, `createSessionContext`, `createSessionFrameService`, `lazyWorkbenchPlugins`, `createPluginShortcutBindings`, `findPluginShortcutConflict`, `WORKBENCH_COMPONENTS_KEY`, `renderPlainWorkbenchState`, ...). No framework, DOM or Node import. |
| `@histoire/plugin-kit/frame` | `defineFramePlugin` and frame types. |
| `@histoire/plugin-kit/vue` | `defineWorkbenchComponent`, `useWorkbenchContext`, `useViewHost`; state and pane components `WorkbenchEmptyState`, `WorkbenchLoadingState`, `WorkbenchErrorState`, `WorkbenchPaneHeader`, `WorkbenchPaneToolbar`, `WorkbenchPaneList`. |
| `@histoire/plugin-kit/vue/mount` | `vueView` (isolated Vue app as a DOM view). |
| `@histoire/plugin-kit/react` | `reactView`. |
| `@histoire/plugin-kit/svelte4` | `svelte4View`. |
| `@histoire/plugin-kit/svelte5` | `svelte5View`. |

`vue`, `react`, `react-dom` and `svelte` are optional peer dependencies.

## `defineWorkbenchPlugin`

```ts
declare function defineWorkbenchPlugin(definition: {
  id: string // equals the descriptor id
  apiVersion: 1
  setup: (api: WorkbenchPluginApi) => void | Disposer | Promise<void | Disposer>
}): WorkbenchPluginDefinition
```

### `WorkbenchPluginApi`

| Member | Description |
| --- | --- |
| `id` | Plugin id. |
| `options` | Descriptor `options`. |
| `context` | Root `WorkbenchContext`; its subscriptions are released with the plugin. |
| `preferences` | `get(key, fallback)`, `set(key, value)`, `subscribe(key, listener)`; JSON values. |
| `signal` | Aborted when the plugin is disposed. |
| `contribute(contribution)` | Generic registration (`{ kind, ... }`); the helpers below are typed sugar. |
| `inspector.addTab`, `inspector.addSection` | Inspector contributions. |
| `toolbar.addItem` | Toolbar item. |
| `commands.add`, `shortcuts.add` | Command search entry, key binding. |
| `menus.addFrameAction`, `menus.addContextAction` | Frame menu entry, workbench context menu entry. |
| `canvas.addOverlay`, `canvas.addFrameOverlay`, `canvas.addFrameBadge`, `canvas.addTool`, `canvas.addView` | Canvas contributions. |
| `shell.addPane`, `settings.addSection`, `home.addSection` | Shell contributions. |
| `frames.list()`, `frames.open(frame)`, `frames.subscribe(listener)` | Frames running this plugin's frame module; channel to one actor; attach/detach notification. |
| `reportError(error)` | Records a diagnostic attributed to the plugin. |
| `invalidate()` | Plugin-internal state read by `badge`, `pressed` or `available` changed: surfaces re-read those callbacks now. No-op after disposal. |

Every helper returns a `Disposer`.

### Contribution fields

All contributions: `id`, `order?`, `available?(context)`, `devOnly?`. View-bearing ones take a view: `{ component }` or `{ mount }`.

| Kind | Fields |
| --- | --- |
| `inspector.tab` | `label`, `icon`, view, `badge?(context)`, `primaryCommand?` (local or same-plugin qualified command id) |
| `inspector.section` | `tab` (`builtin:props`, `builtin:docs`, `builtin:events`, `builtin:tests`, `footer` or a qualified plugin tab), `position` (`before`, `after`), view |
| `toolbar.item` | `group`, `label`, `icon`, `type`: `action` (`run`), `toggle` (`pressed`, `run`), `popover` (view), `custom` (view); `command?` (qualified command id whose bound shortcut is shown as the hint; not on `custom`) |
| `command` | `label`, `icon`, `searchText?`, `run` |
| `shortcut` | `command` (qualified id), `keys` (`mod+k`, `alt+shift+b`, ...), `scope` (`global`, `canvas`, `frame`, `comment`); a binding overlapping a built-in or an earlier binding of the same scope, or naming a scope the host lacks, is skipped with a `report` diagnostic |
| `frame-menu.item` | `label`, `icon`, `group?`, `run`, `children?` (`id`, `label`, `icon`, `group?`, `run`) |
| `context-menu.item` | `targets`, `label`, `icon?`, `run` |
| `canvas.overlay` | `space` (`viewport`, `canvas`), `interactive?`, view |
| `canvas.frame-overlay` | `interactive?`, view |
| `canvas.tool` | `label`, `icon`, `cursor?`, `shortcut?`, `onPointerDown?`, `onPointerMove?`, `onPointerUp?`, `onCancel?` |
| `canvas.view` | `label`, `icon`, view (`CanvasViewContext`), `layout?(zoom)`, `toolbar?` |
| `shell.pane` | `label`, `icon`, view, `badge?(context)`, `primaryCommand?` (local or same-plugin qualified command id), `header?` (`false` when the view renders its own `WorkbenchPaneHeader`) |
| `settings.section` | `label`, `icon`, view |
| `home.section` | `column` (`primary`, `secondary`), `title`, view |

`icon` is a bundled Carbon glyph name (`plug`, `chat`, `compare`, `list-checked`, ...); unknown names render `plug`. Actions are `run(context, { signal })`.

For `shell.pane` and `inspector.tab`, the host normalizes `primaryCommand` to a qualified id and rejects malformed or cross-plugin ids during registration. The command may register later. The marketplace tour offers an action only when that same plugin's command is registered and available in the current workbench context; execution uses the host command runner. Toolbar items keep their existing `command` relation. Neither labels nor marketplace metadata grant command availability.

### Views

```ts
type ViewMount<C> = (container: HTMLElement, context: C, host: ViewHost) =>
  void | ViewHandle<C> | Promise<void | ViewHandle<C>>

interface ViewHost {
  signal: AbortSignal // aborted when the view retires
  overlayRoot: HTMLElement // popovers and menus, inside the theme scope
  reportError: (error: unknown) => void
  // host state component into a view-owned element; null clears it
  renderState: (container: HTMLElement, state: WorkbenchState | null) => void
}

type WorkbenchState =
  | { kind: 'empty', icon: string, title: string, detail?: string }
  | { kind: 'loading', title: string, detail?: string }
  | { kind: 'error', title: string, icon?: string, detail?: string }

interface ViewHandle<C> {
  update?: (context: C) => void // new snapshot, no remount
  dispose?: () => void | Promise<void>
}
```

Workbench Vue components receive the context as their `context` prop. Adapter components (`reactView`, `svelte4View`, `svelte5View`, `vueView`) receive `{ context, host }`.

The `/vue` state and pane components render the implementation the host provides under `WORKBENCH_COMPONENTS_KEY` (a partial `WorkbenchComponents` map keyed by component name), else plain accessible markup. Hosts mounting DOM views pass their renderer as `host.mount(id, element, context, { renderState })`; the default is `renderPlainWorkbenchState`.

### Contexts

```ts
interface WorkbenchContext {
  capabilities: ReadonlySet<'catalog' | 'navigation' | 'devEvents' | 'tests' | 'canvas' | 'frames' | 'preferences'>
  source: { mode: 'dev' | 'static' | 'remote' }
  catalog: {
    list: () => Promise<readonly HistoireCatalogStory[]>
    getStory: (storyId: string) => Promise<HistoireCatalogStory>
    search: (query: string) => Promise<readonly HistoireSearchResult[]>
  }
  selection: { target: HistoireTarget | null }
  navigation: {
    selectStory: (input: HistoireSelectionInput) => Promise<void>
    openInspectorTab: (tabId: string) => void
    openPane: (paneId: string) => void
    openSettings: (sectionId?: string) => void
    openCanvasView: (viewId: string) => void
  }
  devEvents?: { send: (event: string, payload?: HistoireJsonValue) => Promise<unknown> }
  tests?: {
    entries: () => ReadonlyArray<{ target: HistoireTarget, summary: HistoireTestRunSummary | null, running: boolean, stale: boolean, error: string | null }>
    readonly running: boolean
    readonly canRun: boolean
    readonly progress: { phase: 'queued' | 'collect' | 'run', completed: number, total: number } | null
    readonly error: string | null
    runAll: () => Promise<void>
    run: (target: HistoireTarget) => Promise<void>
    subscribe: (listener: () => void) => Disposer
  }
  subscribe: (listener: () => void) => Disposer
}

interface FrameScopedContext extends WorkbenchContext {
  frame: { key: string, target: HistoireTarget }
  runtime: {
    getSnapshot: () => HistoireSnapshot
    subscribe: (listener: (snapshot: HistoireSnapshot) => void) => Disposer
  }
}

// Frame header badges: any laid-out frame, live or not
interface FrameHeaderContext extends WorkbenchContext {
  frame: { key: string, target: HistoireTarget }
}

interface CanvasScopedContext extends WorkbenchContext {
  canvas: {
    zoom: number
    pan: { x: number, y: number }
    viewport: HistoireRect
    toCanvas: (point: CanvasPoint) => CanvasPoint
    toViewport: (point: CanvasPoint) => CanvasPoint
    frameToViewport: (frameKey: string, point: CanvasPoint) => CanvasPoint | null
    frames: () => Array<{ frame: FrameRef, rect: HistoireRect }>
    acquireFrame: (target: HistoireTarget, options: { container: HTMLElement, rect?: HistoireRect, queue?: boolean, signal?: AbortSignal }) => Promise<FrameLease>
    subscribe: (listener: () => void) => Disposer
  }
}

// Context of custom canvas views
interface CanvasViewContext extends CanvasScopedContext {
  canvas: CanvasScopedContext['canvas'] & {
    // `layout` changed: re-read once after the current update (coalesced), apply the zoom policy
    requestLayout: () => void
  }
}

interface FrameLease {
  frame: FrameRef
  ready: Promise<void>
  release: () => void
}
```

`acquireFrame` rejects with a `FrameLeaseError` whose `reason` is `budget`, `released` or `unavailable`.

Custom view content (the host-marked `data-histoire-canvas-view` root) owns primary presses with the Select tool; the Pan tool, Space and the middle button pan. A press whose target element itself has `data-histoire-canvas-pan` acts like a press on empty canvas.

### Preferences storage

```ts
interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  // optional: changes made outside this host (another tab); null = storage cleared
  subscribe?: (listener: (key: string | null) => void) => Disposer
}
```

Pass it as `services.storage` of `createExtensionHost`. With `subscribe`, outside changes to the host's plugin keys reach `api.preferences.subscribe` listeners and refresh badges and toggles; removed or unparseable values only refresh surfaces. The standalone workbench wraps `localStorage` with `storage` events.

### Hosts

| Surface | Standalone workbench | `@histoire/vue` native host |
| --- | --- | --- |
| Toolbar groups | Every `ToolbarGroup` | `viewport`, `background`, `ui` after their built-ins; others and `plugins` trail |
| Shortcut scopes | `global`, `canvas`, `frame`, `comment` | `global`, `canvas`, `frame`; `comment` bindings are rejected with a diagnostic |
| Toolbar hints | Action, toggle and popover items with `command` | None |

Hosts without a shortcut registry use `createPluginShortcutBindings(host, scopes)`: it validates each committed binding once, reports rejections once per host and `match(event, scopes)` returns the bound shortcut to run.

## `defineFramePlugin`

```ts
declare function defineFramePlugin(definition: {
  id: string // equals the descriptor id
  apiVersion: 1
  attach: (frame: FramePluginContext) => void | Disposer | Promise<void | Disposer>
}): FramePluginDefinition

interface FramePluginContext {
  actorId: string // one rendered mount
  documentId: string
  target: HistoireTarget
  element: HTMLElement // rendered variant root
  signal: AbortSignal // aborted at detach
  state: { value: Readonly<Record<string, unknown>>, subscribe: (listener: () => void) => Disposer }
  options: HistoireJsonValue | undefined
  channel: PluginChannel
  onCleanup: (callback: () => void) => void
}
```

## `PluginChannel`

```ts
interface PluginChannel {
  post: (type: string, data: HistoireJsonValue) => Promise<void>
  on: (type: string, listener: (data, message: PluginChannelMessage) => void) => Disposer
  getDroppedCount: () => number
}

interface PluginChannelMessage {
  pluginId: string
  actorId: string
  target: HistoireTarget
  type: string
  data: HistoireJsonValue
}
```

64 KiB per message, 50 messages per second per direction; types starting with `histoire:` are reserved. `api.frames.list()` returns `{ key, target, actorId }` refs; `api.frames.open(ref)` binds to that actor, or to the current actor of a plain frame ref.

## Diagnostics

`PluginDiagnostic` is `{ pluginId, contributionId?, phase, error }` with `phase` one of `load`, `setup`, `register`, `mount`, `update`, `run`, `dispose`, `callback`, `report`. See [Diagnostics](../guide/plugins/workbench.md#diagnostics) for what each one means to users.

### Development proxy and config restarts

`histoire dev` binds a lightweight public HTTP proxy before loading project configuration. Public address comes from `--port` and `--host`, defaulting to `localhost:6006`; `--port 0` selects an available port. Config-only Vite port, host, and HTTPS options do not change this public address. Vite runs privately on an ephemeral loopback HTTP port. HMR, story requests, and configured Vite proxy routes travel through public proxy.

While configuration, story collection, or runtime setup runs, document requests receive a loading screen. Asset/API requests receive HTTP 503 until ready. The screen follows OS light/dark and reduced-motion settings; unsupported or software WebGL rendering uses a static Histoire mark.

Proxy owns config watches and restarts. Each relevant edit withdraws old runtime, cancels its operations, runs plugin cleanup, closes Vite/MCP resources, and waits for child process exit before launching a replacement. Public port stays bound. Cleanup has ten seconds; a stuck owned process tree is terminated before replacement. Config errors remain visible until a watched edit fixes them. CLI shutdown drains child and proxy together.

SDK managed/middleware hosting and stdio MCP retain existing automatic config restarts and caller-owned listener behavior; their lifecycle adapters share restart coordination with proxy package.
