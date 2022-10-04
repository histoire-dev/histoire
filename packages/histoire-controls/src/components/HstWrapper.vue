<script lang="ts">
export default {
  name: 'HstWrapper',
}
</script>

<script lang="ts" setup>
import { withDefaults, computed } from 'vue'
import { VTooltip as vTooltip } from 'floating-vue'

const props = withDefaults(defineProps<{
  title?: string
  label?: boolean
}>(), {
  label: true,
})

const componentType = computed(() => props.label ? 'label' : 'div')
</script>

<template>
  <component
    :is="componentType"
    class="htw-p-2 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-800 htw-flex htw-gap-2 htw-flex-wrap"
  >
    <span
      v-tooltip="{
        content: title,
        placement: 'left',
        distance: 12,
      }"
      class="htw-w-28 htw-whitespace-nowrap htw-text-ellipsis htw-overflow-hidden htw-shrink-0"
    >
      {{ title }}
    </span>
    <span class="htw-grow htw-flex htw-items-center htw-gap-1">
      <span class="htw-block htw-grow">
        <slot />
      </span>
      <slot name="actions" />
    </span>
  </component>
</template>
