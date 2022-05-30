<script lang="ts" setup>
import { PropType } from 'vue'
import { Icon } from '@iconify/vue'
import type { Story, Variant } from '../../types'
import SandboxVue3 from '../sandbox/SandboxVue3.vue'
import BaseEmpty from '../base/BaseEmpty.vue'
import StatePresets from './StatePresets.vue'
import ControlsComponentProps from './ControlsComponentProps.vue'

defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },

  story: {
    type: Object as PropType<Story>,
    required: true,
  },
})
</script>

<template>
  <div
    data-test-id="story-controls"
    class="htw-flex htw-flex-col htw-divide-y htw-divide-gray-100 dark:htw-divide-gray-750"
  >
    <!-- Toolbar -->
    <div
      class="htw-h-9 htw-flex-none htw-px-2 htw-flex htw-items-center"
    >
      <StatePresets
        :story="story"
        :variant="variant"
      />
    </div>

    <!-- Custom controls -->
    <SandboxVue3
      v-if="variant.slots().controls || story.slots().controls"
      slot-name="controls"
      :variant="variant"
      :story="story"
      class="htw-flex-none"
    />

    <BaseEmpty v-else-if="!variant.state?._hPropDefs?.length">
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
