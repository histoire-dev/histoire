<script setup lang="ts">
import { BuiltinIcon } from '@histoire/controls/vue'
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  /** Same-origin registry logo URL; missing or broken logos use the bundled bot glyph. */
  icon?: string
  /** Rendered square size in px. */
  size?: number
}>(), { size: 16 })
/** Mask source and box size; JSON quoting keeps the URL a single CSS string. */
const style = computed(() => ({ '--agent-logo': `url(${JSON.stringify(props.icon ?? '')})`, 'width': `${props.size}px`, 'height': `${props.size}px` }))
/** Logo loaded successfully and may be used as a mask. */
const loaded = ref(false)
// Probe through an Image so failures fall back; a CSS mask alone never reports errors.
watch(() => props.icon, (icon) => {
  loaded.value = false
  if (!icon || typeof Image === 'undefined') return
  const image = new Image()
  image.onload = () => {
    if (props.icon === icon) loaded.value = true
  }
  image.src = icon
}, { immediate: true })
</script>

<template>
  <!-- Masking keeps registry logos monochrome in currentColor without inlining remote SVG. -->
  <span v-if="icon && loaded" class="agent-logo" aria-hidden="true" :style="style" />
  <BuiltinIcon v-else icon="bot" :size="size" />
</template>

<style scoped>
.agent-logo { display: inline-block; flex: none; background-color: currentColor; mask: var(--agent-logo) center / contain no-repeat; -webkit-mask: var(--agent-logo) center / contain no-repeat; }
</style>
