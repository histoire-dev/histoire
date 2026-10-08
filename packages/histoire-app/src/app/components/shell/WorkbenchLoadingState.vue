<script setup lang="ts">
import { HstPulsatingDisc } from '@histoire/controls/vue'
import './workbench-state.css'

defineProps<{
  /** Short headline describing operation in progress. */
  title: string
}>()
defineSlots<{
  /** Optional detail beneath loading headline. */
  default?: () => any
}>()
</script>

<template>
  <div class="workbench-state workbench-loading-state" role="status" aria-atomic="true">
    <div class="workbench-state-visual" aria-hidden="true">
      <HstPulsatingDisc :size="32" />
    </div>
    <strong>{{ title }}</strong>
    <p v-if="$slots.default">
      <slot />
    </p>
  </div>
</template>
