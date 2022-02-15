<script lang="ts" setup>
import { Story, TTree } from '../types'
import StoryListItem from './StoryListItem.vue'

const props = defineProps<{
  tree: TTree
  stories: Story[]
}>()
</script>

<template>
  <div class="htw-overflow-y-auto">
    <template
      v-for="( element, key,) of tree"
      :key="key"
    >
      <StoryListItem
        v-if="element.index"
        :story="stories[element.index]"
      />
      <StoryList
        v-else
        :tree="element.children"
        :stories="stories"
      />
    </template>
  </div>
</template>
