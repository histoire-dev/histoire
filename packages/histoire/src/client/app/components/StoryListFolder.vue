<script lang="ts" setup>
import { Story, TreeFolder } from '../types'
import StoryListItem from './StoryListItem.vue'
import { Icon } from '@iconify/vue'
import { computed, ref, withDefaults } from 'vue'

const props = withDefaults(defineProps<{
  folder: TreeFolder
  stories: Story[]
  depth?: number
}>(), {
  depth: 0,
})

const isFolderOpen = ref(false)

function toggleOpen () {
  isFolderOpen.value = !isFolderOpen.value
}

const folderPadding = computed(() => {
  return (props.depth * 16) + 'px'
})
</script>

<template>
  <div class="toast">
    <div
      role="button"
      tabindex="0"
      class="htw-px-0.5 htw-py-2 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-900 htw-cursor-pointer htw-select-none htw-flex"
      @click="toggleOpen"
      @keyup.enter="toggleOpen"
      @keyup.space="toggleOpen"
    >
      <span class="bind-tree-padding htw-flex htw-items-center htw-gap-2 htw-min-w-0">
        <span class="htw-flex htw-gap-1 htw-flex-none htw-items-center">
          <Icon
            icon="carbon:caret-right"
            class="htw-w-4 htw-h-4 htw-transition-transform htw-duration-150 htw-opacity-30"
            :class="{
              'htw-rotate-90': isFolderOpen,
            }"
          />
          <Icon
            icon="carbon:folder"
            class="htw-w-5 htw-h-5"
          />
        </span>
        <span class="htw-truncate">{{ folder.title }}</span>
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
.bind-tree-padding {
  padding-left: v-bind(folderPadding);
}
</style>
