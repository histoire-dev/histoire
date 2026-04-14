<script setup lang="ts">
import { computed } from 'vue'
import { getGreeting } from './vitest-mocking-greeting'

const props = withDefaults(defineProps<{
  name?: string
}>(), {
  name: 'Vitest browser mode',
})

const greeting = computed(() => getGreeting(props.name))
</script>

<template>
  <div class="htw-inline-flex htw-flex-col htw-gap-2 htw-p-4">
    <div class="htw-text-xs htw-font-semibold htw-uppercase htw-tracking-[0.18em]">
      Vitest Mock
    </div>
    <div class="htw-text-lg htw-font-medium">
      {{ greeting }}
    </div>
  </div>
</template>
