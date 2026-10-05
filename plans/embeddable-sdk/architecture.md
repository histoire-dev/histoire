# Architecture and repository seams

Read [public API](public-api.md) for normative behavior and [coordination](coordination.md) before changing shared Node services.

## Current checkout

- [App bootstrap](../../packages/histoire-app/src/app/index.ts) mounts #app, installs global router/Pinia/FloatingVue, and imports Vite virtual modules.
- [Router](../../packages/histoire-app/src/app/router.ts) exports module-global router; story store derives selection from that router.
- [Preview store](../../packages/histoire-app/src/app/stores/preview-runtime.ts) owns frames, pending requests, and installed reply listener at module scope. New Pinia instance does not isolate them.
- [Preview iframe host](../../packages/histoire-app/src/app/util/preview-iframe-host.ts) already centralizes single/grid frame behavior, runtime-first state, readiness, HMR, and navigation cleanup.
- [Shared preview protocol](../../packages/histoire-shared/src/types/preview-message.ts) is existing sandbox contract. New SDK must reuse it rather than copy constant/type sets.
- Generated [host messaging](../../packages/histoire/src/node/virtual/preview-runtime/host-messaging.ts) and [message handler](../../packages/histoire/src/node/virtual/preview-runtime/message-handler.ts) intentionally require same-origin embedding host. Cross-origin support needs outer bridge.
- [Controls iframe](../../packages/histoire-app/src/app/components/panel/StoryControlsSandboxIframe.vue) and [controls host](../../packages/histoire-app/src/app/composables/controls-host.ts) already implement replica state, intrinsic height, appearance, overlays, and keyboard/focus coordination.
- [Docs panel](../../packages/histoire-app/src/app/components/panel/StoryDocs.vue) can load story component for inline docs; [source panel](../../packages/histoire-app/src/app/components/panel/StorySourceCode.vue) can invoke live variant slots in host. Those dependencies must leave embedding host.
- Search data and source/plugin loaders arrive through virtual modules. External package consumers cannot depend on these imports.
- main.pcss resets document elements and sizing; dark.ts touches document theme and global controls references. Native UI needs root-local equivalents.
- App and controls builds alias Vue to @histoire/vendors/vue. Native components need host Vue, with a separate controls build.
- [Node context](../../packages/histoire/src/node/context.ts), config/Vite loading, and [TEMP_PATH](../../packages/histoire/src/node/alias.ts) depend on process.cwd(). [Story registry](../../packages/histoire/src/node/stories.ts) additionally stores mutable context globally; story/Markdown listeners outlive individual projects.
- [Server lifecycle](../../packages/histoire/src/node/server/index.ts) creates collecting then client Vite servers sequentially, starts watchers/collector, and returns before full initial collection settles.
- Static build currently writes index.html, __sandbox.html, histoire.json, and static mock assets.
- [resolveAutoSelectedVariantId](../../packages/histoire-app/src/app/util/variant-selection.ts) restores valid prior choice or auto-selects sole variant. It leaves unseen multi-variant stories unselected.
- Added by 2026-10-02 review: the uncommitted MCP implementation on the same base already provides runtime controller/execution modules, MCP catalog/content providers, shared preview URL helpers, and a Playwright preview host; see [coordination](coordination.md). [Nuxt plugin](../../packages/histoire-plugin-nuxt/src/index.ts) calls `loadNuxt` without `cwd` and hard-codes runtime `app.baseURL: '/'`. Sandbox appearance comes from storage-backed `useDark` in [dark.ts](../../packages/histoire-app/src/app/util/dark.ts). `logEvent` in [events.ts](../../packages/histoire-app/src/app/util/events.ts) posts `{ name, argument }` only to the same-origin host. Nothing sets frame-ancestors.

Source references above are repository-relative within /home/akryum/Projects/histoire. Slice documents enumerate concrete edit/add targets.

## Dependency graph

~~~text
@histoire/protocol
  consumed by @histoire/shared, @histoire/sdk, Node data adapters
@histoire/sdk
  consumed by @histoire/vue and first-party app adapters
@histoire/controls/vue
  consumed by @histoire/vue; host Vue is external peer
@histoire/vue
  consumed by host apps and @histoire/app prebundle
@histoire/app
  consumed by histoire for app/runtime assets
histoire/node
  exposes existing core Node services, independent of browser SDK imports
~~~

Browser SDK must never import histoire/node or @histoire/app. Core imports app, app consumes SDK, so SDK importing core would close dependency cycle. New protocol package has no runtime framework or platform dependencies. Type-only imports cannot hide unsupported browser declaration dependencies.

First-party controller/source adapter construction is exposed through @histoire/sdk/internal, explicitly unsupported as external loader API. Public root supports configured remote sources only. This internal entry accepts narrow injected transports/providers; it contains no Vite virtual imports. App and source bridge implement Vite-specific adapters outside SDK.

## Source, session, surface, and runtime ownership

Source adapter reads one catalog/content revision. Dev source subscribes to collection/HMR; static source reads immutable build data. Both provide portable DTOs and content loaders.

Parent HistoireSession owns host selection, serializable state mirror, settings, retained events, and request correlation. Independent sessions never share frames, pending requests, selected variants, or observers.

Remote source bridge iframe is data-only. Each mounted surface iframe receives separate MessagePort and proxy session backed by parent controller. View proxy does not create another controller or claim runtime ownership.

Primary preview/grid surface owns same-origin child sandbox and adapts existing preview protocol into parent session. Controls surface owns controls replica, never canonical state. Full iframe explorer reserves same primary slot as preview/grid.

Native Vue provider consumes parent session. Native preview/grid wrappers still mount remote preview surfaces, whose nested story frames remain on source origin. Native controls render generic editors locally; custom controls execute remotely with overlays rendered by provider-owned host.

Standalone uses local source/frame adapters with same controller and native components. It bypasses remote source handshake and works when embed.enabled is false. Its route, title, plugin-window API, and persistence adapters are explicit first-party integrations.

## Two communication boundaries

1. Existing same-origin host/sandbox protocol remains shared and origin-pinned. Add optional runtime document identity for new adapters; maintain compatibility exports and existing message fields.
2. Versioned external bridge exchanges only validated commands/events through negotiated MessagePorts. Source/frame/origin trust established during handshake; later port traffic remains scoped by recorded session/mount/connection.

Parent session forwards state/events/settings between mounted surfaces. No cross-frame callback, VNode, component constructor, module loader, or DOM node travels through bridge. Controls overlay labels/IDs/geometry are serializable; option values and callbacks stay runtime-local.

Epoch identifies source generation; revision identifies completed catalog/content snapshot; connection identifies negotiated port lifetime; mount identifies attached UI; runtime document identifies actual story iframe document. All dimensions matter because iframe WindowProxy can survive document navigation.

Selection authority also depends on direction and captured generation. Parent selection can replace child target; child UI intent cannot replace a newer parent choice using a stale target/runtime capture. Within a retained grid document, document-owned `selectionVersion` rejects delayed clicks even when selection returns to the earlier target. New sandbox URLs and host selection messages carry this generation; legacy same-origin messages retain their optional-field compatibility. Runtime document IDs remain unique across inner wrapper replacements under the same outer mount.

## Node architecture

Shared runtime controller owns context, registries, watchers, sequential Vite creation, collection readiness, catalog publication, config restart, and server execution lane. Captured generation exposes isActive(); revalidate after awaits and before publishing.

Per-project factory supports multiple Vue/Svelte roots in one process. Nuxt retains one active project per process because its Node context is shared; concurrent Nuxt roots require separate processes, including existing MCP workers. One project owns at most one active dev hosting handle; build/test contexts are separate captures, not mutations of live dev arrays. User configuration executes normally; library guarantees cover its own owned state/resources.

Middleware handle retains stable delegating function across restarts. Provided HTTP server remains caller-owned. Vite's HTTP and HMR routes receive full base-aware URL; unrelated HTTP routes and upgrade listeners continue working.

Static preview is capture-capable through same-origin nonce host routing before static/history fallback and immutable built-target metadata. It does not borrow live dev collection. Preview owns registry/epoch and closes captured work before listener teardown; capture jobs own browser/context and individual lease. Reuse MCP browser host rather than navigating ordinary index.html or top-level sandbox.

Node deployment uses MCP roadmap's target/layout/lifecycle. Embed-enabled public browser assets belong inside public/ for Node artifact, never private/. Production startup does not import dev source adapter, watchers, Vite, or project config.

## Loading and compatibility

Catalog/tree/search metadata loads without mounting story modules. Docs/raw source load on demand through content providers. Dynamic source and preview tests run only in explicitly owned story runtime. Source bridge itself does not create hidden runtime.

Heavy content dependencies load per panel. Protocol/SDK bundles contain neither sanitizer nor highlighter nor Vue. Native component graph uses host Vue once. Standalone prebundle compiles same UI under existing vendor aliases.

Protocol owns command-specific wire limits and bounded sizing for JSON DTOs versus cyclic state graphs. Parent gates cannot apply generic response/event caps to valid catalog/state-specific traffic. Grid geometry comes from variant content roots and scroll clips; whole iframe rectangle cannot substitute for target-attributed cell geometry.

Existing CLI/config/plugin/story APIs and top-level static output stay compatible. SDK omitted variant defaults to remembered/first variant. Standalone adapter sends explicit null where existing route intentionally shows variant chooser; this preserves discovered behavior without changing SDK default.

## Primary technical references

- [Vite middleware and HTTP server example](https://vite.dev/guide/ssr.html#setting-up-the-dev-server). Initial inspection found Vite 7.3.1 in core package, including middlewareMode and hmr.server/path; verify installed generation before implementation.
- [DOMPurify official documentation](https://github.com/cure53/DOMPurify). Native remote docs sanitize only after URL rewriting, using HTML profile and explicit forbidden tags/attributes.

These references guide implementation. They are not package-install, browser, or compatibility proof.
