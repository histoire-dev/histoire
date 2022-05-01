<script lang="ts" setup>
import { computed, onUnmounted, Ref, ref, toRaw, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { Icon } from '@iconify/vue'
import { STATE_SYNC, PREVIEW_SETTINGS_SYNC, SANDBOX_READY, EVENT_SEND } from '../../util/const'
import type { Story, Variant } from '../../types'
import HatchedPattern from '../misc/HatchedPattern.vue'
import CheckerboardPattern from '../misc/CheckerboardPattern.vue'
import { toRawDeep } from '../../util/reactivity'
import { getSandboxUrl } from '../sandbox/lib'
import { usePreviewSettingsStore } from '../../stores/preview-settings'
import { HstEvent, useEventsStore } from '../../stores/events'

const props = defineProps<{
  story: Story
  variant: Variant
}>()

const settings = usePreviewSettingsStore().currentSettings

// Iframe

const iframe = ref<HTMLIFrameElement>()

function syncState () {
  if (iframe.value && props.variant.previewReady) {
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
  previewReady: false,
})

useEventListener(window, 'message', (event) => {
  switch (event.data.type) {
    case STATE_SYNC:
      updateVariantState(event.data.state)
      break
    case EVENT_SEND:
      logEvent(event.data.event)
      break
    case SANDBOX_READY:
      setPreviewReady()
      break
  }
})

function updateVariantState (state: any) {
  synced = true
  if (props.variant.state) {
    for (const key in state) {
      if (typeof props.variant.state[key] === 'object') {
        Object.assign(props.variant.state[key], state[key])
      } else {
        // eslint-disable-next-line vue/no-mutating-props
        props.variant.state[key] = state[key]
      }
    }
  } else {
    // eslint-disable-next-line vue/no-mutating-props
    props.variant.state = state
  }
}

function logEvent (event: HstEvent) {
  const eventsStore = useEventsStore()
  eventsStore.addEvent(event)
}

function setPreviewReady () {
  Object.assign(props.variant, {
    previewReady: true,
  })
}

const sandboxUrl = computed(() => {
  return getSandboxUrl(props.story, props.variant)
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

function onIframeLoad () {
  isIframeLoaded.value = true
  syncState()
  syncSettings()
}

// Resize

const resizing = ref(false)

const onUnmountedCleanupFns: (() => unknown)[] = []
onUnmounted(() => {
  onUnmountedCleanupFns.forEach(fn => fn())
})

function addWindowListener (event: string, listener: (event: any) => unknown) {
  window.addEventListener(event, listener)
  const removeListener = () => window.removeEventListener(event, listener)
  onUnmountedCleanupFns.push(removeListener)
  return () => {
    removeListener()
    onUnmountedCleanupFns.splice(onUnmountedCleanupFns.indexOf(removeListener), 1)
  }
}

function useDragger (el: Ref<HTMLDivElement>, value: Ref<number>, min: number, max: number, axis: 'x' | 'y') {
  function onMouseDown (event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    const start = axis === 'x' ? event.clientX : event.clientY
    const startValue = value.value || (axis === 'x' ? iframe.value.offsetWidth : iframe.value.offsetHeight)
    resizing.value = true

    const removeListeners = [
      addWindowListener('mousemove', onMouseMove),
      addWindowListener('mouseup', onMouseUp),
    ]

    function onMouseMove (event: MouseEvent) {
      const snapTarget = (axis === 'x' ? previewWrapper.value.clientWidth : previewWrapper.value.clientHeight)
      const delta = (axis === 'x' ? event.clientX : event.clientY) - start
      value.value = Math.max(min, Math.min(max, startValue + delta))

      if (Math.abs(value.value - (snapTarget - 67)) < 16) {
        value.value = null
      }
    }

    function onMouseUp () {
      removeListeners.forEach(fn => fn())
      resizing.value = false
    }
  }
  useEventListener(el, 'mousedown', onMouseDown)

  function onTouchStart (event: TouchEvent) {
    event.preventDefault()
    event.stopPropagation()
    const start = axis === 'x' ? event.touches[0].clientX : event.touches[0].clientY
    const startValue = value.value || (axis === 'x' ? iframe.value.offsetWidth : iframe.value.offsetHeight)
    resizing.value = true

    const removeListeners = [
      addWindowListener('touchmove', onTouchMove),
      addWindowListener('touchend', onTouchEnd),
      addWindowListener('touchcancel', onTouchEnd),
    ]

    function onTouchMove (event: TouchEvent) {
      const delta = (axis === 'x' ? event.touches[0].clientX : event.touches[0].clientY) - start
      value.value = Math.max(min, Math.min(max, startValue + delta))
    }

    function onTouchEnd () {
      removeListeners.forEach(fn => fn())
      resizing.value = false
    }
  }
  useEventListener(el, 'touchstart', onTouchStart)
}

const responsiveWidth = computed({
  get: () => settings[settings.rotate ? 'responsiveHeight' : 'responsiveWidth'],
  set: (value) => { settings[settings.rotate ? 'responsiveHeight' : 'responsiveWidth'] = value },
})
const responsiveHeight = computed({
  get: () => settings[settings.rotate ? 'responsiveWidth' : 'responsiveHeight'],
  set: (value) => { settings[settings.rotate ? 'responsiveWidth' : 'responsiveHeight'] = value },
})

const horizontalDragger = ref<HTMLDivElement>()
const verticalDragger = ref<HTMLDivElement>()
const cornerDragger = ref<HTMLDivElement>()
const previewWrapper = ref<HTMLDivElement>()

useDragger(horizontalDragger, responsiveWidth, 32, 20000, 'x')
useDragger(verticalDragger, responsiveHeight, 32, 20000, 'y')
useDragger(cornerDragger, responsiveWidth, 32, 20000, 'x')
useDragger(cornerDragger, responsiveHeight, 32, 20000, 'y')

// Handle rotate

const finalWidth = computed(() => settings.rotate ? settings.responsiveHeight : settings.responsiveWidth)
const finalHeight = computed(() => settings.rotate ? settings.responsiveWidth : settings.responsiveHeight)

// Disabled responsive

const isResponsiveEnabled = computed(() => !props.variant.responsiveDisabled)
</script>

<template>
  <div class="htw-w-full htw-h-full htw-flex-1 htw-border htw-border-gray-100 dark:htw-border-gray-800 htw-rounded-lg htw-relative htw-overflow-hidden">
    <div
      v-if="isResponsiveEnabled"
      class="htw-absolute htw-inset-0 htw-w-full htw-h-full htw-bg-gray-200 dark:htw-bg-gray-850 htw-rounded-r-lg htw-border-l-2 htw-border-gray-500/10 dark:htw-border-gray-700/30 htw-overflow-hidden"
    >
      <HatchedPattern
        class="htw-w-full htw-h-full htw-text-black/[2%] dark:htw-text-white/[2%]"
      />
    </div>

    <div
      ref="previewWrapper"
      class="htw-h-full htw-overflow-auto htw-relative"
    >
      <div
        class="htw-h-full htw-p-4 htw-overflow-hidden htw-bg-white dark:htw-bg-gray-700 htw-rounded-lg htw-relative"
        :class="isResponsiveEnabled ? {
          'htw-w-fit': !!finalWidth,
          'htw-h-fit': !!finalHeight
        } : undefined"
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
              :style="isResponsiveEnabled ? {
                width: finalWidth ? `${finalWidth}px` : null,
                height: finalHeight ? `${finalHeight}px` : null,
              } : undefined"
              data-test-id="preview-iframe"
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
        <template v-if="isResponsiveEnabled">
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
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bind-preview-bg {
  background-color: v-bind('settings.backgroundColor');
}
</style>
