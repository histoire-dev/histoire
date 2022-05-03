<script lang="ts" setup>
import type { Story, Variant } from '../../types'
import SandboxVue3 from '../sandbox/SandboxVue3.vue'
import StoryResponsivePreview from './StoryResponsivePreview.vue'

const props = defineProps<{
  story: Story
  variant: Variant
}>()

Object.assign(props.variant, {
  previewReady: false,
})
function onReady () {
  Object.assign(props.variant, {
    previewReady: true,
  })
}
</script>

<template>
  <StoryResponsivePreview
    v-slot="{ isResponsiveEnabled, finalWidth, finalHeight }"
    :variant="variant"
  >
    <div
      :style="isResponsiveEnabled ? {
        width: finalWidth ? `${finalWidth}px` : null,
        height: finalHeight ? `${finalHeight}px` : null,
      } : undefined"
    >
      <SandboxVue3
        :variant="variant"
        :story="story"
        @ready="onReady"
      />
    </div>
  </StoryResponsivePreview>
</template>
