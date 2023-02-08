<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import type { Variant, Story } from '../../types'

const props = defineProps<{
  variant: Variant
  story: Story
}>()

function openInEditor () {
  fetch(`${import.meta.env.BASE_URL}__open-in-editor?file=${encodeURIComponent(props.story.file?.filePath)}`)
}
</script>

<template>
  <a
    v-tooltip="'Edit story in editor'"
    target="_blank"
    class="histoire-toolbar-open-in-editor htw-flex htw-items-center htw-gap-1 htw-h-full htw-px-2 hover:htw-text-primary-500 htw-opacity-50 hover:htw-opacity-100 dark:hover:htw-text-primary-400 htw-text-gray-900 dark:htw-text-gray-100"
    @click="openInEditor()"
  >
    <Icon
      icon="carbon:script-reference"
      class="htw-w-4 htw-h-4"
    />
  </a>
</template>

<style scoped>
.histoire-toolbar-open-in-editor {
  text: red;
}
</style>
