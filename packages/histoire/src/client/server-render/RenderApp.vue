<script lang="ts" setup>
import type { Story, Variant } from '../app/types.js'
import SandboxVue3 from '../app/components/sandbox/SandboxVue3.vue'

defineProps<{
  story: Story
  variant: Variant
}>()

defineEmits({
  ready: () => true,
})
</script>

<template>
  <div class="htw-hidden">
    <slot />
  </div>

  <SandboxVue3
    :story="story"
    :variant="variant"
    @ready="$emit('ready')"
  />
</template>
