# File inventory and ownership

Snapshot: source inspected 2026-10-07. This is an implementation manifest, not an unconditional directory-deletion instruction. Slice 01 refreshes all consumers, including generated code, test fixtures, build inputs, and concurrent edits, then records exact disposition.

## Remove in slice 03: old route/view/panel/state chain

`app/` candidates:

```text
router.ts
components/HomeView.vue
components/story/StoryView.vue
components/story/StoryViewer.vue
components/story/StoryVariantSingle.vue
components/story/StoryVariantSingleView.vue
components/story/StoryVariantSingleIframe.vue
components/story/StoryVariantGrid.vue
components/story/StoryVariantListItem.vue
components/story/StoryResponsivePreview.vue
components/panel/StorySidePanel.vue
components/panel/PaneTabs.vue
components/panel/StoryControls.vue
components/panel/StoryControlsSandboxIframe.vue
components/panel/StoryControlsOverlay.vue
components/panel/ControlsComponentProps.vue
components/panel/ControlsComponentPropItem.vue
components/panel/ControlsComponentState.vue
components/panel/ControlsComponentStateItem.vue
components/panel/StatePresets.vue
components/panel/StoryDocs.vue
components/panel/StoryEvents.vue
components/panel/StoryEvent.vue
components/panel/StoryTests.vue
components/panel/StoryTestItem.vue
components/panel/StoryTestErrorItem.vue
components/panel/StorySourceCode.vue
stores/story.ts
stores/folder.ts
stores/tests.ts
stores/test-collection.ts
stores/tests-utils.ts
stores/preview-runtime.ts
util/preview-iframe-host.ts
util/preview-iframe-host-types.ts
components/tree/StoryGroup.vue
components/tree/StoryList.vue
components/tree/StoryListFolder.vue
components/tree/StoryListItem.vue
```

Modify, **retain**: `util/events.ts`, `stores/events.ts` per client-event contract. `HstEvent` must remain available to the lazy compatibility fallback.

Slice 03 must detach old search/command imports of `router.ts`/`stores/story.ts` before removing those dependencies. It therefore owns the dependency-detachment subset below; slice 04 owns the orphaned remainder. No later slice is required to repair broken imports.

**Slice 03 dependency-detachment subset:** delete `components/search/SearchPane.vue`, `components/app/Breadcrumb.vue`, and `util/commands.ts` together with their now-invalid importer edges: `SearchModal.vue`/`CommandPromptsModal.vue` and `stores/command.ts`. Their dependent old-only children are finalized in slice 04. Slice 03 first migrates command/search coverage needed for this subset using slice 04's test procedure. No broken importer is left for a later slice.

## Remove in slice 04: old shell/search leaves and intermediate dialog

The dependency-detachment subset and old tree/folder chain above belong to slice 03, **not** edited independently by slice 04. Slice 04 deletes remaining candidates:

```text
components/app/AppHeader.vue
components/app/AppLogo.vue
components/app/HomeCounter.vue
components/app/InitialLoading.vue
components/app/MobileOverlay.vue
components/search/SearchLoading.vue
components/search/SearchItem.vue
components/search/SearchItemContent.vue
components/search/result-factories.ts
components/search/search-title-data.ts
components/search/search-docs-data.ts
components/search/types.ts
standalone/Header.vue
standalone/CommandPalette.ts
```

`HomeCounter.vue` is also imported by removed `HomeView`; verify no new current consumer was added. `InitialLoading.vue` may gain concurrent usage: keep if current startup uses it. Current workbench loading states are not cleanup candidates.

Retain `components/command/{CommandPrompts,PromptText,PromptSelect}.vue`, `standalone/{commands,client-actions,folders,navigation}.ts`, `util/builtin-commands.ts`, and all current `components/panes/`.

## Remove in slice 05: old toolbar, primitives, helpers

Candidates, after consumer refresh:

```text
components/toolbar/ToolbarResponsiveSize.vue
components/toolbar/ToolbarBackground.vue
components/toolbar/ToolbarTitle.vue
components/toolbar/ToolbarTextDirection.vue
components/toolbar/DevOnlyToolbarOpenInEditor.vue
components/base/BaseCheckbox.vue
components/base/BaseCopyIcon.vue
components/base/BaseEmpty.vue
components/base/BaseListItem.vue
components/base/BaseListItemLink.vue
components/base/BaseOverflowMenu.vue
components/base/BaseOverflowTab.vue
components/base/BaseSelect.vue
components/base/BaseSplitPane.vue
components/base/BaseTab.vue
components/base/BaseTag.vue
components/base/router-link-props.ts
util/dynamic-source-panel.ts
util/preview-state-sync.ts
util/preview-request.ts
util/preview-message.ts
util/variant.ts
util/responsive.ts
util/tooltip.ts
util/icons.ts
```

`preview-message.ts`/`preview-request.ts` have security/correlation tests; do not delete valuable behavior proof until counterpart current-adapter coverage is accepted. `util/icons.ts` is a compatibility re-export currently consumed by icon tests; migrate tests to shared public registry and verify no shipped consumer before removal.

Retain:

- `components/toolbar/ToolbarNewTab.vue`: sandbox grid action.
- `components/base/{BaseButton,BaseKeyboardShortcut}.vue`: current command prompts.
- `components/base/PulsatingDisc.vue`: current loaders/status rows.
- `components/base/overflow/*`, `components/base/popover/*`: current toolbar geometry/overlay lifecycle; `overflow/fit.ts` also remains a live helper.
- `util/{keyboard,select,scroll}.ts`: command prompt keys/selections and sandbox scrolling. Dead exports inside a retained helper may be removed only after exhaustive consumer search; do not rewrite the helper unnecessarily.
- `util/{docs,dynamic-source,story-component,mapping,hot,variant-selection}.ts`: runtime/source/current command/test or navigation consumers.
- `util/{const,config,dark,state,preview-settings,background,event-payload,runtime-events,host-channel,controls-document}.ts`: runtime and current SDK/workbench contracts.

## Slice 06: styles and build sources

- `standalone/style.css`: remove obsolete header/search/dialog/home selectors; retain `.histoire-story-variant-count` until its native tree consumer is addressed. Prefer moving this live rule to the owning native style source, then removing the obsolete file/import together.
- `style/main.pcss`: inspect each legacy utility rule, not the entire file. Preserve shared controls/prose/runtime rules and import order.
- `style/transitions.pcss`: inspect each transition name against current Vue/native/runtime usage. Retain live transitions.
- `style/sandbox.css`, `style/document.pcss`, `style/controls.css`: consumer audit only; these may be loaded through aliases/copied assets rather than imports.
- `vite.config.ts`, `vite.embed.config.ts`, `scripts/{copy,watchAndCopy,asset-path}.mjs`: audit required outputs and stale watch artifacts. Change only when evidence establishes a cleanup defect.
- `app/style/README.md`, `plans/ui-redesign/architecture.md`: update current ownership/module references after removal. Preserve historical execution records.

## Protected generated and external consumers

- `packages/histoire/src/node/virtual/preview-runtime/{preamble,app,components}.ts`.
- `packages/histoire/src/node/virtual/variant-test-mount.ts` and `histoire-app-bundled.d.ts` in the same folder.
- `packages/histoire/src/node/{alias.ts,util/resolve-histoire-app.ts}`.
- App Vite inputs, copied source assets, source-development entry bundles, and embed library entries.
- `packages/histoire-app/src/embed/adapters/`, native `packages/histoire-vue/src/`, framework support plugins, example story imports, fixtures, package consumers.
- `standalone/presets.ts` and its explicit embed build entry: retain even if ordinary source-import traversal reports no consumer.

## Evidence ledger for slice 01

Create `consumer-ledger.md` during implementation with one row per candidate group or file where consumers differ:

| Path | Runtime/current/test/build consumers | Disposition | Owner slice | Replacement proof |
| --- | --- | --- | --- | --- |
| `app/router.ts` | URL helper; story store; old commands | Remove after detachment | 03 | URL/base cases and current route suite |
| `app/stores/events.ts` | Public non-sandbox `logEvent` | Retain, decouple selection | 03 | Real Pinia fallback and runtime event tests |
| `app/standalone/presets.ts` | Explicit embed entry/generated runtime | Retain | 07 verifies | Preset storage consumer suite |

No speculative dead-code count or bundle-byte claim. Mark unknown consumers explicitly; inspect before deleting. Tests alone are not runtime consumers, but may preserve useful contracts.
