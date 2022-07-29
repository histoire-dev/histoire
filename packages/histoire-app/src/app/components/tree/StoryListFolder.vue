<script lang="ts" setup>
import type { Story, TreeFolder, TreeLeaf } from '../../types'
import StoryListItem from './StoryListItem.vue'
import { Icon } from '@iconify/vue'
import { computed, withDefaults } from 'vue'
import { useFolderStore } from '../../stores/folder'

const props = withDefaults(defineProps<{
  path?: Array<string>
  folder: TreeFolder
  stories: Story[]
  depth?: number
}>(), {
  depth: 0,
  path: () => [],
})

const folderStore = useFolderStore()

const folderPath = computed(() => [...props.path, props.folder.title])
const isFolderOpen = computed(() => folderStore.isFolderOpened(folderPath.value))

function toggleOpen () {
  folderStore.toggleFolder(folderPath.value)
}

const folderPadding = computed(() => {
  return (props.depth * 12) + 'px'
})
</script>

<template>
  <div data-test-id="story-list-folder">
    <div
      role="button"
      tabindex="0"
      class="htw-px-0.5 htw-py-2 md:htw-py-1.5 htw-mx-1 htw-rounded-sm hover:htw-bg-primary-100 dark:hover:htw-bg-primary-900 htw-cursor-pointer htw-select-none htw-flex"
      @click="toggleOpen"
      @keyup.enter="toggleOpen"
      @keyup.space="toggleOpen"
    >
      <span class="bind-tree-padding htw-flex htw-items-center htw-gap-2 htw-min-w-0">
        <span class="htw-flex htw-flex-none htw-items-center">
          <Icon
            icon="carbon:caret-right"
            class="htw-w-4 htw-h-4 htw-transition-transform htw-duration-150 htw-opacity-30"
            :class="{
              'htw-rotate-90': isFolderOpen,
            }"
          />
          <Icon
            icon="carbon:folder"
            class="htw-w-5 htw-h-5 sm:htw-w-4 sm:htw-h-4"
          />
        </span>
        <span class="htw-truncate">{{ folder.title }}</span>
      </span>
    </div>

    <!-- Children -->
    <div
      v-if="isFolderOpen"
    >
      <template
        v-for="element of folder.children"
        :key="element.title"
      >
        <StoryListFolder
          v-if="(element as TreeFolder).children"
          :path="folderPath"
          :folder="(element as TreeFolder)"
          :stories="stories"
          :depth="depth + 1"
        />
        <StoryListItem
          v-else
          :story="stories[(element as TreeLeaf).index]"
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
