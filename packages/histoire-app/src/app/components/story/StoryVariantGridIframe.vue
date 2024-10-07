<script lang="ts" setup>
import { computed, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import { applyState } from '@histoire/shared'
import { EVENT_SEND, PREVIEW_SETTINGS_SYNC, SANDBOX_READY, SELECT_VARIANT, STATE_SYNC, VARIANT_READY } from '../../util/const'
import { getSandboxUrl } from '../../util/sandbox'
import { isMobile } from '../../util/responsive'
import { useStoryStore } from '../../stores/story'
import { usePreviewSettingsStore } from '../../stores/preview-settings'
import type { HstEvent } from '../../stores/events'
import { useEventsStore } from '../../stores/events'
import { toRawDeep } from '../../util/state'
import ToolbarBackground from '../toolbar/ToolbarBackground.vue'
import ToolbarTextDirection from '../toolbar/ToolbarTextDirection.vue'
import DevOnlyToolbarOpenInEditor from '../toolbar/DevOnlyToolbarOpenInEditor.vue'

const storyStore = useStoryStore()

const router = useRouter()
const route = useRoute()

// Iframe

const iframe = ref<HTMLIFrameElement>()

function syncState() {
  if (iframe.value && storyStore.currentVariant?.previewReady) {
    iframe.value.contentWindow?.postMessage({
      type: STATE_SYNC,
      variantId: storyStore.currentVariant.id,
      state: toRawDeep(storyStore.currentVariant?.state, true),
    })
  }
}

let synced = false

watch(() => storyStore.currentVariant?.state, () => {
  if (synced) {
    synced = false
    return
  }
  syncState()
}, {
  deep: true,
  immediate: true,
})

useEventListener(window, 'message', (event) => {
  if (event.data.__histoire) {
    // console.log(`[main] received message:`, event.data)
    switch (event.data.type) {
      case STATE_SYNC:
        updateVariantState(event.data.variantId, event.data.state)
        break
      case EVENT_SEND:
        logEvent(event.data.event)
        break
      case SANDBOX_READY:
        if (route.query.variantId) {
          iframe.value?.contentWindow?.postMessage({
            type: SELECT_VARIANT,
            variantId: route.query.variantId,
          })
        }
        break
      case VARIANT_READY:
        setPreviewReady(event.data.variantId)
        break
      case SELECT_VARIANT:
        router.push({
          query: {
            variantId: event.data.variantId,
          },
        })
        break
    }
  }
})

function updateVariantState(variantId: string, state: any) {
  if (storyStore.currentVariant?.id === variantId) {
    synced = true
  }
  const variant = storyStore.getCurrentStoryVariantById(variantId)
  if (variant) {
    applyState(variant.state, state)
  }
}

function logEvent(event: HstEvent) {
  const eventsStore = useEventsStore()
  eventsStore.addEvent(event)
}

function setPreviewReady(variantId: string) {
  const variant = storyStore.getCurrentStoryVariantById(variantId)
  if (variant) {
    Object.assign(variant, {
      previewReady: true,
    })
  }
}

const sandboxUrl = computed(() => {
  return getSandboxUrl(storyStore.currentStory)
})

const isIframeLoaded = ref(false)

watch(sandboxUrl, () => {
  isIframeLoaded.value = false
})

// Settings

const settings = usePreviewSettingsStore().currentSettings

function syncSettings() {
  if (iframe.value) {
    iframe.value.contentWindow?.postMessage({
      type: PREVIEW_SETTINGS_SYNC,
      settings: toRaw(settings),
    })
  }
}

watch(() => settings, () => {
  syncSettings()
}, {
  deep: true,
  immediate: true,
})

// Iframe load

function onIframeLoad() {
  isIframeLoaded.value = true
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
