<script lang="ts" setup>
import type { Story, Tree, TreeFolder, TreeLeaf } from '../../types'
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
        v-if="(element as TreeFolder).children"
        :folder="(element as TreeFolder)"
        :stories="stories"
      />
      <StoryListItem
        v-else
        :story="stories[(element as TreeLeaf).index]"
      />
    </template>
  </div>
</template>
