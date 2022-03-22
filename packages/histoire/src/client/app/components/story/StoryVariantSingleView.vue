<script lang="ts" setup>
import { PropType } from 'vue'
import type { Story, Variant } from '../../types'
import { usePreviewSettings } from '../../util/preview-settings'
import StoryResponsivePreview from './StoryResponsivePreview.vue'
import { isMobile } from '../../util/responsive'
import StoryVariantTitle from './variant/StoryVariantTitle.vue'
import StoryVariantResponsiveSize from './variant/StoryVariantResponsiveSize.vue'
import StoryVariantBackground from './variant/StoryVariantBackground.vue'
import StoryVariantNewTab from './variant/StoryVariantNewTab.vue'

defineProps<{
  variant: Variant
  story: Story
}>()

const settings = usePreviewSettings()
</script>

<template>
  <div
    class="htw-h-full htw-flex htw-flex-col"
    data-test-id="story-variant-single-view"
  >
    <!-- Toolbar -->
    <div
      v-if="!isMobile"
      class="htw-flex-none htw-flex htw-items-center htw-h-8 -htw-mt-1"
    >
      <StoryVariantTitle :variant="variant" />
      <StoryVariantResponsiveSize />
      <StoryVariantBackground />
      <StoryVariantNewTab
        :variant="variant"
        :story="story"
      />
    </div>

    <!-- Preview -->
    <StoryResponsivePreview
      v-model:settings="settings"
      :story="story"
      :variant="variant"
    />
  </div>
</template>
