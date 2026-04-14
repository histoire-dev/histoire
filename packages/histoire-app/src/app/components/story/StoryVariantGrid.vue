<script lang="ts" setup>
import type { HstEvent } from '../../stores/events'
import { useEventListener } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEventsStore } from '../../stores/events'
import { usePreviewRuntimeStore } from '../../stores/preview-runtime'
import { usePreviewSettingsStore } from '../../stores/preview-settings'
import { useStoryStore } from '../../stores/story'
import { EVENT_SEND, PREVIEW_SETTINGS_SYNC, PREVIEW_SYNC, SANDBOX_READY, SELECT_VARIANT, STATE_SYNC, VARIANT_READY } from '../../util/const'
import { STORY_CHANGED_EVENT } from '../../util/hot'
import { createPreviewStateSync } from '../../util/preview-state-sync'
import { isMobile } from '../../util/responsive'
import { getSandboxUrl } from '../../util/sandbox'
import DevOnlyToolbarOpenInEditor from '../toolbar/DevOnlyToolbarOpenInEditor.vue'
import ToolbarBackground from '../toolbar/ToolbarBackground.vue'
import ToolbarTextDirection from '../toolbar/ToolbarTextDirection.vue'

const storyStore = useStoryStore()
const router = useRouter()
const route = useRoute()
const settings = usePreviewSettingsStore().currentSettings
const previewRuntimeStore = usePreviewRuntimeStore()
const iframe = ref<HTMLIFrameElement>()
const iframeReloadKey = ref(0)
const isIframeLoaded = ref(false)

const stateSync = createPreviewStateSync({
  getStoryId: () => storyStore.currentStory?.id,
  getCurrentVariant: () => storyStore.currentVariant,
  getVariantById: variantId => storyStore.getCurrentStoryVariantById(variantId),
  postMessage: (payload) => {
    iframe.value?.contentWindow?.postMessage(payload, window.location.origin)
  },
})

function syncState() {
  stateSync.syncCurrentVariantState()
}

function syncPreview() {
  if (iframe.value?.contentWindow && storyStore.currentStory) {
    iframe.value.contentWindow.postMessage({
      type: PREVIEW_SYNC,
      storyId: storyStore.currentStory.id,
      variantId: storyStore.currentVariant?.id ?? null,
      grid: true,
    }, window.location.origin)
  }
}

/**
 * Marks every variant in the current story as waiting for a refreshed preview.
 */
function markStoryPreviewPending() {
  if (!storyStore.currentStory) {
    return
  }

  for (const variant of storyStore.currentStory.variants) {
    Object.assign(variant, {
      previewReady: false,
    })
  }
}

/**
 * Forces a fresh iframe mount when the active story uses Vitest mocks because
 * mock HMR is less reliable than a clean preview boot.
 */
function reloadPreviewFrame() {
  isIframeLoaded.value = false
  iframeReloadKey.value++
}

watch(() => storyStore.currentVariant?.state, () => {
  if (stateSync.shouldSkipCurrentVariantSync()) {
    return
  }

  syncState()
}, {
  deep: true,
  immediate: true,
})

useEventListener(window, 'message', (event) => {
  if (!event.data?.__histoire || event.source !== iframe.value?.contentWindow) {
    return
  }

  switch (event.data.type) {
    case STATE_SYNC: {
      stateSync.applyIncomingState(event.data.variantId, event.data.state)
      break
    }
    case EVENT_SEND:
      useEventsStore().addEvent(event.data.event as HstEvent)
      break
    case SANDBOX_READY:
      if (!event.data.variantId) {
        break
      }

      {
        const variant = storyStore.getCurrentStoryVariantById(event.data.variantId)
        if (!variant) {
          break
        }

        Object.assign(variant, {
          previewReady: true,
        })

        if (storyStore.currentVariant?.id === variant.id) {
          syncState()
          syncSettings()
        }
      }
      break
    case VARIANT_READY: {
      const variant = storyStore.getCurrentStoryVariantById(event.data.variantId)
      if (variant) {
        Object.assign(variant, {
          previewReady: true,
        })
        if (storyStore.currentVariant?.id === variant.id) {
          syncState()
          syncSettings()
        }
      }
      break
    }
    case SELECT_VARIANT:
      router.push({
        query: {
          ...route.query,
          variantId: event.data.variantId,
        },
      })
      break
  }
})

const sandboxUrl = computed(() => getSandboxUrl(storyStore.currentStory))

watch(sandboxUrl, () => {
  isIframeLoaded.value = false
  stateSync.reset()
  markStoryPreviewPending()
})

watch(() => storyStore.currentStory?.id, () => {
  syncPreview()
}, {
  immediate: true,
})

watch(() => storyStore.currentVariant?.id, (variantId) => {
  if (!iframe.value?.contentWindow || !variantId) {
    return
  }

  iframe.value.contentWindow.postMessage({
    type: SELECT_VARIANT,
    variantId,
  }, window.location.origin)
})

if (import.meta.hot) {
  import.meta.hot.on(STORY_CHANGED_EVENT, ({ storyId, hasVitestMocks }) => {
    if (storyId !== storyStore.currentStory?.id) {
      return
    }

    markStoryPreviewPending()

    if (hasVitestMocks) {
      reloadPreviewFrame()
      return
    }

    syncPreview()
  })
}

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

onMounted(() => {
  previewRuntimeStore.setFrame('grid', iframe.value ?? null)
})

onBeforeUnmount(() => {
  previewRuntimeStore.setFrame('grid', null)
})

function onIframeLoad() {
  previewRuntimeStore.setFrame('grid', iframe.value ?? null)
  isIframeLoaded.value = true
  syncPreview()
  syncState()
  syncSettings()
}
</script>

<template>
  <div class="histoire-story-variant-grid htw-flex htw-flex-col htw-items-stretch htw-h-full __histoire-pane-shadow-from-right">
    <!-- Toolbar -->
    <div
      v-if="!isMobile"
      class="htw-flex-none htw-flex htw-items-center htw-justify-end htw-h-8 htw-mx-2 htw-mt-1"
    >
      <ToolbarBackground />
      <ToolbarTextDirection />

      <DevOnlyToolbarOpenInEditor
        v-if="__HISTOIRE_DEV__"
        :file="storyStore.currentStory.file?.filePath"
        tooltip="Edit story in editor"
      />
    </div>

    <iframe
      :key="iframeReloadKey"
      ref="iframe"
      :src="sandboxUrl"
      loading="lazy"
      class="htw-w-full htw-h-full htw-relative"
      :class="{
        'htw-invisible': !isIframeLoaded,
      }"
      data-test-id="preview-iframe"
      @load="onIframeLoad()"
    />
  </div>
</template>
