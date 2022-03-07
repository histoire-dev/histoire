<script lang="ts" setup>
import { useEventListener } from '@vueuse/core'
import { PropType, ref, watch, toRaw, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { Story, Variant } from '../types'
import { STATE_SYNC, PREVIEW_SETTINGS_SYNC } from '../util/const.js'
import { histoireConfig } from '../util/config.js'
import BaseSplitPane from './base/BaseSplitPane.vue'
import HatchedPattern from './misc/HatchedPattern.vue'
import CheckerboardPattern from './misc/CheckerboardPattern.vue'
import { usePreviewSettings } from '../preview-settings.js'

const props = defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },

  story: {
    type: Object as PropType<Story>,
    required: true,
  },
})

// Iframe

const iframe = ref<HTMLIFrameElement>()

function syncState () {
  if (iframe.value) {
    iframe.value.contentWindow.postMessage({
      type: STATE_SYNC,
      state: toRaw(props.variant.state),
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

useEventListener(window, 'message', (event) => {
  if (event.data.type === STATE_SYNC) {
    synced = true
    Object.assign(props.variant.state, event.data.state)
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

// Responsive

const responsiveWidth = ref<number>(undefined)

// Iframe settings

const settings = usePreviewSettings()

function syncSettings () {
  if (iframe.value) {
    iframe.value.contentWindow.postMessage({
      type: PREVIEW_SETTINGS_SYNC,
      settings: toRaw(settings.value),
    })
  }
}

watch(settings, value => {
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
</script>

<template>
  <div class="htw-h-full htw-flex htw-flex-col htw-gap-2">
    <!-- Toolbar -->
    <div class="htw-flex-none htw-flex htw-items-center htw-gap-4">
      <!-- Variant title -->
      <div class="htw-flex htw-items-center htw-gap-1 htw-text-gray-500 htw-flex-1 htw-truncate htw-min-w-0">
        <Icon
          :icon="variant.icon ?? 'carbon:cube'"
          class="base-list-item-link-icon htw-w-4 htw-h-4 htw-opacity-50"
          :class="[
            variant.iconColor ? 'bind-icon-color' : 'htw-text-gray-500',
          ]"
        />
        <span>{{ variant.title }}</span>
      </div>

      <!-- Responsive size -->
      <div class="htw-flex-none htw-flex htw-gap-1 htw-items-center">
        <VDropdown
          placement="bottom-end"
          :skidding="6"
          :disabled="!histoireConfig.responsivePresets?.length"
        >
          <div
            v-tooltip="'Responsive sizes'"
            class="htw-flex htw-items-center htw-gap-1"
            :class="{
              'htw-cursor-pointer hover:htw-text-primary-500': histoireConfig.responsivePresets?.length,
            }"
          >
            <Icon
              icon="ic:baseline-phone-android"
              class="htw-w-4 htw-h-4 htw-opacity-50"
            />
            <Icon
              icon="carbon:caret-down"
              class="htw-w-4 htw-h-4 htw-opacity-50"
            />
          </div>

          <template #popper="{ hide }">
            <div class="htw-flex htw-flex-col htw-items-stretch">
              <button
                v-for="(preset, index) in histoireConfig.responsivePresets"
                :key="index"
                class="htw-bg-transparent hover:htw-bg-primary-100 dark:hover:htw-bg-primary-700 htw-px-4 htw-py-3 htw-cursor-pointer htw-text-left htw-flex htw-gap-4"
                :class="{
                  'htw-bg-primary-500 hover:htw-bg-primary-600 htw-text-white dark:htw-text-black': responsiveWidth === preset.width,
                }"
                @click="responsiveWidth = preset.width;hide()"
              >
                {{ preset.label }}
                <span class="htw-ml-auto htw-opacity-70">{{ preset.width }}px</span>
              </button>
            </div>
          </template>
        </VDropdown>

        <input
          v-model.number="responsiveWidth"
          v-tooltip="'Responsive width (px)'"
          type="number"
          class="htw-bg-transparent htw-border htw-border-gray-200 dark:htw-border-gray-850 htw-rounded htw-w-16 htw-opacity-50 focus:htw-opacity-100"
          step="16"
        >
      </div>

      <!-- Background -->
      <div
        v-if="histoireConfig.backgroundPresets.length"
        class="htw-flex-none htw-flex htw-gap-1 htw-items-center"
      >
        <VDropdown
          placement="bottom-end"
          :skidding="6"
        >
          <div
            v-tooltip="'Background color'"
            class="htw-cursor-pointer hover:htw-text-primary-500 htw-flex htw-items-center htw-gap-1"
          >
            <div
              class="bind-preview-bg htw-w-4 htw-h-4 htw-rounded-full htw-border htw-border-black/20 dark:htw-border-white/20"
            />
            <Icon
              icon="carbon:caret-down"
              class="htw-w-4 htw-h-4 htw-opacity-50"
            />
          </div>

          <template #popper="{ hide }">
            <div class="htw-flex htw-flex-col htw-items-stretch">
              <HstCheckbox
                v-model="settings.checkerboard"
              >
                Checkerboard
              </HstCheckbox>

              <button
                v-for="(option, index) in histoireConfig.backgroundPresets"
                :key="index"
                class="htw-bg-transparent hover:htw-bg-primary-100 dark:hover:htw-bg-primary-700 htw-px-4 htw-py-3 htw-cursor-pointer htw-text-left htw-flex htw-gap-4"
                :class="{
                  'htw-bg-primary-500 hover:htw-bg-primary-600 htw-text-white dark:htw-text-black': settings.backgroundColor === option.color,
                }"
                @click="settings.backgroundColor = option.color;hide()"
              >
                <span class="htw-mr-auto">{{ option.label }}</span>
                <template v-if="option.color !== '$checkerboard'">
                  <span class="htw-ml-auto htw-opacity-70">{{ option.color }}</span>
                  <div
                    class="htw-w-4 htw-h-4 htw-rounded-full htw-border htw-border-black/20 dark:htw-border-white/20"
                    :style="{
                      backgroundColor: option.color,
                    }"
                  />
                </template>
              </button>
            </div>
          </template>
        </VDropdown>
      </div>
    </div>

    <!-- Preview pane -->
    <BaseSplitPane
      v-model:split="responsiveWidth"
      save-id="story-single-responsive"
      :min="30"
      :max="6000"
      :default-split="720"
      fixed
      class="htw-w-full htw-h-full htw-flex-1 htw-border htw-border-gray-100 dark:htw-border-gray-800 htw-rounded-lg"
    >
      <template #first>
        <div class="htw-p-4 htw-h-full htw-overflow-hidden htw-bg-white dark:htw-bg-gray-700 htw-rounded-l-lg htw-relative">
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
              :class="{'htw-invisible': !isIframeLoaded}"
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
      </template>
      <template #last>
        <div
          class="htw-w-full htw-h-full htw-bg-gray-200 dark:htw-bg-gray-850 htw-rounded-r-lg htw-border-l-2 htw-border-gray-500/10 dark:htw-border-gray-700/30 htw-overflow-hidden"
        >
          <HatchedPattern
            class="htw-w-full htw-h-full htw-text-black/[2%] dark:htw-text-white/[2%]"
          />
        </div>
      </template>
    </BaseSplitPane>
  </div>
</template>

<style scoped>
.bind-preview-bg {
  background-color: v-bind('settings.backgroundColor');
}
</style>
