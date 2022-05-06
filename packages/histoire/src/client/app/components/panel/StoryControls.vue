<script lang="ts" setup>
import { PropType } from 'vue'
import { Icon } from '@iconify/vue'
import type { Story, Variant } from '../../types'
import SandboxVue3 from '../sandbox/SandboxVue3.vue'
import BaseEmpty from '../base/BaseEmpty.vue'

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
  <div data-test-id="story-controls">
    <!-- Custom controls -->
    <SandboxVue3
      v-if="variant.slots().controls"
      slot-name="controls"
      :variant="variant"
      :story="story"
    />

    <BaseEmpty v-else>
      <Icon
        icon="carbon:audio-console"
        class="htw-w-8 htw-h-8 htw-opacity-50 htw-mb-6"
      />
      <span>No controls available for this story</span>
    </BaseEmpty>
  </div>
</template>
