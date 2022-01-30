<script lang="ts" setup>
import { PropType } from 'vue'
import { Story } from '../types'

defineProps({
  story: {
    type: Object as PropType<Story>,
    required: true,
  },
})
</script>

<template>
  <div>
    <RouterLink
      :to="{
        name: 'story',
        params: {
          storyId: story.id,
        },
      }"
      class="htw-p-2 htw-flex htw-space-x-2 hover:htw-bg-primary-100 dark:htw-bg-primary-900"
      active-class="htw-bg-primary-500 hover:htw-bg-primary-600 htw-text-white htw-font-bold"
    >
      <span>
        {{ story.title }}
      </span>

      <span class="htw-opacity-40 htw-text-sm">
        {{ story.variants.length }}
      </span>
    </RouterLink>
  </div>
</template>
