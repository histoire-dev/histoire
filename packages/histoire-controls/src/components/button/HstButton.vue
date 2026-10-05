<script setup lang="ts">
import { ref } from 'vue'
import { useControlsTheme } from '../../utils'

defineOptions({ name: 'HstButton' })
defineProps<{
  /** Existing semantic button appearance. */
  color?: 'default' | 'primary' | 'flat'
  /** Link adapters retain native anchor semantics with same shared appearance. */
  as?: 'button' | 'a'
}>()
const dark = useControlsTheme()
const button = ref<HTMLButtonElement | HTMLAnchorElement>()
/** Native focus handle preserves keyboard ownership in chrome adapters. */
function focus(): void {
  button.value?.focus()
}
defineExpose({ focus, element: button })
</script>

<template>
  <component :is="as ?? 'button'" ref="button" :type="as === 'a' ? undefined : 'button'" class="histoire-button" :data-color="color ?? 'default'" :data-histoire-control-appearance="dark ? 'dark' : 'light'">
    <slot />
  </component>
</template>
