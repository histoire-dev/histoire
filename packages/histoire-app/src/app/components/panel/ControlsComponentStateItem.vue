<script lang="ts" setup>
import type { Variant } from '../../types'
import { getControlComponent } from '@histoire/controls'
import { computed } from 'vue'

const props = defineProps<{
  variant: Variant
  item: string
}>()

const comp = computed(() => getControlComponent(typeof props.variant.state[props.item]))

const model = computed({
  get: () => {
    return props.variant.state[props.item]
  },
  set: (value) => {
    // eslint-disable-next-line vue/no-mutating-props
    props.variant.state[props.item] = value
  },
})
</script>

<template>
  <component
    :is="comp"
    v-if="comp"
    v-model="model"
    class="histoire-controls-component-prop-item"
    :title="props.item"
  />
</template>
