import { previewMessageHandler } from './message-handler.js'
import { previewPropsOverride } from './props-override.js'
import { previewRuntimeService } from './runtime-service.js'

/**
 * Emits the preview Vue app: the `setup()` that owns the current selection,
 * loads the story file, keeps the per-variant state watchers in sync with the
 * host, and the `render()` that picks between grid, single-variant and
 * controls-only modes.
 *
 * The inbound message dispatch is emitted by {@link previewMessageHandler} and
 * spliced into the middle of `setup()`.
 */
export function previewApp() {
  return `const app = createApp({
  name: 'VitestPreviewRuntime',
  setup() {
    const file = ref(null)
    const selection = reactive({ storyId: null, variantId: null, grid: false })
    const gridSelectedVariantId = ref(null)
    // Legacy standalone hosts omit the additive document-owned intent version.
    const initialGridVersion = new URLSearchParams(window.location.search).get('selectionVersion')
    let gridSelectionVersion = initialGridVersion !== null && Number.isSafeInteger(Number(initialGridVersion)) && Number(initialGridVersion) >= 0 ? Number(initialGridVersion) : undefined
    const previewSettingsStore = usePreviewSettingsStore()
    let mounted = false
    let selectionToken = 0
    const readyVariantIds = new Set()
    // Framework readiness precedes delayed state serialization; reload resync can span that wait.
    const frameworkReadyVariants = new WeakSet()
    // Hidden story mounting may initialize state for all variants. Pointer
    // admission belongs only to individually rendered actors that posted ready.
    const gridReadyVariantIds = reactive(new Set())
    const variantStateGuards = createVariantStateSyncGuards()
    const controlsRevision = createControlsStateRevision()
    const variantStateWatchStops = new Map()
    const story = computed(() => file.value?.story ?? null)
    const variant = computed(() => {
      const variantId = selection.grid ? (gridSelectedVariantId.value ?? selection.variantId) : selection.variantId
      return story.value?.variants.find(item => item.id === variantId) ?? null
    })

    function getVariantById(variantId) {
      return story.value?.variants.find(item => item.id === variantId) ?? null
    }

    function stopVariantStateWatchers() {
      for (const stop of variantStateWatchStops.values()) {
        stop()
      }

      readyVariantIds.clear()
      gridReadyVariantIds.clear()
      variantStateWatchStops.clear()
      variantStateGuards.reset()
    }

    function syncVariantStateWatchers(nextStory) {
      stopVariantStateWatchers()

      if (!nextStory) {
        return
      }

      for (const targetVariant of nextStory.variants) {
        const key = getVariantStateKey(nextStory.id, targetVariant.id)
        if (!key) {
          continue
        }

        const stop = watch(() => targetVariant.state, value => {
          // Consume BEFORE the ready gate: the host syncs state while the
          // variant is still pending, and returning early here would leave
          // that suppression armed — swallowing the first genuine in-story
          // mutation after ready (the Controls panel would miss it).
          if (variantStateGuards.consume(key)) {
            return
          }

          if (!readyVariantIds.has(targetVariant.id)) {
            return
          }
          if (initialSelection.matrix) return

          postToParent({
            type: STATE_SYNC,
            storyId: nextStory.id,
            variantId: targetVariant.id,
            state: toRawDeep(value, true),
            ...(initialSelection.controls ? { controlsRevision: controlsRevision.capture() } : {}),
          })
        }, {
          // Default (batched) flush so all key mutations of one applyState coalesce
          // into a single watcher firing that the single suppress/consume pairs with.
          // A sync flush would fire once per mutated key, leaking partial-state echoes.
          deep: true,
        })

        variantStateWatchStops.set(key, stop)
      }
    }

    async function waitForVariantSnapshot() {
      await nextTick()
      await nextTick()
      await new Promise(resolve => requestAnimationFrame(resolve))
    }

    /** A mounted actor can acknowledge restored intent without remounting its story state. */
    async function markVariantReady(variantId) {
      const currentFile = file.value
      const currentSelection = previewSelectionVersion
      const targetVariant = getVariantById(variantId)
      if (!targetVariant) return
      frameworkReadyVariants.add(targetVariant)
      await waitForVariantSnapshot()
      if (file.value !== currentFile) return
      if (!selection.grid && (currentSelection !== previewSelectionVersion || variantId !== selection.variantId)) return
      getRuntimeState(targetVariant).capture()
      getRuntimePresets(targetVariant).restoreSelected()
      reapplyPropsOverride(variantId)
      readyVariantIds.add(variantId)
      postVariantStateSnapshotById(story.value, variantId)
      postToParent({ type: VARIANT_READY, storyId: story.value?.id, variantId })
      gridReadyVariantIds.add(variantId)
      runtimeLayout.refresh()
    }

    async function syncSelection(nextSelection) {
      const token = ++selectionToken
      if (selection.storyId !== nextSelection.storyId || selection.variantId !== nextSelection.variantId) clearPropsOverrides()
      selection.storyId = nextSelection.storyId ?? null
      selectionState.storyId = selection.storyId
      selection.variantId = nextSelection.variantId ?? null
      selection.grid = !!nextSelection.grid
      gridSelectedVariantId.value = nextSelection.variantId ?? null
      clearRuntimeTestDefinitions()
      if (!selection.storyId) {
        stopVariantStateWatchers()
        file.value = null
        return
      }

      let nextFile
      try {
        nextFile = await loadStoryFile(selection.storyId)
      }
      catch (error) {
        // Unknown story: the baked metadata predates the latest collection
        // (e.g. a story file added while this iframe was running).
        if (attemptStaleRuntimeReload(\`story:\${selection.storyId}\`)) {
          return
        }
        throw error
      }

      if (selectionToken === token) {
        const hasUnknownVariant = selection.variantId
          && !nextFile.story.variants.some(item => item.id === selection.variantId)

        if (hasUnknownVariant) {
          // Unknown variant on a known story: same staleness, same recovery.
          if (attemptStaleRuntimeReload(\`variant:\${selection.storyId}:\${selection.variantId}\`)) {
            return
          }
          // The reload was declined (already attempted for this selection, so
          // the variant is genuinely gone): the guard must stay armed, or the
          // next PREVIEW_SYNC would reload the whole iframe all over again.
        }
        else {
          clearStaleRuntimeReloadGuard()
        }

        file.value = nextFile
        syncVariantStateWatchers(nextFile.story)
        await nextTick()
      }
    }

${previewRuntimeService()}

${previewPropsOverride()}

${previewMessageHandler()}

    onMounted(() => {
      mounted = true
      if (initialSelection.storyId) {
        // Wait for the initial selection to load before announcing readiness so
        // the host receives the resolved variantId, not a stale null.
        void syncSelection(initialSelection).then(() => {
          postToParent({ type: SANDBOX_READY, storyId: story.value?.id, variantId: variant.value?.id })
        }).catch(error => { renderRuntimeError(error) })
      }
      else {
        postToParent({ type: SANDBOX_READY, storyId: story.value?.id, variantId: variant.value?.id })
      }
    })

    return {
      file,
      story,
      variant,
      selection,
      gridReadyVariantIds,
      selectGridVariant(variantId) {
        if (!gridReadyVariantIds.has(variantId)) return
        if (gridSelectedVariantId.value === variantId) return
        gridSelectedVariantId.value = variantId
        postToParent({ type: SELECT_VARIANT, storyId: story.value?.id, variantId, ...(gridSelectionVersion === undefined ? {} : { selectionVersion: gridSelectionVersion }) })
      },
      markVariantReady,
      async markControlsReady(variantId) {
        await waitForVariantSnapshot()
        // Enable outbound edit sync WITHOUT pushing the boot state snapshot:
        // This controls replica never publishes boot defaults: primary preview
        // runtime owns state. Host relays its latest serializable mirror after
        // both runtimes report ready.
        readyVariantIds.add(variantId)
        const activeVariant = getVariantById(variantId)
        const hasControls = Boolean(
          activeVariant?.slots?.().controls || story.value?.slots?.().controls,
        )
        postToParent({ type: CONTROLS_READY, storyId: story.value?.id, variantId, hasControls })
        observeControlsResize()
      },
      async syncMountedStoryVariants() {
        await waitForVariantSnapshot()

        for (const targetVariant of story.value?.variants ?? []) {
          readyVariantIds.add(targetVariant.id)
          postVariantStateSnapshotById(story.value, targetVariant.id)
        }
      },
    }
  },
  render() {
    const renderedVariantId = this.variant?.id
    if (!this.story) {
      return null
    }

    if (initialSelection.controls) {
      return this.variant
        ? h(PreviewControlsCapture, {
          key: \`\${this.story.id}:\${this.variant.id}\`,
          story: this.story,
          variant: this.variant,
          onReady: () => this.markControlsReady(this.variant.id),
        })
        : null
    }

    return [
      this.selection.grid
        ? h('div', { class: 'htw-sandbox-hidden' }, [h(GenericMountStory, {
          key: this.story.id,
          story: this.story,
          onReady: this.syncMountedStoryVariants,
        })])
        : null,
      this.selection.grid
        ? h(StoryVariantGridSandbox, {
          story: this.story,
          variant: this.variant,
          readyVariantIds: this.gridReadyVariantIds,
          onSelect: this.selectGridVariant,
          onReady: this.markVariantReady,
        })
        : this.variant
          ? h(PreviewTestCapture, {
            story: this.story,
            variant: this.variant,
            onReady: () => this.markVariantReady(renderedVariantId),
          })
          : null,
    ]
  },
})`
}
