# Contracts and target architecture

This file owns decisions shared by every slice. A cleanup must not silently turn a retained API into a no-op or redirect events to a currently selected but unrelated variant.

## Current owners

- `app/index.ts` mounts `standalone/mount.ts`; `App.vue` supplies `HistoireProvider` and `components/shell/WorkbenchApp.vue`.
- `standalone/navigation.ts` creates the mount-owned router. `WorkbenchApp` chooses Home/Markdown/Settings/Canvas directly; legacy `app/router.ts` is not its routing adapter.
- SDK sessions own canonical catalog, selection, settings, events, state, content, and runtime handles. Workbench factories own shell/layout/menu/matrix/project-test projections.
- `packages/histoire/src/node/virtual/preview-runtime/` generates story-runtime imports and installs runtime event scope. It still uses vendor Vue, FloatingVue, Pinia, and app runtime components.
- Embedded consumers own supplied sessions and mount targets. Cleanup must not add a standalone router, ambient storage access, or document writes to reusable parts.

## Target dependency boundary

```text
standalone mount -> owned navigation/session -> WorkbenchApp -> current surfaces
client logEvent -> serializer/runtime event publisher
               -> lazy router-free compatibility event store (host fallback only)
sandbox grid -> retained toolbar action -> URL helper -> shared URL builder
generated runtime -> existing dist runtime modules and preset adapter
```

No retained source module may import `app/router.ts`, `stores/story.ts`, `stores/folder.ts`, `stores/tests.ts`, or `stores/preview-runtime.ts` after cleanup. No replacement module-global story selector or test runner may be introduced.

## Sandbox URLs

- Keep `getSandboxUrl(story, variant?)` signature and existing return representation.
- Continue delegating exact identity encoding and omitted-variant behavior to `getSandboxRelativeUrl` from `@histoire/shared`.
- Read deployment base from `import.meta.env.BASE_URL`, which the current router already uses. Keep this tiny configuration read in `util/sandbox.ts`; do not create another router or URL implementation.
- Do not derive deployment base from current route, strip `storyId` segments, concatenate `storyId:variantId`, or parse identities back out of storage keys.
- Root/nested bases, special IDs, omitted variant, static isolated links, and hash/history navigation must retain behavior.

## Public client events

Current `api.ts` exports `logEvent`, `isDark`, `toggleDark`, `useHostChannel`, its channel type, and globals helpers. Preserve those exports and signatures.

`logEvent` has two existing behaviors:

1. Sandbox event: clean payload, resolve actual emitting actor, publish through installed runtime event scope; retain same-origin fallback postMessage, marker, document identity, and existing message shape.
2. Non-sandbox call: lazily obtain `useEventsStore()` and add cleaned event to that compatibility store. Existing `log-event.spec.ts` covers this branch. Keep its current active-Pinia requirement and promise behavior; changing unsupported/no-owner behavior is outside cleanup.

For branch 2, retain `app/stores/events.ts` at its current path as a **narrow compatibility store**. Keep `HstEvent`, `events`, `unseen`, `addEvent`, and `reset`; remove the dependency on `useStoryStore` and its selection watcher in the same slice that deletes old views. It must not feed the workbench inspector or subscribe to a global router. Current inspector events remain SDK snapshot events.

The old automatic variant reset belongs to the deleted UI path. Runtime/SDK event history already has its own target/runtime ownership. Test that ownership at its existing adapter boundary; do not reinstate selection tracking in the compatibility store.

No event bus, global session registry, new protocol type, global selected-variant fallback, swallowed client failure, or cross-origin wildcard fallback.

## Required built runtime paths

Preserve source-to-output paths below. The generated source contains interpolated absolute specifiers, so ordinary import scanning alone cannot discover all consumers.

- `bundled/components/story/StoryVariantGridSandbox.vue.js`
- `bundled/components/story/GenericMountStory.vue.js`
- `bundled/components/story/GenericRenderStory.vue.js`
- `bundled/stores/preview-settings.js`
- `bundled/plugin.js`
- `bundled/util/{const,config,dark,controls-document,preview-settings,state,vitest-mocker-shim}.js`
- `bundled/util/{docs,dynamic-source,story-component,mapping,runtime-events,host-channel}.js` where referenced by generated runtime/support/test mounts.
- Existing emitted embed entries and adapters, especially `dist/embed/app/standalone/presets.js`, generated from the explicit `vite.embed.config.ts` input.

Read the entire current `preview-runtime/preamble.ts`, test-mount imports, runtime preset inputs, aliases, build scripts, and declarations in slice 01. Extend the list for any newly found required module. Preserve semantic behavior as well as file existence.

`StoryVariantGridSandboxItem.vue`, `virtual-grid.ts`, `ToolbarNewTab.vue`, `CheckerboardPattern.vue`, `util/docs.ts`, `util/scroll.ts`, and `stores/preview-settings.ts` have retained runtime consumers. `GenericMountStory` and `GenericRenderStory` are explicit Vite inputs. Keep them.

Do not remove runtime `createPinia`, vendors/pinia, `__HST_PLUGIN_API__`, HMR events, controls appearance bridge, dynamic-source generation, or the runtime event/host-channel registries.

## Workbench behavior

- Routes: `/`, existing story route identity, `/settings/:section?`, hash/history mode, nested deployment base, `variantId`, `tab`, docs anchors, arrangement/Matrix query state.
- Search: Ctrl/Meta+K, pane opening/dismissal and focus restoration, story/variant/docs/command results, keyboard navigation and stale row ownership.
- Commands: `ClientCommand` and `ClientCommandContext`, `getParams`, prompt defaults/answers, dev-only admission, runtime-bound client actions, observed errors. Retain `components/command/{CommandPrompts,PromptText,PromptSelect}.vue` and `standalone/commands.ts`.
- Inspector: SDK-backed props/presets/docs/events/tests/source, acknowledgement and retirement guards, custom controls sandbox, current empty/loading states.
- Canvas: single/grid/list/Matrix, actor-specific state/events, viewport/background/direction/theme, selection, fit/pan/zoom, toolbar overflow, screenshots/comments in dev.
- Static mode: current dev-only filtering; no ACP/MCP/comment/project-write service introduced by cleanup.
- Frameworks: retain Vue/React/Svelte story mounting and current Nuxt integration contracts.

## Storage and theming

Keep theme, sandbox-settings, folder, preset, canvas, workbench, and project-save preference adapters. Removing old split panes removes their reads, not users' storage entries. No broad migration or deletion of localStorage keys.

Keep theme color/font overrides, dark mode, runtime contrast/background settings, `htw-` classes required by controls/commands/runtime, offline Carbon registry and supported icon aliases. Delete only selectors without retained consumers; no blanket Tailwind-prefix purge.

## Tests and packaging

Tests importing removed code must be classified as retired presentation, useful portable helper behavior, or required current ownership coverage. Migrate useful cases first; delete obsolete tests and exclusive harnesses only after replacement proof.

`@histoire/app` wildcard exports and internal dist paths do not justify deleting supported runtime/client contracts. The obsolete shell components are removal scope; preserve documented client exports and current generated/internal consumers. Do not rename retained modules for neatness.

Build configuration remains `preserveModules` with current aliases and entry signatures. Dependency or treeshaking changes need a separate proposal backed by measurements.
