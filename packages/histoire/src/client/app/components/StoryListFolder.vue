<script lang="ts" setup>
import { Story, TFolder } from '../types'
import StoryListItem from './StoryListItem.vue'
import { Icon } from '@iconify/vue'
import { computed, ref, withDefaults } from 'vue'

const props = withDefaults(defineProps<{
  folder: TFolder
  stories: Story[]
  depth?: number
}>(), {
  depth: 0,
})

const isFolderOpen = ref(false)

function toggleOpen () {
  isFolderOpen.value = !isFolderOpen.value
}

const carbonIcon = computed(() => {
  return isFolderOpen.value ? 'carbon:folder-open' : 'carbon:folder'
})

const folderPadding = computed(() => {
  return (props.depth * 16) + 'px'
})
</script>

<template>
  <div class="toast">
    <div
      class="htw-px-4 htw-py-2 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-900 htw-cursor-pointer"
      @click="toggleOpen"
    >
      <span class="folder-padding htw-flex htw-items-center htw-gap-2">
        <Icon
          :icon="carbonIcon"
          class="htw-w-6 htw-h-6"
        />
        {{ folder.title }}
      </span>
    </div>
    <div
      v-if="isFolderOpen"
    >
      <template
        v-for="element of folder.children"
        :key="element.title"
      >
        <StoryListFolder
          v-if="element.children"
          :folder="element"
          :stories="stories"
          :depth="depth + 1"
        />
        <StoryListItem
          v-else
          :story="stories[element.index]"
          :depth="depth + 1"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.folder-padding {
    padding-left: v-bind(folderPadding);
}
</style>
