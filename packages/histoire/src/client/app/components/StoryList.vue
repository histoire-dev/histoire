<script lang="ts" setup>
import { Story, Tree } from '../types'
import StoryListItem from './StoryListItem.vue'
import StoryListFolder from './StoryListFolder.vue'

const props = defineProps<{
  tree: Tree
  stories: Story[]
}>()
</script>

<template>
  <div class="htw-overflow-y-auto">
    <template
      v-for="element of tree"
      :key="element.title"
    >
      <StoryListFolder
        v-if="element.children"
        :folder="element"
        :stories="stories"
      />
      <StoryListItem
        v-else
        :story="stories[element.index]"
      />
    </template>
  </div>
</template>
