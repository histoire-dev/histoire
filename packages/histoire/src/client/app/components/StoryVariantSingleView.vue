<script lang="ts" setup>
import { PropType } from 'vue'
import { Story, Variant } from '../types'
import SandboxVue from './SandboxVue.vue'
import BaseSplitPane from './base/BaseSplitPane.vue'

defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },

  story: {
    type: Object as PropType<Story>,
    required: true,
  },
})
</script>

<template>
  <div class="htw-border htw-border-gray-100 htw-rounded-lg htw-h-full">
    <BaseSplitPane
      save-id="story-single-responsive"
      :min="1"
      :max="99"
      :default-split="99"
      dragger-offset="before"
      class="htw-w-full"
    >
      <template #first>
        <div class="htw-p-4 htw-h-full htw-overflow-auto htw-bg-white htw-rounded-l-lg">
          <SandboxVue
            :variant="variant"
            :story="story"
          />
        </div>
      </template>
      <template #last>
        <div class="htw-w-full htw-h-full htw-bg-gray-200 dark:htw-bg-gray-800 htw-rounded-r-lg htw-border-l-2 htw-border-gray-500/10" />
      </template>
    </BaseSplitPane>
  </div>
</template>
