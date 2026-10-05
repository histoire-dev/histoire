# Architecture and repository seams

All paths are relative to the repository root. `app/` means `packages/histoire-app/src/app`.

## Current shape (implemented 2026-10-03)

- **Entry and shell.** `app/index.ts` delegates to `standalone/mount.ts`. The standalone entry connects a session, installs route/preferences/folder/command/test/document adapters, and mounts `App.vue`. `App` wraps `components/shell/WorkbenchApp.vue` in `@histoire/vue`'s `HistoireProvider`. Rail, side panel, canvas, inspector, home, Markdown, and settings share that provider.
- **Routes.** `standalone/navigation.ts` owns `/`, `/story/:storyId?`, and `/settings/:section?`. Existing `variantId`, `tab`, docs-anchor, and hash/history behavior remain at this adapter boundary. Optional `arrange`, `rows`, and `cols` queries restore canvas/matrix choices; no workbench store reads a global router singleton.
- **State ownership.** `standalone/workbench.ts` creates shell, settings, presets, matrix, project tests, menus, shortcuts, and dev stores once per provider. Components use injected factories/composables. Canonical selection, preview settings, runtime state, catalog, and events come from SDK snapshots. Local storage is supplied by the owning standalone window; existing folder/preview/theme keys are preserved by adapters.
- **Canvas.** `CanvasViewport` mounts selected `HistoirePreview` against the canonical session. `CanvasReplicaPreview` creates passive local sessions through the existing preview adapter for other live frames. A provider-local registry holds exact frame/iframe/document identities for menu, measure, screenshot, and comment requests. Layout/pan stores stay local; the default live-frame budget is 24. Matrix cell prop overrides do not mutate canonical variant state.
- **Inspector.** `components/inspector/StoryInspector.vue` supplies floating chrome around native controls and `HistoireDocs`, `HistoireEvents`, and `HistoireTests`. The Source drawer reuses SDK content/state services. Existing custom controls remain connected to the preview runtime; workbench code does not create another controls engine.
- **Search and tests.** Stories/search consume the SDK catalog and source index. Search activation runs through standalone commands, preserving exact target/docs-anchor navigation. Project tests wrap the existing SDK tests model and use the shared server execution lane for project-wide runs and Watch.
- **Dev services.** `packages/histoire/src/node/server/ui-channel/` validates Vite HMR UI requests and supplies snapshots/results for screenshots, MCP activity, project config, ACP agents, and comments. `app/util/ui-channel.ts` is the client seam. Existing loading/publication events remain in their owning source/runtime paths.
- **MCP and ACP.** MCP retains its loopback listener, authentication, queue, browser/session services, and screenshot/test executors in `packages/histoire/src/node/mcp/`. The workbench observes/cancels through the dev channel. `node/acp/` owns optional local agent subprocesses and permission mediation; no process starts until an explicit prompt.
- **Static build.** Existing bundle, sandbox, catalog/content, and `histoire.json` outputs remain. Build metadata is projected through `node/virtual/build-info.ts`. With `__HISTOIRE_DEV__` false, dev panes and Node-backed channels are absent; comment files and private agent environment values are not read into static output.
- **Config loading and writing.** Existing jiti/plugin config loading remains unchanged. `node/config/codemod/` analyzes and edits supported literal paths for explicit project saves, with revision/path guards, refusal of computed values, and backup/restart handling. It is a separate writer, not a new config format.
- **Styling.** `app/style/tokens.pcss` defines root-scoped semantic tokens and maps existing project palette overrides. Standalone `App.vue` overrides generic SDK inline roles with references to those semantic channels; portable SDK providers retain their styling. Manrope and JetBrains Mono assets/licenses live in `app/style/fonts/`, with `fonts.pcss` loading local subsets. `packages/histoire-shared/src/icons/` supplies one offline Carbon subset/helper to the workbench and built-in controls. Legacy runtime modules and Tailwind-prefixed controls remain available to the SDK adapter.

## Hard constraints

1. **App dist paths are an API.** The generated preview runtime (`packages/histoire/src/node/virtual/preview-runtime/preamble.ts`) imports app dist modules by path: `components/story/StoryVariantGridSandbox.vue.js`, `GenericMountStory`, `GenericRenderStory`, `stores/preview-settings.js`, `plugin.js`, and `util/{const,config,dark,controls-document,preview-settings,state,vitest-mocker-shim}`. Do not move or rename these; new canvas code lives in new modules.
2. **Preview protocol is shared** by the app, iframe runtime, MCP preview host, and implemented embeddable SDK. Only additive message types (see [contracts](contracts.md)); never change existing payloads.
3. **Route and query contract** (`/story/:storyId`, `variantId`, `tab`) stays valid. New UI state goes to new optional query keys or local settings.
4. **Selectors.** Cypress specs in `examples/{vue3,svelte4,nuxt4}/cypress` rely on `data-test-id` values (story-list-item, story-side-panel, story-controls, story-controls-sandbox, preview-iframe, search-modal/btn/item, story-source-code, story-tests-tab, toolbar-background, responsive-preview-bg, event-item…). Keep them on equivalent elements or update specs in the same slice.
5. **Storage keys.** Keep existing localStorage keys or migrate once with a test. Split-pane keys become obsolete when split panes disappear; remove reads, don't reuse the names.

## Implemented structure

Legacy dist/runtime modules stay where required by their consumers. The standalone workbench uses these new seams:

| Area | Location | Role |
| --- | --- | --- |
| Standalone integration | `app/standalone/` | Session mount, route/storage adapters, provider factories, resource teardown |
| Tokens, fonts, icons | `app/style/{tokens,fonts}.pcss`, `app/style/fonts/`, `packages/histoire-shared/src/icons/`, `app/util/icons.ts` | Palette mapping, local font assets, shared offline Carbon registry |
| Shell | `app/components/shell/`, `app/stores/shell.ts`, `app/composables/shell.ts` | Rail/panel/inspector chrome and provider-local visibility |
| Tree | `app/components/panes/stories/` | Catalog tree, folder adapter, filter, keyboard navigation |
| Canvas | `app/components/canvas/`, `app/components/canvas/pan/`, `app/stores/canvas.ts` | Layout, budget, pan/zoom, canonical preview and passive frames |
| Toolbar | `app/components/canvas/toolbar/` | Session settings plus local canvas actions |
| Inspector | `app/components/inspector/` | Floating native SDK controls/content/tests and Source drawer |
| Matrix | `app/components/canvas/matrix/`, `app/util/matrix.ts`, `app/stores/matrix.ts` | Axis discovery, local cell overrides, restoration |
| Panes | `app/components/panes/{search,tests,comments,mcp}/` | Provider-owned workbench panels; ⌘K opens the Search pane |
| Pages | `app/components/pages/{home,markdown,settings}/` | Metadata-driven home, document outline, settings |
| Menus | `app/components/menu/`, `app/util/{frame-actions,shortcuts}.ts` | Exact-target actions and scoped shortcut registry |
| Dev channel | `packages/histoire/src/node/server/ui-channel/`, `app/util/ui-channel.ts` | Validated requests and sanitized state/events |
| ACP | `packages/histoire/src/node/acp/`, `app/stores/agents.ts` | Local clients, user-level env, permission prompts |
| Comments | `packages/histoire/src/node/comments/`, `app/stores/comments.ts` | Lazy atomic project storage and provider-local threads |
| Config codemod | `packages/histoire/src/node/config/codemod/` | Literal edits; loading in `config/load.ts` unchanged |

## Embeddable SDK coordination

The standalone explorer already uses the session-driven SDK from `plans/embeddable-sdk`. Redesign integration follows its ownership contract:

- SDK session owns canonical selection/settings/runtime state. Workbench factories own local layout, panes, menus, axes, and dev projections. Factories are injected per provider; independent providers share no workbench singleton.
- Router, local storage, page document writes, and project dev-channel wiring stay in standalone adapters. Embedded providers remain usable without those adapters and do not gain project file writes automatically.
- Native SDK controls, docs, source, events, search, tests, and preview adapters remain the data/runtime authority. New chrome composes them instead of keeping parallel render/test/search engines.
- Provider resource cleanup closes observers and local workbench resources. Embedded callers retain ownership of their supplied session; the standalone entry explicitly owns and disposes its created session. Passive frame sessions are disposed by their frame components.
- Tokens/theme classes and keyboard focus scopes stay on the owning provider root. Frame feature replies require current source/iframe/document/request identity; stale replies cannot update another provider or newly selected frame.

## MCP coordination

MCP owns its listener, auth, operation queue, and screenshot/test executors (`plans/mcp-server`). Slices 14 and 15 consume those services through a dev-only UI channel; they do not add MCP tools or change MCP contracts. ACP (slice 16) is a separate Node-side client protocol: Histoire launches local agents and may expose its own MCP server to them, but ACP code never reimplements MCP operations.

Executed checks and remaining browser/cross-framework limits belong in [implementation validation](implementation-validation.md), separate from this architecture description.
