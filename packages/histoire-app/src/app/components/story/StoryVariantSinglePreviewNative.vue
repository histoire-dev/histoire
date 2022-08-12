<script lang="ts" setup>
import GenericRenderStory from './GenericRenderStory.vue'
import type { Story, Variant } from '../../types'
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
        width: finalWidth ? `${finalWidth}px` : '100%',
        height: finalHeight ? `${finalHeight}px` : '100%',
      } : { width: '100%', height: '100%' }"
      class="htw-relative"
      data-test-id="sandbox-render"
    >
      <GenericRenderStory
        :key="`${story.id}-${variant.id}`"
        :variant="variant"
        :story="story"
        class="htw-h-full"
        @ready="onReady"
      />
    </div>
  </StoryResponsivePreview>
</template>
