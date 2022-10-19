<script lang="ts" setup>
import GenericRenderStory from './GenericRenderStory.vue'
import type { Story, Variant } from '../../types'
import { isDark } from '../../util/dark'
import { histoireConfig } from '../../util/config'
import { usePreviewSettingsStore } from '../../stores/preview-settings'
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

const settings = usePreviewSettingsStore().currentSettings
</script>

<template>
  <StoryResponsivePreview
    v-slot="{ isResponsiveEnabled, finalWidth, finalHeight }"
    class="histoire-story-variant-single-preview-native"
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
        :class="[ isDark ? histoireConfig.sandboxDarkClass : undefined ]"
        :dir="settings.textDirection"
        @ready="onReady"
      />
    </div>
  </StoryResponsivePreview>
</template>
