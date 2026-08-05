import type { HistoireHostMessage, HistoireInboundPreviewMessage } from '@histoire/shared'
import type { HstEvent } from '../stores/events'
import type { Story, Variant } from '../types'
import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useEventsStore } from '../stores/events'
import { usePreviewRuntimeStore } from '../stores/preview-runtime'
import { usePreviewSettingsStore } from '../stores/preview-settings'
import {
  EVENT_SEND,
  PREVIEW_SETTINGS_SYNC,
  PREVIEW_SYNC,
  SANDBOX_READY,
  SELECT_VARIANT,
  STATE_SYNC,
  VARIANT_READY,
} from './const'
import { STORY_CHANGED_EVENT } from './hot'
import { isTrustedPreviewFrameMessage } from './preview-message'
import { createPreviewStateSync } from './preview-state-sync'
import { getSandboxUrl } from './sandbox'

/** Preview slot this host owns in the preview runtime store. */
export type PreviewIframeMode = 'single' | 'grid'

export interface PreviewIframeHostOptions {
  /**
   * Which preview the host owns. Drives the store slot, the `grid` flag of
   * PREVIEW_SYNC and whether the sandbox URL is pinned to one variant.
   */
  mode: PreviewIframeMode
  /**
   * Story currently shown. May be nullish while navigating away (the grid reads
   * it from the story store, which is cleared before the component unmounts).
   */
  getStory: () => Story | null | undefined
  /** Variant the host currently shows, or nullish when none is selected. */
  getCurrentVariant: () => Variant | null | undefined
  /** Resolves one variant of the current story by id, for messages from the frame. */
  getVariantById: (variantId: string) => Variant | null | undefined
  /**
   * Marks the variants this host owns as awaiting a refreshed preview runtime.
   * Single mode owns one variant, grid mode owns every variant of the story.
   */
  markPreviewPending: () => void
  /**
   * Handles a variant selection made inside the preview document (grid only).
   * Providing it also enables the outbound half: a selection change is then
   * pushed into the running iframe instead of remounting it. Omit it for hosts
   * pinned to a single variant, which swap the sandbox URL instead.
   */
  onSelectVariant?: (variantId: string) => void
  /**
   * Also runs the sandbox-url watcher at setup, announcing the imminent
   * navigation to the preview runtime store when a host remounts while a
   * request is still in flight. Aborting with nothing in flight is a no-op.
   */
  resetOnMount?: boolean
}

/**
 * Hosts a Histoire preview iframe: owns the sandbox URL, the postMessage
 * protocol with the preview runtime inside it, and the readiness bookkeeping
 * both the grid and the single-variant views rely on.
 *
 * Must be called from a component `setup()` — it registers lifecycle hooks that
 * publish the frame to the preview runtime store.
 */
export function usePreviewIframeHost(options: PreviewIframeHostOptions) {
  const settings = usePreviewSettingsStore().currentSettings
  const previewRuntimeStore = usePreviewRuntimeStore()

  const iframe = ref<HTMLIFrameElement>()
  /** Bumping it re-keys the iframe element, forcing a clean document mount. */
  const iframeReloadKey = ref(0)
  const isIframeLoaded = ref(false)

  const stateSync = createPreviewStateSync({
    getStoryId: () => options.getStory()?.id,
    getCurrentVariant: () => options.getCurrentVariant(),
    getVariantById: variantId => options.getVariantById(variantId),
    postMessage: payload => postToFrame(payload),
  })

  /**
   * Posts one message to the preview document, if a frame is attached. Always
   * to our own origin (the sandbox is same-origin by construction, see
   * `getSandboxUrl`), and always carrying the `__histoire` marker the preview
   * runtime requires before dispatching.
   */
  function postToFrame(payload: HistoireHostMessage) {
    iframe.value?.contentWindow?.postMessage({
      __histoire: true,
      ...payload,
    }, window.location.origin)
  }

  /** Sends the host's copy of the current variant state to the preview. */
  function syncState() {
    stateSync.syncCurrentVariantState()
  }

  /** Sends the preview settings (background, text direction…) to the preview. */
  function syncSettings() {
    postToFrame({
      type: PREVIEW_SETTINGS_SYNC,
      settings: toRaw(settings),
    })
  }

  /** Tells the preview which story/variant it should be showing. */
  function syncPreview() {
    const story = options.getStory()
    if (!story) {
      return
    }

    postToFrame({
      type: PREVIEW_SYNC,
      storyId: story.id,
      variantId: options.getCurrentVariant()?.id ?? null,
      grid: options.mode === 'grid',
    })
  }

  /**
   * Forces a full iframe remount. Used when the in-place HMR path is not
   * reliable (Vitest manual mocks) or when the baked variant list went stale.
   */
  function reloadPreviewFrame() {
    isIframeLoaded.value = false
    iframeReloadKey.value++
  }

  /** Flags a booted variant, seeding host state + settings when it is the shown one. */
  function markVariantReady(variantId: string | null | undefined) {
    if (!variantId) {
      return
    }

    const variant = options.getVariantById(variantId)
    if (!variant) {
      return
    }

    Object.assign(variant, {
      previewReady: true,
    })

    if (options.getCurrentVariant()?.id === variant.id) {
      syncState()
      syncSettings()
    }
  }

  // Variant objects survive navigation (`previewReady` is copied across story
  // remaps), so a fresh host would otherwise start with stale-true readiness
  // while its iframe loads — test collection would post into a dead frame.
  options.markPreviewPending()

  watch(() => options.getCurrentVariant()?.state, () => {
    if (stateSync.shouldSkipCurrentVariantSync()) {
      return
    }

    syncState()
  }, {
    deep: true,
    immediate: true,
  })

  useEventListener(window, 'message', (event) => {
    // Both the posting window and its origin must match our own preview frame.
    if (!isTrustedPreviewFrameMessage(event, iframe.value)) {
      return
    }

    const message = event.data as HistoireInboundPreviewMessage

    // Navigating the iframe reuses the same window, so a document being torn
    // down still passes the trust check above: a late readiness or state
    // message from it would flip `previewReady` for the story we just left
    // (racing test collection into a navigating frame) or apply its state to a
    // same-id variant of the new story. Messages carry the story they belong to.
    if (message.storyId && message.storyId !== options.getStory()?.id) {
      return
    }

    switch (message.type) {
      case STATE_SYNC:
        stateSync.applyIncomingState(message.variantId, message.state)
        break
      case EVENT_SEND:
        useEventsStore().addEvent(message.event as HstEvent)
        break
      // Both readiness events carry the id of the variant that actually booted:
      // in grid mode that is not necessarily the selected one.
      case SANDBOX_READY:
      case VARIANT_READY:
        markVariantReady(message.variantId)
        break
      case SELECT_VARIANT:
        options.onSelectVariant?.(message.variantId)
        break
    }
  })

  const sandboxUrl = computed(() => {
    const story = options.getStory()
    if (!story) {
      // Navigating away from a story clears it before this host unmounts, and
      // the eager watcher below re-evaluates the computed: never dereference it.
      return null
    }

    // The grid document holds every variant at once; single mode pins the URL to
    // the selected variant so switching variants loads a fresh document.
    return options.mode === 'grid' ? getSandboxUrl(story) : getSandboxUrl(story, options.getCurrentVariant() ?? undefined)
  })

  watch(sandboxUrl, () => {
    // The iframe is navigating to a fresh document. Syncing is deliberately NOT
    // re-issued here: PREVIEW_SYNC would hit the OUTGOING document, whose dying
    // runtime answers SANDBOX_READY and prematurely flips previewReady=true —
    // racing test collection into a torn-down frame. `onIframeLoad` re-issues
    // everything once the new document is live.
    isIframeLoaded.value = false
    stateSync.reset()
    options.markPreviewPending()
    // Navigation reuses the iframe element and only swaps `src`, so the preview
    // runtime store sees no frame change: tell it explicitly, otherwise requests
    // only the outgoing document could answer stall until their reply timeout.
    previewRuntimeStore.notifyFrameNavigating()
  }, {
    immediate: !!options.resetOnMount,
  })

  watch(() => settings, () => {
    syncSettings()
  }, {
    deep: true,
    immediate: true,
  })

  if (options.onSelectVariant) {
    // Grid mode negotiates the selection with the running document instead of
    // reloading it, so the other variants keep their live state.
    watch(() => options.getCurrentVariant()?.id, (variantId) => {
      if (!variantId) {
        return
      }

      postToFrame({
        type: SELECT_VARIANT,
        variantId,
      })
    })
  }

  if (import.meta.hot) {
    // Vite hot listeners live for the module's lifetime — without the matching
    // `off` on unmount, every story navigation leaks one handler closing over
    // this unmounted instance.
    const onStoryChanged = ({ storyId, hasVitestMocks }: { storyId?: string, hasVitestMocks?: boolean }) => {
      if (storyId !== options.getStory()?.id) {
        return
      }

      options.markPreviewPending()

      if (hasVitestMocks) {
        // Mock HMR is less reliable than a clean preview boot.
        reloadPreviewFrame()
        return
      }

      syncPreview()
    }
    import.meta.hot.on(STORY_CHANGED_EVENT, onStoryChanged)
    onBeforeUnmount(() => {
      import.meta.hot?.off(STORY_CHANGED_EVENT, onStoryChanged)
    })
  }

  onMounted(() => {
    previewRuntimeStore.setFrame(options.mode, iframe.value ?? null)
  })

  onBeforeUnmount(() => {
    previewRuntimeStore.setFrame(options.mode, null)
  })

  /** `@load` handler of the hosted iframe: the new document is now live. */
  function onIframeLoad() {
    previewRuntimeStore.setFrame(options.mode, iframe.value ?? null)
    isIframeLoaded.value = true
    syncPreview()
    syncState()
    syncSettings()
  }

  return {
    iframe,
    iframeReloadKey,
    isIframeLoaded,
    sandboxUrl,
    onIframeLoad,
    reloadPreviewFrame,
  }
}
