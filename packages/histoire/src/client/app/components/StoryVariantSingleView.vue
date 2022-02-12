<script lang="ts" setup>
import { useEventListener } from '@vueuse/core'
import { PropType, ref, watch, toRaw } from 'vue'
import { Story, Variant } from '../types'
import { STATE_SYNC } from '../util/const.js'
import BaseSplitPane from './base/BaseSplitPane.vue'

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
</script>

<template>
  <div class="htw-border htw-border-zinc-100 dark:htw-border-zinc-800 htw-rounded-lg htw-h-full">
    <BaseSplitPane
      save-id="story-single-responsive"
      :min="1"
      :max="99"
      :default-split="99"
      class="htw-w-full"
    >
      <template #first>
        <div class="htw-p-4 htw-h-full htw-overflow-hidden htw-bg-white dark:htw-bg-zinc-700 htw-rounded-l-lg htw-relative">
          <iframe
            ref="iframe"
            :src="`/__sandbox?storyId=${story.id}&variantId=${variant.id}`"
            class="htw-w-full htw-h-full htw-border htw-border-zinc-100 dark:htw-border-zinc-800 htw-bg-white"
            @load="syncState()"
          />
          <!-- Markers -->
          <div class="htw-absolute htw-top-1 htw-left-4 htw-h-2 htw-w-px htw-bg-zinc-200 dark:htw-bg-zinc-800" />
          <div class="htw-absolute htw-top-1 htw-right-4 htw-h-2 htw-w-px htw-bg-zinc-200 dark:htw-bg-zinc-800" />
          <div class="htw-absolute htw-bottom-1 htw-left-4 htw-h-2 htw-w-px htw-bg-zinc-200 dark:htw-bg-zinc-800" />
          <div class="htw-absolute htw-bottom-1 htw-right-4 htw-h-2 htw-w-px htw-bg-zinc-200 dark:htw-bg-zinc-800" />
          <div class="htw-absolute htw-left-1 htw-top-4 htw-w-2 htw-h-px htw-bg-zinc-200 dark:htw-bg-zinc-800" />
          <div class="htw-absolute htw-left-1 htw-bottom-4 htw-w-2 htw-h-px htw-bg-zinc-200 dark:htw-bg-zinc-800" />
          <div class="htw-absolute htw-right-1 htw-top-4 htw-w-2 htw-h-px htw-bg-zinc-200 dark:htw-bg-zinc-800" />
          <div class="htw-absolute htw-right-1 htw-bottom-4 htw-w-2 htw-h-px htw-bg-zinc-200 dark:htw-bg-zinc-800" />
        </div>
      </template>
      <template #last>
        <div class="htw-w-full htw-h-full htw-bg-zinc-200 dark:htw-bg-zinc-850 htw-rounded-r-lg htw-border-l-2 htw-border-zinc-500/10 dark:htw-border-zinc-700/30" />
      </template>
    </BaseSplitPane>
  </div>
</template>
