<script lang="ts" setup>
import type { HstEvent } from '../../stores/events'
import type { Story, Variant } from '../../types'
import { applyState } from '@histoire/shared'
import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useEventsStore } from '../../stores/events'
import { usePreviewRuntimeStore } from '../../stores/preview-runtime'
import { usePreviewSettingsStore } from '../../stores/preview-settings'
import { EVENT_SEND, PREVIEW_SETTINGS_SYNC, PREVIEW_SYNC, SANDBOX_READY, STATE_SYNC, VARIANT_READY } from '../../util/const'
import { STORY_CHANGED_EVENT } from '../../util/hot'
import { getSandboxUrl } from '../../util/sandbox'
import { toRawDeep } from '../../util/state'
import StoryResponsivePreview from './StoryResponsivePreview.vue'

const props = defineProps<{
  story: Story
  variant: Variant
}>()

const settings = usePreviewSettingsStore().currentSettings
const previewRuntimeStore = usePreviewRuntimeStore()

const iframe = ref<HTMLIFrameElement>()
const iframeReloadKey = ref(0)

function syncState() {
  if (iframe.value && props.variant.previewReady) {
    iframe.value.contentWindow?.postMessage({
      type: STATE_SYNC,
      variantId: props.variant.id,
      state: toRawDeep(props.variant.state, true),
    }, window.location.origin)
  }
}

function syncPreview() {
  if (iframe.value?.contentWindow) {
    iframe.value.contentWindow.postMessage({
      type: PREVIEW_SYNC,
      storyId: props.story.id,
      variantId: props.variant.id,
      grid: false,
    }, window.location.origin)
  }
}

let synced = false

/**
 * Marks the current variant as waiting for a refreshed preview runtime.
 */
function markPreviewPending() {
  Object.assign(props.variant, {
    previewReady: false,
  })
}

/**
 * Forces a full iframe remount when a mocked story changes because the in-place
 * HMR path is not reliable for Vitest manual mocks.
 */
function reloadPreviewFrame() {
  isIframeLoaded.value = false
  iframeReloadKey.value++
}

watch(() => props.variant.state, () => {
  if (synced) {
    synced = false
    return
  }
  syncState()
}, {
  deep: true,
  immediate: true,
})

Object.assign(props.variant, {
  previewReady: false,
})

useEventListener(window, 'message', (event) => {
  if (!event.data?.__histoire || event.source !== iframe.value?.contentWindow) {
    return
  }

  switch (event.data.type) {
    case STATE_SYNC:
      synced = true
      applyState(props.variant.state, event.data.state)
      break
    case EVENT_SEND:
      useEventsStore().addEvent(event.data.event as HstEvent)
      break
    case SANDBOX_READY:
      if (event.data.variantId === props.variant.id) {
        Object.assign(props.variant, {
          previewReady: true,
        })
        syncState()
        syncSettings()
      }
      break
    case VARIANT_READY:
      if (event.data.variantId === props.variant.id) {
        Object.assign(props.variant, {
          previewReady: true,
        })
        syncState()
        syncSettings()
      }
      break
  }
})

const sandboxUrl = computed(() => getSandboxUrl(props.story, props.variant))
const isIframeLoaded = ref(false)

watch(sandboxUrl, () => {
  isIframeLoaded.value = false
  markPreviewPending()
})

function syncSettings() {
  if (iframe.value) {
    iframe.value.contentWindow?.postMessage({
      type: PREVIEW_SETTINGS_SYNC,
      settings: toRaw(settings),
    }, window.location.origin)
  }
}

watch(() => settings, () => {
  syncSettings()
}, {
  deep: true,
  immediate: true,
})

watch(() => [props.story.id, props.variant.id], () => {
  markPreviewPending()
  syncPreview()
}, {
  immediate: true,
})

if (import.meta.hot) {
  import.meta.hot.on(STORY_CHANGED_EVENT, ({ storyId, hasVitestMocks }) => {
    if (storyId !== props.story.id) {
      return
    }

    markPreviewPending()

    if (hasVitestMocks) {
      reloadPreviewFrame()
      return
    }

    syncPreview()
  })
}

onMounted(() => {
  previewRuntimeStore.setFrame('single', iframe.value ?? null)
})

onBeforeUnmount(() => {
  previewRuntimeStore.setFrame('single', null)
})

function onIframeLoad() {
  previewRuntimeStore.setFrame('single', iframe.value ?? null)
  isIframeLoaded.value = true
  syncPreview()
  syncState()
  syncSettings()
}
</script>

<template>
  <StoryResponsivePreview
    v-slot="{ isResponsiveEnabled, finalWidth, finalHeight, resizing }"
    class="histoire-story-variant-single-iframe"
    :variant="variant"
  >
    <iframe
      :key="iframeReloadKey"
      ref="iframe"
      :src="sandboxUrl"
      class="htw-w-full htw-h-full htw-relative"
      :class="{
        'htw-invisible': !isIframeLoaded,
        'htw-pointer-events-none': resizing,
      }"
      :style="isResponsiveEnabled ? {
        width: finalWidth ? `${finalWidth}px` : null,
        height: finalHeight ? `${finalHeight}px` : null,
      } : undefined"
      data-test-id="preview-iframe"
      @load="onIframeLoad()"
    />
  </StoryResponsivePreview>
</template>
