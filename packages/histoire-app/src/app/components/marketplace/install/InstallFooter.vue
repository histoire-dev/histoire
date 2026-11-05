<script setup lang="ts">
defineSlots<{
  /** Optional secondary action, aligned opposite primary actions. */
  leading?: () => any
  /** Actions aligned at end of card. */
  default?: () => any
}>()
</script>

<template>
  <footer class="htw:flex htw:flex-wrap htw:items-center htw:justify-end htw:gap-2 htw:border-0 htw:border-t htw:border-solid htw:border-border htw:px-[22px] htw:py-3.5">
    <div v-if="$slots.leading" class="htw:mr-auto">
      <slot name="leading" />
    </div>
    <slot />
  </footer>
</template>
