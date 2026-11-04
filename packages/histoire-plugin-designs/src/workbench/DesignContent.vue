<script setup lang="ts">
import type { ResolvedDesign } from '../types.js'
import { HstButton } from '@histoire/controls/vue'
import { WorkbenchEmptyState } from '@histoire/plugin-kit/vue'
import EmbedFrame from './EmbedFrame.vue'
import ImageViewer from './image/ImageViewer.vue'

defineProps<{
  /** Design to show. */
  design: ResolvedDesign
}>()
</script>

<template>
  <ImageViewer v-if="design.type === 'image'" :design="design" />
  <WorkbenchEmptyState v-else-if="design.type === 'link'" icon="launch" :title="design.label">
    {{ design.externalUrl }}
    <template #actions>
      <HstButton as="a" color="flat" :href="design.externalUrl" target="_blank" rel="noopener noreferrer">
        Open design
      </HstButton>
    </template>
  </WorkbenchEmptyState>
  <EmbedFrame v-else :design="design" />
</template>
