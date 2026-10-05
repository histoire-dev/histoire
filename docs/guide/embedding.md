# Embed Histoire

Use `@histoire/sdk` to mount a complete explorer or independent iframe surfaces. Vue hosts can use `@histoire/vue` to compose native panels around isolated story runtimes. Both connect to a running Histoire dev server or a deployed static book.

## Enable book embedding

Embedding is disabled by default. Configure additional parent origins explicitly:

```ts
import { defineConfig } from 'histoire'

export default defineConfig({
  embed: {
    enabled: true,
    allowedOrigins: ['https://app.example.com'],
  },
  vite: { base: '/stories/' },
})
```

The book's own origin is always allowed when embedding is enabled. Additional entries must be exact HTTP(S) origins, including non-default ports. Paths, trailing slashes, credentials, wildcards, and opaque origins are rejected.

Dev and static books expose `__embed.html` and versioned `histoire-embed.json` under their configured base. Keep the complete built output together. Existing `index.html`, `__sandbox.html`, and `histoire.json` remain available.

## Mount an iframe explorer

Install `@histoire/sdk` in the host. Supply an absolute book base URL; the SDK appends a missing trailing `/`:

```ts
import { createHistoireSession } from '@histoire/sdk'

const session = createHistoireSession({
  url: 'https://books.example.com/stories/',
})

await session.connect()
const stories = await session.catalog.list()
if (stories[0]) await session.selection.select({ storyId: stories[0].id })

const explorer = session.mount(document.querySelector<HTMLElement>('#book')!, {
  surface: 'explorer',
})
await explorer.ready

// When the host removes this view:
await explorer.unmount()
await session.dispose()
```

Give the mount container a real width and height. `ready` resolves after the surface is ready; iframe `load` alone does not establish story runtime readiness. Construction and package imports are safe without browser globals. `connect()` and mounting belong in the client lifecycle. Full explorer needs usable space for navigation, toolbar, preview, and panels: iframe acceptance covers 1100×800, while native compact acceptance covers 600×700. For smaller native hosts, use `showNavigation`, `showToolbar`, and `showPanels` to leave a measurable preview; zero preview height cannot establish runtime readiness.

`selection.select()` waits for selected runtime in current primary. Explorer may then replace preview/grid presentation to match story layout. Before acting on replacement iframe DOM or geometry, observe its current `runtimeId` with `runtime.status === 'ready'`; operations captured for retired document reject.

## Compose independent surfaces

All surfaces share one session's selection, settings, state mirror, and event history:

```ts
const preview = session.mount(previewContainer, { surface: 'preview' })
const tree = session.mount(treeContainer, { surface: 'tree' })
const controls = session.mount(controlsContainer, { surface: 'controls' })
const docs = session.mount(docsContainer, { surface: 'docs' })
await Promise.all([preview.ready, tree.ready, controls.ready, docs.ready])

await session.settings.update({
  responsiveWidth: 720,
  responsiveHeight: 560,
  colorScheme: 'dark',
  textDirection: 'rtl',
  globals: { accent: 'violet', density: 'compact' },
})
await session.state.patch({ label: 'Updated' })
```

Supported names are `explorer`, `preview`, `grid`, `tree`, `search`, `toolbar`, `controls`, `docs`, `source`, `events`, and `tests`. Inspect `session.getSnapshot().capabilities` before presenting an operation.

Each session permits one primary preview or grid, including the preview inside an explorer. A second primary fails with `RUNTIME_IN_USE`. Await the first handle's `unmount()` before replacing it. Create separate sessions to show independent books, targets, or theme directions.

Catalog, search, docs, and raw source reads do not mount story modules. State operations, custom controls, dynamic source, and preview tests require a ready primary runtime. For headless interaction, create one explicitly:

```ts
await session.settings.update({ responsiveWidth: 720, responsiveHeight: 560 })
const hidden = session.createHiddenPreview()
await hidden.ready
const state = await session.state.get()
await hidden.unmount()
```

Hidden previews retain measurable dimensions; they reserve the same primary slot. Data-only panels do not create them automatically.

## Use native Vue panels

Install `@histoire/sdk`, `@histoire/vue`, and host Vue 3.5. Import the stylesheet once. No Histoire Vite aliases, host router, Pinia installation, or global FloatingVue setup is required.

```vue
<script setup lang="ts">
import { createHistoireSession } from '@histoire/sdk'
import {
  HistoireControls,
  HistoireDocs,
  HistoirePreview,
  HistoireProvider,
  HistoireStoryTree,
} from '@histoire/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import '@histoire/vue/style.css'

const session = createHistoireSession({ url: 'https://books.example.com/stories/' })
const ready = ref(false)
const error = ref<unknown>()

onMounted(async () => {
  try {
    await session.connect()
    const [story] = await session.catalog.list()
    if (story) await session.selection.select({ storyId: story.id })
    ready.value = true
  }
  catch (failure) { error.value = failure }
})
onBeforeUnmount(() => {
  void session.dispose().catch(failure => error.value = failure)
})
</script>

<template>
  <HistoireProvider v-if="ready" :session="session" class="book">
    <div class="parts">
      <HistoireStoryTree />
      <HistoirePreview />
      <aside><HistoireControls /><HistoireDocs /></aside>
    </div>
  </HistoireProvider>
  <p v-else-if="error" role="alert">
    {{ String(error) }}
  </p>
</template>

<style scoped>
.book { width: 100%; height: 640px; }
.parts { display: grid; grid-template-columns: 200px 1fr 280px; width: 100%; min-height: 0; }
aside { min-width: 0; overflow: auto; }
</style>
```

Children consume the nearest explicit session. A provider owns child mounts, overlays, and observers; it does not dispose a caller-owned session. A host that owns the session must dispose it. `useHistoireSession()` and `useHistoireSnapshot()` work inside the provider. Use `@histoire/controls/vue` and `@histoire/controls/vue/style.css` when importing controls directly with host Vue.

Native docs normalize links/assets against the source base, then apply an HTML-only sanitizer. Remote scripts, event attributes, styles, and embedded frames are removed. Native content never imports host-side story modules. Raw and dynamic source are explicit modes; unavailable dynamic source does not silently become raw source.

## State, globals, and tests

The story runtime owns canonical state. `state.get()` exposes a cleaned mirror; `state.patch()` merges serializable edits without replacing runtime callbacks, instances, or omitted values. `state.reset()` restores the initial runtime snapshot. Use structured `{ storyId, variantId }` targets, including IDs containing `:`; never split or concatenate them to infer identity.

Globals are per-session scalar values. Vue/Nuxt stories read them reactively through `useHistoireGlobals()` from `histoire/client`; Svelte/vanilla stories can subscribe through `useHistoireGlobalsStore()`. Grid variants share the session's globals.

```ts
const abort = new AbortController()
const summary = await session.tests.run({ mode: 'preview', signal: abort.signal })
console.log(summary.passed, summary.failed)
```

Preview mode uses the ready owned runtime. Server mode uses a dev book's server execution lane. Static books do not provide server mode. Failed assertions resolve a completed summary; unavailable engines, dependency failures, collection failures, cancellation, and transport failures remain typed errors. There is no automatic execution retry or preview-to-server fallback. Preview cancellation retires its sandbox; unmount/remount the primary before another preview run.

Embedded persistence is off by default. `persistenceKey` opts into source-scoped host settings storage; state and event history are not persisted. Denied storage retains in-memory behavior. Embedded sessions leave host URL, title, router, and document theme under host control.

## Exchange application messages

Opt into each channel in the book configuration:

```ts
import { defineConfig } from 'histoire'

export default defineConfig({
  embed: {
    enabled: true,
    allowedOrigins: ['https://app.example.com'],
    channels: ['preview-bridge'],
  },
})
```

Capture the story handle during Vue setup, Svelte initialization, or vanilla mount initialization. Later callbacks keep that exact variant identity:

```ts
import { useHostChannel } from 'histoire/client'

const channel = useHostChannel('preview-bridge')
const stop = channel.on('ping', (data) => {
  void channel.post('pong', data).catch(console.error)
})
// Call stop() when this listener is no longer needed.
```

After connecting and explicitly mounting a ready primary preview or grid, the host uses the same configured name:

```ts
const channel = session.channels.open('preview-bridge')
const stop = channel.subscribe((message) => {
  console.log(message.target, message.type, message.data)
})
await channel.post('ping', { requestId: 'check-1' })
stop()
```

Channels relay bounded JSON application data. They share a 50-message-per-second budget per runtime and direction, with a 64 KiB application-message limit. Host posts target the selected variant; grid replies retain their originating variant. Runtime replacement retires handles and listeners, so open and subscribe again explicitly. No automatic replay occurs. See [channel reference](../reference/sdk.md#application-channels) for errors, dormant collection behavior, and dropped counters.

## Standalone command compatibility

Standalone also preserves automatic test-definition collection after its selected primary becomes ready, including collected-count badge and skipped definitions. It shares one controller with the tests panel. Collection never runs test bodies, mounts a story, switches engine, or retries a failed collection. Embedded/native consumers retain explicit collection.

Standalone Histoire uses the same session implementation and retains configured `clientAction` commands. Each action receives its own mutable serializable projection of `currentVariant.state`, also exposed through the selected variant in `currentStory`. After the action completes, only edited leaves and arrays are patched into the captured runtime. Other live edits remain intact.

Runtime callbacks and instance methods are unavailable in host command context. Editing serializable instance fields still updates the canonical instance. Object property deletion rejects with `INVALID_ARGUMENT` because `state.patch()` cannot express deletion; array mutation remains supported. `showIf` and `getParams` receive read-only mirrors. Navigation, disconnect or closure rejects pending actions and prevents late edits reaching another runtime. No arbitrary runtime command tunnel is exposed.

## Origins and deployment headers

The SDK connects through an exact-origin handshake and dedicated `MessagePort`; the host does not need CORS fetch access to the book's catalog/content. Each surface has its own mount identity and port. Book wrappers keep same-origin communication with their story sandboxes.

The book origin is one trust domain. Host-side validators constrain every inbound command/result/event; a book is not a security sandbox for project code. Run untrusted projects in a separate process/container and serve them on a separate origin. Histoire does not provide authentication infrastructure or carry host credentials in embed URLs.

Histoire dev/Node servers send `Content-Security-Policy: frame-ancestors 'self' <allowed origins>` on embedded documents. Configure an equivalent response header on a static host, including `index.html`, `__embed.html`, and `__sandbox.html`:

```text
Content-Security-Policy: frame-ancestors 'self' https://app.example.com
```

Preserve other CSP directives. Configure the embedding host's `frame-src` to permit the book origin. A CSP `<meta>` tag cannot supply `frame-ancestors`, which requires a response header ([CSP specification](https://www.w3.org/TR/CSP3/#directive-frame-ancestors)).

A deployed static book can replace its baked additional allowlist with same-base `histoire-embed-origins.json`:

```json
{ "version": 1, "allowedOrigins": ["https://staging.example.com"] }
```

Serve that file with `Cache-Control: no-store` and update the static framing header to the same effective list. Node deployment reads comma-separated `HISTOIRE_EMBED_ORIGINS` at startup. A present invalid/unreadable override fails closed to book origin only; an absent override retains the baked list.

Cross-origin editor actions and dev server tests require additional `embed.allowOpenInEditor` and `embed.allowServerTests` opt-ins. Both default to false. Allowlisting an origin alone does not enable those actions.

After reload, navigation, or restart, affected pending work rejects and retained data becomes stale. Call `session.connect()` explicitly to reconnect, then issue intended edits/runs yourself. Disposing a session rejects pending operations and closes owned frames, ports, and observers.

See [browser/Vue SDK reference](../reference/sdk.md), [Node SDK reference](../reference/node-sdk.md), and [Node deployment](./deploy-node.md).
