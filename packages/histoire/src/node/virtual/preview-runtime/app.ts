import { previewMessageHandler } from './message-handler.js'

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
    const previewSettingsStore = usePreviewSettingsStore()
    let mounted = false
    let selectionToken = 0
    const readyVariantIds = new Set()
    const variantStateGuards = createVariantStateSyncGuards()
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

          postToParent({
            type: STATE_SYNC,
            storyId: nextStory.id,
            variantId: targetVariant.id,
            state: toRawDeep(value, true),
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

    async function syncSelection(nextSelection) {
      const token = ++selectionToken
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

${previewMessageHandler()}

    onMounted(() => {
      mounted = true
      if (initialSelection.storyId) {
        // Wait for the initial selection to load before announcing readiness so
        // the host receives the resolved variantId, not a stale null.
        void syncSelection(initialSelection).then(() => {
          postToParent({ type: SANDBOX_READY, storyId: story.value?.id, variantId: variant.value?.id })
        })
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
      selectGridVariant(variantId) {
        gridSelectedVariantId.value = variantId
        postToParent({ type: SELECT_VARIANT, variantId })
      },
      async markVariantReady(variantId) {
        await waitForVariantSnapshot()
        readyVariantIds.add(variantId)
        postVariantStateSnapshotById(story.value, variantId)
        postToParent({ type: VARIANT_READY, storyId: story.value?.id, variantId })
      },
      async markControlsReady(variantId) {
        await waitForVariantSnapshot()
        // Enable outbound edit sync WITHOUT pushing the boot state snapshot:
        // with a second iframe, the preview frame's state (already held by
        // the host) is authoritative — posting this frame's defaults would
        // reset it. The host replies to CONTROLS_READY with the full state.
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
          onSelect: this.selectGridVariant,
          onReady: this.markVariantReady,
        })
        : this.variant
          ? h(PreviewTestCapture, {
            story: this.story,
            variant: this.variant,
            onReady: () => this.markVariantReady(this.variant.id),
          })
          : null,
    ]
  },
})`
}
