<script setup lang="ts">
/** Stable vector geometry makes changes observable without machine-dependent fonts. */
defineProps({
  /** Controls primary fill. */
  emphasized: { type: Boolean, default: false },
  /** Controls secondary geometry. */
  wide: { type: Boolean, default: false },
})
</script>

<template>
  <svg width="240" height="160" viewBox="0 0 240 160" role="img" aria-label="Visual card" :data-emphasized="emphasized" :data-wide="wide">
    <rect x="16" y="16" :width="wide ? 208 : 128" height="128" :fill="emphasized ? '#208060' : '#5060c0'" />
    <rect x="32" y="32" width="32" height="32" fill="#ffffff" />
  </svg>
</template>
