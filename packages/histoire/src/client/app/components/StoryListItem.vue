<script lang="ts" setup>
import { PropType } from 'vue'
import { Story } from '../types'
import BaseListItemLink from './base/BaseListItemLink.vue'

defineProps({
  story: {
    type: Object as PropType<Story>,
    required: true,
  },
})
</script>

<template>
  <div>
    <BaseListItemLink
      :to="{
        name: 'story',
        params: {
          storyId: story.id,
        },
      }"
    >
      <span>
        {{ story.title }}
      </span>

      <span class="htw-opacity-40 htw-text-sm">
        {{ story.variants.length }}
      </span>
    </BaseListItemLink>
  </div>
</template>
