<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { getWorkbenchIcon } from '../../util/icons.js'

const props = withDefaults(defineProps<{
  /** Carbon glyph name without a prefix; existing carbon: names also work. */
  name: string
  /** Displayed square size in CSS pixels or a CSS length. */
  size?: string | number
}>(), { size: 16 })
const icon = computed(() => getWorkbenchIcon(props.name))
const size = computed(() => typeof props.size === 'number' ? `${props.size}px` : props.size)
const warned = new Set<string>()
watchEffect(() => {
  if (import.meta.env.DEV && !icon.value && !warned.has(props.name)) {
    warned.add(props.name)
    console.warn(`[Histoire] Missing offline icon: ${props.name}`)
  }
})
</script>

<template>
  <svg
    class="histoire-workbench-icon"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${icon?.width ?? 32} ${icon?.height ?? 32}`"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    v-html="icon?.body ?? ''"
  />
</template>

<style scoped>
.histoire-workbench-icon { display: inline-block; flex: none; vertical-align: middle; }
</style>
