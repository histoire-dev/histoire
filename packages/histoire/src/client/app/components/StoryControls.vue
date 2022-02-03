<script lang="ts" setup>
import { PropType } from 'vue'
import { Story, Variant } from '../types'
import SandboxVue from './sandbox/SandboxVue.vue'

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
  <div>
    <!-- Custom controls -->
    <SandboxVue
      v-if="variant.slots().controls"
      slot-name="controls"
      :variant="variant"
      :story="story"
    />
  </div>
</template>
