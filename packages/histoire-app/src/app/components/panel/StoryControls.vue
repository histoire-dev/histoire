<script lang="ts" setup>
import type { PropType } from 'vue'
import type { Story, Variant } from '../../types'
import { Icon } from '@iconify/vue'
import { computed, ref, watch } from 'vue'
import BaseEmpty from '../base/BaseEmpty.vue'
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

// Every custom controls slot executes beside story code in sandbox runtime.
// Host only renders generic serializable-state editors.
const sandboxControlsAvailable = ref<boolean | null>(null)

watch(() => props.variant, () => {
  ready.value = false
  sandboxControlsAvailable.value = null
})

/**
 * What the panel renders as controls:
 * - `iframe`: story custom controls in sandbox runtime,
 * - `state`: the generic editors for the variant's own state.
 */
const controlsKind = computed<'iframe' | 'state'>(() => sandboxControlsAvailable.value === true ? 'iframe' : 'state')

/** Applies custom-controls availability reported by sandbox runtime. */
function onSandboxControlsInfo(payload: { hasControls: boolean }) {
  sandboxControlsAvailable.value = payload.hasControls
  ready.value = true
}

const hasInitState = computed(() => Object
  .entries(props.variant.state || {})
  .filter(([key, value]) => !key.startsWith('_h') && !(key === '$data' && isEmptyStateObject(value)))
  .length > 0)

/** Detects empty `$data` objects omitted from initial-state controls. */
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
        v-if="ready"
        :story="story"
        :variant="variant"
      />
    </div>

    <!-- Custom controls execute inside story-compatible sandbox runtime. -->
    <StoryControlsSandboxIframe
      v-show="sandboxControlsAvailable === true"
      :key="`${story.id}-${variant.id}`"
      :story="story"
      :variant="variant"
      class="htw-flex-none"
      @info="onSandboxControlsInfo"
    />

    <!-- Init state -->
    <div
      v-if="ready && controlsKind === 'state' && hasInitState"
    >
      <ControlsComponentState
        class="htw-flex-none htw-my-2"
        :variant="variant"
      />
    </div>

    <BaseEmpty v-else-if="ready && controlsKind === 'state' && !variant.state?._hPropDefs?.length">
      <Icon
        icon="carbon:audio-console"
        class="htw-w-8 htw-h-8 htw-opacity-50 htw-mb-6"
      />
      <span>No controls available for this story</span>
    </BaseEmpty>

    <!-- Auto props -->
    <div
      v-if="ready && variant.state?._hPropDefs?.length"
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
