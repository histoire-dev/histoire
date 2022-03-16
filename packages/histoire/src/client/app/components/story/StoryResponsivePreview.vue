<script lang="ts" setup>
import { computed, Ref, ref, toRaw, toRefs, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { Icon } from '@iconify/vue'
import { STATE_SYNC, PREVIEW_SETTINGS_SYNC, SANDBOX_READY } from '../../util/const'
import { PreviewSettings } from '../../util/preview-settings'
import type { Story, Variant } from '../../types'
import HatchedPattern from '../misc/HatchedPattern.vue'
import CheckerboardPattern from '../misc/CheckerboardPattern.vue'
import { toRawDeep } from '../../util/reactivity'

const props = defineProps<{
  story: Story
  variant: Variant
  settings: PreviewSettings
}>()

// Iframe

const iframe = ref<HTMLIFrameElement>()

function syncState () {
  if (iframe.value && props.variant.ready) {
    iframe.value.contentWindow.postMessage({
      type: STATE_SYNC,
      state: toRawDeep(props.variant.state),
    })
  }
}

let synced = false

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
  ready: false,
})
useEventListener(window, 'message', (event) => {
  if (event.data.type === STATE_SYNC) {
    synced = true
    Object.assign(props.variant.state, event.data.state)
  } else if (event.data.type === SANDBOX_READY) {
    Object.assign(props.variant, {
      ready: true,
    })
  }
})

const sandboxUrl = computed(() => {
  const url = new URLSearchParams()
  url.append('storyId', props.story.id)
  url.append('variantId', props.variant.id)
  return '/__sandbox?' + url.toString()
})

const isIframeLoaded = ref(false)

watch(sandboxUrl, () => {
  isIframeLoaded.value = false
})

// Settings

function syncSettings () {
  if (iframe.value) {
    iframe.value.contentWindow.postMessage({
      type: PREVIEW_SETTINGS_SYNC,
      settings: toRaw(props.settings),
    })
  }
}

watch(() => props.settings, value => {
  syncSettings()
}, {
  deep: true,
  immediate: true,
})

// Iframe load

function onIframeLoad () {
  isIframeLoaded.value = true
  syncState()
  syncSettings()
}

// Resize

const resizing = ref(false)

function useDragger (el: Ref<HTMLDivElement>, value: Ref<number>, min: number, max: number, axis: 'x' | 'y') {
  const onMouseDown = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const start = axis === 'x' ? event.clientX : event.clientY
    const startValue = value.value || (axis === 'x' ? iframe.value.offsetWidth : iframe.value.offsetHeight)
    resizing.value = true
    const onMouseMove = (event: MouseEvent) => {
      const delta = (axis === 'x' ? event.clientX : event.clientY) - start
      value.value = Math.max(min, Math.min(max, startValue + delta))
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      resizing.value = false
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }
  useEventListener(el, 'mousedown', onMouseDown)
}

const responsiveWidth = computed({ get: () => props.settings.responsiveWidth, set: (value) => props.settings.responsiveWidth = value })
const responsiveHeight = computed({ get: () => props.settings.responsiveHeight, set: (value) => props.settings.responsiveHeight = value })

const horizontalDragger = ref<HTMLDivElement>()
const verticalDragger = ref<HTMLDivElement>()
const cornerDragger = ref<HTMLDivElement>()

useDragger(horizontalDragger, responsiveWidth, 10, 20000, 'x')
useDragger(verticalDragger, responsiveHeight, 10, 20000, 'y')
useDragger(cornerDragger, responsiveWidth, 10, 20000, 'x')
useDragger(cornerDragger, responsiveHeight, 10, 20000, 'y')

// Handle rotate

const finalWidth = computed(() => props.settings.rotate ? props.settings.responsiveHeight : props.settings.responsiveWidth)
const finalHeight = computed(() => props.settings.rotate ? props.settings.responsiveWidth : props.settings.responsiveHeight)
</script>

<template>
  <div class="htw-w-full htw-h-full htw-flex-1 htw-border htw-border-gray-100 dark:htw-border-gray-800 htw-rounded-lg htw-relative htw-overflow-hidden">
    <div class="htw-absolute htw-inset-0 htw-w-full htw-h-full htw-bg-gray-200 dark:htw-bg-gray-850 htw-rounded-r-lg htw-border-l-2 htw-border-gray-500/10 dark:htw-border-gray-700/30 htw-overflow-hidden">
      <HatchedPattern
        class="htw-w-full htw-h-full htw-text-black/[2%] dark:htw-text-white/[2%]"
      />
    </div>

    <div class="htw-h-full htw-overflow-auto htw-relative">
      <div
        class="htw-h-full htw-p-4 htw-overflow-hidden htw-bg-white dark:htw-bg-gray-700 htw-rounded-lg htw-relative"
        :style="{
          width: finalWidth ? `${finalWidth + 44}px` : null,
          height: finalHeight ? `${finalHeight + 44}px` : null,
        }"
      >
        <div class="htw-p-4 htw-h-full htw-relative">
          <div class="htw-w-full htw-h-full htw-border htw-border-gray-100 dark:htw-border-gray-800 htw-rounded-sm htw-relative">
            <div class="bind-preview-bg htw-absolute htw-inset-0" />

            <CheckerboardPattern
              v-if="settings.checkerboard"
              class="htw-absolute htw-inset-0 htw-w-full htw-h-full htw-text-gray-500/20"
            />

            <iframe
              ref="iframe"
              :src="sandboxUrl"
              class="htw-w-full htw-h-full htw-relative"
              :class="{
                'htw-invisible': !isIframeLoaded,
                'htw-pointer-events-none': resizing,
              }"
              @load="onIframeLoad()"
            />
          </div>

          <!-- Markers -->
          <div class="htw-absolute htw-top-1 htw-left-4 htw-h-2 htw-w-px htw-bg-gray-200 dark:htw-bg-gray-800" />
          <div class="htw-absolute htw-top-1 htw-right-4 htw-h-2 htw-w-px htw-bg-gray-200 dark:htw-bg-gray-800" />
          <div class="htw-absolute htw-bottom-1 htw-left-4 htw-h-2 htw-w-px htw-bg-gray-200 dark:htw-bg-gray-800" />
          <div class="htw-absolute htw-bottom-1 htw-right-4 htw-h-2 htw-w-px htw-bg-gray-200 dark:htw-bg-gray-800" />
          <div class="htw-absolute htw-left-1 htw-top-4 htw-w-2 htw-h-px htw-bg-gray-200 dark:htw-bg-gray-800" />
          <div class="htw-absolute htw-left-1 htw-bottom-4 htw-w-2 htw-h-px htw-bg-gray-200 dark:htw-bg-gray-800" />
          <div class="htw-absolute htw-right-1 htw-top-4 htw-w-2 htw-h-px htw-bg-gray-200 dark:htw-bg-gray-800" />
          <div class="htw-absolute htw-right-1 htw-bottom-4 htw-w-2 htw-h-px htw-bg-gray-200 dark:htw-bg-gray-800" />
        </div>

        <!-- Resize Dragger -->
        <div
          ref="horizontalDragger"
          class="htw-absolute htw-w-4 htw-top-0 htw-bottom-4 htw-right-0 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-800 htw-flex htw-items-center htw-justify-center htw-cursor-ew-resize htw-group hover:htw-text-primary-500"
        >
          <Icon
            icon="mdi:drag-vertical-variant"
            class="htw-w-4 htw-h-4 htw-opacity-20 group-hover:htw-opacity-90"
          />
        </div>
        <div
          ref="verticalDragger"
          class="htw-absolute htw-h-4 htw-left-0 htw-right-4 htw-bottom-0 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-800 htw-flex htw-items-center htw-justify-center htw-cursor-ns-resize htw-group hover:htw-text-primary-500"
        >
          <Icon
            icon="mdi:drag-horizontal-variant"
            class="htw-w-4 htw-h-4 htw-opacity-20 group-hover:htw-opacity-90"
          />
        </div>
        <div
          ref="cornerDragger"
          class="htw-absolute htw-w-4 htw-h-4 htw-right-0 htw-bottom-0 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-800 htw-flex htw-items-center htw-justify-center htw-cursor-nwse-resize htw-group hover:htw-text-primary-500"
        />
      </div>
    </div>
  </div>
</template>
