<script lang="ts" setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  to?: any
  href?: string
  color?: string
}>()

const comp = computed(() => {
  if (props.to) {
    return RouterLink
  }
  if (props.href) {
    return 'a'
  }
  return 'button'
})
</script>

<template>
  <component
    :is="comp"
    class="histoire-base-button htw:rounded htw:cursor-pointer"
    :class="{
      'htw:bg-primary-200 htw:dark:bg-primary-800 htw:hover:bg-primary-300 htw:dark:hover:bg-primary-700': color === 'primary' || !color,
      'htw:bg-grey-100 htw:dark:bg-grey-900 htw:hover:bg-grey-200 htw:dark:hover:bg-grey-800': color === 'grey',
    }"
  >
    <slot />
  </component>
</template>
