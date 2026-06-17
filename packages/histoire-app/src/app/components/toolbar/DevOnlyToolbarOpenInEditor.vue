<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import { openInEditor } from '../../util/open-in-editor.js'
import TopBarChipItem from '../app/TopBarChipItem.vue'

defineProps<{
  file: string
  tooltip: string
}>()
</script>

<template>
  <TopBarChipItem
    v-tooltip="tooltip"
    target="_blank"
    class="histoire-toolbar-open-in-editor"
    @click="openInEditor(file)"
  >
    <Icon
      icon="carbon:script-reference"
      class="htw-w-4 htw-h-4"
    />
  </TopBarChipItem>
</template>
