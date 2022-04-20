<script lang="ts" setup>
import type { Story, TreeGroup, TreeFolder, TreeLeaf } from '../../types'
import StoryListItem from './StoryListItem.vue'
import StoryListFolder from './StoryListFolder.vue'
import { Icon } from '@iconify/vue'
import { computed, withDefaults } from 'vue'
import { useFolderStore } from '../../stores/folder'

const props = withDefaults(defineProps<{
  path?: Array<string>
  group: TreeGroup
  stories: Story[]
}>(), {
  path: () => [],
})

const folderStore = useFolderStore()

const folderPath = computed(() => [...props.path, props.group.title])
const isFolderOpen = computed(() => folderStore.isFolderOpened(folderPath.value, true))

function toggleOpen () {
  folderStore.toggleFolder(folderPath.value, false)
}
</script>

<template>
  <div
    data-test-id="story-group"
    class="htw-my-2 first:htw-mt-0 last:htw-mb-0"
  >
    <div
      v-if="group.title"
      role="button"
      tabindex="0"
      class="htw-px-0.5 htw-py-2 md:htw-py-1.5 htw-mx-1 htw-rounded-sm hover:htw-bg-primary-100 dark:hover:htw-bg-primary-900 htw-cursor-pointer htw-select-none htw-flex htw-items-center htw-gap-1 htw-min-w-0"
      @click="toggleOpen"
      @keyup.enter="toggleOpen"
      @keyup.space="toggleOpen"
    >
      <Icon
        icon="carbon:caret-right"
        class="htw-w-4 htw-h-4 htw-transition-transform htw-duration-150 htw-opacity-30 htw-flex-none"
        :class="{
          'htw-rotate-90': isFolderOpen,
        }"
      />
      <span class="htw-truncate htw-opacity-50">{{ group.title }}</span>
      <span class="htw-h-[1px] htw-flex-1 htw-bg-gray-500/10 htw-mx-2" />
    </div>

    <!-- Children -->
    <div
      v-if="isFolderOpen"
    >
      <template
        v-for="element of group.children"
        :key="element.title"
      >
        <StoryListFolder
          v-if="(element as TreeFolder).children"
          :path="folderPath"
          :folder="(element as TreeFolder)"
          :stories="stories"
          :depth="0"
        />
        <StoryListItem
          v-else
          :story="stories[(element as TreeLeaf).index]"
          :depth="0"
        />
      </template>
    </div>
  </div>
</template>
