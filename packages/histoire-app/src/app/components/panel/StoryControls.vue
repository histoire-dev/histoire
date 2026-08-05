<script lang="ts" setup>
import type { PropType } from 'vue'
import type { Story, Variant } from '../../types'
import { Icon } from '@iconify/vue'
import { computed, ref, watch } from 'vue'
import BaseEmpty from '../base/BaseEmpty.vue'
import GenericRenderStory from '../story/GenericRenderStory.vue'
import ControlsComponentProps from './ControlsComponentProps.vue'
import ControlsComponentState from './ControlsComponentState.vue'
import StatePresets from './StatePresets.vue'
import StoryControlsSandboxIframe from './StoryControlsSandboxIframe.vue'

const props = defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },

  story: {
    type: Object as PropType<Story>,
    required: true,
  },
})

// Wait for controls render before applying presets
const ready = ref(false)

// Custom controls of vitest-mocked stories render inside a sandbox iframe:
// their module cannot execute in the host (mocks only work in the sandbox),
// so `slots()` stays empty here and the iframe reports whether the story
// actually defines a controls slot.
const customControlsInIframe = computed(() => !!props.story.file?.hasVitestMocks)
const mockedControlsAvailable = ref<boolean | null>(null)

watch(() => props.variant, () => {
  ready.value = false
  mockedControlsAvailable.value = null
})

/**
 * What the panel renders as controls:
 * - `iframe`: the story's custom controls, in the sandbox iframe,
 * - `custom`: the story's custom controls, rendered here,
 * - `state`: the generic editors for the variant's own state.
 */
const controlsKind = computed<'iframe' | 'custom' | 'state'>(() => {
  if (customControlsInIframe.value) {
    return mockedControlsAvailable.value === true ? 'iframe' : 'state'
  }
  return props.variant.slots().controls || props.story.slots().controls ? 'custom' : 'state'
})

function onMockedControlsInfo(payload: { hasControls: boolean }) {
  mockedControlsAvailable.value = payload.hasControls
  ready.value = true
}

const hasInitState = computed(() => Object
  .entries(props.variant.state || {})
  .filter(([key, value]) => !key.startsWith('_h') && !(key === '$data' && isEmptyStateObject(value)))
  .length > 0)

function isEmptyStateObject(value: unknown) {
  return value != null
    && typeof value === 'object'
    && !Array.isArray(value)
    && !Object.keys(value as Record<string, unknown>).length
}
</script>

<template>
  <div
    data-test-id="story-controls"
    class="histoire-story-controls htw-flex htw-flex-col htw-divide-y htw-divide-gray-100 dark:htw-divide-gray-750"
  >
    <!-- Toolbar -->
    <div
      class="htw-h-9 htw-flex-none htw-px-2 htw-flex htw-items-center"
    >
      <StatePresets
        v-if="ready || controlsKind === 'state'"
        :story="story"
        :variant="variant"
      />
    </div>

    <!-- Custom controls (vitest-mocked): rendered in a sandbox iframe -->
    <StoryControlsSandboxIframe
      v-if="customControlsInIframe"
      v-show="mockedControlsAvailable === true"
      :key="`${story.id}-${variant.id}`"
      :story="story"
      :variant="variant"
      class="htw-flex-none"
      @info="onMockedControlsInfo"
    />

    <!-- Custom controls -->
    <GenericRenderStory
      v-if="controlsKind === 'custom'"
      :key="`${story.id}-${variant.id}`"
      slot-name="controls"
      :variant="variant"
      :story="story"
      class="__histoire-render-custom-controls htw-flex-none"
      @ready="ready = true"
    />

    <!-- Init state -->
    <div
      v-if="controlsKind === 'state' && hasInitState"
    >
      <ControlsComponentState
        class="htw-flex-none htw-my-2"
        :variant="variant"
      />
    </div>

    <BaseEmpty v-else-if="controlsKind === 'state' && !variant.state?._hPropDefs?.length">
      <Icon
        icon="carbon:audio-console"
        class="htw-w-8 htw-h-8 htw-opacity-50 htw-mb-6"
      />
      <span>No controls available for this story</span>
    </BaseEmpty>

    <!-- Auto props -->
    <div
      v-if="variant.state?._hPropDefs?.length"
    >
      <ControlsComponentProps
        v-for="(def, index) of variant.state._hPropDefs"
        :key="index"
        :variant="variant"
        :definition="def"
        class="htw-flex-none htw-my-2"
      />
    </div>
  </div>
</template>
