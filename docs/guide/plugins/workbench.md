# Workbench plugins

A Histoire plugin can add UI to the workbench and code to story frames, next to its Node hooks:

- **Workbench module** (`workbench.client`): inspector tabs and sections, toolbar items, commands, shortcuts, menus, rail panes, settings and home sections, canvas overlays, tools and views.
- **Frame module** (`workbench.frame`): runs inside interactive story frames, once per rendered variant, and talks to the workbench module over a per-plugin channel.

Plugins are trusted code: they run with the same rights as the workbench and your stories. There is no sandbox, marketplace or runtime installer.

A complete plugin covering every contribution kind lives in [`examples/plugin-reference`](https://github.com/Akryum/histoire/tree/main/examples/plugin-reference). It ships the same plugin with five interchangeable UI variants (workbench Vue, DOM, React, Svelte 5, Svelte 4) and is used by the `vue3`, `react` and `svelte4` examples.

## Anatomy

```ts
// my-plugin/src/node.ts — loaded from histoire.config.*
import type { Plugin } from 'histoire'
import { fileURLToPath } from 'node:url'

export function myPlugin(options: { threshold?: number } = {}): Plugin {
  return {
    name: 'my-plugin',
    workbench: {
      id: 'acme',
      apiVersion: 1,
      client: fileURLToPath(new URL('./client.js', import.meta.url)),
      frame: fileURLToPath(new URL('./frame.js', import.meta.url)),
      // The only plugin data that reaches the browser.
      options: { threshold: options.threshold ?? 24 },
    },
  }
}
```

```ts
// my-plugin/src/client.ts — workbench module
import { defineWorkbenchPlugin } from '@histoire/plugin-kit'

export default defineWorkbenchPlugin({
  id: 'acme',
  apiVersion: 1,
  setup(api) {
    api.commands.add({
      id: 'copy-target',
      label: 'Copy selected variant id',
      icon: 'copy',
      run: context => navigator.clipboard.writeText(context.selection.target?.variantId ?? ''),
    })
  },
})
```

```ts
// my-plugin/src/frame.ts — frame module
import { defineFramePlugin } from '@histoire/plugin-kit/frame'

export default defineFramePlugin({
  id: 'acme',
  apiVersion: 1,
  attach(frame) {
    const count = () => frame.channel.post('count', frame.element.querySelectorAll('*').length)
    count()
    const observer = new MutationObserver(count)
    observer.observe(frame.element, { subtree: true, childList: true })
    return () => observer.disconnect()
  },
})
```

Install `@histoire/plugin-kit` as a dependency of your plugin package.

### Descriptor

| Field | Description |
| --- | --- |
| `id` | `[a-z][a-z0-9-]*`, at most 64 characters, unique per project; `builtin` is reserved. Contribution ids are qualified with it (`acme:hello`). |
| `apiVersion` | `1`. |
| `client` | Module default-exporting `defineWorkbenchPlugin(...)`. |
| `frame` | Module default-exporting `defineFramePlugin(...)`. At least one of `client` and `frame` is required. |
| `options` | JSON value handed to both modules (`api.options`, `frame.options`). |
| `devOnly` | Leave both entries out of static builds. |

Entries are resolved by Vite from the project root: a bare specifier (`my-plugin/client`) or an absolute path. Resolve your own relative paths before returning them, as above; a remaining relative path is read as project-root relative. An invalid descriptor or an entry that does not resolve stops Histoire at startup with a message naming the plugin and field.

## Lifecycle

- The workbench creates one **extension host** per mounted workbench. Each host imports the workbench module lazily, after the workbench has painted, and calls `setup(api)` once.
- Registrations made during `setup` commit together once it settles. If `setup` throws or rejects, nothing it registered is exposed and its resources are released; other plugins are unaffected.
- Every helper returns a disposer. Registrations made after `setup` (for example from an async task) belong to the plugin too. Everything is released when the plugin or the host is disposed; `api.signal` aborts at that moment. A returned function from `setup` runs at disposal.
- Changing the selection never reinstalls plugins: surfaces receive a new context instead.
- Code changes:
  - Workbench and frame modules are ordinary Vite modules: editing them reloads the workbench (no partial hot swap) or the story frame.
  - Changes to `histoire.config.*` and to the Vite config restart Histoire.
  - Local modules imported by those config files (outside `node_modules`) are watched too: editing a project-local plugin's **Node code** written in TypeScript (the factory returning the descriptor, Node hooks) restarts `histoire dev`. Files Node loads natively (`.mjs`, `.cjs`, `.js` in a `type: module` package) are neither watched nor re-evaluated; restart by hand for those, and for installed plugin packages.

## Contributions

Each helper on `api` registers one contribution kind. Every contribution has a local `id` (qualified as `${pluginId}:${id}`), and optional `order` (lower first among plugin entries), `available(context)` (hidden while it returns `false`; a throwing predicate hides it for good) and `devOnly`.

| Helper | Kind | Context | Placement |
| --- | --- | --- | --- |
| `inspector.addTab` | `inspector.tab` | frame | After built-in tabs; `?tab=acme:panel` deep links |
| `inspector.addSection` | `inspector.section` | frame | `before`/`after` a tab body (`builtin:props`, `builtin:docs`, `builtin:events`, `builtin:tests`, a plugin tab) or `footer` |
| `toolbar.addItem` | `toolbar.item` | root | Inside a toolbar group (`tools`, `zoom`, ... or `plugins`); `action`, `toggle`, `popover` or `custom` |
| `commands.add` | `command` | root | Command search (`>` prefix) |
| `shortcuts.add` | `shortcut` | root | Binds keys to a qualified command id; conflicts with built-ins are skipped and reported |
| `menus.addFrameAction` | `frame-menu.item` | frame | Frame context menu; `children` form a submenu |
| `menus.addContextAction` | `context-menu.item` | context menu | Workbench context menu for the listed `targets` (`story`, `folder`, `test`, ...) |
| `canvas.addOverlay` | `canvas.overlay` | canvas | Layer over the canvas, in `viewport` or `canvas` space |
| `canvas.addFrameOverlay` | `canvas.frame-overlay` | frame | One instance per rendered frame, over its document box |
| `canvas.addFrameBadge` | `canvas.frame-badge` | frame header | Badge next to the variant title of every laid-out frame |
| `canvas.addTool` | `canvas.tool` | canvas | Tool switch, after built-in tools |
| `canvas.addView` | `canvas.view` | canvas | Arrangement switch, after Grid, List and Matrix; `?arrange=acme:compare` |
| `shell.addPane` | `shell.pane` | root | Rail, after built-in panes |
| `settings.addSection` | `settings.section` | root | Settings navigation, after built-in sections |
| `home.addSection` | `home.section` | root | Home page `primary` or `secondary` column |

Plugin entries sort by `order`, then config order, then registration order; built-ins keep theirs. Unknown deep links (`?tab=`, `?arrange=`, settings sections, panes) wait until plugins have set up, then fall back to the default.

### Actions

`run(context, { signal })` receives the context captured when the action started. `signal` aborts when that target scope changes (selection or source): drop late results instead of applying them to another variant. Errors are reported by the invoking surface and recorded as diagnostics. Frame-menu children are runnable as `${itemId}:${childId}`.

Toolbar toggles re-read `pressed(context)` after each run, on context or registry changes and after any write to the plugin's preferences, so a toggle backed by a preference stays in sync with settings views. Tab and rail `badge` functions re-evaluate on the same changes. When they read plugin-internal state instead (a store filled by channel messages), call `api.invalidate()` after changing it: every `badge`, `pressed` and `available` callback is re-read.

Toolbar `action`, `toggle` and `popover` items accept `command` (a qualified command id). The shortcut bound to that command is shown as the item's hint, in its tooltip and in the overflow menu, like built-in hints; clicking still runs the item. `custom` items render their own control and get no hint.

```ts
api.commands.add({ id: 'toggle-grid', label: 'Toggle grid', icon: 'grid', run: toggleGrid })
api.shortcuts.add({ id: 'toggle-grid-keys', command: 'acme:toggle-grid', keys: ['alt+shift+g'], scope: 'global' })
api.toolbar.addItem({ id: 'grid', group: 'plugins', type: 'toggle', label: 'Grid', icon: 'grid', command: 'acme:toggle-grid', pressed: () => grid, run: toggleGrid })
```

Inspector plugin tabs show their `icon` before the label. Tabs that do not fit the tab row move to a "More tabs" menu; built-in tabs and the active tab stay in the row, and arrow keys on the tab list reach every tab.

## Rendering views

Every view-bearing contribution takes either a workbench Vue `component` or a framework-neutral `mount`. Both are first class.

### Workbench Vue components

```vue
<!-- Panel.vue -->
<script setup lang="ts">
import type { FrameScopedContext } from '@histoire/plugin-kit'
import { HstButton } from '@histoire/controls/vue'

const props = defineProps<{ context: FrameScopedContext }>()
</script>

<template>
  <div class="acme-panel">
    {{ context.frame.target.variantId }}
    <HstButton @click="context.navigation.openSettings('acme:settings')">
      Settings
    </HstButton>
  </div>
</template>
```

```ts
api.inspector.addTab({ id: 'panel', label: 'Acme', icon: 'plug', component: Panel })
```

The component receives the surface context as its `context` prop and is updated in place when the context changes. Below it, `useWorkbenchContext()` and `useViewHost()` from `@histoire/plugin-kit/vue` read the same context and host services at any depth.

These components run on the **workbench's own Vue**, not your project's: they share its app context, so `@histoire/controls/vue` components render with the workbench theme. This works in React, Svelte or vanilla projects that do not install `vue`. Limits:

- In modules imported from a workbench module, `vue`, `@vue/runtime-dom`, `@vue/runtime-core`, `@vue/reactivity` and `@histoire/controls/vue` resolve to the workbench copies. Other `vue/*` subpaths (`vue/server-renderer`, the template compiler) fail with an explicit error: the bundled Vue is runtime-only, so templates must be compiled ahead of time.
- Published plugins should ship **precompiled** components (the reference plugin builds its SFCs with `@vitejs/plugin-vue` in library mode). Project-local `.vue` plugin files work when the project itself uses `@vitejs/plugin-vue`.
- Third-party Vue libraries used by a plugin must declare `vue` as a (peer) dependency to be resolved against the workbench's Vue.
- Use `@histoire/controls/vue` (`HstButton`, `HstSwitch`, `HstPulsatingDisc`, ...) for controls and the [state and layout components](#states-and-pane-layout) below for empty, loading and error areas.

### DOM mount

```ts
api.shell.addPane({
  id: 'pane',
  label: 'Acme',
  icon: 'plug',
  mount(container, context, host) {
    const render = (current: typeof context) => {
      container.textContent = `Selected: ${current.selection.target?.storyId ?? 'nothing'}`
    }
    render(context)
    return {
      update: render, // new context snapshots, never a remount
      dispose: () => container.replaceChildren(),
    }
  },
})
```

`mount` may be async. If its view retired meanwhile (`host.signal` aborted), the returned handle is disposed at once. A throwing `mount` or `update` shows an error state for that view only and is recorded as a diagnostic.

Framework adapters build on it. Each component receives `{ context, host }` props:

```ts
import { reactView } from '@histoire/plugin-kit/react'
import { svelte4View } from '@histoire/plugin-kit/svelte4'
import { svelte5View } from '@histoire/plugin-kit/svelte5'
import { vueView } from '@histoire/plugin-kit/vue/mount'

api.shell.addPane({ id: 'react', label: 'React', icon: 'plug', ...reactView(MyReactPane) })
api.shell.addPane({ id: 'svelte', label: 'Svelte', icon: 'plug', ...svelte5View(MySveltePane) })
```

- `reactView`: one React root per view; React 18 or 19, from your plugin's dependencies. In dev, CommonJS dependencies of installed plugin packages (React) are prebundled like any project dependency; a project importing the same package shares that prebundle.
- `svelte5View` (Svelte 5.7+) and `svelte4View`: `context` is reactive. Precompiled Svelte output needs a Svelte runtime at least as new as the compiler that built it. In projects using `@sveltejs/vite-plugin-svelte`, `svelte` is deduped to the project's copy, so a Svelte 5 plugin cannot run in a Svelte 4 project, and the reverse; the reference plugin ships a Svelte 4 variant for the `svelte4` example for that reason.
- `vueView`: isolated Vue app; for hosts rendering a Vue plugin outside the workbench's Vue.

Precompile JSX and Svelte components when publishing, so consumers need no compiler.

### States and pane layout

Empty, loading and error areas and pane structure use the workbench's own components, so plugin views line up with built-in panels. `@histoire/plugin-kit/vue` exports them under the workbench names; the host renders its implementation (standalone workbench, or `@histoire/vue` native components), and outside any host they fall back to plain accessible markup. Your plugin never imports the workbench.

| Component | Props | Slots |
| --- | --- | --- |
| `WorkbenchEmptyState` | `icon` (offline Carbon glyph), `title` | `default` (detail), `actions` |
| `WorkbenchLoadingState` | `title` (operation in progress) | `default` (detail) |
| `WorkbenchErrorState` | `title` (failed operation), optional `icon` | `default` (detail), `actions` |
| `WorkbenchPaneHeader` | `title` | `default` (trailing actions) |
| `WorkbenchPaneToolbar` | | `default` (filters, a button group fills it) |
| `WorkbenchPaneList` | | `default` (scrolling rows) |

```vue
<script setup lang="ts">
import { WorkbenchEmptyState, WorkbenchPaneList } from '@histoire/plugin-kit/vue'

defineProps<{ rows: Array<{ id: string, name: string }> }>()
</script>

<template>
  <WorkbenchEmptyState v-if="!rows.length" icon="search" title="No matches">
    Nothing audited yet
  </WorkbenchEmptyState>
  <WorkbenchPaneList v-else>
    <button v-for="row in rows" :key="row.id" class="acme-row">
      {{ row.name }}
    </button>
  </WorkbenchPaneList>
</template>
```

- Titles are short headlines without a trailing period.
- Rail panes already get a `WorkbenchPaneHeader` with the contribution label. Their body is a column: a view rendering `WorkbenchPaneToolbar` and `WorkbenchPaneList` as root elements keeps the toolbar fixed while the list scrolls.
- List rows pad their content horizontally by `--histoire-pane-row-inset`; never hard-code the gutter or the inset.
- Settings sections render inside a card under the section title, like built-in sections. In that card `--histoire-pane-gutter` equals the settings row inset, so a view padded by the gutter lines up with built-in rows; do not add your own outer margin.

DOM, React and Svelte views get the same states through `host.renderState(element, state)`: the host renders its state component into an element your view owns, replacing its children. Calling it again re-renders in place; `null` clears it. Keep one element per state slot and clear it before reusing it for your own content or disposing the view:

```ts
api.shell.addPane({
  id: 'pane',
  label: 'Acme',
  icon: 'plug',
  mount(container, context, host) {
    const empty = document.createElement('div')
    container.append(empty)
    host.renderState(empty, { kind: 'empty', icon: 'search', title: 'No matches', detail: 'Nothing audited yet' })
    return { dispose: () => host.renderState(empty, null) }
  },
})
```

`state` is `{ kind: 'empty', icon, title, detail? }`, `{ kind: 'loading', title, detail? }` or `{ kind: 'error', title, icon?, detail? }`. Actions are Vue-only; render buttons next to the element instead.

### Theming and popovers

Plugin views render inside the workbench theme scope, without Shadow DOM:

- Read workbench tokens: `--histoire-text`, `--histoire-body`, `--histoire-muted`, `--histoire-surface`, `--histoire-border`, `--histoire-chip`, `--histoire-accent`, `--histoire-danger-text`, `--histoire-danger-soft`, `--histoire-font-sans`, `--histoire-radius-control`, `--histoire-control-height`, `--histoire-pane-gutter`, `--histoire-pane-row-inset` and their `-rgb` forms. They follow light and dark themes and density settings.
- Scope your styles: prefixed class names or SFC `scoped` styles. Nothing isolates them from the workbench, in either direction.
- Render popovers and menus into `host.overlayRoot` (`useViewHost().overlayRoot` in Vue, `createPortal(..., host.overlayRoot)` in React). It sits inside the theme scope and is removed with the view.

If a view embeds an interface that cannot adopt the workbench theme, set `degradedVisualIntegration: true` on its contribution. Histoire frames and clips that view with a neutral rounded border. The option applies to both `component` and `mount` views; omit it for views that use workbench styling.

## Context and capabilities

| Context | Surfaces | Adds |
| --- | --- | --- |
| `WorkbenchContext` (root) | toolbar, commands, shortcuts, panes, settings, home | `capabilities`, `source.mode` (`dev`, `static`, `remote`), `catalog`, `selection`, `navigation`, `devEvents?`, `tests?`, `subscribe` |
| `FrameScopedContext` | inspector tabs and sections, frame menu, frame overlays | `frame` (`key`, `target`) and `runtime` (`getSnapshot`, `subscribe`) of exactly that frame |
| `CanvasScopedContext` | canvas overlays, tools, views | `canvas`: zoom, pan, coordinate transforms, frame geometry, frame leases |
| `ContextMenuContext` | context menu | captured `target` (`kind`, `label`, `selection?`, `frame?`) |

Check `context.capabilities` before relying on optional services (`devEvents`, `tests`, `canvas`, `frames`). A missing service is absent from the context; reading it never throws. `context.subscribe` notifies after selection or source changes; read fresh values from the context then.

- `catalog`: metadata-only `list()`, `getStory(id)`, `search(query)`.
- `navigation`: `selectStory`, `openInspectorTab`, `openPane`, `openSettings`, `openCanvasView`, taking `builtin:` or qualified plugin ids.
- `devEvents.send(event, payload)`: reaches your Node `onDevEvent` hook; dev server only.
- `tests`: project test runs shared with the Tests pane; dev server only. `entries()` lists per-variant `summary`, `running`, `stale` and `error`; `progress` reports the current run phase: waiting to start (`queued`), stories collected (`collect`), then variants checked (`run`); `error` is the failure of a whole run; `runAll()`/`run(target)` start runs; `subscribe` notifies after changes. Tests attach JSON to their result with `setHistoireTestData(context, key, value)` from `@histoire/shared` (48 KiB per test), read back as `summary.tests[n].data[key]`.

## Options and preferences

**Options** are what your Node factory puts in `workbench.options`: JSON only, validated at startup, the same for every user, and embedded in static builds. Nothing else from the Node plugin (functions, secrets, other fields) reaches the browser. Read them as `api.options` and `frame.options`, and validate them: they come from a user's config.

**Preferences** are per user:

```ts
const compact = api.preferences.get('compact', false)
api.preferences.set('compact', true)
api.preferences.subscribe('compact', value => render(value))
```

- Values are JSON. The standalone workbench stores them in `localStorage` under a project and plugin namespace (`…:plugin:acme:compact`), so two plugins or two books never collide.
- They are never part of "Save to project" and never written to `histoire.config.*`.
- Embedded hosts persist them only when they pass a `storage` to their extension host; otherwise they live in memory for the host's lifetime.
- Changes made in another browser tab reach `subscribe` listeners and refresh badges and toggles in the standalone workbench. Embedded hosts get the same when their `storage` implements `subscribe(listener)` (`StorageLike`, see the [reference](../../reference/plugin-api.md#preferences-storage)).

## Canvas

- **Overlays** (`canvas.addOverlay`): `space: 'viewport'` uses viewport pixels; `space: 'canvas'` uses canvas units, and the host applies pan and zoom to the layer. Overlays are passive (`inert`, no pointer events) unless `interactive: true`, which lets only the elements you render receive input.
- **Frame overlays** (`canvas.addFrameOverlay`): one instance per rendered frame, sized and positioned over the frame's document box through pan, zoom, scroll and resize. Two frames of the same variant get two instances with different `context.frame.key` values.
- **Frame badges** (`canvas.addFrameBadge`): a short count or status next to the variant title in every frame header, including frames that are not live yet. `badge(context)` returns text, a number or `{ text, tone, label }` (`tone`: `neutral`, `accent`, `warning` or `danger`; `label` is the tooltip and accessible description); `null`, `undefined` or `''` hides it. The context has `frame` but no `runtime`. Badges re-evaluate like tab badges, so call `api.invalidate()` when they read plugin state.

```ts
api.canvas.addFrameBadge({
  id: 'issues',
  badge: ({ frame }) => {
    const count = issues.get(frame.key)
    return count ? { text: count, tone: 'danger', label: `${count} issues` } : null
  },
})
```

- **Tools** (`canvas.addTool`): `onPointerDown`, `onPointerMove`, `onPointerUp`, `onCancel` receive viewport and canvas points and the frame under the pointer. Built-in panning (Space, middle button, Pan tool) always wins. A throwing handler switches back to Select. `shortcut` keys are registered in the canvas scope.
- **Views** (`canvas.addView`): an arrangement beside Grid, List and Matrix. The view covers the canvas body and places content with `context.canvas` transforms. `layout(zoom)` returns content boxes used by Fit; `toolbar` lists the toolbar groups the view supports.
  - The canvas reads `layout` when it measures (switch, resize, frame registry changes). When your content changes on its own, call `context.canvas.requestLayout()`: the canvas re-reads `layout` once after the current update, without remounting the view. At Fit zoom the camera frames the new boxes; at a fixed zoom, or after the user panned, the camera stays.
  - Pointer input works like a story frame. With the Select tool, primary presses on view content reach your elements; the canvas neither pans nor takes focus. The Pan tool, held Space and the middle button pan the canvas and never reach your content (clicks still fire). Add `data-histoire-canvas-pan` to full-size backgrounds: a press whose target is that element itself acts like a press on empty canvas, while its children stay view content.

```ts
api.canvas.addView({
  id: 'board',
  label: 'Board',
  icon: 'grid',
  layout: () => columns.map(column => column.rect),
  mount(container, context) {
    const background = document.createElement('div')
    background.setAttribute('data-histoire-canvas-pan', '')
    container.append(background)
    addColumn(background)
    context.canvas.requestLayout()
  },
})
```

- **Frame leases** (`context.canvas.acquireFrame(target, { container, rect?, queue?, signal? })`): managed story frames rendered into your container, counted against the viewport's frame budget. A full budget rejects with `FrameLeaseError` (`reason: 'budget'`) unless `queue: true`. Aborting `signal` or calling `lease.release()` frees the frame. Leases taken by a view are released when the user switches to another arrangement. Leased frames get frame overlays, frame plugins and channels like any other frame.

## Frame plugins

The frame module is imported only by **interactive** story frames: the primary frame, canvas frames, Matrix cells and leased frames. It is never evaluated during story collection, in test workers, in controls replicas, or in screenshot or MCP automation documents.

- `attach(frame)` runs once per rendered **actor** (one mount of one variant), after the variant reported it is ready. `frame.actorId` identifies the actor; a remount is a new actor.
- `frame.element` is the rendered variant root; `frame.state` is a readonly view of the variant state with `subscribe`; `frame.target` and `frame.options` describe what and how.
- The actor detaches on selection changes, story hot updates, page hide or frame removal: `frame.signal` aborts, then `onCleanup` callbacks and the returned disposer run in reverse order. Late async results are disposed immediately.
- Failures (`load`, `attach`, cleanup) are reported to the workbench as diagnostics of the plugin with the same id; the variant keeps rendering.

## Channels

Each plugin has its own channel per frame actor. Messages are JSON, at most 64 KiB, at most 50 per second per direction; excess messages are dropped and counted (`getDroppedCount()`). Types starting with `histoire:` are reserved.

```ts
// Frame module
frame.channel.on('ping', () => frame.channel.post('pong', Date.now()))

// Workbench module
for (const ref of api.frames.list()) {
  const channel = api.frames.open(ref) // bound to exactly that actor
  channel.on('pong', (time, message) => showLatency(message.target, time))
  void channel.post('ping', null)
}
```

- `api.frames.list()` returns the frames where your frame module is attached, with their `actorId`. `api.frames.open(context.frame)` reaches the current actor of a frame from a frame-scoped context.
- A channel never retargets: once its actor detaches, posts reject and listeners are released.
- Messages posted before the workbench opened a channel are dropped. Ask for current data after opening (the reference plugin posts an `audit` request).
- `api.frames.subscribe(listener)` fires when one of your frame actors attaches or detaches (`list()` changed). Re-read `list()` there instead of polling, as the reference plugin does; the subscription is released with the plugin.
- Two frames showing the same variant never receive each other's messages.
- `api.frames.window(ref)` resolves an attached actor to its same-origin `window`, `origin` and `documentId` when the host supports direct browser access. It returns `undefined` in remote hosts and after the actor retires. A window proxy can survive navigation: re-resolve and compare its document identity before each handshake, and close any associated resources when selection or actor ownership changes. Prefer JSON channels unless a browser protocol requires direct window access.

## Embedding hosts

- The **standalone** workbench and the book's own explorer page load the plugin manifest of the book.
- `@histoire/vue` native hosts and other apps embedding a book through `@histoire/sdk` never evaluate code served by the book. They import the plugin's workbench module themselves and pass it to their own extension host (`HistoireProvider`'s `extensions` prop). Frame modules always run inside the book's story frames; host-imported workbench modules reach them through `session.plugins`.
- Hosts render only the surfaces they have. Native hosts show inspector tabs and sections, toolbar items and shortcuts; rail panes, settings, home and canvas contributions stay registered but unrendered, and their capabilities are absent.
  - Toolbar items render after the built-ins of the group they name (`viewport`, `background`, `ui`); groups without a native counterpart, and `plugins`, trail after the built-in items.
  - Shortcuts fire in the `global`, `canvas` (explorer canvas) and `frame` (its single-variant frame) scopes, innermost first. `comment` has no native surface: such shortcuts are disabled and reported as a diagnostic when registered. Conflicting bindings are rejected at registration too, as in the standalone workbench; their commands stay runnable.
- State and pane components: `HistoireProvider` supplies native ones unless an enclosing Vue app provided its own under `WORKBENCH_COMPONENTS_KEY` (from `@histoire/plugin-kit`, a `WorkbenchComponents` object keyed by component name). Plain DOM hosts pass `renderState` to `host.mount(id, element, context, { renderState })`; without it, `host.renderState` renders plain markup.

See the [`@histoire/plugin-kit` README](https://github.com/Akryum/histoire/tree/main/packages/histoire-plugin-kit#readme) for `createExtensionHost`, `createSessionContext` and the Vue provider.

## Diagnostics

Failures are attributed to the plugin (and contribution) and never retried. The standalone workbench logs each one once to the browser console as `[histoire plugin "<id>"] <phase> failed:`.

| Phase | Cause | What users see |
| --- | --- | --- |
| startup | Invalid descriptor or unresolvable entry | Histoire does not start; the error names the plugin and field |
| `load` | Duplicate plugin id, unsupported `apiVersion` | The plugin is skipped |
| `setup` | Module import failed, wrong exported id, `setup` threw | None of the plugin's contributions appear |
| `register` | Invalid or duplicate contribution id, unknown kind | That registration is refused |
| `mount`, `update` | A view threw | An error state in that view only; overlays stay empty |
| `run` | An action threw | The invoking surface reports the error |
| `callback` | `available`, `pressed`, `badge` or a preference listener threw | The contribution is hidden or falls back |
| `dispose` | A disposer threw | Nothing; teardown continues |
| `report` | `api.reportError`, `host.reportError`, shortcut conflicts, frame module failures | Console only |

Embedding hosts read the same entries with `host.diagnostics()`.

## Compatibility

- Plugins without `workbench` behave exactly as before; Node hooks are unchanged.
- `PluginCommand.clientSetupFile`, `window.__HST_PLUGIN_API__` and `histoire/plugin` keep working.
- Built-in `?tab=` and `?arrange=` values are unchanged; plugin values are qualified ids.
- `apiVersion: 1` is the only contract version. Breaking changes will use a new version.

See also the [plugin API reference](../../reference/plugin-api.md).
