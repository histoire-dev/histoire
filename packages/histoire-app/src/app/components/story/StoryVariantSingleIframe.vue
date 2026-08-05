<script lang="ts" setup>
import type { Story, Variant } from '../../types'
import { usePreviewIframeHost } from '../../util/preview-iframe-host'
import StoryResponsivePreview from './StoryResponsivePreview.vue'

const props = defineProps<{
  story: Story
  variant: Variant
}>()

const {
  iframe,
  iframeReloadKey,
  isIframeLoaded,
  sandboxUrl,
  onIframeLoad,
} = usePreviewIframeHost({
  mode: 'single',
  getStory: () => props.story,
  getCurrentVariant: () => props.variant,
  // This view is pinned to one variant: the sandbox only ever reports that one.
  getVariantById: variantId => (variantId === props.variant.id ? props.variant : null),
  markPreviewPending: () => {
    Object.assign(props.variant, {
      previewReady: false,
    })
  },
})
</script>

<template>
  <StoryResponsivePreview
    v-slot="{ isResponsiveEnabled, finalWidth, finalHeight, resizing }"
    class="histoire-story-variant-single-iframe"
    :variant="variant"
  >
    <iframe
      :key="iframeReloadKey"
      ref="iframe"
      :src="sandboxUrl"
      class="htw-w-full htw-h-full htw-relative"
      :class="{
        'htw-invisible': !isIframeLoaded,
        'htw-pointer-events-none': resizing,
      }"
      :style="isResponsiveEnabled ? {
        width: finalWidth ? `${finalWidth}px` : null,
        height: finalHeight ? `${finalHeight}px` : null,
      } : undefined"
      data-test-id="preview-iframe"
      @load="onIframeLoad()"
    />
  </StoryResponsivePreview>
</template>
