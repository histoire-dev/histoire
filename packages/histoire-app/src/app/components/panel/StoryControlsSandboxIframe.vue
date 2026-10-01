<script lang="ts" setup>
import type { HistoireInboundPreviewMessage, HistoireStateSyncMessage } from '@histoire/shared'
import type { PropType } from 'vue'
import type { Story, Variant } from '../../types'
import { applyVariantStateUpdate, createVariantStateSyncGuards, getVariantStateKey } from '@histoire/shared'
import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useControlsHost } from '../../composables/controls-host'
import { CONTROLS_READY, CONTROLS_RESIZE, STATE_SYNC } from '../../util/const'
import { STORY_CHANGED_EVENT } from '../../util/hot'
import { isTrustedPreviewFrameMessage } from '../../util/preview-message'
import { getSandboxUrl } from '../../util/sandbox'
import { toRawDeep } from '../../util/state'
import StoryControlsOverlay from './StoryControlsOverlay.vue'

/**
 * Renders every story's custom `#controls` slot inside a dedicated sandbox
 * iframe. Story runtime APIs and non-serializable local state stay in an iframe;
 * host acts as serializable relay between primary preview and controls replica.
 */
const props = defineProps({
  story: {
    type: Object as PropType<Story>,
    required: true,
  },

  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },
})

const emit = defineEmits<{
  (event: 'info', payload: { hasControls: boolean }): void
}>()

const iframe = ref<HTMLIFrameElement | null>(null)
const controlsHost = useControlsHost(iframe, props)
const { overlay } = controlsHost
const iframeReloadKey = ref(0)
const height = ref(0)
const controlsReady = ref(false)

// The parent keys this component by story+variant, so both ids are stable for
// this component instance's lifetime.
const sandboxUrl = computed(() => `${getSandboxUrl(props.story, props.variant)}&controls=true`)
const stateKey = getVariantStateKey(props.story.id, props.variant.id)

const guards = createVariantStateSyncGuards()

/** Seeds controls replica from primary preview's host mirror when both are ready. */
function syncState() {
  if (!controlsReady.value || !props.variant.previewReady) {
    return
  }
  const message: HistoireStateSyncMessage & { __histoire: true } = {
    // The sandbox runs the preview runtime, which drops inbound messages
    // without this marker.
    __histoire: true,
    type: STATE_SYNC,
    storyId: props.story.id,
    variantId: props.variant.id,
    state: toRawDeep(props.variant.state, true),
  }
  iframe.value?.contentWindow?.postMessage(message, window.location.origin)
}

useEventListener(window, 'message', (event) => {
  // Both the posting window and its origin must match our own sandbox frame.
  if (!isTrustedPreviewFrameMessage(event, iframe.value)) {
    return
  }

  const message = event.data as HistoireInboundPreviewMessage

  // The iframe keeps the same window across navigations: a message from the
  // document of another story must not reach this one (see preview-iframe-host).
  if (message.storyId && message.storyId !== props.story.id) {
    return
  }

  if (controlsHost.handleMessage(message)) return

  switch (message.type) {
    case CONTROLS_READY: {
      controlsReady.value = true
      void controlsHost.syncAppearance()
      emit('info', { hasControls: !!message.hasControls })
      // Primary preview's latest serializable mirror seeds this replica. Never
      // seed before primary runtime reports ready: host boot state is stale.
      syncState()
      break
    }
    case CONTROLS_RESIZE: {
      if (Number.isFinite(message.height)) height.value = Math.max(0, Math.ceil(message.height))
      break
    }
    case STATE_SYNC: {
      if (message.variantId !== props.variant.id) {
        return
      }

      applyVariantStateUpdate({
        storyId: props.story.id,
        variantId: message.variantId,
        state: message.state,
        getVariantById: variantId => (variantId === props.variant.id ? props.variant : null),
        guards,
      })
      break
    }
  }
})

watch(() => [props.variant.state, props.variant.previewReady], () => {
  // Consume before the ready gate so a pre-ready host sync cannot leave a
  // suppression armed (same ordering as the preview runtime watcher).
  if (guards.consume(stateKey)) {
    return
  }

  if (!controlsReady.value || !props.variant.previewReady) {
    return
  }

  syncState()
}, {
  deep: true,
})

if (import.meta.hot) {
  // Vite hot listeners live for the module's lifetime — without the matching
  // `off` on unmount, every story navigation leaks one handler closing over
  // this unmounted instance.
  const onStoryChanged = ({ storyId }: { storyId?: string }) => {
    if (storyId !== props.story.id) {
      return
    }

    // Mocked stories force a clean preview boot on change; the controls
    // sandbox re-executes the story too, so give it the same treatment.
    controlsReady.value = false
    controlsHost.closeOverlay()
    height.value = 0
    iframeReloadKey.value++
  }
  import.meta.hot.on(STORY_CHANGED_EVENT, onStoryChanged)
  onBeforeUnmount(() => {
    import.meta.hot?.off(STORY_CHANGED_EVENT, onStoryChanged)
  })
}
</script>

<template>
  <div>
    <iframe
      :key="iframeReloadKey"
      ref="iframe"
      :src="sandboxUrl"
      :title="`Custom controls for ${story.title}`"
      :style="{ height: `${height}px` }"
      class="histoire-story-controls-sandbox htw-block htw-w-full htw-border-none"
      data-test-id="story-controls-sandbox"
    />
    <StoryControlsOverlay
      v-if="overlay"
      :key="overlay.id"
      :request="overlay"
      @close="controlsHost.resolveOverlay"
    />
  </div>
</template>
