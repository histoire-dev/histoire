<script lang="ts" setup>
import { computed } from 'vue'
import { HstCheckbox, HstJson, HstNumber, HstText } from '@histoire/controls'
import type { Variant } from '../../types'

const props = defineProps<{
  variant: Variant
  item: string
}>()

const comp = computed(() => {
  switch (typeof props.variant.state[props.item]) {
    case 'string':
      return HstText
    case 'number':
      return HstNumber
    case 'boolean':
      return HstCheckbox
    case 'object':
    default:
      return HstJson
  }
})
</script>

<template>
  <component
    :is="comp"
    v-if="comp"
    v-model="variant.state[props.item]"
    class="histoire-controls-component-prop-item"
    :title="props.item"
  />
</template>
