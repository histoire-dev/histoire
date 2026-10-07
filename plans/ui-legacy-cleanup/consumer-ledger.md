# Consumer ledger

Source audit: 2026-10-07, branch `main`, HEAD `c0c41ffc8e27d00c21eebd0aa0bfeb4adea3ddba`.

Incoming consumer rows record pre-cleanup snapshot evidence. Final dispositions below reflect source cleanup now present in shared checkout. Removal totals count verified source files only; no bundle-size claim. Source inventory does not prove fresh output, package consumption, or browser acceptance. Baseline/execution results belong to `implementation-validation.md`; this documentation owner ran no builds or tests.

## Discovery and concurrent work

Read inventory/contracts, both Vite configs, app tsconfigs/manifest, copy/watch scripts, standalone/API/reusable/source entrypoints, generated runtime preamble/app/components, variant test mounts, aliases/resolvers, bundled declarations, source-reader test helpers, current frame/source/event/search/tests suites, and CSS consumers. Relative imports include `.js` specifiers resolved to TypeScript; dynamic imports and mock specifiers are included. Generated import strings, explicit build inputs, CSS `@import`, directory source readers and package exports were checked separately. Historical plans and emitted `dist` were excluded from live source discovery. Final fresh-output inspection remains slice 07 work.

Initial dirty files included `AGENTS.md`, current canvas/inspector/settings/search/tests/shell components, current workbench tests, and new loading-state files/tests. Parent captured exact original files and Git status under `/tmp/histoire-ui-legacy-cleanup-baseline/`; this also includes concurrent `examples/vue3/cypress/e2e/single-variant-resize.cy.js`. Removal candidates with concurrent edits: `components/panel/StorySidePanel.vue`, `components/panel/StoryTests.vue`, `components/search/SearchLoading.vue`. Review their changes before deletion. New `vue-tests/workbench-panel-loading.spec.ts` directly consumes legacy `StoryTests.vue` and mocks its legacy tests store; preserve useful collection/run loading behavior when migrating that suite. Keep its separate current AgentsSection coverage.

Correct path exceptions in plan prose:

- Build/copy scripts are `packages/histoire-app/scripts/{copy,watchAndCopy,asset-path}.mjs`, not root `scripts/`.
- Bundled declaration is `packages/histoire/src/node/virtual/histoire-app-bundled.d.ts`, not inside `preview-runtime/`.

No newly live production consumer was found among removal candidates in this snapshot. Several new/test-only/non-import consumers require explicit migration below.

## Current roots and router reachability

- `src/bundle-main.js`: `bundled/index.js`, `style.css`, `bundled/app.css`.
- `src/bundle-main-dev.js`: `app/index`, `app/style/main.pcss`.
- `app/index.ts`: `standalone/mount.ts`; re-exports `StoryVariantGridSandbox.vue`. `App.vue` supplies `HistoireProvider` and current `WorkbenchApp.vue`.
- `standalone/mount.ts`: session/selection/runtime/navigation/folders/commands/tests/preferences/document owners. `standalone/navigation.ts` creates mount-owned router with current story/settings/home routes; does not import old router.
- `app/api.ts`: public `logEvent`, dark-mode API, host-channel API, shared globals. `src/bundle-index.js` exports bundled API; `src/index.ts` exports source API.
- `app/reusable.ts`: exports native `@histoire/vue` and internal components; native source goes through vendor aliases.
- `src/bundle-sandbox{,-dev}.js`: theme CSS aliases and generated `virtual:$histoire-preview-runtime`; no old standalone shell bootstrap.
- `src/bundle-embed{,-dev}.js`: data-document bootstrap and `embed/document.css`; owns no standalone router.

Old router is reachable through two retained roots before cleanup:

1. Generated grid/runtime or app index re-export: `StoryVariantGridSandbox` imports `StoryVariantGridSandboxItem` imports `ToolbarNewTab` imports `util/sandbox.ts` imports `router.ts` imports old Home/Story views. Slice 02 changes sandbox base read to `import.meta.env.BASE_URL`.
2. Client API: `api.ts` imports `util/events.ts` imports lazy `stores/events.ts` imports `stores/story.ts` imports `router.ts`. Slice 03 removes compatibility event store's story dependency while preserving public fallback.

Other old-router consumers are `util/commands.ts` and `stores/story.ts`; remove their importer chains atomically in slice 03. Neither old search modal nor command modal has current shell consumer, but leaving imports to deleted dependencies breaks source typechecks even when unreachable.

## Candidate rows — pre-cleanup incoming consumers, final disposition

Paths in first column are relative to `packages/histoire-app/src/app/`. Incoming app consumers use same root; `core-tests/` means `packages/histoire/src/node/__tests__/`, `vue-tests/` means `packages/histoire-vue/src/__tests__/`, and `controls-tests/` means `packages/histoire-controls/src/`. `None` means no direct source import found, not a packaging guarantee. Existing wildcard package export alone does not create an incoming first-party consumer. Test replacement references are obligations, not claimed passing results.

### Old route/view/panel/state chain

| Candidate | Pre-cleanup incoming source/test imports | Disposition | Owner | Replacement proof |
| --- | --- | --- | --- | --- |
| `router.ts` | `util/commands.ts:2`; `util/sandbox.ts:3`; `stores/story.ts:5` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/HomeView.vue` | `router.ts:22` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/story/StoryView.vue` | `router.ts:28` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/story/StoryViewer.vue` | `components/story/StoryView.vue:13` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/story/StoryVariantSingle.vue` | `components/story/StoryViewer.vue:7` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/story/StoryVariantSingleView.vue` | `components/story/StoryVariantSingle.vue:8` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/story/StoryVariantSingleIframe.vue` | `components/story/StoryVariantSingleView.vue:10` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/story/StoryVariantGrid.vue` | `components/story/StoryViewer.vue:5` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/story/StoryVariantListItem.vue` | `components/story/StoryVariantSingle.vue:7`; `components/story/StoryViewer.vue:6` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/story/StoryResponsivePreview.vue` | `components/story/StoryVariantSingleIframe.vue:4` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/panel/StorySidePanel.vue` | `components/story/StoryView.vue:12` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/panel/PaneTabs.vue` | `components/panel/StorySidePanel.vue:9` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/panel/StoryControls.vue` | `components/panel/StorySidePanel.vue:10` | Removed; original consumer evidence retained | 03 | Current controls/presets/custom-controls tests; migration C |
| `components/panel/StoryControlsSandboxIframe.vue` | `components/panel/StoryControls.vue:10` | Removed; original consumer evidence retained | 03 | Current controls/presets/custom-controls tests; migration C |
| `components/panel/StoryControlsOverlay.vue` | `components/panel/StoryControlsSandboxIframe.vue:14` | Removed; original consumer evidence retained | 03 | Current controls/presets/custom-controls tests; migration C |
| `components/panel/ControlsComponentProps.vue` | `components/panel/StoryControls.vue:7` | Removed; original consumer evidence retained | 03 | Current controls/presets/custom-controls tests; migration C |
| `components/panel/ControlsComponentPropItem.vue` | `components/panel/ControlsComponentProps.vue:5` | Removed; original consumer evidence retained | 03 | Current controls/presets/custom-controls tests; migration C |
| `components/panel/ControlsComponentState.vue` | `components/panel/StoryControls.vue:8` | Removed; original consumer evidence retained | 03 | Current controls/presets/custom-controls tests; migration C |
| `components/panel/ControlsComponentStateItem.vue` | `components/panel/ControlsComponentState.vue:5` | Removed; original consumer evidence retained | 03 | Current controls/presets/custom-controls tests; migration C |
| `components/panel/StatePresets.vue` | `components/panel/StoryControls.vue:9` | Removed; original consumer evidence retained | 03 | Current controls/presets/custom-controls tests; migration C |
| `components/panel/StoryDocs.vue` | `components/panel/StorySidePanel.vue:11`; `components/panel/PaneTabs.vue:10`; `components/story/StoryView.vue:11` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/panel/StoryEvents.vue` | `components/panel/StorySidePanel.vue:12` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/panel/StoryEvent.vue` | `components/panel/StoryEvents.vue:6` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/panel/StoryTests.vue` | `vue-tests/workbench-panel-loading.spec.ts:5`; `components/panel/StorySidePanel.vue:14` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/panel/StoryTestItem.vue` | `components/panel/StoryTests.vue:10` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/panel/StoryTestErrorItem.vue` | `components/panel/StoryTestItem.vue:5` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/panel/StorySourceCode.vue` | `components/panel/StorySidePanel.vue:13` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `stores/story.ts` | `components/HomeView.vue:4`; `util/commands.ts:3`; `components/panel/StorySidePanel.vue:4`; `core-tests/utils/tests-store-harness.ts:82`; `stores/tests.ts:7`; `components/app/Breadcrumb.vue:5`; `stores/folder.ts:4`; `stores/events.ts:3`; `components/story/StoryVariantSingle.vue:4`; `components/story/StoryViewer.vue:3`; `components/story/StoryView.vue:5`; `components/story/StoryVariantGrid.vue:4`; `components/search/SearchPane.vue:12` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `stores/folder.ts` | `components/tree/StoryGroup.vue:5`; `components/tree/StoryListFolder.vue:5` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `stores/tests.ts` | `vue-tests/workbench-panel-loading.spec.ts:9`; `components/panel/StoryTests.vue:5`; `components/panel/PaneTabs.vue:5`; `core-tests/utils/tests-store-harness.ts:89` | Removed; original consumer evidence retained | 03 | Test migration A; preserve pending-collection/loading cases |
| `stores/test-collection.ts` | `core-tests/tests-store.spec.ts:3`; `core-tests/utils/tests-store-harness.ts:85`; `stores/tests.ts:8` | Removed; original consumer evidence retained | 03 | Test migration A; preserve pending-collection/loading cases |
| `stores/tests-utils.ts` | `stores/tests.ts:9` | Removed; original consumer evidence retained | 03 | Test migration A; preserve pending-collection/loading cases |
| `stores/preview-runtime.ts` | `core-tests/preview-iframe-host.spec.ts:76`; `core-tests/preview-runtime-store.spec.ts:63`; `util/preview-iframe-host.ts:7`; `core-tests/utils/tests-store-harness.ts:76`; `stores/tests.ts:6` | Removed; original consumer evidence retained | 03 | Test migrations B and C |
| `util/preview-iframe-host.ts` | `core-tests/preview-iframe-host.spec.ts:91`; `components/story/StoryVariantSingleIframe.vue:3`; `components/story/StoryVariantGrid.vue:5` | Removed; original consumer evidence retained | 03 | Test migrations B and C |
| `util/preview-iframe-host-types.ts` | `util/preview-iframe-host.ts:3`; `util/preview-iframe-host.ts:23` | Removed; original consumer evidence retained | 03 | Test migrations B and C |
| `components/tree/StoryGroup.vue` | `components/tree/StoryList.vue:3` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/tree/StoryList.vue` | `components/app/Breadcrumb.vue:6` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/tree/StoryListFolder.vue` | `components/tree/StoryGroup.vue:6`; `components/tree/StoryList.vue:4` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/tree/StoryListItem.vue` | `components/tree/StoryGroup.vue:7`; `components/tree/StoryListFolder.vue:6`; `components/tree/StoryList.vue:5` | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |

### Dependency-detachment subset

| Candidate | Pre-cleanup incoming source/test imports | Disposition | Owner | Replacement proof |
| --- | --- | --- | --- | --- |
| `components/search/SearchPane.vue` | `components/search/SearchModal.vue:6` | Removed; original consumer evidence retained | 03 | Test migration H |
| `components/search/SearchModal.vue` | None | Removed; original consumer evidence retained | 03 | Test migration H |
| `components/app/Breadcrumb.vue` | None | Removed; original consumer evidence retained | 03 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `util/commands.ts` | `stores/command.ts:4`; `components/search/SearchPane.vue:13`; `components/command/CommandPromptsModal.vue:4` | Removed; original consumer evidence retained | 03 | Test migration H |
| `components/command/CommandPromptsModal.vue` | None | Removed; original consumer evidence retained | 03 | Test migration H |
| `stores/command.ts` | `components/search/SearchPane.vue:11`; `components/command/CommandPromptsModal.vue:3` | Removed; original consumer evidence retained | 03 | Test migration H |

### Old shell/search/intermediate leaves

| Candidate | Pre-cleanup incoming source/test imports | Disposition | Owner | Replacement proof |
| --- | --- | --- | --- | --- |
| `components/app/AppHeader.vue` | None | Removed; original consumer evidence retained | 04 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/app/AppLogo.vue` | `components/app/AppHeader.vue:8` | Removed; original consumer evidence retained | 04 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/app/HomeCounter.vue` | `components/HomeView.vue:6` | Removed; original consumer evidence retained | 04 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/app/InitialLoading.vue` | None | Removed; original consumer evidence retained | 04 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/app/MobileOverlay.vue` | `components/app/Breadcrumb.vue:7`; `components/story/StoryViewer.vue:4` | Removed; original consumer evidence retained | 04 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/search/SearchLoading.vue` | `components/search/SearchModal.vue:3` | Removed; original consumer evidence retained | 04 | Test migration H |
| `components/search/SearchItem.vue` | `components/search/SearchPane.vue:18` | Removed; original consumer evidence retained | 04 | Test migration H |
| `components/search/SearchItemContent.vue` | `components/search/SearchItem.vue:10` | Removed; original consumer evidence retained | 04 | Test migration H |
| `components/search/result-factories.ts` | `components/search/SearchPane.vue:16` | Removed; original consumer evidence retained | 04 | Test migration H |
| `components/search/search-title-data.ts` | `components/search/SearchPane.vue:17` | Removed; original consumer evidence retained | 04 | Test migration H |
| `components/search/search-docs-data.ts` | `components/search/SearchPane.vue:20` | Removed; original consumer evidence retained | 04 | Test migration H |
| `components/search/types.ts` | `components/search/search-docs-data.ts:1`; `components/search/search-title-data.ts:1`; `components/search/SearchPane.vue:4` | Removed; original consumer evidence retained | 04 | Test migration H |
| `standalone/Header.vue` | None | Removed; original consumer evidence retained | 04 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `standalone/CommandPalette.ts` | `vue-tests/standalone-search.spec.ts:7` | Removed; original consumer evidence retained | 04 | Test migration H |

### Toolbar/primitives/helpers

| Candidate | Pre-cleanup incoming source/test imports | Disposition | Owner | Replacement proof |
| --- | --- | --- | --- | --- |
| `components/toolbar/ToolbarResponsiveSize.vue` | `components/story/StoryVariantSingleView.vue:7` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/toolbar/ToolbarBackground.vue` | `components/story/StoryVariantSingleView.vue:5`; `components/story/StoryVariantGrid.vue:8` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/toolbar/ToolbarTitle.vue` | `components/story/StoryVariantSingleView.vue:9` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/toolbar/ToolbarTextDirection.vue` | `components/story/StoryVariantSingleView.vue:8`; `components/story/StoryVariantGrid.vue:9` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/toolbar/DevOnlyToolbarOpenInEditor.vue` | `components/panel/StoryDocs.vue:11`; `components/story/StoryVariantSingleView.vue:4`; `components/story/StoryVariantGrid.vue:7` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/base/BaseCheckbox.vue` | `controls-tests/compatibility.spec.ts:4`; `components/toolbar/ToolbarResponsiveSize.vue:6`; `components/toolbar/ToolbarBackground.vue:8` | Removed; original consumer evidence retained | 05 | Test migration G |
| `components/base/BaseCopyIcon.vue` | None | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/base/BaseEmpty.vue` | `components/panel/StoryTests.vue:7`; `components/panel/StorySourceCode.vue:12`; `components/panel/StorySidePanel.vue:6`; `components/panel/StoryDocs.vue:10`; `components/panel/StoryControls.vue:6`; `components/panel/StoryEvents.vue:5`; `components/story/StoryView.vue:9`; `components/search/SearchPane.vue:15` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/base/BaseListItem.vue` | `components/search/SearchItem.vue:8` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/base/BaseListItemLink.vue` | `components/story/StoryVariantListItem.vue:8`; `components/tree/StoryListItem.vue:8`; `components/search/SearchItem.vue:9` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/base/BaseOverflowMenu.vue` | `components/panel/PaneTabs.vue:6` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/base/BaseOverflowTab.vue` | `components/panel/PaneTabs.vue:7` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/base/BaseSelect.vue` | `controls-tests/compatibility.spec.ts:5`; `components/panel/StatePresets.vue:9` | Removed; original consumer evidence retained | 05 | Test migration G |
| `components/base/BaseSplitPane.vue` | `components/panel/StorySidePanel.vue:7`; `components/story/StoryVariantSingle.vue:6`; `components/story/StoryView.vue:10` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/base/BaseTab.vue` | `components/panel/PaneTabs.vue:8` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/base/BaseTag.vue` | `components/panel/StoryTests.vue:8`; `components/panel/PaneTabs.vue:9` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `components/base/router-link-props.ts` | `components/base/BaseListItemLink.vue:3`; `components/base/BaseTab.vue:3`; `components/base/BaseOverflowTab.vue:3` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `util/dynamic-source-panel.ts` | `core-tests/embed/dynamic-source-panel.spec.ts:3`; `components/panel/StorySourceCode.vue:11` | Removed; original consumer evidence retained | 05 | Test migration E |
| `util/preview-state-sync.ts` | `core-tests/preview-state-sync.spec.ts:3`; `core-tests/preview-state-roundtrip.spec.ts:4`; `util/preview-iframe-host.ts:20` | Removed; original consumer evidence retained | 05 | Test migration D |
| `util/preview-request.ts` | `stores/preview-runtime.ts:9`; `stores/preview-runtime.ts:15` | Removed; original consumer evidence retained | 05 | Test migration B; client-event receiver migration |
| `util/preview-message.ts` | `core-tests/preview-message.spec.ts:2`; `core-tests/log-event.spec.ts:3`; `util/preview-iframe-host.ts:19`; `components/panel/StoryControlsSandboxIframe.vue:11`; `stores/preview-runtime.ts:14` | Removed; original consumer evidence retained | 05 | Test migration B; client-event receiver migration |
| `util/variant.ts` | `components/story/StoryVariantListItem.vue:7` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `util/responsive.ts` | `components/story/StoryVariantSingle.vue:5`; `components/story/StoryView.vue:7`; `components/story/StoryVariantSingleView.vue:3`; `components/story/StoryVariantGrid.vue:6` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `util/tooltip.ts` | `components/app/AppHeader.vue:7` | Removed; original consumer evidence retained | 05 | Current workbench/navigation/inspector tests; retain generated runtime tests |
| `util/icons.ts` | `core-tests/workbench-icons.spec.ts:10`; `core-tests/workbench-icons.spec.ts:25`; `core-tests/workbench-icons.spec.ts:31` | Removed; original consumer evidence retained | 05 | Test migration F |

## Retained or modified exceptions — pre-cleanup ownership audit

| Path/group | Actual current/runtime/build consumer | Disposition/owner |
| --- | --- | --- |
| `util/sandbox.ts` | `ToolbarNewTab.vue`; exact-ID shared sandbox URL builder | Modify slice 02; retain signature/shared builder |
| `util/events.ts`, `stores/events.ts`, `HstEvent` | API re-export; lazy host fallback; runtime event publisher | Retain/decouple slice 03; actual Pinia fallback proof |
| `components/story/StoryVariantGridSandbox.vue` | App index re-export and generated preamble direct import | Retain; slice 07 output verification |
| `components/story/StoryVariantGridSandboxItem.vue`, `virtual-grid.ts`, `CheckerboardPattern.vue` | Retained sandbox grid and grid item imports | Retain |
| `components/story/GenericMountStory.vue`, `GenericRenderStory.vue` | Explicit Vite inputs, generated preamble, variant-test-mount.ts | Retain; slice 07 load proof |
| `standalone/presets.ts` | Explicit embed input `app/standalone/presets`; generated preamble imports `../embed/app/standalone/presets.js`; standalone-presets.spec.ts | Retain; slice 07 |
| `components/toolbar/ToolbarNewTab.vue` | Sandbox grid item; surviving isolated link action | Retain |
| `components/base/BaseButton.vue`, `BaseKeyboardShortcut.vue` | Current `CommandPrompts.vue`, `PromptText.vue`, `PromptSelect.vue`; BaseButton compatibility test remains | Retain |
| `components/base/PulsatingDisc.vue` | Current shell/canvas/test status and loaders | Retain |
| `components/base/overflow/*`, `popover/*` | Current toolbar/overlay geometry and lifecycle; `overflow/fit.ts` live | Retain |
| `components/command/{CommandPrompts,PromptText,PromptSelect}.vue` | Current standalone commands/search prompts | Retain |
| `standalone/{commands,client-actions,folders,navigation}.ts`, `util/builtin-commands.ts` | Current standalone bootstrap and SDK/session adapters | Retain |
| `util/keyboard.ts` | Retained BaseKeyboardShortcut; old-only tooltip/search imports are incidental | Retain |
| `util/select.ts` | Retained PromptSelect; old SearchPane also imports | Retain |
| `util/scroll.ts` | Retained sandbox grid item; old tree/list/search imports also exist | Retain |
| `util/docs.ts` | Generated preamble `getDynamicSourceCode`; sandbox grid item source copy | Retain |
| `util/dynamic-source.ts` | Retained docs helper and current dynamic-source.spec.ts; old panel helper also imports | Retain |
| `util/story-component.ts` | GenericMountStory; current story-component.spec.ts; old StoryDocs also imports | Retain |
| `util/mapping.ts` | Current standalone commands; story-mapping.spec.ts; bundled declaration | Retain |
| `util/{const,config,dark,controls-document,preview-settings,state,vitest-mocker-shim,runtime-events,host-channel}.ts` | Generated preamble imports/direct build entry; public APIs/runtime ownership | Retain |
| `util/{background,event-payload,hot,variant-selection}.ts`, `stores/preview-settings.ts` | Runtime settings/events/HMR/navigation and current source consumers | Retain |
| `components/panes/*`, current inspector/canvas/pages/shell, `WorkbenchLoadingState.vue`, `WorkbenchEmptyState.vue` | WorkbenchApp/current session architecture | Retain |
| `style/{main.pcss,document.pcss,controls.css}` | Source-development entry, Tailwind CSS command, main.pcss `@import`; shared controls/runtime/prose rules | Retain; slice 06 prune only proven obsolete rules |
| `style/sandbox.css` | No source import/alias match found; copied by generic asset script | Inspect slice 06; do not infer live runtime loading from asset existence |
| `style/transitions.pcss` | main.pcss import; current names used only by removal candidates | Remove obsolete rules/import after candidate deletion, slice 06 |
| `standalone/style.css` | mount.ts side-effect import; native HistoireStoryTree uses variant-count selector | Move live variant-count rule to native owning styles before deleting file/import, slice 06 |

## Generated imports and output obligations

`packages/histoire-app/vite.config.ts` keeps `treeshake: false`, `preserveModules: true`, `emptyOutDir: false`, strict entry signatures, stable filenames and vendor aliases. Required input list: `app/api.ts`, `app/reusable.ts`, `app/index.ts`, `app/util/controls-document.ts`, `GenericMountStory.vue`, `GenericRenderStory.vue`. Do not treat runtime-only mount/render helpers as unused because standalone UI never imports them.

`vite.embed.config.ts` explicit entries: `index`, `source`, `capabilities`, `adapters/state`, `adapters/layout`, `adapters/state-presets`, `app/standalone/presets`. Embed build also emits declarations via tsconfig.embed.json; app/workbench tsconfigs still compile source graphs independently of runtime reachability.

Generated preamble resolves every absolute app path against `resolveHistoireAppBundledDir()`:

```text
bundled/util/vitest-mocker-shim.js
bundled/components/story/StoryVariantGridSandbox.vue.js
bundled/components/story/GenericMountStory.vue.js
bundled/components/story/GenericRenderStory.vue.js
bundled/plugin.js
bundled/stores/preview-settings.js
bundled/util/const.js
bundled/util/config.js
bundled/util/dark.js
bundled/util/controls-document.js
bundled/util/preview-settings.js
bundled/util/runtime-events.js
bundled/util/host-channel.js
bundled/util/state.js
bundled/util/docs.js
embed/adapters/state.js
embed/adapters/state-presets.js
embed/app/standalone/presets.js
embed/adapters/layout.js
```

Preamble retains vendor Vue/FloatingVue/Pinia, shared state guards, controls overlay bridge, story loaders, mock RPC wiring, current runtime event/host-channel ownership, and variant test session imports. Runtime app/components still mount GenericMountStory/GenericRenderStory for grid, single and custom-controls paths. Variant-test-mount.ts imports both mount/render outputs directly and installs runtime Pinia/FloatingVue. Bundled declaration pins both component paths plus `bundled/util/mapping.js`; mapping source remains reachable from current commands.

`alias.ts` chooses app `src` or `dist` under HISTOIRE_DEV. `resolveHistoireAppBundledDir()` always resolves `dist/bundled`; source-dev still needs bundled runtime. `vite/core-plugin.ts` aliases `histoire-style` to source main.pcss or dist/style.css and `histoire-bundled-style` to bundled/app.css. No `sandbox.css` alias found. Copied root bundle-main/sandbox/embed/index files must remain.

App `scripts/copy.mjs` copies every non-TypeScript/non-Vue source asset; `toDist()` maps app font paths to `dist/fonts` and other source paths to `dist/`. It separately copies licensed shared-controls fonts. Watch script mirrors add/change/unlink for same source assets and font events. Asset removal therefore needs normal fresh build/watch behavior, not manual broad dist deletion. Font assets/licenses, app CSS, current SDK/native CSS and embed/document.css remain required.

Slice 07 must check generated imports on fresh output and actual generated-runtime load; merely finding stale emitted files is insufficient. Existing package-consumer harnesses: `core-tests/embed/consumers/packages.spec.ts`, `nuxt-package.spec.ts`, current generated frame fixture, and `core-tests/utils/mcp/package-consumer.ts`. Current cross-framework fixtures already exist under `embed/integration/preview-frameworks.spec.ts`, `preview-svelte.spec.ts`, host-channels-frameworks.spec.ts and `utils/mcp/framework-project.ts`; reuse instead of inventing duplicate fixtures.

## Valuable test migration decisions — initial obligations

These are source-audited owners and obligations. Slice owners must inspect exact counterpart assertions and add only missing behavior; this ledger does not declare replacement suites equivalent merely because names match.

### A — Legacy tests store and loading

Consumers: `core-tests/tests-store.spec.ts`, `tests-store-running.spec.ts`, `utils/tests-store-harness.ts`; newly added `vue-tests/workbench-panel-loading.spec.ts`. Keep current AgentsSection assertions from panel-loading suite.

Preserve readiness-gated collection, scoped errors/definitions, disposal, run target capture, no duplicate fallback execution, invalidation of delayed collection/run, stale result ownership, and source retirement. Current owners: `app/standalone/runtime-tests.ts`, current SDK tests service, current runtime frame/test workers, and workbench TestsPanel. Inspect `core-tests/embed/test-workers.spec.ts`, runtime frame suites, `workbench-test-runner.spec.ts`, `vue-tests/workbench-tests-panel.spec.ts`, tests service/session suites before retiring legacy suites. Legacy per-store cache implementation and deprecated server fallback are not preserved as separate APIs.

### B — Legacy frame host/request/security

Consumers: `core-tests/preview-runtime-store.spec.ts`, `preview-iframe-host.spec.ts`, `preview-message.spec.ts`; client `log-event.spec.ts` imports legacy message helper. No standalone preview-request.spec.ts found; request behavior lives in preview-runtime-store suite.

Preserve frame/source/origin/marker admission, current document/request/target correlation, deadline cleanup, queued request teardown, stale navigation rejection, target-specific events/state, selected grid actor ownership, and actor readiness. Current proof owners: `core-tests/embed/runtime-{ownership,frame-selection,frame-revisions,frame-readiness,frame-events}.spec.ts`, actual frame dispatch/rpc helper suites and generated runtime message guards. Update log-event receiver check to current dispatch while retaining same-origin marker/document payload contract. Old helper's missing-origin acceptance is historical compatibility behavior, not instruction to weaken current protocol admission.

### C — Tests reading removed source paths

Non-import consumers missed by ordinary graph scans:

- `core-tests/story-variant-grid.spec.ts`: reads `app/util/preview-iframe-host.ts`, enumerates `app/components/story`, and asserts old view components use old host.
- `core-tests/preview-host-messaging.spec.ts`: source-read host state-ownership block for preview-iframe-host.ts; generated outbound channel behavior remains live.
- `core-tests/preview-runtime-invalidation.spec.ts`: reads removed host `StoryVariantGrid.vue`; generated invalidation assertions remain live.
- `core-tests/controls-sandbox.spec.ts`: reads removed `StoryControlsSandboxIframe.vue`/`StoryControls.vue`; generated custom-controls assertions remain live.
- `core-tests/preview-postmessage-contract.spec.ts`: directory-wide app/source scan adapts to deletions automatically; retain protocol safety guard.

Retire assertions tied solely to old component wiring. Preserve generated/runtime halves and prove shared actor readiness, current state ownership, controls hydration/resize/overlay bridge, HMR listener retirement and reset semantics in current runtime/frame/custom-controls suites. Do not delete source-reader helpers wholesale: hot/postmessage and other retained source contracts still use them.

### D — Legacy state synchronizer

Consumers: `core-tests/preview-state-sync.spec.ts`, `preview-state-roundtrip.spec.ts`. Preserve callback/class/cycle owners, auto-prop/control metadata, runtime-first boot state, no boot mirror echo, and suppression scoped to exact actor. Existing current proof: `core-tests/embed/runtime-state.spec.ts`, `controls-presets.spec.ts`, runtime-frame selection/state suites, shared variant-state tests and generated runtime tests. Keep roundtrip cases importing live shared guards after removing only obsolete synchronizer coverage. No replacement module-global selector.

### E — Legacy dynamic-source panel

`core-tests/embed/dynamic-source-panel.spec.ts` tests pending plugin generation, explicit/source-slot precedence, superseded generation and static fallback. Current lower-level `embed/dynamic-source.spec.ts` preserves generation semantics; `vue-tests/workbench-content-ownership.spec.ts` drives current SourceDrawer and covers delayed loading/retirement/publications/preview readiness. Confirm static fallback and pending generator behavior at current SDK source owner before deleting old panel helper/test.

### F — Icons

`core-tests/workbench-icons.spec.ts` imports `app/util/icons.ts` three times, including source-only dynamic imports. Migrate to shared registry `@histoire/shared`/existing shared icon entry; preserve offline registry, invalid names, aliases and shipped component use. Do not remove supported aliases while deleting compatibility re-export.

### G — Base adapters

`controls-tests/compatibility.spec.ts` imports BaseCheckbox and BaseSelect; their only production consumers are old toolbar/presets. Keep retained BaseButton link semantics. Move useful checkbox accessible label/toggle behavior and select chosen-label/host-overlay behavior to existing current controls tests where those are supported controls contracts. Historical BaseSelect extra `select` emission/slot shape belongs to deleted adapter, so retire adapter-specific assertion after confirming current HstSelect contract rather than adding unsupported behavior to current control.

### H — Commands and search

`vue-tests/standalone-search.spec.ts` mounts removed intermediate StandaloneCommandPalette but also tests live createStandaloneCommands registry and route adapters. Preserve those command visibility/dev admission/disposal tests and migrate palette interactions to mounted current SearchPanel: searchText alias visibility, docs tab/anchor through hash/history routing, combined story/command keyboard activation, stale command-row retirement.

Current suites: `workbench-search-{ranking,focus,dismissal,accessibility,loading}.spec.ts`, `workbench-search-commands.spec.ts`, existing command/prompt suites, `standalone-navigation.spec.ts`, selection and command adapter tests. Focus/dismissal suites cover current pane ownership; they do not automatically prove all old palette command-reconciliation cases. Retain `CommandPrompts.vue` and its existing provider/context behavior while removing old CommandPromptsModal/store chain.

## CSS disposition detail

- `.histoire-story-variant-count`: native `packages/histoire-vue/src/components/tree/HistoireStoryTree.ts` renders it. Move to native style owner before removing standalone/style.css.
- Standalone header/search/home/command-modal rules: only superseded Header/CommandPalette/old shell use these selectors.
- `.__histoire-pane-shadow-from-right`: only old StoryVariantSingle/StoryVariantGrid consumers.
- `__histoire-scale-x`, `__histoire-scale-y`, `__histoire-fade`, `__histoire-fade-bottom`: old BaseTab/BaseOverflowTab/InitialLoading/MobileOverlay consumers; no retained source consumer found.
- Keep `.__histoire-render-story`, code/Shiki and prose rules, shared controls CSS/fonts, runtime document style and current tokens/native styles. Current specialized canvas/loaders/status indicators stay retained.

## Closure ownership

Slices 02–05 own source/test detachment; slice 06 owns CSS/build-source cleanup; slice 07 owns fresh output/typechecks/package consumers; slice 08 owns dev/static/browser/framework acceptance. Parent integration owner records actual pass/fail/blocked gates and resolves any newly introduced consumer. No staged changes, commits, pushes, source edits or tests performed by ledger owner.

## Final source dispositions

Refreshed 2026-10-07 after source owners completed slices 02–06. All 84 source candidates in per-file rows are absent: 45 old route/view/panel/state and dependency-detachment files, 14 shell/search/intermediate files, 25 toolbar/primitives/helpers. Both obsolete stylesheets are absent: `standalone/style.css`, `style/transitions.pcss`. Counts derive from explicit rows and filesystem checks, not a broad directory deletion.

Final retained compatibility/runtime owners:

- `util/sandbox.ts` retains shared `getSandboxRelativeUrl` and existing signature; reads deployment base directly from `import.meta.env.BASE_URL`; imports no router.
- `util/events.ts` retains runtime publisher and same-origin fallback; lazy `stores/events.ts` host fallback still exports `HstEvent`, events/unseen/addEvent/reset and uses actual caller-owned Pinia. No story selector or automatic variant watcher remains.
- Sandbox grid/item/virtual-grid, GenericMountStory/GenericRenderStory, ToolbarNewTab, CheckerboardPattern, runtime settings, shared state/docs/dynamic-source/mapping/story-component, host-channel/runtime-event ownership remain present.
- Current command prompts, BaseButton/BaseKeyboardShortcut, PulsatingDisc, overflow/popover, keyboard/select/scroll helpers remain present. SearchPanel uses current scoped command execution helper; registry and navigation remain mount/session-owned.
- `standalone/presets.ts` and explicit embed build input remain. Existing app Vite input paths, runtime preamble absolute imports and bundled mount/render/mapping declaration paths remain preserved for fresh-output gate.
- Variant-count style now lives in `packages/histoire-vue/src/styles/navigation.css`, scoped to native provider tree. `standalone/mount.ts` no longer imports retired stylesheet; main.pcss no longer imports transitions. Runtime/shared controls/prose/code/fonts/document/native CSS remain.
- Concurrent WorkbenchLoadingState/WorkbenchEmptyState/current shell state styles and AgentsSection loading coverage remain; old variant-panel loading store mocks were removed from `workbench-panel-loading.spec.ts`.

Source-audited migration results:

- `core-tests/log-event.spec.ts` now exercises actual compatibility Pinia histories/reset and retains cleaned fallback message proof; no legacy receiver import.
- `core-tests/embed/runtime-frame-requests.spec.ts` drives current frame source/origin/marker/document/target/request admission, including missing-origin rejection, timeout successor, navigation retirement and owner close. Legacy frame/runtime/message store suites/harness were removed. Current frame-selection suite retains source-owned state/actor cases.
- `core-tests/runtime-state-roundtrip.spec.ts` uses retained shared applyVariantStateUpdate/createVariantStateSyncGuards and util/state serialization; callback, array, metadata and unchanged-state suppression cases moved off retired synchronizer. Both old state-sync/roundtrip filenames were removed.
- Generated/runtime portions of controls-sandbox, story-variant-grid, preview-host-messaging and preview-runtime-invalidation suites remain; removed old source-path assertions no longer reference deleted components.
- `core-tests/workbench-icons.spec.ts` now imports shared icon registry. Controls compatibility suite retains BaseButton and tests current HstCheckbox/HstSelect; obsolete BaseSelect-specific extra emission was retired.
- `vue-tests/standalone-search.spec.ts` now mounts current SearchPanel while retaining live registry/navigation cases. `workbench-search-commands.spec.ts` covers direct parameters, dependent prompt defaults/answers/cancellation and current/retired command-error ownership. No CommandPalette import remains.
- Legacy dynamic-source-panel test/helper removed; current dynamic-source and mounted workbench-content-ownership coverage remain.

Source graph checks performed by ledger owner:

1. Every explicit removal row and both obsolete stylesheet paths is absent.
2. Scanned repository TypeScript/Vue/JavaScript/config/style source, tests and declarations, excluding generated dist, dependencies, lockfile and Git internals. Relative quoted paths resolve `.js` back to `.ts` or `.vue`; package bundled/source paths and `readAppSource('app/...')` references are resolved separately.
3. Found zero resolved quoted references to retired paths and zero exact candidate/generated subpath references in scanned source/test/config/asset files. Old story-canvas-view modules and shared/protocol preview-message types are distinct retained paths; name-prefix searches must not classify them as deleted-module imports.
4. Verified retained compatibility files, generated import source and native variant-count ownership directly. Scan record: `/tmp/histoire-ledger-final-scan.json`.

These checks establish source inventory/ownership only. Fresh build, emitted graph and packed consumer checks passed; parent records executed test/typecheck/browser/framework results and remaining acceptance limits in `implementation-validation.md`.
