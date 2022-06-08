<script lang="ts" setup>
import type { Story, Variant } from '../../types'
import { isMobile } from '../../util/responsive'
import StoryVariantTitle from '../toolbar/StoryVariantTitle.vue'
import StoryVariantResponsiveSize from '../toolbar/StoryVariantResponsiveSize.vue'
import StoryVariantBackground from '../toolbar/StoryVariantBackground.vue'
import StoryVariantNewTab from '../toolbar/StoryVariantNewTab.vue'
import StoryVariantSinglePreviewNative from './StoryVariantSinglePreviewNative.vue'
import StoryVariantSinglePreviewRemote from './StoryVariantSinglePreviewRemote.vue'

defineProps<{
  variant: Variant
  story: Story
}>()
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
      <StoryVariantTitle
        :variant="variant"
      />
      <StoryVariantResponsiveSize
        v-if="!variant.responsiveDisabled"
      />
      <StoryVariantBackground />
      <StoryVariantNewTab
        :variant="variant"
        :story="story"
      />
    </div>

    <!-- Preview -->
    <StoryVariantSinglePreviewNative
      v-if="story.layout?.iframe === false"
      :story="story"
      :variant="variant"
    />
    <StoryVariantSinglePreviewRemote
      v-else
      :story="story"
      :variant="variant"
    />
  </div>
</template>
