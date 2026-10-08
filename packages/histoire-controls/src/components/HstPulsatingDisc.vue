<script setup lang="ts">
/** Standard Histoire loading indicator: a disc that pulses into a ring. */
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
    class="histoire-pulsating-disc"
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
    <span class="histoire-pulsating-disc-dot">
      <span v-for="quarter in 4" :key="quarter" class="histoire-pulsating-disc-quarter">
        <svg class="histoire-pulsating-disc-corner" viewBox="0 0 200 200" focusable="false">
          <path d="M 100 0 A 100 100 0 0 1 0 100 V 200 H 200 V 0 Z" fill="currentColor" />
        </svg>
      </span>
    </span>
  </div>
</template>

<style scoped>
.histoire-pulsating-disc { display: flex; align-items: center; justify-content: center; box-sizing: border-box; aspect-ratio: 1; }
.histoire-pulsating-disc-dot {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
}

/* Each quadrant combines a scaled curved corner with two sliding solid edges.
   Together they leave a circular hole, using only compositor transforms. */
.histoire-pulsating-disc-quarter {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 50%;
  height: 50%;
  overflow: hidden;
  transform-origin: 0 0;
}
.histoire-pulsating-disc-quarter:nth-child(2) { transform: rotate(90deg); }
.histoire-pulsating-disc-quarter:nth-child(3) { transform: rotate(180deg); }
.histoire-pulsating-disc-quarter:nth-child(4) { transform: rotate(270deg); }

.histoire-pulsating-disc-corner {
  display: block;
  /* Oversized solid edges overlap sliding panels to prevent subpixel seams.
     The SVG hole uses half its viewBox, keeping its radius at 60%. */
  width: 120%;
  height: 120%;
  transform-origin: 0 0;
  animation: histoire-pulsating-disc-corner 1.1s ease-in-out infinite;
  will-change: transform;
}
.histoire-pulsating-disc-quarter::before,
.histoire-pulsating-disc-quarter::after {
  content: '';
  position: absolute;
  inset: 0;
  background: currentColor;
  animation: histoire-pulsating-disc-edge-x 1.1s ease-in-out infinite;
  will-change: transform;
}
.histoire-pulsating-disc-quarter::after { animation-name: histoire-pulsating-disc-edge-y; }

@keyframes histoire-pulsating-disc-corner {
  0%, 100% { transform: scale(0); }
  50% { transform: scale(1); }
}
@keyframes histoire-pulsating-disc-edge-x {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(60%); }
}
@keyframes histoire-pulsating-disc-edge-y {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(60%); }
}

@media (prefers-reduced-motion: reduce) {
  .histoire-pulsating-disc-corner,
  .histoire-pulsating-disc-quarter::before,
  .histoire-pulsating-disc-quarter::after { animation: none; will-change: auto; }
}
</style>
