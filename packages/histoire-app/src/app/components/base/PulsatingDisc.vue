<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** Displayed square size in CSS pixels or a CSS length. */
  size?: string | number
}>(), { size: 16 })

/** Normalize numeric sizes while preserving caller-supplied CSS lengths. */
const resolvedSize = computed(() => typeof props.size === 'number' ? `${props.size}px` : props.size)
</script>

<template>
  <div
    aria-hidden="true"
    class="histoire-pulsating-disc htw-flex htw-items-center htw-justify-center"
    :style="{
      width: resolvedSize,
      height: resolvedSize,
      minWidth: resolvedSize,
      maxWidth: resolvedSize,
      minHeight: resolvedSize,
      maxHeight: resolvedSize,
      flex: `0 0 ${resolvedSize}`,
    }"
  >
    <span class="histoire-pulsating-disc-dot" />
  </div>
</template>

<style scoped>
@property --histoire-pulsating-disc-hole {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 0%;
}

.histoire-pulsating-disc { box-sizing: border-box; aspect-ratio: 1; }
.histoire-pulsating-disc-dot {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: currentColor;
  mask-image: radial-gradient(circle closest-side at center, transparent 0 var(--histoire-pulsating-disc-hole), #000 calc(var(--histoire-pulsating-disc-hole) + .5px));
  -webkit-mask-image: radial-gradient(circle closest-side at center, transparent 0 var(--histoire-pulsating-disc-hole), #000 calc(var(--histoire-pulsating-disc-hole) + .5px));
  animation: histoire-pulsating-disc 1.1s ease-in-out infinite;
}

@keyframes histoire-pulsating-disc {
  0%, 100% { --histoire-pulsating-disc-hole: 0%; }
  50% { --histoire-pulsating-disc-hole: 60%; }
}

@media (prefers-reduced-motion: reduce) {
  .histoire-pulsating-disc-dot { animation: none; }
}
</style>
