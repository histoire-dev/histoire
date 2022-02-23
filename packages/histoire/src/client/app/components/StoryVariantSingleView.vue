<script lang="ts" setup>
import { useEventListener } from '@vueuse/core'
import { PropType, ref, watch, toRaw, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { Story, Variant } from '../types'
import { STATE_SYNC } from '../util/const.js'
import { histoireConfig } from '../util/config.js'
import BaseSplitPane from './base/BaseSplitPane.vue'
import HatchedPattern from './misc/HatchedPattern.vue'

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

watch(() => props.variant.state, () => {
  syncState()
}, {
  deep: true,
  immediate: true,
})

useEventListener(window, 'message', (event) => {
  if (event.data.type === STATE_SYNC) {
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

function onIframeLoad () {
  isIframeLoaded.value = true
  syncState()
}

// Responsive

const responsiveWidth = ref<number>(undefined)
</script>

<template>
  <div class="htw-h-full htw-flex htw-flex-col htw-gap-2">
    <div class="htw-flex-none htw-flex htw-items-center htw-gap-2">
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
          :distance="10"
          :skidding="6"
          :disabled="!histoireConfig.responsivePresets?.length"
        >
          <Icon
            icon="ic:baseline-phone-android"
            class="htw-w-4 htw-h-4 htw-opacity-50"
            :class="{
              'htw-cursor-pointer hover:htw-text-primary-500': histoireConfig.responsivePresets?.length,
            }"
          />

          <template #popper="{ hide }">
            <div class="htw-flex htw-flex-col htw-items-stretch">
              <button
                v-for="(preset, index) in histoireConfig.responsivePresets"
                :key="index"
                class="htw-bg-transparent hover:htw-bg-primary-100 dark:hover:htw-bg-primary-700 htw-px-4 htw-py-3 htw-cursor-pointer htw-text-left htw-flex htw-gap-2"
                :class="{
                  'htw-bg-primary-500 hover:htw-bg-primary-600 htw-text-white': responsiveWidth === preset.width,
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
    </div>

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
          <div class="htw-w-full htw-h-full htw-border htw-border-gray-100 dark:htw-border-gray-800 htw-bg-white htw-rounded-sm">
            <iframe
              ref="iframe"
              :src="sandboxUrl"
              class="htw-w-full htw-h-full"
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
          class="htw-w-full htw-h-full htw-bg-gray-200 dark:htw-bg-gray-850 htw-rounded-r-lg htw-border-l-2 htw-border-gray-500/10 dark:htw-border-gray-700/30"
        >
          <HatchedPattern
            class="htw-w-full htw-h-full htw-text-black/[2%] dark:htw-text-white/[2%]"
          />
        </div>
      </template>
    </BaseSplitPane>
  </div>
</template>
