<script lang="ts" setup>
import { PropType } from 'vue'
import { Story } from '../types'
import StoryListItem from './StoryListItem.vue'

const props = defineProps({
  stories: {
    type: Array as PropType<Story[]>,
    required: true,
  },
})
</script>

<template>
  <div class="htw-overflow-y-auto">
    <StoryListItem
      v-for="story of stories"
      :key="story.id"
      :story="story"
    />
  </div>
</template>
