<script lang="ts" setup>
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStoryStore } from '../../stores/story'
import { usePreviewIframeHost } from '../../util/preview-iframe-host'
import { isMobile } from '../../util/responsive'
import DevOnlyToolbarOpenInEditor from '../toolbar/DevOnlyToolbarOpenInEditor.vue'
import ToolbarBackground from '../toolbar/ToolbarBackground.vue'
import ToolbarTextDirection from '../toolbar/ToolbarTextDirection.vue'

const storyStore = useStoryStore()
const router = useRouter()
const route = useRoute()

/**
 * Marks every variant in the current story as waiting for a refreshed preview:
 * the grid document hosts them all, so a reload invalidates all of them.
 */
function markStoryPreviewPending() {
  if (!storyStore.currentStory) {
    return
  }

  for (const variant of storyStore.currentStory.variants) {
    Object.assign(variant, {
      previewReady: false,
    })
  }
}

const {
  iframe,
  iframeReloadKey,
  isIframeLoaded,
  sandboxUrl,
  onIframeLoad,
  reloadPreviewFrame,
} = usePreviewIframeHost({
  mode: 'grid',
  getStory: () => storyStore.currentStory,
  getCurrentVariant: () => storyStore.currentVariant,
  getVariantById: variantId => storyStore.getCurrentStoryVariantById(variantId),
  markPreviewPending: markStoryPreviewPending,
  onSelectVariant: (variantId) => {
    router.push({
      query: {
        ...route.query,
        variantId,
      },
    })
  },
  // Variant objects survive navigation (`previewReady` is copied across story
  // remaps), so revisiting a grid story would otherwise start with stale-true
  // readiness while the new iframe is still loading.
  resetOnMount: true,
})

// The sandbox iframe bakes the story's variant list when its module loads, so
// it cannot pick up added/removed/renamed variants via HMR. The host sees the
// fresh list first — force a clean mount (the dev server invalidated the
// runtime module during collection, so the reload gets up-to-date data).
watch(() => [
  storyStore.currentStory?.id,
  storyStore.currentStory?.variants.map(variant => variant.id).join('\n'),
] as const, ([storyId, variantIds], previous) => {
  const [previousStoryId, previousVariantIds] = previous ?? []
  if (!storyId || storyId !== previousStoryId) {
    // Story switches remount the iframe through sandboxUrl already.
    return
  }

  if (variantIds !== previousVariantIds) {
    // Mark pending before the remount so readiness does not stay stale-true from
    // the previous variant list while the fresh iframe boots (which would let
    // test collection post into a not-yet-ready frame).
    markStoryPreviewPending()
    reloadPreviewFrame()
  }
})
</script>

<template>
  <div class="histoire-story-variant-grid htw-flex htw-flex-col htw-items-stretch htw-h-full __histoire-pane-shadow-from-right">
    <!-- Toolbar -->
    <div
      v-if="!isMobile"
      class="htw-flex-none htw-flex htw-items-center htw-justify-end htw-h-8 htw-mx-2 htw-mt-1"
    >
      <ToolbarBackground />
      <ToolbarTextDirection />

      <DevOnlyToolbarOpenInEditor
        v-if="__HISTOIRE_DEV__"
        :file="storyStore.currentStory.file?.filePath"
        tooltip="Edit story in editor"
      />
    </div>

    <iframe
      :key="iframeReloadKey"
      ref="iframe"
      :src="sandboxUrl"
      loading="lazy"
      class="htw-w-full htw-h-full htw-relative"
      :class="{
        'htw-invisible': !isIframeLoaded,
      }"
      data-test-id="preview-iframe"
      @load="onIframeLoad()"
    />
  </div>
</template>
